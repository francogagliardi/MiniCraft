# creatures/enemy Specification

## Purpose

Define una criatura hostil (zombi) cuyo estado vive en el servidor —posible de ver y de atacar por todos los jugadores— con spawn nocturno, persecución por radio de detección circular, colisión exacta contra el mundo y ataque visible al jugador, para que la noche tenga una amenaza compartida y consistente entre clientes.

## Requirements

### Requirement: Réplica del mundo en el servidor para la simulación de criaturas

El servidor SHALL conocer el terreno con la misma exactitud que el cliente: SHALL generar el mundo completo desde `SEED` al arrancar, SHALL parchearlo con las ediciones que ya recibe y valida, y SHALL obtener el generador del mismo código fuente que usa el cliente en vez de mantener una copia propia.

#### Scenario: El servidor replica el mundo al arrancar

- **WHEN** el servidor arranca
- **THEN** genera el mundo completo con la seed persistida y le aplica las ediciones guardadas, de modo que una consulta de bloque en el servidor devuelve el mismo valor que ve el cliente en la misma coordenada

#### Scenario: Una edición queda reflejada en el mundo del servidor

- **WHEN** un jugador rompe o coloca un bloque y el servidor acepta la edición
- **THEN** el mundo consultado por la simulación de criaturas refleja ese cambio en la misma coordenada

#### Scenario: El generador no se duplica entre cliente y servidor

- **WHEN** se cambia el algoritmo de generación del mundo en el cliente
- **THEN** el servidor usa automáticamente la versión nueva, sin necesidad de editar una copia aparte

### Requirement: Colisión exacta del enemigo contra el mundo, sin pathfinding

El enemigo SHALL colisionar contra los bloques del mundo (terreno natural, árboles y construcciones del jugador) y SHALL NOT atravesarlos ni planificar una ruta: quedar trabado empujando contra un obstáculo es el comportamiento esperado. SHALL deslizarse por el eje libre cuando el movimiento diagonal esté bloqueado.

#### Scenario: El enemigo no atraviesa una pared

- **WHEN** el enemigo persigue a un jugador que está detrás de una pared y su único camino posible es a través de la pared
- **THEN** el enemigo se queda empujando contra la pared sin atravesarla

#### Scenario: Deslizamiento por el eje libre

- **WHEN** el movimiento diagonal del enemigo está bloqueado pero uno de los dos ejes está libre
- **THEN** el enemigo avanza solo por el eje libre, de modo que puede doblar una esquina cuando el hueco está al costado

#### Scenario: El enemigo no se entierra ni flota

- **WHEN** el enemigo camina por terreno irregular en subida o en bajada
- **THEN** sube a lo sumo un bloque por paso, baja siguiendo el terreno y nunca queda dentro de un bloque sólido

### Requirement: Spawn nocturno, escaso y validado

El sistema SHALL generar enemigos solo de noche, en cantidad escasa y aleatoria por noche, SHALL hacerlo en un anillo a cierta distancia de un jugador y SHALL validar el punto elegido: superficie firme por encima del nivel del agua, con espacio libre suficiente para el cuerpo del enemigo. SHALL NOT superponer enemigos ni generarlos sin jugadores conectados.

#### Scenario: Aparecen enemigos al llegar la noche

- **WHEN** el ciclo entra en el tramo nocturno con al menos un jugador conectado y no hay enemigos vivos
- **THEN** el sistema genera un puñado escaso y aleatorio de enemigos (del orden de 3 a 4) en una sola pasada

#### Scenario: No aparecen enemigos de día

- **WHEN** el ciclo está en el tramo diurno
- **THEN** no se generan enemigos nuevos

#### Scenario: Aparecen en la superficie, a distancia y con espacio libre

- **WHEN** el sistema elige el punto de aparición
- **THEN** el enemigo aparece sobre una superficie firme por encima del nivel del agua, a una distancia en anillo respecto de un jugador y en un punto con espacio libre para su cuerpo, sin superponerse con otro enemigo

#### Scenario: Sin jugadores no hay spawn

- **WHEN** llega la noche sin ningún jugador conectado
- **THEN** no se generan enemigos

### Requirement: Detección circular y adquisición de objetivo

El enemigo SHALL detectar al jugador que entra en un radio a su alrededor, sin depender de hacia dónde mira: SHALL perseguir al primero que detecta y SHALL elegir el objetivo de forma determinista cuando hay varios jugadores en ese radio a la vez.

#### Scenario: Adquiere al primer jugador en el radio

- **WHEN** un jugador entra en el radio de detección de un enemigo que no tenía objetivo
- **THEN** el enemigo lo toma como objetivo y empieza a perseguirlo

#### Scenario: Detecta al jugador que se acerca por detrás

