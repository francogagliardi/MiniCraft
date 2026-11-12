# Proposal

## Why

Hoy cualquiera que conozca la URL entra al mundo con el nombre y el aspecto que escriba en el menú, y el único control de privilegios es una clave admin compartida por variable de entorno (`ADMIN_KEY`/`ADMIN_KEY_HASH`). No existen cuentas, no hay revocación, el nombre es suplantable y el modo admin no distingue personas. Para poder construir (en los changes siguientes) administración de usuarios, permisos y control de bots, primero hace falta una identidad real: usuarios en base de datos, login con sesión y un lobby que separe "entrar" de "jugar".

Este es el **change 1 de 3**. Deja la base de identidad y el juego funcionando para un usuario logueado, sin CRUD ni panel de bots.

## What Changes

- **PostgreSQL como fuente de verdad de identidad.** Nuevo servicio `db` en `docker-compose.yml` con volumen persistente y healthcheck; `DATABASE_URL` en dev y producción. Migraciones SQL versionadas con un runner propio, aplicadas al arrancar.
- **Usuarios y sesiones.** Tablas `users` y `sessions`; contraseñas con `scrypt` de `node:crypto`; sesión opaca persistida y revocable en cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción. Nada de JWT en `localStorage`.
- **Login / logout / perfil.** Endpoints `POST /api/login`, `POST /api/logout`, `GET /api/me` y `PATCH /api/me` (solo `skin`), con rate limit, errores genéricos y `Cache-Control: no-store`.
- **Registro público.** `GET /register` + `POST /api/register` con username y contraseña (sin email) crea una cuenta `role=user`, `active=true` y skin `human` en una transacción, y hace **auto-login** (misma cookie de sesión que el login). Validaciones idénticas al resto (username 3–16 `^[A-Za-z0-9_-]+$`, único case-insensitive, contraseña 8–128), lista de usernames reservados (`admin`, `system`, `server`, `bot`, `null`, `undefined` y el valor de `ADMIN_USERNAME`), `409` para username tomado y rate limit por IP más estricto que el de login. Toggle operativo `REGISTRATION_ENABLED` (`0` cierra el registro y `/register` muestra "Registro cerrado"). El registro nunca puede crear `role=admin`: el admin sigue viniendo del bootstrap por env.
- **Roles `user`/`admin`.** El bootstrap crea el admin inicial desde `ADMIN_USERNAME` (default `admin`) y `ADMIN_PASSWORD` (obligatoria) al primer arranque, hasheando en DB. **BREAKING:** se retira por completo `ADMIN_KEY`/`ADMIN_KEY_HASH` y el `hello` deja de aceptar clave admin; se documenta la migración.
- **Flujo login → lobby → juego.** Nuevas páginas `login.html` y `lobby.html`; el juego sigue siendo `index.html` y se sirve en `/game` (no se renombra el archivo de 238 KB). En el lobby el usuario elige **Jugar Legacy** o **Mundo Infinito** (deshabilitado, "Próximamente") y su **skin**; su nombre de jugador es su username y no se edita en el juego.
- **Gate del WebSocket.** El upgrade exige una sesión válida; el server impone nombre, skin y rol desde el perfil e ignora los campos del cliente. **BREAKING:** un cliente sin cookie ya no puede jugar online (recibe rechazo claro, sin crash).
- **Credencial de servicio para el bot.** El contenedor `minicraft-bot` se autentica con `BOT_TOKEN` (header `Authorization: Bearer`) en vez de una cookie; conserva `BOT_NAME`/`BOT_SKIN` y sigue siendo un cliente de solo lectura.
- **Hardening.** Cookies, CSRF por `SameSite` + chequeo de `Origin` + JSON estricto, límite de tamaño de body, `scrypt` asíncrono con comparación timing-safe, expiración/revocación de sesiones y validación de username/skin.
- **Herramienta de aprovisionamiento.** `server/user-tool.mjs` (crear, cambiar contraseña, listar, activar/desactivar) para operar usuarios mientras no exista el CRUD del change 2.
- **Tests y CI.** Tests unitarios sin DB (hash, tokens, cookies, validaciones) + integración con `TEST_DATABASE_URL`; CI levanta un servicio `postgres` y exige que la integración corra. `npm test` local sigue funcionando sin Docker.

