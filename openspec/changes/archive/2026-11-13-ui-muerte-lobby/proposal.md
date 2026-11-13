# Proposal

## Why

Cuando el jugador muere solo tiene una salida: **Reaparecer**. Si quería salir del mundo y volver al lobby, debía recargar el navegador o abrir la pausa. Además, el menú de pausa tiene un botón **“Cerrar sesión”** que duplica el que ya existe en el lobby y deja la acción destructiva (terminar la sesión) dentro de la partida, a un click de un botón de juego.

Este change alinea las dos salidas del juego: el lobby pasa a ser el **único** lugar donde se cierra sesión, y la pantalla de muerte gana la salida natural al lobby sin perder la sesión.

## What Changes

- **Pantalla de muerte (`#death`):** se agrega el botón **“Volver al lobby”** junto a “Reaparecer”. Navega a `/lobby` (`location.href`) y **no** cierra sesión ni llama a `/api/logout`.
- **Menú de pausa (`#pause`):** se retira el botón `#btnLogout` (“Cerrar sesión”) y su handler. **BREAKING (UX):** quién quiera cerrar sesión lo hará desde el lobby, que conserva su botón y su `POST /api/logout`.
- **Sin otros caminos de logout in-game:** `index.html` deja de hacer `fetch('/api/logout')` en cualquier ruta; el cierre de sesión queda fuera del juego a propósito.
- **Coherencia visual y accesibilidad:** el botón nuevo usa el mismo estilo que “Reaparecer” (`.btn .btn-player`), tiene foco visible por teclado, área táctil de al menos 44 px y funciona en desktop y táctil. Se apilan ambos botones sin romper el layout del `card` en pantallas chicas.
- **Spec nueva `ui/game-menu`:** documenta qué acciones ofrece la pausa, qué ofrece la pantalla de muerte, dónde vive el logout y las reglas de estilo/accesibilidad de esos overlays.
- **Tests estáticos:** se actualiza la guarda de `server/test/static.mjs` para exigir el botón de lobby en la muerte, la ausencia de `#btnLogout` y de `fetch('/api/logout')` en `index.html`, y el logout intacto en `lobby.html`.

## Capabilities

### New Capabilities

- `ui/game-menu`: overlays de menú del cliente de juego (`index.html`): menú de pausa y pantalla de muerte. Define qué acciones ofrece cada uno, que el cierre de sesión no vive dentro de la partida, y las reglas de estilo táctil, foco visible y composición de botones.

### Modified Capabilities

- Ninguna. `ui/lobby` ya exige el botón de cerrar sesión y `ui/config` describe el panel de configuración de la pausa; este change no cambia lo que esas specs exigen, solo agrega la capability que faltaba para los overlays del juego.

## Impact

- **Código:** `index.html` (marcado de `#death`, borrado de `#btnLogout` y su handler, handler del botón nuevo, CSS de foco). Ningún cambio en `server/`, protocolo, base de datos ni Docker.
- **Tests:** `server/test/static.mjs` (sección 9 de auth-usuarios-lobby) cambia su aserción de la pausa y suma las de muerte, logout in-game y lobby.
- **Specs:** nueva `openspec/specs/ui/game-menu/spec.md` al archivar.
- **Compatibilidad:** protocolo intacto (no hay mensajes nuevos); clientes viejos siguen funcionando. El cambio es solo de UI.
- **Fuera de alcance:** confirmación modal antes de salir, guardado explícito del mundo antes de navegar, logout por inactividad, cambios en `lobby.html`, `login.html`, `register.html` y cualquier endpoint nuevo.
