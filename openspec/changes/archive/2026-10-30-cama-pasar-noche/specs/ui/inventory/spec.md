# Spec Delta

## ADDED Requirements

### Requirement: La cama está en la paleta del inventario

El sistema SHALL incluir la cama en la paleta que se abre con `E`, para que el jugador pueda asignarla a un slot de la hotbar sin crafting ni conteo de ítems.

#### Scenario: Elegir la cama desde el inventario

- **WHEN** el jugador abre el inventario con `E`
- **THEN** la grilla incluye la cama como un ítem más y al hacer click queda asignada al slot seleccionado de la hotbar

#### Scenario: La hotbar sigue teniendo nueve slots

- **WHEN** se agrega la cama a la paleta
- **THEN** la hotbar conserva sus nueve slots y su contenido por defecto
