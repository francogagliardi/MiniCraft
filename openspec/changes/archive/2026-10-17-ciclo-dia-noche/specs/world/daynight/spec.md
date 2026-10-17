# Spec Delta

## Purpose

Define un ciclo de día y noche de 8 minutos gobernado por el servidor, para que todos los jugadores vean la misma hora y los sistemas que dependen de la noche (p. ej. el futuro spawn de zombis) sean consistentes entre clientes.

## ADDED Requirements

### Requirement: Reloj del ciclo en el servidor

El servidor SHALL ser el dueño del reloj del ciclo: SHALL mantener su fase anclada al momento de arranque y SHALL NOT persistirla en `world.json`. La fase `v` SHALL ser un valor normalizado en `[0,1)` que representa la posición dentro del ciclo.

#### Scenario: Reloj anclado al arranque del servidor

- **WHEN** el servidor arranca
- **THEN** fija su ancla temporal en ese instante y calcula la fase `v ∈ [0,1)` a partir del tiempo transcurrido desde entonces

#### Scenario: El reloj no se persiste en el mundo

- **WHEN** el servidor guarda el mundo o se reinicia
- **THEN** ninguna fase, ancla ni duración del ciclo se escribe ni se lee de `world.json`; tras un reinicio el ciclo arranca de nuevo desde su ancla

### Requirement: Difusión de la hora por el protocolo

El servidor SHALL exponer la hora en `welcome` (fase `tod` y duración del ciclo `cyc`) y SHALL difundir periódicamente a todas las conexiones un mensaje aditivo `{ t:'tod', v }` con la fase actual, sin romper el protocolo existente para clientes que lo ignoren.

#### Scenario: welcome trae la hora actual

- **WHEN** un cliente manda `hello` y recibe `welcome`
- **THEN** `welcome` incluye `tod` (fase `0..1`) y `cyc` (duración del ciclo en ms) junto con los campos existentes

#### Scenario: difusión periódica de la hora

- **WHEN** pasa el intervalo de difusión estando hay al menos un jugador conectado
- **THEN** todas las conexiones reciben `{ t:'tod', v }` con la fase actual del servidor

#### Scenario: cliente que ignora `tod` no se rompe

- **WHEN** un cliente que no entiende el mensaje `tod` recibe `tod` o un `welcome` con campos nuevos
- **THEN** la sesión sigue funcionando con el resto del protocolo sin errores

### Requirement: Interpolación del cliente tolerante a latencia y reconexión

El cliente SHALL avanzar localmente su fase desde el instante de recepción de cada difusión, sin depender del reloj del sistema, SHALL corregir de forma suave y continua el desfase respecto del servidor, y SHALL hacer snap ante un desfase grande en vez de interpolar.

#### Scenario: sin saltos entre difusiones

- **WHEN** el cliente avanza su fase entre dos mensajes `tod` consecutivos
- **THEN** la iluminación y el cielo se mueven de forma continua, sin saltos visibles en cada difusión

#### Scenario: velocidad uniforme del sol y la luna entre difusiones

- **WHEN** el cliente avanza su fase entre dos `tod` consecutivos
- **THEN** la corrección se aplica contra un objetivo **extrapolado** que avanza a la misma tasa que la fase local (`todNow`), de modo que la velocidad del sol/luna se mantiene ≈ constante sin frenarse hacia cero ni saltar al llegar cada `tod`

#### Scenario: corrección suave del desfase

- **WHEN** llega un `tod` con una fase distinta a la local por un desfase pequeño
- **THEN** el cliente corrige progresivamente hacia la fase del servidor en vez de saltar de golpe

#### Scenario: snap tras reconexión

- **WHEN** el cliente se reconecta y la fase recibida difiere de la local en más de un umbral amplio (p. ej. `0.05` del ciclo)
- **THEN** el cliente adopta directamente la fase del servidor en vez de interpolar el desfase

### Requirement: Ciclo de 8 minutos con noche tenue

El ciclo SHALL durar 8 minutos — 5 de día (`DAY_MS`) y 3 de noche (`NIGHT_MS`) — y durante la noche la intensidad de luz SHALL bajar a aproximadamente 50 % (`NIGHT_MIN = 0.50`) con un cielo azul profundo, nunca negro.

#### Scenario: la noche no es negra ni oscura en exceso

- **WHEN** el ciclo entra en plena noche
- **THEN** la intensidad de luz baja a ~50 % del día y el cielo se ve azul profundo, sin llegar a negro

