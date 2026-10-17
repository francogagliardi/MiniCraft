# Design

## Context

Ver `proposal.md` (Why) y `specs/player/mining/spec.md` (requisitos). Estado actual verificado en `index.html`:

- IDs de bloque 0–58 ocupados; `SWORD = 100` es el único ítem (`const SWORD = 100` ~:425, `[SWORD]: { …, item:'sword' }` ~:488, agregado a `INVENTORY` ~:490). `PICK = 101` es el siguiente id libre de ítem.
- Rotura: `tickBreak(dt)` (~:1975-1990) lee `hard = DEFS[h.b].hard ?? 1`, acumula `breakProg += dt`, calcula `stage = Math.min(4, Math.floor(breakProg/hard*5))` sobre las 5 etapas de `crackTex` (~:619-633) y rompe cuando `breakProg >= hard`. Guarda `hard >= 1e9` → oculta grieta y no rompe (`BEDROCK`).
- `hard` se usa **solo** ahí (y en el espejo `server/test/static.mjs` para exigir dureza numérica); ningún otro código depende de su valor como tiempo.
- `tickBreak` se llama en el loop (~:2386) solo en `state==='play' && canAct() && !dead`, con `dt` tope `.05` (~:2385). El progreso lo marca `mouseDown[0]`, seteado por el mouse (~:1959) y por la ruta táctil: botón `atkTouch` (~:399) y mantener el dedo en el canvas 260 ms (~:2009). `resetBreak()` limpia `breakKey`/`breakProg`/grieta.
- Admin: `onLeftDown()` (~:1932) rompe instantáneo con `doBreak()` en su rama; `tickBreak` sale antes con `isAdmin()`. `doBreak` (~:1815) vuelve a chequear `d.unbreakable`.
- Viewmodel: `swordG` (THREE.Group con `BoxGeometry`) construido en la sección `ESPADA EN MANO (viewmodel)` (~:697-717), `camera.add(swordG)`, visible solo si `hotbarIds[sel]===SWORD && !dead` desde `tickSword(dt,now)` (~:720-734); `tickCooldown()` (~:737-746) maneja el anillo `cdRing`, exclusivo de la espada. Ambos se llaman en el loop (~:2405).
- UI: `select(i)` (~:2046) arma el toast con `d.item ? '⚔️ … (clic der para atacar)' : '🧱 …'`; `#hint` player (~:2241) y `.controls` (~:269-278) muestran la ayuda.
- Tests: `server/test/static.mjs` extrae el literal `DEFS` de `index.html` y hace `eval` **sin** las consts del cliente, por lo que ya espeja `SWORD = 100` (~:37). Verificado: con las consts fuera de scope el `eval` lanza `ReferenceError: GRASS is not defined`.

## Goals / Non-Goals

**Goals:**

- Un único punto de verdad del tiempo de rotura: `breakTime(blockId, heldItem)` (mano `hard × 1.5`, pico `~0.25 s` flat, no rompible salvo admin).
- Pico como ítem de inventario + viewmodel en mano, con el mínimo cambio estructural reutilizando el patrón de `SWORD`/`swordG`.
- Mantener intactos: admin instantáneo, `BEDROCK`, física, guardado, servidor y protocolo.

**Non-Goals:**

- No especializar el pico por material (un solo pico universal) ni agregar durabilidad/mejoras/cooldown del pico.
- No agregar una animación *propia* del pico: se reutiliza el `swingT`/`SWING_DUR` de la espada (el pico oscila mientras se pica; solo uno de los dos modelos es visible a la vez).
- No tocar `collidesAt`, `raycast`, `doBreak`, `doPlace`, `needSword()` ni el texto `Necesitás la espada` (lo asserta `static.mjs`).
- No agregar botones táctiles nuevos ni cambiar la UI del inventario más allá de la entrada del pico.

## Decisions

1. **`breakTime(blockId, heldItem)` puro en la sección ROMPER/PONER, con `HAND_MULT = 1.5` y `PICK_TIME = 0.25` (constante tuneable).**
   Firma `(blockId, heldItem)` explícita (no lee `hotbarIds[sel]` por dentro) para que `tickBreak` pase `hotbarIds[sel]` y el cálculo quede testeable/legible. Devuelve `Infinity` si `DEFS[blockId].unbreakable` (o `hard >= 1e9`); `PICK_TIME` si `DEFS[heldItem]?.item === 'pick'`; si no `(DEFS[blockId].hard ?? 1) * HAND_MULT`.
   Constantes declaradas junto a `breakTime` (no en CONFIG) porque son tuning exclusivo del picado y el diff queda localizado; `CONFIG` guarda ids/mundo.
   Alternativas: condicionar dentro de `tickBreak` (mezcla tiempo y render de grietas, difícil de leer); mapa de tiempos por material (el requisito pide plano y universal); leer `hard` para decidir el modo (no distingue "sin pico" de "pico").

2. **`tickBreak` consume `breakTime` y mantiene su estructura.**
   `const t = breakTime(h.b, hotbarIds[sel]); if(!isFinite(t)){ crackMesh.visible=false; return; }` reemplaza el guard `hard>=1e9`; `breakProg += dt`; `stage = Math.min(4, Math.floor(breakProg/t*5))`; rompe con `breakProg >= t`. Así las 5 etapas de grieta se reparten sobre el tiempo objetivo real, sin tocar `crackTex` ni `doBreak`.
   Consecuencia aceptada: `dt` está topeado en `.05`, así que a fps bajos el pico rompe en ~5 frames (~0.25 s) igual.

