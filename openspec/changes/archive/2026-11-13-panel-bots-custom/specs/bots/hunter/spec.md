# Spec Delta

## ADDED Requirements

### Requirement: Alineación vertical del cazador volador

El cazador con `flying:true` SHALL ajustar su altura hacia la altura de su objetivo más un offset seguro, con banda muerta, y MUST NOT oscilar alrededor del valor objetivo. El cazador caminante SHALL usar el suelo disponible en lugar de alinearse con la altura del objetivo.

#### Scenario: Se alinea con una presa en una torre

- **WHEN** la presa está muy por encima del cazador volador y dentro del alcance horizontal
- **THEN** su altura converge a la de la presa y el golpe se emite sin esperar a que baje

#### Scenario: Se alinea con una presa en una cueva

- **WHEN** la presa está muy por debajo del cazador volador
- **THEN** el bot desciende hasta su altura y la ataca

#### Scenario: Sin oscilación alrededor de la altura objetivo

- **WHEN** la diferencia de altura es menor que la banda muerta
- **THEN** el `y` del bot se mantiene estable

#### Scenario: El cazador caminante sigue el suelo

- **WHEN** el cazador tiene `flying:false`
- **THEN** su altura la define el terreno y no la altura del objetivo

## MODIFIED Requirements

### Requirement: Aspecto de robot humanoide

El cazador SHALL dibujarse con el aspecto configurado en el panel, con `robot` como valor por defecto y el modelo humanoide de robot cuando el aspecto sea `robot`. El nombre y el aspecto SHALL viajar en el roster como los de cualquier avatar.

#### Scenario: Los demás lo ven como robot

- **WHEN** un cazador activo tiene `skin:robot`
- **THEN** su entrada de roster lleva `skin:"robot"` y los demás jugadores lo dibujan con el modelo de robot

#### Scenario: Otro aspecto configurado

- **WHEN** el admin elige `giant` para el cazador
- **THEN** el bot se presenta con `skin:"giant"` y se dibuja como gigante

#### Scenario: Un cliente que ignora el aspecto no se rompe

- **WHEN** un cliente no entiende el campo `skin`
- **THEN** sigue funcionando con el avatar por defecto, sin errores

### Requirement: Presa restringida a no-admins vivos

El cazador SHALL elegir como presa al jugador conectado vivo, no admin, no bot y sin `bot_ignore` más cercano, y MUST NOT atacar nunca a un admin, a otro bot ni a un jugador con `bot_ignore`, sin importar la distancia ni el tiempo que permanezcan al lado.

#### Scenario: Persigue y fulmina a un no-admin

- **WHEN** un jugador vivo, no admin y sin `bot_ignore` está conectado
- **THEN** el cazador lo persigue y lo fulmina

#### Scenario: Ignora por completo a un admin

- **WHEN** un jugador con rol admin está pegado al cazador
- **THEN** el cazador no le dirige ningún golpe, ni siquiera sin otras presas

#### Scenario: Ignora a un no-admin muerto

- **WHEN** el único no-admin conectado está muerto
- **THEN** el cazador se comporta como si no tuviera presas

#### Scenario: Ignora a un jugador con bot_ignore

- **WHEN** el único jugador no-admin vivo tiene `bot_ignore`
- **THEN** el cazador no lo persigue ni le emite daño

#### Scenario: El protegido no bloquea a las demás presas

- **WHEN** conviven un jugador con `bot_ignore` pegado al bot y otro sin el permiso a distancia
- **THEN** el cazador ignora al primero y persigue al segundo

### Requirement: Golpe mortal en dos toques separados por la ventana del cliente

El cazador SHALL emitir su `damage` configurado y SHALL NOT repetir un golpe contra la misma víctima antes de 650 ms, respetando la ventana de invulnerabilidad de 0.6 s del cliente. Con el preset clásico (daño 6) la vida de 10 pasa a 0 en dos toques.

#### Scenario: Dos toques separados bajan la vida a cero

- **WHEN** el cazador con `damage:6` golpea a un jugador dentro de alcance
- **THEN** el primer `phit` aplica 6, espera al menos 650 ms y el segundo lleva la vida a 0

#### Scenario: No dispara dos golpes pegados

- **WHEN** el cazador ya golpeó a su presa y todavía no pasó la ventana de invulnerabilidad
- **THEN** no emite un segundo golpe contra esa misma víctima

#### Scenario: Un golpe de daño alto alcanza

- **WHEN** el cazador tiene `damage` mayor o igual a 10
- **THEN** un solo golpe puede matar y no se espera al segundo

#### Scenario: Un ataque visible por toque

- **WHEN** el cazador ejecuta cada golpe
- **THEN** difunde un único `phit` por golpe y avanza su contador de gesto una vez, para que la víctima vea golpes separados y no un burst

### Requirement: Alcance de ataque acotado

El cazador SHALL acercarse de verdad a su presa y MUST NOT emitir daño contra un objetivo que esté más lejos que su `reach` horizontal configurado, para que la víctima vea al robot al lado antes de morir.

