# Proposal

## Why

Hoy no hay forma de ajustar la sensibilidad del mouse, el brillo del juego ni la calidad gráfica desde el cliente. La sensibilidad está hardcodeada en `.0042` (línea ~2777), el brillo nocturno es fijo y puede ser muy oscuro en algunas PCs, y la calidad gráfica (`LOW = TOUCH`) solo se elige automáticamente al arranque sin opción de usuario. Un menú de configuración en el menú de pausa resuelve los tres problemas sin tocar el servidor.

## What Changes

- **Menú de pausa**: agregar una pestaña/panel "Configuración" dentro del overlay `#pause` (junto a "Seguir jugando") con controles para sensibilidad del mouse, brillo y calidad gráfica.
- **Sensibilidad del mouse**: extraer `.0042` a una constante `MOUSE_SENSITIVITY` (por defecto `0.0042`), exponer un slider en el menú (rango aprox. 0.5× a 2×) y persistir en `localStorage` como `mc-mouse-sens`.
- **Brillo del juego**: agregar un control de brillo (rango 1.0 a 3.0, por defecto 1.0) que aclare las noches. Persistir en `localStorage` como `mc-brightness`. No es un filtro CSS: se aplica sobre la atmósfera/iluminación existente (`applyAtmosphere`) para que afecte uniforme a fondo, niebla, luces y skybox.
- **Calidad gráfica (3 niveles)**:
  - `0` = super optimizada (2 núcleos): pixelRatio 1, sin sombras, sin antialias, niebla corta, sombras del sol desactivadas.
  - `1` = baja/rápida (la actual `LOW`): pixelRatio 1, sin sombras, sin antialias.
  - `2` = alta (la actual no-`LOW`): pixelRatio devicePixelRatio (máx 1.5), sombras encendidas, antialias encendido.
  Persistir en `localStorage` como `mc-quality`. Al cambiar, aplicar en caliente (y recrear el renderer si es necesario para antialias).
- **Todo en `localStorage`**: sin servidor, sin protocolo nuevo, sin cambios de red.

## Capabilities

### New Capabilities

- `ui/config`: menú de configuración en pausa (sensibilidad, brillo, calidad gráfica) con persistencia en localStorage.

### Modified Capabilities

- `player/look`: la sensibilidad del mouse deja de estar hardcodeada y se lee de una constante configurable.
- `world/water` o `world/size`: la calidad gráfica afecta la niebla/render distance (opcional, según nivel).

## Impact

- `index.html`: nuevo panel en `#pause`, constantes `MOUSE_SENSITIVITY`, `BRIGHTNESS`, `QUALITY_LEVEL`, función `applyQuality()`, lecturas de `localStorage` al arranque, aplicación en `pointermove` y `applyAtmosphere`.
- Tests: nuevo `server/test/config.mjs` (archivo 21) con estáticos del cableado y puros de calidad/brillo/sensibilidad. `server/package.json`, `lookguard.mjs`, `camera.mjs`, `zombie-protocol.mjs` pasan de 20 a 21.
- Sin migración de datos: solo `localStorage` nuevo.
- `README.md`: documentar el menú de configuración si corresponde.

## Out of Scope

- **No** se toca el servidor ni el protocolo WebSocket.
- **No** hay comandos de chat para cambiar estas opciones.
- **No** se agrega un menú de configuración fuera del pausa (ni en el menú principal ni en el HUD).
- **No** se cambian los controles táctiles (joystick), solo el puntero del mouse.
