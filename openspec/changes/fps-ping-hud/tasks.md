# Tasks

## 1. RED: tests del indicador, del protocolo y del toggle

- [x] 1.1 Crear `server/test/stats.mjs`: verificar que `#perf` no existe todavía, que el id `#stats` sigue siendo único (contenedor de pills), que `server.js` todavía no responde `ping` y que no hay `mc-stats`. Correr `cd server && node test/stats.mjs` y confirmar que falla por feature ausente, no por sintaxis.
- [x] 1.2 En `stats.mjs`, agregar los estáticos del HUD: existe `#perf` una sola vez, el id `#stats` sigue siendo el contenedor de pills, el CSS declara `position:fixed`, `top`/`left`, `pointer-events:none`, `z-index` menor que 40 y `#perf.hidden { display:none }`; el indicador no está dentro de `#topbar`.
- [x] 1.3 En `stats.mjs`, agregar los estáticos de configuración y persistencia: `#showStats` es un checkbox con `label` asociado, arranca oculto, existe `localStorage.getItem('mc-stats')` en el boot y `localStorage.setItem('mc-stats', ...)` en el handler, y el handler llama a `renderPerf()` en el mismo evento.
- [x] 1.4 En `stats.mjs`, agregar los estáticos de la lógica: `formatPerf(fps, ping)` es evaluable de forma pura y devuelve `FPS 60 · Ping 24 ms` / `FPS 60 · Ping —` / `FPS — · Ping —`; existen `PING_MS` (~2000) y `PING_TIMEOUT_MS` (~3000); el loop incrementa frames y llama a `renderPerf()` solo al cerrar la ventana de 500 ms; `renderPerf()` compara con el último texto y no asigna `textContent` si no cambió ni cuando está oculto; `setupNetHandlers()` maneja `m.t === 'pong'`; `NET.onclose` limpia el ping.
- [x] 1.5 En `stats.mjs`, agregar el estático del servidor: `server.js` tiene una rama `m.t === 'ping'` que responde con `send(ws, { t:'pong', ts })` al emisor y no usa `broadcast`; un `ts` no finito no responde.
- [x] 1.6 Ampliar `server/test/protocol.mjs` con el E2E de latencia: tras `welcome`, un cliente manda `{t:'ping', ts:12345}` y recibe `{t:'pong', ts:12345}`; otro cliente conectado **no** recibe ni el `ping` ni el `pong`; `{t:'ping'}` sin `ts` no responde y la conexión sigue viva (se comprueba con un `mv` posterior); un `{t:'tipo-inexistente'}` no cierra la conexión.
- [x] 1.7 Ampliar `server/test/config.mjs` con la fila del toggle en `#configPanel` (checkbox + label + "Mostrar FPS y ping") y actualizar el conteo 23→24 (ver fase 4). Correr `npm test` y confirmar que falla por los tests nuevos.

## 2. GREEN: HUD, formato y contador de FPS

- [x] 2.1 Agregar `<div id="perf" class="hidden" aria-live="off">FPS — · Ping —</div>` fuera de `#topbar` (después del cierre de `#topbar`, junto al resto del HUD) y su CSS: `position:fixed; top:64px; left:16px; z-index:10; pointer-events:none;` con el mismo lenguaje visual que `.pill`/`#plist`, `font-variant-numeric:tabular-nums` y `#perf.hidden { display:none; }`.
- [x] 2.2 Crear el bloque puro `/* perf:start */ … /* perf:end */` con `PERF_WINDOW_MS = 500`, `PERF_PING_MS = 2000`, `PERF_PING_TIMEOUT_MS = 3000` y `formatPerf(fps, ping)` (sin `THREE` ni DOM), para que `stats.mjs` lo evalúe.
- [x] 2.3 Implementar el estado (`STATS_ON`, `perfFps`, `perfPing`, `perfFrames`, `perfWinAt`, `perfLastText`) y `renderPerf()`: sale temprano si `STATS_ON` es falso; alterna `.hidden`; formatea y solo asigna `textContent` si el texto cambió.
- [x] 2.4 En `loop(now)`, contar frames y cerrar la ventana de 0.5 s con suavizado `perfFps = round(perfFps*0.6 + fps*0.4)`, llamando a `renderPerf()` una sola vez por ventana.

