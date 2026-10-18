# Proposal

## Why

El proyecto ya validó en producción que un cliente WebSocket externo puede entrar a Minicraft y jugar con el mismo protocolo que `index.html` (los bots `bot-duelo.mjs`/`bot-jugar.mjs` funcionaron), pero esa lógica quedó **fuera del repo, sin versionar ni testear**. Se quiere un **bot cazador** permanente (un robot humanoide que persigue y fulmina jugadores) que viva en el mundo 24/7 como huésped de solo lectura, se pueda **comandar por chat** y se opere como **servicio Docker en Easypanel**.

Tres hechos del estado actual condicionan el diseño. **(1)** El render del avatar remoto lo hace **cada cliente** (`makeAvatar`, `index.html:1880`): para que los demás vean un robot hace falta un campo de aspecto nuevo que viaje por el protocolo, igual que ya viaja `held`. **(2)** El PvP **no es server-authoritative**: `hit` no valida distancia ni cadencia y el server **clampa `dmg` a 6** (`server.js:296`); el daño lo aplica el cliente de la víctima (`index.html:2600-2608`), que además da **0.6 s de invulnerabilidad tras cada golpe** (`index.html:1565`). El bot explota esa falta de validación de forma **acotada y deliberada**: pega dos veces con `dmg: 6`, separadas ≥0.65 s para respetar la ventana del cliente (6 + 6 = 12 > 10 ⇒ muerte en ~0.65 s), **sin** aflojar el clamp del server ni tocar la ventana del cliente. **(3)** El frame `chat` **no trae el id del emisor** (`server.js:309` difunde `{ t:'chat', from: me.name, text }`) y los nombres los elige el cliente y son **suplantables** (`cleanName`, `server.js:143`): sin un id autoritativo, cualquiera que se ponga el nombre de un admin podría comandar al bot.

## What Changes

- **Servicio bot nuevo, versionado y testeado** en `bot/` (`bot/cazador.js` con la lógica pura + `bot/index.js` con el cableado de red/reconexión), **sin compartir el grafo de `require` del server** (nunca `require` de `server/server.js` ni `server/zombie.js`; solo la dependencia de terceros `ws`). Reusa el truco validado de **extraer el bloque `/* worldgen:start */…/* worldgen:end */` de `index.html`** con `new Function` + `WG.genWorld(buf, seed)` + los `edits` del `welcome`, para tener **colisión de terreno** al perseguir.
- **Aspecto robot humanoide (requisito 1)**: el bot manda `skin:'robot'` en su `hello`; el server lo guarda y lo difunde al resto (`welcome.players`, `join` y también `pm`); `index.html` gana una **rama de modelo robot low-poly** (metálico, ojos brillantes, antena) en el render de avatares remotos, en un bloque marcado para poder testearlo.
- **Mata de dos toques separados, sin tocar el server ni el cliente (requisito 2)**: emite un `hit` de `dmg: 6` y **repite contra la misma víctima recién cuando pasaron ≥0.65 s** del golpe anterior, hasta verla muerta (`dead === 1`) — porque el cliente descarta un segundo golpe dentro de la ventana de 0.6 s (`index.html:1565`): 6 + 6 = 12 > 10 ⇒ la vida baja de 10 a 0 en ~0.65 s. Cada toque es un ataque separado que sube `seq` una vez. El **clamp anti-cheat del server y la ventana del cliente quedan intactos** a propósito.
- **Velocidad doble (requisito 3)**: se mueve al **200 %** de la velocidad del jugador (`4.8` ⇒ `9.6` unidades/s; el zombi usa el 50 %).
- **Invulnerabilidad (requisito 4)**: ignora todo `phit`; reporta siempre `hp:10, dead:0`; no lo afecta el daño de caída; si cae al vacío (`y < -10`) se teletransporta al spawn (igual que el cliente).
- **Sin presas vuelve al spawn y se queda quieto (requisito 5)**: quieto = **misma `pos`**, pero **sigue mandando `mv`** para no comerse el idle-kick de 90 s (`server.js:179`).
- **Comandos solo-admin, con autoridad por id del server (requisito 6)**: `sigueme` (y su variante `seguime`) ⇒ sigue al admin que lo ordenó; si ese admin se va, vuelve al modo normal. `espera` ⇒ lo deja clavado (turreta: mata a quien se le acerque). Match **exacto** del mensaje (trim + case-insensitive), sin prefijo. El bot **anuncia por el chat** los cambios de modo y las kills.
- **Nunca ataca admins (requisito 7)**: presa = jugador `mode !== 'admin'` y `dead === 0`.
- **Solo ataca dentro de alcance (requisito 8)**: techo duro `≤4.6`; se acerca de verdad para que la víctima **vea** al robot al lado.
- **Cero `edit` (requisito 9)**: el mundo tiene 23807 edits reales; el bot es huésped de solo lectura.
- **Cambio chico en el server (aditivo, backwards-compatible) para el `fromId` (requisito 11)**: el broadcast del `chat` del jugador pasa de `{ t:'chat', from: me.name, text }` a incluir `fromId: me.id` (`server.js:309`). Los clientes que lo ignoren no se rompen y `server/test/protocol.mjs:173` (solo asierta `ch.from`/`ch.text`) sigue verde.
- **Docker/Easypanel 24/7 (requisito 10)**: `Dockerfile.bot` (no rompe la imagen actual del server) + segundo servicio `minicraft-bot` en `docker-compose.yml` (`restart: unless-stopped`, `depends_on: minicraft`), con **reconexión automática con backoff** (sin martillar) y **re-`hello`** al reconectar. Env: `SERVER_URL` (default interno `ws://minicraft:3000`), `BOT_NAME` (default `OPSX-bot`).
- **Tests de integración sobre WS real** (`server/test/bot-cazador.mjs`, estilo `zombie-protocol.mjs`) que cubren los criterios (a)-(j): kill de un no-admin con dos toques separados, ignorar a un admin, `sigueme`/`espera`, **seguridad** (comando de un no-admin con el nombre del admin es ignorado), invulnerabilidad, velocidad doble, reconexión, cero `edit`, `skin:'robot'` difundido y el modelo robot del cliente. **Alta en la suite**: `server/package.json` + los **dos** asserts de conteo (`zombie-protocol.mjs:287-289` y `lookguard.mjs:171-175`), **14 → 15 archivos**.

