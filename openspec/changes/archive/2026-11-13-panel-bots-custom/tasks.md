# Tasks

> **Alcance:** solo planificación. La implementación es TDD estricto en el apply: cada bloque `RED` se escribe y se ve fallar antes del `GREEN`. Nada de código de producción en esta fase.
>
> **Dependencias:** 1 → 2 → 3 → 4 → 5 → 6 (RED, en ese orden; 4 y 5 pueden escribirse en paralelo una vez cerrado el 3) y 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 (GREEN). El bloque 15 depende de todo lo anterior; el 16 depende del 15. El retiro del bot externo (14) puede empezar en paralelo con 12/13 una vez que 10 esté verde.
>
> **Fuera de alcance:** Mundo Infinito, más comportamientos que `cazador`/`merodeador`/`guardian`/`neutral`, pathfinding A* (solo hay rodeo simple), multi-réplica y anti-cheat de jugadores.

## 1. RED — configuración y catálogos (unit)

- [x] 1.1 Crear `server/test/bots-config.mjs`: `normalizeBotInput` acepta nombre 3–16 con `^[A-Za-z0-9_-]+$`, `hp` entero 1–100, `damage` entero 0–20, `reach` 1–10 con paso 0.1, `speed` 1–30 con paso 0.1, `flying`/`takes_damage` booleanos; rechaza `hp:0`, `hp:101`, `damage:-1`, `damage:21`, `reach:4.65`, `speed:0`, `speed:31`, `flying:"si"`, `takes_damage:1`, nombre de 2/17 y carácter inválido con un código por campo. Verificación: `cd server && node test/bots-config.mjs` falla porque el módulo no existe.
- [x] 1.2 En `bots-config.mjs`: defaults por comportamiento (`cazador` robot/10/6/4.6/28.8/vuela/no recibe daño; `merodeador` human/10/0/1/6/camina/no recibe daño), `CLASSIC_HUNTER_PRESET` con velocidad 28.8, catálogo de skins con `robot` y sin valores inventados, catálogo de comportamientos con `cazador` hostil y `merodeador` pacífico, y rechazo de campos desconocidos. Verificación: falla.
- [x] 1.3 Agregar `bots-config.mjs` al inicio de `server/package.json` → `scripts.test` (después de `permissions.mjs`). Verificación: la cadena reporta el fallo esperado.

## 2. RED — comportamientos y movimiento (unit)

- [x] 2.1 Crear `server/test/bots-behaviors.mjs`: el registro acepta un comportamiento válido y rechaza id duplicado o campos faltantes; `listBehaviors()` devuelve `cazador` y `merodeador` con etiqueta y hostilidad; un comportamiento registrado en el test aparece sin tocar el runtime. Verificación: falla.
- [x] 2.2 En `bots-behaviors.mjs`: `cazador.decide` elige al jugador vivo no-admin sin `bot_ignore` ni bot más cercano, ignora admin pegado, ignora muerto, ignora `bot_ignore` y no ataca si `damage:0`; `merodeador.decide` deambula y nunca declara ataque; el runtime (no el comportamiento) aplica daño y alcance. Verificación: falla.
- [x] 2.3 En `bots-behaviors.mjs`: vuelo libre con mundo inyectado atraviesa un mundo totalmente sólido, alinea altura hacia el objetivo + offset con banda muerta y respeta el borde del mundo; caminata con un mundo de pared no atraviesa el bloque, cae con gravedad hasta el suelo, sube un escalón de 1 bloque y respeta el borde. Verificación: falla.
- [x] 2.4 Agregar `bots-behaviors.mjs` a la cadena de tests. Verificación: falla por comportamiento, no por archivo ausente.

## 3. RED — runtime, roster y combate (e2e en proceso)

