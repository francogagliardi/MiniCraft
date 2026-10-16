# Spec Delta

## Purpose

Permite a los jugadores construir escaleras orientables en 4 direcciones en LOS MISMOS 5 MATERIALES QUE LAS LOSAS (piedra, tablones, roca, ladrillos, piedra tallada): 20 bloques (IDs 39–58) con forma en L transitable caminando (sin saltar), colocación según la mirada del jugador y sincronización multijugador con el protocolo existente.

## ADDED Requirements

### Requirement: Escaleras visibles con forma en L en 5 materiales

El sistema SHALL renderizar cada una de las 20 variantes como forma en L: mitad inferior completa (0–0.5 en toda la celda) más mitad superior parcial (0.5–1.0 solo en la mitad trasera según orientación), con la textura del material base en todas sus caras (tiles reusados 3/8/16/9/29, sin tiles nuevos de atlas). El render SHALL estar generalizado por flag `stair` + `stairDir` (patrón slab), no con 20 ramas hardcodeadas.

#### Scenario: Ver cada orientación de cada material colocada

- **WHEN** una escalera de cada una de las 20 variantes (5 materiales × 4 orientaciones, IDs 39–58) está colocada en el mundo
- **THEN** el sistema muestra la forma en L con el escalón bajo hacia el frente declarado de cada variante y la textura de su material base

#### Scenario: Escalera junto a bloque opaco

- **WHEN** una cara de una escalera (cualquier variante) linda con un bloque opaco
- **THEN** el sistema omite esa cara oculta igual que con los cubos y las losas

### Requirement: Colocación orientada según la mirada del jugador dentro del grupo del material

El sistema SHALL elegir la orientación al colocar según el eje dominante de `lookDir()`: el frente bajo queda del lado del jugador (el escalón alto al fondo), de modo que caminar hacia adelante sube la escalera. El material lo determina el ítem sostenido (5 entradas de inventario); la orientación elige la variante dentro del grupo (39–42 / 43–46 / 47–50 / 51–54 / 55–58).

#### Scenario: Colocar mirando al norte/sur/este/oeste con cada material

- **WHEN** el jugador sostiene una escalera de un material y la coloca mirando predominantemente hacia −Z, +Z, −X o +X
- **THEN** la celda recibe la variante de ESE material cuya subida avanza en esa dirección

#### Scenario: Colocación sobre celda ocupada rechazada

- **WHEN** la celda destino no es aire ni agua (ni flor reemplazable)
- **THEN** el sistema rechaza la colocación sin cambios (sin apilado ni conversión, a diferencia de las losas)

### Requirement: Colisión escalonada con auto-step desde el frente

El sistema SHALL tratar cada celda de escalera como sólida en 0–0.5 en toda la celda y en 0.5–1.0 solo en la mitad trasera (según `stairDir`); caminando desde el frente con los pies en el suelo y lugar libre arriba, el sistema eleva al jugador 0.5 (auto-step) sin saltar, y parado sobre la parte alta lo sostiene sin trabarse. La lógica SHALL aplicar por flag `stair`, igual para los 5 materiales.

#### Scenario: Subir escalera caminando desde el frente

- **WHEN** el jugador camina desde el frente con los pies en el suelo contra una escalera (cualquier material) con lugar libre arriba
- **THEN** el sistema lo eleva 0.5 y puede seguir avanzando hasta quedar sobre la parte alta

#### Scenario: Parado sobre la parte alta

- **WHEN** el jugador está parado sobre la mitad trasera (y 0.5–1.0) de una escalera
- **THEN** la gravedad lo mantiene apoyado y puede moverse en horizontal sin hundirse ni trabarse

#### Scenario: Lado trasero bloquea como cubo

- **WHEN** el jugador camina contra el lado trasero alto a altura de cubo completo
- **THEN** el sistema lo detiene (no hay auto-step a través de la parte alta)

#### Scenario: Bajar sin daño

- **WHEN** el jugador baja caminando por una escalera al suelo
- **THEN** no recibe daño por caída

### Requirement: Escaleras disponibles en inventario y sincronizadas

El sistema SHALL mostrar las 5 escaleras (una por material) en el inventario de bloques (INVENTORY 30→35) y SHALL sincronizar su colocación y rotura a otros jugadores con el protocolo de edits existente (idx→val sin cambios de formato; solo se amplía el rango válido a v ≤ 64 para alojar 39–58, libres 59–64).

#### Scenario: Elegir escaleras en inventario

- **WHEN** el jugador abre el inventario
- **THEN** las 5 escaleras aparecen como opciones elegibles con su nombre e icono

#### Scenario: Otro jugador ve la escalera

- **WHEN** un jugador coloca o rompe una escalera de cualquier variante (39–58) estando conectado al servidor
- **THEN** los demás jugadores ven el mismo cambio en la misma posición, material y orientación sin recargar

### Requirement: Rotura con dureza del material base

El sistema SHALL romper cada escalera con el esfuerzo de su material base (piedra 1.8, tablones 1, roca 1.8, ladrillos 2, tallada 2; sin drop) y SHALL mantener la física de caída y daño intacta.

#### Scenario: Romper escalera de cada material

- **WHEN** el jugador pica una escalera el tiempo equivalente a su bloque base
- **THEN** la celda vuelve a aire sin dejar objeto

### Requirement: Reutilización del atlas sin tiles nuevos

El sistema SHALL renderizar las 20 variantes reusando los tiles existentes de cada material base (3/8/16/9/29) sin agregar dibujos al atlas 8x5.

#### Scenario: Tiles válidos

- **WHEN** se ejecuta el espejo `static.mjs` con las 20 constantes
- **THEN** todos los tiles referenciados por las 20 variantes existen y sus UV son válidas
