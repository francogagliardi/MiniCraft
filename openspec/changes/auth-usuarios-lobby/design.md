# Design

## Context

Estado actual **verificado** leyendo el código, que condiciona el enfoque:

- **Un solo proceso Node** (`server/server.js`, 441 líneas) hace HTTP estático, WebSocket, mundo, zombis, sueño y admin. El HTTP es un `readFile` plano sin router (`:91-105`); el `WebSocket.Server` se monta sobre el mismo `http.Server` (`:176`) y el `hello` resuelve la identidad con `name`/`skin`/`mode`/`key` del cliente (`:300-347`).
- **El admin es una clave compartida**: `server/admin-auth.js` verifica `ADMIN_KEY`/`ADMIN_KEY_HASH` con PBKDF2 en el `hello`, con limitador de KDF (`server.js:21-28`). No hay usuarios, ni sesiones, ni base de datos.
- **El cliente es un único `index.html`** de ~238 KB con todo inline y Three.js r160 por CDN. El menú inicial pide nombre (`#nameInput`), clave admin (`#keyInput`) y skin (`#skinPicker`), y `startGame` arma el `hello` con esos valores (`index.html:4078-4120`, `:3772-3775`). El nombre y el skin viven en `myName`/`mySkin` (`:888-899`).
- **El catálogo de skins** está en el bloque `/* skins:start */` de `index.html` (`:2664-2706`) y el server solo replica factores de tamaño en `server/skins.js`. `ui/skins` exige ocho opciones de jugador y `robot` reservado al bot.
- **El bot es un cliente externo** (`bot/index.js`) que manda `hello` con `name`, `skin`, `bot:true` y **sin autenticación** (`bot/index.js:126`), y autoriza comandos por el `mode` del roster (`bot/cazador.js:196-216`).
- **Los tests son scripts Node planos** encadenados en `server/package.json` (`scripts.test`), sin framework. Varios **spawnean `server.js` como proceso** (`server/test/protocol.mjs:25`, `server/test/admin-hash.mjs:39`), así que cualquier dependencia de DB obligatoria rompería la suite local.
- **CI** (`.github/workflows/ci.yml`) corre `cd server && npm test` en Node 20 sin servicios. **Deploy** (`deploy.yml`) corre lo mismo antes del webhook de Easypanel.
- **Docker** tiene dos servicios (`minicraft`, `minicraft-bot`) y un volumen `minicraft-data`; el `Dockerfile` copia `server/*.js` e `index.html`, y el healthcheck pega a `/`. No hay Postgres.

## Goals / Non-Goals

**Goals:**

- Identidad real: usuarios, contraseñas con `scrypt`, sesiones revocables y roles `user`/`admin` en PostgreSQL.
- Alta autónoma de cuentas por registro público, con auto-login y un toggle operativo para cerrarla.
- Flujo login → lobby → juego con páginas separadas, sin reescribir el `index.html` de 238 KB.
- Gate del WebSocket: sin sesión válida no se entra; nombre, skin y rol los impone el server.
- Bot operativo con una credencial de servicio (`BOT_TOKEN`), sin cookie y sin privilegios.
- Retiro completo de `ADMIN_KEY`/`ADMIN_KEY_HASH` con migración documentada.
- Suite de tests rápida y determinista sin Docker local, con integración de DB real en CI.

**Non-Goals:**

- CRUD de usuarios, permisos por usuario, panel o control de bots, bot personalizado y Mundo Infinito real: changes 2 y 3.
- Recuperación de contraseña por email, verificación de email, OAuth, 2FA y captcha.
- Cambiar el motor del mundo (`world.json`) o migrar el mundo a Postgres.
- Anti-cheat, validación de movimiento y autoridad de vida del jugador.
- Reemplazar `index.html` por una SPA o introducir build/bundler.

## Decisions

### 1. PostgreSQL con migraciones SQL propias y runner mínimo

Se agrega `pg` (cliente puro JS, sin compilación nativa) como única dependencia nueva. El esquema vive en `server/migrations/*.sql`, versionado y aplicado por un runner propio (`server/migrate.js`), sin ORM ni framework de migraciones.

**Esquema final** (`server/migrations/001-auth.sql`):

```sql
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  skin          TEXT        NOT NULL DEFAULT 'human',
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_username_len   CHECK (char_length(username) BETWEEN 3 AND 16),
  CONSTRAINT users_username_chars CHECK (username ~ '^[A-Za-z0-9_-]+$')
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  id           BIGSERIAL PRIMARY KEY,
  token_hash   TEXT        NOT NULL UNIQUE,
  user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ,
  CONSTRAINT sessions_token_hash_len CHECK (char_length(token_hash) = 64)
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_live_expiry_idx
  ON sessions (expires_at) WHERE revoked_at IS NULL;
```

Decisiones del esquema:

- **Unicidad case-insensitive por índice funcional** `lower(username)`, no `citext` (extensión no garantizada en Postgres gestionado). El login busca `WHERE lower(username) = lower($1)`.
- **`password_hash` autodescriptivo** con formato propio de `scrypt` (decisión 2), sin columnas de salt/parámetros.
- **`skin` validado en la aplicación**, no con `CHECK` de Postgres: el catálogo cambia con el cliente y un `CHECK` obligaría a una migración por cada skin nueva. El server resuelve cualquier valor inválido a `human`; un test verifica la paridad entre `server/skins.js`, `index.html` y `lobby.html`.
- **`sessions` guarda solo el hash SHA-256 del token** (64 hex), nunca el token. `last_seen_at` es observabilidad y limpieza; **no** extiende la expiración (sesión absoluta).
- **`ON DELETE CASCADE`** en `sessions.user_id`: borrar un usuario invalida sus sesiones.
- **Sin tabla de auditoría** ni de intentos fallidos: el rate limit es en memoria y el logging es acotado (change 2 puede agregar auditoría).

