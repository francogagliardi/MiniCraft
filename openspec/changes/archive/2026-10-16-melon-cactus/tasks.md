# Tasks

## 1. Renombre visible

- [x] 1.1 Cambiar `name:'Melón 🍉'` por `name:'Cactus 🌵'` en `index.html:476` (entrada `[MELON]` de `DEFS`) y verificar que `grep Melón index.html server/test/static.mjs` no devuelve coincidencias
- [x] 1.2 Verificar en navegador (o inspección de `DEFS[MELON].name`) que inventario, hotbar y toast muestran `Cactus 🌵`, que el id sigue siendo 22 y que `server/test/static.mjs` no requiere cambios (solo espeja el id), con tests verdes

## 2. E cierra el inventario (toggle)

- [x] 2.1 En el handler `keydown` de `index.html`, rama `KeyE`: si `state==='inv'` llamar `closeInv()`, si `play`/`pause` llamar `openInv()` (con guarda `!dead`); eliminar la línea muerta `if(e.code==='KeyE') openInv();` tras el guard de `state`
- [x] 2.2 Verificar RED→GREEN con script de asserts (E-cierra ausente → presente), `node --check` del inline script, regresión (`Escape`-chat, foco en input, `dead`, `Listo (E)`) y `server` tests verdes

## 3. Botón de pantalla completa visible en PC

- [x] 3.1 Quitar la clase `only-touch` del pill `btnFull` en `index.html` (reutiliza `toggleFull()`/Fullscreen API existente; sin duplicar botón; `btnShadow` conserva `only-touch`, CSS táctil intacto)
- [x] 3.2 Verificar RED→GREEN (btnFull oculto → visible en PC), que el handler `onclick→toggleFull` sigue intacto y `server` tests verdes

## 4. Atajo de teclado para pantalla completa (P)

- [x] 4.1 En el handler `keydown` de `index.html`, rama `KeyP` con guarda `!dead`: si `state` es `play`/`pause`/`inv` llamar `toggleFull()` (mismo Fullscreen API que `btnFull`); ubicada antes del guard `state!=='play'` y después del guard de foco `INPUT`/`TEXTAREA`. Tecla elegida: `P` (mnemotecnia: **P**antalla) — verificada libre por grep: sin usos de `KeyP` en `keydown`, `keys.*` de física ni menú de ayuda/`hint` previos (WASD, Espacio, E, Enter, F tomados; `if(P){` en línea 954 es variable local, no tecla)
- [x] 4.2 Ayuda visible: `#hint` estático + strings JS de `hint` (admin/jugador) mencionan `<b>P</b>`, menú `.controls` suma fila `only-pc` `<b>P</b> Pantalla completa`, `title` de `btnFull` pasa a `Pantalla completa (P)`
- [x] 4.3 Verificar RED→GREEN con script de asserts (`melon-p-check.mjs`, 16 asserts), `node --check` de los inline scripts, regresión (E-toggle, `KeyF` fly, Enter/Escape chat, foco en input, `dead`, `onclick→toggleFull`, `btnShadow only-touch`, táctil intacto) y `server` tests verdes
