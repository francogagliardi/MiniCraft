# Proposal

## Why

El agua colocada o natural desaparece para siempre al romper bloques bajo el nivel del mar (queda un hueco de aire donde debería haber agua), y los animales pueden aparecer dentro de bloques sólidos o sin espacio libre, quedando sofocados o atascados. Ambos son bugs visibles del mundo que rompen la inmersión y se corrigen con cambios mínimos y verificados en `index.html`.

## What Changes

- Al romper un bloque que deja una celda de aire bajo o en el nivel del mar (`y <= WATER_Y`), el sistema restaura agua en esa celda (heurística sin flujo: no hay dreno real).
- `spawnAnimals` exige columna libre sobre el pasto (celdas `h+1..h+2` en aire) y verificación con `collidesAt` antes de aceptar el punto, reutilizando el patrón de `findSpawn`.
- Sin cambios de protocolo: ambos fixes viven en `index.html` y se propagan por el canal de edits existente. `server/server.js` no se toca.

## Capabilities

### New Capabilities

- `world/water`: restauración de agua al romper bloques bajo el nivel del mar.

### Modified Capabilities

- `world/size`: endurecer el spawn de animales para exigir columna libre y ausencia de colisión (el requisito actual solo cubre cobertura/escala de animales en 208, no su validez física).

## Impact

- Afectado: `index.html` — `doBreak` (línea ~1728), `editBlock` (~1222), `doPlace` (~1743,1750, contexto de reemplazo de agua), `spawnAnimals` (~1532-1541), constantes `WATER_Y=10`, `AIR`, `GRASS`, `WATER`, `collidesAt`, `findSpawn`.
- No afectado: `server/server.js` (sin cambio de protocolo), specs `greet`, `torch`, `slab`, `stair`.
- Riesgo LOW-MEDIUM: cambios de 2-5 líneas cada uno, comportamiento visible (agua que vuelve, animales ya no dentro de bloques). La heurística de agua no simula flujo: una construcción hueca bajo el mar se llenará de agua al romper, lo cual es aceptable y documentado.
