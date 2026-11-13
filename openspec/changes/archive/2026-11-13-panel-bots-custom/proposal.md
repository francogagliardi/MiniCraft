# Proposal

## Why

El bot cazador es hoy un proceso aparte (`minicraft-bot`) que solo se puede crear o cambiar con variables de entorno y un redeploy, y no existe forma de tener más de un bot, darle otra vida, otro daño u otro comportamiento. El panel `/admin` ya administra cuentas y permisos (change 2); el control de bots es la pieza que falta para que un admin pueda crear, configurar, lanzar y detener bots desde la web sin tocar infraestructura.

Este es el **change 3 de 3**. Cierra el flujo de administración: bots 100% gestionados desde el panel, con estado persistido y sin servicio externo.

## What Changes

- **Bot in-process.** La lógica del cazador pasa a correr dentro del server (módulos puros + runtime) y se retira el servicio `minicraft-bot` del `docker-compose.yml`, su deploy (`EASYPANEL_BOT_WEBHOOK`) y su imagen (`Dockerfile.bot`).
- **BREAKING: se retira `BOT_TOKEN`** del flujo normal. El upgrade WebSocket deja de aceptar `Authorization: Bearer`: solo cookie de sesión. El bot externo viejo queda fuera de servicio a propósito; si sigue corriendo recibe `401`. Si la variable está seteada, el server avisa una vez al arrancar y la ignora.
- **Modelo persistido.** Tabla `bots` (migración `003-bots.sql` forward-only) con nombre único case-insensitive, comportamiento, skin, vida, daño, alcance, velocidad, `takes_damage`, `flying`, `active`, autor y fechas. **Máximo 5 bots activos**, validado en transacción con advisory lock.
- **Catálogo extensible de comportamientos.** Registro en código con interfaz `decide(ctx, dt)`: `cazador` (persigue y ataca al jugador no ignorado más cercano) y `merodeador` (pacífico: deambula, no ataca). Volar no es un comportamiento: es configuración del bot.
- **Configuración por bot.** Nombre 3–16 (`^[A-Za-z0-9_-]+$`), comportamiento, skin del catálogo `SKIN_SPECS` (incluye `robot`), vida 1–100, daño 0–20, alcance 1–10, velocidad 1–30 u/s, recibe daño on/off y vuelo on/off.
- **Runtime server-authoritative.** Spawn, tick, movimiento, ataque, daño recibido, muerte y respawn al boot de los activos. Vuelo ON = 3D libre sin colisión; vuelo OFF = caminata con gravedad, colisión y auto-escalón de 1 bloque. Los bots nunca atacan admins; `cazador` además respeta `bot_ignore`.
- **Sin auto-seed.** El deploy no crea ningún bot. El admin crea el primero; el formulario ofrece el botón **“Preset cazador clásico”** que precarga valores sin crear nada.
- **API y panel.** `GET/POST/PATCH/DELETE /api/admin/bots` y `POST .../:id/start|stop`, solo admin, con auditoría (`bot.create`, `bot.update`, `bot.start`, `bot.stop`, `bot.delete`, `bot.death`) y una sección “Bots” en `/admin`.
- **Daño en las dos direcciones.** El daño del bot al jugador se emite server-side con su `damage` configurado y nunca contra admins ni `bot_ignore`; el daño del jugador al bot descuenta hp server-side (2 por golpe válido) cuando `takes_damage` está activo. Al llegar a 0 el bot desaparece y queda inactivo en DB, sin respawn automático.
- **Operación.** El admin debe **detener o borrar la App `minicraft-bot` en Easypanel** después del deploy para que no quede un bot legacy reintentando. Se documenta en `README.md` y `AGENTS.md`.

## Capabilities

### New Capabilities

- `bots/management`: modelo persistido de bots (tabla, CHECKs, unicidad de nombre), API administrativa de alta/edición/borrado/lanzar/detener, límite de 5 activos con advisory lock, catálogo expandible de comportamientos y skins, preset del cazador clásico y auditoría de cada acción de bots.
- `bots/runtime`: runtime in-process de bots (spawn, tick, movimiento con vuelo libre o caminata con colisión, selección de presas, daño a jugadores y a bots, muerte, stop y respawn al boot), su representación en el roster como avatares fake sin WebSocket y las reglas que ningún comportamiento puede saltarse.

### Modified Capabilities

- `bots/hunter`: el cazador deja de ser un cliente externo y pasa a ser un comportamiento configurable del runtime. Se retiran reconexión/backoff, credencial de servicio, `BOT_SKIN`/`BOT_NAME`, keepalive `mv`, comandos de chat y la máquina ESPERA/SIGUEME; la velocidad y el daño dejan de ser constantes.
- `ui/admin`: nueva sección “Bots” con tabla, contador de activos, formulario de alta/edición con validaciones, preset del cazador clásico, lanzar/detener y borrado con confirmación (detener primero si está activo).
- `security/admin`: la API de bots entra en la misma superficie administrativa (admin-only, CSRF/Origin, JSON estricto, 8 KB, rate limit, `no-store`) con sus códigos de error y auditoría append-only.
- `net/session`: el roster transporta bots como entradas fake (`bot:true`, id negativo, `skin`, `name`, `hp`, `maxHp`), el `hit` del jugador puede apuntar a un bot con daño server-side y se retira la credencial de servicio del upgrade.
- `player/permissions`: `bot_ignore` protege de todos los bots hostiles (no solo del cazador externo) y el server sigue siendo quien descarta el daño, ahora también al validar el daño de los bots in-process.

## Impact

- **Código nuevo:** `server/bot-config.js` (validación, defaults, preset, catálogo), `server/bot-behaviors.js` (registro, `cazador`, `merodeador`, movimiento puro), `server/bot-runtime.js` (spawn/tick/daño/muerte) y `server/migrations/003-bots.sql`; tests `server/test/bots-config.mjs`, `bots-behaviors.mjs`, `bots-api.mjs`, `bots-db.mjs`, `bots-runtime.mjs`, `bots-static.mjs`.
- **Código modificado:** `server/app.js` (runtime, roster, hit a bots, tick, close), `server/admin-api.js` (rutas `/api/admin/bots*`), `server/store-pg.js` y `server/test/support/memory-store.mjs` (CRUD y límite de bots), `server/ws-auth.js` y `server/env-config.js` (sin bearer), `server/permissions.js` (helper de presas), `admin.html` (sección Bots), `index.html` (barra de vida por `maxHp` y `hitok` inmune), `server/package.json` (cadena de tests), `README.md`, `server/README.md`, `AGENTS.md`.
- **Infra:** `docker-compose.yml` pierde el servicio `minicraft-bot` y `BOT_TOKEN`; se eliminan `Dockerfile.bot`, `bot/index.js` y `bot/cazador.js`; `.github/workflows/deploy.yml` pierde el webhook del bot. El server sigue siendo un único contenedor y no suma dependencias.
- **Datos:** tabla nueva `bots`; sin backfill ni seed. La configuración sobrevive a reinicios y redeploys; `hp` en DB es la vida máxima configurada, no la vida runtime.
- **Fuera de alcance:** Mundo Infinito (parkeado), comportamientos guardián/seguidor/explorador, pathfinding con A*, anti-cheat de jugadores, bots creados por usuarios comunes y servidor de bots separado.
