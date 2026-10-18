# Tasks

> Modo **Strict TDD**: cada superficie arranca con un test que **falla** (RED), sigue con la implementación mínima que lo pone **verde** (GREEN) y cierra **triangulando** con casos adicionales que fuerzan generalidad (TRIANGULATE). Los *gates* indican el comando y el resultado esperado de cada paso.

## 1. Prefijo de hora en los logs del server (`net/presence`)

- [x] 1.1 **RED** — Crear `server/test/hora-argentina.mjs` con: (a) el test del helper extraído del bloque marcado `/* hora-ar:start */…/* hora-ar:end */` de `server/server.js` con `new Function` (patrón `avatar-held.mjs`), asertando **un** caso base `horaAr(Date.UTC(2026,9,17,2,53)) === '[23:53] '`; y (b) el test de comportamiento sobre **stdout real** del server (spawn en puerto libre + `WORLD_FILE` temporal, patrón `bot-cazador.mjs`/`admin-hash.mjs`): `hello` ⇒ aparece una línea `^\[\d{2}:\d{2}\] ➕ ` con el texto original detrás; `close` ⇒ `^\[\d{2}:\d{2}\] ➖ `. **Gate RED**: `node server/test/hora-argentina.mjs` **falla** (no existe el bloque ni el prefijo).
- [x] 1.2 **GREEN** — En `server/server.js`, agregar el bloque marcado `/* hora-ar:start */…/* hora-ar:end */` con `FMT_AR` (hoisteado, `Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false })`) y `const horaAr = (now = Date.now()) => \`[${FMT_AR.format(new Date(now))}] \`;`, y prefijar los dos `console.log` con `horaAr() + \`…\``: unión (`:277`) y salida en `removePlayer()` (`:172`). **Gate GREEN**: `node server/test/hora-argentina.mjs` **pasa** (helper + las dos líneas de stdout con prefijo y texto intacto). No tocar ningún otro log del server.
- [x] 1.3 **TRIANGULATE** — Ampliar el test del helper con casos que fuercen generalidad: medianoche `Date.UTC(2026,9,17,3,0)` ⇒ `'[00:00] '`, contrato de formato `/^\[\d{2}:\d{2}\] $/`, y que la zona resuelva a la de Argentina **tolerando el alias** (`America/Buenos_Aires` | `America/Argentina/Buenos_Aires`). **Gate TRIANGULATE**: `node server/test/hora-argentina.mjs` **pasa** con los casos nuevos y sigue fallando si el prefijo no refleja la hora argentina.

## 2. Prefijo de hora en el log de golpe del bot (`bots/hunter`)

- [x] 2.1 **RED** — Extender `server/test/hora-argentina.mjs` con: (a) el test del helper extraído del bloque marcado de `bot/cazador.js` (mismo epoch ⇒ `'[23:53] '`) y (b) el test de comportamiento **sin red** (`createHunter({ send: espía, log: captura, now: () => Date.UTC(2026,9,17,2,53) })`, presa en alcance, un `tick` ⇒ la línea capturada empieza con `'[23:53] '` y el texto `⚔️  golpe a …` queda intacto detrás). **Gate RED**: `node server/test/hora-argentina.mjs` **falla** en la parte del bot (el bloque no existe y `horaAr` no se exporta).
- [x] 2.2 **GREEN** — En `bot/cazador.js`, agregar el bloque marcado `/* hora-ar:start */…/* hora-ar:end */` con el mismo `FMT_AR`/`horaAr`, **exportar `horaAr`** en `module.exports` (`:405-408`) y prefijar el `log(...)` de `attack()` (`:164`) con `horaAr() + \`⚔️  golpe a …\``. **Gate GREEN**: `node server/test/hora-argentina.mjs` **pasa** (helper del bot + comportamiento del golpe). No tocar `announceKill` (`:176-178`).
- [x] 2.3 **TRIANGULATE** — Agregar la aserción **anti-drift**: las dos copias del helper (server y bot) producen salida **idéntica** para el mismo epoch, y el caso de medianoche del bot. **Gate TRIANGULATE**: `node server/test/hora-argentina.mjs` **pasa** y falla si una copia se edita y la otra no.

