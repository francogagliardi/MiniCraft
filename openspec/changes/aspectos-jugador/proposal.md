# Proposal

## Why

Hoy un jugador remoto solo puede verse como humano (o robot si es el bot): no hay forma de elegir
cómo lo ven los demás. Agregar aspectos seleccionables da identidad visual al multijugador sin
tocar el protocolo, y permite que el bot use cualquier aspecto nuevo con una variable de entorno.
El tamaño del aspecto tampoco puede ser solo cosmético: si el gigante mide cinco bloques, su ojo,
su caja de colisión y sus alcances tienen que acompañar al modelo para que el juego sea coherente.
Además, como el cliente juega en primera persona, el jugador nunca ve su propio aspecto: se agregan
una vista en tercera persona trasera y una vista frontal opcionales para poder verse a sí mismo, de
espaldas o de cara.

## What Changes

- Se agrega un **catálogo declarativo de 6 aspectos** (`human`, `fat`, `giant`, `small`, `zombie`,
  `robot`) con altura y proporciones propias. `human` sigue siendo el default y `robot` se conserva
  tal cual para el bot cazador. La altura real del rig humano (cabellera incluida) es **`BASE_H = 1.97`**,
  no 1.9: `human` y `zombie` declaran 1.97.
- `makeAvatar` pasa a construir el modelo a partir del catálogo: `fat` (más ancho, panza,
  extremidades rechonchas, 1.70 de alto, geometría propia), `giant` (**exactamente 5.00** de alto,
  escala `5.00/1.97`), `small` (**0.90** de alto, escala `0.90/1.97`) y `zombie` (piel verde, ojos
  rojos brillantes, ropa oscura, mismo rig de 1.97, conservando nombre, barra, arma y animaciones).
- Los aspectos escalan la **jugabilidad** de forma proporcional al tamaño: con `BASE_H = 1.97` y
  `f = altura / BASE_H`, la caja local pasa a `r = 0.3*f` / `h = 1.8*f`, el ojo a `1.62*f`, los
  alcances a `8*f` (bloques), `4.6*f` (jugadores/zombis) y `6*f` (animales), y la cámara 3ª a
  `4.5*f` con mínimo `0.6*f`. `human` conserva exacto 0.3/1.8, ojo 1.62 y 8/4.6/6; `giant`
  (≈0.761/4.568, ojo ≈4.112) no entra en un hueco de 4 de alto pero sí en uno de 5, y `small`
  (≈0.137/0.822, ojo ≈0.740) pasa por un hueco de 1 bloque.
- La **colisión, la aparición y la colocación** usan la caja del aspecto: `collides`, `slabBlocked`,
  `findSpawn`, `pushLocalOutOfBlock` y el chequeo de solape al colocar bloques. `findSpawn` exige
  `max(4, ceil(h))` bloques de aire (human/fat/small 4, giant 5) y cada remoto bloquea con su propia
  caja.
- El **número de daño propio** deja de estar fijo en `pos.y+2.3` y pasa a
  `pos.y + spec.height + 0.33` (human 2.30, giant 5.33, small 1.23).
- El **nombre, la barra de vida, los corazones del saludo y los números de daño** dejan de estar
  hardcodeados: se derivan de la altura (“top”) de cada aspecto del catálogo, calibrados para que
  `human` conserve exactamente 2.45 / 2.10 / 1.70 / 2.20.
- El **menú inicial** gana un selector de 5 aspectos para jugadores (`robot` no aparece ahí) con
  estado seleccionado visible y aclaración de que el aspecto define cómo lo ven los demás y que su
  tamaño cambia ojos, caja y alcances. La elección se persiste en `localStorage` (`mc-skin`) y se
  envía en el `hello`.
- **Protocolo aditivo**: `skin` ya viaja en `hello`/`join`/`welcome.players`/`pm`; no se agregan
  mensajes ni campos. Un valor ausente o desconocido se resuelve a `human` en el cliente.
- El bot acepta **`BOT_SKIN`** (default `robot`) y lo manda en su `hello`; no hay whitelist en el
  server (`cleanSkin` sigue saneando) y el cliente resuelve desconocidos a `human`.
