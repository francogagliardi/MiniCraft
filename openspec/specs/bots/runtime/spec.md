# bots/runtime Specification

## Purpose

Define el runtime de bots de Minicraft dentro del proceso del servidor: cómo nacen, se mueven, eligen objetivos, hacen y reciben daño, mueren, se detienen y vuelven a aparecer al reiniciar, y cómo se representan en el roster como jugadores falsos.

## Requirements

### Requirement: Bots dentro del proceso del servidor

Los bots SHALL ejecutarse dentro del proceso del servidor y MUST NOT abrir conexiones WebSocket, sesiones, cookies ni procesos aparte. Un bot MUST NOT poder autenticarse ni llamar a rutas HTTP.

#### Scenario: Ningún socket de bot

- **WHEN** un bot está activo
- **THEN** no existe una conexión WebSocket asociada y el server no registra un upgrade para ese bot

#### Scenario: Sin sesión ni cookie

- **WHEN** se inspeccionan las sesiones y cookies del sistema con bots activos
- **THEN** no aparece ninguna sesión creada por un bot

#### Scenario: No aparecen en la lista de conexiones

- **WHEN** se cuenta el estado de conexiones del proceso
- **THEN** los bots no suman clientes WebSocket abiertos

### Requirement: Representación de los bots en el roster

Cada bot activo SHALL aparecer en `welcome.players` y en los frames `join` con `bot:true`, un id negativo reservado, `name`, `skin`, `pos`, `yaw`, `hp`, `maxHp` y `dead`. Los clientes MUST poder dibujarlo como un avatar normal, ignorar los campos nuevos y atacarlo si `takes_damage` está activo.

#### Scenario: Un jugador entra con bots activos

- **WHEN** un jugador se conecta y hay dos bots activos
- **THEN** `welcome.players` trae ambas entradas con `bot:true` y el cliente las dibuja con su skin y nombre

#### Scenario: Un bot se lanza con jugadores conectados

- **WHEN** un admin lanza un bot
- **THEN** todos los jugadores reciben el `join` del bot en el acto

#### Scenario: Cliente viejo

- **WHEN** un cliente que no conoce los campos `bot` ni `maxHp` recibe el roster
- **THEN** sigue renderizando nombre, skin, posición y vida sin errores

#### Scenario: Los bots no duermen

- **WHEN** hay bots y jugadores reales durante la noche
- **THEN** los bots no cuentan para el quórum de sueño ni bloquean el amanecer

### Requirement: Latido acotado del runtime

El runtime SHALL avanzar los bots con un tick periódico de 50 ms como máximo recomendado, con `dt` acotado y un costo proporcional a la cantidad de bots activos, que nunca supera cinco.

#### Scenario: Tick con cinco bots

- **WHEN** hay cinco bots activos
- **THEN** el runtime procesa los cinco en el mismo tick sin bloquear el resto del juego

#### Scenario: Tick atrasado

- **WHEN** el proceso estuvo pausado y el intervalo real es mayor que el configurado
- **THEN** el `dt` aplicado queda acotado y los bots no se teletransportan

### Requirement: Spawn de los bots activos

El runtime SHALL spawnear cada bot en un punto válido del mundo al lanzarlo y SHOULD volver a spawnear al arrancar el server todos los bots con `active:true`. Un bot MUST NOT spawnear si su configuración es inválida o si ya hay cinco activos.

#### Scenario: Arranque con activos

- **WHEN** el server arranca y hay dos bots con `active:true`
- **THEN** ambos aparecen en el mundo sin intervención del admin

#### Scenario: Arranque con más de cinco activos

- **WHEN** la base tiene más de cinco bots marcados activos
- **THEN** el runtime spawnea como máximo cinco, deja constancia del exceso y no rompe el arranque

#### Scenario: Spawn en un punto válido

- **WHEN** un bot nace en el mundo
- **THEN** queda sobre una superficie sólida y dentro de los límites del mundo, sea volador o caminante

### Requirement: Vuelo libre en tres dimensiones

