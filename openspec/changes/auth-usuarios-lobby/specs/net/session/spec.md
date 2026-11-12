# Spec Delta

## Purpose

Define cómo el WebSocket multijugador autentica cada conexión con la sesión HTTP, cómo el servidor impone la identidad del jugador (nombre, skin y rol) y cómo el bot contenedor se autentica como servicio sin cookie.

## ADDED Requirements

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

El server SHALL asignar el nombre, el skin y el rol del jugador a partir del perfil de la sesión, y MUST ignorar los campos `name`, `skin`, `mode` y `key` que envíe el cliente en el `hello`. El nombre MUST ser el `username` del perfil y el skin MUST ser el guardado en la cuenta.

#### Scenario: El cliente intenta otro nombre

- **WHEN** un usuario `ana` envía `hello` con `name: "admin"`
- **THEN** el resto de los jugadores lo ve como `ana` y su `from`/`fromId` de chat corresponden a `ana`

#### Scenario: El cliente intenta otro skin

- **WHEN** un usuario con skin `human` envía `hello` con `skin: "giant"`
- **THEN** el server difunde y usa `human` para ese jugador

#### Scenario: El cliente intenta ser admin

- **WHEN** un usuario con rol `user` envía `hello` con `mode: "admin"`
- **THEN** el server lo mantiene como jugador y su `mode` difundido es `player`

#### Scenario: Un admin conserva sus poderes

- **WHEN** un usuario con rol `admin` se conecta
- **THEN** el server lo difunde con `mode: "admin"` y conserva el comportamiento admin existente

### Requirement: El perfil viaja en el welcome

El frame `welcome` SHALL incluir un objeto aditivo `user` con `username`, `role` y `skin`, además de los campos actuales. Los clientes que no conocen `user` MUST seguir funcionando sin errores.

#### Scenario: El cliente nuevo recibe su perfil

- **WHEN** un cliente autenticado recibe `welcome`
- **THEN** `welcome.user` trae el username, el rol y el skin usados por el server para esa conexión

#### Scenario: Un cliente viejo ignora el campo

- **WHEN** un cliente que no conoce `welcome.user` recibe el frame
- **THEN** procesa el resto de `welcome` sin errores

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

### Requirement: Credencial de servicio del bot

El server SHALL aceptar un upgrade sin cookie cuando traiga `Authorization: Bearer <BOT_TOKEN>` y el token configurado coincida en tiempo constante. Esa conexión SHALL tratarse como bot de servicio: `bot: true`, `mode: "player"` y sin privilegios de admin, con nombre y skin saneados desde `BOT_NAME`/`BOT_SKIN`. Sin `BOT_TOKEN` configurado MUST rechazar el upgrade.

#### Scenario: El bot se conecta con el token correcto

- **WHEN** el bot envía `Authorization: Bearer` con el `BOT_TOKEN` configurado
- **THEN** el upgrade se acepta, el jugador queda marcado `bot: true` y no aparece en el quórum de sueño

#### Scenario: Token incorrecto o ausente

- **WHEN** un cliente envía un token distinto o no envía token ni cookie
- **THEN** el upgrade se rechaza con `401` y no se crea jugador

#### Scenario: Sin BOT_TOKEN el bot no entra

- **WHEN** el server arranca sin `BOT_TOKEN` y el bot intenta conectarse
- **THEN** el upgrade se rechaza y el juego de los usuarios no se ve afectado

#### Scenario: El bot nunca es admin

- **WHEN** una conexión autenticada por `BOT_TOKEN` envía `mode: "admin"` o manda comandos de admin
- **THEN** el server la mantiene como bot sin privilegios y no le reconoce autoridad de admin

### Requirement: Un usuario de sesión no puede declararse bot

El server SHALL ignorar `bot: true` en el `hello` de una conexión autenticada por cookie. Solo una conexión autenticada por `BOT_TOKEN` puede quedar marcada como bot.

#### Scenario: Un usuario intenta saltear el quórum de sueño

- **WHEN** un usuario autenticado por cookie envía `hello` con `bot: true`
- **THEN** el server lo trata como jugador real y cuenta para el quórum de sueño

#### Scenario: El bot de servicio sí se excluye

- **WHEN** la conexión llega con `BOT_TOKEN` válido
- **THEN** el server la marca como bot y la excluye del quórum

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