- **WHEN** un jugador se acerca por detrás del enemigo, dentro del radio de detección
- **THEN** el enemigo lo detecta igual y lo persigue, aunque esté mirando hacia el lado opuesto

#### Scenario: Elección determinista con varios jugadores en el radio

- **WHEN** dos o más jugadores están simultáneamente dentro del radio de detección de un enemigo sin objetivo
- **THEN** el enemigo elige siempre el mismo criterio de desempate, de modo que todos los clientes observan la misma persecución

#### Scenario: Ignora a quien está fuera del radio

- **WHEN** un jugador está más lejos que la distancia de detección
- **THEN** el enemigo no lo adquiere como objetivo

### Requirement: Pérdida de objetivo y deambulación

El enemigo SHALL abandonar su objetivo y volver a deambular cuando ese jugador muere, se desconecta o sale de su radio de detección, y SHALL volver a perseguir recién cuando un jugador (nuevo o el mismo) entre otra vez en ese radio.

#### Scenario: Pierde el objetivo si el jugador muere

- **WHEN** el jugador perseguido muere
- **THEN** el enemigo deja de perseguirlo y queda deambulando

#### Scenario: Pierde el objetivo si el jugador se desconecta

- **WHEN** el jugador perseguido se desconecta del servidor
- **THEN** el enemigo deja de perseguirlo y queda deambulando, sin errores ni referencias a la sesión ausente

#### Scenario: Pierde el objetivo si el jugador sale de su radio de detección

- **WHEN** el jugador perseguido se aleja más allá de la distancia de detección
- **THEN** el enemigo deja de perseguirlo y queda deambulando

#### Scenario: Vuelve a perseguir a un jugador que entra en su radio de detección

- **WHEN** un jugador entra en el radio de detección de un enemigo que estaba deambulando
- **THEN** el enemigo lo adquiere y vuelve a perseguirlo

### Requirement: Persecución a velocidad reducida

El enemigo SHALL perseguir a una velocidad claramente menor que la del jugador (del orden de la mitad), y SHALL orientarse hacia la dirección de su movimiento de forma consistente para todos los clientes.

#### Scenario: El enemigo es más lento que el jugador

- **WHEN** el enemigo persigue a un jugador que camina en línea recta sobre terreno llano
- **THEN** el jugador gana distancia, porque la velocidad de persecución del enemigo es del orden de la mitad de la del jugador

#### Scenario: Orientación consistente

- **WHEN** el enemigo persigue o deambula
- **THEN** todos los clientes lo ven mirando hacia la misma dirección, coherente con su movimiento

### Requirement: Ataque del enemigo al jugador

El enemigo SHALL atacar al jugador que alcanza, aplicándole 2 de daño y un empuje (knockback) en dirección desde el enemigo hacia la víctima, con una cadencia del orden de un golpe por segundo y sin dañar a quien no está a su alcance.

#### Scenario: Golpea al jugador que alcanza

- **WHEN** el enemigo llega al alcance de su objetivo
- **THEN** la víctima recibe 2 de daño y un empuje, con el mismo feedback de daño que ya usan los golpes entre jugadores

#### Scenario: Cinco golpes derriban a un jugador con la vida llena

- **WHEN** el enemigo golpea repetidamente a un jugador con la vida llena (10 puntos) sin que este se aleje ni se cure
- **THEN** el jugador pierde 2 puntos por golpe y cae derrotado al quinto golpe

#### Scenario: Cadencia de un golpe por segundo

- **WHEN** el enemigo permanece pegado a su objetivo durante varios segundos
- **THEN** lo golpea aproximadamente una vez por segundo, sin ráfagas de golpes seguidos

#### Scenario: No golpea a quien está lejos

- **WHEN** el objetivo está fuera del alcance de ataque del enemigo
- **THEN** el enemigo no le aplica daño

### Requirement: El ataque del enemigo es visible para todos

Cuando el enemigo ataca, SHALL reproducir una animación de golpe (brazo que golpea) visible para todas las conexiones, incluida la víctima, y SHALL NOT repetirla por difusiones del mismo estado que no correspondan a un golpe nuevo.

#### Scenario: Todos ven el golpe del enemigo

- **WHEN** un enemigo golpea a un jugador
- **THEN** todos los clientes ven al enemigo ejecutar la animación de ataque, además del feedback de daño de la víctima

#### Scenario: La víctima también ve el golpe

- **WHEN** el enemigo ataca al jugador que controla el cliente
- **THEN** ese cliente ve la animación de ataque del enemigo y no solo el daño recibido

#### Scenario: Un estado repetido no reanima el golpe

- **WHEN** el cliente vuelve a recibir el estado de un enemigo que ya había golpeado, sin un golpe nuevo
- **THEN** la animación de ataque no se reproduce otra vez

### Requirement: Ojos rojos visibles de noche

El enemigo SHALL tener los ojos rojos encendidos, visibles en la oscuridad, y ese brillo SHALL NOT depender de la iluminación de la escena.

