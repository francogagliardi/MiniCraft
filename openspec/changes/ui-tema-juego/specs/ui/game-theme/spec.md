# Spec Delta

## Purpose

Define el sistema de diseño y el tema claro/oscuro de la UI del cliente de juego, para que las superficies HTML sobre el canvas 3D compartan la identidad visual del resto de Minicraft sin afectar el render ni el gameplay.

## ADDED Requirements

### Requirement: Sistema de tokens visuales de la UI del juego

El cliente del juego SHALL definir un conjunto de custom properties CSS para color de fondo, superficie, superficie elevada, línea, texto, texto atenuado, acento, acento profundo, peligro, foco, hover, scrim del HUD, radios, espaciado, tipografía y sombras. Los tokens SHALL declararse bajo selectores acotados a `html[data-theme]` y al contenedor de la partida, y SHALL NOT alterar el canvas 3D ni el layout del juego.

#### Scenario: Tokens disponibles en ambos temas
- **WHEN** se inspecciona el CSS servido en `/game` con `data-theme="dark"` o `data-theme="light"`
- **THEN** existen los dos bloques de tokens y toda superficie HTML del juego puede resolver sus colores desde ellos

#### Scenario: El tema no toca el canvas
- **WHEN** el jugador cambia de tema con el mundo abierto
- **THEN** el canvas, las texturas, las luces y la cámara quedan exactamente iguales y solo cambia la capa HTML

#### Scenario: Tokens derivados de la identidad existente
- **WHEN** se comparan los tokens de acento, texto, fondo y foco del juego con los de login y lobby
- **THEN** usan la misma familia verde Minicraft y la misma intención de contraste, sin introducir una paleta paralela

### Requirement: Tema del juego sincronizado con mc-theme

El juego SHALL declarar `data-theme` en el elemento `<html>` y SHALL resolverlo desde `localStorage` (`mc-theme`) antes de aplicar el CSS, para que la primera pintura ya tenga el tema correcto. Sin preferencia guardada el tema SHALL ser oscuro. Un valor inválido SHALL equivaler a oscuro y el juego SHALL NOT pisar `mc-theme` al cargar.

#### Scenario: Sin destello al entrar al juego
- **WHEN** el jugador elige tema claro en el lobby y navega a `/game`
- **THEN** la UI del juego aparece en claro desde la primera pintura, sin pasar por el oscuro

#### Scenario: Preferencia ausente o inválida
- **WHEN** `localStorage` no tiene `mc-theme` o guarda un valor distinto de `light` y `dark`
- **THEN** el juego arranca en oscuro y no falla

#### Scenario: El juego no sobrescribe la preferencia
- **WHEN** el jugador entra al juego con un tema guardado y no toca el control de tema
- **THEN** `mc-theme` conserva su valor y al volver al lobby se mantiene el mismo tema

### Requirement: Cambio de tema en caliente

Un cambio de tema SHALL aplicarse a toda la UI del juego en el mismo evento, sin recargar la página, sin reiniciar el mundo y sin perder el estado de la partida. El sistema SHALL actualizar `data-theme` en `<html>`, `color-scheme` y `localStorage` (`mc-theme`) de forma consistente.

#### Scenario: Cambio inmediato con la pausa abierta
- **WHEN** el jugador cambia el tema desde la configuración
- **THEN** pausa, configuración, HUD y chat cambian de tema en el acto y el mundo sigue pausado donde estaba

#### Scenario: Persistencia tras recargar
- **WHEN** el jugador elige claro y recarga `/game`
- **THEN** el juego vuelve a mostrarse en claro y el control refleja el tema activo

#### Scenario: Cambio durante la partida
- **WHEN** el jugador cambia el tema mientras juega y el pointer lock está activo
- **THEN** no se pierde el control del mouse, no se dispara el menú de pausa y el juego continúa

### Requirement: Reglas de superficie y contraste sobre el mundo 3D

Los overlays modales (pausa, configuración, muerte, inventario y menú inicial) SHALL usar un panel sólido o semiopaco con borde y sombra, y el HUD SHALL usar un scrim translúcido oscuro con texto claro en ambos temas. Todo texto normal SHALL alcanzar un contraste mínimo de 4.5:1 y todo texto grande, borde o indicador de estado SHALL alcanzar 3:1 sobre su superficie efectiva, en el peor caso de cielo diurno y de noche.

#### Scenario: Texto legible sobre cielo y agua
- **WHEN** el HUD se muestra sobre el cielo más claro, sobre agua o de noche
- **THEN** el texto, los números y los iconos se leen sin depender del brillo del fondo

#### Scenario: El estado no depende solo del color
- **WHEN** el jugador mira la hotbar, la vida, el indicador de FPS o un toast
- **THEN** el estado se distingue por forma, borde, texto o posición además del color

#### Scenario: Fallback sin blur
- **WHEN** el navegador no soporta `backdrop-filter`
- **THEN** las superficies usan un fondo sólido o semiopaco equivalente y el texto conserva el contraste mínimo

### Requirement: Foco, movimiento reducido y responsive de la UI del juego

Los controles HTML del juego SHALL mostrar foco visible con `:focus-visible`, SHALL respetar `prefers-reduced-motion`, y SHALL ofrecer objetivos táctiles de al menos 44 px en botones, filas de configuración y acciones de cierre. La hotbar SHALL conservar sus nueve slots en una fila, con al menos 44 px de alto en táctil, como única excepción documentada por densidad. A 360 px de ancho la UI SHALL NOT generar scroll horizontal de página.

#### Scenario: Foco visible por teclado
- **WHEN** el jugador recorre los controles del panel de configuración con Tab
- **THEN** cada control enfocado muestra un anillo de foco visible y no queda oculto por el panel

#### Scenario: Movimiento reducido
- **WHEN** el sistema operativo pide movimiento reducido
- **THEN** las animaciones decorativas y las transiciones de las superficies del juego se desactivan sin perder información ni foco

#### Scenario: Pantalla de 360 px
- **WHEN** el juego se abre en un viewport de 360 px de ancho
- **THEN** panel, chat, hotbar y botones se ven completos y la página no desplaza horizontalmente

#### Scenario: Objetivos táctiles
- **WHEN** el jugador usa un dispositivo táctil
- **THEN** los botones y acciones del panel de configuración y de los overlays responden con un área de al menos 44 px, y la hotbar conserva nueve slots con altura táctil suficiente

### Requirement: Presupuesto de rendimiento de la UI

El CSS de la UI del juego SHALL evitar `backdrop-filter` u otros efectos costosos en superficies del HUD siempre visibles, incluidas la topbar, las pills, los hints, el chat, los toasts y los indicadores. El blur SHALL reservarse para paneles modales que se muestran con el juego pausado, y el sistema SHALL NOT aplicar filtros CSS al canvas ni cambiar la calidad gráfica existente.

#### Scenario: HUD sin blur permanente
- **WHEN** el jugador juega con el HUD visible
- **THEN** ninguna superficie permanente del HUD depende de `backdrop-filter` y el FPS no cae por la capa de UI

#### Scenario: Blur solo en pausa
- **WHEN** el jugador abre la pausa, la configuración, el inventario o la muerte
- **THEN** el blur, si existe, se limita al panel modal y no se recompone mientras el mundo sigue corriendo

#### Scenario: Calidad gráfica intacta
- **WHEN** se compara el render antes y después del cambio de UI
- **THEN** los niveles de calidad, las sombras, las luces y la distancia de niebla se comportan igual que antes
