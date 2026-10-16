# creatures/animals Specification

## Purpose

Define el comportamiento de deambulación de animales (cerdos y ovejas) para que nunca queden atrapados dentro de follaje o troncos y reaccionen girando cuando su camino está bloqueado.

## Requirements

### Requirement: Colisión de cuerpo completo en animales
El sistema SHALL comprobar la colisión de animales con una altura que cubra pies y cabeza (≥1.1 bloques) en spawn, marcha y gravedad.

#### Scenario: Animal no entra en follaje al caminar
- **WHEN** un animal camina hacia un bloque sólido (hojas, tronco) a altura de cabeza
- **THEN** el sistema detecta la colisión y no mueve al animal dentro del bloque

#### Scenario: Spawn no deja animales dentro de bloques
- **WHEN** aparece un animal en el mundo
- **THEN** el sistema verifica espacio libre de cuerpo completo y rechaza posiciones que lo dejarían incrustado

#### Scenario: Gravedad con cuerpo completo
- **WHEN** un animal cae o está bajo un bloque
- **THEN** la colisión vertical usa cuerpo completo y el animal no atraviesa ni queda dentro de bloques

### Requirement: Re-elección de destino al bloquearse
El sistema SHALL hacer que un animal bloqueado abandone su objetivo actual y elija un nuevo destino con pausa, en vez de empujar o saltar eternamente contra el obstáculo.

#### Scenario: Animal choca y cambia de rumbo
- **WHEN** un animal intenta avanzar y la posición destino colisiona durante varios intentos seguidos
- **THEN** el sistema asigna un nuevo objetivo tx/tz y un tiempo de espera, y el animal deja de empujar contra el obstáculo

#### Scenario: Sin auto-salto contra cubos completos
- **WHEN** un animal está bloqueado por un cubo completo (tronco, tierra) a altura de cuerpo
- **THEN** el sistema NO aplica salto vertical repetido que lo metería en la copa; solo permite paso ante losas/escaleras transitables
