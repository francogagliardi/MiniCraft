# Design

## Context

Verificado sobre el código actual (`index.html`, `server/server.js`, suite `server/test/*.mjs`):

- **HUD actual** (`index.html:43-58`, HTML `255-280`): `#topbar` es `position:fixed` con `top:14px`, `left/right:16px`, `z-index:10`, `pointer-events:none` y `justify-content:space-between`. A la izquierda va el logo (`.logo`, ~46 px de alto, con `#coords`), a la derecha el contenedor **`#stats`** con las pills (`#btnFly`, `#btnCam`, `#btnSound`, `#btnShadow`, `#btnFull`). **El id `#stats` ya está ocupado**: el indicador nuevo no puede usarlo. Abajo: `#health` (centro), `#hotbar` (centro), `#hint` y `#chatlog` (abajo izquierda), `#plist` (`top:70px; right:16px`), `#toast` (centro), overlays de pausa/inventario/muerte con `z-index:40`.
- **Panel de ajustes** (`index.html:340-359`): `#configPanel` dentro de `#pause`, con tres `.cfg-row` (slider de sensibilidad, slider de brillo, select de calidad) y `#btnConfigBack`. Los handlers están en `3825-3852`; el boot restaura `mc-mouse-sens`, `mc-brightness` y `mc-quality` en `3933-3945`. El CSS de los controles vive en `236-242`.
- **Loop principal** (`index.html:4045-4099`): `loop(now)` recibe el timestamp de `requestAnimationFrame`, ya calcula `dt` y renderiza una vez por frame. Es el lugar natural para contar frames sin agregar otro `rAF`.
- **Red** (`index.html:3661-3767`): `netSend(o)` serializa JSON y solo envía si `mp && NET.readyState===1`. `connectMP()` maneja `welcome`; después `setupNetHandlers()` reemplaza `NET.onmessage` con una cadena `if/else if` de tipos conocidos (`pm`, `pedit`, `tod`, `sleep`, `join`, `leave`, `chat`, `phit`, `hitok`, `zs`, `zhitok`). **No hay `else` final**: un tipo desconocido se ignora en silencio, así que `pong` es seguro para clientes viejos. No existe ping de aplicación; solo el heartbeat de WebSocket del server (`server.js:239-255`, `ws.ping()`/`'pong'`), que no es visible para el cliente.
- **Servidor** (`server/server.js:290-407`): parsea el JSON, atiende `hello`, corta con `if (!me) return;` y luego una cadena `if/else if` (`mv`, `edit`, `sleep`, `wake`, `hit`, `zhit`, `chat`). Tampoco tiene `else`: un `ping` de un cliente nuevo contra un server viejo se ignora sin cerrar la conexión. `broadcast()` y `send()` están en `177-185`.
- **Tests**: 23 archivos en `server/package.json` → `scripts.test`. El conteo 23 está hardcodeado en `config.mjs:185`, `lookguard.mjs:314-315` (más la lista `required` de `311`), `bed-sleep.mjs:198`, `zombie-protocol.mjs:308` (más su lista `required` de `306`) y `camera.mjs:299/303` (que verifica el 23 dentro de `lookguard` y `zombie-protocol`). `config.mjs` describe los ajustes actuales; `protocol.mjs` levanta el server real y ya prueba mensajes E2E. `static.mjs` valida sintaxis/estructura del HTML pero no ids del HUD.

## Goals / Non-Goals

**Goals**

- Mostrar FPS y ping en una sola línea, opcional, arriba a la izquierda y sin tapar logo, pills ni chat.
- Medir FPS con una ventana de ~0.5 s y suavizado, escribiendo el DOM como máximo cuando cambia el valor visible.
- Medir ping de aplicación real en multijugador con un `ping`/`pong` aditivo, timeout y `—` cuando no hay dato.
- Persistir el toggle (`mc-stats`), aplicarlo en caliente y arrancar oculto.
- No romper clientes viejos, servidores viejos, bots ni el modo solo.

**Non-Goals**

- Historial, gráficos, jitter, pérdida de paquetes o telemetría.
- Reemplazar el heartbeat de WebSocket o la detección de fantasmas de `net/presence`.
- Mostrar métricas por jugador o en el servidor.
- Un atajo de teclado nuevo.

