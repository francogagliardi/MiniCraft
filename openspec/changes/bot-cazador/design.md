# Design

## Context

Ver `proposal.md` — Why. Estado actual **verificado** leyendo el código, que condiciona el enfoque:

- **Protocolo** (`server/server.js:230-311`): cliente→server `hello|mv|edit|hit|zhit|chat`; server→cliente `welcome{id,seed,edits,admin,players}|join{...,mode,...}|pm{...}|pedit|phit|zs|tod|chat|leave|hitok|zhitok`. El bot es **un cliente más**: no necesita protocolo nuevo, sólo dos campos aditivos (`fromId` en `chat`, `skin` en `hello`/`join`/`pm`/`welcome.players`).
- **El `chat` no identifica al emisor**: `server.js:309` difunde `{ t:'chat', from: me.name, text }`. El nombre lo elige el cliente y es suplantable (`cleanName`, `server.js:143`).
- **El cliente ignora campos extra del `chat`**: `index.html:2599` hace `chatMsg(m.from,m.text)` ⇒ agregar `fromId` es **aditivo**; no requiere tocar `index.html`.
- **PvP no server-authoritative**: `mv` lleva `hp`/`dead` y el server confía (`server.js:273-282`); `hit` no valida alcance ni cadencia, **clampa `dmg` a 6** (`server.js:296`) y el daño aterriza en la víctima vía `phit` ⇒ lo aplica `damage()` del cliente (`index.html:1562`), que corta con `if(isAdmin()||dead) return;` y con una **ventana de invulnerabilidad de 0.6 s** (`index.html:1565`, `if(now-godT<.6) return;`).
- **Vida del jugador = 10**; `MAXHP=10`; muerte anuncia `💀 <name> murió` desde el cliente de la víctima (`die()`, `index.html:1574`).
- **Velocidad del jugador**: `sp = (keys.ShiftLeft && !player.fly) ? 7.4 : 4.8` (`index.html:1607`). El zombi usa `SPEED = 2.4` = **50 %** de los 4.8 del jugador (`server/zombie.js:12`). ⇒ Bot = **200 % = 9.6**.
- **Idle/keepalive**: una conexión sin `mv` durante 90 s (`IDLE_TIMEOUT_MS`, `server.js:179`) es terminada; heartbeat ping cada 30 s (`HB_MS`). ⇒ Un bot "quieto" **debe seguir mandando `mv`**.
- **Precedente del avatar**: `held` (arma en mano) ya viaja por jugador en `hello`/`mv` → `join`/`pm`, y el cliente lo lee en `addRemote` (`index.html:1928-1936`) y `applyPm` (`:1996`); el render remoto es `makeAvatar(id,name,admin)` (`index.html:1880`). Un `skin`/`kind` sigue ese mismo camino. Constantes de ítem: `SWORD=100`, `PICK=101` (`index.html:508`).
- **Spawn y orientación**: `findSpawn()` en `index.html:1684`; el server nace al jugador en `[128.5,20,136.5]` (`server.js:252`). Convención `lookDir = (-sin yaw, ·, -cos yaw)` (`index.html:1663`) y el modelo remoto se dibuja con `yaw + π` (`:2029`); para mirar a un objetivo: `yaw = atan2(-dx, -dz)`.
- **Bots de prueba que ya funcionaron** (fuera del repo, temp): `bot-duelo.mjs` (persigue, enfrenta con el yaw correcto, pega, es matable y respawnea) y `bot-jugar.mjs` (reconstruye el mundo extrayendo `/* worldgen:start */…/* worldgen:end */` de `index.html` con `new Function` + `WG.genWorld(buf,seed)` + `edits`, igual que `server.js:100-107`, y parsea `pm`/`pedit`). Este change trae esa lógica al repo, **versionada y testeada**.
- **Tests**: `.mjs` sueltos en `server/test/`, listados a mano en `server/package.json:scripts.test` y **contados en dos lugares que hay que subir juntos**: `server/test/zombie-protocol.mjs:287-289` (array + "14 archivos") y `server/test/lookguard.mjs:171-175` (array + `count === 14`). `server/test/static.mjs` y `server/test/protocol.mjs` son **pre-existentes y pinneados** (no se tocan). Los tests extraen bloques marcados de `index.html` con `new Function` (patrón de `lookguard.mjs`/`worldgen.mjs`/`avatar.mjs`).

