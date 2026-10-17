# Design

## Context

Ver `proposal.md` (Why) y los delta specs `creatures/enemy` y `player/combat` (qué comportamiento observable se exige). Estado actual **verificado** que condiciona el diseño:

- **`genWorld()` es 100 % determinístico desde `SEED`** (`index.html:942-965`): `hash2` (929-933), `vnoise` (934-938), `fbm` (939), `hAt` (940, `const hAt = (x,z) => …`), árboles con `mulberry(SEED)` (504-506, 944, 954-965), flores (966-971). Constantes `W=208, H=40, CH=16, WATER_Y=10` (412) y `OX=OZ=48` (413). `world` es un `Uint8Array(W*H*W)` (904) con `widx`/`inB`/`get`/`rawSet` (906-909).
- **El servidor es ciego al terreno**: `server/server.js` no genera mundo, no tiene heightmap ni colisión. Solo guarda `SEED` + `edits` (`edits = [[idx,val],…]`, `idx=(y*208+z)*208+x`, cap 300000, persistido como `{seed, edits}`).
- **El servidor NO tiene tick de simulación**: solo 3 `setInterval` (`save` 15 s en 68, heartbeat/idle `HB_MS` en 102-117, `tod` cada `TOD_INTERVAL_MS` en 120). `hp`/`dead` de cada jugador son **espejo** de lo que manda el cliente en `mv` (159-160) — el hp del jugador es **client-authoritative**, igual que el PvP de `hit`/`phit` (170-176).
- **El servidor SÍ conoce la posición de todos los jugadores** (`mv` cada 70 ms, `index.html:2385-2387` → `me.pos`, reenviado como `pm`). Hoy no difunde ninguna entidad que no sea un jugador.
- **Detalle de diagrama**: `player.pos` es la posición de los **pies** del jugador (se manda cruda en `mv`), y los clientes renderizan el avión `g.position` también en los pies; el modelo mira hacia **+Z** y, para el jugador, el render suma `π` (`index.html:1943`) porque el yaw que llega es el de la cámara.
- **Reutilizables tal cual**: el handler `phit` del cliente ya aplica `damage(m.dmg,m.from)`, número de daño flotante y knockback (`index.html:2359-2368`); `damage()/die()/respawn()` (1502-1531) con `hp=10` y `godT` de 0.6 s; la animación de muerte del avatar remoto (`deadK` a 1.6/s, `g.rotation.x = -deadK*π/2`, extremidades a 0 cuando `deadK>.5`, barra oculta; `index.html:1946-1951`); los helpers de suavizado del bloque `net/avatar` (`1886-1893`); `makeAvatar` como molde de construcción de un humanoide (1820-1848).
- **Viewmodel actual (primera persona)**: la espada (`swordG`, 892-909) y el pico (`pickG`, 914-933) cuelgan de la **`camera`** (`camera.add(swordG)`), con geometría y `MeshLambertMaterial` construidos **inline** en cada bloque; la animación de golpe vive en `swingT`/`SWING_DUR=0.38` y la consumen `tickSword` (947-950) y `tickPick` (958-963). `static.mjs` §7 exige los literales `const PICK_POS = new THREE.Vector3(-.42,-.42,-.7)`, `const PICK_ROT = new THREE.Euler(…Math.PI/2…)`, `pickG.scale.setScalar(`, `tickPick` con `swingT=Math.min(1,swingT+dt/SWING_DUR)` y `tickSword` con `swingT`/`SWING_DUR`: el refactor a builder **no puede romper esos literales**.
- **El protocolo de jugador no dice nada del equipamiento ni de los golpes**: `mv` (cada 70 ms, `sendMove` 2540-2544) manda `p/yaw/pitch/hp/dead` y `pm` lo relaya a los demás; `hit` → `phit` llega **solo a la víctima** (+`hitok` al atacante). Por eso un tercero no ve ni el arma ni la animación: no hay dato que viaje. El avatar remoto (`makeAvatar`) **no tiene ninguna malla de arma**.
- **Constantes del ajuste pedido tras la prueba en el navegador**: la IA original usaba `FOV_HALF=π/3` (cono de ±60°) sobre `z.yaw`, `SPEED=3.36` (70 %) y `phit.dmg=1` (`server/zombie.js:11,14,184`). Los 6 ajustes cerrados con el usuario cambian eso a visión circular, `SPEED=2.4` (50 %), `ZOMBIE_DMG=2`, ojos rojos, animación de ataque y difusión de `held`+golpe.
- **Restricciones duras de los tests existentes** (el change no los toca; hay que no romperlos):
  - `server/test/terrain.mjs` extrae desde el texto literal `function hash2(x,z){` hasta la línea `const hAt = `, inyecta `globalThis.SEED` **después** de crear las funciones (o sea: `hash2` debe seguir leyendo un `SEED` global) y exige `hAt(x,z)` "pelado" en 0 lugares, `hAt(x-OX,z-OZ)` en **≥ 5** lugares y `hAt(sx-OX,sz-OZ)` presente (líneas 22-27, 73-77).
  - `server/test/avatar.mjs` extrae el bloque `/* net/avatar:start */ … /* net/avatar:end */` y espera que siga evaluando y devolviendo `TELEPORT_DIST/PM_BUF_MS/PM_BUF_MAX/avatarShouldSnap/avatarLerpFactor/yawToward/pmQueueDrain/outOfCell`, y que `tickAvatar` siga llamando `avatarShouldSnap`, `avatarLerpFactor` y `yawToward` (21-32, 140-150).
  - `server/test/static.mjs` §8 matchea **literales exactos** del ciclo: en el cliente `/const DAY_MS=(\d+), NIGHT_MS=(\d+), CYCLE_MS=DAY_MS\+NIGHT_MS, DAWN_MS=(\d+), DUSK_MS=(\d+);/`, en el server `/const DAY_MS = (\d+), NIGHT_MS = …, DUSK_MS = (\d+);/`, más `/phaseNow\(\)\s*>=\s*NIGHT_START/`, `/tod: phaseNow\(\), cyc: CYCLE_MS/` y `/broadcast\(\{ t: 'tod', v: phaseNow\(\) \}\)/` (203-272). **Esas líneas no se pueden reformatear.**
  - `server/test/protocol.mjs` manda `{t:'hit', dmg:1}` y espera `phit.dmg===1` y que `world.json` siga siendo exactamente `{seed, edits}` (163-168, 254-264).
  - El script `test` de `server/package.json` enumera los archivos a mano: sumar cobertura nueva exige editar **ese** archivo (no es un test).

## Goals / Non-Goals

**Goals:**

