# Spec Delta

## Purpose

Define la iluminación local que producen las fuentes del mundo —antorchas y farolas—, con un conjunto acotado de luces —puntos para antorchas y conos hacia abajo para farolas— que se reparte por cercanía al jugador y descarta las fuentes ocluidas por bloques, apaga junto con la calidad gráfica y mantiene una cantidad de luces visibles fija por nivel, sin recompilar shaders en caliente. Las luces dinámicas no proyectan sombras: la oclusión la resuelve el descarte por línea de vista y la atenuación ambiental. Una farola nunca usa un punto, así que no alterna de tipo ni ilumina el techo al moverse. La lucerita (`GLOW`) queda afuera: brilla con su material unlit pero no emite luz alrededor.

## ADDED Requirements

### Requirement: Las fuentes luminosas alumbran alrededor

El sistema SHALL emitir luz local desde cada bloque luminoso activo (`TORCH`, `LAMP`) para alumbrar la geometría opaca y translúcida vecina. La luz SHALL NOT modificar la luz ambiental del ciclo día/noche. Las fuentes dinámicas SHALL NOT proyectar sombras: la oclusión SHALL resolverse descartando las fuentes sin línea de vista al ojo (`blockedLOS`) y atenuando el ambiente bajo techo.

#### Scenario: La antorcha ilumina de noche

- **WHEN** es de noche y hay una antorcha colocada
- **THEN** los bloques de alrededor se ven más claros que sin ella, con una caída suave según la distancia

#### Scenario: La farola alumbra hacia abajo

- **WHEN** hay una farola colgada de un techo
- **THEN** su luz se emite desde debajo de la pantalla, hacia el piso y las paredes de abajo, y no ilumina el bloque del techo que tiene encima

#### Scenario: El bloque emisor se sigue viendo encendido

- **WHEN** una antorcha o una farola está dentro del alcance de otra luz
- **THEN** su propio modelo mantiene sus colores de llama o de pantalla encendida

### Requirement: La lucerita brilla sin iluminar

El bloque `GLOW` SHALL NOT emitir luz local ni entrar en el índice de fuentes. SHALL seguir viéndose encendido con su material unlit, sin que su render cambie.

#### Scenario: La lucerita no alumbra

- **WHEN** hay un bloque `GLOW` colocado
- **THEN** no aporta luz a los bloques vecinos y conserva su brillo propio

### Requirement: Las luces dinámicas no proyectan sombras

Las luces del pool de antorchas y farolas SHALL NOT proyectar sombras dinámicas en ningún nivel de calidad. La oclusión SHALL resolverse descartando toda fuente sin línea de vista al ojo (`blockedLOS`) y atenuando el ambiente cuando el jugador no ve el cielo. El sol SHALL conservar su sombra en el nivel de calidad alto.

#### Scenario: Una antorcha no proyecta sombra

- **WHEN** hay una antorcha encendida cerca del jugador
- **THEN** su `PointLight` ilumina con `castShadow = false` y no agrega mapas de sombra

#### Scenario: Una farola no proyecta sombra

- **WHEN** hay una farola encendida cerca del jugador
- **THEN** su `SpotLight` ilumina con `castShadow = false` y no agrega mapas de sombra

#### Scenario: Fuente ocluida

- **WHEN** hay una fuente dentro del radio pero un bloque opaco corta la línea de vista al ojo
- **THEN** la fuente no se enciende, sin depender de que exista una sombra dinámica

#### Scenario: El sol conserva su sombra

- **WHEN** el nivel de calidad es alto y el sol está sobre el horizonte
- **THEN** el sol sigue proyectando sombra; solo las luces del pool quedan sin sombra

### Requirement: La luz no atraviesa bloques

El sistema SHALL descartar, al elegir las fuentes del pool, toda fuente cuya línea de vista al ojo esté cortada por un bloque opaco. La comprobación SHALL muestrear los voxeles del segmento entre el ancla de la fuente y el ojo, SHALL aplicarse a todas las fuentes y en todos los niveles de calidad, y SHALL NOT depender de que la fuente sea la más cercana ni de que las sombras dinámicas estén habilitadas. Las celdas del origen y del destino SHALL NOT contar como oclusores.

#### Scenario: Antorcha al otro lado de una pared

- **WHEN** hay una antorcha dentro del radio de selección pero un bloque opaco entre ella y el ojo
- **THEN** esa antorcha no enciende su luz y el encierro no recibe su brillo

#### Scenario: Fuente visible

- **WHEN** no hay ningún bloque opaco en el segmento entre el ancla de la fuente y el ojo
- **THEN** la fuente se enciende según su distancia, como antes

#### Scenario: Encierro con varias fuentes afuera

- **WHEN** el jugador está encerrado y hay fuentes en habitaciones vecinas o al otro lado de las paredes
- **THEN** ninguna de ellas atraviesa la pared, cualquiera sea el nivel de calidad

