# Design

## Context

Ver `proposal.md` — Why. El estado actual relevante:

- El server es un único proceso Node 20 sin framework HTTP (`server/app.js` crea el `http.Server`, el `WebSocket.Server`, el mundo replicado y la horda) y `server/server.js` es el bootstrap.
- El mundo ya está replicado en memoria (`world: Uint8Array`, `WG.topSolidY`, `WG.freeForMob`, `WG.mobBlocked`) y `server/zombie.js` tiene el patrón de IA pura con `tick(dt, state) → { zs, events }`, colisión (`groundAt` + `moveTo`) y daño server-authoritative.
- `bot/cazador.js` tiene la lógica de vuelo libre (`freeMove`, `alignAltitude`, banda muerta), selección de presas (`isPrey`, `nearestPrey`), cadencia de golpe (`HIT_GAP_MS = 650`) y spawn (`parseWorld().findSpawn()`).
- El panel `/admin` y su router (`server/admin-api.js`) ya resuelven authz, CSRF, JSON estricto, 8 KB, rate limit, `no-store`, auditoría y guardas transaccionales con advisory lock.
- El roster se arma inline en `server/app.js` (`welcome.players`, `join`, `pm`, `leave`) y el cliente (`index.html`) dibuja cualquier entrada como avatar con `id`, `name`, `mode`, `skin`, `pos`, `hp`, `dead`, `held`, `seq`.
- `Dockerfile` copia `server/*.js` (archivos planos), no subdirectorios. `docker-compose.yml` tiene el servicio `minicraft-bot` y `.github/workflows/deploy.yml` un webhook para el bot.
- Las migraciones son forward-only, ordenadas por nombre, con advisory lock (`server/migrate.js`).

## Goals / Non-Goals

**Goals**

- Un solo proceso y un solo contenedor: los bots viven y mueren con el server.
- Reutilizar los patrones existentes (router admin, store con transacciones, horda pura, mundo replicado) sin introducir framework, build ni dependencias.
- Mantener el protocolo aditivo: clientes viejos siguen jugando y los bots se ven como avatares normales.
- Que el panel sea la única superficie de control y que la configuración sobreviva a reinicios.

**Non-Goals**

- Mundo Infinito, pathfinding A*, anti-cheat, bots creados por usuarios, alta disponibilidad multi-réplica.
- Escalar a decenas de bots: el límite duro es 5 y el diseño asume ese orden de magnitud.

## Decisions

### 1. Runtime in-process, no un proceso hijo ni un servicio aparte

El runtime corre en el mismo proceso que el juego. Alternativas: (a) `child_process.fork` por bot para aislar CPU y crashes; (b) seguir con contenedores de bot. Se descartan: el estado que necesitan (jugadores, mundo, sockets, permisos) ya está en memoria del server y compartirlo por IPC obliga a serializar posiciones y frames 10–20 veces por segundo, justo lo que se quiere evitar. El costo de 5 bots con tick de 50 ms es despreciable frente al tick de zombis ya existente.

Se asume **una sola réplica del server**. Con varias réplicas cada una spawnearía los mismos bots activos y el roster quedaría duplicado. Mitigación operativa: `BOTS_ENABLED=0` permite apagar el runtime en una réplica; el supuesto queda documentado como límite conocido (ver Riesgos).

### 2. Mapa `bots` separado en `app.js`, no WebSockets falsos

Los bots **no** se insertan en el `Map` `players` (que mapea `ws → jugador`). Se mantiene un registro propio del runtime:

```js
// app.js
const bots = BotRuntime.create({
  store, world, WG, now, log, warn,
  getPlayers: () => [...players.values()].map(p => ({
    id: p.id, name: p.name, pos: p.pos, dead: p.dead, mode: p.mode,
    admin: p.admin === true, skin: p.skin, permissions: p.permissions,
  })),
  broadcast,                       // difunde a los sockets reales
  sendToPlayer: (id, frame) => { const ws = wsById(id); if (ws) send(ws, frame); },
  staticDir: STATIC,
});
```

Ventajas: el heartbeat, el idle-kick, la revalidación de sesión y el quórum de sueño siguen operando solo sobre jugadores reales, sin ramas nuevas. Un WebSocket falso en `players` habría exigido un `readyState` y un `send` de mentira, y habría contaminado bucles que asumen sockets.

### 3. Ids negativos reservados y campos aditivos en el roster

