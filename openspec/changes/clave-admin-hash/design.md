# Design

## Context

Ver `proposal.md` (Why) y el delta spec `security/admin-auth` (qué comportamiento observable se exige). Estado actual **verificado** leyendo el código, que condiciona el diseño:

- **La clave admin hoy es un valor en claro en el entorno del proceso**:
  - `server/server.js:11`: `const ADMIN_KEY = process.env.ADMIN_KEY || 'minicraft-admin-2026';` — **con default público**.
  - `server/server.js:206`: `const admin = wantAdmin && (ADMIN_KEY === '' || m.key === ADMIN_KEY);` — **si la env está vacía, el admin queda ABIERTO** para cualquiera que elija `mode: 'admin'`.
  - `docker-compose.yml:9`: `ADMIN_KEY: ${ADMIN_KEY:-minicraft-admin-2026}` — **default público repetido**.
  - `README.md:50` y `README.md:124` **publican** `minicraft-admin-2026` como “clave admin por defecto”.
  - Con root en el host, el valor es legible sin esfuerzo: `docker inspect`, `/proc/<pid>/environ`, y el panel de entornos de Easypanel.
- **El deploy no toca el runtime**: `.github/workflows/deploy.yml` hace `Checkout → Node 20 → npm ci → npm test → curl -X POST <webhook de Easypanel>` (L23-75). El build y el runtime corren en **Easypanel, en la VPS**, leyendo **su propia config de entorno** (README L67-76: “En **Environment**, agregá `ADMIN_KEY`”). **GitHub Actions nunca ejecuta el server ni pasa valores de runtime al proceso.** ⇒ Un GitHub Secret no puede cambiar lo que lee el proceso.
- **El transporte en producción ya es seguro**: `index.html:2552` hace `const wsp = location.protocol==='https:' ? 'wss' : 'ws';` y el usuario entra por dominio HTTPS. O sea: el `hello` con la clave viaja cifrado en tránsito en producción; el problema es **en reposo** (el valor guardado en el host), no en tránsito.
- **El cliente manda la clave en claro en el `hello`**: `index.html:2557-2558` envía `{ t:'hello', name, mode:wantedMode, key: document.getElementById('keyInput').value }`, y `index.html:264` limita el input a `maxlength="32"`. No hay hashing del lado cliente.
- **El server no loguea la clave** (control existente, verificado sobre los 8 `console.log` de `server/*.js`): `server.js:225` registra `name` y `mode`, `server.js:277` registra `Configurada`/`vacia` como booleano textual, **nunca** el valor de `m.key` ni de `ADMIN_KEY`. Es un control que el diseño debe **preservar**.
- **Restricciones DURAS de los tests pre-existentes (no se tocan)**:
  1. **`server/test/protocol.mjs` (INTOCABLE)** levanta el server con `ADMIN_KEY: 'test-key'` (**L26**) y exige el **path en claro**: `hello('Evil','admin','')` → `admin===false && adminDenied===true` (**L83-84**) y `hello('Jefe','admin','test-key')` → `admin===true` (**L86-87**). ⇒ **NO se puede eliminar `ADMIN_KEY` en claro**; se **agrega** `ADMIN_KEY_HASH` como camino preferido. Esto es un **requisito de diseño**, no un detalle.
  2. **`server/test/static.mjs` (INTOCABLE)** asierta sobre `server/server.js`: `/pos: \[128\.5, 20, 136\.5\]/` (**L146**) — ese literal está **dentro del handler `hello` que vamos a modificar** ⇒ tiene que quedar **byte-idéntico**. También asierta las constantes del ciclo (`static.mjs` §8), `tod: phaseNow(), cyc: CYCLE_MS`, `save()` sin reloj, etc.: no se tocan.
  3. **El módulo nuevo tiene que ser `server/<algo>.js` (NO `.mjs`)**: `Dockerfile:11` copia `server/*.js` → un `.mjs` **no entra al container** y el `require` crashea con `Cannot find module` (es exactamente el bug de producción que ya pasó con `zombie.js`). Los **tests** sí van en `server/test/*.mjs`.
- **El script `test` de `server/package.json` enumera los archivos a mano (hoy 12)** y `server/test/zombie-protocol.mjs:287-289` tiene un assert que exige que el script liste **12** archivos concretos; sumar cobertura nueva requiere editar **ambos** (ese test **no** es uno de los 6 pre-existentes; es nuestro).
- **Los puertos de los tests e2e están hardcodeados** (`protocol.mjs` 3210/3211, `zombie-protocol.mjs` 3220/3221): es una **deuda conocida** del repo. Este change **no** la arregla, pero el test nuevo **no** la repite (ver §12).
- **No existe ninguna capability de auth/admin** entre las 19 (`blocks/*`, `creatures/*`, `net/*`, `player/*`, `social/greet`, `ui/*`, `world/*`). `net/presence` es heartbeat/idle; `net/avatar` es cómo se ven los jugadores remotos.

## Goals / Non-Goals

**Goals:**

