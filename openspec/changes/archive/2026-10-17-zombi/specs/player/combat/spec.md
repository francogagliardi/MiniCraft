# Spec Delta

## Purpose

Define el combate cuerpo a cuerpo del jugador con la espada —cuánto daña, con qué cadencia, a quién puede apuntar y cómo se valida el golpe— para que el arma sea relevante contra otros jugadores y contra criaturas hostiles sin depender de la confianza en el cliente.

## ADDED Requirements

### Requirement: Daño de la espada de un corazón

El golpe de espada del jugador SHALL aplicar 2 puntos de daño (un corazón de la barra de vida del juego) tanto contra otros jugadores como contra criaturas hostiles, y SHALL NOT depender del ítem en ningún otro slot.

#### Scenario: Un golpe de espada baja un corazón entero

- **WHEN** el jugador golpea a otro jugador con la espada en la mano
- **THEN** la víctima pierde 2 puntos de vida y su barra baja exactamente un corazón

#### Scenario: El daño visible coincide con el aplicado

- **WHEN** un golpe de espada llega a su objetivo
- **THEN** el número de daño flotante y el aviso del atacante muestran el mismo valor que la vida descontada (2)

#### Scenario: Solo la espada ataca

- **WHEN** el jugador no tiene la espada en el slot activo e intenta golpear a otro jugador o a una criatura hostil
- **THEN** no se aplica daño y el juego avisa que hace falta la espada

### Requirement: Cadencia de ataque de la espada

El sistema SHALL limitar el ataque de espada a un golpe por segundo, y SHALL mostrar la espera en curso (anillo de cooldown) sin ejecutar animación ni daño mientras el golpe está en cooldown.

#### Scenario: Un golpe por segundo

- **WHEN** el jugador golpea con la espada y vuelve a intentarlo antes de cumplirse un segundo
- **THEN** el segundo intento no produce daño (ni animación de golpe) y el anillo de espera sigue visible

#### Scenario: El cooldown no bloquea para siempre

- **WHEN** el jugador vuelve a golpear después de cumplirse el segundo
- **THEN** el golpe se ejecuta con normalidad

### Requirement: Selección de objetivo del ataque

El sistema SHALL elegir el objetivo del ataque con la espada entre las entidades alcanzables por la vista del jugador —jugadores y criaturas hostiles— dentro del alcance del ataque, y SHALL priorizar de forma estable cuando ambos tipos están alineados.

#### Scenario: Golpea al jugador apuntado

- **WHEN** el jugador apunta y golpea a otro jugador dentro del alcance
- **THEN** el golpe se dirige a ese jugador

#### Scenario: Golpea a la criatura hostil apuntada

- **WHEN** el jugador apunta y golpea a una criatura hostil dentro del alcance
- **THEN** el golpe se dirige a esa criatura y no a un jugador que esté fuera de la línea de vista

#### Scenario: Sin objetivo no hay golpe

- **WHEN** el jugador golpea con la espada sin ninguna entidad alcanzable en la línea de vista
- **THEN** no se envía ninguna solicitud de golpe ni se aplica daño

### Requirement: Golpe a criaturas hostiles validado por el servidor

Para criaturas hostiles, el cliente SHALL limitarse a pedir el golpe contra un objetivo concreto y el servidor SHALL validar la distancia entre el jugador y la criatura antes de aplicar daño, SHALL confirmar el impacto al atacante y SHALL NOT aceptar daño declarado por el cliente.

#### Scenario: El golpe cerca del objetivo se aplica

- **WHEN** el jugador pide golpear a una criatura hostil que está dentro del alcance del arma
- **THEN** el servidor aplica el daño del arma y confirma el impacto al atacante

#### Scenario: El golpe lejano se rechaza

- **WHEN** el jugador pide golpear a una criatura hostil que está fuera del alcance del arma (por ejemplo por teleport o latencia extrema)
- **THEN** el servidor no aplica daño y el atacante no recibe confirmación de impacto

#### Scenario: El jugador sin servidor no puede golpear criaturas hostiles

- **WHEN** el jugador golpea con la espada en modo solo (sin servidor) y hay una criatura hostil en la línea de vista
- **THEN** no hay solicitud de golpe al servidor ni daño, porque las criaturas hostiles solo existen con servidor

### Requirement: Feedback del impacto contra criaturas hostiles

El sistema SHALL dar feedback inmediato al atacante cuando el servidor confirma el golpe contra una criatura hostil, consistente con el feedback del golpe contra jugadores.

#### Scenario: Confirmación visual y sonora del impacto

- **WHEN** el servidor confirma el golpe contra una criatura hostil
- **THEN** el atacante ve la marca de impacto, oye el sonido de golpe y ve el número de daño sobre la criatura

#### Scenario: Sin confirmación del servidor no hay feedback de impacto

- **WHEN** la solicitud de golpe no es confirmada por el servidor
- **THEN** el atacante no muestra marca de impacto ni número de daño, aunque haya ejecutado la animación de golpe local
