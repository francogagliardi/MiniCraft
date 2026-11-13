# Spec Delta

## MODIFIED Requirements

### Requirement: Estilo y accesibilidad de los botones de los overlays

Los botones de los overlays de pausa y muerte SHALL compartir el estilo de botón del cliente y los tokens del tema activo, con foco visible por teclado, estado `:active` que no desplace el layout y área táctil de al menos 44 px. En pantallas angostas los botones MUST apilarse sin desbordar el panel ni generar scroll horizontal.

#### Scenario: Foco visible por teclado

- **WHEN** el jugador recorre la pantalla de muerte con Tab
- **THEN** el foco visible marca "Reaparecer" y luego "Volver al lobby" en orden lógico

#### Scenario: Mismo estilo que el resto del juego

- **WHEN** se comparan los botones de la pantalla de muerte con los de la pausa
- **THEN** usan la misma clase de botón del juego, la misma tipografía, alto, paleta y tokens de tema

#### Scenario: Pantalla angosta

- **WHEN** la pantalla de muerte se abre en un viewport de 360 px de ancho
- **THEN** los dos botones se ven completos, apilados y sin scroll horizontal dentro del panel

#### Scenario: Movimiento reducido

- **WHEN** el sistema operativo pide movimiento reducido
- **THEN** los botones no animan el desplazamiento al pasar el mouse y conservan el foco visible

## ADDED Requirements

### Requirement: Superficies temáticas de los overlays de menú

Los overlays de menú del juego (`#menu`, `#pause`, `#configPanel`, `#death`) SHALL usar el fondo de overlay, la tarjeta, la tipografía y los controles de los tokens del tema activo. Las tarjetas SHALL mantener un fondo suficientemente opaco para leer su contenido sobre el mundo, con scroll interno si el alto no alcanza, y el menú inicial de archivo local SHALL seguir la misma regla.

#### Scenario: Pausa en tema oscuro
- **WHEN** el jugador abre la pausa con tema oscuro
- **THEN** el overlay y la tarjeta usan la paleta oscura, el texto es claro y los botones verdes mantienen contraste

#### Scenario: Pausa y muerte en tema claro
- **WHEN** el jugador abre la pausa o la pantalla de muerte con tema claro
- **THEN** overlay, tarjeta y texto usan la paleta clara y no heredan colores del tema oscuro

#### Scenario: Menú inicial de archivo local
- **WHEN** el jugador abre `index.html` como archivo local sin sesión
- **THEN** el menú inicial, sus controles y su tarjeta usan el mismo sistema visual y el tema guardado

#### Scenario: Contenido alto en pantalla baja
- **WHEN** el panel de configuración no entra en el alto disponible
- **THEN** la tarjeta hace scroll interno sin desbordar el viewport ni generar scroll de página

#### Scenario: Dormir y cargar
- **WHEN** aparece el overlay de dormir o el texto de carga
- **THEN** ambos usan superficies y texto del sistema visual y siguen legibles en los dos temas

### Requirement: Guía de controles en el menú de pausa

La guía SHALL vivir en `#pauseMain`, debajo de los botones, dentro de `<details class="controls-guide">` con `<summary>` accesible, y SHALL NOT flotar sobre el mundo. El `summary` SHALL tener al menos 44 px, `cursor:pointer` y foco visible. El contenido SHALL usar los tokens del tema, alinearse a la izquierda y adaptarse al ancho de la tarjeta sin ancho fijo, para seguir colapsable en móvil y a 360 px.

#### Scenario: Guía colapsada en pausa
- **WHEN** el jugador abre la pausa
- **THEN** ve el título "Guía de controles" debajo de los botones y el detalle permanece colapsado hasta que lo abre

#### Scenario: Guía con foco por teclado
- **WHEN** el jugador recorre la pausa con Tab
- **THEN** el `summary` de la guía recibe un anillo de foco visible y se abre con Enter o Espacio

#### Scenario: Guía en tema claro y oscuro
- **WHEN** la guía se abre en cualquiera de los dos temas
- **THEN** su texto, atenuados y teclas usan la paleta del tema y se leen sobre la tarjeta

#### Scenario: Guía a 360 px y en móvil
- **WHEN** la pausa se abre en un viewport de 360 px o en un dispositivo táctil
- **THEN** la guía sigue disponible, se despliega sin desbordar la tarjeta ni generar scroll horizontal y no se oculta por CSS
