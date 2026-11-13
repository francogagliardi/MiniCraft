# Spec Delta

## Purpose

Define la gestión administrativa de bots de Minicraft: el modelo persistido, el alta, la edición, el borrado, el lanzar y detener, el límite de bots activos, el catálogo de comportamientos y la auditoría de cada acción.

## ADDED Requirements

### Requirement: Modelo persistido de bots

El sistema SHALL persistir cada bot en una tabla `bots` con `id`, `name`, `behavior`, `skin`, `hp`, `damage`, `reach`, `speed`, `takes_damage`, `flying`, `active`, `created_by`, `created_at` y `updated_at`. La configuración y el estado `active` MUST sobrevivir a reinicios y redeploys.

#### Scenario: Un bot creado queda guardado

- **WHEN** un admin crea un bot con nombre, comportamiento y configuración válidos
- **THEN** la fila existe en `bots` con esos valores, `active` en falso y las fechas de creación y actualización

#### Scenario: El estado sobrevive al reinicio

- **WHEN** el server se reinicia con bots activos e inactivos en la base
- **THEN** cada bot conserva su configuración y su estado `active` tal como estaba

#### Scenario: El autor queda registrado

- **WHEN** un admin crea un bot
- **THEN** `created_by` apunta a esa cuenta y, si la cuenta se borra, el bot sigue existiendo con `created_by` nulo

### Requirement: Nombre de bot válido y único

El nombre de un bot SHALL tener entre 3 y 16 caracteres, coincidir con `^[A-Za-z0-9_-]+$` y ser único sin distinguir mayúsculas. El nombre SHALL ser el que se muestra en el juego y en el roster.

#### Scenario: Nombre válido

- **WHEN** un admin usa `OPSX-bot` como nombre
- **THEN** el bot se crea y se anuncia con exactamente ese nombre

#### Scenario: Nombre repetido con otra capitalización

- **WHEN** ya existe `OPSX-bot` y se intenta crear `opsx-BOT`
- **THEN** la respuesta es `409 bot_name_taken` y no se crea otro bot

#### Scenario: Nombre fuera de formato

- **WHEN** el nombre tiene 2 caracteres, 17 caracteres o un carácter no permitido
- **THEN** la respuesta es `422 invalid_bot_name` y no se crea el bot

#### Scenario: Nombre igual a una cuenta

- **WHEN** ya existe un usuario llamado `ana` y se intenta crear un bot llamado `ana`
- **THEN** la respuesta es `409 bot_name_taken` y no se crea el bot

### Requirement: Rangos de configuración validados

El sistema SHALL aceptar `hp` entero de 1 a 100, `damage` entero de 0 a 20, `reach` de 1 a 10 con paso 0.1 y `speed` de 1 a 30 con paso 0.1. Un valor fuera de rango, no numérico o con más decimales MUST rechazarse sin crear ni modificar el bot.

#### Scenario: Valores en el borde

- **WHEN** un admin envía `hp:1`, `damage:0`, `reach:1` y `speed:1`
- **THEN** la configuración se acepta y el bot queda con esos valores

#### Scenario: Vida fuera de rango

- **WHEN** un admin envía `hp:0` o `hp:101`
- **THEN** la respuesta es `422 invalid_hp` y no se guarda nada

#### Scenario: Daño fuera de rango

- **WHEN** un admin envía `damage:-1` o `damage:21`
- **THEN** la respuesta es `422 invalid_damage` y no se guarda nada

#### Scenario: Alcance o velocidad con demasiada precisión

- **WHEN** un admin envía `reach:4.65` o `speed:7.25`
- **THEN** la respuesta es `422` con el código del campo y no se guarda nada

### Requirement: Vuelo y recepción de daño como configuración

Cada bot SHALL tener dos flags booleanos estrictos: `flying` (movimiento) y `takes_damage` (vulnerabilidad). Volar MUST NOT tratarse como un comportamiento, y un valor no booleano MUST rechazarse.

#### Scenario: Vuelo desactivado

- **WHEN** un admin configura un bot con `flying:false`
- **THEN** el bot camina con colisión y gravedad aunque su comportamiento sea `cazador`

#### Scenario: Bot invulnerable

- **WHEN** un admin configura un bot con `takes_damage:false`
- **THEN** los golpes de los jugadores no le bajan la vida

#### Scenario: Flag no booleano

- **WHEN** un admin envía `flying:"si"` o `takes_damage:1`
- **THEN** la respuesta es `422 invalid_flag` y no se guarda nada

### Requirement: Catálogo extensible de comportamientos

