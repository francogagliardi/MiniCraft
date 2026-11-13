# Design

## Context

Verificado sobre el código actual:

- **`index.html` (242 KB, un solo archivo):** el CSS vive en un único `<style>` (líneas 16-261) y la UI en HTML estático (líneas 264-381). El `<html>` no declara `data-theme`, no hay script de tema y el `<body>` no tiene marcador de partida. Los tokens de login/lobby/admin (`--bg`, `--panel`, `--text`, `--accent`, `--focus`, `--line`) existen solo en esas páginas; el juego usa colores literales (`#4fae4f`, `#1e2a3d`, `#6b7d99`, `rgba(255,255,255,.9)`, etc.).
- **Superficies a tocar:** topbar (`.logo`, `.pill`), `#perf`, `#health`, `#toast`, `#hotbar`/`.slot`, `#hint`, `#plist`, `#chatlog` y `#chatbox`, `#inv`/`.invItem`/`#invClose`, overlays `.overlay`/`.card` (`#menu`, `#pause`, `#configPanel`, `#death`), `#sleep`, `#loading`, `#cross`. El bloque táctil (`#touchControls`, `#joystick`, `.touchButton`) queda intacto salvo color de tokens.
- **Blur actual:** `.logo`, `.pill`, `#perf`, `#toast`, `#hotbar`, `#hint`, `#plist`, `#chatlog div`, `#inv`, `.card` usan `backdrop-filter` (9 superficies, varias siempre visibles sobre el canvas animado).
- **Tema existente:** login, registro, lobby y admin leen `mc-theme` en un script inline antes del CSS y ofrecen `#themeToggle`. El juego no participa.
- **Panel de configuración:** `#configPanel` dentro de `#pause` con tres `.cfg-row` y `#btnConfigBack`; handlers en `index.html:3961-3995`; boot en `4074-4091`. El estilo de los controles está al final del `<style>` (249-260), desconectado del resto.
- **Tests:** `server/test/static.mjs` lee `index.html` y valida estructura/estilo con expresiones regulares; la sección 10 ya prueba el patrón de tema de login/lobby. La suite encadena 39 archivos en `server/package.json`; agregar un archivo obliga a actualizar conteos en `config.mjs`, `lookguard.mjs`, `bed-sleep.mjs`, `zombie-protocol.mjs` y `camera.mjs`.
- **Restricciones:** sin frameworks, sin build, sin assets binarios; protocolo aditivo; tests Node planos; el canvas 3D no se valida automáticamente.

## Goals / Non-Goals

**Goals**

- Un sistema de tokens `--mc-*` con variantes claro/oscuro, derivado de la paleta de login/lobby.
- Tema del juego resuelto antes del CSS, persistido en `mc-theme` y cambiable en caliente desde la configuración.
- Superficies HTML coherentes y legibles sobre cielo, agua y noche, sin tocar el render.
- Foco, reduced-motion, responsive 360 px y targets de acción de 44 px.
- Sacar el blur del HUD permanente para no castigar FPS.
- Tests estáticos que cubran todo lo verificable sin navegador.

**Non-Goals**

- Render, texturas, luces, cámara, física, protocolo, bots, server, DB o Docker.
- Rediseñar controles táctiles, topbar o gameplay.
- Focus trap en overlays (rompería el pointer lock y el flujo de teclado del juego).
- Tema automático por `prefers-color-scheme` (la preferencia es explícita y persistente, igual que en login/lobby).
- Cambiar el favicon o las páginas de login/registro/lobby/admin.

## Decisions

### 1. Aislamiento de tokens y alcance

Se agrega `class="game"` al `<body>` de `index.html` y todos los tokens viven en ese archivo, bajo selectores acotados:

```css
html[data-theme="dark"] { /* :root implícito */ }
html[data-theme="light"] { ... }
body.game { /* tipografía, color-scheme base, radios y espaciado */ }
```

