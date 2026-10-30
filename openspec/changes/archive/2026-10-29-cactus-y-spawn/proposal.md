# Proposal

## Why

El bloque `Cactus 🌵` (id 22, `MELON`) hoy es decorativo: se coloca, se pica y no pasa nada, así que
no representa ningún peligro. Al mismo tiempo, el punto de aparición sale de una espiral alrededor
del centro del mundo: no es un lugar conocido ni fácil de compartir, y complica las pruebas y los
puntos de encuentro entre jugadores. Agregar daño por contacto y un spawn preferido explícito da
consecuencia al cactus y un punto de referencia estable sin tocar el mundo ni el servidor.
Además, la pestaña del navegador muestra un ícono genérico de globo porque el `<head>` no declara
ningún `rel="icon"`: el logo de la topbar no se refleja ahí.

## What Changes

- El bloque `Cactus 🌵` daña al **jugador local** al entrar en contacto: 1 HP por tick, usando la
  regla de invulnerabilidad existente de 0.6 s (máximo ~1.67 HP/s). No cambia el bloque, su id, su
  nombre, su textura, su dureza, su inventario, su colocación ni la generación del mundo.
- El daño usa la **caja de colisión del aspecto** del jugador más un margen chico de contacto
  (0.06), porque el cactus es sólido y el jugador no puede solaparlo: tocarlo de costado cuenta.
  Pararse **arriba** de un cactus no daña (la caja no intersecta la celda del bloque).
- La muerte por cactus tiene su propio mensaje: `Te pinchaste con un cactus. 🌵` (causa `cactus`).
- Solo el **jugador local**: cada cliente aplica el daño a su propio jugador y los demás ven el `hp`
  actualizado por el `pm` existente. Zombis, animales y bot **no** reciben daño de cactus.
- Se agrega el spawn preferido **`SPAWN_PREF = { x:108.5, y:16.01, z:117.5 }`** (centros de bloque;
  el topbar muestra `108·16·117` porque trunca el `y`). `findSpawn()` lo prueba **primero** y lo usa
  solo si el bloque de abajo es sólido, los pies y el cuerpo no son agua, la caja del aspecto no
  colisiona y no queda en contacto con un cactus. Si falla, cae al espiral actual.
- El spawn preferido es **global para todos los jugadores**, aplica al iniciar y al respawnear, y
  cada cliente lo valida con la caja de su propio aspecto (el gigante no aparece en un techo de 4 y
  el pequeño sí entra). No es un comando `/setspawn` ni un spawn por usuario.
- Se agrega `server/test/cactus.mjs` como archivo **20** de la suite y se actualizan los conteos y
  listados hardcodeados de 19 a 20.
- La pestaña SHALL mostrar el logo de Minicraft mediante
  `<link rel="icon" type="image/svg+xml" sizes="any" href="data:image/svg+xml,...">`.
- El SVG es un cuadrado redondeado con división diagonal `#8bd450` (arriba a la izquierda) y
  `#9a6a45` (abajo a la derecha) y un borde interior claro sutil: el mismo lenguaje visual de
  `.logo-cube` de la topbar.
- Es un data URI autocontenido: no agrega archivos `.svg`, `.png` ni `.ico`, no toca el MIME del
  servidor ni el `manifest`/`apple-touch-icon`.

## Capabilities

### New Capabilities

- `blocks/cactus`: comportamiento del bloque `Cactus 🌵` como peligro de contacto para el jugador
  local (daño, invulnerabilidad, muerte, exención de criaturas y ausencia de worldgen), sin cambiar
  el bloque en sí.
- `ui/branding`: favicon de la pestaña con el logo de Minicraft, embebido como data URI y sin
  assets externos.

### Modified Capabilities

- `player/physics`: la aparición gana un spawn preferido validado por aspecto antes del fallback en
  espiral; el fallback y su regla `max(4, ceil(h))` no cambian.

## Impact

- `index.html`: nuevo bloque autocontenido `/* cactus:start */…/* cactus:end */` con la constante del
  cactus, el margen de contacto y los helpers puros de contacto; `tickCactus()` en el loop; rama
  `cactus` en `die`; `SPAWN_PREF` y la validación previa en `findSpawn`. El bloque id 22
  (`MELON`) y `DEFS[MELON]` **no se tocan**. No se toca el servidor, ni el bot, ni la red.
- `index.html` (`<head>`): nuevo `<link rel="icon">` con el SVG del logo como data URI. El resto del
  `<head>` (`title`, `manifest`, `theme-color`, `apple-touch-icon`, fuentes) no se toca. No hay
  archivo de imagen nuevo, ruta nueva ni cambio en el MIME de `server/server.js`.
- Tests: nuevo `server/test/cactus.mjs` (archivo 20) con casos puros de contacto y spawn, más
  estáticos de cableado y el assert estático del favicon (link, data URI, colores y diagonal). No se
  agrega un archivo de test extra: la suite sigue en 20. `server/package.json`,
  `server/test/lookguard.mjs`, `server/test/zombie-protocol.mjs` y `server/test/camera.mjs` pasan de
  19 a 20.
- Sin migración de datos: `minicraft-save-v3`, `world.json` y las ediciones no cambian de formato.
- `README.md`: si documenta el cactus o el spawn, se actualiza en el mismo change (ver tasks).

## Out of Scope

- **No** se daña a zombis, animales ni al bot cazador: el cactus solo afecta al jugador local.
- **No** se agrega generación natural de cactus ni bioma desierto: el bloque solo existe si un
  jugador lo coloca.
- **No** se crea un bloque nuevo, textura nueva ni entrada de inventario nueva: se reutiliza el
  bloque id 22 ya existente.
- **No** se toca el servidor: ni autoridad de vida, ni `hit`/`phit`, ni validación de spawn.
- **No** hay comando `/setspawn`, spawn por usuario, ni persistencia del spawn en el mundo.
- **No** se agrega anti-cheat ni cooldown propio distinto de `godT`.
- **No** se tocan los iconos PWA (`manifest` y `apple-touch-icon`): este change solo agrega el
  favicon de la pestaña.
- **No** se agrega un `.svg`, `.png` ni `.ico` externo, ni se cambia el MIME de
  `server/server.js`: el favicon es un data URI dentro de `index.html`.
- **No** se cambia el título de la página ni el tema/`theme-color`.