- Que el servidor tenga una **verdad de terreno** exacta y barata, obtenida del **mismo código** que el cliente (cero drift por construcción).
- Un tick de simulación mínimo, medible y barato para 3-4 criaturas, con `dt` real.
- Una IA **predecible y honesta**: sin pathfinding, con deslizamiento simple, y con reglas explícitas de adquisición/pérdida de objetivo.
- Que **todos** los clientes vean y puedan atacar al mismo zombi, con el **servidor** como autoridad del daño recibido por la criatura.
- Que el combate **se vea**: el ataque del zombi y el golpe de espada de los jugadores son visibles para todos (incluidas las víctimas), y el avatar remoto muestra el arma que lleva en la mano.
- Reutilizar al máximo (`phit`, `damage()`, animación de muerte, helpers de `net/avatar`, `makeAvatar` como molde, patrón de difusión de `tod`).
- Dejar el camino de TDD listo: módulo de IA **puro y testeable sin WebSocket**, con RNG inyectable, y **sin tocar los tests existentes**.

**Non-Goals:**

- Pathfinding, navegación por waypoints, escaleras, saltos o auto-step de más de 1 bloque.
- Persistir zombis en `world.json` (se pierden al reiniciar; cada boot arranca sin zombis).
- Anti-cheat completo: el hp del jugador sigue siendo client-authoritative y `mv` sigue siendo la posición que declara el cliente (el zombi server-auth **no** valida la trayectoria del jugador).
- Cambiar `world/daynight`, `creatures/animals`, `net/presence`, `world/water` ni la física del jugador. (`net/avatar` **sí** se modifica: se le agregan requisitos nuevos para mostrar el arma y la animación de golpe del avatar remoto; su suavizado existente no se toca.)
- Escalar a muchas criaturas, instancias por zona, o un sistema de mobs genérico parametrizable.
- Predecir movimiento del cliente (interpolación de jugador en el servidor): el zombi persigue posiciones `mv` que llegan con ~70 ms + latencia.

## Decisions

### 1. El servidor replica el mundo completo desde el mismo generador del cliente

Al arrancar, el servidor hace una sola vez:

```js
const wg = loadWorldGen(STATIC);                       // ver decisión 2
const world = new Uint8Array(208*40*208);              // ≈ 1.7 MB
wg.genWorld(world, SEED);                              // MISMO generador que el cliente
for (const [idx, v] of edits) world[idx] = v;          // parcheo de ediciones ya validadas
```

…y en cada `edit` aceptado (mismo punto donde hoy hace `edits.push` y `broadcast:pedit`), además de empujar a `edits` escribe `world[idx] = v`.

**Por qué:** el servidor necesita `get(x,y,z)` exacto para colisionar sin pathfinding. Regenerar con el mismo generador + aplicar los mismos `edits` es la forma más barata de lograrlo (1.7 MB, una sola vez) y no requiere enviar el mundo por la red ni cambiar el protocolo.
**Alternativas descartadas:** (a) mandar el mundo al servidor por WS — payload enorme y estado redundante; (b) que el servidor **pida** bloques al cliente — el cliente no es autoridad y con un cliente desconectado el mundo sería incompleto; (c) un generador aproximado server-side (solo `hAt`) — no da colisión real contra construcciones del jugador, que es justamente lo que se exige; (d) un servicio de chunks aparte — desproporcionado para 208³.

### 2. Bloque `worldgen` compartido, cargado por el servidor desde `index.html`

Se extrae a un bloque marcado en `index.html`:

```js
/* worldgen:start */
// Constantes del mundo + ruido + generador + predicados de colisión de mob.
// Lo comparten el cliente (código inline) y el servidor (lo extrae de este HTML).
const WG_W=208, WG_H=40, WG_SURFACE=10 /*WATER_Y*/, WG_OX=48, WG_OZ=48;
// ids necesarios (literales, sin DEFS): AIR=0, GRASS=1, DIRT=2, STONE=3, LOG=4,
// LEAVES=6, SAND=7, BEDROCK=11, WATER=12, FLOWER_R=13, FLOWER_Y=14,
// DOOR_OPEN=24, DOOR2_OPEN=28, DOORZ_OPEN=30, DOORZ2_OPEN=32, TORCH=33, …
function hash2(x,z){ /* MISMO texto que hoy: lee el SEED global */ }
function vnoise(x,z){ … }
function fbm(x,z){ … }
const hAt = (x,z) => …;
function mulberry(seed){ … }
function genWorld(buf, seed){ SEED = seed; /* mismo algoritmo; escribe en buf */ }
function mobBlocked(v){ /* true = un mob no pasa */ }
/* worldgen:end */
```

El servidor la carga leyendo `index.html` del `STATIC` y evaluando el bloque (mismo patrón que `server/test/avatar.mjs:21-32`, pero en runtime):

```js
function loadWorldGen(dir){
  const html = fs.readFileSync(path.join(dir,'index.html'),'utf8');
  const i = html.indexOf('/* worldgen:start */'), j = html.indexOf('/* worldgen:end */');
  if (i < 0 || j < i) throw new Error('worldgen: marcadores ausentes en index.html');
  return new Function(html.slice(i,j) + '\n;return {WG_W,WG_H,WG_SURFACE,WG_OX,WG_OZ,hash2,vnoise,fbm,hAt,mulberry,genWorld,mobBlocked};')();
}
```

Detalles que hacen que esto funcione (y que son las trampas a evitar):

- `hash2` **sigue leyendo un `SEED` global**: en el cliente resuelve al `let SEED` del módulo (asignable porque está declarado antes del bloque); en el servidor, `genWorld(buf,seed)` hace `SEED = seed` (asignación a global en modo sloppy de `new Function`), que es exactamente el truco que ya usa `terrain.mjs` para inyectar la seed.
- El bloque debe ser **autocontenido**: sin `DEFS`, sin `THREE`, sin `document`. Si alguien mete una referencia externa, el server **no arranca** (fail fast, ver riesgos).
- El cliente cambia sus llamadas `genWorld()` (2467, 2504, 2515) por `genWorld(world, SEED)` y el reseteo de `edits.length=0` se mueve al wrapper del cliente que hoy hacía `genWorld()`.
- **Se conservan los call sites exactos** `hAt(x-OX,z-OZ)` (hoy 5: 946, 955, 968, 1630, 1736) y `hAt(sx-OX,sz-OZ)` (1639), y el texto `function hash2(x,z){` / `const hAt = `, para no romper `terrain.mjs`.

**Por qué compartir por marcador y no un archivo `.js` aparte:** `index.html` es el juego completo en un solo archivo (no hay build ni bundler) y el proyecto **ya** usa este patrón para el suavizado de avatares. Un `worldgen.js` aparte obligaría a un `<script src>`/import nuevo — cambio de arquitectura del cliente — o a un paso de build que hoy no existe. Extract-eval cuesta ~1 lectura del HTML al arrancar (una vez, ~100 KB) y garantiza **cero drift**.
**Alternativas descartadas:** (a) copiar el generador al servidor — drift silencioso, exactamente lo que se quiere evitar; (b) test que compare dos copias — detecta drift recién en CI y deja el bug vivo en producción; (c) `worldgen.js` compartido con import en el cliente — cambia el modelo single-file sin necesidad.

