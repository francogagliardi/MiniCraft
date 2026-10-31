# ui/inventory Specification

## Purpose

Define el toggle del inventario con la tecla `E`: abre desde juego/pausa y cierra cuando el inventario está abierto.

## Requirements

### Requirement: E alterna abrir/cerrar el inventario

El sistema SHALL abrir el inventario con `E` cuando el estado es `play` o `pause`, y SHALL cerrarlo con `E` cuando el estado es `inv` (vía `closeInv()`, con el mismo retorno a juego y `saveSoon()` que el botón `Listo (E)`).

#### Scenario: E abre y vuelve a cerrar

- **WHEN** el jugador presiona `E` en `play`/`pause` y luego presiona `E` de nuevo con el inventario abierto
- **THEN** primero se abre el inventario (`state='inv'`) y después se cierra (`state='play'` con reenganche de pointer-lock), sin estados trabados

#### Scenario: E no interfiere con chat ni muerte

- **WHEN** el foco está en un `INPUT`/`TEXTAREA` (chat) o el jugador está muerto
- **THEN** `E` no abre ni cierra el inventario (guardas de foco y `dead` intactas), y `Escape` sigue cerrando solo el chat

### Requirement: La cama está en la paleta del inventario

El sistema SHALL incluir la cama en la paleta que se abre con `E`, para que el jugador pueda asignarla a un slot de la hotbar sin crafting ni conteo de ítems.

#### Scenario: Elegir la cama desde el inventario

- **WHEN** el jugador abre el inventario con `E`
- **THEN** la grilla incluye la cama como un ítem más y al hacer click queda asignada al slot seleccionado de la hotbar

#### Scenario: La hotbar sigue teniendo nueve slots

- **WHEN** se agrega la cama a la paleta
- **THEN** la hotbar conserva sus nueve slots y su contenido por defecto
