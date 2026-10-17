# Design

## Context

Ver `proposal.md` (Why). Estado actual en `index.html`:

- Modelos: `makePig` (~:1515) y `makeSheep` (~:1533) construyen el grupo con el helper `box(w,h,d,color,x,y,z,parent)` (MeshLambert, sin atlas) y devuelven el shape `{ g, head, legs, kind, tx, tz, wait, vy, onGround, stuck, t, petCd, say }`.
- Spawn: `spawnAnimals(rng)` (~:1549) hace una pasada hasta `pigs<8||sheep<6` y elige con `pigs<=sheep ? makePig : makeSheep`, validando pasto, espacio libre y `collidesAt(...,.32,1.2)`.
- IA: `tickAnimal(a,dt)` (~:1562) es genérica salvo la animación de patas, que indexa fijo `a.legs[0..3]` (marcha diagonal) y por tanto asume 4 patas. `pet(a)` (~:1588) es genérica y usa `a.say()`.
- Sonido: `tone(...)` (~:1236) con `sfxOink`/`sfxBaa` (~:1249).

## Goals / Non-Goals

**Goals:**

- Sumar una gallina como tercer animal con el menor cambio posible, reutilizando `box`/`lamC`, `tickAnimal`, `pet` y el filtro de spawn.
- Mantener intactos cerdos y ovejas (mismo ritmo, mismo spawn, misma marcha).

**Non-Goals:**

- No parametrizar velocidad/tamaño de colisión por animal (la gallina usa el `sp=1.3` y el radio/altura `(.32,1.2)` compartidos); no tocar `collidesAt`, `slabBlocked` ni la física del jugador.
- No tocar `server/server.js`, atlas/texturas ni el protocolo.
- No rediseñar `tickAnimal` más allá de la animación de patas.

## Decisions

1. **Modelo `makeChicken` chico, mismo shape y helpers.**
   Por qué: `tickAnimal`/`pet` ya funcionan con ese contrato; el modelo solo aporta geometría. Cuerpo blanco `box(.36,.34,.44)`, cresta roja sobre la cabeza, pico y patas amarillas, dos alitas laterales; altura total ~0.65, claramente menor que cerdo/oveja (~1.0-1.1). `kind:'chicken'`.
   Alternativas: textura/atlas dedicado (rompe el patrón sin-atlas y suma riesgo), reutilizar el modelo de cerdo re-escalado (se ve mal).

2. **Objetivo de 6 gallinas y elección por déficit de ratio.**
   Por qué: 8 cerdos + 6 ovejas + 6 gallinas mantiene el conteo sano para la performance de una pasada de spawn. La regla actual `pigs<=sheep` no escala a tres tipos; se reemplaza por "elegir el tipo con menor `count/target`" (más sub-poblado), con empate en orden cerdo → oveja → gallina. Con targets iguales el criterio colapsa al "menor conteo" actual.
   Alternativas: tercios iguales con `rng()` puro (deja tipos desbalanceados por azar), tercer contador con regla ad-hoc paralela (duplica lógica).

3. **Generalizar la animación de patas de `tickAnimal` a `a.legs.forEach`.**
   Por qué: la gallina tiene 2 patas y el código actual hace `a.legs[2].rotation`/`a.legs[3].rotation`, que serían `undefined` y romperían el loop de render. Un `forEach` con la regla `(i===0||i===3) ? sw : -sw` reproduce EXACTO el paso diagonal de 4 patas (0,3 → +sw; 1,2 → -sw) y da alternancia correcta en 2 patas (0 → +sw; 1 → -sw).
   Alternativas: dar 4 patas a la gallina (visualmente incorrecto) o rellenar `legs` con stubs invisibles (hacky); condicionar por `a.kind` (acopla la IA al tipo).

4. **Sonido propio `sfxCluck` y toast `🐔 ¡Clo clo!`.**
   Por qué: dos tonos cortos y agudos (~900→520 Hz y ~700→420 Hz, `square`, ~0.06-0.07 s) imitan un cloqueo y se distinguen del oink grave y del beee. Coherente con `sfxOink`/`sfxBaa` en la sección `tone(...)`.
   Alternativas: reutilizar `sfxPop` (no identifica al bicho), tono único (suena plano).

## Risks / Trade-offs

- [Generalizar la animación de patas altera el paso de cerdos/ovejas] → Mitigación: la regla `(i===0||i===3)?sw:-sw` es idéntica a las 4 líneas actuales para 4 patas; verificar leyendo el diff y a ojo en juego.
- [Cambiar la elección de spawn desbalancea cerdos/ovejas] → Mitigación: con `count/target` el criterio degenera al actual cuando los targets son iguales; validar conteos tras la pasada.
- [La gallina usa el radio/altura de colisión grandes y puede "flotar" sobre bordes] → Aceptable: se prioriza reutilizar la IA genérica; sin cambio de física.
- [Índices de línea aproximados en docs] → Mitigación: los tasks referencian funciones por nombre, no por línea fija.

## Migration Plan

- Sin migración: cambio cliente puro en `index.html`. Rollback = revertir las líneas de `sfxCluck`, `makeChicken`, `spawnAnimals` y la animación de patas. `cd server && npm test` como red de seguridad.
