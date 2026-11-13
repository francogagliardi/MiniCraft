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

### Requirement: Aspecto y accesibilidad del inventario

El inventario SHALL usar los tokens del sistema visual del juego en su overlay, panel, grilla, ítems y botón "Listo". Los ítems y el botón SHALL tener foco visible por teclado, estados hover y selección distinguibles sin depender solo del color, y el panel SHALL adaptarse a 360 px sin scroll horizontal de página.

#### Scenario: Inventario en tema claro y oscuro
- **WHEN** el jugador abre el inventario con `E` en cualquiera de los dos temas
- **THEN** overlay, panel, ítems y botón usan la paleta del tema activo y el texto mantiene contraste legible

#### Scenario: Foco visible en la grilla
- **WHEN** el jugador recorre la grilla y el botón "Listo" con Tab
- **THEN** el ítem y el botón enfocados muestran un anillo de foco visible y el ítem seleccionado se distingue por borde y fondo además del color

#### Scenario: Pantalla angosta
- **WHEN** el inventario se abre en un viewport de 360 px de ancho
- **THEN** la grilla y el botón se ven completos, sin desbordar el panel ni generar scroll horizontal

#### Scenario: Toque en la grilla
- **WHEN** el jugador toca un ítem o el botón "Listo" en un dispositivo táctil
- **THEN** la acción se dispara al primer toque y el objetivo táctil tiene al menos 44 px de alto

#### Scenario: Movimiento reducido
- **WHEN** el sistema operativo pide movimiento reducido
- **THEN** los ítems no se elevan al pasar el mouse y mantienen el foco y la selección visibles
