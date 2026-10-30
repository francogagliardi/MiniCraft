# Design

## Context

Ver `proposal.md` — Why. Estado actual **verificado** en el código, que condiciona el enfoque:

- **El cactus ya existe como bloque, pero no como peligro.** `MELON=22` (`index.html:440`), su
  definición `[MELON]: { name:'Cactus 🌵', … cube:1 }` (`:577`) y su lugar en `INVENTORY` (`:591`)
  son los de un cubo sólido colocable y picable. **No hay worldgen de cactus**: el generador
  (`genWorld`, `:479-501`) solo produce terreno, árboles, flores, etc. Por eso el change no crea
  bloque, textura, dureza ni generación.
- **Daño y muerte actuales**: `damage(amount, cause)` (`:1631`) ignora admin y muerto, aplica
  invulnerabilidad con `godT` (0.6 s), resta vida, actualiza HUD, suena y llama a `die(cause)`.
  `die(cause)` (`:1643`) arma el cartel y hoy solo distingue `fall`; el resto cae en
  `Te derrotó ${cause}. ⚔️`.
- **Aparición actual**: `findSpawn()` (`:1796`) recorre una espiral desde `W/2,W/2`, exige
  `max(4, ceil(h))` celdas de aire y valida con `collidesAt(..., r, h)` usando `playerBox(mySkin)`.
  Se llama en `startGame` (`:3085`) y en `respawn` (`:1653`), así que un cambio en `findSpawn` cubre
  las dos entradas sin duplicar lógica.
- **Caja por aspecto**: `playerBox(skin)` (`:2008`) devuelve `{ r: 0.3*f, h: 1.8*f }` con
  `f = height/BASE_H`; `human` 0.3×1.8, `giant` ≈0.761×4.568, `small` ≈0.137×0.822.
  `collidesAt(px,py,pz,r,h)` (`:1595`) ya recibe la caja y consulta `solidAt` (`:1048`), que
  distingue sólidos, puertas, agua y aire.
- **Grilla y agua**: `get(x,y,z)` lee la celda y `WATER` es el id 12. El mundo del cliente ya tiene
  las ~24k ediciones aplicadas cuando corre `findSpawn`.
- **Autoridad de vida**: la vida del jugador local es client-authoritative; el server relayea
  `hit`/`phit` y cada cliente manda su `hp` en `pm`. El cambio no necesita nada del server.
- **Suite**: 19 archivos en `server/package.json`; los conteos/listados están hardcodeados en
  `server/test/lookguard.mjs:167-176`, `server/test/zombie-protocol.mjs:302-309` y también en
  `server/test/camera.mjs:290-304` (que afirma `count === 19` y el texto “19 archivos”).
- **Pestaña genérica**: el `<head>` (`index.html:3-14`) tiene `title`, un `manifest` data URI,
  `theme-color`, `apple-touch-icon` data URI y fuentes, pero **no hay `<link rel="icon">`**: por eso
  el navegador usa el fallback genérico de globo. El logo de la topbar no es una imagen, es CSS:
  `.logo-cube` (`index.html:47-49`) es un cuadrado de 30×30, `border-radius:8px`,
  `linear-gradient(135deg,#8bd450 0 50%,#9a6a45 50% 100%)` y sombras internas claras/oscuras.
- **Sin assets binarios**: las texturas son canvas procedural, los sonidos WebAudio y el cliente es
  un único `index.html`. `server/server.js:78-82` sirve estáticos con MIME limitado (`.html`, `.js`,
  `.css`, `.json`, `.png`, `.ico`; **no `.svg`**), así que un `logo.svg` externo exigiría tocar el
  server. Los iconos PWA existentes (`manifest`, `apple-touch-icon`) quedan fuera de este change.

## Goals / Non-Goals

**Goals:**

- Que el cactus colocado sea un peligro real y legible para el jugador local, sin tocar el bloque.
- Un único punto de aparición preferido, visible y compartido (`108·16·117`), validado por aspecto.
- Fallback determinista al comportamiento actual cuando el punto no sirve.
- Tests puros (sin navegador ni Docker) que cubran contacto y validación de spawn.
- Que la pestaña muestre el logo de Minicraft (mismo lenguaje visual que la topbar) sin assets.
- Cero cambios de protocolo, de mundo, de servidor y de bot.

**Non-Goals:**

