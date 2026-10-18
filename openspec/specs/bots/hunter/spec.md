# bots/hunter Specification

## Purpose
Define el contrato observable del bot cazador de Minicraft: como un cliente externo más, se presenta con aspecto de robot humanoide, elige a quién persigue y a quién nunca ataca, pelea con reglas acotadas propias, mantiene su sesión viva aun quieto, obedece órdenes de operador con autoridad del server y se opera como servicio reconectante 24/7. Es un huésped de solo lectura: jamás modifica el mundo.

## Requirements

### Requirement: Aspecto de robot humanoide

El bot SHALL presentarse ante el resto de los jugadores con el aspecto de un robot humanoide declarando `skin: 'robot'` en su `hello`, de modo que los demás clientes lo rendericen como robot en vez del avatar humano por defecto.

#### Scenario: Los demás lo ven como robot

- **WHEN** el bot entra al mundo
- **THEN** su conexión queda marcada con `skin: 'robot'` y los demás jugadores lo reciben así en la lista de conectados

#### Scenario: Un cliente que ignora el aspecto no se rompe

- **WHEN** un cliente que no entiende el campo `skin` convive con el bot
- **THEN** sigue funcionando con normalidad mostrando el avatar por defecto, sin errores

### Requirement: Presa restringida a no-admins vivos

El bot SHALL elegir como presa a cualquier jugador conectado cuyo `mode` no sea `admin` y que no esté muerto (`dead === 0`), y SHALL NOT atacar nunca a un jugador con `mode === 'admin'`, sin importar cuán cerca esté ni cuánto tiempo permanezca al lado.

#### Scenario: Persigue y fulmina a un no-admin

- **WHEN** un jugador con `mode === 'player'` y vivo está conectado
- **THEN** el bot lo persigue con el objetivo de matarlo

#### Scenario: Ignora por completo a un admin

- **WHEN** un jugador con `mode === 'admin'` está pegado al lado del bot
- **THEN** el bot no le dirige ningún golpe, ni siquiera si no hay otro objetivo disponible

#### Scenario: Ignora a un no-admin muerto

- **WHEN** el único no-admin conectado está muerto (`dead === 1`)
- **THEN** el bot no lo ataca y se comporta como si no tuviera presas

### Requirement: Golpe mortal en dos toques separados por la ventana del cliente

El bot SHALL matar a su presa dentro de alcance con `dmg: 6` y SHALL NOT emitir otro `hit` contra la MISMA víctima antes de que pasen al menos 0.65 s del golpe anterior, repitiendo hasta verla muerta (`dead`). Así respeta la ventana de invulnerabilidad de 0.6 s del cliente (`index.html:1565`) y, con 6 + 6 = 12 > 10, la vida pasa de 10 a 0 en ~0.65 s sin margen de reacción. Cada toque avanza `seq` una vez.

#### Scenario: Dos toques separados bajan la vida a cero

- **WHEN** el bot golpea a un no-admin vivo dentro de alcance
- **THEN** le envía un `hit` de `dmg: 6`, deja pasar al menos 0.65 s del golpe anterior antes del siguiente `hit` contra el mismo id, y la vida del objetivo pasa de 10 a 0

#### Scenario: No dispara dos golpes pegados

- **WHEN** el bot ya golpeó a su presa y todavía no pasó la ventana de invulnerabilidad del cliente
- **THEN** no emite un segundo `hit` contra esa misma víctima antes de los 0.65 s

#### Scenario: Un ataque visible por toque

- **WHEN** el bot ejecuta cada uno de los dos toques mortales
- **THEN** cada toque avanza su contador de gesto una vez, de forma que la víctima ve dos golpes rápidos y reales y no un burst en el mismo instante

### Requirement: Alcance de ataque acotado

El bot SHALL acercarse de verdad a su presa y SHALL NOT emitir un `hit` contra un objetivo que esté a más de 4.6 unidades horizontales, para que la víctima vea al robot al lado antes de morir.

#### Scenario: No golpea fuera de alcance

- **WHEN** el objetivo está a más de 4.6 unidades horizontales
- **THEN** el bot no emite ningún `hit` contra él y se limita a acercarse

#### Scenario: Golpea dentro de alcance

