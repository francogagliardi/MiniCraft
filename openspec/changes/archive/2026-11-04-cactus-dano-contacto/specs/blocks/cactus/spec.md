# Spec Delta

## MODIFIED Requirements

### Requirement: El cactus daña por contacto al jugador local

El sistema SHALL aplicar 1 HP de daño al jugador local cuando su caja, derivada de su aspecto, esté en contacto con una celda de cactus. El contacto SHALL cumplir al menos una de estas condiciones: (a) la caja intersecta la celda o queda a 0.06 o menos de ella; (b) el jugador intenta un movimiento horizontal que queda bloqueado por una celda de cactus, aunque el paso discreto deje hasta un paso de separación; (c) el jugador está apoyado sobre la cara superior, con la celda del cactus inmediatamente debajo de sus pies. El daño SHALL usar la invulnerabilidad existente (como máximo una vez cada 0.6 s) y SHALL NOT aplicarse a administradores ni a jugadores ya muertos.

#### Scenario: Empuje de costado al correr

- **WHEN** el jugador corre contra un cactus y sigue empujando en esa dirección aunque el bloque le impida avanzar
- **THEN** pierde 1 HP al ritmo de la invulnerabilidad, aunque su caja quede hasta un paso de distancia de la celda por el movimiento discreto

#### Scenario: Apoyo sobre la cara superior

- **WHEN** el jugador se para arriba de un cactus y permanece apoyado
- **THEN** pierde 1 HP al ritmo de la invulnerabilidad

#### Scenario: Caer sobre la cara superior

- **WHEN** el jugador cae y aterriza sobre la cara superior de un cactus
- **THEN** recibe el daño de contacto en el siguiente tick

#### Scenario: Contacto de costado con margen

- **WHEN** el jugador se apoya de costado contra un cactus y su caja queda a 0.06 o menos de la celda
- **THEN** pierde 1 HP aunque el bloque sea sólido y su caja no pueda solaparlo

#### Scenario: Caminar paralelo sin empujar

- **WHEN** el jugador camina al lado de un cactus sin intentar meterse en él y su caja queda a más de 0.06 de la celda
- **THEN** su vida no cambia por el cactus

#### Scenario: El daño se repite al ritmo de la invulnerabilidad

- **WHEN** el jugador permanece en contacto con el cactus durante 1.8 s
- **THEN** pierde 1 HP cada 0.6 s (4 HP en total) y no más seguido

#### Scenario: Un bloque de distancia no daña

- **WHEN** el jugador está a 1 bloque de distancia del cactus, sin tocarlo ni empujarlo
- **THEN** su vida no cambia

#### Scenario: Cactus dentro del cuerpo

- **WHEN** un cactus queda dentro de la caja del jugador (por ejemplo, colocado mientras estaba en otra parte)
- **THEN** el jugador recibe el daño de contacto en el siguiente tick

#### Scenario: Cada aspecto usa su propia caja

- **WHEN** un jugador `small` (≈0.137×0.822) o `giant` (≈0.761×4.568) toca o empuja un cactus
- **THEN** el contacto se evalúa con la caja de su aspecto, no con una caja fija de 0.3×1.8

## REMOVED Requirements

### Requirement: Pararse arriba de un cactus no daña

**Reason**: El usuario pidió que apoyarse sobre la cara superior también pinche. El requisito modificado de contacto ya cubre ese caso con la condición (c).

**Migration**: Sin migración de datos. Es un cambio de comportamiento del cliente: los mundos y las ediciones existentes no cambian.
