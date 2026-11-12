# Tasks

> **Alcance:** sólo planificación. La implementación es TDD estricto en el apply: cada bloque `RED` se escribe y se ve fallar antes del `GREEN`. Nada de código de producción en esta fase.

## 0. Refactor previo sin cambio de comportamiento

- [x] 0.1 Extraer el wiring actual de `server/server.js` a `server/app.js` con `createApp({ env, staticDir, worldFile, now })` → `{ httpServer, wss, listen, close }`, moviendo HTTP estático, WS, mundo, zombis y sueño **sin cambiar comportamiento**. Verificación: `cd server && npm test` completamente verde con los tests actuales spawneando `server.js`.
- [x] 0.2 Dejar `server.js` como bootstrap delgado (lee env, crea `createApp`, escucha, logs, shutdown). Verificación: arranque local y `docker compose up --build -d minicraft` siguen sirviendo el juego como antes.
- [x] 0.3 Crear `server/test/support/memory-store.mjs` con la interfaz futura de store (users/sessions) para tests, sin ningún flag de producción que lo active. Verificación: el módulo no se importa desde `server.js` ni desde `app.js`.

## 1. Tests en rojo (TDD) de auth

- [x] 1.1 **RED** `server/test/auth.mjs`: formato `scrypt$N$r$p$salt$hash`, verify correcta/incorrecta/corrupta, salts distintos, validación de username (`^[A-Za-z0-9_-]{3,16}$`) y contraseña (8–128, bordes incluidos), `isReservedUsername` (`admin`, `system`, `server`, `bot`, `null`, `undefined` y `ADMIN_USERNAME`, case-insensitive), parseo/serialización de cookie con `HttpOnly`/`SameSite=Lax`/`Secure`/`Max-Age`, y comparación de tokens. Verificación: falla porque los módulos no existen.
- [x] 1.2 **RED** `server/test/rate-limit.mjs`: token bucket con reloj falso (capacidad 5, recarga 0.2/s), cota de 2 derivaciones concurrentes, rechazo sin consumir derivación y bucket de registro propio con capacidad 3 y recarga 0.05/s (más estricto que el de login). Verificación: falla por módulo ausente.
- [x] 1.3 **RED** `server/test/http-auth.mjs`: `createApp` + `MemoryStore` en puerto efímero; login ok, login genérico para usuario inexistente/inactivo/clave mala, `429` sin derivar, `415` por Content-Type, `403` por `Origin` ajeno, `413` por body >8 KB, `/api/me`, `PATCH /api/me` (skin válido, `role`/`username` ignorados, skin inválido `400`), logout idempotente y `Cache-Control: no-store`. Verificación: falla porque las rutas no existen.
- [x] 1.4 **RED** `server/test/ws-auth.mjs`: upgrade sin cookie `401`; con cookie válida entra; `name`/`skin`/`mode`/`key`/`bot` del `hello` ignorados; `welcome.user`; `chat.admin`; logout cierra el socket; sesión expirada se cierra en ≤60 s; bot con `BOT_TOKEN` válido entra, sin token/incorrecto `401`, y `bot:true` de un usuario no lo excluye del quórum. Verificación: falla porque el gate no existe.
- [x] 1.5 **RED** `server/test/admin-retirement.mjs` (reemplaza `admin-hash.mjs`): `ADMIN_KEY`/`ADMIN_KEY_HASH` ignoradas, warning único sin filtrar el valor, y `hello` con clave no otorga admin. Verificación: falla con el camino actual de `admin-auth.js`.
- [x] 1.6 **RED** `server/test/auth-db.mjs`: integración real gateada por `TEST_DATABASE_URL`; migraciones idempotentes, unicidad `lower(username)`, hash de token guardado (no el token), expiración/revocación, **registro público (usuario + sesión en la misma transacción, rollback si falla la sesión, `role` forzado a `user` ante un body con `role:'admin'`, `409` por carrera de username)**, bootstrap admin, `passwd`/`disable` revocando sesiones. Si `REQUIRE_DB_TESTS=1` y falta la URL, debe **fallar**. Verificación: falla porque no hay migraciones ni store.
- [x] 1.7 **RED** `server/test/register.mjs` (`createApp` + `MemoryStore`): `POST /api/register` con alta válida → `201 {user}` + `Set-Cookie` y `GET /api/me` responde con la sesión nueva (auto-login); username reservado → `400 username_reserved`; username duplicado con otra capitalización → `409 username_taken`; password de 7 caracteres → `400 invalid_password`; body con `role:'admin'`/`skin:'robot'`/`active:false` → la cuenta queda `role=user`, `skin=human`, `active=true`; `REGISTRATION_ENABLED=0` → `403 registration_disabled` y `GET /register` sin formulario; `429` sin derivar; body >8 KB → `413`; `Origin` ajeno → `403`; `/register` con sesión → `302 /lobby`; `Cache-Control: no-store`. Verificación: falla porque la ruta no existe.
- [x] 1.8 Agregar los tests nuevos a `server/package.json` → `scripts.test` en orden: unitarios de auth, rate limit, HTTP de login, registro, WS, retiro, protocolo/regresión, integración DB y `static.mjs` al final. Verificación: la cadena corre y reporta los fallos esperados de RED.

