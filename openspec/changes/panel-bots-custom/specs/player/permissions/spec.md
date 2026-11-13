# Spec Delta

## MODIFIED Requirements

### Requirement: El cazador ignora a los usuarios con bot_ignore

Un jugador con `bot_ignore` SHALL quedar excluido de las presas de todo bot hostil, empezando por el cazador, aunque esté vivo, no sea admin y esté a su alcance. Ningún bot hostil MUST emitir daño contra él ni anunciar su muerte.

#### Scenario: El bot no persigue al protegido

- **WHEN** el único jugador no-admin vivo conectado tiene `bot_ignore`
- **THEN** el bot se comporta como si no tuviera presas y no lo ataca

#### Scenario: El protegido camina al lado del bot

- **WHEN** un jugador con `bot_ignore` se queda pegado al bot
- **THEN** el bot no le dirige ningún golpe ni siquiera sin otras presas

#### Scenario: El protegido sigue cazando a otros

- **WHEN** conviven un jugador con `bot_ignore` y otro sin el permiso
- **THEN** el bot ignora al primero y persigue al segundo con normalidad

#### Scenario: El permiso se aplica en caliente

- **WHEN** un admin habilita `bot_ignore` a la presa actual de un bot
- **THEN** el bot la abandona en el siguiente tick y no le emite más daño

### Requirement: El servidor descarta el daño del bot al protegido

El server SHALL decidir el daño de los bots y MUST NOT emitir `phit` contra un jugador con `bot_ignore` ni contra un admin. La validación SHALL ocurrir antes de enviar el daño, sin depender de ningún frame del bot ni del cliente.

#### Scenario: Bot manipulado intenta golpear al protegido

- **WHEN** un bot alcanza a un jugador con `bot_ignore`
- **THEN** el server no envía `phit` a la víctima y su vida no cambia

#### Scenario: El golpe legítimo sí pasa

- **WHEN** un bot golpea a un jugador vivo sin `bot_ignore` y no admin
- **THEN** el server emite `phit` con el daño configurado del bot

#### Scenario: Un usuario común no se beneficia del descarte

- **WHEN** un jugador autenticado por cookie emite `hit` contra otro jugador con `bot_ignore`
- **THEN** el server lo trata como un golpe entre jugadores normal y el permiso no interviene

#### Scenario: Un bot no administra el daño

- **WHEN** el runtime calcula el daño de un bot
- **THEN** usa exclusivamente la configuración guardada del bot y no acepta un `dmg` externo

### Requirement: Límites conocidos de autoridad

El sistema SHALL aplicar `bot_ignore` en el servidor y SHALL documentar que `fly` e `instant_break` son privilegios de conveniencia aplicados en el cliente: el movimiento y el picado siguen siendo client-authoritative y el server MUST NOT presentarlos como anti-cheat. La vida del bot SHALL ser server-authoritative.

#### Scenario: Cliente manipulado con vuelo

- **WHEN** un jugador sin `fly` modifica su cliente para volar
- **THEN** el server no lo expulsa por volar: el límite queda documentado y no se promete detección

#### Scenario: Cliente manipulado con rotura

- **WHEN** un jugador sin `instant_break` envía `edit` de bloques válidos a mayor velocidad que la normal
- **THEN** el server acepta el `edit` dentro de rango y el límite anti-cheat queda fuera de este change

#### Scenario: Validaciones existentes intactas

- **WHEN** cualquier jugador envía `edit` fuera de los límites del mundo o con valores inválidos
- **THEN** el server descarta el pedido como hoy, con o sin permisos

#### Scenario: Vida del bot no manipulable

- **WHEN** un cliente envía `hit` con un `dmg` distinto al esperado contra un bot
- **THEN** el server descarta ese valor y aplica su daño fijo por golpe válido

#### Scenario: Vida del jugador sigue siendo del cliente

- **WHEN** un bot daña a un jugador
- **THEN** el cliente aplica el `phit` recibido y el server no intenta reconciliar su vida, límite conocido y documentado
