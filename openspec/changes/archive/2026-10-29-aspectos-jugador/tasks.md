# Tasks

## 1. RED: tests que fallan primero

- [x] 1.1 Crear `server/test/skins.mjs` con el patrón de `client-robot.mjs`: extraer el bloque `/* skins:start */…/* skins:end */` y evaluarlo con `new Function` **sin THREE**; verificar que el archivo corre (`node test/skins.mjs`) y falla por bloque ausente, no por error de sintaxis del test.
- [x] 1.2 En `server/test/skins.mjs` agregar los asserts del catálogo: exactamente 6 ids, `PLAYER_SKINS` con 5 y sin `robot`, etiquetas no vacías, `BASE_H === 1.97`, `human.height === 1.97`, `zombie.height === 1.97`, `fat.height === 1.70`, `giant.height === 5`, `small.height === 0.9`, `robot.height === 1.90`, y `scale === height/BASE_H` en `giant`/`small` con `scale === 1` en el resto; verificar que fallan con el `index.html` actual.
- [x] 1.3 En `server/test/skins.mjs` agregar los asserts de `resolveSkin` (válidos se conservan, incluido `robot`; ausente/`''`/`null`/`42`/`{}`/`dragon` ⇒ `human`) y de las alturas derivadas (`human` ⇒ 2.45/2.1/1.7/2.2, `giant` ⇒ 5.48/5.13/4.73/5.23, `small` ⇒ 1.38/1.03/0.63/1.13, orden monótono, y `Math.abs(scale*BASE_H - height) < 1e-9`); verificar que fallan.
- [x] 1.4 En `server/test/skins.mjs` agregar los estáticos de cableado: `makeAvatar` usa `resolveSkin` y el catálogo para etiqueta/barra, tiene ramas `fat`/`giant`/`small`/`zombie` y conserva la de `robot`; las mallas siguen entrando a `avatarTargets`; `addRemote`/`applyPm` guardan `resolveSkin(...)` y no el string crudo; `greetRemote` y el `hitok` usan los helpers de altura. Verificar que fallan.
- [x] 1.5 En `server/test/skins.mjs` agregar los estáticos de menú y red: `#skinPicker` con cinco `data-skin` de jugador y sin `data-skin="robot"`, uso de `localStorage` con clave `mc-skin`, y `skin:` en el `hello` de `connectMP`. Verificar que fallan.
- [x] 1.6 En `server/test/bot-cazador.mjs` agregar el caso `BOT_SKIN`: con `createBotClient({ skin:'giant' })` el `hello` sale con `skin:'giant'` y sin `skin`/`BOT_SKIN` sale con `'robot'`, usando el WebSocket falso existente. Verificar que el caso nuevo falla.

## 2. GREEN: catálogo y helpers puros

- [x] 2.1 Crear el bloque `/* skins:start */…/* skins:end */` en `index.html` antes del bloque robot, con `BASE_H = 1.97`, `SKIN_SPECS` (id, `label`, `height`, `scale`, colores), `PLAYER_SKINS`, `DEFAULT_SKIN`, `resolveSkin`, `skinSpec`; verificar que los asserts de catálogo y fallback de `node test/skins.mjs` pasan.
- [x] 2.2 Agregar al bloque los helpers de altura `avatarTagY` (`+0.48`), `avatarBarY` (`+0.13`), `avatarGreetY` (`-0.27`), `avatarDamageY` (`+0.23`) derivados de `spec.height`; verificar que los asserts de alturas pasan (en particular `human` = 2.45/2.1/1.7/2.2).

## 3. GREEN: modelos por aspecto en `makeAvatar`

