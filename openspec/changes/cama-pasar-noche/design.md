# Design

## Context

Ver `proposal.md` — Why. Estado actual relevante:

- **Bloques**: ids `0..58` en `index.html:471-480`; `DEFS` en `562-623`; paleta `INVENTORY` en `624`; hotbar fija de 9 en `625`; atlas 8×5 con tiles usados `0..33` y libres `34..39` (`657-658`, `779-782`). El servidor acepta `edit` con `v` entero `0..64` (`server/server.js:311`).
- **Render**: `buildChunk` dibuja solo cubos `cube && opaque && !door`; `emitGlobalCell` tiene ramas especiales para vidrio, agua, flores, antorcha, glow, losa y escalera. Las losas son `cube:1` **sin** `opaque`, y se dibujan como medio cubo. La colisión de losa se resuelve en `collidesAt` (`py >= y+0.5` no traba) y en `slabBlocked` (auto-step de 0.5).
- **Colocación/rotura**: `doPlace` (`2646-2703`) y `doBreak` (`2604-2627`); las puertas son el precedente de un bloque de 2 celdas (`doorCells`, 2 ediciones).
- **Interacción**: `onRightDown` (`2751-2760`) solo conoce espada, puerta, avatar, animal y colocar. `raycast` impacta `cube|flower|glow|door`.
- **Reloj**: `T0` const y `phaseNow()` puro (`server.js:71-73`); `isNight()` con `FORCE_NIGHT` solo de test; `tod` difundido cada `TOD_INTERVAL_MS` (`211`). El cliente hace snap si el desfase supera `0.05` (`index.html:876`).
- **Jugadores**: `players` es un `Map` sin flag de bot (`server.js:156`, `273-279`); el bot se presenta `mode:'player'` (`bot/index.js:123-127`); el admin es `mode:'admin'`.
- **Horda**: `zombie.js` mata a todos los vivos al pasar de noche a día (`156-160`).

## Goals / Non-Goals

**Goals:**

- Poder construir una cama reconocible y dormir en ella de noche.
- Saltar la noche solo cuando **todos** los jugadores reales duermen, con el servidor como autoridad.
- Excluir al bot y al admin del quórum sin romper el resto de sus contratos (el bot sigue siendo `player`, el admin sigue jugando).
- Despertar de forma predecible (movimiento, click, ESC, daño, cama rota o desconexión) sin estados trabados.
- Que el amanecer se vea en todos los clientes y que los zombis desaparezcan con el mecanismo existente.
- Tests puros para el quórum y el cálculo del salto, sin depender del reloj real.

**Non-Goals:**

- No hay crafting: la cama está en la paleta, como el resto de los bloques.
- No se renderiza a los remotos acostados.
- No se agrega voto, mayoría ni temporizador.
- No se valida en el servidor la cercanía a la cama ni la existencia del bloque (cooperativo).
- No se persiste el sueño ni la fase.

## Decisions

### 1. Estructura de la cama: un ítem y cuatro bloques de mundo

Los ids libres son `59..64`; el servidor acepta hasta 64. Se usan cinco:

```
BED            59   ítem de paleta (item:'bed'), no colocable como bloque suelto
BED_X_FOOT     60   mitad pie en eje X
BED_X_HEAD     61   mitad cabecera en eje X
BED_Z_FOOT     62   mitad pie en eje Z
BED_Z_HEAD     63   mitad cabecera en eje Z
```

Con `axis` + `head` codificados en el id no hace falta metadata por celda (el mundo solo guarda el id) y no hay que duplicar cuatro orientaciones completas como las puertas. La orientación se deduce de las dos mitades: cabecera = pie + dirección del eje.

`DEFS` de las cuatro mitades: `cube:1`, `bed:1`, `bedAxis:'x'|'z'`, `bedHead:true|false`, `hard:0.3`, `tiles` con `top` distinto para cabecera/pie y un lateral compartido. **No** llevan `opaque:1` para que `buildChunk` no las dibuje como cubos completos (mismo truco que las losas).

`BED` es solo ítem: `item:'bed'`, `css` para el icono de inventario y `tile` de cabecera para el atlas. No se coloca a sí mismo: `doPlace` lo intercepta antes del rechazo genérico de ítems.

