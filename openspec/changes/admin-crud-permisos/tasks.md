# Tasks

> **Alcance:** sólo planificación. La implementación es TDD estricto en el apply: cada bloque `RED` se escribe y se ve fallar antes del `GREEN`. Nada de código de producción en esta fase.
>
> **Dependencias:** 1 → 2 → 3 → 4 → 5 → 6 (RED en ese orden) y 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 (GREEN). El bloque 16 depende de todo lo anterior. Los bloques 3–6 pueden escribirse en paralelo entre sí una vez cerrado el 1; los GREEN 7–9 son la base de 10–14.

## 1. RED — modelo de permisos (unit)

- [x] 1.1 Crear `server/test/permissions.mjs`: `normalizePermissions` acepta `{bot_ignore:true,fly:false,instant_break:true}` y guarda solo las claves `true`; rechaza clave desconocida (`god_mode`), valor no booleano (`"si"`, `1`, `null`), arrays, `null` y strings; `{}` es válido y canónico; `materializePermissions({fly:true})` devuelve las tres claves con `false` por defecto; `canFly`/`canInstantBreak` devuelven `true` para `role='admin'` aunque el mapa esté vacío y `botIgnores` solo con `bot_ignore:true`. Verificación: `cd server && node test/permissions.mjs` falla porque el módulo no existe.
- [x] 1.2 Agregar `permissions.mjs` al inicio de `server/package.json` → `scripts.test`. Verificación: la cadena reporta el fallo esperado.

## 2. RED — API administrativa (HTTP + MemoryStore)

- [x] 2.1 Crear `server/test/admin.mjs` con `startApp` + `MemoryStore` y tres cuentas sembradas (`admin`, `root` admin, `ana` user): `GET /api/admin/users` sin cookie → `401`, con `ana` → `403 admin_required`, con admin → `200` y campos `id/username/role/skin/active/permissions/createdAt/updatedAt`, sin `passwordHash` ni `password_hash`. Verificación: falla porque las rutas no existen.
- [x] 2.2 En `admin.mjs`: alta válida → `201 {user}` sin `Set-Cookie`; username duplicado con otra capitalización → `409 username_taken`; reservado (`admin`) → `422 username_reserved`; username inválido → `422 invalid_username`; contraseña de 7 → `422 invalid_password`; `role:'superadmin'` → `422 invalid_role`; `skin:'robot'` → `422 invalid_skin`; `permissions:{god_mode:true}` → `422 invalid_permissions` con detalle; body con `role` inválido no crea cuenta. Verificación: falla.
- [x] 2.3 En `admin.mjs`: `PATCH` con `{skin:'giant',role:'admin',active:true}` aplica; `{username:'otro'}` (y el mismo username) → `422 username_immutable` sin cambios; `{password:'...'}` → `422 invalid_field`; `{}` → `400 invalid_request`; `:id` inexistente → `404 user_not_found`; `:id` no numérico → `400`; `permissions` válidos reemplazan el mapa y `{}` lo vacía. Verificación: falla.
- [x] 2.4 En `admin.mjs`: guardas con dos admins activos — un admin se degrada/desactiva/borra a sí mismo → `409 guard_self_action`; degradar/desactivar/borrar al único admin activo restante → `409 guard_last_admin`; con dos admins, degradar al otro → `200` y queda uno; ninguna operación rechazada cambia la DB. Verificación: falla.
- [x] 2.5 En `admin.mjs`: `POST /api/admin/users/:id/password` con contraseña válida → `200 {ok:true,sessionsRevoked}` y el login del target con la clave nueva funciona mientras la vieja da `401`; contraseña corta → `422 invalid_password` sin revocar; reset de la propia cuenta → `self:true` + `Set-Cookie` de limpieza. Verificación: falla.
- [x] 2.6 En `admin.mjs`: `DELETE` de una cuenta con sesión → `204`, login posterior `401`, segunda llamada `404`; borrar al propio admin → `409 guard_self_action`; borrar el último admin → `409 guard_last_admin`. Verificación: falla.
- [x] 2.7 En `admin.mjs`: `GET /api/admin/audit` con admin devuelve las entradas de crear/editar/permisos/password/activar/desactivar/borrar en orden descendente; un rechazo por guarda deja `user.guard_rejected`; `limit=10` acota; `limit=0`/no numérico responde `400` o acota sin crash; `ana` → `403`; ninguna entrada contiene contraseña, hash ni token. Verificación: falla.
- [x] 2.8 En `admin.mjs`: `Origin` ajeno → `403`; `Content-Type: text/plain` → `415`; body > 8 KB → `413`; ráfaga que agota el bucket admin → `429` sin efectos; todas las respuestas de `/api/admin/*` llevan `Cache-Control: no-store`; `GET /admin` sin sesión → `302 /login`, con `ana` → `302 /lobby`, con admin → `200` y HTML del panel. Verificación: falla.

