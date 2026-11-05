# Proposal

## Why

Hoy no hay forma de saber si el juego va lento por la PC, por la calidad gráfica o por la red: el cliente no muestra FPS y no mide la latencia contra el servidor. Diagnosticar un tirón, una caída de rendimiento o un problema de conexión obliga a abrir las herramientas del navegador, algo que no está disponible en táctil ni cómodo para un jugador común.

Además, la única referencia de red existente es el ping/pong **de WebSocket** (`ws.ping()`), que es del transporte, no del juego: no mide el viaje de un mensaje de la aplicación ni está expuesto en la UI.

## What Changes

- **Indicador opcional en el HUD**: una línea `FPS 60 · Ping 24 ms` arriba a la izquierda, con tipografía chica y fondo semitransparente, sin capturar clicks (`pointer-events:none`). Cuando no hay medición (arranque, modo solo o timeout) muestra `—`.
- **Toggle en ajustes**: nueva fila "Mostrar FPS y ping" en `#configPanel` con un checkbox accesible (`label` + `#showStats`). Se aplica en caliente, sin recargar, y se recuerda entre recargas en `localStorage` (`mc-stats`).
- **FPS medido en el loop**: contador de frames en una ventana de ~0.5 s con suavizado; el DOM se actualiza como máximo ~2 veces por segundo y solo si cambió el texto mostrado.
- **Ping real de aplicación**: el cliente envía `{t:'ping', ts}` cada ~2 s y el server responde `{t:'pong', ts}` al mismo socket (eco del `ts`), sin difundir a otros jugadores. La RTT se calcula con `performance.now()`. Si no llega `pong` en ~3 s, el ping visible pasa a `—`.
- **Compatible con versiones viejas**: los mensajes son aditivos. Un cliente viejo ignora `pong`; un servidor viejo ignora `ping` y el cliente nuevo muestra `—`. Sin cambios en `welcome`, `mv` ni en el guardado del mundo.
- **Modo solo sin falsos valores**: sin servidor no se envía `ping`; el HUD muestra FPS real y `Ping —`.

## Capabilities

### New Capabilities

- `ui/hud`: indicador FPS/ping arriba a la izquierda, formato, estados sin medición, cálculo de FPS sin costo por frame, accesibilidad y convivencia con el resto del HUD.
- `net/latency`: mensaje `ping`/`pong` aditivo a nivel de aplicación, eco del `ts`, respuesta solo al emisor, timeout y compatibilidad con clientes/servidores viejos.

### Modified Capabilities

- `ui/config`: el panel de configuración suma la fila "Mostrar FPS y ping" (checkbox persistido en `mc-stats`) y se aclara que los ajustes no generan tráfico propio; la medición de latencia vive en `net/latency`.

## Impact

- `index.html`: nuevo `#perf` en el HUD y su CSS; fila del checkbox en `#configPanel`; constante `STATS_ON`, `renderPerf()`/`formatPerf()` y el contador de frames en `loop()`; temporizador de ping y manejo de `pong` en `setupNetHandlers()`; restauración de `mc-stats` en el boot; limpieza del ping al cerrar el socket.
- `server/server.js`: rama aditiva `m.t === 'ping'` que responde `{ t:'pong', ts }` al mismo socket. No toca el heartbeat de WebSocket ni el guardado.
- `server/test/`: nuevo `stats.mjs` (la suite pasa de 23 a 24 archivos); ampliación de `protocol.mjs` (E2E de `ping`/`pong` y aislamiento) y de `config.mjs` (fila del toggle); actualización de las guardas de conteo 23→24 en `package.json`, `config.mjs`, `lookguard.mjs`, `bed-sleep.mjs`, `camera.mjs` y `zombie-protocol.mjs`.
- `README.md`: mención del nuevo test y del indicador.
- Sin migración de datos ni cambios de protocolo obligatorios: el mundo y los clientes viejos siguen funcionando.

## Out of Scope

- **No** se muestra un gráfico de historial, promedio mínimo/máximo ni alertas por FPS bajo.
- **No** se mide jitter, pérdida de paquetes, ancho de banda ni latencia por jugador.
- **No** se agrega un comando o tecla global para el toggle: solo se activa desde `⚙️ Configuración`.
- **No** se cambia el heartbeat de WebSocket (`ws.ping()` cada 30 s) ni la expiración por inactividad de `net/presence`.
- **No** se agrega telemetría al servidor ni se guarda el ping en `world.json`.
- **No** se muestran FPS/ping por defecto: el indicador arranca oculto (opt-in).
