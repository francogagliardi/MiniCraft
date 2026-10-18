# net/presence Specification

## Purpose
Mantiene la lista de jugadores multijugador libre de fantasmas: detecta conexiones muertas y expira sesiones inactivas para que los demás jugadores dejen de verlas.

## Requirements

### Requirement: Cierre proactivo del cliente al salir

El cliente SHALL cerrar su WebSocket al abandonar la página mediante los eventos `pagehide` y `beforeunload`.

#### Scenario: Salida con flecha atrás

- **WHEN** el jugador abandona la página (flecha atrás, cerrar pestaña o recargar)
- **THEN** el cliente cierra el WebSocket antes de descargar la página y el server difunde `leave` a los demás jugadores.

### Requirement: Heartbeat del server con ping/pong

El server SHALL enviar ping WebSocket cada 30s a cada conexión y MUST cerrar con `terminate()` las que no respondan pong.

#### Scenario: Conexión viva responde pong

- **WHEN** el server envía ping cada 30s a una conexión sana
- **THEN** el cliente responde pong automáticamente y la sesión sigue activa sin efecto visible.

#### Scenario: Conexión muerta sin pong

- **WHEN** una conexión no responde pong al ping de 30s
- **THEN** el server la termina con `terminate()`, elimina al jugador y difunde `leave` a los demás.

### Requirement: Expiración por inactividad sin movimiento

El server SHALL expirar y limpiar toda sesión que no reciba ningún mensaje `mv` durante 90s, difundiendo `leave` como en un cierre normal.

#### Scenario: Jugador AFK largo expira

- **WHEN** un jugador conectado deja de enviar `mv` durante más de 90s
- **THEN** el server cierra su conexión, lo elimina de la lista y difunde `leave` a los demás.

#### Scenario: Jugador lento pero activo no expira

- **WHEN** un jugador envía `mv` al menos una vez cada 90s (el cliente normal lo manda cada 70ms)
- **THEN** su sesión MUST permanecer activa y no recibe ningún cierre forzado.

### Requirement: Identidad autoritativa del emisor en el frame de chat

El server SHALL incluir en el frame `chat` de un jugador el campo `fromId` con el id asignado por el server al emisor, además del nombre. Un consumidor SHALL poder identificar inequívocamente al emisor por ese id, sin confiar en el nombre (que elige el cliente y es suplantable). El campo es aditivo: los clientes que lo ignoren siguen funcionando.

#### Scenario: Un chat de jugador lleva el id del emisor

- **WHEN** un jugador envía un mensaje de chat
- **THEN** los demás reciben el frame `chat` con `from` (su nombre) y `fromId` (el id que el server le asignó)

#### Scenario: Dos conexiones con el mismo nombre no se confunden

- **WHEN** dos conexiones distintas eligen el mismo nombre y ambas chatean
- **THEN** cada frame `chat` lleva el `fromId` de su propia conexión, distinto entre ambas

#### Scenario: Un cliente que ignora el campo no se rompe

- **WHEN** un cliente que no conoce `fromId` recibe un frame `chat` con ese campo
- **THEN** muestra el mensaje con normalidad usando `from` y `text`, sin errores

#### Scenario: Los mensajes de sistema no traen id de jugador

- **WHEN** el server difunde un mensaje de sistema (por ejemplo de unión o salida)
- **THEN** ese `chat` no lleva `fromId` de jugador, porque no proviene de un jugador

### Requirement: Hora de Argentina en los logs de conexión del server

El server SHALL prefijar cada log de consola de **unión** y de **salida** de jugador con la hora local de Argentina en formato `[HH:MM]` (24 h, sin segundos) al **inicio** del mensaje, correspondiente a la zona `America/Argentina/Buenos_Aires`, y SHALL conservar **intacto** el texto original del mensaje detrás del prefijo. El prefijo SHALL NOT depender de la zona horaria del proceso ni de la env var `TZ`.

#### Scenario: Unión de un jugador

- **WHEN** un jugador se une al mundo
- **THEN** el log de consola empieza con `[HH:MM] ` y a continuación el texto original `➕ <nombre> (<modo>) — <N> conectados`, sin alterarlo

#### Scenario: Salida de un jugador

- **WHEN** un jugador se desconecta y el server lo quita de la lista de conectados
- **THEN** el log de consola empieza con `[HH:MM] ` y a continuación el texto original `➖ <nombre> — <N> conectados`, sin alterarlo

#### Scenario: La hora es la de Argentina aunque el contenedor corra en otra zona

- **WHEN** el proceso corre con el reloj del sistema en una zona distinta a la de Argentina (por ejemplo UTC) en un instante conocido
- **THEN** el prefijo `[HH:MM]` refleja la hora de Argentina de ese instante y no la de la zona del contenedor
