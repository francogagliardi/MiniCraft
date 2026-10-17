# Proposal

## Why

El mundo solo tiene dos bichos deambulando (cerdos y ovejas). Agregar una gallina 🐔 da más variedad y vida al pasto con un costo mínimo, reutilizando el comportamiento genérico que ya funciona (`tickAnimal`, `pet`, `collidesAt`).

## What Changes

- Nuevo modelo `makeChicken(x,y,z)` en `index.html` con el mismo shape que `makePig`/`makeSheep` (`{ g, head, legs, kind, tx, tz, wait, vy, onGround, stuck, t, petCd, say }`), chico: cuerpo blanco, cresta roja, pico y patas amarillas, alitas.
- Nuevo sonido `sfxCluck` en la sección `tone(...)` y `say` de la gallina con toast `🐔 ¡Clo clo!`.
- `spawnAnimals(rng)`: sumar el contador de gallinas y elegir entre los tres animales según el déficit respecto a su objetivo (pigs 8, sheep 6, chickens 6) en lugar de la regla par pig/sheep.
- Animación de patas de `tickAnimal(a,dt)` generalizada para soportar animales de 2 patas (la gallina) sin alterar el paso de cerdos/ovejas de 4 patas.
- **No** se tocan el servidor, el atlas/texturas, el protocolo, ni la física del jugador.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `creatures/animals`: se AGREGA una gallina como tercer tipo de animal (spawn, modelo y mascota) manteniendo los requisitos existentes de colisión de cuerpo completo y re-elección de destino sin cambios.

## Impact

- Código afectado: solo `index.html` (sección SONIDO, sección ANIMALITOS: `makeChicken`, `spawnAnimals`, animación de patas en `tickAnimal`). `server/server.js` NO se toca.
- Comportamiento observable: aparecen gallinas chicas en el pasto que deambulan, esquivan bloqueos y suenan/toast al acariciarlas, igual que cerdos y ovejas.
- Riesgo bajo: se reutiliza lógica existente; `cd server && npm test` (incluye `static.mjs`, que parsea `index.html`) debe seguir verde.
