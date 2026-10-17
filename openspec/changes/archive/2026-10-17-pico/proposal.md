# Proposal

## Why

Romper bloques a mano hoy es demasiado rápido y no existe ninguna herramienta que acelere el picado: la dureza se usa tal cual (`hard` segundos), así que la piedra cae en 1.8 s a puño limpio. Un pico clásico —rápido, universal— y un ajuste de ×1.5 a mano dan peso a picar sin pico y premian tenerlo en la mano.

## What Changes

- **Mano ×1.5**: romper un bloque sin el pico en mano pasa a tardar `hard × 1.5` segundos (ej.: piedra 1.8 s → 2.7 s, tablones 1 s → 1.5 s, flor 0.15 s → 0.225 s).
- **Pico rápido y universal**: con el pico en mano, cualquier bloque rompible se rompe en ~0.25 s (flat, constante `PICK_TIME` tuneable), sin especialización por material (no hay "pico de piedra vs. pico de hierro").
- **Ítem nuevo `PICK = 101`** (mismo patrón que `SWORD = 100`): `item:'pick'` en `DEFS`, agregado a `INVENTORY` (no a `DEFAULT_HOTBAR`), con nombre e icono css.
- **Modelo del pico en mano** (`viewmodel`): grupo propio análogo a `swordG` agregado a la cámara, visible solo cuando el slot activo es el pico; la cabeza se gira ~90° sobre Y para apuntar hacia adelante (no de costado), el modelo se reduce de tamaño y el pico reutiliza la animación de golpe `swingT`/`SWING_DUR` (oscila mientras se pica, idle al soltar).
- **Progreso de grietas ligado al tiempo objetivo**: las 5 etapas de `crackTex` se reparten sobre el tiempo objetivo (mano o pico) en vez de sobre `hard` crudo.
- **No cambia**: la rotura instantánea del admin, la inviolabilidad de `BEDROCK` (`unbreakable:1`, `hard:1e9`), la física, el mundo guardado, el servidor (`server/server.js`), el atlas/texturas y el protocolo.

## Capabilities

### New Capabilities

- `player/mining`: define el tiempo de rotura de bloques según el ítem en mano (mano ×1.5 vs. pico ~0.25 s universal), el progreso de grietas asociado y el ítem pico (inventario + modelo en mano con animación de golpe + selección).

### Modified Capabilities

- Ninguna.

## Impact

- Código afectado: `index.html` — constante `PICK = 101` + entrada `DEFS[PICK]` + `INVENTORY` (~425, ~488, ~490), viewmodel del pico junto a `swordG` (~697-746) con su `tickPick` llamado desde el loop (~2405), función `breakTime(blockId, heldItem)` con las constantes `HAND_MULT=1.5` / `PICK_TIME=0.25`, pose base del pico en constantes (`PICK_POS`/`PICK_ROT`/`PICK_SCALE`) y `tickBreak(dt)` (~1975-1990) usando ese tiempo para progreso y etapas de grieta.
- **Espejo de tests (no es el servidor)**: `server/test/static.mjs` evalúa el literal `DEFS` extrayéndolo de `index.html` sin las constantes del cliente, por lo que hoy ya espeja `SWORD = 100` (~línea 37); la clave `[PICK]` obliga a espejar también `PICK = 101` o el test falla con `ReferenceError`. Es la única línea fuera de `index.html`; `server/server.js` y el protocolo quedan intactos.
- Comportamiento observable: picar a mano se siente más lento; con el pico en la mano el bloque se rompe rápido (~0.25 s), con grietas que pasan en fracciones de segundo y el modelo oscilando mientras se pica. En táctil funciona igual (botón ⚔️ / mantener el dedo ya setean `mouseDown[0]` y el loop usa el ítem en mano).
- Riesgo LOW: cambio cliente puro; `cd server; npm test` (static, avatar, migrate, terrain, protocol) debe quedar verde.