- El CSS es inline y solo se sirve en `/game`, así que no puede filtrarse a login/lobby. El marcador `body.game` deja explícita la intención y permite que cualquier regla nueva se ancle ahí (`body.game .card`, `body.game #hotbar`), evitando colisiones futuras si algún día se comparte CSS.
- No se toca `<canvas id="game">`: ninguna regla nueva aplica `filter`, `transform` ni `opacity` al canvas. El tema solo repinta la capa HTML.
- Nombres de token por familia, no por superficie: `--mc-bg`, `--mc-bg-2`, `--mc-panel`, `--mc-panel-solid`, `--mc-line`, `--mc-line-strong`, `--mc-line-control`, `--mc-text`, `--mc-dim`, `--mc-accent`, `--mc-accent-strong`, `--mc-accent-ink`, `--mc-accent-deep`, `--mc-danger`, `--mc-focus`, `--mc-hover`, `--mc-hud-scrim`, `--mc-hud-raised`, `--mc-hud-slot`, `--mc-hud-text`, `--mc-hud-dim`, `--mc-hud-line`, `--mc-shadow`, `--mc-shadow-strong`, `--mc-radius-sm|md|lg|xl`, `--mc-space-1..6`. Los tests buscan las familias, no cada valor.
- Valores base (tomados de login/lobby): oscuro `--mc-bg:#0b1410`, `--mc-panel:#14231b`, `--mc-text:#e9f2e6`, `--mc-dim:#9db2a2`, `--mc-accent:#7ec850`, `--mc-focus:#8fc4ff`; claro `--mc-bg:#e9efe0`, `--mc-panel:#fbfdf6`, `--mc-text:#18251a`, `--mc-dim:#5c6f5d`, `--mc-accent:#3f8f2e`, `--mc-focus:#1d63c8`. Se conserva el verde de botón `#4fae4f` como `--mc-accent` de acción para no cambiar la identidad del juego. El HUD oscuro queda en `rgba(10,16,24,.74)`/#f2f7fc y el claro en `rgba(250,253,255,.88)`/#16251a.

### 2. Tema sin flash y sincronización

- `<html lang="es" data-theme="dark">` y un `<script>` inline **antes del `<style>`** que lee `mc-theme` y aplica `light` solo si vale exactamente `'light'`; cualquier otro valor (ausente, basura) queda en oscuro. Es el mismo patrón ya probado en login/lobby y evita el destello al navegar desde el lobby.
- `applyGameTheme(theme, persist)`: normaliza, setea `document.documentElement.dataset.theme`, y si `persist` escribe `mc-theme`. El arranque llama con `persist=false` para no reescribir la preferencia (un valor inválido no se “corrige” en storage; simplemente se interpreta como oscuro).
- `color-scheme` se declara en cada bloque de tokens (`dark`/`light`), así los controles nativos (select, checkbox, scrollbars) acompañan.
- Se agrega `window.addEventListener('storage', …)` para reflejar un cambio de `mc-theme` hecho en otra pestaña; no escribe storage de vuelta, evitando bucles.
- El `meta[name=theme-color]` y el canvas no cambian: el color de la barra del navegador sigue siendo el cielo del juego, no el tema de la UI.
- Al volver al lobby no se escribe nada extra: el lobby lee el mismo `mc-theme` que el juego ya persistió.

### 3. Control de tema en la configuración

Fila nueva al final de `#configPanel`, antes de “Volver”:

```html
<div class="cfg-row">
  <label for="themeSelect">Tema</label>
  <select id="themeSelect">
    <option value="dark">Oscuro</option>
    <option value="light">Claro</option>
  </select>
</div>
```

- Un `<select>` nativo reutiliza el estilo existente de `#qualitySelect`, es accesible con teclado y lectores, y no requiere ARIA extra (`label for` alcanza).
- Handler `onchange → applyGameTheme(value, true)`: aplica en el mismo evento; no recarga, no reinicia el mundo, no envía red. Al abrir el panel se sincroniza `themeSelect.value` con el tema activo (también después de un cambio por `storage`).
- No se agrega un botón flotante como en login/lobby: dentro del juego el tema es configuración, no una acción frecuente, y un control flotante competiría con el pointer lock y la topbar.

### 4. Matriz de superficies, opacidad y blur

