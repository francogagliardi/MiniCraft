# security/admin Specification

## Purpose
Define la administración de cuentas por parte de un admin autenticado: listar, crear, editar campos acotados, resetear contraseñas, activar/desactivar y borrar usuarios, con guardas de integridad del sistema y un registro de auditoría append-only de cada acción y rechazo.

## Requirements

### Requirement: Listado de usuarios solo para admin

`GET /api/admin/users` SHALL requerir una sesión con `role=admin` y devolver todas las cuentas ordenadas por `lower(username)` con `id`, `username`, `role`, `skin`, `active`, `permissions`, `createdAt` y `updatedAt`. La respuesta MUST NOT incluir `passwordHash`, hashes de sesión ni cookies.

#### Scenario: Un admin lista las cuentas

- **WHEN** un admin autenticado llama `GET /api/admin/users`
- **THEN** recibe `200` con la lista completa y cada cuenta trae su rol, skin, estado, permisos y fechas

#### Scenario: El listado no filtra hashes

- **WHEN** se inspecciona cualquier respuesta del listado
- **THEN** no aparece `passwordHash`, `password_hash` ni ningún hash de contraseña o sesión

#### Scenario: Un usuario común no lista

- **WHEN** un usuario autenticado con `role=user` llama `GET /api/admin/users`
- **THEN** recibe `403 admin_required` y ningún dato de otras cuentas

#### Scenario: Sin sesión no hay listado

- **WHEN** un visitante sin cookie llama `GET /api/admin/users`
- **THEN** recibe `401 unauthorized`

### Requirement: Alta de usuario por admin

`POST /api/admin/users` SHALL crear una cuenta con `username`, `password`, `role`, `skin`, `active` y `permissions`, aplicando las mismas validaciones de username, contraseña y nombres reservados que el registro público. El alta SHALL responder `201` con el usuario creado y MUST NOT crear sesión ni cookie para el nuevo usuario.

#### Scenario: Alta válida

- **WHEN** un admin envía username libre, contraseña válida, rol `user`, skin `small` y `permissions: {"fly":true}`
- **THEN** la cuenta queda creada y activa, y la respuesta `201` trae el usuario con esos valores

#### Scenario: Username duplicado o reservado

- **WHEN** el username ya existe con otra capitalización o está en la lista de reservados
- **THEN** la respuesta es `409 username_taken` o `400 username_reserved` y no se crea ninguna cuenta

#### Scenario: Rol, skin o permisos inválidos

- **WHEN** el cuerpo pide `role: "superadmin"`, `skin: "robot"` o un permiso desconocido
- **THEN** la respuesta es `422` con el código de validación correspondiente y no se crea la cuenta

#### Scenario: El alta no inicia sesión

- **WHEN** el alta termina bien
- **THEN** la respuesta no trae `Set-Cookie` y la sesión del admin sigue siendo la única activa

### Requirement: Edición acotada y username inmutable

`PATCH /api/admin/users/:id` SHALL aceptar únicamente `skin`, `role`, `active` y `permissions`, y MUST NOT permitir cambiar el `username` ni la contraseña. Un cuerpo que incluya `username`, `password`, `id` o cualquier campo desconocido MUST rechazarse con `422` en vez de ignorarse.

#### Scenario: Edición de skin, rol y estado

- **WHEN** un admin envía `{"skin":"giant","role":"admin","active":true}` sobre un usuario existente
- **THEN** la cuenta queda con esos valores y la respuesta `200` devuelve el usuario actualizado

#### Scenario: Intento de renombrar

- **WHEN** el cuerpo incluye `username` con cualquier valor, incluso el actual
- **THEN** la respuesta es `422 username_immutable` y la cuenta no cambia

#### Scenario: Contraseña por la ruta de edición

- **WHEN** el cuerpo incluye `password`
- **THEN** la respuesta es `422 invalid_field` y no se modifica el hash

#### Scenario: Usuario inexistente

- **WHEN** el `:id` no corresponde a ninguna cuenta
- **THEN** la respuesta es `404 user_not_found`

#### Scenario: Cuerpo vacío o no JSON