## 2. Base de datos, migraciones y store

- [x] 2.1 **GREEN** `server/migrations/001-auth.sql` con `users` (username único por `lower(username)`, `password_hash`, `role` con `CHECK`, `skin`, `active`, timestamps) y `sessions` (token hasheado único, `user_id` con `ON DELETE CASCADE`, `expires_at`, `revoked_at`, `last_seen_at`, índices). Verificación: `auth-db.mjs` crea el esquema sin errores.
- [x] 2.2 **GREEN** `server/migrate.js`: `schema_migrations`, orden por nombre, transacción por archivo, `pg_advisory_xact_lock`, re-chequeo, `MIGRATIONS_AUTO=0`. Verificación: correrlo dos veces deja el mismo esquema y no re-aplica.
- [x] 2.3 **GREEN** agregar `pg` a `server/package.json`, actualizar `server/package-lock.json` (`npm install pg`) y crear `server/db.js` (`pg.Pool`, `query`, `withTransaction`, timeouts y cierre ordenado). Verificación: `npm ci` limpio y `auth-db.mjs` conecta, consulta y cierra sin conexiones colgadas.
- [x] 2.4 **GREEN** `server/store-pg.js` con la interfaz acordada: `getUserByUsername`, `getUserById`, `createUser`, `registerUser`, `updateUserSkin`, `setUserPassword`, `setUserActive`, `createSession`, `getSessionByTokenHash`, `revokeSession`, `revokeUserSessions`, `touchSession`, `cleanupSessions`, `listUsers`. Todo parametrizado. Verificación: casos de integración de 1.6 verdes.
- [x] 2.5 **GREEN** `server/user-tool.mjs` (`create`, `passwd`, `list`, `disable`, `enable`) con contraseña por `stdin`, mismas validaciones/hash que el login y revocación de sesiones. Verificación: crear un usuario y loguearse con él contra la DB de test; la salida no imprime la contraseña.
- [x] 2.6 Wire de migraciones en `server.js` antes de `listen`, fail fast con log claro si fallan y limpieza oportunista de sesiones. Verificación: `auth-db.mjs` y el arranque local contra Postgres.
- [x] 2.7 **GREEN** `registerUser` transaccional en `store-pg.js`/`db.js`: `BEGIN` → insertar `users` (`role='user'`, `skin='human'`, `active=true`, hash `scrypt`) → crear `sessions` → `COMMIT`; si falla la sesión, rollback completo; `23505` en `users_username_lower_key` se traduce a “username tomado” sin loguear el error crudo. Verificación: casos de registro de 1.6 y la carrera de duplicados verdes.

## 3. Autenticación HTTP y páginas

