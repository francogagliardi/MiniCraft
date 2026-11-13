# Spec Delta

## MODIFIED Requirements

### Requirement: Presa restringida a no-admins vivos

El bot SHALL elegir como presa a cualquier jugador conectado cuyo `mode` no sea `admin`, que no esté muerto (`dead === 0`) y que no tenga `botIgnore === true`, y SHALL NOT atacar nunca a un jugador con `mode === 'admin'` ni a uno con `bot_ignore`, sin importar cuán cerca esté ni cuánto tiempo permanezca al lado.

#### Scenario: Persigue y fulmina a un no-admin

- **WHEN** un jugador con `mode === 'player'`, vivo y sin `bot_ignore` está conectado
- **THEN** el bot lo persigue con el objetivo de matarlo

#### Scenario: Ignora por completo a un admin

- **WHEN** un jugador con `mode === 'admin'` está pegado al lado del bot
- **THEN** el bot no le dirige ningún golpe, ni siquiera si no hay otro objetivo disponible

#### Scenario: Ignora a un no-admin muerto

- **WHEN** el único no-admin conectado está muerto (`dead === 1`)
- **THEN** el bot no lo ataca y se comporta como si no tuviera presas

#### Scenario: Ignora a un jugador con bot_ignore

- **WHEN** el único jugador no-admin vivo conectado tiene `botIgnore === true`
- **THEN** el bot no lo persigue, no le emite `hit` y se comporta como si no tuviera presas

#### Scenario: El protegido no bloquea a las demás presas

- **WHEN** conviven un jugador con `bot_ignore` pegado al bot y otro sin el permiso a distancia
- **THEN** el bot ignora al primero y persigue al segundo con normalidad

## ADDED Requirements

### Requirement: Exclusión actualizada por el roster y el frame perm

El bot SHALL leer el flag `botIgnore` de las entradas de roster (`welcome.players` y `join`) y SHALL actualizar la exclusión al recibir el frame aditivo `perm`, de modo que un cambio de permisos en caliente se aplique sin reconectar. Un frame sin `botIgnore` SHALL interpretarse como no protegido.

#### Scenario: Protegido presente al conectarse

- **WHEN** el bot recibe un `welcome` con un jugador `botIgnore: true`
- **THEN** lo excluye de sus presas desde el primer tick

#### Scenario: Se habilita bot_ignore durante la caza

- **WHEN** el bot está persiguiendo a un jugador y llega `perm` con `botIgnore: true` para ese id
- **THEN** abandona esa presa en el siguiente tick y no le emite más golpes

#### Scenario: Se revoca bot_ignore

- **WHEN** llega `perm` con `botIgnore: false` para un jugador conectado
- **THEN** el bot vuelve a considerarlo una presa válida si está vivo y no es admin

#### Scenario: Un server viejo sin el flag

- **WHEN** el bot recibe un roster o un `join` sin `botIgnore`
- **THEN** trata al jugador como no protegido y conserva el comportamiento anterior
