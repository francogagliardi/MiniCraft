# Design

## Contexto

Los aspectos viven en dos lugares que hoy están sincronizados a mano:

- `index.html`, bloque puro `/* skins:start */…/* skins:end */`: `SKIN_SPECS` (id → `label`,
  `height`, `scale`, `width?`, `colors`), `PLAYER_SKINS`, `DEFAULT_SKIN` y los helpers
  `resolveSkin`/`skinSpec`/`sizeFactor`/`playerBox`/`eyeHeight`/`playerTop`/`reachFor`/
  `avatar*Y`. `server/test/skins.mjs` extrae ese bloque y lo evalúa con `new Function` sin THREE.
- `makeAvatar(id, name, admin, skin, opts)`: elige la rama del modelo según `sid` (`fat` tiene
  rama propia; `robot` usa `makeRobotModel`; el resto cae en el rig humanoide base) y cuelga de
  `g` la etiqueta, la barra y el arma en mano.

El selector del menú está en el **menú inicial** (`#menu #skinPicker`), no en el panel de
`⚙️ Configuración` (`#configPanel`, spec `ui/config`). Por eso `ui/config` no se toca: elegir
aspecto ya es parte de `ui/skins`.

Los tres aspectos nuevos son variantes visuales del rig de 1.97: `height: BASE_H`, `scale: 1`, y
por lo tanto `sizeFactor = 1`, caja 0.3 × 1.8, ojo 1.62 y alcances 8 / 4.6 / 6 iguales a `human`.

## Modelo de cada aspecto

Todas las piezas son `BoxGeometry` con `MeshLambertMaterial` dentro del helper `B(w,h,d,c,x,y,z)`
de `makeAvatar`, que las suma a `body` y a `avatarTargets` (PvP). Sin texturas nuevas ni assets:
el "detalle" sale de cajas y color plano, igual que el resto del juego.

### `mujer` — Mujer

Silueta más angosta arriba y con falda; el pelo enmarca la cara. Paleta fija:
piel `0xf6cfae`, remera `0xc2537f`, falda/pantalón `0x3b4668`, pelo `0x5a3418`.

| Pieza | Tamaño | Posición | Color |
|---|---|---|---|
| torso | `.44,.62,.28` | `y=1.06` | `shirt` |
| pecho (dos piezas) | `.28,.20,.16` | `x=±.14`, `y=1.14`, `z=.19` | `shirt` |
| falda (acampanada) | `.50,.26,.34` | `y=.68` | `pants` (o `colors.skirt`) |
| cabeza | `.42,.42,.42` | `y=1.65` | `skin` |
| pelo (casquete) | `.44,.14,.44` | `y=1.90` (top 1.97) | `hair` |
| melena trasera | `.40,.36,.12` | `z=-.24`, `y=1.62` | `hair` |
| mechones laterales ×2 | `.10,.34,.16` | `x=±.25`, `y=1.60` | `hair` |
| flequillo | `.44,.08,.06` | `z=.20`, `y=1.84` | `hair` |
| ojos ×2 | `.07,.08,.02` | `x=±.10`, `y=1.66`, `z=.22` | `0x222222` |
| brazos ×2 | `.14,.58,.14` | `x=±.30`, `y=1.06` | `skin` |
| piernas ×2 | `.18,.56,.18` | `x=±.12`, `y=.28` | `pants` |

Decisiones: hombros de `.44` (vs `.50` del humano) y falda de `.50` de ancho dan una silueta
triangular sin cambiar la caja de juego; el pecho son dos cajas del mismo color de la remera
(se lee como volumen bajo la ropa, no como piel), y la melena y los mechones quedan por debajo de
1.97 para no tocar la altura declarada. Los ojos no cambian: se mantiene el estilo de cajas.

### `moreno` — Piel oscura

Mismo rig y proporciones que `human` (para que se lea como "otro jugador", no como un disfraz),
con tono de piel oscuro, pelo corto negro y barba corta. Etiqueta visible aprobada por el usuario:
**"Piel oscura"**. Paleta fija: piel `0x6f4a32`, remera `0x35719c`, pantalón `0x2b3040`,
pelo/barba `0x15100d`.

