# Tasks

## 1. Harness de medición (baseline)

- [x] 1.1 Agregar harness temporal detrás de flag con contador de celdas visitadas por `refreshAt` y cronómetro (`performance.now()`), con modos FULL (path actual) y PARTIAL, y verificar que corre N edits sintéticos (centro de chunk, bordes `x%CH===0/15` y `z%CH===0/15`, una por categoría: vidrio, agua, flor, antorcha, glow, losa, escalera, puerta) reportando celdas/edit y tiempo medio.
- [x] 1.2 Registrar baseline en modo FULL (~2,05M celdas/edit esperado con W=160, H=40) y verificar que el número coincide con el barrido doble de `buildGlobals` (`index.html:874`) + `buildDoors` (`index.html:1038`); guardar los números en el reporte del change.

## 2. Meshes globales por chunk

- [x] 2.1 Particionar los 5 meshes globales a un mapa por chunk (`chunkKey → mesh` por categoría, mismos materiales y flags `{shadow:false}` que hoy) con `buildGlobalsForChunk(cx,cz)` que itera solo ese chunk, conservando `buildGlobals()` completo solo para carga inicial (`index.html:2159,2167`), y verificar con dispose correcto (sin crecimiento de geometrías en memoria tras N rebuilds) y `cd server && npm test` en verde.
- [x] 2.2 Cambiar `refreshAt` (`index.html:974-982`) para llamar a `buildGlobalsForChunk` sobre el mismo conjunto de 1-4 chunks que ya reconstruye (propio + vecinos de borde), y verificar que editar junto a cada categoría global (vidrio/agua/flor/antorcha/glow/losa/escalera) produce meshes idénticos al path FULL comparando captura o inspección lado a lado.

## 3. Puertas parciales

- [x] 3.1 Reemplazar el `buildDoors()` completo por-edit por reconciliación parcial (eliminar solo pivotes de las columnas en chunks afectados y re-escanear solo esas columnas con la misma lógica de bisagra/`isTop`/espejo, preservando `doorAnims`), conservando el build completo para carga inicial, y verificar abriendo/cerrando puertas simples y dobles en el chunk editado y en bordes de chunk, con animación intacta y `cd server && npm test` en verde.
- [x] 3.2 Verificar el caso límite de mitad de puerta (romper la mitad inferior cambia `isTop` de la superior, y viceversa) y verificar que la geometría resultante (ventana vs panel) es idéntica al path FULL.

## 4. Evidencia, limpieza y cierre

- [x] 4.1 Correr el harness A/B FULL vs PARTIAL sobre los mismos N edits y verificar orden de magnitud menos celdas por edit (~40K vs ~2M) con reducción medible del tiempo medio de `refreshAt`; adjuntar los números al change.
- [x] 4.2 Remover el path FULL por-edit y el flag del harness (quedando solo PARTIAL + carga inicial completa) y verificar que no quedan referencias a rebuilds completos por edit (`grep buildGlobals|buildDoors` solo en carga inicial y helpers por chunk), con `cd server && npm test` en verde.
- [x] 4.3 Revisión visual de regresión (recorrer el mundo: vidrio, agua, flores, antorchas de día y de noche, glow, losas, escaleras, puertas) y verificar comportamiento idéntico al baseline, sin tocar niebla, sombras, `W/H/seed`, `server/` ni protocolo. — Verificado por usuario en Docker local ("todo funciona y se ve igual").
