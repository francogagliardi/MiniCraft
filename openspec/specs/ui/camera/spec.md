# ui/camera Specification

## Purpose
Define la perspectiva del jugador en primera persona, tercera persona trasera y tercera persona frontal: cómo se alterna y persiste, cómo se posiciona y recorta la cámara orbital en cada una, qué avatar local se dibuja con el aspecto elegido y desde dónde se originan los raycasts de interacción y la detección de agua.

## Requirements

### Requirement: Alternar entre las tres perspectivas con `V` y con botón

El sistema SHALL alternar en ciclo entre primera persona, tercera persona trasera y tercera persona frontal al presionar `V` en PC y al activar el botón `#btnCam` de la topbar, y SHALL reflejar el modo actual (uno de los tres) en el estado visual del botón.

#### Scenario: V pasa de primera a tercera trasera

- **WHEN** el jugador está en primera persona y presiona `V`
- **THEN** la cámara pasa a tercera persona trasera

#### Scenario: V pasa de tercera trasera a tercera frontal

- **WHEN** el jugador está en tercera persona trasera y presiona `V`
- **THEN** la cámara pasa a tercera persona frontal

#### Scenario: V vuelve de tercera frontal a primera

- **WHEN** el jugador está en tercera persona frontal y presiona `V`
- **THEN** la cámara vuelve a primera persona

#### Scenario: El botón cicla igual que la tecla

- **WHEN** el jugador toca o hace clic en `#btnCam`
- **THEN** la cámara avanza al siguiente modo de la misma secuencia y el botón muestra el estado del modo activo

#### Scenario: Ambas entradas comparten el mismo estado

- **WHEN** el jugador alterna con `V` y después mira el botón
- **THEN** el botón refleja el modo elegido por la tecla, y viceversa

#### Scenario: El botón refleja los tres estados

- **WHEN** el jugador está en primera, en tercera trasera o en tercera frontal
- **THEN** `#btnCam` actualiza su `title` y su `aria-pressed` para el modo activo y muestra `.on` en las dos terceras personas (no en primera)

### Requirement: Perspectiva por defecto y persistencia local

El sistema SHALL arrancar en primera persona, SHALL guardar el modo elegido en `localStorage` bajo la clave `mc-cam` con los valores `first`, `third` o `front`, y SHALL tratar cualquier valor ausente o inválido como `first`.

#### Scenario: Primera visita en primera persona

- **WHEN** el jugador abre el juego sin un modo de cámara guardado
- **THEN** la cámara arranca en primera persona

#### Scenario: La tercera trasera sobrevive a recargar

- **WHEN** el jugador elige tercera persona trasera y recarga la página
- **THEN** el juego vuelve a arrancar en tercera persona trasera

#### Scenario: La tercera frontal sobrevive a recargar

- **WHEN** el jugador elige tercera persona frontal y recarga la página
- **THEN** el juego vuelve a arrancar en tercera persona frontal

#### Scenario: Un valor guardado inválido arranca en primera

- **WHEN** `mc-cam` contiene un valor distinto de `first`, `third` o `front` (por ejemplo `tercera`, `null` o basura)
- **THEN** el juego arranca en primera persona sin errores

### Requirement: El toggle no interfiere con chat, inventario ni muerte

El sistema SHALL ignorar `V` mientras el foco está en un campo de texto, mientras el chat o el inventario están abiertos, en el menú o la pausa, y mientras el jugador está muerto, con las mismas guardas que ya usan `E`, `P` y `F`.

#### Scenario: V no se dispara al escribir en el chat

- **WHEN** el jugador escribe una `v` en el input del chat
- **THEN** la perspectiva no cambia y el carácter se escribe normalmente

#### Scenario: V no cambia la cámara con el inventario abierto

- **WHEN** el jugador presiona `V` con el inventario abierto
- **THEN** la perspectiva no cambia y el inventario sigue abierto

#### Scenario: V no cambia la cámara al morir

- **WHEN** el jugador está muerto y presiona `V`
- **THEN** la cámara de muerte no cambia de comportamiento

### Requirement: Cámara orbital trasera centrada detrás del ojo

En la tercera persona trasera el sistema SHALL ubicar la cámara a una distancia objetivo de `4.5*f` bloques detrás del ojo del jugador, donde `f = spec.height / BASE_H`, siguiendo el yaw y el pitch del jugador, de modo que el crosshair quede alineado con la mirada.