- **WHEN** el bot tiene a su presa a 4.6 unidades horizontales o menos
- **THEN** emite el golpe mortal contra ese objetivo

### Requirement: Velocidad doble que un jugador

El bot SHALL desplazarse a exactamente el doble de la velocidad de caminata de un jugador (200 %), para poder cerrar distancia rápido sin despegarse del suelo.

#### Scenario: Cierra distancia al doble de velocidad

- **WHEN** el bot persigue a una presa y su desplazamiento se mide en el tiempo
- **THEN** su rapidez es aproximadamente el doble de la de un jugador de referencia

### Requirement: Invulnerabilidad

El bot SHALL ser inmune a todo daño: SHALL ignorar cada `phit` que reciba, SHALL reportar siempre su vida completa y sin muerte (`hp:10, dead:0`), no SHALL sufrir daño de caída, y si su posición cae por debajo del mundo (`y < -10`) SHALL teletransportarse al punto de aparición.

#### Scenario: Un golpe recibido no lo mata ni lo hiere

- **WHEN** otro cliente le envía un `hit` al bot
- **THEN** el bot no muere ni baja su vida y sigue reportando `hp:10, dead:0`

#### Scenario: Caerse al vacío lo devuelve al spawn

- **WHEN** la posición del bot cae por debajo de `y = -10`
- **THEN** el bot reaparece en el punto de aparición con su vida completa

### Requirement: Keepalive de movimiento aun quieto

El bot SHALL enviar su estado de movimiento (`mv`) de forma periódica mientras esté conectado, incluso cuando está detenido, para no ser expirado por inactividad; "quedarse quieto" significa no cambiar de posición, no dejar de reportar.

#### Scenario: Quieto pero reportando

- **WHEN** el bot está detenido (por orden o por no tener presas)
- **THEN** sigue enviando `mv` repetidamente con la misma posición y no es desconectado por inactividad

### Requirement: Máquina de estados y precedencia

El bot SHALL operar en tres modos —CAZA (default: persigue y fulmina a la presa más cercana), ESPERA (posición congelada; mata a quien se le acerque) y SIGUEME (sigue a un admin puntual y fulmina a cualquier no-admin que entre en alcance)—; SHALL tratar `espera` y `sigueme` como órdenes explícitas que ganan sobre el default y que se reemplazan entre sí.

#### Scenario: Modo por defecto caza

- **WHEN** no hay ninguna orden vigente
- **THEN** el bot está en modo CAZA y persigue a la presa no-admin más cercana

#### Scenario: Espera congela pero es turreta

- **WHEN** el bot está en modo ESPERA
- **THEN** mantiene su posición fija, no vuelve al spawn y mata a cualquier no-admin que se le acerque a alcance

#### Scenario: Sigueme prioriza al admin objetivo

- **WHEN** el bot está en modo SIGUEME hacia un admin
- **THEN** su posición converge a la de ese admin y, si un no-admin distinto entra en alcance, lo fulmina sin abandonar al admin

#### Scenario: El admin objetivo se va

- **WHEN** el admin objetivo de SIGUEME se desconecta
- **THEN** el bot vuelve al comportamiento por defecto (CAZA y, sin presas, al spawn)

#### Scenario: Espera y sigueme se reemplazan

- **WHEN** estando en ESPERA llega una orden de `sigueme` (o viceversa)
- **THEN** el bot pasa al modo recién ordenado y descarta el anterior

### Requirement: Sin presas vuelve al spawn y se queda quieto

El bot SHALL, cuando no tiene presas en línea, caminar hasta el punto de aparición y quedarse detenido allí, sin dejar de reportar `mv`.

#### Scenario: Sin presas se retira al spawn

- **WHEN** no hay ningún no-admin vivo conectado
- **THEN** el bot se desplaza al punto de aparición y permanece quieto allí, manteniendo el keepalive `mv`

### Requirement: Comandos de chat solo-admin con autoridad por id del server

El bot SHALL reconocer exactamente los comandos `sigueme` (y su variante `seguime`) y `espera`, comparando el mensaje completo tras recortar espacios y sin distinguir mayúsculas, y SHALL ejecutarlos solo si el id de quien escribe —el asignado por el server en el frame de chat— corresponde a una conexión que el server identificó con `mode === 'admin'`; SHALL NOT autorizar por nombre, porque el nombre lo elige el cliente y es suplantable.

