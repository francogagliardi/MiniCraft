# Design

## Context

Ver `proposal.md` (Why). Estado actual relevante:

- `index.html` (~656-675) fija la atmósfera a valores diurnos: `scene.background = 0x8ecdf5`, `scene.fog = Fog(0xbfe3ff, 34, 180)`, `HemisphereLight(0xd8ecff, 0x8a7a5a, .95)`, `DirectionalLight` sol (`0xfff2d8`, 1.9) con sombra, un shader de cielo (esfera `BackSide` con uniforms `top`/`bot`) y un `sunSprite` (círculo) en posición fija. El shader del cielo se crea inline dentro de un `new THREE.Mesh(new THREE.ShaderMaterial(...))` **sin guardar referencia**: hay que guardarlo (`skyMat`) para poder animar `top`/`bot`. El `sunSprite` ya es un `const`, así que se puede animar; el `sun` (luz) también.
- `tickWater()` (~2441-2448) hoy **pisa** `scene.fog.color/near/far` y `scene.background`: al entrar al agua setea `0x1a6fd0` + `near=1/far=26`, y al salir **restaura valores de día hardcodeados** (`0xbfe3ff`/`34`/`180`, `0x8ecdf5`). Ese `else` es exactamente lo que rompería el día/noche y hay que recomponer.
- `server/server.js`: el server es stateless salvo `seed`/`edits`; no hay ningún estado temporal. `welcome` (~128-133) manda `id`, `seed`, `edits`, `admin`, `players`. Existe `broadcast()` (~69-74) y un `setInterval` de heartbeat (~92-107). `world.json` se guarda con `{ seed, edits }` (`save()`, ~55-57) — el reloj **no** debe tocarlo.
- El cliente abre el WS en `connectMP()` (~2205-2227); `welcome` se maneja ahí y luego `setupNetHandlers()` (~2228-2273) enruta los mensajes por tipo. Existe `netSend()` y un `setInterval` de `mv` cada 70 ms.

## Goals / Non-Goals

**Goals:**

- Reloj único server-authoritative, difundido de forma compacta, sin depender del reloj del sistema del cliente (evitar skew).
- Render de día/noche fluido en el cliente, tolerante a latencia, mensajes perdidos y reconexión.
- Un **único punto** de aplicación de la atmósfera (`applyAtmosphere()`) que componga día/noche **y** el estado bajo el agua, para que no se pisen.
- Constantes tuneables y señal `isNight` reutilizable por el futuro zombi.
- Cubrir la parte de servidor con test de protocolo real.

**Non-Goals:**

- Estrellas, ciclo de clima, partículas nocturnas o cambios de temperatura/diseño de juego.
- Persistir la hora entre reinicios del server (cada boot reancla el ciclo).
- Cambiar la regla de `world/water` ni el canal de edits.
- Sincronizar el ciclo con la hora real del mundo (es un ciclo de juego, no un reloj civil).

## Decisions

### 1. El server posee el reloj; el cliente solo renderiza

El server ancla `T0 = Date.now()` al boot y calcula la fase en cada difusión:

```js
const CYCLE_MS = DAY_MS + NIGHT_MS;               // 480000
function phaseNow() { return ((Date.now() - T0) % CYCLE_MS) / CYCLE_MS; } // v ∈ [0,1)
const isNight = () => phaseNow() >= NIGHT_START;   // NIGHT_START = DAY_MS / CYCLE_MS = 0.625
```

**Por qué:** el futuro zombie server-auth decide spawnear de noche; si la hora fuera del cliente, dos jugadores con relojes distintos verían la noche en momentos distintos y el spawn sería inconsistente. El server es el único punto común. **Alternativa descartada:** que cada cliente lleve su propio reloj (más simple, pero rompe la consistencia exigida).

### 2. Difusión compacta: `tod` en `welcome` + `tod` periódico (no offsets)

- `welcome` gana dos campos: `tod` (fase `0..1`) y `cyc` (`CYCLE_MS`).
- Nuevo mensaje difundido a todos: `{ t:'tod', v:<0..1> }` cada **`TOD_INTERVAL_MS = 4000`** ms (env `TOD_INTERVAL_MS` para acortar en tests, igual que `HB_INTERVAL_MS`).

