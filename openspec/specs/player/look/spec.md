# player/look Specification

## Purpose

Define cómo el jugador local mueve la mirada (yaw/pitch) con el mouse y con el arrastre táctil, y qué valores de delta se descartan para que un evento espurio del navegador no gire la cámara de forma repentina ni la inutilice.

## Requirements

### Requirement: Saneo del delta de mirada

El sistema SHALL aplicar un delta de mirada solo cuando sea plausible y finito, descartando el evento entero sin girar en absoluto. Un delta SHALL considerarse implausible cuando el valor absoluto de cualquiera de sus componentes alcanza o supera el umbral por evento de 1000 px, y SHALL descartarse cuando cualquiera de sus componentes no sea un número finito. Los deltas aceptados SHALL encolarse y SHALL aplicarse respetando el tope de giro por frame.

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
- **THEN** el delta se acepta y la mirada gira, repartiéndose en varios frames si supera el tope de giro por frame

### Requirement: Primer evento tras re-adquirir el pointer lock

El sistema SHALL ignorar los primeros eventos de movimiento de mouse posteriores a (re)adquirir el pointer lock, porque sus deltas pueden ser espurios, SHALL volver a aplicar los deltas normalmente a partir del evento siguiente a esa ventana, y SHALL descartar cualquier giro pendiente cuando se pierde el lock.

#### Scenario: Volver el foco no gira de un saque

- **WHEN** el jugador recupera el pointer lock (por ejemplo al volver a la pestaña) y llegan los primeros eventos de movimiento con deltas inesperados
- **THEN** esos primeros eventos no mueven la mirada

#### Scenario: El movimiento siguiente sí gira

- **WHEN** luego de los primeros eventos ignorados el jugador sigue moviendo el mouse
- **THEN** los eventos siguientes vuelven a girar la mirada normalmente

#### Scenario: Perder el lock descarta lo pendiente

- **WHEN** el jugador pierde el pointer lock con giro pendiente por aplicar
- **THEN** ese giro pendiente se descarta y no se aplica al recuperar el control

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

### Requirement: Tope de giro por frame

El sistema SHALL limitar la rotación de la mirada aplicada en cada frame a un tope fijo de aproximadamente 0,30 rad (≈17°) y SHALL conservar el excedente para aplicarlo en los frames siguientes, de modo que un delta grande aceptado no gire la cámara de golpe pero un gesto rápido siga girando.

#### Scenario: Un delta aceptado grande no gira 90° de un saque

- **WHEN** llega un único evento de mouse aceptado con un delta de cientos de píxeles
- **THEN** la cámara gira como máximo el tope por frame en ese frame, en lugar de aplicar el delta completo de una vez

#### Scenario: El excedente se reparte en frames siguientes

- **WHEN** un evento deja giro pendiente porque supera el tope por frame
- **THEN** los frames siguientes siguen girando en la misma dirección hasta consumir el excedente, sin perderlo ni invertirlo

#### Scenario: Un movimiento normal no se ve frenado

- **WHEN** el jugador mueve el mouse a velocidad normal y cada evento queda por debajo del tope por frame
- **THEN** la mirada gira con el delta completo en el frame siguiente, sin acumularse ni sentirse más lenta

#### Scenario: El tope rige en todas las cámaras

- **WHEN** ocurre un delta grande aceptado con cámara en primera, tercera o frontal
- **THEN** la rotación aplicada en el frame respeta el mismo tope en los tres modos

### Requirement: Pointer lock sin aceleración del sistema operativo

El sistema SHALL solicitar el pointer lock con el movimiento sin procesar del sistema operativo cuando el navegador lo soporte, y SHALL continuar con el pointer lock clásico cuando la solicitud sea rechazada o no esté disponible, sin impedir que el jugador recupere el control de la cámara.

#### Scenario: El navegador soporta el movimiento sin procesar

- **WHEN** el jugador adquiere o recupera el pointer lock en un navegador que acepta la solicitud sin procesar
- **THEN** el lock se adquiere en ese modo y la mirada responde a los deltas sin la aceleración del sistema operativo

#### Scenario: El navegador rechaza la solicitud

- **WHEN** el navegador rechaza o no reconoce la solicitud de movimiento sin procesar
- **THEN** el sistema vuelve a pedir el pointer lock clásico y el jugador puede seguir mirando con normalidad

### Requirement: Diagnóstico de los deltas grandes aceptados

El sistema SHALL contar los deltas de mirada aceptados que superen aproximadamente 150 px en cualquier eje y SHALL avisar en la consola los primeros casos con sus valores, sin inundar la consola, para poder confirmar el origen de un giro inesperado.

#### Scenario: Un delta grande aceptado deja evidencia

- **WHEN** un delta aceptado supera el umbral de delta grande en cualquiera de sus ejes
- **THEN** el contador de deltas grandes aumenta y, si está entre los primeros, aparece un aviso en consola con el contador y los valores del delta

#### Scenario: Muchos deltas grandes no inundan la consola

- **WHEN** se aceptan muchos deltas grandes seguidos
- **THEN** sólo los primeros se detallan en consola y el resto sólo incrementa el contador

#### Scenario: Un delta normal no genera aviso

- **WHEN** los deltas aceptados son pequeños, como los de un movimiento habitual del mouse
- **THEN** no se emite ningún aviso de delta grande en consola
