# Design

## Context

Ver `proposal.md` para el motivo. Estado actual que condiciona la implementación:

- `index.html` (cliente único, inline, sin build) contiene los overlays `#pause` (`index.html:335-344`: `#btnResume`, `#btnConfig`, `#btnLobby`, `#btnLogout`) y `#death` (`index.html:370-376`: `#btnRespawn`).
- Los handlers viven al final del módulo: `btnLobby` navega con `location.href='/lobby'` y `btnLogout` hace `fetch('/api/logout')` + `location.replace('/login')` (`index.html:4213-4218`). `btnRespawn` se cablea junto a `respawn()` (`index.html:2284`).
- Los botones de los overlays usan `.btn .btn-player` con estilos inline (`width:auto;padding:14px 50px;margin-top:10px`) (`index.html:153-158`). Solo `.skinBtn` tiene `:focus-visible`; `.btn` no. No hay bloque `prefers-reduced-motion` en el cliente.
- `lobby.html` tiene su propio `#logoutBtn` con `fetch('/api/logout')` (`lobby.html:188, 348-352`) y no se toca.
- La guarda estática `server/test/static.mjs:616-617` exige hoy `btnLobby` **y** `btnLogout` en `index.html`; hay que invertir la segunda mitad.
- Restricciones del proyecto: protocolo aditivo, sin frameworks, sin assets binarios, tests Node planos en `server/test/*.mjs` y suite encadenada en `server/package.json`.

## Goals / Non-Goals

**Goals:**

- Una salida al lobby desde la pantalla de muerte que no cierre sesión.
- Dejar el cierre de sesión exclusivamente en el lobby, sin caminos alternativos en el juego.
- Reutilizar el lenguaje visual y los handlers existentes en lugar de introducir componentes nuevos.

**Non-Goals:**

- Nuevos mensajes de protocolo, endpoints o cambios en `server/`.
- Confirmación modal, guardado explícito del mundo o telemetría de la salida.
- Rediseñar los overlays, el lobby o el panel de configuración.

## Decisions

### 1. Id propio y handler compartido

Se agrega `<button class="btn btn-player" id="btnDeathLobby" style="width:auto;padding:14px 50px;margin-top:10px">Volver al lobby</button>` dentro del `card` de `#death`, después de `#btnRespawn`. Se extrae `goLobby()` (`location.href='/lobby'`) y ambos botones (`#btnLobby` y `#btnDeathLobby`) la usan, en vez de duplicar la navegación.

Un id distinto es obligatorio: no se pueden repetir ids y `static.mjs` busca identificadores concretos. Reutilizar `#btnLobby` habría requerido mover el nodo entre overlays, lo que rompe el HTML estático y complica el foco.

### 2. Retiro del logout in-game, no ocultamiento

Se elimina el `<button id="btnLogout">` y su bloque `onclick`, no se lo oculta con CSS ni se lo deshabilita. Un botón oculto seguiría exponiendo el fetch de logout en el cliente y la guarda estática no podría garantizar la regla. La spec `ui/game-menu` documenta el retiro como decisión de producto: el logout es una acción de cuenta y vive en el lobby.

### 3. Estilo y accesibilidad mínimos y locales

- `.btn:focus-visible { outline:3px solid #4fae4f; outline-offset:2px }`, mismo tratamiento que `.skinBtn` (`index.html:170`), para que ambos botones de la muerte sean alcanzables por teclado.
- Bloque `@media (prefers-reduced-motion: reduce)` que desactiva la transición y el `translateY` de `.btn:hover`, sin tocar el resto de las animaciones del juego.
- Área táctil: el padding existente (`14px 50px`) ya supera 44 px de alto; se conserva el patrón inline de los otros botones para no introducir reglas nuevas por overlay.
- En pantallas angostas el `card` ya es `width:calc(100% - 40px)` con `max-height:92vh; overflow:auto` (`index.html:146-148`), así que dos botones apilados entran sin scroll horizontal. No hace falta media query nueva.

Alternativa descartada: un contenedor flex en fila para “Reaparecer” y “Volver al lobby”. Se ve mejor en desktop, pero obliga a tocar el ancho de ambos botones y el layout móvil; apilarlos mantiene el patrón actual del `card`.

### 4. Tests estáticos en la guarda existente

No se crea un archivo de test nuevo (evita cambiar el conteo de la suite). Se actualiza la sección 9 de `server/test/static.mjs`:

- Reemplazar la aserción `btnLobby && btnLogout` por: `#pause` conserva `btnLobby` y **no** contiene `btnLogout`.
- Sumar: `#death` contiene `btnDeathLobby` con texto “Volver al lobby” y su handler navega a `/lobby`.
- Sumar: `index.html` no contiene `fetch('/api/logout')` ni `/api/logout` en absoluto.
- Sumar: `lobby.html` conserva `logoutBtn` y su `fetch('/api/logout')`.

Se escribe primero la guarda nueva y se la ve fallar (RED) contra el `index.html` actual; después se implementa (GREEN).

### 5. Sin cambios de servidor ni de protocolo

La navegación a `/lobby` es un `GET` normal sobre una ruta que ya exige sesión (`ui/lobby`), así que no hay endpoint nuevo ni mensaje WebSocket nuevo. La sesión sigue viva y el lobby la usa tal cual.

## Risks / Trade-offs

- **Un usuario puede querer cerrar sesión sin pasar por el lobby** → es el comportamiento pedido; el lobby está a un click desde ambos botones y el costo de un click extra es menor que el de terminar la sesión por error dentro de la partida.
- **Salir desde la muerte sin pasar por `respawn()` deja al jugador “muerto” en el mundo** → la navegación descarga el cliente; al volver a entrar por `/game` el estado se reconstruye y el server ya recibe el `move` de la partida nueva. No hay estado que limpiar en el cliente.
- **La guarda estática puede quedar laxa si alguien reintroduce el logout con otro id** → la aserción prohíbe la cadena `fetch('/api/logout')` completa en `index.html`, no solo el id.
- **El bloque de movimiento reducido es global para `.btn`** → se limita a la transición y al hover de los botones; no altera animaciones de juego ni el HUD.