Un bot con `flying:true` SHALL moverse como un punto libre en 3D, sin colisión con bloques ni terreno, sin gravedad y sin auto-escalón, y SHALL alinear su altura con la del objetivo o su punto de origen con una banda muerta.

#### Scenario: Atraviesa una pared

- **WHEN** un bot volador persigue a una presa que está del otro lado de una pared
- **THEN** la atraviesa y llega a su alcance sin quedarse trabado

#### Scenario: Cambia de altura

- **WHEN** la presa está en una torre o en una cueva
- **THEN** la altura del bot converge a la de la presa sin caer ni ser devuelto al suelo

#### Scenario: Sin oscilación

- **WHEN** la diferencia de altura es menor que la banda muerta
- **THEN** el bot no corrige la altura en cada tick

### Requirement: Caminata con colisión y gravedad

Un bot con `flying:false` SHALL caminar sobre el terreno con gravedad, colisión y auto-escalón de un bloque, y MUST NOT atravesar bloques, paredes ni techos. Su altura SHALL seguir el suelo disponible. Cuando el paso directo está bloqueado SHALL intentar un rodeo simple por los costados (±90°) y, si tampoco hay paso, aplicar gravedad. Un bot MUST NOT teletransportarse ni atravesar bloques para alcanzar su objetivo.

#### Scenario: Una pared lo frena

- **WHEN** un bot caminante persigue a una presa separada por una pared
- **THEN** no la atraviesa y se desplaza por el terreno disponible

#### Scenario: Rodea un obstáculo

- **WHEN** el paso directo está bloqueado por un tronco o una pared con espacio alrededor
- **THEN** el bot se aparta de costado y llega al objetivo sin atravesar ningún bloque

#### Scenario: Bloqueo sin salida

- **WHEN** no existe ningún paso posible (pozo, laberinto cerrado)
- **THEN** no atraviesa bloques, suelta ese objetivo a los ~3,5 s y vuelve a deambular en vez de empujar para siempre

#### Scenario: Cae desde una altura

- **WHEN** el suelo desaparece debajo de un bot caminante
- **THEN** cae con gravedad hasta la superficie y no queda flotando

#### Scenario: Sube un escalón

- **WHEN** el camino tiene un desnivel de un bloque
- **THEN** el bot lo sube sin necesitar un salto

#### Scenario: Sin pathfinding

- **WHEN** el camino requiere resolver un laberinto grande
- **THEN** el rodeo simple puede no encontrar la salida y el sistema lo tolera como límite conocido, sin que el bot quede empujando contra el mismo bloque

### Requirement: Persecución cuando el objetivo está a otra altura

Un bot SHALL seguir navegando hacia su objetivo mientras la diferencia vertical sea mayor que 2.5, aunque la distancia horizontal ya esté dentro del umbral de golpe. MUST NOT detenerse en ese caso: un bot volador SHALL alinear la altura y un caminante SHALL seguir intentando acercarse o rodear. El daño MUST seguir exigiendo alcance horizontal y `|dy| ≤ 2.5`.

#### Scenario: Objetivo sobre una torre

- **WHEN** la presa está a ≤3.8 bloques en horizontal pero a más de 2.5 en vertical
- **THEN** el bot sigue navegando y no se detiene sin poder golpear

#### Scenario: Objetivo sobre un árbol

- **WHEN** un guardián queda debajo de una criatura que está por encima de su ventana de altura
- **THEN** no le aplica daño y sigue acomodándose en vez de congelarse

#### Scenario: Vuelo

- **WHEN** el bot vuela y el objetivo cambia de altura
- **THEN** alinea su altura con el objetivo y llega al alcance

### Requirement: Presas nunca administradores ni bots

Ningún comportamiento SHALL atacar a un jugador con rol admin, a otro bot ni a un jugador muerto. El runtime MUST filtrar esos objetivos antes de decidir y MUST volver a verificar la restricción antes de emitir daño.

#### Scenario: Admin pegado al bot

- **WHEN** un admin se queda al lado de un bot hostil sin otros jugadores
- **THEN** el bot no le emite ningún golpe

#### Scenario: Presa muerta