`botRuntimeId = -dbId`. Los ids de jugador salen de `nextId++` (positivo), así que no colisionan nunca y el cliente puede usar el mismo `Map remotes` sin cambios. La entrada de roster es:

```js
{ id: -3, name: 'OPSX-bot', mode: 'player', bot: true, skin: 'robot',
  hp: 10, maxHp: 10, dead: 0, pos: [x,y,z], yaw, pitch: 0, held: 100, seq }
```

`maxHp` es nuevo y aditivo; el cliente lo usa para la barra y cae a 10 si falta. `mode:'player'` mantiene la semántica de no-admin. La entrada MUST NOT incluir `botIgnore`.

### 4. Contrato de comportamiento declarativo; el runtime aplica el daño

`server/bot-behaviors.js` expone un registro extensible:

```js
registerBehavior({
  id: 'cazador', label: 'Cazador', hostile: true,
  decide(ctx /* {self, players, home, world, now, rng, dt} */) {
    // devuelve { moveTo, stop, face, attackTargetId } | null
  },
});
```

Reglas del contrato:

- `decide` **no** mueve, **no** emite daño y **no** conoce `damage`/`reach`/`flying`. Solo declara intención.
- El runtime valida la intención (distancia, `reach`, cadencia, admin/`bot_ignore`) y recién ahí emite el `phit`.
- `players` que recibe `decide` ya viene filtrado: vivos, no admin, no bots; para comportamientos hostiles además sin `bot_ignore`.
- Volar es configuración (`flying`), no comportamiento: el mismo `cazador` funciona volando o caminando.

Ventaja de seguridad: un comportamiento nuevo no puede escalar daño ni atacar admins por olvido; la política vive en un solo lugar. Alternativa considerada: que cada comportamiento emita frames (como el bot externo). Se descarta porque reparte la política en N módulos.

### 5. Configuración y catálogos en un módulo puro

`server/bot-config.js` es la única fuente de:

```js
BOT_LIMITS = { maxActive: 5, hp: [1,100], damage: [0,20], reach: [1,10], speed: [1,30] };
BOT_NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
BOT_SKINS = ['human','fat','giant','small','zombie','mujer','moreno','gojo','robot']; // = SKIN_SIZE + robot
BOT_DEFAULTS = {
  cazador:    { skin:'robot', hp:10, damage:6, reach:4.6, speed:28.8, flying:true,  takesDamage:false },
  merodeador: { skin:'human', hp:10, damage:0, reach:1,   speed:6,    flying:false, takesDamage:false },
};
CLASSIC_HUNTER_PRESET = { behavior:'cazador', skin:'robot', hp:10, damage:6,
                          reach:4.6, speed:28.8, flying:true, takesDamage:false };
```

`normalizeBotInput(body, { partial })` devuelve `{ ok, value, errors }` con un código por campo. Los números deben ser `typeof === 'number'`, finitos y con paso 0.1 para `reach`/`speed` (`Math.round(v*10) === v*10`). El DB repite los rangos con CHECKs para que una fila editada a mano no rompa el runtime; el módulo es la fuente de mensajes y defaults.

**Velocidad y preset:** el cazador histórico vuela a 28.8 u/s. El usuario aprobó subir el máximo a 30 para conservar esa velocidad; el preset usa 28.8 y el rango sigue acotado (1–30, ~6× la caminata de un jugador). El resto de los topes no cambia.

El preset es del panel; la API no crea nada con un flag `preset`. El botón solo completa el formulario y el admin confirma un alta normal.

### 6. Esquema y migración

`server/migrations/003-bots.sql` (forward-only, idempotente por el runner):

