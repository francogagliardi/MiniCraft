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

### Requirement: Caja de colisión derivada del aspecto

El sistema SHALL derivar la caja de colisión del jugador local de la altura de su aspecto con `BASE_H = 1.97` y `f = spec.height / BASE_H`, usando `r = 0.3*f` de semiancho y `h = 1.8*f` de alto, y SHALL usar esa caja en `collides`, `slabBlocked`, `outOfCell` y `pushLocalOutOfBlock`.

#### Scenario: El humano conserva la caja exacta

- **WHEN** el jugador usa el aspecto `human`
- **THEN** su caja es exactamente 0.3 de semiancho y 1.8 de alto, igual que antes del change

#### Scenario: El pequeño entra en un hueco de 1 bloque

- **WHEN** un jugador con aspecto `small` camina hacia un hueco de 1 bloque de alto
- **THEN** su caja (≈0.137 × 0.822) pasa por el hueco sin colisionar

#### Scenario: El gigante no entra en 4 bloques y sí en 5

- **WHEN** un jugador con aspecto `giant` intenta pasar por un espacio de 4 bloques de alto
- **THEN** su caja (≈0.761 × 4.568) colisiona y no pasa; en un espacio de 5 bloques sí pasa

#### Scenario: Los demás aspectos también tienen su caja

- **WHEN** el jugador usa `fat`, `zombie` o `robot`
- **THEN** su caja es la derivada de su altura (`fat` ≈0.259 × 1.553, `zombie` 0.3 × 1.8, `robot` ≈0.289 × 1.736)

#### Scenario: El auto-step usa la misma caja

- **WHEN** el jugador sube una losa o escalera
- **THEN** `slabBlocked` y la verificación de aire usan la caja de su aspecto, no una caja fija de 0.3 × 1.8

### Requirement: Altura de ojos, cámara y daño propio derivados del aspecto

El sistema SHALL fijar el ojo del jugador a `1.62*f`, la amplitud del bob en primera persona a `0.05*f`, la cámara de muerte desde `1.62*f` hasta `0.32*f`, y el número de daño propio a `player.pos.y + spec.height + 0.33`.

#### Scenario: El humano conserva ojo, bob y daño

- **WHEN** el jugador usa el aspecto `human`
- **THEN** su ojo queda a 1.62, el bob usa amplitud 0.05, la cámara de muerte va de 1.62 a 0.32 y el daño propio aparece a `pos.y+2.30`

#### Scenario: El gigante ve desde más arriba

- **WHEN** el jugador usa el aspecto `giant`
- **THEN** su ojo queda a ≈4.112, el bob escala a ≈0.127, la cámara de muerte cae de ≈4.112 a ≈0.812 y el daño propio aparece a `pos.y+5.33`

#### Scenario: El pequeño ve desde abajo

- **WHEN** el jugador usa el aspecto `small`
- **THEN** su ojo queda a ≈0.740, el bob escala a ≈0.023, la cámara de muerte cae de ≈0.740 a ≈0.146 y el daño propio aparece a `pos.y+1.23`

#### Scenario: El daño propio no queda dentro del cuerpo

- **WHEN** el jugador recibe daño con cualquier aspecto
- **THEN** el número flotante sale por encima de la altura total de su modelo, no a una altura fija de humano

### Requirement: Aparición y desatasco con la caja del aspecto

El sistema SHALL usar la caja del aspecto en `findSpawn` y en `pushLocalOutOfBlock`: `findSpawn` SHALL exigir `max(4, ceil(h))` bloques de aire sobre el candidato (mínimo histórico 4, más para aspectos que lo superen) y SHALL validarlo con `collidesAt(..., r, h)`, y el desatasco SHALL usar `r` y `h` del aspecto.

#### Scenario: El humano exige 4 bloques de aire

- **WHEN** el jugador `human` busca un punto de aparición
- **THEN** el candidato necesita 4 bloques de aire y pasa `collidesAt` con 0.3 × 1.8

#### Scenario: El pequeño exige 4 para aparecer, aunque se mueva por 1

- **WHEN** el jugador `small` busca un punto de aparición
- **THEN** el candidato necesita 4 bloques de aire y pasa `collidesAt` con ≈0.137 × 0.822; al moverse sí puede cruzar un hueco de 1, pero no aparece dentro de uno

#### Scenario: El gigante exige 5 bloques de aire

- **WHEN** el jugador `giant` busca un punto de aparición
- **THEN** el candidato necesita 5 bloques de aire y no aparece dentro de una cueva de 4 bloques de alto

#### Scenario: Desatasco con la caja correcta

- **WHEN** un bloque queda dentro del cuerpo del jugador y se ejecuta `pushLocalOutOfBlock`
- **THEN** el desatasco busca una salida usando la caja de su aspecto, no la de 0.3 × 1.8

### Requirement: El movimiento no se escala con el aspecto

El sistema SHALL NOT escalar con `f` la velocidad de caminata, el salto, la gravedad, la velocidad terminal, el daño de caída ni la vida; solo la caja, el ojo, los alcances y la cámara 3ª dependen del tamaño.

#### Scenario: La velocidad es la misma para todos

- **WHEN** un `human`, un `small` y un `giant` caminan en línea recta
- **THEN** los tres se desplazan a la misma velocidad base y saltan con la misma fuerza

#### Scenario: La caída daña igual

- **WHEN** un `human`, un `small` y un `giant` caen desde la misma altura
- **THEN** el daño de caída se calcula con la misma regla para los tres

#### Scenario: La vida no cambia con el tamaño

- **WHEN** un jugador elige cualquier aspecto
- **THEN** su vida máxima, su regeneración y el daño de su espada siguen siendo los mismos