## 3. RED — integración Postgres

- [x] 3.1 Crear `server/test/admin-db.mjs` gateado por `TEST_DATABASE_URL` (y `REQUIRE_DB_TESTS=1` obliga): correr `runMigrations` dos veces es idempotente y deja `users.permissions` con default `'{}'`; el `CHECK` rechaza un `permissions` que no sea objeto; roundtrip JSONB con `{bot_ignore:true}`. Verificación: falla porque la migración 002 no existe.
- [x] 3.2 En `admin-db.mjs`: insertar auditoría, borrar el usuario target y verificar que la entrada sobrevive con `target_user_id NULL` y el snapshot en `details`; borrar un usuario elimina sus `sessions` por cascada; `countActiveAdmins({excludeId})` cuenta solo `role='admin' AND active`; `listUsers()` devuelve `permissions` y no `password_hash`. Verificación: falla.
- [x] 3.3 En `admin-db.mjs`: carrera de guardas — con dos admins, dos `PATCH` simultáneos que degradan a cada uno deben dejar exactamente un admin activo y un `409 guard_last_admin`; el advisory lock serializa. Verificación: falla.
- [x] 3.4 Agregar `admin-db.mjs` a la cadena inmediatamente después de `auth-db.mjs`. Verificación: en CI corre; sin `TEST_DATABASE_URL` imprime "omitida" y sale 0.

## 4. RED — WebSocket y enforcement

- [x] 4.1 Crear `server/test/admin-ws.mjs` (fixture en proceso): `welcome.user.permissions` trae las tres claves y refleja los permisos guardados; un `hello` con `permissions:{fly:true}` no habilita nada a un usuario sin el permiso. Verificación: falla.
- [x] 4.2 En `admin-ws.mjs`: `welcome.players` y `join` incluyen `botIgnore:true` solo para protegidos; un `perm` tras cambiar permisos llega con el objeto nuevo y actualiza la capacidad sin reconectar. Verificación: falla.
- [x] 4.3 En `admin-ws.mjs`: el bot con `BOT_TOKEN` queda `bot:true`; un `hit` del bot contra un usuario con `bot_ignore` no produce `phit` ni baja la vida; contra un usuario sin el permiso sí retransmite `phit`; un `hit` de un usuario de cookie contra un `bot_ignore` sí se retransmite. Verificación: falla.
- [x] 4.4 En `admin-ws.mjs`: cambiar el rol, desactivar, resetear contraseña y borrar cierran el WebSocket del afectado (código `4001`, `leave` difundido); reactivar no cierra nada; cambiar solo permisos no cierra. Verificación: falla.
- [x] 4.5 Agregar `admin-ws.mjs` a la cadena junto a `ws-auth.mjs`. Verificación: falla por comportamiento, no por archivo ausente.

## 5. RED — bot cazador y cliente

