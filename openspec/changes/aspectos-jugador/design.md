# Design

## Context

Ver `proposal.md` — Why. Estado actual **verificado** en el código, que condiciona el enfoque:

- **Cliente único** `index.html`: la modularidad se hace con bloques marcados que los tests extraen y
  evalúan con `new Function` (`/* worldgen:start */`, `/* robot:start */`, `/* net/avatar:start */`,
  `/* look:start */`). Un bloque nuevo tiene que ser autocontenido y **evaluable sin THREE** si se
  quiere testear la lógica pura.
- `makeAvatar(id,name,admin,skin)` (`index.html:1942`) decide `const robot = skin==='robot'` y tiene
  dos ramas: robot (`makeRobotModel`) y humano (cajas con `B(...)`). El grupo `g` es a la vez el
  modelo, el nodo de posición/rotación y el padre de la etiqueta y la barra, que hoy están fijas en
  `tag.position.y=2.45` y `bar.position.y=2.1`.
- Todos los avatares remotos comparten el mismo esqueleto de animación: `tickAvatar` (`:2093`) rota
  `armL/armR/legL/legR`, `poseDead` (`:2086`) inclina `g` y el arma cuelga de `armR` sin entrar a
  `avatarTargets`.
- `makeZombie(id)` (`:2149`) ya tiene la paleta verde, la ropa oscura y ojos rojos con
  `MeshBasicMaterial` fuera de `mats`; sirve de referencia para el aspecto `zombie`, pero el avatar
  `zombie` debe conservar nombre, barra, arma y animaciones.
- Alturas hoy hardcodeadas alrededor del avatar: etiqueta `2.45`, barra `2.1`, corazones del saludo
  `+1.7` (`greetRemote`, `:2396`), daño flotante del `hitok` `+2.2` (`:2693`). **El modelo humano no
  mide 1.9**: la cabellera es `B(.44,.14,.44,…,0,1.9,0)` ⇒ top real `1.9 + 0.14/2 = 1.97` (la cabeza
  llega a 1.86). Con `BASE_H = 1.97`, los valores actuales equivalen a `top+0.48`, `top+0.13`,
  `top-0.27` y `top+0.23`.
- **Protocolo**: `skin` ya viaja en `hello`→sesión, `join`, `welcome.players` y `pm`
  (`server.js:278-307`). `cleanSkin` (`server.js:163`) sanea (minúsculas, `[a-z0-9_-]`, máx 16) y
  default `human`. **No hace falta tocar el server.**
- **Persistencia local** existente: `minicraft-save-v3` (mundo solo), `mc-shadows` (sombras) y
  `mc-skin` (aspecto), con restauración al boot cerca de `:2816`/`:600`. El `hello` sale de
  `connectMP` (`:2731`). La nueva clave de cámara es independiente (`mc-cam`).
- **Física y alcances actuales**: `collidesAt(px,py,pz,r,h)` (`:1587`) ya recibe caja, pero
  `collides` la fija en `.3/1.8` (`:1598`), `slabBlocked` usa `r=.3` (`:1600`), `movePlayer` llama a
  `collides` (`:1616`), `findSpawn` exige **4** celdas de aire y `collidesAt(...,.3,1.8)`
  (`:1776`), `pushLocalOutOfBlock` usa `outOfCell(...,.3,1.8)` (`:2242`) y `ocupadoPor` usa `.3/1.8`
  para el jugador local y para cada remoto (`:2474`). El `player` no guarda una altura: la caja se
  pasa en cada llamada. `eyePos()` fija `+1.62` (`:1538`), la cámara 1ª usa `+1.62+sin(bob)*.05`
  (`:1724`), la cámara de muerte interpola `1.62→0.32` (`:3109`), el daño propio sale de
  `player.pos.y+2.3` (`:2867`) y los alcances están fijos en `8` (bloques), `4.6`
  (`avatarHit`/`zombieHit`) y `6` (`animalHit`).
- **Cámara actual**: `physicsGravity` (`:1688-1727`) fija cada frame la cámara; `lookDir()`
  (`:1690`) deriva el vector de mirada. `raycast(maxD=8)` (`:1759`) hace **DDA de grilla** desde
  `eyePos()`, igual que `avatarHit` (`:2310`), `zombieHit` (`:2413`) y `animalHit` (`:2419`) con
  `far` 4.6/6; `tickWater` (`:3092`) evalúa la celda del ojo. La cámara de muerte
  (`:3109`) interpola su altura de forma independiente y no se toca salvo para escalarla.
- **Viewmodel**: `swordG`/`pickG` cuelgan de `camera` (`:958-977`) y `tickSword`/`tickPick`
  (`:980-1011`) fijan `.visible` cada frame según la hotbar y `dead`.
- **Controles**: el handler `keydown` (`:1512-1536`) usa guardas de `state`/`canAct()`/`dead` para
  `E`, `P` y `F`; `V` no está usado. La topbar (`:234-240`) ya tiene pills (`#btnFly`, `#btnSound`,
  `#btnFull`) y `#btnSound` es el precedente de un botón que funciona en táctil.
- **Avatar remoto**: `makeAvatar(id,name,admin,skin)` (`:2002`) **siempre** registra sus mallas en
  `avatarTargets` y crea etiqueta + barra. Para el avatar local hay que poder desactivar ambas cosas
  sin duplicar el builder.
- **Tests**: scripts Node planos en `server/test/`, enumerados a mano en `server/package.json` y
  **contados en dos lugares hardcodeados**: `lookguard.mjs:167-176` y `zombie-protocol.mjs:302-309`
  (lista de 17 y `count === 17`). `bot-cazador.mjs` ya verifica `skin:'robot'` con WebSocket falso.

## Goals / Non-Goals

**Goals:**

- Un **catálogo declarativo** (`SKIN_SPECS`) como única fuente de verdad de ids, etiquetas, alturas y
  datos de modelo; `human` default y `robot` intacto.
- Modelos `fat`, `giant`, `small` y `zombie` construidos por `makeAvatar` sin cambiar su firma ni el
  contrato del avatar (mismas piezas, mismas animaciones, mismas mallas en `avatarTargets`).
- Alturas de etiqueta, barra, saludo y daño **derivadas** del catálogo, conservando exactamente los
  valores actuales para `human`.
- Selector de 5 aspectos en el menú con persistencia en `localStorage` (`mc-skin`) y `skin` en el
  `hello`.
- **Cámara 1ª / 3ª trasera / 3ª frontal** con `V` y botón táctil, default `first`, persistencia en
  `mc-cam`, órbita con colisión, avatar local con el aspecto elegido y frontal de vanidad sin cambiar
  el apuntado.
- **Tamaño = jugabilidad coherente**: caja, ojo, aparición, alcances y cámara 3ª derivados de `f`.
- Interacción (romper/poner/golpear) y agua **desde el ojo**, con alcances proporcionales al tamaño.
- Bot configurable por `BOT_SKIN` (default `robot`, `cfg.skin` inyectable).
- Cobertura TDD: catálogo, helpers de tamaño y de cámara testeados sin THREE; cableado verificado
  con estáticos.

**Non-Goals:**

- **No** se toca el protocolo: `skin` ya existe y ya se sanea; el servidor sólo escala la validación
  de `zhit` con `server/skins.js` (decisión 26).
- **No** se agrega anti-cheat ni whitelist en el server por el tamaño del aspecto.
- **No** se escalan velocidad, salto, gravedad, daño de caída ni vida: la altura solo cambia caja,
  ojo, alcances y cámara 3ª.
- **No** se cambian las IA server-side de zombis ni del bot: sus rangos de detección y ataque siguen
  iguales; `BOT_SKIN=giant` cambia el modelo, no la IA.
- **No** hay órbita libre con mouse, hombro lateral ni suavizado de cámara. La frontal no es una
  órbita libre: mira al jugador y no mueve el apuntado.
- **No** se toca el zombi server-authoritative (`makeZombie`, `server/zombie.js`) ni se convierte el
  aspecto `zombie` en una criatura.
- **No** se implementa nada en esta fase: sólo planning.

## Decisions

### 1. Catálogo declarativo en un bloque `/* skins:start */…/* skins:end */`

