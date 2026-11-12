# Design

## Context

Estado **verificado** leyendo el código del repo, que condiciona el enfoque:

- **HTTP y WS viven en un solo proceso**: `server/http-auth.js` es un router plano que atiende login/registro/logout/perfil/páginas (`:304-355`) y cae al estático histórico; `server/app.js` monta HTTP + `WebSocket.Server({ noServer: true })` (`:184-214`) con todo el estado en la instancia.
- **La sesión se resuelve por cookie** en HTTP (`currentSession`, `http-auth.js:149-164`) y en el upgrade WS (`server/ws-auth.js:36-56`). `ws.auth` llega con `{kind, userId, username, role, skin, tokenHash}`; el bot entra con `kind:'bot'` y se marca `bot:true` en `me` (`app.js:195-205`, `:369-382`).
- **La identidad se impone en el `hello`** desde la sesión; se ignoran `name`, `skin`, `mode`, `key` y `bot` del cliente (`app.js:189-206`). `welcome.user` solo lleva `username`, `role`, `skin` (`app.js:396`).
- **El store** (`server/store-pg.js`) ya tiene `listUsers`, `getUserById`, `createUser`, `updateUserSkin`, `setUserPassword`, `setUserActive`, `revokeUserSessions` y una proyección pública `mapPublicUser` que **nunca** devuelve `password_hash` (`:20-32`). `MemoryStore` replica la misma interfaz para tests.
- **El runner de migraciones** aplica `server/migrations/*.sql` ordenados, con `schema_migrations`, transacción por archivo y advisory lock (`server/migrate.js`).
- **El cliente** es `index.html` sin build. El vuelo y la rotura instantánea están atados a `isAdmin()` (`:2180`, `:3394`, `:3429-3434`, `:3962-3972`). El admin también es inmune a daño y regen, cosas que **no** se tocan. `profile` se carga de `/api/me` (`:4065-4082`).
- **El bot** replica el roster en `players` con `normPlayer` y decide presas con `isPrey` (`bot/cazador.js:64-74`, `:117-129`); no manda `edit` y es inmune a `phit`.
- **Los tests** son scripts Node planos encadenados en `server/package.json`; `server/test/support/app-fixture.mjs` levanta `createApp` en proceso con `MemoryStore`, `server/test/support/memory-store.mjs` replica el store y `auth-db.mjs` cubre Postgres bajo `TEST_DATABASE_URL` (CI con `REQUIRE_DB_TESTS=1`).
- **El lobby** ya tiene tema claro/oscuro (`data-theme` + `mc-theme`), carga `/api/me` y conoce `role` (`lobby.html:210-283`). No hay página de administración.

## Goals / Non-Goals

**Goals:**

- CRUD de usuarios completo desde una API y una página solo-admin, con errores claros y sin filtrar hashes.
- Tres permisos por usuario con allowlist, persistencia JSONB y **efecto real** en juego y bot.
- Guardas de integridad: nunca dejar el sistema sin admin activo ni permitir autolesión administrativa.
- Revocación y cierre de sockets consistente con las acciones administrativas.
- Auditoría append-only de acciones y rechazos, consultable desde el panel.
- Todo aditivo para clientes viejos y para el bot.

**Non-Goals:**

- Panel o control de bots, bot personalizado y Mundo Infinito (change 3).
- Renombrar usernames, permisos de criaturas, invulnerabilidad, anti-cheat de movimiento/picado.
- Búsqueda, filtros o paginación avanzada; exportación de auditoría; email/OAuth/2FA.
- Cambiar el flujo de registro/login, el hash de contraseñas o la lógica de sesión del change 1.

## Decisions

### 1. Esquema: columna JSONB y auditoría append-only

`server/migrations/002-admin-permissions.sql` (forward-only; el runner ya garantiza una sola aplicación):

