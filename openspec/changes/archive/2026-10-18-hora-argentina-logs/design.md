# Design

## Context

Ver `proposal.md` — Why. Estado actual **verificado** leyendo el código, que condiciona el enfoque:

- **No hay logger central.** El server tiene 8 `console.log`/`console.warn` sueltos (mundo cargado `:92`/`:117`, admin `:254`/`:331`, arranque `:343-344`, join `:277`, leave `:172`) y el bot usa un `log` **inyectado** (`bot/cazador.js:71`, default `bot/index.js:41`). Crear un logger central sería **scope creep**: el change toca **tres** sitios y no necesita más.
- **`server/server.js` no exporta nada.** Es un script que arranca a escuchar en el `require`; los tests del server lo **spawnean** y hablan por WS (`protocol.mjs`, `bot-cazador.mjs`) o **capturan su stdout** (`admin-hash.mjs:39-46`). No hay forma de llamar a `removePlayer()` desde un test.
- **`bot/cazador.js` SÍ es un módulo** con `module.exports` (`:405-408`) y su lógica es **pura y con reloj inyectable** (`cfg.now`, `:70`).
- **`bot/` y `server/` son grafos de `require` separados a propósito** (`bot/index.js:8-11`: "NO comparte el grafo de `require` del server: sólo la dependencia `ws`"); `Dockerfile.bot` buildea `COPY bot/` y **nunca** `server/server.js`.
- **El timestamp de Easypanel no lo controla la app**: `console.log` no agrega hora propia, y lo que se ve a la izquierda de cada línea lo pone el **log driver de Docker** (UTC o la hora del browser). La hora tiene que ir **dentro del texto** del mensaje.
- **Patrón de test establecido**: extraer bloques **marcados** (`/* worldgen:start */…/* worldgen:end */`, `/* net/avatar:start */`, `/* robot:start */`) o funciones por nombre con `new Function` y ejecutarlas aisladas (`worldgen.mjs`, `avatar-held.mjs`, `client-robot.mjs`, `zombie-client.mjs`).
- **Suite con conteo pinneado en dos lugares**: `server/test/zombie-protocol.mjs:287-289` (array + "16") y `server/test/lookguard.mjs:171-175` (array + `count === 16`); `server/package.json:7` lista los 16 a mano. `static.mjs` y `protocol.mjs` son **pre-existentes y pinneados** (no se tocan).

**Datos verificados empíricamente** (node v24 local; la suite corre en el node del entorno, las imágenes en `node:20-alpine` con full-ICU):

- `new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(Date.UTC(2026,9,17,2,53)))` → `"23:53"` (Argentina es **UTC−3 todo el año**, sin horario de verano).
- **Medianoche**: el mismo formatter en `Date.UTC(2026,9,17,3,0)` → `"00:00"` (con `hour12:false` **no** aparece el quirk `24:00` en este entorno; se fija en un test para que un cambio de ICU lo delate).
- **Alias de zona**: `resolvedOptions().timeZone` devuelve `"America/Buenos_Aires"` (forma canónica), **no** `"America/Argentina/Buenos_Aires"` (la de entrada). Cualquier assert sobre el id debe tolerar el alias o, mejor, asertar **comportamiento** (la hora resultante).

## Goals / Non-Goals

**Goals:**

- Los tres logs (join/leave del server, golpe del bot) llevan el prefijo `[HH:MM]` de Argentina, con el **mensaje original intacto** detrás.
- El helper es **puro, hoisteado y testeable** de forma determinista y **agnóstica a la `TZ`** de la máquina que corre los tests.
- Cero dependencias nuevas, cero cambios de protocolo, **cero impacto** en los tests existentes.

**Non-Goals:**

- **No** se introduce un logger central ni se tocan los otros logs del server.
- **No** se loguea la muerte del bot (`announceKill`) ni se agregan logs nuevos: sólo se prefijan los tres existentes.
- **No** se usa la env var `TZ` ni se cambia la hora de ningún sistema (ver Decision 1).
- **No** se toca el cliente `index.html`.
- **No** se implementa nada en esta fase: sólo planning.

## Decisions

### 1. Formato `[HH:MM]` con `Intl` sobre `America/Argentina/Buenos_Aires`; **nada** de env `TZ`

Se usa `Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false })` y se prefija `[<resultado>] ` al mensaje. 24 h, sin segundos, al **inicio**.