## 3. GREEN: toggle en ajustes y persistencia

- [x] 3.1 Agregar la fila en `#configPanel` con `<label class="cfg-check" for="showStats"><input type="checkbox" id="showStats"> Mostrar FPS y ping</label>` y el CSS del checkbox (tamaño, `accent-color`, `display:flex`, cursor).
- [x] 3.2 Cablear `showStats.onchange`: actualizar `STATS_ON`, persistir `'1'`/`'0'` en `mc-stats`, resetear `perfLastText` y llamar a `renderPerf()` sin recargar.
- [x] 3.3 En el boot (junto a `mc-quality`), leer `mc-stats === '1'`, setear `showStats.checked` y llamar a `renderPerf()`; un valor inválido deja el indicador oculto.

## 4. GREEN: ping/pong de aplicación y suite

- [x] 4.1 En `server/server.js`, después de `if (!me) return;`, agregar la rama `m.t === 'ping'`: si `Number.isFinite(Number(m.ts))`, `send(ws, { t:'pong', ts:Number(m.ts) })`; en todos los casos `return`. No tocar el heartbeat ni `broadcast`.
- [x] 4.2 En `setupNetHandlers()`, manejar `m.t === 'pong'` solo si hay un ping pendiente: calcular `Math.round(performance.now() - m.ts)`, limpiar el pendiente y llamar a `renderPerf()`; ignorar `ts` no finito o RTT negativa.
- [x] 4.3 Agregar el temporizador de ping (500 ms): envía `{t:'ping', ts: performance.now()}` con `netSend` cada ~2 s si `mp` y no hay pendiente; al vencer los 3 s descarta el pendiente, pone `perfPing = null` y llama a `renderPerf()`.
- [x] 4.4 En `NET.onclose`, limpiar `perfPing` y el pendiente, y llamar a `renderPerf()` para mostrar `Ping —`.
- [x] 4.5 Actualizar el conteo 23→24 en `server/package.json` (agregar `node test/stats.mjs`), `config.mjs`, `lookguard.mjs` (lista `required` + count), `bed-sleep.mjs`, `zombie-protocol.mjs` (lista `required` + texto "24 archivos") y `camera.mjs` (regex de `lookguard` y texto de `zombie-protocol`). Corregir el comentario viejo "21 archivos" del encabezado de `config.mjs`.
- [x] 4.6 Correr `cd server && npm test` y dejar los 24 archivos en verde.

## 5. Verificación manual (sin commit todavía)

- [x] 5.1 `docker compose up --build -d minicraft`, abrir `http://localhost:3000`, habilitar "Mostrar FPS y ping" y confirmar: aparece arriba a la izquierda sin tapar el logo, el FPS se mueve, el ping muestra un valor en ms y el toggle sobrevive a un F5.
- [x] 5.2 Jugar en modo solo (sin server) y confirmar `Ping —` con FPS real; simular red lenta/caída y confirmar que el ping pasa a `—` sin romper el juego.
- [x] 5.3 Confirmar que pausa, inventario, muerte, chat y táctil siguen funcionando y que el indicador no intercepta clicks. Avisar al usuario qué mirar y esperar aprobación explícita antes de commitear.

## 6. Documentación

- [ ] 6.1 Agregar `test/stats.mjs` a la sección de tests del `README.md` y mencionar el indicador opcional de FPS/ping.
- [x] 6.2 Revisar que `AGENTS.md` no necesite cambios (sigue diciendo "tests Node planos"; solo cambia el conteo, que no está documentado allí).
