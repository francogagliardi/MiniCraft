# Design

## Context

Ver `proposal.md` (Why). Estado actual verificado en el código:

- IDs 0-33 ocupados (`TORCH=33` último), `SWORD=100` es item; **34 libre**. Servidor valida `v<=40` y rechaza bedrock (`server.js:112-113`): 34 pasa sin tocar el servidor.
- Tiles 0-32 dibujados, atlas 8x5 (40 slots): **tile 33 libre**.
- `buildChunk` (807-825) solo dibuja `cube+opaque`; `buildGlobals` ya tiene ramas propias por bloque (`GLOW` → mesh propio, `TORCH` → cross-quad): precedente para una rama slab.
- `GeoBuilder.quad` acepta vértices arbitrarios: sirve para caras de 0.5.
- Colisión binaria por bloque: `isSolid`/`solidAt` (713-720), `collidesAt` (1136-1142), `movePlayer` (1144-1150). Salto: `vel.y=8.8`, gravedad 26 → altura ~1.5.
- `raycast` (1245-1261) impacta `cube||flower||glow||door`: con `cube:1` la losa es apuntable sin cambios.
- `doPlace` (1555-1604) rechaza celdas ocupadas salvo flores: necesita excepción de apilado.
- `static.mjs` espeja consts de IDs y exige todo tile referenciado dibujado + `hard` numérico si `cube/flower/glow`.

## Goals / Non-Goals

**Goals:** una losa de piedra (mitad inferior) con render, colisión 0.5 + auto-step, apilado, inventario y sync; cero cambios de servidor/protocolo.

**Non-Goals:** mitad superior/orientación, otros materiales, escaleras, highlight de medio bloque, drops.

## Decisions

1. **Material: piedra, uno solo.** Piedra es el material más usado para escalones; textura `flat` trivial (speckle gris como tile 3 con leve variación); dureza coherente (`hard:1.8` = misma que `STONE`); sin tiles direccionales. Alternativa (tablones) descartada: igual costo pero menos uso estructural.
2. **ID `SLAB_STONE=34`, tile 33.** Siguientes libres verificados; nombres con sufijo de material dejan lugar a futuras losas. Alternativa (`SLAB=34` genérico) descartada: ambigua cuando haya más materiales.
3. **`DEFS`: `{cube:1, slab:1, hard:1.8, tiles:{top:33,side:33,bottom:33}}`, sin `opaque`.** `cube:1` reutiliza gratis: hit de raycast, `isSolid` base (pararse/caer) y exigencia de `hard` del espejo. Sin `opaque`: no ocluye vecinos (acepta sobre-render menor) y `buildChunk` la ignora → va a rama propia. Alternativa (flag sin `cube`) descartada: obligaría a tocar `raycast`, `isSolid` y el espejo.
4. **Render: rama `SLAB_STONE` en `buildGlobals` → `slabMesh` con material del atlas (reusar `matOpaque`, coherencia de luz).** Caras laterales con vértices `y 0→0.5`, tapa en `y+0.5`, cara inferior incluida; omisión de caras contra vecinos opacos igual que cubos. Alternativa (meterla en `buildChunk`) descartada: ese loop asume cubos 1x1x1 y `opaque`.
5. **Colisión 0.5 en dos piezas mínimas:**
   - `collidesAt` slab-aware: al testear una celda con losa, la ignora si los pies (`py`) están a la altura o por encima de la tapa (`py >= y+0.5`). Sin esto, parado sobre la losa `floor(py)` cae en su propia celda sólida y el jugador queda trabado. Los mobs heredan el mismo `collidesAt` (suben saltando: su salto ~0.68 > 0.5).
   - Auto-step de 0.5 en `movePlayer` (ejes x/z): si el movimiento horizontal falla con `onGround`, reintenta con pies en `py+0.5` solo cuando el bloqueo en la banda `[py, py+0.5)` proviene de losas (nunca de cubos completos) y hay lugar arriba. Elegido sobre "solo salto": caminar es el comportamiento esperado de un escalón; el salto normal sigue funcionando como alternativa sin código extra.
6. **Apilado en `doPlace`, antes del rechazo por celda ocupada:** si `cur===SLAB_STONE` e item losa → `editBlock(x,y,z,STONE)` + `sfxPlace` + return. Conversión a `STONE` (no a un "doble slab"): la celda llena es indistinguible de piedra y simplifica mesh/colisión/sync. Romperla luego da aire (sin revertir a losa), igual que picar piedra.
7. **Espejo `static.mjs`:** agregar `SLAB_STONE=34` a las consts (línea 39) por paridad; dibujar tile 33 con `tile(33,…)` para pasar el chequeo `drawn`. Sin esto el test falla igual que rompió el change anterior.

## Risks / Trade-offs

- [Vecinos no ocluidos por la losa dibujan caras internas] → sobre-render menor aceptado; la losa sí omite sus caras contra opacos.
- [Highlight 1x1x1 sobre medio cubo] → limitación visual aceptada; el raycast devuelve la celda correcta.
- [Chequeo "Ahí estás vos" de `doPlace` conservador para losas] → se mantiene (puede rechazar alguna colocación válida al borde del cuerpo); aceptado por simplicidad.
- [Auto-step solo con pies en suelo] → saltando contra una losa lateralmente se comporta como cubo (frena); aceptado, el salto la supera por arriba.
- [Mobs no hacen auto-step] → quedan frenados por losas salvo salto aleatorio; aceptado (defensivo para corrales).

## Migration Plan

Sin migración: bloque nuevo, mundo existente intacto (celdas 34 no existen aún). Rollback = revertir `index.html` (+ espejo); celdas 34 residuales en saves serían `DEFS` desconocido (no sólido, no render) hasta re-aplicar.

## Open Questions

Ninguna que cambie specs, enfoque o tasks.
