# net/session Specification

## Purpose
Define cómo el WebSocket multijugador autentica cada conexión con la sesión HTTP, cómo el servidor impone la identidad del jugador (nombre, skin y rol) y cómo el bot contenedor se autentica como servicio sin cookie.

## Requirements

### Requirement: Gate del upgrade WebSocket por sesión

El server SHALL validar la cookie de sesión durante el upgrade del WebSocket y MUST rechazar el upgrade con `401` cuando la cookie falte, sea inválida, esté expirada o pertenezca a una cuenta inactiva. Un upgrade rechazado MUST NOT crear jugador, MUST NOT enviar `welcome` y MUST NOT afectar a las conexiones ya establecidas.

#### Scenario: Conexión con sesión válida

- **WHEN** un navegador con cookie de sesión válida abre el WebSocket
- **THEN** el upgrade se acepta y la conexión queda asociada a ese usuario

#### Scenario: Conexión sin cookie

- **WHEN** un cliente abre el WebSocket sin cookie de sesión
- **THEN** el upgrade se rechaza con `401`, no aparece en la lista de jugadores y los demás no reciben `join`

#### Scenario: Cookie expirada o revocada

- **WHEN** la cookie corresponde a una sesión expirada o revocada
- **THEN** el upgrade se rechaza con `401` y no se crea jugador

#### Scenario: Base caída durante el upgrade

- **WHEN** no se puede verificar la sesión por un error de base
- **THEN** el upgrade se rechaza con `503` y no se entra como invitado

### Requirement: Identidad impuesta por el servidor

El server SHALL asignar el nombre, el skin, el rol y los permisos del jugador a partir del perfil de la sesión, y MUST ignorar los campos `name`, `skin`, `mode`, `key`, `permissions` y `bot` que envíe el cliente en el `hello`. El nombre MUST ser el `username` del perfil, el skin MUST ser el guardado en la cuenta y los permisos MUST ser los de la cuenta.

#### Scenario: El cliente intenta otro nombre

- **WHEN** un usuario `ana` envía `hello` con `name: "admin"`
- **THEN** el resto de los jugadores lo ve como `ana` y su `from`/`fromId` de chat corresponden a `ana`

#### Scenario: El cliente intenta otro skin

- **WHEN** un usuario con skin `human` envía `hello` con `skin: "giant"`
- **THEN** el server difunde y usa `human` para ese jugador

#### Scenario: El cliente intenta ser admin

- **WHEN** un usuario con rol `user` envía `hello` con `mode: "admin"`
- **THEN** el server lo mantiene como jugador y su `mode` difundido es `player`

#### Scenario: El cliente intenta declararse permisos

- **WHEN** un usuario sin `fly` envía `hello` con `permissions: {"fly":true}`
- **THEN** el server usa los permisos de la cuenta y no habilita el vuelo por esa vía

#### Scenario: Un admin conserva sus poderes

- **WHEN** un usuario con rol `admin` se conecta
- **THEN** el server lo difunde con `mode: "admin"` y conserva el comportamiento admin existente

### Requirement: El perfil viaja en el welcome

El frame `welcome` SHALL incluir un objeto aditivo `user` con `username`, `role`, `skin` y `permissions`, además de los campos actuales. Los clientes que no conocen `user` o `permissions` MUST seguir funcionando sin errores.

#### Scenario: El cliente nuevo recibe su perfil

- **WHEN** un cliente autenticado recibe `welcome`
- **THEN** `welcome.user` trae el username, el rol, el skin y los tres permisos booleanos usados por el server para esa conexión

#### Scenario: Un cliente viejo ignora el campo

- **WHEN** un cliente que no conoce `welcome.user` recibe el frame
- **THEN** procesa el resto de `welcome` sin errores

#### Scenario: Un cliente viejo ignora los permisos

- **WHEN** un cliente que conoce `welcome.user` pero no `permissions` recibe el frame
- **THEN** sigue mostrando nombre, rol y skin sin errores

### Requirement: Cierre por revocación o expiración de sesión

El server SHALL cerrar las conexiones WebSocket de un usuario cuando su sesión se revoca explícitamente, y SHALL revalidar las sesiones activas al menos cada 60 segundos para cerrar las que expiraron. El cierre MUST ejecutar la limpieza normal de jugador y difundir `leave`.

