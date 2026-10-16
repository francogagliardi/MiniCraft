# Tasks

## 1. Bloque losa en cliente (DEFS, textura, inventario, espejo)

- [x] 1.1 Definir `SLAB_STONE=34` con `DEFS` (`cube:1`, `slab:1`, `hard:1.8`, `tiles:{top:33,side:33,bottom:33}`, nombre `'Losa de piedra 🧱'` e icono css) y agregarlo a `INVENTORY` (sin tocar `DEFAULT_HOTBAR`); dibujar el tile 33 (variante piedra) y agregar `SLAB_STONE=34` al espejo de `server/test/static.mjs`; verificar con `cd server && npm test` en verde y la losa visible como elegible en el inventario.

## 2. Render de medio cubo

- [x] 2.1 Agregar la rama `SLAB_STONE` en `buildGlobals` (medio cubo: laterales `y 0→0.5`, tapa en `y+0.5`, cara inferior, omisión contra vecinos opacos) a `slabMesh` propio con material del atlas; verificar colocando una losa y viéndola como mitad inferior de piedra desde todos los lados, con `cd server && npm test` en verde.

## 3. Colisión 0.5 + apilado + sync

- [x] 3.1 Hacer `collidesAt` slab-aware (ignorar celda losa si `py >= tapa`) + auto-step de 0.5 en `movePlayer` (ejes x/z, con pies en suelo, solo ante losas y con lugar arriba); verificar caminando contra una losa (sube sin saltar), parado sobre la tapa (se mueve libre), contra un cubo completo (frena), y saltando sobre la losa (aterriza arriba).
- [x] 3.2 Agregar la excepción de apilado en `doPlace` (losa sobre losa → `STONE` completo; losa sobre cubo se rechaza) y comprobar sync colocando, apilando y rompiendo losas con dos clientes conectados sin recargar, con caída de 0.5 sin daño y `cd server && npm test` en verde.
