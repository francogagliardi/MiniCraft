# Proposal

## Why

En Easypanel los `console.log` del server y del bot se leen **sin saber cuándo pasó nada**: Docker pone en cada línea el *timestamp del log driver* (UTC o la hora del browser), que no es la del usuario. Se quiere que los tres logs que importan para seguir la vida del mundo digan la **hora de Argentina** al lado, para poder correlacionar a ojo (quién entró, quién salió, cuándo pega el bot) sin salir a traducir zonas. Es un change chico y acotado: **tres líneas de log** y un helper mínimo, cero dependencias nuevas.

## What Changes

- **Prefijo de hora argentina `[HH:MM]`** (24 h, sin segundos) al **inicio** del mensaje, en exactamente tres `log` de consola:
  - `server/server.js:277` (unión) → `[HH:MM] ➕ <nombre> (<modo>) — <N> conectados`.
  - `server/server.js:172` (salida, dentro de `removePlayer()`) → `[HH:MM] ➖ <nombre> — <N> conectados`.
  - `bot/cazador.js:164` (dentro de `attack()`) → `[HH:MM] ⚔️  golpe a <nombre> (d=<d>, seq=<seq>)`.
- **Formato con `Intl.DateTimeFormat`** sobre `timeZone: 'America/Argentina/Buenos_Aires'` (sin dependencias; full-ICU ya está en `node:20-alpine`). **No** se usa la env var `TZ`: la hora va *dentro del texto* del mensaje, porque el timestamp que muestra Easypanel lo agrega Docker y no lo controla la app.
- **Helper `horaAr` duplicado** (bloque de dos sentencias) en cada contenedor — `server/server.js` y `bot/cazador.js` — y **hoisteado a nivel de módulo** (un solo `Intl.DateTimeFormat` por proceso, no uno por llamada). El reloj es **inyectable** (`horaAr(now = Date.now())`) para testearlo de forma determinista.
- **Tests nuevos** que fijan el contrato del prefijo (formato, zona de Argentina, mensaje original intacto detrás) sin depender del reloj real ni de la `TZ` de la máquina, y verificación de que la suite existente sigue verde (impacto nulo: los tests de hoy inyectan `log: () => {}` y ninguno asierta el texto de `conectados`).

## Capabilities

### New Capabilities

<!-- Ninguna: este change no introduce ninguna capability nueva. -->

### Modified Capabilities

- `net/presence`: se agrega el comportamiento de que los logs de consola de **unión** y **salida** de jugador del server lleven el prefijo de hora de Argentina, sin cambiar el mensaje original.
- `bots/hunter`: se agrega el comportamiento de que el log de consola de **cada golpe** del bot lleve el prefijo de hora de Argentina, sin cambiar el mensaje original.

## Impact

- **`server/server.js`** (dos puntos + helper): bloque marcado `/* hora-ar:start */…/* hora-ar:end */` con `horaAr`; prefijo en el `console.log` de unión (`:277`) y de salida (`:172`). El resto de los logs del server (mundo cargado, admin, arranque) **no se toca**.
- **`bot/cazador.js`** (un punto + helper): bloque marcado `/* hora-ar:start */…/* hora-ar:end */` con `horaAr` (y `horaAr` **exportado** para el test); prefijo en el `log(...)` de `attack()` (`:164`). `announceKill` (`:176-178`) **no se toca**: no loguea, sólo manda chat.
- **`server/test/hora-argentina.mjs`** (nuevo): test del helper de ambos archivos (extraído del bloque marcado con `new Function`), del comportamiento del server sobre **stdout real** (unión y salida) y del bot con `log` inyectado.
- **`server/package.json`**: alta de `test/hora-argentina.mjs` en `scripts.test`.
- **`server/test/zombie-protocol.mjs:287-289`** y **`server/test/lookguard.mjs:171-175`**: subir los dos asserts de conteo **16 → 17**. Los pre-existentes `static.mjs` y `protocol.mjs` **no se tocan**.
- **Fuera de alcance (explícito)**: la muerte del bot (`announceKill`, que hoy no loguea y **no** gana un log nuevo), los otros `console.log`/`console.warn` del server, el cliente `index.html`, y cualquier **logger central** (sería scope creep; el helper mínimo alcanza).
