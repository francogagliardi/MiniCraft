# Proposal

## Why

De forma intermitente, la cámara del jugador salta de golpe a otra dirección mientras mueve el mouse. Ocurre en Edge y en otros navegadores, en primera y en tercera persona, y no requiere estar caminando. El guard actual solo descarta deltas de 1000 px o más y el primer evento tras el pointer lock, así que un delta espurio de unos cientos de píxeles —plausible para el filtro— gira la cámara decenas de grados en un solo frame.

## What Changes

- **Tope de giro por frame**: los deltas aceptados del mouse se acumulan en un buffer y se aplican en el loop con un máximo de rotación por frame (≈0,30 rad ≈17°). Un evento espurio ya no puede girar 90° de un saque, pero un flick legítimo sigue girando rápido porque el excedente se consume en los frames siguientes. La lógica queda en una función pura del bloque `look` para poder testearla aislada.
- **Pointer lock sin aceleración del sistema**: pedir el lock con `unadjustedMovement` y caer al `requestPointerLock()` clásico si el navegador lo rechaza, para reducir deltas erráticos que introduce la aceleración del SO.
- **Guard de re-lock ampliado**: ignorar los primeros eventos posteriores a (re)adquirir el pointer lock (hoy solo uno) y descartar cualquier delta pendiente al perder el lock.
- **Diagnóstico de deltas grandes aceptados**: contar y avisar en consola los primeros deltas aceptados que superen ~150 px, con valores incluidos, para confirmar la causa si el salto vuelve a aparecer. Sin inundar la consola.
- El giro deja de escribirse directo sobre `player.yaw/pitch` en el handler y pasa a aplicarse por frame; la sensibilidad configurable se sigue respetando.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `player/look`: se agrega el tope de giro por frame, el pointer lock sin aceleración del sistema, un guard de re-lock más amplio con descarte de lo pendiente y el diagnóstico de deltas grandes aceptados. El saneo del delta existente se ajusta para que un delta aceptado ya no se aplique entero de una vez.

## Impact

- `index.html`: bloque `/* look:start */ … /* look:end */` (buffer, tope por frame, guard de re-lock, diagnóstico nuevo), handler `mousemove` (deja de escribir yaw/pitch), `tryLock()` (opciones y fallback), listener `pointerlockchange` (reset de buffer) y `loop()` (drena el giro pendiente antes de actualizar la cámara). El handler táctil conserva su comportamiento y sigue usando el saneo por evento.
- `server/test/lookguard.mjs`: se amplía con los casos puros del tope por frame, el buffer, el guard de re-lock y el diagnóstico; se actualizan los estáticos que hoy exigen `player.yaw -=` dentro de `mousemove`.
- `server/test/config.mjs`: se ajusta el estático que exige `player.yaw-=mx*MOUSE_SENSITIVITY` en `mousemove`, porque la sensibilidad ahora se aplica al drenar el buffer.
- Suite de tests: sigue en **21 archivos** (no se agrega ni se quita ningún script).
- Sin cambios de servidor, protocolo, red ni persistencia.

## Out of Scope

- **No** se toca `server/` (salvo `server/test/`), ni `bot/`, ni el protocolo WebSocket.
- **No** se cambia la autoridad del servidor sobre criaturas ni el daño.
- **No** se reemplaza el pointer lock por controles alternativos ni se agrega soporte de gamepad.
- **No** se intenta corregir el problema desactivando la aceleración del mouse a nivel de sistema operativo.