## Goals / Non-Goals

**Goals:**

- Bot cazador **versionado en `bot/`**, cubierto por tests de integración sobre WS real (criterios (a)-(j)).
- **Aspecto robot humanoide** visible para todos los clientes vía un campo de protocolo aditivo + una rama de modelo en `index.html`.
- **Golpe mortal en dos toques separados, sin tocar el server ni el cliente**: un `hit` de `dmg: 6` y el siguiente recién ≥0.65 s después (6 + 6 = 12 > 10), respetando la ventana de invulnerabilidad `godT` de 0.6 s del cliente.
- **Velocidad doble** (9.6 u/s), **invulnerable** (reporta siempre 10/0) y **turreta** en `espera`.
- **Autorización por identidad del server**: comandos solo-admin probados por **id** (con el cambio aditivo `fromId`), nunca por nombre.
- **Operable 24/7**: servicio Docker con `restart: unless-stopped`, reconexión con backoff y re-`hello`.
- **Huésped de solo lectura**: cero `edit`.
- No romper nada: tests pre-existentes y la imagen actual del server intactos.

**Non-Goals:**

- **No** se vuelve el PvP server-authoritative (validar alcance/cadencia en el server): es un change mucho mayor; el bot explota la falta de validación de forma **acotada y deliberada** (dos `hit` separados ≥0.65 s, cada uno de `dmg: 6`) y su test lo fija.
- **No** se afloja el clamp `dmg ≤ 6` de `server.js:296`: dejarlo pasar habilitaría a cualquier cliente modificado a one-shotear a todos.
- **No** se hace que el bot cace zombis: su contrato es perseguir **jugadores** no-admin.
- **No** se comparte el grafo de `require` del server: `bot/` nunca hace `require` de `server/server.js` ni `server/zombie.js` (sí reusa la dependencia de terceros `ws`).
- **No** se implementa nada en esta fase: sólo planning.

## Decisions

### 1. Capability nueva `bots/hunter`

El contrato del bot (a quién ataca, con qué reglas, cómo se comanda por chat según la identidad del server, cómo se opera) es un **comportamiento de sistema durable**, no una tarea. Se crea `bots/hunter` bajo el dominio nuevo `bots/`, siguiendo la organización dominio/capability del proyecto (`net/*`, `player/*`, `security/*`). Si mañana se suma otro bot, ese contrato vive ahí.

**Alternativa descartada:** meterlo en `creatures/enemy` — el bot **no es una criatura hostil del server** (es un cliente externo); mezclar ambos contratos confunde dos modelos distintos.

### 2. `fromId` en el `chat` → capability `net/presence`

Ninguna capability documenta hoy el frame `chat` (verificado con `openspec list --specs` y lectura de specs). El cambio de comportamiento es que el `chat` **pase a llevar el id autoritativo del emisor**. Se agrega a **`net/presence`** (ADDED): es la capability de la **capa de red** que ya documenta broadcasts del server (`leave`), el ciclo de vida de las conexiones, el heartbeat y la identidad (`id`).

En `server.js:309`, el broadcast del chat del jugador pasa a:

```js
broadcast({ t: 'chat', from: me.name, fromId: me.id, text });
```