#### Scenario: Logout con el juego abierto

- **WHEN** un usuario hace logout mientras tiene una conexión WebSocket abierta
- **THEN** el server cierra esa conexión, quita al jugador y difunde `leave`

#### Scenario: Sesión que expira durante la partida

- **WHEN** una sesión alcanza `expires_at` con la conexión abierta
- **THEN** en la siguiente revalidación (≤60 s) el server cierra la conexión y limpia al jugador

#### Scenario: Una conexión válida no se corta

- **WHEN** la sesión sigue activa y el jugador manda `mv` con normalidad
- **THEN** la revalidación no cierra la conexión ni interrumpe el juego

### Requirement: Rol admin autoritativo en los frames de chat

El server SHALL agregar el campo aditivo `admin: true` a los frames `chat` emitidos por un jugador con rol admin, y MUST omitirlo o enviarlo `false` para el resto. Un consumidor SHALL poder autorizar comandos por ese campo sin confiar en el nombre.

#### Scenario: Chat de un admin lleva el flag

- **WHEN** un usuario con rol admin escribe por el chat
- **THEN** el frame `chat` incluye `fromId` y `admin: true`

#### Scenario: Chat de un usuario común no lo lleva

- **WHEN** un usuario con rol `user` escribe por el chat
- **THEN** el frame no trae `admin: true`

#### Scenario: El bot lee el flag sin romper clientes viejos

- **WHEN** un cliente viejo recibe un `chat` con `admin: true`
- **THEN** sigue mostrando el mensaje con `from` y `text` sin errores

### Requirement: Compatibilidad con clientes sin sesión

Un cliente viejo que no conoce el login SHALL recibir un rechazo de conexión claro y NO SHALL provocar un crash ni una excepción no capturada en el server. El server MUST NOT caer a un modo invitado ni a un modo administrador abierto.

#### Scenario: Cliente viejo sin cookie

- **WHEN** un `index.html` viejo abre el WebSocket sin cookie
- **THEN** el server rechaza el upgrade, sigue sirviendo HTTP y registra el rechazo de forma acotada

#### Scenario: Reintentos de un cliente viejo

- **WHEN** un cliente viejo reintenta la conexión repetidamente
- **THEN** cada intento se rechaza sin consumir recursos de juego ni crear jugadores fantasma

### Requirement: Healthcheck público

El server SHALL exponer `GET /healthz` sin autenticación, que responde `200` solo si la base de datos responde a una consulta trivial y `503` en caso contrario, sin exponer configuración ni secretos.

#### Scenario: Base sana

- **WHEN** se consulta `/healthz` con la base disponible
- **THEN** responde `200` con un cuerpo mínimo de estado

#### Scenario: Base caída

- **WHEN** se consulta `/healthz` y la base no responde
- **THEN** responde `503` y el orquestador puede reiniciar el servicio

### Requirement: Permisos visibles en el roster

El server SHALL incluir el flag aditivo `botIgnore: true` en las entradas de roster (`welcome.players` y `join`) de los jugadores con `bot_ignore`, y MUST omitirlo o enviarlo `false` para el resto. El flag SHALL actualizarse cuando cambien los permisos de una cuenta.

#### Scenario: El bot ve al protegido en el welcome

- **WHEN** el bot se conecta y ya hay un jugador con `bot_ignore`
- **THEN** esa entrada de `welcome.players` trae `botIgnore: true` y las demás no

#### Scenario: Un protegido entra después

- **WHEN** un jugador con `bot_ignore` se une con el bot conectado
- **THEN** el frame `join` de ese jugador trae `botIgnore: true`

#### Scenario: Un cliente viejo no se rompe

- **WHEN** un cliente que no conoce `botIgnore` recibe el roster
- **THEN** sigue renderizando nombre, skin, posición y estado sin errores

### Requirement: Cambio de permisos en caliente

El server SHALL difundir un frame aditivo `perm` con `id` y el objeto `permissions` cuando cambian los permisos de un jugador conectado, actualizar la copia server-side usada para aplicar `bot_ignore` y MUST NOT exigir relogin. Los clientes que no conocen `perm` MUST ignorarlo.

