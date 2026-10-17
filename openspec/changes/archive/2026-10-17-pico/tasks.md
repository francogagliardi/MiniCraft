# Tasks

## 1. Ítem pico (id, DEFS, inventario y espejo de tests)

- [x] 1.1 En `index.html` declarar `const PICK = 101;` junto a `SWORD = 100` (~:425) y agregar `[PICK]: { name:'Pico ⛏️', css:'…', color:…, item:'pick' }` a `DEFS` (sin `tiles` ni `hard`: es ítem) e incluirlo en `INVENTORY` sin tocar `DEFAULT_HOTBAR` (debe seguir con 9 slots). Verificación: `cd server; npm test` en verde (el chequeo `INV.every(id=>DEFS[id])` y el de 9 slots pasan) y el pico visible como ítem elegible al abrir el inventario.
- [x] 1.2 Espejar `const PICK = 101` en el bloque de consts del espejo `server/test/static.mjs` (~:37, junto a `SWORD = 100`) para que el `eval` del literal `DEFS` no lance `ReferenceError`. Verificación: `cd server; npm test` verde (sin el espejo el test `static.mjs` falla con `ReferenceError: PICK is not defined`).
- [x] 1.3 Ramificar el toast de `select(i)` (~:2046) por tipo de ítem: espada → `⚔️ … (clic der para atacar)`, pico → `⛏️ … (mantené click izq para picar)`, resto igual. Verificación: seleccionar el pico en la hotbar muestra el aviso de picar (y no el de atacar); seleccionar la espada conserva su texto; `npm test` sigue verde (los asserts de `needSword`/`Necesitás la espada` intactos).
- [x] 1.4 Verificar que el pico no se puede colocar en el mundo: con el pico en el slot activo, hacer clic derecho apuntando a una celda válida. Verificación: no se coloca bloque ni se consume/transforma el pico (mismo comportamiento que la espada).

## 2. Tiempos de rotura y progreso de grietas

- [x] 2.1 En la sección ROMPER/PONER de `index.html` agregar `const HAND_MULT = 1.5, PICK_TIME = .1;` (documentadas) y `function breakTime(blockId, heldItem)` que devuelva `Infinity` si `DEFS[blockId].unbreakable` (o `hard >= 1e9`), `PICK_TIME` si `DEFS[heldItem]?.item === 'pick'`, y `(DEFS[blockId].hard ?? 1) * HAND_MULT` en el resto. Verificación: `cd server; npm test` verde (`node --check`) y lectura del código confirmando que los tres casos están cubiertos y que `BEDROCK` cae en `Infinity`.
- [x] 2.2 En `tickBreak(dt)` (~:1975) reemplazar `hard` por el tiempo objetivo: `const t = breakTime(h.b, hotbarIds[sel]); if(!isFinite(t)){ crackMesh.visible=false; return; }`, `breakProg += dt`, `stage = Math.min(4, Math.floor(breakProg/t*5))` y romper con `breakProg >= t`. Verificación: `npm test` verde y, en el navegador, piedra a mano rompe en ~2.7 s (grietas repartidas en ese tiempo) y con el pico en ~0.25 s (grietas en fracciones de segundo, sin quedar congeladas).
- [x] 2.3 Verificar los invariantes de rotura con el cambio: `BEDROCK` no se rompe ni muestra grieta (con o sin pico); el admin sigue rompiendo instantáneo (`onLeftDown` → `doBreak`); soltar el clic a mitad del picado resetea el progreso y deja el bloque intacto. Verificación: los tres casos observados en el navegador sin errores en consola.
- [x] 2.4 Verificar la ruta táctil sin cambios de control: con el pico en el slot activo, mantener el dedo (hold 260 ms) y el botón `atkTouch` producen la rotura ~0.25 s con las mismas etapas de grieta que en PC; a mano el picado táctil respeta `hard × 1.5`. Verificación: probado en vista táctil/emulación con el bloque rompiéndose al tiempo esperado. **Verificado y aprobado por el usuario en Docker (vista táctil/emulación).**

## 3. Viewmodel del pico

