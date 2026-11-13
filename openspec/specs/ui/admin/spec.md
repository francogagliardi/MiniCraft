# ui/admin Specification

## Purpose
Define la página `/admin` de Minicraft: acceso restringido a administradores, tabla de cuentas con sus acciones, formularios de alta y edición, reset de contraseña, borrado con confirmación y una sección de auditoría, con la misma identidad visual y accesibilidad que el resto del cliente.

## Requirements

### Requirement: Gate de la página de administración

`GET /admin` SHALL requerir una sesión válida y `role=admin`. Sin sesión MUST redirigir a `/login`; con sesión de rol `user` MUST redirigir a `/lobby` sin servir la página. La página MUST responder `Cache-Control: no-store`, `noindex` y MUST NOT cargar datos de administración antes del gate del server.

#### Scenario: Un admin abre el panel

- **WHEN** un usuario con `role=admin` navega a `/admin`
- **THEN** recibe `200` con la página de administración y `Cache-Control: no-store`

#### Scenario: Sin sesión

- **WHEN** un visitante abre `/admin` sin cookie
- **THEN** es redirigido a `/login` y no ve ningún dato

#### Scenario: Usuario común

- **WHEN** un usuario con `role=user` abre `/admin`
- **THEN** es redirigido a `/lobby` y no puede ver ni ejecutar acciones administrativas

#### Scenario: Sesión que deja de ser admin

- **WHEN** el rol del usuario cambia mientras tiene el panel abierto
- **THEN** la siguiente acción responde `403` y la página vuelve al lobby o muestra el aviso de sesión

### Requirement: Tabla de cuentas

La página SHALL mostrar una tabla con todas las cuentas y, por cada una, username, rol, estado (activo/inactivo), skin, permisos y acciones disponibles. La tabla SHALL actualizarse después de cada operación y MUST indicar de forma visible el estado vacío o los errores de carga.

#### Scenario: Tabla con cuentas

- **WHEN** el admin abre el panel con varias cuentas
- **THEN** ve una fila por cuenta con su rol, estado, skin y permisos

#### Scenario: Sin cuentas además del admin

- **WHEN** la lista solo trae la cuenta del admin
- **THEN** la tabla se muestra igual y las acciones sobre sí mismo aparecen deshabilitadas o explicadas

#### Scenario: Error al cargar

- **WHEN** `GET /api/admin/users` responde `503` o falla la red
- **THEN** la página muestra un mensaje en español y un botón para reintentar, sin quedar en blanco

### Requirement: Alta de usuario desde el panel

La página SHALL ofrecer un formulario de alta con username, contraseña, rol, skin y permisos, validar los campos en cliente y mostrar los errores del server junto al campo correspondiente sin borrar lo escrito. Un alta exitosa SHALL sumar la cuenta a la tabla.

#### Scenario: Alta exitosa

- **WHEN** el admin completa username libre, contraseña válida y confirma
- **THEN** la cuenta aparece en la tabla y el formulario queda limpio con un aviso de éxito

#### Scenario: Username repetido

- **WHEN** el server responde `409 username_taken`
- **THEN** la página muestra "Ese nombre ya está en uso" junto al campo y conserva el valor escrito

#### Scenario: Permiso inválido

- **WHEN** el server responde `422 invalid_permissions`
- **THEN** la página explica que los permisos enviados no son válidos y no cierra el formulario

### Requirement: Edición de cuenta desde el panel

La página SHALL permitir editar skin, rol, estado y permisos de una cuenta mediante un formulario con los valores actuales, y MUST mostrar el username como dato de solo lectura con la leyenda de que no se edita. Los errores de guardas SHALL mostrarse en español, sin cerrar el formulario.

#### Scenario: El username se muestra inmutable

- **WHEN** el admin abre la edición de una cuenta
- **THEN** el username aparece como texto no editable y la página aclara que no se puede cambiar

#### Scenario: Guardar cambios

- **WHEN** el admin cambia el skin y habilita `bot_ignore`
- **THEN** la fila de la tabla refleja ambos cambios al cerrar el formulario

#### Scenario: Guarda del último admin

- **WHEN** el admin intenta degradar al último admin y el server responde `409 guard_last_admin`
- **THEN** la página muestra el motivo y deja la cuenta sin cambios

#### Scenario: Guarda de self

- **WHEN** el admin intenta desactivarse o degradarse a sí mismo desde el panel
- **THEN** la página explica que esa acción no está permitida y no envía el pedido o muestra el `409`

### Requirement: Reset de contraseña desde el panel

La página SHALL ofrecer una acción de reset de contraseña con campo de nueva contraseña y confirmación, mostrar las sesiones revocadas y advertir cuando el target es el propio admin. La contraseña MUST NOT aparecer en la tabla ni en la auditoría.

#### Scenario: Reset exitoso

- **WHEN** el admin define una contraseña nueva válida para otro usuario
- **THEN** ve un aviso de éxito con las sesiones revocadas y ningún valor de contraseña

#### Scenario: Reset de la propia cuenta

- **WHEN** el admin resetea su propia contraseña
- **THEN** la página avisa que se cerrarán sus sesiones y, al confirmar, vuelve a `/login`

#### Scenario: Contraseña corta

- **WHEN** la nueva contraseña tiene menos de 8 caracteres
- **THEN** el error se muestra junto al campo y no se envía el pedido

### Requirement: Las contraseñas guardadas no se pueden mostrar

