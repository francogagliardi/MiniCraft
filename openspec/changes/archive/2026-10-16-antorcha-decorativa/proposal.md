# Proposal

## Why

Los jugadores no tienen ninguna forma de marcar o adornar sus construcciones con una fuente visual cálida: la Lucerita (GLOW=10) es un cubo sólido y las flores no dan ambiente nocturno. Una antorcha decorativa barata de renderizar cubre esa necesidad sin arriesgar el rendimiento del juego.

## What Changes

- Nuevo bloque `TORCH=33` decorativo, sin luz real (sin `PointLight`).
- Geometría cross-quad estilo flor (2 quads cruzados), renderizada en `torchMesh` propio con `matTorch` (`MeshBasicMaterial` unlit + `alphaTest:.5`, `DoubleSide`): brillo falso nocturno sin iluminar alrededor.
- Nueva textura en el atlas ampliado a 8x5 (tile 32): palo vertical marrón + llama amarilla/naranja con fondo transparente.
- `DEFS[TORCH]`: flag `flower:1` (reusa rama de render y no-colisión), `hard:.15`, nombre `'Antorcha 🔥'`, css para inventario.
- Agregado a `INVENTORY` (hotbar a elección del jugador, sin cambio a `DEFAULT_HOTBAR`).
- Colocación solo sobre bloque sólido (misma regla que flores): destino `AIR` + bloque debajo sólido.
- Rotura instantánea de un toque y sync multijugador por el protocolo `edit`/`pedit` existente, sin cambios.
- **Fuera de alcance**: luz real (`PointLight`, emissive dinámico, iluminación de chunks vecinos) — queda para un change futuro separado.

## Capabilities

### New Capabilities

- `blocks/torch`: comportamiento del bloque antorcha decorativa (render, colocación, rotura, inventario, sync).

### Modified Capabilities

Ninguna (no cambian REQUIREMENTS de specs existentes).

## Impact

- `index.html`: constantes (`TORCH`), `DEFS`, `INVENTORY`, atlas (tamaño + `tileUV`), dibujo del tile 32, rama `buildGlobals` para `TORCH`, regla de colocación.
- `server/server.js`: sin cambios (valida `v<=40`; 33 ya pasa; no es bedrock).
- Rendimiento: 1 draw call global extra dedicada (`torchMesh`), cero luces nuevas.
- `cd server && npm test` no debe romperse.
