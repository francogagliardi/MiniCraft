# Spec Delta

## MODIFIED Requirements

### Requirement: Cuentas de usuario persistidas

El sistema SHALL persistir cada cuenta en la tabla `users` con `id`, `username`, `password_hash`, `role` (`user` o `admin`), `skin`, `active`, `permissions`, `created_at` y `updated_at`. El `username` SHALL ser único sin distinguir mayúsculas y MUST cumplir `^[A-Za-z0-9_-]{3,16}$`; el `role` MUST ser uno de los dos valores permitidos, `skin` MUST pertenecer al catálogo de jugador y `permissions` MUST ser un objeto JSON normalizado contra la allowlist.

#### Scenario: Alta de un usuario válido

- **WHEN** se aprovisiona un usuario con username `ana_01`, contraseña válida y rol `user`
- **THEN** queda una fila activa en `users` con skin `human` por defecto, `permissions` vacío y su contraseña almacenada solo como hash

#### Scenario: Username repetido con otra capitalización

- **WHEN** existe `Ana_01` y se intenta crear `ana_01`
- **THEN** la operación falla por unicidad y no se crea una segunda cuenta

#### Scenario: Rol o skin inválidos se rechazan

- **WHEN** se intenta guardar un usuario con rol `superadmin` o skin `robot`
- **THEN** la operación se rechaza y no se modifica la base

#### Scenario: Permisos por defecto

- **WHEN** se crea una cuenta sin especificar permisos
- **THEN** la fila guarda un objeto vacío y el perfil público materializa los tres permisos en `false`

### Requirement: Perfil público y edición del skin

El sistema SHALL exponer `GET /api/me` con `username`, `role`, `skin` y `permissions` del usuario autenticado, y `PATCH /api/me` SHALL aceptar únicamente el campo `skin`, validado contra el catálogo de jugador. Cualquier otro campo MUST ignorarse o rechazarse y el `username`/`role`/`permissions` MUST NOT ser editables por esta vía.

#### Scenario: Consultar el perfil

- **WHEN** un usuario autenticado llama `GET /api/me`
- **THEN** recibe `200` con `username`, `role`, `skin` y `permissions`, sin hash ni datos de sesión

#### Scenario: Cambiar el skin

- **WHEN** el usuario envía `PATCH /api/me` con un skin del catálogo
- **THEN** el perfil queda actualizado y la respuesta devuelve el perfil nuevo

#### Scenario: Intentar cambiar el rol o el username

- **WHEN** el usuario envía `PATCH /api/me` con `role: "admin"` o un `username` distinto
- **THEN** esos campos no cambian y el rol/username siguen siendo los de la base

#### Scenario: Intentar cambiarse permisos

- **WHEN** el usuario envía `PATCH /api/me` con `permissions: {"fly":true}`
- **THEN** el campo se ignora o se rechaza y los permisos guardados no cambian

#### Scenario: Skin fuera del catálogo

- **WHEN** el usuario envía `PATCH /api/me` con `robot` o un valor inventado
- **THEN** la respuesta es `400` y el skin guardado no cambia

## ADDED Requirements

### Requirement: Revocación administrativa de sesiones

Cuando un administrador cambia el rol de una cuenta, la desactiva, le resetea la contraseña o la borra, el sistema SHALL revocar todas las sesiones de esa cuenta y cerrar sus conexiones WebSocket abiertas con la limpieza normal del jugador. Reactivar una cuenta MUST NOT revocar ni crear sesiones.

#### Scenario: Cambio de rol en caliente

- **WHEN** un admin cambia el rol de un usuario conectado
- **THEN** todas sus sesiones quedan revocadas y su WebSocket se cierra, de modo que el rol nuevo se aplica en el siguiente login

#### Scenario: Desactivación

- **WHEN** un admin desactiva una cuenta con sesiones activas
- **THEN** las sesiones quedan revocadas y la cuenta no puede autenticarse hasta que se reactive

#### Scenario: Reset de contraseña

- **WHEN** un admin define una contraseña nueva
- **THEN** todas las sesiones previas de esa cuenta quedan revocadas y solo la contraseña nueva permite entrar

#### Scenario: Borrado de la cuenta

- **WHEN** un admin borra una cuenta
- **THEN** sus sesiones desaparecen por cascada y sus conexiones se cierran

#### Scenario: Reactivación

- **WHEN** un admin reactiva una cuenta inactiva
- **THEN** no se revoca ninguna sesión inexistente ni se crea una sesión nueva; el usuario debe loguearse

#### Scenario: Cambio de permisos no revoca

- **WHEN** un admin cambia solo los permisos de una cuenta
- **THEN** sus sesiones y conexiones siguen activas y los permisos nuevos se aplican sin relogin