```sql
-- 002-admin-permissions.sql — CRUD admin, permisos por usuario y auditoría.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- CHECK idempotente (ADD CONSTRAINT no soporta IF NOT EXISTS en PG 16).
DO $$
BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_permissions_object
    CHECK (jsonb_typeof(permissions) = 'object');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS admin_audit (
  id             BIGSERIAL PRIMARY KEY,
  actor_user_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT        NOT NULL,
  details        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_action_len     CHECK (char_length(action) BETWEEN 1 AND 64),
  CONSTRAINT admin_audit_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS admin_audit_created_at_idx
  ON admin_audit (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_audit_actor_idx
  ON admin_audit (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_target_idx
  ON admin_audit (target_user_id, created_at DESC);
-- Chequeo rápido del "último admin" sin escanear toda la tabla.
CREATE INDEX IF NOT EXISTS users_active_admin_idx
  ON users (id) WHERE role = 'admin' AND active;
```

Decisiones:

- **`DEFAULT '{}'` sin backfill**: las cuentas existentes quedan sin permisos; el perfil materializa `false`.
- **Allowlist en la aplicación, no en la DB**: agregar un permiso futuro no exige migración. La DB solo garantiza que sea un objeto JSON.
- **`ON DELETE SET NULL`** en ambos FKs: borrar una cuenta no borra su historial. Para conservar legibilidad, `details` guarda snapshots de `actorUsername`/`targetUsername`; la consulta usa el join cuando existe y el snapshot cuando no.
- **Append-only a nivel API y código**: no hay endpoints de update/delete y el store solo expone `insertAudit`/`listAudit`. No se agrega trigger porque `ON DELETE SET NULL` ejecuta un `UPDATE` interno sobre `admin_audit` al borrar un usuario y un trigger lo bloquearía. Se documenta como límite (un operador con SQL directo puede editar).
- **`users_active_admin_idx`** acelera el conteo de admins activos; la guarda real es transaccional (decisión 4).

### 2. Modelo de permisos

`server/permissions.js` (módulo puro, sin DB):

```js
const PERMISSIONS = ['bot_ignore', 'fly', 'instant_break'];

// { ok:true, value:{...solo true} } | { ok:false, invalid:[...], nonBoolean:[...] }
normalizePermissions(input);

// Siempre las tres claves booleanas (false por defecto).
materializePermissions(stored);

// Permiso efectivo: el rol admin implica fly/instant_break sin tocar lo guardado.
canFly(user)            // user.role === 'admin' || user.permissions.fly
canInstantBreak(user)   // user.role === 'admin' || user.permissions.instant_break
botIgnores(user)        // user.permissions.bot_ignore === true
```

- **Entrada estricta**: `permissions` debe ser objeto plano (no array, no `null`); claves fuera de la allowlist → `422 invalid_permissions` con `details.invalid`; valores que no sean `typeof === 'boolean'` → `422` con `details.nonBoolean`. **No se ignora nada en silencio.**
- **Canonicalización**: se guardan solo las claves con `true`; `false` se omite. Así `{}` es "sin permisos" y el diff de auditoría es chico.
- **Lectura tolerante**: si una fila trae claves desconocidas (edición manual), `materializePermissions` las descarta y devuelve solo las tres conocidas. La API de escritura sigue rechazándolas.
- **Reemplazo completo**: `PATCH` con `permissions` reemplaza el mapa (semántica PUT-like), documentado en la UI; no hay merge parcial para evitar ambigüedad de "quitar".
- **Admin**: no se materializan permisos extra en DB; el cliente y el server calculan `admin || permiso`. `GET /api/me` devuelve los permisos guardados, no una copia "efectiva", para no confundir el modelo.

### 3. API administrativa

Router nuevo `server/admin-api.js`, montado desde `http-auth.js` **antes** del 404 JSON de `/api/`. Todas las respuestas llevan `Cache-Control: no-store` y `nosniff`.

Gate `requireAdmin`:

1. `currentSession(req)`; error de DB → `503 unavailable`.
2. Sin sesión → `401 unauthorized`.
3. `session.user.role !== 'admin'` → `403 admin_required`.
4. Devuelve `{ session, user }`.

