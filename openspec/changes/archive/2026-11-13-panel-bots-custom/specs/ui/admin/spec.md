# Spec Delta

## ADDED Requirements

### Requirement: Sección de bots en el panel

La página `/admin` SHALL incluir una sección “Bots” visible para el admin autenticado, ubicada antes de la tabla de usuarios, con la tabla de bots, el contador de activos y la acción de alta. MUST NOT mostrarse ni cargar datos de bots fuera del gate de administración.

#### Scenario: El admin ve la sección

- **WHEN** un admin abre `/admin`
- **THEN** ve la sección “Bots” con su tabla y el botón de alta, además de las secciones existentes

#### Scenario: El panel de usuarios no ve bots

- **WHEN** un usuario común es redirigido desde `/admin`
- **THEN** no ve la sección ni recibe datos de bots

#### Scenario: Error al cargar bots

- **WHEN** `GET /api/admin/bots` falla
- **THEN** la sección muestra un mensaje en español y un botón para reintentar sin romper el resto del panel

### Requirement: Tabla de bots con estado runtime

La tabla SHALL mostrar por bot nombre, comportamiento, skin, vida, daño, alcance, velocidad, vuelo, recepción de daño, estado y acciones. El estado SHALL distinguir activo, detenido y, para un bot activo, su vida actual. La tabla SHALL refrescarse después de cada acción.

#### Scenario: Bot activo con vida actual

- **WHEN** hay un bot activo con 7 de 10 de vida
- **THEN** su fila muestra “Activo”, la vida actual y sus parámetros de configuración

#### Scenario: Bot detenido

- **WHEN** un bot está inactivo
- **THEN** su fila muestra “Detenido” y conserva visibles todos sus parámetros

#### Scenario: Tabla vacía

- **WHEN** no existe ningún bot
- **THEN** la sección muestra un estado vacío con la invitación a crear el primero

#### Scenario: Contador de cupo

- **WHEN** hay tres bots activos
- **THEN** la sección muestra “3/5 activos”

### Requirement: Formulario de alta y edición de bots

El formulario SHALL incluir nombre, comportamiento, skin, vida, daño, alcance, velocidad, vuelo y recibe daño, con validaciones de rango en cliente y etiquetas en español. Los errores del server SHALL mostrarse junto al campo correspondiente sin borrar lo escrito.

#### Scenario: Alta válida

- **WHEN** el admin completa todos los campos con valores válidos y confirma
- **THEN** el bot aparece en la tabla como detenido con un aviso de éxito

#### Scenario: Nombre repetido

- **WHEN** el server responde `409 bot_name_taken`
- **THEN** la página muestra que el nombre ya está en uso junto al campo y conserva el valor

#### Scenario: Valor fuera de rango

- **WHEN** el admin escribe una vida de 101 o un daño de 21
- **THEN** el formulario no envía el pedido y explica el rango permitido junto al campo

#### Scenario: Edición con valores actuales

- **WHEN** el admin abre la edición de un bot
- **THEN** el formulario muestra su configuración actual y guarda solo los campos modificados

### Requirement: Referencias de jugador junto a la configuración

El formulario SHALL mostrar, debajo de Vida, Daño, Alcance y Velocidad, el valor de referencia de un jugador normal: “Jugador normal: 10 de vida.”, “Jugador normal: 6 a jugadores (2 golpes) · 2 a criaturas.”, “Jugador normal: 4.6.” y “Jugador normal: 4.8.”. La referencia SHALL ser un texto secundario discreto, legible en tema claro y oscuro, sin romper el layout ni la accesibilidad.

#### Scenario: Referencias visibles en el alta

- **WHEN** el admin abre el formulario de un bot
- **THEN** cada uno de los cuatro campos numéricos muestra debajo su referencia de jugador normal

#### Scenario: Referencias en la edición

- **WHEN** el admin edita un bot existente
- **THEN** las referencias siguen visibles y no reemplazan los valores configurados

#### Scenario: Legibilidad en ambos temas

- **WHEN** el admin cambia entre tema claro y oscuro
- **THEN** las referencias conservan contraste suficiente y no se confunden con un error de validación

### Requirement: Descripción del comportamiento elegido

El select de comportamiento SHALL llenarse desde el catálogo y SHALL mostrar una descripción en español de la opción elegida que cambie al seleccionar otra, incluyendo qué ataca y a quién no ataca.

#### Scenario: Descripción del guardián

- **WHEN** el admin elige `Guardián`
- **THEN** el formulario explica que defiende una zona de 16 bloques contra criaturas y que no ataca jugadores

#### Scenario: Descripción del neutral

- **WHEN** el admin elige `Neutral`
- **THEN** el formulario explica que deambula y que solo responde durante 10 segundos a quien lo golpea

#### Scenario: Catálogo cargado del servidor

