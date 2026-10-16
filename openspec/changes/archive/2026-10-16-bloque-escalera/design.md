# Design

## Context

Ver `proposal.md` (Why). Estado actual: IDs 0–38 ocupados + SWORD=100; rango válido del servidor `v ≤ 40` (`server/server.js:112`). Mundo en `Uint8Array` (soporta 0–255) y persistencia como `edits` = lista de `[idx, val]`. Precedentes: puertas (8 variantes por bisagra/plano/abierta, costoso) y losas (`slab:1 + slabBase`, barato, sin cambios de protocolo; `losas-materiales` extendió a 5 materiales 34–38 con tiles reusados 8/16/9/29 + retrofit `slabBase:STONE`). Atlas 8x5 con tiles 0–33 usados, libres 34–39 (las escaleras no necesitan tiles nuevos: reusan los del base). Colocación orientada con `lookDir()` ya existe en puertas (`index.html:1623`); auto-step 0.5 para losas en `collidesAt`/`slabBlocked`/`movePlayer` (`index.html:1161-1195`); render de media altura en `buildGlobals()` (`index.html:879-896`).

## Goals / Non-Goals

**Goals:**
- 20 variantes funcionales (5 materiales × 4 orientaciones) con subida caminando y sync multijugador.
- Cambio de servidor mínimo (1 línea) y mundo VPS sin migración.
- Generalización por flag (patrón slab) en vez de 20 ramas hardcodeadas.

**Non-Goals:**
- Esquinas, barandillas, rotación post-colocación.

## Decisions

### D1: 20 IDs (39–58), cuatro por material + ampliar servidor a `v ≤ 64`

Layout: 39–42 `STAIR_STONE_*`, 43–46 `STAIR_PLANKS_*`, 47–50 `STAIR_COBBLE_*`, 51–54 `STAIR_BRICK_*`, 55–58 `STAIR_SBRICK_*` (sufijo dir N/S/E/O o 0–3; `stairDir` 0–3 = orientación). 58≤64 OK; quedan libres 59–64 para futuro sin volver a tocar el servidor.

Opción elegida (a, 4 IDs por orientación — el concepto ya aprobado en propose, ahora ×5 materiales). Alternativas descartadas:
- (b) 1 ID por material + orientación guardada aparte: el protocolo `edits` guarda solo `idx→val` por celda; añadir orientación exige un canal paralelo (mapa orientación, mensajes nuevos, migración del `world.json` del VPS, doble fuente de verdad). Riesgo alto, beneficio nulo frente a IDs libres tras ampliar rango.
- (c) 1 ID por material sin orientación (visual fija): inútil como escalera — solo subiría en una dirección; rompe la expectativa del bloque.
- Las puertas demuestran que el modelo "1 ID por variante" escala bien en este código (render/colisión/sync por tabla DEFS) aunque cueste IDs; aquí son 20 y el rango sobra tras D1. `Uint8Array` ya soporta hasta 255 y la validación es solo un entero.
- `v ≤ 64` (no 58) deja 6 libres (59–64). Clientes viejos ante IDs desconocidos: `buildChunk` los salta y `isSolid` devuelve falso (atraviesan, no rompen) — degradación segura hasta actualizar.

### D2: 5 materiales (los mismos que las losas), tiles reusados, dureza del base

Patrón `losas-materiales`: cada escalera reusa los tiles de su material base en todas las caras, cero dibujos de atlas, cero riesgo en `static.mjs`:

| Material | Base | Tile reusado | hard |
|---|---|---|---|
| Piedra | STONE | 3 | 1.8 |
| Tablones | PLANKS | 8 | 1 |
| Roca | COBBLE | 16 | 1.8 |
| Ladrillos | BRICK | 9 | 2 |
| Piedra tallada | SBRICK | 29 | 2 |

