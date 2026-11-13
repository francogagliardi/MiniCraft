# security/auth Specification

## Purpose
Define las cuentas de usuario y el ciclo de vida de la sesión: alta por registro público y aprovisionamiento, hash de contraseñas, login/logout, sesiones persistidas y revocables, roles `user`/`admin`, perfil editable (solo skin), bootstrap del admin inicial y retiro de la clave admin compartida.

## Requirements

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

### Requirement: Hash de contraseñas con scrypt

El sistema SHALL almacenar las contraseñas como hash `scrypt` autodescriptivo (algoritmo, parámetros, salt y derivado) y MUST NOT guardar ni registrar la contraseña en claro. La verificación SHALL derivar de forma asíncrona y comparar en tiempo constante; una contraseña distinta o un hash corrupto MUST denegar sin lanzar una excepción no capturada.

#### Scenario: La contraseña correcta verifica

- **WHEN** se verifica la contraseña con la que se creó la cuenta
- **THEN** la verificación devuelve verdadero

#### Scenario: La contraseña incorrecta no verifica

- **WHEN** se verifica cualquier otra contraseña contra el mismo hash
- **THEN** la verificación devuelve falso sin revelar en qué parte difiere

#### Scenario: Dos hashes de la misma contraseña son distintos

- **WHEN** se hashea dos veces la misma contraseña
- **THEN** los strings resultantes difieren por el salt aleatorio y ambos verifican la contraseña original

#### Scenario: Un hash corrupto deniega sin crash

- **WHEN** el hash almacenado está truncado o tiene parámetros inválidos
- **THEN** la verificación devuelve falso y el proceso sigue atendiendo pedidos

### Requirement: Login con credenciales

El sistema SHALL autenticar `POST /api/login` con `username` y `password`, crear una sesión nueva y responder con el perfil público (`username`, `role`, `skin`). Un usuario inexistente, inactivo o una contraseña incorrecta MUST recibir la misma respuesta `401` genérica, sin distinguir el motivo. La respuesta MUST incluir `Cache-Control: no-store`.

#### Scenario: Login correcto

- **WHEN** se envía el username y la contraseña correctos de una cuenta activa
- **THEN** la respuesta es `200` con el perfil, `Set-Cookie` de sesión y `Cache-Control: no-store`

#### Scenario: Contraseña incorrecta

- **WHEN** se envía un username existente con una contraseña incorrecta
- **THEN** la respuesta es `401` con el mismo mensaje genérico que un usuario inexistente y sin cookie de sesión

#### Scenario: Usuario inexistente o inactivo

- **WHEN** se intenta login con un username que no existe o cuya cuenta está inactiva
- **THEN** la respuesta es `401` genérica, se ejecuta una derivación de relleno y no se crea sesión

#### Scenario: Username con otra capitalización entra igual

- **WHEN** la cuenta es `Ana_01` y el login usa `ana_01`
- **THEN** la autenticación resuelve la misma cuenta y el perfil devuelve el username almacenado

### Requirement: Rate limit del login

El sistema SHALL limitar los intentos de login por IP con un token bucket de capacidad y recarga finitas, y SHALL acotar globalmente las derivaciones concurrentes. Al agotarse el límite MUST responder `429` sin derivar la contraseña, con el mismo cuerpo genérico y sin crear sesión.

#### Scenario: Ráfaga de intentos fallidos

- **WHEN** una misma IP supera la capacidad del bucket en intentos de login
- **THEN** los intentos siguientes reciben `429` y no consumen derivaciones de `scrypt`

#### Scenario: Un login legítimo espaciado no se bloquea

- **WHEN** una IP hace pocos intentos espaciados dentro de la recarga configurada
- **THEN** cada intento dispone de token y un login correcto entra con normalidad

#### Scenario: El límite no inunda los logs

- **WHEN** el limitador rechaza intentos de forma repetida
- **THEN** el server registra el rechazo de forma acotada (rate-limited), sin una línea por intento

### Requirement: Registro público de usuarios

El sistema SHALL exponer `GET /register` y `POST /api/register` para que un visitante cree su cuenta con `username` y `password`, sin email. El alta SHALL fijar `role: "user"`, `active: true` y skin `human`, aplicar las mismas validaciones de username y contraseña que el aprovisionamiento, y MUST NOT crear ni promover un `role: "admin"`. Una respuesta exitosa SHALL ser `201` con el perfil público y una cookie de sesión nueva (auto-login).

#### Scenario: Alta desde el registro

- **WHEN** un visitante sin sesión envía un username libre y una contraseña de 8 o más caracteres a `POST /api/register`
- **THEN** se crea la cuenta con rol `user`, skin `human` y activa, la respuesta es `201` con el perfil y `Set-Cookie`, y `GET /api/me` ya responde con esa cuenta

#### Scenario: El auto-login lleva al lobby

- **WHEN** el registro termina bien desde el navegador
- **THEN** el usuario queda autenticado y pasa a `/lobby` sin volver a escribir su contraseña

#### Scenario: Username reservado

- **WHEN** se intenta registrar `admin`, `Server`, `null` o el valor configurado en `ADMIN_USERNAME`
- **THEN** la respuesta es `400` con `username_reserved` y no se crea ninguna cuenta

