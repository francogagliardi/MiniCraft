# Spec Delta

## ADDED Requirements

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
