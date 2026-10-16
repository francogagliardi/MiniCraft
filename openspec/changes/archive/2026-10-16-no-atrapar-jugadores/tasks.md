# Tasks

## 1. Guarda de ocupación en `doPlace`

- [x] 1.1 Añadir `ocupadoPor(x, y, z)` en `index.html` junto a `doPlace` (cajas local/remotos 0.6×1.8, animales 0.64×1.2, recorte 0.1) y llamarlo en las ramas normal, escalera y puerta (puerta en `y` e `y+1`), rechazando con toast sin `editBlock`; verificar colocando sobre el jugador local, un remoto y un animal (se rechaza) y en celda libre (coloca), y que `cd server && npm test` sigue verde.
- [x] 1.2 Verificar sin regresiones puerta doble, escalera orientada y losa apilada colocando cada una junto a una entidad y en celda libre; verificar que `git diff --stat` solo toca `index.html` (sin cambios en `server/server.js`).

## 2. Margen solo remotos (exacto local/animales)

- [x] 2.1 Parametrizar `entSolapa(...,M)` en `index.html` (`M=0` local/animales, `M=0.1` remotos) y verificar TDD: RED animal en esquina con solape <0.1 permitido con M global → GREEN esquina bloquea con M=0 → TRIANGULATE (esquina bloquea, borde remoto <0.1 permite, centro bloquea, celda libre permite, `cd server && npm test` verde).
