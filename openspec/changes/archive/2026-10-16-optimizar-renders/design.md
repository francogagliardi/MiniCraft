# Design

## Context

Verificado en código (`index.html`):

- `W=160, H=40, CH=16` (`index.html:411`) → el mundo tiene 1.024.000 celdas.
- `refreshAt(x,z)` (`:974-982`) reconstruye 1-4 chunk meshes (10-40K celdas c/u) y luego llama a `buildGlobals()`, que barre el mundo entero (`:874`) para re-emitir 5 meshes globales (vidrio/agua, flores, antorchas, glow, losas+escaleras) y termina llamando a `buildDoors()` (`:972`), que barre el mundo entero otra vez (`:1038`) para recrear todos los pivotes de puerta.
- Costo por edit: ~2,05M de visitas a celda + dispose/rebuild de todos los meshes globales y todos los pivotes, contra ~10-40K celdas de los chunks realmente tocados (factor ~50x).
- Los meshes globales son únicos por categoría (`transMesh, flowerMesh, glowMesh, torchMesh, slabMesh` en `:870`) y los pivotes de puerta viven en un mapa por celda (`doorMeshes`, `:987`); las animaciones van aparte (`doorAnims`, `:988`) y sobreviven a rebuilds.
- Ver propuesta en `proposal.md` para el porqué y el alcance (change 1 de 2; fog/distancia y `W=208` quedan para el change 2).

## Goals / Non-Goals

**Goals:**

- Que `refreshAt` visite O(chunk tocados) celdas en vez de O(mundo × 2), reutilizando el mismo conjunto de 1-4 chunks que ya reconstruye.
- Meshes resultantes bit-idénticos en contenido (mismos quads, materiales, flags de sombra) — solo cambia cuántos se reconstruyen por edit.
- Evidencia medible antes/después con un harness A/B en el mismo build.

**Non-Goals:**

- Cambiar niebla/distancia de dibujado, sombras, `W/H/seed`, física, inventario, `server/` o protocolo (ver `proposal.md`).
- Reducir el número de draw calls ni re-arquitecturar el renderer; el aumento de objetos en escena se acepta (ver trade-offs).

## Decisions

### D1 — Particionar los meshes globales por chunk (no dirty-box sobre meshes únicos)

Los 5 meshes globales pasan de ser únicos (`transMesh`, …) a un mapa por chunk (`chunkKey → mesh`), igual que ya hace `chunkMeshes` para los opacos. Nuevo `buildGlobalsForChunk(cx,cz)` que itera solo `x ∈ [cx*16, cx*16+16)`, `z ∈ [cz*16, cz*16+16)`, todo `y`, y emite a los 5 `GeoBuilder` con el mismo código de ramas por bloque (vidrio, agua, flores, antorcha, glow, losa, escalera — sin tocar la lógica de quads). El `buildGlobals()` actual se conserva como bucle sobre todos los chunks solo para la carga inicial (`:2159,2167`).

- Alternativa descartada (dirty-box sobre meshes únicos): imposible sin re-arquitectura — los quads ya emitidos viven en un `BufferGeometry` construido; no se pueden "quitar" los de una caja sin reconstruir todo el mesh. La dirty-box colapsa en meshes por región, que es exactamente esta decisión con granularidad de chunk.
- Alternativa descartada (debounce/throttle de `refreshAt`): no reduce el trabajo, solo lo retrasa y añade latencia visible al editar.

### D2 — `refreshAt` reconstruye globales solo en el mismo conjunto de chunks

`refreshAt` ya calcula el conjunto afectado (propio + vecinos cuando el edit cae en borde `x%CH===0/15`, `z%CH===0/15`, `:976-980`). Ese mismo conjunto alimenta `buildChunk`, `buildGlobalsForChunk` y el refresh parcial de puertas (D3). La corrección del borde sale gratis: las ramas de oclusión leen vecinos a distancia 1 (`get(x±1,…)`, `:877-921`), y cualquier celda a distancia ≤1 del edit cae en el propio chunk o en el vecino que ya se reconstruye por la regla de borde existente.