- [x] 3.1 Crear `server/test/bots-runtime.mjs` con `startApp` + `MemoryStore` y bots sembrados: al bootear, los `active:true` aparecen en el mundo y en `welcome.players` con id negativo, `bot:true`, `skin`, `name`, `hp`, `maxHp`, `pos`; los inactivos no aparecen; un bot no suma al quórum de sueño. Verificación: falla.
- [x] 3.2 En `bots-runtime.mjs`: lanzar un bot con jugadores conectados difunde `join`; detenerlo difunde `leave`; el `pm` del bot trae posición, `hp` y `dead`; dos bots y un jugador conviven sin colisión de ids. Verificación: falla.
- [x] 3.3 En `bots-runtime.mjs`: un cazador persigue y emite `phit` con su `damage`; nunca ataca a un admin; nunca ataca a un jugador con `bot_ignore`; respeta 650 ms entre golpes; con `damage:0` no emite; un merodeador no emite daño aunque `damage>0`. Verificación: falla.
- [x] 3.4 En `bots-runtime.mjs`: `hit` de un jugador a un bot vulnerable descuenta 2 por golpe válido (ignorando el `dmg` del frame), responde `hitok` con `dmg` aplicado, aplica cooldown y alcance, y con `takes_damage:false` responde `dmg:0` sin cambiar la vida. Verificación: falla.
- [x] 3.5 En `bots-runtime.mjs`: al morir, el bot difunde `leave`, queda `active:false` en el store, se audita `bot.death` con actor nulo y no reaparece tras reiniciar; el stop lo saca sin borrar configuración; los bots no generan `edit` ni cambios en el mundo. Verificación: falla.
- [x] 3.6 En `bots-runtime.mjs`: un bot caminante no atraviesa una pared y uno volador sí; un bot con `flying:false` cae al suelo; con 5 activos no se spawnea un sexto en el boot y se deja constancia. Verificación: falla.
- [x] 3.7 Actualizar `server/test/support/app-fixture.mjs` para esperar `app.bots.ready` y permitir sembrar bots; agregar `bots-runtime.mjs` a la cadena. Verificación: falla por comportamiento.

## 4. RED — API administrativa de bots (HTTP)

- [x] 4.1 Crear `server/test/bots-api.mjs`: `GET /api/admin/bots` sin cookie → `401`, con usuario común → `403 admin_required`, con admin → `200` con `{bots, limits:{maxActive:5}, catalog:{behaviors, skins}}`, `runtime` para activos, sin `Cache-Control` cacheable y sin datos sensibles. Verificación: falla.
- [x] 4.2 En `bots-api.mjs`: alta válida → `201` con `active:false`; defaults por comportamiento; nombre duplicado con otra capitalización → `409 bot_name_taken`; nombre igual a un username existente → `409`; nombre inválido → `422 invalid_bot_name`; `behavior` desconocido → `422 invalid_behavior`; `skin` inventado → `422 invalid_skin`; cada rango → su `422` con `details`; `active` en el body → `422 invalid_field`; ningún rechazo crea filas. Verificación: falla.
- [x] 4.3 En `bots-api.mjs`: `PATCH` aplica solo campos de configuración, `name` se puede cambiar con unicidad, `active` → `422 invalid_field`, `{}` → `400`, `:id` inválido → `400`, inexistente → `404 bot_not_found`; `DELETE` de inactivo → `204`, de activo → `409 bot_active`, repetido → `404`. Verificación: falla.
- [x] 4.4 En `bots-api.mjs`: `start` de inactivo → `200` y activo; `start` repetido no duplica; `stop` de activo → `200`; `stop` de inactivo → `200`; sexto `start` → `409 bot_limit_reached` sin activar; dos `start` simultáneos con cupo para uno dejan exactamente uno activo. Verificación: falla.
- [x] 4.5 En `bots-api.mjs`: `Origin` ajeno → `403`, `text/plain` → `415`, cuerpo > 8 KB → `413`, ráfaga → `429` sin efectos, base caída → `503`, y cada acción/ rechazo deja la auditoría esperada (`bot.create`, `bot.update`, `bot.start`, `bot.stop`, `bot.delete`). Verificación: falla.
- [x] 4.6 Agregar `bots-api.mjs` a la cadena inmediatamente después de `admin.mjs`. Verificación: falla por comportamiento.

## 5. RED — integración Postgres

- [x] 5.1 Crear `server/test/bots-db.mjs` gateado por `TEST_DATABASE_URL` (con `REQUIRE_DB_TESTS=1` obligatorio): correr `runMigrations` dos veces es idempotente y deja la tabla `bots`; los CHECK rechazan `hp:0/101`, `damage:-1/21`, `reach:0.5/10.5`, `speed:0/21`, `behavior:'guardian'` y `skin:'dragon'`; el índice `bots_name_lower_key` rechaza duplicados case-insensitive. Verificación: falla porque la migración 003 no existe.
- [x] 5.2 En `bots-db.mjs`: `created_by` queda nulo al borrar el usuario; `listBots({active:true})` filtra; `createBot`/`updateBot`/`deleteBot`/`stopBot` redondean `reach`/`speed` a un decimal; `startBot` con 4 activos deja pasar uno y rechaza el sexto; dos `startBot` simultáneos con cupo para uno aplican exactamente uno; los detalles de auditoría con nombre de bot sobreviven al borrado. Verificación: falla.
- [x] 5.3 Agregar `bots-db.mjs` a la cadena inmediatamente después de `admin-db.mjs`. Verificación: en CI corre; sin `TEST_DATABASE_URL` imprime "omitida" y sale 0.

