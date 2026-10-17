# Spec Delta

## Purpose

Define cómo el server decide si una conexión entra en modo admin: verifica la clave recibida contra un hash PBKDF2 autodescriptivo en vez de compararla con un valor en claro, de modo que el valor guardado en el host no sea una credencial usable.

## ADDED Requirements

### Requirement: Verificación de la clave admin contra un hash

El server SHALL verificar la clave admin derivando PBKDF2-SHA256 (salt aleatorio, iteraciones altas) sobre la clave recibida en el `hello` y comparando el resultado con el hash configurado, usando una comparación de tiempo constante. Una clave que no derive al mismo hash MUST denegar el modo admin.

#### Scenario: Clave correcta entra como admin

- **WHEN** un cliente manda `hello` con `mode: 'admin'` y la clave cuya derivación coincide con el hash configurado
- **THEN** el server lo acepta como admin (`admin: true`) y no marca `adminDenied`

#### Scenario: Clave incorrecta es denegada

- **WHEN** un cliente manda `hello` con `mode: 'admin'` y una clave distinta de la configurada
- **THEN** el server lo acepta como jugador (`admin: false`) y marca `adminDenied: true`

#### Scenario: La comparación no filtra por tiempo

- **WHEN** se compara un hash derivado con el configurado
- **THEN** la comparación se hace en tiempo constante, sin cortocircuitar por el primer byte distinto

### Requirement: Costo de verificación acotado y no bloqueante

El server SHALL derivar PBKDF2 de forma no bloqueante (asíncrona) y SHALL acotar globalmente cuántas derivaciones ejecuta mediante un token bucket (capacidad y recarga finitas) más una cota de derivaciones concurrentes. Cuando no hay token disponible o se supera la cota concurrente, MUST rechazar el intento sin derivar, con la misma respuesta que una clave incorrecta. El server SHALL exponer un contador de derivaciones observable por los tests.

#### Scenario: Un pedido que no es intento de admin no deriva el hash

- **WHEN** un cliente manda `hello` con `mode` distinto de `'admin'`, o con `mode: 'admin'` y clave vacía
- **THEN** el server no ejecuta la derivación PBKDF2 y el contador de derivaciones no aumenta

#### Scenario: Un flood de conexiones admin se acota por el limitador

- **WHEN** se abren muchas conexiones nuevas con `mode: 'admin'` y clave no vacía en rápida sucesión (más que la capacidad del bucket)
- **THEN** solo un número acotado de ellas ejecuta la derivación (el contador de derivaciones no supera la capacidad del bucket) y el resto se deniega como admin sin derivar

#### Scenario: Agotado el bucket se rechaza sin derivar

- **WHEN** el bucket no tiene tokens disponibles y llega un `hello` con `mode: 'admin'` y clave no vacía
- **THEN** el server lo deniega (`admin: false`, `adminDenied: true`) sin ejecutar PBKDF2, con la misma respuesta que una clave incorrecta

#### Scenario: Un admin legítimo no toca el limitador

- **WHEN** un admin legítimo manda pocos `hello` de admin espaciados dentro de la recarga
- **THEN** cada intento dispone de token, la verificación corre normal y la clave correcta entra como admin

#### Scenario: La derivación no bloquea el event loop

- **WHEN** una conexión admin dispara la derivación y otra conexión concurrente manda su `hello`
- **THEN** el server sigue atendiendo a la otra conexión mientras la derivación está en vuelo, porque la derivación es asíncrona

#### Scenario: El rechazo por rate-limit no inunda los logs

- **WHEN** el limitador rechaza intentos de admin de forma repetida
- **THEN** el server registra la denegación de forma acotada (rate-limited), sin emitir una línea de log por cada intento rechazado

#### Scenario: Un segundo hello de la misma conexión no recomputa

- **WHEN** una conexión ya identificada manda otro `hello` con `mode: 'admin'`
- **THEN** el server no vuelve a ejecutar la derivación ni re-crea la sesión del jugador (higiene: el cliente real nunca reenvía `hello` por el mismo socket)

### Requirement: El hash guardado no es una credencial usable

El valor almacenado en la configuración del host MUST NOT habilitar el modo admin cuando se envía como clave. Esto bloquea el pass-the-hash: el server hashea lo que recibe, por lo que el hash del hash no coincide con el hash guardado.

#### Scenario: Mandar el hash guardado no entra

- **WHEN** un cliente envía como clave exactamente el string de hash configurado (`pbkdf2_sha256$...`)
- **THEN** el server lo deniega como admin, porque la derivación de ese string no coincide con el hash guardado

#### Scenario: Dos hashes de la misma clave son distintos y ambos verifican

- **WHEN** se generan dos hashes de la misma clave (salt aleatorio)
- **THEN** los dos strings son distintos entre sí y la clave original verifica correctamente contra ambos

### Requirement: Formato autodescriptivo del hash

El hash configurado SHALL usar el formato autodescriptivo `pbkdf2_sha256$<iteraciones>$<saltB64>$<hashB64>`, y el server SHALL derivar el algoritmo, las iteraciones y el salt desde el propio string, sin parámetros adicionales de configuración.

#### Scenario: Se verifican hashes con parámetros distintos

- **WHEN** el hash configurado declara un número de iteraciones o un salt distintos de los usados en otro hash válido
- **THEN** el server verifica correctamente cada uno leyendo sus parámetros del propio string

#### Scenario: El string generado no contiene la clave en claro

- **WHEN** se serializa el hash de una clave
- **THEN** el string resultante no contiene la clave en claro en ninguna forma

### Requirement: Precedencia del hash sobre la clave en claro

