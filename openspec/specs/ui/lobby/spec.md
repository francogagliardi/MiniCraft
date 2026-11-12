# ui/lobby Specification

## Purpose
Define el recorrido de entrada al juego —registro, login, lobby y juego— con páginas separadas, la elección de modo (Legacy o Mundo Infinito próximamente) y el selector de aspecto dentro del lobby.

## Requirements

### Requirement: Página de login

El sistema SHALL servir una página `/login` con campos de usuario y contraseña, un botón de ingreso, un enlace a `/register` y un mensaje de error genérico ante credenciales inválidas. Un login exitoso MUST redirigir al lobby y un usuario con sesión válida que abra `/login` MUST ser redirigido al lobby.

#### Scenario: Login exitoso desde la página

- **WHEN** el usuario ingresa credenciales correctas y confirma
- **THEN** el navegador navega a `/lobby` y el usuario ve su nombre de cuenta

#### Scenario: Credenciales inválidas

- **WHEN** el usuario ingresa una contraseña incorrecta
- **THEN** la página muestra un mensaje genérico (`Usuario o contraseña incorrectos`) y no revela si el usuario existe

#### Scenario: Ya autenticado

- **WHEN** un usuario con sesión válida abre `/login`
- **THEN** es redirigido a `/lobby` sin volver a pedir credenciales

#### Scenario: Rate limit visible

- **WHEN** el server responde `429` por demasiados intentos
- **THEN** la página informa que hay que esperar un momento y no borra el usuario escrito

#### Scenario: Enlace al registro

- **WHEN** un visitante sin cuenta abre `/login`
- **THEN** ve un enlace visible "¿No tenés cuenta? Crear una" que lleva a `/register`

### Requirement: Pantalla de registro

El sistema SHALL servir `/register` con campos de username y contraseña, sin pedir email, y un enlace de vuelta a `/login`. Un alta exitosa MUST dejar la sesión iniciada y llevar al lobby; con sesión válida, `/register` MUST redirigir al lobby. Con el registro cerrado SHALL mostrar "Registro cerrado" sin formulario. Los errores de validación SHALL mostrarse junto al campo correspondiente, en español y sin borrar lo escrito.

#### Scenario: Registro exitoso desde la página

- **WHEN** el visitante elige un username libre y una contraseña válida y confirma
- **THEN** la cuenta se crea, la sesión queda iniciada y el navegador navega a `/lobby`

#### Scenario: Username ya usado

- **WHEN** el server responde `409 username_taken`
- **THEN** la página muestra "Ese nombre ya está en uso" junto al campo de username y conserva el username escrito

#### Scenario: Username reservado

- **WHEN** el visitante intenta un nombre reservado como `admin`
- **THEN** la página explica que el nombre está reservado y no envía el alta

#### Scenario: Registro cerrado

- **WHEN** el operador desactivó el registro y el visitante abre `/register`
- **THEN** ve "Registro cerrado" con un enlace a `/login` y ningún formulario de alta

#### Scenario: Registro desde el teléfono

- **WHEN** el visitante completa el formulario en un teléfono
- **THEN** los campos y el botón se usan sin zoom horizontal y el teclado permite avanzar y enviar

### Requirement: Lobby autenticado

`GET /lobby` SHALL requerir una sesión válida y MUST redirigir a `/login` cuando falte. El lobby SHALL mostrar el username, el skin actual, el selector de aspecto, las dos opciones de mundo y un botón de cerrar sesión.

#### Scenario: Acceso sin sesión

- **WHEN** un visitante sin sesión abre `/lobby`
- **THEN** es redirigido a `/login` y no ve datos de ninguna cuenta

#### Scenario: Lobby con sesión

- **WHEN** un usuario autenticado abre `/lobby`
- **THEN** ve su username, su skin guardado, el selector de skins y las opciones de mundo

#### Scenario: Cerrar sesión desde el lobby

- **WHEN** el usuario pulsa "Cerrar sesión"
- **THEN** se revoca la sesión, se limpia la cookie y vuelve a `/login`

### Requirement: Elección de mundo en el lobby

El lobby SHALL ofrecer **Jugar Legacy**, que navega a `/game`, y **Mundo Infinito**, visible pero deshabilitado con la leyenda "Próximamente". La opción deshabilitada MUST NOT iniciar ninguna partida ni disparar pedidos de juego.

