# Tasks

## 1. RED/GREEN: tokens y aislamiento de la UI del juego

- [ ] 1.1 En `server/test/static.mjs` agregar la sección 13 con las aserciones de tokens (`html[data-theme="dark"]` y `[data-theme="light"]`, familias `--mc-bg`, `--mc-panel`, `--mc-text`, `--mc-dim`, `--mc-accent`, `--mc-focus`, `--mc-hud-scrim`, `--mc-hud-text`, `--mc-line`, `--mc-shadow`, `color-scheme`) y de `body class="game"`; correr `cd server && node test/static.mjs` y confirmar que falla solo en las aserciones nuevas, no por sintaxis.
- [ ] 1.2 Implementar en el `<style>` de `index.html` el bloque de tokens oscuro/claro bajo `html[data-theme]` y el marcador `<body class="game">`, sin tocar las reglas del canvas; verificar que las aserciones de tokens de `node test/static.mjs` pasan.
- [ ] 1.3 Sumar a la sección 13 el cálculo de contraste del HUD (parsear `--mc-hud-scrim` y `--mc-hud-text`, componer sobre `#7ec8f7` y exigir ≥4.5:1) y la ausencia de `filter`/`backdrop-filter` en la regla `#game`; verificar que el cálculo pasa con los tokens nuevos y falla si se baja el scrim a un valor insuficiente (probar el cambio y revertirlo).

## 2. RED/GREEN: tema sin flash y control en la configuración

- [ ] 2.1 Agregar a la sección 13 las aserciones del tema: `<html … data-theme="dark">`, `mc-theme` antes de `<style`, lectura con `getItem`, escritura con `setItem`, listener `storage` y `color-scheme`; correr `cd server && node test/static.mjs` y confirmar que fallan contra el `index.html` actual.
- [ ] 2.2 Insertar el `<script>` inline de tema antes del `<style>` y resolver `data-theme` desde `mc-theme` (default oscuro, valor inválido → oscuro, sin reescribir storage al cargar); verificar con `node test/static.mjs` y con `Select-String -Path index.html -Pattern 'mc-theme'` que aparece antes de `<style`.
- [ ] 2.3 Agregar la fila “Tema” con `<label for="themeSelect">` y `<select id="themeSelect">` (Oscuro/Claro) al final de `#configPanel`, más `applyGameTheme(theme, persist)` y el handler `onchange` que actualiza `data-theme` y `mc-theme`; verificar con las aserciones de la sección 13.
- [ ] 2.4 Sincronizar `#themeSelect` con el tema activo al abrir el panel y al recibir un cambio por `storage`, sin escribir de vuelta; verificar con `node test/static.mjs` y revisar que el handler no llame a `netSend` ni `fetch`.

## 3. RED/GREEN: overlays de menú, configuración, muerte y loading

- [ ] 3.1 Agregar aserciones de que `.overlay`, `.card`, `#configPanel`, `#menu`, `#death`, `#sleep` y `#loading` consumen `var(--mc-` y de que las tarjetas conservan `max-height`/`overflow:auto`; correr `node test/static.mjs` y confirmar el rojo de las nuevas.
- [ ] 3.2 Reemplazar los colores literales de overlays y tarjetas por tokens (fondo de overlay, panel, texto, atenuado, línea, sombra) en ambos temas, manteniendo el menú inicial de archivo local con el mismo sistema; verificar que las aserciones de la sección 13 pasan.
- [ ] 3.3 Aplicar foco visible, reduced-motion y targets ≥44 px a los controles de los overlays (`select`, `input`, checkbox, `.btn`) y ajustar el ancho de tarjeta a `calc(100% - 24px)` en pantallas angostas; verificar con `node test/static.mjs` y revisar que ningún `width` fijo supere 360 px.

## 4. RED/GREEN: HUD legible sobre el mundo 3D

