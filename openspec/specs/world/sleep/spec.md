# world/sleep Specification

## Purpose
Define el sueño cooperativo en una cama de dos celdas: solo de noche, con quórum de jugadores reales vivos (bot y admin exentos) y salto del reloj al amanecer, para que el grupo pueda pasar la noche sin esperar el ciclo completo.

## Requirements

### Requirement: Cama de dos celdas orientada

El sistema SHALL ofrecer una cama como ítem de paleta que coloca dos bloques contiguos —pie y cabecera— sobre un eje horizontal (`X` o `Z`) derivado de la mirada del jugador, y SHALL romper ambas celdas al romper cualquiera de las dos.

#### Scenario: Colocar la cama mirando hacia adelante

- **WHEN** el jugador usa la cama sobre una celda libre y la dirección horizontal dominante de su mirada es `+X`
- **THEN** el pie queda en la celda apuntada y la cabecera en la celda `+X` contigua, con dos ediciones de mundo

#### Scenario: Orientación sobre el eje Z

- **WHEN** la dirección horizontal dominante es `-Z`
- **THEN** la cabecera queda en la celda `-Z` contigua al pie

#### Scenario: Rotura de una mitad

- **WHEN** el jugador rompe la cabecera o el pie de una cama existente
- **THEN** se rompen las dos celdas y no queda media cama suelta

#### Scenario: La cama se puede apuntar y pisar

- **WHEN** el jugador apunta a una cama con el raycast o camina hacia ella
- **THEN** la cama es apuntable como un bloque, se dibuja como una caja baja y se puede subir con el auto-step, sin bloquear como un cubo de altura completa

### Requirement: Dormir solo de noche

El sistema SHALL permitir dormir con click derecho sobre una cama únicamente durante la noche, SHALL NOT permitirlo de día, y SHALL mantener al jugador inmóvil y sin giro de cámara mientras duerme.

#### Scenario: Dormir de noche

- **WHEN** el jugador hace click derecho sobre una cama y la fase del ciclo es nocturna
- **THEN** el cliente entra en estado de sueño, muestra el overlay con el contador de durmientes y avisa al servidor con la celda de la cama

#### Scenario: La cama no funciona de día

- **WHEN** el jugador hace click derecho sobre una cama de día
- **THEN** no entra en estado de sueño y ve un aviso de que solo puede dormir de noche; el servidor también rechaza el pedido

#### Scenario: Mientras duerme no se mueve ni gira

- **WHEN** el jugador está durmiendo
- **THEN** no se desplaza, no gira la cámara, no rompe ni coloca bloques, y sigue reportando su posición como keepalive

### Requirement: Quórum de jugadores reales

El servidor SHALL considerar jugadores reales a los conectados que no sean bot ni admin, SHALL excluir a los muertos del quórum, y SHALL saltar la noche solo cuando al menos un jugador real esté durmiendo y todos los jugadores reales vivos estén durmiendo.

#### Scenario: Falta un jugador

- **WHEN** hay dos jugadores reales vivos y solo uno duerme
- **THEN** la noche continúa y el contador muestra `1/2`

#### Scenario: Duermen todos

- **WHEN** todos los jugadores reales vivos están durmiendo
- **THEN** el servidor salta la noche al amanecer

#### Scenario: El bot no bloquea

- **WHEN** el bot está conectado y despierto, y todos los jugadores reales vivos duermen
- **THEN** el bot no suma al denominador y el salto se dispara igual

#### Scenario: El admin no bloquea

- **WHEN** el admin está conectado y despierto, y todos los jugadores reales vivos duermen
- **THEN** el admin no suma al denominador y el salto se dispara igual

#### Scenario: El admin solo puede amanecer

- **WHEN** solo están conectados el admin y/o el bot, y el admin duerme
- **THEN** no queda ningún jugador real pendiente y el salto se dispara

#### Scenario: Un muerto no bloquea

- **WHEN** un jugador real está muerto esperando respawn y los demás reales vivos duermen
- **THEN** el muerto no cuenta y la noche se salta

### Requirement: Salto al amanecer

El servidor SHALL avanzar su fase de ciclo hasta el comienzo del amanecer cuando se cumple el quórum, SHALL difundir la nueva fase de inmediato, SHALL despertar a todos los durmientes y SHALL producir el despawn de los zombis con el mecanismo nocturno→diurno existente.

#### Scenario: La fase salta al amanecer

- **WHEN** se cumple el quórum de sueño
- **THEN** la fase del servidor pasa a estar justo después del inicio del amanecer y se difunde un `tod` inmediato

#### Scenario: Todos despiertan

- **WHEN** la noche se salta
- **THEN** el servidor limpia el estado de sueño de todos y difunde el reset; los clientes salen del estado de sueño

#### Scenario: Los zombis desaparecen

- **WHEN** la noche se salta
- **THEN** el tick de la horda detecta el paso de noche a día y mata a los zombis vivos, como en cualquier amanecer

#### Scenario: El salto se ve en todos los clientes

- **WHEN** un cliente recibe el `tod` con la fase de amanecer
- **THEN** adopta la fase por el snap existente y actualiza luz y cielo de forma consistente con el resto

### Requirement: Despertar

El sistema SHALL despertar a un durmiente cuando presiona movimiento, salta, hace click, pierde el pointer lock o recibe daño, y SHALL despertarlo también cuando su cama es editada o cuando se desconecta.

#### Scenario: Despertar con una tecla

- **WHEN** el jugador dormido presiona WASD o espacio
- **THEN** vuelve al estado de juego normal y avisa al servidor con `wake`

#### Scenario: Despertar con click o ESC

- **WHEN** el jugador dormido hace click o pierde el pointer lock
- **THEN** se despierta y no queda en pausa ni en un estado trabado

#### Scenario: El daño despierta

- **WHEN** un jugador dormido recibe daño
- **THEN** se despierta antes de aplicar el daño y deja de contar como durmiente

#### Scenario: Le rompen la cama

- **WHEN** otro jugador rompe la celda donde duerme un jugador
- **THEN** el servidor lo despierta y recalcula el quórum

#### Scenario: Se desconecta el que faltaba

- **WHEN** un jugador dormido se desconecta y con eso ya duermen todos los reales restantes
- **THEN** el servidor recalcula y salta la noche si corresponde

### Requirement: Feedback del sueño

El sistema SHALL informar por chat cuando un jugador se duerme y cuando amanece, y SHALL mostrar en el overlay del jugador dormido el contador de durmientes sobre el total de reales.

#### Scenario: Aviso al dormirse

- **WHEN** un jugador se duerme
- **THEN** el resto ve un mensaje de chat con su nombre y el contador actualizado

#### Scenario: Aviso al amanecer

- **WHEN** la noche se salta
- **THEN** todos ven un mensaje de chat de que amaneció

### Requirement: Protocolo aditivo del sueño

El sistema SHALL transportar el sueño con mensajes aditivos que los clientes viejos puedan ignorar, SHALL aceptar `bot:true` en el `hello`, y SHALL incluir el estado de sueño en el `welcome` para quien entra con la noche en curso.

#### Scenario: Cliente viejo convive

- **WHEN** un cliente que no entiende los mensajes de sueño recibe `sleep` o un `welcome` con campos nuevos
- **THEN** sigue jugando con el resto del protocolo sin errores

#### Scenario: Entrar con gente durmiendo

- **WHEN** un jugador nuevo recibe el `welcome` mientras otros duermen
- **THEN** recibe los ids de los durmientes y el total necesario, y pasa a contar como real despierto para el quórum