- [x] 3.1 Refactorizar `makeAvatar(id,name,admin,skin)` para resolver el aspecto con `resolveSkin` y guardar `a.skin` con el id resuelto, sin cambiar la firma ni las piezas expuestas; hacer lo mismo en `addRemote` y `applyPm` (`a.skin = resolveSkin(m.skin)`), nunca guardar el string crudo; verificar que `node test/client-robot.mjs`, `node test/avatar.mjs` y `node test/avatar-held.mjs` siguen verdes.
- [x] 3.2 Implementar el modelo `fat` (torso ancho con panza, brazos y piernas rechonchos, 1.70 de alto) manteniendo `armL/armR/legL/legR` y las mallas en `avatarTargets`; verificar los estáticos de `skins.mjs` y que el avatar anima/muere/levanta el arma (revisión en navegador con dos clientes).
- [x] 3.3 Implementar `giant` y `small` con un sub-grupo `body` escalado (`5.00/1.97 ≈ 2.538` y `0.90/1.97 ≈ 0.457`), dejando `g` sin escalar; verificar en `skins.mjs` que `Math.abs(scale*BASE_H - height) < 1e-9` y que etiqueta/barra quedan fuera del sub-grupo.
- [x] 3.4 Implementar `zombie` con paleta verde, ropa oscura y ojos rojos emisivos fuera de `mats`, conservando nombre, barra, arma y animaciones sobre el mismo rig de 1.97; verificar en `skins.mjs` los estáticos de la rama y en navegador que el flash de daño no apaga los ojos.
- [x] 3.5 Agregar al `README.md` la tabla de aspectos (id, etiqueta, altura y factor `f` de escala) con las alturas del catálogo (1.97/1.70/5.00/0.90/1.97/1.90) y verificar que coincide con `SKIN_SPECS` leyendo ambos.

## 4. GREEN: alturas de etiqueta, barra, saludo y daño

- [x] 4.1 En `makeAvatar` reemplazar `tag.position.y=2.45` y `bar.position.y=2.1` por `avatarTagY(spec)` y `avatarBarY(spec)`; verificar en navegador que `human` sigue en 2.45/2.10 y que `giant` queda en 5.48/5.13 y `small` en 1.38/1.03.
- [x] 4.2 En `greetRemote` usar `avatarGreetY(skinSpec(a.skin))` en vez de `+1.7`; verificar que `human` sigue en 1.70, `giant` en 4.73 y `small` en 0.63.
- [x] 4.3 En el `hitok` usar `avatarDamageY(skinSpec(a.skin))` en vez de `+2.2`; verificar que `human` sigue en 2.20, `giant` en 5.23 y `small` en 1.13.

## 5. GREEN: selector del menú, persistencia y `hello`

- [x] 5.1 Agregar `#skinPicker` al `#menu .card` con cinco botones (`human`, `fat`, `giant`, `small`, `zombie`), estado seleccionado visible (`aria-checked`/`.on`) y `#skinHint` aclarando que el aspecto es cómo lo ven los demás; verificar los estáticos de menú de `skins.mjs`.
- [x] 5.2 Implementar `mySkin`, el handler de selección y la persistencia en `localStorage` con clave `mc-skin`; verificar recargando la página que la elección se mantiene y que un valor inválido guardado arranca en `human`.
- [x] 5.3 Restaurar `mc-skin` al boot aceptando sólo `PLAYER_SKINS` (un `robot` guardado a mano ⇒ `human`); verificar abriendo el menú con `localStorage` manipulado.
- [x] 5.4 Agregar `skin: mySkin` al `hello` de `connectMP` y verificar los estáticos de `skins.mjs` más, en navegador con dos pestañas, que el otro jugador ve el aspecto elegido.

## 6. GREEN: `BOT_SKIN`

- [x] 6.1 En `bot/index.js` reemplazar la constante `SKIN='robot'` por `const skin = cfg.skin || process.env.BOT_SKIN || 'robot'` y usarla en el `hello`; verificar el caso nuevo de `node test/bot-cazador.mjs`.
- [x] 6.2 Agregar `BOT_SKIN: ${BOT_SKIN:-robot}` al `environment` del servicio `minicraft-bot` en `docker-compose.yml`; verificar con `docker compose config` que el valor por defecto es `robot` y que `BOT_SKIN=giant` lo sobreescribe.
- [x] 6.3 Documentar `BOT_SKIN` en la tabla de variables del bot del `README.md` (default `robot`, valores aceptados y passthrough de compose) y verificar que el comando de ejemplo del README arranca el bot con la variable.

## 7. Cierre de la suite

- [x] 7.1 Agregar `node test/skins.mjs` a `scripts.test` de `server/package.json`; verificar que aparece exactamente una vez.
- [x] 7.2 Actualizar los dos listados hardcodeados de 17 a 18: `server/test/lookguard.mjs` (array, `count === 18` y comentario) y `server/test/zombie-protocol.mjs` (array y texto de “18 archivos”); verificar con `node test/lookguard.mjs`.
- [x] 7.3 Correr `cd server && npm test` y verificar que los 18 archivos quedan verdes, sin correr Docker (la aprobación en Docker la hace el orquestador después).

