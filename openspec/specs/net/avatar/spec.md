# net/avatar Specification

## Purpose
Define cómo se suavizan los avatares remotos recibidos por la red (`pm`): umbral de teleport, lerp acotado, interpolación de yaw y protección contra que un `pedit` remoto deje al jugador local dentro de un bloque. Es una mitigación del lag, no su eliminación.

## Requirements

### Requirement: Teleport ante distancia grande

El sistema SHALL hacer snap directo del avatar remoto a `target` cuando la distancia horizontal supere 6 unidades, en vez de lerpear, para evitar desplazamientos largos suaves por ráfagas atrasadas.

#### Scenario: Distancia mayor a 6 dispara snap

- **WHEN** llega un `pm` que deja al remoto a más de 6 unidades de su posición renderizada
- **THEN** el avatar se coloca directamente en `target` en un solo frame (no hay lerp intermedio)

#### Scenario: Distancia menor o igual a 6 se lerpea

- **WHEN** el remoto está a 6 unidades o menos de `target`
- **THEN** su posición renderizada se acerca a `target` mediante lerp acotado, sin snap

### Requirement: Lerp acotado

El sistema SHALL lerpear la posición renderizada del avatar remoto hacia `target` solo cuando la distancia sea menor o igual a 6 unidades, con un factor acotado por frame que evite teletransportes suaves de golpe.

#### Scenario: Lerp limitado al paso de frame

- **WHEN** se aplica lerp en un frame con distancia <= 6
- **THEN** el movimiento del avatar en ese frame está limitado por el factor de lerp del frame, no es un salto a `target`

### Requirement: Interpolación de yaw

El sistema SHALL interpolar el yaw del avatar remoto suavemente hacia el yaw reportado en `pm`, sin giros bruscos ni saltos angulares.

#### Scenario: Yaw gira hacia el reportado

- **WHEN** llega un `pm` con un yaw distinto al renderizado
- **THEN** el yaw renderizado se acerca al yaw del `pm` de forma progresiva frame a frame

#### Scenario: Yaw estable sin movimiento

- **WHEN** el remoto no se mueve y llega un `pm` con el mismo yaw
- **THEN** el yaw renderizado no cambia

### Requirement: Buffer opcional de pm

El sistema SHALL poder bufferizar los mensajes `pm` hasta 100ms (opcional, activable/desactivable sin cambiar el protocolo) para ordenar y suavizar ráfagas antes de aplicar la posición a `target`.

#### Scenario: Ráfaga de pm se bufferiza

- **WHEN** llegan varios `pm` en menos de 100ms
- **THEN** se aplican en orden al `target` sin saltos intermedios visibles

### Requirement: Pedit no deja al jugador local dentro de un bloque

El sistema SHALL evitar que un `pedit` remoto deje al jugador local dentro de un bloque; si la edición coloca un bloque que ocupa la celda del jugador local, el sistema SHALL resolver la colisión sacando al jugador local fuera del bloque en vez de dejarlo dentro.

#### Scenario: Pedit sobre el jugador local lo saca fuera

- **WHEN** un `pedit` remoto coloca un bloque en la celda donde está el jugador local
- **THEN** el jugador local es reubicado fuera del bloque (colisión resuelta hacia fuera) y no queda atrapado dentro

#### Scenario: Pedit en celda libre no afecta al jugador

- **WHEN** un `pedit` remoto coloca un bloque en una celda libre sin el jugador local
- **THEN** el jugador local no se mueve ni sufre efecto colateral

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

### Requirement: Aspecto declarado por el jugador y difundido por el protocolo

El sistema SHALL conocer el aspecto (`skin`) declarado por cada jugador al entrar y SHALL difundirlo al resto de las conexiones al presentarlo y en su estado periódico, de modo que todos los clientes dispongan del dato antes de dibujar su avatar remoto. El cliente SHALL resolver el valor recibido contra el catálogo de aspectos y SHALL usar `human` cuando falte, sea inválido o no exista en el catálogo.