| Método | Ruta | Body | Éxito | Errores |
|---|---|---|---|---|
| `GET` | `/api/admin/users` | — | `200 {users:[...]}` | `401/403/429/503` |
| `POST` | `/api/admin/users` | `{username,password,role?,skin?,active?,permissions?}` | `201 {user}` | `400/409/413/415/422/429/503` |
| `PATCH` | `/api/admin/users/:id` | `{skin?,role?,active?,permissions?}` | `200 {user}` | `400/404/409/413/415/422/429/503` |
| `POST` | `/api/admin/users/:id/password` | `{password}` | `200 {ok:true,sessionsRevoked,self?}` | `400/404/413/415/422/429/503` |
| `DELETE` | `/api/admin/users/:id` | — | `204` | `401/403/404/409/429/503` |
| `GET` | `/api/admin/audit` | `?limit=50` | `200 {entries:[...]}` | `400/401/403/429/503` |
| `GET` | `/admin` | — | `200 admin.html` | `302 /login`, `302 /lobby` |

Forma del usuario de administración (nunca `passwordHash`):

```json
{
  "id": 7,
  "username": "ana",
  "role": "user",
  "skin": "small",
  "active": true,
  "permissions": { "bot_ignore": true, "fly": false, "instant_break": false },
  "createdAt": "2026-11-12T18:00:00.000Z",
  "updatedAt": "2026-11-12T18:00:00.000Z"
}
```

Errores (`{error, message}` con mensaje en español):

| Código | HTTP | Cuándo |
|---|---|---|
| `invalid_request` | 400 | JSON inválido, body vacío, `:id` no numérico, `limit` inválido |
| `unauthorized` | 401 | Sin sesión |
| `admin_required` | 403 | Sesión de rol `user` |
| `user_not_found` | 404 | `:id` inexistente |
| `username_taken` | 409 | Alta con username duplicado (cualquier capitalización) |
| `guard_self_action` | 409 | Desactivarse, borrarse o degradarse a sí mismo |
| `guard_last_admin` | 409 | Dejar el sistema sin admin activo |
| `invalid_request` | 413/415 | Body >8 KB / Content-Type no JSON |
| `invalid_username` | 422 | No cumple `^[A-Za-z0-9_-]{3,16}$` |
| `username_reserved` | 422 | Lista de reservados (misma del registro) |
| `invalid_password` | 422 | Fuera de 8–128 |
| `invalid_skin` | 422 | Fuera del catálogo de jugador |
| `invalid_role` | 422 | Distinto de `user`/`admin` |
| `invalid_permissions` | 422 | Clave desconocida o valor no booleano |
| `username_immutable` | 422 | `PATCH` con `username` |
| `invalid_field` | 422 | Campo no editable (`password`, `id`, etc.) |
| `rate_limited` | 429 | Bucket admin agotado |
| `unavailable` | 503 | Base caída |

Notas de contrato:

- `POST /api/admin/users` aplica las mismas validaciones que el registro (orden: username → reservado → contraseña → rol/skin/permisos) **antes** de derivar `scrypt`, y no crea sesión ni cookie.
- `PATCH` valida que el body tenga al menos un campo editable y que ninguno sea desconocido. `username` presente → `username_immutable` aunque sea igual al actual.
- `POST .../password`: si el target es el actor, la respuesta agrega `self:true` y `Set-Cookie` con la cookie de sesión vencida; el admin vuelve a `/login`.
- `DELETE` devuelve `204` sin cuerpo; la auditoría se inserta en la misma transacción antes del `DELETE`.
- `GET /api/admin/audit`: `limit` default 50, acotado a `[1,200]`; un valor no numérico → `400`, un valor fuera de rango se acota (no rompe).
- **CSRF**: se reutilizan `sameOrigin` (Origin/Referer/Sec-Fetch-Site) y `readJson` (Content-Type JSON + 8 KB). No se agrega token CSRF.
- **Rate limit**: bucket propio `admin` por IP, `ADMIN_RATE_CAPACITY=20` y `ADMIN_RATE_REFILL_PER_SEC=0.5` (1 acción cada 2 s), con knobs por env. Las rutas de alta y password usan además la cota global de derivaciones `scrypt` (2 concurrentes) que ya comparten login y registro; un `429` no deriva.
- **Logging**: cada acción exitosa una línea acotada (`admin ana → user.create beto`), sin passwords, hashes ni tokens. Los `429` se loguean como máximo cada 10 s, igual que auth.

