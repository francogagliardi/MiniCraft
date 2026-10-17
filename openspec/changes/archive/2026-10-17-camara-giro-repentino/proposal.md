# Proposal

## Why

Hay un bug intermitente reportado por el usuario: *"a veces, mientras vas caminando, se gira repentinamente la cámara"*. El usuario aclaró que pasa **caminando (a veces sin mover mucho el mouse)** y que **también con el servidor local** — así que no es un problema de red ni del deploy. Rastreando el código, la cámara se rearma cada frame desde `player.yaw`/`player.pitch` (`index.html:1650`) y **los dos únicos lugares que escriben `player.yaw`** son el handler `mousemove` de escritorio (`index.html:2364-2368`) y el `pointermove` táctil (`index.html:2387-2396`). Ninguno valida el delta: aplica `player.yaw -= e.movementX*.0024` tal cual, así que **un único evento con `movementX` desproporcionado gira la cámara de un saque** (1000 px = 2.4 rad = **137°**). Ese pico es un comportamiento conocido de los navegadores con pointer lock (recuperar el foco, cursor clavado en el borde de la pantalla, o un mouse inalámbrico que despierta de idle). Además hay un riesgo latente: si `movementX` llegara `undefined`/`NaN`, `player.yaw` quedaría **`NaN` para siempre** y la cámara se rompería de forma permanente.

## What Changes

- **Guard puro de delta de mirada antes de aplicar**: se agrega en `index.html` un **bloque marcado** `/* look:start */ … /* look:end */` (mismo patrón que `net/avatar` y `worldgen`) con la constante `LOOK_MAX_PX` y la función pura `lookDeltaOk(dx,dy)`, que devuelve `false` para un delta **implausible** (≥ `LOOK_MAX_PX`) o **no finito** (`NaN`/`Infinity`/`undefined`/`null`). El handler de escritorio y el táctil **consultan el guard antes de aplicar** y descartan el evento entero (no lo clipean).
- **Ignorar los valores no finitos** con `Number.isFinite`, para que un `movementX`/`dx` inválido no pueda envenenar `player.yaw` de forma permanente.
- **Ignorar el primer `mousemove` posterior a (re)adquirir el pointer lock** (el otro caso clásico de delta espurio): se marca con una bandera que ya se puede colgar del listener `pointerlockchange` existente (`index.html:2620`).
- **Diagnóstico verifiable en la consola**: contador de eventos descartados + `console.warn` de los primeros pocos con los valores (`mx`, `my`), para que el usuario pueda **confirmar la hipótesis** si el giro vuelve a pasar. El bug es intermitente y **no es reproducible headless**, así que el fix trae su propia evidencia: si el giro sigue ocurriendo **sin** ese aviso, la hipótesis es falsa y hay que volver a investigar (ver riesgos en `design.md`).
- **Test nuevo que verifica comportamiento real**: `server/test/lookguard.mjs` **extrae y evalúa el bloque `look`** desde `index.html` y aserta la función pura (delta normal, borde exacto de `LOOK_MAX_PX`, deltas enormes, `NaN`/`Infinity`/`undefined`/`null`) más un assert **estructural comentado** de que el handler llama al guard **antes** de aplicar el delta. Se da de alta en el script `test` de `server/package.json` (11 → **12** archivos) y se sube ese assert en `zombie-protocol.mjs`.
- **Sin cambios de protocolo, de red ni de servidor**: el bug es puramente de input del cliente. `player.yaw` sigue siendo local y se sigue enviando igual en `mv`.

## Capabilities

### New Capabilities

- `player/look`: control de la mirada del jugador local (yaw/pitch) a partir del input de mouse y de arrastre táctil — incluye el saneo del delta (descartar valores implausibles o no finitos y el primer evento tras re-adquirir el pointer lock) y la observabilidad de los descartes en consola.

### Modified Capabilities

<!-- Ninguna: ninguna capability existente describe el input de mirada. `player/physics` es gravedad/colisión/input de movimiento, `player/combat` es el daño de la espada, `player/mining` es rotura de bloques, `net/avatar` es cómo se ven los jugadores remotos. El look de la cámara es un contrato observable propio que hoy no está especificado. -->

## Impact

- **`index.html`**: bloque nuevo `/* look:start */ … /* look:end */` (constante `LOOK_MAX_PX`, contador de descartes y la función pura `lookDeltaOk`); el handler `mousemove` de escritorio (`2364-2368`) y el `pointermove` táctil (`2387-2396`) consultan el guard antes de tocar `player.yaw`/`player.pitch`; el listener `pointerlockchange` (`2620`) marca el primer evento a ignorar.
- **`server/test/lookguard.mjs`** (nuevo): extracción + evaluación del bloque `look`, asserts de la función pura y assert estructural del orden guard→aplicar.
- **`server/package.json`**: alta de `test/lookguard.mjs` en el script `test` (12 archivos).
- **`server/test/zombie-protocol.mjs`**: se sube su assert del script `test` de 11 a 12 archivos (no es uno de los 6 tests pre-existentes).
- **No afectado**: `server/server.js` (la red no puede mover la cámara: `applyPm`/`tickAvatar` solo escriben avatares remotos), el protocolo (`mv`/`pm` sin campos nuevos), `world.json`, la física del jugador, y los **6 tests pre-existentes** (`static.mjs`, `avatar.mjs`, `migrate.mjs`, `terrain.mjs`, `water.mjs`, `protocol.mjs`), que no hacen regex sobre `mousemove`/`movementX`/`player.yaw`/`shakeT`.
- **Deploy**: cambio **solo de cliente** (`index.html` + tests); no toca el servidor, así que el riesgo operativo es bajo (el HTML se sirve `no-cache`).
