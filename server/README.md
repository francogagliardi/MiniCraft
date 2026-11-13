# ⛏ Minicraft — Servidor multijugador (VPS)

Servidor Node.js que sirve el juego (`index.html`) y sincroniza jugadores por
WebSocket: posiciones, bloques, daño PvP, chat y cuentas. La identidad vive en
PostgreSQL (usuarios, sesiones y roles).

## Estructura

```
Minicraft/
├── index.html        ← el juego (se sirve en /game)
├── login.html        ← login
├── register.html     ← registro público
├── lobby.html        ← lobby y selector de skin
├── admin.html        ← panel de administración (/admin)
└── server/
    ├── server.js     ← bootstrap (env → DB → migraciones → app)
    ├── app.js        ← HTTP + WebSocket + mundo + bots
    ├── admin-api.js  ← CRUD admin, bots, guardas, auditoría y gate de /admin
    ├── bot-config.js ← límites, defaults, preset y validación de bots
    ├── bot-behaviors.js ← comportamientos + movimiento puro
    ├── bot-runtime.js← spawn/tick/daño/muerte de bots in-process
    ├── permissions.js← allowlist de permisos por usuario
    ├── migrations/   ← esquema SQL versionado (001, 002 y 003-bots.sql)
    ├── user-tool.mjs ← crear/cambiar contraseña/listar/activar cuentas
    ├── package.json
    ├── world.json    ← se crea solo (mundo persistido)
    └── README.md
```

## Probarlo en tu PC

Necesitás un PostgreSQL accesible (local o en Docker) y `DATABASE_URL`.

```bash
cd server
npm install
DATABASE_URL=postgres://usuario:clave@localhost:5432/minicraft \
ADMIN_PASSWORD=admin-local-12345 \
node server.js
```

Abrí http://localhost:3000 → te redirige a `/login`. Creá una cuenta en
`/register` o entrá con `admin` / la contraseña que definiste. El registro
público se cierra con `REGISTRATION_ENABLED=0`.

## Subirlo a una VPS (Ubuntu/Debian)

```bash
# 1. Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Subir archivos (ej: con scp desde tu PC)
scp -r Minicraft root@TU_IP:/opt/

# 3. Instalar y correr
cd /opt/Minicraft/server
npm install --omit=dev

# 4a. Correr simple (sesión actual)
PORT=3000 \
DATABASE_URL=postgres://usuario:clave@localhost:5432/minicraft \
ADMIN_PASSWORD=una-clave-larga-y-secreta \
node server.js

# 4b. Correr persistente con pm2 (recomendado)
sudo npm i -g pm2
PORT=3000 DATABASE_URL=... ADMIN_PASSWORD=... pm2 start server.js --name minicraft
pm2 save
pm2 startup   # seguir la instrucción que imprime
```

Tus amigos entran a **`http://TU_IP:3000`** y crean su cuenta.

## Firewall / puertos

```bash
sudo ufw allow 3000/tcp
```

Si usás un proveedor con panel (AWS, DigitalOcean, etc.), abrí el
puerto 3000 ahí también. Si hay router con NAT, redirigí el puerto.

## Variables de entorno

| Var | Default | Qué hace |
|-----|---------|----------|
| `PORT` | `3000` | Puerto HTTP+WebSocket |
| `DATABASE_URL` | *(obligatoria)* | PostgreSQL de usuarios y sesiones |
| `ADMIN_USERNAME` | `admin` | Cuenta admin del bootstrap (reservada en el registro) |
| `ADMIN_PASSWORD` | *(vacío)* | Contraseña del admin **solo en el primer arranque** |
| `BOTS_ENABLED` | `1` | `0` apaga el runtime de bots |
| `BOTS_TICK_MS` | `50` | Tick de bots (ms) |
| `BOTS_SNAP_MS` | `100` | Snapshots `pm` de bots (ms) |
| `COOKIE_SECURE` | `0` | `1` en HTTPS (agrega `Secure` a la cookie) |
| `TRUST_PROXY` | `0` | `1` solo detrás de un proxy propio que sanee `X-Forwarded-For` |
| `REGISTRATION_ENABLED` | `1` | `0` cierra el registro público |
| `MINICRAFT_DIR` | `..` | Carpeta de donde servir `index.html` |
| `WORLD_FILE` | `server/world.json` | Dónde persistir el mundo (en Docker: `/data/world.json`) |
| `ADMIN_RATE_CAPACITY` | `20` | Acciones administrativas por IP antes de `429` (bucket propio) |
| `ADMIN_RATE_REFILL_PER_SEC` | `0.5` | Recarga del bucket admin (1 acción cada 2 s) |

