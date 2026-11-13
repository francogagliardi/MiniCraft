# Spec Delta

## MODIFIED Requirements

### Requirement: Lobby autenticado

`GET /lobby` SHALL requerir una sesión válida y MUST redirigir a `/login` cuando falte. El lobby SHALL mostrar el username, el skin actual, el selector de aspecto, los permisos vigentes, las dos opciones de mundo y un botón de cerrar sesión. Cuando el perfil tenga `role=admin`, SHALL mostrar además un enlace visible "Administración" hacia `/admin`; un usuario con rol `user` MUST NOT verlo. El enlace MUST nacer con el atributo `hidden` y el CSS del lobby MUST garantizar que `[hidden]` gane sobre cualquier `display` declarado por componentes como `a.ghost` o `button`, de modo que un usuario común no vea el enlace ni su espacio reservado.

#### Scenario: Acceso sin sesión

- **WHEN** un visitante sin sesión abre `/lobby`
- **THEN** es redirigido a `/login` y no ve datos de ninguna cuenta

#### Scenario: Lobby con sesión

- **WHEN** un usuario autenticado abre `/lobby`
- **THEN** ve su username, su skin guardado, el selector de skins y las opciones de mundo

#### Scenario: Cerrar sesión desde el lobby

- **WHEN** el usuario pulsa "Cerrar sesión"
- **THEN** se revoca la sesión, se limpia la cookie y vuelve a `/login`

#### Scenario: Un admin ve el acceso al panel

- **WHEN** un usuario con `role=admin` abre el lobby
- **THEN** ve el enlace "Administración" y al pulsarlo navega a `/admin`

#### Scenario: Un usuario común no ve el acceso

- **WHEN** un usuario con `role=user` abre el lobby
- **THEN** no aparece ningún enlace, botón ni texto que lleve a `/admin`, y el enlace oculto no ocupa espacio ni deja un hueco en el header

#### Scenario: El enlace no aparece antes del perfil

- **WHEN** la página carga y todavía no llegó `/api/me`
- **THEN** el enlace permanece oculto y solo se muestra si el perfil confirma `role=admin`

## ADDED Requirements

### Requirement: Permisos visibles en el lobby

El lobby SHALL mostrar una sección "Permisos" con los privilegios vigentes de `user.permissions` de `/api/me`, rotulados en español, y "Sin permisos especiales." como fallback. Con `role=admin` SHALL incluir "Administrador" junto con los permisos explícitos. Un perfil sin `permissions` MUST NOT romper el resto del lobby.

#### Scenario: Jugador con permisos

- **WHEN** un jugador sin rol admin abre el lobby y su cuenta tiene `fly` e `instant_break`
- **THEN** la sección Permisos muestra "Podés volar" y "Rompes bloques al instante", sin mostrar los identificadores crudos; `bot_ignore` se rotula "El bot no te ataca"

#### Scenario: Jugador sin permisos

- **WHEN** un jugador sin rol admin ni permisos abre el lobby
- **THEN** la sección Permisos muestra "Sin permisos especiales."

#### Scenario: Admin con permisos explícitos

- **WHEN** un admin con `bot_ignore` abre el lobby
- **THEN** la sección Permisos muestra "Administrador" y "El bot no te ataca"

#### Scenario: Perfil sin permisos en la respuesta

- **WHEN** `/api/me` responde un usuario sin el objeto `permissions`
- **THEN** la sección muestra "Sin permisos especiales." sin errores en consola y el resto del lobby sigue funcionando

### Requirement: Autocompletado de credenciales

Las pantallas de login y registro SHALL declarar `autocomplete="off"` y no usar `name` en los campos, y MUST NOT declarar `autocomplete="current-password"`, `username` ni `new-password`. Ningún sitio puede garantizar al 100% que el navegador no ofrezca guardar credenciales; la implementación SHALL documentar ese límite.

#### Scenario: Login sin sugerencias de credenciales

- **WHEN** el usuario abre `/login`
- **THEN** el formulario y los campos declaran `autocomplete="off"` y no exponen `name`, sin perder etiquetas ni accesibilidad

### Requirement: Enmascarado sin type=password

En el HTML inicial los campos de contraseña del login y del registro MUST NOT declarar `type="password"`: SHALL nacer como `type="text"` enmascarado por CSS. En navegadores sin `-webkit-text-security` SHALL cambiarse a `type="password"` para usar el enmascarado nativo. La contraseña SHALL vaciarse antes de enviar el formulario y limpiarse antes de navegar a `/lobby`.

#### Scenario: Edge/Chromium no detecta un campo de contraseña

- **WHEN** el usuario abre el login o el registro en un navegador con soporte de `-webkit-text-security`
- **THEN** el HTML ya trae el campo como `type="text"` enmascarado y el gestor integrado no ofrece guardar la contraseña

#### Scenario: Navegador sin enmascarado CSS

- **WHEN** el usuario abre el login en un navegador sin soporte de `-webkit-text-security`
- **THEN** el JS cambia el campo a `type="password"` y el enmascarado nativo, sin romper el formulario

#### Scenario: Contraseña vacía antes del submit

- **WHEN** el usuario envía el login o el registro
- **THEN** el campo se vacía antes de la petición y se restaura solo si la operación falla
