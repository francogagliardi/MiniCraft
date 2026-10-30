# Tasks

## 1. RED: tests de configuración

- [x] 1.1 Crear `server/test/config.mjs` con el patrón de `server/test/skins.mjs` (lectura de `index.html`, `grabFn`, `ok`, `near`) y extraer bloques puros si los hay; verificar que `node test/config.mjs` corre y falla por bloques ausentes, no por sintaxis del test.
- [x] 1.2 En `server/test/config.mjs` agregar estáticos: existe botón de configuración en `#pause`; `MOUSE_SENSITIVITY` se declara y se usa en `pointermove` (`dx * MOUSE_SENSITIVITY`); `BRIGHTNESS` se declara y se usa en `applyAtmosphere`; `applyQuality()` existe y recibe un nivel; `localStorage` claves `mc-mouse-sens`, `mc-brightness`, `mc-quality` están presentes. Verificar que fallan con el `index.html` actual.
- [x] 1.3 En `server/test/config.mjs` agregar puros de calidad: `applyQuality(0)` ⇒ pixelRatio 1, sin sombras, sin antialias, fog.far corto; `applyQuality(1)` ⇒ pixelRatio 1, sin sombras, sin antialias, fog.far normal; `applyQuality(2)` ⇒ pixelRatio devicePixelRatio (máx 1.5), sombras, antialias, fog.far normal. Verificar que fallan.
- [x] 1.4 Alta en la suite (21 archivos): agregar `node test/config.mjs` a `scripts.test` de `server/package.json`; actualizar los cuatro conteos de 20 a 21 (`lookguard.mjs`, `camera.mjs`, `zombie-protocol.mjs`, y el propio `package.json`). Verificar que fallan hasta completar.

## 2. GREEN: implementar configuración en index.html

- [x] 2.1 Agregar el panel de configuración en `#pause` (botón "⚙️ Configuración" + panel con sliders/select para sensibilidad, brillo, calidad) oculto por defecto, con botón "Volver".
- [x] 2.2 Declarar `MOUSE_SENSITIVITY`, `BRIGHTNESS`, `QUALITY_LEVEL` leídas de `localStorage` con valores por defecto; aplicar `MOUSE_SENSITIVITY` en el `pointermove` del canvas; aplicar `BRIGHTNESS` en `applyAtmosphere`; definir `applyQuality(level)` que configure el renderer (recreando si es necesario para antialias) y aplique pixelRatio/shadows/fog.
- [x] 2.3 Conectar los controles del panel: sliders/select escriben `localStorage` y aplican en caliente; botón "Volver" oculta el panel y vuelve al pausa.
- [x] 2.4 Verificar en navegador: cambiar sensibilidad se siente inmediatamente; cambiar brillo aclara las noches; cambiar calidad se aplica (recrear renderer si es necesario); todo persiste al recargar.

## 3. Cierre de la suite

- [x] 3.1 Correr `cd server && npm test` y verificar **21/21** archivos verdes.
- [x] 3.2 Verificar que no quedan referencias a "20 archivos" ni `count === 20` en los archivos de guarda.
- [x] 3.3 Confirmar que el cambio no toca `server.js`, `zombie.js`, `admin-auth.js`, `skins.js` (fuente de `server/`), `bot/`, `docker-compose.yml` ni `AGENTS.md`. (Los archivos de `server/test/` y `server/package.json` se actualizan según lo exige el conteo de la suite en el ítem 1.4.)

## Workflow follow-up

- Levantar Docker con `docker compose up --build -d` y pedir aprobación explícita del usuario en http://localhost:3000. Probar:
  - Menú de pausa → Configuración aparece y se oculta.
  - Slider de sensibilidad: el ratón gira más rápido/lento.
  - Slider de brillo: las noches se ven más claras al subir.
  - Select de calidad: 3 opciones, la super optimizada reduce sombras/antialias/niebla.
  - Recargar la página: las preferencias persisten.
- Al aprobar: `docker compose down`, commit en español (`feat(ui):`), push a `main` y `openspec archive menu-configuracion`.
