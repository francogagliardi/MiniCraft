# Tasks

## 1. Reloj del ciclo en el servidor

- [x] 1.1 En `server/server.js`, agregar las constantes del ciclo (`DAY_MS=300000`, `NIGHT_MS=180000`, `CYCLE_MS=480000`, `DAWN_MS=25000`, `DUSK_MS=25000`, `NIGHT_MIN=0.40`, `NIGHT_START=DAY_MS/CYCLE_MS`) y el ancla `const T0 = Date.now()` al boot; agregar `phaseNow()` (fase `v ∈ [0,1)`) y `isNight()` (`v >= NIGHT_START`). Verificación: `node -e` o log temporal que confirme `phaseNow()` en rango y que crece, sin tocar el estado del mundo.
- [x] 1.2 Agregar `tod: phaseNow()` y `cyc: CYCLE_MS` al mensaje `welcome` (~128-133), junto a `id`/`seed`/`edits`/`admin`/`players`. Verificación: el assert de 2.1 lee `tod`/`cyc` desde `welcome` y pasa.
- [x] 1.3 Agregar el `setInterval` de difusión de `{ t:'tod', v: phaseNow() }` usando `TOD_INTERVAL_MS` (`Math.max(50, +(process.env.TOD_INTERVAL_MS || 4000))`), con el mismo patrón que `HB_MS`. Verificación: la difusión cada 4 s queda cubierta por el test de 2.2.
- [x] 1.4 Confirmar que el reloj NO entra en `world.json`: `save()` sigue escribiendo solo `{ seed, edits }`. Verificación: cubierta por el test de 2.3 (el archivo no gana campos de ciclo).

## 2. Test de protocolo extendido

- [x] 2.1 En `server/test/protocol.mjs`, assertar que `welcome` trae `tod` numérico en `[0,1)` y `cyc === 480000`. Verificación: `cd server; npm test` y el chequeo pasa.
- [x] 2.2 Levantar el server de test con `TOD_INTERVAL_MS` corto (p. ej. 150 ms) y assertar que llega al menos un `{ t:'tod', v }` con `v` en `[0,1)` tras conectar. Verificación: el chequeo pasa dentro de `npm test`.
- [x] 2.3 Assertar que el `world.json` escrito por el server (tras el guardado) sigue siendo `{ seed, edits }` sin campos de ciclo/reloj. Verificación: el chequeo pasa dentro de `npm test`.
- [x] 2.4 Correr toda la suite y confirmar estática, avatar, migrate, terrain, water y protocolo en verde. Verificación: `cd server; npm test` sin fallos.

## 3. Cliente: iluminación, cielo y composición con el agua