## 6. RED — UI, cliente, retiro y regresión (estáticos)

- [x] 6.1 Crear `server/test/bots-static.mjs`: `admin.html` tiene sección “Bots” antes de Usuarios, tabla con las columnas pedidas, contador `N/5 activos`, diálogo con nombre/comportamiento/skin/vida/daño/alcance/velocidad/vuelo/recibe daño, atributos `min`/`max`/`step` correctos, botón “Preset cazador clásico”, confirmación por nombre, opción “Detener y borrar”, `aria-live`, foco visible, 44 px, tema y textos en español, sin frameworks ni `<script src=`. Verificación: falla.
- [x] 6.2 En `bots-static.mjs`: `index.html` usa `maxHp` en `drawBar`/`addRemote`/`pm` con fallback 10 y no muestra número de daño cuando `hitok.dmg <= 0`. Verificación: falla.
- [x] 6.3 En `bots-static.mjs`: `docker-compose.yml` no tiene `minicraft-bot` ni `BOT_TOKEN`; `.github/workflows/deploy.yml` no tiene `EASYPANEL_BOT_WEBHOOK`; `ws-auth.js` no acepta `Authorization`; `env-config.js` no exporta `botToken`; `Dockerfile.bot` y `bot/` no existen; `README.md` y `AGENTS.md` documentan detener/borrar la App del bot y quitar `BOT_TOKEN`. Verificación: falla.
- [x] 6.4 Ajustar la regresión: `ws-auth.mjs` espera `401` con Bearer válido/ inválido y sin cookie; `admin-ws.mjs` deja de usar `BOT_TOKEN` y prueba el descarte de daño del runtime en su lugar; `static.mjs`/`protocol.mjs` no se rompen con los campos aditivos; `bot-cazador.mjs` se elimina de la cadena. Verificación: la suite falla solo por los motivos esperados, no por sintaxis.

## 7. GREEN — migración y stores

- [x] 7.1 Crear `server/migrations/003-bots.sql` con la tabla, CHECKs, índice único `lower(name)`, índice parcial de activos y FK `created_by ON DELETE SET NULL`. Verificación: `bots-db.mjs` aplica la migración dos veces sin error y rechaza todos los valores inválidos.
- [x] 7.2 Extender `server/store-pg.js`: `mapBot`, `listBots({active})`, `getBotById`, `createBot`, `updateBot`, `deleteBot`, `stopBot`, `countActiveBots`, `startBot` transaccional con `pg_advisory_xact_lock('minicraft:bots-active')`, error de duplicado `BOT_NAME_TAKEN` para `bots_name_lower_key` y serialización numérica de `reach`/`speed`. Verificación: `bots-db.mjs` verde.
- [x] 7.3 Replicar la interfaz en `server/test/support/memory-store.mjs` con la cola de transacciones existente y el mismo error de duplicado. Verificación: `bots-api.mjs` y `bots-runtime.mjs` pueden ejecutar sus casos.
- [x] 7.4 Confirmar que `server/user-tool.mjs`, `migrate.mjs` y las migraciones 001/002 siguen funcionando. Verificación: `auth-db.mjs`, `admin-db.mjs` y `migrate.mjs` verdes.

## 8. GREEN — configuración y catálogos

- [x] 8.1 Crear `server/bot-config.js` con `BOT_LIMITS`, `BOT_NAME_RE`, `BOT_SKINS` (incluye `robot`), `BOT_DEFAULTS`, `CLASSIC_HUNTER_PRESET`, `normalizeBotInput` y `botView`. Verificación: `bots-config.mjs` verde.
- [x] 8.2 Exponer catálogo y límites desde el router para que el panel no duplique constantes. Verificación: el listado de `bots-api.mjs` trae `catalog` y `limits` con los valores del módulo.

## 9. GREEN — comportamientos y movimiento

- [x] 9.1 Crear `server/bot-behaviors.js` con el registro (`registerBehavior`, `getBehavior`, `listBehaviors`), `cazador` y `merodeador` como `decide()` declarativo. Verificación: `bots-behaviors.mjs` verde.
- [x] 9.2 Implementar `freeMove`/`alignAltitude` (vuelo) y `groundAt`/`moveTo` con gravedad y auto-escalón (caminata) como funciones puras sobre el mundo inyectado. Verificación: los casos de movimiento de `bots-behaviors.mjs` verdes.
- [x] 9.3 Verificar que ningún comportamiento emite daño ni conoce `damage`/`reach`/`flying`, y que recibe solo jugadores elegibles. Verificación: casos de admin/`bot_ignore`/bots/muertos verdes.
- [x] 9.4 Loguear cada golpe con `horaAr()` del server al inicio de la línea, sin tag. Verificación: `hora-argentina.mjs` verde y `bots-runtime.mjs` valida el prefijo.