## Decisions

### 1. Ubicación y nombre del elemento

Se agrega un `div#perf` fijo **debajo del logo**, en `top:64px; left:16px`, `z-index:10`, `pointer-events:none`. El logo ocupa desde `top:14px` unos 46 px, así que 64 px deja un aire de 4 px y no lo tapa. `#plist` está en `top:70px` pero a la **derecha** (`right:16px`), por lo que no colisiona en escritorio; en pantallas angostas el indicador es corto (~150 px) y el `#plist` solo aparece en multijugador. No se mete dentro de `#topbar` porque el flex `space-between` desplazaría las pills y rompería el layout táctil.

El id es `#perf`, no `#stats`, porque `#stats` ya identifica el contenedor de pills (`index.html:257`) y hay un `#stats { display:flex; ... }` en el CSS (`index.html:53`). Reutilizarlo rompería la topbar.

Estilo: misma familia visual que `.pill`/`#plist` (`rgba(20,30,50,.5)`, `backdrop-filter:blur(10px)`, borde claro, `12px`), con `font-variant-numeric:tabular-nums` para que el ancho no baile al cambiar los dígitos. `#perf.hidden { display:none; }` porque no existe una clase `.hidden` global (solo variantes por contenedor: `#inv.hidden`, `.overlay.hidden`, `#pause .card.hidden`).

Texto: una sola línea `FPS 60 · Ping 24 ms`. Sin medición: `FPS —` y/o `Ping —`. En modo solo: FPS real y `Ping —`.

### 2. Cálculo de FPS

Dentro de `loop(now)` se incrementa `perfFrames`. Cuando `now - perfWinAt >= 500`:

```
fps = Math.round(perfFrames * 1000 / (now - perfWinAt));
perfFps = perfFps ? Math.round(perfFps * 0.6 + fps * 0.4) : fps;
perfFrames = 0; perfWinAt = now;
renderPerf();
```

Por qué:

- La ventana fija de 500 ms evita el ruido de un frame suelto y da ~2 actualizaciones por segundo, suficiente para leer el valor sin que parezca congelado.
- El suavizado exponencial (`0.6/0.4`) evita saltos entre 58/60/62 por variaciones normales, y converge en 2-3 ventanas.
- `renderPerf()` compara el texto formateado con `perfLastText` y **solo** asigna `textContent` si cambió; además retorna temprano si `STATS_ON` es falso. Nunca se escribe el DOM por frame.
- Contar frames es O(1) por frame; el costo real es el `textContent` bimensual, despreciable.

### 3. Protocolo de ping

Cliente (solo si `mp`), temporizador propio de 500 ms que reutiliza `netSend`:

```
PING_MS = 2000, PING_TIMEOUT_MS = 3000
if (pendiente && now - enviadoEn > PING_TIMEOUT_MS) { pendiente = false; ping = null; renderPerf(); }
if (!pendiente && now - enviadoEn >= PING_MS) {
  pendiente = true; enviadoEn = now;
  netSend({ t:'ping', ts: now });
}
```

Al recibir `{t:'pong', ts}` en `setupNetHandlers()`: si hay un ping pendiente y `ts` es finito, `ping = Math.round(performance.now() - ts)`, `pendiente = false` y `renderPerf()`. Al cerrar el socket (`NET.onclose`) se limpia `ping` y el pendiente, y el HUD muestra `Ping —`.

Servidor (`server.js`, después de `if (!me) return;`):

```
if (m.t === 'ping') {
  const ts = Number(m.ts);
  if (Number.isFinite(ts)) send(ws, { t:'pong', ts });
  return;
}
```

Decisiones:

- **Un solo ping pendiente**: no se acumulan mensajes si la red está lenta; el siguiente ping espera al `pong` o al timeout.
- **Eco del `ts`**: el cliente mide RTT con su propio reloj monotónico (`performance.now()`), sin sincronizar relojes ni confiar en la hora del server.
- **Respuesta solo al emisor** (`send`, no `broadcast`): el ping de un jugador no genera tráfico para los demás ni aparece en `welcome`.
- **Aditivo**: no se agrega ningún campo a `hello`/`welcome`/`mv`. Un server viejo ignora `ping` (no hay `else` final) y el cliente cae en timeout → `—`. Un cliente viejo ignora `pong` (tampoco tiene `else`) y sigue jugando.
- **Sin `ping` en modo solo**: si no hay `mp`, el temporizador no envía nada y el HUD muestra `—`; así no se inventa una latencia falsa.
- El heartbeat de WebSocket cada 30 s no se toca: mide salud del transporte, no latencia de la aplicación.

### 4. Toggle, persistencia y arranque

- Clave `localStorage`: `mc-stats`, valores `'1'`/`'0'` (consistente con `mc-shadows`). Default: oculto (`false`), para no cambiar el HUD de quien no lo pidió.
- HTML: `<div class="cfg-row"><label class="cfg-check" for="showStats"><input type="checkbox" id="showStats"> Mostrar FPS y ping</label></div>`. Es un checkbox real con `label` asociado (accesible con teclado y lectores), no un div clickeable.
- Handler `onchange`: actualiza `STATS_ON`, escribe `localStorage`, resetea `perfLastText` y llama a `renderPerf()` para mostrar/ocultar en el mismo evento. No recarga ni reinicia el loop.
- Boot (junto a `mc-quality`, `index.html:3933-3945`): lee `mc-stats === '1'`, setea `#showStats.checked` y llama a `renderPerf()`. Un valor corrupto o ausente equivale a oculto.
- `#perf` usa `aria-live="off"` (el valor cambia seguido, anunciarlo sería ruido) y no recibe foco.

### 5. Interacción con el resto del HUD

- `z-index:10`, igual que `#topbar`, `#health`, `#hotbar`, `#plist`; por debajo de los overlays (`z-index:40`) y del `#toast` (`z-index:30`). Al pausar, el overlay tapa el indicador como al resto del HUD.
- `pointer-events:none`: no roba clicks del canvas ni interfiere con el pointer lock, el joystick táctil (que vive en `#touchControls`, `z-index:20`) ni los botones.
- No se oculta al morir ni al dormir: es información de diagnóstico, no un elemento de juego.

## Risks / Trade-offs

- **El ping sube el tráfico**: 1 mensaje cada 2 s por cliente (~30 bytes), despreciable frente a los `mv` cada 70 ms.
- **Un `pong` viejo o ajeno**: se acepta solo si hay un ping pendiente; además el `ts` debe ser finito y la RTT quedar en un rango razonable (`>= 0`). Si el reloj salta, el valor se descarta.
- **Timeout demasiado agresivo en redes móviles**: 3 s es mayor que un RTT normal pero menor que la expiración de sesión (90 s). En una red muy mala se muestra `—` aunque el jugador siga conectado; es preferible a mostrar un ping viejo como si fuera actual.
- **`#perf` tapando el logo en pantallas muy bajas**: el logo está arriba y el indicador abajo; en táctil el logo conserva el mismo tamaño. Si en el futuro se agranda la topbar, habrá que ajustar `top`.
- **Costo del FPS oculto**: contar frames y calcular cada 500 ms es despreciable; no se evita para que al encender el toggle el valor ya esté listo.
- **Clientes viejos**: no se rompen, pero tampoco ven el ping (no lo piden). No hay forma de que un cliente viejo muestre el indicador, y no hace falta.

## Migration Plan

No hay migración de datos. El mundo (`{seed, edits}`), el protocolo existente y los guards de administración quedan intactos. El cambio es aditivo y se puede revertir quitando el `#perf`, la fila del panel, el temporizador y la rama `ping` del server.

## Open Questions

- ¿El default oculto es el correcto, o conviene recordar el estado por dispositivo? Se elige oculto y persistido por dispositivo; no se sincroniza entre navegadores.
- ¿2 s de intervalo y 3 s de timeout son los valores definitivos? Se documentan como constantes (`PING_MS`, `PING_TIMEOUT_MS`) para ajustarlos tras probar en Docker sin tocar la lógica.
- ¿El formato debe incluir la hora o un ícono? Se mantiene texto plano `FPS n · Ping n ms` por claridad y bajo costo.
