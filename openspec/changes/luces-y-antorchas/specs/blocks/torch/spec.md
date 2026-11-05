# Spec Delta

## REMOVED Requirements

### Requirement: Antorcha visible como cruz decorativa

**Reason**: El render deja de ser fijo y decorativo: la cruz ahora se orienta según el soporte (piso, pared o techo) y la antorcha alumbra, de modo que el requisito y su escenario "sin iluminar" ya no describen el comportamiento.

**Migration**: Sin migración de datos. Mismo id 33, mismo tile 32 y mismo ítem de inventario; las antorchas existentes se reorientan solas y empiezan a iluminar sin editar el mundo.

## MODIFIED Requirements

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

## ADDED Requirements

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