#### Scenario: Se habilita fly durante la partida

- **WHEN** un admin habilita `fly` a un jugador conectado
- **THEN** el jugador recibe `perm` con `permissions.fly === true` y puede volar sin reconectar

#### Scenario: Se revoca bot_ignore

- **WHEN** un admin quita `bot_ignore` a un jugador conectado
- **THEN** el frame `perm` llega con `botIgnore` deshabilitado y el bot puede volver a elegirlo como presa

#### Scenario: El cambio sobrevive a la reconexión

- **WHEN** el jugador afectado se desconecta y vuelve a entrar
- **THEN** el `welcome.user` y el roster reflejan los permisos guardados, sin depender del frame `perm`

#### Scenario: Cliente viejo

- **WHEN** un cliente que no conoce `perm` recibe el frame
- **THEN** lo ignora y sigue jugando con el comportamiento anterior sin errores

### Requirement: Bots como entradas de roster

El server SHALL publicar cada bot activo en `welcome.players` y `join` con `bot:true`, un id negativo reservado, `name`, `skin`, `pos`, `yaw`, `hp`, `maxHp` y `dead`, y SHALL difundir `pm` con su posición y vida cuando cambian. Los clientes que no conocen esos campos MUST seguir funcionando sin errores.

#### Scenario: Roster con bot

- **WHEN** un jugador recibe el `welcome` con un bot activo
- **THEN** la entrada del bot trae `bot:true`, id negativo, nombre, skin, vida y `maxHp`

#### Scenario: Bot que aparece y desaparece

- **WHEN** un admin lanza o detiene un bot
- **THEN** los jugadores reciben el `join` o el `leave` correspondiente en el acto

#### Scenario: Actualización de posición y vida

- **WHEN** un bot se mueve o recibe daño
- **THEN** los clientes reciben `pm` con su posición, `hp` y `dead` actuales

#### Scenario: Los ids de bot no chocan con usuarios

- **WHEN** conviven jugadores con ids positivos y bots con ids negativos
- **THEN** el `hit`, el `pm` y el `leave` de cada uno se resuelven sin ambigüedad

#### Scenario: Cliente viejo

- **WHEN** un cliente no conoce `bot` ni `maxHp`
- **THEN** dibuja al bot como un avatar normal y sigue jugando sin errores

### Requirement: El upgrade solo acepta sesión de usuario

El gate del WebSocket SHALL autenticar únicamente la cookie de sesión. Un upgrade con `Authorization: Bearer` MUST rechazarse con `401` aunque exista `BOT_TOKEN` en el entorno, sin crear jugador ni revelar el token.

#### Scenario: Bearer legado

- **WHEN** un cliente envía `Authorization: Bearer <token>` y no trae cookie de sesión
- **THEN** el upgrade se rechaza con `401` y no aparece ningún jugador

#### Scenario: Variable legada seteada

- **WHEN** el server arranca con `BOT_TOKEN` en el entorno
- **THEN** avisa una vez que la variable ya no se usa y no habilita ninguna conexión de servicio

#### Scenario: El token no se filtra

- **WHEN** se rechaza un upgrade con Bearer
- **THEN** ni el token ni el header aparecen en logs

### Requirement: Golpes del jugador a un bot

El server SHALL resolver un `hit` cuyo `id` corresponde a un bot, validar alcance y cadencia, aplicar su propio daño y responder `hitok` con el daño efectivamente aplicado, sin retransmitir `phit` a un socket inexistente. Un bot inmune MUST responder con daño cero.

#### Scenario: Golpe confirmado

- **WHEN** un jugador golpea a un bot vulnerable dentro de alcance
- **THEN** recibe `hitok` con el daño aplicado y los demás clientes ven la vida nueva por `pm`

#### Scenario: Bot inmune

- **WHEN** un jugador golpea a un bot con `takes_damage:false`
- **THEN** recibe `hitok` con `dmg:0` y no aparece número de daño

#### Scenario: Id inexistente

- **WHEN** un jugador golpea a un id negativo que no corresponde a ningún bot activo
- **THEN** el golpe se descarta sin error y sin efectos
