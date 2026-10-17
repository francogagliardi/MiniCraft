# Design

## Context

Ver `proposal.md` (Why). Estado actual en `index.html`: `doBreak()` (~1868-1891) decide el valor de la celda rota con la sola condición `y <= WATER_Y` en dos lugares — rama normal (`const v = h.y<=WATER_Y ? WATER : AIR;`, ~1885) y rama de puerta (`const v = cy<=WATER_Y ? WATER : AIR;`, ~1877). El mundo es un array plano `world` con accesores puros `get(x,y,z)` (~797, devuelve `AIR` fuera de límites), `inB` (~796) y `rawSet`; el agua solo se genera naturalmente en columnas bajas (`genWorld`, ~830). El canal de multijugador ya propaga el valor escrito por celda (`{t:'edit',x,y,z,v}`), por lo que el arreglo es 100% cliente.

## Goals / Non-Goals

**Goals:**

- Que cavar tierra adentro por debajo de `y=10` deje aire (bug reportado: "no importa dónde pique, al descender cierta altura aparece agua").
- Preservar el intent de `bugs-agua-spawn`: romper el fondo del mar o el borde de un lago sigue restaurando agua.
- Una única fuente de verdad para la decisión, reutilizada por las dos ramas de `doBreak()`.

**Non-Goals:**

- Simulación de flujo / inundación progresiva (el juego no simula flujo; se evalúa una celda por vez).
- Cambiar la generación de mundo, el nivel del mar (`WATER_Y`) o el comportamiento del agua al colocar bloques.
- Cambios de protocolo, de servidor o de formato de guardado.

## Decisions

- **Helper único `waterRefill(x,y,z)` que devuelve el valor a escribir.** Reemplaza la condición duplicada en las dos ramas de `doBreak()`; devuelve `WATER` si la celda califica y `AIR` si no. Alternativa considerada: dejar la condición inline en cada rama — descartada porque fue justamente la duplicación de la regla amplia lo que introdujo el bug en dos lugares.
- **Condición exacta de la vecindad: 6 caras ortogonales, evaluadas antes del break.** Se restaura agua sii `y <= WATER_Y` **y** `get(x,y+1,z) || get(x,y-1,z) || get(x+1,y,z) || get(x-1,y,z) || get(x,y,z+1) || get(x,y,z-1)` es igual a `WATER`. La evaluación es sobre el estado previo (los vecinos no cambian al romper la celda propia; se evalúa antes de `rawSet` por claridad y para no leer el `AIR` recién escrito). Alternativas: (a) solo mirar arriba (`get(x,y+1,z)===WATER`) — descartada porque romper el costado de un lago no restauraría agua; (b) vecindad 26 (3×3×3) — descartada porque el agua "entraría" en diagonal, más agresivo que el alcance real deseado; la vecindad de 6 es la mínima que cubre fondo del mar y costado de lago.
- **Gate `y <= WATER_Y` se mantiene.** Por encima del nivel del mar nunca se restaura agua aunque haya un vecino con agua (evita escalar agua por encima de `WATER_Y`, fuera de alcance).
- **Test comportamental por extracción, espejando `server/test/terrain.mjs`.** Extraer `waterRefill` del `index.html` y evaluarla inyectando `get`/`WATER`/`AIR`/`WATER_Y` como globales, con casos: celda bajo el mar con vecino agua → `WATER`; celda subterránea sin vecino agua → `AIR`; vecino lateral agua → `WATER`; `y > WATER_Y` → `AIR`. Alternativa: asserts estáticos sobre el texto del `id` — descartada porque no fijan el comportamiento (solo la forma).

## Risks / Trade-offs

- [El agua ya no se restaura en excavaciones subterráneas secas] → Es el objetivo del fix, no un efecto lateral; el agua natural solo existe en columnas bajas y su fondo/borde sigue comportándose igual.
- [Romper el borde de un lago llena la celda nueva una por vez (sin flujo)] → Aceptable y documentado: solo se rellena la celda rota si ya toca agua; no hay propagación ni dreno.
- [Dependencia de `get` para leer vecinos fuera de límites] → `get` devuelve `AIR` fuera del mundo, así que la condición es segura en bordes sin chequeos extra.
- [Divergencia multijugador] → Nula: el valor resultante (`WATER`/`AIR`) es el que se propaga por `netSend`/`edits`; no hay estado intermedio.

## Migration Plan

- Sin migración: cambio solo-cliente en `index.html`, compatible con saves y protocolo existentes. Rollback: revertir el commit del change.