- **WHEN** el cuerpo no trae ningún campo editable o no es `application/json`
- **THEN** la respuesta es `400 invalid_request` o `415`, sin efectos

### Requirement: Reset de contraseña por admin

`POST /api/admin/users/:id/password` SHALL fijar una contraseña nueva validada con la misma política del login (8–128), hashearla con `scrypt`, revocar todas las sesiones del usuario y responder `200` con la cantidad de sesiones revocadas. La contraseña MUST NOT aparecer en la respuesta, en la auditoría ni en los logs.

#### Scenario: Reset exitoso

- **WHEN** un admin envía una contraseña válida para otro usuario
- **THEN** la respuesta es `200`, el usuario entra con la contraseña nueva y todas sus sesiones anteriores quedan revocadas

#### Scenario: El usuario afectado pierde sus conexiones

- **WHEN** el usuario tenía una partida abierta al momento del reset
- **THEN** su WebSocket se cierra y su cookie deja de autenticar

#### Scenario: Contraseña inválida

- **WHEN** la contraseña tiene menos de 8 o más de 128 caracteres
- **THEN** la respuesta es `422 invalid_password` y no se revoca ninguna sesión

#### Scenario: Reset de la propia cuenta

- **WHEN** el admin resetea su propia contraseña
- **THEN** la operación se aplica, sus sesiones se revocan y la respuesta limpia la cookie para forzar un login nuevo

### Requirement: Activar y desactivar cuentas

`PATCH /api/admin/users/:id` con `active: false` SHALL desactivar la cuenta, revocar todas sus sesiones y cerrar sus sockets; con `active: true` SHALL reactivarla sin crear ni restaurar sesiones. Una cuenta inactiva MUST NOT poder loguearse ni abrir el WebSocket, y su username sigue reservado por unicidad.

#### Scenario: Desactivar saca al usuario

- **WHEN** un admin desactiva una cuenta con sesión y partida abiertas
- **THEN** sus sesiones quedan revocadas, su WebSocket se cierra y un login posterior responde `401`

#### Scenario: Reactivar no devuelve sesiones

- **WHEN** un admin reactiva la cuenta
- **THEN** la cuenta puede volver a loguearse y no recupera ninguna sesión previa

#### Scenario: Desactivar dos veces es inocuo

- **WHEN** se desactiva una cuenta ya inactiva
- **THEN** la respuesta es `200`, no hay error y no se crean ni revocan sesiones nuevas

### Requirement: Borrado definitivo de cuentas

`DELETE /api/admin/users/:id` SHALL borrar la cuenta y, por cascada, todas sus sesiones, cerrando sus conexiones abiertas. La respuesta SHALL ser `204` y el historial de auditoría de esa cuenta MUST conservarse sin apuntar a una fila inexistente.

#### Scenario: Borrar una cuenta basura

- **WHEN** un admin borra una cuenta sin rol admin
- **THEN** la respuesta es `204`, la cuenta y sus sesiones desaparecen y el usuario ya no puede autenticarse

#### Scenario: El historial sobrevive al borrado

- **WHEN** se consulta la auditoría después de borrar una cuenta
- **THEN** las entradas de esa cuenta siguen visibles con su username histórico y `target` nulo

#### Scenario: Borrar dos veces

- **WHEN** se repite el borrado del mismo `:id`
- **THEN** la respuesta es `404 user_not_found`

### Requirement: Guardas de self y del último admin

El sistema MUST impedir que un admin se desactive, se borre o se degrade a `user` a sí mismo, y MUST impedir cualquier operación que deje el sistema sin al menos un admin activo. Una operación rechazada por estas guardas SHALL responder `409` con `guard_self_action` o `guard_last_admin` y MUST NOT modificar la base.

#### Scenario: Un admin intenta degradarse

- **WHEN** un admin envía `role: "user"` sobre su propio `:id`
- **THEN** la respuesta es `409 guard_self_action` y su rol no cambia

#### Scenario: Un admin intenta borrarse

- **WHEN** un admin llama `DELETE` sobre su propio `:id`
- **THEN** la respuesta es `409 guard_self_action` y la cuenta sigue existiendo

#### Scenario: Queda un solo admin activo