### 2. Colocación: pie en la celda apuntada y cabecera "hacia adelante"

Al usar la cama en la mano, `doPlace` calcula la celda destino como cualquier bloque (`h.x+h.nx`, etc.) y:

1. Deriva la dirección horizontal dominante de `lookDir()` (`index.html:1833`): si `|dir.x| >= |dir.z|` el eje es X (signo de `dir.x`), si no es Z (signo de `dir.z`). La cabecera va en la celda contigua **en esa dirección** (alejándose del jugador) y el pie en la celda apuntada.
2. Valida que las dos celdas estén dentro del mundo, que estén libres (`AIR`, `WATER` o flores) y que ninguna solape con jugadores o animales (`ocupadoPor`, el mismo helper de las puertas).
3. Envía **dos** `editBlock`: pie y cabecera. Si la primera celda falla, no envía ninguna.

No se exige soporte sólido debajo: una cama flotante es rara pero no rompe nada, y exigir soporte complica la validación sobre losas y escaleras.

### 3. Rotura: ambas celdas, y despertar si alguien duerme ahí

`doBreak` detecta `DEFS[b].bed` y calcula la pareja con la dirección del eje:

- pie → cabecera en `+dir`; cabecera → pie en `-dir`.
- Si la pareja existe y es de la misma cama, se rompen las dos con dos `editBlock`; si no, se rompe solo la celda apuntada (mundo viejo o edición manual).

El servidor no conoce la semántica de la cama, pero el cliente manda la edición de la celda apuntada; si hay un durmiente cuya `sleepBed` es esa celda, el servidor lo despierta antes de aplicar el cambio. Como la rotura normal manda también la otra mitad, cualquiera de las dos despierta.

No se puede romper una cama desde el estado `sleep` (`doBreak` no corre porque `canAct()` es falso).

### 4. Render y colisión: media altura reutilizando el camino de las losas

En `emitGlobalCell`, antes de la rama de losas, una rama `DEFS[b].bed` dibuja:

- laterales de `0..0.5` con `tiles.side` y las mismas sombras que la losa;
- tapa superior con `tiles.top` (manta acolchada) y, solo en la cabeza, una **almohada 3D** blanca (caja baja de tile 17) apoyada en el borde externo; la dirección hacia afuera se deduce del vecino que es pie, porque el id no guarda el signo;
- fondo con `tiles.bottom` solo si el bloque de abajo no es opaco.

En colisión, `collidesAt` agrega `if (DEFS[b]?.bed && py >= y+0.5) continue;` y `slabBlocked` trata la cama como losa/escalera para el auto-step. Resultado: se puede pisar y dormir, y no bloquea como un cubo de altura completa.

El raycast ya la apunta por `dd.cube`; no hay que tocar `raycast`.

### 5. Reloj: offset mutable y salto al amanecer

`T0` sigue siendo el ancla de arranque. Se agrega:

```js
let sleepOffsetMs = 0;
function phaseNow() { return ((Date.now() - T0 + sleepOffsetMs) % CYCLE_MS) / CYCLE_MS; }
```

El módulo puro `server/sleep.js` calcula cuánto avanzar:

```js
dawnAdvanceMs(phase, cycleMs) = (1 - phase) * cycleMs + 1000
```

El `+1000` cae ≈1 s después del inicio del amanecer, evitando quedar exactamente en `0` por redondeo. Al saltar:

1. `sleepOffsetMs += dawnAdvanceMs(phaseNow(), cycleNowMs())`.
2. Se limpia `sleeping`/`sleepBed` de todos.
3. Se difunde el reset de sueño, un `tod` inmediato y el chat "☀️ Amaneció".
4. El tick de la horda ve `isNight() === false` y mata a los zombis vivos; no hay lógica nueva de despawn.

El cliente ya hace snap con desfases > `0.05`, así que la luz y el cielo cambian juntos en todos los clientes. La fase sigue sin persistirse (`save()` intacto).

**Acelerador de demo**: `TIME_SCALE` (env, default `1`) divide la duración del ciclo; `phaseNow()`, `welcome.cyc` y `dawnAdvanceMs` usan `cycleNowMs()`. No cambia la proporción día/noche ni se persiste; sirve para probar la cama sin esperar 5 minutos.

