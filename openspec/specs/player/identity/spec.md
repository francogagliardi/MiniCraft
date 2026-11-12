# player/identity Specification

## Purpose
Define que la identidad visible del jugador —nombre y aspecto— proviene de su cuenta autenticada y no de lo que escriba o declare el cliente, y cómo se refleja en el HUD, los avatares remotos y el chat.

## Requirements

### Requirement: Nombre de jugador derivado del username

El sistema SHALL mostrar y difundir como nombre del jugador el `username` de la cuenta autenticada. El `username` SHALL fijarse al crear la cuenta —por registro público o aprovisionamiento— y MUST NOT ser editable después, ni desde el registro, ni desde el juego, ni por el `hello` ni por ningún frame posterior.

#### Scenario: El HUD muestra el username

- **WHEN** un usuario `ana` entra al juego
- **THEN** su HUD, su avatar local y su nombre en los avatares remotos muestran `ana`

#### Scenario: El username se fija al registrarse

- **WHEN** un visitante se registra con el username `ana`
- **THEN** su identidad en el juego es `ana` y no existe ninguna vía para renombrarla después sin crear otra cuenta

#### Scenario: No hay campo para cambiar el nombre

- **WHEN** el jugador abre el menú o la pausa en el juego
- **THEN** no encuentra ningún campo para editar su nombre

#### Scenario: El nombre sobrevive a la reconexión

- **WHEN** el jugador recarga o vuelve a entrar con la misma cuenta
- **THEN** su nombre sigue siendo el username de la cuenta

### Requirement: Aspecto derivado del perfil

El sistema SHALL usar el skin guardado en la cuenta como aspecto del jugador al entrar al juego y SHALL difundirlo a los demás como cualquier avatar remoto. El cliente MUST NOT enviar ni imponer un skin distinto al del perfil para su propia identidad.

#### Scenario: El skin del perfil se usa al entrar

- **WHEN** una cuenta guarda `small` y el jugador abre `/game`
- **THEN** el jugador juega con `small` y los demás lo ven como `small`

#### Scenario: Cambiar el skin en el lobby

- **WHEN** el jugador elige `giant` en el lobby, se guarda y entra al juego
- **THEN** el juego lo usa como `giant` en esa entrada

#### Scenario: Un hello con otro skin no cambia el perfil

- **WHEN** el cliente envía `hello` con un skin distinto al guardado
- **THEN** el server usa el skin del perfil y el perfil no se modifica

### Requirement: El perfil del jugador es el único origen de identidad

El sistema SHALL resolver nombre, aspecto y rol desde la sesión autenticada en cada conexión. Ningún frame del protocolo SHALL permitir a un jugador cambiar el nombre, el skin o el rol de otro ni los suyos fuera de `PATCH /api/me` para el skin.

#### Scenario: Dos cuentas con nombres distintos no colisionan

- **WHEN** dos usuarios distintos se conectan
- **THEN** cada uno conserva su username y su skin de perfil, y el chat los distingue por `fromId`

#### Scenario: Un usuario intenta suplantar a otro

- **WHEN** un usuario envía frames con el nombre de otra cuenta
- **THEN** el nombre difundido sigue siendo el de su propia sesión y el otro usuario no se ve afectado

#### Scenario: El skin solo cambia por el perfil

- **WHEN** un usuario autenticado intenta cambiar su skin sin pasar por `PATCH /api/me`
- **THEN** el skin usado en la partida no cambia

### Requirement: Aplicación del cambio de skin en la próxima entrada

Un cambio de skin guardado en el lobby SHALL aplicarse al entrar (o reentrar) al juego y MUST NOT requerir reiniciar el server. La partida en curso MAY conservar el aspecto con el que empezó.

#### Scenario: Cambio antes de entrar

- **WHEN** el jugador cambia de skin en el lobby y pulsa "Jugar Legacy"
- **THEN** entra con el skin nuevo desde el primer frame

#### Scenario: Cambio con una partida abierta

- **WHEN** el jugador cambia su skin en otra pestaña mientras juega
- **THEN** la partida actual puede seguir con el aspecto anterior y el nuevo se aplica en la próxima entrada, sin errores
