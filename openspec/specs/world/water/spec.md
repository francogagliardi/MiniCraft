# world/water Specification

## Purpose

Restaura el agua que desaparece al romper bloques bajo el nivel del mar, manteniendo lagos y mares continuos sin simular flujo de agua.

## Requirements

### Requirement: Restauración de agua al romper bajo el nivel del mar

El sistema SHALL restaurar agua en la celda rota solo cuando la celda quede en/bajo el nivel del mar (`y <= WATER_Y`) y al menos una celda vecina (arriba, abajo o uno de los cuatro costados) contenga agua; en cualquier otro caso la celda queda en aire.

#### Scenario: Romper bloque bajo el agua restaura agua

- **WHEN** el jugador rompe un bloque cuya celda queda en/bajo el nivel del mar (`y <= WATER_Y`) y tiene al menos un vecino con agua (p. ej. el propio fondo del mar)
- **THEN** la celda vuelve a ser agua en vez de quedar un hueco de aire

#### Scenario: Cavar tierra adentro bajo el nivel del mar deja aire

- **WHEN** el jugador rompe un bloque cuya celda queda en/bajo el nivel del mar (`y <= WATER_Y`) pero ninguna de sus celdas vecinas tiene agua (excavación tierra adentro, sin mar próximo)
- **THEN** la celda queda en aire, sin restaurar agua

#### Scenario: Romper sobre el nivel del mar deja aire

- **WHEN** el jugador rompe un bloque con `y > WATER_Y`
- **THEN** la celda queda en aire como antes, sin restaurar agua

#### Scenario: Romper el costado de un lago deja agua en la celda nueva

- **WHEN** el jugador rompe un bloque cuya celda queda en/bajo el nivel del mar y uno de sus vecinos laterales es agua (p. ej. el borde de un lago)
- **THEN** la celda nueva queda con agua, una celda por vez y sin simular flujo

#### Scenario: Restauración visible para otros jugadores

- **WHEN** un jugador rompe un bloque que resulta en agua bajo el nivel del mar estando conectado al servidor
- **THEN** los demás jugadores ven agua en esa celda a través del canal de edits existente, sin cambios de protocolo