## 10. GREEN — runtime y wiring del servidor

- [x] 10.1 Crear `server/bot-runtime.js` con `create({store, world, WG, now, log, warn, getPlayers, broadcast, sendToPlayer, env})`, `boot/ready`, `spawn/despawn`, `list/getById`, `tick`, snapshots `pm`, `applyPlayerHit`, `stop` y `close`. Verificación: `bots-runtime.mjs` arranca y spawnea.
- [x] 10.2 Integrar en `server/app.js`: instanciar el runtime cuando hay store, exponer `app.bots`, extraer helpers `playerEntry`/`botEntry` y sumar los bots a `welcome.players` y `join` sin tocar el quórum de sueño. Verificación: casos de roster de `bots-runtime.mjs` verdes.
- [x] 10.3 En `server/app.js`: resolver `hit` contra bots, aplicar daño fijo 2 con alcance/cooldown, `hitok` con `dmg` aplicado, muerte con `leave` + auditoría + `active:false`, y daño de bots a jugadores con filtros de admin/`bot_ignore`. Verificación: casos de combate y muerte verdes.
- [x] 10.4 Cablear el boot (`active:true`), el límite de 5, `BOTS_ENABLED=0` y el cierre en `app.close()`. Verificación: casos de boot/límite/shutdown verdes.
- [x] 10.5 Aplicar ediciones en caliente con `despawn` + `spawn` y vida reiniciada; emitir `join`/`leave`/`pm` correctos. Verificación: `bots-api.mjs` y `bots-runtime.mjs` verdes.
- [x] 10.6 Verificar que heartbeats, idle-kick, revalidación y `closeUserSockets` no tocan bots. Verificación: `admin-ws.mjs` y `ws-auth.mjs` verdes.

## 11. GREEN — API administrativa de bots

- [x] 11.1 Sumar a `server/admin-api.js` las rutas `GET/POST /api/admin/bots`, `PATCH/DELETE /api/admin/bots/:id` y `POST /:id/start|stop`, con parseo de id, lectura JSON, gate admin, limiter y `no-store` reutilizados. Verificación: casos 4.1 y 4.3 verdes.
- [x] 11.2 Implementar alta/edición con `normalizeBotInput`, unicidad contra bots y usernames, defaults y auditoría dentro de transacción; `active` solo por start/stop. Verificación: 4.2 verde.
- [x] 11.3 Implementar `start`/`stop` con `store.startBot`/`stopBot`, spawn/despawn del runtime, reversión si el spawn falla y auditoría. Verificación: 4.4 verde.
- [x] 11.4 Mapear errores por campo (`details: {field, reason}`), `bot_not_found`, `bot_active`, `bot_limit_reached`, `409/422/503`; auditar acciones y rechazos sin secretos. Verificación: 4.5 verde.
- [x] 11.5 Documentar en `server/README.md` endpoints, cuerpos, códigos de error, migración 003, variables `BOTS_*` y el comportamiento de `BOT_TOKEN` legado. Verificación: seguir la documentación contra `bots-api.mjs` sin contradicciones.

## 12. GREEN — panel `/admin`

- [x] 12.1 Agregar la sección “Bots” en `admin.html` (antes de Usuarios) con tabla, contador `N/5`, estado vacío, error de carga y reintento; cargar `/api/admin/bots` junto con las demás secciones. Verificación: 6.1 verde y prueba manual.
- [x] 12.2 Implementar el diálogo de alta/edición con nombre, comportamiento y skin desde `catalog`, vida/daño/alcance/velocidad con `min`/`max`/`step`, checkboxes de vuelo y daño recibido, validación en cliente y errores por campo. Verificación: 6.1 + `422/409` mapeados manualmente.
- [x] 12.3 Implementar el botón “Preset cazador clásico” (solo completa campos, no crea) con velocidad 28.8, dentro del máximo 30. Verificación: 6.1 + prueba manual sin cambios en la tabla.
- [x] 12.4 Implementar Lanzar/Detener con refresco de fila, cupo deshabilitado y anuncio por `aria-live`; manejar `409 bot_limit_reached`. Verificación: 6.1 + prueba manual con 5 activos.
- [x] 12.5 Implementar borrado con confirmación por nombre y “Detener y borrar” para activos, cancelación sin efectos y mapeo de `409 bot_active`. Verificación: 6.1 + prueba manual.
- [x] 12.6 Completar accesibilidad y estilo: foco visible, 44 px, `aria-live`, tema claro/oscuro, `prefers-reduced-motion`, textos en español, sin frameworks. Verificación: recorrido con Tab y 6.1 verde.
- [x] 12.7 Documentar el panel de bots en `README.md` (qué se puede hacer, preset, límite de 5, borrado y detener). Verificación: un lector nuevo puede crear y lanzar el primer bot siguiendo la sección.

