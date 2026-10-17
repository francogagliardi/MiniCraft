# Proposal

## Why

Hoy la clave de admin es una **variable de entorno de la VPS** (`ADMIN_KEY`, `server/server.js:11`), y el usuario **comparte la VPS con otras personas que tienen SSH/root**. Cualquiera con acceso al host puede leer la clave en claro sin esfuerzo: `docker inspect` la muestra, `/proc/<pid>/environ` la muestra, y la config de entornos de Easypanel la muestra en su panel. El pedido del usuario es concreto: *"me gustaría que fuera un secreto de GitHub si es posible"* — o sea, que el valor guardado en el host **no sea visible como credencial** para el resto de los miembros de la VPS.

**Un secreto de GitHub NO resuelve este problema con el deploy actual**, y esto es la premisa central del change (ver `design.md` §1 para el detalle verificado): `.github/workflows/deploy.yml` **solo hace `curl -X POST` al deploy webhook de Easypanel** (L66-75). El build y el runtime los hace **Easypanel en la VPS**, leyendo **su propia config de entorno** (README §Deploy, L70-71). GitHub Actions **nunca toca el runtime**: el valor del secret no llega al proceso. Y aunque el deploy se moviera a Actions (build → `ghcr.io` → SSH), **el valor igual quedaría legible en la VPS** (env del container, `/proc`, config del panel), que es justamente lo que el usuario quiere evitar. Por eso este change **no implementa** un GitHub Secret: elige una estrategia que sí cumple el objetivo —que leer el host **no entregue una credencial usable**— y documenta por qué el secret no alcanza.

El objetivo a modelar: **el valor guardado en el host no sirve para entrar**. La clave real queda solo en la cabeza/gestor de contraseñas del usuario.

## What Changes

- **Nuevo camino preferido `ADMIN_KEY_HASH`**: el server verifica la clave del cliente **derivando un hash PBKDF2-SHA256** (KDF lento) de lo que recibe y comparándolo con el hash guardado. El env pasa a contener un **hash**, no la clave. Leer el host da un valor que **no sirve para entrar**.
  - **Formato autodescriptivo** (estilo Django): `pbkdf2_sha256$<iteraciones>$<saltB64>$<hashB64>`, con **salt aleatorio** (16 bytes) e **iteraciones altas** (~210000), generado con `node:crypto` (**sin dependencias nuevas**).
  - **Comparación con `crypto.timingSafeEqual`** (nunca `===`).
  - **Anti pass-the-hash**: mandar el hash guardado como clave **no** entra, porque el server hashea lo que recibe (el hash del hash no coincide). Con salt + PBKDF2 caro tampoco sirve crackearlo offline.
  - **El cliente NO cambia en lo esencial**: sigue mandando la clave en claro por el `hello`; en producción el transporte ya es `wss://` (`index.html:2552` elige el esquema según `location.protocol`, y el usuario entra por dominio HTTPS).
- **Herramienta generadora `server/hash-key.mjs`** (local, **no** la usa el server en runtime): pide la clave por stdin (sin eco si se puede) o la toma de `argv`/env, imprime el string `ADMIN_KEY_HASH=pbkdf2_sha256$...` listo para pegar en Easypanel y **nunca** imprime la clave. La función pura `makeHash` se exporta desde el módulo `.js` para poder testearla sin CLI.
- **Módulo de verificación `server/admin-auth.js`** (nuevo, extensión `.js` **obligatoria**: el `Dockerfile:11` copia `server/*.js`; un `.mjs` haría crashear el container con `Cannot find module` — el bug que ya pasó con `zombie.js`).
- **Regla de precedencia explícita** (ver `design.md` §4):
  - `ADMIN_KEY_HASH` seteado → se usa **solo** eso; si además hay `ADMIN_KEY` en claro, se **ignora** (warning al arrancar).
  - Sin hash y con `ADMIN_KEY` en claro → se acepta (**compat** con `server/test/protocol.mjs` y dev local) con **warning** de que cualquiera con acceso al host puede leerla.
  - Ninguna de las dos → **admin DESHABILITADO (fail closed)** con warning claro al boot. **Nunca más admin abierto.**
