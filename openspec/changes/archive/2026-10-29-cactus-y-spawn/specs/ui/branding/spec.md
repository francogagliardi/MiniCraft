# Spec Delta

## Purpose

Define el favicon de la pestaña como el logo de Minicraft, sin archivos externos.

## ADDED Requirements

### Requirement: La pestaña muestra el logo de Minicraft

El sistema SHALL declarar un favicon en `index.html` mediante `<link rel="icon" type="image/svg+xml" sizes="any">` con un SVG embebido como data URI que replique el lenguaje visual de `.logo-cube`: cuadrado redondeado, división diagonal con `#8bd450` arriba a la izquierda y `#9a6a45` abajo a la derecha, y un borde interior claro sutil. SHALL NOT requerir un archivo de imagen externo, un cambio de MIME en el servidor ni una ruta nueva.

#### Scenario: Pestaña con el logo

- **WHEN** se abre el juego en un navegador que soporta favicons SVG
- **THEN** la pestaña muestra el cuadrado verde/marrón del logo en lugar del ícono genérico

#### Scenario: Sin assets ni servidor

- **WHEN** se inspecciona el `<head>`
- **THEN** el favicon es un data URI autocontenido y no hay `<link>` a un `.svg`, `.png` o `.ico` externo

#### Scenario: Coincide con la topbar

- **WHEN** se comparan los colores del favicon con `.logo-cube`
- **THEN** ambos usan `#8bd450` y `#9a6a45` y la misma división diagonal

#### Scenario: Los iconos PWA no cambian

- **WHEN** se revisan `manifest` y `apple-touch-icon`
- **THEN** siguen como estaban; este change solo agrega el favicon de la pestaña
