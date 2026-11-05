# Proposal

## Why

El catálogo de aspectos tiene hoy cinco opciones de jugador (`human`, `fat`, `giant`, `small`,
`zombie`) y todas comparten la misma silueta humanoide genérica, salvo el gordo y el zombi. El
usuario pidió tres personajes nuevos para que cada jugador pueda elegir una identidad más
reconocible: una **mujer**, un hombre de **piel oscura** (etiqueta visible `Piel oscura`) y
**Satoru Gojo** (Jujutsu Kaisen). Los tres pueden construirse con el rig de cajas y
texturas/colores procedurales que ya usa el juego, sin assets externos.

## What Changes

- Se agregan tres aspectos de jugador al catálogo: `mujer`, `moreno` y `gojo`.
- Los tres miden **1.97** (el rig humano real, `BASE_H`) con `scale: 1`, así que su caja de
  colisión, altura de ojos y alcances son los de `human`: la elección es visual, no cambia la
  jugabilidad y no obliga a rebalancear nada.
- Cada uno define una silueta y una paleta fija en el catálogo (pelo, ropa, accesorios), en vez de
  derivar el color de la ropa del `hue` del id como el humano: así se reconocen igual para todos
  los jugadores.
- `mujer`: torso más angosto, pecho marcado, falda y melena larga (pelo con volumen en la nuca y mechones
  laterales). `moreno`: etiqueta visible **Piel oscura**, tono de piel oscuro, pelo corto negro y
  barba corta sutil, con ropa neutra. `gojo`: etiqueta visible **Gojo**, pelo blanco en puntas,
  **venda negra que cubre los ojos** (no se dibujan ojos) y uniforme oscuro con cuello alto.
- El selector del menú inicial pasa de cinco a **ocho** botones; la persistencia (`mc-skin`) y el
  envío del `skin` en el `hello` no cambian.
- La tabla de tamaños del servidor (`server/skins.js`) incorpora los tres ids con factor 1 y el
  README documenta los tres aspectos nuevos.
- **Aditivo**: no se renombra ni se elimina ningún aspecto existente, no cambia el protocolo
  (`hello`/`pm`/`join` siguen llevando el `skin` como string libre), no cambia el formato del
  guardado del mundo ni de `localStorage`, y un cliente viejo que no conoce los ids nuevos los
  resuelve a `human` como hoy.

## Capabilities

### New Capabilities

- (ninguna)

### Modified Capabilities

- `ui/skins`: el selector del menú inicial ofrece ocho aspectos de jugador en vez de cinco y
  conserva el marcado de la opción elegida, la persistencia y la validación contra `PLAYER_SKINS`.
- `net/avatar`: el catálogo pasa a nueve aspectos (seis existentes + tres nuevos), cada uno con
  altura, escala y datos de modelo; se documenta el render de `mujer`, `moreno` y `gojo` y que los
  tres conservan el tamaño y el comportamiento del avatar remoto.

## Impact

- `index.html`: catálogo `/* skins:start */…/* skins:end */` (`SKIN_SPECS`, `PLAYER_SKINS`) y las
  ramas de construcción de `makeAvatar` para los tres modelos nuevos; tres botones nuevos en
  `#skinPicker`.
- `server/skins.js`: tres entradas nuevas en `SKIN_SIZE` con factor 1 (mismo alcance de espada que
  `human`).
- `README.md`: tres filas nuevas en la tabla de aspectos y una nota de que son variantes visuales
  de 1.97.
- `server/test/skins.mjs`: se actualizan los conteos (seis → nueve aspectos, cinco → ocho opciones),
  las ramas esperadas en `makeAvatar`, el selector del menú, `SKIN_SIZE` y la tabla del README, más
  los chequeos estáticos de pelo, venda y paletas. **No se agrega un archivo de test**: la suite
  sigue en 22 archivos.
- Sin migración de datos, sin dependencias nuevas y sin assets binarios.

## Out of Scope

- **No** se agregan animaciones nuevas, gestos por aspecto ni voces/sonidos propios.
- **No** se cambia la escala de jugabilidad de ningún aspecto existente ni se agregan aspectos con
  tamaño distinto de 1.97.
- **No** se modela un rostro detallado (boca, cejas, iris): se mantiene el estilo de cajas con
  ojos cuadrados y accesorios geométricos.
- **No** se usa la imagen, el nombre ni la marca de Jujutsu Kaisen como asset: `gojo` es una
  interpretación low-poly con colores y formas, sin archivos externos.
- **No** se agrega un editor de skins, ni variantes de color, ni skins por cuenta/autenticación.
- **No** se toca el aspecto `robot` del bot, ni la validación de aspecto del servidor (sigue
  difundiendo cualquier string saneado).
