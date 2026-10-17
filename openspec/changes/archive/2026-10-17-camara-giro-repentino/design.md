# Design

## Context

Ver `proposal.md` (Why) y el delta spec `player/look` (qué comportamiento observable se exige). Estado actual **verificado** que condiciona el diseño:

- La cámara se rearma **cada frame** desde el estado del jugador: `camera.rotation.set(0,0,0); camera.rotateY(player.yaw); camera.rotateX(player.pitch);` (`index.html:1650`). No hay fuentes de rotación por frame más allá de `player.yaw`/`player.pitch` (y el `rotateZ` de la muerte en `2790`, que no aplica en `play`).
- **Los únicos dos lugares de todo `index.html` que escriben `player.yaw`** son:
  - **Escritorio** (`2364-2368`): `addEventListener('mousemove',e=>{ if(state!=='play'||!locked()||dead) return; player.yaw-=e.movementX*.0024; player.pitch=Math.max(-1.55,Math.min(1.55,player.pitch-e.movementY*.0024)); });` — aplica el delta **tal cual**, sin validación.
  - **Táctil** (`2387-2396`): `const dx=e.clientX-lookLX, dy=e.clientY-lookLY; lookLX=e.clientX; lookLY=e.clientY; player.yaw-=dx*.0042; player.pitch=…-dy*.0042;` — deltas de pantalla del pointer capture, tampoco validados.
- **La red no puede girar la cámara**: el servidor solo relaya la posición/yaw de **otros** jugadores; `applyPm` (`1987-1992`) y `tickAvatar` (`2011-2041`) escriben exclusivamente sobre avatares remotos (`a.target`/`a.yaw`/`a.g.rotation.y`), nunca sobre `player`. Un `pm` no toca la cámara propia.
- **Descartado** como causa del giro: la sacudida por daño carga `shakeT=1` (`1560`) pero solo suma `±(Math.random()-.5)*.07*shakeT` = **±0.035 rad (±2°)** sobre `camera.rotation.x/z` (`1651-1653`), y decae a 3.5/s; y `camera.rotateZ(e*.55)` (`2790`) es el tilt de la animación de muerte, no del estado `play`.
- **Conclusión**: el giro lo produce **un evento suelto de `mousemove` con un `e.movementX` desproporcionado**. Con el factor `.0024`, **1000 px de delta en un solo evento = 2.4 rad = 137°**. Es un comportamiento conocido de los navegadores con pointer lock: picos de `movementX` al recuperar el foco con el lock tomado, cuando el cursor se "clava" en el borde de la pantalla, o cuando un mouse (sobre todo inalámbrico) despierta de idle. Es coherente con el reporte del usuario (caminando, a veces sin mover mucho el mouse, y también con el server local ⇒ no es red).
- **Riesgo latente adicional**: no hay validación de tipo en el handler. Si `e.movementX` viniera `undefined`/`NaN`, `player.yaw` quedaría **`NaN` para siempre** (no hay re-normalización ni recuperación) y la cámara se rompería de forma permanente.
- **Restricciones de los tests existentes** (no se tocan): ninguno de los 6 pre-existentes (`static.mjs`, `avatar.mjs`, `migrate.mjs`, `terrain.mjs`, `water.mjs`, `protocol.mjs`) hace regex sobre `mousemove`/`movementX`/`player.yaw`/`shakeT`, así que el riesgo de romperlos es bajo. Sí hay que **respetar** las regex que ya existen sobre las constantes del ciclo (`static.mjs` §8) y sobre el viewmodel (`PICK_POS`/`PICK_ROT`/`swingT`/`SWING_DUR`), que no se rozan con este change.
- **Patrón de test establecido en el proyecto**: los bloques marcados de `index.html` (`/* net/avatar:start */…`, `/* worldgen:start */…`) se **extraen y evalúan** desde el test (`server/test/avatar.mjs:20-32`, `server/test/worldgen.mjs:24-48`) para testear lógica de cliente sin navegador y sin copiar código. Este change sigue ese mismo patrón.
- **El script `test` de `server/package.json` enumera los archivos a mano** (hoy 11) y `server/test/zombie-protocol.mjs:283-290` tiene un assert que exige que el script liste **11** archivos concretos; sumar cobertura nueva requiere editar ambos (ese test **no** es uno de los 6 pre-existentes).

