# Proposal

## Why

Los animales (cerdos y ovejas) quedan atrapados dentro de copas de árboles y troncos: su colisión solo cubre la altura de los pies (`hgt=0.9`) pero el cuerpo visual mide ~1.1, así que la cabeza entra en bloques sólidos (LEAVES/LOG) sin que la IA lo detecte. Además, al chocar la IA empuja/salta eternamente (`vy=5.2`) en vez de re-elegir destino, lo que los mete en las copas y los deja bloqueados.

## What Changes

- Elevar la altura de colisión de animales de `hgt=0.9` a `hgt=1.2` en las 3 llamadas `collidesAt` de IA animal (`index.html`: spawn :1538, marcha :1553, gravedad :1559) para cubrir pies + cabeza.
- Al detectar bloqueo de marcha (colisión frontal), re-elegir objetivo `tx/tz` + `wait` aleatorio en vez de auto-salto eterno: el salto `vy=5.2` solo se conserva cuando hay suelo transitable (losas/escaleras), no contra cubos completos.
- Contador de bloqueos consecutivos: tras N intentos fallidos seguidos, forzar pausa + nuevo destino (evita empuje infinito contra el mismo tronco).
- Sin cambios en física del jugador (`collides` con `hgt=1.8` intacto) ni en `server/server.js`.

## Capabilities

### New Capabilities

- `creatures/animals`: deambulación de animales (spawn válido, marcha con colisión cuerpo completo, re-elección de destino al bloquearse, gravedad con colisión cuerpo completo).

### Modified Capabilities

- Ninguna (no existe spec previa de animales; `blocks/*`, `world/*`, `social/*` no cambian).

## Impact

- Código afectado: solo `index.html` (funciones `spawnAnimals`, `tickAnimal`; ~10 líneas). `server/server.js` NO se toca.
- Comportamiento observable: animales ya no atraviesan hojas/troncos con la cabeza ni quedan vibrando dentro de copas; al chocar giran/cambian de rumbo tras una pausa.
- Riesgo bajo (gobernanza LOW): la física del jugador y el multijugador no se tocan. Tests `cd server && npm test` deben seguir verdes.