### 4. Guardas de integridad y concurrencia

Toda mutación administrativa corre en una transacción del store:

```
withTransaction(tx):
  SELECT pg_advisory_xact_lock(hashtext('minicraft:admin-guards'))
  target = tx.getUserById(targetId)          // null → 404
  if targetId === actorId && (delete || active === false || role === 'user')
      → guard_self_action
  if (delete || active === false || role === 'user') && target.role === 'admin' && target.active
      remaining = tx.countActiveAdmins({ excludeId: targetId })
      if remaining === 0 → guard_last_admin
  aplicar cambios
  tx.insertAudit({ actorUserId, targetUserId, action, details })
  revocar sesiones si corresponde
  COMMIT
```

- **Self**: degradar, desactivar o borrar la propia cuenta se rechaza siempre, aun con otros admins (evita autolockout accidental).
- **Último admin**: se cuenta `role='admin' AND active=true` excluyendo al target; si el resultado es `0`, se rechaza. Cubre degradar, desactivar y borrar. Con dos admins activos, la operación pasa y queda uno.
- **Carrera**: el advisory lock serializa las mutaciones administrativas entre réplicas; dentro de una instancia el event loop ya serializa. `MemoryStore` implementa `withTransaction` con snapshot/rollback (los tests no tienen concurrencia real de hilos).
- **Auditoría de rechazos**: si una guarda rechaza, la transacción no muta nada y se escribe `user.guard_rejected` en una llamada aparte (committed), con `{reason, attempted:{...}}` sin datos sensibles.
- **Orden de errores**: 404 antes que guardas; self antes que last-admin (código más específico para la UI).

### 5. Revocación de sesiones y cierre de sockets

Reglas por acción:

| Acción | Revoca sesiones | Cierra sockets | Aplica en caliente |
|---|---|---|---|
| `PATCH` con cambio de `role` | Sí (todas) | Sí | — |
| `PATCH` con `active:false` | Sí (todas) | Sí | — |
| `PATCH` con `active:true` | No | No | — |
| `PATCH` solo `skin`/`permissions` | No | No | `perm` (permisos) / próxima entrada (skin) |
| `POST .../password` | Sí (todas) | Sí | — |
| `DELETE` | Cascada | Sí | — |

Implementación: el router admin recibe los hooks que ya existen en `createAuthRouter`: `onSessionRevoked(userId)` (llama a `app.closeUserSockets`) y uno nuevo `onPermissionsChanged(userId, permissions)`. La revocación se hace dentro de la transacción (`tx.revokeUserSessions`) y los hooks se ejecutan **después del commit**, para no cerrar sockets de una operación que terminó en rollback.

`closeUserSockets` ya hace `removePlayer` + `leave` + `close(4001)` (`app.js:271-280`); se reutiliza sin cambios.

### 6. Protocolo WebSocket: forma de los flags

Se elige **publicar el objeto `permissions` completo (materializado) en `welcome.user`** y **flags derivados y compactos en el roster**:

```jsonc
// welcome.user (aditivo)
"user": {
  "username": "ana", "role": "user", "skin": "small",
  "permissions": { "bot_ignore": true, "fly": false, "instant_break": false }
}

// welcome.players[i] / join (aditivo, solo cuando true)
{ "id": 12, "name": "ana", "mode": "player", "botIgnore": true, ... }

// cambio en caliente (aditivo)
{ "t": "perm", "id": 12, "permissions": { "bot_ignore": false, "fly": true, "instant_break": false } }
```

Por qué:

- **`permissions` completo en `welcome.user`**: un solo objeto, sin flags sueltos que se desincronicen, y el cliente nuevo calcula `admin || permiso`. El nombre del campo coincide con `/api/me` para que el mismo normalizador sirva en ambos caminos.
- **`botIgnore` derivado en el roster**: el bot solo necesita saber a quién no atacar; mandar el objeto completo por cada jugador infla cada `join`/`welcome`. Es aditivo y los clientes viejos lo ignoran.
- **`perm`**: evita revocar sesiones por un cambio de permisos. Se difunde a todos porque `bot_ignore` es observable por el bot y los clientes pueden actualizar su propia capacidad; no contiene secretos. El server actualiza **primero** su copia de `p.permissions` y después difunde, para que el descarte del `hit` use el valor nuevo aunque el frame llegue tarde.
- **El cliente nunca declara permisos**: `resolveIdentity` los toma de `ws.auth.permissions` (leídos de la fila de la sesión) y el `hello` se ignora.
- **Compatibilidad**: un cliente/bot viejo ignora `permissions`, `botIgnore` y `perm`; el server sigue mandando los campos históricos intactos.

