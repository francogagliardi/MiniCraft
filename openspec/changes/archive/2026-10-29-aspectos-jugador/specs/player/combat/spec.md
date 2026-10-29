# Spec Delta

## ADDED Requirements

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