- **Por qué `fromId` y no `mode`**: el bot necesita **correlacionar** quién es admin con **quién mandó el comando**; el id es el identificador único y estable que ya usa el protocolo (`leave{id}`, `phit{fromId}`). `mode` se aprende aparte (`welcome.players`/`join`) y se asocia por id.
- **Aditivo**: los clientes que ignoran el campo siguen igual (`index.html:2599`), y `server/test/protocol.mjs:173` sólo asierta `ch.from`/`ch.text` ⇒ queda verde.
- **Alternativas descartadas:** (a) un **frame nuevo** `chatid` — obliga a dos mensajes por chat y a correlacionarlos; (b) **mandar el `from` como id** — rompe lo que muestra el cliente; (c) **autorizar por nombre** — es justo el agujero que el usuario quiere cerrar.

### 3. Aspecto del avatar (`skin`) → capability `net/avatar`

El render del avatar remoto vive en `net/avatar` (ya documenta el **ítem en mano** y la animación de ataque). El aspecto es exactamente la misma clase de contrato: un dato por jugador que el render remoto consume. Se agregan dos requirements (ADDED): **el aspecto viaja por el protocolo** y **hay una variante robot humanoide**.

- **Fuente del dato**: el bot manda `skin:'robot'` en su `hello`. El server lo guarda en la sesión (`server.js:249-254`) y lo difunde en `welcome.players` (`:263`), `join` (`:265`) y `pm` (`:282`). **Decisión**: también en `pm`, por simetría con `held` y para que un cliente que perdió el `join` (buffer) lo recupere en el siguiente latido.
- **Render**: `makeAvatar` gana la rama `robot`; `addRemote`/`applyPm` propagan `a.skin` con **guardas** (`if(typeof p.skin==='string')`) para clientes viejos. El bloque del modelo robot queda **marcado** (`/* robot:start */…/* robot:end */`) para que el test (j) lo extraiga con `new Function`, igual que `net/avatar`.
- **Alternativa descartada:** distinguir el robot por **nombre** (p. ej. `name==='OPSX-bot'`) — frágil y suplantable; el `skin` es un dato del protocolo, estable y aditivo.

### 4. Estructura del código: `bot/cazador.js` (puro) + `bot/index.js` (red/CLI)

- **`bot/cazador.js`** (CommonJS `.js`): la **lógica** con dependencias inyectadas (`send`, `now`, RNG) para ser determinista y testeable: selección de presa no-admin viva, persecución con colisión, golpe mortal de dos toques separados ≥0.65 s, velocidad, invulnerabilidad, máquina de estados, parser de comandos resolviendo admin por id, retorno al spawn, armado de frames `mv`/`hit`/`chat` y keepalive. No conoce WebSocket ni env.
- **`bot/index.js`** (CommonJS `.js`): el **cableado**: `require('ws')`, extracción del worldgen de `index.html`, `hello` (con `skin:'robot'`), manejo de `welcome`/`join`/`pm`/`chat`/`pedit`/`zs`/`leave`, reconexión con backoff + re-`hello`, lectura de `SERVER_URL`/`BOT_NAME`, entrada CLI (`node bot/index.js`).
- **Por qué separar**: el test de integración **espía exactamente los frames salientes** inyectando un `send` que registra y reenvía por el WS real, sin montar un proxy; y la lógica queda testeable sin red.
- **Por qué `.js` (CJS)**: encaja con `require('ws')` y con el resto del server; no entra al container del server (está en `bot/`, no en `server/*.js`).

### 5. Golpe mortal de dos toques (por la ventana del cliente)

El cliente da **0.6 s de invulnerabilidad tras CADA golpe** (`index.html:1565`, `if(now-godT<.6) return;`), así que **2 `hit` en el mismo tick NO matan**: el segundo se descarta y la víctima queda en 4 de vida (vida = 10, `index.html:581`). El bot, al tener la presa dentro de alcance, emite un `hit` con `dmg: 6` (el techo que el server clampa, `server.js:296`) y **repite contra la MISMA víctima recién cuando pasaron ≥0.65 s del golpe anterior**, hasta verla muerta (`pm dead === 1`): 6 + 6 = 12 > 10 ⇒ la víctima muere en ~0.65 s, sin margen de reacción (el bot es invulnerable y va al doble de velocidad). **Cada toque es un ataque legítimo y separado: avanza `seq` una vez por toque**, así la víctima ve **dos golpes rápidos y reales** (no un burst).