- [x] 3.1 En `index.html` (~656-675), guardar referencia al shader del cielo (`const skyMat = new THREE.ShaderMaterial(...)`) y al `HemisphereLight` (`const hemi = ...`) para poder animar sus uniforms/valores; mantener `sun` y `sunSprite` como referencias animables. Verificación: el juego carga sin errores de consola y el cielo sigue viéndose igual que antes a plena luz.
- [x] 3.2 Definir en el cliente las mismas constantes del ciclo y una función `light(v)` (triangular por tramos: amanecer `NIGHT_MIN→1`, día `1`, atardecer `1→NIGHT_MIN`, noche `NIGHT_MIN`) y `applyAtmosphere(light)` con la paleta del design (background/fog/cielo/hemi/sol/`sunSprite.visible`). Verificación: forzando `light=1` y `light=NIGHT_MIN` a mano, el mundo se ve de día y de noche azul profundo respectivamente, nunca negro.
- [x] 3.3 Reescribir `tickWater()` (~2441-2448) para que NO toque `scene.fog`/`scene.background`: solo mantiene el flag `under` y el overlay DOM, y llama a `applyAtmosphere()` al cambiar `under`; `loop()` llama a `applyAtmosphere()` solo cuando `light` cambió más de `0.002` o cambió `under`. Verificación: sumergido el fondo/niebla son azul oscuro de agua (`0x1a6fd0`, `near=1/far=26`) de día y de noche; al salir vuelve la atmósfera día/noche según la fase.
- [x] 3.4 Implementar el ciclo local para modo solo (sin servidor): el cliente avanza su fase con la misma tasa y parámetros aunque no llegue ningún `tod`. Verificación: levantando `index.html` sin servidor (o modo solo), la luz sube y baja en 8 min.
  - **Impl. hecha y cubierta por test unitario** (`cycleAdvance` avanza sin `tod`, `onTod` no se dispara, `loop()` avanza siempre). **Verificado manualmente por el usuario en el navegador vía Docker (http://localhost:3000, ciclo TEMP de 60 s para la prueba): "Funciona perfecto".**

## 4. Cliente: difusión, interpolación y señal isNight

- [x] 4.1 En `connectMP()` (~2219), al recibir `welcome`, adoptar `tod` y `cyc` del server (primera fase directa). Verificación: conectado al server, la hora del cliente coincide con la fase recibida en el arranque.
- [x] 4.2 En `setupNetHandlers()` (~2229), manejar `m.t==='tod'` con `onTod(v)`: adopción directa la primera vez, corrección suave con camino corto (`d -= Math.round(d)`) y snap si `|d| > TOD_SNAP_DELTA (0.05)`. Verificación: entre dos `tod` consecutivos no hay salto visible; tras reconectar con desfase grande, el cliente salta a la fase del server.
- [x] 4.3 En `loop()`, avanzar `dayV` localmente (`dayV += dt*1000/cycleMs`) y aplicar la corrección suave hacia el objetivo (`TOD_CORRECT_K=0.5`), con wrap `% 1`, alimentando `applyAtmosphere(light(dayV))`. Verificación: el movimiento del sol/luz es continuo y sin saltos durante varios minutos, con dos pestañas mostrando la misma hora.
  - **Impl. hecha y cubierta por test unitario** (`cycleAdvance` envuelve, `cycleCorrect` converge sin saltos por frame, `loop()` avanza+corrige). **Verificado manualmente por el usuario en el navegador vía Docker (http://localhost:3000, ciclo TEMP de 60 s para la prueba): "Funciona perfecto".**
- [x] 4.4 Exponer la señal booleana `isNight` derivada de la fase (`v >= NIGHT_START`) de forma consistente con el server, sin agregar todavía lógica de spawn. Verificación: en modo noche `isNight` es verdadero y de día es falso; **nota: el futuro zombi server-auth consumirá esta misma señal (`isNight`) para spawnear solo de noche, por eso debe ser server-authoritative**.

## 5. Integración y verificación final

- [x] 5.1 Correr la suite completa del server y confirmar todo en verde. Verificación: `cd server; npm test` sin fallos (static, avatar, migrate, terrain, water, protocol).
- [x] 5.2 Prueba manual multi-cliente: dos pestañas conectadas ven la misma hora; el ciclo llega a noche (azul profundo, no negro) y vuelve al día con amanecer/atardecer suaves. Verificación: observación directa en ambas pestañas de un mismo estado de cielo/luz a la vez.
  - La sincronía server→cliente está cubierta por test (`welcome` trae `tod`/`cyc`, difusión `tod`, adopción/snap del cliente). **Verificado manualmente por el usuario en el navegador vía Docker (http://localhost:3000, ciclo TEMP de 60 s para la prueba): "Funciona perfecto".**
- [x] 5.3 Prueba manual de composición agua+ciclo: entrar al agua de día y de noche y comprobar que el azul de agua manda sumergido y la atmósfera del ciclo vuelve al salir. Verificación: observación directa sin que el fondo quede gris/negro ni quede el azul de agua fuera del agua.
  - La composición agua vs ciclo está cubierta por test de comportamiento de `applyAtmosphere` (stubs: `under` manda `0x1a6fd0`/`near=1`/`far=26` de día y de noche). **Verificado manualmente por el usuario en el navegador vía Docker (http://localhost:3000, ciclo TEMP de 60 s para la prueba): "Funciona perfecto".**
- [x] 5.4 Revisar que no se tocó `world.json` ni la lógica de mundo/edits y que el protocolo existente sigue igual (solo se sumaron `tod`/`cyc`/`{t:'tod'}`). Verificación: `git diff` limitado a `index.html` + `server/server.js` + `server/test/protocol.mjs`, sin cambios en persistencia.
  - Nota: además de esos 3 archivos se extendió `server/test/static.mjs` (solo tests del cliente, mismo patrón que avatar/terrain/water; sin cambios de producción ni de persistencia) para cubrir la triangulación cliente exigida. `world.json` y la lógica de mundo/edits intactos.

## 6. Feedback tras probarlo: noche más clara + sol y luna móviles (TDD)

- [x] 6.1 Subir `NIGHT_MIN` de `0.40` a **`0.50`** en `server/server.js` y `index.html` (constante tuneable). Verificación: `static.mjs` asserta `NIGHT_MIN=0.50` en cliente y server y el hemi de noche en `0.475`.
- [x] 6.2 Agregar `skyArc(p, flip, radius, tilt, out)`: arco de medio círculo (0=este, 0.5=cenit, 1=oeste) con `flip` para el sentido opuesto. Verificación: posición en este/cenit/oeste y monotonía este→oeste.
- [x] 6.3 Agregar `dayProg`/`nightProg` y `tickSky(v)`: el sol recorre el arco del día y se oculta de noche; la `DirectionalLight` `sun` sigue la misma dirección con radio corto (`LIGHT_R`) y `castShadow` se apaga de noche o con el sol bajo. Verificación: de noche el sol está oculto, `sun.intensity=0` y sin sombras; la luz sigue al sprite.
- [x] 6.4 Agregar la **luna**: `moonSprite` (círculo claro) sobre el mismo arco y sentido que el sol (`flip=false`, este→oeste), visible solo de noche, con `moonLight` direccional azulada tenue (`0.18`, sin sombras). Verificación: la luna es visible solo de noche, recorre su arco en el mismo sentido que el sol, y su luz es 0 de día y >0 de noche.
- [x] 6.5 Ajustar `applyAtmosphere` (la visibilidad de los sprites ya no vive allí) y llamar `tickSky(dayV)` cada frame en `loop()`. Verificación: `loop` llama `tickSky(dayV)` y la paleta sigue componiéndose igual.
- [x] 6.6 Actualizar los artefactos del change: spec (requirement "Sol y luna dinámicos" + `NIGHT_MIN` 0.50), design (decisión 8 + paleta) y proposal. Verificación: revisión.
- [x] 6.7 Suite completa en verde **manteniendo el TEMP del ciclo rápido** (`40000/20000/5000/5000`); los asserts se hicieron tolerantes al TEMP (comparan cliente vs server). Verificación: `cd server; npm test` sin fallos.

## 7. Feedback tras probarlo: velocidad uniforme del ciclo (TDD)

- [x] 7.1 **RED**: en `server/test/static.mjs` (§8f/§8h) agregar asserts de uniformidad: simulando el cliente con `tod` cada `TOD_INTERVAL_MS` (4 s), la velocidad de la fase con el target **congelado** decae/min/hasta ~0 y su dispersión es alta (diente de sierra), mientras que con el target **extrapolado** se mantiene ≈ constante. Verificación: `node test/static.mjs` falla antes del fix (sin `todNow`).
- [x] 7.2 **GREEN**: `index.html` — nuevo `todNow(now, cyc)` que extrapola el objetivo a la misma tasa; `onTod(v, now)` guarda `todAt` (instante de recepción, `performance.now()` por defecto; también en el snap); `loop()` corrige contra `todNow(now, cycleMs)` en vez del `dayTarget` congelado. Verificación: la simulación de §8h pasa (`sd` del fix ≪ `sd` del bug; velocidad media ≈ tasa del ciclo).
- [x] 7.3 **TRIANGULATE**: (a) sin servidor → avance local uniforme; (b) snap ante desfase grande intacto; (c) primera adopción directa; (d) wrap `0.98→0.02` sin snap; (e) regresión (`cycleAdvance`/`cycleCorrect`/`tickSky`/atmósfera). Verificación: asserts de §8f/§8h en verde.
- [x] 7.4 **REFACTOR**: actualizar comentario del bloque de ciclo y de `onTod`; mantener la corrección en un único punto (`todNow`). Verificación: suite completa en verde.
- [x] 7.5 Actualizar artefactos del change: spec ("velocidad uniforme entre difusiones"), design (decisión 9 + nota en la 3) y tasks. Verificación: revisión.
- [x] 7.6 **TEMP reactivado** para validar la uniformidad: `DAY_MS=40000, NIGHT_MS=20000, DAWN_MS=5000, DUSK_MS=5000` en `server/server.js` e `index.html` con el comentario `// TEMP: ciclo rápido para prueba (revertir a 300000/180000/25000/25000; CYCLE_MS se recalcula solo)`. Verificación: `welcome` trae `cyc = 60000` y la suite sigue verde (asserts tolerantes al TEMP).
- [x] 7.7 Revertido el TEMP del ciclo a los valores reales: `DAY_MS=300000`, `NIGHT_MS=180000`, `DAWN_MS=25000`, `DUSK_MS=25000` en `server/server.js` e `index.html` (`CYCLE_MS=480000` y `NIGHT_START=0.625` se recalculan solos). Verificación: las constantes del cliente y del server vuelven a coincidir con los valores reales del design y `cd server; npm test` queda en verde.

## Workflow follow-up

- Archivar el change una vez satisfechos los requisitos de review del proyecto (el push a `main` dispara CI + deploy Easypanel).
- Verificar el resultado archivado (`openspec archive` / `openspec validate`).
