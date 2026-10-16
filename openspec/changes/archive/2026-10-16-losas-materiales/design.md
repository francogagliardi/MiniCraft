# Design

## Context

Ver `proposal.md` (Why) y `specs/blocks/slab/spec.md` (requisitos). Estado del código verificado (change `medio-bloque` aplicado en working tree, aún no archivado):

- `index.html:416`: `TORCH=33, SLAB_STONE=34`; `SWORD=100` es item. IDs 35-40 libres.
- `index.html:437`: `SLAB_STONE` con `{cube:1, slab:1, hard:1.8, tiles:{top:33,side:33,bottom:33}}` (tile 33 dibujado en línea 581, `flat(33,…)`).
- Tiles dibujados: 0-33 todos (`tile(`/`flat(`/`flower(` en líneas 488-581). Libres: 34-39 (6 slots del atlas 8x5).
- 4 ramas hardcodeadas a `b===SLAB_STONE` / `cur===SLAB_STONE`: `buildGlobals` (875-892, mesh `S`→`slabMesh`), `collidesAt` (1162), `slabBlocked` (1177), `doPlace` (1602, apilado→`STONE`).
- Servidor `server/server.js:112-113`: valida `v<=40`, rechaza bedrock; 35-38 pasan sin tocarlo.

## Goals / Non-Goals

**Goals:** 4 losas (tablones, roca, ladrillos, piedra tallada) con textura del material base, dureza del material base, mismo comportamiento 0.5/auto-step/apilado/sync; generalizar las 4 ramas de ID a flag/mapa sin regresión de la losa de piedra.

**Non-Goals:** escaleras, losas verticales, mitad superior, apilado mixto (se rechaza por diseño), tiles nuevos, cambios de servidor.

## Decisions

1. **Lista: 4 losas (PLANKS, COBBLE, BRICK, SBRICK).** Son los materiales con más uso para escalones: tablones (construcción inicial y pisos), roca (estructural barato), ladrillos y piedra tallada (decorativo/pisos). Justificación por uso, no por estética arbitraria. Alternativas descartadas: 5ª/6ª losa (tronco, vidrio, lana…) — igual costo marginal pero menos uso como escalón; quedan como futuro en IDs 39-40 sin tocar el servidor.
2. **Tiles: REUSAR el del material base (8, 16, 9, 29), cero tiles nuevos.** Conviene porque: (a) preserva los 6 tiles libres 34-39 para futuros bloques; (b) coherencia visual automática — la losa ES su material; (c) cero dibujo nuevo y el espejo `static.mjs` pasa sin cambios estructurales (los tiles ya están dibujados y validados). Alternativa descartada (tiles nuevos 34-37 con variante "cortada"): gastaría 4/6 slots libres por una diferencia visual mínima a 0.5 de alto.
3. **IDs 35-38 (`SLAB_PLANKS=35, SLAB_COBBLE=36, SLAB_BRICK=37, SLAB_SBRICK=38`).** Siguientes libres en orden; nombres con sufijo de material (convención de `SLAB_STONE`). Quedan 39-40 libres. Durezas copiadas del base (`hard:1 / 1.8 / 2 / 2`) para que picar la losa cueste lo mismo que picar su bloque.
4. **Render: rama por flag `DEFS[b].slab` en vez de por ID; un solo `slabMesh` acumulado.** El cuerpo del medio cubo se mueve tal cual (laterales `y 0→0.5`, tapa en `y+0.5`, cara inferior, omisión contra opacos) usando `DEFS[b].tiles` de cada losa. Alternativa descartada (un mesh por material): N draw calls y N builders por cero beneficio — todas comparten `matOpaque`.
5. **Rango servidor: NO tocar (`server.js` intacto).** 35-38 ≤ 40, pasa la validación existente; sync por protocolo `edit` sin cambios. Solo si a futuro se quieren MÁS de 6 losas (39-40 + más allá) habría que ampliar la constante `v > 40` en `server.js:112` + espejo en tests: cambio de 1 constante, documentado aquí como decisión NO tomada.
6. **Apilado: mapa `slabBase` en DEFS (`SLAB_X.slabBase = BASE_X`, y `SLAB_STONE.slabBase = STONE` retrofit) en vez de hardcode `STONE`.** Condición: `DEFS[cur]?.slab && id===cur → editBlock(slabBase)`. La igualdad `id===cur` implementa gratis la regla solo-mismo-material; el caso mixto cae al rechazo genérico de celda ocupada (línea 1603) sin código extra. Alternativa descartada (tabla separada fuera de DEFS): duplica la fuente de verdad; el espejo ya valida DEFS.
7. **Colisión: `collidesAt` y `slabBlocked` por flag (`DEFS[b]?.slab`) en vez de `b===SLAB_STONE`.** El resto (umbral `py>=y+.5`, auto-step con pies en suelo y lugar arriba, salto que supera) ya es genérico y no se toca. Los mobs heredan `collidesAt` como hoy (sin auto-step, aceptado en `medio-bloque`).

## Risks / Trade-offs

- [Inventario 26→30 entradas, sin paginación] → aceptado; el grid del inventario ya hace scroll/wrap y no se toca `DEFAULT_HOTBAR`.
- [`slabMesh` ahora mezcla 5 texturas en un geometry] → un solo material `matOpaque` del atlas, sin costo extra de draw calls; aceptado.
- [Dos deltas `blocks/slab` (`medio-bloque` + este) sin spec base archivada] → mitigación: orden de archive sugerido en proposal (primero `medio-bloque`); el merge es aditivo (este change solo AÑADE requisitos).
- [Chequeo "Ahí estás vos" de `doPlace` conservador, heredado] → se mantiene; aceptado por simplicidad como en `medio-bloque`.
- [Romper un cubo formado por apilado da aire, no devuelve la losa] → coherente con `medio-bloque` (romper `STONE` da aire); aceptado.

## Migration Plan

Sin migración: bloques nuevos, mundo existente intacto (celdas 35-38 no existen aún). Requiere `medio-bloque` aplicado o archivado en el árbol antes de aplicar (las ramas a generalizar vienen de ese change). Rollback = revertir `index.html` (+ espejo); celdas 35-38 residuales serían `DEFS` desconocido (no sólido, no render) hasta re-aplicar.

## Open Questions

Ninguna que cambie specs, enfoque o tasks.