```sql
CREATE TABLE IF NOT EXISTS bots (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  behavior     TEXT        NOT NULL,
  skin         TEXT        NOT NULL,
  hp           INTEGER     NOT NULL DEFAULT 10,
  damage       INTEGER     NOT NULL DEFAULT 2,
  reach        NUMERIC(3,1) NOT NULL DEFAULT 4.6,
  speed        NUMERIC(4,1) NOT NULL DEFAULT 9.6,
  takes_damage BOOLEAN     NOT NULL DEFAULT TRUE,
  flying       BOOLEAN     NOT NULL DEFAULT TRUE,
  active       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by   BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bots_name_len     CHECK (char_length(name) BETWEEN 3 AND 16),
  CONSTRAINT bots_name_shape   CHECK (name ~ '^[A-Za-z0-9_-]+$'),
  CONSTRAINT bots_hp_range     CHECK (hp BETWEEN 1 AND 100),
  CONSTRAINT bots_damage_range CHECK (damage BETWEEN 0 AND 20),
  CONSTRAINT bots_reach_range  CHECK (reach BETWEEN 1 AND 10),
  CONSTRAINT bots_speed_range  CHECK (speed BETWEEN 1 AND 30),
  CONSTRAINT bots_behavior_allow CHECK (behavior IN ('cazador','merodeador')),
  CONSTRAINT bots_skin_allow CHECK (skin IN ('human','fat','giant','small','zombie','mujer','moreno','gojo','robot'))
);
CREATE UNIQUE INDEX IF NOT EXISTS bots_name_lower_key ON bots (lower(name));
CREATE INDEX IF NOT EXISTS bots_active_idx ON bots (id) WHERE active;
```

`reach`/`speed` en `NUMERIC` para conservar 4.6 y 7.5; se serializan a `number` en el store. `updated_at` lo actualiza el store en cada escritura (no hay trigger). `admin_audit` **no cambia**: `target_user_id` es FK a `users` y los bots no son usuarios; el id y el nombre del bot viajan en `details` (`{ botId, botName, behavior }`). Alternativa considerada: agregar `target_bot_id` con FK; se descarta para no multiplicar columnas y porque el borrado del bot dejaría el historial con `NULL` igual que ya pasa con usuarios.

### 7. Límite de 5 con advisory lock

`store.startBot(id)` hace todo dentro de `db.withTransaction`:

```sql
SELECT pg_advisory_xact_lock(hashtext('minicraft:bots-active'));
-- leer bot; si no existe → notFound
-- si active → alreadyActive (idempotente)
SELECT count(*)::int FROM bots WHERE active;
-- si n >= 5 → limit
UPDATE bots SET active = true, updated_at = now() WHERE id = $1 RETURNING *;
```

Es el mismo patrón que las guardas del último admin y serializa dos lanzamientos simultáneos entre réplicas. `stop` no necesita lock. `delete` verifica `active` dentro de la misma transacción y responde `bot_active`.

`MemoryStore` replica la interfaz con su cola `_txQueue`, que ya serializa transacciones en los tests.

### 8. Contrato HTTP

Router: se suman las rutas al `route()` de `server/admin-api.js` (mismo gate, helpers, limiter y `no-store`). Catálogo y límites viajan en el listado para que el panel no duplique constantes.

| Método | Ruta | Éxito | Cuerpo |
|---|---|---|---|
| GET | `/api/admin/bots` | `200` | `{ bots: BotView[], limits: { maxActive: 5 }, catalog: { behaviors: [{id,label,hostile}], skins: string[] } }` |
| POST | `/api/admin/bots` | `201` | `{ bot: BotView }` |
| PATCH | `/api/admin/bots/:id` | `200` | `{ bot: BotView }` |
| DELETE | `/api/admin/bots/:id` | `204` | — |
| POST | `/api/admin/bots/:id/start` | `200` | `{ bot: BotView }` |
| POST | `/api/admin/bots/:id/stop` | `200` | `{ bot: BotView }` |

`BotView`:

```json
{ "id": 3, "name": "OPSX-bot", "behavior": "cazador", "skin": "robot",
  "hp": 10, "damage": 6, "reach": 4.6, "speed": 28.8,
  "takesDamage": false, "flying": true, "active": true,
  "runtime": { "online": true, "hp": 10, "pos": [100.5, 30, 100.5] },
  "createdAt": "...", "updatedAt": "..." }
```

Códigos de error: `400 invalid_request` (id o cuerpo inválido), `401 unauthorized`, `403 admin_required`, `403` de Origin, `404 bot_not_found`, `404 invalid_request` para método/ruta, `409 bot_name_taken|bot_active|bot_limit_reached`, `413`, `415`, `422` con `{ error, message, details: { field, reason } }`, `429 rate_limited`, `503 unavailable`.

El alta acepta solo configuración: `active` en el body → `422 invalid_field`. El estado se cambia con `start`/`stop`, lo que hace imposible crear un bot activo salteando el cupo.

