# Design

## Context

Verificado sobre el código actual (`index.html`, Three.js `0.160.0` por importmap):

- **Escena sin luces puntuales** (`index.html:827-873`): solo `HemisphereLight` (`hemi`) y dos `DirectionalLight` (`sun` con sombras opcionales, `moonLight`). No hay `PointLight`, `AmbientLight` ni `toneMapping`.
- **Calidad** (`index.html:962-980`): `QUALITY_LEVEL ∈ {0,1,2}`, `applyQuality(level)` aplica antialias (recreando el renderer), pixelRatio, `shadowMap`, niebla y `sun.shadow.mapSize`. Se persiste en `mc-quality` (`index.html:3422-3426`, boot `3507-3517`). La UI está en `#configPanel` (`index.html:340-359`).
- **Mundo** (`index.html:1153-1158`): un único `Uint8Array(W*H*W)` de ids, `W=208, H=40`, `widx=(y*W+z)*W+x`, `inB`, `get`, `rawSet`. **No hay metadata por celda**: la orientación no puede guardarse.
- **Meshing** (`index.html:1267-1285`, `1422-1458`): un `BufferGeometry` opaco por chunk (169 chunks de 16×16) más 5 builders globales por chunk (`transMeshes`, `flowerMeshes`, `glowMeshes`, `torchMeshes`, `slabMeshes`). `emitGlobalCell(x,y,z,b,T,F,G,TM,S)` decide la rama por bloque. `buildGlobalsForChunk` reconstruye un chunk; `refreshAt(x,z)` reconstruye el chunk propio y los vecinos de borde. Tanto `editBlock` (`1673`) como el handler `pedit` (`3284-3285`) llaman a `refreshAt`.
- **Materiales** (`index.html:1224-1230`): `matOpaque`/`matTrans`/`matFlower` son `MeshLambertMaterial` (reciben luz); `matGlow`/`matTorch` son `MeshBasicMaterial` (unlit). `MeshLambertMaterial` en r160 es **per-fragment** (confirmado en la doc de r160), así que una `PointLight` se ve suave incluso con caras de 4 vértices.
- **Antorcha** (`index.html:1309-1317`): dos cross-quads de `0.2..0.8` en horizontal y `y=0..0.8`, tile 32 con `alphaTest`.
- **Ids** (`index.html:489-501`): `TORCH=33` (`flower:1`, `tile:32`), `GLOW=10` (`glow:1`, tile 11). `BED_Z_HEAD=63` es el último; **64 está libre**. `DEFS` en `583-649`, `INVENTORY` en `650`, `DEFAULT_HOTBAR` en `651`. Atlas 8×5 tiles de 16px (`683-801`); tiles 37-39 libres.
- **Colocación** (`index.html:2846-2915`): `doPlace()` calcula `destino = hit + normal`; la rama `dd.flower` (`2875-2879`) exige `isSolid` debajo solo para `TORCH`. `doBreak` (`2819-2826`) rompe una celda. `raycast` (`2006`) considera `cube || flower || glow || door`.
- **Colisión/paso** (`index.html:1170-1172`, `561-564`): `isSolid` = `cube || glow` (más puertas cerradas); `mobBlocked` exime aire, agua, flores, **antorcha** y puertas abiertas. Cualquier id nuevo se considera sólido para mobs/bot si no se lo exime.
- **Servidor** (`server/server.js:361-370`): acepta `v ∈ [0,64]`, rechaza `y===0` y bedrock; no valida soporte ni placement.
- **Tests**: `server/test/static.mjs:34-46` hardcodea ids 0-63; `worldgen.mjs:131` extrae la línea de ids hasta `BED_Z_HEAD=63;` y `worldgen.mjs:118-146` testea el drift `mobBlocked ↔ isSolid`; `bed-sleep.mjs:88` usa la misma regex; el conteo 22 está en `package.json:7`, `config.mjs:182`, `lookguard.mjs:314-315`, `bed-sleep.mjs:197`, `camera.mjs:299/303`, `zombie-protocol.mjs:308`.

## Goals / Non-Goals

**Goals**

- Antorchas y farolas alumbran de verdad alrededor, con un pool fijo de luces sin sombras dinámicas (la oclusión la resuelven `blockedLOS` y la atenuación ambiental `skyReachable`). La lucerita brilla con su material unlit pero no emite luz.
- Atenuar la luz ambiental cuando el jugador no ve el cielo, para que encerrarse se vea oscuro aunque el `HemisphereLight` no proyecte sombra.
- Apagado automático y en caliente al bajar la calidad (nivel 0 = sin luces).
- Antorcha orientable en piso, pared y techo con un solo ítem.
- Farola colgante nueva (id 64) con luz hacia abajo (cono direccional).
- Cero cambios de protocolo y compatibilidad con clientes viejos, bots y mundos guardados.

**Non-Goals**

- Propagación de luz por vóxel / horneado, sombras dinámicas de antorchas/farolas, parpadeo.
- Cambiar el ciclo día/noche o las constantes de iluminación global (`NIGHT_MIN`, `HEMI_DAY`, `SUN_DAY`): el brillo del jugador solo se clampea a su rango `[1,3]`.
- Validación de soporte en el servidor.
- Reemplazar los materiales unlit de los bloques emisores.

## Decisions

### 1. Pool fijo de luces

Se crean **8 `PointLight`** y **8 `SpotLight`** (para farolas) una sola vez, al inicializar la escena (junto a `hemi`/`sun`), con `intensity = 0`, `castShadow = false`, `visible = false` y agregadas al `scene`. Cada spot tiene su propio `Object3D` target, también en la escena. Nunca se agregan ni se quitan en caliente.

Por qué:

- Tres.js compila el programa de cada material para la cantidad de luces **visibles** en la escena. Agregar o quitar luces (o alternar `visible`) dispara una recompilación de shaders y un hitch visible.
- Con el pool fijo el costo de shader queda acotado y **estable por nivel**: el peor caso es un programa con `NUM_POINT_LIGHTS = 8` y `NUM_SPOT_LIGHTS = 8`, y el set visible se decide solo al arrancar o al cambiar de calidad (decisión 17).
- Apagar una fuente = `intensity = 0`; `visible` lo fija `applyLightVisibility()` con el set fijo del nivel y no cambia al caminar.

Unidades: en r160 `PointLight` usa **candela** con `decay = 2` por defecto (`useLegacyLights` ya es `false`). La irradiancia cae como `I/(π·d²)`, así que las intensidades de la tabla son del orden de 10-25, no de 1. Los `SpotLight` usan la misma unidad, `angle = 1.15`, `penumbra = 0.5`, `distance = 14` y `decay = 2`.

### 2. Presupuesto por calidad

| Nivel | Nombre | Luces visibles |
|---|---|---|
| 0 | Super optimizada (2 núcleos) | 0 |
| 1 | Baja/rápida (default táctil) | 2 puntos + 2 spots = 4 |
| 2 | Alta (default PC) | 8 puntos + 8 spots = 16 |

`POINT_VISIBLE = [0, 2, 8]` y `SPOT_VISIBLE = [0, 2, 8]` definen el set FIJO por nivel; `LIGHT_BUDGET` es su suma (`[0, 4, 16]`). `applyQuality(level)` fija `LIGHT_BUDGET[level]`, llama a `applyLightVisibility()` (una sola recompilación, acción discreta del usuario) y después a `refreshLights(true)`. No toca el tamaño del pool. Los conos de farola **cuentan dentro del mismo presupuesto**: una farola ocupa un spot; nunca suma una luz extra y nunca cae a un punto. Con presupuesto 0 el pool entero queda oculto (`visible = false`), no solo con intensidad 0.

Durante el juego la cantidad de luces visibles **no cambia**: caminar solo reasigna intensidades dentro del set fijo, así que no hay recompilas en caliente (decisión 17).

### 3. Índice de fuentes por chunk

En `buildGlobalsForChunk(cx,cz)` se arma/actualiza `chunkLights["cx,cz"] = [x,y,z,id, ...]` en el mismo barrido que ya recorre las 16×40×16 celdas: un `if (isLightEmitter(b))` por celda, costo despreciable frente al meshing de esa misma celda.

- `isLightEmitter(id)` es puro: `TORCH || LAMP`. `GLOW` queda afuera a propósito: su material unlit lo hace brillar, pero no ilumina alrededor ni entra en `chunkLights`.
- El índice se refresca **gratis** en cada edición porque `refreshAt` reconstruye los chunks afectados, tanto para edits locales (`editBlock`) como remotos (`pedit`).
- No se indexan `DOOR`/`SLAB`/etc. Solo fuentes.

### 4. Selección por frame (cada 0.25 s)

`refreshLights(force)` corre en el loop:

1. Si `now - lastPick < 250 ms` y no es forzado, sale.
2. Recorre los chunks en radio 2 alrededor del chunk del jugador (máximo 25 chunks).
3. Junta candidatos de `chunkLights`, descarta los que están más lejos que `LIGHT_MAX_DIST` (20) y se queda con los `K = LIGHT_BUDGET[level]` de menor distancia² al ojo (inserción acotada, sin ordenar todo).
4. Aplica `lightFade(d, LIGHT_MAX_DIST, LIGHT_FADE_BAND)` (banda de 6 bloques) a la intensidad: 1 hasta 14 bloques, `smoothstep` decreciente de 14 a 20 y 0 en el corte. Así la fuente no desaparece de golpe al alejarse.
5. Reparte las `K` fuentes con `lightSlots(ids, K, LAMP_POOL_SIZE)`: cada farola toma un spot libre y, si no quedan, se omite (queda apagada hasta que se libere uno); nunca cae al pool de puntos. Las antorchas usan los puntos. `lightSlots` devuelve `{ spot, slot, src }`, con `src` = índice de la fuente en la lista ordenada: como una farola omitida no consume slot, `refreshLights` aplica cada slot a `best[src]` y no por posición. Asigna a cada slot **visible para el nivel** (`slot < POINT_VISIBLE[QUALITY_LEVEL]` / `SPOT_VISIBLE[QUALITY_LEVEL]`) posición, color, `intensity * fade`, `distance` y `decay` según la spec del id; los slots ocultos y todo el pool que sobra quedan con `intensity = 0`.
6. No toca `visible` ni `castShadow`: el set visible es fijo por nivel (`applyLightVisibility`) y las luces del pool no proyectan sombras (decisión 12). La oclusión ya se resolvió en el paso 3 con `blockedLOS`.

Se fuerza también al cambiar de calidad y cuando `refreshAt` marca `lightsDirty` (para que una antorcha recién puesta alumbre en el mismo tick, no hasta 0.25 s después).

Costo: proporcional a la cantidad de fuentes indexadas en 25 chunks (típicamente decenas), no a las 1.7 M de celdas. Un chunk patológico lleno de antorchas sigue acotado por el radio y por la cadencia de 4 veces por segundo; se mide en Docker y, si hiciera falta, se agrega un tope por chunk (ver Open Questions).

### 5. Especificaciones de luz por bloque

Constantes puras en un bloque `/* lighting:start */ … /* lighting:end */` extraíble por los tests (mismo patrón que `worldgen`/`bed`).