#### Scenario: La cámara se ubica detrás del jugador humano

- **WHEN** un jugador `human` entra en tercera persona trasera sin obstáculos alrededor
- **THEN** la cámara queda a 4.5 bloques detrás del ojo, mirando en la misma dirección que el jugador

#### Scenario: El gigante aleja la cámara

- **WHEN** un jugador `giant` entra en tercera persona trasera sin obstáculos
- **THEN** la cámara queda a ≈11.421 bloques detrás de su ojo

#### Scenario: El pequeño acerca la cámara

- **WHEN** un jugador `small` entra en tercera persona trasera sin obstáculos
- **THEN** la cámara queda a ≈2.056 bloques detrás de su ojo

#### Scenario: El crosshair sigue alineado

- **WHEN** el jugador mira hacia arriba, abajo o gira en tercera persona trasera
- **THEN** la cámara rota con el mismo yaw y pitch y el crosshair sigue apuntando a la mirada del jugador

#### Scenario: El bob no se aplica a la cámara en tercera

- **WHEN** el jugador camina en tercera persona trasera
- **THEN** la cámara no oscila con el bob del paso

### Requirement: Recorte de cámara por colisión

El sistema SHALL recortar la distancia de la cámara cuando haya un bloque sólido entre el ojo y la posición de la cámara en la dirección de la vista de la cámara (hacia atrás en 3ª trasera y hacia adelante en 3ª frontal), a `distanciaDelImpacto − 0.25` con un mínimo de `0.6*f` bloques, y SHALL NOT atravesar paredes, techos ni piso.

#### Scenario: Pared cercana recorta la cámara trasera

- **WHEN** hay una pared sólida a 2 bloques detrás del ojo de un jugador `human` en 3ª trasera
- **THEN** la cámara se coloca a 1.75 bloques del ojo, antes de la pared

#### Scenario: Sin obstáculos se usa la distancia objetivo

- **WHEN** no hay ningún bloque sólido entre el ojo y la distancia objetivo de la cámara
- **THEN** la cámara se coloca a `4.5*f` bloques del ojo (4.5 en human, ≈11.421 en giant, ≈2.056 en small)

#### Scenario: El techo recorta la cámara

- **WHEN** el jugador mira hacia arriba con un techo sólido detrás del ojo en 3ª trasera
- **THEN** la cámara se acerca y queda por debajo del techo, sin atravesarlo

#### Scenario: El mínimo escala con el aspecto

- **WHEN** el obstáculo está muy cerca del ojo
- **THEN** la distancia recortada no baja de `0.6*f` (0.6 en human, ≈1.523 en giant, ≈0.274 en small)

### Requirement: Cámara frontal

En la tercera persona frontal el sistema SHALL ubicar la cámara a `4.5*f` bloques delante del ojo del jugador, sobre la dirección de su mirada, mirando al jugador de frente (`rotateY(yaw+π)`, `rotateX(-pitch)`), sin bob, y SHALL recortar la distancia con un DDA hacia adelante, desde el ojo hacia la posición de la cámara, con el margen `hit − 0.25` y el mínimo `0.6*f`.

#### Scenario: La cámara se ubica delante del jugador humano

- **WHEN** un jugador `human` entra en tercera persona frontal sin obstáculos alrededor
- **THEN** la cámara queda a 4.5 bloques delante de su ojo

#### Scenario: La cámara mira al jugador de frente

- **WHEN** el jugador entra en tercera persona frontal
- **THEN** la cámara rota `yaw+π` y `-pitch` para mirarlo a la cara, sin heredar la orientación de la espalda

#### Scenario: La pared de adelante recorta la cámara

- **WHEN** hay una pared sólida a 2 bloques delante del ojo de un jugador `human` en 3ª frontal
- **THEN** la cámara se coloca a 1.75 bloques del ojo, antes de la pared, sin atravesarla

#### Scenario: El mínimo frontal escala con el aspecto

- **WHEN** el obstáculo delante del ojo está muy cerca
- **THEN** la distancia recortada no baja de `0.6*f` (0.6 en human, ≈1.523 en giant, ≈0.274 en small)

#### Scenario: El avatar se ve de frente

- **WHEN** el jugador está en tercera persona frontal
- **THEN** su avatar local se renderiza con la skin elegida y se le ve la cara

#### Scenario: El viewmodel sigue oculto en frontal