Nombre: además de único entre bots, se rechaza si coincide (case-insensitive) con un `username` existente (`409 bot_name_taken`). Evita suplantación visual en el roster; cuesta una consulta que el store ya tiene (`getUserByUsername`).

### 9. Tick, snapshots y costo

- `BOTS_TICK_MS` default **50** (env, mismo orden que `ZOMBIE_TICK_MS`), `dt = min(0.1, (now - prev)/1000)`.
- `BOTS_SNAP_MS` default **100**: cada bot activo difunde un `pm` a ~10 Hz. 5 bots × 10 Hz = 50 frames/s para N jugadores; con 10 jugadores son 500 mensajes/s pequeños, comparable al `mv` de 70 ms que ya existe.
- El tick de bots es independiente del de zombis y del `mv`; no comparte presupuesto ni orden. Los bots se calculan en una pasada O(bots × jugadores), con 5 bots y los jugadores conectados.
- Si un tick tarda o el proceso se pausa, `dt` acotado evita teletransportes.
- El daño se aplica dentro del tick (decisión + validación) y los frames se emiten en el acto, no en el snapshot.

### 10. Movimiento: dos ramas, un solo runtime

**Volador (`flying:true`)**: se portan `freeMove` y `alignAltitude` del cazador. Suma directa en x/y/z sin consultar el mundo, altura objetivo `target.y + 0.5` con banda muerta 0.25 y paso máximo `speed * dt`. La única restricción es el borde del mundo (`clampToWorld`). Sin gravedad ni resolución de suelo.

**Caminante (`flying:false`)**: se porta el steering de `server/zombie.js` sobre el mundo ya replicado:

```js
cell(p) → [floor(p-0.3), floor(p+0.3)]
groundAt(nx, nz, y) → max(topSolidY) de las celdas; null si sube > 1 o el cuerpo no entra (freeForMob)
moveTo(x, z, dx, dz, speed, dt) → intenta diagonal, después solo-x, después solo-z
```

La gravedad se agrega arriba de `groundAt`: si el suelo está por debajo, `y = max(gy, y - speed*dt)`; si `gy - y > 1`, el paso se rechaza. Auto-escalón = el `> 1` de `groundAt`.

**Rodeo simple (sin A*):** si el paso directo no avanza (el deslizamiento de `moveTo` mueve poco y no acerca al objetivo), `moveWalk` prueba las dos perpendiculares (±90°), después hacia atrás y, si no hay paso, aplica gravedad. Recuerda el lado del rodeo ~400–700 ms para no oscilar y lo limpia apenas vuelve a avanzar directo; nunca atraviesa bloques ni teletransporta. Si un caminante persigue y no logra acercarse en ~3,5 s, suelta ese objetivo por 4 s (el guardián reintenta si el enemigo sigue en zona) para no empujar contra un árbol para siempre. El rodeo no garantiza salir de un laberinto: eso sigue documentado como límite.

El radio del cuerpo es fijo (0.3) y la altura 1.8 para todos los bots, aunque el skin sea `giant`/`small`: el bot es server-side y no replica la hitbox del cliente. La diferencia visual no cambia la simulación.

### 11. Daño en las dos direcciones

**Bot → jugador.** El runtime emite `{ t:'phit', from: bot.name, fromId: bot.id, dmg: bot.damage, dx, dz }` directo al socket de la víctima. Antes de emitir:

1. La víctima existe, está viva, no es admin y (si el comportamiento es hostil) no tiene `bot_ignore`.
2. Distancia horizontal ≤ `reach` y `|dy| ≤ 2.5`.
3. `damage > 0`.
4. Pasaron ≥ 650 ms desde el último golpe de ese bot a esa víctima.

El `phit` no pasa por el handler `hit`, así que no hay clamp de 6 ni confianza en el cliente. El cliente sigue aplicando el daño a su propia vida (client-authoritative), límite conocido y ya documentado; el server no reconcilia vida de jugador.

**Jugador → bot.** En el handler `hit`, después de buscar el socket del target, se busca el bot por id:

```js
const bot = bots.getById(m.id);
if (bot) { const r = bots.applyPlayerHit(bot, me, now()); /* {accepted, dmg, hp, dead} */ }
```

Validaciones: `takes_damage === true`, distancia horizontal ≤ `Skins.swordReach(me.skin)`, cooldown de 500 ms por (atacante, bot). El daño es **fijo 2**, igual que `Zombie.SWORD_DMG`; se ignora el `dmg` del frame. Respuesta: `hitok { id, dmg, hp, dead }` (`dmg:0` si es inmune o inválido). No se envía `phit` a nadie: el bot no tiene socket. La vida del bot es server-authoritative y se difunde por `pm`.