#### Scenario: Username repetido con otra capitalización

- **WHEN** existe `Ana_01` y alguien se registra como `ana_01`
- **THEN** la respuesta es `409` con `username_taken`, no se crea una segunda cuenta y la cuenta existente no cambia

#### Scenario: El cliente no puede elegir rol, skin ni estado

- **WHEN** el cuerpo del registro incluye `role: "admin"`, `skin: "robot"` o `active: false`
- **THEN** esos campos se ignoran y la cuenta queda como `user`, `human` y activa

#### Scenario: Validaciones de formato

- **WHEN** el username no cumple `^[A-Za-z0-9_-]{3,16}$` (por ejemplo 2 caracteres o un espacio) o la contraseña tiene menos de 8 o más de 128 caracteres
- **THEN** la respuesta es `400` (`invalid_username` o `invalid_password`), no se deriva el hash y no se crea cuenta ni sesión

### Requirement: Control y anti-abuso del registro

El sistema SHALL controlar el alta con `REGISTRATION_ENABLED`: ausente habilita, `0`/`false` cierra y cualquier otro valor MUST cerrar con advertencia. Con el registro cerrado, `/register` SHALL mostrar "Registro cerrado" y `POST /api/register` MUST responder `403`, sin afectar el login. El endpoint SHALL tener un rate limit por IP más estricto que el del login, MUST NOT derivar `scrypt` al agotarse y MUST crear usuario y sesión en una sola transacción.

#### Scenario: Registro cerrado por configuración

- **WHEN** `REGISTRATION_ENABLED=0` y un visitante abre `/register` o envía `POST /api/register`
- **THEN** la página muestra "Registro cerrado" sin formulario y el POST responde `403`, mientras el login de cuentas existentes sigue funcionando

#### Scenario: Abuso del alta

- **WHEN** una misma IP supera el límite de registros configurado
- **THEN** los intentos siguientes reciben `429` sin consumir derivaciones de `scrypt` ni crear cuentas

#### Scenario: Carrera de usernames

- **WHEN** dos pedidos de registro simultáneos usan el mismo username con distinta capitalización
- **THEN** uno crea la cuenta y el otro recibe `409`, sin usuarios duplicados y sin errores internos expuestos

#### Scenario: Falla la creación de la sesión

- **WHEN** el usuario se inserta pero la creación de la sesión falla
- **THEN** la transacción se revierte completa y no queda una cuenta creada sin sesión

### Requirement: Sesión opaca en cookie endurecida

El sistema SHALL crear una sesión con un token aleatorio de al menos 32 bytes, guardar en `sessions` solo su hash SHA-256 junto con `user_id`, `created_at`, `expires_at` y `revoked_at`, y enviar el token en una cookie `HttpOnly`, `SameSite=Lax`, `Path=/` y `Secure` cuando el despliegue sea HTTPS. La cookie MUST NOT ser legible por JavaScript y la sesión MUST expirar a los 7 días.

#### Scenario: La cookie no expone el token en la base

- **WHEN** se inspecciona la fila de `sessions` creada por un login
- **THEN** el valor almacenado es el hash del token y no el token que viaja en la cookie

#### Scenario: Atributos de la cookie

- **WHEN** el server responde un login en producción HTTPS
- **THEN** `Set-Cookie` incluye `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` y `Max-Age` de 7 días

#### Scenario: Sesión expirada no autentica

- **WHEN** se presenta una cookie cuya sesión superó `expires_at`
- **THEN** el pedido se trata como no autenticado y la sesión no se renueva

### Requirement: Logout y revocación

El sistema SHALL revocar la sesión actual en `POST /api/logout`, borrar la cookie con los mismos atributos y responder sin cuerpo. Una sesión revocada MUST dejar de autenticar de inmediato, tanto en HTTP como en WebSocket.

#### Scenario: Logout revoca la sesión

- **WHEN** un usuario autenticado llama `POST /api/logout`
- **THEN** la fila queda con `revoked_at`, la respuesta limpia la cookie y un `GET /api/me` posterior responde `401`

#### Scenario: Logout sin sesión es idempotente

- **WHEN** se llama `POST /api/logout` sin cookie válida
- **THEN** la respuesta es exitosa, no falla y no crea ni modifica sesiones

#### Scenario: Una sesión revocada no vuelve a entrar

- **WHEN** se reutiliza el token de una sesión revocada
- **THEN** el server lo rechaza aunque `expires_at` siga en el futuro

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

### Requirement: Roles y autoridad del admin

El sistema SHALL derivar los privilegios de `role`: un usuario `admin` SHALL entrar al juego con poderes de admin y uno `user` MUST NOT poder elevarse enviando campos del cliente. El rol MUST leerse de la base en cada autenticación, no de la cookie ni del `hello`.

#### Scenario: Un admin de base entra como admin

- **WHEN** un usuario con `role: "admin"` inicia sesión y se conecta al juego
- **THEN** el server lo identifica como admin sin pedir ninguna clave

#### Scenario: Un usuario común no se eleva