- **WHEN** el único jugador no-admin está muerto
- **THEN** el bot no lo ataca

#### Scenario: Dos bots enfrentados

- **WHEN** dos bots activos se cruzan
- **THEN** ninguno ataca al otro

### Requirement: El cazador respeta bot_ignore

Un bot con comportamiento `cazador` SHALL elegir como presa al jugador vivo no-admin ni `bot_ignore` más cercano y MUST NOT perseguirlo ni dañarlo si tiene `bot_ignore`, aplicando el valor vigente sin reconectar.

#### Scenario: Protegido desde el inicio

- **WHEN** un jugador con `bot_ignore` ya está conectado al lanzar el cazador
- **THEN** el cazador no lo elige como presa

#### Scenario: Se habilita bot_ignore en caliente

- **WHEN** un admin habilita `bot_ignore` a la presa actual
- **THEN** el cazador la abandona en el siguiente tick y no le emite más daño

#### Scenario: Se revoca bot_ignore

- **WHEN** un admin revoca `bot_ignore` a un jugador conectado
- **THEN** el cazador vuelve a considerarlo una presa válida

### Requirement: Ataque con daño, alcance y cadencia configurados

Un bot hostil SHALL atacar cuando su objetivo está dentro de su `reach` horizontal y su `damage` es mayor que cero, respetando al menos 650 ms entre golpes contra la misma víctima. El daño emitido MUST ser exactamente el `damage` configurado y MUST NOT superar 20.

#### Scenario: Golpe dentro de alcance

- **WHEN** la presa está dentro del `reach` configurado
- **THEN** el server emite el `phit` con el `damage` configurado

#### Scenario: Fuera de alcance

- **WHEN** la presa está más lejos que el `reach` configurado
- **THEN** el bot se acerca y no emite ningún golpe

#### Scenario: Daño cero

- **WHEN** un bot tiene `damage:0`
- **THEN** persigue o deambula pero nunca emite daño

#### Scenario: Cadencia mínima

- **WHEN** el bot ya golpeó a su presa y todavía no pasaron 650 ms
- **THEN** no emite otro golpe contra la misma víctima

### Requirement: El merodeador es pacífico

Un bot con comportamiento `merodeador` SHALL deambular dentro de un radio amplio de 6 a 24 bloques alrededor de su punto de origen, con pausas, y MUST NOT atacar a ningún jugador ni criatura aunque tenga `damage` mayor que cero.

#### Scenario: Deambula sin atacar

- **WHEN** un jugador se acerca a un merodeador
- **THEN** el bot sigue deambulando y no le emite daño

#### Scenario: Recorre más mundo

- **WHEN** el merodeador elige un destino
- **THEN** lo hace dentro de un radio de 6 a 24 bloques de su origen y no se queda dando vueltas en un par de bloques

#### Scenario: Vuelve a su zona

- **WHEN** el merodeador se aleja demasiado de su punto de origen
- **THEN** elige destinos que lo mantienen dentro de la zona

#### Scenario: Tampoco ataca criaturas

- **WHEN** una criatura se acerca a un merodeador con `damage` mayor que cero
- **THEN** el bot no le aplica daño

### Requirement: Destino de deambular válido

Un bot que deambula SHALL elegir destinos sobre celdas transitables: dentro del mundo y, si camina, con suelo, cuerpo de dos bloques libre y un desnivel de a lo sumo un bloque. MUST muestrear varios candidatos y descartar los inválidos, y MUST NOT fijar ningún destino si todos fallan. Un bot con `flying:true` MUST validar solo el borde del mundo y la zona del comportamiento.

#### Scenario: Bosque denso

- **WHEN** un bot camina por un bosque donde la mayoría de las columnas tienen árboles
- **THEN** elige destinos en celdas libres a nivel del suelo y nunca en la copa de un árbol ni dentro de un tronco

#### Scenario: Mundo sin celdas libres

- **WHEN** todas las celdas candidatas están ocupadas por bloques
- **THEN** no fija ningún destino, se queda quieto con una pausa corta y reintenta en el tick siguiente