Alternativa considerada: reutilizar el `dmg` del cliente como en PvP. Se descarta: permitiría bajar 6 por golpe y matar un bot de 100 en 17 golpes en vez de 50, y haría la vida del bot manipulable.

### 12. Muerte, stop, edición y respawn

- **Muerte** (hp ≤ 0, `takes_damage`): el runtime lo saca del mapa, difunde `leave` + chat `💀 <name> fue destruido`, y persiste `active=false` (config intacta). Audita `bot.death` con actor nulo (`details.system = true`). Sin respawn automático: al reiniciar, `active=false` no se spawnea.
- **Stop** (API): primero persiste `active=false`; después el runtime lo saca y difunde `leave`. Si la persistencia falla → `503` y el bot sigue. Es preferible un bot de más que un fantasma en DB.
- **Start** (API): transacción con cupo → `active=true`; después `runtime.spawn(row)`. Si el spawn falla (config corrupta), se revierte `active=false` y responde `503`; nunca queda activo sin runtime.
- **Edición**: `PATCH` persiste; si el bot está activo, el runtime hace `despawn` + `spawn` con la configuración nueva y vida reiniciada a `hp`. Se elige esto sobre "exigir detener para editar" porque el panel no debe mostrar una configuración que el juego no está usando. La auditoría `bot.update` guarda `before`/`after`.
- **Boot**: `runtime.boot()` corre al construir la app; `store.listBots({ active: true })`, spawnea hasta 5 ordenados por `id` y avisa si hay más. `app.bots.ready` es una promesa que los tests esperan.
- **Shutdown**: `app.close()` limpia el interval y vacía el mapa; no escribe `active` (los activos deben volver al boot).

### 13. Retiro del bot externo y de `BOT_TOKEN`

- `server/ws-auth.js`: se elimina la rama `Authorization`/`bearer`; el gate solo lee cookie y rechaza sin sesión con `401`. `server/env-config.js` pierde `botToken`; `server/app.js` pierde `kind:'bot'` y el descarte de `hit` por `me.bot`.
- Si `BOT_TOKEN` está seteada, `server.js` (o `admin-bootstrap`) emite **un** warning sin valor: "BOT_TOKEN ya no se usa; los bots se administran en /admin". No se loguea el token.
- Se eliminan `Dockerfile.bot`, `bot/index.js` y `bot/cazador.js`. La lógica útil (vuelo, presas, cadencia) se porta a `server/bot-behaviors.js` y `server/bot-runtime.js`; `parseWorld` no hace falta porque el server ya tiene el mundo. El test `server/test/bot-cazador.mjs` se reemplaza por los tests de bots.
- `docker-compose.yml`: se quita `minicraft-bot` y `BOT_TOKEN` del server.
- `.github/workflows/deploy.yml`: se quita `EASYPANEL_BOT_WEBHOOK`, el archivo temporal del bot y su rama en el loop; queda solo el webhook del server.
- El bot viejo no se puede "apagar desde el server": si su App sigue en Easypanel, reintenta y recibe `401`. El paso operativo obligatorio es detener/borrar esa App después del deploy.

### 14. Cambios mínimos en el cliente

- `drawBar(a)` usa `a.maxHp || 10` en vez del 10 fijo.
- `addRemote(p)` guarda `a.maxHp = Number.isFinite(p.maxHp) ? p.maxHp : 10`; el handler `pm` actualiza `maxHp` si llega y redibuja.
- `hitok`: muestra el número de daño solo si `m.dmg > 0`; con 0 no dibuja nada (el arma ya hizo el gesto). Nada más.
- El cliente **no** necesita conocer `bot:true`; el campo se ignora y el avatar se dibuja por `skin`.

### 15. Tests por capa (TDD)

