# blocks/placement Specification

## Purpose
Impide que colocar un bloque atrape a una entidad dentro del bloque, rechazando la colocación cuando la celda destino solapa con un jugador o un animal.

## Requirements

### Requirement: La colocación rechaza celdas ocupadas por jugadores

El sistema SHALL rechazar la colocación de un bloque sólido cuando la celda destino solape con el jugador local o con cualquier jugador remoto, usando para cada uno la caja derivada de su propio aspecto (`r = 0.3*f`, `h = 1.8*f`), sin modificar el mundo. `human` conserva 0.6 de ancho × 1.8 de alto.

#### Scenario: Bloque sobre el jugador local

- **WHEN** el jugador `human` intenta colocar un bloque en una celda que solapa con su propio cuerpo (0.6 de ancho × 1.8 de alto)
- **THEN** el sistema rechaza la colocación, no llama a `editBlock` y muestra un toast de aviso

#### Scenario: Bloque sobre un jugador local gigante

- **WHEN** el jugador `giant` intenta colocar un bloque dentro de su caja (≈1.523 de ancho × 4.568 de alto)
- **THEN** el sistema rechaza la colocación y muestra un toast de aviso

#### Scenario: Bloque sobre un jugador remoto

- **WHEN** el jugador intenta colocar un bloque en una celda que solapa con un remoto de `remotes`
- **THEN** el sistema rechaza la colocación usando la caja del aspecto de ese remoto y muestra un toast de aviso

#### Scenario: Un remoto pequeño no bloquea de más

- **WHEN** un remoto `small` (≈0.274 de ancho × 0.822 de alto) está en la celda y se intenta colocar un bloque por encima de su cabeza
- **THEN** la colocación se permite, porque la celda no solapa con la caja real del remoto

#### Scenario: Celda libre coloca con normalidad

- **WHEN** la celda destino no solapa con ningún jugador
- **THEN** la colocación continúa con las reglas existentes (sólido, agua, flores, puerta, escalera)

### Requirement: La colocación rechaza celdas ocupadas por animales

El sistema SHALL rechazar la colocación de un bloque sólido cuando la celda destino solape con cualquier animal de `animals` (0.64 de ancho × 1.2 de alto), sin modificar el mundo.

#### Scenario: Bloque sobre un animal

- **WHEN** el jugador intenta colocar un bloque en una celda que solapa con un animal
- **THEN** el sistema rechaza la colocación, no llama a `editBlock` y muestra un toast de aviso

### Requirement: Margen anti-lag solo en remotos y cobertura de las tres ramas

El sistema SHALL aplicar un margen de 0.1 que recorta la caja solo de cada jugador remoto antes del test de solape (lag de interpolación `target` vs `g.position`), SHALL usar margen 0 exacto para el jugador local y los animales (simulación local sin lag), y SHALL aplicar la guarda en las ramas normal, escalera y puerta (la puerta chequea sus 2 celdas).

#### Scenario: Remoto al borde no bloquea por lag de interpolación

- **WHEN** un remoto solapa la celda por menos de 0.1 en X o Z (caja recortada 0.1 ya no solapa)
- **THEN** la colocación se permite aunque la caja completa toque la celda

#### Scenario: Animal en la esquina bloquea con solape mínimo

- **WHEN** un animal solapa la celda aunque sea <0.1 en X y Z (margen 0, test exacto)
- **THEN** el sistema rechaza la colocación, no llama a `editBlock` y muestra un toast de aviso

#### Scenario: Puerta chequea ambas celdas

- **WHEN** el jugador coloca una puerta cuyas celdas son `y` e `y+1`
- **THEN** el sistema rechaza la puerta si cualquiera de las dos celdas está ocupada por un jugador o un animal

### Requirement: Alcance de colocación derivado del aspecto

El sistema SHALL derivar el alcance para colocar bloques de la altura del aspecto del jugador con `f = spec.height / BASE_H`, usando `8*f` medido desde el ojo del jugador.

#### Scenario: El humano conserva 8 bloques

- **WHEN** el jugador usa el aspecto `human`
- **THEN** puede colocar bloques hasta 8 bloques de distancia, igual que antes del change

#### Scenario: El gigante coloca desde lejos

- **WHEN** el jugador usa el aspecto `giant`
- **THEN** puede colocar bloques hasta ≈20.305 bloques de distancia

#### Scenario: El pequeño coloca desde cerca

- **WHEN** el jugador usa el aspecto `small`
- **THEN** puede colocar bloques hasta ≈3.655 bloques de distancia

#### Scenario: La colocación usa el mismo alcance que la rotura

- **WHEN** el jugador apunta a una celda en primera, en 3ª trasera o en 3ª frontal
- **THEN** la colocación parte del ojo y usa `8*f` del aspecto, sin un alcance distinto al de romper

### Requirement: Colocación y rotura de la cama de dos celdas

El sistema SHALL colocar la cama en dos celdas contiguas —pie en la celda apuntada y cabecera en la celda siguiente según la dirección horizontal dominante de la mirada— solo cuando ambas celdas estén dentro del mundo, libres y sin solapar con jugadores ni animales; y SHALL romper ambas celdas al romper cualquiera de las dos.

#### Scenario: Colocación con ambas celdas libres

- **WHEN** el jugador usa la cama apuntando a una celda libre y la celda contigua en la dirección de su mirada también está libre
- **THEN** se colocan el pie y la cabecera con dos ediciones de mundo

#### Scenario: La celda de la cabecera está ocupada

- **WHEN** la celda contigua está ocupada por un bloque sólido
- **THEN** no se coloca ninguna de las dos mitades y el mundo no cambia

#### Scenario: Un jugador ocupa la cabecera

- **WHEN** la celda de la cabecera solapa con un jugador o un animal
- **THEN** se rechaza la colocación completa con un aviso, usando las mismas guardas de ocupación que la puerta

#### Scenario: La cabecera se sale del mundo

- **WHEN** la celda contigua cae fuera de los límites del mundo
- **THEN** se rechaza la colocación y no se modifica ninguna celda

#### Scenario: Rotura de una mitad

- **WHEN** el jugador rompe el pie o la cabecera de una cama
- **THEN** se rompen las dos celdas de la cama

#### Scenario: Media cama preexistente

- **WHEN** el jugador rompe una celda de cama cuya pareja ya no existe
- **THEN** se rompe solo esa celda, sin afectar bloques vecinos