**Runner** (`server/migrate.js`):

1. Crea `schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)` si no existe.
2. Lee `server/migrations/*.sql` ordenados por nombre.
3. Por cada versión no aplicada: `BEGIN` → `SELECT pg_advisory_xact_lock(hashtext('minicraft:migrations'))` → re-chequea → ejecuta el SQL → inserta la versión → `COMMIT`.
4. Si un archivo falla, rollback de ese archivo y el proceso **no arranca** (fail fast con log claro).
5. `MIGRATIONS_AUTO=0` permite saltar el runner (solo tests/ops que migran aparte).

El advisory lock evita que dos réplicas migren a la vez. Las migraciones deben ser transaccionales (nada de `CREATE INDEX CONCURRENTLY`).

**Docker/CI:** `Dockerfile` copia `server/migrations` a `/app/migrations`; `server.js` corre migraciones antes de `listen`. En CI, `auth-db.mjs` corre el mismo runner contra `TEST_DATABASE_URL`, así el SQL que se prueba es el de producción.

### 2. Contraseñas con `scrypt` asíncrono y formato autodescriptivo

Parámetros: `N=16384`, `r=8`, `p=1`, `keylen=64`, salt de 16 bytes, `maxmem=64 MiB`. Se usa `crypto.scrypt` **asíncrono** (threadpool), nunca `scryptSync` en el camino de request.

Formato: `scrypt$16384$8$1$<saltB64url>$<hashB64url>`.

- El parser valida `N`, `r`, `p` y largos con cotas de cordura (evita un hash manipulado que dispare un KDF carísimo) y trata cualquier anomalía como “no verifica”, sin lanzar.
- Comparación con `crypto.timingSafeEqual` previa validación de longitud.
- **Usuario inexistente o inactivo**: se deriva contra un hash dummy generado al arrancar con los mismos parámetros y se descarta el resultado. Iguala el costo del camino válido y evita enumeración por tiempo.
- Contraseñas: mínimo 8 y máximo 128 caracteres; se aceptan espacios. No se aplica composición obligatoria (NIST), sí longitud. El mínimo es único para todo el sistema (registro público, `user-tool` y bootstrap); `ADMIN_PASSWORD` acepta 8 pero el README recomienda ≥16 por ser la cuenta privilegiada.
- La contraseña nunca se loguea ni se guarda fuera del hash; tampoco se acepta por `argv` en la CLI (decisión 8).

**Alternativa descartada:** PBKDF2 (el módulo actual). `scrypt` es memory-hard y sigue estando en `node:crypto`, sin dependencia nativa. Cambiar a Argon2 exigiría binario nativo, justo lo que el repo evita.

### 3. Sesiones opacas en cookie, persistidas y revocables

- Token: 32 bytes de `crypto.randomBytes` en base64url (~43 chars).
- Cookie: `mc_sid=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` + `Secure` cuando `COOKIE_SECURE=1` o `NODE_ENV=production`. Sin `Domain`.
- En DB se guarda `sha256(token)` en hex. La búsqueda es por ese hash (índice único).
- Expiración **absoluta de 7 días**. Sin sliding expiration: renovar en cada request complica la revocación y multiplica escrituras. `last_seen_at` se actualiza como máximo cada 5 minutos.
- Un login **crea una sesión nueva y revoca la sesión de la cookie anterior** si existe (anti session fixation). Se permiten sesiones simultáneas de la misma cuenta en dispositivos distintos. El registro público usa el mismo camino (decisión 14), incluida la revocación de la sesión previa.
- `POST /api/logout` revoca la sesión actual y limpia la cookie. `user-tool set-password|deactivate` revoca **todas** las sesiones de la cuenta.
- Validación: `revoked_at IS NULL AND expires_at > now() AND users.active`.
- Limpieza oportunista al arrancar y cada 6 h: borra sesiones expiradas/revocadas con más de 30 días.

**Cookie `__Host-`:** se descarta porque exige `Secure` y no funcionaría en el dev local por HTTP. Se documenta `COOKIE_SECURE=1` en producción.

### 4. Endpoints HTTP y páginas separadas

El servidor conserva el handler estático actual y agrega un router mínimo **antes** de él. No se introduce framework.

| Método | Ruta | Auth | Respuesta |
|---|---|---|---|
| `GET` | `/` | no | `302` a `/lobby` con sesión, a `/login` sin ella |
| `GET` | `/login` | no | `login.html`; con sesión `302 /lobby` |
| `POST` | `/api/login` | no | `200 {user}` + `Set-Cookie`; `400/401/415/429/503` |
| `GET` | `/register` | no | `register.html`; con sesión `302 /lobby`; con el registro cerrado muestra "Registro cerrado" |
| `POST` | `/api/register` | no | `201 {user}` + `Set-Cookie` (auto-login); `400/403/409/413/415/429/503` |
| `POST` | `/api/logout` | cookie | `204`, revoca y limpia cookie |
| `GET` | `/api/me` | cookie | `200 {user}`; `401`/`503` |
| `PATCH` | `/api/me` | cookie | `200 {user}` con `skin` actualizado; `400/401/415/503` |
| `GET` | `/lobby` | cookie | `lobby.html`; sin sesión `302 /login` |
| `GET` | `/game` | cookie | sirve `index.html`; sin sesión `302 /login` |
| `GET` | `/healthz` | no | `200 {ok:true}` si `SELECT 1` responde; `503` si no |
| `GET` | resto | no | estático actual (incluye `/index.html` para dev/compat) |

Cuerpo público:

```json
{ "user": { "username": "ana", "role": "user", "skin": "human" } }
```

Errores: `{ "error": "invalid_credentials" | "invalid_request" | "username_taken" | "username_reserved" | "registration_disabled" | "rate_limited" | "unavailable" | "unauthorized" }` con mensaje en español. El login **no** detalla si el usuario existe; el registro sí puede devolver `username_taken` (es el único dato de la cuenta y no hay email que enumerar).