| Capa | Archivo | Casos clave |
|---|---|---|
| Config unit | `bots-config.mjs` | rangos, pasos 0.1, nombre, allowlists, defaults, preset, códigos |
| Behaviors unit | `bots-behaviors.mjs` | cazador elige el más cercano, ignora admin/`bot_ignore`/muerto/bot, cadencia 650, `damage:0`; merodeador nunca ataca; registro extensible; vuelo y caminata puros con mundo inyectado |
| HTTP API | `bots-api.mjs` | 401/403, listado con catálogo, alta/errores, duplicado, patch, delete activo/inactivo, start/stop idempotentes, cupo 5, auditoría, `no-store`, Origin, 415/413, rate limit |
| DB | `bots-db.mjs` | migración 003 dos veces, CHECKs, unicidad lower(name), FK `created_by`, carrera de cupo, `listBots({active})` |
| Runtime/e2e | `bots-runtime.mjs` | boot con activos, roster `welcome`/`join`, `pm`, cazador mata, nunca admin/`bot_ignore`, merodeador pacífico, hit a bot y muerte, inmune, stop, sin edits, caminante no atraviesa paredes |
| Estáticos | `bots-static.mjs` | sección Bots, tabla, formulario, preset, borrado, `maxHp` en `index.html`, compose sin bot, workflow sin webhook, sin `BOT_TOKEN` |
| Regresión | suite existente | changes 1–2 verdes; `ws-auth.mjs` ajustado a cookie-only; `bot-cazador.mjs` eliminado |

El fixture `server/test/support/app-fixture.mjs` espera `app.bots.ready` para que los tests no corran antes del boot. `MemoryStore` gana `listBots`, `getBot`, `createBot`, `updateBot`, `deleteBot`, `startBot`, `stopBot` y `countActiveBots`.

### 16. Docker, CI y operación

- No se toca el `Dockerfile`: los tres módulos nuevos son planos (`server/bot-*.js`) y entran en `COPY server/*.js`. Se evita `server/bots/` justo por eso.
- CI corre los tests nuevos en la misma cadena de `server/package.json`; `bots-db.mjs` se gatea por `TEST_DATABASE_URL` y `REQUIRE_DB_TESTS=1`.
- Pasos post-deploy en Easypanel: (1) detener/borrar la App `minicraft-bot`; (2) quitar `BOT_TOKEN` del entorno del server; (3) borrar el secret `EASYPANEL_BOT_WEBHOOK` de GitHub; (4) entrar a `/admin` → Bots → “Preset cazador clásico” → crear → Lanzar.

## Risks / Trade-offs

- **El cazador clásico corre a 28.8 u/s** → el máximo se fijó en 30 y el preset usa 28.8, conservando la velocidad histórica sin salir del rango validado.
- **Un bot caminante puede quedar trabado en laberintos** sin A* → el rodeo simple resuelve árboles y paredes con espacio alrededor; en un laberinto cerrado puede no encontrar salida. Los destinos de deambular se validan (celda libre, suelo, desnivel ≤ 1) y, si no se alcanzan en ~2 s, se cambian; con un objetivo de combate se rinde a los ~3,5 s y vuelve a deambular. Así no se congela contra un bloque. El admin puede activar vuelo o relanzarlo. No hay teleport automático para no violar la colisión.
- **Bots duplicados con más de una réplica del server** → supuesto de réplica única documentado y `BOTS_ENABLED=0` para apagar el runtime donde no corresponda; no se implementa leader election en este change.
- **Vida del jugador client-authoritative**: el daño del bot puede no aplicarse si el cliente miente → se mantiene el límite conocido; el bot sí es server-authoritative.
- **El bot legacy sigue reintentando** si no se borra la App de Easypanel → `401` + warning al arrancar + paso operativo explícito en README/AGENTS.
- **`bot_ignore` y admins**: si un comportamiento nuevo olvida filtrar, el runtime vuelve a validar antes del `phit`; doble barrera.
- **Nombre de bot igual a un username** → se rechaza con `409 bot_name_taken`; si una cuenta se crea después con el nombre de un bot, la colisión visual queda posible (los usernames no consultan bots). Se documenta.
- **Borrar un bot con historial** → la auditoría no tiene FK al bot; el nombre queda en `details`, así que el historial sobrevive pero no se puede filtrar por id de bot.
- **Muerte con DB caída**: el bot sale del mundo igual; si falla el `UPDATE active=false`, al reiniciar podría reaparecer. Se loguea el error y se acepta el riesgo (mejor que bloquear el tick).

## Migration Plan