## 8. RED: tests de cámara en tercera persona

- [x] 8.1 Crear `server/test/camera.mjs` con el patrón de `skins.mjs`: extraer el bloque `/* camera:start */…/* camera:end */` y evaluarlo con `new Function` **sin THREE**; verificar que corre (`node test/camera.mjs`) y falla por bloque ausente, no por error de sintaxis.
- [x] 8.2 En `server/test/camera.mjs` agregar los asserts de constantes y modo: `CAM_DIST === 4.5`, `CAM_MIN === 0.6`, `camModeOf('third') === 'third'` y `camModeOf` de `'first'`, `''`, `null`, `undefined`, `'Tercera'` y `42` ⇒ `'first'`; verificar que fallan con el `index.html` actual.
- [x] 8.3 En `server/test/camera.mjs` agregar los asserts de `camOffset` (módulo igual a la distancia; `yaw=0,pitch=0` ⇒ detrás en +Z; `yaw=π/2` ⇒ +X; pitch positivo baja la cámara) y de `clampCam` (`4.5,null` ⇒ 4.5; `4.5,2` ⇒ 1.75; `4.5,0.7` ⇒ 0.6; `4.5,10` ⇒ 4.5); verificar que fallan.
- [x] 8.4 En `server/test/camera.mjs` agregar los estáticos de cableado: handler `KeyV`, `#btnCam`, clave `mc-cam`, avatar local creado con `{pvp:false,hud:false}` y fuera de `avatarTargets`/`remotes`, `tickSword`/`tickPick` condicionados por `camMode==='first'`, `raycast`/`avatarHit`/`zombieHit`/`animalHit` desde `eyePos()`, `tickWater` desde el ojo y `physicsGravity` usando `camMode`. Verificar que fallan.

## 9. GREEN: cámara, avatar local e interacción desde el ojo

- [x] 9.1 Crear el bloque `/* camera:start */…/* camera:end */` en `index.html` con `CAM_DIST=4.5`, `CAM_MIN=0.6`, `camModeOf(saved)`, `camOffset(yaw,pitch,dist)` y `clampCam(dist,hit)`; verificar que los asserts puros de `node test/camera.mjs` pasan.
- [x] 9.2 Implementar el estado `camMode`, el toggle con `V` (mismas guardas que `P`/`E`/`F`, sin abrir nada ni mover al jugador), la pill `#btnCam` en la topbar con `aria-pressed`/`title` y la persistencia en `localStorage` `mc-cam` restaurada al boot; verificar recargando la página y en táctil que el botón alterna.
- [x] 9.3 Agregar `eyePos()` y usarlo como origen de `raycast`, `avatarHit`, `zombieHit`, `animalHit` y `tickWater`, conservando `maxD`/`far` (8/4.6/6); verificar que romper, poner, golpear y el overlay de agua funcionan igual en 1ª y en 3ª.
- [x] 9.4 En `physicsGravity`, posicionar la cámara orbital (`eye − lookDir·dist`, sin bob en 3ª) con recorte por DDA de grilla contra sólidos (`hit−0.25`, mínimo 0.6) y rotación yaw/pitch intacta; verificar en navegador que no atraviesa paredes, techos ni piso al girar y al retroceder.
- [x] 9.5 Agregar a `makeAvatar` el quinto parámetro `opts={pvp:true,hud:true}`: `pvp:false` no registra mallas en `avatarTargets` y `hud:false` no crea etiqueta ni barra (con `poseDead` tolerando `bar` ausente); verificar que los remotos y `client-robot.mjs`/`avatar.mjs`/`avatar-held.mjs` siguen verdes.
- [x] 9.6 Crear el avatar local al iniciar la partida con `mySkin`, actualizarlo por frame con posición/yaw directos (sin lerp), `held` de la hotbar y gesto por `swingSeq`, y ocultarlo en 1ª persona y al morir (`visible = camMode==='third' && !dead`); verificar en navegador con `human`, `giant` y `small`.
- [x] 9.7 Condicionar `tickSword`/`tickPick` a `camMode==='first'` para ocultar el viewmodel en 3ª; verificar que en 1ª se ve y anima igual que antes y que en 3ª no hay arma flotante.
- [x] 9.8 Agregar `V` (cámara 1ª/3ª) a la tabla de controles del `README.md` y verificar que coincide con la tecla implementada.
- [x] 9.9 Agregar `node test/camera.mjs` a `scripts.test` de `server/package.json` y subir de 18 a 19 los dos listados hardcodeados (`server/test/lookguard.mjs` con `count === 19` y su comentario, y `server/test/zombie-protocol.mjs` con el texto “19 archivos”); verificar con `node test/lookguard.mjs`.
- [x] 9.10 Correr `cd server && npm test` y verificar que los 19 archivos quedan verdes, sin correr Docker (la aprobación en Docker la hace el orquestador después).