- Que **leer la config del host no entregue una credencial usable**: el valor guardado en el env es un **hash**, y **enviar ese hash como clave no entra** (anti pass-the-hash).
- Que la clave real quede **solo en la cabeza/gestor de contraseñas** del usuario, sin cambiar el flujo del cliente ni el transporte (`wss://` ya está).
- **Fail closed** ante configuración ausente o inválida: **nunca** admin abierto.
- **Cerrar los dos agujeros existentes** (default público + `ADMIN_KEY===''` = admin abierto) y **sacar la clave pública de la doc**.
- Mantener el **camino en claro** como compatibilidad explícita (dev local + `protocol.mjs`), con **warning** de riesgo.
- Que todo el path crítico sea **testeable por comportamiento** con TDD y **sin tocar los 6 tests pre-existentes**.
- **Ser honesto sobre el alcance**: declarar qué **no** protege el fix (root malicioso, sniffer de la red interna de Docker).

**Non-Goals:**

- **No** se implementa un GitHub Secret (no resuelve el problema con este deploy: §1).
- **No** se implementa firma asimétrica **ECDSA** (candidato a change propio: §Riesgos).
- **No** se cambia el cliente (`index.html`), ni el protocolo (`hello` con los mismos campos), ni el transporte.
- **No** se agrega **rate limiting general** (solo un limitador **específico del KDF de admin**: token bucket + cota de concurrencia, §10), ni 2FA, sesiones, ni gestión de usuarios.
- **No** se resuelve el problema de **root en el host** (fuera del alcance de una app: §Riesgos).
- **Sí** se usa `crypto.pbkdf2` **async** (§10) para no bloquear el event loop; **no** se agrega un pool propio de `worker_threads` (el threadpool de libuv alcanza).
- **No** se toca el `Dockerfile`, el deploy webhook, `world.json`, `worldgen`, `net/avatar` ni `server/zombie.js`.
- **No** se arregla la deuda de puertos hardcodeados de los tests existentes (§12).

## Decisions

### 1. Por qué un GitHub Secret no resuelve esto (premisa corregida)

El usuario pidió literalmente *"me gustaría que fuera un secreto de GitHub si es posible"*. **Con el deploy actual no es posible**, y el motivo es verificable, no opinable:

- `deploy.yml` solo **dispara** un webhook de Easypanel (L66-75: `curl -fsSL -X POST "$URL"`). No compila, no empaqueta, no ejecuta el server.
- **Easypanel** clona/imageniza y **corre** el container en la VPS leyendo **su propia config de entorno** (README L70-71). Ese es el valor que hoy llega a `process.env.ADMIN_KEY`.
- Un secret de GitHub vive en los runners de Actions; **nunca** llega al proceso del server salvo que el workflow lo inyecte — y aun inyectándolo, **tendría que quedar en la config de Easypanel o en el env del container**, o sea, **igual de legible en la VPS**.

⇒ **Mover el deploy a Actions (build → `ghcr.io` → SSH) tampoco sirve**: el runtime seguiría necesitando el valor en el host. Por eso **no** se implementa un secret; se implementa una estrategia que hace que el valor del host **no sea la credencial**. Se documenta el hallazgo para que quede claro **por qué** se elige otro camino (y para que nadie reabrá el cambio pidiendo el secret como si fuera una tarea pendiente).

**Alternativa considerada:** inyectar el secret en el deploy y pasarlo al container. **Descartada**: no cambia el hecho de que el valor queda legible en la VPS (que es exactamente lo que el usuario quiere evitar); solo agrega una pieza de infra.

### 2. Capability nueva `security/admin-auth`

El comportamiento es el **contrato de autenticación del modo admin** (quién entra como admin y quién se deniega, y bajo qué configuración). Se crea `security/admin-auth`.

**Por qué no una existente:** ninguna de las 19 describe autenticación. `net/presence` (heartbeat/idle, cero fantasmas) y `net/avatar` (render de jugadores remotos) son lo más cercano en el dominio de red, pero **no cubren credenciales ni autorización**. Crear `security/admin-auth` sigue la organización del proyecto (dominio/capability, como `player/*` o `blocks/*`) y deja un lugar durable para auth (si mañana se suma ECDSA o un rol distinto, ese contrato vive ahí).
**Alternativa descartada:** `server/admin-auth` — nombra el **artefacto** (el server) en vez del **comportamiento** (seguridad del admin), y quedaría desalineado si el concepto se extiende. **Alternativa descartada:** meterlo en `net/presence` — mezcla “conexiones vivas” con “autorización”, dos concerns distintos.

### 3. Estrategia: `ADMIN_KEY_HASH` con PBKDF2-SHA256, salt aleatorio y formato autodescriptivo

El server guarda **un hash**, no la clave. Para verificar, **deriva** el hash de lo que recibe y lo compara con el guardado:

- **Algoritmo:** PBKDF2-HMAC-SHA256 (KDF **lento** y con **salt**), con `node:crypto` ⇒ **cero dependencias nuevas** (`crypto.pbkdf2` **asíncrono**, §10).
- **Salt aleatorio** de 16 bytes (`crypto.randomBytes(16)`).
- **Iteraciones altas:** `210000` por defecto (orden de magnitud de Django >70000, ~10⁵ ⇒ costo offline de ~10⁵ hashes por intento por clave).
- **Formato autodescriptivo** (mismo espíritu que Django), en un único string de env:

  ```
  ADMIN_KEY_HASH=pbkdf2_sha256$210000$<saltB64>$<hashB64>
                    ^algoritmo  ^iter  ^salt      ^derivado (32 bytes)
  ```

  El server **parsea el algoritmo, las iteraciones y el salt del propio string**, así que rotar/ajustar el costo es cambiar una sola variable, sin reconfigurar nada más.

**Por qué PBKDF2 y no un SHA-256 simple:** un SHA-256 sin salt de una clave de 32 chars es **fuerza bruta offline baratísima** (decenas de miles de millones/s en GPU). PBKDF2 con salt + 210k iteraciones encarece cada intento ~10⁵ veces y mata las tablas precomputadas. **Por qué PBKDF2 y no bcrypt/argon2:** PBKDF2 está **en `node:crypto`** (sin deps ni binarios nativos, `Dockerfile` es `alpine`), es el recomendado por NIST y suficiente para una clave de alta entropía; bcrypt/argon2 agregarían una dependencia y complejidad para un solo login. **Por qué formato autodescriptivo:** permite cambiar iteraciones/salt sin acoplar el server a un valor fijo y hace el string **autoexplicativo** en la config del panel.

### 4. Comparación de tiempo constante y por qué esto bloquea el pass-the-hash

- La comparación se hace con **`crypto.timingSafeEqual`**, **nunca** `===`. Ambos lados son la **salida de PBKDF2** (32 bytes) ⇒ longitudes iguales garantizadas; igualmente el módulo **valida longitudes** y devuelve `false` si no coinciden (defensa ante un stored hash corrupto, porque `timingSafeEqual` **lanza** si los largos difieren).
- **La clave del diseño (anti pass-the-hash):** el server **hashea lo que recibe** (`verifyAdminKey(clave) = PBDKF2(clave, salt) === stored`). Si un atacante con root lee `ADMIN_KEY_HASH` y lo **manda como clave**, el server calcula `PBKDF2(hash_guardado, salt)`, que **no** es igual al `hash_guardado` ⇒ **denegado**. El hash guardado **no es** una credencial usable.
- Tampoco sirve para **crackear offline**: salt aleatorio + 210k iteraciones ⇒ el costo de recuperar la clave es alto (y la clave real es larga, hasta 32 chars en el input).
- **Trade-off declarado:** `timingSafeEqual` protege contra **timing leaks sobre la comparación**, no contra un host comprometido (que lee todo). Es una capa correcta, no una garantía total.

### 5. Dónde vive el código: `server/admin-auth.js` + `server/hash-key.mjs`

- **`server/admin-auth.js`** (nuevo): módulo **puro**, **sin WebSocket ni estado global**, con `makeHash(clave)` (síncrona: la usa el generador y los tests) y una verificación **asíncrona** `verifyAdminKey(clave, {hash, claro, limiter})` que devuelve una `Promise<boolean>` (usa `crypto.pbkdf2` promisificado, **no** `pbkdf2Sync`, §10) + el parseo/serialización del formato + el **limitador** exportado (`createTokenBucket({capacity, refillPerSec, now})`) y un **contador de derivaciones** observable por los tests. Extensión **`.js` obligatoria** (§Context, restricción 3: `Dockerfile:11` copia `server/*.js`).
- **`server/hash-key.mjs`** (nuevo, herramienta **local**, no runtime): CLI que envuelve `makeHash`, pide la clave por **stdin** (sin eco si se puede) o la toma de `argv`/env, e imprime **el string `ADMIN_KEY_HASH=...` listo para pegar**. **Nunca** imprime la clave. Importa la función pura del `.js` para poder testearla sin CLI. Como es `.mjs`, **no entra al container** (correcto: el server no la necesita).
- **`server/test/admin-hash.mjs`** (nuevo): tests del módulo + e2e WS.
- **Puente ESM→CJS (gotcha a cuidar en la implementación):** `server.js` es CommonJS (`require`) y `admin-auth.js` también debe serlo (lo consume `server.js`). `hash-key.mjs` y el test son **ESM** ⇒ importan el módulo `.js` vía **default import** (`import pkg from '../admin-auth.js'`) o `createRequire`, para no depender de la detección de named exports de CJS (que funciona con `module.exports = { … }` pero es un detalle innecesario de arriesgar). Es el tipo de sutileza que causó el incidente de `zombie.js`; se deja explícita.
- **Alternativa descartada:** poner la lógica inline en `server/server.js` — intestable por unidad y mezclaría parseo con el handler. **Alternativa descartada:** dependencia npm de KDF — agrega superficie y un binario/paquete al `npm ci` de Alpine sin necesidad.

### 6. Precedencia hash-vs-claro (regla explícita, centralizada en el módulo)

La precedencia vive en **un solo lugar** (la resolución de configuración del módulo), para que el handler `hello` no tome decisiones:

| `ADMIN_KEY_HASH` | `ADMIN_KEY` (no vacía) | Comportamiento | Aviso al arrancar |
|---|---|---|---|
| seteado (no vacío) | cualquiera | **Solo hash**. La clave en claro se **ignora** | ⚠️ “se ignora `ADMIN_KEY` en claro por estar seteado `ADMIN_KEY_HASH`; **borrá `ADMIN_KEY`** (sigue legible en el host)” |
| ausente/vacío | sí | **Camino en claro** (acepta esa clave en `hello`) | ⚠️ “la clave en claro es legible por quien acceda al host; usá `ADMIN_KEY_HASH`” |
| ausente/vacío | ausente/vacía | **Admin DESHABILITADO (fail closed)** | ⚠️ “modo admin deshabilitado; configurá `ADMIN_KEY_HASH`” |

- “Vacío” se trata como **ausente** en ambos casos (`ADMIN_KEY_HASH=''` ⇒ como si no estuviera; `ADMIN_KEY=''` ⇒ como si no estuviera).
- El **hash gana siempre**: si están las dos, la en-claro **no** habilita el admin (aunque coincida). Esto se asierta explícitamente en los tests.
- **Por qué esta precedencia:** el hash es el camino seguro; si está configurado, usarlo **solo** elimina el riesgo de degradar silenciosamente al camino en claro. **Alternativa descartada:** aceptar cualquiera de los dos como OR — permitiría que una `ADMIN_KEY` en claro “vieja” siga abriendo el admin aunque el usuario ya migró al hash (contradice el objetivo).

### 7. Fail-closed: `'no configurado'` == admin deshabilitado (nunca abierto)

Hoy `ADMIN_KEY === ''` ⇒ **`admin: true` para cualquiera** (`server.js:206`). Con el diseño nuevo:

- **Sin hash y sin clave en claro (o vacía)** ⇒ `verifyAdminKey` **siempre** devuelve `false` ⇒ admin **deshabilitado**. El `welcome` responde `admin: false, adminDenied: true` para quien pida `mode: 'admin'`.
- **Esto es un cambio de comportamiento deliberado y observable** (BREAKING operativo): antes “env vacía” era admin abierto; ahora es admin cerrado. Lo exige la seguridad y lo cubre un test de regresión.
- **Por qué fail-closed:** en auth, el default seguro es **denegar**. Un despliegue sin env (o con la env borrada) **no debe** abrir el panel de admin a cualquier jugador que marque la casilla.

### 8. Cierre de los dos agujeros existentes (defensa en profundidad)

Aunque el usuario dice que hoy tiene la variable bien seteada, los dos son **minas** que el diseño nuevo no debe dejar atrás:

- **`server/server.js:11` — sacar el default `'minicraft-admin-2026'`:** es una clave **pública** (README L50/L124). Si la env se pierde/recrea en un deploy, hoy el server cae en esa clave **conocida por cualquiera**. Nuevo: sin default ⇒ sin configuración el admin queda cerrado (§7).
- **`server/server.js:206` — `ADMIN_KEY === ''` deja de significar “abierto”:** el camino en claro solo se acepta si la clave es **no vacía** y coincide; vacío = deshabilitado (§7).
- **`docker-compose.yml:9` — sacar `${ADMIN_KEY:-minicraft-admin-2026}`:** mismo motivo (default público en la config local/Docker). Se deja la variable sin default (y se documenta `ADMIN_KEY_HASH`).
- **README — borrar la clave pública (L50, L124)** y documentar `ADMIN_KEY_HASH` como el camino de producción + el script generador; marcar `ADMIN_KEY` en claro como **solo dev local**.
- **Por qué “defensa en profundidad” y no “ya está cubierto por el hash”:** el hash no sirve de nada si el deploy sin env cae en una clave pública que el atacante ya conoce. Son agujeros **independientes** del objetivo principal y hay que cerrarlos en el mismo change (son una línea cada uno).

### 9. Comportamiento del boot: warnings (observables en los logs)

Al arrancar, el server **evalúa la configuración una vez** y emite un warning según el caso (§6), **sin** loguear nunca la clave ni el hash completos:

- Hash presente ⇒ `🔐 Clave admin: verificada por hash (PBKDF2-SHA256)`; si además hay `ADMIN_KEY`, se agrega un warning que **dice explícitamente que hay que borrarla**: p. ej. `⚠️ ADMIN_KEY en claro IGNORADA por precedencia del hash — borrá ADMIN_KEY: la clave en claro sigue estando en el host y es legible`. El hash gana, pero la clave en claro **sigue presente y legible** en el host hasta que se borre; el mensaje debe empujar el paso operativo (no alcanza con “se ignora”).
- Solo en claro ⇒ `⚠️ Clave admin en claro: legible por quien acceda al host. Usá ADMIN_KEY_HASH.`
- Nada ⇒ `⚠️ Modo admin DESHABILITADO: configurá ADMIN_KEY_HASH.`
- El log de conexión existente (`server.js:225`) y el de boot (`server.js:277`) **se mantienen sin el valor** (control existente, §Context). Se reemplaza `Configurada/vacia` por un estado del camino elegido, **sin** exponer el secreto.

