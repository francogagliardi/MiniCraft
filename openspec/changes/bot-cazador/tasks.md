# Tasks

## 1. Protocolo aditivo del server

- [x] 1.1 En `server/server.js:309`, incluir `fromId: me.id` en el broadcast del `chat` del jugador; verificar que `node server/test/protocol.mjs` sigue verde (el test pinneado sólo asierta `ch.from`/`ch.text`).
- [x] 1.2 Guardar el `skin` recibido en el `hello` en la sesión (`server.js:249-254`) y difundirlo en `welcome.players` (`:263`), `join` (`:265`) y `pm` (`:282`), con fallback al valor por defecto cuando no venga; verificar con una conexión manual que los tres frames traen `skin` y que el resto del protocolo no cambia. No modificar el clamp de `dmg` (`:296`) ni el resto de los handlers.

## 2. Aspecto robot en el cliente

- [x] 2.1 En `index.html`, agregar un bloque marcado `/* robot:start */…/* robot:end */` con el constructor del modelo robot humanoide low-poly (cuerpo metálico, ojos brillantes, antena), siguiendo el estilo de bloques de `makeSwordModel`/`makePickModel`; verificar que `index.html` sigue sirviendo y el modelo es coherente a ojo.
- [x] 2.2 En `makeAvatar` (`index.html:1880`) elegir la rama robot cuando el aspecto es `robot`, y propagar `skin` desde `welcome.players`/`join`/`pm` en `addRemote` (`:1928`) y `applyPm` (`:1993`) con guardas para clientes sin el campo; verificar que un avatar con `skin:'robot'` se dibuja como robot y uno sin el campo, como humano.
- [x] 2.3 Crear `server/test/client-robot.mjs` (criterio (j)): extrae el bloque `/* robot:start */…/* robot:end */` con `new Function` (patrón `avatar.mjs`/`lookguard.mjs`) y asierta su API y geometría (grupo con cuerpo, ojos y antena); verificar que `node server/test/client-robot.mjs` pasa.
- [x] 2.4 Dar de alta `test/client-robot.mjs` en `server/package.json` y subir el conteo **14 → 15** en los **dos** asserts (`server/test/zombie-protocol.mjs:287-289` y `server/test/lookguard.mjs:171-175`); verificar que ambos tests siguen verdes.

## 3. Núcleo del bot

- [x] 3.1 Crear `bot/cazador.js` (lógica pura, `send`/`now`/RNG inyectados): selección de la presa no-admin viva más cercana (nunca un admin, `mode === 'admin'`; nunca un `dead === 1`), persecución con colisión de terreno, alcance de ataque con techo duro 4.6, golpe mortal de dos toques con `dmg: 6` separados ≥0.65 s del golpe anterior a la misma víctima (respetando la ventana `godT` de 0.6 s del cliente) con un avance de `seq` por toque, velocidad 9.6, orientación `atan2(-dx,-dz)`, armado de frames `mv`/`hit`/`chat` y keepalive; verificar la preselección (admin excluido, muerto excluido) con casos directos sobre la lógica.
- [x] 3.2 Crear `bot/index.js` (cableado): `require('ws')`, extracción del bloque `/* worldgen:start */…/* worldgen:end */` de `index.html` con `new Function` + `WG.genWorld` + `edits` del `welcome` (fail-fast si falta el bloque), `hello` con `skin:'robot'` y `held: SWORD`, handlers de `welcome`/`join`/`pm`/`pedit`/`zs`/`leave`/`chat`, y entrada CLI (`node bot/index.js`); verificar que arranca contra un server local y se ve como robot.
- [x] 3.3 Crear `server/test/bot-cazador.mjs` (estilo `zombie-protocol.mjs`: server real en puerto libre + `WORLD_FILE` temporal + `ADMIN_KEY: 'test-key'`, bot con `send` espía + clientes falsos) con los criterios (a) el bot cierra distancia y mata a un no-admin con dos toques separados —el cliente falso **emula la ventana `godT` de 0.6 s** del cliente real, la víctima muere tras dos `phit` separados (~0.7-1 s del contacto) y el test falla si los dos `hit` salen pegados—, (b) ignora a un admin por completo (ningún `hit` contra un id admin ni con el admin pegado al lado), (h) cero mensajes `edit` del bot e (i) `skin:'robot'` llega a los demás clientes en `join`/`welcome.players`; verificar que `node server/test/bot-cazador.mjs` pasa.
- [x] 3.4 Dar de alta `test/bot-cazador.mjs` en `server/package.json` y subir el conteo **15 → 16** en los **dos** asserts (`zombie-protocol.mjs:287-289` y `lookguard.mjs:171-175`); verificar que `node server/test/zombie-protocol.mjs` y `node server/test/lookguard.mjs` siguen verdes.