**Mensajes concretos:**

```js
// welcome (campos agregados)
{ t:'welcome', id, seed, edits, admin, adminDenied, tod: 0.4123, cyc: 480000, players:[...] }
// difusión periódica
{ t:'tod', v: 0.4123 }
```

**Por qué `tod`+`cyc` y no un `t0`/timestamp absoluto:** un `t0` absoluto obliga al cliente a comparar relojes (skew). Mandando la **fase** + la duración, el cliente arranca su propio avance desde el instante de recepción; el desfase de reloj deja de importar y solo importa el drift entre difusiones, que la corrección absorbe. **Alternativa descartada:** mandar `Date.now()` del server y derivar (frágil ante skew y NTP). **Alternativa descartada:** difundir solo en `welcome` (el cliente derivaría sin corrección y acumularía error con el tiempo; sin redifusión, reconectar es lo único que resincroniza).

Mandar `cyc` solo en `welcome` alcanza (es constante); el `tod` periódico no repite `cyc` para mantenerlo mínimo.

### 3. Cliente: avance local + corrección suave + snap

Estado en el cliente:

```js
let dayV = 0, dayTarget = 0, hasTod = false, cycleMs = 480000;
const TOD_SNAP_DELTA = 0.05;   // desfase > 25s de ciclo → snap
const TOD_CORRECT_K  = 0.5;    // 1/s: converge en ~2 s
```

Al recibir `tod` (o el `tod` de `welcome`):

```js
function onTod(v){
  dayTarget = v;
  if(!hasTod){ dayV = v; hasTod = true; return; }        // primera vez: adopción directa
  let d = dayTarget - dayV; d -= Math.round(d);          // camino corto, con wrap
  if(Math.abs(d) > TOD_SNAP_DELTA) dayV = dayTarget;     // reconexión/desfase grande: snap
}
```

Cada frame (en `loop()`):

```js
dayV = (dayV + dt*1000/cycleMs) % 1;                     // avance local
let d = todNow(now, cycleMs) - dayV; d -= Math.round(d); // corrección suave hacia el objetivo EXTRAPOLADO
dayV = (dayV + d * Math.min(1, TOD_CORRECT_K*dt) + 1) % 1;
```

> **Nota:** el objetivo debe extrapolarse (`todNow`, ver decisión 9). Corregir contra el `tod` congelado hace que la velocidad de la fase decaiga hacia 0 entre difusiones y salte en cada mensaje.

**Por qué:** el avance local evita depender del reloj del sistema y mantiene el movimiento continuo; la corrección del `d` (camino corto con `Math.round` para el wrap `0↔1`) evita saltos en cada `tod`; el snap solo aparece ante desfases grandes (reconexión). **Alternativa descartada:** lerpear `dayV` directo a `dayTarget` en cada `tod` — produce micro-saltos y, si el cliente estuviera pausado, un salto notorio.

**Modo solo:** sin servidor no llega ningún `tod`; `hasTod` queda en `false` y el ciclo avanza con el reloj local desde `dayV = 0`. La misma mecánica sirve: el `dayTarget` local se iguala a `dayV` a medida que avanza (o simplemente se corre sin corrección). En síntesis, "sin difusión, el cliente es su propio reloj a la misma tasa".

### 4. Constantes del ciclo (tuneables, mismas en server y cliente)

```js
const DAY_MS     = 300000;   // 5 min de día
const NIGHT_MS   = 180000;   // 3 min de noche
const CYCLE_MS   = 480000;   // 8 min (DAY_MS + NIGHT_MS)
const DAWN_MS    =  25000;   // amanecer  ~25 s
const DUSK_MS    =  25000;   // atardecer ~25 s
const NIGHT_MIN  =   0.50;   // luz mínima de noche: 50 % del día
const NIGHT_START = DAY_MS / CYCLE_MS; // 0.625 → isNight = v >= 0.625
```

Layout del ciclo (desde `v=0`, que es el inicio del amanecer):

