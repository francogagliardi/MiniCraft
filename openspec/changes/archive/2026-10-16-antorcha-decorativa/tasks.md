# Tasks

## 1. Bloque antorcha en cliente

- [x] 1.1 Definir `TORCH=33` con su entrada `DEFS` (`flower:1`, `hard:.15`, `tile:32`, nombre e icono css) y agregarlo a `INVENTORY`; verificar abriendo el inventario y viendo la antorcha elegible.
- [x] 1.2 Ampliar el atlas a 8x5 (128x80), dibujar el tile 32 (palo + llama con fondo transparente), generalizar `tileUV` a 5 filas y extender la rama flower de `buildGlobals` a `TORCH`; verificar colocando una antorcha y viéndola como cruz desde ambos lados.
- [x] 1.3 Aplicar regla de colocación (destino `AIR` + bloque debajo sólido) y rotura de un toque, y comprobar sync colocando/rompiendo una antorcha con dos clientes conectados sin recargar; verificar que `cd server && npm test` sigue en verde.
- [x] 1.4 Brillo falso nocturno (post-prueba): sacar `TORCH` de la rama flower y renderizarla en `torchMesh` propio con `matTorch` (`MeshBasicMaterial` unlit + `alphaTest:.5` + `DoubleSide`); se ve brillante de noche sin iluminar alrededor y sin `PointLight`; verificar `matFlower`/`matGlow` intactos y `cd server && npm test` en verde.