## Goals / Non-Goals

**Goals:**

- Que **un evento suelto con un delta desproporcionado no gire la cámara**: descartarlo entero, no recortarlo.
- Que un delta **no finito** (`NaN`/`Infinity`/`undefined`/`null`) no pueda dejar la mirada inutilizable de forma permanente.
- Cubrir el otro caso clásico (primer evento tras (re)adquirir el pointer lock) sin depender de timers.
- Que el fix **traiga su propia evidencia**: si el bug es real y vuelve a pasar, el usuario tiene que poder confirmarlo desde la consola.
- Que el guard sea una **función pura testeable** extraída del HTML, con tests de comportamiento reales y **sin tocar los 6 tests pre-existentes**.

**Non-Goals:**

- No se cambia la red, el protocolo, el servidor ni el estado remoto: el bug es de input local.
- No se cambia la sensibilidad (`.0024` escritorio / `.0042` táctil) ni el rango de pitch (±1.55 rad).
- No se agrega suavizado, aceleración, “pointer acceleration” ni configuración de sensibilidad.
- **No se arregla** el hallazgo latente de `yawToward`/yaw sin normalizar (ver riesgos): queda como oportunidad de hardening separada.
- No se persiste nada, no hay migración de datos, no hay feature flag: es un guard mínimo.
- No se intenta reproducir el bug headless (es un evento de browser): la suite verifica el **guard**, no el bug.

## Decisions

### 1. Umbral por evento: `LOOK_MAX_PX = 1000`, y el descarte es del evento entero

Se define una constante con nombre y comentario:

```js
const LOOK_MAX_PX = 1000; // px por evento; por encima de esto el delta es espurio (pico de pointer lock / mouse al despertar)
```

Un evento se **descarta completo** (no se clipea a ±1000 px): un delta espurio no debe girar **nada**, porque cualquier fracción que se aplique sigue siendo un giro arbitrario que el usuario no pidió. Recortar además daría la falsa sensación de que “algo” se aplicó, dificultando el diagnóstico.

**Por qué 1000 px:** un movimiento real de mouse entre dos frames es del orden de decenas a un par de cientos de px (incluso un flick rápido a 60 fps ronda los ~300-400 px en una pantalla grande). 1000 px por evento es **2.5× de headroom** sobre un flick legítimo y, aplicado con el factor `.0024`, serían **137°** — imposible de confundir con un movimiento intencional. El umbral es un valor de diseño tuneable si aparece un caso legítimo (falso positivo) que lo justifique.
**Alternativas descartadas:** (a) clipear el delta a ±`LOOK_MAX_PX` — un giro de “solo” 137° sigue siendo el bug; (b) umbral por unidad de tiempo (rate limiting) — necesita estado temporal, es más difícil de testear y descarta movimiento legítimo sostenido; (c) sacar la sensibilidad (bajar `.0024`) — no arregla el bug, solo lo hace menos visible, y empeora el control normal; (d) validar solo contra “el ancho de la ventana” — depende del tamaño de pantalla y no atrapa el caso `NaN`.

### 2. Semántica del borde: `|dx| < LOOK_MAX_PX` (estricto); 1000 exacto **se descarta**

`lookDeltaOk` devuelve `true` solo si `Number.isFinite(dx) && Number.isFinite(dy) && Math.abs(dx) < LOOK_MAX_PX && Math.abs(dy) < LOOK_MAX_PX`. O sea: **un componente exactamente igual a 1000 px es implausible y se descarta** (`>=` umbral ⇒ descartar).

**Por qué estricto y no `<=`:** hace que la constante sea una **cota superior exclusiva legible** (“por encima de esto el delta es espurio”): 1000 px en un solo evento ya es absurdo, así que el conjunto “válido” es `(-1000, 1000)`. Definir el borde así evita la discusión de “1000 está permitido o no”. El test lo fija explícitamente en los dos lados (`1000 → false`, `999 → true`), así que la semántica no queda implícita.
**Alternativa descartada:** `<=` (1000 permitido) — matemáticamente equivalente salvo en el borde, pero deja la constante como “cota inclusive” y hace que un evento de exactamente 1000 px (137°) pase, que es justo lo que se quiere descartar.

