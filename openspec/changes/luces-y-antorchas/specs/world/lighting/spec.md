# Spec Delta

## Purpose

Define la iluminación local que producen las fuentes del mundo —antorchas y farolas—, con un conjunto acotado de luces —puntos y conos de farola— que se reparte por cercanía al jugador y descarta las fuentes ocluidas por bloques, se apaga junto con la calidad gráfica y hace que solo la fuente más cercana proyecte sombra en calidad alta. La lucerita (`GLOW`) queda afuera: brilla con su material unlit pero no emite luz alrededor.

## ADDED Requirements

### Requirement: Las fuentes luminosas alumbran alrededor

El sistema SHALL emitir luz local desde cada bloque luminoso activo (`TORCH`, `LAMP`) para alumbrar la geometría opaca y translúcida vecina. La luz SHALL NOT modificar la luz ambiental del ciclo día/noche. Las fuentes SHALL NOT proyectar sombras, con la única excepción de la fuente más cercana al jugador en el nivel de calidad alto (ver requisito de sombra).

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

### Requirement: Solo la fuente más cercana proyecta sombra

El sistema SHALL hacer que una única fuente —la más cercana al jugador— proyecte sombra, y solo en el nivel de calidad alto. En los niveles de calidad 0 y 1, y en todas las fuentes que no son la más cercana, ninguna luz SHALL proyectar sombra. El sistema SHALL NOT cambiar qué luz proyecta sombra en cada actualización si la fuente elegida no cambió.

#### Scenario: Encerrarse en bloques oscurece

- **WHEN** el jugador se encierra dentro de bloques con una fuente de luz afuera o del otro lado de la pared
- **THEN** la zona encerrada queda oscura porque la fuente más cercana proyecta sombra sobre las paredes y las fuentes ocluidas ni siquiera se encienden

#### Scenario: La antorcha más cercana proyecta la sombra

- **WHEN** la fuente más cercana al jugador es una antorcha
- **THEN** esa luz puntual es la única que proyecta sombra

#### Scenario: La farola más cercana proyecta la sombra

- **WHEN** la fuente más cercana al jugador es una farola
- **THEN** la sombra la proyecta el cono de esa farola y las demás fuentes no proyectan

#### Scenario: Calidad reducida sin sombras

- **WHEN** el nivel de calidad es 0 o 1
- **THEN** ninguna fuente proyecta sombra y el mundo se ilumina como antes de esta mejora

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

El sistema SHALL mantener un conjunto fijo de luces creadas al arrancar y SHALL encender, en cada actualización, solo las fuentes visibles más cercanas al jugador hasta el presupuesto vigente, dejando el resto con intensidad cero. SHALL NOT crear, destruir ni reordenar luces en caliente.

#### Scenario: Más fuentes que presupuesto

- **WHEN** hay más bloques luminosos que el presupuesto del nivel de calidad vigente
- **THEN** solo los más cercanos al jugador alumbran y el resto no aporta luz

#### Scenario: Reasignación al moverse

- **WHEN** el jugador se acerca a una fuente apagada y se aleja de una encendida
- **THEN** en la siguiente actualización la fuente cercana se enciende y la lejana se atenúa hasta apagarse sin un salto visible

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

### Requirement: Cambiar de calidad no recrea luces ni shaders

El sistema SHALL crear las luces una única vez antes del primer render y SHALL limitarse a cambiar su intensidad y su posición al cambiar el nivel de calidad o al moverse; SHALL NOT agregar ni quitar luces de la escena en caliente.

#### Scenario: Alternar la calidad

- **WHEN** el jugador alterna la calidad 2 → 0 → 2
- **THEN** las luces se apagan y se vuelven a encender sin recargar la página ni reiniciar el mundo

#### Scenario: Sin congelamiento al cambiar de nivel

- **WHEN** el jugador cambia el nivel de calidad desde el menú
- **THEN** el cambio se aplica en el frame siguiente, sin una pausa de compilación de materiales perceptible

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