## 13. GREEN — cliente del juego

- [x] 13.1 En `index.html`: `drawBar` usa `a.maxHp || 10`, `addRemote` guarda `maxHp` y el handler `pm` lo actualiza y redibuja. Verificación: 6.2 verde y bot con `hp:100` a media barra.
- [x] 13.2 En `index.html`: `hitok` solo dibuja el número de daño cuando `m.dmg > 0`; el golpe inmune no muestra número. Verificación: 6.2 verde y prueba manual.
- [x] 13.3 Confirmar que un cliente viejo (sin `maxHp`) sigue funcionando y que el campo `bot` se ignora. Verificación: caso estático + prueba con una copia del cliente anterior.

## 14. GREEN — retiro del bot externo y deploy

- [x] 14.1 `server/ws-auth.js` y `server/env-config.js`: quitar la rama Bearer/`botToken`; el upgrade solo acepta cookie. `server/app.js`: quitar `kind:'bot'`, la identidad de bot y el descarte de `hit` por `me.bot`. Verificación: `ws-auth.mjs` verde con Bearer → `401`.
- [x] 14.2 Eliminar `bot/index.js`, `bot/cazador.js`, `Dockerfile.bot` y `server/test/bot-cazador.mjs`; confirmar que no quedan referencias en tests, docs ni scripts. Verificación: `grep` sin resultados y `npm test` sin archivos faltantes.
- [x] 14.3 `docker-compose.yml`: quitar el servicio `minicraft-bot` y `BOT_TOKEN` del server. `.github/workflows/deploy.yml`: quitar `EASYPANEL_BOT_WEBHOOK`, el archivo temporal y su rama del loop. Verificación: `docker compose config` válido, workflow parseable y 6.3 verde.
- [x] 14.4 Avisar una sola vez al arrancar si `BOT_TOKEN` está seteada, sin loguear el valor. Verificación: caso unitario del warning y log manual sin el token.
- [x] 14.5 Actualizar `README.md`, `server/README.md` y `AGENTS.md`: quitar comandos/ variables del bot externo, documentar el retiro de `BOT_TOKEN`, el paso de detener/borrar la App `minicraft-bot` en Easypanel y el nuevo flujo de bots del panel. Verificación: 6.3 verde y revisión desde cero.
- [x] 14.6 Verificar que el server sigue arrancando sin `BOT_TOKEN`, que un Bearer legado recibe `401` y que no hay ningún bot legacy reconectando. Verificación: prueba manual en Docker + logs (cubierta por 16.1 y 16.4, aprobada por el usuario).

## 15. Verificación de la suite y e2e

- [x] 15.1 `cd server && npm test` **todo verde** sin DB: unit, HTTP, WS, runtime, estáticos y regresión; los tests de DB se omiten con aviso.
- [x] 15.2 `TEST_DATABASE_URL=... REQUIRE_DB_TESTS=1 cd server && npm test` **todo verde**, incluidos `bots-db.mjs` (migración 003, CHECKs, unicidad, FK, carrera de cupo).
- [x] 15.3 Confirmar que los changes 1 y 2 no se rompieron: auth, sesiones, admin CRUD, guardas, permisos, `perm` en caliente y lobby siguen verdes.
- [x] 15.4 Verificar que la suite no deja intervalos, puertos ni apps de test vivos y que corre en un tiempo razonable. Verificación: el proceso termina solo, sin warnings de handles abiertos.

## 15-bis. Feedback del usuario (mismo change)

> Ajuste pedido sobre la implementación ya hecha de `panel-bots-custom`: no es un
> change nuevo. TDD estricto: cada caso se escribió y se vio fallar antes del
> `GREEN`, con triangulación de bordes.

