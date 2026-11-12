# Spec Delta

## Purpose

Define qué significan los permisos por usuario `bot_ignore`, `fly` e `instant_break` en el juego, dónde se aplican de forma efectiva (cliente, server y bot) y qué garantías —y límites conocidos— ofrece el servidor frente a un cliente manipulado.

## ADDED Requirements

### Requirement: Permisos efectivos del jugador

El sistema SHALL exponer en el perfil del jugador un objeto `permissions` con las tres claves `bot_ignore`, `fly` e `instant_break` como booleanos, tomadas de la cuenta autenticada y no de ningún frame del cliente. Una clave ausente en la cuenta SHALL leerse como `false`.

#### Scenario: Perfil con permisos

- **WHEN** una cuenta tiene `fly` habilitado y consulta su perfil
- **THEN** el perfil trae `permissions.fly === true` y `permissions.bot_ignore === false`

#### Scenario: Permisos no declarables por el cliente

- **WHEN** un cliente envía permisos en el `hello` o en cualquier frame de juego
- **THEN** el server los ignora y usa exclusivamente los de la cuenta

#### Scenario: El rol admin no borra los permisos guardados

- **WHEN** una cuenta admin también tiene permisos guardados
- **THEN** el perfil devuelve esos permisos y el comportamiento admin se suma sin quitarlos

### Requirement: El cazador ignora a los usuarios con bot_ignore

Un jugador con `bot_ignore` SHALL quedar excluido de las presas del bot cazador aunque esté vivo, no sea admin y esté a su alcance. El bot MUST NOT emitir `hit` contra él ni anunciar su muerte.

#### Scenario: El bot no persigue al protegido

- **WHEN** el único jugador no-admin vivo conectado tiene `bot_ignore`
- **THEN** el bot se comporta como si no tuviera presas y no lo ataca

#### Scenario: El protegido camina al lado del bot

- **WHEN** un jugador con `bot_ignore` se queda pegado al bot
- **THEN** el bot no le dirige ningún golpe ni siquiera sin otras presas

#### Scenario: El protegido sigue cazando a otros

- **WHEN** conviven un jugador con `bot_ignore` y otro sin el permiso
- **THEN** el bot ignora al primero y persigue al segundo con normalidad

### Requirement: El servidor descarta el daño del bot al protegido

El server SHALL identificar la conexión autenticada con la credencial de servicio del bot y MUST descartar cualquier frame `hit` emitido por esa conexión contra un jugador con `bot_ignore`, sin retransmitir `phit` ni reducir la vida del protegido. Un `hit` del bot contra un jugador sin el permiso SHALL retransmitirse como hoy.

#### Scenario: Bot manipulado intenta golpear al protegido

- **WHEN** la conexión de servicio del bot emite `hit` contra un jugador con `bot_ignore`
- **THEN** el server no envía `phit` a la víctima y su vida no cambia

#### Scenario: El golpe legítimo sí pasa

- **WHEN** el bot golpea a un jugador vivo sin `bot_ignore`
- **THEN** el server retransmite `phit` con el daño acotado como siempre

#### Scenario: Un usuario común no se beneficia del descarte

- **WHEN** un jugador autenticado por cookie emite `hit` contra un usuario con `bot_ignore`
- **THEN** el server lo trata como un golpe entre jugadores normal y el permiso no interviene

### Requirement: El permiso fly habilita el vuelo del cliente

El cliente SHALL habilitar el vuelo cuando el jugador sea admin o su perfil tenga `fly: true`, y MUST NOT habilitarlo en caso contrario. Si el permiso se revoca en caliente, el cliente SHALL salir del modo vuelo sin quedar suspendido en el aire.

#### Scenario: Un usuario común con fly vuela

- **WHEN** un jugador sin rol admin pero con `fly` entra al juego y activa el vuelo
- **THEN** el HUD muestra el modo volar y puede subir y bajar con los controles de siempre

#### Scenario: Sin fly no hay vuelo

- **WHEN** un jugador sin rol admin y sin `fly` pulsa la tecla o el botón de volar
- **THEN** el vuelo no se activa y sigue en modo supervivencia

#### Scenario: Revocación durante el vuelo

- **WHEN** el permiso `fly` se revoca mientras el jugador está volando
- **THEN** el cliente desactiva el vuelo y el jugador cae con la física normal

### Requirement: El permiso instant_break habilita la rotura instantánea

El cliente SHALL romper el bloque apuntado al instante, por la misma ruta que usa el admin, cuando el jugador sea admin o tenga `instant_break: true`; sin el permiso MUST usar la rotura progresiva normal.

#### Scenario: Rotura instantánea con permiso

- **WHEN** un jugador con `instant_break` hace clic izquierdo sobre un bloque rompible
- **THEN** el bloque se rompe al instante y el cambio se difunde como un `edit` normal

#### Scenario: Sin permiso se pica normal

- **WHEN** un jugador sin `instant_break` mantiene el clic sobre piedra
- **THEN** la rotura progresa con la grieta y el tiempo normal, como cualquier jugador

#### Scenario: BEDROCK sigue inviolable

- **WHEN** un jugador con `instant_break` apunta a `BEDROCK`
- **THEN** el bloque no se rompe, igual que para el admin

### Requirement: Límites conocidos de autoridad

El sistema SHALL aplicar `bot_ignore` en el servidor y SHALL documentar que `fly` e `instant_break` son privilegios de conveniencia aplicados en el cliente: el movimiento y el picado siguen siendo client-authoritative y el server MUST NOT presentarlos como anti-cheat. El server SHALL mantener las validaciones de rango y de bloque que ya aplica a `edit` y `mv`.

#### Scenario: Cliente manipulado con vuelo

- **WHEN** un jugador sin `fly` modifica su cliente para volar
- **THEN** el server no lo expulsa por volar: el límite queda documentado y no se promete detección

#### Scenario: Cliente manipulado con rotura

- **WHEN** un jugador sin `instant_break` envía `edit` de bloques válidos a mayor velocidad que la normal
- **THEN** el server acepta el `edit` dentro de rango y el límite anti-cheat queda fuera de este change

#### Scenario: Validaciones existentes intactas

- **WHEN** cualquier jugador envía `edit` fuera de los límites del mundo o con valores inválidos
- **THEN** el server descarta el pedido como hoy, con o sin permisos
