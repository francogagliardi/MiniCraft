# Spec Delta

## ADDED Requirements

### Requirement: Vuelo libre sin colisión

El bot SHALL moverse como un punto libre en tres dimensiones, sin colisión con bloques ni con el terreno, de forma permanente y sin interruptor: SHALL atravesar paredes, techos, pisos y construcciones cerradas, y SHALL NOT aplicar gravedad, auto-escalón ni resolución de suelo. La única restricción espacial SHALL ser el límite del mundo.

#### Scenario: Atraviesa una pared entre el bot y su presa

- **WHEN** la presa está del otro lado de una pared o de un bloque sólido que antes bloqueaba el paso
- **THEN** el bot la atraviesa, se acerca hasta el alcance de ataque y la golpea sin quedarse trabado

#### Scenario: Entra a una construcción cerrada o a una cueva

- **WHEN** la presa se refugia dentro de una construcción sin puerta o en una cueva bajo tierra
- **THEN** el bot llega hasta ella cruzando los bloques del perímetro o del techo

#### Scenario: Persigue a una presa que está más alta o más baja

- **WHEN** la presa está arriba de una torre o en un pozo por debajo del nivel del bot
- **THEN** el bot ajusta su altura y la alcanza sin necesitar escaleras, rampas ni saltos

#### Scenario: No hay gravedad ni tirón al suelo

- **WHEN** el bot queda en el aire, sobre un techo o dentro de un bloque
- **THEN** conserva su altura y no cae ni es devuelto al suelo por el terreno

#### Scenario: Respeta el límite del mundo

- **WHEN** el bot persigue a una presa y su trayectoria lo llevaría fuera del área jugable
- **THEN** su posición horizontal queda contenida dentro de los límites del mundo, sin colisión con bloques internos

### Requirement: Alineación vertical con la altura del objetivo

El bot SHALL ajustar su altura (`y`) hacia la altura de su objetivo —presa, admin de SIGUEME o punto de aparición— más un offset seguro, con una banda muerta que evite oscilaciones. La alineación SHALL ocurrir también cuando ya está dentro de la distancia horizontal de detención, y en ESPERA SHALL conservar la altura congelada.

#### Scenario: Se alinea con una presa en una torre

- **WHEN** la presa está a 12 bloques por encima del bot y dentro del alcance horizontal
- **THEN** la altura del bot converge a la altura de la presa más el offset seguro y el golpe se emite sin esperar a que baje la presa

#### Scenario: Se alinea con una presa en una cueva

- **WHEN** la presa está a 10 bloques por debajo del bot
- **THEN** el bot desciende hasta la altura de la presa más el offset seguro y la ataca

#### Scenario: Sin oscilación alrededor de la altura objetivo

- **WHEN** la diferencia de altura con el objetivo es menor que la banda muerta
- **THEN** el bot no corrige la altura en cada tick y su `y` se mantiene estable

#### Scenario: ESPERA conserva la altura

- **WHEN** el bot está en modo ESPERA con un objetivo a otra altura
- **THEN** su `y` permanece igual a la del momento de la orden y no se alinea con nadie

### Requirement: Velocidad seis veces la de un jugador

El bot SHALL desplazarse a 28.8 unidades por segundo: tres veces su velocidad anterior de 9.6 u/s y seis veces la caminata de 4.8 u/s de un jugador. Esa rapidez SHALL aplicarse al desplazamiento horizontal y SHALL NOT depender de que el bot esté apoyado en el suelo.

#### Scenario: Cierra distancia al triple de su velocidad anterior

- **WHEN** el bot persigue a una presa y su desplazamiento horizontal se mide en el tiempo
- **THEN** su rapidez es de aproximadamente 28.8 u/s, tres veces los 9.6 u/s que usaba antes de este cambio

#### Scenario: Es seis veces la de un jugador

- **WHEN** se compara su desplazamiento horizontal con el de un jugador de referencia que camina a 4.8 u/s
- **THEN** el bot se desplaza a aproximadamente el sexto de esa referencia (600 %)

#### Scenario: La rapidez no depende del vuelo

- **WHEN** el bot avanza en horizontal mientras sube o baja para alinearse con un objetivo
- **THEN** su rapidez horizontal sigue siendo aproximadamente 28.8 u/s y no se reduce por el movimiento vertical

## REMOVED Requirements

### Requirement: Velocidad doble que un jugador

**Reason**: Se reemplaza por el vuelo libre y una velocidad tres veces mayor: la velocidad doble obligaba a no despegarse del suelo y era insuficiente para cerrar distancias largas.

**Migration**: El nuevo requisito "Velocidad seis veces la de un jugador" fija 28.8 u/s (tres veces los 9.6 u/s anteriores) y ya no depende del apoyo en el suelo; el resto del contrato de combate no cambia.