- **WHEN** el jugador está en tercera persona frontal con la espada o el pico seleccionado
- **THEN** el viewmodel no se dibuja; el arma se ve sólo en la mano del avatar local

#### Scenario: El frontal es de vanidad y no cambia las acciones

- **WHEN** el jugador rompe, coloca o golpea en tercera persona frontal
- **THEN** el rayo sigue saliendo del ojo y de la mirada del jugador, con los mismos alcances, y el crosshair no coincide con la mirada de la cámara (comportamiento esperado, como el F5 de Minecraft)

#### Scenario: V vuelve a la primera persona

- **WHEN** el jugador está en tercera persona frontal y presiona `V`
- **THEN** la cámara vuelve a primera persona

### Requirement: La primera persona usa la altura de ojos del aspecto

En primera persona el sistema SHALL ubicar la cámara a `eyeHeight(mySkin) = 1.62*f` sobre los pies, con una amplitud de bob de `0.05*f`, y la cámara de muerte SHALL arrancar en esa altura y caer hasta `0.32*f`.

#### Scenario: El humano conserva la vista actual

- **WHEN** un jugador `human` juega en primera persona
- **THEN** su cámara queda a 1.62 sobre los pies, con bob de amplitud 0.05

#### Scenario: El gigante ve desde arriba

- **WHEN** un jugador `giant` juega en primera persona
- **THEN** su cámara queda a ≈4.112 sobre los pies y el bob escala a ≈0.127

#### Scenario: El pequeño ve desde abajo

- **WHEN** un jugador `small` juega en primera persona
- **THEN** su cámara queda a ≈0.740 sobre los pies y el bob escala a ≈0.023

#### Scenario: La cámara de muerte respeta el tamaño

- **WHEN** un jugador muere
- **THEN** la cámara de muerte arranca en `1.62*f` y cae hasta `0.32*f` (human 1.62→0.32, giant ≈4.112→0.812, small ≈0.740→0.146)

### Requirement: Avatar local con el aspecto elegido

En tercera persona, trasera o frontal, el sistema SHALL dibujar un avatar local con el aspecto elegido por el jugador (`mySkin`), animado al caminar y al atacar, con el arma de la hotbar en la mano y sin nombre ni barra de vida.

#### Scenario: El jugador ve su propio aspecto

- **WHEN** el jugador eligió `giant` y entra en tercera persona trasera o frontal
- **THEN** ve su avatar local como gigante, con las mismas proporciones que ven los demás

#### Scenario: El avatar local camina y ataca

- **WHEN** el jugador se desplaza o golpea con la espada o el pico en tercera persona trasera o frontal
- **THEN** su avatar local reproduce el balanceo de caminata y el gesto de golpe correspondiente

#### Scenario: El arma de la hotbar se ve en la mano

- **WHEN** el jugador tiene la espada o el pico seleccionado en tercera persona trasera o frontal
- **THEN** el avatar local muestra ese modelo en la mano derecha, igual que un avatar remoto

#### Scenario: El avatar local no muestra nombre ni barra

- **WHEN** el jugador está en tercera persona trasera o frontal
- **THEN** su avatar local no dibuja etiqueta de nombre ni barra de vida, porque el HUD ya muestra su vida

#### Scenario: El avatar local sigue al jugador sin lag

- **WHEN** el jugador se mueve en tercera persona trasera o frontal
- **THEN** el avatar local copia su posición y orientación en el mismo frame, sin interpolación

### Requirement: El avatar local se oculta en primera persona y al morir

El sistema SHALL ocultar el avatar local cuando la perspectiva es primera persona y cuando el jugador está muerto, sin alterar la cámara de muerte existente.

#### Scenario: En primera persona no se ve el modelo propio

- **WHEN** el jugador está en primera persona
- **THEN** su avatar local no se renderiza

#### Scenario: Al morir desaparece el avatar local

- **WHEN** el jugador muere en tercera persona trasera o frontal
- **THEN** su avatar local se oculta y la cámara de muerte se comporta como siempre

### Requirement: El viewmodel se oculta fuera de la primera persona

El sistema SHALL ocultar el modelo de arma (`swordG` y `pickG`) mientras la perspectiva no es primera persona (`camMode !== 'first'`), y SHALL conservarlo visible en primera persona con el comportamiento actual.

#### Scenario: Sin arma flotante en tercera

- **WHEN** el jugador entra en tercera persona trasera o frontal con la espada o el pico seleccionado
- **THEN** no se ve el viewmodel flotante delante de la cámara, sólo el arma en la mano del avatar local

