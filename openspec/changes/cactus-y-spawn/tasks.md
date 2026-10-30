# Tasks

## 1. RED: tests de contacto, daño y muerte por cactus

- [x] 1.1 Crear `server/test/cactus.mjs` con el patrón de `server/test/skins.mjs` (lectura de `index.html`, `grabFn`, `ok`, `near`) y extraer el bloque `/* cactus:start */…/* cactus:end */`; evaluarlo con `new Function` **sin THREE**. Verificar que `node test/cactus.mjs` corre y falla por bloque ausente, no por error de sintaxis del test.
- [x] 1.2 En `server/test/cactus.mjs` agregar los asserts puros de contacto con un `getBlock` falso (mapa `"x,y,z" → id`): `CACTUS_ID === 22`, `CACTUS_MARGIN === 0.06`, `touchingCactus(...)` con caja `human` tocando de costado a ≤0.06 ⇒ `true`; a 1 bloque ⇒ `false`; parado arriba (pies en `y+1`) ⇒ `false`; cactus dentro del cuerpo ⇒ `true`; caja `small` (≈0.137×0.822) y `giant` (≈0.761×4.568) con el mismo criterio. Verificar que fallan con el `index.html` actual.
- [x] 1.3 En `server/test/cactus.mjs` agregar los estáticos de daño y muerte: `tickCactus` existe y se llama en `loop`; usa `damage(1,'cactus')` (o `damage(1, 'cactus')`); `damage` conserva la guarda de admin/muerto y `godT`; `die` tiene la rama `cause==='cactus'` con el texto `Te pinchaste con un cactus. 🌵` y conserva `fall` y el mensaje de jugador. Verificar que fallan.
- [x] 1.4 En `server/test/cactus.mjs` agregar los estáticos de alcance negativo: el bloque cactus no referencia zombis, animales ni bot (sin `tickZombie`, `animals`, `bot` dentro del bloque ni en `tickCactus`); `genWorld`/`WORLDGEN` no contiene `MELON` ni `CACTUS` (no hay worldgen de cactus); `DEFS[MELON].name` sigue siendo `Cactus 🌵` y el id sigue en `INVENTORY`. Verificar que fallan.
- [x] 1.5 En `server/test/cactus.mjs` agregar los asserts estáticos del favicon: existe `<link rel="icon">` en el `<head>`, `type="image/svg+xml"`, `href` con `data:image/svg+xml`, `decodeURIComponent(href)` contiene un `<svg>` con `viewBox`, un `rect` con `rx`, un `linearGradient` con la diagonal al 50 % y los hex `#8bd450`/`#9a6a45`; sin `href` a una URL externa; comparar los hex con `.logo-cube`. Verificar que fallan con el `index.html` actual (hoy no hay `rel="icon"`). No se agrega otro archivo de test: la suite sigue en 20.

## 2. RED: tests del spawn preferido

- [x] 2.1 En `server/test/cactus.mjs` agregar los asserts puros de spawn: `SPAWN_PREF` es exactamente `{ x:108.5, y:16.01, z:117.5 }`; `spawnPrefOk(108.5,16.01,117.5,0.3,1.8,env)` con un `env` falso válido ⇒ `true`; bloque de abajo no sólido ⇒ `false`; agua en pies o en el cuerpo ⇒ `false`; `collidesAt` verdadero ⇒ `false`; contacto con cactus ⇒ `false`. Verificar que fallan con el `index.html` actual.
- [x] 2.2 En `server/test/cactus.mjs` agregar los casos por aspecto: con un hueco de 4 bloques y `collidesAt` que simula la caja real, `giant` ⇒ `false` (fallback) y `small` ⇒ `true` (usa el preferido); con caja `human` y el mismo hueco ⇒ `true`. Verificar que fallan.
- [x] 2.3 En `server/test/cactus.mjs` agregar los estáticos de cableado: `findSpawn` prueba `SPAWN_PREF` **antes** del bucle espiral y solo continúa si `spawnPrefOk` es falso; `startGame` y `respawn` siguen llamando a `findSpawn`; el fallback conserva `Math.max(4, Math.ceil(h))` y `collidesAt(..., r, h)`; `respawn` no duplica coordenadas del spawn. Verificar que fallan.

## 3. RED: alta en la suite (20 archivos)

- [x] 3.1 Agregar `node test/cactus.mjs` a `scripts.test` de `server/package.json` (una sola vez) y verificar que `node test/cactus.mjs` es el único rojo esperado en esta etapa.
- [x] 3.2 Actualizar los tres listados/conteos hardcodeados de 19 a 20: `server/test/lookguard.mjs` (array `required` con `cactus`, `count === 20` y comentario “20 en total”), `server/test/zombie-protocol.mjs` (array `required` con `cactus` y texto “20 archivos”) y `server/test/camera.mjs` (bloque “alta en la suite (20 archivos)”, `count === 20` y “20 archivos”). Verificar que los tres fallan hasta que el código y el conteo estén completos.

## 4. GREEN: bloque cactus, contacto y daño

