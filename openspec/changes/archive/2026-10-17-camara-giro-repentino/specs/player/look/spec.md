# Spec Delta

## Purpose

Define cómo el jugador local mueve la mirada (yaw/pitch) con el mouse y con el arrastre táctil, y qué valores de delta se descartan para que un evento espurio del navegador no gire la cámara de forma repentina ni la inutilice.

## ADDED Requirements

### Requirement: Saneo del delta de mirada

El sistema SHALL aplicar un delta de mirada solo cuando sea plausible y finito, descartando el evento entero sin girar en absoluto. Un delta SHALL considerarse implausible cuando el valor absoluto de cualquiera de sus componentes alcanza o supera el umbral por evento de 1000 px, y SHALL descartarse cuando cualquiera de sus componentes no sea un número finito.

#### Scenario: Delta normal gira la cámara

- **WHEN** el jugador mueve el mouse y llega un delta pequeño y finito (por ejemplo `12, -4`)
- **THEN** la mirada gira normalmente con ese delta, igual que antes del cambio

#### Scenario: Delta desproporcionado se descarta sin girar

- **WHEN** llega un evento con un delta enorme (por ejemplo `1000000` px en cualquiera de sus ejes)
- **THEN** el evento se descarta por completo: la mirada no gira nada (no se recorta el delta ni se aplica una parte)

#### Scenario: Delta no finito no envenena la mirada

- **WHEN** llega un delta con un componente no finito (`NaN`, `Infinity`) o ausente (`undefined`, `null`)
- **THEN** el evento se descarta y la mirada conserva su valor anterior, sin quedar inutilizable de forma permanente

#### Scenario: Delta en el borde del umbral se descarta

- **WHEN** llega un delta exactamente igual al umbral por evento en cualquiera de sus ejes (1000 px)
- **THEN** se considera implausible y el evento se descarta

#### Scenario: Delta apenas por debajo del umbral gira

- **WHEN** llega un delta apenas por debajo del umbral (por ejemplo 999 px)
- **THEN** la mirada gira normalmente con ese delta

### Requirement: Primer evento tras re-adquirir el pointer lock

El sistema SHALL ignorar el primer evento de movimiento de mouse posterior a (re)adquirir el pointer lock, porque su delta puede ser espurio, y SHALL volver a aplicar los deltas normalmente a partir del evento siguiente.

#### Scenario: Volver el foco no gira de un saque

- **WHEN** el jugador recupera el pointer lock (por ejemplo al volver a la pestaña) y llega un primer evento de movimiento con un delta inesperado
- **THEN** ese primer evento no mueve la mirada

#### Scenario: El movimiento siguiente sí gira

- **WHEN** luego del primer evento ignorado el jugador sigue moviendo el mouse
- **THEN** los eventos siguientes vuelven a girar la mirada normalmente

### Requirement: Observabilidad de los descartes

El sistema SHALL registrar en la consola del navegador cada descarte de un delta de mirada, con un contador acumulado y con los valores descartados de los primeros casos, para poder distinguir un descarte legítimo de la hipótesis de un giro espurio.

#### Scenario: Un descarte deja evidencia en consola

- **WHEN** se descarta un evento de mirada por delta implausible o no finito
- **THEN** aparece un aviso en la consola con contador y con los valores del delta descartado

#### Scenario: El aviso no inunda la consola

- **WHEN** se descartan muchos eventos de mirada seguidos
- **THEN** solo los primeros se avisan con detalle; el resto solo incrementa el contador, sin llenar la consola

### Requirement: La mirada solo cambia por input propio válido

El sistema SHALL cambiar el yaw y el pitch del jugador local únicamente a partir de su propio input de mirada válido; el estado remoto y el tráfico de red no SHALL modificar la mirada local.

#### Scenario: Sin input la mirada no cambia

- **WHEN** no llega ningún evento de mirada válido durante varios frames
- **THEN** el yaw y el pitch del jugador local conservan su valor

#### Scenario: El estado de los demás jugadores no mueve la cámara

- **WHEN** llegan actualizaciones de posición o de orientación de otros jugadores
- **THEN** la mirada del jugador local no cambia