- [x] 3.1 **GREEN** `server/auth.js`: `hashPassword`/`verifyPassword` con `scrypt` async (`N=16384`, `r=8`, `p=1`, `keylen=64`, `maxmem=64 MiB`), parser con cotas, `timingSafeEqual`, dummy hash, token de 32 bytes, SHA-256, utilidades de cookie y validación compartida de username (3–16), contraseña (8–128) y `isReservedUsername` (lista mínima + `ADMIN_USERNAME`). Verificación: `auth.mjs` verde.
- [x] 3.2 **GREEN** `server/rate-limit.mjs`: token bucket inyectable + limiter de concurrencia reutilizando la semántica de `admin-auth` (sin el módulo). Verificación: `rate-limit.mjs` verde.
- [x] 3.3 **GREEN** `server/http-auth.js`: router de `/`, `/api/login`, `/api/register`, `/api/logout`, `/api/me`, `PATCH /api/me`, `/login`, `/register`, `/lobby`, `/game`, `/healthz`; lectura JSON con límite de 8 KB, chequeo de `Origin`/`Referer`/`Sec-Fetch-Site`, `Content-Type` estricto, headers `nosniff`/`Referrer-Policy`/`X-Frame-Options` y `no-store`. Verificación: `http-auth.mjs` verde.
- [x] 3.4 **GREEN** gate de páginas y redirecciones: `/` → lobby/login según cookie; `/login` con sesión → lobby; `/lobby` y `/game` sin sesión → login; `/game` sirve `index.html`. Verificación: casos de redirect de 1.3 verdes.
- [x] 3.5 **GREEN** `server/skins.js`: exportar `PLAYER_SKINS` (8, sin `robot`), `isPlayerSkin` y resolución a `human`; usar esa validación en `PATCH /api/me` y en el bootstrap. Verificación: `auth.mjs`/`http-auth.mjs` rechazan `robot` y valores inventados.
- [x] 3.6 Crear `login.html` autocontenido: form accesible, Enter, error genérico, `429` con espera, `noindex`, 44 px táctil, sin assets binarios. Verificación: `http-auth.mjs` + revisión manual en móvil.
- [x] 3.7 Crear `lobby.html`: fetch `/api/me`, username, 8 skins con `data-skin`/`role=radio`/`aria-checked`, `PATCH` con estado y revert, tarjeta Legacy → `/game`, tarjeta Infinito deshabilitada “Próximamente”, logout. Verificación: `http-auth.mjs` y paridad de ids contra `server/skins.js`/`index.html`.
- [x] 3.8 Actualizar `server/test/static.mjs`: existen las páginas (incluida `register.html`), el login enlaza a `/register`, no hay `#nameInput`/`#keyInput`/`#skinPicker`/`#btnAdmin` en el juego, las rutas están cableadas y las respuestas de auth llevan `no-store`. Verificación: `static.mjs` verde.
- [x] 3.9 **GREEN** `POST /api/register` en `http-auth.js`: valida username/contraseña/reservados **antes** de derivar; exige JSON y el mismo chequeo de `Origin`/body 8 KB; `201 {user}` con `Set-Cookie` (auto-login) usando `registerUser`; `409 username_taken` en duplicado case-insensitive (incluida la carrera); `400 username_reserved`/`invalid_username`/`invalid_password`; `403 registration_disabled` si el toggle está apagado; `503` con DB caída. Verificación: `register.mjs` verde.
- [x] 3.10 **GREEN** `REGISTRATION_ENABLED` en la config/env: ausente = `1`; `1`/`true` abierto; `0`/`false` cerrado; otro valor → cerrado + warning al arrancar (fail closed). Con el registro cerrado, `GET /register` sirve la página en modo “Registro cerrado” sin formulario y `POST /api/register` responde `403`. Verificación: casos de toggle de 1.7 verdes.
- [x] 3.11 Crear `register.html` autocontenido: form username/contraseña (+ repetición solo en cliente), `autocomplete="username"`/`new-password`, Enter envía, errores por campo en español (`username_taken`, `username_reserved`, `invalid_username`, `invalid_password`, `429`, `503`), estado “Registro cerrado”, `noindex`, 44 px táctil, mismo lenguaje visual que `login.html`. Verificación: alta manual y `static.mjs`.
- [x] 3.12 Agregar en `login.html` el link “¿No tenés cuenta? Crear una” → `/register`, sin romper el layout móvil ni el estado de error del login. Verificación: `static.mjs` y navegación login → registro → lobby.
- [x] 3.13 Verificar el anti-fixation del registro: si el navegador trae una cookie de sesión válida y registra otra cuenta, la sesión anterior se revoca y queda la nueva. Verificación: caso en `http-auth.mjs`/`register.mjs`.