#### Scenario: Un jugador que entra ya ve el aspecto de los demás

- **WHEN** un jugador se conecta y otros ya declararon su aspecto
- **THEN** ve el aspecto de cada uno sin esperar a que lo vuelvan a declarar

#### Scenario: El aspecto llega también en el estado periódico

- **WHEN** un jugador existente emite su estado periódico
- **THEN** ese estado sigue incluyendo su aspecto declarado

#### Scenario: Sin aspecto declarado se usa el avatar por defecto

- **WHEN** un jugador no declara ningún aspecto (o manda un valor desconocido)
- **THEN** su avatar remoto se dibuja con el modelo humano por defecto

#### Scenario: Un aspecto nuevo llega a clientes viejos

- **WHEN** un cliente que solo conoce `human` y `robot` recibe un aspecto nuevo como `giant`
- **THEN** sigue funcionando sin errores y dibuja su avatar por defecto

### Requirement: Avatar remoto con variante robot humanoide

Cuando el aspecto declarado es `robot`, el sistema SHALL dibujar el avatar remoto como un robot humanoide metálico con ojos brillantes y antena, con el mismo estilo low-poly del resto de los modelos del juego, conservando el comportamiento del avatar remoto (posición, orientación, vida y arma en mano).

#### Scenario: El bot se ve como robot

- **WHEN** un jugador con aspecto `robot` está presente
- **THEN** su avatar remoto se dibuja como robot humanoide (cuerpo metálico, ojos brillantes y antena) en lugar del modelo humano

#### Scenario: El robot conserva el resto del comportamiento del avatar

- **WHEN** el avatar robot se mueve, mira, muere o lleva un arma
- **THEN** se suaviza, orienta, se desploma y muestra el arma igual que cualquier otro avatar remoto

#### Scenario: Un cliente que ignora el aspecto no se rompe

- **WHEN** un cliente que no entiende el campo `skin` recibe el estado de un jugador con aspecto `robot`
- **THEN** sigue funcionando con normalidad y muestra su avatar por defecto, sin errores

### Requirement: Catálogo de aspectos con altura declarada

El sistema SHALL exponer un catálogo declarativo de seis aspectos (`human`, `fat`, `giant`, `small`, `zombie`, `robot`) y cada entrada SHALL declarar al menos su etiqueta, su altura total en unidades del mundo y los datos de color o escala que su modelo necesita.

#### Scenario: Los seis aspectos existen

- **WHEN** el cliente resuelve el catálogo de aspectos
- **THEN** encuentra exactamente las entradas `human`, `fat`, `giant`, `small`, `zombie` y `robot`, cada una con etiqueta, altura y datos de modelo

#### Scenario: Alturas declaradas

- **WHEN** se consulta la altura de cada aspecto
- **THEN** `human` y `zombie` miden 1.97, `fat` 1.70, `small` 0.90, `robot` 1.90 nominal y `giant` mide exactamente 5.00

#### Scenario: La altura del humano es la del rig real

- **WHEN** se mide el modelo `human` completo (cabellera incluida)
- **THEN** su parte superior queda a 1.97 unidades sobre su base, igual que la constante `BASE_H`

### Requirement: Aspecto humano por defecto

El sistema SHALL resolver a `human` cualquier aspecto ausente, vacío, con tipo inválido o que no figure en el catálogo, sin lanzar errores ni dejar el avatar sin modelo.

#### Scenario: Valor ausente usa human

- **WHEN** un avatar remoto llega sin el campo `skin`
- **THEN** se dibuja con el modelo `human`

#### Scenario: Valor desconocido usa human

- **WHEN** un avatar remoto declara un `skin` que no está en el catálogo (por ejemplo `dragon`)
- **THEN** se dibuja con el modelo `human` y la sesión sigue funcionando con normalidad

#### Scenario: Tipo inválido usa human

- **WHEN** el `skin` recibido no es un string (número, objeto, `null`)
- **THEN** se dibuja con el modelo `human` sin errores

### Requirement: Render del aspecto `fat`