| tramo `v` | ms desde inicio | luz |
|---|---|---|
| `[0, 0.0521)` | `[0, 25000)` | amanecer: `NIGHT_MIN → 1` |
| `[0.0521, 0.5729)` | `[25000, 275000)` | día pleno: `1` |
| `[0.5729, 0.625)` | `[275000, 300000)` | atardecer: `1 → NIGHT_MIN` |
| `[0.625, 1)` | `[300000, 480000)` | noche plena: `NIGHT_MIN` |

`DAWN_MS`/`DUSK_MS` caen dentro del tramo de día (5 min incluye sus transiciones), consistente con "5 min de día + 3 min de noche". Un único factor `light(v)` (triangular suavizado por los tramos de transición) alimenta toda la iluminación.

### 5. Un único `applyAtmosphere(light)` que compone agua + ciclo

Se extrae de `tickWater()` la aplicación de atmósfera a una función que decide entre modo "bajo el agua" y modo "superficie":

```js
function applyAtmosphere(light){
  if(under){                                   // el agua manda: azul oscuro, niebla corta
    scene.fog.color.setHex(WATER_FOG);         // 0x1a6fd0
    scene.fog.near = 1; scene.fog.far = 26;
    scene.background.setHex(WATER_FOG);
  } else {                                     // superficie: día/noche según light
    scene.fog.color.copy(FOG_NIGHT).lerp(FOG_DAY, light);
    scene.fog.near = 34; scene.fog.far = 180;
    scene.background.copy(BG_NIGHT).lerp(BG_DAY, light);
  }
  // cielo y luz ambiente (siempre, o modulados por light)
  skyMat.uniforms.top.value.copy(SKY_TOP_NIGHT).lerp(SKY_TOP_DAY, light);
  skyMat.uniforms.bot.value.copy(SKY_BOT_NIGHT).lerp(SKY_BOT_DAY, light);
  hemi.intensity = HEMI_DAY * (NIGHT_MIN + (1-NIGHT_MIN)*light);
}
```

La **posición** de los astros, la `sun.intensity` direccional y la visibilidad de los sprites (`sunSprite`/`moonSprite`) y las sombras del sol se resuelven en `tickSky(v)` (cada frame, ver decisión 8), no en `applyAtmosphere` (que es la paleta/ambiente, aplicada por tramos).

`tickWater()` deja de tocar colores/fog: solo mantiene el flag `under` y el overlay DOM (`waterEl`), y **llama a `applyAtmosphere()`** cuando cambia `under`. `loop()` llama a `applyAtmosphere()` cuando `light` cambió más de un epsilon (p. ej. `0.002`) o cambió `under`, para no recalcular por frame sin motivo.

**Por qué un único punto:** hoy `tickWater` y el ciclo competirían por `scene.fog`/`scene.background`; centralizar evita que "salir del agua" restaure valores de día hardcodeados y que la noche pise el azul del agua. El agua mantiene prioridad cuando `under === true`, y el ciclo manda en superficie.

### 6. Paleta (valores exactos)

| elemento | día | noche |
|---|---|---|
| `scene.background` | `0x8ecdf5` | `0x0f1c33` |
| `scene.fog.color` | `0xbfe3ff` | `0x16233d` |
| cielo `top` | `0x4fa3e8` | `0x0a1730` |
| cielo `bot` | `0xe8f6ff` | `0x1d3358` |
| `hemi.intensity` | `0.95` | `0.475` (= `0.95*0.50`) |
| `hemi` color cielo | `0xd8ecff` | `0x2a3f66` |
| `hemi` color suelo | `0x8a7a5a` | `0x2e2718` |
| `sun.intensity` | `1.9` | `0.0` |
| `sunSprite` | visible (arco diurno) | oculto |
| `moonSprite` | oculto | visible (arco nocturno) |
| `moonLight.intensity` | `0.0` | `0.18` (tenue, sin sombras) |

La noche queda **azul profundo** (`0x0f1c33`/`0x16233d`), nunca negra, y la luz mínima al 50 % da legibilidad sin sol directo. La niebla de superficie mantiene `34/180` para no alterar la distancia de vista existente.

### 7. `isNight` compartido