| Superficie | Fondo | Blur | Regla |
|---|---|---|---|
| `.overlay` (`#menu`, `#pause`, `#death`) | scrim temático + gradiente suave | no | El blur de pantalla completa es el más caro; se reemplaza por scrim |
| `.card` (`#pauseMain`, `#configPanel`, `#death`, menú inicial) | `--mc-panel` ~96 % opaco | sí, `blur(14px)` y solo en modales | El contenido se lee sobre el mundo |
| `#inv` backdrop | scrim | no | Igual que `.overlay` |
| `#inv .panel` | `--mc-panel-solid` | no (ya es opaco) | Modal pausado |
| HUD (`#perf`, `#plist`, `#chatlog`, `#toast`, `#hotbar`, `.pill`, `.logo`) | `--mc-hud-scrim` temático translúcido | **no** | Siempre visible mientras se renderiza |
| Vida (`#health`) | sin superficie: corazones sueltos con `text-shadow` | no | El contorno alcanza sobre cielo, agua y noche |
| Guía de controles (`details.controls-guide` en `#pauseMain`) | tarjeta de pausa + tokens de tema | no | Ya no flota sobre el mundo |
| `#chatbox input`, `#configPanel select`, `input`, `#inv .panel` | `--mc-field` sólido | no | Contraste y foco estables |
| `#sleep`, `#loading` | gradiente del tema / texto del tema | no | Acompañan claro/oscuro |

Decisión central: **el HUD sigue el tema**. En oscuro usa scrim oscuro (`rgba(10,16,24,.74)`) con texto `#f2f7fc` y borde `rgba(255,255,255,.22)`; en claro usa scrim claro semi-opaco (`rgba(250,253,255,.88)`), superficie elevada casi opaca (`rgba(255,255,255,.97)`), texto `#16251a`, atenuado `#46584a` y borde `rgba(22,37,26,.45)`. Los paneles siguen siendo semi-opacos y llevan borde/sombra, así el contraste no depende del cielo, el agua ni la noche, y el cambio de tema aclara también la UI de juego (topbar, pills, chat, hotbar, toasts, vida), no solo pausa y configuración.

- Paneles: oscuro `rgba(20,35,27,.96)`; claro `rgba(251,253,246,.96)`. Texto y atenuados usan `--mc-text`/`--mc-dim`, que ya cumplen AA sobre esos paneles.
- Overlays: oscuro `linear-gradient(160deg, rgba(8,14,11,.86), rgba(5,9,7,.92))`; claro `linear-gradient(160deg, rgba(233,239,224,.88), rgba(205,234,255,.9))` con tinte de cielo. No son 100 % opacos: dejan intuir el mundo pausado y mantienen la tarjeta legible.
- Botones: se mantienen las clases `.btn`/`.btn-player` y su verde; los tokens solo reemplazan `box-shadow`, foco y hover. Se conserva el `linear-gradient(135deg,#57c256,#2f9e32)` como token de acción.
- `#chatSend` deja su `style` inline y pasa a una regla `#chatSend` con tokens (hoy ignora el tema).

### 5. Contraste y legibilidad sobre 3D

