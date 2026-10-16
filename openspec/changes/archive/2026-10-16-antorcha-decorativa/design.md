# Design

## Context

Ver `proposal.md` (Why). Estado actual verificado en `index.html`: IDs de bloque 0-32 ocupados (`DOORZ2_OPEN=32`, `SWORD=100` es item); atlas 8x4 (128x64) con tiles 0-31 todos dibujados — no hay tile libre (30/31 son la puerta de 2 bloques). `tileUV(t)` hardcodea grilla de 8x4 (`t%8`, `/4`, `128`, `64`). Las flores (`flower:1`, tiles 14/15) se renderizan como cross-quad en el mesh global `flowerMesh` con `matFlower` (`alphaTest:.5`, `DoubleSide`) y no colisionan (`isSolid` solo cuenta `cube`/`glow`/puerta cerrada). El servidor acepta `v<=40`, por lo que el ID 33 pasa sin tocarlo.

## Goals / Non-Goals

**Goals:**

- Antorcha con el mismo costo de render que una flor (reusa `flowerMesh`, 1 draw call global).
- Cero cambios en `server/server.js` y en el protocolo `edit`/`pedit`.

**Non-Goals:**

- Luz real (`PointLight`, emissive dinámico, re-iluminación de chunks): excluida por rendimiento; change futuro separado si se pide.

## Decisions

1. **ID `TORCH=33`** (siguiente libre tras `DOORZ2_OPEN=32`; `SWORD=100` no interfiere). Alternativa `ID>40`: descartada porque obligaría a tocar la validación del servidor.
2. **Geometría cross-quad estilo flor (`flower:1`)**, no mini-cubo. Reusa la rama `FLOWER_R||FLOWER_Y` de `buildGlobals` y `matFlower`; sin colisión automática vía `isSolid`. Mini-cubo descartado: exigiría rama nueva en el chunk builder, ambigüedad de colisión y más vértices.
3. **Ampliar atlas a 8x5 (128x80) y usar tile 32** para la antorcha (palo marrón + llama amarilla/naranja, fondo transparente). Reusar tile 11 (GLOW) descartado: fondo sólido incompatible con `alphaTest`. `tileUV` se generaliza a 5 filas. Tiles 33-39 quedan libres para futuros bloques.
4. **Material `MeshBasicMaterial` propio (`matTorch`, unlit + `alphaTest:.5` + `DoubleSide`) en `torchMesh` dedicado**: la antorcha se ve brillante de noche como la Lucerita pero sin iluminar alrededor y sin `PointLight`. `matFlower` (Lambert) y `matGlow` no se tocan. Revisión post-prueba: el Lambert original oscurecía la antorcha con la luz de escena.
5. **Colocación con regla de soporte** (destino `AIR` + bloque debajo sólido/opaco), validada en cliente antes de emitir el `edit`. El servidor la acepta tal cual (rango válido, no es bedrock `v===11` ni `y===0`).
6. **Solo `INVENTORY`**, sin tocar `DEFAULT_HOTBAR`: el jugador la arrastra al hotbar si quiere.

## Risks / Trade-offs

- [Riesgo] Ampliar el canvas del atlas invalida UVs si algún código asume 64px de alto → Mitigación: el único lugar con `64`/`4` hardcodeado es `tileUV`; se actualiza junto al canvas en el mismo change.
- [Riesgo] La antorcha `flower:1` podría ser afectada por lógica futura de "flores" (ej. generación aleatoria en pasto) → Mitigación: la generación usa IDs explícitos `FLOWER_R/FLOWER_Y`, no el flag; aun así, al implementar extender la rama de render por ID (`b===TORCH`) en vez de solo por flag.
- [Trade-off] Sin luz real, de noche la antorcha brilla (mesh unlit propio) pero no alumbra bloques vecinos → Aceptado (opción "Brillo falso" elegida post-prueba); mantiene dificultad 2/10.

## Migration Plan

Sin migración: mundo existente no contiene el ID 33; el save local y los `edits` del servidor lo transportan como cualquier bloque. Rollback: archivar/revertir el change y los IDs 33 colocados se ignoran (sin `DEFS` → no render, no colisión).