Un bloque nuevo, **antes** del bloque robot y de `makeAvatar`, con datos y helpers puros (sin THREE,
sin DOM, sin estado global del juego):

```js
const BASE_H = 1.97; // top real del rig humano: cabellera en y=1.9 con alto .14
const SKIN_SPECS = {
  human:  { label:'Humano',  height:BASE_H, scale:1,              colors:{...} },
  fat:    { label:'Gordo',   height:1.70,   scale:1, width:1.25,  colors:{...} },
  giant:  { label:'Gigante', height:5.00,   scale:5.00/BASE_H,    colors:{...} },
  small:  { label:'Pequeño', height:0.90,   scale:0.90/BASE_H,    colors:{...} },
  zombie: { label:'Zombi',   height:BASE_H, scale:1,              colors:{...} },
  robot:  { label:'Robot',   height:1.90,   scale:1,              colors:{...} }, // nominal, no se escala
};
const PLAYER_SKINS = ['human','fat','giant','small','zombie']; // el menú: sin robot
const DEFAULT_SKIN = 'human';
resolveSkin(skin)   // id válido del catálogo ⇒ id; cualquier otra cosa (ausente, tipo inválido,
                    // vacío, desconocido) ⇒ DEFAULT_SKIN
skinSpec(skin)      // SKIN_SPECS[resolveSkin(skin)]
avatarTagY(spec)    // spec.height + 0.48
avatarBarY(spec)    // spec.height + 0.13
avatarGreetY(spec)  // spec.height - 0.27
avatarDamageY(spec) // spec.height + 0.23
```

**Por qué un catálogo y no un `switch` en `makeAvatar`:** el catálogo es la fuente única de ids,
alturas y offsets; el menú, el bot, las etiquetas y los tests leen de ahí. Agregar un aspecto futuro
es una entrada nueva, no cinco constantes dispersas.

**Por qué el bloque no usa THREE:** el test lo evalúa con `new Function(codigo + ';return {...}')`
sin stub de Three.js, así el catálogo, el fallback y las alturas se prueban como lógica pura. Los
modelos siguen viviendo en `makeAvatar` (que sí usa THREE y se verifica con estáticos).

**Alternativas descartadas:**

- (a) **Escalar el grupo `g` del avatar** para `giant`/`small`: escala también etiqueta y barra
  (hijos de `g`) y rompe las alturas derivadas y el tamaño del texto. Se descarta.
- (b) **Constantes por aspecto dentro de `makeAvatar`**: duplica alturas y hace que el menú y los
  tests no tengan de dónde leer. Se descarta.
- (c) **Campo `height` en el protocolo**: el server tendría que confiar en un número del cliente y
  no aporta nada; la altura es una propiedad del aspecto, no del jugador. Se descarta.

### 2. Modelos: un cuerpo interior escalado, el grupo exterior intacto

`makeAvatar` mantiene su firma `(id,name,admin,skin)` y su contrato de retorno (`g`, `mats`,
`armL/armR/legL/legR`, `bar`, `sword`, `pick`, `held`, `seq`…). Cambia sólo cómo arma las piezas:

- **`human`**: el modelo actual, sin cambios visuales (top real 1.97, `scale:1`).
- **`fat`**: cajas más anchas (torso ~`.7` de ancho con panza, brazos y piernas más gruesos y
  cortos) y altura total 1.70. Sin escalado: la silueta cambia por geometría.
- **`giant`** y **`small`**: se construye el humanoide base (`BASE_H = 1.97`, el mismo rig del
  `human`) dentro de un **sub-grupo `body`** y se aplica `body.scale.setScalar(spec.scale)`
  (`5.00/1.97 ≈ 2.538` y `0.90/1.97 ≈ 0.457`). El sub-grupo se
  agrega a `g`; **`g` queda sin escalar**, así posición, yaw, `poseDead`, etiqueta y barra siguen
  en unidades del mundo y con el tamaño de siempre. Los brazos/piernas expuestos son los del
  sub-grupo: la animación de `tickAvatar` no cambia. El top real del modelo escalado queda en
  `spec.height` (`BASE_H * scale`), no en 5.18 como daría escalar desde 1.9.
- **`zombie`**: molde humanoide con el mismo rig de `BASE_H = 1.97` y la paleta de `makeZombie`
  (piel `0x6a9a4a`, ropa oscura), ojos
  rojos con material emisivo **fuera de `mats`** (para que el flash de daño no los apague) y el
  resto idéntico al humano: etiqueta con nombre, barra, arma en `armR` y animaciones.
- **`robot`**: la rama actual con `makeRobotModel`, sin tocar (`height:1.90` nominal, `scale:1`).

Todas las mallas del cuerpo siguen entrando a `avatarTargets` con `userData.avatarId=id` (superficie
de PvP); el arma sigue **fuera**. Para `giant`/`small`, las mallas del sub-grupo escalado siguen
siendo las mismas mallas (el raycast usa geometría transformada por la matriz del padre), así que el
PvP funciona sin cambios.

**Alternativas descartadas:**

- (a) **Escalar `g`**: ver decisión 1(a).
- (b) **Reconstruir `giant` con geometría 5×**: multiplica dimensiones a mano en cada caja y hace
  imposible garantizar “exactamente 5.00”. Se descarta.
- (c) **Reusar `makeZombie` para el aspecto `zombie`**: ese molde no tiene etiqueta, no cuelga el
  arma ni comparte `avatarTargets`; además pertenece al zombi server-auth. Se descarta.

### 3. El tamaño del aspecto escala la jugabilidad (decisión revisada)

La decisión original (“`giant` y `small` son solo visuales”) **queda reemplazada**. El usuario probó
los aspectos y pidió que el tamaño sea coherente: un gigante de 5 bloques no puede tener ojo, caja y
alcance de humano, y un pequeño de 0.90 no puede ocupar una caja de 1.8.

Todo lo que depende del tamaño se deriva de `f = spec.height / BASE_H` y se especifica en detalle en
las decisiones 18–25: caja `0.3*f`/`1.8*f`, ojo `1.62*f`, bob `0.05*f`, cámara de muerte
`1.62*f → 0.32*f`, alcances `8*f`/`4.6*f`/`6*f`, cámara 3ª `4.5*f` con mínimo `0.6*f`, y daño propio
`spec.height + 0.33`. La velocidad, el salto, la gravedad, el daño de caída y la vida **no** se
escalan.

**Por qué:** el modelo y la jugabilidad tienen que contar la misma historia; si el gigante mide cinco
bloques pero golpea a 4.6, el jugador ve una incoherencia. Las ventajas competitivas que esto abre
(más alcance, caja más grande; o ser más difícil de golpear y pasar por huecos) son **intencionales**
y las pidió el usuario.

**Nota de precisión:** `5.00/1.97` no es exacto en coma flotante. El catálogo declara
`height: 5.00` exacto y el test verifica los valores derivados con tolerancia
(`|f * BASE_H - height| < 1e-9`), no con igualdad estricta sobre el producto. Escalar desde 1.9
habría dado `1.9 * (5.00/1.9)`, que con el rig real de 1.97 mide **5.18**: por eso `BASE_H` es la
altura del modelo, no un número nominal.

### 4. Alturas derivadas de etiqueta, barra, saludo y daño

Con `top = skinSpec(skin).height`:

| Elemento | Fórmula | `human` (top 1.97) | Hoy |
|---|---|---|---|
| Etiqueta con nombre | `top + 0.48` | 2.45 | 2.45 |
| Barra de vida | `top + 0.13` | 2.10 | 2.10 |
| Corazones del saludo | `top - 0.27` | 1.70 | 1.70 |
| Daño flotante (`hitok`) | `top + 0.23` | 2.20 | 2.20 |

Así `human` queda **pixel-idéntico** y los demás aspectos quedan proporcionalmente bien: el `giant`
lleva nombre/barra por encima de 5.00 (5.48 y 5.13) y el `small` apenas por encima de 0.90 (1.38 y
1.03). La etiqueta y la barra se
posicionan una vez al crear el avatar (el aspecto no cambia en caliente; si cambiara, `applyPm`
actualiza `a.skin` y el avatar se recrea en la próxima conexión — ver riesgo 5).