### D3 — Puertas: reconciliación parcial por columnas de los chunks afectados

`buildDoors()` parcial: elimina solo los pivotes cuyas celdas `(x,y,z)` pertenecen a los chunks afectados y re-escanea solo esas columnas creando pivotes con la misma lógica (bisagra, `isTop` por mitad, espejo, `doorAngle` con `doorAnims` preservado). El `buildDoors()` completo se conserva para carga inicial. El margen es holgado por construcción: la geometría de una puerta solo depende de su propia celda y de la celda de abajo (`isTop`, `:1048-1049`), ambas dentro de la misma columna re-escaneada; el par de puerta doble no necesita tocarse (su pivote no cambia al editar la vecina).

- Alternativa descartada (no tocar puertas): `buildDoors()` es la mitad del costo (~1M celdas/edit); dejarlo intacto anularía gran parte de la ganancia.

### D4 — Harness A/B temporal conmut able FULL vs PARTIAL en el mismo build

Para evidenciar la mejora sin "benchmark perfecto", el harness (temporal, detrás de flag/query-param, a remover o desactivar al final) expone:

- Contador de celdas visitadas por `refreshAt` (suma de barridos de chunks + globales + puertas).
- Tiempo medio de `refreshAt` sobre N edits sintéticos (colocar/romper en posiciones representativas: centro de chunk, bordes `x%CH===0/15`, `z%CH===0/15`, y sobre cada categoría global: vidrio, agua, flor, antorcha, glow, losa, escalera, puerta).
- Modo `FULL` (fuerza el path viejo: `buildGlobals()` + `buildDoors()` completos) vs `PARTIAL`, para comparar A/B en el mismo build sin `git stash`.

Criterio de aceptación: orden de magnitud menos celdas por edit (~40K vs ~2M) y reducción medible del tiempo medio de `refreshAt`; comportamiento visual idéntico (inspección manual + `cd server && npm test` verde).

## Risks / Trade-offs

- [Riesgo] Más objetos en escena: 5 categorías × 100 chunks = hasta ~500 meshes pequeños vs 5 únicos → más draw calls. Mitigación: la geometría total es la misma; el costo por frame sube de forma marginal y constante, mientras el costo por edit baja ~50x. Si la revisión con el mundo real muestra regresión de frame rate, anotarlo como follow-up (no bloquea: el cuello actual es el edit, no el frame).
- [Riesgo] Fuga de memoria GPU si un rebuild parcial no hace `dispose()` de la geometría reemplazada. Mitigación: el helper por chunk hace dispose antes de reemplazar, igual que el path actual (`:872`, `:1036`); verificar con conteo de geometrías en el harness.
- [Riesgo] Caso límite de oclusión a distancia >1 no cubierto por el conjunto de chunks. Mitigación: no existe tal caso hoy — todas las ramas leen vecinos a distancia 1; la regla de borde existente lo cubre. Si aparece uno en revisión, se amplía al vecino correspondiente sin cambiar la estrategia.
- [Trade-off] Duplicación temporal FULL/PARTIAL durante el change: se acepta para medir; el path FULL y el flag se eliminan antes de cerrar (tarea explícita).
- Dependencia hacia el change 2 (migración 208): fog/distancia no se tocan aquí; con el mundo actual el frustum culling de three.js sobre 500 meshes pequeños sigue siendo barato. Documentado, no bloqueante.

## Migration Plan

- Cambio solo-cliente en `index.html`; sin orden de deploy, sin cambios de protocolo, sin tocar `server/`. Rollback = revert del commit.
- Secuencia: baseline del harness en modo FULL → implementar PARTIAL → A/B → remover path FULL/flag → `cd server && npm test` → revisión visual.