**Marcado del socket del bot**: el gate ya devuelve `kind:'bot'`; `resolveIdentity` sigue produciendo `bot:true`, `admin:false`, `mode:'player'` y `permissions:{}`. El handler de `hit` usa `me.bot === true` (no el nombre ni el skin).

**Descarte del `hit` del bot** (defensa en profundidad), en `app.js` antes de retransmitir:

```js
} else if (m.t === 'hit') {
  const target = [...players.entries()].find(([, p]) => p.id === m.id);
  if (target && me.bot === true && target[1].permissions.bot_ignore === true) {
    warnRateLimited('bot: hit descartado por bot_ignore');
    return;                     // no hay phit ni hitok
  }
  // ...relay histórico con clamp de daño 6
}
```

No se responde `hitok` para no dar feedback falso a un bot manipulado; el bot legítimo nunca llega acá porque excluye a los protegidos. Un `hit` de un usuario de cookie contra un `bot_ignore` **no** se descarta: el permiso es solo contra el cazador.

### 7. Aplicación de `fly` e `instant_break` en el cliente

`index.html` agrega un normalizador local y dos helpers:

```js
let myPermissions = { bot_ignore:false, fly:false, instant_break:false };
const canFly = () => isAdmin() || myPermissions.fly === true;
const canInstantBreak = () => isAdmin() || myPermissions.instant_break === true;
```

Cambios acotados:

- **Vuelo**: `KeyF` (`:2180`), `toggleFly()` (`:3971`) y el botón/label (`:3962-3966`) usan `canFly()`. `player.fly` y la física de vuelo no cambian. El daño de caída, la inmunidad del admin y la regen **siguen** atados a `isAdmin()` (fuera de alcance).
- **Rotura instantánea**: `onLeftDown()` (`:3394`), el intervalo de repetición (`:3429-3430`) y el early-return de `tickBreak` (`:3434`) usan `canInstantBreak()`. La ruta de `doBreak()` es la misma del admin, así que `BEDROCK` y el raycast se comportan igual.
- **Perfil**: al cargar, `myPermissions = normalize(profile.permissions)`; `welcome.user.permissions` reafirma (defensivo). El frame `perm` con `id === myId` actualiza `myPermissions`; si se revoca `fly` y `player.fly` está activo, se pone `player.fly = false`, `player.vel.y = 0` y se avisa por toast.
- **Límite documentado**: el movimiento y el picado son client-authoritative. El server **no** puede impedir que un cliente modificado vuele o rompa rápido; solo valida `edit` (rango 0..207/0..39, `v` 0..64, bedrock) y `mv` como hoy. Este change no promete anti-cheat y lo deja escrito en `README.md` y en `player/permissions`.

### 8. Bot cazador

- `normPlayer` agrega `botIgnore: p.botIgnore === true`.
- `isPrey` pasa a `p.mode !== 'admin' && p.dead === 0 && p.botIgnore !== true && p.id !== self.id`.
- `handle('perm')`: si `players.has(m.id)`, actualiza `p.botIgnore = m.permissions?.bot_ignore === true`; no hace falta limpiar `lastHitAt` (el siguiente tick elige otra presa). Si el protegido era el objetivo, `nearestPrey` lo salta.
- `welcome` y `join` ya pasan por `normPlayer`, así que heredan el flag sin código extra.
- El bot mantiene su contrato: nunca ataca admins, no manda `edit`, es inmune y no depende de `BOT_TOKEN` para esta lógica. Un server viejo sin el flag manda `undefined` → no protegido (comportamiento anterior).

### 9. Auditoría

Acciones (`action`) y `details`:

| `action` | `details` |
|---|---|
| `user.create` | `{username, role, skin, permissions}` |
| `user.update` | `{changes:{skin:[a,b], role:[a,b], active:[a,b]}}` (solo campos cambiados) |
| `user.permissions` | `{before:{...}, after:{...}}` |
| `user.password` | `{passwordChanged:true, sessionsRevoked:n}` |
| `user.activate` / `user.deactivate` | `{active:true/false, sessionsRevoked:n}` |
| `user.delete` | `{username, role, skin}` |
| `user.guard_rejected` | `{reason:"guard_self_action"\|"guard_last_admin", attempted:{role?,active?,delete?}}` |

Todas las entradas agregan `actorUsername` y `targetUsername` como snapshots (no sensibles: son el nombre público de la cuenta) para que el historial siga legible después de un borrado. Nunca se guardan contraseñas, hashes, tokens ni cuerpos completos.

`GET /api/admin/audit` devuelve:

```json
{
  "entries": [
    {
      "id": 42,
      "action": "user.permissions",
      "actor":  { "id": 1, "username": "admin" },
      "target": { "id": 7, "username": "ana" },
      "details": { "before": { "fly": false }, "after": { "fly": true } },
      "createdAt": "2026-11-12T18:05:00.000Z"
    }
  ]
}
```

Con target borrado, `target.id` es `null` y `target.username` sale del snapshot; la UI lo indica como "cuenta eliminada".

### 10. UI: página `/admin` y acceso desde el lobby

**Archivo nuevo `admin.html`**, autocontenido, sin build, sin Three.js ni assets externos. Misma identidad visual y tema que login/registro/lobby: script inline que aplica `data-theme` desde `mc-theme` antes del CSS, toggle con `aria-pressed`, `prefers-reduced-motion`.

Estructura:

- **Header**: logo, "Volver al lobby", toggle de tema, "Cerrar sesión".
- **Panel Usuarios**: botón "Nueva cuenta" y tabla responsive con columnas Usuario, Rol, Estado, Aspecto, Permisos, Acciones. En móvil la tabla colapsa en tarjetas por fila (CSS grid, sin JS de layout).
- **Acciones por fila**: Editar, Contraseña, Activar/Desactivar, Borrar. En la propia fila del admin, Desactivar/Degradar/Borrar se muestran deshabilitados con explicación (la API igual valida).
- **Diálogos nativos `<dialog>`**: alta/edición con username (solo lectura en edición + leyenda "El nombre de usuario no se edita"), contraseña (solo en alta), rol, aspecto y tres checkboxes de permisos con etiquetas "El cazador lo ignora", "Vuelo", "Rotura instantánea".
- **Reset de contraseña**: diálogo con nueva contraseña + repetición, aviso de "se cerrarán todas sus sesiones"; si es la propia cuenta, aviso y redirect a `/login` al terminar.
- **Borrado**: diálogo destructivo que exige escribir el username exacto; botón deshabilitado hasta que coincida; texto "Esta acción es definitiva".
- **Auditoría**: panel con las últimas 50 entradas, fecha local (`Intl.DateTimeFormat('es-AR')`), actor → target, acción traducida y detalle resumido; los `guard_rejected` se muestran con estilo de advertencia. Se refresca tras cada acción.
- **Estado**: `aria-live="polite"` para "guardando…", éxito y errores; `role="status"`/`role="alert"`; foco devuelto al botón que abrió el diálogo; Escape cierra sin ejecutar. Errores por código con mensajes en español (incluidos `guard_*`).
- **Datos**: al cargar, `fetch('/api/me')`; si `role !== 'admin'` → `location.replace('/lobby')` (el gate real es el server, esto es defensa/UX). Luego `GET /api/admin/users` y `GET /api/admin/audit`.

**Lobby**: se agrega `<a id="adminLink" href="/admin" hidden>Administración</a>` en el header. El JS que ya pide `/api/me` lo muestra solo si `user.role === 'admin'`; nunca se renderiza antes del perfil, así un usuario común no ve el acceso ni por un instante.

**Sin frameworks**: la página usa `fetch`, `dialog.showModal()`, delegación de eventos y plantillas `innerHTML` con `textContent` para datos del server (evita XSS por username). Las etiquetas de skin reutilizan las ocho en español.