- [x] 15b.1 Ampliar el registro de comportamientos con `attacksPlayers` y `attacksEnemies` booleanos (defaults seguros), exponerlos en `listBehaviors()` y validar que una metadata no booleana se rechace. Verificación: `bots-behaviors.mjs` 1 y `bots-api.mjs` catálogo verdes.
- [x] 15b.2 Implementar `guardian` (“Guardián”): criatura viva más cercana dentro de un radio de 16 alrededor de `home`, persecución/ataque, vuelta al origen o deambulación, y nunca `attackTargetId` de jugador. Verificación: casos de guardián en `bots-behaviors.mjs` y `bots-runtime.mjs` verdes.
- [x] 15b.3 Implementar `neutral` (“Neutral”): deambula sin atacar, aggro `{kind, id, until}` de 10 s al recibir un golpe, cambio al atacante más reciente y limpieza al morir/desaparecer/expirar. Verificación: casos de neutral en `bots-behaviors.mjs` y `bots-runtime.mjs` verdes.
- [x] 15b.4 Runtime: pasar `zombies` vivos a `decide`, intención `attackZombieId` validada con alcance/altura/cadencia de 650 ms y `getZombies`/`damageZombie` inyectados desde `app.js`. Verificación: `bots-runtime.mjs` (guardián volador, daño 0, fuera de alcance) verde.
- [x] 15b.5 `applyEnemyHit`: daño server-side, muerte con `die`+auditoría y aggro del neutral aunque sea inmune; `applyPlayerHit`: aggro del neutral solo si el atacante no es admin ni `bot_ignore`. Verificación: casos de retaliación, inmunidad y muerte por criatura verdes.
- [x] 15b.6 Criaturas contra bots: `zombie.tick` acepta `bots`, prioriza humanos sobre bots, `spawnWave` sigue contando solo jugadores y `damageZombie` aplica hp/dead/deadAt. Verificación: `zombie.mjs` (adquisición, prioridad, golpe, respaldo y daño) verde.
- [x] 15b.7 `app.js`: pasar `botTargets` a la horda y rutear los `phit` con `to < 0` a `bots.applyEnemyHit` sin tocar `wsById`. Verificación: chequeos de cableado en `zombie.mjs` verdes.
- [x] 15b.8 Configuración: defaults de `guardian` y `neutral` con la misma ficha (vida/daño/alcance/velocidad/vuelo/recibe daño) y allowlist de la API ampliada. Verificación: `bots-config.mjs` y `bots-api.mjs` verdes.
- [x] 15b.9 Migración forward-only `004-bot-behaviors.sql` que amplía `bots_behavior_allow` a `('cazador','merodeador','guardian','neutral')` sin editar la 003. Verificación: `bots-db.mjs` (idempotencia, CHECK, altas) verde.
- [x] 15b.10 Panel: referencias de jugador debajo de Vida/Daño/Alcance/Velocidad con estilo discreto (`.field-hint`), descripción dinámica del comportamiento, etiqueta “Recibe daño (jugadores y criaturas)” y `BEHAVIOR_LABELS`/`BEHAVIOR_HELP` con guardián y neutral. Verificación: `bots-static.mjs` verde.
- [x] 15b.11 Tabla de usuarios: para `role=admin` mostrar “Administrador” + “Poderes implícitos” además de los permisos explícitos y nunca “Sin permisos”. Verificación: `bots-static.mjs` verde.
- [x] 15b.12 Actualizar los deltas `bots/management`, `bots/runtime` y `ui/admin`, el `design.md` y este bloque; `openspec validate panel-bots-custom --strict` pasa.
- [x] 15b.13 Suite completa sin DB y con Postgres real: **2912/2912** asserts en 36 archivos sin DB y **3027/3027** en 39 archivos con DB, sin fallos.

## 15-ter. Feedback del usuario: navegación de bots (mismo change)

> Segundo ajuste sobre la implementación ya hecha de `panel-bots-custom`: los
> bots caminantes se trababan contra árboles/obstáculos, no deambulaban por el
> mundo y el neutral quedaba quieto después de combatir. No es un change nuevo.
> TDD estricto: los casos se escribieron y se vieron fallar (7 en
> `bots-behaviors.mjs`, 5 en `bots-runtime.mjs`) antes del `GREEN`.

