# Proposal

## Why

Las losas (`blocks/slab`) permiten escalones de 0.5 pero no rampas transitables en horizontal: subir un desnivel de 1 bloque caminando exige saltar. Las escaleras con forma en L y 4 orientaciones cierran ese hueco y son el bloque de construcción 7/10 que sigue en la progresión natural (losas → escaleras → resto de materiales).

## What Changes

- 20 bloques escalera: LAS MISMAS 5 VERSIONES QUE LAS LOSAS (piedra, tablones, roca, ladrillos, piedra tallada) × 4 orientaciones (frente bajo hacia +X, −X, +Z, −Z): mitad inferior completa (0–0.5) + mitad superior trasera (0.5–1.0).
- IDs 39–58 (5 materiales × 4 dirs): 39–42 `STAIR_STONE_*`, 43–46 `STAIR_PLANKS_*`, 47–50 `STAIR_COBBLE_*`, 51–54 `STAIR_BRICK_*`, 55–58 `STAIR_SBRICK_*`; sufijo de dirección N/S/E/O (o 0–3).
- Cada escalera reusa los tiles de su material base (patrón losas-materiales, cero tiles nuevos de atlas): piedra→3, tablones→8, roca→16, ladrillos→9, tallada→29. Dureza = la del material base (1.8 / 1 / 1.8 / 2 / 2).
- Colocación orientada según `lookDir()` del jugador dentro del grupo del material sostenido (precedente: puertas).
- Colisión escalonada + auto-step de 0.5 al subir desde el frente, y caminata normal sobre la parte alta (generalizado por flag, como las losas).
- 5 entradas en INVENTORY (30→35, una por material; sin tocar `DEFAULT_HOTBAR`), cada una con icono, sincronizadas por el protocolo `edits` existente.
- **BREAKING (mínimo, justificado)**: ampliación del rango válido del servidor de `v ≤ 40` a `v ≤ 64` en `server/server.js` (1 línea, `server.js:112`) para alojar los IDs 39–58. 58≤64 OK; quedan libres 59–64. Sin migración: el formato `edits` (idx→val) no cambia y el mundo VPS sigue cargando.
- Fuera de alcance: barandillas, esquinas interiores/exteriores, losas verticales, rotación post-colocación.

## Capabilities

### New Capabilities

- `blocks/stair`: escaleras orientables en 5 materiales con render en L, colisión escalonada, auto-step, colocación orientada e inventario + sync.

### Modified Capabilities

Ninguna: no cambian requirements de `blocks/slab` ni `blocks/torch`.

## Impact

- `index.html`: 20 IDs 39–58 + 20 DEFS (`cube:1, stair:1, stairDir, stairBase`, tiles reusados del base, `hard` del base), render generalizado por flag en `buildGlobals()`, colisión (`collidesAt`, `slabBlocked`→ generalizado, `isSolid`), colocación en `doPlace()` con `lookDir()` por grupo de material, `raycast()` ya cubre `cube`, INVENTORY 30→35.
- `server/server.js` línea 112: `v > 40` → `v > 64` (único cambio servidor).
- `server/test/static.mjs` y `server/test/protocol.mjs`: espejo de los 20 IDs y relay 39–58.
- Mundo VPS: compatible sin migración (valores nuevos solo aparecen si alguien los coloca; clientes viejos los ignoran en render y los tratan como no sólidos).
