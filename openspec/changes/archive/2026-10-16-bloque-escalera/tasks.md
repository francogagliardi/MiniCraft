# Tasks

## 1. Servidor + constantes e inventario

- [x] 1.1 Ampliar rango a `v ≤ 64` en `server/server.js:112` y verificar con `cd server && npm test` que el relay de bloques sigue OK
- [x] 1.2 Definir IDs 39–58 (39–42 `STAIR_STONE_*`, 43–46 `STAIR_PLANKS_*`, 47–50 `STAIR_COBBLE_*`, 51–54 `STAIR_BRICK_*`, 55–58 `STAIR_SBRICK_*`) + 20 DEFS (`cube:1, stair:1, stairDir:0-3, stairBase:<BASE>`, `hard` del base 1.8/1/1.8/2/2, tiles reusados 3/8/16/9/29) y verificar que el cliente carga sin errores en consola
- [x] 1.3 Añadir las 5 escaleras a INVENTORY (30→35, una por material, sin tocar `DEFAULT_HOTBAR`) con nombre e icono y verificar que aparecen elegibles al abrir el inventario

## 2. Render en L generalizado

- [x] 2.1 Implementar quads de escalera por flag `stair` + `stairDir` en `buildGlobals()` (un solo mesh acumulado con `DEFS[b].tiles`, patrón slab; NO 20 ramas) con culling contra opacos y verificar visualmente las 20 variantes (5 materiales × 4 orientaciones) + cara oculta junto a bloque opaco
- [x] 2.2 Espejar las 20 constantes en `server/test/static.mjs` y verificar con `node test/static.mjs` que tiles/UV/durezas pasan

## 3. Colisión escalonada + auto-step

- [x] 3.1 Extender `collidesAt()` con bypass del escalón por flag `stair` según `stairDir` y verificar: parado sobre parte alta sin hundirse ni trabarse (spot-check por material)
- [x] 3.2 Generalizar `slabBlocked()` a escaleras atacadas desde el frente (flags `slab`/`stair`) y verificar: subir caminando sin saltar con pies en suelo y lugar arriba en las 4 orientaciones; el lado trasero alto bloquea
- [x] 3.3 Verificar bajar caminando sin daño por caída + regresión: losas (4 materiales) y puertas siguen con auto-step/colisión intactos

## 4. Colocación orientada + sync

- [x] 4.1 Implementar orientación por eje dominante de `lookDir()` en `doPlace()` por grupo de material (frente hacia el jugador) y verificar las 20 combinaciones (5 materiales × 4 direcciones) + rechazo en celda ocupada (sin apilado)
- [x] 4.2 Verificar rotura con esfuerzo del material base (1/1.8/1.8/2/2, sin drop) igual que cada bloque base
- [x] 4.3 Añadir casos relay 39–58 en `server/test/protocol.mjs` y verificar con `cd server && npm test` que dos clientes ven el mismo material y orientación sin recargar

## 5. Integración final

- [x] 5.1 Verificar `cd server && npm test` completo en verde, regresión de inventario/sync existente, y anuncio de deploy (servidor primero) con nota de degradación segura en clientes viejos