3. **`PICK = 101` con `item:'pick'`, mismo patrón que `SWORD`.**
   `const PICK = 101;` junto a `SWORD` (~:425); `DEFS[PICK] = { name:'Pico ⛏️', css:'…', color:…, item:'pick' }` (sin `tiles`/`hard`: es ítem, el espejo lo saltea); `INVENTORY.push` vía la lista literal (sin tocar `DEFAULT_HOTBAR`, que queda en 9). `item:'pick'` (identidad por flag) permite que `breakTime` y la UI se ramifiquen sin comparar contra `PICK`.
   Alternativas: flag booleano `pick:1` (choca con la convención `item:'sword'` existente); reutilizar `SWORD` con un modo alternable (rompe el significado del ítem y el `needSword`).

4. **Modelo `pickG` en la misma sección del viewmodel, con `tickPick(dt,now)`, pose girada y golpe reutilizando `swingT`.**
   Grupo propio construido con el mismo estilo (`BoxGeometry` + `MeshLambertMaterial`: mango de madera + cabeza de piedra en T), espejado a la izquierda de la mira para no pisar la espada, `camera.add(pickG)`, `pickG.visible = hotbarIds[sel]===PICK && !dead`. La cabeza es un travesaño ancho que de frente cruza la pantalla: se corrige con `PICK_ROT = Euler(.5, π/2 + .18, -.35)` (giro ~90° sobre Y para apuntar al fondo + inclinación similar a la espada) y se reduce el tamaño con `PICK_SCALE = .85`; la pose base vive en constantes (`PICK_POS`/`PICK_ROT`/`PICK_SCALE`) para tunear. `tickPick` mantiene el balanceo idle y suma el golpe: si `mouseDown[0]` y hay bloque objetivo (`raycast()`) y el swing terminó (`swingT>=1`), reinicia `swingT=0`; luego progresa `swingT` con `SWING_DUR` y aplica la oscilación sobre la pose base. Se llama `tickPick(dt,now)` en el loop junto a `tickSword`. Renombrar el header de la sección a `ARMA/HERRAMIENTA EN MANO (viewmodel)`.
   Como `PICK !== SWORD` y `tickSword`/`tickPick` salen temprano cuando su modelo no es visible, `swingT` no se pisa: solo el ítem activo anima. Alternar a mitad de golpe puede dejar al otro ítem terminar el swing en curso, efecto cosmético aceptado y sin impacto en el daño/rotura.
   Alternativas: reusar `swordG` cambiando geometría (destruye el modelo de la espada); una sección nueva después del loop (aleja dos viewmodels que se tocan); animación propia con otro temporizador (duplica estado y arriesga desincronizar el golpe real).

5. **UI/ayuda: ramificar el toast de `select()` por tipo de ítem y mencionar el pico en `#hint`.**
   `select()`: `d.item === 'sword'` → `⚔️ … (clic der para atacar)`; `d.item === 'pick'` → `⛏️ … (mantené click izq para picar)`; si no, el texto actual. `#hint` player suma que con el pico en mano se rompe al toque. `needSword()`, su toast y las .controls quedan como están.
   Alternativas: dejar el toast de la espada para el pico (dice "clic der para atacar", incorrecto); ocultar el pico del inventario (contradice el requisito).

6. **Espejo obligatorio en `server/test/static.mjs`: `PICK = 101`.**
   El `eval` del literal `DEFS` corre sin las consts del cliente, así que `[PICK]` exige espejar la const igual que `SWORD` (única línea fuera de `index.html`). Es el test, no el servidor: `server/server.js` y el protocolo no se tocan.

## Risks / Trade-offs

- [El `eval` de `DEFS` en `static.mjs` falla con `ReferenceError` si no se espeja `PICK`] → Mitigación: tarea explícita de espejar `PICK = 101`; el test lo detecta en el primer `npm test`.
- [Cambiar `hard` → `hard × 1.5` altera el feel de todos los bloques] → Mitigación: es el objetivo del cambio y queda centralizado en `breakTime`; un solo lugar para retocar el multiplicador.
- [`dt` topeado en `.05` hace que `PICK_TIME=.25` sea sensible al fps] → Aceptado: ~0.25 s a 60 fps y ~5 frames al mínimo; el efecto "rápido" se mantiene y la constante queda tuneable.
- [El pico con `item:'pick'` podría colarse en la rama de colocación] → Mitigación: `doPlace()` ya rechaza por celda y no coloca ítems (la espada tiene el mismo comportamiento); verificar en táctil/PC que clic derecho con pico no coloca.
- [El modelo del pico tapa la mira o se ve mal orientado] → Mitigación: pose base en `PICK_POS`/`PICK_ROT`/`PICK_SCALE` (giro ~90° Y, escala reducida) y verificar a mano en el navegador; un solo lugar para retocar.

## Migration Plan

- Sin migración: cambio cliente puro en `index.html` + espejo de test. No cambia `SAVE_KEY` ni el formato de `hotbar` (el pico es un id más, validado por `DEFS`).
- Rollback: revertir el bloque de `PICK`/`breakTime`/`tickPick` y el espejo en `static.mjs`; `cd server; npm test` como red de seguridad.
