# Tasks

## 1. RED: tests del quórum, la cama y el estado de sueño

- [x] 1.1 Crear `server/sleep.js` con la API pura vacía (`isExempt`, `quorum`, `dawnAdvanceMs`) y `server/test/bed-sleep.mjs` con los unitarios: bot y admin exentos; muertos fuera de `need` y de `count`; un solo real durmiendo no alcanza con dos; dos de dos alcanza; admin solo durmiendo dispara; `dawnAdvanceMs` es monótono y suma ~1 s. Correr `cd server && node test/bed-sleep.mjs` y verificar que falla por lógica/API ausente, no por sintaxis.
- [x] 1.2 En `bed-sleep.mjs`, agregar estáticos de `index.html`: ids 59-63 en la línea de constantes, `DEFS` de las cuatro mitades con `cube:1`, `bed:1`, `bedAxis`, `bedHead`, `hard` y `tiles`; `BED` como `item:'bed'`; `INVENTORY` lo incluye; rama `DEFS[b]?.bed` en `emitGlobalCell`; `doPlace` arma dos celdas; `doBreak` rompe la pareja; `state='sleep'` y overlay; `wakeUp` y sus disparadores; handlers `sleep`/`wake` en el cliente.
- [x] 1.3 En `bed-sleep.mjs`, agregar estáticos de `server/server.js` (`sleepOffsetMs` sumado en `phaseNow`, handlers `sleep`/`wake`, `me.bot`, `welcome.sleeping`/`sleepNeed`, salto al amanecer, despertar por muerte/desconexión/edit) y de `bot/index.js` (`bot:true` en el `hello`).
- [x] 1.4 Actualizar las guardas de conteo de 21→22 en `server/test/config.mjs`, `lookguard.mjs` y `zombie-protocol.mjs`, y agregar `bed-sleep` a la cadena de `server/package.json`. Verificar que `npm test` falla por los tests nuevos, no por el conteo.
- [x] 1.5 Actualizar `server/test/worldgen.mjs` (regex de ids hasta `BED_Z_HEAD=63;` y drift `mobBlocked`/`isSolid` de las camas) y `server/test/static.mjs` (constantes 59-63 y tiles 34-36 dibujados). Verificar que fallan contra el HTML actual.

## 2. GREEN: bloques, texturas, render y colisión

- [x] 2.1 En `index.html`, agregar `BED=59, BED_X_FOOT=60, BED_X_HEAD=61, BED_Z_FOOT=62, BED_Z_HEAD=63` a la línea de ids y sus entradas en `DEFS` (ítem de paleta + cuatro mitades), con `css`, `name:'Cama 🛏️'`, `tile`/`tiles` 34-36 y `hard:0.3`.
- [x] 2.2 Dibujar los tiles 34 (tapa cabecera con almohada), 35 (tapa pie con manta) y 36 (lateral) en el atlas, sin salir de las 8×5.
- [x] 2.3 Agregar `BED` a `INVENTORY` sin tocar la hotbar de 9 y ajustar el icono de `select` para `item:'bed'`.
- [x] 2.4 Agregar la rama `DEFS[b]?.bed` en `emitGlobalCell` (media altura: laterales, tapa y fondo) y las guardas de colisión en `collidesAt` (`py >= y+0.5`) y `slabBlocked` (auto-step). Verificar que el raycast ya la apunta por `cube`.

## 3. GREEN: colocación y rotura de la cama de 2 celdas

- [x] 3.1 En `doPlace`, interceptar `DEFS[id].item === 'bed'` antes del rechazo genérico: derivar eje y signo de `lookDir()`, calcular pie y cabecera, validar mundo/celdas libres/`ocupadoPor` en ambas, y enviar dos `editBlock`.
- [x] 3.2 En `doBreak`, detectar `DEFS[b].bed` y romper la pareja (pie↔cabecera) con dos `editBlock`, conservando el comportamiento actual si la pareja no existe.
- [x] 3.3 En `onRightDown`, antes de `doPlace`, detectar click derecho sobre una cama y llamar a `enterSleep(x,y,z)`; si no es de noche, toast y no dormir.

## 4. GREEN: reloj, quórum y protocolo del servidor

- [x] 4.1 Implementar `server/sleep.js` (`isExempt`, `quorum`, `dawnAdvanceMs`) hasta que los unitarios de 1.1 pasen.
- [x] 4.2 En `server/server.js`, agregar `sleepOffsetMs`, sumarlo en `phaseNow()` y crear `skipNight()` (offset, limpieza de sueño, `tod` inmediato, reset y chat de amanecer).
- [x] 4.3 Registrar `bot` y `sleeping`/`sleepBed` en `me`, y agregar `sleeping`/`sleepNeed` al `welcome`.
- [x] 4.4 Implementar los handlers `sleep` (solo de noche, rechazo `denied:'day'`, marcar, recalcular y saltar si corresponde) y `wake`; despertar por `mv` con `dead=1`, por `edit` de la celda de la cama y por desconexión; recalcular y difundir en cada cambio.
- [x] 4.5 En `bot/index.js`, enviar `bot:true` en el `hello`. Verificar que el bot sigue declarando `mode:'player'` y `skin`.

## 5. GREEN: estado `sleep` y overlay en el cliente

- [x] 5.1 Agregar el overlay de sueño al HTML/CSS (contador `count/need`, ayuda "WASD o click para despertar") y las funciones `enterSleep`, `wakeUp` y `renderSleep`.
- [x] 5.2 Cablear los disparadores de despertar: `keydown` (WASD/space antes del guard de `play`), `mousedown`, `damage()`, `pointerlockchange` al perder el lock, y los mensajes del servidor (`on:false` propio, `reset:true`, `denied:'day'`).
- [x] 5.3 Mantener el `mv` de keepalive mientras se duerme y asegurar que gravedad corre pero movimiento y mirada no; ajustar el loop si hace falta.
- [x] 5.4 En el handler de red del cliente, procesar `sleep` (contador y despertar) y `welcome.sleeping`/`sleepNeed` sin romper clientes viejos.

## 6. Integración y suite

- [x] 6.1 Ampliar `server/test/protocol.mjs` (e2e): `hello` con `bot:true`, `welcome.sleeping`, rechazo de día, dos clientes que duermen y disparan el salto con `ZOMBIE_FORCE_NIGHT=1` y tick alto, `tod` ≈ amanecer, reset y `wake` manual, desconexión de un durmiente.
- [x] 6.2 Correr `cd server && npm test` y verificar **22/22** archivos verdes (reintentar una vez `zombie-protocol.mjs` si aparece el flake conocido de cadencia `phit`).
- [x] 6.3 Verificar que `openspec validate cama-pasar-noche --strict` pasa y que no quedan referencias a 21 tests ni a ids hasta 58.

## Workflow follow-up

- Levantar `docker compose up --build -d` (server + bot, porque el change toca `bot/`), avisar qué mirar y pedir aprobación explícita en http://localhost:3000. Probar: colocar la cama de noche, dormir, ver el contador, despertar con WASD/click, que el admin y el bot no bloqueen, que con dos jugadores haga falta que duerman los dos, que amanezca y los zombis desaparezcan.
- Al aprobar: `docker compose down`, commits en español (`feat(sleep):`, `chore(openspec):`), push a `main` y `openspec archive cama-pasar-noche`.