### 3. `mobBlocked`: predicado de colisión de mob compartido, con guard de drift contra `DEFS`

Los predicados que el servidor necesita (`mobBlocked`, y por encima de él `topSolidY`/`freeForMob`) viven en el bloque compartido, no en el servidor. `mobBlocked(v)` es la versión mínima de `isSolid`: **no** bloquean `AIR`, `WATER`, `FLOWER_R`, `FLOWER_Y`, `TORCH` ni las **puertas abiertas** (`DOOR_OPEN=24`, `DOOR2_OPEN=28`, `DOORZ_OPEN=30`, `DOORZ2_OPEN=32`); todo lo demás bloquea (incluidas losas y escaleras: para el zombi son bloques completos).

**Por qué no extraer `DEFS`:** `DEFS` (430-491) es una tabla con claves simbólicas y flags (`cube`, `opaque`, `door`, `open`, `glow`, `flower`, `slab`, `stair`) que hoy es la fuente de verdad del cliente para `isSolid` (921-923); extraerla entera al servidor arrastra semántica que el zombi no usa (durezas, tiles del atlas, css). Un predicado chico y explícito es más legible, pero introduce una **segunda fuente de verdad** para "qué es sólido".
**Mitigación (test):** el nuevo `server/test/worldgen.mjs` parsea estáticamente el `const AIR=0, GRASS=1, …` (414-423) y las entradas `[NOMBRE]: { … }` de `DEFS` para **derivar numéricamente** `isSolid` de cada id y contrastarla con `mobBlocked`; si alguien agrega un bloque pasable o cambia `open`/`cube` en `DEFS`, el test falla. Limitación declarada: losas/escaleras son "sólidas" para el zombi aunque el jugador las suba (ver riesgos).

### 4. Movimiento del zombi: caminata por superficie con auto-escalón de 1 bloque y deslizamiento por eje

El zombi **no** corre la física del jugador (`physicsMove`/`physicsGravity` con `collidesAt`, que depende de `DEFS` y de reglas de losas/escaleras). En cada tick, con el vector deseado normalizado `(dx,dz)`:

1. `nx = z.x + dx*sp*dt`, `nz = z.z + dz*sp*dt`.
2. `gy = topSolidY(nx,nz)` (bloque sólido más alto + 1).
3. Se acepta si `gy - z.y <= 1.0` (sube a lo sumo **1 bloque**) **y** `freeForMob(nx,gy,nz)` (los 2 bloques del cuerpo libres).
4. Si el paso diagonal está bloqueado: **deslizamiento** → intentar solo-`x` y después solo-`z` (el eje libre mueve; así "roza" la pared y dobla esquinas cuando el hueco está al costado).
5. Gravedad: si `gy < z.y`, baja hacia el suelo con velocidad de caída acotada (no atraviesa el suelo); nunca queda dentro de un bloque.
6. `z.yaw = atan2(dir.x, dir.z)` (convención del modelo que mira a +Z, igual que `tickAnimal:1759`).

**Por qué:** el terreno natural tiene escalones de 1 bloque por todos lados; un mob que no sube ni 1 bloque quedaría trabado en el pasto. El modelo "altura de columna + auto-escalón de 1 + deslizamiento" da movimiento creíble con muy poco código, sin física completa y sin poder atravesar paredes del jugador (que es lo que se quiere).
**Alternativas descartadas:** (a) reusar `collidesAt` con un `DEFS` duplicado — drift + reglas que el zombi no necesita; (b) física completa con velocidad vertical — más estado y más superficie de bugs para una criatura que solo camina; (c) pathfinding A* — explícitamente fuera de alcance (el usuario **quiere** que se trabe).

### 5. Tick del servidor a paso fijo (50 ms), con `dt` real y snapshot a 100 ms

```js
const ZOMBIE_TICK_MS = Math.max(25, +(process.env.ZOMBIE_TICK_MS || 50));   // 20 Hz
const ZOMBIE_SNAP_MS = Math.max(25, +(process.env.ZOMBIE_SNAP_MS || 100));  // 10 Hz
```

- El tick avanza la IA con `dt = min(0.1, (Date.now()-last)/1000)` (clamp ante un stall) — nunca con el intervalo nominal.
- El tick **no** emite red: solo muta el estado de la horda.
- La difusión de `zs` va en su propio `setInterval` de 100 ms (o contando ticks), y **solo** emite si hay zombis o si cambió la cantidad (evita spam de mensajes vacíos toda la partida).

**Por qué 50 ms:** a 50 % de 4.8 b/s el zombi avanza ~2.4 b/s ⇒ ~0.12 bloques por tick a 20 Hz, suficiente para pasar el chequeo de colisión de 1 bloque sin "saltarse" esquinas ni paredes; 20 Hz también queda por debajo de la cadencia de `mv` (70 ms) y cuesta ~nada para 4 zombis. **Por qué snapshot a 100 ms:** el cliente interpola (decisión 12), así que 10 Hz alcanza para verse fluido y baja el ancho de banda a ~10 mensajes/s con un array de 3-4 elementos (payload trivial).
**Alternativas descartadas:** (a) tickear a 10 Hz — con 0.34 bloques/paso el deslizamiento y la colisión se sienten a saltos; (b) tickear a 60 Hz — 3× el costo sin beneficio perceptible; (c) difundir en cada tick — 3× mensajes para la misma fluidez percibida.

### 6. Protocolo: aditivo, con el servidor como autoridad del daño del zombi

**Servidor → clientes**

```js
// welcome (campo nuevo, array; vacío si no hay zombis)
{ t:'welcome', …, zom:[ {i:1, p:[x,y,z], yaw, hp:6, dead:0, atk:0}, … ] }
// snapshot periódico (mismo espíritu que `tod`)
{ t:'zs', z:[ {i:1, p:[x,y,z], yaw, hp:6, dead:0, atk:0}, … ] }
// al atacante que el server validó
{ t:'zhitok', id:1, dmg:2, hp:4, dead:0 }
// a la víctima (mensaje EXISTENTE; ahora con el daño de ZOMBIE_DMG)
{ t:'phit', from:'Zombi', fromId:0, dmg:2, dx:0.6, dz:-0.8 }
```

**Cliente → servidor**

```js
{ t:'zhit', id:1 }   // el cliente NO manda daño: el server aplica SWORD_DMG
```

**Protocolo de jugador (extensión aditiva, para el bug de PvP)**

```js
// mv (sin mensaje nuevo: se suman dos campos al que ya viaja cada 70 ms)
{ t:'mv', p:[x,y,z], yaw, pitch, hp, dead, held:100, seq:7 }
// pm relayado con los mismos campos
{ t:'pm', id:2, p:[…], yaw, pitch, hp, dead, held:100, seq:7 }
// welcome.players y join también los incluyen (quien entra ya ve las armas)
{ t:'welcome', …, players:[ {id,name,mode,hp,dead,pos,yaw,pitch,held:100,seq:7}, … ] }
{ t:'join', id:2, …, held:100, seq:7 }
```

