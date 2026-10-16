# player/physics Specification

## Purpose

Define que la gravedad y colisión del jugador local continúan con inventario, chat o pausa abiertos, mientras el input de movimiento solo actúa en juego.

## Requirements

### Requirement: Gravedad continúa con menú abierto

El sistema SHALL aplicar gravedad, colisión, daño por caída y actualización de cámara al jugador local cuando el estado es `inv`, `chat` o `pause`, igual que en `play`, salvo que esté muerto.

#### Scenario: Cae con inventario abierto

- **WHEN** el jugador abre el inventario en plena caída y permanece en `inv` varios frames
- **THEN** su altura disminuye por gravedad, colisiona con el terreno y no queda flotando

#### Scenario: Pausa no congela la caída

- **WHEN** el jugador abre la pausa en el aire
- **THEN** sigue cayendo hasta el suelo en vez de quedar suspendido con el menú visible

#### Scenario: Muerto no aplica gravedad

- **WHEN** el jugador está muerto (`dead`, animación de muerte en curso)
- **THEN** no se aplica la física de caída viva (la vista usa la animación de muerte existente)

### Requirement: Input de movimiento solo en juego

El sistema SHALL ignorar el input de desplazamiento y salto (teclado WASD/Espacio y vector táctil) cuando el estado no es `play`; el jugador no SHALL iniciar saltos ni desplazarse lateralmente con menús abiertos.

#### Scenario: Sin desplazamiento con chat abierto

- **WHEN** el jugador mantiene `W` o el joystick táctil con `state='chat'`
- **THEN** su posición horizontal no cambia por input (solo puede cambiar por gravedad/colisión)

#### Scenario: Sin salto con menú abierto

- **WHEN** el jugador presiona Espacio con `state='inv'`
- **THEN** no se inicia ningún salto ni se reproduce el tono de salto
