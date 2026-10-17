# Proposal

## Why

Hoy Minicraft vive en un mediodía eterno: `scene.background`, la niebla, la `HemisphereLight` y el sol están fijos en valores de día y nunca cambian (index.html ~656-675). No existe noción de hora, así que no hay noche ni ninguna señal temporal. Se quiere un ciclo de día y noche de **8 minutos** (5 de día + 3 de noche) con noche tenue (no negra) y transiciones suaves, y —decisión de producto— debe ser **server-authoritative**: todos los jugadores ven la misma hora, porque el futuro zombie server-auth necesita spawnear de noche de forma consistente. Por eso el reloj lo lleva el server y el cliente solo lo renderiza.

## What Changes

- El **server** pasa a ser dueño del reloj del ciclo: ancla `t0` al boot y mantiene la fase `v ∈ [0,1)` del ciclo de 8 min (sin persistirla en `world.json`). Expone la hora en `welcome` (`tod` + `cyc`) y la difunde periódicamente con un mensaje nuevo `{ t:'tod', v }` (~cada 4 s).
- El **cliente** deja de asumir día fijo: recibe `tod`/`cyc`, avanza su fase localmente desde el momento de recepción y **corrige suavemente** contra cada difusión (con snap ante desfases grandes, p. ej. reconexión). Sin servidor (modo solo) corre un ciclo local equivalente.
- Se introduce la iluminación y el cielo dinámicos: `scene.background`, `scene.fog.color`, la `HemisphereLight` y el `DirectionalLight` (sol), los uniforms del shader del cielo y la visibilidad del `sunSprite` se interpolan entre los valores de día y de noche.
- **Astros móviles**: el `sunSprite` recorre un arco durante el día (este → cenit → oeste), la luz direccional del sol lo sigue (para sombras) y el sol se oculta de noche (intensidad 0, sin sombras); se agrega una **luna** (sprite claro) visible solo de noche recorriendo su arco en el mismo sentido que el sol (este → cenit → oeste), con una luz de luna direccional tenue y sin sombras. El movimiento es continuo (se recalcula cada frame) mientras la paleta se aplica por tramos.
- **Noche más clara**: intensidad mínima de luz **~50 %** (`NIGHT_MIN = 0.50`), cielo **azul profundo** (no negro). Amanecer/atardecer graduales de ~**25 s** cada uno.
- **Composición con el agua (no pelea)**: el estado "bajo el agua" (azul oscuro, `fog.near/far` cortos) sigue mandando cuando el jugador está sumergido; fuera del agua aplica el fondo/niebla del día/noche. `tickWater()` deja de pisar valores de día hardcodeados y pasa a componer con un único punto de aplicación de la atmósfera.
- Se expone una señal derivada **`isNight`** (server y cliente) para que el futuro zombie server-auth spawnée solo de noche.

## Capabilities

### New Capabilities

- `world/daynight`: ciclo de día y noche server-authoritative — reloj del server y difusión de la hora, interpolación del cliente tolerante a latencia/reconexión, iluminación y cielo dinámicos con noche al 50 % y transiciones suaves, sol y luna móviles (arco diurno/nocturno y ocultado por fase), modo solo sin servidor, composición con el estado bajo el agua y señal derivada `isNight`.

### Modified Capabilities

<!-- Ninguna: se agrega una capability nueva. `net/presence` (heartbeat/leave) y `world/water` no cambian de comportamiento; el mensaje `tod` es aditivo y el agua conserva su regla. -->

## Impact

- **`index.html`**: setup de escena (~656-690, guardar referencia `skyMat` del shader del cielo, sprites `sunSprite`/`moonSprite` y `moonLight`), nuevo estado/constantes del ciclo, arco del cielo (`skyArc`/`dayProg`/`nightProg`/`tickSky`), función única de aplicación de atmósfera, `loop()` (~2545) y `tickWater()` (~2508), y el handler de red (`connectMP` welcome ~2219 y `setupNetHandlers` ~2229) para `tod`/`cyc`.
- **`server/server.js`**: constantes del ciclo (incluida `NIGHT_MIN = 0.50`) y helper `isNight`; `t0` al boot; campos `tod`/`cyc` en `welcome` (~128-133); `setInterval` de difusión de `tod` (junto al heartbeat, ~92-107).
- **`server/test/protocol.mjs`**: extender la suite — `welcome` trae `tod` en rango y `cyc`; llega `tod` periódico; `tod` NO se persiste en `world.json`.
- **`server/test/static.mjs`**: sección 8 cubre constantes compartidas, `light()`/`isNight()`/`applyAtmosphere()`/agua/`onTod` y el nuevo bloque del sol/luna móviles (`skyArc`/`tickSky`).
- **No afectado**: `world.json`, lógica de mundo/edits, persistencia; la spec `world/water`; el resto del protocolo.
- **Deploy**: el change toca el server → el push a `main` dispara CI + deploy Easypanel. Riesgo MEDIO: es la primera vez que el server lleva estado temporal (reloj) y que el cliente deja de asumir día fijo.