#### Scenario: Vuelo

- **WHEN** el bot vuela
- **THEN** el destino se valida solo contra el borde del mundo y el bot se mueve aunque el terreno esté bloqueado

### Requirement: Reset del deambular cuando no avanza

Un bot caminante que deambula SHALL abandonar su destino cuando no logra acercarse a él en aproximadamente dos segundos, limpiar además el estado de rodeo (`detour`) y dejar que el comportamiento elija otro destino. Después de dos resets seguidos SHALL elegir un destino cercano de 2 a 6 bloques para salir de un rincón y, cuando vuelva a avanzar, SHALL restaurar el radio normal de deambulación.

#### Scenario: Empuja contra un árbol

- **WHEN** el destino elegido es una celda libre pero inalcanzable y el bot lleva ~2 s sin acercarse
- **THEN** suelta ese destino, limpia el rodeo y elige otro en vez de empujar para siempre

#### Scenario: Rincón cerrado

- **WHEN** el bot acumula dos destinos inalcanzables seguidos
- **THEN** el siguiente destino queda a 2–6 bloques de su posición actual para poder salir del rincón

#### Scenario: Vuelve a moverse

- **WHEN** el bot retoma el avance hacia su destino
- **THEN** el contador de resets vuelve a cero y el radio de deambulación recupera su valor normal

### Requirement: El guardián defiende su zona de las criaturas

Un bot con comportamiento `guardian` SHALL patrullar y defender una zona de radio 16 alrededor de su punto de origen, elegir la criatura viva más cercana dentro de esa zona, perseguirla y atacarla. MUST NOT atacar a ningún jugador, ni siquiera si un jugador lo golpea, ni perseguir criaturas fuera de su zona. Sin criaturas SHALL patrullar dentro de su zona (4 a 16 bloques) con destinos válidos y SHALL volver a su origen cuando quedó fuera de ella.

#### Scenario: Criatura dentro de la zona

- **WHEN** una criatura entra en el radio de guardia
- **THEN** el guardián la persigue y la ataca con su `damage`

#### Scenario: Sin enemigos patrulla

- **WHEN** no hay criaturas en la zona
- **THEN** el guardián se mueve y deambula dentro de sus 16 bloques en vez de quedarse clavado en el centro

#### Scenario: Destino de patrulla inalcanzable

- **WHEN** el guardián elige un destino de patrulla al que no puede llegar
- **THEN** lo cambia a los ~2 s en vez de quedarse empujando contra el mismo bloque

#### Scenario: Jugador al lado

- **WHEN** un jugador se acerca al guardián, con o sin criaturas cerca
- **THEN** el guardián no le emite ningún golpe

#### Scenario: Criatura fuera de la zona

- **WHEN** la única criatura está más lejos que el radio de guardia
- **THEN** el guardián no la persigue y vuelve a su origen

#### Scenario: El guardián recibe un golpe de jugador

- **WHEN** un jugador golpea a un guardián
- **THEN** el guardián no cambia de objetivo ni contraataca al jugador

### Requirement: El neutral solo responde a quien lo golpea

Un bot con comportamiento `neutral` SHALL deambular como el merodeador y MUST NOT atacar por iniciativa propia. Cuando un jugador o una criatura lo golpea, SHALL perseguir y pelear contra ese atacante durante una ventana de 10 segundos y después volver a deambular. MUST NOT responder a un admin ni a un jugador con `bot_ignore`, y si lo golpea otro atacante SHALL cambiar al más reciente.

#### Scenario: Sin aggro deambula

- **WHEN** un jugador se acerca a un neutral que no fue golpeado
- **THEN** el bot deambula y no ataca

#### Scenario: Vuelve a caminar tras el combate

- **WHEN** el atacante muere, desaparece o la ventana de 10 s expira
- **THEN** el neutral reinicia su deambulación al entrar en combate, elige un destino nuevo al salir y vuelve a moverse en vez de quedarse quieto

#### Scenario: Golpe de un jugador