**Alternativas descartadas:**

- (a) **Un offset fijo por aspecto en una tabla aparte**: duplica datos que ya están en el catálogo y
  se desincroniza al agregar aspectos. Se descarta.
- (b) **Calcular el bounding box del grupo en runtime**: cuesta y depende de la matriz del modelo;
  para datos conocidos de antemano es innecesario. Se descarta.

### 5. Fallback `human` en el cliente, sin whitelist en el server

`resolveSkin` normaliza a minúsculas y devuelve `DEFAULT_SKIN` si el valor no es un id del catálogo.
`makeAvatar`, `addRemote` y `applyPm` pasan por ahí; el objeto avatar guarda el **id resuelto**
(`a.skin = resolveSkin(...)`), nunca el crudo. En particular, `applyPm` hace
`if(typeof m.skin==='string') a.skin = resolveSkin(m.skin)` para que `skinSpec(a.skin)` reciba
siempre un id válido, incluso si un cliente viejo o modificado manda basura.

No se agrega whitelist en `server.js` porque:

- El server es un **relay**: `cleanSkin` ya garantiza un string corto y seguro (minúsculas,
  `[a-z0-9_-]`, máx 16) y no interpreta el valor.
- Una whitelist en el server **acopla el deploy del server al catálogo del cliente**: cada aspecto
  nuevo exigiría redeployar el server, y un cliente nuevo contra un server viejo perdería su skin.
- El único consumidor es el renderer, que ya resuelve desconocidos a `human`; el peor caso de un
  valor raro es un avatar humano.

**Alternativas descartadas:** (a) whitelist en el server — rompe compatibilidad hacia adelante;
(b) que el server reemplace desconocidos por `human` — mismo resultado observable que el fallback del
cliente pero obliga a mantener la lista en dos lugares; (c) rechazar el `hello` — innecesariamente
hostil para un campo cosmético.

### 6. Selector del menú + `localStorage`

En `#menu .card`, entre `.nameRow` y `#loading`, se agrega:

```html
<div id="skinPicker" role="radiogroup" aria-label="Aspecto">
  <button class="skinBtn" data-skin="human" role="radio" aria-checked="true">Humano</button>
  ... fat, giant, small, zombie ...
</div>
<div class="tiny" id="skinHint">Así te ven los demás: vos jugás en primera persona.</div>
```

- Estado en `let mySkin = 'human'`; cada botón aplica `mySkin`, marca `.on`/`aria-checked` y guarda
  `localStorage.setItem('mc-skin', mySkin)`.
- Al boot (`~2816`, junto a la restauración de sombras) se lee `mc-skin` y se pasa por
  `resolveSkin`, con la guarda de que el valor sea una opción de **jugador** (`PLAYER_SKINS`): un
  `robot` guardado a mano arranca en `human`.
- `connectMP` agrega `skin: mySkin` al `hello`. No se toca ningún otro frame.
- El menú aclara explícitamente que el aspecto es cómo lo ven los demás: el jugador local no tiene
  modelo propio en primera persona.

**Alternativas descartadas:** (a) elegir el aspecto con una tecla en juego — no hay feedback ni
persistencia clara; (b) guardarlo dentro de `minicraft-save-v3` — ese guardado es del mundo local y en
multijugador no se escribe; una clave propia (`mc-skin`) es independiente y no se pierde; (c) mandar
el skin en cada `mv` — el protocolo ya lo lleva en `hello` y en `pm`, agregarlo a `mv` sería un campo
nuevo innecesario.

### 7. `BOT_SKIN` en `bot/index.js`

`const skin = cfg.skin || process.env.BOT_SKIN || 'robot';` (mismo patrón que `name`), usado en el
`hello` (`skin`). Sin validación propia: si el valor es basura, el cliente lo dibuja como `human`.
`cfg.skin` permite testear sin tocar `process.env`. El `Dockerfile.bot` no cambia; el servicio
`minicraft-bot` de `docker-compose.yml` gana el passthrough `BOT_SKIN: ${BOT_SKIN:-robot}` para poder
probar localmente un bot `giant`, `fat`, `small`, etc. sin editar el compose.

### 8. Estrategia de test

**`server/test/skins.mjs`** (nuevo, patrón `client-robot.mjs`):

1. Extrae `/* skins:start */…/* skins:end */` y lo evalúa con `new Function` **sin THREE**.
2. Catálogo: seis ids exactos; `PLAYER_SKINS` = 5 sin `robot`; etiquetas no vacías;
   `BASE_H === 1.97`, `human.height === 1.97`, `zombie.height === 1.97`, `fat.height === 1.70`,
   `giant.height === 5`, `small.height === 0.9`, `robot.height === 1.90`; `scale === height / BASE_H`
   para `giant`/`small` y `scale === 1` para el resto.
3. `resolveSkin`: válidos se conservan (incluido `robot`); ausente/`''`/`null`/`42`/`{}`/`dragon` ⇒ `human`.
4. Alturas derivadas: `human` da exactamente 2.45/2.1/1.7/2.2; `giant` 5.48/5.13/4.73/5.23 y `small`
   1.38/1.03/0.63/1.13; monotónicas. Para los modelos escalados,
   `Math.abs(scale * BASE_H - height) < 1e-9`.
5. Estáticos de cableado: `makeAvatar` resuelve el skin con `resolveSkin`, usa el catálogo para
   etiqueta/barra, contiene las ramas `fat`/`giant`/`small`/`zombie`, sigue teniendo la rama `robot`,
   y las mallas siguen entrando a `avatarTargets`; `addRemote`/`applyPm` guardan
   `resolveSkin(...)`, no el string crudo.
6. Estáticos de menú: `#skinPicker` con cinco `data-skin` de jugador y sin `data-skin="robot"`,
   `mc-skin` en `localStorage`, `skin:` en el `hello` de `connectMP`, y `greetRemote`/`hitok` usando
   los helpers de altura.

**`server/test/bot-cazador.mjs`**: caso nuevo con WebSocket falso — `createBotClient({ skin:'giant' })`
manda `skin:'giant'` en el `hello`; sin `skin` ni `BOT_SKIN` manda `'robot'`. No levanta server real
para estos asserts (ya hay integración en el resto del archivo).

**Alta en la suite (17 → 18):** agregar `test/skins.mjs` a `server/package.json` y actualizar **los
dos listados hardcodeados**: `lookguard.mjs:167-176` (array + `count === 18` y su comentario) y
`zombie-protocol.mjs:302-309` (array + texto “18 archivos”).

### 9. `ui/camera` como capability propia y toggle `V` / `#btnCam`

La cámara y el avatar local son un contrato distinto del selector de aspecto: `ui/skins` decide
**qué** modelo; `ui/camera` decide **desde dónde** se mira y **cuándo** se dibuja el modelo propio.
Se agrega `ui/camera` con estado `camMode ∈ {first, third, front}` y ciclo
`first → third → front → first`:

- `V` en PC y `#btnCam` (pill `👁` de la topbar) en todas las plataformas; el botón funciona en
  táctil sin agregar un `touchButton` (misma fila de pills que `#btnSound`).
- `V` respeta las mismas guardas que `P`/`E`/`F`: se ignora con foco en un input, en `chat`, en
  `inv`, en pausa/menú y con `dead`; no abre nada ni mueve al jugador.
- El botón actualiza `aria-pressed` y el `title` para reflejar los tres modos; `aria-pressed` y
  `.on` quedan activos en `third` y `front`, y apagados en `first`.
- **Por qué una capability nueva:** mezclarla con `ui/skins` haría que el contrato de identidad
  dependa de una decisión de viewport y al revés; además el avatar local toca `net/avatar` (PvP) y
  `ui/camera` (visibilidad), dos límites distintos.

**Alternativas descartadas:** (a) sólo tecla — inutilizable en táctil; (b) sólo botón — peor en PC;
(c) reusar `ui/skins` — acopla dos contratos que evolucionan por separado.

### 10. Órbita centrada detrás del ojo, no vista de hombro

