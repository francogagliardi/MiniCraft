# Proposal

## Why

Cada edición de bloque (`refreshAt`, `index.html:974-982`) reconstruye los meshes globales barriendo el mundo entero dos veces (~2M de celdas con W=160, H=40), lo que hace que colocar o romper bloques tenga un costo desproporcionado frente al rebuild de los 1-4 chunks tocados (~10-40K celdas). Este es el change 1 de 2 acordado: optimización invisible y medible sobre el mundo actual 160, antes de la migración a 208.

## What Changes

- `refreshAt` deja de llamar al `buildGlobals()` de mundo completo en cada edit; en su lugar reconstruye los meshes globales solo para la zona afectada (los 1-4 chunks que ya reconstruye, o una dirty-box alrededor de `(x,z)` con margen de 1-2 celdas por oclusión vecina).
- `buildDoors()` deja de barrer el mundo entero por edit: solo se reconcilian las puertas de la zona afectada (crear/actualizar/eliminar pivotes cuyas celdas están en la zona, conservando animaciones en curso fuera de ella).
- El path de carga inicial (`buildAllChunks + buildGlobals`, `index.html:2159,2167`) sigue haciendo build completo una vez; solo cambia el path por-edit.
- Harness temporal de medición (removible o detrás de flag) que compara iteraciones/celdas visitadas y tiempo medio de `refreshAt` antes/después con N edits.
- Sin cambios visuales, de física, de inventario, de protocolo ni de servidor.

## Capabilities

### New Capabilities

(Ninguna: refactor de performance sin comportamiento observable nuevo.)

### Modified Capabilities

(Ninguna: los meshes resultantes, sombras y colisiones son idénticos; solo cambia el costo de reconstrucción.)

> Nota: este change declara `skip_specs: true` en `.openspec.yaml` por ser un refactor puro de performance sin comportamiento observable nuevo. `openspec validate` lo acepta sin deltas de spec.

## Impact

- `index.html`: `refreshAt` (`:974-982`), `buildGlobals` (`:871-973`), `buildDoors` (`:1034-1061`); posible helper nuevo de rebuild parcial. Sin tocar `W/H/seed`, niebla/distancia, sombras, física, inventario, `server/` ni protocolo.
- Verificación: `cd server && npm test` en verde + evidencia de mejora del harness (tiempo medio de `refreshAt` / celdas reconstruidas antes vs después).
- Riesgo: bajo. El margen de la dirty-box (vecinos ±1 en x/z, y ±1 en y para puertas de 2 bloques) cubre oclusión y mitades de puerta; si la revisión encuentra un caso límite, se amplía el margen sin cambiar la estrategia.
- Fuera de alcance explícito: fog/distancia de dibujado (queda para la migración a 208, documentado como dependencia en `design.md`), sombras, y cualquier cambio de `W=208` o migración de mundo.
