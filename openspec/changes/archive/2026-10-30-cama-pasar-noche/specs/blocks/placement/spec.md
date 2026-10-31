# Spec Delta

## ADDED Requirements

### Requirement: Colocación y rotura de la cama de dos celdas

El sistema SHALL colocar la cama en dos celdas contiguas —pie en la celda apuntada y cabecera en la celda siguiente según la dirección horizontal dominante de la mirada— solo cuando ambas celdas estén dentro del mundo, libres y sin solapar con jugadores ni animales; y SHALL romper ambas celdas al romper cualquiera de las dos.

#### Scenario: Colocación con ambas celdas libres

- **WHEN** el jugador usa la cama apuntando a una celda libre y la celda contigua en la dirección de su mirada también está libre
- **THEN** se colocan el pie y la cabecera con dos ediciones de mundo

#### Scenario: La celda de la cabecera está ocupada

- **WHEN** la celda contigua está ocupada por un bloque sólido
- **THEN** no se coloca ninguna de las dos mitades y el mundo no cambia

#### Scenario: Un jugador ocupa la cabecera

- **WHEN** la celda de la cabecera solapa con un jugador o un animal
- **THEN** se rechaza la colocación completa con un aviso, usando las mismas guardas de ocupación que la puerta

#### Scenario: La cabecera se sale del mundo

- **WHEN** la celda contigua cae fuera de los límites del mundo
- **THEN** se rechaza la colocación y no se modifica ninguna celda

#### Scenario: Rotura de una mitad

- **WHEN** el jugador rompe el pie o la cabecera de una cama
- **THEN** se rompen las dos celdas de la cama

#### Scenario: Media cama preexistente

- **WHEN** el jugador rompe una celda de cama cuya pareja ya no existe
- **THEN** se rompe solo esa celda, sin afectar bloques vecinos