`camera.position = eye − lookDir() * dist`, con `eye = (player.pos.x, player.pos.y + eyeHeight(mySkin), player.pos.z)`
y `lookDir()` derivado de yaw/pitch. En la 3ª trasera la cámara conserva **la misma rotación** que
en 1ª persona (`rotateY(yaw)`, `rotateX(pitch)`), así el crosshair y la línea de apuntado coinciden
exactamente y no hay que compensar el ángulo. `dist` y el mínimo escalan con `f` (decisión 20). La
3ª frontal invierte el offset y la rotación, y se detalla en la decisión 27.

**Alternativas descartadas:** (a) **hombro lateral** (`eye + right*0.6`): descentra el crosshair,
obliga a un segundo origen de raycast y a mirar dos veces el mismo bloque; (b) **órbita con mouse**:
exige otro modo de input y compite con el pointer lock y con la mirada; (c) **cámara fija detrás del
modelo**: no permite apuntar con precisión.

### 11. Los raycasts y el agua salen del ojo, no de `camera.position`

Se introduce `eyePos()` (puro, `player.pos + eyeHeight(mySkin)` en Y) y se usa como origen de:

- `raycast(reachFor(mySkin,'block'))` (DDA de grilla para romper/poner).
- `avatarHit()` (`reachFor(...,'hit')`), `zombieHit()` y `animalHit()` (`reachFor(...,'animal')`).
- `tickWater()`: la celda sumergida se evalúa en el ojo, no en la cámara.

En 1ª persona `eyePos()` coincide con la cámara actual (sin bob), así el comportamiento es
idéntico; en 3ª evita que el rayo nazca detrás del jugador y golpee bloques a su espalda.

**Alternativas descartadas:** (a) seguir usando `camera.position` y “corregir” el impacto sumando la
distancia de cámara — depende del pitch y del recorte, y rompe el alcance; (b) dos orígenes distintos
según la acción — duplica reglas y hace que romper y golpear apunten a lugares diferentes.

### 12. Colisión de cámara con DDA de grilla y `clampCam` puro

La distancia se calcula con una DDA propia desde el ojo en la dirección de la cámara: hacia atrás
(`−lookDir`) en 3ª trasera y hacia adelante (`lookDir`) en 3ª frontal, hasta `CAM_DIST*f = 4.5*f`,
reusando la misma lógica de celdas que `raycast`:

- sin impacto ⇒ `4.5*f`;
- con impacto a `hit` ⇒ `max(CAM_MIN*f, min(4.5*f, hit − 0.25))`, con `CAM_MIN*f = 0.6*f`.

`clampCam(dist, hit, min)` y `camOffset(yaw, pitch, dist)` viven en un bloque puro
`/* camera:start */…/* camera:end */`, evaluable sin THREE, para testear la matemática sin navegador.

**Por qué DDA propia y no `THREE.Raycaster`:** el mundo es una grilla de voxels, la DDA ya existe y es
exacta y barata; un Raycaster contra mallas exigiría construir geometría de colisión y no correría en
el test puro. **Por qué mínimo `0.6*f`:** evita meter la cámara dentro de la cabeza/cabellera del
propio avatar y quedar por debajo del near plane, y acompaña el tamaño. **Por qué −0.25 constante:**
es un margen en unidades del mundo para que la cámara no quede pegada a la cara del bloque
(z-fighting), no una proporción del cuerpo.

**Alternativas descartadas:** (a) `Raycaster` contra el mundo — costoso y no testeable sin THREE;
(b) cámara sin colisión — atraviesa paredes; (c) mínimo 0 — la cámara entra en el modelo propio.

### 13. Sin suavizado de posición

La cámara se coloca en el destino exacto cada frame (`physicsGravity`), sin lerp. Con lerp, al girar
rápido o acercarse a una pared la cámara llega tarde y **atraviesa** el bloque antes de recortarse;
además agrega un frame de latencia al apuntado. El avatar local tampoco se interpola: se copia la
posición del jugador directamente.

**Alternativas descartadas:** (a) spring arm/lerp — clipping y lag; (b) suavizar sólo el yaw —
desalinea el crosshair del raycast.

### 14. Avatar local reutilizando `makeAvatar` con opciones

`makeAvatar` gana un quinto parámetro opcional `opts = { pvp:true, hud:true }` (default = comportamiento
actual, remotos intactos):

- `pvp:false` ⇒ no registra ninguna malla en `avatarTargets` (ni la rama robot ni la humana). El
  jugador no puede golpearse a sí mismo y su modelo no intercepta el raycast de un remoto.
- `hud:false` ⇒ no crea etiqueta ni barra de vida (el HUD propio ya muestra la vida). `poseDead` debe
  tolerar `bar` ausente.

El avatar local se crea una vez (al iniciar la partida, con `mySkin`) y se reutiliza:

- `g.position.copy(player.pos)`, `g.rotation.y = player.yaw + π` (misma convención que los remotos).
- Animación: se reutiliza el mismo bloque que `tickAvatar` (balanceo de brazos/piernas según
  movimiento, gesto de golpe por `swingSeq`, `held = hotbarIds[sel]` para el arma en mano). No hay
  lerp ni `pm`.
- Visibilidad: `g.visible = camMode!=='first' && !dead`. Al morir se oculta y la cámara de muerte
  sigue igual; la pose de muerte se mantiene implementada por consistencia con `poseDead`, pero no se
  ve en el juego actual.

**Por qué no un builder nuevo:** duplicaría los seis modelos y se desincronizaría del catálogo.
**Por qué no meterlo en `remotes`:** recibiría `pm`, aparecería en la lista de jugadores y sería
blanco de PvP.

**Alternativas descartadas:** (a) copiar el modelo y escalarlo aparte — duplicación; (b) registrar el
avatar local en `avatarTargets` y filtrarlo al golpear — más código y riesgo de auto-golpe;
(c) mostrar el modelo propio en 1ª persona — la cámara queda dentro de la cabeza.

### 15. Viewmodel oculto fuera de la primera persona

`tickSword`/`tickPick` agregan la condición `camMode==='first'`. En 3ª trasera y 3ª frontal el arma
se ve en la mano del avatar local; dejar el viewmodel produciría un arma flotante delante de la
cámara. En 1ª no cambia nada.

**Alternativa descartada:** mover el viewmodel al avatar local — dos fuentes de verdad para el mismo
gesto.

### 16. Persistencia y táctil

- `camModeOf(saved)` (puro): devuelve `third` o `front` sólo si `saved` es exactamente ese valor;
  cualquier otro valor (ausente, `null`, `first`, basura) ⇒ `first`.
- `nextCamMode(mode)` (puro): `first → third → front → first`; un valor inválido se trata como
  `first` y avanza a `third`.
- Al boot se lee `mc-cam`; cada toggle guarda `localStorage.setItem('mc-cam', camMode)`.
- `#btnCam` es una pill de la topbar (no un `touchButton`), con `onclick` que hace
  `stopPropagation()` como `#btnFull`, visible también en táctil y con tamaño de toque suficiente.
- El default **siempre** es 1ª persona, incluso si el jugador nunca abrió el juego.

**Alternativas descartadas:** (a) recordar la cámara en `minicraft-save-v3` — ese guardado es del
mundo y no se escribe en multijugador; (b) agregar un `touchButton` — complica la grilla táctil sin
beneficio; (c) default 3ª — cambia la sensación de juego y la forma de apuntar para todos.

### 17. Estrategia de test de cámara

**`server/test/camera.mjs`** (nuevo, patrón `skins.mjs`/`client-robot.mjs`):

1. Extrae `/* camera:start */…/* camera:end */` y lo evalúa con `new Function` **sin THREE**.
2. Constantes base: `CAM_DIST === 4.5` y `CAM_MIN === 0.6`; los valores efectivos son
   `CAM_DIST*f` y `CAM_MIN*f` (decisión 25).
3. `camModeOf`: `'third'` ⇒ `third`; `'front'` ⇒ `front`; `'first'`, `''`, `null`, `undefined`,
   `'Tercera'`, `42` ⇒ `first`.
4. `nextCamMode`: `first → third`, `third → front`, `front → first`; `undefined`, `''`, `'basura'` ⇒
   `third`.
