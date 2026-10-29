# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
