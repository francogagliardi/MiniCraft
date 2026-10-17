# Spec Delta

## ADDED Requirements

### Requirement: Ítem en mano visible en los avatares remotos

El sistema SHALL conocer qué ítem tiene seleccionado cada jugador y SHALL mostrarlo en su avatar remoto cuando ese ítem sea un arma (espada o pico), de modo que los demás jugadores vean el arma que el otro lleva en la mano.

#### Scenario: Se ve la espada del otro jugador

- **WHEN** un jugador tiene la espada seleccionada
- **THEN** su avatar remoto muestra la espada en la mano para los demás jugadores

#### Scenario: Se ve el pico del otro jugador

- **WHEN** un jugador tiene el pico seleccionado
- **THEN** su avatar remoto muestra el pico en la mano para los demás jugadores

#### Scenario: Sin arma no hay modelo en mano

- **WHEN** un jugador tiene seleccionado un bloque (o cualquier ítem que no sea un arma)
- **THEN** su avatar remoto no muestra ningún modelo de arma en la mano

#### Scenario: Un jugador que entra ya ve las armas de los demás

- **WHEN** un jugador se conecta y otros ya tienen un arma seleccionada
- **THEN** ve esas armas en sus avatares sin esperar a que los otros cambien de ítem

#### Scenario: Cambiar de ítem se refleja sin gesto

- **WHEN** un jugador cambia el ítem seleccionado sin atacar
- **THEN** el cambio se refleja en su avatar remoto y no se reproduce ninguna animación de ataque

### Requirement: Animación de ataque visible en los avatares remotos

El sistema SHALL difundir cada golpe de espada de un jugador de modo que su avatar remoto lo reproduzca una única vez por golpe para todos los demás —incluida la víctima—, sin depender de relojes sincronizados entre clientes.

#### Scenario: Se ve la animación de golpe del rival

- **WHEN** un jugador ejecuta un golpe de espada (a otro jugador, a una criatura hostil o al aire)
- **THEN** los demás jugadores ven a su avatar ejecutar la animación de ataque

#### Scenario: La víctima ve el ataque que recibe

- **WHEN** un jugador golpea a otro jugador
- **THEN** la víctima ve la animación de ataque en el avatar del atacante, además del daño recibido

#### Scenario: Los estados repetidos no reaniman el golpe

- **WHEN** el estado periódico del jugador se recibe varias veces sin un golpe nuevo
- **THEN** la animación de ataque no se reproduce repetidamente

#### Scenario: Una reconexión no dispara un golpe falso

- **WHEN** un jugador se reconecta y su señal de golpes vuelve a empezar
- **THEN** los demás no ven una animación de ataque falsa al reincorporarse

#### Scenario: Cliente que ignora el ítem en mano no se rompe

- **WHEN** un cliente que no entiende los datos del ítem en mano los recibe
- **THEN** la sesión sigue funcionando con el resto del protocolo sin errores