| Bloque | Color | Intensidad | Distancia | Decay | Ancla (celda local) |
|---|---|---|---|---|---|
| `TORCH` piso | `0xffb060` | 10 | 9 | 2 | `(.5, .62, .5)` |
| `TORCH` pared | `0xffb060` | 10 | 9 | 2 | punta inclinada hacia afuera, `y≈.77` |
| `TORCH` techo | `0xffb060` | 10 | 9 | 2 | `(.5, .28, .5)` |
| `LAMP` | `0xfff0c0` | 24 | 14 | 2 | `(.5, .68, .5)` (debajo de la pantalla, acotado por la cara cálida en `.72`) |

`GLOW` no tiene fila: no emite luz. Los valores son el punto de partida; se calibran mirando la noche en Docker. La tabla es una constante exportada para que el test verifique monotonías (lamp > torch en intensidad y distancia) sin fijar números mágicos en varios lugares.

### 6. Antorcha orientable sin ids nuevos

Precedencia determinista sobre las 6 caras, con un predicado puro `torchSupportKind({below, above, px, nx, pz, nz})`:

| Condición | Orientación | Resultado visual |
|---|---|---|
| `below` sólido | `floor` | Vertical, palo abajo, llama arriba (modelo actual) |
| si no, `above` sólido | `ceiling` | Colgada: espejado vertical, llama abajo |
| si no, un lateral sólido (`+X, -X, +Z, -Z`, en ese orden) | `wall` | Inclinada ~30° hacia afuera, base pegada a la cara |
| ninguna | `floor` | Fallback para antorchas heredadas o rotas por fuera del juego |

- La orientación **no se guarda**: se deriva del mundo cada vez que se meshéa o se calcula el ancla de luz. Como `get()` lee el array completo, funciona igual en los bordes de chunk.
- Un solo ítem (`TORCH`), sin ids de orientación ni migración de mundos.
- La geometría sale de una función pura `torchQuads(kind, dir)` que devuelve los 8 vértices de los dos cross-quads ya rotados/trasladados; el render y el test la comparten.
- Pared: la base se embebe `TORCH_WALL_INSET = .06` dentro del soporte a lo largo de `-dir` (antes quedaba al ras en `.04`, pero la textura del palo tiene margen transparente y el dibujo se veía separado de la pared). Lo que queda dentro del bloque lo oculta la pared opaca y la parte visible arranca justo en la cara. El eje del soporte **cruza la cara sin clampear**; `y` y el eje perpendicular se acotan a `[0,1]`. Usa constantes propias `TORCH_WALL_BASE_Y = .35`, `TORCH_WALL_LEN = .6` y `TORCH_WALL_W = .2`, así la punta inclinada queda en `y≈.87` (debajo de 1). El ancla de luz acompaña el mismo inset.

Descartado: codificar la orientación en el id (necesitaría 3-4 ids nuevos y rompería `v<=64`), o en metadata por celda (el mundo es un `Uint8Array` plano).

### 7. Farola: bloque `LAMP` (id 64)

- **Id y DEFS**: `LAMP=64` en la línea de constantes compartida, entrada en `DEFS` con `name:'Farola 💡'`, `lamp:1`, `hard:.2`, `tile:37`, `css` propio. **No** es `cube` ni `glow`, así que `isSolid` la considera no sólida y no se meshéa como cubo.
- **Atlas**: tile 37 (pantalla metálica con marco) y reutilización del tile 11 para la cara cálida inferior. Nada de binarios.
- **Render**: se emite desde `emitGlobalCell` al builder `TM` (material unlit `matTorch`, `alphaTest` + `DoubleSide`): varilla fina de `y=1.0` a `0.88`, pantalla de cuatro caras que se ensancha de `0.88` a `0.72`, y cara inferior cálida en `y=0.72`. Queda colgando dentro de la celda, con el anclaje arriba.
- **Luz**: ancla en `(.5, .68, .5)`, justo debajo de la pantalla (la cara cálida está en `.72`). La farola usa un `SpotLight` con el target 1.2 bloques abajo (`y - .5`), así que alumbra hacia abajo y no el techo que tiene encima (ver decisión 11); si no hay spot libre, queda apagada y nunca usa el pool de puntos.
- **No bloquea**: `mobBlocked` la exime (junto a la antorcha). Sin esto el drift `mobBlocked ↔ isSolid` falla y los mobs/bot la esquivan.

### 8. Colocación por cara

En `doPlace`, antes de la rama `dd.flower`:

```
soporte = get(h.x, h.y, h.z)                  // celda clickeada = destino - normal
si (id === TORCH || id === LAMP) y !isSolid(soporte) → toast + return
si (id === LAMP) y h.ny !== -1 → toast "la farola cuelga del techo" + return
```

- Una sola condición (`isSolid` del bloque clickeado) cubre piso (`ny=1`), pared (`nx/nz`) y techo (`ny=-1`).
- La normal ya viene del `raycast` y solo apunta a caras de bloques `cube/flower/glow/door`; un click sobre una flor, agua o puerta abierta no es soporte y se rechaza.
- La antorcha sigue exenta de `ocupadoPor` (no colisiona): colgarla dentro del cuerpo del jugador es inofensivo y evita una regla extra.

### 9. Cascada de soporte local

`breakOrphanSupports(x,y,z)` se llama al final de la rama genérica de `doBreak` (solo cuando el bloque roto era sólido):

1. Revisa las 6 celdas vecinas; para cada `TORCH`/`LAMP`, evalúa el mismo predicado de soporte que la orientación.
2. Si no tiene ninguna cara sólida, la agrega a una lista de roturas.
3. Aplica todas las roturas en lote: `rawSet`, `edits.push` (o `netSend({t:'edit'})` en MP) y **un solo** `refreshAt` por conjunto de chunks afectados — no un `editBlock` por vecino, que reconstruiría meshes de más.
4. Una sola pasada, sin recursión: solo se evalúan los 6 vecinos del bloque roto original.

