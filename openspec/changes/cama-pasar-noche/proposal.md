# Proposal

## Why

De noche la horda de zombis obliga a pelear o a esperar los ~3 minutos reales que dura la noche. No hay forma de coordinar un final anticipado entre varios jugadores. Además el servidor no distingue al bot de un humano: el bot se presenta como `mode:'player'`, así que cualquier regla que dependa de "jugadores reales" no puede implementarse hoy sin un identificador.

Una cama colocable y un quórum de sueño resuelven las dos cosas: dan un objetivo cooperativo ("durmamos todos") y hacen que la noche termine al amanecer en cuanto todos los jugadores reales están en la cama, sin esperar el reloj.

## What Changes

- **Bloque cama de 2 celdas orientada** (cabecera + pie): un ítem de paleta `BED` (id 59) que coloca dos bloques de mundo (`BED_X_FOOT/HEAD`, `BED_Z_FOOT/HEAD`, ids 60-63) según la dirección horizontal de la mirada. Romper cualquiera de las dos celdas rompe ambas, como las puertas. Se dibuja como una caja baja (media altura) con textura de cabecera, pie y lateral, y se puede apuntar con el raycast y pisar con auto-step.
- **Dormir**: click derecho sobre una cama de noche entra en estado `sleep`. El jugador deja de moverse y de girar, ve un overlay con el contador de durmientes y despierta al presionar WASD/space/click/ESC o al recibir daño. De día la cama no deja dormir.
- **Quórum de jugadores reales**: el servidor es la autoridad. Se consideran reales los conectados que no son bot (`bot:true` en el `hello`) y no son admin (`mode:'admin'`). Los muertos no cuentan. Cuando al menos un real está durmiendo y **todos** los reales duermen, la noche salta al comienzo del amanecer.
- **Salto de fase en el servidor**: el reloj pasa a tener un offset mutable (`sleepOffsetMs`) que `phaseNow()` suma; el salto deja la fase justo después del amanecer, difunde un `tod` inmediato (el cliente hace snap por el umbral existente), despierta a todos y los zombis mueren en el tick nocturno→diurno ya existente. La fase sigue sin persistirse en `world.json`.
- **Protocolo aditivo**: cliente→servidor `{t:'sleep', x,y,z}` y `{t:'wake'}`; `hello` acepta `bot:true`. Servidor→cliente `{t:'sleep', id, name, on, count, need}` en cada cambio, con `denied:'day'` para el rechazo diurno y `reset:true` al amanecer; `welcome` agrega `sleeping` y `sleepNeed`; mensajes de sistema por chat para "se durmió" y "amaneció". Los clientes viejos ignoran los mensajes nuevos.
- **Bot actualizado**: `bot/index.js` declara `bot:true` en su `hello`. Un cliente que no lo declare se sigue tratando como humano.

## Capabilities

### New Capabilities

- `world/sleep`: cama de 2 celdas, estado de sueño, quórum de jugadores reales (sin bot, sin admin, sin muertos), salto al amanecer, despertar y feedback.

### Modified Capabilities

- `world/daynight`: el reloj del servidor gana un offset de fase mutable para el salto al amanecer; `phaseNow()` sigue siendo la única fuente y la fase sigue sin persistirse. Se agrega el requisito de salto coordinado.
- `blocks/placement`: se agrega la colocación de la cama en dos celdas (pie + cabecera orientada) con las mismas guardas de ocupación que la puerta, y la rotura de ambas celdas.
- `blocks/names`: se fija el nombre visible de la cama (`Cama 🛏️`).
- `ui/inventory`: la cama aparece en la paleta del inventario (`E`) para poder asignarla a la hotbar.
- `bots/hunter`: el bot declara `bot:true` en su `hello` para quedar excluido del quórum de sueño, sin dejar de ser `mode:'player'` para el resto del juego.

## Impact

- `index.html`: ids y `DEFS` (59-63), `INVENTORY`, atlas (tiles 34-36), rama de render de cama, `collidesAt`/`slabBlocked`, `doPlace`/`doBreak`, `onRightDown`, estado `sleep` + overlay, `wakeUp`, `damage`, `pointerlockchange`, handler de red (`sleep`/`welcome`), loop/gravedad.
- `server/server.js`: offset de fase, `welcome` y registro del jugador (`bot`, `sleeping`), handlers `sleep`/`wake`, despertar por muerte/desconexión/edit de la cama, salto y difusión.
- `server/sleep.js` (nuevo): módulo puro de quórum y cálculo del salto al amanecer.
- `bot/index.js`: `bot:true` en el `hello`.
- `server/test/`: nuevo `bed-sleep.mjs` (la suite pasa de 21 a 22 archivos); actualización de las guardas de conteo (`config.mjs`, `lookguard.mjs`, `zombie-protocol.mjs`), de ids constantes (`worldgen.mjs`, `static.mjs`) y ampliación e2e de `protocol.mjs`.
- Sin migración de datos: el mundo sigue guardando solo `{seed, edits}` y las camas son ediciones normales.

## Out of Scope

- **No** se renderizan avatares remotos acostados: el sueño ajeno se comunica por chat y por el contador del overlay.
- **No** se agrega crafting, drops, recetas ni conteo de ítems: la cama se elige desde la paleta existente.
- **No** se agrega voto, temporizador ni mayoría: el quórum es unánime.
- **No** se persiste el sueño ni la fase entre reinicios.
- **No** se valida en el servidor que el jugador esté cerca de la cama ni que la cama exista (es un juego cooperativo, igual que la vida del jugador es client-authoritative).
- **No** se protege al durmiente de los zombis: si recibe daño, se despierta.
