# Design

## Context

Ver `proposal.md` — Why. Estado actual **verificado** leyendo el código, que condiciona el enfoque:

- **Movimiento actual 2D con colisión** (`bot/cazador.js`): `SPEED = 9.6` (`:30`); `tryMove(mx, mz)` (`:138-152`) redondea la celda destino, resuelve el suelo con `world.topSolidY`, hace auto-step de ≤1 bloque y rechaza el paso si `world.blocked(cx, fy, cz)` o `world.blocked(cx, fy + 1, cz)` (cuerpo de 2 bloques). `resolveGround()` (`:154-158`) pega el bot al suelo cada tick y `moveToward(tx, tz, step)` (`:160-168`) mueve eje por eje para deslizar. `clampToWorld()` (`:128-132`) limita x/z a `[1, W-2]`.
- **La `y` sólo cambia por terreno**: el bot nace en `findSpawn()` (copia de `index.html:1684` en `parseWorld`), `tryMove` la ajusta al auto-step y `resolveGround` la fija al `topSolidY` de la celda. No hay salto, gravedad ni movimiento vertical propio; `pitch` siempre es `0` en el `mv` (`:313-316`).
- **Tick** (`:269-318`): CAZA persigue a la presa más cercana si la distancia horizontal > `CHASE_STOP` (3.8) y golpea con `maybeAttack`; SIGUEME converge al admin si > `FOLLOW_STOP` (1.5) y sigue siendo turreta; ESPERA congela `self.pos = anchor` (las tres coordenadas) y mata a quien entre en `RANGE` (4.6); sin presas camina al spawn si > `SPAWN_STOP` (1.0). El `dt` se clampea a `0.25 s` (`:272`).
- **`VOID_Y = -10`** (`:41`): si el bot cae al vacío se teletransporta al spawn (`:276`). Con vuelo y clamp vertical queda como red de seguridad.
- **El mundo sigue siendo necesario** aunque no haya colisión: `bot/index.js:89-92` reconstruye el mundo en el `welcome` y lo inyecta en `createHunter` para obtener `findSpawn()` (que debe coincidir con el cliente/server) y los límites `W`/`H`. `parseWorld` expone `W`, `H`, `blocked`, `topSolidY`, `findSpawn` y `set`.
- **El server no valida movimiento**: `server/server.js:359-368` acepta `mv` con cualquier `p` y relayea `pm` con esa posición; no hay clamp ni anti-cheat. **El cliente remoto tampoco lo necesita**: `applyPm` usa `p[1]` como altura del avatar (`index.html:2992-2993`) y el interpolado ya sigue `y`. Por eso el vuelo/no-clip es un cambio exclusivo de `bot/cazador.js`.
- **Tests actuales** (`server/test/bot-cazador.mjs`): (f) mide velocidad sobre la lógica pura con reloj fijo y espera 9.6 (`:373-389`); el resto usa `flatWorld()` con `blocked: () => false` y `topSolidY: () => GROUND` (`:55-58`), así que no dependen de la colisión salvo el caso nuevo que se agregue. La suite completa se corre con `cd server && npm test`.

## Goals / Non-Goals

**Goals:**

- Que el cazador **siempre** llegue a cualquier jugador, sin importar cueva, torre o construcción cerrada: vuelo libre sin colisión en los tres ejes, siempre activo.
- Alinear la altura con el objetivo (presa, admin de SIGUEME o spawn) con offset seguro y banda muerta, incluso cuando ya está dentro de la distancia horizontal de detención.
- Subir la velocidad a **28.8 u/s** (3× los 9.6 actuales, 6× los 4.8 del jugador) manteniendo el paso integrado por `dt` y sin sobrepasar las distancias de detención.
- Cambiar **un solo archivo de producción** (`bot/cazador.js`) y dejar server, cliente y cableado del bot intactos.
- Cubrir con TDD los escenarios nuevos y actualizar el criterio (f) sin agregar archivos de test.

**Non-Goals:**

- Anti-cheat o validación de movimiento en el server: queda como riesgo declarado y change aparte.
- Cambios al cliente humano (render, interpolado, cámara) o al protocolo.
- Cambios de combate: alcance horizontal ≤4.6, `dmg: 6`, ventana ≥0.65 s y `seq` por toque quedan iguales.
- Orientación vertical (`pitch`) del modelo del bot: se mantiene `0` en el `mv`.
- Persistencia de estado entre reconexiones y cualquier cambio de Docker/deploy.
- Implementación: esta fase es sólo planning.

## Decisions

### 1. Vuelo libre: el bot es un punto en 3D, no un cuerpo con colisión

