# player/mining Specification

## Purpose
Define cuánto tarda el jugador en romper un bloque según el ítem que tiene en la mano (mano ×1.5 sobre la dureza, o pico rápido y universal a `PICK_TIME = 0.25 s`), cómo progresa la grieta hasta la rotura, y el ítem pico como objeto de inventario con modelo en mano y animación de golpe.

## Requirements

### Requirement: Rotura a mano escalada por la dureza

El sistema SHALL requerir `dureza × 1.5` segundos de picado sostenido para romper un bloque cuando el jugador no tiene el pico en la mano (incluida la mano desnuda y cualquier otro ítem no-pico), usando la dureza del bloque (`DEFS[b].hard`) y `1` como valor por defecto si el bloque no declara dureza.

#### Scenario: Piedra a mano tarda 2.7 segundos

- **WHEN** el jugador mantiene el clic izquierdo sobre un bloque de piedra (`hard:1.8`) sin el pico en la mano
- **THEN** el bloque se rompe recién al alcanzar ~2.7 s de picado sostenido

#### Scenario: Bloques blandos escalan igual

- **WHEN** el jugador pica a mano un bloque de `hard:1` (tablones) y otro de `hard:.15` (flor)
- **THEN** tardan ~1.5 s y ~0.225 s respectivamente, siempre `dureza × 1.5`

#### Scenario: Soltar antes de tiempo cancela

- **WHEN** el jugador suelta el clic izquierdo antes de completar el tiempo objetivo a mano
- **THEN** el progreso se reinicia y el bloque queda intacto (mismo `resetBreak` de siempre)

### Requirement: El pico rompe rápido cualquier bloque

El sistema SHALL romper cualquier bloque rompible en ~0.25 s (`PICK_TIME = 0.25`, constante tuneable) cuando el pico está en el slot activo, con un tiempo plano e independiente del material del bloque (sin especialización por tipo de pico), y SHALL mantener ese comportamiento también en bloques duros (piedra, ladrillos, obsidiana).

#### Scenario: Piedra con pico es rápida

- **WHEN** el jugador tiene el pico en la mano y mantiene el clic izquierdo sobre un bloque de piedra
- **THEN** el bloque se rompe en ~0.25 s, contra los ~2.7 s a mano

#### Scenario: Universal para cualquier material

- **WHEN** el jugador pica con el pico bloques de durezas distintas (tablones 1, roca 1.8, obsidiana 6) en cualquier orden
- **THEN** todos se rompen en el mismo tiempo plano ~0.25 s, sin diferencia observable entre materiales

### Requirement: Progreso de grieta proporcional al tiempo objetivo

El sistema SHALL repartir las 5 etapas de grieta (`crackTex`) proporcionalmente al tiempo objetivo de rotura del ítem en mano, y SHALL ocultar la grieta cuando el bloque objetivo no es rompible, en vez de dibujar etapas sobre la dureza cruda.

#### Scenario: Grietas del pico pasan rápido

- **WHEN** el jugador pica con el pico
- **THEN** las etapas de grieta se suceden en fracciones de segundo y el bloque se rompe al completarse el tiempo objetivo (~0.25 s), sin quedar la grieta congelada

#### Scenario: Grietas a mano más lentas y consistentes

- **WHEN** el jugador pica a mano un bloque de piedra
- **THEN** las 5 etapas de grieta progresan a lo largo de ~2.7 s y la última coincide con la rotura

#### Scenario: Sin grieta en bloque no rompible

- **WHEN** el jugador apunta a `BEDROCK` y mantiene el clic izquierdo, con o sin pico
- **THEN** no se muestra grieta y el bloque no se rompe (inviolable), y el admin sigue rompiendo con su rama instantánea intacta

### Requirement: Ítem pico seleccionable e intercambiable con la espada

El sistema SHALL incluir el pico como ítem de inventario (`item:'pick'`, mismo patrón que la espada) elegible en el inventario y asignable a cualquier slot de la hotbar, sin poder colocarse en el mundo como bloque y sin reemplazar el comportamiento de la espada.

#### Scenario: Pico visible en inventario y hotbar

- **WHEN** el jugador abre el inventario
- **THEN** el pico aparece como ítem elegible con su nombre e icono, y al asignarlo a un slot la hotbar lo muestra seleccionado

#### Scenario: El pico no se coloca en el mundo

- **WHEN** el jugador tiene el pico en el slot activo y hace clic derecho apuntando a una celda válida
- **THEN** no se coloca ningún bloque (el clic derecho no rompe ni convierte el pico en bloque)

#### Scenario: Espada y pico alternan sin interferencias

- **WHEN** el jugador alterna entre el pico y la espada en la hotbar
- **THEN** solo el modelo del ítem activo queda visible en la mano y cada uno conserva su acción (el ataque con espada y el picado con pico), sin que la selección del pico bloquee la rotura

### Requirement: Modelo del pico en mano

El sistema SHALL mostrar un modelo 3D del pico en la vista en primera persona cuando el pico está en el slot activo y el jugador no está muerto, con la cabeza orientada hacia el fondo de la pantalla (no de costado), balanceo idle, y una animación de golpe que oscila mientras se pica (clic izquierdo sostenido sobre un bloque objetivo) reutilizando la mecánica `swingT`/`SWING_DUR`; SHALL ocultarlo en cualquier otro caso.

#### Scenario: Modelo visible con el pico activo

- **WHEN** el jugador selecciona el pico y está vivo
- **THEN** el pico se renderiza en la esquina de la vista, con la cabeza apuntando hacia adelante, y con un balanceo suave en reposo

#### Scenario: El pico oscila mientras se pica

- **WHEN** el jugador mantiene el clic izquierdo sobre un bloque objetivo con el pico en la mano
- **THEN** el pico repite el golpe de picar (sube y baja) mientras se mantiene el clic, y al soltar vuelve al balanceo idle

#### Scenario: Modelo oculto al cambiar de ítem o morir

- **WHEN** el jugador cambia a otro slot o muere
- **THEN** el modelo del pico desaparece y no queda flotando en pantalla

### Requirement: Rotura en modo táctil con el pico

El sistema SHALL aplicar el mismo tiempo de rotura según el ítem en mano en la ruta táctil (botón de ataque y picado sostenido con el dedo), sin controles nuevos.

#### Scenario: Picado táctil con pico

- **WHEN** en un dispositivo táctil el jugador tiene el pico en el slot activo y mantiene el botón de ataque o el dedo sobre la pantalla
- **THEN** el bloque apuntado se rompe en ~0.25 s con las mismas etapas de grieta que en PC