- Se agrega una **cámara en tercera persona trasera y frontal** (tecla `V` en PC y botón `#btnCam`
  en la topbar, también táctil) con el ciclo **1ª → 3ª trasera → 3ª frontal → 1ª**. Arranca en
  **1ª persona** y la elección persiste en `localStorage` (`mc-cam`: `first`/`third`/`front`;
  ausente o inválida ⇒ `first`).
- En 3ª persona (trasera y frontal) se renderiza un **avatar local** con el aspecto elegido
  (`mySkin`), animado y con el arma de la hotbar en mano; en la frontal se le ve la cara. No entra a
  `avatarTargets` (no se puede golpear a sí mismo ni bloquear el raycast de un remoto) y no lleva
  nombre ni barra. Se oculta en 1ª persona y al morir.
- La cámara trasera va **detrás del ojo** a `4.5*f` bloques y la frontal va **delante** a la misma
  distancia, mirando al jugador (`yaw+π`, `-pitch`). Ambas se **recortan** si hay un bloque sólido en
  el medio (`hit − 0.25` constante, mínimo `0.6*f`); la frontal usa DDA hacia adelante para no
  atravesar la pared de enfrente. La trasera sigue yaw/pitch y alinea el crosshair; en 1ª persona el
  ojo y el bob usan `1.62*f` y `0.05*f`.
- Los **raycasts de interacción y combate** (`raycast`, `avatarHit`, `zombieHit`, `animalHit`) y la
  detección de **agua sumergida** se originan en el **ojo del jugador** con alcances derivados del
  aspecto (`8*f`, `4.6*f`, `6*f`), en las tres perspectivas. La 3ª frontal es **de vanidad**: la
  cámara mira al jugador, el crosshair no coincide con la mirada y las acciones siguen saliendo del
  ojo y de la mirada, sin remapearse ni bloquearse.

## Capabilities

### New Capabilities

- `ui/skins`: selector de aspecto en el menú inicial, estado seleccionado, persistencia local y
  envío del aspecto en el `hello`, con la aclaración de que el aspecto se ve en los demás y de que
  su tamaño cambia ojos, caja y alcances.
- `ui/camera`: perspectiva 1ª / 3ª trasera / 3ª frontal con tecla y botón, default y persistencia,
  órbita trasera y frontal con colisión escalada por aspecto, avatar local con el aspecto elegido,
  viewmodel oculto fuera de 1ª y origen de raycasts/agua en el ojo.

### Modified Capabilities

- `net/avatar`: el aspecto deja de ser “humano o robot” y pasa a ser un catálogo de 6 modelos con
  altura propia; se agregan las alturas derivadas para nombre, barra, saludo y daño, y el fallback
  explícito a `human` para valores desconocidos.
- `player/physics`: la caja de colisión, la altura de ojos, la aparición/desatasco, el bob y la
  caída de la cámara de muerte se derivan del tamaño del aspecto.
- `player/combat`: el alcance de golpe a jugadores, zombis y animales se deriva del tamaño.
- `player/mining`: el alcance de rotura de bloques se deriva del tamaño.
- `blocks/placement`: el rechazo de celdas ocupadas usa la caja de cada aspecto (local y remotos) y
  el alcance de colocación se deriva del tamaño.
- `bots/hunter`: el aspecto del bot deja de ser la constante `robot` y pasa a configurarse por
  `BOT_SKIN` (default `robot`), aceptando los aspectos nuevos sin romper el contrato existente.

## Impact

- `index.html`: bloque nuevo `/* skins:start */…/* skins:end */` (catálogo + helpers puros
  `sizeFactor`, `playerBox`, `eyeHeight` y `reachFor`), `makeAvatar`, `addRemote`/`applyPm`
  (resolución de skin), `greetRemote`, el daño flotante de `hitok` y `spawnDmgNum`, el menú inicial
  y `connectMP` (`hello` con `skin`). Para la cámara y la física: bloque
  `/* camera:start */…/* camera:end */` (helpers puros, `camModeOf`, `nextCamMode` y el branch
  frontal), `physicsGravity` (ojo, bob, órbita trasera y frontal),
  `collides`/`collidesAt`/`slabBlocked`/`movePlayer`/`outOfCell`/`pushLocalOutOfBlock`,
  `findSpawn`, `ocupadoPor`/`entSolapa`, avatar local, `tickSword`/`tickPick`,
  `raycast`/`avatarHit`/`zombieHit`/`animalHit`, `tickWater`, la topbar (`#btnCam`) y el handler de
  teclado (`V`).