- **WHEN** el único admin activo intenta desactivar, degradar o borrar a otro admin que ya está inactivo o no existe ningún otro admin activo
- **THEN** la respuesta es `409 guard_last_admin` y el sistema conserva su admin activo

#### Scenario: Con dos admins sí se puede

- **WHEN** existen dos admins activos y uno degrada al otro
- **THEN** la operación se aplica y queda exactamente un admin activo

#### Scenario: Carrera de degradaciones

- **WHEN** dos pedidos simultáneos degradan a los dos únicos admins
- **THEN** como máximo uno se aplica y el otro recibe `409 guard_last_admin`, sin dejar el sistema sin admin

### Requirement: Permisos validados contra una allowlist

Las cuentas SHALL guardar `permissions` como objeto JSON con solo las claves permitidas `bot_ignore`, `fly` e `instant_break`, todas booleanas. Una clave desconocida, un valor no booleano o un `permissions` que no sea objeto MUST rechazarse con `422 invalid_permissions` sin modificar la cuenta ni ignorar el campo.

#### Scenario: Permisos válidos

- **WHEN** se envía `{"bot_ignore":true,"fly":false,"instant_break":true}`
- **THEN** la cuenta guarda solo los permisos habilitados y la respuesta los materializa como tres booleanos

#### Scenario: Clave desconocida

- **WHEN** se envía `{"god_mode":true}`
- **THEN** la respuesta es `422 invalid_permissions` y la cuenta conserva sus permisos anteriores

#### Scenario: Valor no booleano

- **WHEN** se envía `{"fly":"si"}` o `{"fly":1}`
- **THEN** la respuesta es `422 invalid_permissions` y no se guarda nada

#### Scenario: Reemplazo completo del mapa

- **WHEN** un admin envía `{}` sobre una cuenta con `fly` habilitado
- **THEN** la cuenta queda sin permisos y el vuelo deja de estar habilitado por permiso

### Requirement: Auditoría append-only de acciones

El sistema SHALL registrar en `admin_audit` cada acción administrativa (crear, editar, permisos, password, activar/desactivar, borrar) y cada rechazo por guarda, con `actor_user_id`, `target_user_id`, `action`, `details` JSONB y `created_at`. Las entradas MUST NOT contener contraseñas, hashes ni tokens, y MUST NOT poder editarse ni borrarse desde la API.

#### Scenario: Cada acción deja una entrada

- **WHEN** un admin crea, edita, resetea la contraseña o borra una cuenta
- **THEN** aparece una entrada con la acción, el actor, el target y el detalle del cambio

#### Scenario: Un rechazo también se audita

- **WHEN** una operación se rechaza por `guard_last_admin`
- **THEN** queda una entrada `guard_rejected` con el motivo y sin datos sensibles

#### Scenario: La auditoría no expone secretos

- **WHEN** se inspecciona el detalle de cualquier entrada, incluida la de password
- **THEN** no aparece la contraseña, el hash ni el token de sesión

#### Scenario: No hay borrado de auditoría

- **WHEN** un admin intenta modificar o borrar una entrada de auditoría desde la API
- **THEN** no existe ruta para hacerlo y la entrada permanece

### Requirement: Consulta de auditoría reciente

`GET /api/admin/audit` SHALL devolver las últimas acciones en orden descendente con `id`, `actor`, `target`, `action`, `details` y `createdAt`, aceptando un `limit` entre 1 y 200 con default 50. Los usuarios borrados SHALL representarse con su username histórico y `id` nulo.

#### Scenario: Últimas acciones

- **WHEN** un admin llama `GET /api/admin/audit?limit=10`
- **THEN** recibe como máximo 10 entradas, la más reciente primero

#### Scenario: Límite inválido

- **WHEN** se envía `limit=0`, `limit=500` o un valor no numérico
- **THEN** el server usa un valor válido acotado o responde `400`, sin errores internos

#### Scenario: Un usuario común no ve la auditoría

- **WHEN** un usuario `role=user` llama `GET /api/admin/audit`
- **THEN** recibe `403 admin_required`

### Requirement: Protección de la API administrativa

