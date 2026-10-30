# Design

## Context

Ver `proposal.md` — Why. Estado actual relevante de `index.html`:

- Bloque `/* look:start */ … /* look:end */` (≈2795): constantes `LOOK_MAX_PX = 1000`, `LOOK_WARN_MAX = 3`, contador `lookSpikes`, marca booleana `lookLockPending`, y las funciones puras `lookDeltaOk(dx,dy)`, `lookLockSkip()` y `noteLookSpike(dx,dy,src)`. El test `server/test/lookguard.mjs` EXTRAE ese bloque y lo evalúa con `new Function`, así que todo lo nuevo tiene que vivir ahí y no referenciar símbolos externos (`player`, `document`, `THREE`, …).
- Handler `mousemove` (≈2825): guarda `state/locked/dead`, consume `lookLockSkip()`, descarta con `lookDeltaOk` y escribe directo `player.yaw -= mx * MOUSE_SENSITIVITY` / `player.pitch = clamp(..., ±1.55)`.
- `tryLock()` (≈3080): `document.body.requestPointerLock()` sin opciones. El listener `pointerlockchange` (≈3085) marca `lookLockPending = true` al adquirir.
- El loop `loop(now)` (≈3310) llama a `physicsGravity(dt)` (≈1779), que es donde se escribe `camera.position/rotation` a partir de `player.yaw/pitch` para 1ª, 3ª y frontal. No hay acumulador ni tope por frame.
- Sensibilidad: `MOUSE_SENSITIVITY` (default `0.0042`, ajustable 0.5×–2× desde ⚙️ Configuración).
- `server/test/config.mjs` y `server/test/lookguard.mjs` tienen estáticos que hoy exigen `player.yaw -= … * MOUSE_SENSITIVITY` dentro de `mousemove`; hay que actualizarlos junto con el cambio.

## Goals / Non-Goals

**Goals:**

- Que un delta espurio aceptado (por ejemplo 400–900 px) no pueda girar la cámara 90°+ en un solo frame.
- Mantener la respuesta de un flick legítimo: el giro pendiente se reparte en frames, no se pierde.
- Reducir la generación de deltas erráticos en Windows pidiendo pointer lock sin aceleración del SO.
- Dejar evidencia en consola que permita confirmar la causa si el salto reaparece.
- Que la lógica nueva sea testeable sin navegador, con el patrón de extracción ya usado.

**Non-Goals:**

- No se toca el handler táctil: sus deltas son pequeños y continuos, y el gesto de arrastre ya está acotado por la pantalla.
- No se agrega suavizado (interpolación/lerp) de la mirada: cambiaría la sensación de apuntado.
- No se intenta eliminar la aceleración del mouse a nivel de sistema operativo.
- No se cambia el protocolo: `yaw/pitch` se siguen enviando igual en `mv`.

## Decisions

### 1. Buffer de deltas + tope de rotación por frame

El handler `mousemove` deja de escribir la mirada: valida y **acumula** píxeles en `lookBufX/lookBufY`. El loop consume el buffer una vez por frame con un tope de rotación.

- Constante `LOOK_MAX_RAD_PER_FRAME = 0.30` (≈17°), independiente de la sensibilidad.
- Función pura en el bloque `look`:

  ```
  clampLookStep(dxPx, dyPx, sens, maxRad)
    → { yaw, pitch, usedX, usedY }
  ```

  `yaw = -dxPx*sens`, `pitch = -dyPx*sens`. Si `max(|yaw|,|pitch|) > maxRad`, se escala **ambos** por el mismo factor `maxRad / max(|yaw|,|pitch|)` para conservar la dirección del gesto (Chebyshev, no magnitud euclidiana: así ningún eje supera el tope). `usedX/usedY` son los píxeles efectivamente consumidos (`|yaw|/sens`, `|pitch|/sens`), para descontarlos del buffer.
- El loop resta `usedX/usedY` del buffer y suma `yaw/pitch` a la mirada, con el clamp de pitch ±1.55 de siempre.
- El tope se aplica a **ambos ejes juntos**: no se permite un giro de 17° en yaw y otro de 17° en pitch en el mismo frame (sería 24° diagonales).

Ejemplo con sensibilidad por defecto: un evento de 900 px pide `900 × 0.0042 = 3.78 rad`; el primer frame aplica `0.30 rad` (≈71 px) y deja ≈829 px pendientes, que se drenan en ≈13 frames (≈0,21 s a 60 fps). El gesto se siente como un barrido rápido, no como un teletransporte de cámara.

Alternativas descartadas:

- **Recortar y descartar el excedente**: simple, pero un flick legítimo de 500 px quedaría limitado a 17° y la mirada se sentiría "pegajosa".
- **Escalar el delta por `dt`**: el problema no es la tasa de eventos sino un delta corrupto puntual; escalar por tiempo no lo acota.
- **Bajar `LOOK_MAX_PX` a ~200 px**: descartaría flicks legítimos y no cubre deltas espurios de 150–199 px.

### 2. Dónde se aplica el giro

Se drena en `loop()` **antes** de `physicsGravity(dt)`, sólo cuando el jugador puede mirar (`started && state==='play' && !dead && !TOUCH`). Así la cámara del frame ya usa el yaw/pitch actualizado y no hay un frame de atraso. Drenar en el loop (y no en el handler) desacopla la tasa de eventos del navegador del giro real y hace el tope determinista.

Al salir de `play` (pausa, chat, inventario) el pointer lock se pierde y el buffer se limpia, así que no queda giro pendiente aplicándose detrás de un menú.

### 3. Pointer lock sin aceleración del sistema