- **Por qué no tocar el server ni el cliente**: el `dmg ≤ 6` existe para que **ningún** cliente inflija más de un corazón-por-medio por golpe; aflojarlo dejaría que cualquier cliente modificado one-shotee a todos. El bot respeta el clamp **y** también la ventana del cliente: **el clamp del server y la ventana del cliente quedan INTACTOS**.
- **Nota de fidelidad (ahora es la regla, no un hueco)**: la ventana de 0.6 s no es un obstáculo a esquivar sino **la regla del combate** que el bot respeta. El golpe "de un toque" del diseño significa **de una sola cadena de contacto**: el bot cierra, toca, espera la ventana y vuelve a tocar; la suma cae dentro de ~0.65 s, sin tiempo de reacción.
- **El test no miente**: el cliente falso de (a) **emula a propósito** la ventana `godT` de 0.6 s del `index.html` real; la víctima debe morir **tras dos toques separados** (~0.7-1 s del contacto) y el test **falla si el bot manda los dos golpes pegados** (en el mismo tick). Sin esa emulación, el test daría por bueno un burst que contra el cliente real no mata.
- **Alternativas descartadas:** (a) mandar un solo `hit` con `dmg: 12` — el server lo clampa a 6 y no mata; (b) aflojar el clamp — inaceptable por seguridad; (c) dos `hit` en el mismo tick — la ventana del cliente descarta el segundo y deja a la víctima en 4.

### 6. Velocidad doble

`SPEED_BOT = 2 * 4.8 = 9.6` unidades/s (200 % del jugador). El zombi usa 2.4 (50 %); el bot es **cuatro veces** el zombi. Se mueve por paso discreto integrando `dt` real del tick y resolviendo el suelo con `WG.topSolidY`, sin atravesar sólidos.

### 7. Invulnerabilidad

El bot **ignora todo `phit`** (no acumula daño), **reporta siempre `hp:10, dead:0`** en cada `mv`, **no sufre daño de caída** (no aplica la regla de `airPeak`/`drop` del cliente) y **si `y < -10` se teletransporta al spawn** (igual que `index.html:1648`), manteniendo la vida completa. No hay `dead`/respawn: nunca muere.

### 8. Máquina de estados

`modo ∈ {CAZA, ESPERA, SIGUEME}`:

- **CAZA** (default): elige la **presa no-admin viva más cercana**, la persigue y, en alcance, la mata con dos toques separados por la ventana del cliente. Sin presas en línea ⇒ camina al spawn y queda quieto (decision 11).
- **ESPERA**: posición **congelada** (la `pos` del momento de la orden); no persigue ni vuelve al spawn; **turreta**: mata a cualquier no-admin que entre en alcance. Sigue mandando `mv`.
- **SIGUEME**: sigue al **admin objetivo** (el que ordenó), con prioridad; fulmina a cualquier no-admin que entre en alcance **sin** abandonar al admin. Si el admin objetivo sale (`leave`) ⇒ vuelve a **CAZA** (y, sin presas, al spawn). Si el admin objetivo está muerto, sigue persiguiéndolo igual (los admins no mueren, pero por robustez se ancla a su posición).

**Precedencia**: `espera`/`sigueme` son órdenes explícitas y ganan sobre el default; `espera` y `sigueme` **se reemplazan entre sí** (aplicar la última). `sigueme` de otro admin reemplaza el objetivo.

### 9. Comandos y autoridad por id

Match del comando: `text.trim().toLowerCase()` **exactamente** igual a `sigueme` | `seguime` | `espera` (sin prefijo, para no dispararse dentro de una frase). El bot resuelve admin por **id**:

- Mantiene `Map<id, mode>` desde `welcome.players` (cada uno trae `mode`) y desde cada `join`.
- Al recibir un `chat`, si el `text` matchea un comando y el `fromId` **no** es el propio bot y **sí** corresponde a un id conocido con `mode === 'admin'`, ejecuta; si no, **ignora en silencio**.
- **Por qué alcanza**: el server asigna `id` y lo pone en `fromId`; el cliente no puede falsificarlo. Un desconocido con el nombre del admin tiene **otro id** ⇒ no autoriza. Este es el criterio (d).
- **Anuncio**: al ejecutar `sigueme`/`espera`, el bot publica un `chat` con el modo nuevo; al matar, publica un `chat` de la muerte (además del `💀 … murió` que anuncia el cliente de la víctima).

### 10. Keepalive: "quieto" = misma `pos`, no silencio

El bot manda `mv` a cadencia fija (p. ej. 150 ms, como el `bot-duelo` validado). Cuando está detenido (modo ESPERA, o CAZA sin presas en el spawn), **sigue mandando `mv` con la misma `pos`**; así no lo expira el idle de 90 s (`server.js:179`). "Cero movimiento" se define y testea como **`pos` constante entre frames `mv` consecutivos** con los frames **siguen llegando** (criterio (c)).

**Alternativa descartada:** dejar de mandar `mv` al parar — el server lo echaría a los 90 s.

### 11. Sin presas: retorno al spawn y quietud

En CAZA sin presas en línea, el bot camina al **punto de aparición** (`[128.5, ·, 136.5]`, el del server) y se queda quieto ahí (misma `pos`, `mv` sigue). El modo ESPERA **no** vuelve al spawn: se queda donde estaba.

### 12. Colisión de terreno y orientación (reusar lo validado)

- **Mundo local**: al recibir `welcome`, el bot reconstruye el mundo igual que `server.js:100-107`: extrae `/* worldgen:start */…/* worldgen:end */` de `index.html` con `new Function`, llama a `WG.genWorld(buf, seed)` y aplica los `edits` (`[idx, v]`). Escucha `pedit` para mantenerse al día. Con eso resuelve el suelo con `WG.topSolidY` al perseguir, sin atravesar sólidos.
- **Orientación**: `yaw = atan2(-dx, -dz)` para mirar al objetivo (convención `lookDir = (-sin yaw, ·, -cos yaw)`); `atan2(dx, dz)` queda 180° al revés.
- **Riesgo**: acopla el bot al **nombre del bloque marcado**; mitigado con **fail-fast** (log claro si falta) y un test de extracción.

### 13. Docker/Easypanel: `Dockerfile.bot` + servicio `minicraft-bot`

- **`Dockerfile.bot`** (nuevo, no toca el `Dockerfile` del server): base `node:20-alpine`; instala `ws` reusando `server/package.json`/`package-lock.json` (mismo `ws`, **un solo lockfile**) y copia `bot/` + `index.html`. **No** comparte el grafo de `require` del server (nunca requiere `server.js`/`zombie.js`).
- **`docker-compose.yml`**: segundo servicio
  ```yaml
  minicraft-bot:
    build: { context: ., dockerfile: Dockerfile.bot }
    environment:
      SERVER_URL: ws://minicraft:3000
      BOT_NAME: OPSX-bot
    depends_on: [minicraft]
    restart: unless-stopped
  ```
  El `SERVER_URL` por defecto es el **nombre interno** del servicio del server; en Easypanel puede apuntar al externo `wss://minicraft.francogagliardi.me`.
- **Easypanel**: segundo servicio apuntando a `Dockerfile.bot` (o deploy por compose). El server se redeploya igual que antes.
- **Por qué un servicio aparte**: el bot es un **cliente**; meterlo en el container del server acoplaría vidas.

### 14. Reconexión con backoff + re-`hello`

