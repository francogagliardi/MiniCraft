# player/combat Specification

## Purpose

Define el combate cuerpo a cuerpo del jugador con la espada —cuánto daña, con qué cadencia, a quién puede apuntar y cómo se valida el golpe— para que el arma sea relevante contra otros jugadores y contra criaturas hostiles sin depender de la confianza en el cliente.

## Requirements

### Requirement: Daño de la espada de un corazón

El golpe de espada del jugador SHALL aplicar 2 puntos de daño (un corazón de la barra de vida del juego) tanto contra otros jugadores como contra criaturas hostiles, y SHALL NOT depender del ítem en ningún otro slot.

#### Scenario: Un golpe de espada baja un corazón entero

- **WHEN** el jugador golpea a otro jugador con la espada en la mano
- **THEN** la víctima pierde 2 puntos de vida y su barra baja exactamente un corazón

#### Scenario: El daño visible coincide con el aplicado

- **WHEN** un golpe de espada llega a su objetivo
- **THEN** el número de daño flotante y el aviso del atacante muestran el mismo valor que la vida descontada (2)

#### Scenario: Solo la espada ataca

- **WHEN** el jugador no tiene la espada en el slot activo e intenta golpear a otro jugador o a una criatura hostil
- **THEN** no se aplica daño y el juego avisa que hace falta la espada

### Requirement: Cadencia de ataque de la espada

El sistema SHALL limitar el ataque de espada a un golpe por segundo, y SHALL mostrar la espera en curso (anillo de cooldown) sin ejecutar animación ni daño mientras el golpe está en cooldown.

#### Scenario: Un golpe por segundo

- **WHEN** el jugador golpea con la espada y vuelve a intentarlo antes de cumplirse un segundo
- **THEN** el segundo intento no produce daño (ni animación de golpe) y el anillo de espera sigue visible

#### Scenario: El cooldown no bloquea para siempre

- **WHEN** el jugador vuelve a golpear después de cumplirse el segundo
- **THEN** el golpe se ejecuta con normalidad

### Requirement: Selección de objetivo del ataque

El sistema SHALL elegir el objetivo del ataque con la espada entre las entidades alcanzables por la vista del jugador —jugadores y criaturas hostiles— dentro del alcance del ataque, y SHALL priorizar de forma estable cuando ambos tipos están alineados.

#### Scenario: Golpea al jugador apuntado

- **WHEN** el jugador apunta y golpea a otro jugador dentro del alcance
- **THEN** el golpe se dirige a ese jugador

#### Scenario: Golpea a la criatura hostil apuntada

- **WHEN** el jugador apunta y golpea a una criatura hostil dentro del alcance
- **THEN** el golpe se dirige a esa criatura y no a un jugador que esté fuera de la línea de vista

#### Scenario: Sin objetivo no hay golpe

- **WHEN** el jugador golpea con la espada sin ninguna entidad alcanzable en la línea de vista
- **THEN** no se envía ninguna solicitud de golpe ni se aplica daño

### Requirement: Golpe a criaturas hostiles validado por el servidor

Para criaturas hostiles, el cliente SHALL limitarse a pedir el golpe contra un objetivo concreto y el servidor SHALL validar la distancia entre el jugador y la criatura antes de aplicar daño, SHALL confirmar el impacto al atacante y SHALL NOT aceptar daño declarado por el cliente.

#### Scenario: El golpe cerca del objetivo se aplica

- **WHEN** el jugador pide golpear a una criatura hostil que está dentro del alcance del arma
- **THEN** el servidor aplica el daño del arma y confirma el impacto al atacante

#### Scenario: El golpe lejano se rechaza

- **WHEN** el jugador pide golpear a una criatura hostil que está fuera del alcance del arma (por ejemplo por teleport o latencia extrema)
- **THEN** el servidor no aplica daño y el atacante no recibe confirmación de impacto

#### Scenario: El jugador sin servidor no puede golpear criaturas hostiles

- **WHEN** el jugador golpea con la espada en modo solo (sin servidor) y hay una criatura hostil en la línea de vista
- **THEN** no hay solicitud de golpe al servidor ni daño, porque las criaturas hostiles solo existen con servidor