### 11. Tests TDD por capa

| Archivo | Capa | Casos |
|---|---|---|
| `server/test/permissions.mjs` | unit | allowlist, claves desconocidas, no booleanos, array/null, canónico `{}`, materialización de las tres claves, `canFly`/`canInstantBreak`/`botIgnores` con rol admin |
| `server/test/admin.mjs` | HTTP + MemoryStore | 401/403, listado sin hash, alta válida/duplicada/reservada/rol/skin/permisos, `PATCH` username inmutable y campos inválidos, skin/rol/active, permisos 422, guardas self/last-admin con dos admins, password revoca sesiones, delete 204/404, auditoría (acción + rechazo + límite), 429 sin efectos, Origin/Content-Type/8 KB, `no-store`, gate de `/admin` (302 login/lobby, 200 admin) |
| `server/test/admin-db.mjs` | Postgres | migración 002 idempotente, default `{}` y CHECK de objeto, roundtrip JSONB, `admin_audit` con SET NULL tras borrar, cascada de sesiones, `countActiveAdmins`, carrera de degradaciones (uno pasa/uno 409), listado sin `password_hash` |
| `server/test/admin-ws.mjs` | e2e WS | `welcome.user.permissions`, `botIgnore` en roster/join, `perm` en caliente, permisos del `hello` ignorados, bot marcado, `hit` del bot descartado contra `bot_ignore` y retransmitido contra otro, `hit` de cookie no se descarta, rol/desactivación/password cierran el socket |
| `server/test/bot-cazador.mjs` (ampliado) | unit bot | `normPlayer` con botIgnore, exclusión en `isPrey`/`nearestPrey`, `perm` habilita/revoca, sin flag = comportamiento anterior |
| `server/test/static.mjs` (ampliado) | estático | existe `admin.html`, `noindex`, tema con `mc-theme`, `data-theme`, toggle accesible, ids de tabla/diálogos, confirmación por username, link `#adminLink` oculto por defecto, `/admin` cableado, sin `<script src=` ni framework, textos en español |
| `server/test/http-auth.mjs` / `ws-auth.mjs` (regresión) | HTTP/WS | `publicUser` con `permissions`; el resto del contrato del change 1 sigue verde |

Cadena de `server/package.json`: `permissions.mjs` primero, `admin.mjs` después de `http-auth.mjs`, `admin-ws.mjs` junto a `ws-auth.mjs`, `admin-db.mjs` junto a `auth-db.mjs`, y `static.mjs` al final.

### 12. CI, Docker y documentación

- **CI**: sin servicios nuevos. `admin-db.mjs` respeta `TEST_DATABASE_URL` y `REQUIRE_DB_TESTS=1` igual que `auth-db.mjs`; en local sin DB se omite con aviso.
- **Docker**: `Dockerfile` suma `COPY admin.html ./`. La migración 002 ya viaja con `COPY server/migrations ./migrations`. No hay variables obligatorias nuevas; los knobs `ADMIN_RATE_*` son opcionales.
- **Docs**: `README.md` (panel `/admin`, permisos y su alcance real, auditoría, límites de `fly`/`instant_break`, reset de contraseña) y `server/README.md` (endpoints, códigos, migración 002). `AGENTS.md` solo si cambia el flujo de comandos (no debería).
- **Compatibilidad con `user-tool`**: sigue funcionando; las cuentas creadas por CLI quedan con `permissions = '{}'` por default.

## Risks / Trade-offs

