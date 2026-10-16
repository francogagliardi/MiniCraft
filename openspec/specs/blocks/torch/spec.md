# blocks/torch Specification

## Purpose
Permite a los jugadores colocar antorchas decorativas (sin luz real) para adornar construcciones, con render barato tipo flor y sincronización multijugador sin cambios de protocolo.

## Requirements

### Requirement: Antorcha visible como cruz decorativa

El sistema SHALL renderizar el bloque antorcha como cross-quad de dos planos cruzados con la textura de palo y llama, visible desde ambos lados.

#### Scenario: Ver antorcha colocada

- **WHEN** una antorcha está colocada en el mundo
- **THEN** el sistema la muestra como cruz de dos quads con la textura de antorcha y fondo transparente recortado

#### Scenario: Antorcha visible de noche sin iluminar

- **WHEN** es de noche y hay una antorcha colocada
- **THEN** la antorcha se ve brillante con sus colores propios (mesh unlit) pero NO ilumina los bloques vecinos

### Requirement: La antorcha no bloquea el movimiento

El sistema SHALL permitir que el jugador camine a través de la celda ocupada por una antorcha, igual que con las flores.

#### Scenario: Atravesar antorcha

- **WHEN** el jugador camina hacia una celda con antorcha
- **THEN** el sistema no lo detiene ni lo hace colisionar

### Requirement: Colocación solo sobre soporte sólido

El sistema SHALL permitir colocar la antorcha solo en una celda de aire cuyo bloque inferior sea sólido, y SHALL rechazar la colocación en cualquier otro caso.

#### Scenario: Colocar sobre suelo

- **WHEN** el jugador coloca la antorcha sobre un bloque sólido con la celda destino vacía
- **THEN** el sistema ubica la antorcha en la celda destino

#### Scenario: Colocar en el aire sin soporte

- **WHEN** el jugador intenta colocar la antorcha sin bloque sólido debajo o en una celda ocupada
- **THEN** el sistema rechaza la colocación y no consume ni crea el bloque

### Requirement: Rotura rápida de un toque

El sistema SHALL romper la antorcha de un solo golpe por su dureza baja, liberando la celda a aire.

#### Scenario: Romper antorcha

- **WHEN** el jugador golpea una antorcha una vez
- **THEN** la celda vuelve a aire y la antorcha desaparece del mundo

### Requirement: Antorcha disponible en inventario y sincronizada

El sistema SHALL mostrar la antorcha en el inventario de bloques y SHALL sincronizar su colocación y rotura a otros jugadores con el protocolo de edits existente, sin cambios de protocolo.

#### Scenario: Elegir antorcha en inventario

- **WHEN** el jugador abre el inventario
- **THEN** la antorcha aparece como opción elegible con su nombre e icono

#### Scenario: Otro jugador ve la antorcha

- **WHEN** un jugador coloca o rompe una antorcha estando conectado al servidor
- **THEN** los demás jugadores ven el mismo cambio en la misma posición sin recargar
