# Design

## Causa raíz

`movePlayer(axis, d)` mueve al jugador un paso entero o no lo mueve: si `collides(nx,ny,nz)` da
`true`, no hay resolución al ras de la cara. La separación final depende de la velocidad y del `dt`:

- caminar: `4.8 * 0.0167 ≈ 0.08` por frame;
- correr: `7.4 * 0.05 = 0.37` por frame (el `dt` está clampeado a 0.05).

`touchingCactus` usa un margen fijo de `0.06`, así que solo detecta el caso en que el paso cae casi
exactamente contra la cara. Al correr y seguir empujando, la caja queda hasta 0.37 afuera y nunca
pincha. Pararse arriba queda excluido porque `cactusCells` arranca en `Math.floor(py)` y los pies
están en `y+1`.

## Decisión

Se separan tres formas de contacto, todas evaluadas en el cliente:

1. **Intersección / margen**: `touchingCactus` conserva el margen de 0.06 para el apoyo lateral
   exacto y para un cactus dentro del cuerpo. Se cambia el piso del barrido a
   `Math.floor(py - CACTUS_MARGIN)` para que la celda inmediatamente debajo de los pies entre cuando
   el jugador está apoyado arriba (pies en `y+1`, `floor(y+1-0.06) = y`).
2. **Empuje bloqueado**: en `movePlayer`, cuando un movimiento horizontal choca, se evalúa
   `cactusBlocks(nx,ny,nz, r,h, get)` sobre la posición *intentada* (la que penetraría la celda). Si
   hay cactus, se registra `cactusPressAt = performance.now()/1000`. Esto detecta el caso de correr
   contra el bloque aunque la separación final sea de hasta un paso, y no daña si solo se camina
   paralelo sin empujar.
3. **Vigencia del empuje**: `tickCactus` considera contacto si `performance.now()/1000 - cactusPressAt
   < CACTUS_PRESS_S` (0.12 s). Mientras se sigue empujando, `movePlayer` refresca el sello cada
   frame; al soltar, expira en 0.12 s.

`cactusBlocks` replica el barrido de `collidesAt` (mismo rango `floor(px-r)..floor(px+r)` y
`floor(py)..floor(py+h-0.01)`) pero solo mira `CACTUS_ID`, sin margen. Al ser la posición intentada
la que colisiona, la celda del cactus siempre cae dentro del rango.

## Daño

No se toca `damage()`: sigue aplicando 1 HP y respetando `godT` (0.6 s), la guarda de admin y la de
muerto. El resultado es 1 HP cada 0.6 s mientras dure el contacto, como antes.

## Alternativas descartadas

- **Subir el margen a 0.4**: dañaría a 0.4 bloques de distancia al pasar caminando, incluso sin
  empujar. Falso positivo inaceptable.
- **Resolver el movimiento al ras de la cara (clamp)**: cambia la física general y puede provocar
  jitter en todas las colisiones; el cambio sería mucho más grande que el problema.
- **Raycast corto en la dirección de la mirada**: no cubre el empuje lateral ni el apoyo arriba, y
  depende de hacia dónde mira el jugador, no de hacia dónde se mueve.

## Pruebas

- `server/test/cactus.mjs` se actualiza primero (RED):
  - `cactusCells` con pies en `y+1` incluye la celda `y`;
  - `touchingCactus` parado arriba devuelve `true`;
  - `cactusBlocks` detecta la posición intentada que penetra y no la que queda a un bloque;
  - estáticos: `movePlayer` consulta `cactusBlocks` y sella `cactusPressAt`; `tickCactus` usa el
    sello.
- Después se implementa (GREEN) y se corre la suite completa (`npm test`, 22 archivos).

## Riesgos

- El sello de 0.12 s podría dañar justo después de soltar el empuje; es una ventana corta y coincide
  con la sensación de "seguir pegado".
- El barrido con la celda de abajo también incluye la celda del piso cuando el jugador está parado
  al lado de un cactus; solo daña si además hay una celda de cactus dentro del margen lateral, que es
  el comportamiento buscado.
