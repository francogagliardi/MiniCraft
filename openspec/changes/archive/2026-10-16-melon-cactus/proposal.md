# Proposal

## Why

El bloque con id 22 se llama `Melón 🍉` pero su textura y su uso en el mapa corresponden a un cactus. El nombre visible confunde al jugador (inventario, hotbar, toasts).

## What Changes

- Renombrar el nombre visible del bloque id 22 (`MELON`) de `Melón 🍉` a `Cactus 🌵`.
- NO cambia: id numérico (22), constante `MELON`, textura/tiles, `hard`, física, mundo guardado ni el espejo `server/test/static.mjs` (solo espeja el id, sin nombres).

### Agregado 1 — E cierra el inventario

- El handler `keydown` solo abría el inventario (`state` play/pause → `openInv`); con el inventario abierto (`state==='inv'`) caía en el guard `state!=='play'` y retornaba sin hacer nada (la línea `if(e.code==='KeyE') openInv();` era inalcanzable). Ni foco ni orden de listeners: pura lógica de estados.
- Cambio mínimo en `index.html` (handler `keydown`): `KeyE` ahora alterna — `inv` → `closeInv()`, `play`/`pause` → `openInv()` — y se elimina la línea muerta. La guarda de foco en `INPUT`/`TEXTAREA` y `Escape`-en-chat quedan intactas.

### Agregado 2 — Botón de pantalla completa visible en PC

- `btnFull` tenía clase `only-touch` (CSS `.only-touch{display:none}` sin `body.touch` ⇒ oculto en PC). Decisión mínima: quitar `only-touch` de `btnFull` (reutiliza el mismo `toggleFull()` con Fullscreen API, sin duplicar botón ni listener). `btnShadow` conserva `only-touch` y el CSS táctil no se toca.

### Agregado 3 — Tecla P para pantalla completa

- El botón `⛶` es inútil en PC bajo pointer-lock (el cursor está capturado y no se puede clickear). Decisión mínima: atajo `KeyP` (**P**antalla, verificada libre por grep) en el `keydown`, con guarda `!dead`, activo en `play`/`pause`/`inv`, después del guard de foco en `INPUT`/`TEXTAREA` (no interfiere con el chat). Reutiliza el mismo `toggleFull()` del botón. Ayuda visible actualizada (`#hint` estático + strings JS, fila `only-pc` en `.controls`, `title` de `btnFull` con `(P)`).

## Capabilities

### New Capabilities

- `blocks/names`: nombre visible de los bloques (etiqueta de inventario, hotbar y toasts derivada de `DEFS[id].name`).
- `ui/inventory`: toggle del inventario con `E` (abrir/cerrar alternando según `state`).
- `ui/fullscreen`: botón de pantalla completa visible en PC y táctil (Fullscreen API vía `toggleFull()`) + atajo de teclado `P`.

### Modified Capabilities

- (vacío — ninguna capability existente cubre nombres visibles; `blocks/placement`, `blocks/slab`, `blocks/stair`, `blocks/torch` no hablan de etiquetas).

## Impact

- Código afectado: `index.html:476` (único lugar con el string `Melón 🍉`; verificado por búsqueda: inventario/hotbar/toasts en `index.html:1946,1953,1963,1965,1980` leen `DEFS[id].name` dinámicamente, sin etiquetas duplicadas).
- Sin impacto en server, mundo persistido ni tests (los bloques ya colocados siguen siendo id 22).
- Agregados: solo `index.html` (handler `keydown` ~línea 1272 y pill `btnFull` ~línea 231). Server no tocado; `cd server && npm test` verde antes y después.

## Evidence

| Check | Resultado |
|---|---|
| RED pre-fix (script `melon-cactus-check.js`, 10 asserts) | 3 FAIL: `KeyE→closeInv` ausente, línea muerta presente, `btnFull` con `only-touch` |
| GREEN post-fix | 10/10 PASS (`exit 0`) |
| `node --check` del script inline del juego (extraído de `index.html`) | OK (el único fallo es el bloque `importmap`, JSON no-JS, preexistente) |
| `cd server && npm test` | 🎉 protocolo OK (antes y después) |
| Triangulación | E alterna play/pause→`openInv` e inv→`closeInv` (`dead` y foco-en-input bloquean igual que antes); `Escape`-en-chat, botón `Listo (E)`, `toggleFull()` y `btnShadow only-touch` intactos; táctil (`body.touch`, `invTouch→openInv`) sin cambios |
