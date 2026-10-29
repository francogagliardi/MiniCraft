# Spec Delta

## ADDED Requirements

### Requirement: Alcance de rotura derivado del aspecto

El sistema SHALL derivar el alcance para romper bloques de la altura del aspecto del jugador con `f = spec.height / BASE_H`, usando `8*f` medido desde el ojo del jugador y no desde la cámara.

#### Scenario: El humano conserva 8 bloques

- **WHEN** el jugador usa el aspecto `human`
- **THEN** puede romper bloques hasta 8 bloques de distancia, igual que antes del change

#### Scenario: El gigante rompe desde lejos

- **WHEN** el jugador usa el aspecto `giant`
- **THEN** puede romper bloques hasta ≈20.305 bloques de distancia

#### Scenario: El pequeño rompe desde cerca

- **WHEN** el jugador usa el aspecto `small`
- **THEN** puede romper bloques hasta ≈3.655 bloques de distancia

#### Scenario: Los demás aspectos también escalan

- **WHEN** el jugador usa `fat`, `zombie` o `robot`
- **THEN** su alcance de rotura sale de su factor (`fat` ≈6.904, `zombie` 8, `robot` ≈7.716)

#### Scenario: La rotura sale del ojo en las tres perspectivas

- **WHEN** el jugador rompe un bloque en primera, en 3ª trasera o en 3ª frontal
- **THEN** el DDA parte del ojo y usa el alcance de su aspecto, sin medir desde la cámara orbital