**Por qué warnings y no un crash:** el usuario quiere que el server **siga sirviendo el juego** aunque el admin quede cerrado (fail-closed ≠ no arrancar). Un crash por una env ausente sería peor operativamente (el sitio entero cae). El warning deja el diagnóstico en los logs.

### 10. Costo del KDF: asíncrono y limitado por un token bucket global

**El vector real es el flood de conexiones nuevas, no los `hello` repetidos.** Verificado en el cliente: `index.html:2548-2574` (`connectMP`) crea un **`WebSocket` nuevo** en cada intento y manda `hello` **una sola vez** en `onopen` (`index.html:2556-2558`); una reconexión abre un socket nuevo. ⇒ Un **segundo `hello` en el mismo socket nunca ocurre** con el cliente vanilla: ignorarlo es **higiene** (barato y correcto — re-crear la sesión con `nextId++` no lo usa nadie), **no** la mitigación del DoS. El vector que importa es **abrir N sockets nuevos** con `mode:'admin'` y clave no vacía: cada uno dispara un PBKDF2 de ~210000 iteraciones (~decenas de ms de CPU). Con `pbkdf2Sync` esos ms **bloquean el event loop** (que además corre el tick de 20 Hz y los snapshots de zombis) ⇒ **~20 conexiones/segundo saturan el proceso**. Esto es una **regresión de disponibilidad que introduce este change**: hoy la comparación es `m.key === ADMIN_KEY` (instantánea); un `hello` JSON barato no puede costar ~40 ms de CPU (amplificación ~10⁵).

**Mitigación elegida (tres capas + lo barato que ya estaba):**

1. **Derivación no bloqueante:** `crypto.pbkdf2` **asíncrono** (promisificado) en vez de `pbkdf2Sync` ⇒ el KDF corre en el **threadpool de libuv** y **no bloquea el event loop**. El handler `hello` pasa a ser **asíncrono** (el `welcome` se manda al terminar la verificación). El cliente espera con un **timeout de 3500 ms** (`index.html:2555`), así que unos ms extra son inocuos.
2. **Token bucket global ANTES de derivar:** capacidad **3**, recarga **0.5 tokens/s**. Si no hay token, se **rechaza barato sin KDF** ⇒ `admin: false` + `adminDenied: true` + un `console.warn` **rate-limited** (no inunda). Un admin real entra unas pocas veces por minuto ⇒ **nunca lo toca**; un flood se corta con costo **O(1)**.
3. **Cota de derivaciones en vuelo:** máximo **2 concurrentes**. Si ya hay 2 en curso, se rechaza barato. Evita saturar el threadpool de libuv (4 hilos por defecto, que además atienden el resto del I/O: `fs`, `dns`, etc.).
4. **Lo barato que ya estaba, se mantiene:** derivar **solo** si `mode === 'admin'` **y** la clave no está vacía (un `hello` de jugador, o un admin sin clave, no toca PBKDF2); y **una** derivación por conexión.
5. **Ignorar un `hello` repetido en el mismo socket:** se mantiene como **higiene** (re-crear la sesión con `nextId++` no lo usa nadie), **no** como la mitigación del DoS — el requirement/scenario principal son el **token bucket + la no-bloqueabilidad**.

**Números elegidos — justificación:**

- **Capacidad 3:** cubre un arranque legítimo (una persona que reintenta 2-3 veces por tipear mal la clave) sin dejar pasar un flood.
- **Recarga 0.5/s:** ~30 intentos/min en régimen; generoso para un humano, magro para un atacante (a 0.5/s el costo de CPU del KDF es ~0.5 × decenas de ms/s ≈ ~1-2% de un core — despreciable comparado con las ~20 conexiones/s que hoy saturarían el proceso).
- **Concurrencia 2:** deja el threadpool de libuv libre para el resto del I/O (4 hilos por defecto); con 2 en vuelo, el peor caso de CPU es acotado y **fuera** del event loop.

**Trade-off declarado — ¿el rechazo por rate-limit es distinguible de una clave incorrecta?** **Sí, es indistinguible a propósito:** agotado el bucket o superada la cota concurrente, la respuesta es la **misma** (`admin: false` + `adminDenied: true`) que para una clave incorrecta y **no** se emite ningún mensaje distinto al cliente. Así **no se filtra información**: un atacante no puede usar la forma del rechazo como **oráculo** para saber si el limitador está activo ni para distinguir “sin token” de “clave mal”. La única diferencia es **server-side** (log rate-limited), que el cliente no ve.

**Limitación declarada (bucket global):** el bucket es **global** (no por IP), así que un flood sostenido puede dejar **sin token al admin legítimo** ⇒ degrada el **login de admin** durante el flood, pero **no** tumba el juego (el event loop queda libre y los jugadores no se ven afectados). Es un DoS **acotado a una función** (login de admin), no del servidor: el trade-off correcto frente a la regresión de disponibilidad total.

