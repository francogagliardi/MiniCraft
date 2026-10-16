# blocks/slab Specification

## Purpose
Permite a los jugadores construir con losas de piedra de medio bloque de alto (escalones, bordes y detalles), con subida caminando, apilado a cubo completo y sincronización multijugador sin cambios de protocolo.

## Requirements

### Requirement: Losa visible como medio cubo de piedra

El sistema SHALL renderizar la losa como un medio cubo de 0.5 de alto (mitad inferior de la celda) con la textura de piedra en sus caras laterales de 0.5, tapa superior y cara inferior.

#### Scenario: Ver losa colocada

- **WHEN** una losa está colocada en el mundo
- **THEN** el sistema la muestra ocupando solo la mitad inferior de la celda, con apariencia de piedra

#### Scenario: Losa junto a bloque opaco

- **WHEN** una cara de la losa linda con un bloque opaco
- **THEN** el sistema omite esa cara oculta igual que con los cubos

### Requirement: La losa colisiona con altura 0.5 y se sube caminando

El sistema SHALL tratar la celda de losa como sólida solo por debajo de su tapa (0.5): el jugador parado sobre la tapa no queda trabado, y caminando contra una losa con los pies en el suelo la sube automáticamente (auto-step de 0.5) sin necesidad de saltar.

#### Scenario: Subir losa caminando

- **WHEN** el jugador camina con los pies en el suelo contra una celda con losa y hay lugar libre arriba
- **THEN** el sistema eleva al jugador 0.5 y queda parado sobre la tapa

#### Scenario: Parado sobre la losa

- **WHEN** el jugador está parado sobre la tapa de una losa
- **THEN** el sistema le permite moverse en horizontal y la gravedad lo mantiene apoyado sin hundirse ni trabarse

#### Scenario: Bloque completo no se sube caminando

- **WHEN** el jugador camina contra un cubo completo de 1 bloque
- **THEN** el sistema lo detiene (el auto-step solo aplica a losas)

#### Scenario: Salto normal también supera la losa

- **WHEN** el jugador salta sobre una losa
- **THEN** el sistema le permite aterrizar sobre la tapa

### Requirement: Dos losas apiladas forman un cubo completo

El sistema SHALL convertir la celda en un bloque de piedra completo cuando el jugador coloca una losa sobre una celda que ya contiene una losa.

#### Scenario: Apilar losa sobre losa

- **WHEN** el jugador coloca una losa en una celda ocupada por una losa
- **THEN** la celda pasa a ser piedra completa

#### Scenario: Losa sobre cubo completo

- **WHEN** el jugador coloca una losa en una celda ocupada por un cubo completo
- **THEN** el sistema rechaza la colocación (la celda ya está llena)

### Requirement: Losa disponible en inventario y sincronizada

El sistema SHALL mostrar la losa en el inventario de bloques y SHALL sincronizar su colocación, apilado y rotura a otros jugadores con el protocolo de edits existente, sin cambios de protocolo.

#### Scenario: Elegir losa en inventario

- **WHEN** el jugador abre el inventario
- **THEN** la losa de piedra aparece como opción elegible con su nombre e icono

#### Scenario: Otro jugador ve la losa y el apilado

- **WHEN** un jugador coloca, apila o rompe una losa estando conectado al servidor
- **THEN** los demás jugadores ven el mismo cambio en la misma posición sin recargar

### Requirement: Rotura y daño por caída sin cambios

El sistema SHALL romper la losa con el mismo esfuerzo que la piedra (dureza 1.8, sin drop) y SHALL mantener la física de caída y daño intacta (una caída de 0.5 no hace daño).

#### Scenario: Romper losa

- **WHEN** el jugador pica una losa el tiempo equivalente a la piedra
- **THEN** la celda vuelve a aire sin dejar objeto

#### Scenario: Bajar de una losa

- **WHEN** el jugador baja caminando desde una losa al suelo
- **THEN** no recibe daño por caída