- [x] 5.1 Ampliar `server/test/bot-cazador.mjs`: `normPlayer` lee `botIgnore`; `isPrey`/`nearestPrey` excluyen al protegido; con `botIgnore:true` en `welcome` y en `join` no hay `hit`; un frame `perm` con `botIgnore:true` abandona la presa y con `false` la vuelve a habilitar; sin el flag el comportamiento es el anterior. Verificación: falla.
- [x] 5.2 Ampliar `server/test/static.mjs`: existe `admin.html` con `noindex`, `data-theme`, `mc-theme` leído antes del CSS, toggle `#themeToggle` con `aria-pressed`, labels en español, ids de tabla/diálogos, confirmación de borrado por username, link `#adminLink` con `hidden` en `lobby.html`, ruta `/admin` cableada en el router, sin `<script src=` ni framework. Verificación: falla.
- [x] 5.3 Ampliar `static.mjs`: `index.html` define `canFly`/`canInstantBreak`, usa `canFly()` en el toggle de vuelo y `canInstantBreak()` en la ruta de rotura, y maneja `perm`/`welcome.user.permissions`; el HUD no muestra el id crudo de un permiso. Verificación: falla.
- [x] 5.4 Verificar que la cadena completa arranca en rojo por los motivos esperados (no por sintaxis). Verificación: `cd server && npm test` con fallos descriptivos.

## 6. RED — regresión explícita del change 1

- [x] 6.1 Ampliar `server/test/http-auth.mjs`: login, `/api/me` y registro devuelven `permissions` con las tres claves y nunca `passwordHash`; `PATCH /api/me` con `permissions` no cambia nada. Verificación: falla.
- [x] 6.2 Confirmar que `ws-auth.mjs`, `protocol.mjs`, `auth.mjs` y `auth-db.mjs` siguen verdes con los contratos aditivos (sin modificar sus asserts salvo los nuevos campos). Verificación: la cadena existente no se rompe.

## 7. GREEN — migración y store

- [x] 7.1 Crear `server/migrations/002-admin-permissions.sql`: `ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb`; `CHECK (jsonb_typeof(permissions) = 'object')` idempotente con `DO $$ ... EXCEPTION WHEN duplicate_object`; tabla `admin_audit` con FKs `ON DELETE SET NULL`, `action` acotado, `details` objeto; índices por fecha/actor/target y `users_active_admin_idx` parcial. Verificación: `admin-db.mjs` aplica dos veces sin error.
- [x] 7.2 Actualizar `server/store-pg.js`: `mapUser`/`mapPublicUser`/`getSessionByTokenHash` incluyen `permissions` materializado; `createUser`/`insertUser` aceptan `permissions` con default `{}`; `listUsers` lo devuelve; nuevos `updateAdminUser`, `deleteUser`, `countActiveAdmins`, `withTransaction`, `insertAudit`, `listAudit`. Todo parametrizado. Verificación: `admin-db.mjs` verde.
- [x] 7.3 Actualizar `server/test/support/memory-store.mjs` con la misma interfaz: `permissions` por defecto, `updateAdminUser`, `deleteUser` (borra sesiones), `countActiveAdmins`, `withTransaction` con snapshot/rollback, `insertAudit`/`listAudit` (target borrado conserva snapshot). Verificación: `admin.mjs` puede ejecutar sus casos.
- [x] 7.4 Verificar que `server/user-tool.mjs` sigue funcionando sin cambios (los usuarios nuevos quedan con `permissions='{}'`). Verificación: `auth-db.mjs` y `migrate.mjs` verdes.

## 8. GREEN — modelo de permisos

- [x] 8.1 Crear `server/permissions.js`: `PERMISSIONS`, `normalizePermissions`, `materializePermissions`, `canFly`, `canInstantBreak`, `botIgnores`, `adminUserView` (proyección sin hash). Sin dependencias. Verificación: `permissions.mjs` verde.
- [x] 8.2 Integrar la proyección en `http-auth.js` (`publicUser` con `permissions`) y en `store-pg.js` (usuario de admin), sin duplicar lógica de materialización. Verificación: `permissions.mjs` + `http-auth.mjs` verdes.

