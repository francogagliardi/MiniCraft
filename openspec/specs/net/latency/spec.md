# net/latency Specification

## Purpose
Define la medición de latencia del cliente contra el servidor: el par `ping`/`pong` de aplicación, aditivo y respondido solo al emisor, y el cálculo de RTT con un único ping pendiente, timeout y compatibilidad con versiones viejas.

## Requirements

### Requirement: Ping y pong de aplicación aditivos

El cliente SHALL poder enviar `{ t: 'ping', ts }` con un timestamp numérico propio y el servidor SHALL responder `{ t: 'pong', ts }` al mismo socket, ecoando el `ts` recibido, sin difundirlo a otros jugadores ni persistirlo. Los mensajes SHALL ser aditivos: no SHALL modificar `hello`, `welcome`, `mv` ni el guardado del mundo.

#### Scenario: El servidor responde el ping al emisor
- **WHEN** un cliente conectado envía `{ t:'ping', ts: 12345 }`
- **THEN** recibe `{ t:'pong', ts: 12345 }` en el mismo socket

#### Scenario: Los demás jugadores no ven el ping
- **WHEN** un jugador envía un `ping`
- **THEN** ningún otro jugador recibe ese `ping` ni su `pong`

#### Scenario: Un `ts` inválido no rompe la sesión
- **WHEN** un cliente envía `{ t:'ping' }` sin `ts` o con un `ts` no finito
- **THEN** el servidor no responde nada por ese mensaje y la conexión sigue activa

### Requirement: Medición de RTT y timeout

El cliente SHALL medir la RTT con un reloj monotónico local al recibir el `pong`, SHALL mantener como máximo un `ping` pendiente y SHALL mostrar `—` si no llega respuesta en el timeout configurado. El sistema SHALL NOT encolar pings indefinidamente ni mostrar un valor viejo como actual.

#### Scenario: RTT en milisegundos
- **WHEN** el cliente recibe el `pong` de su `ping` pendiente
- **THEN** calcula la diferencia con su propio reloj, la redondea a milisegundos y la muestra en el indicador

#### Scenario: Sin respuesta dentro del timeout
- **WHEN** pasa el timeout sin recibir el `pong` del ping pendiente
- **THEN** el cliente descarta el pendiente, muestra `—` y puede volver a intentar más tarde

#### Scenario: Un solo ping pendiente
- **WHEN** el ping anterior todavía no recibió `pong` y todavía no venció el timeout
- **THEN** el cliente no envía otro `ping`

### Requirement: Compatibilidad con clientes y servidores viejos

El sistema SHALL tolerar versiones sin `ping`/`pong`: un servidor viejo que ignora `ping` SHALL dejar la conexión viva y el cliente SHALL mostrar `—`; un cliente viejo que ignora `pong` SHALL seguir funcionando sin errores.

#### Scenario: Servidor viejo que ignora `ping`
- **WHEN** un cliente nuevo envía `ping` a un servidor que no conoce ese mensaje
- **THEN** el servidor lo ignora, la sesión sigue activa y el cliente muestra `Ping —` tras el timeout

#### Scenario: Cliente viejo que ignora `pong`
- **WHEN** un cliente que no conoce `pong` recibe ese mensaje
- **THEN** lo descarta sin errores y el juego sigue funcionando

#### Scenario: Mensaje desconocido no cierra la conexión
- **WHEN** el servidor recibe un tipo de mensaje que no maneja
- **THEN** no responde, no cierra la conexión y no afecta al resto de los mensajes