- **WHEN** un jugador sin `bot_ignore` golpea a un neutral
- **THEN** el bot lo persigue y le responde con su `damage`, incluso si es inmune

#### Scenario: Golpe de una criatura

- **WHEN** una criatura golpea a un neutral
- **THEN** el bot persigue y ataca a esa criatura

#### Scenario: La ventana expira

- **WHEN** pasan 10 segundos desde el último golpe recibido y el atacante sigue vivo
- **THEN** el neutral deja de perseguirlo y vuelve a deambular

#### Scenario: El atacante desaparece

- **WHEN** el atacante muere, se desconecta o la criatura desaparece
- **THEN** el neutral limpia el aggro y vuelve a deambular

#### Scenario: Golpe de un admin o protegido

- **WHEN** un admin o un jugador con `bot_ignore` golpea a un neutral
- **THEN** el bot no lo persigue ni le responde

### Requirement: Daño de los bots a las criaturas

El runtime SHALL poder dañar criaturas con el `damage` configurado del bot, validando alcance horizontal, diferencia de altura y una cadencia mínima de 650 ms contra la misma criatura. El daño MUST aplicarse en el servidor sobre la horda y MUST NOT emitirse si `damage` es cero. Solo los comportamientos que atacan criaturas o un neutral en retaliación contra esa criatura pueden hacerlo.

#### Scenario: Golpe a una criatura

- **WHEN** un guardián con `damage:6` alcanza a una criatura
- **THEN** la horda descuenta 6 de vida y la criatura muere si llega a cero

#### Scenario: Fuera de alcance

- **WHEN** la criatura está más lejos que el `reach` configurado
- **THEN** el bot no le aplica daño

#### Scenario: Daño cero

- **WHEN** un bot tiene `damage:0`
- **THEN** persigue o deambula pero no daña criaturas

#### Scenario: Cadencia contra criaturas

- **WHEN** el bot ya golpeó a la misma criatura y no pasaron 650 ms
- **THEN** no vuelve a dañarla

### Requirement: Las criaturas pueden atacar a los bots

La horda SHALL considerar a los bots activos como objetivos válidos además de los jugadores, con prioridad para los jugadores humanos y sin que los bots cuenten para el spawn de la oleada. Un golpe de criatura a un bot MUST aplicarse en el servidor, y su muerte MUST seguir el mismo ciclo que la muerte por jugador (despawn, `active:false` y auditoría `bot.death`).

#### Scenario: Criatura sin jugadores cerca

- **WHEN** una criatura detecta a un bot dentro de su radio y no hay jugadores
- **THEN** lo persigue y le emite su `phit`

#### Scenario: Humano y bot en el radio

- **WHEN** hay un jugador humano y un bot dentro del radio de la criatura
- **THEN** la criatura prioriza al humano aunque el id del bot sea menor

#### Scenario: El bot muere por una criatura

- **WHEN** el daño de una criatura agota la vida de un bot con `takes_damage:true`
- **THEN** el bot desaparece, queda `active:false` y se audita `bot.death`

#### Scenario: Sin jugadores no hay oleada

- **WHEN** es de noche y hay bots activos pero ningún jugador
- **THEN** no se genera una oleada nueva

### Requirement: Daño de bots validado por el servidor

El servidor SHALL emitir el daño de un bot a un jugador usando su configuración, y MUST NOT reenviar daño a un admin ni a un jugador con `bot_ignore`. Este daño MUST NOT depender de ningún frame del cliente.

#### Scenario: Golpe legítimo

- **WHEN** un cazador con `damage:4` alcanza a un jugador sin permisos
- **THEN** el jugador recibe un `phit` con `dmg:4`

#### Scenario: Intento contra un admin

- **WHEN** un bot alcanza a un admin
- **THEN** no se emite `phit` ni se le descuenta vida

#### Scenario: Intento contra un protegido

- **WHEN** un cazador alcanza a un jugador con `bot_ignore`
- **THEN** no se emite `phit` ni se le descuenta vida

### Requirement: Daño de jugadores a bots