1. Mergear con la migración 003 y el runtime apagado por configuración si hiciera falta (`BOTS_ENABLED=0`).
2. Deploy del server; la migración corre sola y **no crea bots**. Verificar en logs `migración aplicada: 003-bots.sql`.
3. Detener/borrar la App `minicraft-bot` en Easypanel y quitar `BOT_TOKEN` del entorno; borrar el secret `EASYPANEL_BOT_WEBHOOK`.
4. Crear el primer bot desde `/admin` con el preset y lanzarlo.
5. Verificar roster, ataque, `bot_ignore`, muerte y respawn tras reiniciar el contenedor.

Rollback: volver a la imagen anterior deja el server viejo funcionando (la tabla `bots` es aditiva y la ignora), pero el bot in-process deja de existir y el externo necesitaría `BOT_TOKEN` y su App de vuelta. No hay migración destructiva que deshacer.

## Ajuste por feedback del usuario (mismo change)

Sin abrir un change nuevo, la implementación se amplió con:

- **Metadata de ataque en el registro**: `registerBehavior` acepta `attacksPlayers` y `attacksEnemies` (booleanos, con defaults seguros: nunca atacar). `cazador` ataca jugadores; `merodeador` no ataca; `guardian` ataca solo criaturas; `neutral` no ataca por iniciativa propia. El catálogo HTTP los expone.
- **Guardián** (`guardian`): criatura viva más cercana dentro de un radio de guardia de 16 alrededor de `home`; persigue y ataca; sin criaturas vuelve a `home` o deambula. Nunca devuelve `attackTargetId` de jugador.
- **Neutral** (`neutral`): deambula y solo reacciona a un golpe recibido (jugador o criatura) con `aggro { kind, id, until }` de 10 s. El runtime fija el aggro en `applyPlayerHit`/`applyEnemyHit` (incluso con `takesDamage:false`), nunca para admins ni `bot_ignore`; el comportamiento lo consume y lo limpia si el objetivo muere, desaparece o la ventana vence.
- **Criaturas como objetivos**: `zombie.tick` recibe `bots` además de `players` y adquiere objetivos con prioridad para humanos; `spawnWave` sigue contando solo jugadores. `zombie.js` expone `damageZombie(id, dmg, now)` para el daño server-side de los bots. `app.js` pasa `getZombies`/`damageZombie` al runtime y rutea los `phit` con `to < 0` a `bots.applyEnemyHit`, que aplica vida, muerte (`die` + auditoría) y snapshot.
- **Migración 004**: `004-bot-behaviors.sql` amplía `bots_behavior_allow` a `('cazador','merodeador','guardian','neutral')` sin editar la 003.
- **UI**: referencias de jugador debajo de Vida/Daño/Alcance/Velocidad con `.field-hint`, descripción dinámica del comportamiento, etiqueta “Recibe daño (jugadores y criaturas)” y, en la tabla de usuarios, “Administrador” + “Poderes implícitos” en vez de “Sin permisos” para `role=admin`.

## Ajuste por feedback: navegación de los bots

- **Destino de deambular validado**: `pickWanderTarget` muestrea hasta 20 candidatos y los pasa por `wanderCell` (dentro del mundo, columna con suelo, cuerpo de 2 bloques libre en todas las celdas del radio del cuerpo y desnivel ≤ 1 respecto de los pies). La copa de un árbol queda descartada porque exige subir más de un bloque. El volador valida solo el borde y la zona. Si ningún candidato sirve se fija una pausa corta (`WANDER_RETRY_MS`) y se reintenta: nunca se fija un destino sólido.
- **Reset por falta de avance de deambular**: el runtime mide el acercamiento al destino en cada tick (`nav.dist` previo al movimiento) y, si no mejora `WANDER_PROGRESS = 0.5` bloques en `WANDER_STUCK_MS = 2000`, limpia `bot.wander` y `bot.detour`. El umbral de 0.5 evita confundir el vibrado contra un obstáculo con avance real. El contador de rendición de combate (`STUCK_MIN_MS`) queda separado y no se reinicia por el rodeo lateral.
- **Radio de escape**: a partir de dos resets seguidos (`wanderResets >= 2`) el destino se muestrea a 2–6 bloques desde la posición actual, validado contra la zona del comportamiento; al volver a acercarse el contador se pone en cero y vuelve el radio normal (6–24 / 4–16).

## Open Questions

Ninguna pendiente que cambie el alcance. Quedan como decisiones futuras, fuera de este change: pathfinding, más comportamientos, multi-réplica y Mundo Infinito.
