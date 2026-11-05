# blocks/torch Specification

## Purpose
Permite a los jugadores colocar antorchas orientables —de piso, pared o techo— que iluminan de verdad los bloques vecinos, con render barato tipo cruz, rotura en cascada cuando pierden el soporte y sincronización multijugador sin cambios de protocolo.

## Requirements

### Requirement: La antorcha no bloquea el movimiento

El sistema SHALL permitir que el jugador camine a través de la celda ocupada por una antorcha, igual que con las flores.

#### Scenario: Atravesar antorcha

- **WHEN** el jugador camina hacia una celda con antorcha
- **THEN** el sistema no lo detiene ni lo hace colisionar

### Requirement: Colocación solo sobre soporte sólido

El sistema SHALL permitir colocar la antorcha en una celda de aire solo cuando el bloque clickeado detrás de la celda destino sea sólido —cubriendo piso, pared y techo— y SHALL rechazar la colocación en cualquier otro caso.

#### Scenario: Colocar sobre suelo

- **WHEN** el jugador coloca la antorcha sobre un bloque sólido con la celda destino vacía
- **THEN** el sistema ubica la antorcha en la celda destino

#### Scenario: Colocar en el aire sin soporte

- **WHEN** el jugador intenta colocar la antorcha sin bloque sólido debajo o en una celda ocupada
- **THEN** el sistema rechaza la colocación y no consume ni crea el bloque

#### Scenario: Colocar en una pared

- **WHEN** el jugador apunta a la cara lateral de un bloque sólido y la celda vecina está libre
- **THEN** el sistema ubica la antorcha en esa celda, apoyada en la pared

#### Scenario: Colocar en el techo

- **WHEN** el jugador apunta a la cara inferior de un bloque sólido y la celda de abajo está libre
- **THEN** el sistema ubica la antorcha en esa celda, colgada de la cara inferior

#### Scenario: El bloque clickeado no es sólido

- **WHEN** el bloque clickeado es una flor, agua, una puerta abierta o cualquier bloque no sólido
- **THEN** el sistema rechaza la colocación con un aviso y no modifica el mundo

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

### Requirement: Antorcha visible como cruz orientable

El sistema SHALL renderizar el bloque antorcha como cross-quad de dos planos cruzados con la textura de palo y llama, visible desde ambos lados y orientado según la cara del soporte.

#### Scenario: Ver antorcha colocada

- **WHEN** una antorcha está colocada en el mundo
- **THEN** el sistema la muestra como cruz de dos quads con la textura de antorcha y fondo transparente recortado

#### Scenario: Antorcha visible de noche

- **WHEN** es de noche y hay una antorcha colocada
- **THEN** la antorcha se ve brillante con sus colores propios (mesh unlit), sin depender de la luz ambiental

### Requirement: Orientación automática según la cara del soporte

El sistema SHALL orientar la antorcha según la cara donde se apoya —parada sobre el piso, inclinada hacia afuera de la pared o colgada del techo— sin ids de orientación ni ítems separados: un único ítem "Antorcha" cubre las tres caras.

#### Scenario: Antorcha de piso

- **WHEN** la antorcha se apoya en un bloque sólido debajo de ella
- **THEN** se dibuja vertical, con el palo abajo y la llama arriba

#### Scenario: Antorcha de pared

- **WHEN** la antorcha se apoya en un bloque sólido de costado
- **THEN** se dibuja inclinada hacia afuera de la pared, con la base embebida en la cara del soporte —el solapamiento oculta el margen transparente de la textura— y la llama hacia el lado libre, sin salir de la celda en los ejes perpendiculares

#### Scenario: Antorcha de pared sin separación visual

- **WHEN** el jugador mira una antorcha de pared desde el lado libre
- **THEN** el dibujo del palo arranca en la cara de la pared, sin un hueco transparente entre la textura y el bloque

#### Scenario: Antorcha de techo

- **WHEN** la antorcha se apoya en un bloque sólido arriba de ella
- **THEN** se dibuja colgada, con la llama hacia abajo

#### Scenario: Antorcha sin soporte reconocible

- **WHEN** una antorcha ya existente no tiene un soporte sólido reconocible en ninguna cara
- **THEN** se dibuja con la orientación de piso, sin romperse ni desaparecer

### Requirement: Antorcha encendida e iluminando

El sistema SHALL mostrar la antorcha con sus colores de llama encendidos y SHALL hacer que su luz alumbre los bloques vecinos, sujeta al presupuesto de iluminación vigente.

#### Scenario: Ilumina los bloques vecinos

- **WHEN** es de noche y hay una antorcha colocada dentro del presupuesto de luces
- **THEN** los bloques a su alrededor reciben una luz cálida que se apaga con la distancia

#### Scenario: Presupuesto agotado

- **WHEN** la antorcha no entra en el presupuesto de luces del nivel de calidad vigente
- **THEN** se sigue viendo encendida pero no alumbra los bloques vecinos