Si `ADMIN_KEY_HASH` está configurado, el server SHALL usarlo en forma exclusiva y MUST ignorar cualquier `ADMIN_KEY` en claro también presente, advirtiendo al arrancar.

#### Scenario: Con ambos configurados gana el hash

- **WHEN** el server arranca con `ADMIN_KEY_HASH` y `ADMIN_KEY` en claro a la vez
- **THEN** solo la clave cuyo hash coincide entra como admin; la clave en claro es rechazada

#### Scenario: El arranque avisa que se ignora la clave en claro

- **WHEN** el server arranca con ambas variables configuradas
- **THEN** registra una advertencia de que `ADMIN_KEY` en claro se ignora por estar seteado `ADMIN_KEY_HASH`

### Requirement: Compatibilidad del camino de clave en claro

Cuando no hay hash configurado y sí una `ADMIN_KEY` en claro no vacía, el server SHALL aceptar esa clave para el modo admin (compatibilidad con desarrollo local y con los tests de protocolo) y SHALL advertir al arrancar que cualquiera con acceso al host puede leerla.

#### Scenario: La clave en claro configurada entra

- **WHEN** el server arranca solo con `ADMIN_KEY` en claro y un cliente manda esa clave exacta con `mode: 'admin'`
- **THEN** el server lo acepta como admin

#### Scenario: Otra clave es rechazada con el camino en claro

- **WHEN** el server arranca solo con `ADMIN_KEY` en claro y un cliente manda una clave distinta o vacía con `mode: 'admin'`
- **THEN** el server lo deniega (`admin: false`, `adminDenied: true`)

#### Scenario: El arranque avisa del riesgo del camino en claro

- **WHEN** el server arranca en modo `ADMIN_KEY` en claro
- **THEN** registra una advertencia de que la clave es legible por quien acceda al host y que se prefiera `ADMIN_KEY_HASH`

### Requirement: Fail closed sin configuración de admin

Si el server no tiene ni hash ni clave en claro (o la clave en claro es vacía), MUST deshabilitar el modo admin: ninguna conexión SHALL entrar como admin. El modo admin nunca queda abierto por falta de configuración.

#### Scenario: Sin ninguna configuración nadie entra como admin

- **WHEN** el server arranca sin `ADMIN_KEY_HASH` ni `ADMIN_KEY` y un cliente manda `hello` con `mode: 'admin'`
- **THEN** el server lo deniega como admin, con independencia de la clave enviada

#### Scenario: Clave en claro vacía deshabilita el admin

- **WHEN** el server arranca con `ADMIN_KEY` igual a cadena vacía y un cliente manda `hello` con `mode: 'admin'`
- **THEN** el server lo deniega como admin (regresión: una variable vacía ya no significa admin abierto)

#### Scenario: El arranque avisa que el admin está deshabilitado

- **WHEN** el server arranca sin configuración de admin
- **THEN** registra una advertencia de que el modo admin queda deshabilitado hasta configurar `ADMIN_KEY_HASH`

### Requirement: Sin clave admin por defecto

El server MUST NOT tener una clave admin por defecto ni publicar la clave en documentación. Sin configuración explícita, el modo admin queda deshabilitado.

#### Scenario: Arrancar sin variables no habilita ninguna clave conocida

- **WHEN** el server arranca sin `ADMIN_KEY` ni `ADMIN_KEY_HASH`
- **THEN** no existe ninguna clave (ni la antes publicada en el README) que permita entrar como admin

#### Scenario: La documentación no expone una clave utilizable

- **WHEN** se revisa el README y los ejemplos de entorno del repo
- **THEN** no contienen una clave admin en claro usable en producción; el camino de producción es `ADMIN_KEY_HASH`

### Requirement: Validación defensiva del hash configurado

Un hash malformado, truncado, con salt corrupto o con un número de iteraciones no válido MUST tratarse como una verificación fallida, sin detener el server ni aceptar claves.

#### Scenario: Hash malformado no crashea y deniega

- **WHEN** el server arranca con un `ADMIN_KEY_HASH` que no parsea y un cliente manda `mode: 'admin'` con cualquier clave
- **THEN** la verificación falla, el server sigue en pie y la conexión queda como no admin

#### Scenario: Hash truncado o con salt corrupto deniega

- **WHEN** el hash configurado está truncado o su salt está corrupto
- **THEN** ninguna clave verifica correctamente y el server no lanza una excepción no capturada

### Requirement: La clave nunca se registra en logs

El server MUST NOT registrar en logs la clave recibida en el `hello` ni el valor de la configuración de admin, y la herramienta generadora MUST NOT imprimir la clave en claro.

#### Scenario: Una conexión admin no deja la clave en los logs

- **WHEN** un cliente entra como admin y el server registra el evento de conexión
- **THEN** la salida del server no contiene la clave enviada por el cliente

#### Scenario: El generador no filtra la clave

- **WHEN** se ejecuta la herramienta generadora con una clave
- **THEN** su salida contiene el string de configuración del hash pero no la clave en claro

### Requirement: Herramienta generadora del hash de admin

El proyecto SHALL proveer una herramienta local que, dada una clave, emita un string `ADMIN_KEY_HASH=<hash autodescriptivo>` listo para pegar en la configuración del entorno, sin dependencias nuevas y sin ejecutarse en el runtime del server.

#### Scenario: Genera un string parseable y verificable

- **WHEN** la herramienta recibe una clave
- **THEN** emite un string `ADMIN_KEY_HASH=pbkdf2_sha256$...` que, usado como configuración, verifica esa clave exacta y rechaza cualquier otra

#### Scenario: El formato emitido es round-trip

- **WHEN** se serializa el hash con la herramienta y el server lo parsea desde la configuración
- **THEN** el round-trip preserva algoritmo, iteraciones, salt y hash, y la clave original verifica