- [x] 15t.1 RED: persecución con objetivo a ≤3.8 horizontal y >2.5 vertical (cazador, guardián y neutral); caminante que rodea un tronco y llega; caminante que se rinde con un objetivo inalcanzable; guardián sin enemigos que se mueve dentro de su zona; neutral que vuelve a caminar tras el combate; deambular amplio 6–24; nunca atravesar bloques. Verificación: casos rojos antes del código.
- [x] 15t.2 `chaseIntent` solo detiene cuando la distancia horizontal es ≤3.8 **y** `|dy| ≤ 2.5`; si el objetivo está a otra altura sigue devolviendo `moveTo` (el volador alinea altura, el caminante rodea). Verificación: casos de altura en `bots-behaviors.mjs` y `bots-runtime.mjs` verdes.
- [x] 15t.3 `moveWalk` con rodeo simple: paso directo con control de avance/acercamiento, perpendiculares ±90°, retroceso y gravedad; recuerda el lado 400–700 ms y lo limpia al volver a avanzar directo. Sin teletransporte, sin atravesar bloques y con el mismo hitbox del jugador. Verificación: tronco de 1×1 y pared de 3 bloques rodeados; el pasillo sin salida no se atraviesa.
- [x] 15t.4 Deambular ampliado: `merodeador`/`neutral` eligen destinos de 6–24 bloques de `home`; el `guardián` patrulla de 4–16 y solo vuelve al centro si quedó fuera del radio de guardia; cada destino tiene un plazo de 15 s para no quedar empujando contra un bloque. Verificación: radios y movimiento del guardián en `bots-behaviors.mjs` y `bots-runtime.mjs` verdes.
- [x] 15t.5 `setAggro` reinicia `wander`; el neutral elige un destino nuevo al morir/desaparecer/expirar el atacante; el guardián sin enemigos camina en vez de quedarse estático. Verificación: casos de neutral reactivado y patrulla verdes.
- [x] 15t.6 Rendición acotada: si un caminante lleva ~3.5 s persiguiendo sin acercarse, abandona ese objetivo por 4 s (`giveUp`) y vuelve a deambular; el guardián y el cazador lo reintentan al vencer la pausa. Verificación: caso del pozo inalcanzable (abandona y reintenta) verde.
- [x] 15t.7 Triangulación: dos caminantes alrededor del mismo tronco, pared ancha de tres bloques, volador que cruza el tronco en línea recta sin estado de rodeo, objetivo inalcanzable y verificación de que nunca ocupan una celda sólida. Verificación: `bots-runtime.mjs` verde.
- [x] 15t.8 Suite completa **sin DB: 2955/2955** asserts y **con Postgres real: 3070/3070**, sin fallos (43 asserts nuevos).
- [x] 15t.9 Deltas `bots/runtime` (caminata con rodeo, persecución por altura, deambular amplio, guardián que patrulla y neutral reactivado), `design.md`, `README.md` y `server/README.md` actualizados; `openspec validate panel-bots-custom --strict` pasa.

## 15-quater. Feedback del usuario: deambular válido y reset (mismo change)

> Tercer ajuste sobre la implementación ya hecha de `panel-bots-custom`: en vivo,
> un `neutral` caminante con velocidad 6 se quedaba casi quieto en el bosque
> (`x≈95.6, y=10, z≈109.4` durante 20 s) porque elegía destinos de deambular
> dentro de árboles y empujaba contra ellos. El guardián patrullaba pero también
> se trababa. No es un change nuevo. TDD estricto: los casos se escribieron y se
> vieron fallar (5 en `bots-behaviors.mjs`, 7 en `bots-runtime.mjs`) antes del
> `GREEN`; con el bosque de prueba calibrado al 33 % de árboles el síntoma se
> reproduce (0,91 bloques recorridos en 20 s) y con el fix sube a 11,09.

