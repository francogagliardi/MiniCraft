# Design

## Context

- El menú de pausa (`#pause`) hoy solo tiene el botón "Seguir jugando" (`index.html:301-308`).
- Sensibilidad del mouse: hardcodeada en `.0042` en el `pointermove` del canvas (`index.html:2777-2778`).
- Calidad gráfica: `LOW = TOUCH` (`index.html:754`), se elige al arranque y no hay forma de cambiarla.
- Brillo: fijo por la paleta día/noche en `applyAtmosphere` (`index.html:843`).
- Persistencia existente: `mc-shadows`, `mc-skin`, `mc-cam` en `localStorage` (patrón a seguir).

## Goals / Non-Goals

**Goals:**
- Menú de configuración dentro del menú de pausa.
- Sensibilidad del mouse configurable y persistida.
- Brillo del juego configurable para aclarar las noches.
- Tres niveles de calidad gráfica, incluido uno "super optimizado" para 2 núcleos.
- Todo persistido en `localStorage`, sin servidor.

**Non-Goals:**
- Cambios de servidor o protocolo.
- Controles táctiles (joystick).
- Menú fuera del pausa.

## Decisions

### 1. Panel en el menú de pausa

Se agrega un botón "⚙️ Configuración" en `#pause` que muestra un panel con tres controles (sliders/select) y un botón "Volver". El panel se renderiza en HTML estático dentro de `#pause`, oculto por defecto, y se muestra/oculta con clases CSS.

### 2. Sensibilidad del mouse

Constante `MOUSE_SENSITIVITY` (default `0.0042`), leída de `localStorage` al arranque con clave `mc-mouse-sens`. Los dos handlers de mirada usan la constante (`mousemove`: `player.yaw -= mx * MOUSE_SENSITIVITY`; `pointermove` táctil: `player.yaw -= dx * MOUSE_SENSITIVITY`), con el mismo pitch. Slider en el menú de 0.5× a 2.0× del valor por defecto.

### 3. Brillo del juego

Constante `BRIGHTNESS` (default `1.0`), leída de `localStorage` con clave `mc-brightness`. Se aplica mediante una única función `brightLevel(L)` (compartida por `applyAtmosphere` y `tickSky`): `min(1, L + min(0.30, (1-L) * (BRIGHTNESS-1) * 0.5))`. Con brillo 1.0 nada cambia, 2.0 deja la noche a mitad de camino del día y 3.0 la aclara al máximo (0.80, un crepúsculo: nunca día pleno, porque de noche tienen que salir los zombies y el mundo debe verse nocturno). La misma luz efectiva alimenta luces, colores de fondo/niebla, skybox y la posición/visibilidad del sol, para que las transiciones de amanecer/atardecer no alternen entre dos intensidades (parpadeo). El sol directo se apaga de noche (`L > NIGHT_MIN`): la única direccional nocturna es la luna. Rango 1.0 a 3.0. Slider en el menú.

Alternativa descartada: `renderer.toneMappingExposure` afecta todo el render incluyendo la UI y puede sobreexponer colores vivos. Aplicarlo sobre la atmósfera es más controlado y afecta solo el mundo.

### 4. Calidad gráfica (3 niveles)

Variable `QUALITY_LEVEL` (default según dispositivo: táctil → 1, PC → 2, pero el usuario puede sobrescribir). Clave `mc-quality`.

- **Nivel 0 (super optimizada / 2 núcleos)**: `renderer.setPixelRatio(1)`, `shadowMap.enabled = false`, `antialias = false`, niebla corta (`fog.far = 100`), `sun.castShadow = false`, `sun.shadow.mapSize = 512`.
- **Nivel 1 (baja / rápida)**: `renderer.setPixelRatio(1)`, `shadowMap.enabled = false`, `antialias = false`, niebla normal (`fog.far = 180`).
- **Nivel 2 (alta)**: `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`, `shadowMap.enabled = true`, `antialias = true`, niebla normal.

Como `antialias` se pasa al constructor del renderer, cambiar de nivel que requiera distinto antialias obliga a recrear el renderer (`new THREE.WebGLRenderer({canvas, antialias: ...})`) y volver a aplicar `setPixelRatio`, `setSize`, `shadowMap`, y el tamaño. Los otros ajustes (pixelRatio, shadowMap, fog) se aplican en caliente sin recrear.

### 5. Persistencia

Al arrancar, se leen `mc-mouse-sens`, `mc-brightness`, `mc-quality` de `localStorage`. Si no existen, se usan los valores por defecto. Cada cambio se escribe inmediatamente en `localStorage` (patrón igual a `mc-shadows`).

### 6. Alternativas descartadas

- **Brillo vía CSS overlay**: más simple pero afecta la UI y los textos, no solo el mundo.
- **Calidad solo al arranque**: el usuario quiere cambiarla sin recargar.
- **Comandos de chat**: fuera de alcance, requeriría protocolo.

## Risks / Trade-offs

- Recrear el renderer al cambiar de calidad puede parpadear un frame. Es aceptable porque es una acción de usuario puntual.
- El brillo muy alto puede lavar colores oscuros intencionales (noche). Se deja a criterio del usuario.
- El nivel 0 con niebla corta puede hacer que el mundo se vea "cortado" a distancia. Es el trade-off de la super optimización.

## Test Strategy

Nuevo `server/test/config.mjs` (archivo 21) con:
- Estáticos: existe botón de configuración en `#pause`, `MOUSE_SENSITIVITY` se usa en `pointermove`, `BRIGHTNESS` se usa en `applyAtmosphere`, `applyQuality` existe, `localStorage` claves correctas, los 3 niveles definidos.
- Puros: `applyQuality(0/1/2)` devuelve configuración esperada (pixelRatio, shadows, antialias, fog.far).
- Suite pasa a 21 archivos: actualizar `package.json`, `lookguard.mjs`, `camera.mjs`, `zombie-protocol.mjs`.

RED primero (el archivo corre y falla por bloque ausente), después GREEN.