### 3. El guard vive en un bloque marcado `/* look:start */ … /* look:end */` en `index.html`

```js
/* look:start */
// Saneo del delta de mirada (spec player/look). Bloque autocontenido y puro: el test
// lookguard.mjs lo EXTRAE de este HTML y lo evalúa (mismo patrón que net/avatar y worldgen).
const LOOK_MAX_PX = 1000;    // px por evento; >= esto se considera espurio
const LOOK_WARN_MAX = 3;     // máximo de descartes que se detallan en consola
let lookSpikes = 0;          // contador acumulado de descartes (diagnóstico)
let lookSpikesWarned = 0;
let lookLockPending = false; // true = queda un evento posterior al lock por ignorar
// true = el delta (dx,dy) es plausible; false = descartar el evento entero.
// El borde es exclusivo: |dx| === LOOK_MAX_PX ya se descarta.
function lookDeltaOk(dx,dy){
  return Number.isFinite(dx) && Number.isFinite(dy) &&
         Math.abs(dx) < LOOK_MAX_PX && Math.abs(dy) < LOOK_MAX_PX;
}
// true = hay que ignorar ESTE evento (es el primero tras (re)adquirir el lock);
// consume la marca, así que el evento siguiente ya se procesa normalmente.
function lookLockSkip(){
  if(!lookLockPending) return false;
  lookLockPending=false;
  return true;
}
// Registra un descarte: SIEMPRE cuenta; los primeros LOOK_WARN_MAX los detalla en consola.
function noteLookSpike(dx,dy,src){
  lookSpikes++;
  if(lookSpikesWarned < LOOK_WARN_MAX){
    lookSpikesWarned++;
    console.warn(`[look] delta de mirada descartado #${lookSpikes} (${src}): dx=${dx} dy=${dy}`);
  }
}
/* look:end */
```

**Por qué un bloque extraíble:** el bug **no es reproducible headless** (es un evento de browser) y el proyecto ya resolvió ese problema con el patrón extract-eval para `net/avatar` y `worldgen`. Poner el guard en un bloque autocontenido permite que el test evalúe **el mismo texto** que corre el navegador y asierte su comportamiento real (no una copia ni un assert de texto frágil). El bloque se coloca **justo antes del handler `mousemove`** (zona de input, ~L2364), es autocontenido (solo `Number`/`Math`/`console`, todos globales) y se evalúa inline al cargar el script, así que cuando el navegador pueda emitir el primer evento el guard ya existe.

**Por qué no una función inline en el handler:** sería imposible de testear sin navegador, y el bug no se puede simular con un evento real en Node. **Por qué no un módulo `.js` aparte:** `index.html` es el juego completo en un solo archivo (sin build ni bundler) y el proyecto ya usa los bloques marcados; un archivo nuevo obligaría a `<script src>`/import.

**Detalle de diseño:** `lookDeltaOk` es **pura** (sin estado, sin efectos) para que el test la evalué con una tabla de casos; el contador y el aviso viven en `noteLookSpike` (efecto separado, también en el bloque) para no mezclar la política con el diagnóstico.

### 4. Detección del “primer evento tras el pointer lock”: bandera, no timer

Se agrega `lookLockPending = true` **dentro del bloque** y se setea desde el listener `pointerlockchange` existente (`index.html:2620`) cuando el lock **se toma** (`if(locked())`). El handler `mousemove` consume la bandera con el helper `lookLockSkip()` antes de aplicar:

```js
addEventListener('mousemove',e=>{
  if(state!=='play'||!locked()||dead) return;
  if(lookLockSkip()) return; // 1er evento tras el lock: delta espurio
  const mx=e.movementX, my=e.movementY;
  if(!lookDeltaOk(mx,my)){ noteLookSpike(mx,my,'mouse'); return; } // descartar ANTES de aplicar
  player.yaw-=mx*.0024;
  player.pitch=Math.max(-1.55,Math.min(1.55,player.pitch-my*.0024));
});
```

**Por qué el consumo en un helper del bloque (`lookLockSkip()`) y no inline:** la semántica “ignorar exactamente un evento y no más” es comportamiento testeable (una vez consumida, la marca no vuelve a aplicarse), y el helper la deja **dentro del bloque extraíble**, así que el test la asierte sobre el código real y no sobre una regex del handler. `lookLockPending` sigue siendo estado interno del bloque; el listener `pointerlockchange`, que es lo único que lo setea, no necesita pertenecer al bloque.

**Por qué una bandera y no un timestamp (`performance.now()-lockT < X`):** el evento espurio llega con el primer movimiento posterior al lock, sin importar cuánto tarde el usuario en mover el mouse; un umbral de tiempo descartaría el primer movimiento **legítimo** de un usuario que mueve el mouse rápido tras recuperar el foco, y dejaría pasar el espurio si el usuario tarda. La bandera es exacta: ignora **un** evento e inmediatamente vuelve a la normalidad. El costo de descartar un evento legítimo es **una** muestra perdida (una fracción de frame), imperceptible.
**Por qué en `pointerlockchange`:** el listener ya existe y es el único punto donde el cliente sabe que (re)adquirió el lock; no hace falta ningún evento ni temporizador nuevo. Se marca en `if(locked())` (cubre re-adquirir el lock tras Esc, cambio de pestaña y clic para recuperarlo); al perder el lock la bandera se consume sola o se vuelve a marcar en la próxima adquisición.

### 5. El path táctil usa el mismo guard (y la misma semántica)

El handler `pointermove` táctil aplica `lookDeltaOk(dx,dy)` sobre los deltas de pantalla (`dx = e.clientX - lookLX`) **antes** de tocar `player.yaw`/`player.pitch`, con la misma política de descarte. Con el pointer capture, un reset/lost-capture puede entregar un salto de coordenadas (por ejemplo de `clientX 1200` a `0`), que es exactamente el mismo problema con otra unidad.

**Detalle importante:** la referencia `lookLX`/`lookLY` se actualiza **siempre**, antes del guard, aunque el evento se descarte; si no, el siguiente evento se calcularía contra una referencia vieja y volvería a dar un delta enorme (quedando en descarte perpetuo hasta que el puntero vuelva al origen). La posición actual es un dato del input, no del movimiento: “descartar el delta” es ignorar la rotación, no ignorar dónde está el dedo.

```js
canvas.addEventListener('pointermove',(e)=>{
  if(!TOUCH||e.pointerType!=='touch'||lookTouchId!==e.pointerId) return;
  if(state!=='play'||dead) return;
  if(Math.hypot(e.clientX-tapX,e.clientY-tapY)>12) tapMoved=true;
  const dx=e.clientX-lookLX, dy=e.clientY-lookLY;
  lookLX=e.clientX; lookLY=e.clientY;                   // la referencia SIEMPRE se actualiza
  if(!lookDeltaOk(dx,dy)){ noteLookSpike(dx,dy,'touch'); return; } // descartar ANTES de aplicar
  player.yaw-=dx*.0042;
  player.pitch=Math.max(-1.55,Math.min(1.55,player.pitch-dy*.0042));
  e.preventDefault();
});
```

**Por qué el mismo umbral (1000 px) en táctil:** el delta táctil también es en px de pantalla y el gesto se limita al tamaño de la pantalla; 1000 px en un solo `pointermove` es igualmente anómalo. No se usa un umbral distinto para no introducir una segunda política (y un segundo caso de test) sin necesidad. **Alternativa descartada:** dejar el táctil sin guard — el bug reportado es de escritorio, pero el mismo delta espurio es posible con pointer capture y el costo de cubrirlo es una línea + un caso de test.
**Nota:** la bandera `lookLockPending` **no** aplica al path táctil (no hay pointer lock en táctil): el táctil solo usa `lookDeltaOk`.

### 6. Diagnóstico en consola: contador global + primeros `LOOK_WARN_MAX` avisos

`noteLookSpike(dx,dy,src)` incrementa `lookSpikes` **siempre** y emite `console.warn` con el índice del descarte, el origen (`mouse`/`touch`) y los valores `dx`/`dy` **solo para los primeros 3**. Es la evidencia que el usuario necesita para confirmar o refutar la hipótesis desde la consola si el giro vuelve a pasar.

**Por qué limitar los avisos:** un mouse con `movementX` basura puede generar cientos de descartes por segundo; sin tope, la consola se inunda y el warning deja de ser útil (y el propio `console.warn` agrega costo). El contador sigue subiendo, así que el usuario ve el total (`lookSpikes`) y los primeros valores. **Por qué `console.warn` y no un mensaje en pantalla:** el usuario que reporta el bug ya usa la consola del navegador; un toast in-game agregaría UI y estado para un diagnóstico de desarrollo. **Cómo lo lee el usuario:** si el giro vuelve, mira la consola y busca `[look] delta de mirada descartado`. Si aparece ⇒ hipótesis confirmada (y el `dx/dy` dice de qué magnitud era el pico). Si **no** aparece y el giro igual ocurre ⇒ el delta que gira la cámara **era plausible** (o la fuente no es el `mousemove`) y la hipótesis es **falsa** ⇒ plan B (ver riesgos).

### 7. Capability nueva `player/look`

El comportamiento que se especifica es el de la **mirada del jugador local** (cómo el input mueve yaw/pitch y qué se descarta) — un contrato observable propio. Se crea `player/look`.

**Por qué no las existentes:** `player/physics` cubre gravedad, colisión y el input de **desplazamiento/salto** con menús abiertos (no la orientación de la cámara); `net/avatar` cubre cómo se **ven los jugadores remotos** (el propio `design` de zombi lo dice: “el suavizado de avatares remotos”), y el bug es del jugador **local**; `player/combat`/`player/mining` son daño/minería; `ui/*` es interfaz. Ninguna describe el input de mirada.
**Alternativas descartadas:** (a) meterlo en `player/physics` — mezcla orientación con física de movimiento y ensucia un spec ya existente cuyo Purpose es “gravedad y colisión … con inventarios/chat/pausa abiertos”; (b) crear `player/input` genérico — sobredimensionado para un solo concern y deja la puerta abierta a un catch-all; (c) no spec-earlo — el comportamento es observable, tiene tests y va a evolucionar (sensibilidad, opciones de control), así que merece su contrato.

### 8. Estrategia de test: `server/test/lookguard.mjs` extrae y evalúa el bloque

El test (patrón `worldgen.mjs`/`avatar.mjs`) lee `index.html`, extrae `/* look:start */…/* look:end */`, verifica que los marcadores existan, y lo evalúa:

```js
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const i = html.indexOf('/* look:start */'), j = html.indexOf('/* look:end */');
const code = html.slice(i, j);
const warns = [];
const realWarn = console.warn; console.warn = (...a)=>warns.push(a.join(' '));
const API = new Function(code + '\n;return {LOOK_MAX_PX,LOOK_WARN_MAX,lookDeltaOk,lookLockSkip,noteLookSpike,spikes:()=>lookSpikes,warned:()=>lookSpikesWarned,setLockPending:v=>{lookLockPending=v}};')();
console.warn = realWarn;
```

Y aserta **comportamiento real** sobre el código del propio HTML:

| caso | esperado |
|---|---|
| `lookDeltaOk(12,-4)` | `true` (delta normal gira) |
| `lookDeltaOk(1000,0)` / `(0,1000)` / `(-1000,0)` | `false` (borde exacto ⇒ implausible) |
| `lookDeltaOk(999,0)` / `(0,-999)` | `true` (apenas por debajo ⇒ gira) |
| `lookDeltaOk(1e6,0)` / `(-1e6,0)` / `(0,1e6)` | `false` (desproporcionado) |
| `NaN`, `Infinity`, `-Infinity`, `undefined`, `null` (en `dx` y en `dy`) | `false` (no finito / ausente) |
| `lookLockSkip()` sin marca | `false` (no ignora nada) |
| `setLockPending(true)` + `lookLockSkip()` | `true` y luego `false` (ignora **exactamente un** evento) |
| `LOOK_MAX_PX === 1000` | fija la constante y el umbral del mensaje |
| `noteLookSpike(1e6,0,'mouse')` ×(LOOK_WARN_MAX+2) | `spikes()` sube en cada llamada; `warns.length === LOOK_WARN_MAX`; el primer mensaje contiene `dx=1000000` |

Más un **assert estructural acotado y comentado** (no reemplaza al de comportamiento; existe solo para fijar el **orden guard→aplicar**, que es imposible de asertar con la función pura sola):

- En el handler de escritorio, la posición de `lookDeltaOk(` es **menor** que la de `player.yaw-=` (comentado como “estructura, no comportamiento”).
- El handler táctil usa `lookDeltaOk(dx,dy)` antes de su `player.yaw -= dx`.
- El listener `pointerlockchange` setea `lookLockPending=true` (dentro de `if(locked())`) y el handler `mousemove` llama `lookLockSkip()` **antes** de aplicar.
- El handler táctil actualiza `lookLX`/`lookLY` antes del guard y llama `lookDeltaOk(dx,dy)` antes de aplicar.
- La bandera, el helper de consumo y el guard viven **dentro** del bloque `look` (o sea: son parte del contrato extraíble y se testean por comportamiento).

**Por qué esto es TDD real y no un assert de texto:** los casos de la tabla corren contra **la función evaluada del HTML** — si mañana alguien cambia el umbral, invierte la comparación o rompe `Number.isFinite`, el test lo detecta **por comportamiento** (el valor devuelto), no por un literal. El único assert textual es el del **orden** de las llamadas dentro del handler, que es una propiedad estructural legítima (y está explícitamente acotado y comentado como tal, con un `match` amplio `lookDeltaOk\(`/`player\.yaw\s*-=` para no ser frágil al formato). Se evita deliberadamente asertar strings completos del handler (que sí serían frágiles).
**Cobertura que no se intenta:** demostrar headless que el giro “ya no pasa”. Es no-reproducible por ser evento de browser; la garantía es el guard + los avisos de consola, y la validación final es manual (ver `tasks.md`).

### 9. Alta en la suite: 12 archivos

`lookguard.mjs` se agrega al script `test` de `server/package.json`. Se sube también el assert existente de `server/test/zombie-protocol.mjs:283-290` de **11 → 12** archivos (agregando `lookguard` a su lista `required` y el numeral del mensaje). Ese archivo **no** es uno de los 6 tests pre-existentes, así que respetar esa regla no impide mantenerlo coherente; sin actualizarlo, el test pasaría igual (solo verifica que los `required` estén), pero la garantía “el archivo nuevo está realmente cableado” quedaría del lado de la lista nueva. Se actualiza para que la intención quede explícita en un solo lugar por archivo.

## Risks / Trade-offs

- [Risk] **La hipótesis es correcta pero hay más de una causa** (p. ej. el pico también llega por un `mousemove` cuyo delta cae apenas por debajo de 1000 px, o por otro camino no rastreado) → El aviso de consola distingue el caso: si el giro vuelve **con** `[look] delta de mirada descartado`, el guard atrapó ese evento (y el `dx/dy` dice cuánto era); si vuelve **sin** aviso, el delta fue plausible o la fuente es otra ⇒ plan B (abajo). No se puede cerrar la hipótesis sin la observación del usuario. **Plan B declarado:** instrumentar temporalmente con un umbral de diagnóstico más bajo (avisar todo delta por encima de ~150 px), loguear la línea de tiempo de `pointerlockchange` (focus/blur), y verificar si lo que cambia es `player.yaw` (input) o la matriz de la cámara (otra causa); con eso se reabre la investigación.
- [Risk] **Falso positivo: un flick legítimo muy rápido con mouse de alta DPI y polling alto** podría superar 1000 px en un solo evento y descartarse → Aceptado: 1000 px es ~2.5× un flick normal; el costo sería perder una muestra (giro ligeramente más corto), no un salto, y `LOOK_MAX_PX` es una constante tuneable si se reporta.
- [Risk] **Descartar el primer evento tras el lock pierde una muestra real** para un usuario que mueve el mouse inmediatamente al recuperar el foco → Aceptado: es una fracción de frame (uno de ~60 eventos/s) e imperceptible; el costo de no hacerlo es justamente el giro de un saque.
- [Risk] **`Number.isFinite` rechaza strings/valores no numéricos** (`'12'` → `false`) → Correcto para el caso real (`MouseEvent.movementX` es number) y deseable para el latente (`undefined`/`NaN` no deben envenenar el yaw); un evento sintético con strings se descartaría, y eso es aceptable (no hay ningún emisor así en el juego).
- [Risk] **La bandera `lookLockPending` depende del path de `pointerlockchange`**: si algún navegador adquiere el lock sin disparar el evento (no ocurre en los soportados), el primer evento no se filtraría → Mitigación: el guard de delta cubre igual el caso (un pico grande se descarta); la bandera es una capa más, no la única.
- [Risk] **Bridge con el táctil**: `lookLockPending` no aplica al táctil y el guard sí; si un dispositivo mezcla ambos paths, el guard sigue siendo compartido → Aceptado: son caminos mutuamente excluyentes (`TOUCH` vs pointer lock), y el guard es el denominador común.
- [Risk] **El test no demuestra que el bug desapareció** (no reproducible headless) → Declarado: el test verifica el **guard** (comportamiento real de la función extraída) y un assert estructural del orden; la validación del bug es **manual** y la evidencia es el contador/aviso de consola. Se documenta en `tasks.md` como prueba manual.
- [Risk] **El assert estructural del orden (`lookDeltaOk` antes de `player.yaw-=`) es un regex sobre `index.html`** → Mitigación: `match` amplio (`lookDeltaOk\(`, `player\.yaw\s*-=`) y comentado como estructura (la garantía de comportamiento está en la tabla de casos); no asertar el texto completo del handler.
- [Risk] **BLOQUEANTE POTENCIAL — hallazgo latente (documentado, NO se arregla en este change):** `yawToward` (`index.html:1956-1960`) normaliza el ángulo con `while(dy>Math.PI)dy-=2*Math.PI; while(dy<-Math.PI)dy+=2*Math.PI;`, que es **O(|dy|/2π)**, y `player.yaw` **acumula sin normalizarse nunca** (`player.yaw-=…` para siempre) y se envía crudo en `mv`. En sesiones muy largas el yaw enviado crece sin cota; entonces **cada cliente remoto** (y cada avatar interpolado) puede iterar cientos de vueltas por frame ⇒ costo de CPU y jitter en los avatares remotos. Es un problema de **hardening aparte** (candidate a otro change: normalizar `player.yaw` a `[-π,π]` en el origen y/o reemplazar el `while` por `atan2(sin,cos)`), fuera del foco de este fix. Se deja anotado para no perderlo.
- [Risk] **Latente relacionado (fuera de alcance):** `applyPm` (`1990-1991`) asigna `a.yaw=m.yaw` y `a.held=m.held` con guardas de `Number.isInteger`, pero **no valida finitud de `yaw`**; un server viejo/modificado que mande `yaw:NaN` dejaría el avatar remoto con `yawToward → NaN` (solo avatar remoto, no la cámara propia). Se menciona como oportunidad, no se toca.
- [Risk] **Cambio solo de cliente** ⇒ el HTML cacheado puede seguir con el bug hasta el próximo refresco → Mitigación: el static se sirve `no-cache`; el deploy no toca el servidor y el rollback es revertir `index.html`.

## Migration Plan

- **Deploy:** cambio de **cliente** (`index.html`) + tests. No toca `server/server.js`, el protocolo ni `world.json` ⇒ sin migración de datos y sin cambios de compatibilidad con clientes/servidores de otras versiones (los mensajes son idénticos). El push a `main` dispara CI + deploy; el HTML se sirve `no-cache`, así que el fix llega al próximo refresco.
- **Rollback:** revertir `index.html` (+ el test y la línea del script `test`). No hay datos ni estado persistido que revertir.
- **Orden seguro:** nada que coordinar; el guard es local y no cambia el tráfico.

## Open Questions

- ¿Conviene exponer el contador `lookSpikes` de alguna forma visible (p. ej. `console.log` de resumen al pausar, o un campo de debug en el HUD) si el usuario preferiría no mirar la consola? Se puede agregar encima sin cambiar el spec; hoy alcanza con `console.warn`.
- ¿El umbral de 1000 px debería ser por eje o por módulo del vector (`hypot`)? Hoy es por eje (más simple, y un pico suele ser en un eje); si aparecen falsos positivos por combinaciones, se puede pasar a `hypot` sin cambiar el spec (el spec dice “cualquiera de sus componentes”).
- ¿Se quiere además una normalización de `player.yaw` (riesgo latente) en un change propio? No forma parte de este change.
