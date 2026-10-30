# blocks/cactus Specification

## Purpose
Define el bloque Cactus 🌵 como un peligro de contacto para el jugador local: daña al tocarlo, no
daña parado arriba ni a criaturas, tiene su propio mensaje de muerte y no se genera en el mundo.

## Requirements

### Requirement: El cactus daña por contacto al jugador local

El sistema SHALL aplicar 1 HP de daño al jugador local cuando su caja, derivada de su aspecto, interseque una celda de cactus con un margen de contacto de 0.06. El daño SHALL usar la invulnerabilidad existente (como máximo una vez cada 0.6 s) y SHALL NOT aplicarse a administradores ni a jugadores ya muertos.

#### Scenario: Contacto de costado con margen

- **WHEN** el jugador se apoya de costado contra un cactus y su caja queda a 0.06 o menos de la celda
- **THEN** pierde 1 HP aunque el bloque sea sólido y su caja no pueda solaparlo

#### Scenario: El daño se repite al ritmo de la invulnerabilidad

- **WHEN** el jugador permanece en contacto con el cactus durante 1.8 s
- **THEN** pierde 1 HP cada 0.6 s (4 HP en total) y no más seguido

#### Scenario: Un bloque de distancia no daña

- **WHEN** el jugador está a 1 bloque de distancia del cactus, sin tocarlo
- **THEN** su vida no cambia

#### Scenario: Cactus dentro del cuerpo

- **WHEN** un cactus queda dentro de la caja del jugador (por ejemplo, colocado mientras estaba en otra parte)
- **THEN** el jugador recibe el daño de contacto en el siguiente tick

#### Scenario: Cada aspecto usa su propia caja

- **WHEN** un jugador `small` (≈0.137×0.822) o `giant` (≈0.761×4.568) toca un cactus
- **THEN** el contacto se evalúa con la caja de su aspecto, no con una caja fija de 0.3×1.8

### Requirement: Pararse arriba de un cactus no daña

El sistema SHALL NOT aplicar daño de cactus cuando el jugador está apoyado sobre la cara superior del bloque, porque su caja empieza en `y+1` de la celda y no la intersecta.

#### Scenario: Caminar sobre el cactus es seguro

- **WHEN** el jugador se para arriba de un cactus y camina sobre él
- **THEN** su vida no cambia por el cactus (solo podría cambiar por otra causa, como una caída)

#### Scenario: Caer sobre la cara superior

- **WHEN** el jugador cae y aterriza sobre la cara superior de un cactus
- **THEN** no recibe daño de cactus al aterrizar

### Requirement: La muerte por cactus tiene su propio mensaje

El sistema SHALL terminar la partida con causa `cactus` cuando el daño de cactus agota la vida del jugador y SHALL mostrar `Te pinchaste con un cactus. 🌵` en el cartel de muerte.

#### Scenario: El cartel nombra al cactus

- **WHEN** el golpe de cactus deja la vida del jugador en 0
- **THEN** el cartel de muerte muestra `Te pinchaste con un cactus. 🌵` y el respawn funciona como siempre

#### Scenario: Las otras causas conservan su mensaje

- **WHEN** el jugador muere por caída o por otro jugador
- **THEN** el cartel mantiene el mensaje que ya tenía para esa causa

### Requirement: El cactus no daña a criaturas, animales ni al bot

El sistema SHALL limitar el daño de contacto del cactus al jugador local: zombis, animales y el bot cazador SHALL NOT recibir daño de cactus.

#### Scenario: Un zombi cruza un cactus

- **WHEN** un zombi camina al lado o sobre un cactus
- **THEN** su vida no cambia por el cactus

#### Scenario: Un animal cruza un cactus

- **WHEN** un animal camina al lado o sobre un cactus
- **THEN** su vida no cambia por el cactus

#### Scenario: El bot cruza un cactus

- **WHEN** el bot cazador pasa al lado o sobre un cactus
- **THEN** su vida no cambia por el cactus

### Requirement: El cactus conserva su identidad y no se genera en el mundo

El sistema SHALL NOT cambiar el id 22, su nombre `Cactus 🌵`, su textura, su dureza, su inventario ni su colocación, y SHALL NOT generar cactus de forma natural: el bloque solo existe si un jugador lo coloca.

#### Scenario: Colocar y picar no cambian

- **WHEN** el jugador coloca o pica un cactus
- **THEN** el bloque sigue siendo el id 22 con la misma textura y dureza, y su etiqueta sigue siendo `Cactus 🌵`

#### Scenario: Un mundo nuevo no trae cactus

- **WHEN** se genera un mundo nuevo
- **THEN** no aparece ningún cactus generado por el worldgen (solo los que se coloquen)

### Requirement: El daño por cactus es local al cliente

El sistema SHALL aplicar el daño de cactus en el cliente del jugador afectado y SHALL NOT enviar un mensaje nuevo al servidor: cada cliente calcula su propio daño y los demás ven la vida actualizada por el `pm` existente.

#### Scenario: Los demás ven la vida caer

- **WHEN** un jugador se pincha con un cactus en una partida multijugador
- **THEN** los otros clientes ven su vida actualizada por el `pm` existente y no reciben daño ellos

#### Scenario: El servidor no valida el pinchazo

- **WHEN** el cliente aplica daño de cactus
- **THEN** el servidor no recibe ni valida ningún mensaje nuevo de cactus