No se ejecuta en el handler `pedit`: el cliente que rompió el soporte ya manda sus propias ediciones de cascada (protocolo aditivo, mismas `edit`). Un cliente viejo que solo rompa el soporte deja la antorcha huérfana, que se dibuja con el fallback `floor` y sigue iluminando hasta que alguien la rompa: es el precio de no agregar protocolo.

### 10. Compatibilidad

- `LAMP=64` entra en el límite `v <= 64` del servidor sin tocar `server.js`.
- Un cliente viejo recibe `v=64`, no lo encuentra en `DEFS` y no dibuja nada; `isSolid(64)` es `false`, así que tampoco lo bloquea.
- El bot usa `mobBlocked`, que se actualiza en el bloque compartido `worldgen` (cliente y servidor lo evalúan del mismo texto).
- Antorchas existentes en `world.json`/`edits` no se migran: la orientación es derivada.

### 11. Farola direccional: ocho `SpotLight` en el pool, siempre hacia abajo

La farola no usa una `PointLight` omni: tiene **8 `SpotLight`** creados una sola vez (`LAMP_POOL_SIZE = 8`, el presupuesto máximo de la calidad 2) además del pool de puntos.

| Parámetro | Valor | Por qué |
|---|---|---|
| `angle` | `1.15` rad (~66°) | Cono ancho, cubre el piso y las paredes cercanas |
| `penumbra` | `0.5` | Borde suave, sin un círculo duro |
| `distance` | `14` | Mismo alcance que la spec de la farola |
| `decay` | `2` | Unidades físicas de r160, igual que el resto |
| target | `(x+.5, y-.5, z+.5)` | Directamente abajo del ancla `(x+.5, y+.68, z+.5)` |

- Cada spot tiene su `Object3D` target propio, agregado a la escena; `refreshLights` lo reposiciona junto con el spot. **Todas** las farolas encendidas apuntan hacia abajo, sin excepción.
- Las farolas usan los 8 slots de spot y **nunca** el pool de puntos: una omni iluminaría el techo que la farola tiene encima. Con más farolas que spots, las que sobran quedan apagadas hasta que se libere uno. El presupuesto total no cambia: los spots cuentan dentro de `LIGHT_BUDGET`.
- Se descarta un `SpotLight` por farola: la cantidad de luces es fija. Con 2 spots, la séptima farola de una sala caía al pool de puntos y encendía el techo, y al caminar se alternaban cuáles eran punto y cuáles spot; con 8 el caso de la captura queda cubierto y el tipo de luz de cada farola ya no depende de la distancia al jugador.
- La visibilidad del pool es fija por nivel (decisión 17): en calidad 1 se ven 2 spots y 2 puntos; en calidad 2, los 8 y 8. Cambiar de calidad paga una recompilación discreta, pero caminar entre farolas no recompila nada.

### 12. Sin sombras dinámicas: oclusión por línea de vista y ambiente

Las antorchas y farolas son prescindibles como emisores de sombra: cada `castShadow = true` en una luz dinámica agrega mapas y variantes de shader, y cuando el caster cambia de fuente se paga una recompilación/recreación en caliente. En una GPU de 4 GB eso se percibe como tirones al caminar.

- **Todas** las luces del pool (`lightPool` y `lampPool`) quedan con `castShadow = false` siempre. No existe `setShadowCaster`, ni `shadowCasterKey`, ni `shadowCasterLight`: no hay estado que cambie en runtime.
- La fuga de luz se corrige donde importa: `refreshLights` descarta con `blockedLOS` toda fuente cuya línea de vista al ojo esté cortada por un bloque opaco (decisión 15), en cualquier calidad. Esa es la oclusión real que ve el jugador.
- El encierro se percibe por la atenuación ambiental (`skyReachable` + `ENCLOSED_DIM`, decisión 14): adentro de una caja, `ambientK` baja a `.10` y la escena se ve nocturna aunque el `HemisphereLight` no proyecte sombra.
- El sol conserva su sombra en calidad 2 (`sun.castShadow`, `renderer.shadowMap`): es una sola luz direccional y no cambia durante el juego.
- Trade-off aceptado: una fuente visible puede iluminar una cara que “debería” estar en sombra si el muestreo de `blockedLOS` no cruza el obstáculo (casos de menos de 1/3 de bloque). A cambio, el costo de luces es estable y no hay recompilas al moverse.

### 13. Brillo del cliente: clamp y reaplicación en caliente

El brillo (`mc-brightness`, slider 1–3) es **solo del cliente** y puede venir de otro `localStorage` (p. ej. el del server) con un valor viejo que dejaba la noche en 0.80.

- `clampBrightness(v)` en el bloque puro: acepta número o string, descarta no finitos (`NaN`, `undefined`, basura) y acota a `[1, 3]`.
- El arranque aplica `clampBrightness` al valor de `localStorage`; el slider también, así nunca entra un valor fuera de rango.
- `brightSlider.oninput` reaplica la atmósfera en el acto: `airL = -1; applyAtmosphere(light(dayV)); tickSky(dayV);`. Antes el loop solo recompone si cambia la fase, por lo que el slider no se veía hasta el amanecer/atardecer.
- No se tocan `NIGHT_MIN`, `HEMI_DAY`, `SUN_DAY` ni ninguna constante que cambie cómo se ve el server.

### 14. Atenuación ambiental cuando el jugador no ve el cielo