**Por qué páginas separadas y no reescribir `index.html`:**

- `index.html` es el juego y pesa 238 KB; renombrarlo a `game.html` rompería decenas de referencias en tests, `bot/index.js`, `Dockerfile` y el bloque worldgen que el server extrae por marcadores (`server.js:123-129`).
- `/game` **sirve el contenido de `index.html`** (“ruta equivalente”), sin duplicar el archivo. `login.html`, `register.html` y `lobby.html` son archivos chicos, autocontenidos, sin build ni Three.js.
- El menú interno del juego se reduce a una pantalla de “Entrar al mundo” con un solo botón (el gesto es necesario para `requestPointerLock`); ya no pide nombre, clave ni skin.

**Seguridad HTTP:**

- `Cache-Control: no-store` en API, `/login`, `/lobby`, `/game`; el estático conserva `no-cache`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY` en páginas de auth.
- **CSRF**: `SameSite=Lax` + `Origin`/`Referer` obligatorio cuando viene + `Content-Type: application/json` obligatorio en `POST/PATCH` + rechazo de `Sec-Fetch-Site: cross-site`. No se agrega token CSRF: con JSON-only, cookies no enviadas cross-site en `Lax` y chequeo de `Origin`, el vector queda cerrado sin estado extra. **Alternativa descartada:** double-submit cookie (más piezas y una cookie más para el mismo resultado).
- **Body limit** de 8 KB por request de auth (login, registro, logout, perfil); al excederse, `413` y se corta la lectura. Sin `multipart`.
- **Rate limit por IP**: token bucket capacidad 5, recarga 0.2/s (1 intento cada 5 s) + cota global de 2 derivaciones `scrypt` concurrentes. El registro usa un bucket **propio y más estricto** (capacidad 3, recarga 0.05/s = 1 cada 20 s) y comparte la cota global de derivaciones. IP = `socket.remoteAddress`, salvo `TRUST_PROXY=1`, donde se toma el primer valor de `X-Forwarded-For` (validado). Un rechazo por límite responde `429` genérico **sin derivar**. El log de rechazos es rate-limited (una línea cada 10 s).
- **Login fallido** siempre ejecuta una derivación (real o dummy): no se corta antes por “usuario inexistente”.
- `noindex` en `login.html`, `register.html` y `lobby.html`.

### 5. Gate del WebSocket e identidad autoritativa

Se cambia `new WebSocket.Server({ server })` por `noServer: true` + `server.on('upgrade', ...)`, porque la autenticación necesita decidir **antes** de aceptar y responder `401/503` con HTTP.

Flujo del upgrade:

1. Si hay `Authorization: Bearer <token>`: comparar con `BOT_TOKEN` en tiempo constante. Token válido → conexión de servicio (`kind:'bot'`). Si no hay `BOT_TOKEN` configurado → rechazo. Un Bearer inválido **no** cae a cookie.
2. Si no hay Bearer: parsear `Cookie`, buscar `mc_sid`, hashear y consultar `sessions` + `users`.
3. Sesión válida → `kind:'user'` con `{sessionId, userId, username, role, skin}`.
4. Error de DB → `503`; sin cookie/inválida → `401`.
5. Rechazo = respuesta HTTP mínima (`HTTP/1.1 401 Unauthorized`, `Connection: close`, `Content-Length: 0`) y `socket.destroy()`. **No** se completa el upgrade, no se crea jugador y no se envía `welcome`.
6. Aceptado = `wss.handleUpgrade(...)` y `ws.auth` queda adjunto antes de `connection`.

En el `hello`:

- Usuario de cookie: `name = auth.username`, `skin = auth.skin`, `admin = auth.role === 'admin'`, `mode = admin ? 'admin' : 'player'`, `bot = false`. Se **ignoran** `m.name`, `m.skin`, `m.mode`, `m.key` y `m.bot`.
- Bot de servicio: `name = cleanName(m.name)` (viene de `BOT_NAME`), `skin = cleanSkin(m.skin)` (viene de `BOT_SKIN`), `admin = false`, `mode = 'player'`, `bot = true`.
- `welcome` agrega `user: {username, role, skin}` (aditivo).
- `chat` agrega `admin: true` cuando el emisor tiene rol admin (aditivo). El bot lo usa para autorizar comandos (decisión 7).

**Revocación en caliente:**

- Logout en el mismo proceso: el handler busca las conexiones por `userId` y las cierra con código `4001` tras `removePlayer` (difunde `leave`).
- Revalidación periódica: en el heartbeat de 30 s se consulta la sesión; si está revocada/expirada o el usuario quedó inactivo, se cierra con `4001`. Con heartbeat de 30 s se cumple “≤60 s”.
- Varias réplicas: no hay bus de eventos; la garantía es el heartbeat (≤30 s). El compose/Easypanel actual corre **una** instancia.

**Clientes viejos:** el rechazo HTTP hace que el `WebSocket` del cliente viejo dispare `onerror`; su código actual cae a `{solo:true}` y arranca el modo solitario, sin crash. El cliente nuevo valida `/api/me` antes de conectar, así que ni lo intenta. Se documenta que el modo solitario local no es un bypass online.

**Por qué no aceptar-y-cerrar con código:** aceptar el upgrade solo para cerrar permite que el cliente viejo llegue a `onopen` y mande `hello`; el rechazo HTTP es más simple y no crea estado. El costo es que el browser oculta el motivo; el cliente nuevo no depende de él.

### 6. Credencial de servicio del bot: `BOT_TOKEN`

El bot sigue siendo un cliente externo, pero deja de ser anónimo:

- Server y bot comparten `BOT_TOKEN` (32 bytes aleatorios, mínimo 32 caracteres). El bot lo manda como `Authorization: Bearer <token>` en el upgrade (`ws` permite `headers` en el constructor).
- El server compara en tiempo constante. **No se guarda en DB**: es un secreto de despliegue, no una identidad.
- Si `BOT_TOKEN` falta en el server, el bot no puede entrar (fail closed) y el juego de usuarios no se afecta. Si falta en el bot, el proceso falla al arrancar con un mensaje claro.
- La conexión de servicio no crea `users` ni `sessions`, no recibe cookie y no puede llamar `/api/me` (401). No puede ser admin.
- `BOT_NAME`/`BOT_SKIN` siguen funcionando: viajan en el `hello` y el server los sanea. `BOT_SKIN` puede ser `robot` (el catálogo de render lo incluye) aunque no sea una opción de jugador.
- El token no se loguea; el header completo tampoco.

**Riesgo aceptado y documentado:** es un secreto compartido, sin identidad por bot, sin expiración ni revocación individual, y legible por quien tenga acceso al host (misma clase de riesgo que la vieja `ADMIN_KEY`, pero acotado a un cliente de solo lectura). Mitigaciones: valor aleatorio largo, red interna (`ws://minicraft:3000`), rotación por redeploy, y migración a usuarios de servicio con token hasheado en DB en el change 2/3. Un usuario de sesión que manda `bot:true` **no** se marca bot (no puede saltear el quórum de sueño).