- Dañar criaturas, animales o al bot.
- Generar cactus en el mundo o agregar un bioma.
- Spawn por usuario, comando `/setspawn` o persistencia del spawn.
- Anti-cheat o cooldown propio distinto de `godT`.
- Tocar los iconos PWA (`manifest`, `apple-touch-icon`) o agregar archivos de imagen.
- Cambiar el título de la página, el tema o el MIME del servidor.

## Decisions

### 1. Reutilizar el bloque existente, sin capa nueva de contenido

`MELON` (id 22) ya se llama `Cactus 🌵` y está en el inventario. Crear un id nuevo obligaría a
migrar `world.json`, `minicraft-save-v3` y las ediciones existentes, y a agregar textura y entrada de
inventario. Se usa el id 22 tal cual: el change solo agrega **comportamiento** en el cliente.

### 2. El daño reutiliza `damage(1, 'cactus')`

`damage` ya resuelve admin, muerto, invulnerabilidad de 0.6 s, HUD, sonido y muerte. Agregar un
cooldown propio duplicaría esa lógica y abriría la puerta a que los dos temporizadores se pisen. Con
1 HP por tick y `godT` de 0.6 s, el cactus hace **~1.67 HP/s** sostenido y 6 golpes para matar desde
10 HP. El `amount` queda en 1 y no se expone en UI.

### 3. Contacto = caja del aspecto contra celdas de cactus, con margen 0.06

El cactus es un cubo sólido: el jugador **nunca** puede solapar su celda, así que un test de
intersección exacta jamás dispararía. Se expande la caja del jugador en `0.06` por lado y se
consulta cada celda que toca (la celda de los pies y las que cubre el cuerpo, según `r` y `h` del
aspecto). Así:

- tocar el cactus **de costado** cuenta (la caja queda a menos de 0.06 de la cara);
- un cactus a 1 bloque de distancia no cuenta;
- un cactus **dentro** del cuerpo (colocado cuando el jugador estaba en otra parte) sí cuenta;
- el margen es chico a propósito: no daña por “cercanía” ni a través de una pared de 1 bloque.

### 4. Pararse arriba de un cactus no daña

La celda del cactus ocupa `[y, y+1]`; los pies del jugador parado arriba están en `y+1` (la
colisión lo apoya en la cara superior). Con la caja `[py, py+h]` y el margen de 0.06, el borde
inferior de la caja queda **por encima** de la celda y el barrido de celdas no la incluye, porque se
consulta por celda completa y no por cara. Caminar sobre un cactus es seguro; apoyarse en su costado
no. Es la diferencia entre “el cactus es una barrera” y “el cactus es una superficie caminable”, y
la decisión se documenta en la spec para que no se lea como bug.

### 5. Solo el jugador local, sin mensajes nuevos

Cada cliente evalúa su propia caja en su propio loop y llama a su `damage`. Es el mismo modelo de
confianza que ya usa la vida del jugador (client-authoritative): el server relayea `hit`/`phit` y no
valida daño. Los remotos ven la vida por el `pm` existente, así que no hay mensaje nuevo ni cambio de
protocolo. Zombis, animales y bot quedan explícitamente afuera: sus vidas son server-authoritative
(`server/zombie.js`) o locales (`animals`, `bot`) y no comparten la función `damage` del jugador.

### 6. `die` gana una rama `cactus`, no un sistema de causas

`die` ya recibe `cause` como string y ya tiene una rama por `fall`. Se agrega la rama `cactus` con
`Te pinchaste con un cactus. 🌵` y se deja el resto intacto. No se introduce un mapa de mensajes ni se
tocan los llamadores existentes (`fall`, nombres de jugadores).

### 7. Spawn preferido global, en el cliente, antes del espiral

`SPAWN_PREF = { x:108.5, y:16.01, z:117.5 }` son centros de bloque (`+0.5`) con el `+0.01` que ya
usa el espiral (`h+1.01`) para no quedar exactamente en el borde. `findSpawn()` lo prueba primero y
solo lo devuelve si pasa **todas** estas condiciones:

1. el bloque debajo de los pies (`floor(y)-1`) es sólido (`solidAt`);
2. la celda de los pies y todas las celdas del cuerpo no son agua (`get(...) !== WATER`);
3. `collidesAt(x, y, z, r, h)` es falso con la caja del aspecto actual;
4. el jugador no queda en contacto con un cactus (evita aparecer pinchándose).

