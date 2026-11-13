# Tasks

## 1. RED: guardas estáticas de pausa, muerte y logout

- [x] 1.1 En `server/test/static.mjs` (sección 9, líneas 616-617) reemplazar la aserción `btnLobby && btnLogout` por una que exija `btnLobby` dentro de `#pause` y prohíba `btnLogout` en todo `index.html`; verificar con `cd server && node test/static.mjs` que falla por esa aserción y no por sintaxis.
- [x] 1.2 Sumar en la misma sección la guarda de la muerte: el bloque `<div ... id="death">` contiene un botón con texto “Volver al lobby” y su handler navega a `/lobby`; verificar que falla contra el `index.html` actual.
- [x] 1.3 Sumar la guarda de que `index.html` no contiene `/api/logout` (ni el `fetch` ni el string) y que `lobby.html` conserva `logoutBtn` con `fetch('/api/logout')`; verificar que la de `index.html` falla y la del lobby pasa.
- [x] 1.4 Confirmar que el resto de la sección 9 y del archivo sigue verde: `cd server && node test/static.mjs` falla solo en las aserciones nuevas.

## 2. GREEN: salida al lobby desde la pantalla de muerte

- [x] 2.1 En `index.html` agregar dentro del `card` de `#death` el botón `<button class="btn btn-player" id="btnDeathLobby">Volver al lobby</button>` después de `#btnRespawn`, con el mismo padding inline que los otros botones; verificar que la aserción de muerte de `node test/static.mjs` pasa.
- [x] 2.2 Extraer `goLobby()` (`location.href='/lobby'`) y cablearla a `#btnLobby` y a `#btnDeathLobby`, sin llamadas a `/api/logout`; verificar con `node test/static.mjs` y con `Select-String -Path index.html -Pattern 'btnDeathLobby|goLobby'` que ambos botones usan la misma función.
- [x] 2.3 Agregar `.btn:focus-visible { outline:3px solid #4fae4f; outline-offset:2px }` y el bloque `@media (prefers-reduced-motion: reduce)` que desactiva transición y `translateY` de `.btn:hover`; verificar que el CSS nuevo no toca otras reglas (revisión del diff) y que `node test/static.mjs` sigue verde.

## 3. GREEN: retiro del cierre de sesión in-game

- [x] 3.1 Borrar el `<button id="btnLogout">` de `#pause` y su handler `onclick` en `index.html`; verificar con `node test/static.mjs` (asertiones de pausa y de `/api/logout`) y con `Select-String -Path index.html -Pattern 'logout'` que no queda ninguna coincidencia.
- [x] 3.2 Verificar que el cierre de sesión sigue disponible donde corresponde: `lobby.html` conserva `#logoutBtn` y su `fetch('/api/logout')`, y el server sigue exponiendo la ruta (`cd server && node test/http-auth.mjs`).
- [x] 3.3 Dejar registrado el retiro intencional en los artefactos: confirmar que `openspec/changes/ui-muerte-lobby/specs/ui/game-menu/spec.md` y `design.md` lo explican; verificar con `openspec validate ui-muerte-lobby --strict`.

## 4. Verificación de integración

- [x] 4.1 Correr `cd server && npm test` y verificar que toda la suite queda verde sin cambiar la cantidad de archivos de test.
- [ ] 4.2 Probar en el navegador el recorrido completo (puede ser con Docker del bloque de aprobación): morir y volver al lobby sin cerrar sesión; pausa sin “Cerrar sesión”; Tab con foco visible en ambos botones; 360 px de ancho sin scroll horizontal; toque en móvil al primer intento.

## Workflow follow-up

- Levantar Docker para la aprobación del usuario: `ADMIN_PASSWORD=<clave> docker compose up --build -d minicraft` (los bots corren in-process, no hay servicio extra), esperar a que responda `http://localhost:3000` y avisar en el mismo mensaje el link y la cuenta admin de esa corrida, más qué mirar: pantalla de muerte con “Volver al lobby”, pausa sin “Cerrar sesión” y lobby con su logout.
- No commitear, no pushear ni archivar hasta la aprobación explícita.
- Al aprobar: `docker compose down`, commit en español (`feat(ui): volver al lobby desde la muerte y quitar el logout de la pausa`), `git push` a `main`, `openspec archive ui-muerte-lobby` y verificar que `git status` quede limpio.
- Si el usuario pide cambios después de probar: corregir, volver a levantar Docker y esperar una nueva aprobación.