### 7. Autorización de comandos admin del bot

Hoy el bot decide por el `mode` del roster (`bot/cazador.js:196-216`). Con roles de sesión, el roster sigue siendo confiable, pero hay una carrera entre `chat` y `join`. Se agrega `admin: true` al frame `chat` del emisor admin (aditivo) y el bot autoriza si:

1. `m.admin === true`, **o**
2. el `fromId` existe en su roster con `mode === 'admin'` (compatibilidad con un server viejo que no manda el flag).

El match exacto del comando no cambia. Un impostor con el mismo nombre sigue sin poder: la autoridad es el `fromId`/flag del server. No hay comandos nuevos.

### 8. Bootstrap del admin y herramienta de aprovisionamiento

**Bootstrap** (en `server.js`, después de migrar):

- `ADMIN_USERNAME` default `admin`; `ADMIN_PASSWORD` obligatoria.
- Si el usuario no existe y la contraseña tiene ≥8 caracteres: se crea con `role='admin'`, `skin='human'`, `active=true`, hash `scrypt`.
- Si ya existe: **no se toca** la contraseña; se loguea “admin ya existe”. Cambiar `ADMIN_PASSWORD` no rota nada.
- Si falta o es corta: no se crea admin; warning claro. El juego sigue para usuarios comunes, pero sin admins (fail closed de privilegios).
- El `ADMIN_USERNAME` queda **reservado** en el registro público (decisión 14): nadie puede auto-registrarse con ese nombre antes de que el bootstrap cree la cuenta.
- El valor de `ADMIN_PASSWORD` nunca se loguea. Puede quedar en el entorno; no se re-aplica.

**CLI** (`server/user-tool.mjs`), porque el change 1 no tiene CRUD y sin esto no se pueden crear jugadores:

```
node server/user-tool.mjs create <username> --role user|admin        # contraseña por stdin
node server/user-tool.mjs passwd <username>                           # contraseña por stdin; revoca sesiones
node server/user-tool.mjs list
node server/user-tool.mjs disable <username>                          # active=false + revoca sesiones
node server/user-tool.mjs enable <username>
```

- La contraseña se lee de `stdin` (pipe o prompt), **nunca** de `argv` (visible en `ps`/historial).
- Usa la misma validación y el mismo hash que el login.
- `passwd` y `disable` revocan todas las sesiones de la cuenta.
- La salida no imprime contraseña ni hash completo.

### 9. Cliente: `/api/me`, lobby y juego

**`index.html` (juego):**

- Al arrancar el módulo, `fetch('/api/me', { credentials:'same-origin', cache:'no-store' })`.
  - `401` → `location.replace('/login')`.
  - `200` → `myName = user.username`, `mySkin = user.skin`, `myMode = user.role === 'admin' ? 'admin' : 'player'`.
  - Error de red/`503` → mensaje claro con reintento, sin quedar en “Conectando…”.
- Se eliminan del HTML del menú: `#nameInput`, `#keyInput`, `#skinPicker`, `#btnAdmin` y la leyenda de clave admin. Queda una tarjeta con el username, el skin y un único botón **ENTRAR AL MUNDO** (el click da el gesto para pointer lock).
- `startGame` ya no lee el DOM: usa el perfil. El `hello` se mantiene aditivo (`{t:'hello', name, skin, mode}` sin `key`) para poder hablar con un server viejo, pero el server nuevo lo ignora.
- Si `welcome.user` viene, se reafirma el nombre/skin (defensivo).
- La pausa suma “Volver al lobby” (`location.href='/lobby'`) y “Cerrar sesión” (`POST /api/logout` → `/login`). El `WebSocket` se cierra en `pagehide`/`beforeunload` como hoy.
- `localStorage` deja de ser fuente del skin: `mc-skin` solo se lee como valor inicial cosmético hasta que llega `/api/me`; la elección real vive en el perfil.

**`login.html`:**

- Formulario usuario/contraseña, `autocomplete="username"`/`current-password`, Enter envía, error genérico, `429` con “esperá un momento”, foco visible, 44 px mínimo.
- `fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body})`; en `200` → `location.replace('/lobby')`.
- Link “¿No tenés cuenta? Crear una” → `/register`; si el registro está cerrado, la página de registro lo explica (el login no necesita saber el estado del toggle).
- Sin Three.js ni assets binarios; mismo lenguaje visual (logo CSS, paleta).

**`register.html`:**

