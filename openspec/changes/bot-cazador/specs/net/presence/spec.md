# Spec Delta

## ADDED Requirements

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
