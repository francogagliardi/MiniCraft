# Proposal

## Why

El change 1 dejó cuentas reales, sesiones y roles, pero no hay forma de administrarlas: listar, crear, editar, desactivar o borrar usuarios exige entrar al servidor con `user-tool`, no existen permisos por usuario y no queda registro de quién hizo qué. Sin eso, los privilegios son binarios (`user`/`admin`), el registro público puede llenar la base de cuentas basura que nadie puede limpiar y no se puede cumplir el caso pedido "que el cazador ignore a tal usuario" sin sacarle el rol admin.

Este es el **change 2 de 3**. Agrega el CRUD de usuarios, tres permisos por usuario con efecto real en el juego y el bot, una página `/admin` y auditoría append-only. No implementa el panel ni el control de bots (change 3).

## What Changes

- **CRUD de usuarios solo para admin.** `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/password` y `DELETE /api/admin/users/:id`. El listado nunca expone `passwordHash`. El `username` es **inmutable** después del alta; `PATCH` solo edita `skin`, `role`, `active` y `permissions`.
- **Guardas de integridad.** Un admin no puede desactivarse, borrarse ni degradarse a sí mismo, y el sistema MUST quedar siempre con al menos un admin activo (no se puede desactivar, degradar ni borrar al último). Los intentos rechazados se auditan con un código de guarda.
- **Permisos por usuario extensibles.** Columna `users.permissions JSONB NOT NULL DEFAULT '{}'` con allowlist `bot_ignore`, `fly`, `instant_break`, validación estricta de claves y booleanos (422, sin ignorar en silencio) y normalización server-side.
- **Efecto real de los permisos, no solo UI.**
  - `bot_ignore`: el server publica el flag en la identidad/roster y en un frame aditivo `perm`; `bot/cazador.js` excluye a esas víctimas; además el server **descarta** todo `hit` emitido por la conexión de servicio del bot contra un usuario con `bot_ignore` (defensa en profundidad).
  - `fly`: `/api/me` y `welcome.user` incluyen permisos; el cliente habilita vuelo si es admin o tiene `fly`.
  - `instant_break`: el cliente usa la misma rama instantánea del admin si es admin o tiene `instant_break`.
- **Revocación al administrar.** Cambiar rol, desactivar, resetear contraseña o borrar revoca todas las sesiones del usuario y cierra sus WebSockets abiertos; reactivar no revoca. Cambiar permisos aplica en caliente (frame `perm`), sin relogin.
- **Página `/admin`.** Página separada (no se infla `lobby.html`) con tabla de usuarios, alta, edición de skin/rol/estado/permisos, reset de contraseña, borrado con confirmación y sección de auditoría. Gate por `role=admin`; un usuario común recibe `403` en API y redirect al lobby en la página. Link "Administración" en el lobby solo para admin.
- **Auditoría append-only.** Tabla `admin_audit` con actor, target, acción, detalle JSONB y fecha; registra crear, editar, permisos, password, activar/desactivar, borrar y los rechazos por guardas, sin datos sensibles.
- **Migración `server/migrations/002-admin-permissions.sql`.** Forward-only e idempotente por el runner existente (`schema_migrations`).
- **BREAKING menor:** los bodies públicos de `/api/me`, `POST /api/login` y `/api/register` suman el campo aditivo `permissions`; `welcome.user` también. Los consumidores que lo ignoran siguen funcionando.

## Capabilities

### New Capabilities

- `security/admin`: administración de cuentas por parte de un admin autenticado (listado, alta, edición acotada, reset de contraseña, activar/desactivar, borrado), guardas de integridad del último admin y del self, rate limit y auditoría append-only de acciones y rechazos.
- `player/permissions`: semántica efectiva de los permisos por usuario (`bot_ignore`, `fly`, `instant_break`), su publicación aditiva en la identidad del jugador, el descarte server-side del daño del bot y los límites conocidos de autoridad del cliente.
- `ui/admin`: página `/admin` gated por rol, tabla de usuarios, formularios de alta/edición, confirmaciones destructivas, sección de auditoría y acceso desde el lobby.

### Modified Capabilities

- `security/auth`: la cuenta suma `permissions`; el perfil público de `/api/me`, login y registro materializa los tres permisos booleanos; las acciones administrativas revocan sesiones; el username se documenta como inmutable también para el admin.
- `net/session`: `welcome.user` y el roster llevan permisos/flags aditivos; el server identifica la conexión de servicio del bot, aplica cambios de permisos en caliente con `perm` y descarta `hit` del bot contra usuarios protegidos; rol/estado/password/borrado cierran los sockets del afectado.
- `bots/hunter`: el cazador excluye de sus presas a todo jugador con `botIgnore` y actualiza esa exclusión con el frame `perm`, manteniendo su contrato de "nunca ataca admins".
- `ui/lobby`: muestra el link "Administración" únicamente cuando el perfil tiene `role=admin`.

## Impact

- **Código nuevo:** `server/permissions.js` (allowlist, normalización, permisos efectivos), `server/admin-api.js` (router de administración, guardas, auditoría), `server/test/admin.mjs`, `server/test/admin-db.mjs`, `server/test/admin-ws.mjs`, `admin.html`.
- **Código modificado:** `server/migrations/002-admin-permissions.sql` (nueva), `server/http-auth.js` (`publicUser` con permisos, gate de `/admin`), `server/store-pg.js` y `server/test/support/memory-store.mjs` (permisos, auditoría, borrado, conteo de admins), `server/rate-limit.js` (bucket admin), `server/app.js` (identidad con permisos, frame `perm`, marcado del bot y descarte de `hit`), `server/ws-auth.js` (permisos en `ws.auth`, bot identificado), `server/auth.js` (sin cambios de hash), `index.html` (vuelo y rotura instantánea por permiso), `lobby.html` (link admin), `bot/cazador.js` (`botIgnore` en presas y `perm`), `bot/index.js` solo si el flag requiere cableado, `server/package.json` (cadena de tests), `README.md`/`server/README.md` (panel, permisos, auditoría y límites).
- **Infra:** sin servicios nuevos. La migración corre con el runner existente al arrancar; Docker y CI no cambian salvo que `TEST_DATABASE_URL` cubre la nueva integración.
- **Datos:** `ALTER TABLE users` (columna nueva con default, sin backfill) y tabla `admin_audit` con FKs `ON DELETE SET NULL` para conservar el historial cuando se borra una cuenta.
- **Fuera de alcance (change 3):** panel y control de bots, bot personalizado por usuario, Mundo Infinito. También quedan afuera renombrar usernames, permisos de criaturas o invulnerabilidad, filtros/búsqueda avanzada, email, OAuth y 2FA. No se cambia el flujo de registro/login ni la lógica de sesión del change 1.