- Mismos campos y lenguaje visual que `login.html`, más un campo de repetición de contraseña solo en cliente (no viaja al server).
- `POST /api/register` con `{username, password}`; `201` → `location.replace('/lobby')` (auto-login, la cookie ya está puesta).
- Errores por campo con texto en español: `username_taken` (“Ese nombre ya está en uso”), `username_reserved` (“Ese nombre está reservado”), `invalid_username`, `invalid_password`, `429` y `503`.
- Si el server responde que el registro está cerrado, muestra “Registro cerrado” y un link a `/login`, sin formulario.

**`lobby.html`:**

- `fetch('/api/me')`; `401` → `/login`.
- Muestra username, un botón seleccionado por skin (8, `data-skin`, `role=radio`, `aria-checked`), la aclaración de `ui/skins`, y guarda con `PATCH /api/me` (`{skin}`), con estado “guardando…” y revert si falla.
- Dos tarjetas: **Jugar Legacy** → `/game`; **Mundo Infinito** deshabilitada con “Próximamente” (sin listener ni WebSocket).
- Botón “Cerrar sesión” → `POST /api/logout` → `/login`.
- Los skins se declaran en el HTML del lobby y `server/skins.js` es la autoridad de validación; un test verifica la paridad de ids con `index.html` y con `server/skins.js`.

**Por qué no un solo `index.html` con estados login/lobby/juego:** el archivo ya es enorme y su menú está acoplado al mundo; separar páginas permite que `/login` y `/lobby` carguen sin Three.js (mejor en móvil) y deja el juego intacto salvo el arranque y el menú.

### 10. Refactor del server para testear sin DB

Hoy `server.js` arranca al importarse y los tests lo spawnean. Para no volver la suite dependiente de Docker/Postgres:

- **`server/app.js`**: `createApp({ env, store, staticDir, worldFile, now })` con todo el wiring actual (HTTP, WS, mundo, zombis, sueño), exporta `{ httpServer, wss, listen, close }`. No lee `process.env` directo: recibe `env`.
- **`server/server.js`**: bootstrap delgado: env → `PgStore` → `migrate()` → bootstrap admin → `createApp().listen()` → logs y shutdown.
- **`server/store-pg.js`**: implementación Postgres de la interfaz de store (users/sessions), incluido `registerUser` (usuario + sesión en una transacción).
- **Test support** (`server/test/support/memory-store.mjs`): implementación en memoria de la **misma interfaz**, usada solo por tests. No hay flag de producción que active un store falso: el riesgo de backdoor queda eliminado por diseño.
- Los tests que hoy spawnean `server.js` (`protocol.mjs`, `admin-hash.mjs`) pasan a levantar `createApp` **en proceso** con `MemoryStore` sembrado, en un puerto efímero. `bot-cazador.mjs` igual donde haga falta.
- El refactor se hace como **paso 0 behavior-preserving**, con la suite actual en verde antes de tocar auth. Es el mayor riesgo del change y se mitiga con ese orden.

