# Tasks

## 1. Tests en rojo (TDD) del contrato nuevo

- [x] 1.1 **RED**: en `server/test/bot-cazador.mjs`, actualizar el caso (f) de velocidad para esperar `≈28.8` u/s y `≈6 × 4.8` (600 % del jugador), dejando la presa de referencia a 80 bloques para que 2 s de vuelo (57.6 u) no choquen con `CHASE_STOP`. Verificación: `node test/bot-cazador.mjs` falla en ese assert con el `SPEED = 9.6` actual.
- [x] 1.2 **RED**: agregar el caso (j) de no-clip horizontal: mundo inyectado con `blocked: () => true` y `topSolidY: () => GROUND + 30`, presa a 16 bloques en línea recta; exigir que en N ticks la distancia horizontal sea ≤ `CHASE_STOP` y que exista al menos un `hit` contra la presa. Verificación: el test falla porque el bot no se mueve con la colisión actual.
- [x] 1.3 **RED**: agregar los casos (k) torre (presa a `GROUND + 12`) y (l) cueva (presa a `GROUND - 10`), ambos con `blocked: () => true`: exigir que la `y` del bot converja a `presa.y + FLY_Y_OFFSET` (±0.3), que la distancia horizontal caiga a ≤ `CHASE_STOP` y que se emita `hit`. Verificación: ambos fallan porque la `y` nunca se mueve hacia el objetivo.
- [x] 1.4 **RED**: agregar (m) sin gravedad/sin snap (tras alinear altura, 20 ticks más con `topSolidY` devolviendo `GROUND` no bajan la `y`), (n) constantes exportadas (`SPEED === 28.8`, `FLY_Y_OFFSET`, `FLY_Y_DEADBAND`) y (o) banda muerta (diferencia menor que `FLY_Y_DEADBAND` ⇒ la `y` no cambia entre ticks). Verificación: los tres fallan con el módulo actual (sin las constantes nuevas y con `resolveGround` bajando la `y`).

## 2. Movimiento libre y velocidad

- [x] 2.1 **GREEN**: en `bot/cazador.js`, reemplazar `tryMove` por `freeMove(mx, my, mz)` que mueve los tres ejes sin consultar `world.blocked` ni `world.topSolidY`; borrar `resolveGround` y sus llamadas; ampliar `clampToWorld` para clampear `y` a `[0, H-1]` cuando hay mundo, manteniendo x/z en `[1, W-2]`. Verificación: el caso (j) de 1.2 pasa y el bot sigue respetando los bordes del mundo.
- [x] 2.2 **GREEN**: fijar `SPEED = 28.8`, agregar `FLY_Y_OFFSET = 0.5` y `FLY_Y_DEADBAND = 0.25`, exportarlas junto con `SPEED`. Verificación: los casos (f) y (n) de 1.1/1.4 pasan.
- [x] 2.3 **GREEN**: cambiar `moveToward` a `moveToward(tx, ty, tz, step, stop)` y recortar el avance horizontal a `min(step, max(0, d - stop))` para no sobrepasar la distancia de detención (3.8 en CAZA, 1.5 en SIGUEME, 1.0 al spawn); actualizar las llamadas del `tick`. Verificación: el caso (j) pasa sin que el bot termine encima de la presa y los casos existentes de kill con dos toques y de SIGUEME siguen verdes.

## 3. Alineación vertical y documentación

- [x] 3.1 **GREEN**: agregar `alignAltitude(ty, dt)` (objetivo `ty + FLY_Y_OFFSET`, paso máximo `±SPEED * dt`, sin corregir dentro de `FLY_Y_DEADBAND`) y llamarla en el `tick` de CAZA con la presa, de SIGUEME con el admin y del retorno al spawn, incluso cuando la distancia horizontal ya es menor que la de detención; ESPERA sigue congelando el ancla completa. Verificación: pasan (k), (l), (m) y (o) de 1.3/1.4.
- [x] 3.2 **GREEN**: confirmar que la `y` congelada de ESPERA sigue intacta y que un objetivo a otra altura no la mueve. Verificación: el caso existente de ESPERA (comparación de las tres coordenadas) queda verde.
- [x] 3.3 Documentar en `README.md` que el cazador vuela, atraviesa bloques y va a 28.8 u/s, sin variables de entorno ni toggles nuevos. Verificación: revisar que el texto coincide con `SPEED`/`FLY_Y_OFFSET` y que no promete un interruptor.

## 4. Verificación integral

- [x] 4.1 Correr la suite completa `cd server && npm test` y verificar que todos los archivos pasan, incluidos los pinneados `static.mjs` y `protocol.mjs` sin cambios.
- [ ] 4.2 Levantar `docker compose up --build -d` (server + bot), esperar a que `http://localhost:3000` responda y verificar en el navegador: el robot vuela, atraviesa una pared/construcción cerrada, mata a un jugador refugiado en una cueva y en una torre, y conserva estados, `sigueme`/`espera`, invulnerabilidad y keepalive. Avisar al usuario qué mirar y esperar su aprobación explícita antes de commitear.

## Workflow follow-up

- Al aprobar: `docker compose down`, commit en español (`feat(bot):` o similar), `git push` a `main`, `openspec archive cazador-noclip-vuelo` y verificar `git status` limpio.
- Registrar en el resumen de archivo que `pitch` sigue en 0 y que anti-cheat/línea de visión quedan como changes aparte.
