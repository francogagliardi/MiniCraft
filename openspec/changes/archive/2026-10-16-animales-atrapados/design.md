# Design

## Context

Ver `proposal.md` (Why). Estado actual en `index.html`: `collidesAt(px,py,pz,r,hgt)` muestrea bloques desde `floor(py)` hasta `floor(py+hgt-0.01)`; con `hgt=0.9` solo cubre el bloque de los pies y deja pasar la cabeza (~1.1 visual en `makePig`/`makeSheep`). Tres llamadas de IA animal usan `hgt=0.9` (spawn :1538, marcha :1553, gravedad :1559) mientras el jugador usa `hgt=1.8` (:1305). `tickAnimal` (:1550-1556): al chocar y estar en suelo aplica `vy=5.2` indefinidamente y nunca re-elige `tx/tz` hasta llegar o esperar; LEAVES es sólido (`solidAt`), así que el salto los mete en copas.

## Goals / Non-Goals

**Goals:**
- Cubrir pies + cabeza en las 3 llamadas animales con el cambio mínimo (constante única).
- Bloqueo → nuevo destino + pausa, sin empuje/salto infinito.

**Non-Goals:**
- No tocar física del jugador, `slabBlocked`/auto-step, generación de árboles, `server/server.js`, ni modelos visuales.

## Decisions

1. **Altura `hgt=1.2` en las 3 llamadas animales (no 1.1 exacto ni 1.8 del jugador).**
   Por qué: 1.2 cubre 2 bloques voxel con margen y evita falsos positivos por epsilon de `py+hgt-0.01`; 1.8 es excesivo y frenaría animales bajo salientes de 2 bloques donde sí caben.
   Alternativas: 1.1 exacto (frágil ante redondeo), reutilizar 1.8 del jugador (sobrerrestringe).
2. **Contador `stuck` por animal + re-elección de destino.**
   Por qué: distingue un roce momentáneo (1-2 ticks) de un bloqueo real; al superar umbral (p. ej. ~30 ticks) asigna `tx/tz` nuevo + `wait`, resetea contador.
   Alternativas: re-elegir al primer choque (animales nerviosos, cambian de rumbo con cualquier roce); temporizador global (acopla animales entre sí).
3. **Auto-salto condicionado a paso transitable.**
   Por qué: conserva el salto útil ante losas/escaleras de 0.5 pero lo suprime contra cubos completos (el caso bosque). La condición se apoya en que el bloqueo sea a altura de cuerpo completo.
   Alternativas: eliminar el salto por completo (rompe subida de losas); mantenerlo siempre (reintroduce el bug).

## Risks / Trade-offs

- [Animales bajo salientes de 2 bloques se detienen más] → Mitigación: 1.2 (no 1.8) + re-elección de destino los desvía; comportamiento aceptable y observable en prueba de 2 min.
- [Umbral `stuck` mal calibrado: giro tardío o nervioso] → Mitigación: umbral medio (~0.5 s de bloqueo) + verificación manual junto a bosque.
- [Regresión en jugador] → Mitigación: no se toca `collides`/`slabBlocked`; `npm test` en `server/` como red de seguridad.

## Migration Plan

- Sin migración: cambio cliente puro en `index.html`. Rollback = revertir esas líneas.