## 4. Gate del WebSocket e identidad

- [x] 4.1 **GREEN** `server/ws-auth.js`: `noServer: true`, `server.on('upgrade')`, cookie → sesión/usuario, Bearer → `BOT_TOKEN` timing-safe, `401`/`503` con `socket.destroy()` y `ws.auth` adjunto antes de `connection`. Verificación: `ws-auth.mjs` verde en los casos de rechazo/aceptación.
- [x] 4.2 **GREEN** identidad impuesta en el `hello`: usuario de cookie usa `auth.username`/`auth.skin`/`auth.role`; bot usa `cleanName(BOT_NAME)`/`cleanSkin(BOT_SKIN)`; se ignoran `name`, `skin`, `mode`, `key` y `bot` del cliente. Verificación: casos de spoofing de 1.4 verdes.
- [x] 4.3 **GREEN** `welcome.user` aditivo y `chat.admin` para rol admin. Verificación: `ws-auth.mjs` y `protocol.mjs` adaptado.
- [x] 4.4 **GREEN** revocación: logout cierra los sockets del usuario con `removePlayer` + `leave`; heartbeat de 30 s revalida sesión y cierra revocadas/expiradas con código `4001`; usuarios inactivos también se cierran. Verificación: casos de logout/expiración verdes.
- [x] 4.5 Verificar compatibilidad: cliente sin cookie recibe rechazo, el server sigue sirviendo HTTP, no hay excepciones no capturadas y no se crea jugador. Verificación: caso de cliente viejo en `ws-auth.mjs` + prueba manual con `index.html` viejo.
- [x] 4.6 Adaptar `server/test/protocol.mjs` y los e2e que spawnean `server.js` a `createApp` + `MemoryStore` en proceso, autenticando por `POST /api/login` y cookie en el upgrade. Verificación: toda la regresión de protocolo (welcome, mv, edit, chat, sueño, zombis, bot) verde.

## 5. Bootstrap del admin y retiro de `ADMIN_KEY*`

- [x] 5.1 **GREEN** bootstrap en `server.js`: `ADMIN_USERNAME` (default `admin`) + `ADMIN_PASSWORD` (≥8, recomendado ≥16) crea el admin si no existe, no sobrescribe si existe y advierte sin secreto si falta/es corta. El `ADMIN_USERNAME` se agrega a la lista de reservados del registro. Verificación: `auth-db.mjs` verde.
- [x] 5.2 Eliminar `server/admin-auth.js` y `server/hash-key.mjs`, y todo su uso en `server.js`/`app.js`. Verificación: `grep -R "admin-auth\|hash-key\|ADMIN_KEY" server` sin referencias de runtime.
- [x] 5.3 Warning de migración una sola vez si `ADMIN_KEY` o `ADMIN_KEY_HASH` están presentes, sin loguear valores. Verificación: `admin-retirement.mjs` verde.
- [x] 5.4 Actualizar README: variables nuevas (incluida `REGISTRATION_ENABLED` y cómo cerrar el registro en Easypanel), registro público en `/register`, bootstrap, migración desde `ADMIN_KEY_HASH`, `user-tool`, `BOT_TOKEN`, `COOKIE_SECURE` y `TRUST_PROXY`; quitar toda mención operativa a `ADMIN_KEY*` salvo la nota de migración. Verificación: revisar que no haya claves de ejemplo usables.

## 6. Cliente y bot