Server: `isNight()` (arriba). Cliente: `isNight = v >= NIGHT_START`. Se expone para que el sistema futuro (zombis) consuma la misma señal y no reimplemente el umbral. **No** se agrega todavía lógica de spawn: solo la señal.

### 8. Sol y luna móviles sobre un arco (feedback tras probar)

El `sunSprite` deja de estar fijo: recorre un arco parametrizado por el **progreso del día** `p = v / NIGHT_START ∈ [0,1)` (0 = horizonte este, 0.5 = cenit, 1 = horizonte oeste). La luna usa el **mismo sentido** que el sol (este→oeste) parametrizado por el **progreso de la noche** `q = (v - NIGHT_START) / (1 - NIGHT_START) ∈ [0,1)`. La posición se calcula con un único helper y se recalcula **cada frame** (movimiento continuo), mientras la paleta sigue aplicándose por tramos:

```js
const SKY_R = 230, SKY_TILT = 70, SKY_Y0 = 6, LIGHT_R = 80;
function skyArc(p, flip, radius, tilt, out){
  const a = Math.PI * (flip ? 1-p : p);
  out.set(W/2 + Math.cos(a)*radius, SKY_Y0 + Math.sin(a)*radius, W/2 + (flip ? -tilt : tilt));
}
```

- **Visibilidad/ocultado:** `sunSprite.visible = !night && d > 0.15`; `moonSprite.visible = night`. De noche el sol se oculta y de día la luna se oculta.
- **La luz sigue al sol:** la `DirectionalLight` `sun` se coloca sobre el mismo ángulo con un radio menor (`LIGHT_R`) para no cambiar el `shadow.camera.far` existente; `sun.target` sigue en el centro. La `sun.intensity` se fija en `tickSky` (`= SUN_DAY*d`, exactamente `0` de noche) y `sun.castShadow = !LOW && !night && y > SUN_SHADOW_MIN_Y`, para no romper las sombras con el sol bajo. De noche el sol no proyecta sombras.
- **Luz de luna (opcional, incluida):** `moonLight` es una `DirectionalLight` azulada (`0x9db4ff`) de intensidad `MOON_LIGHT = 0.18` **sin sombras** (`castShadow = false`), activa solo de noche y siguiendo el arco de la luna, para que la noche no quede plana sin competir con el shadow map del sol.

**Por qué:** el movimiento continuo exige recalcular posiciones por frame (no se puede depender del throttle de la paleta), y separar `tickSky` (posiciones/visibilidad/sombras) de `applyAtmosphere` (colores/intensidades) mantiene un único punto de aplicación de la paleta y un único punto de movimiento de astros.

### 9. Target extrapolado: velocidad uniforme del ciclo (fix del diente de sierra)

**Bug observado:** el sol/luna se movían a velocidad **no uniforme** (frenaban y saltaban), más notorio con el ciclo rápido. Causa: `dayTarget` era el `tod` **congelado** del último mensaje (hasta `TOD_INTERVAL_MS = 4000` ms viejo). Mientras el cliente avanzaba su fase, la corrección lo traía hacia ese objetivo fijo: con `dv/dt = 1/cyc + K·(target − v)` y `target` constante, la fase converge a un equilibrio donde la velocidad tiende a **0** (frena); al llegar el `tod` nuevo el objetivo salta hacia adelante y la corrección acelera la fase para alcanzarlo (salto/diente de sierra).

**Fix:** el objetivo avanza a la **misma tasa** que la fase local, extrapolado desde el instante de recepción del `tod`:

```js
let dayV=0, dayTarget=0, todAt=0, hasTod=false, cycleMs=CYCLE_MS;
// target extrapolado: entre difusiones avanza a la misma tasa (misma base de tiempo que el loop:
// el `now` de requestAnimationFrame = performance.now())
function todNow(now,cyc){ return (dayTarget+(now-todAt)/cyc)%1; }
function onTod(v, now){
  if(!(v>=0&&v<1)) return;
  if(now===undefined) now=performance.now();
  dayTarget=v; todAt=now;                                // guarda fase + instante (también en el snap)
  if(!hasTod){ dayV=v; hasTod=true; return; }
  let d=v-dayV; d-=Math.round(d);
  if(Math.abs(d)>TOD_SNAP_DELTA) dayV=v;                 // reconexión: snap (todAt ya quedó en `now`)
}
// loop:
dayV=cycleAdvance(dayV,dt,cycleMs);
if(hasTod) dayV=cycleCorrect(dayV,todNow(now,cycleMs),dt);
```

