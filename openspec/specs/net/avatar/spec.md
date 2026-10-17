# net/avatar Specification

## Purpose
Define cómo se suavizan los avatares remotos recibidos por la red (`pm`): umbral de teleport, lerp acotado, interpolación de yaw y protección contra que un `pedit` remoto deje al jugador local dentro de un bloque. Es una mitigación del lag, no su eliminación.

## Requirements

### Requirement: Teleport ante distancia grande

El sistema SHALL hacer snap directo del avatar remoto a `target` cuando la distancia horizontal supere 6 unidades, en vez de lerpear, para evitar desplazamientos largos suaves por ráfagas atrasadas.

#### Scenario: Distancia mayor a 6 dispara snap

- **WHEN** llega un `pm` que deja al remoto a más de 6 unidades de su posición renderizada
- **THEN** el avatar se coloca directamente en `target` en un solo frame (no hay lerp intermedio)

#### Scenario: Distancia menor o igual a 6 se lerpea

- **WHEN** el remoto está a 6 unidades o menos de `target`
- **THEN** su posición renderizada se acerca a `target` mediante lerp acotado, sin snap

### Requirement: Lerp acotado

El sistema SHALL lerpear la posición renderizada del avatar remoto hacia `target` solo cuando la distancia sea menor o igual a 6 unidades, con un factor acotado por frame que evite teletransportes suaves de golpe.

#### Scenario: Lerp limitado al paso de frame

- **WHEN** se aplica lerp en un frame con distancia <= 6
- **THEN** el movimiento del avatar en ese frame está limitado por el factor de lerp del frame, no es un salto a `target`

### Requirement: Interpolación de yaw

El sistema SHALL interpolar el yaw del avatar remoto suavemente hacia el yaw reportado en `pm`, sin giros bruscos ni saltos angulares.

#### Scenario: Yaw gira hacia el reportado

- **WHEN** llega un `pm` con un yaw distinto al renderizado
- **THEN** el yaw renderizado se acerca al yaw del `pm` de forma progresiva frame a frame

#### Scenario: Yaw estable sin movimiento

- **WHEN** el remoto no se mueve y llega un `pm` con el mismo yaw
- **THEN** el yaw renderizado no cambia

### Requirement: Buffer opcional de pm

El sistema SHALL poder bufferizar los mensajes `pm` hasta 100ms (opcional, activable/desactivable sin cambiar el protocolo) para ordenar y suavizar ráfagas antes de aplicar la posición a `target`.

#### Scenario: Ráfaga de pm se bufferiza

- **WHEN** llegan varios `pm` en menos de 100ms
- **THEN** se aplican en orden al `target` sin saltos intermedios visibles

### Requirement: Pedit no deja al jugador local dentro de un bloque

El sistema SHALL evitar que un `pedit` remoto deje al jugador local dentro de un bloque; si la edición coloca un bloque que ocupa la celda del jugador local, el sistema SHALL resolver la colisión sacando al jugador local fuera del bloque en vez de dejarlo dentro.

#### Scenario: Pedit sobre el jugador local lo saca fuera

- **WHEN** un `pedit` remoto coloca un bloque en la celda donde está el jugador local
- **THEN** el jugador local es reubicado fuera del bloque (colisión resuelta hacia fuera) y no queda atrapado dentro

#### Scenario: Pedit en celda libre no afecta al jugador

- **WHEN** un `pedit` remoto coloca un bloque en una celda libre sin el jugador local
- **THEN** el jugador local no se mueve ni sufre efecto colateral

### Requirement: Ítem en mano visible en los avatares remotos

El sistema SHALL conocer qué ítem tiene seleccionado cada jugador y SHALL mostrarlo en su avatar remoto cuando ese ítem sea un arma (espada o pico), de modo que los demás jugadores vean el arma que el otro lleva en la mano.

#### Scenario: Se ve la espada del otro jugador

- **WHEN** un jugador tiene la espada seleccionada
- **THEN** su avatar remoto muestra la espada en la mano para los demás jugadores

#### Scenario: Se ve el pico del otro jugador

- **WHEN** un jugador tiene el pico seleccionado
- **THEN** su avatar remoto muestra el pico en la mano para los demás jugadores

#### Scenario: Sin arma no hay modelo en mano

- **WHEN** un jugador tiene seleccionado un bloque (o cualquier ítem que no sea un arma)
- **THEN** su avatar remoto no muestra ningún modelo de arma en la mano

#### Scenario: Un jugador que entra ya ve las armas de los demás

- **WHEN** un jugador se conecta y otros ya tienen un arma seleccionada
- **THEN** ve esas armas en sus avatares sin esperar a que los otros cambien de ítem

#### Scenario: Cambiar de ítem se refleja sin gesto

- **WHEN** un jugador cambia el ítem seleccionado sin atacar
- **THEN** el cambio se refleja en su avatar remoto y no se reproduce ninguna animación de ataque

### Requirement: Animación de ataque visible en los avatares remotos

El sistema SHALL difundir cada golpe de espada de un jugador de modo que su avatar remoto lo reproduzca una única vez por golpe para todos los demás —incluida la víctima—, sin depender de relojes sincronizados entre clientes.

#### Scenario: Se ve la animación de golpe del rival

- **WHEN** un jugador ejecuta un golpe de espada (a otro jugador, a una criatura hostil o al aire)
- **THEN** los demás jugadores ven a su avatar ejecutar la animación de ataque

#### Scenario: La víctima ve el ataque que recibe

- **WHEN** un jugador golpea a otro jugador
- **THEN** la víctima ve la animación de ataque en el avatar del atacante, además del daño recibido

#### Scenario: Los estados repetidos no reaniman el golpe

- **WHEN** el estado periódico del jugador se recibe varias veces sin un golpe nuevo
- **THEN** la animación de ataque no se reproduce repetidamente

#### Scenario: Una reconexión no dispara un golpe falso

- **WHEN** un jugador se reconecta y su señal de golpes vuelve a empezar
- **THEN** los demás no ven una animación de ataque falsa al reincorporarse

#### Scenario: Cliente que ignora el ítem en mano no se rompe

- **WHEN** un cliente que no entiende los datos del ítem en mano los recibe
- **THEN** la sesión sigue funcionando con el resto del protocolo sin errores
