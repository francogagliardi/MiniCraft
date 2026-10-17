# Proposal

## Why

La vista de los avatares remotos "salta" de posición cuando hay lag. `tickAvatar` (index.html:1689) hace `lerp(target, dt*10)` sin umbral, así que ráfagas de mensajes `pm` atrasados generan teletransportes suaves de golpe; no hay dead-reckoning ni buffer, no hay interpolación de yaw estable y no hay buffer de pm. Además, un `pedit` remoto puede dejar al jugador local dentro de un bloque recién colocado (colisión que empuja al jugador hacia adentro en vez de sacarlo hacia afuera).

## What Changes

- En `tickAvatar`: si la distancia a `target` supera 6 unidades, hacer snap directo (teleport) en vez de lerpear; si no, lerpear normalmente. Evita que ráfagas atrasadas generen desplazamientos largos suaves.
- Interpolar el yaw del avatar remoto suavemente hacia el yaw reportado en `pm`, en vez de girar bruscamente al delta crudo.
- Opcional: buffer de 100ms en los mensajes `pm` para ordenar y suavizar ráfagas antes de aplicar a `target`.
- Verificar que ningún `pedit` remoto desplace al jugador local: si una edición remota deja al jugador local dentro de un bloque, resolver la colisión sacándolo fuera en vez de dejarlo dentro.
- Registrar en el spec que esto es una mitigación, no una eliminación completa del lag: con lag real no se puede solucionar del todo.

## Capabilities

### New Capabilities

- `net/avatar`: interpolación y suavizado de avatares remotos recibidos por la red (`pm`): umbral de teleport (dist > 6 → snap directo), lerp acotado, interpolación de yaw, buffer opcional de 100ms en `pm` y protección contra que un `pedit` remoto deje al jugador local dentro de un bloque. Declara explícitamente que es mitigación, no eliminación del lag.

### Modified Capabilities

- Ninguna: ningún spec existente cubre el suavizado de avatares remotos ni la protección contra desplazamiento por `pedit`.

## Impact

- Solo `index.html` (`tickAvatar`, handlers de `pm` y `pedit`). Sin cambios en `server/server.js`, sin cambios de protocolo (`pm` y `pedit` mantienen su forma), sin migraciones.
- Comportamiento visible: los avatares remotos se mueven más suaves con lag, sin "saltos"; el jugador local no queda atrapado dentro de bloques colocados por remotos.
- Gobernanza MEDIUM: toca la experiencia multijugador del cliente; requiere verificación manual en cliente (avatares con lag, colocar junto al jugador local). `cd server && npm test` debe seguir verde porque el servidor no se toca.