- **Se cierran dos agujeros existentes** (defensa en profundidad, son minas aunque hoy la env esté bien seteada):
  - **`server/server.js:11`**: se **saca el default `'minicraft-admin-2026'`** — es una clave **pública**, publicada en el README (L50 y L124). Si algún día la env se pierde/recrea, hoy cae en esa clave pública.
  - **`server/server.js:206`**: hoy `ADMIN_KEY === ''` significa **admin ABIERTO** (cualquiera entra eligiendo modo admin). Con el diseño nuevo, env vacío = admin **deshabilitado**.
  - **`docker-compose.yml:9`**: `${ADMIN_KEY:-minicraft-admin-2026}` → **sacar el default público**.
  - **README**: documentar `ADMIN_KEY_HASH` como camino de producción + el script generador; marcar `ADMIN_KEY` en claro como **solo dev local**; **borrar la clave pública** de la doc (L50, L124).
- **BREAKING (operativa)**: la clave de admin pasa a configurarse como hash. **En producción el modo inseguro queda cerrado por configuración**: el dueño **borra `ADMIN_KEY`** y setea **solo** `ADMIN_KEY_HASH` ⇒ **no existe ninguna clave en claro en el host** (ese es justo el objetivo del pedido). Lo que queda es que **el código** conserva el camino en claro como **fallback de desarrollo/tests**, porque `server/test/protocol.mjs` (pre-existente e intocable) lo exige con `ADMIN_KEY: 'test-key'`: es una limitación de **superficie del código**, **no** del deploy de producción. Si alguien deja las dos variables, la precedencia hace ganar al hash, pero la clave en claro **sigue estando y siendo legible en el host** ⇒ el warning de boot exige **borrar `ADMIN_KEY`**. Además, la clave actual estuvo legible en claro en el host ⇒ **rotación obligatoria** (paso operativo explícito, no código).
- **Mitigación anti-DoS del KDF (una regresión que este change introduce y cierra)**: el PBKDF2 es **caro**; hoy la comparación es `m.key === ADMIN_KEY` (instantánea), así que un **flood de conexiones nuevas** con `mode:'admin'` (cada `hello` dispara ~210000 iteraciones, ~decenas de ms de CPU) sería un vector de **agotamiento de disponibilidad**. Verificado: el cliente **nunca reenvía `hello`** (`index.html:2556-2558` manda uno solo por `onopen`), así que la mitigación relevante **no** es ignorar el segundo `hello` sino: **(a) derivación no bloqueante** (`crypto.pbkdf2` **async**, no `pbkdf2Sync`), **(b) token bucket global** (capacidad **3**, recarga **0.5/s**) aplicado **antes** de derivar ⇒ rechazo **barato** `adminDenied` sin KDF cuando se agota, y **(c) cota de 2 derivaciones concurrentes**. Números, justificación y trade-off en `design.md` §10.
- **Test TDD nuevo `server/test/admin-hash.mjs`** (módulo + e2e WS) + alta en el script `test` de `server/package.json` (12 → **13**) y en el assert de conteo de `server/test/zombie-protocol.mjs` (nuestro, editable: hoy dice 12).

## Capabilities

### New Capabilities

- `security/admin-auth`: cómo el server decide si una conexión entra en **modo admin** — verificación de la clave contra un **hash PBKDF2** autodescriptivo, precedencia hash-vs-claro, **fail closed** cuando no hay configuración, la garantía de que **el valor guardado en el host no es una credencial usable** (anti pass-the-hash), y el **costo de verificación acotado y no bloqueante** (KDF async + token bucket + cota de concurrencia). Es un contrato observable: qué `hello` entra como admin y cuál se deniega.

### Modified Capabilities

