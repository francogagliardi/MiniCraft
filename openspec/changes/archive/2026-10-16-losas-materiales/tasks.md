# Tasks

## 1. Bloques losa en cliente (consts, DEFS, inventario, espejo)

- [x] 1.1 Definir `SLAB_PLANKS=35, SLAB_COBBLE=36, SLAB_BRICK=37, SLAB_SBRICK=38` con `DEFS` (`cube:1, slab:1, slabBase:<BASE>`, `hard` del material base 1/1.8/2/2, `tiles` reusados top/side/bottom 8/16/9/29, nombre e icono css) + retrofit `slabBase:STONE` en `SLAB_STONE`, agregar las 4 a `INVENTORY` (sin tocar `DEFAULT_HOTBAR`) y las 4 consts al espejo de `server/test/static.mjs`; verificar con `cd server && npm test` en verde y las 4 losas visibles como elegibles en el inventario.

## 2. Generalización de render, colisión y apilado

- [x] 2.1 Generalizar `buildGlobals` (rama por `DEFS[b].slab` con `DEFS[b].tiles`, un solo `slabMesh` acumulado), `collidesAt` + `slabBlocked` (por flag `slab`) y `doPlace` (apilado `id===cur` → `editBlock(DEFS[cur].slabBase)`); verificar colocando cada losa (mitad inferior con textura del base desde todos lados, caras ocultas contra opacos omitidas), caminando contra cada una (auto-step 0.5), parado sobre cada tapa (movimiento libre), contra cubo completo (frena), y `cd server && npm test` en verde.

## 3. Apilado mismo-material, mixto y sync multijugador

- [x] 3.1 Verificar apilado mismo-material de las 5 losas (losa X + losa X → bloque base X), rechazo de apilado mixto (piedra+madera conserva la original) y de losa sobre cubo, más sync colocando/apilando/rompiendo cada losa con dos clientes conectados sin recargar, con rotura al tiempo del material base, caída de 0.5 sin daño y `cd server && npm test` en verde.