Ante `close`/`error`, el bot reintenta con espera **creciente** (p. ej. 1s → 2s → 4s … cap 30s, con jitter para no sincronizar), y al abrir manda de nuevo `hello`. Cubre (g): un close iniciado por el server (redeploy) lo devuelve al mundo. **No** reintenta en bucle inmediato (no martilla).

### 15. Env y defaults

- `SERVER_URL`: default `ws://minicraft:3000` (nombre interno en compose/Easypanel); en despliegue externo `wss://minicraft.francogagliardi.me`.
- `BOT_NAME`: default `OPSX-bot`.
- Opcionales de tuning (no cambian contrato): cadencia de `mv`, parámetros de backoff/jitter.

### 16. Estrategia de test

Un `.mjs` nuevo, estilo `zombie-protocol.mjs`: **server real** (`spawn(node,['server.js'])`) en **puerto libre real** + `WORLD_FILE` temporal + `ADMIN_KEY: 'test-key'`; clientes falsos (no-admin y admin) y el bot.

**Cómo se observan los frames del bot:** el test importa la lógica de `bot/cazador.js` y le inyecta un `send` **espía** que registra todo frame saliente y lo reenvía por el WebSocket real. Los asserts de comportamiento se hacen sobre lo registrado; la víctima además lo ve vía `phit`.

| criterio | cómo se prueba |
|---|---|
| (a) mata a un no-admin con dos toques separados | la víctima es un **cliente falso que EMULA la ventana `godT` de 0.6 s** del cliente real (a propósito, para que el test no mienta): recibe **dos `phit` separados ~0.7-1 s** que llevan su vida de 10 a 0; los `hit` registrados apuntan a su id, la distancia en cada golpe es ≤4.6 y **el test falla si el segundo `hit` sale en el mismo tick que el primero** |
| (b) ignora a un admin | con un admin pegado al lado, **ningún** `hit` registrado tiene `id === adminId` |
| (c) `sigueme` sigue / `espera` congela y sigue matando | tras `sigueme` la `pos` del bot converge a la del admin; tras `espera` la `pos` es **idéntica** a lo largo de varios segundos **pero siguen llegando `mv`**, y estando en espera mata a un no-admin que se le acerca |
| (d) **seguridad** | un no-admin con el **mismo nombre** que el admin manda `sigueme`/`espera` ⇒ el bot **conserva su modo** (no cambia) |
| (e) invulnerabilidad | un cliente manda `hit` al bot ⇒ sigue reportando `hp:10, dead:0` en sus `mv` y no muere |
| (f) velocidad doble | el desplazamiento por segundo del bot ≈ 2× el del jugador de referencia (constante 4.8 ⇒ 9.6) |
| (g) sobrevive a un close del server | se corta la conexión del bot desde el server (`ws.terminate()`) y se observa un nuevo `hello` y reincorporación |
| (h) cero `edit` | en todo el registro saliente, ningún `t === 'edit'` |
| (i) `skin:'robot'` difundido | un cliente falso lo recibe en `join`/`welcome.players` (y `pm`) con `skin === 'robot'` |
| (j) modelo robot del cliente | se extrae el bloque `/* robot:start */…/* robot:end */` de `index.html` con `new Function` (patrón `avatar.mjs`/`lookguard.mjs`) y se asierta su API/geometría (grupo con cuerpo metálico, ojos brillantes y antena) |

**Determinismo**: los asserts de cadencia/posición usan las marcas y posiciones de los frames registrados; el bot se instancia con parámetros inyectables (cadencia, backoff) donde ayude. **Alta en la suite**: `server/package.json` + subir el conteo en los **dos** asserts (`zombie-protocol.mjs:287-289` y `lookguard.mjs:171-175`) al total real de archivos `.mjs` de `test/` (14 + los nuevos). `static.mjs` y `protocol.mjs` **no se tocan**.

## Risks / Trade-offs