La página MUST NOT ofrecer ver contraseñas en texto plano ni consultar la contraseña actual: se guarda hasheada con `scrypt` y no es recuperable. El diálogo de reset SHALL explicar de forma visible que no se puede mostrar y que definir una nueva es la única vía. MUST NOT existir endpoint ni campo para leerla.

#### Scenario: La contraseña actual no se puede ver

- **WHEN** el admin abre el diálogo de reset de una cuenta
- **THEN** la página explica que la contraseña está hasheada, que no se puede mostrar y que el reset es la única vía, sin ofrecer ningún botón, campo o endpoint para revelarla

### Requirement: Borrado con confirmación explícita

La página SHALL borrar una cuenta solo después de una confirmación destructiva en la que el admin escriba el username exacto de la cuenta objetivo. El diálogo MUST indicar que la acción es definitiva, y la página MUST NOT borrar nada si el texto no coincide.

#### Scenario: Confirmación correcta

- **WHEN** el admin escribe el username exacto y confirma
- **THEN** la cuenta desaparece de la tabla con un aviso de éxito

#### Scenario: Texto que no coincide

- **WHEN** el admin escribe otro texto o deja el campo vacío
- **THEN** el botón de borrar permanece deshabilitado y no se envía el pedido

#### Scenario: Cancelar

- **WHEN** el admin cierra el diálogo sin confirmar
- **THEN** la cuenta sigue intacta y no se ejecuta ningún pedido

### Requirement: Sección de auditoría

La página SHALL mostrar las últimas acciones administrativas con fecha, actor, target, acción y un detalle legible en español, y SHALL refrescarlas después de cada operación. Las entradas de guardas rechazadas SHALL distinguirse de las acciones exitosas.

#### Scenario: Auditoría visible

- **WHEN** el admin abre el panel después de crear y editar usuarios
- **THEN** ve esas acciones ordenadas de la más reciente a la más antigua

#### Scenario: Refresco tras una acción

- **WHEN** el admin borra una cuenta
- **THEN** la sección de auditoría muestra la nueva entrada sin recargar la página

#### Scenario: Usuario borrado en el historial

- **WHEN** una entrada apunta a una cuenta ya borrada
- **THEN** se muestra el username histórico y se indica que la cuenta ya no existe

### Requirement: Presentación, tema y accesibilidad

La página SHALL compartir la identidad visual del lobby, ofrecer tema oscuro y claro con `data-theme` y persistencia en `mc-theme`, usar textos en español, controles táctiles de al menos 44 px, foco visible, navegación por teclado y respeto por `prefers-reduced-motion`, sin frameworks ni build.

#### Scenario: Tema persistente

- **WHEN** el admin alterna el tema en `/admin`
- **THEN** la página cambia de tema y la elección se conserva al volver

#### Scenario: Navegación por teclado

- **WHEN** el admin recorre el panel con Tab
- **THEN** el foco visible recorre filtros, filas, formularios y el diálogo en orden lógico, sin trampas de foco

#### Scenario: Confirmación accesible

- **WHEN** se abre el diálogo de borrado
- **THEN** el foco entra en el diálogo, se anuncia su título y Escape lo cierra sin borrar

#### Scenario: Movimiento reducido

- **WHEN** el sistema pide movimiento reducido
- **THEN** las transiciones se desactivan sin perder información ni foco visible

### Requirement: Autocompletado de credenciales

Los formularios de alta y reset de contraseña SHALL declarar `autocomplete="off"` y los campos SHALL incluir atributos de ignorado para los gestores (`data-lpignore`, `data-1p-ignore`, `data-bwignore`, `data-dashlane-ignore`) y MUST NOT declarar `autocomplete="new-password"`. Ningún sitio puede garantizar al 100% que el navegador no ofrezca guardar credenciales; la página SHALL documentar ese límite.

#### Scenario: Alta sin pestañas de autocompletado

- **WHEN** el admin abre el diálogo de nueva cuenta
- **THEN** los campos de usuario y contraseña piden al navegador no autocompletar ni ofrecer guardado, sin perder las etiquetas ni la accesibilidad

#### Scenario: Reset sin pestañas de autocompletado

- **WHEN** el admin abre el diálogo de reset de contraseña
- **THEN** los dos campos de contraseña declaran `autocomplete="off"` y los atributos de ignorado de gestores

### Requirement: Enmascarado sin type=password

En el HTML inicial los campos de contraseña del panel MUST NOT declarar `type="password"`: SHALL nacer como `type="text"` enmascarado por CSS. En navegadores sin `-webkit-text-security` SHALL cambiarse a `type="password"` para usar el enmascarado nativo. La contraseña SHALL vaciarse antes de enviar el formulario y limpiarse después de un alta o reset exitoso.

#### Scenario: Edge/Chromium no ofrece guardar la contraseña

- **WHEN** el admin abre el alta o el reset en un navegador con soporte de `-webkit-text-security`
- **THEN** el HTML ya trae los campos como `type="text"` enmascarado y el gestor integrado no detecta un campo de contraseña

#### Scenario: Navegador sin enmascarado CSS

- **WHEN** el admin abre el alta o el reset en un navegador sin soporte de `-webkit-text-security`
- **THEN** el JS cambia los campos a `type="password"` y el enmascarado nativo, sin romper el formulario

#### Scenario: Contraseña vacía antes del submit

- **WHEN** el admin confirma un alta o un reset válido
- **THEN** el campo se vacía antes de la petición y se restaura solo si la operación falla
