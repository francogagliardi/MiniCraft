# Spec Delta

## Purpose

Define cómo se suavizan los avatares remotos recibidos por la red (`pm`): umbral de teleport, lerp acotado, interpolación de yaw y protección contra que un `pedit` remoto deje al jugador local dentro de un bloque. Es una mitigación del lag, no su eliminación.

## ADDED Requirements

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