El `HemisphereLight` es ambiental y no proyecta sombra, así que encerrarse detrás de bloques opacos seguía viéndose claro: una sombra dinámica de una fuente solo bloquearía la luz puntual, no el ambiente.

Solución solo del cliente:

- `skyReachable(isOpaqueAt, x0, y0, z0, top, radius)` en el bloque puro: BFS de 6 direcciones por celdas no opacas, acotado por un cubo de `radius` horizontal alrededor de `(x0,z0)` y `0 <= y <= top`; devuelve `true` al alcanzar `y >= top`. En cada celda candidata se corta con `skyExposed` cuando su columna ya está libre, así una ventana o un hueco de 1 bloque cuentan y el BFS no explora todo el aire exterior. El vidrio y las losas no bloquean si el predicado no los marca opacos. Sin `THREE`/DOM.
- `SKY_REACH_RADIUS = 24`: alcance horizontal del BFS. Cubre una ventana de la misma habitación y descarta salidas lejanas.
- `ENCLOSED_DIM = .10`: factor mínimo de luz ambiental bajo techo (nivel noche; antes `.32` dejaba el ambiente demasiado claro).
- En el loop, la celda de la cabeza sale de `eyePos()` y el predicado es `isOpaque(b) || (isDoor(b) && !doorOpen(b))`: una puerta cerrada tapa el cielo, abierta no; el vidrio y las losas no son opacos.
- El BFS corre **solo cuando cambia la celda de la cabeza** (`skyCell`/`skyPending`) y como máximo cada ~0.3 s; después `ambientK` se suaviza con `ambientK += (ambientTarget-ambientK)*Math.min(1, dt*6)` hacia `ENCLOSED_DIM` (encerrado) o `1` (cielo abierto).
- `refreshAt` marca `skyPending = true` junto a `lightsDirty`: una edición local o un `pedit` (romper/colocar techo, pared o ventana) programa el recálculo sin esperar a que el jugador cambie de celda, sujeto al mismo throttle de ~0.3 s.
- `applyAtmosphere` multiplica `hemi.intensity = HEMI_DAY * Lb * ambientK` y `sun.intensity = (...) * ambientK`; `tickSky` multiplica también `sun.intensity` y `moonLight.intensity` (si no, el sol se repondría sin atenuación en cada frame).
- El loop reaplica `applyAtmosphere(light(dayV))` cuando `ambientK` cambia más de `~0.02`, junto al guard existente de fase/agua (`airAmbient`), para que la transición se vea en caliente.
- No cambia `NIGHT_MIN`, `HEMI_DAY`, `SUN_DAY`, `MOON_LIGHT` ni nada del servidor. Las antorchas/farolas siguen iluminando adentro porque son luces puntuales.

Trade-off: la accesibilidad es local (radio 24), no un cómputo de cielo global; una cueva con una salida a más de 24 bloques se considera encierro y una celda con techo a medias puede quedar expuesta. Se prefiere acotado, estable y sin tocar el ciclo.

### 15. Oclusión por línea de vista y encierro a nivel noche (pedido tras probar)

Probar en Docker mostró dos problemas: la luz seguía atravesando paredes y encerrarse apenas oscurecía. Causa: la única oclusión era una sombra dinámica de la fuente más cercana (y solo en calidad 2), y `ENCLOSED_DIM = .32` dejaba el ambiente al 32 %.

- `blockedLOS(isOpaqueAt, ax,ay,az, bx,by,bz)` en el bloque puro: muestrea los voxeles del segmento fuente↔ojo a ~3 pasos por bloque (`LOS_STEPS_PER_BLOCK`) y devuelve `true` al primer bloque opaco. Las celdas del origen y del destino se saltean (la fuente vive dentro de la antorcha/farola y el ojo en aire), así que origen y destino en la misma celda nunca se auto-ocluyen. Sin `THREE`/DOM y sin DDA completa: suficiente para paredes de 1 bloque y muros en diagonal, mucho más barato que un raycast real.
- `refreshLights` descarta el candidato antes de entrar al top-K si `blockedLOS` contra `eyePos()` da `true`, usando el ancla aproximada de `LIGHT_SPEC` (`antorcha .62`, `farola .68`). La oclusión ya no depende de la calidad ni de que la fuente sea la más cercana. Se aplica a `TORCH` y `LAMP` (GLOW no emite).
- `blockedLOS` es la **única** oclusión de las luces dinámicas: reemplaza a la sombra de la fuente más cercana (eliminada en la decisión 12) y una fuente ocluida ni siquiera entra al pool.
- `ENCLOSED_DIM` baja a `.10` (10 % de ambiente: nivel noche) y el suavizado pasa a `ambientK += (ambientTarget-ambientK)*Math.min(1,dt*6)`, para que el encierro se perciba en pocas décimas y la salida vuelva suave a 1.
- Costo: por actualización (cada 250 ms) se muestrean a lo sumo `K` candidatos cercanos con ~3 muestras por bloque de distancia (≤ ~60 por fuente a 20 bloques), con `get`/`isOpaque` del índice de chunks ya existente. No hay trabajo nuevo por frame.
- Trade-off: el muestreo puede dejar pasar luz por un vértice exacto de dos bloques en diagonal o tapar una fuente visible a través de un hueco menor a un tercio de bloque. Se acepta: es barato, estable y elimina la fuga principal (fuente en otra habitación).

### 16. Brillo solo en intensidades, paleta atada a la fase (pedido tras probar)

Con brillo 3× la noche se veía como de día: `applyAtmosphere` calculaba `d = (brightLevel(L) - NIGHT_MIN) / (1 - NIGHT_MIN)` y usaba ese `d` **también** para el cielo, la niebla, el fondo y los colores del hemi; `tickSky` repetía el error para la visibilidad del sol. Con `Lb = 0.80` el cielo quedaba a `d ≈ 0.6`, es decir, un cielo diurno a medianoche.