### Requirement: Feedback del impacto contra criaturas hostiles

El sistema SHALL dar feedback inmediato al atacante cuando el servidor confirma el golpe contra una criatura hostil, consistente con el feedback del golpe contra jugadores.

#### Scenario: Confirmación visual y sonora del impacto

- **WHEN** el servidor confirma el golpe contra una criatura hostil
- **THEN** el atacante ve la marca de impacto, oye el sonido de golpe y ve el número de daño sobre la criatura

#### Scenario: Sin confirmación del servidor no hay feedback de impacto

- **WHEN** la solicitud de golpe no es confirmada por el servidor
- **THEN** el atacante no muestra marca de impacto ni número de daño, aunque haya ejecutado la animación de golpe local

### Requirement: Alcance de golpe derivado del aspecto

El sistema SHALL derivar el alcance de apuntado del golpe del jugador de la altura de su aspecto con `f = spec.height / BASE_H`: `4.6*f` para jugadores y zombis y `6*f` para animales, medido desde el ojo del jugador y no desde la cámara.

#### Scenario: El humano conserva 4.6 y 6

- **WHEN** el jugador usa el aspecto `human`
- **THEN** su espada alcanza jugadores y zombis a 4.6 y animales a 6, igual que antes del change

#### Scenario: El gigante golpea más lejos

- **WHEN** el jugador usa el aspecto `giant`
- **THEN** su espada alcanza jugadores y zombis a ≈11.675 y animales a ≈15.228

#### Scenario: El pequeño golpea más cerca

- **WHEN** el jugador usa el aspecto `small`
- **THEN** su espada alcanza jugadores y zombis a ≈2.102 y animales a ≈2.741

#### Scenario: Los demás aspectos también escalan

- **WHEN** el jugador usa `fat`, `zombie` o `robot`
- **THEN** su alcance sale de su factor (`fat` ≈3.969/5.178, `zombie` 4.6/6, `robot` ≈4.437/5.787)

#### Scenario: El golpe sale del ojo en las tres perspectivas

- **WHEN** el jugador golpea en primera, en 3ª trasera o en 3ª frontal
- **THEN** el rayo parte del ojo y usa el alcance de su aspecto, sin medir desde la cámara orbital

### Requirement: El servidor valida el golpe a zombis con el alcance del skin

El servidor SHALL aceptar un `zhit` contra un zombi solo si la distancia horizontal entre el jugador y el zombi no supera `4.6*f`, con `f = spec.height / BASE_H` del skin declarado (`server/skins.js`). Sin skin, con un skin desconocido o con el parámetro omitido SHALL usar `human` (4.6). El resto de la validación (existencia, vida y cooldown) no cambia, y el PvP sigue sin validar distancia.

#### Scenario: Un humano a 8 bloques es rechazado

- **WHEN** un jugador `human` pide golpear a un zombi a 8 bloques
- **THEN** el servidor rechaza el golpe porque 8 supera su alcance de 4.6

#### Scenario: Un gigante a 8 bloques es aceptado

- **WHEN** un jugador `giant` pide golpear a un zombi a 8 bloques
- **THEN** el servidor acepta el golpe porque 8 está dentro de su alcance de ≈11.675

#### Scenario: Un gigante más allá de su alcance es rechazado

- **WHEN** un jugador `giant` pide golpear a un zombi a 12 bloques
- **THEN** el servidor rechaza el golpe porque 12 supera ≈11.675

#### Scenario: Un pequeño tiene el alcance corto

- **WHEN** un jugador `small` pide golpear a un zombi a 2.5 bloques
- **THEN** el servidor rechaza el golpe porque 2.5 supera ≈2.102

#### Scenario: Sin skin declarado se usa humano

- **WHEN** el servidor recibe un `zhit` sin skin, con un skin desconocido o sin el quinto parámetro
- **THEN** valida con 4.6, igual que antes del change

#### Scenario: El PvP no cambia

- **WHEN** un jugador golpea a otro jugador
- **THEN** el servidor sigue relayando el `hit` sin validar la distancia, como hasta ahora
