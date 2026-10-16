# Proposal

## Why

El jugador queda flotando si abre inventario, chat o pausa en plena caída: `loop` solo corre `physics(dt)` con `state==='play'`, así que la gravedad se congela con el menú abierto. En MP el mundo sigue (otros jugadores, animales), por lo que pausar la física propia es incorrecto.

## What Changes

- Separa `physics(dt)` en `physicsMove(dt, withInput)` (input de movimiento + salto, solo en `play`) y `physicsGravity(dt)` (gravedad + colisión + daño por caída + regen, siempre salvo muerto).
- `loop` SHALL seguir aplicando `physicsGravity` con `state==='inv'/'chat'/'pause'` (y en `play`), sin input de movimiento fuera de `play`.
- Con menú abierto no hay salto, ni desplazamiento WASD/táctil, ni `tickBreak`; la cámara y coordenadas se siguen actualizando.
- Documenta como comportamiento correcto MP-first: abrir un menú ya no pausa la caída (cambia la sensación de pausa en solo).

## Capabilities

### New Capabilities

- `player/physics`: gravedad y colisión del jugador local que continúan con menús abiertos (sin input), y movimiento por input solo en `play`.

### Modified Capabilities

<!-- Sin cambios a REQUIREMENTS existentes: ui/inventory y estados de menú mantienen su comportamiento de toggle. -->

## Impact

- Tocado: `index.html` (`physics`, `loop`, `openInv`/`openChat`/pausa sin cambios de estado).
- No tocado: servidor MP, red, guardado, resto de UI.
- Tests existentes deben seguir verdes; riesgo bajo, cambio localizado en el cliente.