#### Scenario: El admin ordena seguir

- **WHEN** una conexión admin escribe exactamente `sigueme` (o `seguime`) por el chat
- **THEN** el bot pasa a seguir a ese admin

#### Scenario: El admin ordena esperar

- **WHEN** una conexión admin escribe exactamente `espera` por el chat
- **THEN** el bot queda clavado donde está y pasa a matar a quien se le acerque

#### Scenario: Un impostor con el nombre del admin es ignorado

- **WHEN** una conexión no-admin que usa el mismo nombre que un admin escribe `sigueme` o `espera`
- **THEN** el bot ignora el comando por completo y conserva su modo

#### Scenario: No se dispara dentro de una frase

- **WHEN** un mensaje de chat contiene el comando como parte de una frase en vez de ser exactamente el comando
- **THEN** el bot no cambia de modo

### Requirement: Anuncio de cambios de modo y de muertes

El bot SHALL anunciar por el chat sus cambios de modo cuando ejecuta una orden de admin, y SHALL anunciar cada muerte que provoca, de modo que el operador tenga feedback de su comportamiento.

#### Scenario: Anuncia el cambio de modo

- **WHEN** el bot ejecuta una orden de `sigueme` o `espera` de un admin
- **THEN** publica por el chat un mensaje indicando el nuevo modo

#### Scenario: Anuncia una muerte

- **WHEN** el bot mata a un no-admin
- **THEN** publica por el chat un mensaje de la muerte

### Requirement: El bot nunca modifica el mundo

El bot SHALL NOT enviar mensajes `edit` en ningún momento: se une al mundo como huésped de solo lectura y respeta las construcciones existentes.

#### Scenario: Cero ediciones durante toda la sesión

- **WHEN** el bot persigue, golpea, está detenido o se reconecta
- **THEN** no envía ningún mensaje `edit`

### Requirement: Reconexión con backoff y ejecución como servicio

El bot SHALL reconectarse automáticamente tras perder la conexión con el server, con una espera creciente (backoff) que evite martillar el server, y SHALL repetir el `hello` al reconectar para reincorporarse al mundo. SHALL poder ejecutarse como servicio de larga duración 24/7.

#### Scenario: Sobrevive a un cierre iniciado por el server

- **WHEN** el server cierra la conexión del bot (por ejemplo durante un redeploy)
- **THEN** el bot espera con backoff, se reconecta y vuelve a mandar `hello`, reincorporándose al mundo

#### Scenario: No martilla el server

- **WHEN** el bot no puede conectarse
- **THEN** reintenta con una espera creciente en lugar de reconectar en un bucle inmediato

### Requirement: Hora de Argentina en el log de golpe del bot

El bot SHALL prefijar su log de consola de **cada golpe** con la hora local de Argentina en formato `[HH:MM]` (24 h, sin segundos) al **inicio de la línea de consola** —sin ningún tag ni texto delante—, correspondiente a la zona `America/Argentina/Buenos_Aires`, y SHALL conservar **intacto** el texto original del mensaje detrás del prefijo. El prefijo SHALL NOT depender de la zona horaria del proceso ni de la env var `TZ`.

#### Scenario: Golpe a una presa

- **WHEN** el bot ejecuta un ataque contra una presa dentro de alcance
- **THEN** el log de consola empieza con `[HH:MM] ` y a continuación el texto original `⚔️  golpe a <nombre> (d=<dist>, seq=<seq>)`, sin alterarlo

#### Scenario: El logger por defecto no antepone ningún tag

- **WHEN** el bot corre con su **logger por defecto** (sin `log` inyectado) y loguea un golpe
- **THEN** la línea de consola empieza con `[HH:MM] ` (el `[HH:MM]` es el primer carácter de la línea) y **no** lleva ningún tag —como `[bot]`— delante

#### Scenario: La hora es la de Argentina aunque el contenedor corra en otra zona

- **WHEN** el proceso del bot corre con el reloj del sistema en una zona distinta a la de Argentina (por ejemplo UTC) en un instante conocido
- **THEN** el prefijo `[HH:MM]` refleja la hora de Argentina de ese instante y no la de la zona del contenedor