> No hay clave admin por defecto ni variable `ADMIN_KEY`/`ADMIN_KEY_HASH`: el
> admin es una **cuenta con rol admin**. Si esas variables siguen en el entorno,
> el server las ignora y avisa una vez.

## Panel y API de administración (change 2)

Con una cuenta `role='admin'` entrá al lobby y abrí **Administración** (o
`/admin` directamente). El server valida el rol: sin sesión → `/login`,
usuario común → `/lobby`. La página no carga datos antes de ese gate.

**Endpoints** (todos con `Cache-Control: no-store`, sesión admin, JSON estricto,
`Origin`/`Referer` del mismo host, body ≤8 KB y rate limit propio por IP):

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/admin/users` | Lista cuentas con rol, skin, estado, permisos y fechas (sin hashes) |
| `POST` | `/api/admin/users` | Alta (`username`, `password`, `role?`, `skin?`, `active?`, `permissions?`) → `201` sin cookie |
| `PATCH` | `/api/admin/users/:id` | Edita solo `skin`, `role`, `active`, `permissions`; username inmutable |
| `POST` | `/api/admin/users/:id/password` | Reset (8–128), revoca sesiones; en la propia cuenta devuelve `self:true` y limpia la cookie |
| `DELETE` | `/api/admin/users/:id` | Borrado definitivo con cascada de sesiones → `204` |
| `GET` | `/api/admin/audit?limit=50` | Últimas entradas (1–200, default 50) |
| `GET` | `/admin` | Página del panel gated por rol |

**Códigos de error:** `invalid_request` (400), `unauthorized` (401),
`admin_required` (403), `user_not_found` (404), `username_taken` /
`guard_self_action` / `guard_last_admin` (409), `invalid_request` 413/415,
`invalid_username`, `username_reserved`, `invalid_password`, `invalid_skin`,
`invalid_role`, `invalid_permissions`, `username_immutable`, `invalid_field`
(422), `rate_limited` (429) y `unavailable` (503).

**Guardas:** un admin no puede desactivarse, borrarse ni degradarse a sí mismo
(`guard_self_action`) y nunca se puede dejar el sistema sin admin activo
(`guard_last_admin`). Se aplican en una transacción con advisory lock (también
entre réplicas). Los rechazos se auditan.

**Permisos** (`bot_ignore`, `fly`, `instant_break`): se guardan en
`users.permissions` JSONB solo como claves `true`; una clave desconocida o un
valor no booleano responde `422 invalid_permissions`. Los cambios se difunden en
caliente por WebSocket (`perm`) y **no** revocan sesiones. Cambiar rol,
desactivar, resetear contraseña o borrar **sí** revoca sesiones y cierra los
sockets. `bot_ignore` además descarta en el server el daño que cualquier bot
hostil intente aplicar a esa cuenta. `fly`/`instant_break` se aplican en el
cliente (sin anti-cheat).

**Auditoría:** tabla `admin_audit` append-only con FKs `ON DELETE SET NULL` y
snapshot de usernames en `details`; registra acciones y rechazos sin
contraseñas, hashes ni tokens. La API no permite editarla ni borrarla.

**Migración 002:** `server/migrations/002-admin-permissions.sql` agrega la
columna `permissions` (default `{}`), su CHECK de objeto JSON y la tabla
`admin_audit` con índices. El runner existente la aplica una sola vez.

## API de bots (change 3)

Los bots son **in-process**: no abren WebSocket, no tienen sesión y su vida es
server-authoritative. Se administran solo desde `/admin` o esta API (todas las
rutas exigen rol admin, `Cache-Control: no-store`, JSON estricto, `Origin`
propio, body ≤8 KB y rate limit administrativo). El cupo es **5 activos**.

| Método | Ruta | Éxito | Cuerpo |
|---|---|---|---|
| `GET` | `/api/admin/bots` | `200` | `{ bots, limits: { maxActive: 5 }, catalog: { behaviors, skins } }` |
| `POST` | `/api/admin/bots` | `201` | `{ bot }` — nace `active:false` |
| `PATCH` | `/api/admin/bots/:id` | `200` | `{ bot }` |
| `DELETE` | `/api/admin/bots/:id` | `204` | — |
| `POST` | `/api/admin/bots/:id/start` | `200` | `{ bot }` |
| `POST` | `/api/admin/bots/:id/stop` | `200` | `{ bot }` |

`BotView` = `{ id, name, behavior, skin, hp, damage, reach, speed, takesDamage,
flying, active, runtime: { online, hp, pos } | null, createdAt, updatedAt }`.

Cuerpo de alta/edición: `name` (3–16, `^[A-Za-z0-9_-]+$`, único sin distinguir
mayúsculas y contra usernames), `behavior` (`cazador` | `merodeador` |
`guardian` | `neutral`), `skin` (del catálogo, incluye `robot`), `hp` 1–100
entero, `damage` 0–20 entero, `reach` 1–10 paso 0.1, `speed` 1–30 paso 0.1,
`takesDamage` y `flying` booleanos. `active` **no** se edita: se cambia con
`start`/`stop`. El catálogo agrega `attacksPlayers` y `attacksEnemies` para que
el panel explique contra qué ataca cada comportamiento.

**Códigos:** `400 invalid_request`, `401 unauthorized`, `403 admin_required`,
`403` por Origin, `404 bot_not_found`, `409 bot_name_taken|bot_active|
bot_limit_reached`, `413`, `415`, `422` con `{ error, message, details: { field,
reason, errors } }` (`invalid_bot_name`, `invalid_behavior`, `invalid_skin`,
`invalid_hp`, `invalid_damage`, `invalid_reach`, `invalid_speed`,
`invalid_flag`, `invalid_field`), `429 rate_limited` y `503 unavailable`.

**Auditoría:** `bot.create`, `bot.update` (con `before`/`after`), `bot.start`,
`bot.stop`, `bot.delete` y `bot.death` (actor nulo). El id/nombre del bot vive en
`details`; las entradas sobreviven al borrado del bot.

**Migración 003:** `server/migrations/003-bots.sql` crea la tabla `bots` con
CHECKs de nombre/rangos/allowlists, índice único `lower(name)`, índice parcial
de activos y FK `created_by ON DELETE SET NULL`. **No crea ningún bot**: el
primer alta es explícita desde el panel (_Preset cazador clásico_ → crear →
Lanzar).

**Migración 004:** `server/migrations/004-bot-behaviors.sql` amplía
`bots_behavior_allow` a `('cazador','merodeador','guardian','neutral')` de forma
forward-only e idempotente. No reescribe la 003: en un entorno existente el
runner aplica solo la 004.

**Comportamientos:** `cazador` persigue jugadores; `merodeador` solo deambula en
un radio de 6–24 bloques y nunca ataca; `guardian` defiende un radio de 16
alrededor de su origen contra criaturas, patrulla dentro de la zona y nunca ataca
jugadores; `neutral` deambula y responde al atacante durante 10 s (jugador o
criatura), reiniciando su deambular al entrar y salir del combate. Las criaturas
también pueden targetear bots, con prioridad para los humanos.

**Navegación:** los bots con `flying:false` caminan con colisión, gravedad y
auto-escalón, con un **rodeo simple** (costados ±90°, después atrás) cuando el
paso directo está bloqueado; no hay A*, así que un laberinto puede vencerlos. Si
un caminante no logra acercarse a su objetivo en ~3,5 s lo suelta por 4 s y
vuelve a deambular (el guardián reintenta si el enemigo sigue en zona). Un bot
que persigue a un objetivo a más de 2.5 de altura sigue navegando en vez de
detenerse sin poder golpear.

**Deambular:** el destino se valida antes de fijarlo: fuera del mundo nunca y,
para un caminante, necesita suelo en la columna, el cuerpo de dos bloques libre
en todas las celdas que ocupa y un desnivel de a lo sumo un bloque respecto de
sus pies (la copa de un árbol no es destino válido). Se muestrean hasta 20
candidatos por intento; si ninguno sirve el bot se queda quieto una pausa corta y
reintenta, sin fijar nunca un destino sólido. El volador valida solo el borde del
mundo y la zona. Si un caminante deambulando no se acerca a su destino en ~2 s,
suelta el destino y el rodeo y elige otro; tras dos resets seguidos busca uno
cercano (2–6 bloques) y, cuando vuelve a avanzar, restaura el radio normal.

**`BOT_TOKEN` legado:** ya no autentica nada. El upgrade WebSocket solo acepta
cookie de sesión; un `Authorization: Bearer` recibe `401`. Si la variable sigue
seteada, el server avisa **una vez** al arrancar (sin loguear el valor) y la
ignora. El bot externo (`minicraft-bot`, `Dockerfile.bot`, `bot/`) fue retirado:
detené/borrá esa App en Easypanel.

## Operar cuentas por CLI (emergencia)

```bash
DATABASE_URL=... node server/user-tool.mjs create ana --role user
DATABASE_URL=... node server/user-tool.mjs passwd ana
DATABASE_URL=... node server/user-tool.mjs list
DATABASE_URL=... node server/user-tool.mjs disable ana
DATABASE_URL=... node server/user-tool.mjs enable ana
```

La contraseña se lee por stdin, nunca por argv, y `passwd`/`disable` revocan
las sesiones de la cuenta. Los usuarios creados por CLI quedan con
`permissions='{}'`. **La CLI no aplica las guardas de self/último admin**: es la
vía de emergencia (por ejemplo, si te quedaste sin admin); el camino normal es
el panel `/admin`.

## Probar multijugador en tu PC (2 jugadores)

1. Abrí **http://localhost:3000** → creá la cuenta `Franco` en `/register`.
2. Abrí una **ventana de incógnito** → creá `Invitado` (o entrá con otra cuenta).
3. En el lobby elegí skin y **Jugar Legacy**; se ven mutuamente, chat (Enter),
   romper/poner bloques y espada ⚔️.
4. Para probar el admin: entrá con la cuenta `admin` (rol admin) → vuela (F),
   pica instantáneo y es inmune al daño 🛡️.

## Notas

- El mundo se guarda solo en `server/world.json` cada 15 s.
  Para mundo nuevo: borrar `world.json` y reiniciar.
- **La identidad no vive en `world.json`**: usuarios, sesiones y roles están en
  PostgreSQL. Borrar el mundo no borra cuentas.
- El juego carga Three.js desde CDN: el VPS **no** necesita nada
  especial, pero los jugadores necesitan internet.
- Pensado para jugar entre amigos (hasta ~15 jugadores). El servidor no es
  anti-cheat.
- Jugar por `http://` en red local funciona bien. Si querés `https`
  con dominio propio, poné nginx o Caddy como reverse proxy y usá
  `COOKIE_SECURE=1` + `TRUST_PROXY=1`.