### 11. Docker, compose y Easypanel

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: minicraft
      POSTGRES_USER: minicraft
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-minicraft-dev}
    volumes: [minicraft-db:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U minicraft -d minicraft"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

  minicraft:
    environment:
      DATABASE_URL: ${DATABASE_URL:-postgres://minicraft:minicraft-dev@db:5432/minicraft}
      ADMIN_USERNAME: ${ADMIN_USERNAME:-admin}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
      BOT_TOKEN: ${BOT_TOKEN:-}
      COOKIE_SECURE: ${COOKIE_SECURE:-0}
      TRUST_PROXY: ${TRUST_PROXY:-0}
      REGISTRATION_ENABLED: ${REGISTRATION_ENABLED:-1}
    depends_on:
      db: { condition: service_healthy }

  minicraft-bot:
    environment:
      BOT_TOKEN: ${BOT_TOKEN:-}
    depends_on: [minicraft]

volumes:
  minicraft-data:
  minicraft-db:
```

- `db` **no publica puertos**: en dev se accede por el nombre interno `db`; para inspección manual, `docker compose exec db psql -U minicraft`.
- `DATABASE_URL` es la única fuente en producción (Easypanel Postgres interno o externo); el default del compose es solo dev y se documenta como tal.
- `Dockerfile`: `COPY server/migrations ./migrations`, `COPY login.html register.html lobby.html index.html ./`, healthcheck a `http://127.0.0.1:3000/healthz`.
- El bot usa `ws://minicraft:3000` y `BOT_TOKEN`; el server compara contra el mismo valor. Sin `BOT_TOKEN`, el bot sale con código 1 y un mensaje claro en vez de conectarse anónimo; en dev se levanta con `BOT_TOKEN=dev-... docker compose up --build -d` y en producción es obligatorio.
- En Easypanel: `COOKIE_SECURE=1`, `TRUST_PROXY=1`, `DATABASE_URL` como secreto, `ADMIN_PASSWORD` en el primer deploy (después puede removerse; sin ella no se crea otro admin), `REGISTRATION_ENABLED=1` por defecto.
- **Cerrar el registro en producción:** agregar/editar la variable de entorno `REGISTRATION_ENABLED=0` en el servicio `minicraft` de Easypanel y redeployar (o reiniciar el servicio). No requiere migración, cambio de esquema ni tocar la base; `/register` pasa a mostrar “Registro cerrado” y `POST /api/register` responde `403`. Las cuentas existentes y el login no se ven afectados.
- **Migración desde el deploy actual:** crear la DB, setear `DATABASE_URL`/`ADMIN_PASSWORD`/`BOT_TOKEN`, deployar. Al primer arranque corren migraciones y se crea `admin`. Los usuarios se auto-registran en `/register` (si el toggle está abierto) o se crean con `user-tool` / el CRUD del change 2. Retirar `ADMIN_KEY`/`ADMIN_KEY_HASH` del entorno.

### 12. Tests y CI

**Unitarios, sin DB (siempre corren):**

| Archivo | Cubre |
|---|---|
| `server/test/auth.mjs` | formato `scrypt`, verify ok/malo/corrupto, salts distintos, validación de username (3–16) y contraseña (8–128), usernames reservados (incluido `ADMIN_USERNAME`), cookie parse/serialize y flags, comparación de tokens |
| `server/test/rate-limit.mjs` | token bucket y cota de concurrencia con reloj falso, rechazo sin derivar, bucket de registro más estricto que el de login |
| `server/test/http-auth.mjs` | `createApp` + `MemoryStore`: login ok/genérico/429, `/api/me`, PATCH skin, logout, `Origin`/`Content-Type`/body limit, redirects de `/`, `/login`, `/register`, `/lobby`, `/game`, `no-store`, `/healthz` |
| `server/test/register.mjs` | `createApp` + `MemoryStore`: alta `201` + cookie y `/api/me` con auto-login, `409` duplicado case-insensitive, `400` reservado/formato/contraseña, `role`/`skin`/`active` forzados, toggle cerrado `403` + página sin formulario, `429` sin derivar, body 8 KB y `Origin`, anti-fixation de la sesión previa |
| `server/test/ws-auth.mjs` | upgrade sin cookie 401, con cookie ok, identidad impuesta (name/skin/mode/key ignorados), bot con/sin `BOT_TOKEN`, `bot:true` de usuario ignorado, `chat.admin`, revocación cierra |
| `server/test/admin-retirement.mjs` | `ADMIN_KEY`/`ADMIN_KEY_HASH` ignoradas + warning, `hello` con clave no da admin (reemplaza `admin-hash.mjs`) |
| `server/test/static.mjs` (actualizado) | existen `login.html`/`register.html`/`lobby.html`, el login enlaza al registro, el menú del juego no tiene nombre/clave/skin, rutas y `no-store` |

**Integración con Postgres real (`server/test/auth-db.mjs`):**

- Se ejecuta solo si `TEST_DATABASE_URL` está definida; si no, imprime “integración omitida” y sale 0.
- En CI `REQUIRE_DB_TESTS=1` hace que la ausencia de `TEST_DATABASE_URL` **falle** (no se puede skipear silenciosamente).
- Corre las migraciones dos veces (idempotencia), prueba unicidad case-insensitive, guarda de hash de sesión, revocación, registro público (usuario + sesión en la misma transacción, `role` forzado a `user`, carrera de username → `409`), bootstrap admin, `passwd`/`disable` con revocación y las consultas del store.
- Cada corrida usa la base `minicraft_test` del servicio y trunca `sessions`/`users` antes de cada bloque; los scripts son secuenciales, sin paralelismo.

**Regresión existente:** `protocol.mjs`, `bot-cazador.mjs`, `zombie-protocol.mjs`, etc. se adaptan al fixture en proceso y a login por cookie/BOT_TOKEN. No se cambian los contratos que no toca este change.

**CI** (`.github/workflows/ci.yml` y `deploy.yml`):

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_DB: minicraft_test
      POSTGRES_USER: minicraft
      POSTGRES_PASSWORD: minicraft
    ports: ["5432:5432"]
    options: >-
      --health-cmd "pg_isready -U minicraft -d minicraft_test"
      --health-interval 5s --health-timeout 3s --health-retries 10
env:
  TEST_DATABASE_URL: postgres://minicraft:minicraft@localhost:5432/minicraft_test
  REQUIRE_DB_TESTS: "1"
```

`npm test` local sigue funcionando **sin Docker**: los unitarios usan `MemoryStore` y la integración se omite con aviso. CI la exige.

**Orden de la cadena:** los tests unitarios de auth y de registro primero, luego los de protocolo/WS, la integración de DB al final (o antes de los e2e que no dependen de DB), y `static.mjs` al final como guardián de estructura.

### 13. Seguridad: resumen de controles

| Riesgo | Control |
|---|---|
| Fuerza bruta de contraseñas | rate limit por IP + cota de `scrypt` concurrente + mensaje genérico + dummy hash |
| Enumeración de usuarios | misma respuesta y mismo costo para inexistente/inactivo/clave mala |
| Robo de cookie | `HttpOnly` + `Secure` en prod + `SameSite=Lax` + expiración 7 d + revocación |
| Session fixation | sesión nueva en cada login y revocación de la anterior |
| CSRF | `SameSite=Lax`, `Origin`/`Referer`, JSON-only y `Sec-Fetch-Site` |
| XSS en nombre/chat | validación de username + saneo existente en `cleanName`/chat |
| Inyección SQL | consultas parametrizadas en `store-pg.js`, sin concatenación |
| DoS por KDF | `scrypt` async, `maxmem` acotado, límite de concurrencia y de intentos |
| Escalada de rol | rol leído de DB en cada auth; `hello` y `PATCH` no pueden cambiarlo |
| Suplantación de bot | `BOT_TOKEN` timing-safe; `bot:true` de usuario ignorado |
| Abuso del registro (spam de cuentas) | `REGISTRATION_ENABLED` + bucket por IP más estricto (1 cada 20 s) + cota global de `scrypt` + body 8 KB |
| Carrera de usernames en el registro | índice único `lower(username)` como autoridad + `23505` → `409`, en una transacción con la sesión |
| Escalada vía registro | `role`/`active`/`skin` fijos en el server; `admin` y nombres reservados bloqueados |
| Fuga de secretos | nunca se loguean contraseñas, tokens ni cookies; `user-tool` no imprime la clave |
| DB caída | `503`, nunca bypass; `/healthz` para el orquestador |

Headers: `nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY` en auth. **No** se agrega CSP en este change: `index.html` usa scripts inline y Three.js por CDN; una CSP correcta requiere nonces/build y es un change aparte (declarado como riesgo).

### 14. Registro público de usuarios

**Alcance:** `GET /register` (página) y `POST /api/register` (JSON) con `username` y `password`. Sin email: no hay verificación ni recuperación por correo (sigue fuera de alcance).

**Página (`register.html`), no pestaña dentro de `login.html`:** el error “username tomado” solo existe en el registro, los dos formularios no comparten estado y una pestaña obligaría a router por JS o a duplicar el formulario en `login.html`. Un archivo chico y autocontenido cuesta menos que esa lógica, y `/register` se puede enlazar y probar por separado. `login.html` suma el link “¿No tenés cuenta? Crear una”.

**Auto-login (elegido) sobre redirección a `/login` con mensaje:** la transacción crea el usuario y la sesión, y la respuesta es `201 {user}` + `Set-Cookie`, idéntica a la del login; el navegador va directo a `/lobby`. Evita pedir dos veces la contraseña, reutiliza el mismo mecanismo de sesión/anti-fixation (si traía una cookie, se revoca esa sesión) y elimina el estado “registrado pero no logueado”. Alternativa descartada: `302 /login?registered=1`, que agrega un paso y un mensaje transportado por query.

**Validaciones (idénticas al resto):**

- `username` 3–16, `^[A-Za-z0-9_-]+$`, único case-insensitive (`lower(username)`).
- **Reservados** (comparación `lower`): `admin`, `system`, `server`, `bot`, `null`, `undefined` y el valor de `ADMIN_USERNAME` → `400 username_reserved`. Bloquea apropiarse del nombre del bootstrap antes de que exista.
- `password` 8–128 (política única, decisión 2).
- `role`, `skin`, `active` **nunca** se leen del body: el server fija `role='user'`, `skin='human'`, `active=true`. El registro no puede crear ni promover un admin.
- Username normalizado (trim) y devuelto tal cual se guardó; el perfil público solo expone `username`, `role` y `skin`.

**`POST /api/register`:**

| Caso | Respuesta |
|---|---|
| Alta correcta | `201 {user}` + `Set-Cookie` (auto-login) |
| username/contraseña inválidos | `400 invalid_request` |
| username vacío o con caracteres/largo inválidos | `400` con `invalid_username` |
| username reservado | `400 username_reserved` |
| username ya usado (cualquier capitalización) | `409 username_taken` |
| `REGISTRATION_ENABLED=0` | `403 registration_disabled` |
| body >8 KB / Content-Type / Origin ajeno | `413` / `415` / `403` |
| rate limit | `429` sin derivar |
| DB caída | `503` |

- **Enumeración aceptable:** `409` confirma que el username existe, pero es el único identificador de la cuenta (no hay email ni teléfono) y es el comportamiento esperado de un formulario de alta. La respuesta no incluye ningún otro dato del usuario.
- **Transacción:** `BEGIN` → `createUser` (`role='user'`, `skin='human'`, hash `scrypt`) → `createSession` → `COMMIT`. Si la creación de la sesión falla, rollback completo: no queda una cuenta creada sin poder entrar.
- **Carrera de duplicados:** el índice único `users_username_lower_key` es la autoridad. Dos requests simultáneos con el mismo username: uno inserta, el otro recibe `23505` y la ruta responde `409` sin loguear el error crudo ni dejar filas parciales.
- La validación de formato, reservados y longitud corre **antes** de derivar el `scrypt`; solo el alta válida consume una derivación del limiter global (cota 2).

**Anti-abuso y toggle:**

- Bucket propio por IP: capacidad 3, recarga `0.05/s` (1 alta cada 20 s), más estricto que el login (5, `0.2/s`); comparte la cota global de 2 derivaciones concurrentes.
- `REGISTRATION_ENABLED`: ausente → `1`. Valores `1`/`true` → abierto; `0`/`false` → cerrado; cualquier otro valor → cerrado + warning al arrancar (fail closed). Se lee al arrancar; cambiarlo requiere reiniciar el proceso (Easypanel: variable + redeploy/restart).
- Con el registro cerrado: `GET /register` responde `200` con la página en modo “Registro cerrado” (sin formulario) y `POST /api/register` responde `403 registration_disabled`. Login, lobby y juego no cambian.
- Logging: una línea acotada por alta (username, sin contraseña ni hash); los rechazos por rate limit se loguean como máximo cada 10 s, igual que el login.
- Riesgo residual aceptado: sin captcha ni verificación de email, un atacante con muchas IPs puede crear cuentas basura. Mitigación operativa: `REGISTRATION_ENABLED=0` cuando no se esperan altas; el CRUD del change 2 podrá sumar borrado/desactivación masiva.

**Impacto en archivos:** `server/auth.js` (validación de username/contraseña y `isReservedUsername`), `server/http-auth.js` (rutas `/register` y `/api/register`), `server/store-pg.js` (`registerUser` transaccional), `server/rate-limit.mjs` (bucket de registro), `register.html`, `login.html` (link), `Dockerfile` (copia `register.html`), `docker-compose.yml` (`REGISTRATION_ENABLED`) y `README.md`.

### 15. Riesgos / trade-offs

- [Risk] **Refactor de `server.js` a `app.js`**: puede introducir regresiones en mundo, zombis o sueño. → Paso 0 behavior-preserving y suite completa verde antes de auth; el fixture en proceso reemplaza spawns uno por uno.
- [Risk] **Suite de tests reescrita**: se pierde cobertura si la adaptación es superficial. → Mantener los mismos asserts de protocolo y agregar los de auth; `protocol.mjs` sigue probando welcome/mv/edit/chat/sueño.
- [Risk] **`BOT_TOKEN` es un secreto compartido**: sin identidad por bot ni revocación individual. → Aceptado y documentado; rotación por redeploy; usuarios de servicio en change 2/3.
- [Risk] **Cookie `Secure` mal configurada**: con `COOKIE_SECURE=1` en HTTP local el login “no anda”. → Default 0 en compose dev, 1 en Easypanel HTTPS; documentado en README.
- [Risk] **Postgres como dependencia nueva**: si la DB no arranca, el juego no autentica. → `depends_on` con healthcheck, `/healthz`, reintentos de `pg.Pool` y fail fast con log claro; el mundo sigue en `world.json`.
- [Risk] **Rate limit por IP detrás de proxy**: sin `TRUST_PROXY=1` todos comparten la IP del proxy; con él, un `X-Forwarded-For` falsificable si el proxy no lo sanea. → Documentar que solo se active detrás de un proxy propio; el daño máximo es bloquear/desbloquear intentos, no entrar.
- [Risk] **Sesiones absolutas de 7 días**: un usuario activo debe volver a loguearse. → Decisión explícita; se puede subir el `Max-Age` sin cambiar el esquema.
- [Risk] **Crecimiento de `sessions`**: → índice parcial + limpieza periódica.
- [Risk] **Dos sesiones de la misma cuenta**: dos pestañas muestran el mismo nombre; no es un problema de seguridad. → Permitido; los `id` de jugador siguen distintos.
- [Risk] **Cliente viejo cae a modo solitario** al ser rechazado. → No es un bypass online; se documenta y el cliente nuevo ni lo intenta.
- [Risk] **Sin recuperación de contraseña**: si un usuario la olvida, depende del operador. → `user-tool passwd` cubre el caso hasta el change 2.
- [Risk] **Registro abierto sin captcha**: un atacante puede crear cuentas basura. → Bucket de registro más estricto + cota de `scrypt` + toggle `REGISTRATION_ENABLED=0` para cerrarlo sin deploy de código; borrado/desactivación masiva queda para el change 2.
- [Risk] **Enumeración de usernames por `409`**: el registro dice si un nombre existe. → Aceptado y acotado: no hay email ni teléfono que enumerar, y el login conserva respuesta genérica.
- [Risk] **Nombres reservados molestos**: alguien que quiera llamarse `server` no puede. → Lista mínima + `ADMIN_USERNAME`, documentada; se puede ampliar sin migración.
- [Risk] **`ADMIN_PASSWORD` débil o ausente**: no hay admin. → Validación de longitud y warning; el operador puede crear uno con la CLI.

## Migration Plan

1. **Paso 0 (sin comportamiento nuevo):** extraer `createApp` a `server/app.js`, dejar `server.js` como bootstrap, crear `MemoryStore` de test y migrar los tests que spawnean. `cd server && npm test` verde.
2. **TDD de auth (rojo):** escribir `auth.mjs`, `rate-limit.mjs`, `http-auth.mjs`, `ws-auth.mjs`, `admin-retirement.mjs` y `auth-db.mjs`; confirmar que fallan.
3. **DB y migraciones:** `pg`, `server/db.js`, `server/migrations/001-auth.sql`, `server/migrate.js`, `store-pg.js` (incluido `registerUser` transaccional), `user-tool.mjs`.
4. **Auth HTTP:** `auth.js`, `http-auth.js`, rutas y páginas; login, registro público con auto-login, logout, me, skin y healthz.
5. **Auth WS:** `ws-auth.js`, gate, identidad, `welcome.user`, `chat.admin`, revocación.
6. **Bootstrap y retiro de admin:** `server.js` bootstrap, eliminar `admin-auth.js`/`hash-key.mjs`, limpiar `ADMIN_KEY*` de compose/README.
7. **Cliente:** `login.html`, `register.html`, `lobby.html`, `index.html` (arranque por `/api/me`, menú reducido, pausa), `server/skins.js` (catálogo de jugador), `bot/index.js` (Bearer) y `bot/cazador.js` (flag admin).
8. **Docker/CI:** `db`, env (`REGISTRATION_ENABLED` incluido), `Dockerfile`, workflows con Postgres.
9. **Suite completa + Docker:** `cd server && npm test`, `docker compose up --build -d`, verificación manual y aprobación explícita del usuario. **No** se commitea, pushea ni archiva antes de esa aprobación.
10. **Rollback:** volver a la imagen anterior deja la DB intacta (la vieja no la usa). El rollback reactiva `ADMIN_KEY*` y desactiva el gate; sirve como escape de emergencia, pero pierde cuentas. Documentado.

## Open Questions

- ~~¿El registro público de usuarios entra en el change 2 o se mantiene solo CLI/CRUD admin?~~ **Resuelto:** el registro público entra en este change (`/register` + `POST /api/register`), con auto-login, toggle `REGISTRATION_ENABLED` y sin crear admins; el CRUD admin sigue en el change 2.
- ¿Cuántas altas por IP/hora tolera la producción? Hoy el bucket es 3 con recarga de 1 cada 20 s; si el spam es un problema, el siguiente paso es un límite por cuenta creada/hora o captcha, no cambiar el esquema.
- ¿La duración de sesión (7 días) y el mínimo de contraseña (8) son los definitivos? Son constantes fáciles de ajustar; no cambian el esquema.
- ¿Se quiere un preview 3D del skin en el lobby? Se descartó para el change 1 (el lobby no carga Three.js); se puede agregar después sin tocar auth.
- ¿`/index.html` directo debería redirigir a `/game`? Se deja servido para dev/compatibilidad; el gate real es el WebSocket. Si se quiere cerrar también esa puerta visual, es un cambio de una línea.
- ¿Vale la pena un token CSRF explícito si en el futuro se embebe el juego en un iframe? Se revisará junto con una CSP.

## Next Changes

- **Change 2 — administración de usuarios y permisos:** CRUD de usuarios desde un panel admin (listar, editar, desactivar, resetear contraseñas y **borrar cuentas basura creadas por el registro público**), roles/permisos por usuario, reglas como “el bot no ataca a X”, usuarios de servicio para bots con token hasheado en DB, recuperación/rotación de contraseñas desde el panel y auditoría de accesos.
- **Change 3 — panel y control de bots:** panel de bots, bots personalizados por usuario, control de modo/estado desde la UI admin y el **Mundo Infinito** real con su selección habilitada en el lobby.