#### Scenario: No golpea fuera de alcance

- **WHEN** el objetivo está más lejos que el `reach` configurado
- **THEN** el cazador no emite daño y se limita a acercarse

#### Scenario: Golpea dentro de alcance

- **WHEN** el objetivo está dentro del `reach` configurado
- **THEN** el cazador emite el golpe

### Requirement: Invulnerabilidad

El cazador SHALL ser inmune al daño cuando `takes_damage` está desactivado, conservando siempre su vida completa y sin morir. Con `takes_damage` activo SHALL recibir daño server-side, morir al llegar a 0 y quedar inactivo.

#### Scenario: Un golpe recibido no lo mata ni lo hiere

- **WHEN** un jugador golpea a un cazador con `takes_damage:false`
- **THEN** el bot no muere, no baja su vida y sigue reportando su vida completa

#### Scenario: Un cazador vulnerable muere

- **WHEN** un jugador agota la vida de un cazador con `takes_damage:true`
- **THEN** el bot desaparece y queda inactivo en el panel

#### Scenario: Caerse al vacío lo devuelve al spawn

- **WHEN** la posición del cazador cae por debajo de `y = -10`
- **THEN** reaparece en su punto de origen sin morir por la caída

### Requirement: Sin presas vuelve al spawn y se queda quieto

El cazador SHALL, cuando no tiene presas válidas, desplazarse hasta su punto de origen y quedarse detenido allí, volador o caminante según su configuración.

#### Scenario: Sin presas se retira al spawn

- **WHEN** no hay ningún jugador válido conectado
- **THEN** el cazador vuelve a su punto de origen y permanece quieto

#### Scenario: Vuelve a perseguir

- **WHEN** aparece un jugador válido después de un rato en el origen
- **THEN** el cazador lo detecta y vuelve a perseguirlo

### Requirement: El bot nunca modifica el mundo

El cazador SHALL unirse al mundo como huésped de solo lectura y MUST NOT romper, colocar ni editar bloques en ninguna circunstancia.

#### Scenario: Cero ediciones durante toda la sesión

- **WHEN** el cazador persigue, golpea, vuelve a su origen o se detiene
- **THEN** no cambia ningún bloque del mundo

#### Scenario: Construcciones intactas

- **WHEN** el cazador atraviesa una construcción volando
- **THEN** los bloques de la construcción siguen exactamente igual

### Requirement: Hora de Argentina en el log de golpe del bot

El runtime SHALL prefijar en la consola del servidor cada golpe de un bot con la hora local de Argentina en formato `[HH:MM]` (24 h, zona `America/Argentina/Buenos_Aires`) al inicio de la línea, sin depender de la zona horaria del proceso.

#### Scenario: Golpe a una presa

- **WHEN** un cazador golpea a un jugador
- **THEN** la línea de consola empieza con `[HH:MM] ` y sigue con el detalle del golpe

#### Scenario: La hora no depende del contenedor

- **WHEN** el proceso corre con la zona UTC
- **THEN** el prefijo refleja la hora de Argentina

#### Scenario: El logger por defecto no antepone ningún tag

- **WHEN** el runtime golpea con su logger por defecto
- **THEN** la línea empieza con `[HH:MM] ` y no lleva ningún tag como `[bot]` delante

#### Scenario: La hora es la de Argentina aunque el contenedor corra en otra zona

- **WHEN** el proceso corre con el reloj del sistema en UTC y ocurre un golpe en un instante conocido
- **THEN** el prefijo `[HH:MM]` refleja la hora de Argentina de ese instante

### Requirement: Vuelo libre sin colisión

El cazador SHALL volar como un punto libre en tres dimensiones cuando `flying:true`, atravesando paredes, techos y terreno, sin gravedad ni auto-escalón. Con `flying:false` SHALL caminar con colisión y gravedad.

#### Scenario: Atraviesa una pared entre el bot y su presa

- **WHEN** la presa está del otro lado de una pared y el cazador vuela
- **THEN** la atraviesa y llega hasta ella sin quedarse trabado

#### Scenario: Entra a una construcción cerrada o a una cueva

- **WHEN** la presa se refugia en una construcción sin puerta y el cazador vuela
- **THEN** llega hasta ella cruzando los bloques del perímetro

#### Scenario: Persigue a una presa que está más alta o más baja

- **WHEN** la presa está arriba de una torre o en un pozo y el cazador vuela
- **THEN** ajusta su altura y la alcanza sin escaleras, rampas ni saltos

#### Scenario: No hay gravedad ni tirón al suelo

- **WHEN** el cazador volador queda en el aire, sobre un techo o dentro de un bloque
- **THEN** conserva su altura y no cae ni es devuelto al suelo

#### Scenario: Respeta el límite del mundo

- **WHEN** su trayectoria lo llevaría fuera del área jugable
- **THEN** su posición queda contenida dentro de los límites del mundo

