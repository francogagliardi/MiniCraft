# Proposal

## Why

La losa de piedra (change `medio-bloque`, completo y probado visualmente OK, aún no archivado) demostró el patrón de medio bloque, pero los jugadores construyen escalones con varios materiales: limitarse a piedra obliga a mezclar texturas y rompe la coherencia visual de construcciones de madera, roca, ladrillo o piedra tallada.

## What Changes

- 4 losas nuevas de materiales YA existentes, con el mismo comportamiento que la losa de piedra (0.5 mitad inferior, auto-step caminando, apilado→bloque base, inventario+sync, rotura con dureza del material):
  - `SLAB_PLANKS=35` (losa de tablones, base `PLANKS`, tile reusado 8, `hard:1`).
  - `SLAB_COBBLE=36` (losa de roca, base `COBBLE`, tile reusado 16, `hard:1.8`).
  - `SLAB_BRICK=37` (losa de ladrillos, base `BRICK`, tile reusado 9, `hard:2`).
  - `SLAB_SBRICK=38` (losa de piedra tallada, base `SBRICK`, tile reusado 29, `hard:2`).
- Generalización del código slab actual (hoy hardcodeado a `SLAB_STONE`):
  - Render: rama en `buildGlobals` por flag `DEFS[b].slab` en vez de por ID (`b===SLAB_STONE`); un solo `slabMesh` acumulado con el tile de cada losa (`DEFS[b].tiles`).
  - Colisión: `collidesAt` y `slabBlocked` por flag `slab` en vez de por ID (el resto de la lógica 0.5 + auto-step ya es genérica).
  - Apilado en `doPlace`: por mapa `slabBase` (losa→bloque base) en vez de hardcode `STONE`; regla: solo apila el MISMO material (losa X sobre losa X → bloque base X); materiales distintos se rechazan.
- `DEFS` de cada losa: `{cube:1, slab:1, slabBase:<BASE>, hard:<del material base>, tiles:{top:<t>,side:<t>,bottom:<t>}}` sin `opaque`; agregadas a `INVENTORY` (sin tocar `DEFAULT_HOTBAR`).
- Cero tiles nuevos: cada losa REUSA el tile de su material base (ver design, decisión 2). Cero cambios de servidor/protocolo (35-38 ≤ 40, ver design, decisión 5).
- **Fuera de alcance**: escaleras, losas verticales, mitad superior/orientación, mezclar materiales distintos en el apilado, drops, highlight de medio bloque (limitación heredada de `medio-bloque`).

## Capabilities

### New Capabilities

- `blocks/slab`: extiende la losa de piedra a 4 materiales (tablones, roca, ladrillos, piedra tallada) con render/colisión/apilado generalizados por flag `slab` + mapa `slabBase`, y regla de apilado solo-mismo-material. (Nota: el spec base `blocks/slab` aún no existe en `openspec/specs/` porque `medio-bloque` no está archivado; este delta usa el mismo capability-path y se fusiona después — ver Impact/dependencia.)

### Modified Capabilities

Ninguna (no cambian REQUIREMENTS de specs existentes en `openspec/specs/`).

## Impact

- **Dependencia con `medio-bloque` (decisión documentada, sin archivar nada aquí)**: este change es follow-up y lo EXTIENDE. Orden sugerido: (1) archivar `medio-bloque` primero (ya está `complete` 4/4 y probado visualmente OK por el usuario) para que `openspec/specs/blocks/slab/spec.md` exista como base; (2) luego aplicar `losas-materiales`. Alternativa descartada: aplicar encima sin archivar — funciona en código pero deja dos deltas `blocks/slab` sin base común y riesgo de divergencia en el archive. NO se archiva nada en este workflow (solo se documenta).
- `index.html`: 4 consts + 4 `DEFS` (+`slabBase`) + 4 entradas `INVENTORY`, generalizar 4 ramas (`buildGlobals`, `collidesAt`, `slabBlocked`, `doPlace`) de ID a flag/mapa.
- `server/server.js`: SIN cambios (IDs 35-38 dentro del rango `v<=40` ya validado; ver design decisión 5).
- `server/test/static.mjs`: espejo — agregar las 4 consts por paridad; el chequeo de tiles/durezas es dinámico y pasa solo (tiles reusados ya dibujados, `hard` numérico presente).
- Inventario crece +4 (26→30 entradas); 1 draw call global extra ya existente (`slabMesh`, ahora acumulado); IDs 39-40 quedan libres como reserva.