## 9. GREEN — API administrativa, guardas y auditoría

- [x] 9.1 Crear `server/admin-api.js` con `createAdminRouter({store, env, now, log, warn, onSessionRevoked, onPermissionsChanged})`: `requireAdmin`, lectura JSON estricta, `sameOrigin`, 8 KB, `Cache-Control: no-store`, helpers de error y parseo de `:id`/`limit`. Verificación: casos 2.1/2.8 verdes.
- [x] 9.2 Implementar `GET /api/admin/users` y `GET /api/admin/audit` (limit 1..200, default 50, join con snapshots). Verificación: 2.1 y 2.7 verdes.
- [x] 9.3 Implementar `POST /api/admin/users` con validaciones del registro (username, reservados, password, rol, skin, permisos) antes de hashear, `scrypt` con la cota global y auditoría `user.create`. Verificación: 2.2 verde.
- [x] 9.4 Implementar `PATCH /api/admin/users/:id` con allowlist de campos, `username_immutable`, `invalid_field`, validación de role/skin/permissions, auditoría por tipo (`user.update`, `user.permissions`, `user.activate`, `user.deactivate`) y hook de permisos en caliente. Verificación: 2.3 y 4.2 verdes.
- [x] 9.5 Implementar guardas transaccionales (`withTransaction` + advisory lock + conteo de admins) para self y último admin, con auditoría `user.guard_rejected` fuera de la transacción rechazada. Verificación: 2.4 y 3.3 verdes.
- [x] 9.6 Implementar `POST .../password` (hash antes de la transacción, update + revoke, `self` + cookie limpia) y `DELETE` (auditoría dentro de la transacción, borrado, cascada). Verificación: 2.5, 2.6 y 4.4 verdes.
- [x] 9.7 Agregar el bucket `admin` a `server/rate-limit.js` (`ADMIN_RATE_CAPACITY=20`, `ADMIN_RATE_REFILL_PER_SEC=0.5`) y exponer la cota de derivaciones compartida para alta/password; aplicar `429` antes de cualquier efecto. Verificación: 2.8 y `rate-limit.mjs` verdes.
- [x] 9.8 Montar el router en `server/http-auth.js` antes del 404 JSON y agregar `GET /admin` con gate (sin sesión → `/login`, `user` → `/lobby`, admin → `admin.html`). Verificación: 2.8 y `static.mjs` verdes.

## 10. GREEN — enforcement en el servidor

- [x] 10.1 `server/ws-auth.js`: incluir `permissions` materializados en `ws.auth` para `kind:'user'` (leyendo la fila de la sesión) y `{}` para el bot; no leer nada del `hello`. Verificación: 4.1 verde.
- [x] 10.2 `server/app.js`: `resolveIdentity`/`me` guardan `permissions`; `welcome.user` suma `permissions`; roster (`welcome.players`, `join`) agrega `botIgnore` solo si `bot_ignore`; `welcome` y `join` conservan todos los campos actuales. Verificación: 4.1/4.2 verdes.
- [x] 10.3 `server/app.js`: implementar `onPermissionsChanged(userId, permissions)` para actualizar `p.permissions`, `ws.auth.permissions` y difundir `{t:'perm', id, permissions}`; `createAuthRouter` lo recibe como hook. Verificación: 4.2 verde.
- [x] 10.4 `server/app.js`: en `hit`, descartar el golpe cuando `me.bot === true` y el target tenga `bot_ignore`, sin `phit`/`hitok`, con log rate-limited; conservar el clamp de daño 6 y el relay para usuarios de cookie. Verificación: 4.3 verde.
- [x] 10.5 Conectar `onSessionRevoked` a `closeUserSockets` para rol/desactivación/password/borrado y verificar el orden commit → cierre. Verificación: 4.4 verde.

## 11. GREEN — cliente del juego

