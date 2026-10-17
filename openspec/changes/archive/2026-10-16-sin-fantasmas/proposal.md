# Proposal

## Why

Salir con la flecha atrás del navegador deja conexiones WebSocket medio-abiertas en el server: `server.js` solo limpia en `ws.on('close')` y nunca expira sesiones muertas, así los jugadores fantasma permanecen visibles largo rato para el resto.

## What Changes

- Cliente cierra el WebSocket de forma proactiva al salir de la página (`pagehide` / `beforeunload` → `NET?.close()`).
- Server implementa heartbeat WebSocket (ping cada 30s; `terminate()` si no hay pong).
- Server implementa timeout de inactividad: expira y limpia conexiones sin mensaje `mv` durante 90s (generoso para no patear conexiones lentas).
- Al expirar una conexión (heartbeat o idle), el server elimina al jugador y difunde `leave` como en un cierre normal.
- Tests: se extiende `server/test/protocol.mjs` con casos de expiración (conexión muerta expira, conexión viva no).

## Capabilities

### New Capabilities

- `net/presence`: presencia y limpieza de sesiones multijugador — cierre proactivo del cliente, heartbeat ping/pong del server y expiración por inactividad con difusión de `leave`.

### Modified Capabilities

## Impact

- Afecta `server/server.js` (heartbeat + idle timeout + limpieza compartida con `close`).
- Afecta `index.html` (cierre proactivo en `pagehide`/`beforeunload`).
- Afecta `server/test/protocol.mjs` (nuevos casos de expiración).
- Gobernanza MEDIUM: toca server + deploy. Requiere tests verdes antes de aplicar.