- **Por qué `Intl` y no `TZ`**: la env `TZ` sólo afecta cómo el runtime *interpreta* la hora, pero `console.log` **no imprime hora**: lo que Easypanel muestra a la izquierda es el timestamp del log driver de Docker. Poner `TZ=America/Argentina/Buenos_Aires` **no cambiaría nada de lo que se ve**. La hora tiene que ir *dentro del texto*, formateada por la app.
- **Por qué `Intl` y no una librería**: `node:20-alpine` trae **full-ICU**, así que `Intl` con `timeZone` funciona en las dos imágenes (`Dockerfile`, `Dockerfile.bot`) sin dependencias (coherente con el repo, que sólo tiene `ws`).
- **Alternativas descartadas:** (a) setear `TZ` — inútil por lo de arriba; (b) traer `dayjs`/`date-fns-tz` — una dependencia para formatear una hora; (c) offset manual `-3h` sobre `Date` — ignora la regla de zona y se rompe si algún día cambia.

### 2. `horaAr(now = Date.now())`: helper hoisteado y puro

```js
const FMT_AR = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false,
});
const horaAr = (now = Date.now()) => `[${FMT_AR.format(new Date(now))}] `;
```

- **Hoisteado, no por llamada**: construir un `Intl.DateTimeFormat` cuesta milisegundos. El bot pega cada ~0.6 s (`HIT_GAP_MS`, `cazador.js:33`) y el server loguea por evento; un formatter por llamada sería un desperdicio evitable. Uno por proceso, a nivel de módulo.
- **Reloj inyectable** (`now`): es lo que permite el test determinista contra un **epoch fijo** sin depender del reloj real.
- **Contrato de `horaAr`**: devuelve el **prefijo completo con el espacio final** (`'[23:53] '`), así el call site queda `horaAr() + \`…\`` sin ambigüedad de espaciado.

### 3. El helper se **duplica** en cada contenedor; **no** se comparte

El bloque de `horaAr` se copia en `server/server.js` y en `bot/cazador.js`. **Por qué no un módulo común** (p. ej. `shared/time-ar.js`): `bot/` y `server/` son grafos de `require` **separados a propósito** (`bot/index.js:8-11`; `Dockerfile.bot` buildea sólo `COPY bot/`). Un módulo compartido obligaría a copiar cruzándose los contextos de build y rompería ese límite de diseño por **dos sentencias**.

- **Alternativa descartada:** `server/time-ar.js` requerido por `server.js` y una copia para el bot — igual de duplicado que inline, pero agrega un archivo y una indirección para 2 líneas; el repositorio ya duplica lógica entre cliente y server a propósito (p. ej. la ventana `godT`, `findSpawn`).
- **Consistencia**: se marca cada copia con `/* hora-ar:start */…/* hora-ar:end */` (mismo estilo que los bloques de `index.html`) para poder extraerlas y compararlas en el test, y para ubicar el helper de un vistazo.

### 4. Dónde va el prefijo y cómo se testea cada sitio (server sin exports)

- **`bot/cazador.js`** — el `log(...)` de `attack()` pasa a `log(horaAr() + \`⚔️  golpe a …\`)`. `horaAr` se **exporta** desde `module.exports` para poder testearlo/llamarlo. `log` ya es inyectable ⇒ el test lo captura.
- **`server/server.js`** — los dos `console.log` pasan a `console.log(horaAr() + \`…\`)`. Como `server.js` **no exporta**, el helper se testea **extrayendo el bloque `/* hora-ar:start */…/* hora-ar:end */` del fuente con `new Function`** (patrón ya usado por `avatar-held.mjs`/`static.mjs` sobre `server.js`), y el **comportamiento observable** (la línea real en consola) se testea **spawneando el server y capturando su stdout** (patrón de `admin-hash.mjs`).

### 5. Estrategia de test: contrato determinista + comportamiento real, **nunca** contra el reloj real

Un `.mjs` nuevo, `server/test/hora-argentina.mjs`:

1. **Helper (ambas copias)**: extraer el bloque marcado de `server/server.js` y de `bot/cazador.js` con `new Function` (devolviendo `horaAr`), y asertar:
   - **epoch fijo documentado** `Date.UTC(2026,9,17,2,53)` → `horaAr(epoch) === '[23:53] '` (Argentina UTC−3, sin DST);
   - **medianoche** `Date.UTC(2026,9,17,3,0)` → `'[00:00] '` (fija que no aparezca `24:00`);
   - **contrato de formato** `/^\[\d{2}:\d{2}\] $/`;
   - **las dos copias coinciden** para el mismo epoch (anti-drift entre server y bot);
   - la zona del formatter resuelve a la de Argentina **tolerando el alias** (`America/Buenos_Aires` | `America/Argentina/Buenos_Aires`).
