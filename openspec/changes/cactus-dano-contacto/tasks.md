# Tasks

## 1. TDD: actualizar los tests del cactus (RED)

- [x] 1.1 En `server/test/cactus.mjs`, cambiar el caso "parado arriba" de `cactusCells` para que
  espere que la celda `y` del cactus **sí** entre al barrido con los pies en `y+1`.
- [x] 1.2 Cambiar el caso "human parado arriba del cactus: no toca" por "toca" y agregar el caso de
  caída/aterrizaje sobre la cara superior.
- [x] 1.3 Agregar tests puros de `cactusBlocks`: la posición intentada que penetra la celda devuelve
  `true`; la que queda a un bloque devuelve `false`; sin cactus devuelve `false`; usa la caja del
  aspecto.
- [x] 1.4 Agregar estáticos: `movePlayer` consulta `cactusBlocks` y sella el empuje; `tickCactus`
  usa el sello además de `touchingCactus`; la constante de vigencia del empuje existe.
- [x] 1.5 Correr `node test/cactus.mjs` y confirmar que falla por los motivos esperados (RED).

## 2. Implementar (GREEN)

- [x] 2.1 En `index.html`, dentro de `/* cactus:start */…/* cactus:end */`, cambiar el piso del
  barrido de `cactusCells` a `Math.floor(py - CACTUS_MARGIN)` para incluir la celda de abajo.
- [x] 2.2 Agregar `cactusBlocks(px,py,pz,r,h,getBlock)` (intersección sin margen, mismo barrido que
  `collidesAt`) y la constante `CACTUS_PRESS_S = 0.12`.
- [x] 2.3 En `movePlayer`, al colisionar, si `cactusBlocks` detecta cactus en la posición intentada,
  sellar `cactusPressAt` con `performance.now()/1000`.
- [x] 2.4 En `tickCactus`, dañar si `touchingCactus` o si el sello de empuje sigue vigente; mantener
  las guardas de iniciado/vivo/`state==='play'` y `damage(1,'cactus')`.
- [x] 2.5 Correr `node test/cactus.mjs` hasta verde.

## 3. Suite completa

- [x] 3.1 `cd server && npm test` → 22/22 verde (sin archivos nuevos).
- [x] 3.2 `openspec validate cactus-dano-contacto --strict`.

## 4. Docker y aprobación

- [x] 4.1 `docker compose up --build -d minicraft` (bot detenido para no interferir con la prueba).
- [x] 4.2 Verificar HTTP 200 y avisar al usuario el link local + la clave admin en la misma línea.
- [x] 4.3 Explicar qué probar: pararse arriba del cactus, correr contra él y seguir empujando,
  caminar paralelo sin daño, y la cadencia de 1 HP cada 0.6 s.
- [x] 4.4 Esperar aprobación explícita. No commitear, pushear ni archivar antes.

## 5. Cierre (solo tras aprobación)

- [ ] 5.1 `docker compose down`.
- [ ] 5.2 Commit en español (`fix(cactus): ...`), push a `main`.
- [ ] 5.3 `openspec archive cactus-dano-contacto`, actualizar el `## Purpose` de
  `openspec/specs/blocks/cactus/spec.md` (el archive no lo reescribe) y validar `--all --strict`.
- [ ] 5.4 Commit del archive + push y verificar `git status` limpio.
