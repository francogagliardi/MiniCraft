# Spec Delta

## ADDED Requirements

### Requirement: Spawn preferido en 108,16,117

El sistema SHALL intentar primero `SPAWN_PREF = { x:108.5, y:16.01, z:117.5 }` al buscar aparición y SHALL usarlo solo si el bloque bajo los pies es sólido, los pies y el cuerpo no son agua, la caja del aspecto no colisiona y el jugador no queda en contacto con un cactus. Si alguna condición falla, SHALL usar la búsqueda en espiral existente.

#### Scenario: Punto válido para un humano

- **WHEN** un jugador `human` inicia la partida o respawnea en un mundo donde el punto es válido
- **THEN** aparece en `x=108.5`, `y=16.01`, `z=117.5` y el topbar muestra `108·16·117`

#### Scenario: Bloque de abajo no sólido

- **WHEN** la celda debajo de los pies del punto no es sólida (aire, agua o fuera del mundo)
- **THEN** el sistema descarta el preferido y usa el espiral

#### Scenario: Agua en los pies o en el cuerpo

- **WHEN** la celda de los pies o alguna celda que ocupa el cuerpo es agua
- **THEN** el sistema descarta el preferido y usa el espiral

#### Scenario: El cuerpo no entra

- **WHEN** la caja del aspecto colisiona en el punto (por ejemplo, un `giant` con un techo de 4)
- **THEN** el sistema descarta el preferido y usa el espiral

#### Scenario: El pequeño entra donde el gigante no

- **WHEN** dos jugadores distintos prueban el mismo punto con un hueco de 4 bloques
- **THEN** el `small` usa el preferido y el `giant` cae al fallback, cada uno validado con su propia caja

#### Scenario: Contacto con un cactus

- **WHEN** el punto deja al jugador en contacto con un cactus
- **THEN** el sistema descarta el preferido para no aparecer pinchándose y usa el espiral

#### Scenario: Inicio y respawn usan el mismo punto

- **WHEN** el jugador muere y respawnea con el punto todavía válido
- **THEN** vuelve a aparecer en `108.5, 16.01, 117.5`, igual que al iniciar la partida

### Requirement: El spawn preferido es global y no altera el fallback

El sistema SHALL usar el mismo punto de aparición para todos los jugadores, sin comando ni spawn por usuario, y SHALL NOT modificar la regla del fallback: `max(4, ceil(h))` bloques de aire y `collidesAt(..., r, h)` con la caja del aspecto.

#### Scenario: Dos jugadores, un solo punto

- **WHEN** dos jugadores con aspectos distintos entran al mismo mundo con el punto válido para ambos
- **THEN** los dos aparecen en el mismo lugar, sin configuración por usuario

#### Scenario: No hay comando de spawn

- **WHEN** el jugador escribe `/setspawn` o cualquier comando de spawn en el chat
- **THEN** no existe tal comando y el spawn sigue siendo el preferido validado

#### Scenario: El fallback sigue exigiendo el aire histórico

- **WHEN** el punto preferido es inválido y se ejecuta el fallback
- **THEN** el espiral exige `max(4, ceil(h))` bloques de aire y valida con `collidesAt` igual que antes del change
