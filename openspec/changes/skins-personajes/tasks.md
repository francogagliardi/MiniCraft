# Tasks

## 0. Confirmaciones antes de codear

- [x] 0.1 Confirmar con el usuario la etiqueta de `moreno` (`Moreno` propuesto vs "Piel oscura" / "Hombre de color") y el nombre visible de `gojo` (`Gojo` propuesto).
  → Confirmado: etiqueta visible **Piel oscura** para `moreno` y **Gojo** para `gojo`.
- [x] 0.2 Confirmar si la barba corta de `moreno` queda (detalle sutil) o se prefiere el rostro limpio.
  → Confirmado: **sí**, barba sutil.

## 1. TDD: actualizar los tests del catálogo (RED)

Todo en `server/test/skins.mjs`; **no** se agrega archivo nuevo, la suite sigue en 22.

- [x] 1.1 Catálogo: pasar el caso "exactamente seis aspectos" a nueve ids ordenados
  (`fat,giant,gojo,human,moreno,mujer,robot,small,zombie`), `PLAYER_SKINS.length === 8` con
  `human,fat,giant,small,zombie,mujer,moreno,gojo`, `robot` fuera, y `DEFAULT_SKIN === 'human'`.
- [x] 1.2 Alturas y escala: agregar `mujer`, `moreno` y `gojo` a 1.97 con `scale === 1`, y
  `sizeFactor === 1` / `playerBox` `.3 × 1.8` / `eyeHeight` 1.62 / `reachFor` base para los tres.
- [x] 1.3 `resolveSkin`: aceptar `mujer`, `moreno` y `gojo` como ids válidos y seguir cayendo en
  `human` con basura.
- [x] 1.4 Estáticos de las ramas nuevas de `makeAvatar`: agregar `mujer`, `moreno` y `gojo` a la
  lista de `branch(id)` y extraer el cuerpo de cada rama con el helper de llaves balanceadas desde
  `sid==='mujer'`, `sid==='moreno'` y `sid==='gojo'` para verificar:
  - `mujer`: falda (`.50,.26,.34`), pecho de dos piezas (`.28,.20,.16` en `z=.19`), melena trasera
    y mechones laterales, sin colores por `hue`.
  - `moreno`: casquete corto (`.44,.16,.44`) y barba, sin colores por `hue`.
  - `gojo`: venda (`.46,.12,.46`), sin bloques de ojos (`.07,.08,.02`) en la rama y puntas de pelo.
  - las tres ramas asignan `armL`, `armR`, `legL` y `legR` y no escalan `g`.
- [x] 1.5 Estáticos del menú: `#skinPicker` con ocho `data-skin` en el orden de `PLAYER_SKINS`,
  `robot` ausente y cada botón con `aria-checked`; `#skinHint` sigue aclarando "los demás" y
  "primera persona"; `localStorage('mc-skin')` y `hello` con `skin` intactos.
- [x] 1.6 Estáticos del servidor: `server/skins.js` con `SKIN_SIZE` de nueve claves, factor 1 para
  `mujer`/`moreno`/`gojo` y `swordReach` 4.6 para los tres.
- [x] 1.7 Estáticos del README: nueve filas con las alturas del catálogo (1.97 para los tres nuevos)
  y la nota de que son variantes visuales del mismo tamaño.
- [x] 1.8 Correr `cd server && node test/skins.mjs` y confirmar que falla por los motivos esperados
  (RED). No seguir hasta ver el rojo correcto.
  → RED: 59 chequeos fallaron (catálogo, escala, resolveSkin, ramas, selector, `SKIN_SIZE` y README).

## 2. Implementación (GREEN)

- [x] 2.1 En `index.html`, bloque `/* skins:start */…/* skins:end */`: agregar `mujer`, `moreno` y
  `gojo` a `SKIN_SPECS` con `height: BASE_H`, `scale: 1` y `colors` (piel, shirt, pants, hair;
  `blindfold` para `gojo`), y sumarlos a `PLAYER_SKINS` en el orden
  `human,fat,giant,small,zombie,mujer,moreno,gojo`.
- [x] 2.2 En `makeAvatar`, agregar las ramas `sid==='mujer'`, `sid==='moreno'` y `sid==='gojo'`
  con las piezas, tamaños y posiciones del `design.md`; conservar el patrón `B(...)` + `armL/
  armR/legL/legR`, la etiqueta, la barra y el arma en mano, y no escalar `g`.
- [x] 2.3 En el menú inicial, agregar los tres botones a `#skinPicker` con `data-skin`,
  `role="radio"`, `aria-checked="false"` y las etiquetas confirmadas en 0.1
  (`Mujer`, `Piel oscura`, `Gojo`).
- [x] 2.4 En `server/skins.js`, agregar `mujer: 1`, `moreno: 1` y `gojo: 1` a `SKIN_SIZE`.
- [x] 2.5 En `README.md`, agregar las tres filas de la tabla de aspectos (altura 1.97, nota de
  variante visual) sin romper el formato `| id | Etiqueta | Altura | Notas |`.
- [x] 2.6 Correr `node test/skins.mjs` hasta verde.

## 3. Suite completa y validación

- [x] 3.1 `cd server && npm test` ⇒ 22/22 verde (sin archivos nuevos).
- [x] 3.2 `openspec validate skins-personajes --strict` ⇒ sin errores ni warnings.
- [x] 3.3 Revisar que sólo cambiaron los archivos previstos: `index.html`, `server/skins.js`,
  `server/test/skins.mjs`, `README.md` y el change.

## 4. Docker y aprobación (obligatorio)

- [x] 4.1 `docker compose up --build -d minicraft` (sin bot salvo que el change lo requiera).
- [x] 4.2 Verificar HTTP 200 en `http://localhost:3000` y avisar al usuario en un mismo mensaje el
  link local y la clave admin de esa corrida (o "admin deshabilitado" si no se configuró).
- [x] 4.3 Pedir que pruebe: elegir Mujer, Piel oscura y Gojo en el menú; verse en 3ª persona; que otro
  cliente (o el bot) los vea; confirmar que la 1ª persona y el tamaño no cambian; verificar que la
  elección sobrevive a recargar.
- [x] 4.4 Esperar aprobación explícita. **No** commitear, pushear ni archivar antes.

## 5. Cierre (sólo tras aprobación)

- [x] 5.1 `docker compose down`.
- [x] 5.2 `git add` + commit en español (`feat(skins): ...`) y `git push` a `main`.
- [x] 5.3 `openspec archive skins-personajes` y verificar que `openspec/specs/ui/skins` y
  `openspec/specs/net/avatar` queden con los requisitos fusionados (sin duplicados ni TBD).
- [x] 5.4 `openspec validate --all --strict` y `git status` limpio.