#### Scenario: el día vuelve tras la noche

- **WHEN** termina la noche y empieza un nuevo día
- **THEN** la intensidad de luz y el color del cielo vuelven a sus valores diurnos

### Requirement: Sol y luna dinámicos

El sistema SHALL mover el sol a lo largo de un arco durante el día (sale por el este, pasa por el cenit y se pone por el oeste) y SHALL ocultarlo durante la noche; SHALL mostrar una luna visible solo de noche que recorra su arco en el mismo sentido que el sol (este→oeste), y SHALL hacer que la luz direccional del sol siga su movimiento sin romper las sombras cuando el sol está bajo u oculto.

#### Scenario: el sol recorre su arco de día

- **WHEN** transcurre el tramo diurno del ciclo
- **THEN** el sprite del sol se desplaza del horizonte este al horizonte oeste pasando por el cenit, y la luz direccional del sol sigue esa misma dirección

#### Scenario: el sol se oculta de noche

- **WHEN** el ciclo entra en el tramo nocturno
- **THEN** el sprite del sol deja de verse y su luz direccional baja a intensidad cero y deja de proyectar sombras

#### Scenario: la luna aparece y recorre su arco en el mismo sentido que el sol

- **WHEN** está de noche
- **THEN** la luna es visible y recorre su arco en el mismo sentido que el sol (este→oeste: sale donde el sol salió y se pone donde el sol se puso); de día permanece oculta

#### Scenario: transiciones suaves de los astros

- **WHEN** el ciclo cruza el amanecer, el atardecer o el paso día↔noche
- **THEN** la posición del sol y de la luna es continua, sin saltos, y el amanecer/atardecer existentes se mantienen

### Requirement: Transiciones graduales de amanecer y atardecer

El sistema SHALL interpolar la iluminación y el color del cielo de forma gradual durante el amanecer y el atardecer, con una duración de ~25 s cada uno (`DAWN_MS`, `DUSK_MS`), sin saltos bruscos entre el día y la noche.

#### Scenario: amanecer gradual

- **WHEN** el ciclo pasa de la noche al día
- **THEN** la luz y el cielo suben progresivamente a lo largo de la transición de amanecer, sin salto instantáneo

#### Scenario: atardecer gradual

- **WHEN** el ciclo pasa del día a la noche
- **THEN** la luz y el cielo bajan progresivamente a lo largo de la transición de atardecer, sin salto instantáneo

### Requirement: Composición con el estado bajo el agua

La atmósfera de día y noche SHALL componerse con el estado "bajo el agua" sin pisarse: sumergido SHALL mantenerse el azul oscuro y la niebla corta del agua; fuera del agua SHALL aplicar el fondo y la niebla del día/noche según la fase.

#### Scenario: bajo el agua manda el azul oscuro

- **WHEN** el jugador está sumergido, de día o de noche
- **THEN** el fondo y la niebla mantienen el azul oscuro y la niebla corta del agua, sin que el día/noche los reemplace

#### Scenario: al salir del agua vuelve la atmósfera del ciclo

- **WHEN** el jugador deja de estar sumergido
- **THEN** el fondo y la niebla del día/noche según la fase actual vuelven a aplicar

### Requirement: Modo solo sin servidor

Cuando el juego corre sin servidor, el cliente SHALL mantener un ciclo de día y noche local con la misma duración y parámetros, para que el ciclo siga visible sin conexión.

#### Scenario: el ciclo avanza sin servidor

- **WHEN** el juego se inicia en modo solo (sin conexión al servidor)
- **THEN** el cliente avanza su propio ciclo de día y noche con `DAY_MS`, `NIGHT_MS` y `NIGHT_MIN` equivalentes

### Requirement: Señal isNight para sistemas dependientes

El sistema SHALL exponer una señal booleana `isNight` derivada de la fase (noche cuando `v >= 0.625`), consistente entre servidor y cliente, para que sistemas dependientes (p. ej. el futuro spawn de zombis) actúen solo de noche.

#### Scenario: isNight verdadero de noche

- **WHEN** la fase `v` está en el tramo nocturno (`v >= 0.625`)
- **THEN** `isNight` es verdadero

#### Scenario: isNight falso de día

- **WHEN** la fase `v` está en el tramo diurno (`v < 0.625`)
- **THEN** `isNight` es falso
