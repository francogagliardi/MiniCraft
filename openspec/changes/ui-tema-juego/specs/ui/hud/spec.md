# Spec Delta

## ADDED Requirements

### Requirement: Legibilidad del HUD sobre el mundo 3D

El HUD SHALL consumir los tokens del sistema visual, seguir el tema activo y mantener su información legible sobre cielo, agua y noche. Sus superficies SHALL usar un scrim semitransparente del tema con texto y borde de contraste (oscuro con texto claro en oscuro; claro con texto oscuro en claro). El crosshair SHALL conservar contraste sin depender solo del color y las animaciones SHALL desactivarse con `prefers-reduced-motion`.

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

#### Scenario: HUD claro sobre el mundo
- **WHEN** el tema claro está activo y el jugador juega con el HUD visible
- **THEN** logo, pills, FPS/ping, lista de jugadores, chat, hotbar, slots y toasts usan fondo claro con texto oscuro, y el crosshair pasa a trazo oscuro con halo claro

#### Scenario: Movimiento reducido
- **WHEN** el sistema operativo pide movimiento reducido
- **THEN** las animaciones de entrada del chat y los pulsos del HUD se desactivan y la información sigue visible

### Requirement: La vida del jugador son solo corazones

La vida SHALL mostrarse como corazones sueltos sobre el mundo, sin contenedor visible. `#health` SHALL conservar su posición, tipografía, `letter-spacing` y `pointer-events`, y SHALL NOT declarar fondo, borde, radio ni relleno. La legibilidad SHALL resolverse con `text-shadow`: sombra oscura en el tema oscuro y halo claro con sombra suave en el tema claro, sin volver a un chip.

#### Scenario: Corazones sin recuadro en ambos temas
- **WHEN** el jugador mira su vida con tema claro u oscuro
- **THEN** ve solo los corazones, sin fondo, borde ni pastilla alrededor

#### Scenario: Corazones sobre cielo y noche
- **WHEN** la vida se muestra sobre el cielo diurno, la nieve o la noche
- **THEN** los corazones se recortan del fondo por su contorno y no se pierden

#### Scenario: La vida no mueve la hotbar
- **WHEN** se quita el contenedor de la vida
- **THEN** la hotbar, el toast y el resto del HUD conservan sus posiciones actuales

### Requirement: Guía de controles fuera del HUD de juego

La guía de controles SHALL NOT ocupar una esquina del HUD mientras el jugador juega. El HUD SHALL NOT reservar espacio ni dejar un hueco visible abajo a la izquierda por la guía. El texto dinámico de administrador y jugador SHALL seguir generándose con la misma función de modo.

#### Scenario: HUD sin guía fija
- **WHEN** el jugador juega con el HUD visible
- **THEN** no aparece un bloque de controles fijo en la esquina inferior izquierda

#### Scenario: Texto dinámico conservado
- **WHEN** cambia el modo de administrador a jugador o al revés
- **THEN** la guía conserva el contenido correspondiente al modo activo