## Capabilities

### New Capabilities

- `bots/hunter`: el contrato observable del bot cazador — a quién persigue y a quién nunca ataca, con qué reglas de combate pelea (golpe mortal de dos toques separados por la ventana del cliente, 6 + 6 = 12 de daño, alcance ≤4.6, velocidad 200 %), que sea invulnerable y se reporte siempre `10/0`, que vuelva al spawn y quede quieto manteniendo el keepalive `mv`, que **nunca** edite el mundo, su **máquina de estados** (CAZA/ESPERA/SIGUEME con su precedencia), los comandos de chat `sigueme|seguime|espera` autorizados por el **id del server** (no por nombre) con su anuncio, y el contrato de operación como servicio 24/7 (reconexión con backoff + re-`hello`).

### Modified Capabilities

- `net/presence`: el frame `chat` del jugador SHALL llevar el **id asignado por el server** (`fromId`) además del nombre, para que un consumidor pueda autorizar por identidad y no por el nombre suplantable. Es un cambio de comportamiento observable del protocolo (campo nuevo aditivo en un frame existente).
- `net/avatar`: el avatar remoto SHALL conocer y renderizar el **aspecto (`skin`) del jugador**, con una variante **robot humanoide** para quien lo declare, del mismo modo que ya renderiza el `held`. Es un cambio observable del protocolo (campo nuevo `skin` en `welcome.players`/`join`/`pm`) y del render de avatares remotos.

## Impact

- **`bot/cazador.js`** (nuevo, CommonJS `.js`): lógica pura y testeable (selección de presa no-admin viva, persecución con colisión de terreno, golpe mortal de dos toques separados ≥0.65 s (`dmg: 6`), velocidad 9.6, invulnerabilidad, máquina de estados CAZA/ESPERA/SIGUEME, parser de comandos resolviendo admin por id, retorno al spawn, armado de frames `hello`/`mv`/`hit`/`chat`, keepalive). Inyecta `send`/`now`/RNG ⇒ determinista en tests.
- **`bot/index.js`** (nuevo, CommonJS `.js`): cableado de red (WebSocket `ws`), extracción del worldgen de `index.html`, `hello` (con `skin:'robot'`), manejo de `welcome`/`join`/`pm`/`chat`/`pedit`/`zs`/`leave`, reconexión con backoff + re-`hello`, env (`SERVER_URL`, `BOT_NAME`), entrada CLI.
- **`server/server.js`** (dos puntos, aditivos): `fromId: me.id` en el broadcast del `chat` (`:309`); guardar `skin` del `hello` (`:249-254`) y difundirlo en `welcome.players` (`:263`), `join` (`:265`) y `pm` (`:282`). **No se afloja** el clamp de `hit` (`:296`) ni el resto del protocolo.
- **`index.html`**: rama de modelo robot en `makeAvatar` (`:1880`) + bloque marcado (p. ej. `/* robot:start */…/* robot:end */`) para que el test lo extraiga con `new Function`; `addRemote`/`applyPm` propagan `skin` con guardas para clientes viejos.
- **`server/test/bot-cazador.mjs`** (nuevo): integración (a)-(j) sobre WS real.
- **`server/test/client-robot.mjs`** (nuevo, si se separa (j) del WS): asierta el modelo robot extraído de `index.html`. (Se puede fusionar en `bot-cazador.mjs`; la suite cuenta archivos, así que se decide exactamente cuántos nuevos entran.)
- **`server/package.json`**: alta del/los test(s) nuevos en `scripts.test` (14 → 15 o 16).
- **`server/test/zombie-protocol.mjs:287-289`** y **`server/test/lookguard.mjs:171-175`**: subir los dos asserts de conteo (14 → 15/16, tests nuestros, editables). Los pre-existentes `static.mjs` y `protocol.mjs` **no se tocan**.
- **`Dockerfile.bot`** (nuevo): imagen del bot (instala `ws`, copia `bot/` + `index.html`); **no** toca el `Dockerfile` del server.
- **`docker-compose.yml`**: segundo servicio `minicraft-bot` (`restart: unless-stopped`, `depends_on: minicraft`, env `SERVER_URL`/`BOT_NAME`).
- **`README.md`**: documentar el servicio bot, sus env, los comandos de chat y el deploy en Easypanel.
- **No afectado**: el `Dockerfile` del server, `world.json`/`edits`, `server/zombie.js`, el bloque `worldgen`, el clamp de `hit`, y los tests pre-existentes `static.mjs`/`protocol.mjs`.