- [x] 11.1 `index.html`: normalizador local de permisos, `myPermissions`, `canFly()` y `canInstantBreak()`; cargar desde `profile.permissions` y reafirmar desde `welcome.user.permissions`. Verificación: 5.3 verde.
- [x] 11.2 `index.html`: usar `canFly()` en `KeyF`, `toggleFly()`, label/estado del botón y touch de vuelo; mantener `isAdmin()` para daño/regen/inmunidad. Verificación: prueba manual con `fly` y sin `fly`.
- [x] 11.3 `index.html`: usar `canInstantBreak()` en `onLeftDown`, el intervalo de repetición y `tickBreak`, reutilizando `doBreak()`; BEDROCK sigue inviolable. Verificación: prueba manual con y sin `instant_break`.
- [x] 11.4 `index.html`: manejar `{t:'perm'}` propio (desactivar vuelo y avisar si se revoca `fly`) e ignorar `perm` de otros salvo para el roster si hace falta. Verificación: 5.3 y prueba con cambio en caliente.
- [x] 11.5 `lobby.html`: agregar `#adminLink` oculto por defecto y mostrarlo solo si `/api/me` devuelve `role==='admin'`; sin parpadeo para usuarios comunes. Verificación: `static.mjs` + prueba manual.

## 12. GREEN — bot cazador

- [x] 12.1 `bot/cazador.js`: `normPlayer` con `botIgnore`, `isPrey`/`nearestPrey` excluyendo protegidos, y caso `perm` que actualiza el flag. Verificación: 5.1 verde.
- [x] 12.2 Confirmar que el bot sigue sin atacar admins, sin mandar `edit`, inmune a `phit` y que un server viejo sin `botIgnore` mantiene el comportamiento anterior. Verificación: `bot-cazador.mjs` verde completo.
- [x] 12.3 Si el frame `perm` requiere que `bot/index.js` lo enrute al hunter, agregarlo sin cambiar el `hello` ni la reconexión. Verificación: e2e `admin-ws.mjs` con bot real.

## 13. GREEN — página `/admin`

- [x] 13.1 Crear `admin.html` autocontenido: tema (`data-theme`, `mc-theme` antes del CSS, toggle accesible), header con "Volver al lobby", logout y `noindex`; sin scripts externos ni Three.js. Verificación: 5.2 verde.
- [x] 13.2 Implementar carga de `/api/me` (gate y redirect), `GET /api/admin/users` y render de tabla responsive con columnas y acciones; estados de carga, vacío y error con reintento. Verificación: prueba manual y 2.1.
- [x] 13.3 Implementar diálogo de alta con username/contraseña/rol/skin/permisos, validación en cliente y mapeo de errores (`409`, `422`) sin borrar lo escrito. Verificación: 2.2 y prueba manual.
- [x] 13.4 Implementar diálogo de edición con username de solo lectura + leyenda de inmutabilidad, skin/rol/estado/permisos, acciones de self deshabilitadas y mapeo de `409 guard_*`. Verificación: 2.3/2.4 y prueba manual.
- [x] 13.5 Implementar reset de contraseña con confirmación, aviso de sesiones revocadas y redirect a `/login` cuando el target es el propio admin. Verificación: 2.5 y prueba manual.
- [x] 13.6 Implementar borrado con diálogo destructivo que exige el username exacto, botón deshabilitado hasta coincidir, Escape/cancelar sin efectos y aviso de acción definitiva. Verificación: 2.6 y prueba manual.
- [x] 13.7 Implementar panel de auditoría (últimas 50, fecha local, actor → target, acción traducida, detalle, `guard_rejected` destacado, target borrado indicado) y refresco tras cada acción. Verificación: 2.7 y prueba manual.
- [x] 13.8 Accesibilidad y español: foco visible, 44 px, `aria-live`/`role=alert`, foco devuelto al cerrar diálogos, `prefers-reduced-motion`, todos los textos de interfaz en español. Verificación: recorrido con Tab y 5.2.