| Pieza | Tamaño | Posición | Color |
|---|---|---|---|
| torso | `.50,.70,.30` | `y=1.05` | `shirt` |
| cabeza | `.42,.42,.42` | `y=1.65` | `skin` |
| pelo corto (casquete redondeado) | `.44,.16,.44` | `y=1.89` (top 1.97) | `hair` |
| barba corta | `.28,.10,.06` | `z=.19`, `y=1.50` | `hair` |
| ojos ×2 | `.07,.08,.02` | `x=±.10`, `y=1.66`, `z=.22` | `0x222222` |
| brazos ×2 | `.16,.62,.16` | `x=±.35`, `y=1.05` | `skin` |
| piernas ×2 | `.20,.70,.20` | `x=±.13`, `y=.35` | `pants` |

Decisiones de representación: la piel oscura es un color plano más de la paleta, sin rasgos
caricaturescos (sin labios rojos, sin ojos saltones, sin pelo "de goma"); el pelo es un casquete
corto y la barba **(confirmada por el usuario)** es discreta. El objetivo es que se reconozca como
un hombre negro, no exagerar rasgos. La etiqueta visible `Piel oscura` fue la elegida por el
usuario (descartando `Moreno` y "Hombre de color").

### `gojo` — Gojo

Pelo blanco en puntas, venda negra y uniforme oscuro de cuello alto. Paleta fija:
piel `0xf6ddc9`, uniforme `0x232a3d`, pantalón `0x171b26`, cinturón `0x0e1118`,
pelo `0xf2f5fb`, venda `0x111319`.

| Pieza | Tamaño | Posición | Color |
|---|---|---|---|
| torso | `.50,.70,.30` | `y=1.05` | `shirt` |
| cinturón | `.52,.06,.32` | `y=.72` | `0x0e1118` |
| cuello alto | `.26,.12,.28` | `y=1.42` | `shirt` |
| cabeza | `.42,.42,.42` | `y=1.65` | `skin` |
| pelo (casquete) | `.44,.14,.44` | `y=1.90` (top 1.97) | `hair` |
| puntas ×4 | `.12,.12,.10` | `x=-.13/0/.13`, `z=.18`, `y=1.88` | `hair` |
| punta trasera | `.14,.12,.12` | `z=-.20`, `y=1.86` | `hair` |
| mechones laterales ×2 | `.10,.14,.10` | `x=±.22`, `y=1.86` | `hair` |
| **venda** | `.46,.12,.46` | `y=1.68` | `0x111319` |
| nudo de la venda | `.07,.07,.07` | `z=-.25`, `y=1.68` | `0x111319` |
| brazos ×2 | `.16,.62,.16` | `x=±.35`, `y=1.05` | `shirt` |
| piernas ×2 | `.20,.70,.20` | `x=±.13`, `y=.35` | `pants` |

Decisiones: **no se dibujan ojos** en esta rama (la venda ocupa la franja `y ∈ [1.62, 1.74]`, que
es donde el rig humano pone los ojos), así que no hace falta material emisivo ni textura. La venda
es un cubo que envuelve la cabeza (más ancho y profundo que la cabeza) para que se lea de frente,
de perfil y de espaldas. Las puntas quedan ≤ 1.96 de alto para no romper `height: 1.97`. Se evita
cualquier imagen, logo o nombre de archivo de la obra: es una interpretación low-poly.

## Catálogo y selector

- `SKIN_SPECS` suma tres entradas completas:

  ```js
  mujer:  { label:'Mujer',  height:BASE_H, scale:1, colors:{ skin:0xf6cfae, shirt:0xc2537f, pants:0x3b4668, hair:0x5a3418 } },
  moreno: { label:'Piel oscura', height:BASE_H, scale:1, colors:{ skin:0x6f4a32, shirt:0x35719c, pants:0x2b3040, hair:0x15100d } },
  gojo:   { label:'Gojo',   height:BASE_H, scale:1, colors:{ skin:0xf6ddc9, shirt:0x232a3d, pants:0x171b26, hair:0xf2f5fb, blindfold:0x111319 } },
  ```

- `PLAYER_SKINS` pasa a `['human','fat','giant','small','zombie','mujer','moreno','gojo']`.
  `robot` sigue fuera del menú.
- `#skinPicker` suma tres botones con `data-skin="mujer|moreno|gojo"`, `role="radio"` y
  `aria-checked="false"`. No hace falta CSS nueva: `#skinPicker` ya es `flex-wrap` con `gap`, así
  que los ocho botones se acomodan en dos filas en escritorio y en varias en móvil.