**Nota de test**: `ZOMBIE_FORCE_NIGHT=1` fuerza `isNight()` a `true`; con ese flag el salto mueve la fase pero la horda sigue en modo noche. Es un atajo solo de test y no se usa para validar el despawn.

### 6. Quórum: módulo puro, sin red

`server/sleep.js` exporta:

```js
isExempt(p)        // p.bot === true || p.mode === 'admin'
quorum(players)    // { need, count, ready }
dawnAdvanceMs(phase, cycleMs)
```

Reglas:

- **Exentos**: bot y admin. No suman a `need` ni a `count`.
- **Muertos**: no cuentan (ni en `need` ni como durmientes). Si un durmiente muere, el servidor lo despierta antes de recalcular.
- `need` = no exentos vivos; `count` = no exentos vivos con `sleeping === true`.
- `ready` = hay al menos un durmiente no-bot y `count === need`. Con `need === 0` (solo admin/bot), alcanza con que el admin esté durmiendo: el admin está exento de la obligación, pero su sueño puede disparar el salto si no hay nadie más a quien esperar.

Se recalcula y difunde en: `sleep`, `wake`, `mv` con `dead=1`, desconexión, nuevo `hello`, y `edit` de la celda donde duerme alguien. `skipNight()` limpia el estado antes de difundir, así que no hay reentrada.

### 7. Protocolo aditivo

Cliente → servidor:

| `t` | Campos | Cuándo |
|---|---|---|
| `sleep` | `x, y, z` (celda apuntada) | click derecho sobre una cama de noche |
| `wake` | — | movimiento/click/ESC/daño estando dormido |

`hello` acepta `bot: true` (el servidor guarda `me.bot = m.bot === true`; default `false`). Es declarativo: no hay secreto compartido porque una mentira solo excluye al que la dice del quórum, sin darle ninguna ventaja.

Servidor → cliente:

| `t` | Campos | Cuándo |
|---|---|---|
| `sleep` | `id, name, on, count, need` | cada cambio de sueño; `on:false` propio despierta al cliente |
| `sleep` | `id, on:false, denied:'day', count, need` | intento de dormir de día |
| `sleep` | `reset:true, count, need` | al saltar la noche, despierta a todos |
| `welcome` | `sleeping:[ids], sleepNeed` | al entrar, para marcar a los que ya duermen |

Además se emiten mensajes de chat de sistema: `😴 <nombre> se durmió (1/3)` y `☀️ Amaneció`. Un cliente viejo ignora los `t` desconocidos, y el cliente nuevo tolera que falten los campos.

### 8. Cliente: estado `sleep` con despertar explícito

- `enterSleep(x,y,z)`: si `state !== 'play'`, `dead` o no es de noche (`isNight(dayV)`), muestra un toast y no manda nada. Si no, `state='sleep'`, guarda `sleepBed`, oculta el hint de controles, muestra el overlay, pone velocidad horizontal en cero y manda `sleep`.
- Mientras `state==='sleep'`: no hay `physicsMove` ni drenaje de mirada (ambos ya exigen `play`); la gravedad sigue corriendo para no atravesar el piso; `canAct()` es falso, así que no se rompe ni se coloca nada.
- `sendMove()` sigue mandando `mv` cada 70 ms con la misma posición: es el keepalive que evita el `IDLE_MS`.
- `wakeUp(send=true)`: vuelve a `play`, limpia `sleepBed`, oculta el overlay y manda `wake` si hay conexión y `send` es verdadero.
- Disparadores de despertar: `KeyW/A/S/D`, `Space` (en `keydown`, antes del guard de `play`), `mousedown`, daño (`damage()`), `pointerlockchange` al perder el lock (despierta y luego el flujo normal decide pausa), y el `sleep` del servidor con `on:false` o `reset:true`.
- No se hace `exitPointerLock` al dormir: el lock se mantiene y ESC lo pierde, lo que dispara el despertar. Así no hay un `pointerlockchange` espurio al entrar.
- Overlay: capa semitransparente con "😴 Durmiendo…", el contador `count/need` y la ayuda "WASD o click para despertar". Se actualiza con cada mensaje `sleep`. Los avatares remotos no cambian.

### 9. Casos borde

