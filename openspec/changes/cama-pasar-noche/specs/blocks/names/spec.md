# Spec Delta

## ADDED Requirements

### Requirement: La cama se muestra como Cama

El sistema SHALL mostrar el ítem de cama y sus dos mitades de mundo con el nombre `Cama 🛏️` en inventario, hotbar y toasts.

#### Scenario: Nombre visible en inventario y hotbar

- **WHEN** el jugador abre el inventario o selecciona la cama en la hotbar
- **THEN** la etiqueta mostrada es `Cama 🛏️` (y en la hotbar compacta, `Cama`)

#### Scenario: Nombre en las dos mitades

- **WHEN** el jugador apunta o rompe el pie o la cabecera de una cama
- **THEN** el nombre visible sigue siendo `Cama 🛏️`, sin distinguir la mitad