## 14. Documentación

- [x] 14.1 `README.md`: sección del panel `/admin` (cómo entrar, qué se puede hacer), permisos y su efecto real, límite de `fly`/`instant_break` (client-authoritative), `bot_ignore` con defensa server-side, auditoría y reset de contraseña. Verificación: leerlo desde cero y seguir los pasos.
- [x] 14.2 `server/README.md`: endpoints nuevos, códigos de error, migración 002, knobs `ADMIN_RATE_*` y nota de que `user-tool` sigue siendo la vía de emergencia sin guardas de último admin.
- [x] 14.3 Revisar `AGENTS.md`; actualizarlo solo si el flujo de comandos o la arquitectura cambian (en principio no). Verificación: `git diff` sin ruido innecesario.

## 15. Verificación de la suite

- [x] 15.1 `cd server && npm test` **todo verde** sin DB: unitarios, HTTP, WS, bot, estáticos y los nuevos archivos; la integración de DB se omite con aviso.
- [x] 15.2 `TEST_DATABASE_URL=... REQUIRE_DB_TESTS=1 cd server && npm test` **todo verde**, incluidos `auth-db.mjs` y `admin-db.mjs` (migración 002, JSONB, auditoría, cascada y carrera de guardas).
- [x] 15.3 Verificar que la suite corre en un tiempo razonable y sin warnings de puertos/archivos abiertos; cerrar cualquier app de test que quede viva.

## 16. Verificación en Docker y aprobación explícita

- [ ] 16.1 `ADMIN_PASSWORD=<clave> BOT_TOKEN=<token> docker compose up --build -d` y esperar healthchecks; confirmar que `http://localhost:3000` responde y que la migración 002 se aplicó en los logs.
- [ ] 16.2 Probar el recorrido completo en el navegador: admin entra a `/admin` desde el lobby; un usuario común no ve el link y `/admin` lo redirige; alta de un usuario de prueba; edición de skin/rol/estado; activar/desactivar con cierre de sesión; reset de contraseña (login con la nueva); borrado con confirmación por username; guardas de self y último admin visibles; auditoría con todas las acciones y rechazos.
- [ ] 16.3 Probar los permisos: usuario con `fly` vuela y sin `fly` no; con `instant_break` rompe al instante y sin el permiso pica normal; usuario con `bot_ignore` no es atacado por el bot ni pierde vida, y al revocar el permiso el bot vuelve a perseguirlo. Verificar también que el cambio se aplica sin relogin (`perm`).
- [ ] 16.4 Revisar logs del server y del bot: sin contraseñas, hashes, tokens ni cookies; el descarte de `hit` del bot aparece rate-limited y no inunda la consola.
- [ ] 16.5 Avisar al usuario **qué mirar** y pasar en la **misma línea** el link local y la cuenta admin de esa corrida (`http://localhost:3000 · admin: admin / <clave>`), o `admin deshabilitado` si la corrida no tuvo `ADMIN_PASSWORD` válida. La clave es solo dev local y no se commitea.
- [ ] 16.6 **Esperar aprobación explícita del usuario.** No commitear, no pushear y no archivar antes de esa aprobación.
- [ ] 16.7 Si el usuario pide cambios: corregir, volver a correr 15.1–15.2, levantar Docker otra vez y repetir 16.1–16.6.

## 17. Feedback post-prueba de UI/UX (aplicado)

> Ajustes pedidos por el usuario tras la primera prueba del change. No es un change nuevo: se
> corrigió la implementación y se ampliaron los deltas. El bloque 16 (Docker y aprobación)
> sigue pendiente por diseño.