- [x] 4.1 Crear en `index.html` el bloque autocontenido `/* cactus:start */…/* cactus:end */` con `CACTUS_ID = 22`, `CACTUS_MARGIN = 0.06`, `cactusCells(px,py,pz,r,h)` y `touchingCactus(px,py,pz,r,h,getBlock)`; sin dependencias de THREE ni del resto del cliente. Verificar que los asserts puros de 1.2 pasan.
- [x] 4.2 Implementar `tickCactus()` en el cliente: si `started`, `!dead`, `state === 'play'` y el jugador local toca un cactus según `playerBox(mySkin)`, llamar a `damage(1,'cactus')`. Invocarlo desde `loop` una vez por frame, junto a los demás `tick*`. Verificar los estáticos de 1.3 y en navegador que el daño se aplica 1 HP cada ~0.6 s.
- [x] 4.3 Agregar la rama `cactus` en `die` con `Te pinchaste con un cactus. 🌵`, sin tocar las ramas de `fall` y de jugador. Verificar que morir por cactus muestra el mensaje y que las otras causas conservan el suyo.
- [x] 4.4 Insertar en el `<head>` de `index.html` el `<link rel="icon" type="image/svg+xml" sizes="any">` con el SVG del logo como data URI: cuadrado redondeado (`rect rx`), `linearGradient` diagonal `#8bd450`/`#9a6a45` con hard stop al 50 % y borde interior claro. Sin tocar `manifest`, `apple-touch-icon`, `title`, `theme-color` ni `server/server.js`, y sin archivos nuevos. Verificar que los asserts de 1.5 pasan.

## 5. GREEN: spawn preferido con fallback

- [x] 5.1 Definir `SPAWN_PREF = { x:108.5, y:16.01, z:117.5 }` y el helper puro `spawnPrefOk(px,py,pz,r,h,env)` (con `env = { get, solidAt, collidesAt }`) que valida: bloque de abajo sólido, pies y cuerpo sin agua, `!collidesAt(...)` con la caja recibida y `!touchingCactus(...)` con `env.get`. Verificar que los asserts puros de 2.1 y 2.2 pasan.
- [x] 5.2 En `findSpawn`, probar `SPAWN_PREF` primero con `playerBox(mySkin)` y devolver `new THREE.Vector3(SPAWN_PREF.x, SPAWN_PREF.y, SPAWN_PREF.z)` solo si `spawnPrefOk` es verdadero; si no, ejecutar el espiral actual **sin cambios** (`max(4, ceil(h))`, `collidesAt`). Verificar los estáticos de 2.3.
- [ ] 5.3 Verificar en navegador con el mundo actual: `human` aparece en `108·16·117` (topbar truncado); `giant` cae al fallback si el techo es de 4; `small` usa el preferido en ese mismo hueco; `respawn` devuelve al mismo punto cuando es válido. Sin cambiar el server.

## 6. Cierre de la suite

- [x] 6.1 Correr `cd server && npm test` y verificar **20/20** archivos verdes, sin correr Docker (la aprobación en Docker la hace el orquestador después).
- [x] 6.2 Verificar que no quedan referencias a “19 archivos” ni `count === 19` en `server/package.json`, `server/test/lookguard.mjs`, `server/test/zombie-protocol.mjs` ni `server/test/camera.mjs` (buscar `19` en esos archivos).
- [x] 6.3 Confirmar que el cambio no toca `server/`, `bot/`, `docker-compose.yml` ni `AGENTS.md`, y que `README.md` no requiere cambios (no documenta cactus ni spawn); si el usuario pide documentarlo, agregar la nota en el mismo change.

## Workflow follow-up

- Levantar Docker con `docker compose up --build -d` y pedir aprobación explícita del usuario en http://localhost:3000. Probar con dos clientes:
  - Colocar un cactus (`Cactus 🌵`) y tocarlo de costado: perder 1 HP cada ~0.6 s hasta morir; el cartel dice `Te pinchaste con un cactus. 🌵`.
  - Pararse **arriba** del cactus y caminar sobre él: no se pierde vida (es esperado).
  - Apoyarse en el costado con `small` y con `giant`: el contacto daña con la caja de cada aspecto.
  - Morir por cactus y respawnear: se reaparece con la vida completa y sin daño inmediato (gracias a `godT`).
  - Comprobar el spawn exacto: al iniciar y al respawnear, el topbar muestra `108·16·117`; el cuerpo queda sobre suelo sólido y sin agua.
  - Forzar el fallback: con `giant` en un techo de 4 (o bloqueando el punto), el jugador aparece en otro lado sin errores; con `small` en el mismo hueco, usa el preferido.
  - Con dos jugadores: cada uno aparece en el mismo punto si es válido; cuando uno se pincha, el otro ve su vida bajar por `pm`. El bot y los zombis que pasan cerca de un cactus **no** pierden vida.
  - Favicon: abrir o refrescar la pestaña en Chrome/Edge con hard reload; el ícono de la pestaña debe ser el cuadrado verde/marrón del logo (misma diagonal que `.logo-cube`), no el globo genérico. Comprobar que el `manifest` y el `apple-touch-icon` siguen iguales y que no hay archivos de imagen nuevos.
- Al aprobar: `docker compose down` (y bajar el bot si se levantó), commit en español (`feat(cactus):`), push a `main` y `openspec archive cactus-y-spawn`.
