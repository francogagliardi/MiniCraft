# Proposal

## Why

Al romper cualquier bloque con `y <= WATER_Y` (=10), el juego rellena la celda con agua aunque se esté tierra adentro a decenas de bloques del mar: cavar un túnel por debajo de `y=10` hace aparecer agua en el hueco ("no importa dónde pique, al descender cierta altura aparece agua"). La causa es que `doBreak()` decide el valor con la sola condición `y <= WATER_Y` (líneas ~1877 y ~1885 de `index.html`), sin mirar si hay agua cerca; esta regla hereda del change archivado `bugs-agua-spawn`, cuya spec quedó redactada demasiado amplia.

## What Changes

- Al romper un bloque, la celda resultante SHALL ser agua **solo si** queda en/bajo el nivel del mar (`y <= WATER_Y`) **Y** además tiene al menos un vecino con agua (vecindad de 6: arriba/abajo/N/S/E/O, evaluada antes del break). En cualquier otro caso queda aire.
- Se introduce un helper único `waterRefill(x,y,z)` que devuelve el valor a escribir (`WATER` o `AIR`) y se reutiliza tanto en la rama normal como en la rama de puerta de `doBreak()` (hoy cada una repite la condición mal escrita).
- Se **corrige (MODIFIED)** el requirement existente de `world/water` ("Restauración de agua al romper bajo el nivel del mar"): su condición real pasa de `y <= WATER_Y` a `y <= WATER_Y` **y** vecino con agua. No se agrega una capability nueva.
- Sin cambios de protocolo: el canal de edits ya difunde el valor resultante (`WATER`/`AIR`), así que `server/server.js` no se toca.

## Capabilities

### New Capabilities

<!-- Ninguna: el cambio corrige una regla existente, no introduce una capability nueva. -->

### Modified Capabilities

- `world/water`: la restauración de agua al romper deja de depender solo de `y <= WATER_Y` y pasa a exigir además un vecino con agua; romper tierra adentro bajo `y=10` ya no inunda el hueco.

## Impact

- Afectado: `index.html` — `doBreak()` (líneas ~1868-1891, ramas normal y de puerta), nuevo helper `waterRefill(x,y,z)` reutilizando `get`/`inB` (~795-797), `WATER`, `AIR`, `WATER_Y` (~412).
- No afectado: `server/server.js` y el protocolo `{t:'edit',x,y,z,v}` (el canal ya difunde el valor), resto de specs, persistencia y formato de mundo.
- Tests: `cd server; npm test` (suite `server/test/*.mjs`, que extrae y evalúa fragmentos de `index.html`). Riesgo LOW: cambio de pocas líneas, comportamiento observable puntual (agua que ya no aparece en excavaciones secas, y que sigue apareciendo al romper bajo el mar).