5. `camOffset(0,0,d)` ⇒ `[0,0,d]` (detrás en +Z); con `yaw=π/2` ⇒ `[d,0,0]`; el módulo del offset
   es `d`; pitch positivo baja la cámara (`y < 0`); con `d` negativo el offset queda delante
   (`[0,0,d]` y `yaw=π/2` ⇒ `[-d,0,0]` con `d>0`).
6. `clampCam(4.5, null, 0.6)` ⇒ 4.5; `clampCam(4.5, 2, 0.6)` ⇒ 1.75; `clampCam(4.5, 0.7, 0.6)` ⇒ 0.6;
   `clampCam(4.5, 10, 0.6)` ⇒ 4.5; con `min=1.523` (giant) el piso es 1.523.
7. Estáticos: handler `KeyV`, `#btnCam`, clave `mc-cam`, avatar local creado con
   `{pvp:false,hud:false}` y **fuera** de `avatarTargets`/`remotes`, visibilidad
   `camMode!=='first'`, `tickSword`/`tickPick` con `camMode==='first'`, rama frontal con
   `camOffset(yaw,pitch,-CAM_DIST*f)`, DDA hacia adelante y rotación `yaw+π`/`-pitch`,
   `raycast`/`avatarHit`/`zombieHit`/`animalHit` desde `eyePos()` y con `reachFor`, `tickWater`
   desde el ojo, y que `physicsGravity` use `camMode`, `eyeHeight` y `CAM_DIST*f`/`CAM_MIN*f`.

**Alta en la suite (18 → 19):** agregar `test/camera.mjs` a `server/package.json` y subir los dos
listados hardcodeados (`lookguard.mjs` → `count === 19`; `zombie-protocol.mjs` → “19 archivos”).

### 18. Factor `f` como única fuente de las magnitudes de juego

`f = spec.height / BASE_H` con `BASE_H = 1.97`. Todos los valores se derivan de `f` con los helpers
puros del bloque `skins`:

```js
const sizeFactor = (skin) => skinSpec(skin).height / BASE_H;
const playerBox  = (skin) => ({ r: 0.3*sizeFactor(skin), h: 1.8*sizeFactor(skin) });
const eyeHeight  = (skin) => 1.62*sizeFactor(skin);
const reachFor   = (skin, kind) => ({ block:8, hit:4.6, animal:6 }[kind] * sizeFactor(skin));
```

| Aspecto | `height` | `f` | `r` | `h` | ojo | bloque | golpe | animal | cám. 3ª | cám. mín | daño propio |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `human` | 1.97 | 1.00000 | 0.300 | 1.800 | 1.620 | 8.000 | 4.600 | 6.000 | 4.500 | 0.600 | 2.30 |
| `fat` | 1.70 | 0.86294 | 0.259 | 1.553 | 1.399 | 6.904 | 3.969 | 5.178 | 3.883 | 0.518 | 2.03 |
| `giant` | 5.00 | 2.53807 | 0.761 | 4.568 | 4.112 | 20.305 | 11.675 | 15.228 | 11.421 | 1.523 | 5.33 |
| `small` | 0.90 | 0.45685 | 0.137 | 0.822 | 0.740 | 3.655 | 2.102 | 2.741 | 2.056 | 0.274 | 1.23 |
| `zombie` | 1.97 | 1.00000 | 0.300 | 1.800 | 1.620 | 8.000 | 4.600 | 6.000 | 4.500 | 0.600 | 2.30 |
| `robot` | 1.90 | 0.96447 | 0.289 | 1.736 | 1.562 | 7.716 | 4.437 | 5.787 | 4.340 | 0.579 | 2.23 |

`human` queda **exacto** (0.3/1.8, 1.62, 8/4.6/6, 4.5/0.6, 2.30): no hay regresión. Los valores de la
tabla son los que verifican los tests puros, con tolerancia para los que no son exactos.

### 19. La caja es `1.8*f`, no `height` exacta

Se mantiene la proporción histórica de la caja humana (1.8 de alto por 0.6 de ancho) escalada por
`f`, en vez de usar `spec.height` como alto. Razones:

- **`human` no cambia**: 0.3/1.8 es lo que usa hoy el juego y lo que espera todo el resto (paso por
  huecos de 2, auto-step de losas, spawn). Con `height` exacta el humano pasaría a 1.97 y cambiaría
  comportamiento sin que el usuario lo haya pedido.
- **`small` entra en 1 bloque**: 0.822 < 1, y su modelo de 0.90 también entra. Con `height` exacta
  (0.90) también entraría, pero la caja quedaría sin el margen que hace cómodo el movimiento.
- **`giant` no entra en 4 y sí en 5**: 4.568 < 5, pero > 4. Su modelo mide 5.00: en una sala de 5
  el pelo **roza** el techo (el box deja 0.43 de margen), y en una de 4 no pasa. Es exactamente el
  comportamiento pedido. Con `height` exacta (5.00) el gigante necesitaría 5 bloques justos y
  cualquier techo de 5 con una losa lo dejaría atrapado.

**Alternativas descartadas:** (a) mantener 1.8 fijo — vuelve al problema original; (b) usar
`height` exacta — rompe human y no deja margen al giant; (c) escalar solo el ancho — el giant
seguiría entrando en techos bajos y el small no pasaría por huecos de 1.

### 20. Ojo, bob, cámara 3ª y cámara de muerte escalados

- `eyePos()` pasa a `player.pos.y + 1.62*f`; el `raycast` y los golpes ya salen de ahí (decisión 11).
- En 1ª persona el bob mantiene su forma y escala su amplitud: `sin(bob) * 0.05*f`.
- En 3ª trasera la cámara orbita a `CAM_DIST*f = 4.5*f` detrás del ojo, sin bob, con mínimo
  `CAM_MIN*f = 0.6*f`. El margen contra paredes sigue en `hit − 0.25` **constante**, porque 0.25 es
  un colchón en unidades del mundo (evita z-fighting), no una proporción del cuerpo. La 3ª frontal
  usa la misma distancia y el mismo mínimo hacia adelante (decisión 27).
- La cámara de muerte arranca en `eyeHeight(mySkin)` y cae hasta `0.32*f`: human conserva 1.62→0.32,
  giant 4.112→0.812 y small 0.740→0.146.

**Por qué:** la cámara es la vista del cuerpo. Con una cámara fija, el giant tendría la cámara dentro
del pecho y el small vería desde la altura de un humano. La distancia 3ª también tiene que escalar
para que el avatar llene un encuadre parecido en todos los tamaños.

**Alternativas descartadas:** (a) cámara 1ª fija — el giant ve desde el torso; (b) cámara 3ª fija a
4.5 — el giant queda con la cámara pegada y el small diminuto en pantalla; (c) escalar también el
margen 0.25 — el small se pega a las paredes y el giant se aleja de más.

### 21. Alcances proporcionales: `8*f`, `4.6*f`, `6*f`

Los tres alcances salen del ojo y se multiplican por `f`:

- bloques (romper/poner/puerta): `8*f`; human 8, giant ≈20.305, small ≈3.655.
- jugadores/zombis (espada): `4.6*f`; human 4.6, giant ≈11.675, small ≈2.102.
- animales (acariciar): `6*f`; human 6, giant ≈15.228, small ≈2.741.

**Por qué:** es un pedido explícito y coherente con el tamaño; los 20.3 bloques del giant son
**intencionales** (brazo y ojo más altos y largos). No se limita el alcance a un máximo porque el
usuario quiere que el tamaño se sienta.

**Alternativas descartadas:** (a) mantener 8/4.6/6 (decisión original) — incoherente con el modelo;
(b) escalar solo el arma visible sin cambiar el raycast — el jugador apunta a algo que no puede
tocar; (c) poner un tope al giant — desvirtúa el pedido.

**Hueco cerrado (decisión 26):** el servidor validaba los golpes a zombis con `SWORD_REACH = 4.6`
fijo. Ahora `server/skins.js` deriva `swordReach(skin)` y `server.js` pasa `me.skin`, así el giant
puede golpear zombis hasta ≈11.675 y el small solo hasta ≈2.102.

### 22. Colisión, aparición, desatasco y colocación con la caja del aspecto