Nombres `STAIR_<MAT>_<DIR>`. DEFS por variante: `{cube:1, stair:1, stairDir:<0-3>, stairBase:<BASE>, hard:<del base>, tiles:{top:<t>,side:<t>,bottom:<t>}}` sin `opaque:1`. INVENTORY 30→35 (una entrada por material, sin tocar `DEFAULT_HOTBAR`).

### D3: Geometría en L generalizada por flag `stair` + `stairDir` (recomendado, patrón slab)

Base: 4 laterales de 0.5 + tapa 0.5 (igual que losa) + trasero 0.5–1.0 (4 laterales de 0.5 recortados en X/Z según `stairDir` + tapa 1.0 en mitad trasera + contrahuella vertical del escalón). NO 20 ramas de mesh: una sola rama en `buildGlobals()` por `DEFS[b]?.stair` que lee `DEFS[b].tiles` y `stairDir` (igual que `losas-materiales` generalizó a un solo `slabMesh` acumulado por `DEFS[b].slab`). Culling contra opacos igual que cubos/losas. `raycast()` ya intercepta `cube` (`index.html:1303`): basta marcar `cube:1` sin `opaque:1` (como las losas) para que sea apuntable pero no ocluya vecinos. Un solo mesh acumulado de escaleras con material del atlas.

### D4: Colisión escalonada extendiendo el camino de losas, por flag

- `isSolid()` sigue devolviendo verdadero (celda transitable solo vía lógica escalonada, igual que losas).
- `collidesAt()`: además del bypass de losa (`py >= y+.5`), añade bypass del escalón por flag `DEFS[b]?.stair`: si los pies están a `y+.5` y la columna del jugador cae en la mitad baja (según `stairDir`), la celda no traba.
- `slabBlocked()` (o su generalización `stepBlocked()`): acepta losas y escaleras (por flags `slab`/`stair`) atacadas desde el frente bajo; `movePlayer()` conserva el auto-step 0.5 existente. Pies en suelo + lugar arriba siguen siendo condición. Los mobs heredan `collidesAt` como hoy (sin auto-step, aceptado en `medio-bloque`).

### D5: Colocación por eje dominante de `lookDir()` dentro del grupo del material, frente hacia el jugador

Igual que las puertas (`fz = |ld.x| > |ld.z|`): si domina X, frente = signo de `ld.x`; si domina Z, frente = signo de `ld.z`. El escalón alto queda al fondo. El ítem sostenido selecciona el material (5 entradas de inventario); la orientación elige la variante dentro del grupo 39–42 / 43–46 / … Sin herencia de vecinos (a diferencia de puertas dobles): cada escalera es independiente.

### D6: Sin apilado, rotura con dureza del base, sin drop

A diferencia de losas (2 losas → cubo), colocar sobre escalera ocupada se rechaza; no hay conversión. Dureza heredada del material base (1 / 1.8 / 1.8 / 2 / 2).

## Risks / Trade-offs

- [IDs 39–58 fuera del rango viejo] → Mitigación: el change incluye el bump a `v ≤ 64`; el protocolo rechaza por rango, así que desplegar servidor antes o junto al cliente.
- [Colisión sub-celda aproximada en bordes] → Mitigación: radios 0.3 del jugador y tests de subir/bajar/parado por orientación (spot-check por material); esquinas exactas al medio voxel quedan fuera por diseño.
- [Mundo VPS con edits 39–58 visto por cliente viejo] → Degradación segura conocida (no render / atravesable); se documenta en el anuncio del deploy.
- [20 DEFS nuevas] → Mitigación: generalización por `stair` + `stairBase` + `stairDir` (D3/D4); el espejo `static.mjs` valida las 20.

## Migration Plan

1. Desplegar `server/server.js` (rango) — compatible hacia atrás (acepta todo lo anterior).
2. Desplegar `index.html` — empieza a emitir 39–58.
3. Sin migración de `world.json`; rollback = revertir ambos archivos, los edits 39–58 quedan inertes hasta reintroducir el bloque.
