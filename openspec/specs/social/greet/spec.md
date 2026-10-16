# social/greet Specification

## Purpose
Permite a los jugadores saludarse entre sí con clic derecho sobre otro avatar, mostrando un mensaje pícaro con efectos visuales y sonoros.

## Requirements

### Requirement: Mensaje pícaro al saludar a otro jugador
El sistema SHALL mostrar el mensaje `💕 A {nombre} le gusta que lo toquen ahí` cuando el jugador local hace clic derecho sobre el avatar de otro jugador.

#### Scenario: Saludo con clic derecho
- **WHEN** el jugador hace clic derecho apuntando al avatar de otro jugador dentro del alcance
- **THEN** el sistema muestra el toast `💕 A {nombre} le gusta que lo toquen ahí` con el nombre del jugador saludado

#### Scenario: Efectos del saludo
- **WHEN** se dispara el saludo a otro jugador
- **THEN** el sistema muestra un burst de corazones rosas sobre el avatar saludado y reproduce el tono ascendente, igual que antes del cambio