- **Se va un durmiente**: `removePlayer` recalcula; si era el que faltaba, el salto se dispara igual.
- **Entra alguien con la noche ya en curso**: el nuevo es un real despierto → `count < need`, no hay salto; ve el contador actualizado.
- **Muere un durmiente**: el `mv` con `dead=1` lo despierta y recalcula (los muertos no cuentan, pero deja de estar "durmiendo").
- **Le rompen la cama**: el `edit` de esa celda lo despierta y recalcula.
- **Dos camas**: cada jugador puede dormir en la suya; el quórum es global, no por cama.
- **Día**: el cliente avisa y el servidor rechaza con `denied:'day'`; nunca se marca `sleeping`.
- **Admin solo**: `need=0`, su sueño dispara el salto; no queda esperando a nadie.
- **Bot**: nunca manda `sleep`; su `bot:true` lo saca del denominador.

## Risks / Trade-offs

- **El flag `bot` es declarativo** → un humano puede declararse bot y quedar exento. No obtiene ventaja (solo evita que su sueño sea obligatorio), pero puede bloquear el salto si además no duerme. Es un juego cooperativo; si molesta, la mitigación futura es un token compartido por env.
- **El servidor no valida la cama** → un cliente modificado puede mandar `sleep` de noche sin cama. No otorga nada que no pudiera hacer ya (es un voto cooperativo).
- **Salto de fase visible** → el cliente hace snap; la luz y el cielo cambian de golpe, que es exactamente lo esperado al amanecer. No se interpola porque el usuario pidió "pasar la noche".
- **Cama de 2 celdas y rotura parcial** → si una edición vieja deja media cama, `bedCells` devuelve solo la celda existente y la rotura no rompe nada más. No se migran mundos viejos porque no hay camas previas.
- **Colisión de media altura** → se reutiliza el camino de losas; si una cama queda flotando, el jugador puede pisarla igual (auto-step).
- **Tests estáticos frágiles** → `worldgen.mjs` y `static.mjs` hardcodean los ids hasta 58 y las constantes; se actualizan en el mismo change. La suite pasa de 21 a 22 archivos y hay tres guardas de conteo que subir.

## Migration Plan

- Sin migración de datos: las camas son ediciones normales (`edits`) y los mundos viejos no las tienen.
- El cliente se actualiza al recargar; el servidor y el bot se reconstruyen con Docker.
- Rollback: revertir los commits. Las camas ya colocadas quedan como bloques 60-63; un cliente viejo no las conoce, así que conviene revertir también el mundo o no colocar camas antes de decidir el rollback.

## Test Strategy

- **Nuevo `server/test/bed-sleep.mjs`** (suite 22): unitarios de `server/sleep.js` (`isExempt`, `quorum` con bot/admin/muertos/admin solo, `dawnAdvanceMs` monótono y con `+1000`) y estáticos de `index.html` (ids y `DEFS` de las 4 mitades, `INVENTORY`, rama de render, `doPlace` de 2 celdas, `doBreak` de ambas, raycast, `state='sleep'`, overlay, `wakeUp`, disparadores de despertar, handlers `sleep`/`wake`), de `server/server.js` (offset en `phaseNow`, handlers, `bot`, `welcome.sleeping`, salto) y de `bot/index.js` (`bot:true`).
- **Guardas de conteo**: `config.mjs:181-183`, `lookguard.mjs:307-315` y `zombie-protocol.mjs:308` pasan de 21 a 22.
- **`worldgen.mjs`**: el regex de ids termina en el último id nuevo (`BED_Z_HEAD=63;`) y el test de drift `mobBlocked`/`isSolid` cubre las camas.
- **`static.mjs`**: constantes 59-63 en el eval de `DEFS`, tiles 34-36 dibujados y UV válidas.
- **`protocol.mjs` (e2e)**: `hello` con `bot:true`, `welcome.sleeping`, rechazo de día (`denied:'day'`), dos clientes que duermen y disparan el salto (con `ZOMBIE_FORCE_NIGHT=1` y tick alto para aislar), `tod` con fase ≈ amanecer, reset de sueño y `wake` manual; desconexión de un durmiente.
- **TDD**: primero los tests que fallan por API/bloque ausente (no por sintaxis), después el código, y cierre con `cd server && npm test` en 22/22.