- `collides`, `slabBlocked`, `outOfCell` y `pushLocalOutOfBlock` usan `playerBox(mySkin)` en vez de
  `.3/1.8`. `movePlayer` y el auto-step de losas siguen igual, solo cambia la caja consultada.
- `findSpawn` exige `max(4, ceil(h))` bloques de aire (human/fat/small/robot 4, giant 5) y
  verifica el candidato con `collidesAt(..., r, h)`. El fallback de spawn y el respawn usan la misma
  función. El mínimo 4 conserva el spawn histórico seguro: el small puede moverse por un hueco de 1
  pero no aparece ahí, para no nacer en cuevas ni troncos.
- `ocupadoPor` usa `playerBox(mySkin)` para el jugador local y `playerBox(a.skin)` para **cada
  remoto**; los animales conservan su caja 0.64×1.2. Las ramas normal, escalera y puerta (2 celdas)
  siguen chequeando con `entSolapa`, que ya recibe ancho y alto.
- `entSolapa(px,py,pz,hw,h,...)` no cambia de firma: se le pasa `r` como `hw` y `h` como alto.

**Por qué la caja del remoto:** un giant remoto debe bloquear la colocación en toda su altura y un
small remoto no debe bloquear una celda que su cuerpo no ocupa. Usar una caja fija haría que el small
“tape” bloques por encima de su cabeza y que se pudiera colocar un bloque dentro del giant.

**Alternativas descartadas:** (a) caja fija para remotos — ver arriba; (b) usar `height` para el
spawn — un giant necesitaría 5.0 exactos y no entraría en salas de 5 con losa; (c) desatasco solo
horizontal — el giant colocado dentro de un bloque quedaría atrapado.

### 23. Daño propio a la altura del aspecto

`spawnDmgNum` del daño propio pasa de `player.pos.y+2.3` a
`player.pos.y + spec.height + 0.33`: human 2.30, fat 2.03, giant 5.33, small 1.23, zombie 2.30,
robot 2.23. Se mantiene el `+0.33` (distinto del `+0.23` de los avatares remotos) para que el número
quede por encima de la cabeza propia y no se mezcle con el HUD.

**Alternativa descartada:** seguir usando 2.3 fijo — en el giant el número aparece dentro del pecho y
en el small flota muy por encima.

### 24. Lo que NO se escala (y por qué)

Quedan **iguales** para todos los aspectos:

- velocidad caminando/corriendo (`sp`), salto (`8.8`), gravedad (`26`), velocidad terminal (`22`);
- daño de caída (`drop > 4`, `floor(drop-3.5)`) y altura de caída;
- vida (`MAXHP`), regeneración, daño de espada (`2`) y cadencia (`1 s`);
- IA server-side de zombis (`VIEW_DIST`, `ATTACK_RANGE`, `SPEED`) y del bot; el alcance base
  `SWORD_REACH` sigue siendo 4.6 y solo se deriva por skin en `hit` (decisión 26).

**Por qué:** el pedido es coherencia de **tamaño** (ojo, caja, alcance, cámara), no una nueva
economía de movimiento. Escalar velocidad o salto con `f` haría que el giant se mueva 2.5× más rápido
y salte 5 bloques, rompiendo el diseño del mundo y la IA; escalar la vida o el daño rompería el PvP
sin que se haya pedido. El bot gigante se ve gigante, pero su IA conserva sus rangos actuales.

### 25. Estrategia de test de la escala (sin archivo nuevo)

Se **extienden** los tres tests existentes; la suite queda en 19 archivos:

**`server/test/skins.mjs`**:

1. Puros: `sizeFactor` para los 6 aspectos (human/zombie 1, fat ≈0.86294, giant ≈2.53807,
   small ≈0.45685, robot ≈0.96447); `playerBox` (human exacto 0.3/1.8, giant ≈0.761/4.568, small
   ≈0.137/0.822, fat ≈0.259/1.553); `eyeHeight` (human 1.62, giant ≈4.112, small ≈0.740);
   `reachFor(skin,'block'|'hit'|'animal')` (human 8/4.6/6, giant ≈20.305/11.675/15.228, small
   ≈3.655/2.102/2.741).
2. Estáticos: `collides`/`slabBlocked` usan `playerBox(mySkin)`, `findSpawn` usa
   `max(4, ceil(h))` y `collidesAt(...,r,h)`, `pushLocalOutOfBlock`/`outOfCell` reciben la caja,
   `ocupadoPor` usa `playerBox(mySkin)` y `playerBox(a.skin)`, `raycast`/`avatarHit`/`zombieHit`/
   `animalHit` llaman a `reachFor`, y `spawnDmgNum` propio usa `spec.height + 0.33`.
3. Deriva server-side: importa `server/skins.js`, compara `SKIN_SIZE` con `spec.height / BASE_H` del
   bloque `/* skins:start */` del cliente y verifica `swordReach` (human 4.6, giant ≈11.675, small
   ≈2.102), según la decisión 26.

**`server/test/zombie.mjs`**:

1. Un `giant` a 8 bloques golpea un zombi (aceptado con ≈11.675) y un `human` a 8 es rechazado
   (4.6), usando `createHorde`/`hit` como el resto del test.

**`server/test/camera.mjs`**:

1. `clampCam(dist, hit, min)` o equivalente con `CAM_MIN*f`: human 0.6, giant ≈1.523, small ≈0.274;
   el margen sigue siendo `hit − 0.25`.
2. `camOffset`/`camModeOf` conservan sus asserts.
3. Estáticos: `physicsGravity` usa `eyeHeight(mySkin)`, `0.05*f` de bob, `CAM_DIST*f` y
   `CAM_MIN*f`; la cámara de muerte usa `eyeHeight` y `0.32*f`.

**Sin archivo nuevo:** se suman casos a `skins.mjs`, `camera.mjs` y `zombie.mjs`; no se toca el
contador 19.

### 26. Validación server-side del alcance de zombis con el skin declarado

El cliente del `giant` apunta a ≈11.675, pero `server/zombie.js` validaba `zhit` con
`SWORD_REACH = 4.6` fijo. Se cierra el hueco con una **fuente server-side** del factor:

**`server/skins.js`** (nuevo, sin dependencias):

```js
const BASE_H = 1.97;
const SKIN_SIZE = {
  human: 1,
  fat: 1.70 / BASE_H,
  giant: 5.00 / BASE_H,
  small: 0.90 / BASE_H,
  zombie: 1,
  robot: 1.90 / BASE_H,
};
const sizeFactor = (skin) => SKIN_SIZE[skin] || 1; // desconocido ⇒ human
const swordReach = (skin) => 4.6 * sizeFactor(skin);
module.exports = { BASE_H, SKIN_SIZE, sizeFactor, swordReach };
```

- `server/zombie.js`: `hit(playerId, zombieId, now, playerPos, skin)` valida con
  `swordReach(skin)`. El quinto parámetro es **opcional** y, sin él, `sizeFactor(undefined) === 1`,
  así que los tests viejos que llaman `hit(..., pos)` conservan 4.6. `SWORD_REACH` sigue exportado
  como constante base (4.6) para no romper a quien lo lea.
- `server/server.js`: en el handler `zhit`, pasar `me.skin` como quinto argumento
  (`horde.hit(me.id, id, Date.now(), me.pos, me.skin)`). El skin ya está saneado por `cleanSkin` y
  default `human`.
- El **PvP no cambia**: el servidor sigue relayando `hit` a jugadores sin validar distancia; solo se
  escala la validación contra zombis.
- **Deriva cliente/servidor**: `server/test/skins.mjs` importa `server/skins.js`, extrae el bloque
  `/* skins:start */` del cliente y compara que cada `height/BASE_H` coincida con `SKIN_SIZE` (mismos
  factores), y verifica `swordReach('human') === 4.6`, `> 11.6` para `giant` y `< 2.2` para `small`.
  `server/test/zombie.mjs` agrega el caso de un giant a 8 bloques aceptado y un human a 8 rechazado,
  usando `createHorde`/`hit` como ya hace ese test. No hay archivo nuevo: la suite sigue en 19.

**Por qué duplicar la tabla y no importar el cliente:** `index.html` no es un módulo de Node y el
server no puede leer el bloque de un navegador. La duplicación se controla con el test de deriva; si
los factores se separan, la suite falla.

