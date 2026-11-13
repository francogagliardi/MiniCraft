# Proposal

## Why

El juego (`/game`, `index.html`) quedó fuera de la identidad visual que ya comparten login, registro, lobby y admin. Su UI inline usa colores sueltos y superficies claras pensadas para el menú, mientras el resto del producto tiene tokens, tema claro/oscuro persistente y estados de foco. El resultado es una UI que se ve de otra aplicación, que en tema oscuro no acompaña al resto y que pierde legibilidad sobre el cielo, el agua y la noche porque el HUD confía en un único scrim.

Este change lleva el sistema de diseño compartido al juego y sincroniza su tema, sin tocar el render 3D ni el gameplay.

## What Changes

- **Sistema de diseño de la UI del juego:** se agregan tokens CSS de color, tipografía, espaciado, radios, sombras, foco, hover y scrims, derivados de los tokens de `login.html`/`lobby.html`, con variantes `dark` y `light`. Viven solo en `index.html` y solo aplican a la UI (no al canvas).
- **Tema sincronizado:** `index.html` declara `data-theme` temprano y lo resuelve desde `localStorage` (`mc-theme`) antes del CSS, igual que las demás páginas. El default sin preferencia es oscuro. Un control “Tema” (claro/oscuro) en el panel de configuración cambia el tema en caliente, actualiza `mc-theme` y el `<html>`, sin recargar.
- **Superficies unificadas:** menú inicial de archivo local, pausa, configuración (sliders, select, checkbox), muerte, chat, inventario, hotbar, toasts, HUD (vida, FPS/ping, hints, lista de jugadores, crosshair, indicadores), overlay de dormir y loading.
- **Contraste sobre 3D:** paneles de modal sólidos o semiopacos; HUD con scrim oscuro y texto claro en ambos temas, con sombra/contorno y bordes visibles; el crosshair no depende del color. Se define un contraste mínimo AA y un fallback sin `backdrop-filter`.
- **Accesibilidad y responsive:** `:focus-visible` en todos los controles, `prefers-reduced-motion`, objetivos táctiles de al menos 44 px en acciones (con la excepción documentada de la hotbar de 9 slots), y 360 px sin scroll horizontal. No se rediseñan los controles táctiles ni el gameplay.
- **Rendimiento:** se retira `backdrop-filter` de las superficies del HUD siempre visibles y se reserva para los modales pausados; el CSS nuevo es liviano y no altera la calidad gráfica.
- **Tests estáticos** en `server/test/static.mjs`: tokens, `data-theme`, script pre-CSS, control de tema, foco, reduced-motion, contraste declarado y ausencia de blur en HUD. La revisión visual en Docker queda como criterio de aceptación.

**Fuera de alcance:** render 3D, texturas, sonidos, luces, cámara, física, protocolo, nombres/funciones del juego, controles táctiles y Mundo Infinito.

## Capabilities

### New Capabilities

- `ui/game-theme`: sistema de diseño y tema de la UI del cliente de juego: tokens compartidos, variantes claro/oscuro, sincronización con `mc-theme` sin flash, reglas de contraste y legibilidad sobre el canvas 3D, foco/reduced-motion/responsive de las superficies del juego y presupuesto de rendimiento de la UI.

### Modified Capabilities

- `ui/config`: el panel de configuración suma la fila “Tema” con su control accesible, persistencia en `mc-theme` y aplicación en caliente.
- `ui/hud`: el HUD pasa a consumir tokens del sistema y garantiza legibilidad y contraste sobre cielo, agua y noche sin alterar el render.
- `ui/inventory`: el panel, la grilla y el botón “Listo” consumen los tokens del sistema y cumplen foco, contraste y responsive.
- `ui/game-menu`: pausa, configuración, muerte y menú inicial de archivo local consumen los tokens del sistema, con foco visible, reduced-motion y composición responsive.

## Impact

- **Código:** `index.html` únicamente (bloque `<style>` y su HTML ya existente, script inline de tema antes del CSS, fila “Tema” en `#configPanel` y su handler). No se toca `server/`, el protocolo, la base de datos ni Docker. `login.html`, `register.html`, `lobby.html` y `admin.html` no cambian.
- **Tests:** se extiende `server/test/static.mjs` con una sección nueva; no se agrega un archivo de test, por lo que no cambia el conteo de la suite.
- **Specs:** nueva `openspec/specs/ui/game-theme/spec.md` y deltas de `ui/config`, `ui/hud`, `ui/inventory` y `ui/game-menu` al archivar.
- **Compatibilidad:** solo UI; no hay mensajes nuevos ni cambios de protocolo. El canvas y el gameplay quedan intactos.
- **Fuera de alcance:** `ui/branding` (favicon) no cambia; tampoco el tema de las páginas de login, registro, lobby o admin.
