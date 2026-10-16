# Design

## Context

Ver `proposal.md` (Why). Estado actual: `doPlace` (`index.html:1743`) chequea solape solo contra `player.pos` local en 3 puntos (ramas escalera `:1754`, normal `:1767`, puerta de 2 celdas `:1773`) con la caja 0.6×1.8. No revisa `remotes` (Map id→avatar, `g.position` interpolada hacia `target` en `tickAvatar:1676`) ni `animals` (array, `g.position`, física con `collidesAt(..., .32, 1.2)` en `tickAnimal`). El servidor (`server/server.js:109-116`) valida rangos/tipos en `edit` pero no colisiones, y sus posiciones `players` vienen de `mv` reportado por cada cliente.

## Goals / Non-Goals

**Goals:**

- Una sola guarda de ocupación reutilizada en las 3 ramas de `doPlace`.
- Cubrir local + remotos + animales con cajas fieles a la física existente.
- Evitar falsos positivos por interpolación de remotos.

**Non-Goals:**

- Validación server-side contra `players` (se documenta y se difiere, ver Decisiones).
- Cambios de protocolo, física o colisiones de movimiento.
- Nuevos tipos de bloque o cambios en puerta/escalera más allá de la guarda.

## Decisions

### 1. Helper `ocupadoPor(x, y, z)` en cliente, antes de `doPlace`

Un test AABB celda-vs-caja de entidad, llamado en las 3 ramas. Alternativa descartada: inlinear el chequeo 3 veces (duplica la lógica y diverge, como hoy). El helper vive junto a `doPlace` en `index.html`.

### 2. Cajas: local y remotos 0.6×1.8; animales 0.64×1.2

Local y remotos usan el mismo avatar que la física (`collidesAt(..., .3, 1.8)` → semiancho 0.3, alto 1.8). Animales usan su física real (`collidesAt(nx, y, nz, .32, 1.2)` en `tickAnimal`) → semiancho 0.32 (ancho 0.64), alto 1.2. Alternativa descartada: caja genérica única (falsos rechazos en animales o huecos en jugadores).

### 3. Margen 0.1 recortando la caja de la entidad

El test usa la caja de la entidad recortada 0.1 por lado (no se agranda la celda). Racional: `tickAvatar` interpola `g.position` hacia `target` con `lerp(dt*10)`, así que la posición renderizada va retrasada respecto al remoto real; sin margen, colocar junto a un remoto en movimiento rechazaría de más. 0.1 ≈ un paso de interpolación típico y es menor que el semiancho (0.3), así que un cuerpo realmente dentro sigue bloqueando. Alternativa descartada: margen 0 (más falsos positivos) o margen ≥0.3 (deja atrapar de verdad).

### 4. Servidor: NO en este change (decisión explícita)

No se toca `server/server.js`. Racional: las posiciones `players` del servidor son auto-reportadas por cada cliente (`mv`), sin física autoritativa; un chequeo server-side sería burlable por un cliente malicioso y daría falsa seguridad, a cambio de coste real (test de colisión en `edit`, tests nuevos, deploy del servidor). El griefing honesto/accidental —el caso reportado— queda resuelto con la guarda de cliente. Se deja como follow-up documentado: si se quiere defensa contra clientes modificados, hacerlo como change propio con física autoritativa o validación de proximidad, no como parche en este fix.

### 5. Puerta chequea `y` e `y+1`; mensajes con toast existente

La puerta ocupa 2 celdas, así que llama a `ocupadoPor` en ambas; el resto una sola. Se reutiliza `toast('⛔ …')` (mismo texto para local y terceros: simple y sin filtrar quién está ahí).

## Risks / Trade-offs

- [Lag alto en remotos] Un remoto con >0.5s de lag podría moverse dentro justo después de colocar → Mitigación: margen 0.1 + interpolación rápida (`dt*10`); el caso residual es igual al comportamiento actual y requiere que el remoto camine hacia el bloque.
- [Cliente modificado ignora la guarda] Puede seguir atrapando a otros → Mitigación aceptada: fuera de scope; requiere el follow-up server-side con física autoritativa.
- [Falsos rechazos en multitudes] Varios remotos juntos recortan poco espacio útil → Mitigación: el margen 0.1 minimiza el área gris; colocar a 1 celda de distancia siempre funciona.

## Migration Plan

- Sin migración ni deploy: solo `index.html`, cambio compatible hacia atrás.
- Rollback: revertir el commit del cliente.
- Verificación: manual (colocar sobre local/remoto/animal se rechaza; celda libre coloca) + `cd server && npm test` sigue verde (servidor intacto).