## 3. El logger por defecto del bot no desplaza la hora (saca el tag `[bot]`)

> El mensaje del golpe ya llega con su prefijo `[HH:MM] ` desde `cazador.js`; el logger por defecto de `bot/index.js:41` anteponía `[bot]`, dejando la hora **fuera del inicio** de la línea.

- [x] 3.1 **RED** — Extender `server/test/hora-argentina.mjs` con el caso de **comportamiento del logger por defecto**: levantar el bot REAL (`createBotClient` de `bot/index.js` con un `WebSocket` falso) **sin** inyectar `log`, capturar `console.log` y asertar que la línea del golpe **empieza** con `[HH:MM] ` (regex ancorada `^\[\d{2}:\d{2}\] ⚔️  golpe a …$`, con reloj fijo) y que **no** contiene ningún tag (`[bot]`) delante. **Gate RED**: `node server/test/hora-argentina.mjs` **falla** (el logger por defecto antepone `[bot]` ⇒ `[bot] [23:53] ⚔️ …`, 3 chequeos en rojo).
- [x] 3.2 **GREEN** — En `bot/index.js` (`:41`), el logger por defecto pasa a `(...a) => console.log(...a)` (sin el tag `[bot]`). **Sólo** esa línea: no se tocan los otros logs del bot ni `bot/cazador.js` ni `announceKill`. **Gate GREEN**: `node server/test/hora-argentina.mjs` **pasa** (24/24).
- [x] 3.3 **TRIANGULATE** — Verificar que el test **detecta** el problema: revertir temporalmente el tag `[bot]` en `bot/index.js` ⇒ `node server/test/hora-argentina.mjs` **vuelve a fallar** (exit 1, 3 chequeos); restaurar el fix ⇒ **verde**. **Gate TRIANGULATE**: falla con el tag, pasa sin él (regex ancorada + ausencia de `[bot]`).

## 4. Alta del test en la suite y conteo

- [x] 4.1 Dar de alta `test/hora-argentina.mjs` en `server/package.json:scripts.test` y subir el conteo **16 → 17** en los **dos** asserts pinneados: `server/test/zombie-protocol.mjs:287-289` (`required` + "16") y `server/test/lookguard.mjs:171-175` (`required` + `count === 16`). **Gate**: `node test/zombie-protocol.mjs` y `node test/lookguard.mjs` **verdes** (el archivo nuevo queda enumerado y el conteo coincide). `static.mjs` y `protocol.mjs` **no se tocan**.

## 5. Verificación integral

- [x] 5.1 Correr la suite completa `cd server && npm test` y verificar que los **17 archivos** pasan, incluidos los pre-existentes pinneados `static.mjs` y `protocol.mjs` **sin cambios** (`bot-cazador.mjs` no se rompe: inyecta `log: () => {}` y no asierta el texto de `conectados`). **Gate**: exit code 0 y 17 archivos OK.
- [x] 5.2 Chequeo manual de punta a punta: levantar el server y el bot y ver en consola `[HH:MM] ➕ …`, `[HH:MM] ➖ …` y `[HH:MM] ⚔️  golpe a …`, con la hora de Argentina (comparar contra `https://time.is/Argentina`). **Gate**: las tres líneas muestran el prefijo correcto y el texto original detrás. **Evidencia (sesión manual real, server + bot + jugador)**: `[00:12] ➕ …`, `[00:12] ➖ …`, `[00:12] ⚔️  golpe a …` — la hora es el primer carácter en las tres (sin tag delante).

## Workflow follow-up

- **Archivar `bot-cazador` primero** (change completo 21/21): su archive crea `openspec/specs/bots/hunter/spec.md` con su `Purpose`, y así el delta ADDED de este change se **anexa** en vez de crear la spec con un `Purpose` placeholder `TBD` (ver `design.md`, Decisión 6).
- Archivar este change con `/opsx:archive` cuando la revisión del proyecto esté satisfecha.