- [Risk] **La ventana de invulnerabilidad del cliente obliga a dos toques separados**: `index.html:1565` (`if(now-godT<.6) return;`). El bot la respeta esperando ≥0.65 s entre golpes a la misma víctima; si el cliente **agrandara** la ventana por encima de ese margen, el segundo toque se descartaría y la víctima sobreviviría (quedaría en 4). → Mitigación: el test (a) emula la ventana real de 0.6 s y fija el margen de espera; un cambio del cliente rompe el test y obliga a revisar. Cambiar el margen o la ventana exige tocar cliente/bot → **change aparte**.
- [Risk] **Duplicación de los números del cliente** (vida 10, velocidad 4.8, techo de daño 6, alcance 4.6, ventana de invulnerabilidad 0.6 s) ⇒ si el cliente los cambia, el bot se desalinea. → Mitigación: los tests (a)/(f) **miden** daño/velocidad/alcance y emulan la ventana sobre frames reales; un cambio rompe el test y obliga a revisar.
- [Risk] **El PvP no valida nada en el server** ⇒ un bot *malicioso* podría pegar fuera de rango. → Este change fija por spec que **este** bot respeta alcance y la separación mínima entre golpes a la misma víctima, y lo testea; cerrar el agujero general es un change aparte.
- [Risk] **El admin es inmune en su cliente** pero el bot igual podría atacarlo sin efecto visible. → Decisión bloqueada: **nunca** atacar admins, y el test (b) lo prueba.
- [Risk] **Acoplamiento al bloque marcado del worldgen** y al bloque marcado del robot: si se renombran, el bot no reconstruye el mundo o el test (j) no encuentra el modelo. → Mitigación: **fail-fast** con log claro + tests de extracción.
- [Risk] **Agregar `skin` a `index.html`** es el único cambio de cliente del change; un error podría afectar a los clientes viejos. → Mitigación: el campo es aditivo y con **guardas**; el resto del render no cambia.
- [Risk] **El estado (ESPERA/SIGUEME) no se persiste**: un redeploy reinicia en CAZA. → Aceptado y declarado; el admin puede reordenar.
- [Risk] **Un bot frenado/quieto sigue ocupando un lugar** en la lista por mandar `mv`. → Aceptado: es un operador visible, no un fantasma.
- [Risk] **Tests e2e con servidor real**: posible flakiness. → Puerto libre real, `WORLD_FILE` temporal, esperas basadas en la llegada de frames y lógica inyectable.

## Migration Plan

1. **Server primero**: agregar `fromId: me.id` en `server.js:309` y el `skin` en sesión/`welcome.players`/`join`/`pm` (todo aditivo). Los clientes viejos siguen igual.
2. **Cliente**: rama robot en `makeAvatar` + propagación de `skin` con guardas.
3. **Bot**: crear `bot/`, `Dockerfile.bot` y el servicio `minicraft-bot`; desplegar con `SERVER_URL`/`BOT_NAME`. Como reconecta, el orden no exige coordinación fina, pero el bot necesita el server con `fromId` para autorizar comandos.
4. **Verificación**: entrar como jugador (el bot lo caza de un toque), como admin (el bot lo ignora), probar `sigueme`/`espera`, y que un impostor con el nombre del admin no lo comande; ver el robot en el avatar.
5. **Rollback**: bajar el servicio `minicraft-bot` y revertir los cambios aditivos de `server.js`/`index.html`. Revertir `fromId` **deshabilita** el comando por chat, pero no rompe el juego.

## Open Questions

- **Backoff exacto y jitter** (base, factor, cap): se ajusta sin cambiar spec ni approach; valores iniciales en `tasks.md`.
- **Geometría exacta del robot** (proporciones, color metálico, forma de la antena): el spec fija las señas (metálico, ojos brillantes, antena, low-poly); el detalle fino es de implementación.
- **Texto exacto de los anuncios** de modo y de muerte: el spec fija que hay anuncio; la redacción se ajusta en implementación.