- [x] 6.1 **GREEN** `index.html`: `fetch('/api/me')` al arrancar; `401` → `/login`; `503`/red → mensaje con reintento; setear `myName`/`mySkin`/`mode` desde el perfil. Verificación: prueba manual con y sin cookie.
- [x] 6.2 Quitar del menú el nombre, la clave admin, el selector de skins y el botón admin; dejar una tarjeta con username/skin y un único botón “ENTRAR AL MUNDO”. Verificación: `static.mjs` y revisión visual.
- [x] 6.3 `startGame` usa el perfil (no el DOM), el `hello` va sin `key` y `welcome.user` reafirma nombre/skin. Verificación: entrar con dos cuentas y ver nombres/skins correctos.
- [x] 6.4 Pausa: “Volver al lobby” y “Cerrar sesión” (`POST /api/logout` → `/login`); el cierre de WS en `pagehide` sigue. Verificación: logout con partida abierta cierra la conexión y difunde `leave`.
- [x] 6.5 **GREEN** `bot/index.js`: mandar `Authorization: Bearer ${BOT_TOKEN}` en el upgrade, fallar con mensaje claro si falta `BOT_TOKEN`, y reconectar con el mismo header. Verificación: `bot-cazador.mjs`/e2e con token.
- [x] 6.6 **GREEN** `bot/cazador.js`: autorizar `sigueme`/`seguime`/`espera` por `m.admin === true` o por el `mode` del roster, manteniendo el match exacto y el rechazo por nombre. Verificación: casos de comandos, impostor y flag admin verdes.
- [x] 6.7 Verificar que el skin del bot (`BOT_SKIN`, default `robot`) y `BOT_NAME` siguen funcionando como servicio, sin cookie ni sesión. Verificación: e2e del bot.

## 7. Docker, CI y documentación

