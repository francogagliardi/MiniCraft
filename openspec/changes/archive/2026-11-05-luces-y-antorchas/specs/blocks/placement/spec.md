# Spec Delta

## ADDED Requirements

### Requirement: Rotura en cascada de bloques sin soporte

El sistema SHALL, al romper localmente un bloque sólido, revisar las seis celdas vecinas y romper en la misma operación las antorchas y farolas que quedaron sin soporte, en una sola pasada y sin recursión. SHALL NOT ejecutar la cascada al procesar un `pedit` remoto.

#### Scenario: Se rompe el soporte de una antorcha

- **WHEN** el jugador rompe el bloque del que se apoya una antorcha y la antorcha queda sin ninguna cara sólida
- **THEN** la antorcha se rompe en la misma operación y su celda vuelve a aire

#### Scenario: Se rompe el soporte de una farola

- **WHEN** el jugador rompe el bloque del que cuelga una farola
- **THEN** la farola se rompe en la misma operación

#### Scenario: El bloque roto no era soporte

- **WHEN** el jugador rompe un bloque que no sostiene ninguna antorcha ni farola
- **THEN** no se rompe ningún bloque adicional

#### Scenario: La cascada no se encadena

- **WHEN** la cascada rompe una antorcha y esa celda era soporte de otro bloque
- **THEN** la rotura se detiene ahí: solo se revisan los vecinos del bloque roto original

#### Scenario: Edit remoto sin cascada

- **WHEN** llega un `pedit` remoto que rompe un soporte
- **THEN** el cliente aplica solo esa edición y no dispara la cascada local
