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

### Requirement: Gallina como tercer animal del mundo

El sistema SHALL poblar el mundo con gallinas además de cerdos y ovejas, reutilizando el mismo comportamiento genérico de deambulación, colisión de cuerpo completo y mascota. La gallina es más chica que los otros animales y su presencia no altera el comportamiento de cerdos ni ovejas.

#### Scenario: Spawn de gallinas

- **WHEN** el mundo carga
- **THEN** se generan gallinas sobre pasto con el mismo filtro de validez que cerdos y ovejas (fuera del agua, sin dejar de estar sobre pasto y con espacio libre de cuerpo completo), hasta el objetivo de gallinas definido

#### Scenario: Spawn variado conserva los tres animales

- **WHEN** el mundo carga con los tres tipos configurados
- **THEN** se alcanzan los objetivos de cerdos, ovejas y gallinas de forma conjunta, sin que un tipo desplace por completo a otro

#### Scenario: Apariencia de gallina chica

- **WHEN** se renderiza una gallina
- **THEN** el modelo es más chico que el de cerdo/oveja, con cuerpo blanco, cresta roja, pico y patas amarillas y alitas

#### Scenario: Mascota de gallina

- **WHEN** el jugador acaricia una gallina
- **THEN** se reproduce un cloqueo y aparece el toast `🐔 ¡Clo clo!`, con el mismo salto y partículas que los demás animales

#### Scenario: Deambulación genérica

- **WHEN** una gallina deambula y su camino se bloquea
- **THEN** respeta la colisión de cuerpo completo y la re-elección de destino al bloquearse igual que cerdos y ovejas, animando sus patas al caminar