**Por qué:**
- `zs` batcheado (array) en vez de un mensaje por zombi: 1 mensaje por snapshot en lugar de 4, y el cliente actualiza todos de una.
- Los zombis muertos **siguen en `zs` con `dead:1`** durante los ~2 s de la animación (si se los quitara al instante, nadie vería la caída); recién después desaparecen del array y el cliente borra la malla.
- `zs`/`welcome.zom` incluyen el contador `atk` (decisión 16): es el disparador de la animación de ataque, sin mensaje nuevo.
- `zhit` **sin `dmg`**: para criaturas el servidor es la autoridad (a diferencia del PvP, que hoy confía en el cliente). Es el punto explícito pedido por el usuario.
- `zhitok` es un mensaje **nuevo** y no se reutiliza `hitok` porque los ids del enemigo y de los jugadores son **espacios separados** (jugador 1 y zombi 1 pueden coexistir) y el cliente necesita saber en qué mapa buscar el objetivo y dónde poner el número de daño.
- El daño del zombi al jugador reutiliza `phit` (`from:'Zombi'`): el handler del cliente **ya** aplica `damage()`, número de daño y knockback, así que no hay código nuevo para el golpe entrante. `fromId:0` no lo usa el cliente.
- `welcome.zom` evita que un jugador que entra recién vea zombis cuando llegue el próximo snapshot. Análogamente, `held`/`seq` en `welcome.players`/`join` evitan que recién llegado ignore el arma de los demás.
- Las dos extensiones del jugador son **campos nuevos en mensajes existentes** (no hay tipos de mensaje nuevos para `held`/`seq`): un cliente viejo los ignora sin romperse, y el costo es ~0 porque `mv` ya se manda cada 70 ms.

**Alternativas descartadas:** (a) `zhit` con `dmg` y validación del valor — confiar en el cliente sin ganar nada; (b) reutilizar `hitok` — colisión de ids; (c) un mensaje por evento (spawn/attack/death) — más tipos de mensaje y el cliente tendría que mantener un espejo consistente, cuando el snapshot ya resuelve el estado; (d) un mensaje `swing` dedicado para los jugadores — un tipo de mensaje más para una señal que ya viaja gratis en `mv` (ver decisión 16 para el costo de latencia).

### 7. La horda es un módulo puro y testeable (`server/zombie.js`), con RNG inyectable

`server/zombie.js` (CommonJS) no toca WebSockets ni `Date.now()` por dentro: recibe lo que necesita y devuelve intenciones.

```js
module.exports = {
  ZOMBIE_HP:6, SWORD_DMG:2, ZOMBIE_DMG:2, SPEED:2.4, WANDER_SPEED:1.2,
  VIEW_DIST:16, ATTACK_RANGE:1.2, ATTACK_CD_MS:1000,
  HIT_CD_MS:500, DEATH_HOLD_MS:2000, SPAWN_MIN:18, SPAWN_MAX:32, SPAWN_MIN_MOB:2,
  createHorde({ world, mobBlocked, topSolidY, freeForMob, rng }),
  // horde.tick(dt, { night, now, players }) -> { zs:[…], events:[ {to, t:'phit', …} ] }
  //   zs = [{ i, p:[x,y,z], yaw, hp, dead, atk }]   (atk = contador de golpes, decisión 16)
  // horde.spawnWave(players, now) -> cantidad (0 si no corresponde)
  // horde.hit(playerId, zombieId, now)  -> { ok, hp, dead, z } | null
};
```

`server.js` se limita a: crear la horda, aplicar los `events` a los `ws` correspondientes (lookup id→ws), difundir `zs`, y pasar `players` (id, `pos`, `dead`, `ws`).

**Por qué:** el proyecto está en **Strict TDD** y la IA tiene reglas (radio de detección, pérdida de objetivo, deslizamiento, spawn, cooldown) que se quieren testear **deterministas** (RNG y `now` inyectados) sin levantar un server ni esperar timers. Un módulo puro hace que `server/test/zombie.mjs` sea rápido y estable, y deja el test end-to-end solo para el cableado del protocolo.
**Alternativas descartadas:** (a) todo inline en `server.js` — imposible de unit-testear (require levanta el server), obligaría a cubrir la IA con sleeps reales; (b) meter la IA en el bloque worldgen de `index.html` — el cliente no la usa y el bloque debe quedar mínimo y sin estado; (c) testear solo por WS — lento, frágil y con menos casos cubribles.

### 8. Radio de detección circular, adquisición determinista, sin chequeo de línea de vista

- `VIEW_DIST = 16` (radio horizontal); se **elimina** `FOV_HALF` y todo chequeo de ángulo.
- Un jugador es visible si `distancia_horizontal <= VIEW_DIST` y **no está muerto** — sin importar hacia dónde mire el zombi.
- Sin objetivo, se recorre a los jugadores **ordenados por id** y se toma el **primero** visible (determinista).
- El objetivo se pierde si el jugador **muere**, **se desconecta** (deja de estar en `players`) o **sale del radio**; entonces el zombi pasa a deambular.
- **No hay chequeo de línea de vista (LOS)**: un zombi puede adquirir y mantener un objetivo detrás de una pared.

**Por qué circular y no un cono:** la primera implementación usaba un cono de ±60° sobre `z.yaw`, y al probarla en el navegador el usuario chocó con la sorpresa de acercarse por atrás y que el zombi no lo viera. Un radio es además más barato (una distancia, sin `atan2` ni normalización de ángulo) y quita una regla difícil de justificar en un mob sin animación de cabeza ni "mirar por el rabillo del ojo". El `yaw` del zombi se sigue actualizando hacia su dirección de movimiento, así que la orientación visual no se pierde.
**Por qué sin LOS:** el usuario pidió explícitamente que esconderse detrás de un muro haga que el zombi quede **trabado empujando** (comportamiento deseado, no bug). Con LOS, esconderse cortaría el objetivo al instante y el zombi se iría — lo contrario a lo pedido. Además el LOS con raycast contra el buffer agrega costo y una fuente más de discrepancias cliente/servidor.
**Deambulación:** sin objetivo, el zombi camina a `WANDER_SPEED` (50 % de la de persecución) hacia un destino aleatorio dentro de ±16 bloques clampeado al mundo, con pausas de 3-6 s (mismo espíritu que `tickAnimal`, del lado del servidor). Velocidad de deambulación menor = la persecución se nota.

### 9. Spawn: criterio concreto, una pasada por noche

Al ponerse `isNight()` verdadero **y** haber al menos un jugador conectado **y** no haber zombis vivos, se hace **una sola pasada**:

```
n = 3 + floor(rng()*2)            // 3 o 4
elegir p = un jugador vivo al azar
por cada uno de los n:
  θ = rng()*2π ; d = SPAWN_MIN + rng()*(SPAWN_MAX-SPAWN_MIN)
  buscar candidato (hasta 24 intentos girando θ, y hasta 2 anillos más lejanos):
    x,z = clamp(round(p.x + cosθ*d)), clamp(round(p.z + sinθ*d))
    válido si: topSolidY(x,z) >= WATER_Y+1        // superficie firme por encima del agua
               freeForMob(x, topSolidY, z)        // 2 bloques libres (cuerpo del zombi)
               distancia a todo otro zombi >= 2   // sin superponer
  si no hay candidato: se omite ese zombi (menos de n, nunca deja de spawnear por eso)
```

Cuando `isNight()` vuelve a falso, se marca a todos como muriendo (despawn con animación, decisión 10) y **no** se vuelve a spawnear hasta la próxima noche. Si los jugadores matan a los 4 al principio de la noche, no aparecen más esa noche (decisión de diseño: "pocos por noche").
**Por qué un anillo y no "cerca del jugador":** a 18-32 bloques el zombi no aparece en la cara (no es un jumpscare injusto) pero llega en unos segundos caminando, y el spawn no depende de la vista del cliente (que el server no conoce). Los intentos acotados (≤ ~72 probes con 2 chequeos cada uno) mantienen el costo despreciable y garantizan que un spawn en un lugar imposible (borde del mundo, océano, techo de una casa encima de agua) simplemente se saltee.

### 10. Muerte, despawn diferido y reutilización de la animación

El zombi tiene `dead` + `deadAt` en el servidor: al morir (hp 0 por golpe, o amanecer) pasa a **muriendo**, se sigue difundiendo con `dead:1` durante `DEATH_HOLD_MS = 2000`, y recién entonces se elimina de la horda. El cliente, al ver `dead:1`, corre la **misma** animación que el avatar remoto (`deadK` interpolado a 1.6/s, `g.rotation.x = -deadK*π/2`, extremidades a 0 con `deadK>.5`, barra oculta), que completa en ~0.63 s — dentro de los 2 s de la ventana. Cuando el id desaparece del `zs`, el cliente **borra la malla** (no hay animación de desaparición: se va tirado, y al agotarse la ventana se va del todo).
**Reutilización real:** se extrae la pose de muerte del bloque `net/avatar` a un helper `poseDead(o, wantDead, dt)` que usan `tickAvatar` **y** `tickZombie` (el bloque sigue siendo evaluable por `avatar.mjs`, que solo exige que estén `avatarShouldSnap`/`avatarLerpFactor`/`yawToward` y sus usos en `tickAvatar`).
**Por qué 2 s:** es el tiempo pedido y es suficiente para que se vea la caída y para que el jugador lea el número de daño letal. **Alternativa descartada:** despawn inmediato al morir (pedido explícitamente en contra: "no desaparecen instantáneo").

### 11. Ataque del zombi al jugador: lo decide el servidor, lo aplica el cliente

Cada tick, para el zombi con objetivo: si `distancia_horizontal <= ATTACK_RANGE (1.2)` y `|Δy| <= 1.5` y `now - lastAtk >= ATTACK_CD_MS (1000)`, emite `{to: targetId, t:'phit', from:'Zombi', fromId:0, dmg:ZOMBIE_DMG (2), dx, dz}` con `(dx,dz)` normalizado zombi→jugador (empuje hacia afuera), e **incrementa el contador `z.atk`** (decisión 16) que se difunde en el snapshot. El cliente lo aplica con su handler actual.

**Por qué 2 de daño:** con `hp=10` del jugador, 2 por golpe ⇒ **5 golpes** para derribarlo, que a una cadencia de 1/s son ~5 s de contacto — una amenaza que se siente sin ser un instakill. Con 1 de daño la primera implementación resultaba demasiado benigna (10 golpes). La constante vive en `server/zombie.js` (`ZOMBIE_DMG`) y viaja en el `phit`, así que el cliente no decide ni conoce el valor por su cuenta.

**Por qué el servidor decide el golpe (y no el cliente):** el servidor conoce ambas posiciones; el zombi es server-authoritative, así que su ataque también. **Limitación asumida:** el hp del jugador sigue siendo client-authoritative (`damage()` corre en el cliente, y `me.hp` en el servidor es solo espejo de `mv`); un cliente modificado puede ignorar el `phit`. Es el mismo nivel de confianza que el PvP actual y se documenta como límite conocido, no se resuelve acá. El `godT` de 0.6 s del cliente hace que, con cadencia de 1/s, todos los golpes entren (sin doble daño por ticks repetidos).

**Por qué una animación y no solo el daño:** la primera implementación emitía el `phit` **solo a la víctima** y el zombi no movía un músculo, así que el ataque era invisible para testigos y para la propia víctima más allá del número de daño. Se reutiliza el patrón de `swingT`/`poseDead` (decisión 16): el contador `atk` en el snapshot dispara en `tickZombie` una pose de brazo que golpea, visible en todas las pantallas.

### 12. Cliente: modelo, interpolación y golpe

- `makeZombie(i)`: molde de `makeAvatar` (1820-1848) sin etiqueta de nombre, piel verdosa (`0x6a9a4a`/`0x3f6b2f`), torso oscuro; mismo shape reutilizable: `{ g, armL, armR, legL, legR, mats, deadK, hp, dead, atk, atkSeen, swingK, bar, barC, barTex, target, yaw, t }`. Barra de vida propia con `hp/6`. **Ojos rojos brillantes** (decisión 15): dos cajas chicas `MeshBasicMaterial` rojo en la cara delantera de la cabeza.
- `tickZombie(z,dt)`: interpola `g.position` hacia `z.target` reutilizando **`avatarShouldSnap`** (snap ante saltos grandes) y **`avatarLerpFactor`** (lerp acotado por frame), gira con **`yawToward`** hacia `z.yaw` — **sin** el `+π` del avatar, porque el servidor manda el yaw en la convención del modelo que mira a +Z; y aplica `poseDead` para la caída. **Animación de golpe** (decisión 16): cuando cambia el contador `atk` arranca un gesto de brazo (patrón de `swingT`/`SWING_DUR` del viewmodel) que **pisa** la rotación del brazo caminante mientras dura.
- `zs` → `applyZs(m)`: upsert por `i` (crear malla si no existe / borrar si desapareció), setear `target`, `yaw`, `hp` (+ `drawZBar`), `dead` y **`atk`** (el disparo de la animación es al detectar el cambio: `atk !== atkSeen`). `welcome.zom` → mismo `applyZs` con el array inicial, e **`atkSeen` se inicializa en `atk`** para que un zombi que ya venía golpeado no dispare una animación falsa al entrar.
- `zhitok` → marca de impacto (`#hitm`), `tone`, `spawnDmgNum` **en la posición del zombi** con `-dmg`, y merge inmediato de `hp`/`dead` (feedback instantáneo sin esperar el snapshot).
- `swordAttack()`: después de `avatarHit()` (prioridad jugador), probar `zombieHit()` (raycast contra `zombieTargets`, `far=4.6` como los avatars) y, si hay zombi, `netSend({t:'zhit', id})`. El cooldown de 1 s ya existente aplica igual; **cada golpe real** (PvP o criatura) incrementa el contador local `swingSeq` que viaja en `mv` (decisión 16). El golpe al aire conserva la animación local de hoy pero **no** incrementa `swingSeq`.
- **Sin servidor no hay zombis** (no hay snapshots): en modo solo el juego queda exactamente como hoy. Es una consecuencia asumida de que el zombi sea server-auth.

