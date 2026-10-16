# blocks/names Specification

## Purpose

Define el nombre visible de los bloques (etiqueta mostrada en inventario, hotbar y toasts a partir de `DEFS[id].name`).

## Requirements

### Requirement: El bloque id 22 se muestra como Cactus

El sistema SHALL mostrar el bloque con id 22 (`MELON`) con el nombre `Cactus 🌵` en inventario, hotbar y toasts.

#### Scenario: Nombre visible en inventario y hotbar

- **WHEN** el jugador abre el inventario o selecciona el bloque 22 en la hotbar
- **THEN** la etiqueta mostrada es `Cactus 🌵` (y en la hotbar compacta, `Cactus`)

#### Scenario: Identidad del bloque inalterada

- **WHEN** el jugador coloca o pica el bloque 22, o recarga un mundo existente
- **THEN** el bloque sigue siendo el id 22 con la misma textura, dureza y física (solo cambia la etiqueta)
