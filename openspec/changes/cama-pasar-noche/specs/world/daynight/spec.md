# Spec Delta

## ADDED Requirements

### Requirement: Salto coordinado al amanecer

El servidor SHALL poder avanzar su fase de ciclo hasta el comienzo del amanecer cuando lo dispare el quórum de sueño, y SHALL difundir la nueva fase de inmediato para que todos los clientes la adopten.

#### Scenario: Salto de fase por sueño

- **WHEN** el quórum de sueño se cumple de noche
- **THEN** la fase avanza hasta ≈`0.002` (justo después del inicio del amanecer) y se emite un `tod` inmediato

#### Scenario: El salto no persiste

- **WHEN** el servidor guarda el mundo después de un salto
- **THEN** `save()` sigue escribiendo solo `{seed, edits}` y no guarda el offset, la fase ni el estado de sueño

#### Scenario: Fase normal sin salto

- **WHEN** no hubo ningún salto de sueño
- **THEN** la fase sigue calculándose con la misma fórmula y el mismo ancla de arranque de siempre

## MODIFIED Requirements

### Requirement: Reloj del ciclo en el servidor

El servidor SHALL ser el dueño del reloj del ciclo: SHALL mantener su fase anclada al momento de arranque más un offset de fase mutable que solo cambia por un salto de sueño, SHALL NOT persistirla en `world.json`, y la fase `v` SHALL seguir siendo un valor normalizado en `[0,1)` que representa la posición dentro del ciclo.

#### Scenario: Reloj anclado al arranque del servidor

- **WHEN** el servidor arranca
- **THEN** fija su ancla temporal en ese instante, arranca con offset cero y calcula la fase `v ∈ [0,1)` a partir del tiempo transcurrido desde entonces

#### Scenario: El reloj no se persiste en el mundo

- **WHEN** el servidor guarda el mundo o se reinicia
- **THEN** ninguna fase, ancla, offset ni duración del ciclo se escribe ni se lee de `world.json`; tras un reinicio el ciclo arranca de nuevo desde su ancla y offset cero

#### Scenario: El offset solo lo mueve el sueño

- **WHEN** transcurre el juego sin que se cumpla un quórum de sueño
- **THEN** el offset permanece en cero y la fase avanza solo por el paso del tiempo real