2. **Server (comportamiento real)**: spawn del server (puerto libre + `WORLD_FILE` temporal, como `bot-cazador.mjs`), un cliente WS manda `hello` ⇒ se asierta una línea de stdout que matchea `^\[\d{2}:\d{2}\] ➕ ` con el texto original detrás; al cerrar, `^\[\d{2}:\d{2}\] ➖ `.
3. **Bot (comportamiento real, sin red)**: `createHunter({ send: espía, log: captura, now: () => epochFijo })`, se lo pone con una presa en alcance y se tickea ⇒ la línea capturada empieza con `[23:53] ` y el texto `⚔️  golpe a …` queda intacto detrás.

- **Por qué así**: el **helper** prueba la zona/formato de forma independiente de la `TZ` de la máquina (el epoch fijo da el mismo `[HH:MM]` corriendo en cualquier `TZ`), y el **comportamiento** prueba que el prefijo realmente se aplica en los tres sitios reales (no sólo que el helper existe).
- **Alternativa descartada:** asertar `[HH:MM]` contra `new Date()` real — pasaría o fallaría según la `TZ` de la máquina y el minuto en que corre (flaky). Se descarta explícitamente.

### 6. Delta de `bots/hunter`: **ADDED** (nunca MODIFIED) + ordenamiento de archivado

`bots/hunter` **no está** en `openspec/specs/` (su spec vive en el change `bot-cazador`, completo 21/21 pero **sin archivar**). Verificado en la lógica de `openspec archive` (`specs-apply.js`): cuando la spec destino **no existe**, sólo se permiten **ADDED**; `MODIFIED`/`RENAMED` se **rechazan** ("only ADDED requirements are allowed for new specs"). Además, no hay **ninguna** requirement de logging que "modificar": esto es comportamiento **nuevo**, así que ADDED es lo semánticamente correcto.

- **Decisión**: el delta de `bots/hunter` va como `## ADDED Requirements` (una requirement nueva), **basado en la ubicación de la spec principal** (`specs/bots/hunter/spec.md`), no en la spec del change `bot-cazador`.
- **Ordenamiento**: el **paso recomendado** es archivar `bot-cazador` **antes** que este change, para que `openspec/specs/bots/hunter/spec.md` exista y el ADDED se **anexe**. Si se archivara este change **primero**, el ADDED igual **crea** la spec (quedaría con un `Purpose` placeholder `TBD` que el archive de `bot-cazador` no pisa) — funcional, pero deja la spec con placeholder. Por eso `tasks.md` deja el archivado como **Workflow follow-up** y el orden se anota en `proposal`/acá.
- **Alternativa descartada:** escribir el delta como **MODIFIED** sobre la spec del change `bot-cazador` — el CLI lo rechazaría (spec destino inexistente) y no hay requirement previa que modificar.

### 7. Impacto nulo en los tests existentes

`server/test/bot-cazador.mjs` inyecta `log: () => {}` (`:70` y `:361`) y **ningún** test asierta el texto de `conectados` (verificado con grep sobre `server/test/`). Como el change sólo **prefija** el mensaje (el texto original queda detrás), nada existente se rompe. El único cambio obligado en tests ajenos es **subir el conteo de archivos 16 → 17** en los dos asserts pinneados (grupo 4 de `tasks.md`).

### 8. Se elimina el tag `[bot]` del logger por defecto: la hora es el primer carácter de la línea

El logger por defecto del bot (`bot/index.js:41`) pasa de `(...a) => console.log('[bot]', ...a)` a `(...a) => console.log(...a)`. El mensaje del golpe ya viene con su prefijo `[HH:MM] ` construido en `cazador.js`; anteponer `[bot]` dejaba la hora **fuera del inicio** de la línea (`[bot] [00:12] ⚔️  golpe a …`), incumpliendo el pedido explícito (el `[HH:MM]` debe ser el primer carácter). Eliminar el tag es el cambio mínimo que lo cumple.

