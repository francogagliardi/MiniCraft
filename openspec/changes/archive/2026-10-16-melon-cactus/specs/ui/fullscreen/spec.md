# Spec Delta

## Purpose

Define la visibilidad del botón de pantalla completa en PC sin romper el layout táctil.

## ADDED Requirements

### Requirement: btnFull visible en PC con el mismo Fullscreen API

El sistema SHALL mostrar el pill `btnFull` en la topbar tanto en PC como en táctil (sin clase `only-touch`), manteniendo su handler existente hacia `toggleFull()` (entra/sale de fullscreen según `document.fullscreenElement`).

#### Scenario: Botón visible y funcional en PC

- **WHEN** se juega en PC (sin `body.touch`)
- **THEN** `btnFull` es visible en la topbar y al pulsarlo entra/sale de pantalla completa vía `toggleFull()`

#### Scenario: Táctil intacto

- **WHEN** se juega en táctil (`body.touch`)
- **THEN** `btnFull` sigue visible con tamaño `.pill` táctil, `btnShadow` conserva `only-touch` y el resto del layout táctil no cambia

### Requirement: Atajo de teclado P para pantalla completa

El sistema SHALL alternar pantalla completa con la tecla `P` en PC (mismo `toggleFull()` del botón), con guarda `!dead`, activa en `state` `play`/`pause`/`inv`, sin interferir con la escritura en el chat (`INPUT`/`TEXTAREA`).

#### Scenario: P alterna fullscreen en juego

- **WHEN** se presiona `P` en `play`, `pause` o `inv` (vivo, foco fuera del chat)
- **THEN** se invoca `toggleFull()` (entra/sale según `document.fullscreenElement`)

#### Scenario: P no interfiere con chat ni muerte

- **WHEN** se presiona `P` escribiendo en el chat o con `dead===true`
- **THEN** no se invoca `toggleFull()`

#### Scenario: Ayuda visible documenta P

- **WHEN** se lee `#hint`, el menú `.controls` o el `title` de `btnFull`
- **THEN** mencionan `P` como atajo de pantalla completa