El sistema SHALL exponer un catálogo de comportamientos registrados en código con al menos `cazador` y `merodeador`, y MUST rechazar un comportamiento que no esté registrado. Sumar un comportamiento MUST requerir solo registrarlo, sin cambiar el modelo ni la API.

#### Scenario: Catálogo disponible

- **WHEN** un admin consulta el listado de bots
- **THEN** recibe los comportamientos `cazador` y `merodeador` con su etiqueta en español y si son hostiles

#### Scenario: Comportamiento desconocido

- **WHEN** un admin envía `behavior:"guardian"`
- **THEN** la respuesta es `422 invalid_behavior` y no se crea el bot

### Requirement: Catálogo de aspectos para bots

El skin de un bot SHALL pertenecer al catálogo de aspectos del cliente (`SKIN_SPECS`), incluido `robot`, y MUST rechazarse cualquier otro valor.

#### Scenario: Robot permitido

- **WHEN** un admin crea un bot con `skin:"robot"`
- **THEN** el bot se crea y el resto de los jugadores lo ve como robot

#### Scenario: Aspecto de jugador permitido

- **WHEN** un admin elige `giant` para un bot
- **THEN** el bot se crea con ese aspecto y se dibuja como gigante

#### Scenario: Aspecto inventado

- **WHEN** un admin envía `skin:"dragon"`
- **THEN** la respuesta es `422 invalid_skin` y no se crea el bot

### Requirement: Preset del cazador clásico

El panel SHALL ofrecer un botón “Preset cazador clásico” que precarga el formulario con `behavior:"cazador"`, `skin:"robot"`, `hp:10`, `damage:6`, `reach:4.6`, `speed:28.8`, `flying:true` y `takes_damage:false` sin crear el bot. La velocidad clásica de 28.8 u/s SHALL quedar dentro del máximo permitido de 30.

#### Scenario: Precargar sin crear

- **WHEN** el admin pulsa “Preset cazador clásico” en el alta
- **THEN** el formulario muestra esos valores y la tabla de bots no cambia hasta confirmar

#### Scenario: Confirmar el preset

- **WHEN** el admin confirma el formulario precargado con un nombre libre
- **THEN** se crea un bot cazador inactivo con esa configuración

#### Scenario: Nombre ocupado en el preset

- **WHEN** el nombre precargado ya existe
- **THEN** el alta responde `409 bot_name_taken`, el formulario conserva lo escrito y el admin puede cambiar el nombre

### Requirement: Alta explícita sin auto-seed

El deploy MUST NOT crear bots automáticamente. Un bot SHALL crearse únicamente por una acción explícita de un admin y SHALL nacer inactivo hasta que se lo lance.

#### Scenario: Primer deploy sin bots

- **WHEN** el server arranca con la tabla `bots` vacía
- **THEN** no se crea ningún bot y el roster no muestra bots

#### Scenario: Alta nace inactiva

- **WHEN** un admin crea un bot válido
- **THEN** la respuesta `201` lo devuelve con `active:false` y no aparece en el juego hasta lanzarlo

### Requirement: Límite de cinco bots activos

El sistema SHALL permitir como máximo cinco bots activos a la vez. El lanzamiento MUST validar el cupo en una transacción con advisory lock, y un sexto lanzamiento MUST rechazarse con `409 bot_limit_reached` sin activar nada.

#### Scenario: Quinto bot activo

- **WHEN** hay cuatro bots activos y el admin lanza un quinto
- **THEN** el bot pasa a activo y aparece en el juego

#### Scenario: Sexto bot rechazado

- **WHEN** hay cinco bots activos y el admin intenta lanzar otro
- **THEN** la respuesta es `409 bot_limit_reached` y el bot sigue inactivo

#### Scenario: Dos lanzamientos simultáneos

- **WHEN** con cuatro activos llegan dos pedidos de lanzamiento a la vez
- **THEN** exactamente uno se aplica y el otro recibe `409 bot_limit_reached`

### Requirement: Lanzar y detener bots

El sistema SHALL exponer `POST /api/admin/bots/:id/start` y `POST /api/admin/bots/:id/stop`. Lanzar un bot ya activo MUST responder sin duplicarlo; detener un bot inactivo SHALL ser inocuo y responder éxito.

#### Scenario: Lanzar un bot inactivo

- **WHEN** un admin lanza un bot inactivo
- **THEN** el bot aparece en el mundo, queda `active:true` y se registra la acción

#### Scenario: Lanzar dos veces

- **WHEN** un admin lanza un bot que ya está activo
- **THEN** la respuesta no crea un segundo bot ni duplica entradas en el roster

#### Scenario: Detener un bot activo

- **WHEN** un admin detiene un bot activo
- **THEN** el bot desaparece del juego, queda `active:false` y su configuración se conserva

