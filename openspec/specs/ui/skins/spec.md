# ui/skins Specification

## Purpose
Define la elección del aspecto del jugador en el menú inicial, su estado visible, su persistencia local y el envío del aspecto elegido al servidor al conectarse.

## Requirements

### Requirement: Selector de aspectos en el menú inicial

El menú inicial SHALL ofrecer un selector con exactamente cinco opciones para jugadores (`human`, `fat`, `giant`, `small`, `zombie`) y SHALL NOT ofrecer `robot` en ese selector.

#### Scenario: El menú muestra cinco aspectos

- **WHEN** el jugador abre el menú inicial
- **THEN** ve un selector con las opciones humano, gordo, gigante, pequeño y zombie

#### Scenario: El robot no es una opción de jugador

- **WHEN** el jugador recorre las opciones del selector
- **THEN** `robot` no aparece entre ellas

### Requirement: Estado seleccionado visible y aclaración de alcance

El selector SHALL mostrar de forma visible cuál es el aspecto actualmente elegido y SHALL aclarar en el menú que el aspecto define cómo lo ven los demás jugadores y que su tamaño cambia la altura de ojos, la caja de colisión y los alcances de golpe y de bloques. En primera persona (la vista por defecto) el jugador no ve su propio modelo; con la cámara en tercera persona trasera o frontal (`V` cicla 1ª → 3ª trasera → 3ª frontal → 1ª) sí puede verse a sí mismo con ese aspecto.

#### Scenario: La opción elegida se marca

- **WHEN** el menú está abierto con el aspecto `fat` seleccionado
- **THEN** la opción `fat` se muestra como la elegida y las demás no

#### Scenario: El menú aclara que lo ven los demás

- **WHEN** el jugador lee el menú inicial
- **THEN** encuentra una aclaración de que el aspecto es cómo lo ven los demás jugadores y que, en primera persona, no ve su propio modelo

#### Scenario: El menú aclara que el tamaño cambia la jugabilidad

- **WHEN** el jugador lee la descripción de `giant` o `small`
- **THEN** entiende que el tamaño cambia su altura de ojos, su caja de colisión y sus alcances, además de cómo lo ven

#### Scenario: El aspecto se puede ver en tercera persona

- **WHEN** el jugador eligió un aspecto y alterna a tercera persona trasera o frontal
- **THEN** se ve a sí mismo con ese aspecto, sin que el menú haya prometido lo contrario

### Requirement: El aspecto por defecto del menú es `human`

El menú inicial SHALL arrancar con el aspecto `human` seleccionado cuando no haya una elección guardada válida.

#### Scenario: Primera visita arranca en humano

- **WHEN** el jugador abre el juego por primera vez, sin elección guardada
- **THEN** el selector muestra `human` como aspecto elegido

### Requirement: Persistencia del aspecto en localStorage

El sistema SHALL guardar el aspecto elegido en `localStorage` bajo una clave propia y SHALL restaurarlo al abrir el juego, descartando valores que no pertenezcan al catálogo de jugador.

#### Scenario: La elección sobrevive a recargar

- **WHEN** el jugador elige `giant` y recarga la página
- **THEN** el menú vuelve a mostrar `giant` como aspecto elegido

#### Scenario: Un valor guardado inválido no rompe el menú

- **WHEN** `localStorage` contiene un aspecto guardado que no es una opción de jugador (por ejemplo `robot` o basura)
- **THEN** el menú arranca en `human` sin errores

### Requirement: El aspecto elegido viaja en el `hello`

El sistema SHALL enviar el aspecto elegido como campo `skin` en el mensaje `hello` de conexión, de modo que el servidor lo difunda al resto de los jugadores.

#### Scenario: El hello lleva el aspecto

- **WHEN** el jugador entra al juego con el aspecto `small` elegido
- **THEN** el `hello` enviado al servidor incluye `skin` con el valor `small`

#### Scenario: El servidor difunde el aspecto elegido

- **WHEN** otro jugador se conecta después
- **THEN** recibe el aspecto del jugador recién ingresado y lo dibuja con ese modelo

### Requirement: Un cliente que ignora el selector sigue funcionando

El sistema SHALL NOT romper la conexión ni el juego cuando el aspecto no se envía o el servidor devuelve un valor desconocido.

#### Scenario: Sin elección guardada igual se juega

- **WHEN** el jugador entra sin haber tocado el selector
- **THEN** entra como `human` y el juego funciona con normalidad
