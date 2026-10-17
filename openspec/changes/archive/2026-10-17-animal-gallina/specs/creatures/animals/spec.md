# Spec Delta

## ADDED Requirements

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