#### Scenario: Entrar al mundo actual

- **WHEN** el usuario pulsa "Jugar Legacy"
- **THEN** navega a `/game` y comienza la conexión al mundo existente

#### Scenario: Mundo Infinito deshabilitado

- **WHEN** el usuario observa o intenta pulsar "Mundo Infinito"
- **THEN** ve "Próximamente" y no se inicia ninguna partida ni conexión WebSocket

### Requirement: Gate de la página de juego

`GET /game` SHALL requerir una sesión válida, MUST redirigir a `/login` sin ella y SHALL servir el juego existente sin pedir nombre, clave admin ni skin dentro del juego. La página MUST obtener el perfil desde `/api/me` antes de conectar.

#### Scenario: Jugar autenticado

- **WHEN** un usuario con sesión abre `/game`
- **THEN** el juego carga con su username y su skin del perfil, sin formularios de identidad

#### Scenario: Abrir el juego sin sesión

- **WHEN** un visitante sin sesión abre `/game`
- **THEN** es redirigido a `/login`

#### Scenario: La sesión expira al abrir el juego

- **WHEN** `/api/me` responde `401` al cargar `/game`
- **THEN** el cliente redirige a `/login` y muestra un aviso claro en vez de quedar en "Conectando…"

### Requirement: Redirección de la raíz

`GET /` SHALL redirigir a `/lobby` cuando haya sesión válida y a `/login` cuando no la haya. La raíz MUST NOT servir directamente el juego a un visitante sin sesión.

#### Scenario: Raíz con sesión

- **WHEN** un usuario autenticado abre `/`
- **THEN** es redirigido a `/lobby`

#### Scenario: Raíz sin sesión

- **WHEN** un visitante abre `/`
- **THEN** es redirigido a `/login`

### Requirement: Separación de páginas sin reescribir el juego

El juego SHALL seguir viviendo en el archivo `index.html` y servirse en la ruta `/game`. Las páginas `login.html`, `register.html` y `lobby.html` SHALL ser archivos propios y autocontenidos, sin build ni framework, con el mismo lenguaje visual del juego.

#### Scenario: El juego se sirve por ruta

- **WHEN** un usuario autenticado pide `/game`
- **THEN** recibe el contenido de `index.html` con `Cache-Control: no-store`

#### Scenario: Páginas nuevas autocontenidas

- **WHEN** se revisan `login.html`, `register.html` y `lobby.html`
- **THEN** no dependen de un bundler ni de assets binarios y usan Three.js solo si lo necesitan

### Requirement: UX en escritorio y móvil

Las páginas de registro, login y lobby SHALL ser usables en escritorio y en móvil, con controles táctiles de al menos 44 px, foco visible por teclado y los formularios de registro y login enviables con Enter.

#### Scenario: Login desde el teléfono

- **WHEN** el usuario abre `/login` en un teléfono
- **THEN** los campos y el botón se ven sin zoom horizontal y el teclado permite enviar con Enter

#### Scenario: Navegación por teclado

- **WHEN** el usuario recorre el lobby con Tab
- **THEN** el foco visible marca cada skin y cada opción de mundo en orden lógico

### Requirement: Tema claro y oscuro persistente

Las páginas de login, registro y lobby SHALL ofrecer tema oscuro y claro mediante `data-theme` en el elemento `<html>`, con variables CSS para ambos. Cada página MUST incluir un botón visible y accesible que persista la elección en `localStorage` (`mc-theme`); sin preferencia guardada el default SHALL ser oscuro. El tema MUST aplicarse antes del CSS para evitar el destello, respetar `prefers-reduced-motion` y no alterar los formularios ni el selector de aspecto.

#### Scenario: Alternar el tema

- **WHEN** el usuario pulsa el botón de tema en login, registro o lobby
- **THEN** la página cambia entre oscuro y claro, el icono y `aria-pressed` reflejan el estado y la elección queda guardada en `mc-theme`

#### Scenario: Preferencia recordada

- **WHEN** el usuario vuelve a abrir cualquiera de las tres páginas después de elegir el tema claro
- **THEN** la página arranca en claro sin pasar por el tema oscuro