- [x] 3.1 En la sección del viewmodel (~:697-746, renombrada a `ARMA/HERRAMIENTA EN MANO`), construir `pickG` con el mismo patrón que `swordG` (`BoxGeometry` + `MeshLambertMaterial`: mango de madera y cabeza de piedra en T, lateral espejado para no pisar la espada), `pickG.visible = false` y `camera.add(pickG)`. Verificación: el cliente carga sin errores en consola y el modelo no aparece con otros ítems.
- [x] 3.2 Agregar `function tickPick(dt, now)` análogo a `tickSword`: `pickG.visible = hotbarIds[sel]===PICK && !dead` + balanceo idle, y llamarlo en el loop junto a `tickSword(dt, now)` (~:2405). Verificación: con el pico activo se ve el modelo con balanceo suave; al cambiar de slot o morir desaparece; con la espada activa se ve solo la espada; no hay errores en consola.
- [x] 3.3 Verificar la alternancia pico/espada y que el cooldown de la espada (`tickCooldown`/`cdRing`) no se activa con el pico. Verificación: alternar slots en la hotbar muestra el modelo correcto en cada caso y el anillo `cdRing` solo aparece tras atacar con la espada.

## 4. Ayuda visible en juego

- [x] 4.1 Actualizar el `#hint` del modo jugador (~:2241) para mencionar que con el pico en mano el bloque se rompe al toque (mantener el texto del admin ~:2240 y el `#hint` del HTML ~:239 coherentes). Verificación: entrar como jugador y como admin y ver el texto correcto en cada modo; `npm test` verde.

## 5. Integración

- [x] 5.1 Ejecutar `cd server; npm test` y confirmar todos los tests (static, avatar, migrate, terrain, protocol) en verde, en particular el `static.mjs` que parsea `index.html` (tags balanceados, un solo módulo, inventario válido, hotbar de 9).
- [x] 5.2 Prueba manual integral: picar a mano un bloque de piedra (~2.7 s) y repetirlo con el pico (~0.25 s); comprobar `BEDROCK` inviolable con y sin pico; que el pico se ve en la mano (cabeza al fondo, tamaño reducido, oscilando al picar) y la espada/cooldown siguen bien; y que el guardado/recarga conserva el pico en la hotbar. Verificación: resultado observado y aprobado por el usuario en el navegador. **Verificado y aprobado por el usuario en Docker ("Quedó perfecto" tras ajustar PICK_TIME=.25 + animación + modelo girado).**

## 6. Ajustes por feedback (probado en Docker)

- [x] 6.1 Subir `PICK_TIME` de `.1` a `.25` (constante tuneable `const HAND_MULT = 1.5, PICK_TIME = .25;`) sin tocar `HAND_MULT`. Verificación: `cd server; npm test` verde, con el nuevo assert `PICK_TIME = .25` y `breakTime(STONE,PICK)===.25` / `breakTime(OBSIDIAN,PICK)===.25`.
- [x] 6.2 Animar el golpe del pico reutilizando `swingT`/`SWING_DUR`: `tickPick` reinicia `swingT=0` cuando `mouseDown[0] && swingT>=1 && raycast()` (oscila al picar, se repite) y vuelve al balanceo idle al soltar; sin romper `tickSword`. Verificación: asserts `tickPick reinicia/progresa/vuelve al idle` y `tickSword conserva su animación`; alternar pico/espada no genera errores.
- [x] 6.3 Girar la pose del pico ~90° sobre Y (cabeza al fondo, no de costado) y reducir el tamaño: `PICK_POS`/`PICK_ROT = Euler(.5, π/2+.18, -.35)`/`PICK_SCALE = .85`. Verificación: assert `pose girada ~90° sobre Y` + `pico reducido de tamaño` + `pico espejado a la izquierda`; revisión visual pendiente en Docker.
- [x] 6.4 Regresión de rotura: `HAND_MULT=1.5` (tablones 1.5 s, obsidiana 9 s) y `BEDROCK` inviolable con y sin pico; resto de la suite (avatar, migrate, terrain, protocolo) sin cambios. Verificación: `cd server; npm test` en verde (exit 0).

## Workflow follow-up

- Archivar el change cuando la revisión del proyecto esté satisfecha.
- Opcional: si se quiere documentar la fórmula fuera del código, sumar el multiplicador/times a la ayuda o a un `docs/` del proyecto (no existe hoy).