#### Scenario: En primera persona el viewmodel sigue igual

- **WHEN** el jugador está en primera persona con un arma seleccionada
- **THEN** el viewmodel se ve y se anima exactamente como antes

### Requirement: Interacción y combate desde el ojo del jugador

El sistema SHALL originar la rotura/colocación de bloques y los golpes a jugadores, zombis y animales en el ojo del jugador y en la dirección de su mirada, con independencia de la perspectiva (1ª, 3ª trasera o 3ª frontal), con alcances derivados de su aspecto: `8*f` para bloques, `4.6*f` para jugadores y zombis y `6*f` para animales. En 3ª frontal la cámara mira al jugador, así que el crosshair no coincide con la mirada; el sistema SHALL NOT remapear ni bloquear las acciones por eso.

#### Scenario: Romper y poner siguen la mirada en las tres perspectivas

- **WHEN** el jugador apunta a un bloque y rompe o coloca en primera, en tercera trasera o en tercera frontal
- **THEN** la acción sale del ojo y de la mirada del jugador; en 1ª y 3ª trasera coincide con el crosshair y en 3ª frontal no, porque la cámara mira de frente al jugador

#### Scenario: Los golpes usan el alcance del aspecto

- **WHEN** el jugador golpea a un jugador, zombi o animal en primera, tercera trasera o tercera frontal
- **THEN** el golpe usa `4.6*f` o `6*f` de su aspecto y no alcanza objetivos que el jugador no está mirando

#### Scenario: En frontal las acciones no se remapean a la cámara

- **WHEN** el jugador rompe, coloca o golpea en tercera persona frontal
- **THEN** el rayo no sale de la cámara ni se redirige hacia el jugador; sigue saliendo de su ojo y su mirada, y la acción no se bloquea

#### Scenario: El gigante interactúa desde lejos

- **WHEN** un jugador `giant` rompe, coloca o golpea
- **THEN** sus alcances son ≈20.305 (bloques), ≈11.675 (jugadores/zombis) y ≈15.228 (animales)

#### Scenario: El pequeño interactúa desde cerca

- **WHEN** un jugador `small` rompe, coloca o golpea
- **THEN** sus alcances son ≈3.655 (bloques), ≈2.102 (jugadores/zombis) y ≈2.741 (animales)

#### Scenario: El jugador no se golpea a sí mismo

- **WHEN** el jugador ataca en tercera persona trasera o frontal con su avatar local delante
- **THEN** su propio avatar no intercepta el golpe ni bloquea el de un remoto

### Requirement: El agua sumergida se detecta desde el ojo

El sistema SHALL decidir si el jugador está sumergido según la celda del ojo del jugador, no la de la cámara, para que el overlay de agua sea correcto en las tres perspectivas.

#### Scenario: Sumergido en tercera persona

- **WHEN** el jugador está con la cabeza bajo el agua y la cámara orbital queda fuera del agua
- **THEN** el overlay de agua se activa igual

#### Scenario: Fuera del agua en tercera persona

- **WHEN** el jugador tiene la cabeza fuera del agua y la cámara orbital queda dentro del agua
- **THEN** el overlay de agua no se activa

### Requirement: El botón de cámara es usable en táctil

El sistema SHALL ofrecer el botón de cámara en el layout táctil como parte de la topbar, sin exigir un control táctil nuevo ni romper la grilla existente.

#### Scenario: En móvil se puede cambiar de perspectiva

- **WHEN** el jugador juega en un dispositivo táctil
- **THEN** puede alternar la perspectiva tocando `#btnCam` en la topbar

### Requirement: Sin cambios de protocolo ni para clientes viejos

El sistema SHALL mantener la cámara y el avatar local como estado puramente del cliente: SHALL NOT agregar mensajes, campos ni requisitos nuevos al protocolo.

#### Scenario: Un cliente viejo no se ve afectado

- **WHEN** un cliente que no conoce la cámara en tercera persona convive con uno nuevo
- **THEN** ambos siguen intercambiando los mismos mensajes y el cliente viejo funciona igual

#### Scenario: La perspectiva no altera la escala del aspecto

- **WHEN** el jugador alterna de primera a tercera persona trasera o frontal
- **THEN** su caja, su altura de ojos, sus alcances y su daño siguen siendo los del aspecto elegido, sin cambiar por la cámara
