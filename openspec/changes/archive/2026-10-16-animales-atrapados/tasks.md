# Tasks

## 1. Colisión cuerpo completo + anti-bloqueo en IA animal

- [x] 1.1 Elevar `hgt` de `0.9` a `1.2` en las 3 llamadas `collidesAt` de IA animal en `index.html` (spawn ~:1538, marcha ~:1553, gravedad ~:1559) y verificar con `grep collidesAt index.html` que jugador (`1.8`) y `server/server.js` quedan intactos.
- [x] 1.2 Añadir contador de bloqueo + re-elección de destino en `tickAnimal` (~:1550-1556: al chocar N ticks seguidos asignar nuevo `tx/tz` + `wait` y resetear contador; condicionar el auto-salto `vy=5.2` a paso transitable) y verificar leyendo el diff que solo cambia IA animal.

## 2. Verificación

- [x] 2.1 Prueba manual: soltar animales junto a bosque durante 2 min y verificar que ninguno queda atrapado dentro de hojas/troncos ni vibra empujando un mismo obstáculo (todos deambulan o pastan con pausas). Validada por el usuario en Docker: "ya no se meten bajo los árboles, ninguno trabado".
- [x] 2.2 Regresión: ejecutar `cd server && npm test` y verificar que todos los tests pasan en verde.