- [Risk] **Carrera del último admin** entre dos pedidos simultáneos. → Advisory lock + transacción + test de concurrencia en `admin-db.mjs`.
- [Risk] **Auditoría no inmutable a nivel DB**. → Append-only por API/código, sin rutas de update/delete; se documenta que un operador con SQL directo puede alterarla. Un trigger se descartó por el `ON DELETE SET NULL`.
- [Risk] **`fly`/`instant_break` son client-authoritative**. → Se documenta el límite; `bot_ignore` sí tiene defensa server-side. No se promete anti-cheat.
- [Risk] **Permisos desconocidos por edición manual de DB**. → La lectura los descarta y la escritura los rechaza; el comportamiento queda acotado a la allowlist.
- [Risk] **`perm` en caliente y varias réplicas**. → No hay bus de eventos; el compose corre una instancia. Con varias réplicas, el frame solo llega a los sockets de la instancia que atendió la acción; el estado se corrige al reconectar. Documentado.
- [Risk] **Borrar el último admin por fuera de la API**. → `user-tool` no aplica las guardas; se documenta que la CLI es operación de emergencia y la API/UI son el camino normal. La DB no puede expresar "al menos un admin" sin triggers.
- [Risk] **Rate limit por IP**. → Detrás de un proxy sin `TRUST_PROXY=1` todos comparten IP; el panel es solo-admin y el daño máximo es bloquear acciones temporalmente.
- [Risk] **Reset de la propia contraseña cierra la sesión del admin**. → Comportamiento explícito, avisado en la UI y con `self:true`/cookie limpia en la respuesta.
- [Risk] **Tabla de auditoría crece sin límite**. → Índices por fecha; la UI solo pide 50. Una purga/exportación queda para un change operativo.
- [Risk] **`welcome.user.permissions` y roster más grandes**. → Tres booleanos por usuario y un flag por jugador; impacto despreciable.
- [Risk] **Regresión del change 1** en login/sesión/WS. → El cambio es aditivo; la suite existente (`auth.mjs`, `http-auth.mjs`, `ws-auth.mjs`, `protocol.mjs`, `bot-cazador.mjs`) sigue en la cadena y debe quedar verde.

## Migration Plan

1. **RED**: escribir `permissions.mjs`, `admin.mjs`, `admin-db.mjs`, `admin-ws.mjs` y las ampliaciones de `bot-cazador.mjs`/`static.mjs`; verlos fallar.
2. **Esquema y store**: migración 002, `permissions.js`, métodos de store en `store-pg.js` y `memory-store.mjs` (permisos, `withTransaction`, `countActiveAdmins`, `deleteUser`, auditoría).
3. **API**: `admin-api.js`, gate `requireAdmin`, validaciones, guardas, rate limit y hooks; montaje en `http-auth.js` y `onPermissionsChanged` en `app.js`.
4. **Enforcement**: `ws-auth.js`/`app.js` con permisos en `ws.auth`/`welcome`/roster, frame `perm`, marcado del bot y descarte de `hit`.
5. **Cliente y bot**: `index.html` (`canFly`/`canInstantBreak`/`perm`), `bot/cazador.js` (`botIgnore`/`perm`), `admin.html` y link del lobby.
6. **Auditoría/UI**: sección de auditoría y refresco; documentación.
7. **Suite completa**: `cd server && npm test` verde sin DB; con `TEST_DATABASE_URL` también la integración.
8. **Docker**: `ADMIN_PASSWORD=<clave> BOT_TOKEN=<token> docker compose up --build -d`, probar `/admin`, permisos y bot; esperar aprobación explícita del usuario. **No** se commitea, pushea ni archiva antes.
9. **Rollback**: volver a la imagen anterior es seguro; la columna `permissions` y `admin_audit` quedan sin uso. La migración es forward-only: no se revierte el esquema.

## Open Questions

- ¿El panel debe permitir resetear la contraseña propia o conviene exigir un flujo de autoservicio? Se decidió permitirlo con cierre de sesión avisado; un cambio futuro puede moverlo a `/api/me/password`.
- ¿La auditoría necesita retención/purga configurable? Fuera de alcance; hoy se conserva indefinidamente con índices por fecha.
- ¿Los permisos deben poder asignarse en bloque o por defecto a nuevos usuarios? Fuera de alcance; el alta permite elegirlos uno por uno.
- ¿Un `bot_ignore` debería además excluir al usuario de criaturas o de otros bots futuros? Fuera de alcance (permisos de criaturas explícitamente descartados).

## Next Changes

- **Change 3 — panel y control de bots:** panel de bots, bots personalizados por usuario, control de modo/estado desde la UI admin y el **Mundo Infinito** real con su selección habilitada en el lobby. La auditoría y la página `/admin` de este change quedan como base para sumar esas secciones.
