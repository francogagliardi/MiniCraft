# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
