# ui/config Specification

## Purpose
Define el menú de configuración en el menú de pausa: sensibilidad del mouse, brillo del juego y tres niveles de calidad gráfica, todo persistido en localStorage.

## Requirements

### Requirement: Menú de configuración en el menú de pausa

El sistema SHALL mostrar un panel de configuración dentro del overlay `#pause`, accesible desde un botón "⚙️ Configuración", con controles para sensibilidad del mouse, brillo del juego y calidad gráfica, y un botón "Volver" para regresar al menú de pausa principal.

#### Scenario: Panel visible y ocultable
- **WHEN** el jugador está en pausa y pulsa "⚙️ Configuración"
- **THEN** se muestra el panel de configuración y se oculta el menú principal de pausa
- **WHEN** pulsa "Volver"
- **THEN** se oculta el panel y se muestra el menú de pausa principal

### Requirement: Sensibilidad del mouse configurable

El sistema SHALL leer la sensibilidad del mouse de `localStorage` (`mc-mouse-sens`) al arranque, con valor por defecto `0.0042`, y SHALL aplicarla en los dos handlers de mirada del cliente: `mousemove` en escritorio (`player.yaw -= mx * MOUSE_SENSITIVITY`) y `pointermove` en táctil (`player.yaw -= dx * MOUSE_SENSITIVITY`). SHALL exponer un slider en el menú de 0.5× a 2.0× del valor por defecto y SHALL guardar cambios inmediatamente en `localStorage`.

#### Scenario: Sensibilidad se aplica y persiste
- **WHEN** el jugador cambia la sensibilidad en el menú
- **THEN** el ratón gira más rápido o más lento inmediatamente, y al recargar la página se mantiene el valor elegido

### Requirement: Brillo del juego configurable

El sistema SHALL leer el brillo de `localStorage` (`mc-brightness`) al arranque, con valor por defecto `1.0`, y SHALL aplicarlo como una única luz efectiva (`brightLevel`) compartida por `applyAtmosphere` y `tickSky`. SHALL exponer un slider de 1.0 a 3.0 y SHALL guardar cambios inmediatamente en `localStorage`.

#### Scenario: Brillo aclara las noches
- **WHEN** el jugador sube el brillo por encima de 1.0
- **THEN** los colores de noche (fondo, niebla, luces) se aclaran de forma gradual, sin lavarse hacia blanco, y con 3.0× la noche queda en crepúsculo (nunca en día pleno)

#### Scenario: Transiciones sin parpadeo
- **WHEN** el ciclo pasa por el atardecer o el amanecer
- **THEN** la luz cambia de forma continua, sin alternar entre dos intensidades (el sol y la atmósfera usan la misma luz efectiva)

### Requirement: Tres niveles de calidad gráfica

El sistema SHALL ofrecer tres niveles de calidad gráfica: `0` (super optimizada para 2 núcleos), `1` (baja/rápida) y `2` (alta). SHALL leer el nivel de `localStorage` (`mc-quality`) al arranque y SHALL aplicar: pixelRatio, sombras, antialias y distancia de niebla según el nivel. SHALL guardar cambios inmediatamente en `localStorage`.

#### Scenario: Nivel super optimizada (0)
- **WHEN** el jugador elige calidad 0
- **THEN** pixelRatio = 1, sin sombras, sin antialias, niebla corta, sombras del sol desactivadas

#### Scenario: Nivel baja/rápida (1)
- **WHEN** el jugador elige calidad 1
- **THEN** pixelRatio = 1, sin sombras, sin antialias, niebla normal

#### Scenario: Nivel alta (2)
- **WHEN** el jugador elige calidad 2
- **THEN** pixelRatio = devicePixelRatio (máx 1.5), sombras encendidas, antialias encendido, niebla normal

### Requirement: Todo en localStorage, sin servidor

El sistema SHALL persistir sensibilidad, brillo y calidad en `localStorage` y SHALL NOT enviar ningún mensaje nuevo al servidor ni cambiar el protocolo WebSocket.

#### Scenario: Sin cambios de servidor ni protocolo
- **WHEN** el jugador cambia cualquier ajuste de configuración
- **THEN** solo se escribe en `localStorage` y no se envía ningún mensaje al servidor