El sistema SHALL dibujar el aspecto `fat` como un humanoide más ancho que el humano, con panza visible y brazos y piernas rechonchos, de ~1.7 unidades de alto.

#### Scenario: El avatar gordo es más ancho y más bajo

- **WHEN** un jugador con aspecto `fat` está presente
- **THEN** su avatar remoto se ve más ancho que el humano, con panza y extremidades gruesas, y su altura total ronda 1.7

#### Scenario: El gordo conserva el resto del comportamiento

- **WHEN** el avatar `fat` camina, mira, muere o lleva un arma
- **THEN** se anima, orienta, se desploma y muestra el arma igual que cualquier otro avatar remoto

### Requirement: Render del aspecto `giant`

El sistema SHALL dibujar el aspecto `giant` con exactamente 5.00 unidades de alto, escalando el rig base (`BASE_H = 1.97`) por el factor `5.00/1.97`. La caja de colisión, la altura de ojos y los alcances de este aspecto se especifican en `player/physics`, `player/combat` y `player/mining`; este requisito solo cubre el render y la altura.

#### Scenario: El gigante mide 5 bloques

- **WHEN** se mide la altura del modelo de un avatar con aspecto `giant`
- **THEN** su parte superior queda a 5.00 unidades sobre su base (tolerancia menor a 1e-9)

#### Scenario: El gigante se ve desde lejos

- **WHEN** otro jugador observa a un `giant` a la distancia
- **THEN** lo ve claramente más alto que el resto, con el modelo completo a escala

#### Scenario: El tamaño del gigante también se juega

- **WHEN** un jugador elige el aspecto `giant` y juega
- **THEN** su ojo, su caja y sus alcances son los del factor `5.00/1.97`, según las specs de física, combate y minería

### Requirement: Render del aspecto `small`

El sistema SHALL dibujar el aspecto `small` como un humanoide proporcional de exactamente 0.90 unidades de alto (escala `0.90/1.97` del rig base). La caja de colisión, la altura de ojos y los alcances de este aspecto se especifican en `player/physics`, `player/combat` y `player/mining`; este requisito solo cubre el render y la altura.

#### Scenario: El pequeño mide menos de un bloque

- **WHEN** se mide la altura del modelo de un avatar con aspecto `small`
- **THEN** su parte superior queda a 0.90 unidades sobre su base (tolerancia menor a 1e-9)

#### Scenario: El tamaño del pequeño también se juega

- **WHEN** un jugador elige el aspecto `small` y juega
- **THEN** su ojo, su caja y sus alcances son los del factor `0.90/1.97`, y puede pasar por un hueco de 1 bloque

### Requirement: Render del aspecto `zombie`

El sistema SHALL dibujar el aspecto `zombie` como una variante de jugador con piel verde, ojos rojos brillantes y ropa oscura, conservando el nombre, la barra de vida, el arma en mano y las animaciones del avatar remoto.

#### Scenario: El aspecto zombie se distingue del humano

- **WHEN** un jugador con aspecto `zombie` está presente
- **THEN** su avatar remoto tiene piel verde, ojos rojos que brillan y ropa oscura

#### Scenario: El zombie conserva nombre, barra, arma y animaciones

- **WHEN** el avatar `zombie` camina, ataca, muere o recibe daño
- **THEN** muestra su nombre, su barra de vida, el arma en mano y las mismas animaciones que cualquier avatar remoto

#### Scenario: El aspecto zombie no es el zombi hostil

- **WHEN** un jugador elige el aspecto `zombie`
- **THEN** sigue siendo un jugador normal (nombre, vida propia, sin comportamiento de criatura hostil ni autoridad del server sobre su daño)

### Requirement: Nombre y barra de vida según la altura del aspecto

El sistema SHALL posicionar la etiqueta con el nombre y la barra de vida de cada avatar remoto a una altura derivada de la altura de su aspecto, en vez de usar valores fijos, de modo que queden por encima de la cabeza en todos los aspectos.