## Capabilities

### New Capabilities

- `security/auth`: cuentas de usuario, registro público, hash de contraseñas, login/logout, sesiones persistidas y revocables, roles, bootstrap del admin y retiro del camino de clave admin compartida.
- `net/session`: autenticación del upgrade WebSocket por cookie de sesión, identidad autoritativa del jugador (nombre/skin/rol) y credencial de servicio `BOT_TOKEN` para el bot.
- `ui/lobby`: flujo registro/login → lobby → juego, páginas separadas, elección de modo (Legacy / Mundo Infinito próximamente) y selector de skin en el lobby.
- `player/identity`: nombre y aspecto del jugador derivados del perfil autenticado, no editables ni declarables por el cliente.

### Modified Capabilities

- `security/admin-auth`: se eliminan la verificación por clave/hash y la precedencia; queda el requisito de retirar y rechazar las variables legacy con un aviso de migración.
- `ui/skins`: el selector deja de vivir en el menú inicial y de persistir en `localStorage`; pasa al lobby y el aspecto se guarda en el perfil del server.
- `net/avatar`: el aspecto deja de ser "declarado por el cliente en el `hello`"; lo asigna el server desde el perfil y lo difunde igual que antes.
- `bots/hunter`: el bot se autentica con `BOT_TOKEN`, conserva `BOT_NAME`/`BOT_SKIN` y la autorización de comandos pasa a usar el rol admin que emite el server.

## Impact

- **Código nuevo:** `server/db/` (cliente, migraciones, runner), `server/auth.js` (scrypt, tokens, cookies, validación de username/contraseña/reservados), `server/http-auth.js` (rutas API y páginas, incluido `POST /api/register`), `server/store-pg.js` (users/sessions), `server/user-tool.mjs`, `login.html`, `register.html`, `lobby.html`.
- **Código refactorizado:** `server/server.js` se parte en `server/app.js` (wiring inyectable, testeable sin DB) + `server.js` (bootstrap real). `server/admin-auth.js` y `server/hash-key.mjs` se eliminan.
- **Código tocado:** `server/skins.js` (catálogo de skins de jugador exportado y validado), `index.html` (menú → pantalla de conexión, `/api/me`, `hello` sin nombre/skin/clave, salir al lobby), `bot/index.js` (header `Authorization`), `bot/cazador.js` (autorización admin por flag del server).
- **Infra:** `docker-compose.yml` (`db`, `DATABASE_URL`, `BOT_TOKEN`, `REGISTRATION_ENABLED`, `depends_on` con healthcheck), `Dockerfile` (copia migraciones y `register.html`, healthcheck a `/healthz`), `.github/workflows/ci.yml` y `deploy.yml` (servicio postgres + `TEST_DATABASE_URL`).
- **Dependencias:** `pg` (cliente Postgres puro JS, sin build nativo). Sin framework de servidor ni de tests.
- **Documentación:** `README.md` (DB, variables, bootstrap, registro público y cómo cerrarlo en Easypanel, migración desde `ADMIN_KEY_HASH`, bot) y `AGENTS.md` si cambia el flujo de arranque.
- **Fuera de alcance (changes 2 y 3):** CRUD de usuarios desde panel admin (el alta pública no reemplaza el CRUD: listar, editar, desactivar y resetear contraseñas sigue en el change 2), permisos (por ejemplo "el bot no ataca a un usuario X"), panel y control de bots, bot personalizado por usuario, implementación real del Mundo Infinito, recuperación de contraseña por email, verificación de email, OAuth y 2FA.
