# Proposal

## Why

El mundo actual de 160×160 se queda chico: los jugadores construyen hasta el borde y no queda territorio virgen para explorar. Ampliar a 208×208 (208/16=13 chunks exactos, sin resto) da ~69% más de superficie manteniendo el seed y todas las construcciones existentes en su lugar.

## What Changes

- **BREAKING**: tamaño del mundo W 160 → 208 (H=40 y CH=16 sin cambios; 13×13 chunks de meshes por chunk).
- **BREAKING**: formato de índices de voxel cambia (stride 160 → 208); los `edits` del `world.json` del VPS se migran con script: por cada `[i,v]`: `x=i%160, z=((i/160)|0)%160, y=(i/25600)|0 → i'=(y*208+z)*208+x`. El seed NO cambia.
- **BREAKING**: `SAVE_KEY` `minicraft-save-v2` → `minicraft-save-v3` en `index.html` (los índices viejos en localStorage corromperían posiciones si se reaplican sobre W=208).
- `CLIENT_V` `v8` → `v9` (sello visible en menú/pausa; distingue builds viejos "derretidos" de los nuevos).
- `server/server.js`: validación `x,z<160` → `<208`, `idx=(y*160+z)*160+x` → stride 208, spawn inicial `pos:[80.5,20,88.5]` → centro de 208 (`[104.5,20,104.5]` aprox).
- `index.html`: cazar todos los literales derivados de W=160 — `const W`, `widx`, `inB`, `findSpawn` (radio `r<80` → escala a ~104), `spawnAnimals` (usa W, se adapta solo), nubes/polen (`*200-20` → cubrir 208), `sun.position/target`, `sunSprite`, frustum de sombras `±70` → `±~114`, fog `far 125` → `~160-180` (más `near` si hace falta), y cualquier `160`/`200`/`80` restante que el grep revele.
- Script de migración Node testeable en local contra una copia del `world-vps` (`world.json` 258KB del backup Easypanel 2026-10-16, estado Success).
- Deploy simultáneo server+cliente y verificación en producción; rollback = restaurar `world.json` del backup + redeploy del build anterior.

## Capabilities

### New Capabilities

- `world/size`: dimensiones del mundo, indexación de voxels, migración de índices entre tamaños, e invalidación de guardados locales incompatibles.

### Modified Capabilities

(none — no existe capability previa de mundo; `blocks/*` y `social/greet` no cambian requisitos.)

## Impact

- Código: `index.html` (constantes, generación, spawn, sombras, fog, guardado local), `server/server.js` (validación, indexación, spawn), `server/test/*` (espejos de validación N e índices), script nuevo de migración (fuera del runtime, solo herramienta).
- Datos: `world.json` del VPS se reescribe con índices migrados; backup ya existente en Easypanel + copia por consola conocida por el usuario.
- Jugadores: clientes viejos contra server nuevo ven el mundo "derretido" (mitigación: bump `CLIENT_V` + deploy simultáneo + aviso de recargar con Ctrl+F5); árboles/flores procedurales por stream rng pueden moverse de forma cosmética (fuera de alcance fijarlo).
