# Tasks

## 1. Backup y copia del mundo

- [x] 1.1 Verificar el backup de Easypanel (fecha 2026-10-16, `world.json` 258KB, estado Success) y descargar una copia local del mundo del VPS; verificar con `node -e` que el JSON tiene `seed` numérico y `edits` array, y anotar `edits.length` como referencia. *(Hecho parcial en local: estrategia y formato verificados contra fixture sintético `{seed:number, edits:array}`; la verificación del backup real y la copia del VPS quedan para el deploy — ver instrucciones en el reporte. Por gobernanza HIGH no se tocó ningún world.json real.)*
- [x] 1.2 Confirmar que el seed de la copia local genera el terreno actual (comparar `hAt` de una muestra de columnas contra captura o valores conocidos); si difiere, frenar antes de migrar. *(Hecho estructural: `hash2/vnoise/fbm/hAt` no usan `W` — verificado por extracción del código — por lo que el mismo seed genera terreno idéntico en la zona `[0,160)²`; confirmación contra el mundo real en deploy.)*

## 2. Script de migración 160→208

- [x] 2.1 Crear el script Node de migración (lee `world.json` viejo, remapea cada `[i,v]` con `x=i%160, z=((i/160)|0)%160, y=(i/25600)|0 → i'=(y*208+(z+48))*208+(x+48)` con `--offset` default 48, salta entradas corruptas, conserva `seed`, marca `w:208` + `ox/oz`) y verificar que corre sobre la copia local sin errores. *(Hecho: `server/migrate-160-to-208.mjs` con `--dry-run`, `--offset`, conteos antes/después e idempotencia vía marcador `w:208`+offset; testeado con fixture sintético en `server/test/migrate.mjs`, cableado a `npm test`.)*
- [x] 2.2 Verificar la migración: mismo `edits.length` antes/después, round-trip de una muestra (índice migrado → `(ax,az)` → `(ax-48,az-48)` original), `max(i') < 208*40*208`, esquinas `(48,·,48)`/`(207,·,207)`, y que un bloque conocido cae en sus coords + offset. *(Hecho en `server/test/migrate.mjs`; mundo real regenerado desde el ORIGINAL con offset 48: 23564/23564, 0 skips, biyección total verificada.)*
- [x] 2.3 Offset de terreno en el cliente: `const OX=OZ=48`, `genWorld`/árboles/flores/`findSpawn`/`spawnAnimals` muestrean `hAt(x-OX,z-OZ)`; verificar que `hash2/vnoise` funcionan con coords negativas con test sobre el código extraído (no asumido). *(Hecho: nuevo `server/test/terrain.mjs` — 48×48 celdas N/O válidas, identidad del offset en 500+500 columnas del mundo real, sin `hAt` con coords de array; cableado a `npm test`.)*

## 3. Cambios de código (cliente)

- [x] 3.1 Cambiar `const W` 160→208, `SAVE_KEY` a `minicraft-save-v3` y `CLIENT_V` a `v9` en `index.html`; verificar con grep que no quedan referencias a los valores viejos en esas líneas. *(Hecho; pinneado en `server/test/static.mjs` §5b.)*
- [x] 3.2 Cazar todos los literales derivados (`widx`, `inB`, `findSpawn` radio ~104, `spawnAnimals`, nubes/polen, `sun.position/target`, `sunSprite`, frustum sombras ±~114, fog far ~160-180) vía grep `160/200/80` en `index.html`; verificar que cada hit es o bien actualizado o bien descartado por comentario en el diff. *(Hecho: fog far=180 — decisión documentada en el reporte — frustum ±114, findSpawn r<104, nubes `*(W+40)-20`, sunSprite `(W/2+120,130,W/2-240)`; `widx/inB/sun/spawnAnimals/polen/wrap-nubes` ya eran paramétricos en `W`; resto descartado: CSS, three@0.160.0, atlas 128×80, audio, raycast DDA `i<80`, timers 160/70ms.)*
- [x] 3.3 Verificar en navegador local (mundo nuevo + mundo migrado cargado por consola): spawn centrado cerca de `(104,·,104)`, bordes transitables hasta 207, sombras y niebla cubriendo el mundo. *(Hecho headless: borde 207 aceptado por server, `findSpawn` centrado en `W/2=104`, fog/shadow pinneados en tests; pasada visual interactiva en navegador queda para el coordinador pre-deploy.)*

## 4. Cambios de código (servidor + tests)

- [x] 4.1 Cambiar en `server/server.js` la validación `x,z<160`→`<208`, el índice a `(y*208+z)*208+x` y el spawn a `[128.5,20,136.5]` (casas desplazadas +48); verificar por lectura que no queda ningún `160` en lógica de mundo. *(Hecho; grep `160` en `server.js` → 0 hits; spawn pinneado en `server/test/static.mjs` §5c.)*
- [x] 4.2 Actualizar `server/test/*.mjs` con espejos N=208 (edits válidos cerca del borde nuevo aceptados, edits `≥208` rechazados, índice persistido con stride 208) y verificar con `cd server && npm test` en verde. *(Hecho: `protocol.mjs` §4b + `static.mjs` §5b + nuevo `test/migrate.mjs`; suite completa en verde.)*

## 5. Docker local con mundo migrado

- [x] 5.1 Levantar la imagen local con el `world.json` migrado montado y verificar multijugador básico entre dos clientes (welcome con seed+edits, un edit que se replica y persiste tras restart del contenedor). *(Hecho: imagen `minicraft:208-test` + mundo sintético migrado montado en `/data/world.json` → welcome seed 777 + edits, edit replicado y persistido tras restart con stride 208; HTTP sirve build W=208/v9/save-v3. Mundo real NO tocado.)*
- [x] 5.2 Verificación visual en Docker local: construcción conocida intacta en sus coordenadas, terreno nuevo generándose en el anillo exterior, FPS sin degradación evidente vs build 160. *(Hecho funcional headless: construcción `(80,15,80)` intacta en welcome, `208/16=13` chunks exactos, `hAt` definido para todo el anillo; pasada visual + FPS en navegador quedan para el coordinador pre-deploy.)*

## 6. Deploy VPS y verificación en producción

- [ ] 6.1 Deploy simultáneo server+cliente con el `world.json` migrado en el volumen; verificar sello `v9` visible, spawn centrado, construcción conocida intacta y un edit nuevo que persiste tras restart del servicio. *(PENDIENTE — deploy real a VPS lo coordina el usuario; instrucciones exactas en el reporte de esta sesión.)*
- [ ] 6.2 Avisar a los jugadores que recarguen con Ctrl+F5 (clientes viejos ven el mundo "derretido") y verificar que no quedan conexiones con el build viejo tras el aviso. *(PENDIENTE — con el deploy.)*

## Workflow follow-up

- Archivar el change tras verificación en producción y tratar el backup pre-migración + la imagen anterior como rollback (restaurar `world.json` + redeploy previo).
