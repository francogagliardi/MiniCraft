# Design

## Context

Ver `proposal.md` (Why). Estado actual en `index.html`: `doPlace` (líneas ~1743,1750) permite reemplazar agua al construir; `editBlock` (~1222) y `doBreak` (~1728) pisan la celda con `AIR` sin distinguir si estaba bajo el nivel del mar (`WATER_Y=10`, constante en línea ~411). `spawnAnimals` (~1532-1541) solo exige suelo `GRASS` y `h > WATER_Y+1`, mientras que `findSpawn` (~1449-1453) ya implementa el patrón correcto: columna `h+1..h+4` libre + verificación final con `collidesAt(x+.5,h+1.01,z+.5,.3,1.8)`. Restricción: `server/server.js` no se toca (sin cambio de protocolo); todo viaja por edits `{t:'edit',x,y,z,v}` ya existentes.

## Goals / Non-Goals

**Goals:**

- Que el agua vuelva tras romper bajo el nivel del mar con 2-3 líneas en el punto de rotura.
- Que ningún animal aparezca dentro de bloques ni atascado, reutilizando el chequeo de `findSpawn`.

**Non-Goals:**

- Simulación de flujo/inundación de agua (fuera de alcance; solo restauración puntual).
- Rebalanceo de cantidad o IA de animales.
- Cambios de protocolo, persistencia o migración de mundo.

## Decisions

- **Restaurar agua en `doBreak` (no en `editBlock` genérico).** `editBlock` también se usa para colocar bloques, donde pisar con el valor pedido es correcto; el bug está al *romper*. Alternativa considerada (hacerlo en `editBlock` cuando `v===AIR`): descartada porque mezclaría colocación y rotura. Tras `rawSet(...,AIR)` en ambas ramas de `doBreak` (puerta y normal), si `y <= WATER_Y` y la celda queda en zona bajo nivel del mar, escribir `WATER` en vez de `AIR` (y propagar ese valor en `edits`/`netSend`).
- **Chequeo de columna `h+1..h+2` + `collidesAt` en `spawnAnimals`, espejando `findSpawn`.** Alternativa (solo `get(h+1)===AIR`): descartada por insuficiente para el cuerpo de 0.9 de alto del animal; `collidesAt(nx, h+1.01, nz, .32, .9)` cubre losas y bloques parciales que `get` no ve. Se aplica tanto al spawn inicial como a re-spawns si existen (mismo bucle/función).
- **Sin flujo de agua: heurística documentada.** Una cavidad construida bajo el mar se llenará de agua al romper dentro de ella. Aceptable: no hay dreno real en el juego y la alternativa (rastrear origen del agua) es complejidad injustificada para este fix.

## Risks / Trade-offs

- [Heurística de agua llena cavidades artificiales bajo el mar] → Mitigación: documentado en spec y diseño; el jugador puede volver a vaciar colocando bloques.
- [Bucle de `spawnAnimals` tarda más en mapas con poco pasto libre] → Mitigación: el guard de 3000 iteraciones ya existe; el chequeo extra es O(1) por candidato.
- [Divergencia multijugador si el edit propaga AIR en vez de WATER] → Mitigación: el valor restaurado (`WATER`) es el que se envía por `netSend`/se guarda en `edits`, no el `AIR` intermedio.

## Migration Plan

- Sin migración: cambio solo-cliente en `index.html`, compatible con saves y protocolo existentes. Rollback: revertir el commit del change.