#### Scenario: Cazador caminante

- **WHEN** el cazador tiene `flying:false` y una pared separa al objetivo
- **THEN** no atraviesa la pared y se desplaza por el terreno disponible

### Requirement: Exclusión actualizada por el roster y el frame perm

El cazador SHALL leer el estado vivo de los jugadores conectados en cada tick, de modo que un cambio de rol o de `bot_ignore` se aplique sin reconectar ni depender de frames del cliente. Un jugador sin el permiso SHALL considerarse no protegido.

#### Scenario: Protegido presente al conectarse

- **WHEN** el cazador se lanza y ya hay un jugador con `bot_ignore`
- **THEN** lo excluye de sus presas desde el primer tick

#### Scenario: Se habilita bot_ignore durante la caza

- **WHEN** el cazador persigue a un jugador y un admin le habilita `bot_ignore`
- **THEN** abandona esa presa en el siguiente tick y no le emite más golpes

#### Scenario: Se revoca bot_ignore

- **WHEN** se revoca `bot_ignore` a un jugador conectado
- **THEN** el cazador vuelve a considerarlo una presa válida si está vivo y no es admin

#### Scenario: Un server viejo sin el flag

- **WHEN** un jugador no tiene el permiso o el dato no está disponible
- **THEN** el cazador lo trata como no protegido y conserva el comportamiento anterior

## REMOVED Requirements

### Requirement: Alineación vertical con la altura del objetivo

**Reason**: El cazador externo alineaba su altura en todos los modos, incluido ESPERA. El runtime in-process tiene dos movimientos según `flying` y el caminante no se alinea con el objetivo.

**Migration**: Usar `flying:true` para el comportamiento histórico de vuelo alineado; con `flying:false` el bot camina sobre el terreno.

### Requirement: Keepalive de movimiento aun quieto

**Reason**: El cazador ya no es un cliente WebSocket: no hay `mv`, ni expiración por inactividad, ni keepalive que mantener.

**Migration**: El runtime publica el estado del bot en el roster y en los frames `pm` desde el propio servidor; no hay nada que el bot deba reportar.

### Requirement: Máquina de estados y precedencia

**Reason**: Los modos CAZA, ESPERA y SIGUEME eran una superficie de control del bot externo. El bot in-process se controla solo con el panel y su comportamiento configurado.

**Migration**: Para congelar un bot, el admin lo detiene; para cambiar su conducta, edita el comportamiento o los parámetros y lo relanza.

### Requirement: Comandos de chat solo-admin con autoridad por id del server

**Reason**: Los comandos `sigueme`, `seguime` y `espera` desaparecen junto con la máquina de estados; el panel es la única superficie de control.

**Migration**: Usar los botones Lanzar/Detener y la edición de comportamiento en `/admin`. El chat deja de aceptar órdenes de bots.

### Requirement: Anuncio de cambios de modo y de muertes

**Reason**: Sin modos ni comandos no hay cambios que anunciar; la muerte de un bot se audita y se difunde como `leave`, sin mensajes de chat del bot.

**Migration**: El historial queda en la auditoría (`bot.death`) y en la consola del servidor.

### Requirement: Reconexión con backoff y ejecución como servicio

**Reason**: El bot corre dentro del servidor: no hay conexión que reconectar ni servicio 24/7 que mantener.

**Migration**: El runtime arranca y detiene bots con el ciclo de vida del server; los activos se spawnean al boot.

### Requirement: Aspecto del bot configurable por `BOT_SKIN`

**Reason**: El aspecto pasa a ser un campo del bot administrado desde el panel; la variable de entorno ya no existe en el flujo.

**Migration**: Elegir el skin en el formulario de alta/edición. El preset clásico usa `robot`.

### Requirement: Declaración de bot en el hello

**Reason**: El bot in-process no envía `hello`; su identidad la construye el servidor.

**Migration**: El roster marca las entradas de bot con `bot:true` y un id negativo reservado, y el quórum de sueño las excluye por no ser jugadores reales.

### Requirement: Velocidad seis veces la de un jugador

**Reason**: La velocidad fija de 28.8 u/s se reemplaza por un campo configurable de 1 a 30 u/s por bot.

**Migration**: El preset clásico configura 28.8 u/s, dentro del máximo permitido de 30; conserva la velocidad histórica del cazador.

### Requirement: Conexión del bot con credencial de servicio

**Reason**: Se retira `BOT_TOKEN` y el upgrade con `Authorization: Bearer`. Un bot ya no se autentica por WebSocket.

**Migration**: Crear y lanzar bots desde `/admin`. El bot externo viejo recibe `401`; el operador debe detener o borrar la App `minicraft-bot` en Easypanel.

### Requirement: El bot de servicio no usa cuentas ni HTTP

**Reason**: Sin conexión de servicio no hay una identidad de bot que pueda o no usar cuentas o HTTP; el bot es estado interno del servidor.

**Migration**: No aplica: los bots no tienen credenciales ni rutas.