**Compatibilidad con `protocol.mjs` (intocable):** ese test hace **2 `hello` admin** (`protocol.mjs:83-87`): uno **sin clave** (`''` ⇒ se rechaza barato, **no consume token**) y uno con `'test-key'` (⇒ **1 derivación**, 1 token). Con capacidad **3** entran sobradamente y **el limitador no lo rompe** (verificado como requisito de diseño).

**Alternativa descartada:** `pbkdf2Sync` + ignorar el segundo `hello` (lo que decía la v1 de este diseño) — **no cubre el vector real**, porque el cliente nunca manda un segundo `hello`. **Alternativa descartada:** bajar las iteraciones — debilita el KDF, que es el punto del change. **Alternativa descartada:** rate-limit por IP — más estado y superficie (proxies/NAT, spoofing); un bucket global cierra el caso concreto con O(1) y sin infra nueva (limitación del bucket global declarada arriba).

### 11. El cliente NO cambia (y por qué alcanza)

- El cliente **sigue mandando la clave en claro** en `hello.key` (`index.html:2557-2558`), limitada a 32 chars (`index.html:264`). **No se toca `index.html`.**
- **Por qué alcanza:** en producción el transporte ya es **`wss://`** (`index.html:2552` elige el esquema por `location.protocol`, y el usuario entra por dominio HTTPS) ⇒ la clave viaja cifrada. El problema que este change resuelve es **en reposo** (el valor guardado en el host), no en tránsito.
- **Consecuencia:** `adminDenied` sigue funcionando igual (`index.html:2752` muestra el toast), y el flujo de “entrar como jugador” no cambia. **Cero riesgo de compatibilidad de cliente**; el único cambio es qué acepta el server.

### 12. Estrategia de test: `server/test/admin-hash.mjs` (TDD) + e2e con puerto libre real

**Test unitario del módulo** (importa `../admin-auth.js` y asierte comportamiento real, no texto):

| caso | esperado |
|---|---|
| `makeHash('clave')` → `verifyAdminKey('clave', {hash})` | `true` |
| `verifyAdminKey('otra', {hash})` | `false` |
| **`verifyAdminKey(hashGenerado, {hash: hashGenerado})`** | **`false`** ← **anti pass-the-hash** |
| hash malformado / truncado / salt corrupto / iteraciones basura | `false` **sin crashear / sin lanzar** |
| sin config (`{}`) | `false` (fail closed) |
| `{claro: ''}` | `false` (regresión: vacío ≠ abierto) |
| `{claro: 'test-key'}` con `'test-key'` | `true` (compat `protocol.mjs`) |
| el string emitido no contiene la clave en claro | `true` |
| dos `makeHash` de la misma clave | strings **distintos** y **ambos verifican** (salt aleatorio) |
| round-trip serializar → parsear → verificar | `true` y preserva algoritmo/iteraciones/salt |
| hash + claro a la vez | gana **solo** el hash (la clave en claro no entra) |
| precedencia en el módulo (hash vacío + claro) | usa el claro |
| `createTokenBucket({capacity:3, refillPerSec:0.5, now})` con `now` inyectado | los primeros 3 `take()` → `true`, el 4º → `false`; tras avanzar `now` 2 s hay 1 token; con `refillPerSec:0` el 4º sigue `false` |
| contador de derivaciones del módulo | aumenta **exactamente 1** por verificación que efectivamente deriva; **no** aumenta si el limitador rechaza o si `mode` no es admin / la clave es vacía |
| verificación asíncrona | `verifyAdminKey(...)` devuelve una `Promise` y **no** usa `pbkdf2Sync` (contrato de no-bloqueo) |

> Los asserts del limitador usan un **`now` inyectado** (reloj falso) ⇒ son **deterministas** y **no miden tiempos reales** (nada de flakiness por velocidad de la máquina). El acotamiento en el server se verifica por el **contador de derivaciones** y por el número de `admin: true` aceptados (con la clave correcta), no por relojes.

**e2e WS corto (ejercita el camino de producción):** levanta `server.js` con `ADMIN_KEY_HASH` (generado en el test) y asierta:

- `hello('admin', claveCorrecta)` → `admin: true`
- `hello('admin', hashGuardado)` → `admin: false` (**pass-the-hash por el WS real**)
- `hello('admin', 'mal')` → `admin: false && adminDenied: true`
- y un server sin config → `hello('admin', '')` → `denegado` (regresión del agujero “vacío = admin abierto”).

**e2e del limitador (flood, determinista):** levanta `server.js` con `ADMIN_RATE_REFILL_PER_SEC=0` y `ADMIN_RATE_CAPACITY=3` (parámetros del limitador overridables por env **para los tests**), manda **N (p. ej. 8) `hello` admin con la clave correcta en rápida sucesión** y asierta que **a lo sumo 3** entran (`admin: true`) y el resto se deniega (`adminDenied: true`) **sin derivar** (evidencia del bucket). Con recarga 0 el resultado es **exacto** (3 aceptados, 5 rechazados) sin medir tiempos. Además: un `hello` de jugador concurrente se responde **mientras** una derivación admin está en vuelo (no-bloqueo del event loop) y un admin legítimo espaciado no toca el limitador.

