# Proposal

## Why

El mensaje actual del saludo entre jugadores (`💕 ${nombre} te saluda`) es genérico y no transmite el tono pícaro que se busca para la interacción social con clic derecho sobre otro avatar. Se quiere un texto más divertido y distintivo sin cambiar la mecánica.

## What Changes

- Cambiar el texto del toast en `greetRemote(a)` en `index.html` a `A {nombre} le gusta que lo toquen ahí` (manteniendo el emoji 💕 inicial).
- Mantener sin cambios el resto del comportamiento: burst de corazones, tono de sonido, alcance del raycast (`avatarHit`, 4.6 bloques) y disparo desde `onRightDown()`.
- Sin cambios en servidor (`server/server.js`), protocolo WebSocket ni persistencia del mundo.

## Capabilities

### New Capabilities

- `social/greet`: saludo entre jugadores con clic derecho (mensaje pícaro, efectos visuales y sonoros asociados).

### Modified Capabilities

- Ninguna (el proyecto aún no tiene specs en `openspec/specs/`).

## Impact

- Afecta solo a `index.html`, función `greetRemote(a)` (~línea 1612-1616).
- Sin impacto en `server/server.js`, `world.json`, tests (`cd server && npm test`) ni validación de bloques.
- Cambio puramente cosmético del lado cliente; sin riesgo de romper multijugador.
