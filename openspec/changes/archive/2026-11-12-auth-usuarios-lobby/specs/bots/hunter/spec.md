# Spec Delta

## ADDED Requirements

### Requirement: Conexión del bot con credencial de servicio

El bot SHALL autenticarse con `Authorization: Bearer <BOT_TOKEN>` al abrir el WebSocket y MUST NOT depender de una cookie de usuario. El server SHALL comparar el token en tiempo constante y, si coincide, SHALL crear una conexión de servicio con `bot: true`, `mode: "player"` y sin privilegios de admin. Sin `BOT_TOKEN` configurado, el server MUST rechazar la conexión del bot.

#### Scenario: Bot con token válido

- **WHEN** el bot abre el WebSocket con el `BOT_TOKEN` correcto
- **THEN** el upgrade se acepta, el bot entra al mundo y queda excluido del quórum de sueño

#### Scenario: Token ausente o incorrecto

- **WHEN** el bot no envía token o envía uno distinto
- **THEN** el server rechaza el upgrade y no crea jugador

#### Scenario: El bot conserva nombre y skin propios

- **WHEN** el bot se conecta con `BOT_NAME=OPSX-bot` y `BOT_SKIN=giant`
- **THEN** el resto lo ve como `OPSX-bot` con aspecto `giant`, saneados por el server

#### Scenario: El token no se filtra en logs

- **WHEN** el bot se conecta o es rechazado
- **THEN** ni el `BOT_TOKEN` ni el header completo aparecen en la salida del server o del bot

#### Scenario: Rotación del token

- **WHEN** se cambia `BOT_TOKEN` en server y bot y se reinician ambos
- **THEN** el bot vuelve a conectarse con el token nuevo y el anterior deja de servir

### Requirement: El bot de servicio no usa cuentas ni HTTP

La conexión del bot MUST NOT crear sesiones, usuarios ni cookies, y el bot MUST NOT poder llamar a las rutas de auth como si fuera un usuario. Su nombre y su skin SHALL venir de `BOT_NAME`/`BOT_SKIN` y no de un perfil.

#### Scenario: El bot no obtiene sesión

- **WHEN** el bot se conecta con `BOT_TOKEN`
- **THEN** no se crea una fila en `sessions` ni se emite `Set-Cookie`

#### Scenario: El bot no puede entrar al panel

- **WHEN** el proceso del bot intenta `GET /api/me` o `PATCH /api/me`
- **THEN** recibe `401` porque no tiene cookie de usuario

## MODIFIED Requirements

### Requirement: Comandos de chat solo-admin con autoridad por id del server

El bot SHALL reconocer exactamente los comandos `sigueme` (y su variante `seguime`) y `espera`, comparando el mensaje completo tras recortar espacios y sin distinguir mayúsculas, y SHALL ejecutarlos solo si el frame de chat trae `admin: true` desde el server o si el id de quien escribe —el asignado por el server— corresponde a una conexión con rol admin. SHALL NOT autorizar por nombre, porque el nombre es suplantable.

#### Scenario: El admin ordena seguir

- **WHEN** una conexión con rol admin escribe exactamente `sigueme` (o `seguime`) por el chat
- **THEN** el bot pasa a seguir a ese admin

#### Scenario: El admin ordena esperar

- **WHEN** una conexión con rol admin escribe exactamente `espera` por el chat
- **THEN** el bot queda clavado donde está y pasa a matar a quien se le acerque

#### Scenario: Un impostor con el nombre del admin es ignorado

- **WHEN** una conexión no-admin que usa el mismo nombre que un admin escribe `sigueme` o `espera`
- **THEN** el bot ignora el comando por completo y conserva su modo

#### Scenario: El flag admin del server manda

- **WHEN** un frame de chat trae `admin: true` pero el mensaje no es exactamente un comando
- **THEN** el bot no cambia de modo

#### Scenario: No se dispara dentro de una frase

- **WHEN** un mensaje de chat contiene el comando como parte de una frase en vez de ser exactamente el comando
- **THEN** el bot no cambia de modo
