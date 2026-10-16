# Proposal

## Why

Colocar un bloque sobre otro jugador (o un animal) lo deja atrapado dentro del bloque: `doPlace` solo evita el solape con el jugador local y no revisa a los jugadores remotos ni a los animales. En multijugador esto permite encerrar a otros por accidente o a propósito.

## What Changes

- Extrae un helper `ocupadoPor(x, y, z)` en `index.html` que detecta si la celda destino solapa con alguna entidad: jugador local (0.6×1.8), cada remoto de `remotes` (0.6×1.8) y cada animal de `animals` (0.64×1.2), con un margen de 0.1 que recorta la caja de la entidad para evitar falsos positivos por el lag de interpolación (`target` vs `g.position`).
- Llama a `ocupadoPor` en las 3 ramas de `doPlace` que colocan bloques sólidos: normal, escalera y puerta (la puerta chequea sus 2 celdas, `y` e `y+1`).
- Si la celda está ocupada, rechaza la colocación con el toast existente (`⛔ Ahí estás vos` u equivalente para terceros) sin llamar a `editBlock`.
- Sin cambios de protocolo ni de física: solo una guarda previa a la colocación.

## Capabilities

### New Capabilities

- `blocks/placement`: reglas de colocación de bloques que impiden atrapar entidades (jugador local, jugadores remotos y animales), incluyendo el helper de ocupación y su margen anti-lag.

### Modified Capabilities

- Ninguna: ningún spec existente cubre la colisión de colocación contra entidades (`creatures/animals` cubre deambulación, `blocks/slab|stair|torch` cubren tipos de bloque, `world/size` cubre dimensiones).

## Impact

- Solo `index.html` (helper nuevo + 3 llamadas en `doPlace`). Sin cambios en `server/server.js`, sin cambios de protocolo, sin migraciones.
- Comportamiento visible: colocar un bloque donde hay un jugador o animal ahora se rechaza con toast en vez de atraparlo.
- Tests existentes: `cd server && npm test` no se ven afectados (no se toca el servidor); verificación manual en cliente (colocar junto/sobre remoto y animal).
