# Spec Delta

## MODIFIED Requirements

### Requirement: Lobby autenticado

`GET /lobby` SHALL requerir una sesión válida y MUST redirigir a `/login` cuando falte. El lobby SHALL mostrar el username, el skin actual, el selector de aspecto, las dos opciones de mundo y un botón de cerrar sesión. Cuando el perfil tenga `role=admin`, SHALL mostrar además un enlace visible "Administración" hacia `/admin`; un usuario con rol `user` MUST NOT verlo.

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
- **THEN** no aparece ningún enlace, botón ni texto que lleve a `/admin`

#### Scenario: El enlace no aparece antes del perfil

- **WHEN** la página carga y todavía no llegó `/api/me`
- **THEN** el enlace permanece oculto y solo se muestra si el perfil confirma `role=admin`