Se elimina la colisión de `tryMove`: la función pasa a mover los tres ejes sin consultar `world.blocked` ni `world.topSolidY`, y `resolveGround` se **borra** junto con sus llamadas en el `tick`. No hay gravedad, auto-escalón ni "glide" sobre el terreno: la `y` del bot sólo cambia por la alineación vertical (decisión 3) o por el teletransporte de seguridad al spawn.

- **Por qué**: el pedido es que alcance a cualquier jugador aun en construcciones cerradas. Cualquier solución basada en pathfinding o en abrir huecos sigue siendo vulnerable a techos, losas y pozos; el no-clip es la única que garantiza el "siempre".
- **Alternativas descartadas:**
  - (a) Inyectar `world.blocked = () => false` desde `bot/index.js`: deja el auto-step y `resolveGround` vivos, así que el bot seguiría "pegándose" al terreno y no podría mantener altura; además ensucia el seam de test.
  - (b) Teletransportar al bot a la posición de la presa: cumple "alcanzar" pero rompe la lectura visual (no se ve llegar) y el combate de dos toques.
  - (c) Pathfinding/A* con apertura de bloques: mucho más código, sigue fallando en cámaras selladas y obliga a tocar el mundo.
- **El mundo se conserva** (`W`, `H`, `findSpawn`, `set`) porque sigue fijando spawn y límites; sólo deja de usarse para colisión. Así `bot/index.js` y `parseWorld` no cambian.

### 2. Límite del mundo: se conserva el clamp, se agrega el vertical

`clampToWorld()` se mantiene para x/z (`[1, W-2]`, igual que hoy) y suma un clamp de `y` a `[0, H-1]` cuando hay mundo. No es colisión: es el borde del área jugable. Sin mundo (tests de lógica pura) no se clampea.

- **Por qué**: sin colisión, el único modo de que el bot no se vaya del mapa es el clamp explícito. Salir del mundo rompería el render remoto y lo sacaría del alcance real de los jugadores.
- **Alternativa descartada:** confiar en `world.blocked` para los bordes — justamente se dejó de consultar.

### 3. Alineación vertical: `FLY_Y_OFFSET = 0.5`, banda muerta `0.25`

Se agrega una utilidad `alignAltitude(ty, dt)` que mueve la `y` del bot hacia `ty + FLY_Y_OFFSET` con paso máximo `±SPEED * dt`, sin pasarse del objetivo y **sin corregir** si `|dy| <= FLY_Y_DEADBAND` (0.25). Se invoca cada tick con la altura del objetivo vigente, **también** cuando la distancia horizontal ya es menor que la distancia de detención (así un objetivo en una torre o un pozo se alcanza igual).

- **Offset 0.5**: el objetivo del bot (presa/admin/spawn) reporta la `y` de sus pies y el `mv` del bot también es su `y` de pies. Un offset de medio bloque evita que el cuerpo se vea semienterrado al cruzar el terreno a nivel del piso y hace evidente que vuela, sin cambiar el combate: el alcance se mide en horizontal (decisión 6).
- **Banda muerta 0.25**: una presa que salta o camina sobre losas hace oscilar su `y`; sin banda, el bot vibraría y mandaría `mv` con `y` cambiando en cada tick. La banda mantiene la `y` estable.
- **Objetivo de altura por modo**: CAZA ⇒ presa; SIGUEME ⇒ el admin objetivo (la spec dice que converge a él, aunque fulmine a otro no-admin en alcance); CAZA sin presas ⇒ spawn; ESPERA ⇒ **ninguna** (el ancla congela las tres coordenadas).
- **Alternativas descartadas:** (a) apuntar a la altura de los ojos (`+1.62`): separa visualmente pero deja al bot demasiado alto para presas en cuevas de 2 bloques y no aporta al alcance; (b) sin offset: el modelo se hunde en el terreno al volar bajo; (c) integrar `y` dentro de `moveToward` en el mismo vector: reduce la velocidad horizontal cuando la distancia vertical es grande, y la spec mide la rapidez en horizontal.

### 4. Velocidad 28.8 y paso que no sobrepasa la distancia de detención

`SPEED = 28.8` (3 × 9.6 = 6 × 4.8). El paso se sigue calculando con `dt` real del tick (clampeado a 0.25 s ⇒ máximo 7.2 u por tick). `moveToward` pasa a recibir la altura y la distancia de detención:

```
moveToward(tx, ty, tz, step, stop)
  d = hypot(tx - x, tz - z)          // horizontal manda el combate
  s = min(step, max(0, d - stop))    // nunca se acerca más que `stop`
  avanza s en horizontal y alinea y  // vía alignAltitude(ty, dt)
```