- **Alternativa descartada — mover `horaAr()` al logger**: (a) si el prefijo siguiera **también** en el mensaje de `cazador.js`, la hora saldría **duplicada** (`[00:12] [bot] [00:12] ⚔️ …`); (b) si se **sacara** de `cazador.js` para dejarlo sólo en el logger, el test del change —que captura el mensaje con un `log` **inyectado** (`createHunter({ log })`)— y la requirement de la spec (el prefijo va en el mensaje del golpe) dejarían de tener sentido, y se perdería la testabilidad determinista del texto. Además el logger es del **cableado** (`index.js`), no de la lógica pura (`cazador.js`), que es donde la spec ubica el contrato del mensaje.
- **Alternativa descartada — dejar `[bot]` y prefijar la hora después**: rompe el requisito de que la hora sea el **primer carácter** de la línea.
- **Efecto colateral (aceptado)**: las otras líneas del bot —`conectado a …`, `reconectando en … ms`, `desconectado`, `welcome id=… …`— pierden el tag `[bot]`. Es aceptado porque en Easypanel cada servicio tiene su propia vista de logs y el contenedor ya está identificado como `minicraft-bot` (el tag era redundante), y el pedido era justamente la hora al inicio.
- **Alcance**: cambia **sólo** el logger por defecto. Un `log` inyectado (tests, `bot-cazador.mjs`) sigue funcionando igual, y `cazador.js`/`announceKill` no se tocan.

## Risks / Trade-offs

- [Risk] **`hour12: false` podría renderizar `24:00` en alguna versión de ICU** (medianoche). Verificado `00:00` en node v24; el test de medianoche lo fija → si un runner muestra `24:00`, el test **falla y lo delata**. → Mitigación: el assert de medianoche + formato `/^\[\d{2}:\d{2}\] $/`; si apareciera, el fallback es `hourCycle: 'h23'` (mismo `Intl`, sin dependencias).
- [Risk] **Deriva entre las dos copias** del helper (server y bot) al editar una sola. → Mitigación: el test compara ambas copias para el mismo epoch.
- [Risk] **Alias de zona**: asertar `resolvedOptions().timeZone === 'America/Argentina/Buenos_Aires'` fallaría (devuelve `America/Buenos_Aires`). → Mitigación: el test tolera el alias y, sobre todo, asierta **comportamiento** (hora resultante), que es lo que importa.
- [Risk] **Cambio de la zona horaria argentina** (lo dejó de haber, pero podría volver). → El formatter con `timeZone` la seguiría; los asserts contra un epoch fijo asumen UTC−3 → un cambio de regla rompería el test **y obligaría a revisar**, que es lo deseado.
- [Risk] **Test de stdout del server**: capturar stdout es más frágil que una función pura (orden/timing de líneas). → Mitigación: se matchea **una línea** por patrón (join/leave) con `until(...)`, no el stdout completo; el helper ya cubre el formato/zona de forma pura.
- [Trade-off] **Duplicar el helper** (Decision 3) es deuda menor a cambio de respetar el límite `bot/`↔`server/`. → Aceptado; el test anti-drift la contiene.

## Migration Plan

1. **Server**: agregar el bloque `horaAr` y prefijar los dos `console.log` (`:172`, `:277`). Aditivo puro: ningún frame de protocolo ni comportamiento de juego cambia.
2. **Bot**: agregar el bloque `horaAr` (exportado), prefijar el `log` de `attack()` y **sacar el tag `[bot]`** del logger por defecto de `bot/index.js` (Decisión 8), para que la hora quede al inicio de la línea. La imagen del bot se redeploya igual que hoy.
3. **Verificación**: `cd server && npm test` (17 archivos) verde; levantar el server y ver en consola `[HH:MM] ➕/➖ …`, y el bot con `[HH:MM] ⚔️  golpe a …`.
4. **Rollback**: revertir los tres prefijos, restaurar el tag `[bot]` del logger por defecto, y borrar los bloques `hora-ar` + el test; nada más depende de esto.

## Open Questions

- **Nombre del archivo de test** (`hora-argentina.mjs`) y **epoch fijo** documentado: ajustables sin cambiar specs ni approach; los valores iniciales quedan en `tasks.md`.
- **Formato exacto del bloque marcado** (`/* hora-ar:start */…`) y del nombre exportado: decisión de implementación; el spec fija el comportamiento (formato/zona/mensaje intacto), no el marcador.