- `server/skins.js`: **nueva fuente server-side** del factor de tamaño (`BASE_H = 1.97`,
  `SKIN_SIZE` por aspecto, `sizeFactor(skin)` con fallback 1 y `swordReach(skin) = 4.6 * sizeFactor`).
- `server/zombie.js`: `hit(playerId, zombieId, now, playerPos, skin)` usa `swordReach(skin)` para
  validar el golpe; el quinto parámetro es opcional y sin él se comporta como `human` (4.6).
  `SWORD_REACH` sigue exportado como base.
- `server/server.js`: en el handler `zhit` pasa el skin declarado del jugador (`me.skin`) como quinto
  argumento, para que el servidor valide con el mismo alcance que apunta el cliente.
- `bot/index.js`: `BOT_SKIN` con default `robot`, inyectable por `cfg.skin` para tests.
- `docker-compose.yml`: passthrough `BOT_SKIN: ${BOT_SKIN:-robot}` en el servicio `minicraft-bot`.
- `README.md`: tabla de aspectos, variable `BOT_SKIN` (incluido el passthrough de compose), `V`
  (1ª/3ª trasera/3ª frontal) en la tabla de controles, el `#hint` con el ciclo y una nota de que el
  tamaño cambia ojo, caja y alcances y de que el frontal es de vanidad.
- Tests: se **extienden** `server/test/skins.mjs` (helpers puros, deriva con `server/skins.js` y
  estáticos de física/alcances), `server/test/camera.mjs` (cámara escalada y frontal) y
  `server/test/zombie.mjs`
  (giant a 8 bloques aceptado, human a 8 rechazado); no hay archivo nuevo y la suite queda en 19.
  `bot-cazador.mjs` suma el caso `BOT_SKIN`; `server/package.json` y los dos listados hardcodeados
  de tests (`lookguard.mjs`, `zombie-protocol.mjs`) pasan de 17 a 18 y luego a 19 archivos.
- El servidor **escala su validación de alcance contra zombis** con el skin declarado por el jugador
  (`4.6*f`); el resto de la IA server-side (detección, ataque, deambulación) y el PvP no cambian. La
  física del cliente cambia solo en las dimensiones derivadas del aspecto (caja, ojo, alcances), no
  en velocidad, salto, gravedad ni vida.

## Out of Scope

- **No** hay órbita libre con el mouse en 3ª persona: la trasera mantiene yaw/pitch del jugador y
  alinea el crosshair; la frontal mira al jugador y no tiene apuntado propio.
- **No** hay vista de hombro ni offset lateral: la cámara va centrada detrás o delante del ojo.
- **No** se remapean las acciones a la cámara frontal ni se bloquean: el frontal es de vanidad y el
  crosshair no coincide con la mirada (se vuelve a 1ª con `V`).
- **No** se escalan **velocidad, salto, gravedad, daño de caída ni vida**: solo cambian las
  magnitudes ligadas al tamaño (ojo, caja, alcances y cámara 3ª).
- **No** cambian las **IA server-side** de zombis ni del bot: sus rangos de detección, ataque y
  deambulación siguen iguales; el bot con `BOT_SKIN=giant` se ve gigante pero su IA no cambia.
- **No** se agrega anti-cheat nuevo: el servidor solo deriva el alcance del golpe a zombis del skin
  declarado, con el mismo modelo de confianza que ya usa para el render (el skin lo declara el
  cliente). El PvP sigue relayándose sin validar distancia.
- **No** se agrega un modelo o catálogo nuevo: el avatar local reutiliza `makeAvatar` y `SKIN_SPECS`,
  y `server/skins.js` replica los mismos factores.
- **No** se toca la cámara de muerte en su comportamiento de animación (solo escala su altura) ni el
  protocolo (un cliente viejo sigue funcionando igual).