- Regla medible: texto normal ≥ 4.5:1, texto grande/iconos/bordes de control ≥ 3:1 sobre la superficie efectiva. El test estático recalcula la composición de `--mc-hud-scrim` sobre cielo diurno `#7ec8f7`, agua `#2b6fb8` y noche `#0b1220` en ambos temas, y exige ≥ 4.5:1 con cada `--mc-hud-text`; además valida que un scrim demasiado transparente falle el umbral (sanity del cálculo).
- Texto sobre 3D: `text-shadow: 0 1px 2px rgba(0,0,0,.65)` en el HUD oscuro y `filter:drop-shadow` eliminado del cliente; el HUD claro usa halo claro en `#health`. La vida deja de ser un chip: `#health` conserva posición, tipografía y `pointer-events`, pero pierde `background`, `border`, `border-radius` y `padding`; el `text-shadow` (oscuro en dark, halo claro + sombra suave en light) define los corazones sobre cualquier fondo sin volver a una caja.
- Crosshair: en oscuro, núcleo claro (`--mc-hud-text`) con contorno oscuro (`0 0 0 1px rgba(0,0,0,.55)`, `0 1px 5px rgba(0,0,0,.75)`) y halo claro tenue. En claro se invierte a trazo `#16251a` con halo blanco (`0 0 0 1px rgba(255,255,255,.92)` y difusión), visible sobre cielo, nieve y noche. No usa `mix-blend-mode`.
- Guía de controles: sale del HUD fijo abajo a la izquierda y pasa a `#pauseMain` como `<details class="controls-guide"><summary>Guía de controles</summary><div id="hint"></div></details>`. `applyModeUI()` sigue rellenando `#hint` con el texto de admin/jugador. El `summary` tiene `min-height:44px`, `cursor:pointer` y `:focus-visible`; el bloque es `text-align:left`, sin `position:fixed`, sin ancho fijo y sin `display:none` en el media de 700 px ni en táctil, así funciona colapsado a 360 px.
- Estados (slot seleccionado, pill activa, ítem en slot, checkbox): siempre combinan borde + relleno + texto/posición, no solo color.
- Foco: `outline: 3px solid var(--mc-focus); outline-offset: 2px` más un anillo interior de contraste (`box-shadow: 0 0 0 1px var(--mc-panel-solid)`) para que se vea sobre paneles claros y oscuros. Aplica a `.btn`, `.slot`, `#invClose`, `.invItem`, `.pill`, `select`, `input`, checkbox y `#chatSend`.
- `prefers-reduced-motion: reduce` desactiva `chatIn`, `float`, el pulso de `.zzz`, las transiciones de `.slot`/`.btn`/`.card` y los `translateY` de hover. No se oculta información.

### 6. Accesibilidad y responsive

- `body.game` mantiene el viewport actual; no se agrega scroll. Overlays ya usan `max-height:92vh; overflow:auto`; se conserva y se elimina cualquier ancho fijo mayor a `calc(100% - 40px)`.
- 360 px: tarjetas a `calc(100% - 24px)`, `#invGrid` a 4 columnas (ya existe a <700 px), `#chatlog` a `min(300px,58vw)` en táctil. La hotbar conserva 9 slots (`calc((100vw - 40px)/9)`) y suma `min-height:46px`.
- Targets ≥44 px en acciones: botones de overlays (padding actual ya supera 44), `#invClose`, `.invItem` (`min-height:44px`), `select`/`input` de configuración (`min-height:44px`) y `#chatSend`. **Excepciones documentadas:** los 9 slots de la hotbar (densidad del juego; no entran 9×44 px en 360 px) y las pills compactas de la topbar (geometría táctil existente, fuera de alcance). No se rediseñan `#joystick` ni `.touchButton`.
- ARIA: `label for` en cada control de configuración; `aria-pressed` se conserva en `#btnCam` y pills existentes; los `.float-cube` decorativos pasan a `aria-hidden="true"`; `#loading` mantiene su texto y `role` implícito. No se promete focus trap ni `aria-modal` porque el juego no mueve el foco a los overlays (el pointer lock es el mecanismo de entrada).

### 7. Rendimiento

- Se quita `backdrop-filter` de las superficies permanentes del HUD (`.logo`, `.pill`, `#perf`, `#plist`, `#chatlog div`, `#toast`, `#hotbar`): cada una obliga a leer el canvas animado y a recomponer una capa por frame. Se reemplaza por `background: var(--mc-hud-scrim)`. La guía de controles deja de ser superficie del HUD: vive en la tarjeta de pausa.
- El blur queda solo en `.card` (área pequeña, juego pausado) con `blur(14px)`, y se declara `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` con fondo casi opaco de fallback.
- Sin `will-change` permanente, sin `filter` en canvas, sin imágenes ni fuentes nuevas (se conserva Outfit por CDN y `system-ui` como fallback).
- Sombras: máximo dos por elemento; las sombras grandes de `.overlay` se reemplazan por gradientes. Animaciones solo `transform`/`opacity` y desactivables por reduced-motion.
- `#hotbar`/`.slot` conservan sus transiciones de 0.15 s, que no se ejecutan si el mouse no interactúa.