### 13. Buff de la espada: capability nueva `player/combat`, no `player/mining`

El literal `dmg:1` (`index.html:2097`) pasa a `dmg:2` para PvP, y el servidor usa `SWORD_DMG=2` para `zhit`. El aviso `⚔️ ¡Al medio corazón a X!` acompaña el cambio a `⚔️ ¡Un corazón a X!` (con dmg 2, "medio corazón" sería mentira).

**Por qué `player/combat` y no `player/mining`:** `player/mining` describe **rotura de bloques** (tiempo por dureza, grieta, el pico como ítem) — incluye la espada solo como ítem de inventario (`item:'sword'`). El daño de la espada es una regla de **combate** (valor, cadencia, objetivo, validación del servidor) que va a evolucionar con armas/armadura/críticos, no con picado. Meterla en `player/mining` mezclaría dos dominios y ensuciaría la spec con comportamiento ajeno.
**Alternativas descartadas:** (a) `player/mining` — acopla combate a minería; (b) modificar `creatures/enemy` con el daño del arma — la regla es del jugador, no de la criatura; (c) no spec-ear el buff (solo tarea) — el daño es comportamiento observable y ya hay tests que lo van a fijar.

### 14. Estrategia de tests: 5 archivos nuevos, sin tocar los 6 existentes

| archivo | cubre |
|---|---|
| `server/test/worldgen.mjs` | bloque `worldgen` presente/autocontenido/evaluable; `genWorld` determinista; hash dorado del buffer por seed; `mobBlocked` vs `DEFS` (drift); parcheo por índice `edits`; el cliente llama `genWorld(world,SEED)`; el servidor **no** define un generador propio |
| `server/test/zombie.mjs` | módulo puro: spawn (cantidad, validaciones, RNG determinista), **radio de detección circular/adquisición** (incluye acercarse por detrás), pérdida de objetivo (muerte/desconexión/salir del radio), persecución + deslizamiento + auto-escalón + no atravesar paredes, **`SPEED`/`WANDER_SPEED` al 50 %**, ataque (rango/cadencia/payload **`ZOMBIE_DMG=2`**), **contador `atk` en el `zs`**, `hit()` (vida 6, daño 2, 3 golpes, fuera de alcance), despawn por amanecer y por muerte |
| `server/test/zombie-client.mjs` | estáticos del cliente: `makeZombie`/`tickZombie`/`zombieHit`/`applyZs`, reuso de `avatarShouldSnap`/`avatarLerpFactor`/`yawToward`/`poseDead`, **ojos rojos `MeshBasicMaterial` sin `PointLight` por zombi**, **animación de golpe disparada por el cambio de `atk`**, rama `zhit` en `swordAttack`, `dmg:2` y toast nuevo, que el modo solo no cree zombis |
| `server/test/zombie-protocol.mjs` | end-to-end WS con `ZOMBIE_FORCE_NIGHT=1` e intervalos cortos: spawn visible para dos clientes con el mismo id; `zhit` en alcance baja hp de 6 a 4 y `zhitok` confirma; 3 golpes matan y el id desaparece tras la ventana; `zhit` fuera de alcance se ignora; la víctima al alcance recibe `phit` con `from:'Zombi'` **y `dmg:2`**; el `zs` trae `atk`; sin `ZOMBIE_FORCE_NIGHT` no hay spawn; `world.json` sin campos de zombis |
| `server/test/avatar-held.mjs` (**nuevo**, capability `net/avatar`) | estáticos: builders `makeSwordModel`/`makePickModel` compartidos por viewmodel (`swordG`/`pickG`) y avatar remoto; `sendMove` manda `held`+`seq`; `pm`/`join`/`welcome.players` transportan `held`/`seq`; el avatar remoto muestra el arma y anima el golpe al cambiar `seq`; e2e en `zombie-protocol.mjs` de la propagación de `held`/`seq` a un tercero y a un recién llegado |

Los 6 tests pre-existentes **no se tocan** (regla del change); los **tests nuevos de este change se actualizan**: `zombie.mjs` y `zombie-protocol.mjs` por los valores cambiados (visión circular, `SPEED`, `ZOMBIE_DMG`, `atk`) y `zombie-client.mjs` para sumar los ojos y la animación de ataque; además se agrega `avatar-held.mjs`. Se suman los cinco archivos al script `test` de `server/package.json`. Seams solo-de-test, con el mismo criterio ya usado por `HB_INTERVAL_MS`/`TOD_INTERVAL_MS`: `ZOMBIE_TICK_MS`, `ZOMBIE_SNAP_MS` y `ZOMBIE_FORCE_NIGHT=1` (fuerza `isNight()` verdadero). El de "forzar noche" es un atajo de test explícito en producción; se elige antes que aflojar la regex de `static.mjs` (que no se puede tocar) o cambiar las constantes de 8 min del ciclo.

### 15. Ojos rojos con material autoiluminado, sin luces por criatura

Los ojos son dos cajas chicas sobre la cara delantera de la cabeza del zombi, con **`MeshBasicMaterial` rojo** (`0xff2a2a`), es decir un material que **ignora la iluminación** de la escena: se ven encendidos a plena luz y en la oscuridad, sin depender de que una linterna o la luna los alcance.

**Por qué material básico y no `PointLight` por zombi:** cada zombi iluminando la escena agrega una luz dinámica → recalcula la iluminación de todo lo que queda en su radio y, con sombras activas, suma trabajo por frame. Con 3-4 zombis por noche son 3-4 luces extras para un efecto que el usuario pidió como "que brillen", no como "que iluminen el terreno". Un material que no recibe luz da el mismo brillo percibido a costo cero. **Alternativa descartada:** un `Sprite` aditivo o un halo — se ve menos "ojo" y suma transparencias/orden de render; el `MeshBasicMaterial` es la opción mínima.
**Nota de consistencia:** el brillo del ojo es visual y no participa del raycast de ataque (`zombieTargets`), así que no cambia la superficie de golpe del zombi (la cabeza ya es objetivo).

### 16. Señal de golpe por contador incremental, no por timestamp

Tanto el zombi como los jugadores difunden sus golpes con un **contador entero que solo sube**:

- **Zombi**: `z.atk` vive en el servidor, arranca en 0 y se incrementa **cada vez que el tick emite un `phit`**. Viaja en cada entrada del snapshot `zs` (y en `welcome.zom`). El cliente compara con `z.atkSeen`: si cambió, reinicia la animación de brazo y actualiza `atkSeen`.
- **Jugador**: el cliente mantiene `swingSeq`, un contador local que se incrementa **en cada golpe real de espada** (PvP o criatura) y que viaja como `seq` en el `mv` que ya se manda cada 70 ms; el servidor lo guarda en `me` y lo relaya en `pm` (y en `welcome.players`/`join`). El cliente que recibe compara con `seqSeen`: si `seq > seqSeen`, anima; si `seq < seqSeen` (el emisor se reconectó y su contador volvió a empezar), **resincroniza sin animar**.

**Por qué un contador y no un timestamp:** con timestamps habría que comparar relojes entre máquinas (`Date.now()`/`performance.now()` de clientes distintos no están sincronizados) o mandar deltas con una referencia, y cualquier desfasaje produce golpes que no se animan o que se animan dos veces. Un contador monótono es inmune al desfasaje: el receptor solo mira si cambió (o creció), no cuándo. Además es **idempotente ante pérdida de mensajes**: si se pierde un snapshot, el siguiente trae un valor distinto y la animación sale una vez; si se repite, no sale de nuevo.
**Por qué en `mv`/`zs` y no un mensaje nuevo:** `mv` ya viaja cada 70 ms, así que sumar `held` y `seq` no agrega mensajes ni rondas de red; el costo es el de un entero más en un JSON que ya se serializa. La contrapartida es que el golpe de un jugador puede verse **hasta 70 ms tarde** en los demás — imperceptible frente a los 380 ms del gesto. El zombi no tiene esa latencia extra porque el `phit` y el `atk` se generan en el mismo tick y el snapshot sale a 100 ms.
**Alternativas descartadas:** (a) timestamp (ver arriba); (b) un mensaje `swing` dedicado por golpe — un tipo de mensaje y un round-trip más para una señal que ya viaja gratis; (c) animar en `phit`/`hitok` — la víctima y el atacante sí lo reciben, pero un **tercero** no ve nada (que es exactamente el bug reportado), y los golpes al aire no se verían.

### 17. Arma del avatar remoto con builder compartido y capability `net/avatar`

La construcción del modelo de espada (hoy inline en el bloque del viewmodel, `index.html:892-909`) y la del pico (914-933) se extraen a **builders** `makeSwordModel()`/`makePickModel()` que devuelven un `THREE.Group` centrado. Los usa:

- el **viewmodel en primera persona**: `swordG`/`pickG` siguen colgando de la `camera` y conservan su pose (`swordG.position.set(.42,-.42,-.7)`, `tickSword`/`tickPick` con `swingT`/`SWING_DUR`);
- el **avatar remoto**: según `held` (el id del ítem seleccionado que llega en `pm`/`join`/`welcome`), se cuelga del brazo derecho (`armR`) una copia **empequeñecida** de la espada (si `held === SWORD`) o del pico (si `held === PICK`); se coloca como hijo de `armR` para que herede el balanceo al caminar y la pose de ataque **con una sola rotación**.

**Por qué hijo de `armR`:** el avatar ya anima `armR.rotation.x` en el caminar (`tickAvatar`, `sw=.6*sin`). Colgar el arma ahí hace que siga el movimiento sin código extra y que el gesto de golpe (que **pisa** `armR.rotation.x`) mueva el arma y el brazo juntos, igual que el viewmodel mueve el grupo entero.
**Por qué el builder se extrae y no se duplica:** la geometría/materiales de la espada son 5 cajas y 3 materiales; copiarlos para el avatar remoto crea una **segunda fuente de verdad** que habría que mantener sincronizada a mano (y `static.mjs` vigila literales del viewmodel). Un builder es la forma mínima de compartir sin tocar el contrato del test.
**Por qué `net/avatar`:** el avatar remoto es lo que define esa capability, y lo que se agrega es **información y representación del jugador remoto** (qué lleva en la mano, cuándo golpea) — no una regla de combate (`player/combat` describe el daño del arma) ni una regla de la criatura (`creatures/enemy`). El suavizado que la capability ya define **no cambia**: son requisitos **nuevos** (delta `## ADDED`), así que no se rompe ningún escenario existente.
**Efectos colaterales verificados:** el arma del avatar remoto **no** se agrega a `avatarTargets` (no cambia el raycast del ataque); `removeRemote` borra el grupo entero, así que el arma se libera con el avatar; y un `held` desconocido/vacío simplemente no cuelga modelo.
**Alternativas descartadas:** (a) una capability nueva `net/equip` — sobredimensionado para 2 requisitos que pertenecen al avatar remoto; (b) usar `player/combat` — su dominio es el daño/cadencia de la espada, no la representación del remoto; (c) mandar el modelo entero por red — absurdo, la geometría es de cliente.

## Risks / Trade-offs