## 10. RED: escala de jugabilidad

Estas tareas revisan y amplían lo ya implementado en los grupos 8–9: los valores fijos de cámara de 8.2/8.3 pasan a derivarse del aspecto (10.3) y se suman los tests de física, alcances y daño propio.

- [x] 10.1 En `server/test/skins.mjs` agregar los asserts puros de `sizeFactor`, `playerBox`, `eyeHeight` y `reachFor`: `human`/`zombie` 1, `fat` ≈0.86294, `giant` ≈2.53807, `small` ≈0.45685, `robot` ≈0.96447; cajas `human` exacta 0.3/1.8, `giant` ≈0.761/4.568, `small` ≈0.137/0.822, `fat` ≈0.259/1.553; ojos `human` 1.62, `giant` ≈4.112, `small` ≈0.740; alcances `human` 8/4.6/6, `giant` ≈20.305/11.675/15.228, `small` ≈3.655/2.102/2.741. Verificar que fallan con el `index.html` actual.
- [x] 10.2 En `server/test/skins.mjs` agregar los estáticos de cableado: `collides` y `slabBlocked` usan `playerBox(mySkin)`, `findSpawn` exige `max(4, ceil(h))` de aire y llama a `collidesAt(...,r,h)`, `pushLocalOutOfBlock`/`outOfCell` reciben la caja, `ocupadoPor` usa `playerBox(mySkin)` y `playerBox(a.skin)`, `raycast`/`avatarHit`/`zombieHit`/`animalHit` usan `reachFor`, y el `spawnDmgNum` propio usa `spec.height + 0.33`. Verificar que fallan.
- [x] 10.3 En `server/test/camera.mjs` agregar los asserts de `clampCam` con mínimo escalado (`0.6*f`: human 0.6, giant ≈1.523, small ≈0.274; margen `hit−0.25` intacto) y los estáticos de `physicsGravity` con `eyeHeight(mySkin)`, bob `0.05*f`, `CAM_DIST*f` y `CAM_MIN*f`, más la cámara de muerte con `eyeHeight` y `0.32*f`. Verificar que fallan.
- [x] 10.4 En `server/test/skins.mjs` importar `server/skins.js` y comparar `SKIN_SIZE` con `spec.height / BASE_H` del bloque `/* skins:start */` del cliente (mismos factores para los 6 aspectos), y verificar `swordReach('human') === 4.6`, `swordReach('giant') > 11.6` y `swordReach('small') < 2.2`. En `server/test/zombie.mjs` agregar el caso de `createHorde`/`hit`: un `giant` a 8 bloques es aceptado y un `human` a 8 es rechazado. Verificar que ambos fallan con el server actual.

## 11. GREEN: escala de jugabilidad en el cliente