- [x] 17.1 **Bug del link Administración:** el CSS del lobby fijaba `display: inline-flex` en `a.ghost` y le ganaba al `[hidden]` del atributo, así que un jugador común veía (y ocupaba espacio con) el enlace. Se agregó `[hidden] { display: none !important; }` en `lobby.html` y `admin.html`, sin tocar el toggle de tema. Verificación: `static.mjs` valida la regla, el `inline-flex` al mostrarse y el gate `user.role === 'admin'`.
- [x] 17.2 **Sección Permisos en el lobby:** tarjeta después de "Tu aspecto" con lista accesible, etiquetas en español (`bot_ignore` → "El bot no te ataca", `fly` → "Podés volar", `instant_break` → "Rompes bloques al instante"), "Administrador" para `role=admin` y "Sin permisos especiales." como fallback. Se renderiza desde `user.permissions` de `/api/me` sin romper la página si falta el objeto. Verificación: aserciones estáticas de sección, labels, fallback y llamada en `load()`.
- [x] 17.3 **Autocompletado y guardado de contraseñas:** `login.html` y `register.html` pasan a `autocomplete="off"` en el form y en cada input, sin `name` (el JS usa `id`) y con `data-lpignore`/`data-1p-ignore`/`data-bwignore`/`data-dashlane-ignore`. `admin.html` hace lo mismo en alta, reset y borrado; los campos de contraseña dejan de declarar `new-password`. Se documentó el límite: ningún sitio puede impedir al 100% que el navegador ofrezca guardar.
- [x] 17.4 **Contraseñas actuales:** no se implementó la lectura en texto plano (están hasheadas con `scrypt`). El diálogo de reset muestra "Las contraseñas se guardan hasheadas y no se pueden mostrar. Definí una nueva; se revocan las sesiones." y el alta aclara que no se pueden ver después. No se agregaron endpoints ni campos de lectura ni se tocó el hashing.
- [x] 17.5 Tests estáticos nuevos (bloque 12 de `static.mjs`): link realmente oculto por CSS, sección y mapeo de permisos, `autocomplete="off"` + atributos de ignorado en las tres páginas, ausencia de `username`/`current-password`/`new-password`, nota de reset y ausencia de hashes en el panel. Se actualizaron las aserciones viejas de autocomplete.
- [x] 17.6 Deltas actualizados: `ui/lobby` (link oculto sin espacio + sección de permisos), `ui/admin` (contraseñas hasheadas no mostrables + política de autocompletado) y `player/permissions` (permisos visibles en el lobby). `openspec validate admin-crud-permisos --strict` pasa.
- [x] 17.7 Suite completa sin DB y con Postgres 16 real (`REQUIRE_DB_TESTS=1`): verde, sin regresiones de auth, WS, bot ni estáticos.

## 18. Feedback post-prueba: gestor de contraseñas de Edge

- [x] 18.1 Reproducir el aviso "¿Guardar la contraseña?" de Edge/Chromium sobre el login y documentar que `autocomplete="off"` no lo desactiva.
- [x] 18.2 Los campos de contraseña **nacen como `type="text"` enmascarado** en `login.html`, `register.html` y `admin.html` (nunca `type="password"` en el HTML inicial, que es lo que Edge detecta); `initSecrets` los pasa a `type="password"` solo si el navegador no soporta `-webkit-text-security` (Firefox).
- [x] 18.3 Vaciar la clave **antes del submit** y restaurarla solo si falla (login, registro, alta y reset); tests estáticos de nacimiento `text`/`data-secret`, fallback, ausencia de `type="password"` inicial y limpieza; deltas `ui/lobby` y `ui/admin` actualizados.

## Workflow follow-up

- **Tras la aprobación explícita, lo hace el orquestador** (no este subagente): `docker compose down`, `git add` + commit en español (scope sugerido `feat(admin):`), `git push` a `main`, `openspec archive admin-crud-permisos` y verificación de `git status` limpio.
- Al archivar: las specs nuevas (`security/admin`, `player/permissions`, `ui/admin`) se crean desde sus deltas; `security/auth`, `net/session`, `bots/hunter` y `ui/lobby` se actualizan con los requisitos modificados. Dejar registrado que el panel/control de bots y el Mundo Infinito son el change 3.