**Cómo se evita el flake de puertos (deuda conocida del repo):** en vez de hardcodear un puerto (los tests existentes usan 3210/3211/3220/3221 y ya son un riesgo de choque), el test **pide un puerto libre de verdad**: crea un `net.createServer()`, hace `listen(0)`, lee `server.address().port`, **cierra** ese socket y arranca el server con ese puerto. Es el mismo patrón que usan los e2e para “esperar a que escuche”, pero sin números mágicos. Se documenta como decisión; **no** se toca `protocol.mjs`/`zombie-protocol.mjs` (intocables / fuera de alcance).

**Por qué es TDD real:** los asserts van contra **valores de retorno de la función real** (no `includes` de strings del código). Un cambio de iteraciones, un `===` en lugar de `timingSafeEqual`, un `pbkdf2` mal llamado o un parseo roto **rompen el test por comportamiento**. Los únicos asserts estructurales son los de configuración del server (que el default público no está y que el handler usa el verificador), acotados y comentados como tales.

**Por qué el e2e importa aunque haya unit tests:** el unit test verifica el módulo; el e2e verifica que el **cableado** (`server.js` leyendo `process.env`, resolviendo precedencia y llamando al módulo dentro del handler `hello`) realmente honra el contrato. Es donde se atraparía un `ADMIN_KEY_HASH` leído pero no usado.

### 13. Alta en la suite: 13 archivos

`admin-hash.mjs` se agrega al script `test` de `server/package.json` (**12 → 13**). Se sube también el assert de `server/test/zombie-protocol.mjs:287-289` de **12 → 13** (agregar `admin-hash` a `required` y el numeral del mensaje). Ese archivo **no** es uno de los 6 pre-existentes ⇒ se puede editar. Los **6 pre-existentes no se tocan**.

## Risks / Trade-offs

- [Risk] **Un co-tenant con root y activamente malicioso puede sniffear la red interna de Docker**: detrás de Traefik, el tráfico ya está desencriptado y el `hello` viaja en **claro por `ws://`** entre el proxy y el container. Podría **capturar la clave cuando un admin inicia sesión** → **el hash NO protege esto** (la clave viaja en claro *dentro* de la red). → **Declarado como límite del fix, no como bug**: ningún esquema de aplicación evita un host comprometido; se resuelve **no compartiendo root** (decisión de infra del usuario, fuera de este change). La alternativa que sí resistiría el sniffer es ECDSA (§abajo).
- [Risk] **Un co-tenant con root puede modificar `server.js`/`index.html` servidos** y hacerse admin sin clave (o robar la clave desde el propio código) → Mismo límite: **host comprometido = juego terminado** para cualquier auth de aplicación. Se declara con honestidad; **no** se promete más de lo que el fix da.
- [Risk] **El código conserva el camino en claro** (restricción dura de `protocol.mjs`, intocable) ⇒ es una limitación de **superficie del código**, no del deploy: en producción el dueño **cierra el modo inseguro por configuración** (borra `ADMIN_KEY` y deja **solo** `ADMIN_KEY_HASH` ⇒ **no queda ninguna clave en claro en el host**, que es el objetivo del pedido). Un deploy mal configurado que deje `ADMIN_KEY` en claro seguiría inseguro → Mitigación: **warning fuerte al arrancar que dice “borrá `ADMIN_KEY`”**, documentación que marca el claro como **solo dev local**, y precedencia que hace ganar al hash siempre. El camino del **código** no se puede eliminar sin romper un test pre-existente.
- [Risk] **Rotación obligatoria de la clave actual**: la clave estuvo legible en claro en el host ⇒ **hay que cambiarla**. El hash **no des-expone** lo que ya estuvo expuesto → Se deja como **paso operativo explícito** en `proposal.md`/`README`/`tasks.md` (generar hash de una clave nueva y actualizar la config), **no** como código.
- [Risk] **Bloqueo del event loop por el KDF** (~decenas de ms por login de admin) → **Mitigado por diseño**: se usa `crypto.pbkdf2` **async** (no `pbkdf2Sync`) ⇒ el KDF corre en el threadpool de libuv y no detiene el tick ni los snapshots (§10).
- [Risk] **DoS por el KDF** (riesgo que **este change introduce**): un flood de **conexiones nuevas** con `mode:'admin'` dispara N derivaciones caras; hoy la comparación es instantánea ⇒ esto es una **regresión de disponibilidad** → **Mitigado por diseño (§10)**: derivación **async** (no bloquea el event loop) + **token bucket global** (capacidad 3, recarga 0.5/s) que rechaza **barato** sin KDF + **cota de 2 derivaciones concurrentes**. Limitación declarada: el bucket es **global**, así que un flood puede dejar sin token al admin legítimo (degrada el **login de admin**) pero **no** tumba el juego. Se cubre con scenarios del spec (flood acotado, rechazo sin derivar, admin legítimo no afectado).
- [Risk] **`timingSafeEqual` lanza si los largos difieren** → Mitigación: el módulo valida largos y devuelve `false` ante un stored hash corrupto; un hash malformado **deniega sin crashear** (scenario del spec + test).
- [Risk] **El hash guardado en el env podría filtrarse igual** (está en la config del panel) → **Aceptado por diseño**: es el punto del change — el hash **no es usable** para entrar. Aun filtrado, no sirve para autenticarse ni es barato de crackear.
- [Risk] **Un admin que ya está conectado** no se re-verifica: cambiar la config no expulsa sesiones admin abiertas → Aceptado (fuera de alcance: no hay revocación de sesiones en este change); se resuelve redeployando (las conexiones se recrean).
- [Risk] **El `maxlength="32"` del input** no cambia ⇒ la clave sigue limitada a 32 chars. No afecta al hash (el hash se calcula sobre lo que entre). Si se quisiera una passphrase más larga, sería un cambio de cliente aparte.
- [Risk] **Opción más fuerte NO implementada — firma asimétrica ECDSA P-256** (declarada como **candidato a change propio**): el env guardaría **solo la clave pública**; el cliente firmaría un **nonce por conexión** con la privada vía **WebCrypto** y el server verificaría con `crypto.verify`. **Ventaja:** resistiría también al **sniffer** (no hay secreto reusable que capturar) y al robo de la config. **Costo/por qué no ahora:** agrega un **par de claves**, un **nonce por conexión** (nuevos mensajes/handshake), almacenamiento de la privada en el cliente, y un input más largo que 32 chars; **sigue siendo vulnerable a un host que sirva JS alterado**. Es un problema más grande que este fix; se deja anotado para no perderlo.
- [Risk] **`docker-compose.yml` sin default**: correr `docker compose up` sin `ADMIN_KEY_HASH` deja el admin **cerrado** (fail-closed). Es el comportamiento deseado, pero puede sorprender en local → Mitigación: el README documenta explícitamente `ADMIN_KEY` para dev local y el warning aparece en el log del container.