<!-- Ninguna. Ninguna de las 19 capabilities existentes (`blocks/*`, `creatures/*`, `net/*`, `player/*`, `social/greet`, `ui/*`, `world/*`) describe autenticación. `net/presence` es heartbeat/idle (cero fantasmas), `net/avatar` es cómo se ven los jugadores remotos; ninguno cubre el modo admin. Se crea una capability nueva. -->

## Impact

- **`server/admin-auth.js`** (nuevo, `.js`): `makeHash(clave)` (síncrona) y `verifyAdminKey(clave, {hash, claro})` **asíncrona** (PBKDF2 vía `crypto.pbkdf2` promisificado), + parseo/serialización del formato, precedencia, el **token bucket** (`createTokenBucket`) y un **contador de derivaciones**. Sin WebSocket, sin estado global; testeable por unidad.
- **`server/hash-key.mjs`** (nuevo, herramienta local): CLI que envuelve `makeHash` y **nunca** imprime la clave. No entra al container (el `Dockerfile` copia `server/*.js`, no `.mjs`).
- **`server/server.js`**: `ADMIN_KEY` (L11, sin default público) + nueva lectura de `ADMIN_KEY_HASH`; el handler `hello` (L204-227) pasa a **asíncrono** y usa `await verifyAdminKey` en vez de `m === ADMIN_KEY`, consultando **antes** el token bucket y la cota de concurrencia; warnings de configuración al arrancar. **El literal `pos: [128.5, 20, 136.5]` y el resto del handler quedan intactos** (`static.mjs:146` asierta ese spawn).
- **`server/test/admin-hash.mjs`** (nuevo): tests unitarios del módulo + un e2e WS corto con puerto libre real.
- **`server/package.json`**: alta de `test/admin-hash.mjs` en el script `test` (13 archivos).
- **`server/test/zombie-protocol.mjs`**: assert de conteo 12 → 13 (test nuestro, no es uno de los pre-existentes).
- **`docker-compose.yml`**: `ADMIN_KEY` sin default público (y `ADMIN_KEY_HASH` documentado/opcional).
- **`README.md`**: `ADMIN_KEY_HASH` como camino de producción, script generador, `ADMIN_KEY` = solo dev local, y **borrado de la clave pública** (L50, L124).
- **No afectado**: `index.html` (el cliente sigue mandando la clave en claro por `wss://`; **no cambia** el `hello`), el protocolo (`hello` con los mismos campos), `world.json`, el bloque `worldgen`, el bloque `net/avatar`, `server/zombie.js`, `Dockerfile` y el **mecanismo de deploy webhook**. Los **6 tests pre-existentes** (`static.mjs`, `avatar.mjs`, `migrate.mjs`, `terrain.mjs`, `water.mjs`, `protocol.mjs`) quedan **intactos**; `protocol.mjs` (que exige el camino en claro con `ADMIN_KEY: 'test-key'`) sigue en verde por la regla de compatibilidad, y el **token bucket no lo rompe**: sus 2 `hello` admin suman **1 sola derivación** (`''` se rechaza barato sin token) contra una capacidad de **3**.
- **Deploy**: el change toca el server ⇒ el push a `main` dispara CI + deploy Easypanel. **Antes/durante** el deploy hay un paso operativo: **rotar la clave** y pegar `ADMIN_KEY_HASH` en la config de entorno de Easypanel (ver `tasks.md`).
- **Riesgos residuales declarados** (detalle en `design.md`): con root en el host, un co-tenant activamente malicioso puede sniffear la red interna de Docker (`ws://` detrás de Traefik, donde el hash no protege) o servir `server.js`/`index.html` modificados. **Ningún esquema de aplicación evita un host comprometido**; se resuelve no compartiendo root, no con código. Además, el token bucket es **global**: un flood sostenido puede **degradar el login de admin** (dejarlo sin token), pero **no** tumba el juego (el event loop queda libre). La alternativa más fuerte (firma **ECDSA P-256**) queda como **candidato a change propio**, no se implementa acá.