Todas las rutas `/api/admin/*` SHALL exigir sesión válida, JSON estricto, `Origin`/`Referer` del mismo host, cuerpo máximo de 8 KB y un rate limit propio por IP, y SHALL responder `Cache-Control: no-store`. Al agotarse el límite MUST responder `429 rate_limited` sin ejecutar la acción.

#### Scenario: Origin ajeno

- **WHEN** llega un `POST /api/admin/users` con `Origin: https://otro-sitio.example`
- **THEN** la respuesta es `403` y no se crea la cuenta

#### Scenario: Content-Type incorrecto

- **WHEN** un pedido de escritura usa `text/plain` o un formulario clásico
- **THEN** la respuesta es `415` y no se procesa

#### Scenario: Ráfaga de acciones

- **WHEN** una IP supera el límite de acciones administrativas
- **THEN** los pedidos siguientes reciben `429` sin tocar la base

#### Scenario: Base caída

- **WHEN** la base no responde durante una acción administrativa
- **THEN** la respuesta es `503 unavailable` y no se asume éxito

### Requirement: Autorización de las rutas de bots

Todas las rutas `/api/admin/bots*` SHALL exigir una sesión válida con `role=admin` y MUST responder `401 unauthorized` sin sesión y `403 admin_required` con rol `user`. Las respuestas MUST llevar `Cache-Control: no-store` y MUST NOT exponer datos de bots a quien no es admin.

#### Scenario: Sin sesión

- **WHEN** un visitante sin cookie llama `GET /api/admin/bots`
- **THEN** recibe `401 unauthorized` y ningún dato de bots

#### Scenario: Usuario común

- **WHEN** un usuario con rol `user` intenta listar, crear, editar, lanzar, detener o borrar un bot
- **THEN** recibe `403 admin_required` y la operación no tiene efecto

#### Scenario: Admin autenticado

- **WHEN** un admin autenticado llama cualquier ruta de bots
- **THEN** la petición se procesa y la respuesta lleva `Cache-Control: no-store`

#### Scenario: Sin caché intermedia

- **WHEN** un proxy inspecciona una respuesta de bots
- **THEN** encuentra `Cache-Control: no-store` y no la almacena

### Requirement: Protección de escritura de la API de bots

Las rutas de escritura de bots SHALL exigir `application/json`, `Origin` o `Referer` del mismo host, un cuerpo máximo de 8 KB y el bucket de rate limit administrativo. Al agotarse el límite MUST responder `429 rate_limited` sin crear, editar, lanzar, detener ni borrar nada.

#### Scenario: Origin ajeno

- **WHEN** llega un `POST /api/admin/bots` con `Origin: https://otro-sitio.example`
- **THEN** la respuesta es `403` y no se crea el bot

#### Scenario: Content-Type incorrecto

- **WHEN** una escritura usa `text/plain` o un formulario clásico
- **THEN** la respuesta es `415` y no se procesa

#### Scenario: Cuerpo demasiado grande

- **WHEN** el cuerpo supera 8 KB
- **THEN** la respuesta es `413` y no se crea ni modifica nada

#### Scenario: Ráfaga de acciones

- **WHEN** una IP supera el límite del bucket administrativo
- **THEN** los pedidos siguientes reciben `429` sin tocar bots ni auditoría

#### Scenario: Base caída

- **WHEN** la base no responde durante una acción de bots
- **THEN** la respuesta es `503 unavailable` y no se asume éxito

### Requirement: Rechazos de bots sin efectos parciales

Un rechazo por cupo, nombre duplicado, bot activo o validación SHALL dejar la base y el runtime exactamente como estaban y SHALL auditarse cuando corresponda, sin activar un bot a medias ni dejarlo en el roster.

#### Scenario: Cupo agotado

- **WHEN** el lanzamiento responde `409 bot_limit_reached`
- **THEN** el bot sigue inactivo, no aparece en el roster y no se consumió cupo

#### Scenario: Nombre duplicado

- **WHEN** el alta responde `409 bot_name_taken`
- **THEN** no queda ninguna fila nueva ni un bot a medio crear

#### Scenario: Borrado de un bot activo

- **WHEN** el borrado responde `409 bot_active`
- **THEN** el bot sigue funcionando y su configuración no cambió