## Migration Plan

- **Paso operativo obligatorio (rotar la clave):** la clave actual estuvo en claro en el host. Antes/durante el deploy:
  1. Elegir una **clave nueva** (larga; el input admite hasta 32 chars).
  2. Correr `node server/hash-key.mjs` (o `node server/hash-key.mjs "nueva-clave"`) ⇒ copiar el string `ADMIN_KEY_HASH=pbkdf2_sha256$...`.
  3. En **Easypanel → Environment**: pegar `ADMIN_KEY_HASH` con ese valor y **borrar** `ADMIN_KEY` en claro.

  **Este paso es lo que cierra el objetivo.** En producción el modo inseguro **no se cierra por código** —el código conserva el camino en claro como **fallback de desarrollo/tests**, porque `protocol.mjs` (intocable) lo exige— sino **por configuración**: al borrar `ADMIN_KEY` y dejar **solo** `ADMIN_KEY_HASH`, **no existe ninguna clave en claro en el host**. Es una limitación de **superficie del código**, no del deploy. Si alguien deja **las dos**, la precedencia hace ganar al hash, pero la clave en claro **sigue estando (y legible) en el host** ⇒ el warning de boot pide **borrar `ADMIN_KEY`** (§9).
- **Deploy:** el change toca `server/*` ⇒ el push a `main` dispara CI (tests) + deploy webhook de Easypanel. El `Dockerfile` y el webhook **no se tocan**.
- **Rollback:** revertir los archivos del change y re-deployar. Al revertir, el camino en claro vuelve a funcionar y el admin abierto por env vacía **también vuelve** ⇒ el rollback **reintroduce** el agujero (§7): hacerlo solo si el nuevo camino rompe el login y mientras tanto setear una `ADMIN_KEY` en claro no pública para no quedar abierto.
- **Orden seguro:** el JSON `hello` no cambia ⇒ **no hay coordinación cliente/servidor**; clientes viejos y nuevos funcionan igual contra el server nuevo.
- **Verificación post-deploy:** entrar como admin con la clave nueva (debe entrar) y confirmar que el `ADMIN_KEY_HASH` leído en la config **no** sirve como clave (debe ser denegado).

## Open Questions

- ¿Conviene **subir las iteraciones** por encima de 210000 (Django hoy usa 600000+ para PBKDF2-SHA256) a costa de más CPU por login (ya **fuera** del event loop por el KDF async, §10)? El formato es autodescriptivo ⇒ cambiarlo es regenerar el hash, **sin cambiar el spec**. Se queda en ~210000 por pedido explícito y por el trade-off de §10.
- ¿Vale la pena exponer un **modo “rehash automático”** (si el stored hash usa menos iteraciones que el default actual, re-generar la env)? Requiere escritura de configuración y no aporta al objetivo; **fuera de alcance**, se puede proponer como change propio.
- ¿El mensaje de warning del boot debería ser **más ruidoso** (p. ej. un mensaje en el `welcome`/chat a los admins) para notar que el camino en claro está activo? Hoy alcanza con el log de arranque; se puede sumar sin cambiar el spec.
