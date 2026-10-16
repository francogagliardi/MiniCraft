# Spec Delta

## Purpose

Restaura el agua que desaparece al romper bloques bajo el nivel del mar, manteniendo lagos y mares continuos sin simular flujo de agua.

## ADDED Requirements

### Requirement: Restauración de agua al romper bajo el nivel del mar

El sistema SHALL restaurar agua en la celda rota cuando el resultado es aire y la celda queda bajo o en el nivel del mar (`y <= WATER_Y`).

#### Scenario: Romper bloque bajo el agua restaura agua

- **WHEN** el jugador rompe un bloque cuya celda queda en aire con `y <= WATER_Y` (bajo el nivel del mar)
- **THEN** la celda vuelve a ser agua en vez de quedar un hueco de aire

#### Scenario: Romper sobre el nivel del mar deja aire

- **WHEN** el jugador rompe un bloque con `y > WATER_Y`
- **THEN** la celda queda en aire como antes, sin restaurar agua

#### Scenario: Restauración visible para otros jugadores

- **WHEN** un jugador rompe un bloque bajo el nivel del mar estando conectado al servidor
- **THEN** los demás jugadores ven agua en esa celda a través del canal de edits existente, sin cambios de protocolo