- [x] 11.1 En `index.html`, dentro del bloque `/* skins:start */…/* skins:end */`, agregar los helpers puros `sizeFactor(skin)`, `playerBox(skin)`, `eyeHeight(skin)` y `reachFor(skin, kind)` con `BASE_H = 1.97`; verificar que los asserts puros de `node test/skins.mjs` pasan.
- [x] 11.2 En `index.html` reemplazar la caja fija `.3/1.8` por `playerBox(mySkin)` en `collides`, `slabBlocked`, `outOfCell` y `pushLocalOutOfBlock`, manteniendo `movePlayer` y el auto-step; verificar en navegador que `human` mide 0.3/1.8, `small` pasa por un hueco de 1 y `giant` no pasa por uno de 4.
- [x] 11.3 En `index.html` cambiar `findSpawn` para exigir `max(4, ceil(h))` bloques de aire y validar con `collidesAt(...,r,h)`, y usar la caja del aspecto también en el respawn y en el fallback de caída al vacío; verificar que `human`/`fat`/`small` exigen 4 (aunque `small` se mueva por huecos de 1) y `giant` exige 5 y no aparece en una cueva de 4.
- [x] 11.4 En `index.html` cambiar `eyePos()` a `1.62*f`, el bob de 1ª a `0.05*f` y la cámara de muerte a `eyeHeight(mySkin)` con caída hasta `0.32*f`; verificar `human` 1.62→0.32, `giant` ≈4.112→0.812 y `small` ≈0.740→0.146.
- [x] 11.5 En `index.html` multiplicar por `f` la cámara 3ª: `CAM_DIST*f` y `CAM_MIN*f`, manteniendo `hit−0.25` constante y sin bob; verificar que `clampCam` usa el mínimo del aspecto y que `giant`/`small` no atraviesan paredes.
- [x] 11.6 En `index.html` reemplazar los alcances fijos por `reachFor(mySkin, ...)`: `8*f` en `raycast`, `4.6*f` en `avatarHit`/`zombieHit`, `6*f` en `animalHit`; verificar que `human` conserva 8/4.6/6, que la 3ª persona sigue apuntando desde el ojo y que el servidor valida `zhit` con el mismo alcance del skin (tarea 11.10).
- [x] 11.7 En `index.html` cambiar `ocupadoPor` para usar `playerBox(mySkin)` en local y `playerBox(a.skin)` en cada remoto (ramas normal, escalera y puerta), y cambiar el `spawnDmgNum` propio a `pos.y + spec.height + 0.33`; verificar `human` 0.6×1.8/2.30, `giant` ≈1.523×4.568/5.33 y `small` ≈0.274×0.822/1.23.
- [x] 11.8 En `README.md` y en el texto de ayuda del menú, documentar que el tamaño del aspecto cambia ojo, caja y alcances (además de cómo te ven) y que la velocidad, el salto, la gravedad, el daño de caída y la vida no cambian; verificar que el texto coincide con la implementación.
- [x] 11.9 Correr `cd server && npm test` y verificar que los tests existentes siguen verdes y que los únicos rojos son los nuevos de 10.1–10.4 (todavía no hay código de servidor), sin archivo de test nuevo y sin correr Docker.
- [x] 11.10 Crear `server/skins.js` con `BASE_H = 1.97`, `SKIN_SIZE` (human/zombie 1, fat/giant/small/robot derivados de sus alturas), `sizeFactor(skin)` (desconocido ⇒ 1) y `swordReach(skin) = 4.6 * sizeFactor(skin)`. Cambiar `server/zombie.js` a `hit(playerId, zombieId, now, playerPos, skin)` usando `swordReach(skin)` (sin quinto parámetro ⇒ human 4.6, y `SWORD_REACH` sigue exportado como base) y pasar `me.skin` como quinto argumento en el handler `zhit` de `server/server.js`. Verificar con `node test/skins.mjs` y `node test/zombie.mjs` y después con `npm test` que los **19/19** archivos quedan verdes.

## 12. RED: cámara frontal

- [x] 12.1 En `server/test/camera.mjs` agregar los asserts puros de `camModeOf('front') === 'front'` y de que `camModeOf` con `first`, valores inválidos o basura devuelve `first`, y `nextCamMode('first') === 'third'`, `nextCamMode('third') === 'front'`, `nextCamMode('front') === 'first'` y un valor inválido ⇒ `third`. Verificar que fallan con la implementación actual de dos estados.
- [x] 12.2 En `server/test/camera.mjs` agregar `camOffset` con signo negativo: `camOffset(0, 0, -4.5)` ⇒ `[0, 0, -4.5]` (delante) y con `yaw=π/2` ⇒ `[-4.5, 0, 0]`; conservar los casos de la trasera y verificar que el módulo sigue siendo `4.5`. Verificar que fallan si la frontal reusa el signo positivo.
- [x] 12.3 En `server/test/camera.mjs` agregar los estáticos del branch frontal de `physicsGravity`: `camMode==='front'` usa `camOffset(..., -CAM_DIST*f)`, DDA desde el ojo hacia adelante (`lookDir`), `clampCam` con `CAM_MIN*f` y `hit−0.25`, rotación `rotateY(yaw+π)`/`rotateX(-pitch)` y sin bob. Verificar que fallan.
- [x] 12.4 En `server/test/camera.mjs` agregar los estáticos de presentación y persistencia: avatar local con `g.visible = camMode!=='first' && !dead`, `tickSword`/`tickPick` con `camMode==='first'`, `mc-cam` con `front`, y `#btnCam` con tres `title`/`aria-pressed` y `.on` en `third`/`front` (no en `first`). Verificar que fallan y que la suite sigue en 19 archivos.