- [x] 15u.1 RED: `wanderIntent` en un bosque denso elige destinos que son celdas libres a nivel del suelo (nunca copas de árbol ni troncos); con un mundo totalmente sólido no fija destino y reintenta; el volador elige destino igual y queda dentro del mundo; el neutral caminante recorre el bosque sin ocupar celdas sólidas; un destino inalcanzable se suelta a los ~2 s; un rincón cerrado acumula dos resets y pasa a un destino cercano; el guardián patrulla en el bosque y se rinde de una criatura inalcanzable. Verificación: casos rojos antes del código.
- [x] 15u.2 `wanderIntent` y `pickWanderTarget`: hasta 20 candidatos por intento; se acepta solo si la celda está dentro del mundo, tiene suelo, el cuerpo de 2 bloques queda libre en todas las celdas que ocupa y el desnivel es de a lo sumo un bloque (la copa del árbol queda descartada). El volador valida solo el borde y la zona. Sin candidatos válidos no se fija destino: pausa corta (`WANDER_RETRY_MS`) y reintento. Verificación: `bots-behaviors.mjs` 11 verde.
- [x] 15u.3 `wanderCell`: predicado puro de transitabilidad con el mismo radio de cuerpo que jugadores y zombis; nunca atraviesa bloques ni cambia el hitbox. Verificación: casos de bosque denso y mundo sólido verdes.
- [x] 15u.4 Runtime: un caminante que deambula y no se acerca a su destino en ~2 s (`WANDER_STUCK_MS`, mejora mínima `WANDER_PROGRESS = 0.5` para no confundir el vibrado con avance) limpia `bot.wander` y `bot.detour` y el comportamiento elige otro destino. Verificación: casos de destino inalcanzable y rincón cerrado verdes.
- [x] 15u.5 Tras dos resets seguidos el comportamiento muestrea un radio cercano (2–6) desde la posición actual, sin salir de la zona del comportamiento; al volver a acercarse el contador vuelve a cero y se restaura el radio normal (6–24 / 4–16). Verificación: casos de escape y de radio restaurado verdes.
- [x] 15u.6 El contador de rendición de combate (`STUCK_MIN_MS`, ~3,5 s) no se reinicia por el rodeo lateral: sigue midiendo acercamiento al objetivo, así que el guardián se rinde de un zombi inalcanzable y vuelve a patrullar. Verificación: casos de pozo inalcanzable y patrulla del guardián verdes.
- [x] 15u.7 Neutral tras el combate: al limpiar el aggro (`self.aggro = null`) elige un destino nuevo y se mueve; se verifica que en los ticks siguientes cambia de posición. Verificación: caso 3.6sexies y bloque 9 de `bots-behaviors.mjs` verdes.
- [x] 15u.8 Triangulación: bosque denso (1 de cada 3 columnas con árbol), rincón cerrado por un anillo de bloques, destino detrás de una pared, mundo abierto, dos neutrales caminando, vuelo ON sin validación de colisión y guardián sin enemigos. Verificación: `bots-runtime.mjs` verde y contraste medido 11,09 vs 0,91 bloques en 20 s.
- [x] 15u.9 Suite completa **sin DB: 2992/2992** asserts y **con Postgres real: 3107/3107**, sin fallos (37 asserts nuevos). Deltas `bots/runtime` (deambular con destino válido y reset por falta de avance), `README.md` y `server/README.md` actualizados; `openspec validate panel-bots-custom --strict` pasa.

## 16. Verificación en Docker y aprobación explícita

- [x] 16.1 `ADMIN_PASSWORD=<clave> docker compose up --build -d` (sin servicio de bot) y esperar healthchecks; confirmar `http://localhost:3000` y `migración aplicada: 003-bots.sql` en los logs.
- [x] 16.2 Probar el recorrido completo en el navegador: `/admin` → Bots → “Preset cazador clásico” → crear → Lanzar; el bot aparece con skin de robot y nombre; atacar y matar un bot con `takes_damage`; verificar que un bot inmune no pierde vida; que un admin no recibe daño; que `bot_ignore` protege; que el cazador respeta alcance/velocidad; que un merodeador no ataca; que un bot caminante no atraviesa paredes.
- [x] 16.3 Probar el ciclo de vida: detener, editar en caliente, relanzar, quinto bot y sexto rechazado, borrado de inactivo, borrado de activo con “Detener y borrar”, reinicio del contenedor con bots activos (vuelven) y con bots muertos (no vuelven).
- [x] 16.4 Revisar logs: sin `BOT_TOKEN`, sin cookies ni secretos; un Bearer legado recibe `401`; los golpes de bots llevan `[HH:MM]` de Argentina; no hay spam de errores por el bot retirado.
- [x] 16.5 Avisar al usuario **qué mirar** y pasar en la **misma línea** el link local y la cuenta admin de esa corrida (`http://localhost:3000 · admin: admin / <clave>`), o `admin deshabilitado` si la corrida no tuvo `ADMIN_PASSWORD` válida. La clave es solo dev local y no se commitea.
- [x] 16.6 **Esperar aprobación explícita del usuario.** No commitear, no pushear y no archivar antes de esa aprobación.
- [x] 16.7 Si el usuario pide cambios: corregir, volver a correr 15.1–15.4, levantar Docker otra vez y repetir 16.1–16.6. (No hubo cambios posteriores: el usuario aprobó en la primera verificación en Docker.)

## Workflow follow-up

- **Tras la aprobación explícita, lo hace el orquestador** (no este subagente): `docker compose down`, `git add` + commit en español (scope sugerido `feat(bots):`), `git push` a `main`, `openspec archive panel-bots-custom` y verificación de `git status` limpio.
- Al archivar: se crean `bots/management` y `bots/runtime` desde sus deltas; `bots/hunter`, `ui/admin`, `security/admin`, `net/session` y `player/permissions` se actualizan con sus requisitos modificados/eliminados.
- Dejar registrado en el resumen que el Mundo Infinito queda parkeado y que los bots son el último change del plan de fundación.
