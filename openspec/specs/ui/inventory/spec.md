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