#### Scenario: Sin preferencia guardada

- **WHEN** el usuario abre login, registro o lobby por primera vez
- **THEN** la página se muestra en tema oscuro y el botón ofrece pasar al claro

#### Scenario: Cambiar el tema no rompe el formulario

- **WHEN** el usuario alterna el tema mientras completa el login, el registro o el selector de aspecto
- **THEN** los valores escritos, los errores visibles y la selección de aspecto se conservan

### Requirement: Aspectos con etiquetas en español

El selector de aspecto del lobby y todo texto visible que nombre un aspecto SHALL usar las etiquetas en español del catálogo: Humano, Gordo, Gigante, Pequeño, Zombi, Mujer, Piel oscura y Gojo. Los identificadores internos (`human`, `fat`, `giant`, `small`, `zombie`, `mujer`, `moreno`, `gojo`) MUST permanecer estables para el protocolo, el perfil y `PATCH /api/me`. Las páginas MUST NOT mostrar textos de interfaz en inglés.

#### Scenario: Selector del lobby en español

- **WHEN** el usuario autenticado abre el lobby
- **THEN** ve los ocho aspectos rotulados Humano, Gordo, Gigante, Pequeño, Zombi, Mujer, Piel oscura y Gojo

#### Scenario: Aspecto del perfil en el menú

- **WHEN** el cliente muestra el aspecto del jugador antes de entrar al mundo
- **THEN** usa la etiqueta en español del catálogo (`skinSpec(...).label`) y no el identificador interno

#### Scenario: Los identificadores no cambian

- **WHEN** el usuario elige "Piel oscura" en el lobby
- **THEN** el pedido a `PATCH /api/me` envía `moreno` y el perfil conserva el mismo contrato que antes

### Requirement: Entrada directa al juego desde el lobby

Con una sesión válida, abrir `/game` SHALL iniciar la partida automáticamente, mostrando "Conectando…" y sin menú intermedio con el botón "ENTRAR AL MUNDO". El autoarranque MUST ser idempotente y MUST NOT aplicarse en modo archivo local, que conserva el menú. Sin pointer lock disponible SHALL mostrarse un aviso no bloqueante, y ante un error SHALL ofrecerse reintentar.

#### Scenario: Jugar Legacy entra directo

- **WHEN** el usuario pulsa "Jugar Legacy" en el lobby y `/game` carga con su sesión
- **THEN** la partida arranca sola y el usuario no ve el menú intermedio de entrada

#### Scenario: Pointer lock sin gesto

- **WHEN** la partida autoarranca y el navegador no concede el pointer lock sin interacción
- **THEN** el juego sigue iniciado y muestra un aviso no bloqueante para hacer clic y capturar el mouse

#### Scenario: Error al conectar

- **WHEN** el autoarranque no logra conectarse
- **THEN** se muestra el mensaje de error y el botón para reintentar, sin quedar en un spinner infinito

#### Scenario: Archivo local

- **WHEN** `index.html` se abre directamente como archivo (sin HTTP)
- **THEN** se mantiene el menú con el botón "ENTRAR AL MUNDO"

### Requirement: Presentación y accesibilidad de las pantallas

Las páginas de login, registro y lobby SHALL compartir la identidad visual del juego (verde Minicraft, logo de bloque) con fondo trabajado, panel con profundidad y espaciados legibles. Los hints y footers de login y registro MUST quedar centrados. Botones, tarjetas y enlaces SHALL tener estados `:hover`/`:active` suaves, foco visible por teclado y respeto por `prefers-reduced-motion`.

#### Scenario: Hover y foco en las tarjetas

- **WHEN** el usuario pasa el mouse o navega con Tab por una tarjeta de aspecto o de mundo
- **THEN** la tarjeta responde con un cambio suave de borde, sombra o elevación y el foco queda visible

#### Scenario: Hints centrados

- **WHEN** el usuario abre `/login` o `/register`
- **THEN** el texto de ayuda inferior y el footer aparecen centrados en el panel

#### Scenario: Movimiento reducido

- **WHEN** el sistema operativo pide movimiento reducido
- **THEN** las transiciones y animaciones de las tres páginas se desactivan sin perder información ni foco visible