**Riesgo asumido:** el `skin` es **client-declared**. Un cliente malicioso podría declarar `giant`
para que el server le acepte golpes a zombis a 11.675. Es el mismo modelo de confianza que ya usa el
render (el server nunca verificó el skin ni la posición del golpe a jugadores) y no empeora el
anti-cheat actual; si se quisiera cerrar del todo, el server tendría que elegir/validar el skin, lo
que queda fuera de este change.

### 27. Cámara frontal de vanidad (tercer estado)

La tercera perspectiva tiene dos variantes: **trasera** (la actual) y **frontal**. `V` y `#btnCam`
ciclan `first → third → front → first`; `nextCamMode` implementa ese ciclo y un valor inválido se
trata como `first` (avanza a `third`). La persistencia `mc-cam` acepta `first`, `third` y `front`;
cualquier otra cosa ⇒ `first`. El botón muestra tres `title` (“1ª persona”, “3ª persona trasera”,
“3ª persona frontal”), mantiene `aria-pressed` verdadero y `.on` en `third`/`front`, y falso/sin
`.on` en `first`.

**Matemática de la frontal:**

- Posición: `camera.position = eye + camOffset(yaw, pitch, -dist)`, es decir, el mismo offset de la
  trasera con **signo negativo**, a `CAM_DIST*f = 4.5*f` del ojo hacia adelante.
- Rotación: `rotateY(yaw + π)` y `rotateX(-pitch)`, para que la cámara quede delante y mire al
  jugador a la cara. No se hereda la rotación de la espalda.
- Colisión: DDA desde el ojo **hacia adelante** (`lookDir`) hasta `CAM_DIST*f`, con el mismo
  `clampCam` (`max(CAM_MIN*f, min(CAM_DIST*f, hit − 0.25))`) y mínimo `0.6*f`. Así no atraviesa la
  pared que el jugador tiene delante. Sin bob, igual que la trasera.
- Avatar local visible con `camMode!=='first'`; en frontal se le ve la cara. Viewmodel oculto con
  `camMode!=='first'` (sólo se dibuja en 1ª).

**Por qué es de vanidad y no cambia el juego:** en frontal la cámara mira al jugador, así que el
centro de la pantalla (crosshair) apunta hacia su propio cuerpo, no hacia donde mira. Los raycasts
de romper/poner/golpear y el agua siguen saliendo de `eyePos()` y de la mirada (`yaw`/`pitch`) del
jugador, sin remapearse a la cámara ni bloquear acciones. Es el mismo compromiso que el F5 de
Minecraft: sirve para verse, no para jugar; se vuelve a 1ª con `V`. La cámara de muerte sigue en 1ª
y no se toca.

**Alternativas descartadas:** (a) **espejar la imagen** — invertiría el HUD y el mundo entero y
sería un truco visual, no una cámara real; (b) **mover la mirada/raycasts a la cámara** — cambiaría
el control, el origen del golpe y la dirección de romper/poner, y en frontal el rayo podría salir
hacia la espalda del jugador; (c) **bloquear acciones en frontal** — no hay motivo de juego y
molesta al que sólo quiere mirarse; (d) **tecla aparte para el frontal** — suma input, descubrimiento
y persistencia sin necesidad; el ciclo de `V` es el patrón esperado; (e) **no recortar hacia
adelante** — la cámara atravesaría la pared de enfrente.

**Test:** se extiende `server/test/camera.mjs` (sin archivo nuevo, la suite sigue en 19):
`camModeOf('front') === 'front'` e inválidos ⇒ `first`; `nextCamMode` de los tres estados e
inválido; `camOffset` con signo negativo; estáticos del branch frontal con DDA hacia adelante,
`yaw+π`/`-pitch`, avatar visible en `!=='first'`, viewmodel oculto y `mc-cam` con `front`.

## Risks / Trade-offs

- [Risk] **`giant` exacto a 5.00 en coma flotante**: `1.97 * (5.00/1.97)` puede no dar exactamente
  5.00. → Mitigación: el catálogo declara `height: 5`/`height: 0.9` exactos y el test compara el
  modelo con tolerancia (`|scale * BASE_H - height| < 1e-9`); lo que se exige exacto es el dato del
  catálogo.
- [Risk] **Altura base mal medida**: asumir 1.9 cuando el rig real mide 1.97 daría un gigante de
  5.18 y correría las etiquetas. → Mitigación: `BASE_H` es una constante única usada por el catálogo,
  la escala y los tests; un cambio de geometría del humano rompe `skins.mjs`.
- [Risk] **Escalar el grupo equivocado**: escalar `g` agrandaría nombre/barra y rompería las alturas.
  → Mitigación: el sub-grupo `body` es el único escalado; el test estático verifica que etiqueta y
  barra se posicionan con los helpers sobre `g`.
- [Risk] **Cambios de aspecto en caliente**: si un jugador cambia de skin y su `pm` trae otro valor,
  `a.skin` cambia pero el modelo no se reconstruye (quedaría el viejo). → Aceptado: el aspecto se elige
  en el menú antes de entrar y no hay UI para cambiarlo en juego; recrear avatares en caliente es un
  change aparte. El fallback evita cualquier crash.
- [Risk] **El giant no entra en 4 pero su modelo mide 5**: la caja es 4.568, así que en una sala de
  5 el pelo/la cabeza roza el techo y puede clipar visualmente. → Aceptado y declarado: es la
  consecuencia de conservar human exacto y no dejar al giant atrapado en techos de 5 con losa.
- [Risk] **Alcance de 20.3 bloques en el giant**: es una ventaja competitiva grande y puede permitir
  romper/colocar desde muy lejos. → Aceptado por pedido explícito; el balance se revisa después. No
  se limita en la spec.
- [Risk] **Skin client-declared en la validación server-side**: el servidor confía en el `skin` que
  manda el cliente para aceptar `zhit` hasta `4.6*f`; un cliente malicioso podría declarar `giant`
  para pegar más lejos. → Asumido: es el mismo modelo de confianza que el render y el PvP actual; no
  empeora el anti-cheat. Cerrarlo exigiría que el server elija/valide el skin (fuera de alcance).
- [Risk] **Caja gigante y auto-step**: con `r=0.761`, `slabBlocked`/`movePlayer` consultan más celdas
  y el auto-step puede fallar si falta aire para 4.568 de alto. → Mitigación: usar la misma caja en
  `collides` y en `slabBlocked`; el test estático verifica que no quedó `.3` fijo.
- [Risk] **Spawn en cuevas o troncos**: si se usara sólo `ceil(h)` sin mínimo histórico, los
  aspectos más bajos podrían aparecer en huecos inseguros. → Mitigación: `findSpawn` usa
  `max(4, ceil(h))`; human/fat/small/robot exigen 4 y giant 5. El small sigue pasando por huecos de 1
  al moverse, pero no aparece ahí: es deliberado para conservar el spawn histórico seguro.
- [Risk] **Cámara 3ª del small muy cerca (`0.6*f≈0.274`)**: puede quedar dentro de la cabeza del
  modelo (0.90 de alto) con cierto pitch, tanto en trasera como en frontal. → Mitigación:
  `eyeHeight` está en 0.740 y el mínimo de 0.274 es mayor que el near plane (0.1); se valida en la
  revisión visual y, si molesta, se ajusta solo `CAM_MIN` sin cambiar la spec.
- [Risk] **Colocación con la caja del remoto**: si un remoto cambia de skin en caliente o llega sin
  `skin`, `a.skin` puede no reflejar el modelo. → Mitigación: `resolveSkin(a.skin)` y el fallback
  `human` ya existen; el test estático verifica que se usa `a.skin`, no una caja fija.
- [Risk] **Ojos del `zombie` apagados por el flash de daño**: si el material emisivo entra en `mats`,
  el flash los pisa. → Mitigación: los ojos van fuera de `mats`, igual que en `makeZombie`/robot.
- [Risk] **Contadores de tests hardcodeados**: agregar `skins.mjs` sin subir los tres lugares deja la
  suite roja. → Mitigación: tarea explícita 17 → 18 en `package.json`, `lookguard.mjs` y
  `zombie-protocol.mjs`.
