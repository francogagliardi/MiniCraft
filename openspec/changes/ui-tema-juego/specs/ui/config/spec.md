# Spec Delta

## MODIFIED Requirements

### Requirement: Menú de configuración en el menú de pausa

El sistema SHALL mostrar un panel de configuración dentro del overlay `#pause`, accesible desde un botón "⚙️ Configuración", con controles para sensibilidad del mouse, brillo del juego, calidad gráfica, tema de la interfaz y un checkbox "Mostrar FPS y ping", y un botón "Volver" para regresar al menú de pausa principal.

#### Scenario: Panel visible y ocultable
- **WHEN** el jugador está en pausa y pulsa "⚙️ Configuración"
- **THEN** se muestra el panel de configuración y se oculta el menú principal de pausa
- **WHEN** pulsa "Volver"
- **THEN** se oculta el panel y se muestra el menú de pausa principal

#### Scenario: El panel incluye el toggle de FPS y ping
- **WHEN** el jugador abre "⚙️ Configuración"
- **THEN** ve una fila "Mostrar FPS y ping" con un checkbox accesible (`#showStats` con su `label`) además de los controles de sensibilidad, brillo, calidad y tema

#### Scenario: El panel incluye la fila de tema
- **WHEN** el jugador abre "⚙️ Configuración"
- **THEN** ve una fila "Tema" con un control accesible que ofrece claro y oscuro, además de los controles existentes

## ADDED Requirements

### Requirement: Tema de la interfaz del juego en la configuración

El panel de configuración SHALL ofrecer un control `#themeSelect` con `label` asociada y opciones "Oscuro" y "Claro". Al cambiarlo, el sistema MUST actualizar `data-theme` en `<html>`, `color-scheme`, la UI del juego y `localStorage` (`mc-theme`) en el mismo evento, sin recargar ni reiniciar el mundo, y MUST reflejar el tema activo al abrir el panel.

#### Scenario: Cambio de tema desde la configuración
- **WHEN** el jugador elige "Claro" en la fila "Tema"
- **THEN** la UI del juego pasa a claro en el acto, `mc-theme` queda en `light` y al reabrir el panel el control sigue en "Claro"

#### Scenario: El tema vuelve al lobby
- **WHEN** el jugador elige "Claro" en el juego y pulsa "Volver al lobby"
- **THEN** `/lobby` se muestra en claro porque comparte `mc-theme`

#### Scenario: Control accesible por teclado y táctil
- **WHEN** el jugador recorre la configuración con Tab o usa un dispositivo táctil
- **THEN** la fila "Tema" tiene una etiqueta asociada, foco visible y un área de interacción de al menos 44 px

#### Scenario: Preferencia inválida al abrir el panel
- **WHEN** `mc-theme` guarda un valor distinto de `light` y `dark`
- **THEN** el juego usa oscuro y el control muestra "Oscuro" sin fallar

### Requirement: El tema del juego no viaja al servidor

Cambiar el tema desde la configuración SHALL escribir únicamente en `localStorage` y SHALL NOT enviar mensajes WebSocket, llamadas HTTP ni cambios de perfil como consecuencia del cambio.

#### Scenario: Sin tráfico por el tema
- **WHEN** el jugador alterna el tema varias veces en la pausa
- **THEN** no se envía ningún mensaje al servidor y la sesión, el rol y el mundo no cambian
