# Spec Delta

## Purpose

Agrega la farola: una lámpara colgante que se ancla a la cara inferior de un bloque sólido, alumbra hacia abajo y se sincroniza entre jugadores sin cambios de protocolo.

## ADDED Requirements

### Requirement: La farola es una lámpara colgante

El sistema SHALL representar la farola como el bloque `LAMP` (id 64): una lámpara con varilla y pantalla que cuelga de la cara inferior de un bloque sólido, ocupa una celda de aire y se dibuja por debajo del punto de anclaje. SHALL NOT dibujarse como un cubo completo.

#### Scenario: Se ve colgada del techo

- **WHEN** una farola está colocada bajo un bloque sólido
- **THEN** se ve la varilla pegada al techo y la pantalla debajo, sin cubrir el cubo entero de la celda

#### Scenario: Nombre e ícono propios

- **WHEN** el jugador la ve en el inventario o en la hotbar
- **THEN** aparece con el nombre `Farola 💡` y su ícono propio, distinto del de la antorcha y del de la lucerita

### Requirement: Colocación solo colgada de una cara inferior sólida

El sistema SHALL colocar la farola solo cuando la cara apuntada mire hacia abajo y el bloque inmediatamente arriba de la celda destino sea sólido; SHALL rechazar las caras laterales, el piso, las celdas ocupadas y las celdas sin soporte.

#### Scenario: Colgar de un techo sólido

- **WHEN** el jugador apunta a la cara inferior de un bloque sólido y la celda de abajo está libre
- **THEN** el sistema coloca la farola en esa celda, colgada del bloque

#### Scenario: Apuntar a una pared o al piso

- **WHEN** el jugador apunta a una cara lateral o a la cara superior de un bloque
- **THEN** el sistema rechaza la colocación con un aviso y no modifica el mundo

#### Scenario: Sin bloque sólido arriba

- **WHEN** la celda destino no tiene un bloque sólido arriba
- **THEN** el sistema rechaza la colocación y no crea el bloque

#### Scenario: Celda destino ocupada

- **WHEN** la celda destino ya tiene un bloque, agua o una flor
- **THEN** el sistema rechaza la colocación sin reemplazar el contenido

### Requirement: La farola ilumina hacia abajo

El sistema SHALL emitir la luz de la farola desde el fondo de su pantalla en forma de cono dirigido hacia abajo, con un objetivo ubicado por debajo de la lámpara, con más intensidad y alcance que una antorcha, de modo que alumbre el piso y las paredes por debajo de ella sin iluminar el techo que tiene encima, sujeta al presupuesto de iluminación vigente. Si no hay un cono disponible en el presupuesto, la farola SHALL alumbrar con una luz puntual como reserva.

#### Scenario: Alumbra el piso de noche

- **WHEN** es de noche y hay una farola colgada
- **THEN** el piso y las paredes debajo de ella se ven iluminados

#### Scenario: No ilumina el techo que tiene encima

- **WHEN** una farola cuelga de un bloque sólido
- **THEN** el cono de luz apunta hacia abajo y el bloque del techo inmediatamente arriba no recibe su luz directa

#### Scenario: Alcanza más lejos que una antorcha

- **WHEN** se comparan una farola y una antorcha a la misma altura
- **THEN** la luz de la farola llega más lejos y alumbra con más intensidad

#### Scenario: Más farolas que conos disponibles

- **WHEN** hay más farolas encendidas que espacios de luz direccional
- **THEN** las farolas que sobran alumbran con una luz puntual de reserva, sin exceder el presupuesto total

#### Scenario: Sin presupuesto de luces

- **WHEN** la farola no entra en el presupuesto del nivel de calidad vigente
- **THEN** se sigue viendo encendida pero no alumbra los bloques

### Requirement: La farola no bloquea el movimiento

El sistema SHALL permitir que los jugadores, los animales, los zombis y el bot atraviesen la celda de la farola, igual que con la antorcha, y SHALL NOT considerarla sólida para la colisión ni para el camino de los mobs.

#### Scenario: Atravesar una farola

- **WHEN** el jugador camina hacia una celda con farola
- **THEN** el sistema no lo detiene ni lo hace colisionar

#### Scenario: Los mobs no la esquivan

- **WHEN** un animal, un zombi o el bot calcula su camino por una celda con farola
- **THEN** la trata como celda libre y no la bloquea

#### Scenario: Se puede apuntar y romper

- **WHEN** el jugador apunta a una farola con la mira
- **THEN** el sistema la resalta como objetivo y permite romperla

### Requirement: Rotura de un toque y sincronización

El sistema SHALL romper la farola de un solo golpe por su dureza baja y SHALL sincronizar su colocación y rotura con el protocolo de edits existente usando el id 64, dentro del límite `v <= 64`, sin mensajes nuevos.

#### Scenario: Romper la farola

- **WHEN** el jugador golpea una farola una vez
- **THEN** la celda vuelve a aire y la farola desaparece del mundo

#### Scenario: Otro jugador ve la farola

- **WHEN** un jugador coloca o rompe una farola estando conectado al servidor
- **THEN** los demás jugadores ven el mismo cambio en la misma posición sin recargar

#### Scenario: Un cliente viejo ignora la farola

- **WHEN** un cliente que no conoce el id 64 recibe un edit con ese valor
- **THEN** ignora el bloque sin romperse y sigue funcionando con el resto del protocolo

### Requirement: La farola está en la paleta del inventario

El sistema SHALL incluir la farola en la paleta que se abre con `E`, para que el jugador pueda asignarla a un slot de la hotbar sin crafting ni conteo de ítems.

#### Scenario: Elegir la farola desde el inventario

- **WHEN** el jugador abre el inventario con `E`
- **THEN** la grilla incluye la farola como un ítem más y al hacer click queda asignada al slot seleccionado

#### Scenario: La hotbar sigue teniendo nueve slots

- **WHEN** se agrega la farola a la paleta
- **THEN** la hotbar conserva sus nueve slots y su contenido por defecto