## 4. Modos y comandos

- [x] 4.1 En `bot/cazador.js`, implementar la máquina de estados CAZA/ESPERA/SIGUEME con su precedencia (las órdenes `espera`/`sigueme` ganan y se reemplazan entre sí), el retorno al spawn y la quietud sin presas (misma `pos`, `mv` sigue), y el comportamiento turreta de ESPERA; verificar que sin presas el bot camina al spawn y queda quieto reportando `mv`.
- [x] 4.2 Implementar el parser de comandos (`sigueme`/`seguime`/`espera`, match exacto con trim + case-insensitive, sin prefijo) con la autoridad por **id del server** (mapa `id→mode` desde `welcome.players`/`join`; ignora en silencio a no-admin y a nombres iguales a un admin; si el admin objetivo sale, vuelve a CAZA) y los anuncios por chat de cambio de modo y de kills; verificar que un mensaje-frase que contiene el comando no cambia el modo.
- [x] 4.3 Extender `server/test/bot-cazador.mjs` con (c) `sigueme` de un admin ⇒ la `pos` del bot converge a la del admin, `espera` ⇒ `pos` idéntica a lo largo de varios segundos **y** `mv` sigue llegando, y estando en espera mata a un no-admin que se le acerca, y (d) **seguridad**: `sigueme`/`espera` de un no-admin con el **mismo nombre** que el admin son ignorados (el bot conserva su modo); verificar que `node server/test/bot-cazador.mjs` pasa.

## 5. Invulnerabilidad, velocidad y reconexión

- [x] 5.1 En `bot/cazador.js`, hacer el bot invulnerable: ignorar todo `phit`, reportar siempre `hp:10, dead:0`, no sufrir daño de caída y teletransportarse al spawn si `y < -10`; verificar que sigue reportando 10/0 tras recibir golpes.
- [x] 5.2 Fijar la velocidad del bot en **9.6** unidades/s (200 % de los 4.8 del jugador) con paso integrado por `dt` y resolución de suelo; verificar que en una persecución cubre ≈ el doble que un jugador de referencia.
- [x] 5.3 En `bot/index.js`, implementar la reconexión con backoff creciente + jitter (sin martillar) y el re-`hello` al reconectar; extender `server/test/bot-cazador.mjs` con (e) invulnerabilidad (un cliente manda `hit` al bot y éste sigue en 10/0), (f) velocidad doble (desplazamiento/s ≈ 2× el de referencia) y (g) sobrevive a un close iniciado por el server (reconecta y re-`hello`a); verificar que `node server/test/bot-cazador.mjs` pasa.

## 6. Docker, servicio y documentación

- [x] 6.1 Crear `Dockerfile.bot` (base `node:20-alpine`, instala `ws` reusando `server/package.json`/`package-lock.json`, copia `bot/` + `index.html`) sin tocar el `Dockerfile` del server; verificar con `docker build -f Dockerfile.bot -t minicraft-bot .` que la imagen construye.
- [x] 6.2 Agregar el servicio `minicraft-bot` en `docker-compose.yml` (`build` con `Dockerfile.bot`, `SERVER_URL: ws://minicraft:3000`, `BOT_NAME: OPSX-bot`, `depends_on: [minicraft]`, `restart: unless-stopped`); verificar con `docker compose config` que el compose sigue válido y el servicio del server no cambió.
- [x] 6.3 Documentar en `README.md` el servicio bot (env `SERVER_URL`/`BOT_NAME`), el deploy del segundo servicio en Easypanel, los comandos de chat (`sigueme`/`seguime`/`espera`, solo admin) y el arranque local (`node bot/index.js`); verificar que los comandos documentados son los que el bot acepta.

## 7. Verificación integral

- [x] 7.1 Correr la suite completa `cd server && npm test` y verificar que los 16 archivos pasan (incluidos los pinneados `static.mjs` y `protocol.mjs` sin cambios).
- [x] 7.2 Levantar server + bot localmente y verificar de punta a punta: un jugador ve al robot y muere de un toque, un admin es ignorado y puede comandar `sigueme`/`espera`, y un impostor con el nombre del admin no lo comanda.

## Workflow follow-up

- Archivar el change cuando la revisión del proyecto esté satisfecha (el estado de ESPERA/SIGUEME no se persiste al reconectar: declarado en `design.md`).