- [Risk] La IA **no hace pathfinding**: se traba contra muros y no rodea obstáculos → **Comportamiento pedido**, documentado en la spec; el deslizamiento por eje solo ayuda a doblar esquinas cuando el hueco está al costado.
- [Risk] El hp del jugador sigue **client-authoritative** (como el PvP actual): un cliente modificado puede ignorar el `phit` del zombi → Fuera de alcance; se documenta como límite conocido. El zombi server-auth no convierte el juego en anti-cheat.
- [Risk] El servidor **confía en `mv`** para la posición del jugador (y no valida la trayectoria): un cliente "teletransportado" puede descolocar la persecución → Aceptado (mismo nivel de confianza que el resto del MP).
- [Risk] **`isNight` es la señal de spawn**: el spawn está acoplado al reloj del ciclo; si el ciclo se tunea, cambia la ventana de spawn → Bueno: es exactamente el diseño de `world/daynight` ("para el futuro zombie server-auth") y queda explícito en la spec.
- [Risk] Los zombis **no persisten**: se pierden al reiniciar y reaparecen en la próxima noche → Por diseño; `world.json` sigue siendo `{seed, edits}` y hay un test que lo fija.
- [Risk] **Performance del tick nuevo** (20 Hz) y de la réplica de 1.7 MB → El tick hace ~4 zombis × (pocos chequeos de bloque), despreciable; la generación es **una vez al arranque** y el parcheo por edición es O(1). Se mide con log del tiempo de generación; si molesta, se puede bajar el tick a 100 ms (knob por env).
- [Risk] **Memoria**: 1.7 MB de buffer + `edits` → Irrelevante para el contenedor actual; no se persiste el buffer (se regenera).
- [Risk] Si alguien reformatea las líneas del **ciclo** en `server.js`/`index.html`, `static.mjs` rompe (regex literales) → Mitigación: reformatear `isNight` como `() => FORCE_NIGHT || phaseNow() >= NIGHT_START` conservando el patrón, y no tocar las líneas `const DAY_MS = …` / `const DAY_MS=…`; todo en las tareas.
- [Risk] El extract-eval del bloque hace que el servidor **dependa de `index.html`** y de sus marcadores (`new Function` = código dinámico) → Mitigación: fail fast con mensaje claro al arrancar y test dedicado (`worldgen.mjs`) que garantiza extractabilidad y autocontención antes del deploy.
- [Risk] **Drift** de `mobBlocked` vs `DEFS` (segunda fuente de verdad de solidez) → Mitigación: test que deriva `isSolid` de `DEFS` parseado y lo compara id por id.
- [Risk] Las **losas y escaleras son bloques completos** para el zombi (no sube 0.5) → Aceptado: solo aparecen si el jugador las construye; se comporta como "se traba" (deseado) y queda declarado.
- [Risk] Con **más de 300 000 ediciones** el servidor descarta las más viejas de `edits` pero su buffer las mantiene ⇒ un cliente que entra después regenera sin esas ediciones y puede ver un mundo distinto al de la colisión del zombi → Mitigación: documentado; umbral altísimo y solo afecta a bloques viejísimos. Alternativa futura: compactar el buffer o persistir un snapshot.
- [Risk] **Convención de yaw**: si el cliente renderizara el zombi con el `+π` de los avatars, el zombi miraría al revés → Mitigación: `zombie-client.mjs` verifica que `tickZombie` gira con `yawToward` hacia `z.yaw` **sin** sumar `π`.
- [Risk] El cliente **aplica sus ediciones localmente y confía** en que el servidor las acepte (rechaza bounds/`v:11`/`y:0`); si el server rechazara una edición, el terreno del zombi y el del cliente difieren hasta el próximo `welcome` → Mitigación: los rechazos posibles son inalcanzables desde la UI (bedrock en y0 es indestructible/no colocable); documentado.
- [Risk] **Clientes viejos** (HTML cacheado) reciben `zs`/`zom` y no hacen nada, pero su mundo puede diferir del server si no se recargó → El static se sirve `no-cache` y los mensajes son aditivos (la sesión no se rompe).
- [Risk] Zumbis **bajo el agua**: el agua se trata como no bloqueante pero el spawn exige superficie sobre el nivel del mar, así que un zombi persiguiendo puede terminar sumergido caminando por el fondo → Aceptado (consecuencia simple de "el agua no bloquea"); el ataque usa distancia horizontal con `|Δy|<=1.5`, así que no golpea desde el fondo del mar.
- [Risk] `phit` reusado manda `from:'Zombi'` y el mensaje de muerte del cliente queda `Te derrotó Zombi.` → Es el comportamiento buscado.
- [Risk] Tests nuevos que **levantan un server real** (protocolo) son lentos y sensibles a timers → Mitigación: knobs por env (`ZOMBIE_TICK_MS`, `ZOMBIE_SNAP_MS`, `HB_INTERVAL_MS`, `IDLE_TIMEOUT_MS`), RNG inyectado en los unit tests y esperas con timeout, siguiendo el patrón de `protocol.mjs` §7.
- [Risk] **Radio de detección sin ángulo** (y sin LOS): el zombi ve al jugador desde atrás y a través de paredes → **Comportamiento pedido** (el bug era justamente no ver desde atrás); el contrapeso de "través de paredes" es que igual se **traba** contra el muro (decisión 8), y sigue siendo escapable por distancia.
- [Risk] **`SPEED` al 50 %**: el zombi puede sentirse lento o no alcanzar nunca a un jugador que camina en línea recta → Bueno: escapar caminando es la experiencia buscada (y con Shift se aleja más rápido); `SPEED`/`WANDER_SPEED` son constantes tuneables si el balance no convence.
- [Risk] **Ojos `MeshBasicMaterial`**: ignoran la iluminación, así que no se atenúan con la niebla ni con la luz del día y pueden verse "planos" → Aceptado: el objetivo es que brillen de noche; el efecto es solo en dos cajas chicas de la cara.
- [Risk] **`atk`/`seq` como contadores**: si un cliente se reconecta, su `seq` vuelve a 0 → Mitigación: la regla `seq < seqSeen` **resincroniza sin animar** (decisión 16); el `atk` del zombi vive en el servidor y no se resetea mientras el zombi exista.
- [Risk] **El golpe de un jugador se ve hasta 70 ms tarde** en los demás (viaja en `mv`) → Aceptado: imperceptible frente a los 380 ms del gesto; se prefiere a un tipo de mensaje nuevo.
- [Risk] **Geometría extra en los avatares remotos** (espada/pico por avatar) y en el raycast → Mitigación: los modelos en mano **no** entran a `avatarTargets` (no alteran el golpe) y se liberan con el avatar en `removeRemote`; son 5 cajas por avatar equipado.
- [Risk] **El refactor del viewmodel rompe literales que vigila `static.mjs`** (`PICK_POS`/`PICK_ROT`, `pickG.scale.setScalar(`, `swingT`/`SWING_DUR` en `tickSword`/`tickPick`) → Mitigación: el builder **no** cambia esos literales (los reproduce en el mismo texto); hay tarea explícita de regresión con `node server/test/static.mjs` sin editarlo.

## Migration Plan

- Deploy: como el change toca `server/server.js` (+ `server/zombie.js` nuevo), el push a `main` dispara CI + deploy Easypanel. `index.html` viaja en el mismo deploy. **Sin migración de datos**: `world.json` intacto (`{seed, edits}`) y los zombis no se persisten.
- Orden de despliegue seguro: el server nuevo arranca, replica el mundo, y si no es de noche no hay zombis ⇒ el comportamiento visible es el de hoy salvo que llegue la noche.
- Compatibilidad: server nuevo + cliente viejo = los mensajes `zs`/`zom`/`zhitok` y los campos `held`/`seq`/`atk` se ignoran (sin zombis en pantalla ni arma en avatares, sesión sana); cliente nuevo + server viejo = no llega `zs`/`zom` ⇒ no hay zombis y `zhit` nunca se manda porque `zombieHit()` no encuentra nada, y el avatar remoto se ve sin arma (sin `held`/`seq` no cuelga modelo ni anima). Ambos degradan sin romper.
- Rollback: revert del change; no hay datos que revertir. Tras el rollback el juego vuelve a lo de hoy (sin zombis, espada de 1, sin arma en el avatar remoto).

## Open Questions

- ¿El jugador debería recibir también daño por contacto al tocar/empujar al zombi? Hoy solo hay daño por golpe a 1.2 bloques (ahora 2 por golpe); se puede sumar después sin cambiar la spec (ya se declara "al alcance").
- ¿Debería haber regulación por cantidad de jugadores (p. ej. 3-4 por jugador conectado)? Hoy el tope es fijo por noche; tuneable por constante.
- ¿Los zombis deberían soltar algún ítem al morir (huesos)? Fuera de alcance; no hay sistema de drops para criaturas.
- ¿Conviene un sonido/gruñido ambiental del zombi (como `sfxOink`)? No está pedido; se puede agregar encima sin tocar la spec de comportamiento.
