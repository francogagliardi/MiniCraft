# ui/game-menu Specification

## Purpose
Define los overlays de menú del cliente de juego —menú de pausa y pantalla de muerte—: qué acciones ofrece cada uno, dónde vive el cierre de sesión y cómo se comportan sus botones en escritorio, teclado y pantallas táctiles.

## Requirements

### Requirement: Salida al lobby desde la pantalla de muerte

La pantalla de muerte (`#death`) SHALL ofrecer un botón **“Volver al lobby”** visible junto a “Reaparecer”, como dos acciones separadas. Al pulsarlo, el cliente MUST navegar a `/lobby` y MUST NOT cerrar la sesión ni llamar a `POST /api/logout`.

#### Scenario: El jugador muerto ve las dos salidas

- **WHEN** el jugador muere y aparece la pantalla de muerte
- **THEN** ve “Reaparecer” y “Volver al lobby” como botones separados, visibles y habilitados, sin pasos intermedios

#### Scenario: Volver al lobby conserva la sesión

- **WHEN** el jugador pulsa “Volver al lobby” en la pantalla de muerte
- **THEN** el navegador navega a `/lobby`, la sesión sigue activa y el lobby muestra su username y su aspecto guardado

#### Scenario: La salida no pasa por Reaparecer

- **WHEN** el jugador pulsa “Volver al lobby” en la pantalla de muerte
- **THEN** el cliente navega al lobby sin revivir al jugador en el mundo ni enviar un respawn

#### Scenario: Salir desde el teléfono

- **WHEN** el jugador toca “Volver al lobby” en un dispositivo táctil
- **THEN** la navegación ocurre al primer toque, con un área táctil de al menos 44 px y sin depender de `hover`

### Requirement: El menú de pausa no ofrece cerrar sesión

El menú de pausa (`#pause`) SHALL NOT incluir un botón de cerrar sesión ni ningún control que inicie un cierre de sesión. Sus acciones SHALL limitarse a seguir jugando, abrir la configuración y volver al lobby.

#### Scenario: La pausa no muestra “Cerrar sesión”

- **WHEN** el jugador abre el menú de pausa
- **THEN** ve “Seguir jugando”, “⚙️ Configuración” y “Volver al lobby”, y no ve ningún botón “Cerrar sesión”

#### Scenario: La pausa no conserva el control retirado

- **WHEN** se inspecciona el HTML servido en `/game`
- **THEN** el overlay de pausa no contiene el botón `#btnLogout` ni un handler que lo use

#### Scenario: Volver al lobby desde la pausa

- **WHEN** el jugador pulsa “Volver al lobby” en la pausa
- **THEN** navega a `/lobby` sin cerrar sesión, igual que antes del cambio

### Requirement: El cierre de sesión vive solo en el lobby

El cierre de sesión SHALL ofrecerse únicamente en el lobby autenticado. Ninguna vista del juego (`/game`) SHALL iniciar un cierre de sesión, de modo que salir de la partida nunca termine la sesión.

#### Scenario: El lobby conserva su cierre de sesión

- **WHEN** el usuario pulsa “Cerrar sesión” en `/lobby`
- **THEN** se revoca la sesión, se limpia la cookie y vuelve a `/login`

#### Scenario: El juego no llama al logout

- **WHEN** se revisa el cliente del juego
- **THEN** no existe ninguna llamada `fetch('/api/logout')` en `index.html`

#### Scenario: Salir del juego deja la sesión abierta

- **WHEN** el jugador sale de la partida por cualquier botón disponible (pausa o muerte)
- **THEN** la sesión sigue válida y puede volver a entrar al mundo desde el lobby sin loguearse de nuevo

### Requirement: Estilo y accesibilidad de los botones de los overlays

Los botones de los overlays de pausa y muerte SHALL compartir el estilo de botón del cliente, con foco visible por teclado, estado `:active` que no desplace el layout y área táctil de al menos 44 px. En pantallas angostas los botones MUST apilarse sin desbordar el panel ni generar scroll horizontal.

#### Scenario: Foco visible por teclado

- **WHEN** el jugador recorre la pantalla de muerte con Tab
- **THEN** el foco visible marca “Reaparecer” y luego “Volver al lobby” en orden lógico

#### Scenario: Mismo estilo que el resto del juego

- **WHEN** se comparan los botones de la pantalla de muerte con los de la pausa
- **THEN** usan la misma clase de botón del juego y la misma tipografía, alto y paleta

#### Scenario: Pantalla angosta

- **WHEN** la pantalla de muerte se abre en un viewport de 360 px de ancho
- **THEN** los dos botones se ven completos, apilados y sin scroll horizontal dentro del panel

#### Scenario: Movimiento reducido

- **WHEN** el sistema operativo pide movimiento reducido
- **THEN** los botones no animan el desplazamiento al pasar el mouse y conservan el foco visible