- [x] 7.1 `docker-compose.yml`: servicio `db` (`postgres:16-alpine`, volumen `minicraft-db`, healthcheck `pg_isready`, sin puertos públicos), `DATABASE_URL` en `minicraft`, `depends_on` con `service_healthy`, `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`BOT_TOKEN`/`COOKIE_SECURE`/`TRUST_PROXY`/`REGISTRATION_ENABLED` (default `1`), y `BOT_TOKEN` en el bot. Sin `BOT_TOKEN` el bot sale con error claro (documentar `BOT_TOKEN=... docker compose up --build -d` para dev). Verificación: `docker compose config`.
- [x] 7.2 `Dockerfile`: copiar `server/migrations`, `login.html`, `register.html` y `lobby.html`; healthcheck a `/healthz`; `pg` como dependencia de producción. Verificación: build limpio y contenedor healthy.
- [x] 7.3 `.github/workflows/ci.yml` y `deploy.yml`: servicio `postgres:16` con healthcheck, `TEST_DATABASE_URL` y `REQUIRE_DB_TESTS=1` en el job de tests. Verificación: workflow verde en el PR local/CI.
- [x] 7.4 `server/README.md`/`README.md`/`AGENTS.md`: flujo registro → login → lobby → juego, esquema, migraciones, comandos de `user-tool`, variables, `REGISTRATION_ENABLED` (cómo apagarlo en Easypanel) y advertencias de `BOT_TOKEN`/`COOKIE_SECURE`. Verificación: seguir el README desde cero en una copia limpia.
- [x] 7.5 Confirmar que `npm test` local corre **sin Docker** (integración omitida con aviso) y que con `TEST_DATABASE_URL` corre la integración. Verificación: ambas corridas.

## 8. Feedback post-prueba de la UI

Ajustes pedidos por el usuario al probar el change en Docker. No cambian auth, DB, sesiones, WS ni el bot: son presentación, etiquetas y entrada directa.

- [x] 8.1 **RED** aserciones en `server/test/static.mjs` (tema + toggle + `mc-theme` en las tres páginas, init antes del CSS, etiquetas españolas y ausencia de las inglesas exactas, hints centrados, `skinSpec(mySkin).label` y autoarranque en la rama de perfil) y en `server/test/skins.mjs` (las ocho etiquetas en español del selector). Verificación: fallan por la UI anterior (52 + 7 chequeos).
- [x] 8.2 **GREEN** tema oscuro/claro con `data-theme` en `<html>`, variables CSS para ambos temas, `color-scheme`, script inline antes del CSS (sin flash) y persistencia en `localStorage` (`mc-theme`, default oscuro) en login, registro y lobby.
- [x] 8.3 **GREEN** toggle visible y accesible en las tres páginas (`type="button"`, icono sol/luna, `aria-label` en español, `aria-pressed` y foco visible) y `prefers-reduced-motion` respetado.
- [x] 8.4 **GREEN** rediseño con la identidad de Minicraft: fondo con gradientes y grilla sutil, panel con profundidad, tipografía y espaciados cuidados; estados `:hover`/`:active` en submit, tarjetas de aspecto, tarjetas de mundo, enlaces y botones, sin saltos de layout.
- [x] 8.5 **GREEN** etiquetas de aspecto en español en el lobby (Humano, Gordo, Gigante, Pequeño, Zombi, Mujer, Piel oscura, Gojo) con los `data-skin` intactos, y `skinSpec(mySkin).label` en el menú del juego; sin restos de interfaz en inglés.
- [x] 8.6 **GREEN** entrada directa: `/game` con sesión autoarranca (`autoStartGame` idempotente, "Conectando…" sin menú intermedio), aviso no bloqueante "Hacé clic para capturar el mouse" si falta el gesto, y menú solo para archivo local o error con reintento.
- [x] 8.7 **GREEN** hints y footers de login/registro centrados; login, registro y admin siguen funcionando sin cambios de lógica.
- [x] 8.8 Verificación: `cd server && npm test` completamente verde (30 archivos en la cadena, integración de DB omitida sin `TEST_DATABASE_URL`) y `openspec validate auth-usuarios-lobby --strict` sin errores. La re-prueba visual en Docker queda para el bloque 9.

## 9. Verificación integral y aprobación

- [x] 9.1 Correr `cd server && npm test` y verificar **todo verde**, incluidos `static.mjs`, `protocol.mjs` y los e2e adaptados.
- [x] 9.2 Levantar `docker compose up --build -d` (db + server + bot) con `REGISTRATION_ENABLED=1`, esperar healthchecks y confirmar que `http://localhost:3000` responde y el bot entra con `BOT_TOKEN`.
- [x] 9.3 Probar en el navegador: registro en `/register` con un username nuevo → auto-login y lobby con skin `human`; username duplicado (otra capitalización) → “Ese nombre ya está en uso”; `admin`/`server` → nombre reservado; `REGISTRATION_ENABLED=0` (reiniciando el contenedor) → `/register` muestra “Registro cerrado” y el alta responde `403`; login con el admin bootstrap; lobby con skins; “Mundo Infinito” deshabilitado; “Jugar Legacy” entra con el username y skin del perfil; sin cookie `/game` redirige a `/login`; logout cierra la partida; nombre/skin no editables; el bot no ataca al admin y obedece `sigueme`/`espera`.
- [x] 9.4 Avisar al usuario **qué mirar** y pasar el link local y la clave admin de esa corrida **en la misma línea** (`http://localhost:3000 · admin: <clave>`), o `admin deshabilitado` si no se configuró `ADMIN_PASSWORD`. La clave es solo dev local y no se commitea.
- [x] 9.5 **Esperar aprobación explícita del usuario.** No commitear, no pushear y no archivar antes de esa aprobación.
- [x] 9.6 Si el usuario pide cambios: corregir, volver a levantar Docker y repetir 9.1–9.5.

## Workflow follow-up

- **Tras la aprobación explícita, lo hace el orquestador** (no este subagente): `docker compose down`, `git add` + commit en español (`feat(auth):` o el scope que corresponda), `git push` a `main`, `openspec archive auth-usuarios-lobby` y verificación de `git status` limpio.
- Al archivar: actualizar el `Purpose` de `ui/skins` y `security/admin-auth` si quedó desactualizado, y dejar registrado que CRUD de usuarios, permisos y panel de bots son los changes 2 y 3.