Si alguna falla, sigue con el espiral actual, sin cambiar `max(4, ceil(h))` ni `collidesAt`. Como
`startGame` y `respawn` ya llaman a `findSpawn`, ambos usan el punto preferido sin código extra.

### 8. Por qué el spawn se elige en el cliente y no en el servidor

El mundo real (semilla + ~24k ediciones) se arma y se guarda en el cliente; el server no conoce la
topografía, ni los bloques colocados, ni la caja del aspecto del jugador. Validar en el server
obligaría a replicar el worldgen y el estado del mundo, y a cambiar el protocolo de aparición. El
spawn actual ya es una decisión del cliente: el change se apoya en eso y no toca `server.js`.

### 9. Por qué todos los jugadores y no un spawn por usuario

Un punto único y predecible es lo que hace útil la función: se ve en el topbar (`108·16·117`), sirve
de punto de encuentro y de referencia para pruebas y capturas. Un spawn por usuario (o persistido)
requiere estado nuevo, UI y decisiones de producto que este change no necesita. Si el punto no sirve
para un aspecto o un mundo, el fallback ya resuelve el caso sin intervención.

### 10. Alternativas descartadas

- **Daño server-side**: el server no simula la posición del jugador ni el contacto con bloques;
  hacerlo requeriría mover la física o duplicarla, y rompería el modelo client-authoritative actual.
- **AABB exacta sin margen**: nunca dispara, porque el cubo es sólido y bloquea el solape.
- **Margen grande o radio de proximidad**: dañaría a través de paredes y “por estar cerca”, y
  volvería insegura cualquier base con cactus decorativos.
- **Dañar también a mobs**: cambia el balance server-side, exige tocar `server/zombie.js` y el bot,
  y queda fuera del alcance confirmado.
- **Cactus natural / bioma desierto**: implica worldgen nuevo, migración de mundos y cambios de
  rendimiento; además haría impredecible dónde hay cactus.
- **Comando `/setspawn` o spawn por usuario**: estado nuevo, UI, permisos y protocolo; el problema
  que resuelve (punto de encuentro) lo resuelve una constante global.
- **Cooldown propio del cactus**: duplica `godT` y permite combinaciones raras con caída/zombis.

### 11. Estrategia de test

Un archivo nuevo, `server/test/cactus.mjs`, con el patrón de `server/test/skins.mjs`: extrae el
bloque `/* cactus:start */…/* cactus:end */` de `index.html` y lo evalúa con `new Function` **sin
THREE**, para probar los helpers puros de contacto y de validación de spawn. Encima, estáticos con
`grabFn`/regex sobre el HTML para el cableado (`tickCactus` en el loop, `damage(1,'cactus')`, rama de
`die`, `SPAWN_PREF` antes de la espiral, `respawn`/`startGame` usando `findSpawn`, ausencia de daño a
mobs y ausencia de worldgen de cactus). La suite pasa a **20 archivos**: se actualiza
`server/package.json` y los tres conteos hardcodeados (`lookguard.mjs`, `zombie-protocol.mjs`,
`camera.mjs`). RED primero (el archivo corre y falla por bloque ausente, no por sintaxis), después
GREEN.

El favicon se testea en el mismo `cactus.mjs` (no se agrega archivo, la suite sigue en **20**), con
asserts estáticos sobre el HTML: existe el `<link rel="icon">`, su `type` es `image/svg+xml`, el
`href` empieza con `data:image/svg+xml`, `decodeURIComponent(href)` produce un `<svg>` con `viewBox`,
un `<rect>` con `rx`, un `linearGradient` con la diagonal y los hex `#8bd450`/`#9a6a45`, y no hay
`href` a una URL externa. Los dos hex se comparan además contra el `background` de `.logo-cube` para
que el favicon y la topbar no se desincronicen.

### 12. Favicon SVG data URI, mismo lenguaje visual que `.logo-cube`

Se agrega en el `<head>` un `<link rel="icon" type="image/svg+xml" sizes="any">` cuyo `href` es un
SVG embebido como data URI: `viewBox="0 0 100 100"`, `<rect rx="24">`, un `linearGradient` con
**hard stop al 50 %** (`#8bd450` → `#9a6a45`) para reproducir la diagonal del logo, y un borde
interior blanco sutil (`stroke`/`inset` equivalente). Sin texto: a 16 px sería ilegible.