#### Scenario: Etiqueta sobre la cabeza del gigante

- **WHEN** un avatar `giant` de 5.00 de alto está presente
- **THEN** su etiqueta se dibuja en `5.00+0.48 = 5.48` y su barra en `5.00+0.13 = 5.13`, por encima del modelo

#### Scenario: Etiqueta sobre la cabeza del pequeño

- **WHEN** un avatar `small` de 0.90 de alto está presente
- **THEN** su etiqueta se dibuja en `0.90+0.48 = 1.38` y su barra en `0.90+0.13 = 1.03`, apenas por encima de su cabeza y no a la altura del humano

#### Scenario: El humano conserva las alturas actuales

- **WHEN** un avatar `human` (1.97 de alto) está presente
- **THEN** su etiqueta queda en 2.45 y su barra en 2.10, exactamente como antes del change

#### Scenario: Las alturas se derivan del catálogo

- **WHEN** se calcula la altura de la etiqueta o de la barra de un aspecto
- **THEN** el valor sale de la altura declarada en el catálogo, no de una constante duplicada por aspecto

### Requirement: Corazones del saludo y daño flotante según la altura del aspecto

El sistema SHALL posicionar los corazones del saludo y los números de daño flotante sobre un avatar remoto a una altura derivada de la altura de su aspecto.

#### Scenario: Saludo sobre la cabeza correcta

- **WHEN** un jugador acaricia a un avatar `giant`, `small`, `fat` o `zombie`
- **THEN** los corazones aparecen sobre la cabeza de ese avatar, a la altura de su aspecto (por ejemplo 4.73 para `giant` y 0.63 para `small`)

#### Scenario: Daño flotante sobre la cabeza correcta

- **WHEN** un jugador golpea a un avatar de cualquier aspecto
- **THEN** el número de daño aparece sobre la cabeza de ese avatar y no flotando a una altura fija de humano (por ejemplo 5.23 para `giant` y 1.13 para `small`)

#### Scenario: El humano conserva saludo y daño actuales

- **WHEN** se saluda o se golpea a un avatar `human` (1.97 de alto)
- **THEN** los corazones salen en 1.70 y el daño en 2.20, exactamente como antes del change

### Requirement: El aspecto `robot` se conserva como aspecto del bot

El sistema SHALL seguir dibujando el aspecto `robot` con el modelo robot humanoide existente (cuerpo metálico, ojos brillantes y antena) y SHALL conservar su comportamiento de avatar remoto.

#### Scenario: El robot no cambia con el catálogo

- **WHEN** un avatar declara aspecto `robot`
- **THEN** se dibuja con el modelo robot humanoide de siempre, con posición, orientación, vida y arma en mano intactas

### Requirement: El avatar local reutiliza el catálogo sin ser blanco de PvP

El avatar local que el jugador ve de espaldas en 3ª trasera o de frente en 3ª frontal SHALL reutilizar el mismo modelo del catálogo de aspectos (`makeAvatar`/`SKIN_SPECS`) y SHALL NOT registrarse como blanco de PvP ni como jugador conectado, ni mostrar nombre o barra de vida.

#### Scenario: El avatar local usa el modelo del catálogo

- **WHEN** el jugador elige un aspecto y entra en 3ª trasera o frontal
- **THEN** su avatar local usa el mismo modelo, escala y colores que ese aspecto en los avatares remotos

#### Scenario: El avatar local no es blanco de golpe

- **WHEN** el jugador ataca con su avatar local a la vista
- **THEN** sus propias mallas no están en `avatarTargets` y el golpe no se intercepta a sí mismo

#### Scenario: El avatar local no bloquea el golpe a un remoto

- **WHEN** un remoto está detrás o delante del avatar local del jugador
- **THEN** el raycast de PvP llega al remoto sin que el avatar local lo bloquee

#### Scenario: El avatar local no aparece como jugador conectado

- **WHEN** el jugador está en tercera persona
- **THEN** su avatar local no figura en la lista de conectados y no recibe `pm`
