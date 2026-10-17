# Tasks

## 1. Sonido de la gallina

- [x] 1.1 Agregar `const sfxCluck=()=>{ ... }` en la sección SONIDO de `index.html`, junto a `sfxOink`/`sfxBaa`, con dos tonos cortos y agudos (cloqueo). Verificar que `cd server; npm test` (test `static.mjs`, `node --check`) sigue verde.

## 2. Modelo de la gallina

- [x] 2.1 Implementar `makeChicken(x,y,z)` en `index.html` junto a `makePig`/`makeSheep`, con `box`/`lamC` y el mismo shape de retorno (`{ g, head, legs, kind:'chicken', tx, tz, wait, vy, onGround, stuck, t, petCd, say }`), cuerpo blanco, cresta roja, pico y patas amarillas, alitas, y `say` con `sfxCluck()` + `toast('🐔 ¡Clo clo!')`. Verificar con `cd server; npm test` que el módulo parsea y el modelo no rompe el test estático.

## 3. Spawn de gallinas

- [x] 3.1 En `spawnAnimals(rng)` sumar el contador `chickens` (objetivo 6) y reemplazar la elección `pigs<=sheep` por "tipo con menor `count/target`" (targets cerdo 8, oveja 6, gallina 6; empate cerdo → oveja → gallina), incluyendo `makeChicken` como opción. Verificar leyendo el diff que cerdos y ovejas conservan sus objetivos y que el guard de la pasada sigue limitando el bucle.

## 4. Animación de patas genérica

- [x] 4.1 En `tickAnimal(a,dt)` reemplazar las cuatro líneas fijas `a.legs[0..3].rotation.x` por un `a.legs.forEach((l,i)=>{ l.rotation.x=(i===0||i===3)?sw:-sw; })` para que soporte animales de 2 y 4 patas. Verificar en el navegador que cerdos y ovejas mantienen su marcha diagonal y que la gallina alterna sus dos patas sin errores en consola.

## 5. Integración

- [x] 5.1 Ejecutar `cd server; npm test` y confirmar que todos los tests (static, avatar, migrate, terrain, protocol) pasan en verde.
- [x] 5.2 Prueba manual: cargar el mundo y confirmar que aparecen cerdos, ovejas y gallinas juntos; que la gallina es visiblemente más chica, deambula, esquiva bloqueos y al acariciarla suena el cloqueo con toast `🐔 ¡Clo clo!`. Verificado y aprobado por el usuario en el navegador (Docker): "Quedó perfecto".

## Workflow follow-up

- Archivar el change cuando la revisión del proyecto esté satisfecha.
- Opcional: actualizar la sección `## Purpose` de `openspec/specs/creatures/animals/spec.md` (hoy menciona solo "cerdos y ovejas") para incluir la gallina.