#### Scenario: Pared en diagonal

- **WHEN** el segmento cruza una esquina o un muro en diagonal
- **THEN** la fuente se descarta igual: el muestreo no deja pasar luz por el vértice

### Requirement: Presupuesto acotado con selección por cercanía

El sistema SHALL mantener un conjunto fijo de luces creadas al arrancar y SHALL dejar visibles una cantidad fija por nivel: 0 en el nivel 0, 2 puntos + 2 spots en el nivel 1 y 8 + 8 en el nivel 2. Encenderá las fuentes visibles más cercanas dentro de ese set y apagará el resto. SHALL NOT crear ni destruir luces ni cambiar la cantidad visible al caminar. Los conos son solo para farolas y los puntos solo para antorchas; sin cono libre, la farola queda apagada.

#### Scenario: Más fuentes que presupuesto

- **WHEN** hay más bloques luminosos que el presupuesto del nivel de calidad vigente
- **THEN** solo los más cercanos al jugador alumbran y el resto no aporta luz

#### Scenario: Presupuesto del nivel 1

- **WHEN** el nivel de calidad es 1
- **THEN** hay como máximo 2 puntos y 2 spots visibles; las fuentes que no entran quedan apagadas

#### Scenario: Presupuesto del nivel 2

- **WHEN** el nivel de calidad es 2
- **THEN** hay hasta 8 puntos y 8 spots visibles, y ninguna calidad superior agrega más luces

#### Scenario: Siete farolas en una sala

- **WHEN** hay siete farolas dentro del radio de selección con el presupuesto alto
- **THEN** las siete alumbran con un cono hacia abajo y ninguna consume un punto

#### Scenario: Más farolas que conos

- **WHEN** hay más farolas que conos en el presupuesto
- **THEN** las farolas que no obtienen cono quedan apagadas hasta que se libere uno, y los puntos siguen disponibles para las antorchas

#### Scenario: Reasignación al moverse

- **WHEN** el jugador se acerca a una fuente apagada y se aleja de una encendida
- **THEN** en la siguiente actualización la fuente cercana se enciende y la lejana se atenúa hasta apagarse sin un salto visible

#### Scenario: La farola no alterna de tipo al caminar

- **WHEN** el jugador camina y cambian las farolas más cercanas
- **THEN** cada farola que se enciende usa un cono hacia abajo; ninguna alterna entre cono y punto

#### Scenario: La fuente más cercana nunca queda afuera

- **WHEN** el presupuesto es mayor que cero y hay al menos una fuente visible en el mundo
- **THEN** la fuente visible más cercana al jugador siempre queda encendida

### Requirement: La iluminación sigue al jugador y a las ediciones

El sistema SHALL recalcular la selección de luces a intervalos regulares de aproximadamente 0.25 s, de modo que acompañe al jugador, y SHALL reflejar las ediciones de mundo —locales o remotas— dentro de esa ventana, sin pausas perceptibles ni recorridos completos del mundo por frame.

#### Scenario: La luz acompaña al jugador

- **WHEN** el jugador se desplaza entre dos zonas iluminadas
- **THEN** las fuentes que alumbran cambian con él de forma continua, sin apagones ni tirones

#### Scenario: Edición local

- **WHEN** el jugador coloca o rompe una fuente luminosa
- **THEN** la iluminación se actualiza en ≤0.25 s

#### Scenario: Edición remota

- **WHEN** otro jugador coloca o rompe una fuente luminosa y llega el `pedit`
- **THEN** la iluminación local se actualiza en la misma ventana, sin recargar el mundo

#### Scenario: Rendimiento estable al caminar

- **WHEN** el jugador camina por el mundo con fuentes luminosas alrededor
- **THEN** la actualización de luces no introduce una pausa perceptible en el frame

### Requirement: La cantidad de luces visibles es fija por nivel

El sistema SHALL crear el pool completo de luces antes del primer render y SHALL dejar `visible` solo los primeros `POINT_VISIBLE[nivel]` puntos y `SPOT_VISIBLE[nivel]` spots: 0 en el nivel 0, 2 + 2 en el nivel 1 y 8 + 8 en el nivel 2. SHALL aplicar ese set una sola vez al arrancar y en cada cambio de calidad; SHALL NOT cambiar la cantidad de luces visibles al caminar ni en cada actualización de selección. Con presupuesto cero SHALL ocultar todo el pool.

#### Scenario: Calidad 0 sin luces

- **WHEN** el nivel de calidad es 0
- **THEN** todas las luces del pool quedan ocultas y no aportan luz

#### Scenario: Calidad 1 con set acotado

- **WHEN** el nivel de calidad es 1
- **THEN** quedan visibles 2 puntos y 2 spots; el resto del pool permanece oculto aunque haya fuentes cerca

#### Scenario: Calidad 2 con el pool completo