## 13. GREEN: cámara frontal

- [x] 13.1 En `index.html`, dentro del bloque `/* camera:start */…/* camera:end */`, ampliar el estado a `camMode ∈ {first, third, front}`, con `camModeOf` aceptando `third`/`front` (resto ⇒ `first`) y `nextCamMode` con el ciclo `first → third → front → first` (inválido ⇒ `third`). Verificar los asserts puros de `node test/camera.mjs`.
- [x] 13.2 En `physicsGravity` agregar el branch frontal: posición `eye + camOffset(yaw, pitch, -CAM_DIST*f)`, DDA hacia adelante desde el ojo, recorte `clampCam` con `CAM_MIN*f` y `hit−0.25`, rotación `rotateY(yaw+π)`/`rotateX(-pitch)` y sin bob; conservar intactas la trasera, la 1ª y la cámara de muerte.
- [x] 13.3 Cambiar la visibilidad del avatar local a `camMode!=='first' && !dead` (se ve de espaldas en trasera y de frente en frontal) y mantener `tickSword`/`tickPick` visibles sólo con `camMode==='first'`.
- [x] 13.4 Hacer que `V` y `#btnCam` usen `nextCamMode` y actualizar `#btnCam` en los tres estados: `title` de 1ª/3ª trasera/3ª frontal, `aria-pressed` verdadero en `third`/`front`, falso en `first`, y `.on` sólo en no-1ª. Actualizar el `#hint` para decir “V cámara 1ª/3ª trasera/3ª frontal”.
- [x] 13.5 Actualizar `README.md`: la tabla de controles y la nota de cámara pasan de “1ª/3ª” a “1ª/3ª trasera/3ª frontal”, y aclarar que el frontal es de vanidad (el crosshair no coincide con la mirada; se vuelve con `V`).
- [x] 13.6 Correr `cd server && npm test` y verificar que los **19/19** archivos quedan verdes, sin archivo de test nuevo y sin correr Docker (la aprobación en Docker la hace el orquestador después).

## Workflow follow-up

- Levantar Docker con `docker compose up --build -d` y pedir aprobación explícita del usuario. Probar con dos clientes:
  - `small`: entra por un hueco de 1 bloque, su cámara queda baja y sus alcances (≈3.655/2.102/2.741) son cortos.
  - `giant`: no entra por un techo de 4, sí por uno de 5, y rompe/coloca desde lejos (≈20.305).
  - `human`: no cambió nada (0.3/1.8, ojo 1.62, 8/4.6/6, 4.5 de cámara, daño propio 2.30).
  - Cámara `V`/`#btnCam`, agua y PvP en 3ª trasera y frontal, y el bot; opcionalmente `BOT_SKIN=giant docker compose up --build -d`.
  - Presionar `V` tres veces: 1ª → 3ª trasera → 3ª frontal → 1ª. En frontal ver la cara del avatar, comprobar que la cámara no atraviesa la pared de adelante, que el viewmodel no aparece y que romper/poner/golpear siguen saliendo del ojo y la mirada (el crosshair no coincide: es esperado).
  - Golpear un zombi a ~8 bloques parado como `giant`: el golpe entra (alcance ≈11.675) y el zombi pierde vida; repetir como `human`: el servidor rechaza el golpe (alcance 4.6) y el zombi no pierde vida.
- Al aprobar: `docker compose down`, commit en español (`feat(camera):`), push a `main` y `openspec archive aspectos-jugador`.