#### Scenario: Los ojos se ven de noche

- **WHEN** es de noche y hay enemigos en el mundo
- **THEN** sus ojos rojos se ven encendidos a distancia

#### Scenario: La luz de la escena no los apaga

- **WHEN** el enemigo está en una zona a oscuras o a plena luz
- **THEN** sus ojos rojos mantienen el mismo brillo, porque no dependen de la iluminación de la escena

### Requirement: Vida del enemigo y golpe validado por el servidor

El enemigo SHALL tener una vida de 6 puntos y SHALL recibir un daño de 2 por golpe de espada (3 golpes para morir). El servidor SHALL validar la solicitud de golpe del jugador (existencia del enemigo, vivo y dentro del alcance) y SHALL aplicar su propio valor de daño en vez de confiar en el número enviado por el cliente.

#### Scenario: Tres golpes de espada matan al enemigo

- **WHEN** un jugador golpea repetidamente a un enemigo con la espada
- **THEN** su vida baja de 6 a 4, a 2 y a 0, y muere en el tercer golpe

#### Scenario: Golpe fuera de alcance rechazado

- **WHEN** un cliente pide dañar a un enemigo que está fuera del alcance de la espada
- **THEN** el servidor no aplica daño y la vida del enemigo no cambia

#### Scenario: Golpe a un enemigo inexistente rechazado

- **WHEN** un cliente pide dañar a un enemigo que no existe o que ya está muerto
- **THEN** el servidor ignora la solicitud sin errores

#### Scenario: El servidor no confía en el daño declarado

- **WHEN** un cliente pide un golpe declarando un daño distinto del de la espada
- **THEN** el daño aplicado es el del arma según el servidor, no el declarado por el cliente

### Requirement: Estado del enemigo compartido con todos los clientes

El servidor SHALL difundir el estado de los enemigos vivos (identificador, posición, orientación, vida y si está muerto) a todas las conexiones de forma periódica, SHALL incluir los enemigos actuales al entrar un jugador, y el cliente SHALL interpolar ese estado para mostrarlo de forma fluida.

#### Scenario: Todos ven al mismo enemigo

- **WHEN** dos jugadores están conectados y hay un enemigo en el mundo
- **THEN** ambos clientes lo ven con el mismo identificador y la misma posición, y su vida se mantiene coherente entre ellos

#### Scenario: Un jugador que entra ve los enemigos actuales

- **WHEN** un jugador se conecta y ya hay enemigos vivos
- **THEN** recibe su estado en el mensaje de bienvenida y los ve sin esperar a la siguiente difusión

#### Scenario: Movimiento fluido entre difusiones

- **WHEN** el cliente recibe el estado periódico del enemigo
- **THEN** el enemigo se mueve de forma fluida hacia la posición informada, sin saltos visibles entre difusiones

#### Scenario: Cliente que ignora el estado de enemigos no se rompe

- **WHEN** un cliente que no entiende los mensajes de enemigos los recibe
- **THEN** la sesión sigue funcionando con el resto del protocolo sin errores

### Requirement: Muerte del enemigo con animación y desaparición diferida

Cuando el enemigo muere —por el jugador o porque llega el amanecer— SHALL reproducir la animación de muerte (caída de espaldas, extremidades quietas y barra de vida oculta), SHALL permanecer tirado en el lugar alrededor de 2 segundos y SHALL desaparecer después, tanto para el jugador que lo mató como para el resto.

#### Scenario: El enemigo muerto no desaparece de golpe

- **WHEN** el jugador mata a un enemigo
- **THEN** el enemigo cae, se queda tirado alrededor de 2 segundos y recién después desaparece

#### Scenario: Despawn al amanecer con animación

- **WHEN** el ciclo entra en el tramo diurno con enemigos vivos
- **THEN** cada enemigo reproduce la animación de muerte, queda tirado alrededor de 2 segundos y desaparece

#### Scenario: La barra de vida se oculta al morir

- **WHEN** el enemigo está muerto
- **THEN** su barra de vida deja de mostrarse

### Requirement: Los enemigos no se persisten

El sistema SHALL NOT persistir el estado de los enemigos: ni su cantidad, ni su posición, ni su vida SHALL guardarse en el archivo del mundo, que SHALL conservar únicamente la seed y las ediciones.

#### Scenario: Reinicio del servidor sin enemigos guardados

- **WHEN** el servidor se reinicia después de que hubo enemigos en el mundo
- **THEN** el archivo del mundo sigue conteniendo solo la seed y las ediciones, y no hay enemigos vivos hasta la próxima noche

#### Scenario: Solo existe con servidor

- **WHEN** el juego corre sin servidor (modo solo)
- **THEN** no aparecen enemigos, porque su estado y su simulación viven en el servidor
