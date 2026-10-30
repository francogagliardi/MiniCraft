# Tasks

## 1. RED: tests del tope por frame, buffer y pointer lock

- [x] 1.1 En `server/test/lookguard.mjs`, ampliar la API extraída del bloque `look` (`LOOK_MAX_RAD_PER_FRAME`, `clampLookStep`, buffer y su reset, `LOOK_BIG_PX`, `noteLookBig`, `LOOK_LOCK_SKIP_EVENTS`) y agregar los casos puros: delta chico pasa entero; delta grande queda con cada eje ≤ tope; proporción entre ejes conservada; signos correctos; `usedX/usedY` coinciden con lo aplicado. Verificar con `cd server && node test/lookguard.mjs` que falla por API/bloque ausente (no por sintaxis del test).
- [x] 1.2 En `server/test/lookguard.mjs`, agregar los casos puros del buffer y del re-lock: encolar 900 px y drenar frame a frame nunca supera `LOOK_MAX_RAD_PER_FRAME`, la suma de `used` iguala lo encolado y termina vacío; un frame sin drenar conserva lo pendiente; el reset al perder el lock deja el buffer en cero; `LOOK_LOCK_SKIP_EVENTS >= 2` y los dos primeros eventos se ignoran mientras el tercero se procesa. Verificar que fallan contra el `index.html` actual.
- [x] 1.3 En `server/test/lookguard.mjs`, agregar los estáticos: `mousemove` ya no escribe `player.yaw` sino que encola; el loop drena antes de la actualización de cámara (`physicsGravity`/`camera.rotation`); `tryLock` pide `unadjustedMovement` y tiene fallback sin opciones; `pointerlockchange` resetea el buffer; `noteLookBig` se invoca al aceptar un delta grande; la suite sigue en 21 archivos. Actualizar las aserciones existentes que exigen `player.yaw -=` y exactamente 2 escrituras de yaw. Verificar que fallan.
- [x] 1.4 En `server/test/config.mjs`, actualizar el estático que exige `player.yaw-=mx*MOUSE_SENSITIVITY` dentro de `mousemove` para que verifique que la sensibilidad se usa al drenar el buffer (y que el slider sigue afectando al mouse). Verificar que falla con el HTML actual.

## 2. GREEN: bloque look y cableado en index.html

- [x] 2.1 En el bloque `/* look:start */ … /* look:end */` de `index.html`, agregar `LOOK_MAX_RAD_PER_FRAME = 0.30`, `LOOK_BIG_PX = 150`, `LOOK_LOCK_SKIP_EVENTS = 2`, el buffer de píxeles, la función pura `clampLookStep(dxPx, dyPx, sens, maxRad)` y el drenaje por frame, más `noteLookBig(dx,dy)`. Mantener el bloque autocontenido (sin `player`, `document`, `THREE`). Verificar que los casos puros de 1.1 y 1.2 pasan.
- [x] 2.2 Cambiar `mousemove` para que valide y encole en lugar de escribir `player.yaw/pitch`, y en `loop()` drenar el giro pendiente antes de `physicsGravity(dt)`, sólo en `play` y sin `dead`; limpiar el buffer al salir de `play`. Verificar que los estáticos de 1.3 sobre handler y loop pasan y que `node test/config.mjs` pasa.
- [x] 2.3 Cambiar `tryLock()` para pedir `requestPointerLock({unadjustedMovement:true})` con fallback al pedido clásico ante rechazo, excepción o promesa rechazada (un solo reintento), y en `pointerlockchange` resetear el buffer y armar el contador de `LOOK_LOCK_SKIP_EVENTS`. Verificar que los estáticos de 1.3 sobre lock pasan.
- [x] 2.4 Verificar manualmente en el navegador local (`cd server && node server.js`): un flick rápido sigue girando con fluidez, un arrastre lento responde sin retardo perceptible, entrar y salir de pausa/chat no deja giro pendiente, y la consola no se inunda con avisos de mirada.

## 3. Cierre de la suite e integración

- [x] 3.1 Correr `cd server && npm test` y verificar **21/21** archivos verdes.
- [x] 3.2 Verificar que no se agregaron ni quitaron archivos de test (`server/package.json` sigue enumerando 21) y que no quedan referencias a conteos viejos.
- [x] 3.3 Confirmar que el cambio sólo toca `index.html`, `server/test/lookguard.mjs`, `server/test/config.mjs` y este change: `git status --short` no muestra cambios en `server/server.js`, `server/zombie.js`, `bot/`, `docker-compose.yml` ni `AGENTS.md`.

## Workflow follow-up

- Levantar `docker compose up --build -d minicraft` y pedir aprobación explícita del usuario en http://localhost:3000. Probar: mover el mouse rápido en 1ª y 3ª persona y confirmar que la cámara ya no salta; mirar la consola y confirmar que no hay avisos de mirada salvo deltas realmente grandes.
- Al aprobar: `docker compose down`, commit en español (`fix(look):`), push a `main` y `openspec archive mirada-sin-saltos`.
