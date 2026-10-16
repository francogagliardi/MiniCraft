# Tasks

## 1. Restaurar agua al romper bajo el nivel del mar

- [x] 1.1 Restaurar `WATER` en `doBreak` (`index.html` ~1728) cuando la celda rota queda en aire con `y <= WATER_Y`, propagando el valor restaurado en `edits`/`netSend`, y verificar rompiendo un bloque bajo el agua (la celda vuelve a ser agua y persiste tras recargar) más `cd server && npm test` verde.
- [x] 1.2 Verificar que romper sobre el nivel del mar (`y > WATER_Y`) sigue dejando aire y que `server/server.js` queda intacto (sin cambio de protocolo).

## 2. Exigir columna libre en spawn de animales

- [x] 2.1 Endurecer `spawnAnimals` (`index.html` ~1532-1541) con chequeo de columna `h+1..h+2` en aire + `collidesAt` antes de aceptar cada punto (patrón `findSpawn` ~1449-1453, aplicado a spawn inicial y re-spawns), y verificar que tras varios ciclos de spawn ningún animal aparece dentro de bloques ni atascado, más `cd server && npm test` verde.