El servidor SHALL aceptar el `hit` de un jugador contra un bot con `takes_damage:true`, validar alcance y cadencia, descontar 2 de vida por golpe aceptado y responder `hitok` con el daño aplicado. Con `takes_damage:false` el bot MUST ser inmune y el golpe MUST responder con daño cero.

#### Scenario: Golpe válido a un bot

- **WHEN** un jugador golpea a un bot vulnerable dentro de alcance y fuera del cooldown
- **THEN** el `hitok` confirma `dmg:2` y la vida del bot baja en 2

#### Scenario: Golpe fuera de alcance

- **WHEN** un jugador golpea a un bot a más de su alcance de espada
- **THEN** no se descuenta vida y no hay confirmación de daño

#### Scenario: Golpes repetidos en ráfaga

- **WHEN** un jugador manda varios `hit` al mismo bot dentro del cooldown
- **THEN** solo se aplica el primero y los demás no descuentan vida

#### Scenario: Bot inmune

- **WHEN** un jugador golpea a un bot con `takes_damage:false`
- **THEN** la vida del bot no cambia y el atacante recibe `hitok` con `dmg:0`

#### Scenario: La vida del bot es del servidor

- **WHEN** un cliente manda `hit` con un `dmg` distinto
- **THEN** el server ignora ese valor y aplica su propio daño fijo

### Requirement: Muerte y desactivación del bot

Cuando un bot vulnerable llega a 0 de vida SHALL desaparecer del mundo, difundirse su `leave`, quedar `active:false` en la base con su configuración intacta y auditarse `bot.death`. MUST NOT respawnear automáticamente.

#### Scenario: El bot muere

- **WHEN** la vida de un bot vulnerable llega a 0
- **THEN** todos los jugadores reciben su `leave` y el bot deja de aparecer en el roster

#### Scenario: Queda inactivo para relanzar

- **WHEN** el bot murió
- **THEN** el panel lo muestra inactivo con su configuración y el admin puede lanzarlo de nuevo

#### Scenario: Sin respawn automático

- **WHEN** pasa el tiempo después de la muerte
- **THEN** el bot no vuelve a aparecer por sí solo, ni siquiera al reiniciar el server

### Requirement: Detener un bot

Detener un bot SHALL quitarlo del mundo y del roster en el acto, difundir su `leave`, conservar su configuración y apagar su tick. Un bot detenido MUST NOT consumir cupo de activos.

#### Scenario: Detener con jugadores conectados

- **WHEN** un admin detiene un bot activo
- **THEN** los jugadores reciben el `leave` del bot y deja de moverse

#### Scenario: El cupo se libera

- **WHEN** hay cinco bots activos y el admin detiene uno
- **THEN** otro bot puede lanzarse sin recibir `409 bot_limit_reached`

### Requirement: Los bots no modifican el mundo

Los bots MUST NOT romper, colocar ni editar bloques, ni modificar el mundo persistido. Toda su interacción con el terreno SHALL ser de lectura.

#### Scenario: Cero ediciones en el mundo

- **WHEN** un bot persigue, camina, vuela, ataca o muere
- **THEN** el archivo del mundo y el arreglo de ediciones no cambian por acción del bot

#### Scenario: Construcciones intactas

- **WHEN** un bot pasa por una construcción
- **THEN** los bloques siguen exactamente igual que antes

### Requirement: Barra de vida proporcional al máximo del bot

La representación de un bot SHALL incluir `maxHp` para que el cliente dibuje su barra de vida sobre ese máximo, usando 10 cuando el campo falta para los jugadores. Un `hitok` con daño cero MUST NOT mostrar un número de daño.

#### Scenario: Bot con vida 100

- **WHEN** un bot con `hp:100` y vida actual 50 aparece en el roster
- **THEN** el cliente dibuja su barra a la mitad

#### Scenario: Cliente viejo

- **WHEN** un cliente no conoce `maxHp`
- **THEN** sigue mostrando la barra con el comportamiento anterior

#### Scenario: Golpe inmune

- **WHEN** el jugador golpea a un bot con `takes_damage:false`
- **THEN** no aparece un número de daño negativo ni se altera la barra