El `stop` es `CHASE_STOP` (3.8) en CAZA, `FOLLOW_STOP` (1.5) en SIGUEME y `SPAWN_STOP` (1.0) al volver al spawn. Con 28.8 u/s y cadencias de 150 ms, un paso es de hasta 4.32 u: sin el recorte, el bot pasaría de largo del umbral y terminaría encima de la presa en un solo tick. Con el recorte conserva la distancia de combate actual.

- **Por qué 28.8 exacto**: es lo que pidió el usuario ("3× la actual"; 9.6 × 3) y coincide con 6 × 4.8, un número redondo respecto de la referencia del jugador.
- **Alternativa descartada:** interpolar la velocidad en varios ticks (aceleración) — agrega estado y no cambia el contrato; la spec pide rapidez, no curva de aceleración.

### 5. `tick`: mismas decisiones, tres ejes

Cambios puntuales en `bot/cazador.js`:

| Hoy | Después |
|---|---|
| `tryMove(mx, mz)` con `world.blocked`/`topSolidY` | `freeMove(mx, my, mz)` sin consultar el mundo |
| `resolveGround()` en cada modo | se elimina (no hay suelo que resolver) |
| `moveToward(tx, tz, step)` | `moveToward(tx, ty, tz, step, stop)` |
| — | `alignAltitude(ty, dt)` por modo; siempre tras el avance horizontal |
| `clampToWorld()` (x/z) | `clampToWorld()` (x/z + `y` a `[0, H-1]`) |
| `SPEED = 9.6` | `SPEED = 28.8`, `FLY_Y_OFFSET = 0.5`, `FLY_Y_DEADBAND = 0.25` exportadas |

Las condiciones de parada siguen siendo **horizontales** (`CHASE_STOP`, `FOLLOW_STOP`, `SPAWN_STOP`) y ESPERA sigue congelando el ancla completa: ninguna regla de combate ni de estados cambia. `VOID_Y` se conserva como red de seguridad por si `world` es `null` o un test inyecta una posición inválida.

### 6. Combate sin cambios: el alcance sigue siendo horizontal

`RANGE`, `CHASE_STOP`, `HIT_GAP_MS`, `DMG`, `seq` y la selección de presa no se tocan. Un bot volando sobre la presa a la misma x/z está a distancia horizontal 0 y golpea: es coherente con el pedido ("siempre alcanza") y con la spec vigente, que mide el alcance en horizontal.

- **Trade-off explícito**: no hay chequeo de línea de visión ni de techo; el `hit` puede atravesar un piso. Cerrarlo requiere validación server-side (fuera de alcance).

### 7. Tests TDD (primero en rojo, después el código)

Todo vive en `server/test/bot-cazador.mjs`; no se agregan archivos, así que `server/package.json` y los conteos de `zombie-protocol.mjs`/`lookguard.mjs` no cambian. Los casos nuevos usan la lógica pura con reloj fijo y mundos inyectados (deterministas, sin red).

| # | Caso | Cómo se prueba (RED antes del cambio) |
|---|---|---|
| (f) | Velocidad 28.8 | el bloque actual de `:373-389` pasa a esperar `≈28.8` y `≈6×4.8`; con el `SPEED = 9.6` actual **falla**. La presa de referencia queda a 80 bloques (2 s × 28.8 = 57.6 < 80) para no chocar con `CHASE_STOP` |
| (j) | No-clip horizontal | mundo con `blocked: () => true` y `topSolidY: () => GROUND + 30` (muro y techo totales); presa a 16 bloques en línea recta. Tras N ticks la distancia horizontal es ≤ `CHASE_STOP` y hay al menos un `hit`. Con el código actual el bot no se mueve y **falla** |
| (k) | Vuelo vertical (torre) | presa a `GROUND + 12` con `blocked: () => true`; la `y` del bot converge a `presa.y + FLY_Y_OFFSET` (±0.3), la distancia horizontal cae a ≤ `CHASE_STOP` y se emite `hit`. Con el código actual la `y` nunca sube y **falla** |
| (l) | Vuelo vertical (cueva) | presa a `GROUND - 10`; la `y` converge a `presa.y + FLY_Y_OFFSET` y hay `hit` |
| (m) | Sin gravedad / sin snap al suelo | tras (k), se siguen ticking 20 veces más y la `y` se mantiene en altura (±1e-6) con `topSolidY` devolviendo `GROUND`: el `resolveGround` actual la bajaría y **falla** |
| (n) | Constantes exportadas | `SPEED === 28.8`, `FLY_Y_OFFSET` y `FLY_Y_DEADBAND` presentes y con los valores decididos |
| (o) | Banda muerta | con el bot ya alineado y una diferencia < `FLY_Y_DEADBAND`, la `y` no cambia entre ticks |
| (p) | ESPERA congela la `y` | el caso existente de ESPERA (`:317-328`) ya compara las tres coordenadas: se mantiene y debe seguir verde |