- El texto de `#skinHint` no cambia: sigue siendo cierto (el tamaño manda en ojo/hitbox/alcance y
  los tres nuevos no cambian el tamaño). No se promete nada que el modelo no cumpla.

## Ramas de `makeAvatar`

Se mantiene el patrón actual: `if (sid==='fat') … else if (sid==='mujer') … else if
(sid==='moreno') … else if (sid==='gojo') … else { rig base }`. Cada rama nueva arma el cuerpo
completo con `B(...)` y asigna `armL/armR/legL/legR` para conservar balanceo, pose de muerte y
arma en mano. `g` sigue sin escalarse (no hay sub-grupo `body` para estos tres: `scale: 1`), así
que etiqueta, barra, saludo y daño flotante quedan a las alturas de `human`.

Como las tres paletas traen `colors.shirt` y `colors.hair` explícitos, el `hue` por id no las
pisa: el aspecto se ve igual para todos los jugadores, igual que `zombie` y `robot`.

## Servidor

`server/skins.js` agrega `mujer: 1`, `moreno: 1`, `gojo: 1` a `SKIN_SIZE`. No es imprescindible
para el gameplay (el default ya es 1), pero mantiene la tabla del servidor espejada con el catálogo
del cliente, que es lo que el test compara. `swordReach` no cambia para estos ids (4.6).

El servidor no valida ids: `cleanSkin` sanea el string y lo difunde tal cual. Por eso no hay que
tocar `server.js`.

## Tests (TDD, sin archivo nuevo)

Todo entra en `server/test/skins.mjs` para que la suite siga en **22** archivos:

- catálogo: nueve ids, `PLAYER_SKINS` de ocho con el orden nuevo, `robot` fuera;
- alturas/escala: los tres en 1.97 y `scale === 1`; `sizeFactor === 1`, caja `.3 × 1.8`, ojo 1.62
  y alcances base para los tres;
- `resolveSkin` acepta los tres y sigue cayendo en `human` con basura;
- estáticos por rama: extraer el cuerpo de cada rama con llaves balanceadas desde `sid==='mujer'`,
  `sid==='moreno'`, `sid==='gojo'` y verificar piezas clave (falda/melena; casquete corto + barba;
  venda `.46,.12,.46`, sin ojos, puntas de pelo) y que no usan colores derivados de `hue`;
- estáticos del menú: `#skinPicker` con ocho `data-skin` en el orden de `PLAYER_SKINS`;
- `server/skins.js`: `SKIN_SIZE` con nueve claves y factor 1 para los tres nuevos;
- README: nueve filas con las alturas del catálogo y las notas de los tres nuevos.

Si en la implementación apareciera la necesidad de un archivo nuevo, hay que actualizar los
conteos `22` en `server/test/config.mjs`, `bed-sleep.mjs`, `camera.mjs`, `lookguard.mjs` y
`zombie-protocol.mjs` (y las menciones de texto "22 archivos"). No está previsto.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Un cliente viejo recibe `mujer`/`moreno`/`gojo` | `resolveSkin` del cliente viejo ya cae en `human`; el servidor sólo difunde strings. Sin cambios de protocolo. |
| El menú queda apretado con ocho botones | `flex-wrap` existente + etiquetas cortas; se verifica en Docker a 1280×720 y en móvil. |
| La melena o las puntas superan 1.97 y desalinean etiqueta/barra | Todas las piezas se declaran por debajo del top del casquete (`y + h/2 ≤ 1.97`); el test compara `height` con las alturas derivadas. |
| `gojo` se lee mal desde atrás | La venda envuelve la cabeza (`.46,.12,.46`) y lleva nudo en la nuca. |
| El test del README rompe el parseo | Las notas nuevas no usan `|` y respetan el formato de la tabla. |
| Sensibilidad del tema racial | Paleta plana, sin rasgos exagerados; etiqueta `Piel oscura` e id `moreno` aprobados por el usuario. |

## Decisiones confirmadas por el usuario

1. **Etiqueta de `moreno`**: **"Piel oscura"** (descartadas `Moreno` y "Hombre de color").
2. **Nombre visible de `gojo`**: **"Gojo"** (fan art low-poly, sin assets).
3. **Barba en `moreno`**: **sí**, como detalle sutil (`.28,.10,.06`), sin rasgos exagerados.