Se separan dos factores con una responsabilidad cada uno:

| Factor | Fórmula | Se usa en |
|---|---|---|
| `paletteFactor(L)` | `(L - NIGHT_MIN) / (1 - NIGHT_MIN)` | Colores de cielo, niebla, fondo, `hemi.color`/`groundColor`, visibilidad del sol/luna en `tickSky` |
| `Lb = brightLevel(L)` | `L + min(.30, (1-L)*(bright-1)*.5)` | `hemi.intensity`, `sun.intensity`, `moonLight.intensity` |

- `paletteFactor` vive en el bloque puro (testeable con `new Function`) y lee `NIGHT_MIN` de la misma constante del ciclo; el fallback `.50` solo sirve para evaluar el bloque aislado.
- `applyAtmosphere` conserva `ambientK` en las intensidades: `hemi.intensity = HEMI_DAY * Lb * ambientK` y `sun.intensity = L > NIGHT_MIN ? SUN_DAY * Lb * ambientK : 0`.
- `tickSky` usa `paletteFactor(L)` para `sunSprite.visible` y los criterios de cielo, y `Lb` solo en `sun.intensity`/`moonLight.intensity`.
- Resultado: con brillo 3× la noche sigue siendo noche en cielo/niebla/fondo, pero el ambiente, el sol y la luna suben. Con brillo 1× nada cambia (`paletteFactor === (L - NIGHT_MIN)/(1 - NIGHT_MIN)` y `Lb === L`).
- El handler del slider sigue reaplicando en caliente (`airL = -1; applyAtmosphere(light(dayV)); tickSky(dayV);`) y el arranque sigue clampeando `mc-brightness`. Es un cambio solo del cliente: si el server desplegado sirve un build viejo, hay que redeployar.

### 17. Visibilidad fija del pool por nivel (reemplaza la visibilidad dinámica)

Mantener las 16 luces (8 puntos + 8 spots) siempre visibles compila todos los materiales con `NUM_POINT_LIGHTS = 8` y `NUM_SPOT_LIGHTS = 8` aunque haya una sola antorcha cerca; alternar `visible` según el uso recompila en caliente y produce tirones al caminar. Por eso el set visible es **fijo por nivel**:

- `POINT_VISIBLE = [0, 2, 8]` y `SPOT_VISIBLE = [0, 2, 8]`: en calidad 0 no hay luces; en calidad 1 se ven 2 puntos y 2 spots; en calidad 2, los 8 y 8.
- `applyLightVisibility()` no recibe argumentos: lee `QUALITY_LEVEL` y hace `lightPool[i].visible = i < pv`, `lampPool[i].visible = i < sv`. Se llama **una vez al arrancar** y en cada `applyQuality` (junto a `refreshLights(true)`). No hay debounce, ni conteos, ni `tickLightVisibility`.
- `refreshLights` solo asigna intensidad a los slots visibles del nivel (`slot < pv` / `slot < sv`); los ocultos quedan en 0. Nunca escribe `visible`.
- Con calidad 0 (`K <= 0`) el pool ya está oculto por `applyLightVisibility` y `refreshLights` solo apaga intensidades.
- Costo: caminar no cambia la cantidad de luces, así que el programa compilado es estable durante el juego. La única recompilación es al cambiar de calidad, una acción discreta del usuario. En calidad 1 el shader compila `NUM_POINT_LIGHTS = 2` y `NUM_SPOT_LIGHTS = 2`; en calidad 2, 8 y 8.

## File Map

| Archivo | Cambio |
|---|---|
| `index.html` (escena, ~827-873) | Pool de 8 `PointLight` + 8 `SpotLight` (farolas, targets propios), ocultas al crearse, sin sombras, + tabla de specs |
| `index.html` (`applyQuality`, ~962-980) | `LIGHT_BUDGET` por nivel + `applyLightVisibility()` (set fijo, una recompila por cambio) + `refreshLights(true)` |
| `index.html` (constantes, ~489-501) | `LAMP=64` en el bloque compartido; `mobBlocked` la exime |
| `index.html` (`DEFS`/`INVENTORY`, ~583-651) | Entrada de `LAMP`, `tile:37`, `lamp:1`, `hard:.2`; `INVENTORY` la incluye |
| `index.html` (atlas, ~683-801) | Tile 37 dibujado (pantalla) |
| `index.html` (bloque `/* lighting:start */`) | `isLightEmitter` (sin `GLOW`), `LIGHT_SPEC`, `POINT_VISIBLE`/`SPOT_VISIBLE`/`LIGHT_BUDGET`, `LAMP_POOL_SIZE = 8`, `lightSlots` (sin fallback, con `src`), `clampBrightness`, `paletteFactor`, `torchSupportKind`, `torchQuads` (base de pared embebida con `TORCH_WALL_INSET`), `lightAnchor`, `ENCLOSED_DIM`, `skyExposed`, `SKY_REACH_RADIUS`, `skyReachable`, `blockedLOS` |
| `index.html` (`applyLightVisibility`, ~1770) | Set fijo por nivel: `visible = i < POINT_VISIBLE[QUALITY_LEVEL]` / `i < SPOT_VISIBLE[QUALITY_LEVEL]`, sin debounce ni conteos |
| `index.html` (`refreshLights`, ~1789) | Reparto farola→spot (omitida si no hay spot) / antorcha→punto, `src`, culling por `blockedLOS` contra `eyePos()`, target del spot hacia abajo, intensidad solo en slots visibles del nivel; no toca `visible` ni `castShadow` |
| `index.html` (`buildGlobalsForChunk`, ~1422) | Índice `chunkLights` y `lightsDirty` |
| `index.html` (`emitGlobalCell`, ~1309-1321) | Antorcha orientable + rama `LAMP` |
| `index.html` (`applyAtmosphere`/`tickSky`, ~1085-1176) | `paletteFactor(L)` para la paleta/visibilidad; `Lb` solo en las intensidades (multiplicadas por `ambientK`) |
| `index.html` (`doPlace`, ~2846) | Soporte por cara y regla de techo para `LAMP` |
| `index.html` (`doBreak`, ~2819) | `breakOrphanSupports` en lote |
| `index.html` (loop, ~4012-4030) | `refreshLights(false)`, `skyReachable` desde la celda de la cabeza solo al cambiar de celda (tope ~0.3 s), suavizado de `ambientK` (`dt*6`) y guard `airAmbient` |
| `index.html` (`brightSlider.oninput`, boot) | `clampBrightness` en caliente y al cargar; reaplicación inmediata de `applyAtmosphere`/`tickSky` |
| `server/test/lighting.mjs` (nuevo) | Estáticos + puros de luces, presupuesto, orientaciones, cascada |
| `server/test/static.mjs`, `worldgen.mjs`, `bed-sleep.mjs` | Ids 0-63 → 0-64 |
| `server/test/config.mjs`, `lookguard.mjs`, `camera.mjs`, `zombie-protocol.mjs`, `bed-sleep.mjs`, `package.json` | Conteo 22 → 23 |