- [Risk] **Clientes viejos ven `giant` como humano**: es el comportamiento aditivo esperado. →
  Aceptado; no hay error ni crash.
- [Risk] **Pared más cerca que `0.25 + 0.6*f`**: con `CAM_MIN*f`, el recorte `hit−0.25` puede quedar
  por debajo del mínimo y la cámara podría meterse en el bloque (o del otro lado) si el obstáculo
  está a menos de ≈0.85 del ojo en human, ≈1.77 en giant o ≈0.52 en small, tanto en trasera como en
  frontal. → Mitigación: usar el DDA (no atravesar mallas) y, si en la revisión visual se nota
  clipping en pasillos, colapsar a la vista de ojo cuando `hit < 0.25 + 0.6*f`; el contrato de
  `clampCam` y la distancia objetivo no cambian.
- [Risk] **Auto-golpe o raycast bloqueado por el avatar local**: si sus mallas entran a
  `avatarTargets`, el jugador se golpea a sí mismo o tapa a un remoto. → Mitigación: `pvp:false` en
  `makeAvatar` y test estático de que el avatar local no está en `avatarTargets` ni en `remotes`.
- [Risk] **Doble arma (viewmodel + avatar) en 3ª**: el viewmodel sigue pegado a la cámara. →
  Mitigación: `camMode==='first'` en `tickSword`/`tickPick`, tanto en trasera como en frontal.
- [Risk] **Agua mal detectada en 3ª**: la cámara puede quedar fuera del agua con el jugador sumergido
  (o al revés) en trasera o frontal. → Mitigación: `tickWater` evalúa la celda del ojo, igual que los
  raycasts.
- [Risk] **Crosshair desalineado en frontal**: la cámara mira al jugador y el centro de la pantalla
  no coincide con la mirada; puede confundir y hacer creer que romper/poner no funciona. →
  Mitigación: documentarlo en `#hint`, README y `title` del botón; es un modo de vanidad y se vuelve
  con `V` (decisión 27). No se remapean acciones.
- [Risk] **Cámara frontal atraviesa la pared de adelante**: usar sólo el DDA trasero dejaría la
  cámara dentro del bloque que el jugador tiene delante. → Mitigación: DDA hacia adelante con el
  mismo `hit−0.25` y mínimo `0.6*f`; test estático del branch frontal.
- [Risk] **Estado de botón incompleto en el tercer modo**: actualizar sólo `aria-pressed` o dejar
  `.on` apagado en `front` rompe la indicación visual. → Mitigación: tres `title`, `.on` y
  `aria-pressed` verdaderos en `third`/`front`, falso en `first`; test visual y estático.
- [Risk] **Persistencia vieja de `mc-cam`**: un valor `third` guardado antes del change debe seguir
  funcionando; `front` es nuevo y no debe romper clientes. → Mitigación: `camModeOf` acepta
  explícitamente `third` y `front`; todo lo demás cae a `first`.
- [Risk] **Botón táctil fuera de la grilla**: un `touchButton` nuevo rompería el layout móvil. →
  Mitigación: `#btnCam` como pill de la topbar (mismo patrón que `#btnSound`/`#btnFull`).
- [Risk] **Contador de tests 18 → 19**: agregar `camera.mjs` sin subir los tres lugares deja la suite
  roja. → Mitigación: tarea explícita en `package.json`, `lookguard.mjs` y `zombie-protocol.mjs`.

## Migration Plan

1. **Cliente — identidad**: bloque `skins`, modelos en `makeAvatar`, alturas derivadas, selector de
   menú, `localStorage` y `skin` en el `hello`. Retrocompatible: sin `skin` todo sigue como `human`.
2. **Cliente — jugabilidad por tamaño**: helpers `sizeFactor`/`playerBox`/`eyeHeight`/`reachFor`,
   caja en colisión/spawn/desatasco/colocación, ojo y cámara escalados, daño propio y alcances. Con
   `human` los valores son exactamente los de antes, así que el default no cambia nada.
3. **Cámara**: bloque `camera` con `CAM_DIST`/`CAM_MIN` multiplicados por `f`, ciclo
   `1ª → 3ª trasera → 3ª frontal → 1ª` en `V`/`#btnCam`, avatar local con opciones
   `pvp:false`/`hud:false`, viewmodel condicionado por `camMode` y raycasts/agua desde el ojo. La
   frontal usa el offset negativo, mira al jugador y se recorta hacia adelante; es de vanidad y no
   cambia el apuntado. Default `first`: quien no toca nada ve exactamente lo de antes.
4. **Bot**: `BOT_SKIN` (default `robot`) en `bot/index.js` y passthrough
   `BOT_SKIN: ${BOT_SKIN:-robot}` en `docker-compose.yml`.
5. **Docs**: README con la tabla de aspectos, `BOT_SKIN` (incluido el passthrough de compose), `V`
   (1ª/3ª trasera/3ª frontal) en los controles, el `#hint` del juego con el ciclo y la nota de que el
   tamaño cambia ojo, caja y alcances; aclarar que el frontal es de vanidad.
6. **Servidor**: `server/skins.js` con la tabla de factores y `swordReach`, `zombie.js` aceptando el
   quinto parámetro `skin` y `server.js` pasando `me.skin` en `zhit`. Sin migración de datos: el skin
   ya viaja en el `hello` y los clientes viejos caen en `human` (4.6).
7. **Rollback**: revertir `index.html`, `bot/index.js`, `docker-compose.yml`, `server/skins.js`,
   `server/zombie.js` y `server/server.js`. No hay migración de datos ni coordinación de deploy; un
   cliente viejo contra el server nuevo sigue igual.

## Open Questions

- **Geometría fina de cada modelo** (proporciones exactas del `fat`, paleta exacta del `zombie`): la
  spec fija las señas observables (más ancho/panza, verde/ojos rojos/ropa oscura, alturas); el detalle
  se ajusta en implementación sin cambiar el contrato.
- **Estilo visual del selector** (botones vs. tarjetas vs. radios): se decide al implementar; la spec
  sólo exige cinco opciones, estado visible y la aclaración de primera persona.
- **Ajuste fino de los offsets** (±0.01) para `fat`/`robot`: los valores `top+0.48/0.13/-0.27/0.23`
  están calibrados para `human`; si en la revisión visual las etiquetas de `fat` (1.70) o `robot`
  (1.90 nominal) quedan muy justas, se ajustan sin cambiar el contrato de la spec.
- **Distancia y altura de la cámara en 3ª**: `4.5*f` detrás (trasera) o delante (frontal) del ojo y
  `eyeHeight(mySkin)` quedan fijos en el contrato; si en la revisión visual el avatar `giant` tapa
  demasiado, el `small` se pierde o el frontal queda incómodo, se ajusta sólo la constante `4.5` (o
  `0.6` del mínimo) sin cambiar la proporcionalidad ni el ciclo de modos.
- **Validación server-side del alcance**: se resolvió con `server/skins.js` y el quinto parámetro
  opcional de `hit`; la deuda que queda es de confianza (skin client-declared), no de alcance.
- **Caja `1.8*f` vs `height` exacta**: se elige `1.8*f` para conservar human y el margen del giant en
  salas de 5. Si la revisión visual muestra que el giant “flota” 0.43 por debajo del techo o que el
  small pasa demasiado justo, se ajusta la constante 1.8 sin cambiar la fórmula.
- **Cámara 3ª del giant/small**: `4.5*f` y `0.6*f` son el contrato; si el giant tapa demasiado o el
  small queda incómodo, se ajusta solo la constante, no la proporcionalidad.
- **Spawn con `max(4, ceil(h))`**: human/fat/small/robot exigen 4 celdas de aire y giant 5. El small
  puede moverse por un hueco de 1 pero no aparecer allí; se conserva el mínimo histórico para evitar
  spawns en cuevas o troncos. Si se quisiera un spawn más compacto, se ajusta el mínimo 4 en un change
  aparte, no la fórmula de `ceil(h)`.
- **Peso del giant en la colocación**: un remoto giant bloquea muchas celdas; si molesta al construir
  cerca suyo, se evalúa un margen, pero la caja debe seguir siendo la del aspecto.
