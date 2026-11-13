# AGENTS.md — Minicraft

Instrucciones para agentes que trabajan en este repo. Es específico del proyecto:
no repite reglas globales del entorno.

## Qué es

Mini-Minecraft voxel multijugador: cliente único `index.html` (Three.js r160 por
CDN) + servidor Node 20 (`ws` + PostgreSQL) con bots **in-process** administrados
desde `/admin`. Todo corre en Docker y se despliega en Easypanel desde `main`.

```
index.html, login.html, register.html, lobby.html  ← cliente y páginas
server/           ← server.js (bootstrap), app.js (HTTP+WS), auth.js,
                    http-auth.js, ws-auth.js, db.js, migrate.js, store-pg.js,
                    bot-config.js, bot-behaviors.js, bot-runtime.js,
                    migrations/, zombie.js, test/*.mjs
openspec/         ← specs vivas + changes (archivados en changes/archive/)
docker-compose.yml, Dockerfile
```

## Comandos

| Qué | Comando |
|---|---|
| Tests (obligatorio antes de commitear) | `cd server && npm test` |
| Tests con integración de DB | `TEST_DATABASE_URL=... cd server && npm test` |
| Server local sin Docker | `cd server && DATABASE_URL=... ADMIN_PASSWORD=... node server.js` |
| Docker (db + server) | `ADMIN_PASSWORD=<clave> docker compose up --build -d minicraft` |
| Logs | `docker compose logs -f` |
| Apagar | `docker compose down` |

El juego queda en **http://localhost:3000** (login en `/login`, registro en
`/register`, lobby en `/lobby`, juego en `/game`). Docker Desktop debe estar
corriendo (`docker info`); si el pipe no existe, abrir Docker Desktop y esperar
a que levante antes de buildear.

## Operación en Easypanel

Los bots ya no son una App aparte: corren dentro del server y se administran en
`/admin` → Bots. Después del primer deploy de este cambio:

1. **Detener o borrar la App `minicraft-bot`** en Easypanel (el bot legacy
   reintenta y recibe `401`).
2. Quitar `BOT_TOKEN` del entorno del server (si sigue seteada, el server avisa
   una vez y la ignora).
3. Borrar el secret `EASYPANEL_BOT_WEBHOOK` de GitHub (el workflow ya no lo usa).
4. Crear el primer bot en `/admin` con el **preset cazador clásico** y lanzarlo.

## Flujo obligatorio para cada feature

1. **OpenSpec primero.** Crear el change (`propose`) y trabajar contra sus
   specs/tasks. No implementar features sin change.
2. **TDD.** Test que falla primero, después el código. `cd server && npm test`
   tiene que quedar **todo verde** antes de commitear.
3. **Docker para aprobación (obligatorio, sin excepciones).**
   - Levantar: `ADMIN_PASSWORD=<clave> docker compose up --build -d minicraft`
     (los bots corren dentro del server; no hay servicio de bot que agregar).
   - Esperar a que responda: `Invoke-WebRequest http://localhost:3000` o
     `docker compose logs --tail 20`.
   - Avisar al usuario **qué mirar** y decirle que pruebe en
     http://localhost:3000.
   - En ese mismo mensaje, poner **el link local y la cuenta admin de esa corrida
     juntos, en la misma línea** (ej. `http://localhost:3000 · admin: admin /
     <clave>`). Si la corrida arrancó sin `ADMIN_PASSWORD` válida, decir
     explícitamente `admin deshabilitado` en vez de omitirlo. La clave es **solo
     dev local**: nunca se commitea, no va a `.env` versionado ni a la
     documentación.
   - **No commitear, no pushear y no archivar hasta que el usuario apruebe
     explícitamente.**
4. **Al aprobar, en este orden:**
   - `docker compose down`
   - `git add` + commit (Conventional Commits **en español**, scope del área:
     `feat(skins):`, `fix(bot):`, `chore(openspec):`, `docs(agents):`…)
   - `git push` a `main`
   - `openspec archive <change>`
   - Verificar que `git status` quede limpio.

Si el usuario pide cambios después de probar: se corrigen, se vuelve a levantar
Docker y se espera una nueva aprobación. Nunca se pushea nada sin aprobación.

## Convenciones

- **Idioma:** código, UI, specs, README y commits en español. Encabezados
  estructurales de OpenSpec y `SHALL`/`MUST` en inglés.
- **Protocolo aditivo:** los mensajes nuevos (`skin`, `tod`, `zs`, …) se agregan
  sin romper clientes viejos; el cliente viejo los ignora.
- **Autoridad:** criaturas y daño de criaturas son server-authoritative
  (`server/zombie.js`). Los bots también: `server/bot-runtime.js` decide el daño
  en las dos direcciones y la vida del bot es server-authoritative. La vida del
  jugador sigue siendo client-authoritative (el server relayea `hit` y clampea
  el daño a 6): no asumir anti-cheat.
- **Identidad:** nombre, skin y rol salen de la sesión (`/api/me` y el gate del
  WebSocket), nunca del `hello`. El skin solo se edita con `PATCH /api/me`.
  Los usuarios de cookie no pueden declararse bot ni admin. Los bots son estado
  interno del server (sin socket ni sesión) y se administran solo en `/admin`.
- **Bots:** se configuran y lanzan desde `/admin` (panel o API). No hay
  auto-seed ni servicios externos. Máximo 5 activos; `active` solo cambia con
  `start`/`stop`. Comportamientos: `cazador` ataca jugadores, `merodeador` no
  ataca, `guardian` pelea solo contra criaturas en su zona y `neutral` solo
  responde a quien lo golpea. Nunca atacan admins; `cazador` respeta
  `bot_ignore`. Las criaturas también pueden atacar bots (prioridad humana).
  Volar es configuración (`flying`), no un comportamiento.
- **Sin assets:** texturas por canvas procedural, sonidos por WebAudio. No
  agregar archivos binarios si se puede generar.
- **No commitear** `node_modules/`, `world.json` ni `data/` (están en
  `.gitignore`).
- Los tests son scripts Node planos (`server/test/*.mjs`), sin framework; se
  agregan a la cadena de `server/package.json` → `scripts.test`.