Regresión obligatoria (ya existe, no se reescribe): kill en dos toques separados ≥0.65 s, admin ignorado, SIGUEME/ESPERA y turreta, invulnerabilidad, keepalive, cero `edit`, `skin`, reconexión y réplica de `findSpawn`. La suite completa cierra con `cd server && npm test`.

### 8. Sin cambios en server, cliente ni protocolo

El vuelo viaja como una `y` más alta en el `mv` existente; el server la relayea sin validar (`server.js:359-368`) y el cliente remoto ya posiciona el avatar con `p[1]` (`index.html:2992-2993`). No hay frame nuevo, no hay campo nuevo y ningún cliente viejo se rompe. Esto cumple la convención de protocolo aditivo sin agregar nada.

### 9. Documentación

`README.md` actualiza la descripción del cazador: vuela, atraviesa bloques y va a 28.8 u/s. No se documenta ninguna variable de entorno nueva porque no hay toggles: el comportamiento es siempre activo.

## Risks / Trade-offs

- [Risk] **El server no valida movimiento**: cualquier cliente modificado ya podía volar/teletransportarse. Este change hace que el bot lo haga de forma legítima y visible. → Aceptado y declarado; el anti-cheat/la validación server-side es un change aparte. El bot sigue siendo el único cliente con esta conducta.
- [Risk] **Se puede golpear a través de pisos y techos**: el alcance es horizontal y no hay línea de visión. → Aceptado por el requisito "siempre alcanza"; si molesta en juego, se aborda junto con anti-cheat/LOF en otro change.
- [Risk] **El modelo puede verse emergiendo de bloques** al atravesar terreno. → Trade-off inherente al no-clip; el offset de 0.5 y el vuelo a la altura del objetivo reducen la sensación de "hundido". Se valida a ojo en Docker antes de aprobar.
- [Risk] **`pitch` sigue en 0**, así que el robot no "mira" hacia arriba/abajo cuando cambia de altura. → Cosmético y fuera de alcance; se puede ajustar después sin tocar la spec ni la velocidad.
- [Risk] **`mv` cada 150 ms a 28.8 u/s son ~4.3 u entre frames**: el cliente interpola hacia `pm`, pero con latencia alta puede verse a saltos. → Se mantiene la cadencia actual (contrato de keepalive); si en la prueba se ve mal, bajar `mvMs` es tuning sin cambio de spec.
- [Risk] **Clamp vertical vs. techo del mundo**: una presa en `y = H-1` deja al bot clampeado en `H-1` sin el offset. → Diferencia máxima de 0.5, despreciable para el alcance horizontal; el clamp es necesario para no salir del mundo.
- [Risk] **Duplicación de la referencia 4.8/9.6**: si cambia la velocidad del jugador, 28.8 deja de ser 6×. → Mitigación: el test (f) mide 28.8 y su relación con 4.8; un cambio de cliente rompe el test y obliga a revisar.
- [Risk] **Flakiness e2e**: el bot más rápido puede llegar antes de que el test registre frames. → Los asserts de velocidad/altura usan la lógica pura con `now` fijo y `dt` explícito; los e2e ya esperan por condición (`until`), no por tiempos fijos.

## Migration Plan

1. **TDD en `server/test/bot-cazador.mjs`**: actualizar (f) a 28.8 y agregar (j)-(o); correr el test y confirmar que falla con el código actual.
2. **`bot/cazador.js`**: subir `SPEED`, agregar `FLY_Y_OFFSET`/`FLY_Y_DEADBAND`, reemplazar `tryMove`/`resolveGround` por `freeMove`, extender `moveToward`/`clampToWorld` y llamar `alignAltitude` en CAZA, SIGUEME y retorno al spawn (no en ESPERA). Exportar las constantes nuevas.
3. **Suite completa**: `cd server && npm test` en verde.
4. **Docker**: `docker compose up --build -d` (server + bot); verificar en `http://localhost:3000` que el robot vuela, atraviesa una pared y mata a un jugador refugiado en una cueva/torre.
5. **README** con el comportamiento nuevo.
6. **Rollback**: revertir `bot/cazador.js` (y el test/README) y reconstruir el servicio del bot. No hay migración de datos ni de protocolo: el server y los clientes no saben que el bot cambió.

## Open Questions

- **`pitch` del bot**: si el operador quiere que el robot "mire" al objetivo cuando está arriba/abajo, es un ajuste visual posterior (no cambia specs ni approach).
- **Cadencia de `mv`** (150 ms) para suavizar el interpolado a 28.8: se decide mirando la prueba en Docker; es tuning sin impacto en el contrato.
- **Alcance de un futuro anti-cheat/LOF** (validar `mv` y exigir línea de visión para `hit`): change separado, no bloquea este.