#### Scenario: Detener un bot inactivo

- **WHEN** un admin detiene un bot que ya estaba inactivo
- **THEN** la respuesta es exitosa y no cambia nada más que la fecha de actualización

### Requirement: Edición de la configuración

El sistema SHALL permitir editar `name`, `behavior`, `skin`, `hp`, `damage`, `reach`, `speed`, `takes_damage` y `flying` de un bot existente. `active` MUST cambiarse solo con lanzar o detener, y los campos desconocidos MUST rechazarse en vez de ignorarse.

#### Scenario: Editar un bot inactivo

- **WHEN** un admin cambia el daño y la velocidad de un bot detenido
- **THEN** la configuración nueva queda guardada y se aplica en el próximo lanzamiento

#### Scenario: Editar un bot activo

- **WHEN** un admin cambia el skin o el comportamiento de un bot que está en el juego
- **THEN** el cambio se aplica en caliente sin dejarlo duplicado y con la vida reiniciada a su `hp` configurado

#### Scenario: Intentar cambiar el estado por edición

- **WHEN** el cuerpo del `PATCH` incluye `active`
- **THEN** la respuesta es `422 invalid_field` y el estado no cambia

#### Scenario: Bot inexistente

- **WHEN** el `:id` no corresponde a ningún bot
- **THEN** la respuesta es `404 bot_not_found`

### Requirement: Borrado de bots

El sistema SHALL borrar un bot solo cuando está inactivo y MUST responder `204` al borrarlo. Un borrado de un bot activo MUST rechazarse con `409 bot_active` hasta detenerlo.

#### Scenario: Borrar un bot detenido

- **WHEN** un admin borra un bot inactivo y confirma con su nombre
- **THEN** la respuesta es `204`, el bot desaparece del listado y no vuelve al reiniciar

#### Scenario: Borrar un bot activo

- **WHEN** un admin intenta borrar un bot que está en el juego
- **THEN** la respuesta es `409 bot_active` y el bot sigue funcionando

#### Scenario: Borrar dos veces

- **WHEN** se repite el borrado del mismo `:id`
- **THEN** la respuesta es `404 bot_not_found`

### Requirement: Estado runtime en el listado

El listado de bots SHALL incluir, por bot, su configuración persistida y un bloque `runtime` con si está en línea, su vida actual y su posición cuando está activo. Ese bloque MUST NOT persistirse en la base.

#### Scenario: Bot activo en el listado

- **WHEN** un admin lista los bots con uno activo
- **THEN** ese bot trae `runtime.online:true` con vida y posición actuales

#### Scenario: Bot detenido en el listado

- **WHEN** un admin lista un bot detenido
- **THEN** su `runtime` es nulo o `online:false` y la configuración sigue visible

#### Scenario: El runtime no se guarda

- **WHEN** el server se reinicia
- **THEN** el estado runtime se reconstruye desde el spawn y no se lee de la base

### Requirement: Auditoría de las acciones de bots

El sistema SHALL registrar en `admin_audit` las acciones `bot.create`, `bot.update`, `bot.start`, `bot.stop`, `bot.delete` y `bot.death`, con el admin actor (o nulo si la muerte la produce el sistema), el id y el nombre del bot en `details`. Las entradas MUST NOT contener secretos.

#### Scenario: Cada acción deja una entrada

- **WHEN** un admin crea, edita, lanza, detiene o borra un bot
- **THEN** aparece una entrada con la acción correspondiente y el nombre del bot

#### Scenario: La muerte se audita sin actor humano

- **WHEN** un bot con `takes_damage` llega a 0 de vida
- **THEN** queda una entrada `bot.death` con actor nulo y el nombre del bot

#### Scenario: El historial sobrevive al borrado

- **WHEN** el admin borra un bot después de varias acciones
- **THEN** las entradas anteriores siguen visibles con el nombre histórico en `details`

### Requirement: Errores de validación por campo

La API de bots SHALL responder `422` con un código por campo inválido y un objeto `details` que indique el campo y el motivo, sin crear ni modificar nada. Los errores de cupo, duplicado y estado SHALL usar `409`.

#### Scenario: Varios campos inválidos

- **WHEN** el alta trae `hp:0` y `skin:"dragon"`
- **THEN** la respuesta es `422` y `details` identifica ambos campos

#### Scenario: Conflicto de nombre

- **WHEN** el nombre ya existe
- **THEN** la respuesta es `409 bot_name_taken` con el campo `name` señalado

#### Scenario: Cuerpo no JSON

- **WHEN** el pedido no es `application/json` o supera 8 KB
- **THEN** la respuesta es `415` o `413` y no se procesa
