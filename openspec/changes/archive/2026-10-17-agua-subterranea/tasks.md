# Tasks

## 1. Helper `waterRefill` e integración en `doBreak` (index.html)

- [x] 1.1 En `index.html`, junto a los accesores de mundo (~795-797), agregar `function waterRefill(x,y,z)` que devuelva `WATER` sii `y <= WATER_Y` **y** alguna de las 6 celdas ortogonales (`arriba`, `abajo`, `+x`, `-x`, `+z`, `-z`) contiene agua vía `get(...)`, y `AIR` en caso contrario. Verificación: `cd server; npm test` verde (el `static.mjs` corre `node --check` sobre el módulo del cliente).
- [x] 1.2 Reemplazar las dos condiciones amplias de `doBreak()` (`const v = cy<=WATER_Y ? WATER : AIR;` en la rama de puerta ~1877 y `const v = h.y<=WATER_Y ? WATER : AIR;` en la rama normal ~1885) por el resultado de `waterRefill(cx,cy,cz)` / `waterRefill(h.x,h.y,h.z)`, evaluado antes del `rawSet`, propagando ese mismo valor en `edits`/`netSend`. Verificación: `cd server; npm test` verde y, en el navegador, romper el fondo del mar y el costado de un lago devuelve agua; cavar bajo `y=10` tierra adentro deja aire.

## 2. Test comportamental de la vecindad

- [x] 2.1 Agregar `server/test/water.mjs` que extraiga `waterRefill` de `index.html` (patrón de extracción + `new Function` como en `terrain.mjs`) inyectando `get`/`WATER`/`AIR`/`WATER_Y`, y afirmar los 4 casos: celda `y<=WATER_Y` con vecino agua → `WATER`; celda `y<=WATER_Y` sin ningún vecino agua → `AIR`; vecino lateral agua → `WATER`; `y > WATER_Y` → `AIR`. Registrar `node test/water.mjs` en el script `test` de `server/package.json`. Verificación: `cd server; npm test` verde y el test falla si se revierte `waterRefill` a la condición `y<=WATER_Y` sola.

## 3. Integración

- [x] 3.1 Prueba manual en navegador/Docker de los 4 escenarios de la delta spec: romper bajo el agua (fondo del mar) → agua; cavar un túnel bajo `y=10` tierra adentro → aire en todos los huecos; romper el borde de un lago → agua en la celda nueva (una por vez); romper sobre `y=10` → aire; en partida cliente-servidor el agua/aire restaurado se ve igual en los demás jugadores y persiste tras recargar. Verificación: comportamiento observado en cada escenario. — Verificada manualmente por el usuario en Docker ("Quedó bien").
- [x] 3.2 Confirmar invariantes: `server/server.js` y el protocolo `{t:'edit',x,y,z,v}` intactos (sin cambios de canal), y `cd server; npm test` completo (static, avatar, migrate, terrain, water, protocol) en verde. Verificación: `git diff --stat` no muestra cambios en `server/server.js` y la suite sale con código 0.

## Workflow follow-up

- Archivar el change cuando la revisión del proyecto esté satisfecha.
