# Proposal

## Why

El bot cazador se traba contra el terreno y las construcciones: su movimiento resuelve colisión con el mundo (`tryMove`, `resolveGround` sobre `world.blocked`/`topSolidY`), así que un jugador refugiado en una cueva, arriba de una torre o dentro de una construcción cerrada puede escapar del cazador simplemente quedándose quieto. Además, con `SPEED = 9.6` u/s (el doble del jugador) el bot tarda en cerrar distancias largas y deja margen para reaccionar. El objetivo es que el cazador **siempre** alcance a cualquier jugador, sin importar dónde se esconda.

## What Changes

- **Vuelo libre sin colisión (siempre activo)**: el bot deja de colisionar con bloques, tanto en horizontal como en vertical. Atraviesa paredes, techos y terrenos; no hay gravedad, auto-escalón ni "resolución de suelo" que lo baje. El cuerpo de 2 bloques sigue existiendo sólo como convención visual: el movimiento es un punto libre en 3D.
- **Alineación vertical con el objetivo**: la altura `y` del bot converge a la altura de su objetivo (presa, admin de SIGUEME o spawn) más un offset seguro, con una banda muerta para no vibrar. La persecución deja de ser 2D: apunta a `(x, y, z)` del objetivo.
- **Velocidad 28.8 u/s**: `SPEED` pasa de 9.6 a 28.8 (3× la actual, 6× la caminata de 4.8 del jugador). El paso se sigue integrando por `dt` real del tick.
- **Sin cambios de comportamiento en el resto del contrato**: estados CAZA/ESPERA/SIGUEME y su precedencia, selección de presa no-admin viva, golpe mortal en dos toques con `dmg: 6` separados ≥0.65 s, alcance horizontal duro ≤4.6, invulnerabilidad, keepalive `mv`, anuncios por chat, cero `edit` y reconexión con backoff quedan idénticos.
- **Sin protocolo nuevo y sin cambios de server/cliente**: el server ya acepta y relayea `mv` sin validar movimiento (`server/server.js:359-368`) y el cliente remoto ya aplica `p[1]` como altura del avatar (`index.html:2992-2993`). El vuelo/no-clip es un cambio exclusivo del cliente bot.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `bots/hunter`: cambia el requisito de velocidad (de "Velocidad doble que un jugador" a "Velocidad triple de la actual, seis veces la de un jugador") y se agrega el requisito de vuelo libre sin colisión con alineación vertical al objetivo.

## Impact

- **`bot/cazador.js`** (único archivo de producción afectado): `SPEED` 9.6 → 28.8; `tryMove` deja de consultar `world.blocked`/`topSolidY` y mueve los tres ejes; `resolveGround` desaparece o queda inerte; `moveToward` pasa a mover en 3D hacia la altura del objetivo; nueva utilidad de alineación vertical (offset seguro + banda muerta); `clampToWorld` se conserva para los límites horizontales del mundo y suma un clamp vertical; `tick` alinea altura en CAZA, SIGUEME y retorno al spawn (ESPERA sigue congelada en las tres coordenadas). Se revisan las constantes exportadas.
- **`bot/index.js`**: sin cambios. Sigue reconstruyendo el mundo porque lo necesita para `findSpawn()` y los límites `W`/`H`; sólo deja de usarse para colisión.
- **`server/server.js`, `server/zombie.js`, `index.html`**: sin cambios.
- **Tests**: `server/test/bot-cazador.mjs` actualiza el criterio (f) de velocidad a 28.8 y suma casos de no-clip (pared/`blocked` total), vuelo vertical (torre y cueva) y ausencia de gravedad/snap al suelo. No se agregan archivos de test nuevos, así que `server/package.json` y los conteos de `zombie-protocol.mjs`/`lookguard.mjs` no cambian.
- **Documentación**: `README.md` actualiza la descripción del bot (vuela, atraviesa bloques, 28.8 u/s).
- **Fuera de alcance**: anti-cheat y validación server-side de movimiento (el server hoy confía en `mv`), cambios al cliente humano, y cualquier rediseño de combate/alcance.
