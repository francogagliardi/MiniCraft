# Proposal

## Why

Los jugadores solo pueden construir con cubos de 1 bloque de alto: no hay forma de hacer escalones, bordes o detalles de medio bloque sin saltar. Una losa de 0.5 de alto del material más común (piedra) cubre esa necesidad con el cambio más pequeño posible.

## What Changes

- Nuevo bloque `SLAB_STONE=34` (losa de piedra, mitad inferior, 0.5 de alto), un solo material.
- Geometría de medio cubo: caras laterales de 0.5 + tapa superior en `y+0.5` + cara inferior; rama propia en `buildGlobals` (precedente: `GLOW`), mesh con material Lambert del atlas.
- Textura tile 33 (atlas 8x5, siguiente libre verificado; slots 0-32 ocupados): variante de piedra.
- `DEFS`: `cube:1` (blanco de raycast + base de `isSolid`), `slab:1`, sin `opaque` (no ocluye vecinos), `hard:1.8` (igual que piedra).
- Colisión 0.5 real: `collidesAt` ignora la celda slab cuando los pies están a la altura o por encima de su tapa (si no, el jugador quedaría trabado parado sobre la losa) + auto-step de 0.5 en `movePlayer` (ejes x/z, solo con pies en suelo y bloqueo proveniente de slabs). El salto normal también la supera (altura de salto ~1.5 > 0.5).
- Apilado: colocar losa sobre losa (`cur===SLAB_STONE` + item losa) → reemplaza la celda por `STONE` (cubo completo).
- Agregado a `INVENTORY` (sin cambio a `DEFAULT_HOTBAR`); sync multijugador por protocolo `edit` existente, sin cambios de protocolo ni de servidor (34 ≤ 40, no es bedrock).
- Física de caída/daño sin cambios. Rotura por tiempo como la piedra, sin drop (igual que el resto de bloques).
- **Fuera de alcance**: escaleras (change separado), losas de otros materiales, orientación superior/inferior o rotación (siempre mitad inferior), resaltado de medio bloque (el highlight sigue siendo 1x1x1, limitación aceptada).

## Capabilities

### New Capabilities

- `blocks/slab`: comportamiento de la losa de piedra (render de medio cubo, colisión 0.5 + auto-step, apilado a cubo completo, inventario, sync).

### Modified Capabilities

Ninguna (no cambian REQUIREMENTS de specs existentes).

## Impact

- `index.html`: constantes (`SLAB_STONE`), `DEFS`, `INVENTORY`, dibujo del tile 33, rama slab en `buildGlobals`, `collidesAt` slab-aware, auto-step en `movePlayer`, excepción de apilado en `doPlace`.
- `server/server.js`: sin cambios (valida `v<=40`; 34 ya pasa; no es bedrock).
- `server/test/static.mjs`: ajuste mínimo del espejo (agregar `SLAB_STONE=34` a las consts; el chequeo de tiles es dinámico pero exige que el tile 33 esté dibujado).
- Rendimiento: 1 draw call global extra (`slabMesh`), cero luces nuevas; vecinos no ocluidos por la losa dibujan sus caras (sobre-render menor, aceptado).
