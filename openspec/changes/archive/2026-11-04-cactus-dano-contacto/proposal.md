# Proposal

## Why

El daño del cactus hoy casi nunca se dispara. El cliente solo detecta contacto si la caja del jugador
queda a **0.06** o menos de la celda, pero el movimiento es discreto: al frenar contra el bloque, el
jugador puede quedar hasta un paso de distancia (≈0.08 caminando y hasta ≈0.37 corriendo). Por eso
chocarse de costado y seguir empujando no pincha. Además, el barrido excluye a propósito la celda de
abajo, así que pararse arriba tampoco daña.

El usuario pidió que el cactus pinche en los dos casos: al apoyarse arriba y al chocar/empujar de
costado mientras se sigue corriendo contra él.

## What Changes

- El cactus SHALL dañar cuando el jugador **intenta moverse contra** una celda de cactus y el
  movimiento queda bloqueado, aunque el paso discreto deje una separación de hasta un paso completo.
- El cactus SHALL dañar cuando el jugador está **apoyado sobre la cara superior**, con la celda del
  cactus inmediatamente debajo de sus pies.
- Se conserva el daño por intersección directa (cactus dentro del cuerpo) y el margen de contacto
  chico (0.06) para el apoyo lateral exacto.
- La cadencia sigue siendo la invulnerabilidad existente: como máximo 1 HP cada 0.6 s. No se agrega
  un cooldown nuevo.
- Sin cambios en el bloque, su id 22 (`MELON`), nombre, textura, dureza, inventario, colocación ni
  worldgen. Sin cambios en el servidor, la red, criaturas, animales ni bot.

## Capabilities

### New Capabilities

- (ninguna)

### Modified Capabilities

- `blocks/cactus`: el contacto pasa a incluir el empuje bloqueado contra el bloque y el apoyo sobre
  la cara superior; se elimina la regla que hacía seguro pararse arriba.

## Impact

- `index.html`: bloque `/* cactus:start */…/* cactus:end */` con un helper de intersección sin margen
  para el intento de movimiento, el registro del empuje y el barrido que incluye la celda de abajo;
  `movePlayer` marca el empuje al colisionar; `tickCactus` combina contacto, empuje y apoyo.
- `server/test/cactus.mjs`: se actualizan los casos de "parado arriba" y se agregan los del empuje
  bloqueado y del helper puro. No se agrega un archivo de test: la suite sigue en 22.
- Sin migración de datos ni cambios de protocolo.

## Out of Scope

- **No** se daña a zombis, animales ni al bot: el cactus sigue afectando solo al jugador local.
- **No** se agrega anti-cheat ni validación del servidor.
- **No** se cambia la textura, el modelo, la dureza ni la generación natural del cactus.
- **No** se agrega un sistema de partículas, sonido nuevo ni animación de pinchazo.
- **No** se modifica la regla de invulnerabilidad `godT` de 0.6 s.
