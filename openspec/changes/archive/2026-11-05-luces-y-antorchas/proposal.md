# Proposal

## Why

De noche las antorchas y las luceritas brillan pero no alumbran: la escena solo tiene `HemisphereLight` y el sol/luna, así que construir un refugio iluminado no cambia nada. Además la antorcha solo se apoya en el piso (las paredes y los techos quedan sin opción) y no existe una lámpara colgante para alumbrar desde arriba.

Cualquier luz nueva tiene que poder apagarse en las PCs lentas: el nivel 0 de calidad existe justamente para 2 núcleos, así que la iluminación no puede ser obligatoria.

## What Changes

- **Antorchas y farolas iluminan de verdad**: `TORCH` y `LAMP` emiten una `PointLight`/`SpotLight` sin sombras que alumbra la geometría vecina, además de seguir viéndose encendidas con su material unlit actual. La lucerita (`GLOW`) solo brilla: no emite luz.
- **Luz ambiental bajo techo**: cuando la cabeza del jugador no ve el cielo, la luz ambiental se atenúa (hasta `ENCLOSED_DIM ≈ .32`) y vuelve suavemente al salir, para que encerrarse se vea oscuro sin cambiar el ciclo ni el servidor.
- **Pool fijo de luces con presupuesto por calidad**: 8 `PointLight` creadas una sola vez al arrancar (nunca se agregan ni se quitan en caliente). Cada ~0.25 s se encienden las fuentes más cercanas al jugador hasta el presupuesto del nivel vigente: **0 → 0 luces, 1 → 4, 2 → 8**. El resto queda en `intensity = 0`.
- **Antorcha orientable sin ítems nuevos**: un solo ítem "Antorcha". Según la cara donde se apoya (piso, pared o techo) el modelo se orienta solo: parada, inclinada hacia afuera de la pared, o colgada cabeza abajo.
- **Farola nueva (id 64, `LAMP`)**: lámpara colgada que se pega a la cara inferior de un bloque sólido, con varilla, pantalla y luz hacia abajo. Entra en el límite `v <= 64` que el servidor ya acepta, sin cambios de protocolo.
- **Colocación por cara**: para antorcha y farola el bloque clickeado (opuesto a la normal) debe ser sólido; una sola condición cubre piso, pared y techo. La farola exige además que la normal apunte hacia abajo.
- **Cascada de soporte local**: al romper un bloque sólido, los `TORCH`/`LAMP` vecinos que quedaron sin soporte se rompen en la misma edición, en una sola pasada.
- **La farola no bloquea**: se exime en `mobBlocked` para que jugadores, animales, zombis y el bot la atraviesen como la antorcha.

## Capabilities

### New Capabilities

- `world/lighting`: fuentes luminosas del mundo (antorcha, farola) que alumbran alrededor con un pool acotado de luces sin sombras, selección por cercanía, actualización al editar y sin recrear luces ni shaders en caliente; incluye la atenuación ambiental bajo techo. La lucerita brilla sin iluminar.
- `blocks/lamp`: bloque farola colgante (id 64), su colocación en la cara inferior de un bloque sólido, su luz hacia abajo, su paso libre y su sincronización multijugador.

### Modified Capabilities

- `blocks/torch`: la antorcha deja de ser decorativa y pasa a iluminar; se orienta sola según la cara del soporte (piso, pared o techo) y se puede colocar apoyada en cualquiera de las caras sólidas. Se elimina el comportamiento "no ilumina".
- `blocks/placement`: se agrega la rotura en cascada de antorchas y farolas que perdieron su soporte.
- `ui/config`: el nivel de calidad gráfica pasa a controlar también el presupuesto de luces (0/4/8) y se aplica en caliente.

## Impact

- `index.html`: pool de luces y especificaciones por bloque junto a la escena; presupuesto y selección periódica en `applyQuality` y el loop; índice de fuentes por chunk en `buildGlobalsForChunk`; render orientable de la antorcha y render de la farola en `emitGlobalCell`; `DEFS`/`INVENTORY` con `LAMP=64`; atlas con un tile libre (37); `doPlace`/`doBreak` con soporte por cara y cascada; `mobBlocked` exime la farola.
- `server/server.js`: sin cambios; la validación existente (`v <= 64`) ya admite el id nuevo y no valida soporte.
- `server/test/`: nuevo `lighting.mjs` (la suite pasa de 22 a 23 archivos) con los estáticos del pool, del presupuesto y de las orientaciones; se actualizan `static.mjs`, `worldgen.mjs` y `bed-sleep.mjs` de ids 0-63 a 0-64 y las guardas de conteo 22→23 (`config.mjs`, `lookguard.mjs`, `zombie-protocol.mjs`, `bed-sleep.mjs`, `camera.mjs`).
- Sin migración de datos: el mundo sigue guardando `{seed, edits}` y las antorchas/farolas son ediciones normales. Clientes viejos ignoran el id 64 y no se rompen.

## Out of Scope

- **No** se agregan sombras a las luces puntuales (`castShadow = false`): son luces baratas.
- **No** se implementa propagación de luz por vóxel ni horneado (tipo Minecraft): la luz es dinámica y aproximada.
- **No** se cambia el ciclo día/noche, el brillo del jugador ni la luz ambiental existente.
- **No** se agrega protocolo nuevo ni validación de soporte en el servidor.
- **No** se agregan conos de luz (`SpotLight`), parpadeo, animación de llama ni editor de color/intensidad.
- **No** se iluminan los meshes unlit (antorcha, lucerita, farola): siguen viéndose emisivos por sí mismos.
- **No** se modela luz para antorchas de otros jugadores de forma distinta: el cliente solo conoce los bloques del mundo.
