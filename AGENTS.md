# AGENTS.md — Minicraft

Instrucciones para agentes que trabajan en este repo. Es específico del proyecto:
no repite reglas globales del entorno.

## Qué es

Mini-Minecraft voxel multijugador: cliente único `index.html` (Three.js r160 por
CDN) + servidor Node 20 (`ws`) + bot cazador como cliente aparte. Todo corre en
Docker y se despliega en Easypanel desde `main`.

```
index.html        ← TODO el juego (cliente)
server/           ← server.js, zombie.js, admin-auth.js, test/*.mjs
bot/              ← cazador.js (lógica pura) + index.js (WebSocket/CLI)
openspec/         ← specs vivas + changes (archivados en changes/archive/)
docker-compose.yml, Dockerfile, Dockerfile.bot
```

## Comandos

| Qué | Comando |
|---|---|
| Tests (obligatorio antes de commitear) | `cd server && npm test` |
| Server local sin Docker | `cd server && node server.js` |
| Docker (server) | `docker compose up --build -d minicraft` |
| Docker (server + bot) | `docker compose up --build -d` |
| Logs | `docker compose logs -f` |
| Apagar | `docker compose down` |

El juego queda en **http://localhost:3000**. Docker Desktop debe estar
corriendo (`docker info`); si el pipe no existe, abrir Docker Desktop y esperar
a que levante antes de buildear.

## Flujo obligatorio para cada feature

1. **OpenSpec primero.** Crear el change (`propose`) y trabajar contra sus
   specs/tasks. No implementar features sin change.
2. **TDD.** Test que falla primero, después el código. `cd server && npm test`
   tiene que quedar **todo verde** antes de commitear.
3. **Docker para aprobación (obligatorio, sin excepciones).**
   - Levantar: `docker compose up --build -d minicraft` (agregar el bot si el
     change lo toca: `docker compose up --build -d`).
   - Esperar a que responda: `Invoke-WebRequest http://localhost:3000` o
     `docker compose logs --tail 20`.
   - Avisar al usuario **qué mirar** y decirle que pruebe en
     http://localhost:3000.
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
  (`server/zombie.js`). La vida del jugador sigue siendo client-authoritative
  (el server relayea `hit` y clampea el daño a 6): no asumir anti-cheat.
- **Sin assets:** texturas por canvas procedural, sonidos por WebAudio. No
  agregar archivos binarios si se puede generar.
- **No commitear** `node_modules/`, `world.json` ni `data/` (están en
  `.gitignore`).
- Los tests son scripts Node planos (`server/test/*.mjs`), sin framework; se
  agregan a la cadena de `server/package.json` → `scripts.test`.