**Por qué data URI:** mantiene el cliente en un solo archivo, no requiere binarios ni una ruta o un
MIME nuevo en el server (que hoy no sirve `.svg`), funciona offline y el `<head>` ya usa data URIs
para el `manifest` y el `apple-touch-icon`.

**Por qué un `rel="icon"` explícito y no confiar en el `manifest`:** el `manifest` es para la
instalación/PWA; la pestaña necesita su propio link y los navegadores no garantizan usar el icono del
manifest como favicon.

**Alternativas descartadas:**

- **PNG/ICO**: binario en el repo, un tamaño fijo y peor nitidez al escalar; contradice la regla de
  no agregar assets generables.
- **`logo.svg` externo**: requiere agregar `.svg` al MIME de `server/server.js` y una request extra;
  además rompe el cliente de un solo archivo.
- **Dibujar el favicon con canvas en runtime**: no existe antes de que el documento termine de
  cargar, así que la pestaña parpadea con el ícono genérico y luego cambia.
- **Reusar el `manifest` o el `apple-touch-icon`**: no garantiza el ícono de la pestaña y mezcla el
  alcance PWA con el del favicon.

**Riesgos y mitigaciones:** los favicons SVG funcionan en Chrome, Edge y Firefox modernos, y el
fallback es el ícono actual (no se rompe nada); el navegador puede cachear el favicon viejo, así que
la verificación se hace con hard reload o cerrando la pestaña; a 16 px el contraste se cuida con el
borde claro y una diagonal simple; los iconos PWA siguen siendo los suyos porque quedan fuera de
alcance.

## Risks / Trade-offs

- **El `y` real del punto puede no ser 16.** `SPAWN_PREF.y = 16.01` asume que la superficie está en
  `y=15`; si la semilla o las ediciones dejan otra altura, la validación falla y se usa el espiral.
  El topbar trunca el `y`, así que muestra `16` aunque el jugador esté en `16.01`.
- **Mundo nuevo o mundo limpiado.** Si el punto queda en el aire, bajo agua o dentro de un bloque, el
  fallback espiral sigue funcionando; no hay crash ni spawn en el vacío. El riesgo residual es que el
  punto “de referencia” no sea el mismo en un mundo recién generado, y eso es esperado.
- **Jugador gigante.** La caja de 4.568 de alto no entra en un techo de 4: el preferido se descarta y
  el gigante aparece donde el espiral encuentre 5 de aire. El pequeño sí usa el preferido en el mismo
  hueco. Es la validación por aspecto funcionando, no un bug.
- **Cactus adyacente al punto.** Se descarta el preferido para no aparecer pinchándose, pero un
  jugador puede aparecer cerca y recibir daño al moverse: el margen de 0.06 es contacto real.
- **Contacto por roce.** El margen de 0.06 puede dañar al rozar una esquina; se acepta porque el
  cactus es sólido y el margen es el mínimo que hace detectable el contacto.
- **Cactus dentro de una base ajena.** El preferido es global: si el punto es válido, todos
  aparecen ahí, incluso si otro jugador construyó alrededor. Es la decisión de producto (punto de
  encuentro), no un defecto.
- **Conteos de la suite.** Cuatro archivos afirman 19; olvidar uno rompe `npm test` por un motivo
  que no tiene que ver con el change. El RED incluye el archivo nuevo y los conteos, así que el
  error aparece temprano.
- **Daño repetido y muerte.** Si el jugador muere por cactus, `die('cactus')` corta el loop de daño
  por `dead`; el respawn devuelve `godT = now + 2`, así que no se vuelve a pinchar al reaparecer.

## Migration Plan

- Sin migración de datos: `world.json` sigue con `{ seed, edits }`, `minicraft-save-v3` no cambia y
  las ediciones del mundo no se reinterpretan.
- Sin migración de protocolo: no se agregan mensajes ni campos; un cliente viejo sigue funcionando e
  ignora el daño de cactus.
- El cambio es compatible con mundos existentes: el cactus ya colocado empieza a dañar sin tocar el
  bloque, y el spawn preferido solo se usa si es válido en ese mundo.
- Si el usuario rechaza el spawn preferido después de probar, se revierte la constante y la
  validación sin tocar el resto del change.

## Open Questions

- ¿El cactus debería dañar también a zombis/animales en un change futuro? (fuera de alcance acá)
- ¿El spawn preferido debería configurarse por variable de entorno o comando en el futuro? (hoy
  constante global; no hay pedido)