- **WHEN** el nivel de calidad es 2
- **THEN** quedan visibles los 8 puntos y los 8 spots

#### Scenario: Caminar no recompila shaders

- **WHEN** el jugador camina y entran o salen fuentes del radio de selección
- **THEN** la cantidad de luces visibles no cambia: solo se reasignan intensidades dentro del set fijo del nivel

#### Scenario: Cambiar de calidad aplica el set en el acto

- **WHEN** el jugador cambia el nivel de calidad
- **THEN** la visibilidad del pool se aplica en ese cambio, una sola vez, sin esperar ni depender de las fuentes cercanas

### Requirement: Cambiar de calidad no recrea luces

El sistema SHALL crear las luces una única vez antes del primer render y SHALL limitarse a cambiar su intensidad, su posición y su visibilidad al cambiar el nivel de calidad o al moverse; SHALL NOT agregar ni quitar luces de la escena en caliente.

#### Scenario: Alternar la calidad

- **WHEN** el jugador alterna la calidad 2 → 0 → 2
- **THEN** las luces se apagan y se vuelven a encender sin recargar la página ni reiniciar el mundo

#### Scenario: Sin congelamiento al cambiar de nivel

- **WHEN** el jugador cambia el nivel de calidad desde el menú
- **THEN** el cambio se aplica en el frame siguiente; la recompilación de shaders que implica el nuevo conjunto visible se paga una sola vez en ese cambio, no en cada actualización posterior

### Requirement: La luz se atenúa antes de salir del alcance

El sistema SHALL atenuar gradualmente la intensidad de una fuente en los últimos bloques antes de que salga del radio de selección, de modo que su desaparición no produzca un salto visible. El factor de atenuación SHALL valer 1 hasta el comienzo de la banda de fade y SHALL llegar a 0 en el radio máximo.

#### Scenario: Alejarse de una antorcha

- **WHEN** el jugador se aleja de una antorcha encendida y cruza la banda de atenuación
- **THEN** la luz baja de intensidad de forma monótona y se apaga al llegar al radio máximo, sin un corte abrupto

#### Scenario: Volver a acercarse

- **WHEN** el jugador vuelve a entrar en el radio de una fuente atenuada
- **THEN** la luz recupera su intensidad de forma gradual al acercarse

### Requirement: La luz ambiental se atenúa bajo techo

El sistema SHALL atenuar la luz ambiental del cliente cuando la celda de la cabeza del jugador no tenga acceso al cielo por aire, con un factor mínimo `ENCLOSED_DIM` cercano a `.10` —nivel noche—, y SHALL recuperarla suavemente al volver a verlo. SHALL NOT modificar `NIGHT_MIN`, `HEMI_DAY`, `SUN_DAY`, `MOON_LIGHT` ni el ciclo autoritativo del servidor.

#### Scenario: Encerrado en una caja de bloques opacos

- **WHEN** el jugador se encierra en una caja de bloques opacos sin aberturas
- **THEN** el interior se ve como de noche, salvo por la luz de antorchas o farolas cercanas y visibles

#### Scenario: Salir y volver a entrar

- **WHEN** el jugador sale de la caja y su cabeza vuelve a ver el cielo
- **THEN** la luz ambiental vuelve a su nivel normal de forma gradual, sin un salto abrupto

#### Scenario: El encierro se percibe rápido

- **WHEN** el jugador termina de encerrarse
- **THEN** el ambiente baja hacia `ENCLOSED_DIM` en pocas décimas de segundo, con el suavizado por `dt` del loop, sin quedar a medio oscurecer

### Requirement: La accesibilidad al cielo cuenta ventanas y aberturas

El sistema SHALL buscar un camino de celdas no opacas hacia el cielo —con un BFS acotado por un radio horizontal y por la altura del mundo—, de modo que un hueco o una ventana lateral cuenten como abertura, y una caja cerrada o una cueva sin salida cercana queden como encierro. El vidrio y las losas SHALL NOT bloquear el paso; una puerta cerrada SHALL bloquearlo y una abierta, no. SHALL recalcular solo al cambiar la celda de la cabeza y como máximo cada ~0.3 s.

#### Scenario: Casa con ventana

- **WHEN** el jugador está bajo techo en una casa con una ventana de vidrio o un hueco de al menos un bloque en una pared
- **THEN** el ambiente mantiene su nivel normal de día: la ventana deja acceder al cielo aunque la columna vertical esté tapada

#### Scenario: Cueva sin salida cercana

- **WHEN** el jugador está en una cueva o pasillo techado cuya única salida queda fuera del radio de búsqueda
- **THEN** el ambiente baja a `ENCLOSED_DIM` y la zona se ve como de noche

#### Scenario: Exterior descubierto

- **WHEN** el jugador está al aire libre, sin bloques opacos que le tapen la columna
- **THEN** el ambiente se mantiene en su nivel normal, sin atenuarse