- [ ] 4.1 Agregar aserciones de que `#perf`, `#hint`, `#plist`, `#chatlog`, `#toast`, `.pill`, `.logo` y `#hotbar` usan `--mc-hud-scrim`/`--mc-hud-*` y de que ninguna de esas reglas contiene `backdrop-filter`; correr `node test/static.mjs` y confirmar que fallan por el blur actual.
- [ ] 4.2 Aplicar el scrim del HUD, el texto claro y los bordes tokenizados en topbar, perf, hint, plist, chatlog, toast y hotbar; quitar sus `backdrop-filter`; verificar que las aserciones de blur y tokens pasan.
- [ ] 4.3 Tokenizar `#health` (chip de scrim + `text-shadow`, sin `filter:drop-shadow`) y dar al crosshair contorno oscuro + halo claro independiente del color; verificar con `node test/static.mjs` y revisar que `#cross` no usa `mix-blend-mode`.

## 5. RED/GREEN: chat, inventario, hotbar y toasts

- [ ] 5.1 Agregar aserciones de que `#chatSend` ya no lleva color literal en `style`, de que `#inv .panel`, `.invItem`, `#invClose`, `.slot` y `#toast` consumen `var(--mc-` y de que `.invItem`/`#invClose` tienen foco visible y `min-height:44px`; correr `node test/static.mjs` y confirmar el rojo.
- [ ] 5.2 Mover el estilo inline de `#chatSend` a una regla CSS tokenizada y aplicar tokens a `#chatbox input`, `#chatlog`, `#inv`, su panel, la grilla, `.slot`/`.slot.sel` y `#toast`; verificar que las aserciones de la sección 13 pasan.
- [ ] 5.3 Mantener la hotbar de 9 slots con altura táctil ≥46 px y sin scroll horizontal, y asegurar que selección/hover/estado usan borde además de color; verificar con `node test/static.mjs` y con la revisión de la regla `body.touch .slot`.

## 6. RED/GREEN: accesibilidad, responsive y fallback de rendimiento

- [ ] 6.1 Agregar aserciones de `:focus-visible` en `.btn`, `.slot`, `.invItem`, `.pill`, `#invClose`, `select` y `input`; de `prefers-reduced-motion` para `.slot`, `.card`, `#sleep .zzz` y `chatIn`; y de `@supports not` con fallback de `backdrop-filter`; correr `node test/static.mjs` y confirmar el rojo de las que falten.
- [ ] 6.2 Implementar el anillo de foco de doble contraste, el bloque `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` y las reglas de reduced-motion que desactivan `chatIn`, `float`, `translateY` y transiciones sin ocultar información; verificar que las aserciones pasan.
- [ ] 6.3 Ajustar la composición a 360 px (tarjetas, `#invGrid` a 4 columnas, chat y hotbar sin desborde), agregar `aria-hidden="true"` a los `.float-cube` decorativos y `label for` faltantes, y verificar con `node test/static.mjs` y una búsqueda de `width:` fijos mayores a 360 px.

## 7. Verificación de integración y QA visual

- [ ] 7.1 Correr `cd server && npm test` completo y verificar que toda la suite queda verde sin agregar archivos de test ni cambiar los conteos existentes.
- [ ] 7.2 Levantar Docker con `ADMIN_PASSWORD=<clave> docker compose up --build -d minicraft`, esperar a que `http://localhost:3000` responda y revisar en el navegador: ambos temas en pausa/configuración/muerte/inventario, tema sincronizado desde el lobby sin destello, HUD legible de día/noche/bajo el agua, crosshair sobre fondos claros y oscuros, 360 px sin scroll horizontal, foco por teclado, reduced-motion y FPS sin caída perceptible.
- [ ] 7.3 Avisar al usuario el link local y la cuenta admin de esa corrida en la misma línea (`http://localhost:3000 · admin: admin / <clave>` o `admin deshabilitado`), indicar qué mirar y esperar la aprobación explícita antes de cualquier cierre de Docker, commit o push.

## Workflow follow-up

- No commitear, no pushear y no archivar hasta que el usuario apruebe explícitamente la revisión visual en Docker.
- Al aprobar, en este orden: `docker compose down`; `git add` + commit en español con scope de área (`feat(ui): tema y sistema visual del juego`); `git push` a `main`; `openspec archive ui-tema-juego`; verificar que `git status` quede limpio.
- Si el usuario pide cambios después de probar: corregir, volver a levantar Docker y repetir la revisión visual con una nueva aprobación.