### 8. Tests estáticos (lo verificable) y revisión visual (lo que no)

En `server/test/static.mjs`, sección 13 nueva (sin archivo nuevo, sin tocar los conteos de la suite):

1. `<html … data-theme="dark">`, `mc-theme` aparece antes de `<style`, hay `getItem`/`setItem` y `storage`.
2. Bloques `html[data-theme="light"]` y oscuro con las familias `--mc-*` requeridas y `color-scheme`.
3. `body class="game"`, `#themeSelect` con `label for`, opciones `dark`/`light`, handler que setea `data-theme` y `mc-theme`.
4. `:focus-visible`, `prefers-reduced-motion`, `@supports not (backdrop-filter` y reglas de 360 px.
5. Ausencia de `backdrop-filter` en las reglas del HUD (`#perf`, `#plist`, `#chatlog`, `#toast`, `.pill`, `.logo`, `#hotbar`) y ausencia de `filter`/`backdrop-filter` en la regla `#game`.
6. Contraste calculado: parsear `--mc-hud-scrim` y `--mc-hud-text` de cada tema, componer sobre cielo `#7ec8f7`, agua `#2b6fb8` y noche `#0b1220`, exigir ≥4.5:1 y verificar que un scrim débil falle (sanity). El tema claro además exige scrim claro, texto oscuro y borde oscuro translúcido.
7. Que `#chatSend` ya no tenga color literal en `style` y que `.slot`/`.invItem`/`.card` consuman `var(--mc-`.
8. Vida sin chip (`#health` sin `background`/`border`/`border-radius`/`padding`, con halo claro en light), crosshair invertido en light, y guía de controles dentro de `<details class="controls-guide">` en `#pauseMain` (una sola aparición de `#hint`, sin `position:fixed`, sin `display:none` en 700 px/táctil, `summary` de 44 px con foco).

Queda para **revisión visual en Docker** (el canvas no se puede validar automáticamente): legibilidad real sobre agua/noche, crosshair sobre texturas claras/oscuras, apariencia de cada overlay en ambos temas, 360 px sin scroll horizontal, foco por teclado, reduced-motion percibido y ausencia de caída de FPS.

## Risks / Trade-offs

- **Costo de `backdrop-filter`:** quitarlo del HUD cambia el look “vidrio” por un scrim más plano. Es intencional: prioriza FPS y contraste; los modales conservan el vidrio.
- **Doble fuente de verdad del tema:** login/lobby y juego leen `mc-theme` con el mismo contrato; si una página futura inventa otra clave, se rompe la sincronización. Se documenta `mc-theme` como clave única.
- **Default oscuro:** un jugador que nunca eligió tema ve el juego oscuro por primera vez (antes era claro). Es la alineación pedida; se revierte quitando el script inline y los tokens.
- **Contraste medido vs percibido:** el test cubre cielo, agua y noche con composición matemática, pero no nieve, partículas ni texturas específicas la revisión visual sigue siendo obligatoria.
- **Hotbar y pills bajo 44 px:** la excepción se documenta; agrandarlas rompería 9 slots y la topbar en 360 px. Si se exige 44 px estrictos, requiere rediseñar esos controles, fuera de alcance.
- **`#chatSend` inline:** mover su estilo a CSS es un cambio de estructura mínimo; si otro código depende del `style` inline (no hay), se detecta en la revisión.
- **Rendimiento del scrim de pantalla completa:** un gradiente es más barato que blur, pero sigue siendo una capa grande; se mantiene estática (sin animación) para no recomponer.

## Migration Plan

No hay migración de datos ni de protocolo. El cambio es aditivo en `index.html` y reversible: quitar el script de tema, los tokens y la fila `#themeSelect` devuelve el comportamiento anterior. `mc-theme` ya existe por login/lobby, así que no hay claves nuevas que limpiar. El mundo, el guardado local y las partidas en curso no se tocan.