- **WHEN** la sección de bots carga el catálogo
- **THEN** el select ofrece `Cazador`, `Merodeador`, `Guardián` y `Neutral` con sus etiquetas

### Requirement: Preset del cazador clásico en el formulario

El formulario SHALL ofrecer el botón “Preset cazador clásico” que completa los campos con los valores históricos del cazador sin crear ni guardar el bot, y SHALL usar 28.8 u/s, dentro del máximo de 30 u/s.

#### Scenario: Precargar el formulario

- **WHEN** el admin pulsa el preset en un alta vacía
- **THEN** los campos muestran cazador, robot, vida 10, daño 6, alcance 4.6, velocidad 28.8, vuelo activo y recepción de daño desactivada

#### Scenario: El preset no crea nada

- **WHEN** el admin pulsa el preset y cierra el diálogo sin confirmar
- **THEN** no se crea ningún bot y la tabla no cambia

#### Scenario: Ajuste de velocidad visible

- **WHEN** el preset se aplica
- **THEN** el preset usa la velocidad clásica de 28.8 u/s, dentro del máximo permitido de 30

### Requirement: Lanzar y detener desde el panel

Cada fila SHALL ofrecer la acción Lanzar cuando el bot está detenido y Detener cuando está activo. La acción de lanzar SHALL deshabilitarse con una explicación cuando ya hay cinco activos, y el resultado SHALL anunciarse por `aria-live`.

#### Scenario: Lanzar un bot

- **WHEN** el admin pulsa Lanzar en un bot detenido y hay cupo
- **THEN** la fila pasa a Activo y la página anuncia el resultado

#### Scenario: Cupo completo

- **WHEN** hay cinco bots activos
- **THEN** los botones Lanzar de los demás aparecen deshabilitados y la página explica el límite

#### Scenario: El server rechaza el cupo

- **WHEN** el server responde `409 bot_limit_reached` porque otra sesión ocupó el último lugar
- **THEN** la página muestra el motivo y refresca la tabla

#### Scenario: Detener un bot

- **WHEN** el admin pulsa Detener en un bot activo
- **THEN** la fila pasa a Detenido y la página anuncia el resultado

### Requirement: Borrado de bot con confirmación

La página SHALL borrar un bot solo tras una confirmación destructiva con el nombre exacto. Si el bot está activo, el diálogo SHALL ofrecer detenerlo y borrarlo en la misma acción, o cancelar sin efectos.

#### Scenario: Confirmación correcta

- **WHEN** el admin escribe el nombre exacto de un bot detenido y confirma
- **THEN** el bot desaparece de la tabla con un aviso de éxito

#### Scenario: Texto que no coincide

- **WHEN** el texto no coincide con el nombre o está vacío
- **THEN** el botón de borrar permanece deshabilitado y no se envía el pedido

#### Scenario: Bot activo

- **WHEN** el admin abre el borrado de un bot activo
- **THEN** el diálogo advierte que está en el juego y ofrece “Detener y borrar” con la misma confirmación

#### Scenario: Cancelar

- **WHEN** el admin cierra el diálogo sin confirmar
- **THEN** el bot sigue igual y no se ejecuta ningún pedido

### Requirement: Accesibilidad de la sección de bots

La sección de bots SHALL usar controles de al menos 44 px, foco visible, etiquetas en español, anuncios por `aria-live` y navegación por teclado, con tema claro y oscuro, sin frameworks ni build.

#### Scenario: Recorrido por teclado

- **WHEN** el admin recorre la sección con Tab
- **THEN** el foco visible pasa por acciones, formulario y diálogo en orden lógico, sin trampas

#### Scenario: Anuncio de resultados

- **WHEN** una acción de bots termina bien o falla
- **THEN** el resultado se anuncia por la región `aria-live` y no solo por color

#### Scenario: Movimiento reducido

- **WHEN** el sistema pide movimiento reducido
- **THEN** las transiciones de la sección se desactivan sin perder información ni foco

### Requirement: Permisos implícitos del administrador en la tabla de usuarios

En la tabla de usuarios de `/admin`, una fila con `role=admin` SHALL mostrar una etiqueta “Administrador” que represente sus poderes implícitos, además de los permisos explícitos que tenga marcados. La etiqueta “Sin permisos” MUST NOT mostrarse para una cuenta administradora.

#### Scenario: Admin sin permisos explícitos

- **WHEN** un administrador no tiene ningún permiso explícito marcado
- **THEN** su fila muestra “Administrador” con la aclaración de que los poderes son implícitos, sin decir “Sin permisos”

#### Scenario: Admin con permisos explícitos

- **WHEN** un administrador además tiene permisos explícitos
- **THEN** su fila muestra la etiqueta “Administrador” y las etiquetas de esos permisos

#### Scenario: Usuario común sin permisos

- **WHEN** un usuario con rol jugador no tiene permisos
- **THEN** su fila sigue mostrando “Sin permisos”