**Por qué funciona:** como `todNow` y `dayV` avanzan a la misma tasa, la diferencia `d` **no crece con el tiempo**; la corrección solo absorbe la deriva real (reloj/latencia), que es pequeña. Resultado: velocidad ≈ constante, sin frenadas ni diente de sierra. El **snap** ante desfase grande (`TOD_SNAP_DELTA`) se conserva para reconexión (y refresca `todAt` para reanclar la extrapolación). **Verificación:** test estático simula el cliente con `tod` cada 4 s y compara la dispersión de velocidad entre el target congelado (bug) y el extrapolado (fix): `sd ≈ 9.35e-3×tasa` vs `sd ≈ 2.31e-7×tasa` (y la velocidad mínima del bug cae a ~0.31×tasa).

## Risks / Trade-offs

- [Risk] El reloj derivado del cliente puede derivar si se pierden `tod` seguidos → Mitigación: difusión cada 4 s + corrección suave; el avance local usa la misma tasa (`cyc`), así que el drift es mínimo y la corrección imperceptible.
- [Risk] `applyAtmosphere()` por frame puede costar en móvil (LOW) → Mitigación: recomputar solo si `light` cambió > `0.002` o cambió `under`; el día pleno y la noche plena son tramos constantes, sin recomputos.
- [Risk] Reconexión con desfase grande generaría un salto visible → Mitigación: snap explícito (es preferible un corte al entrar, no durante el juego normal); el umbral `0.05` (~25 s de ciclo) es amplio para no confundir drift con reconexión.
- [Risk] Test frágil esperando 4 s de difusión → Mitigación: `TOD_INTERVAL_MS` por env, igual que el patrón de `HB_INTERVAL_MS`/`IDLE_TIMEOUT_MS` de `net/presence`; el test lo acorta y verifica `tod` en rango y que `world.json` no gana campos.
- [Risk] Cambio de estado temporal en el server (primera vez) → Mitigación: el reloj es puro (ancla + `Date.now()`), sin estado mutable compartido ni I/O; no se toca `save()` ni `world.json`.
- [Risk] Clientes viejos cachean `index.html` y reciben `tod`/campos extra → Mitigación: `tod` es aditivo y los campos extra en `welcome` los ignora el cliente viejo; el static se sirve con `no-cache`.
- [Risk] Con el sol bajo (amanecer/atardecer) la dirección de luz casi horizontal genera sombras largas fuera del frustum → Mitigación: la `sun` se coloca a `LIGHT_R` (radio corto, `LIGHT_R² + SKY_TILT² < shadow.camera.far`) y `sun.castShadow` se apaga cuando el sol está por debajo de `SUN_SHADOW_MIN_Y`; la intensidad además tiende a 0 por la fase.
- [Risk] El sprites del sol/luna a distancia ~240 quedarían comidos por la niebla (`far=180`) → Mitigación: sus `MeshBasicMaterial` usan `fog:false`, igual que antes el `sunSprite`.

## Migration Plan

- Deploy: como el change toca `server/server.js`, el push a `main` dispara CI + deploy Easypanel. `index.html` es estático y viaja en el mismo deploy. Sin migración de datos (`world.json` intacto).
- Compatibilidad: server nuevo + cliente viejo = cliente ignora `tod`/campos extra (sigue de día). Cliente nuevo + server viejo = sin `tod` → modo solo local (ciclo visible, sin hora compartida). Ambos degradan sin romper.
- Rollback: revert del change; no hay datos que revertir. Tras el rollback el juego vuelve al día fijo.

## Open Questions

- ¿La noche debe incluir estrellas? (fuera de alcance; la luna ya está incluida y las estrellas se pueden agregar encima sin cambiar la spec)
- ¿El server debería pausar el ciclo cuando no hay jugadores? (hoy corre igual; irrelevante porque el reloj es barato y se reancía al boot)
