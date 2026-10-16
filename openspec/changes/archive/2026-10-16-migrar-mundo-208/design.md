# Design

## Context

Ver `proposal.md` (Why). Estado técnico actual: `index.html` con `W=160, H=40, CH=16` y `server/server.js` con validación e índice en stride 160. El change 1 (`optimizar-renders`, archivado) dejó meshes por chunk sin rebuild global por edit, así que 13×13=169 chunks heredan ese path. Backup del volumen YA existe en Easypanel (`world.json` 258KB, Success 2026-10-16) y el usuario sabe sacar copias por consola. Para requisitos ver `specs/world/size/spec.md`.

## Goals / Non-Goals

**Goals:**

- Mundo de 208 con todas las construcciones del VPS en sus coordenadas y el mismo seed.
- Cero literales residuales de 160 en lógica de mundo/red; validación N e índices espejados en cliente y servidor.
- Migración reproducible y testeada en local antes de tocar producción; rollback conocido.

**Non-Goals:**

- Fijar el desplazamiento cosmético de árboles/flores procedurales por stream rng (se documenta, no se corrige).
- Handshake de versión cliente↔servidor o migración de saves de localStorage viejos (se invalidan con `-v3`).
- Cambios en el protocolo `welcome`/`pedit` (manda `edits`, no voxels: sin cambios).

## Decisions

- **N=208 fijo, sin constante configurable.** 208/16=13 exacto: no hay chunks parciales ni bordes especiales. Alternativa (tamaño por env/flag) descartada: duplica los paths de validación e indexación y el juego no necesita mundos variables.
- **Offset OX=OZ=48: el mundo viejo ocupa el array 48..207 y la tierra nueva queda al NORTE/OESTE (0..47).** El terreno se muestrea con coordenadas de MUNDO, no de array: `genWorld`, `findSpawn`, `spawnAnimals`, árboles y flores muestrean `hAt(x-OX,z-OZ)`. Así el suelo bajo (48..207) es idéntico al original (0..159) con la misma seed. `hash2`/`vnoise`/`fbm` funcionan con coords negativas (imul + `>>>0` + `floor`), verificado con test sobre las funciones extraídas del cliente, no asumido.
- **Fórmula de migración con offset** `x=i%160, z=((i/160)|0)%160, y=(i/25600)|0 → i'=(y*208+(z+48))*208+(x+48)`. Elegida sobre anclaje en (0,0) porque deja la tierra nueva al N/O sin pisar construcciones: el dominio viejo cae en 48..207 y ningún edit queda fuera. Invertible/verificable en tests (round-trip con offset). Script con `--offset` (default 48) e idempotencia vía marca `w:208` + offset usado.
- **Script de migración Node standalone** (lee `world.json` viejo, escribe nuevo con mismos `seed` y `edits` remapeados), testeable en local contra copia del mundo del VPS. Alternativa (migrar al vuelo en el server al arrancar) descartada: mezcla dato con runtime y complica el rollback (el archivo quedaría mutado por el deploy).
- **`SAVE_KEY` → `-v3` (invalidar) en vez de migrar localStorage.** Los saves locales son copias descartables del mundo del server; migrarlos en el cliente añade código por un beneficio nulo (el server manda los edits canónicos al conectar).
- **`CLIENT_V` `v8`→`v9` solo como sello visible**, sin gate en el protocolo. Un gate real exigiría handshake + rechazo de hellos viejos; el costo no compensa porque el deploy es simultáneo y el síntoma (mundo "derretido") se resuelve con recargar.
- **Escala de ambiente proporcional a W:** spawn default junto a las casas desplazadas (`[80.5,·,88.5]`+48 → `[128.5,20,136.5]`); `findSpawn` radio `r<80` → `~104` (centro W/2, con muestreo de mundo `hAt(x-OX,z-OZ)`); nubes `*200-20` → rango que cubra 208; frustum de sombras `±70` → `±~114` (mitad de 208 + margen); fog `far 125` → `~160-180`; `sun.position/target` y `sunSprite` re-anclados a `W/2`. `spawnAnimals` usa `W`, se adapta solo. Números finales a confirmar contra el grep durante la implementación (cazar TODOS los `160/200/80`).
- **Tests espejo:** `server/test/*.mjs` cubren validación N=208 e índices stride-208; el script de migración trae su propio chequeo (conteo de edits, round-trip de una muestra, `max(i') < 208*40*208`).

## Risks / Trade-offs

- [Riesgo] Olvidar un literal de 160 (ej. `findSpawn`, fog, sombra) → mundo con bordes invisibles o spawns viejos. → Mitigación: grep sistemático `160/200/80` + checklist de literales en tasks + verificación visual en Docker local.
- [Riesgo] Clientes viejos contra server nuevo = mundo "derretido". → Mitigación: `CLIENT_V v9` + deploy simultáneo server+cliente + aviso de recargar con Ctrl+F5.
- [Riesgo] Backup corrupto o migración con pérdida silenciosa. → Mitigación: backup verificado ANTES (tamaño/fecha/`edits.length`), script con conteos antes/después, prueba en Docker local con el mundo migrado.
- [Trade-off] Árboles/flores procedurales pueden moverse (stream rng depende del orden de generación). → Aceptado: cosmético, fuera de alcance.
- [Trade-off] Mundo 69% más grande ⇒ más chunks (169 vs 100) y más memoria de `world` (`208²·40 ≈ 1.73M` celdas). → Aceptado: `Uint8Array` (~1.7MB) y meshes por chunk del change 1 lo absorben; verificar FPS en Docker local.

## Migration Plan

1. Verificar backup Easypanel (fecha/tamaño) + copia local del `world.json` del VPS.
2. Implementar script de migración; correrlo sobre la copia; validar conteos y muestra round-trip.
3. Aplicar cambios de código (cliente + server + tests); `cd server && npm test`.
4. Docker local con el mundo migrado: verificación visual (spawn, bordes, sombras, fog) y multijugador básico.
5. Deploy VPS: subir `world.json` migrado al volumen + deploy simultáneo server+cliente.
6. Verificación en producción: sello `v9`, spawn centrado, construcción conocida intacta, edit nuevo que persiste tras restart.
7. Rollback: restaurar `world.json` del backup + redeploy del build anterior (imagen/tag previo).

## Open Questions

- Ninguna que bloquee: los números exactos de fog (`160` vs `180`) y frustum (`±110` vs `±114`) se ajustan en implementación según prueba visual.