## Risks / Trade-offs

- **Costo por fragmento**: el peor caso es 8 luces puntuales + 8 spots en todos los materiales Lambert (opacos, translúcidos, flores). El set compilado es fijo por nivel: calidad 0 = 0 luces, calidad 1 = 2 + 2, calidad 2 = 8 + 8. Es el costo estable que se acepta a cambio de no recompilar al caminar; nivel 0 oculta todo. Se mide FPS en Docker con el mundo cargado antes de aprobar.
- **Sin recompilas en caliente**: caminar ya no cambia la cantidad de luces visibles, así que no hay variantes nuevas de shader durante el juego. Cambiar de calidad sí recompila una vez (`applyLightVisibility`), pero es una acción discreta del usuario.
- **Luces muertas en calidad 0**: quedan creadas pero ocultas (`visible = false`), así el shader no las evalúa. Cambiar a 0 y volver a 2 recompila una vez por cambio, que es una acción discreta del usuario.
- **Fugas de luz**: mitigadas con `blockedLOS` en `refreshLights` (toda fuente ocluida se descarta, en cualquier calidad). No hay sombras dinámicas; queda un caso borde: el muestreo de ~3 pasos por bloque puede dejar pasar luz por el vértice exacto de dos bloques en diagonal o tapar un hueco menor a un tercio de bloque.
- **Farolas apagadas por falta de cono**: con más de 8 farolas en el radio, las lejanas no alumbran hasta que se libera un spot. Es preferible a la alternancia punto/spot y al techo iluminado; el jugador igual las ve encendidas (su modelo es unlit).
- **Costo de la oclusión**: por actualización (cada 0.25 s) se muestrean hasta K candidatos con ~3 muestras por bloque de distancia (≤ ~60 por fuente a 20 bloques) usando `get`/`isOpaque` del índice de chunks. No hay trabajo nuevo por frame; el peor caso es una pared de antorchas cercanas, acotado por distancia y presupuesto.
- **Costo del BFS al cielo**: `skyReachable` corre solo al cambiar la celda de la cabeza y como máximo cada 0.3 s (no por frame). Al aire libre sale por `skyExposed` en O(alto) (~0.05 ms medidos); adentro explora el volumen conectado y queda acotado por `SKY_REACH_RADIUS` (cubo de 49×49×H) y por `SKY_REACH_MAX_CELLS = 20000` (~4 ms medidos en una caverna sellada enorme). El tope solo puede marcar de más como encierro un espacio sin cielo y mayor a 20 000 celdas, que ya se percibe como cueva.
- **Sin sombras dinámicas**: las luces del pool no proyectan sombra, así que no hay mapas de cubo por frame ni memoria de shadow maps más allá del sol. Reduce el costo de GPU y elimina el cambio de caster en runtime.
- **Costo de selección**: 25 chunks × fuentes indexadas cada 0.25 s. Normalmente decenas de candidatos; un chunk denso de antorchas es el peor caso y se acota por distancia y cadencia.
- **Cascada**: un `refreshAt` por lote y no por vecino; si se implementa con `editBlock` ingenuo se reconstruyen hasta 12 chunks por rotura y se nota el tirón.
- **Drift de `mobBlocked`**: el test compara id por id contra `DEFS`. Si se agrega `LAMP` y no se exime, el test falla (deseado) y los mobs la esquivan.
- **Orientación ambigua**: una antorcha con piso y techo sólidos a la vez se dibuja como piso por precedencia. Sin metadata no hay forma de distinguir la intención; es determinista y consistente entre clientes.
- **Clientes viejos**: no ven la farola (id desconocido) pero tampoco se rompen ni la bloquean.
- **Tests hardcodeados**: `static.mjs`, `worldgen.mjs` y `bed-sleep.mjs` fijan ids hasta 63; hay que ampliarlos a 64 o la suite falla por parseo antes de llegar a la lógica nueva.

## Open Questions

