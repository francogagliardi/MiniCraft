# Spec Delta

## ADDED Requirements

### Requirement: Legibilidad del HUD sobre el mundo 3D

El HUD del juego SHALL consumir los tokens del sistema visual y SHALL mantener su información legible sobre cielo diurno, agua y noche. Las superficies del HUD SHALL usar un scrim oscuro translúcido con texto claro y borde visible, y el crosshair SHALL conservar un contraste suficiente sin depender solo del color. Las animaciones del HUD SHALL desactivarse con `prefers-reduced-motion`.

#### Scenario: HUD legible de día
- **WHEN** el jugador mira el HUD con el cielo más claro de fondo
- **THEN** vida, FPS/ping, hints, chat y toasts se leen con contraste suficiente y sin lavarse contra el cielo

#### Scenario: HUD legible de noche y bajo el agua
- **WHEN** el ciclo pasa a la noche o el jugador está bajo el agua
- **THEN** el HUD conserva el mismo contraste y no se confunde con el fondo oscuro o azulado

#### Scenario: Crosshair visible sobre cualquier fondo
- **WHEN** el jugador apunta al cielo, a la nieve o a una pared oscura
- **THEN** el crosshair se distingue por su trazo y su contorno, no solo por su color

#### Scenario: El HUD acompaña el tema
- **WHEN** el jugador cambia entre claro y oscuro
- **THEN** las superficies del HUD se ajustan a los tokens del tema sin perder legibilidad ni cambiar de posición

#### Scenario: Movimiento reducido
- **WHEN** el sistema operativo pide movimiento reducido
- **THEN** las animaciones de entrada del chat y los pulsos del HUD se desactivan y la información sigue visible