`tryLock()` intenta `requestPointerLock({ unadjustedMovement: true })`.

- Si la llamada lanza de forma síncrona (navegador que no acepta el objeto), se cae a `requestPointerLock()`.
- Si devuelve una promesa, `.catch()` reintenta una sola vez sin opciones. Una bandera por intento evita reintentos en cascada.
- Si no devuelve promesa (Firefox/Safari viejos), se asume aceptada; el lock sigue funcionando como hoy.
- `unadjustedMovement` no es requisito para jugar: si el navegador lo rechaza, el juego sigue con el lock clásico.

Alternativa descartada: detectar el navegador por user-agent. El soporte cambia por versión y por plataforma; probar y caer al fallback es más robusto.

### 4. Guard de re-lock y limpieza del buffer

`lookLockPending` pasa de booleano a **contador** con `LOOK_LOCK_SKIP_EVENTS = 2`: se ignoran los dos primeros eventos tras (re)adquirir el lock (hoy uno), porque el pico inicial puede venir acompañado de un segundo evento contaminado. `lookLockSkip()` mantiene su firma (devuelve `true` si hay que ignorar y descuenta), así el handler no cambia de forma.

En `pointerlockchange`, al perder el lock se descarta el buffer pendiente; al adquirirlo también se resetea (defensivo) y se arma el contador de skip. `lookDeltaOk` sigue descartando deltas ≥1000 px y no finitos **antes** de encolar: el buffer sólo recibe deltas plausibles.

### 5. Diagnóstico de deltas grandes aceptados

Nueva constante `LOOK_BIG_PX = 150` y contador `lookBig`. Cuando un delta aceptado supera ese umbral en cualquier eje, `noteLookBig(dx,dy)` incrementa el contador y avisa en consola sólo los primeros `LOOK_WARN_MAX` casos, con contador y valores:

```
[look] delta de mirada grande #2: dx=420 dy=-3
```

Se mantiene el diagnóstico de descartes existente (`noteLookSpike`). Ambos usan el mismo tope de avisos para no inundar la consola. 150 px con sensibilidad 1× son ≈36°, muy por encima de un movimiento normal entre frames, pero por debajo de un flick deliberado: sirve para distinguir "evento corrupto" de "mano rápida".

Alternativa descartada: loguear todos los eventos aceptados. Genera miles de líneas por sesión y tapa el resto de la consola.

## Risks / Trade-offs

- **El giro espurio se reparte, no se anula** → el tope evita el salto instantáneo, pero un evento de 900 px igual gira 3.78 rad a lo largo de ~0.2 s. Mitigación: limpiar el buffer al perder el lock, rechazar ≥1000 px y usar el diagnóstico para confirmar. Si reaparece un barrido no deseado, el siguiente paso (fuera de alcance) es un tope total por ráfaga.
- **`unadjustedMovement` cambia la sensación de apuntado** (sin aceleración) → es más predecible para un juego; la sensibilidad configurable sigue mandando. Si un navegador lo rechaza, el fallback mantiene el comportamiento actual.
- **Doble pedido de lock** si el primero se rechaza → el reintento ocurre sólo en el `.catch()` y una bandera evita bucles; el usuario no ve un error, en el peor caso tiene que hacer clic otra vez.
- **Tests estáticos frágiles**: `lookguard.mjs` y `config.mjs` asumen que `mousemove` escribe `player.yaw`. Se actualizan en el mismo change, conservando la aserción de orden guard→encolar y agregando la de encolar→drenar.
- **Un frame largo** (pestaña en segundo plano) no acumula más de 0.30 rad porque el tope es por frame, no por segundo; el excedente sigue en el buffer y se drena al volver. Aceptable: el juego no debe girar la cámara mientras la pestaña está oculta.

## Migration Plan

- Cambio sólo de cliente: se aplica al recargar `index.html`. No hay migración de datos ni de protocolo.
- Rollback: revertir el commit; no quedan datos persistidos nuevos.

## Test Strategy

Se amplía `server/test/lookguard.mjs` (la suite sigue en 21 archivos):

- **Puros del tope**: `clampLookStep` con delta chico pasa entero; con delta grande cada eje queda ≤ `maxRad`; la proporción entre ejes se conserva; signos correctos (dx>0 ⇒ yaw negativo); `usedX/usedY` corresponden a lo aplicado; `LOOK_MAX_RAD_PER_FRAME` ≈ 0.30.
- **Puros del buffer**: encolar 900 px y drenar frame a frame nunca supera el tope, no pierde píxeles (suma de `used` = total) y termina vacío; un frame sin drenaje conserva lo pendiente; el reset al perder el lock deja el buffer en cero.
- **Guard de re-lock**: `LOOK_LOCK_SKIP_EVENTS >= 2`; los dos primeros eventos se ignoran y el tercero se procesa.
- **Diagnóstico**: `noteLookBig` cuenta siempre y avisa sólo `LOOK_WARN_MAX` veces, con valores; `console.warn` se restaura en `finally`.
- **Estáticos**: el bloque sigue siendo autocontenido; `mousemove` valida y encola sin escribir `player.yaw`; el loop drena antes de la actualización de cámara; `tryLock` pide `unadjustedMovement` y tiene fallback; `pointerlockchange` limpia el buffer; la suite sigue en 21.
- **`config.mjs`**: el estático de sensibilidad en `mousemove` pasa a verificar que el drenaje usa `MOUSE_SENSITIVITY`.

RED primero (los tests nuevos fallan por bloque ausente/API incompleta, no por sintaxis), después GREEN y cierre con `cd server && npm test` en 21/21.