- **WHEN** un usuario `user` envía `mode: "admin"` o cualquier campo de privilegio en el `hello`
- **THEN** el server lo mantiene como jugador y no le otorga poderes de admin

#### Scenario: El rol se toma de la base

- **WHEN** el rol del usuario cambia en la base y la sesión sigue activa
- **THEN** la próxima autenticación usa el rol nuevo y no el que estaba en la cookie

### Requirement: Bootstrap del admin inicial

En el arranque, si no existe el usuario indicado por `ADMIN_USERNAME` (default `admin`), el sistema SHALL crearlo con `role: "admin"` usando la contraseña de `ADMIN_PASSWORD`, hasheada con `scrypt`. Si `ADMIN_PASSWORD` falta o es más corta que el mínimo, MUST NOT crear ni modificar el admin y SHALL advertir sin exponer secretos. Si el usuario ya existe, MUST NOT sobrescribir su contraseña.

#### Scenario: Primer arranque crea el admin

- **WHEN** la tabla `users` no tiene el usuario `admin` y `ADMIN_PASSWORD` está configurada con longitud válida
- **THEN** se crea `admin` con rol admin, skin `human`, activo y contraseña hasheada

#### Scenario: Reinicio no cambia la contraseña

- **WHEN** el admin ya existe y se cambia `ADMIN_PASSWORD` en el entorno
- **THEN** el arranque no modifica el hash existente y solo informa que el admin ya estaba creado

#### Scenario: Sin contraseña no hay admin

- **WHEN** el server arranca sin `ADMIN_PASSWORD` o con una contraseña demasiado corta
- **THEN** no se crea ni modifica ningún admin y el arranque registra una advertencia

### Requirement: Retiro de la clave admin compartida

El sistema MUST NOT autenticar privilegios con `ADMIN_KEY` ni `ADMIN_KEY_HASH`. Si esas variables siguen presentes, el server SHALL ignorarlas y registrar una advertencia de migración una sola vez al arrancar, sin exponer sus valores.

#### Scenario: Variables legacy presentes

- **WHEN** el server arranca con `ADMIN_KEY` o `ADMIN_KEY_HASH` configuradas
- **THEN** no habilita ningún modo admin por esa vía y registra que deben removerse en favor de usuarios con rol admin

#### Scenario: El hello con clave no otorga admin

- **WHEN** un cliente envía `hello` con `mode: "admin"` y una clave
- **THEN** el campo se ignora y el rol sale exclusivamente de la sesión

### Requirement: Protección CSRF y de respuestas

Las rutas que cambian estado (`POST /api/login`, `POST /api/register`, `POST /api/logout`, `PATCH /api/me`) SHALL aceptar solo `application/json`, SHALL rechazar un `Origin` presente que no coincida con el host del pedido y MUST NOT aceptar cuerpos mayores a 8 KB. `GET /api/me` y las páginas autenticadas SHALL responder `Cache-Control: no-store`.

#### Scenario: Petición cross-site con Origin ajeno

- **WHEN** llega un `POST /api/login`, `POST /api/register` o `PATCH /api/me` con `Origin: https://otro-sitio.example`
- **THEN** el server responde `403` y no ejecuta la acción

#### Scenario: Content-Type incorrecto

- **WHEN** llega un `POST /api/login` con `text/plain` o un formulario clásico
- **THEN** el server responde `415` y no procesa credenciales

#### Scenario: Body demasiado grande

- **WHEN** el cuerpo de una ruta de auth supera 8 KB
- **THEN** el server responde `413` y no procesa la acción

### Requirement: Seguridad ante base no disponible

Si la base de datos no responde, las rutas de auth MUST responder `503` y MUST NOT autenticar a nadie por defecto. Un error de base nunca SHALL degradar a "sin autenticación" ni crear sesiones en memoria.

#### Scenario: Login con la base caída

- **WHEN** `POST /api/login` no puede consultar `users`
- **THEN** la respuesta es `503` y no se crea sesión ni cookie

#### Scenario: Sesión no verificable

- **WHEN** un pedido trae cookie pero la consulta de sesión falla por error de base
- **THEN** el pedido se rechaza con `503` y no se asume un usuario válido

### Requirement: Aprovisionamiento y rotación por CLI

El proyecto SHALL proveer una herramienta de línea de comandos para crear usuarios, cambiar contraseñas, listar cuentas y activar/desactivar cuentas, sin exponer contraseñas en la salida ni en los logs y reutilizando el mismo hash y las mismas validaciones del login.

#### Scenario: Crear un usuario desde la terminal

- **WHEN** el operador ejecuta la herramienta para crear un usuario con username, contraseña y rol
- **THEN** la cuenta queda en la base y puede iniciar sesión con esas credenciales

#### Scenario: Cambiar la contraseña invalida sesiones

- **WHEN** el operador cambia la contraseña de una cuenta con sesiones activas
- **THEN** las sesiones existentes de esa cuenta quedan revocadas

#### Scenario: La salida no filtra la contraseña

- **WHEN** la herramienta crea o cambia una contraseña
- **THEN** su salida confirma la operación sin imprimir la contraseña ni el hash completo

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
