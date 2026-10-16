# Spec Delta

## Purpose

Impide que colocar un bloque atrape a una entidad dentro del bloque, rechazando la colocación cuando la celda destino solapa con un jugador o un animal.

## ADDED Requirements

### Requirement: La colocación rechaza celdas ocupadas por jugadores

El sistema SHALL rechazar la colocación de un bloque sólido cuando la celda destino solape con el jugador local o con cualquier jugador remoto, sin modificar el mundo.

#### Scenario: Bloque sobre el jugador local

- **WHEN** el jugador intenta colocar un bloque en una celda que solapa con su propio cuerpo (0.6 de ancho × 1.8 de alto)
- **THEN** el sistema rechaza la colocación, no llama a `editBlock` y muestra un toast de aviso

#### Scenario: Bloque sobre un jugador remoto

- **WHEN** el jugador intenta colocar un bloque en una celda que solapa con un remoto de `remotes` (misma caja 0.6×1.8)
- **THEN** el sistema rechaza la colocación y muestra un toast de aviso

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
