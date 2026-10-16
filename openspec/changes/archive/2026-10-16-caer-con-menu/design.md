# Design

## Context

Ver `proposal.md` (Why). Estado actual en `index.html`: `physics(dt)` mezcla input (WASD/táctil, salto, vuelo) con gravedad/colisión/daño-por-caída/regen/cámara; `loop` (línea ~2293) solo la llama con `state==='play'`. `openInv`/`openChat`/pausa cambian `state` y congelan todo, incluido el aire. El mundo MP sigue (animales, remotos) — ver `tickAnimal`/`tickAvatar` fuera del gate de `play`.

## Goals / Non-Goals

**Goals:**
- Gravedad + colisión + daño por caída vivos con `inv`/`chat`/`pause`, sin input.
- Cambio mínimo y localizado en `index.html`; servidor intacto.

**Non-Goals:**
- No cambiar toggles de inventario/chat/pausa ni pointer-lock.
- No tocar física de animales/remotos, vuelo admin, ni red.

## Decisions

- **Separar `physics(dt)` en `physicsMove(dt, withInput)` + `physicsGravity(dt)`:** el input (dirección, velocidad horizontal, salto, vuelo) va a `physicsMove` y solo se llama con `withInput=true` en `play`; la gravedad (`vel.y -= 26*dt`, clamp, `movePlayer` en Y, `onGround`, daño por caída, `findSpawn` bajo el mundo, regen, cámara/coords) va a `physicsGravity` y se llama en `play`/`inv`/`chat`/`pause`. Alternativa descartada: llamar `physics` completa con input ignorado vía flag de teclas — más frágil y mezcla responsabilidades.
- **Gate en `loop`:** `if (started && !dead && (state==='play' || state==='inv' || state==='chat' || state==='pause')) physicsGravity(dt)` más `if (state==='play' && canAct()) physicsMove(dt)`; `tickBreak` y raycast/highlight siguen solo en `play`. Alternativa descartada: incluir gravedad dentro del `canAct()` existente — `canAct` acopla lock/foco y reintroduciría el freeze.
- **Excepción muerto:** con `dead` no corre ni move ni gravity (la animación de muerte usa `deathPos`/`deathT`). Sin cambios ahí.
- **Decisión de diseño registrada:** en solo, abrir un menú ya no pausa la caída — comportamiento correcto MP-first, documentar en notas del cambio.

## Risks / Trade-offs

- [Riesgo] Caer sobre bloques con menú abierto y recibir daño por caída sin verlo venir → Mitigación: es el comportamiento MP correcto; el daño por caída ya existe y la cámara sigue actualizándose.
- [Riesgo] Refactor accidental del vuelo admin al separar funciones → Mitigación: `fly` queda en la rama de input (`physicsMove`); gravedad pura no toca `fly`.
- [Trade-off] La pausa en solo pierde sensación de "pausa total" → aceptado y documentado como correcto MP-first.