- ¿Conviene un tope por chunk en el índice de luces (p. ej. 128 fuentes) para acotar el peor caso, o se deja sin tope y se mide primero en Docker? Decisión tentativa: sin tope en la v1, medir con una pared de antorchas.
- ¿La luz de las fuentes debería atenuarse de día (multiplicar por `light(dayV)`) para que no se note un aporte extra a pleno sol? Decisión tentativa: no, el ambiente diurno ya la tapa y atenuarla agrega estado por frame.
- ~~¿La farola debería usar `SpotLight` sin sombras para un cono realmente hacia abajo?~~ Resuelto: sí, spots en el pool (decisión 11). Probado en navegador: la farola dejó de iluminar el techo. Tras la captura con 7 farolas se subieron de 2 a 8 conos (el presupuesto máximo) y se eliminó el fallback a punto: las que sobran quedan apagadas.
- ~~¿Conviene mantener `visible = true` en todo el pool?~~ Resuelto: se usa un set **fijo por nivel** (`POINT_VISIBLE`/`SPOT_VISIBLE`), aplicado al arrancar y al cambiar de calidad. No hay visibilidad dinámica ni debounce: caminar no recompila shaders.
- ~~¿Conviene liberar los shadow maps de las luces que dejan de ser caster?~~ Resuelto: no aplica; las luces del pool nunca proyectan sombra (decisión 12).

## Test Strategy

Nuevo `server/test/lighting.mjs` (archivo 24) con dos capas:

- **Puros** (extrayendo el bloque `/* lighting:start */`): `isLightEmitter` para `TORCH`/`LAMP` y negativos (incluida `GLOW`); `LIGHT_SPEC` con monotonía lamp > torch; `POINT_VISIBLE = [0,2,8]`, `SPOT_VISIBLE = [0,2,8]` y `LIGHT_BUDGET = [0,4,16]` (suma por nivel); `LAMP_POOL_SIZE = 8` y ancla `y=.68`; `lightSlots` (7 farolas → 7 spots; 9 farolas → 8 spots y la novena omitida, nunca a punto; mezcla farola/antorcha → spots y puntos respectivamente; `src` conserva el índice aun con omitidas; presupuesto compartido); `clampBrightness` en `[1,3]` y no finitos → 1; `paletteFactor(0.50) = 0`, `paletteFactor(1) = 1` y monotonía; `torchSupportKind` con las seis combinaciones (piso, techo, cada pared, precedencia piso>techo>pared, fallback); `torchQuads` devuelve 8 vértices, con la llama del lado libre y, en las cuatro paredes, el quad **cruza la cara** (mínimo relativo < 0 y máximo > 0) con el resto de coordenadas en `[0,1]` y la base pegada (centro a ≤ .02 de la cara, embebido por `TORCH_WALL_INSET`); `lightAnchor` cae dentro de la celda; `skyExposed` (columna abierta, bloque arriba, misma celda/abajo, borde `top`) y `ENCLOSED_DIM` en `(0,.15]`; `skyReachable` (exterior, caja cerrada, caja con un hueco de 1 bloque, ventana de vidrio, radio insuficiente, cueva sin salida, `y0 >= top`) y `SKY_REACH_RADIUS` en `(0,40)`; `blockedLOS` (camino abierto, pared entre medio, pared pegada a la fuente, muro en diagonal, bloque fuera del segmento, origen/destino en la misma celda, distancia cero y camino largo abierto).
- **Estáticos de `index.html`**: `applyAtmosphere` usa `paletteFactor(L)` para `d` y `Lb` solo en `hemi.intensity`/`sun.intensity`; `tickSky` usa `paletteFactor(L)` para la visibilidad del sol y `Lb` solo en `sun.intensity`/`moonLight.intensity`; existen 8 `PointLight` + 8 `SpotLight` creadas fuera de `applyQuality` con `castShadow = false` y `visible = false` al nacer, con target propio en la escena (8 targets), `applyQuality` no agrega/quita luces y llama a `applyLightVisibility()`, `lightSlots` no tiene fallback para la farola, `refreshLights` aplica cada slot a `best[src]`, apunta el target hacia abajo, solo enciende slots visibles del nivel y **no toca `visible` ni `castShadow`**; no existen `shadowCaster`, `setShadowCaster`, `shadowCasterKey` ni `shadowCasterLight`; `applyLightVisibility()` no recibe conteos, lee `QUALITY_LEVEL` y `POINT_VISIBLE`/`SPOT_VISIBLE`, se aplica al arrancar y en cada cambio de calidad, y no quedan `LIGHT_VIS_MS` ni `tickLightVisibility`; el handler de brillo reaplica `applyAtmosphere`/`tickSky` y el arranque clampea `BRIGHTNESS`, `chunkLights` se puebla en `buildGlobalsForChunk`, `refreshAt`/`pedit` marcan `lightsDirty`, `doPlace` usa `isSolid(get(h.x,h.y,h.z))` y rechaza `LAMP` con `ny !== -1`, `breakOrphanSupports` existe y no se llama en el handler `pedit`, `mobBlocked` exime `LAMP`, `DEFS[64]` tiene `lamp:1` y `tile:37`, `INVENTORY` la incluye, `refreshLights` usa `blockedLOS` contra `eyePos()` con `isOpaque(get(...))`, el loop consulta `skyReachable` (no `skyExposed`) con `SKY_REACH_RADIUS` y `H-1`, solo al cambiar de celda (`skyCell`/`skyPending`) con tope de 300 ms, `refreshAt` marca `skyPending` para reflejar ediciones sin moverse, trata la puerta cerrada como opaca y suaviza `ambientK` con `dt*6`, y el guard de la atmósfera incluye `airAmbient`.
- **Estáticos de `server/server.js`**: sigue aceptando `v <= 64` sin validar soporte (sin cambios, como guarda de regresión).

RED primero: el archivo corre y falla por bloque/API ausente, no por sintaxis. Después GREEN y `cd server && npm test` con 24/24 archivos verdes.
