# ui/hud Specification

## Purpose
Define el indicador opcional de FPS y ping del HUD: qué muestra, cómo se calcula la tasa de frames sin trabajo de DOM por frame, cómo se habilita y persiste desde ajustes, y qué se muestra cuando no hay una medición de latencia válida.

## Requirements

### Requirement: Indicador de FPS y ping en el HUD

El sistema SHALL mostrar, cuando el jugador lo habilita, un indicador `#perf` `position:fixed` arriba a la izquierda, debajo del logo de la topbar, con `pointer-events:none` y `z-index` menor que los overlays, en una sola línea con el formato `FPS <n> · Ping <n> ms`. El sistema SHALL NOT usar el id `#stats`, ya ocupado por el contenedor de pills de la topbar, y SHALL NOT tapar el logo, las pills ni la lista de jugadores.

#### Scenario: Indicador visible al habilitarlo
- **WHEN** el jugador activa "Mostrar FPS y ping" en ajustes
- **THEN** aparece una línea `FPS 60 · Ping 24 ms` (con los valores reales) arriba a la izquierda, debajo del logo

#### Scenario: Indicador oculto por defecto
- **WHEN** un jugador entra al juego sin haber habilitado el indicador
- **THEN** no se muestra `#perf` y el HUD queda como antes

#### Scenario: El indicador no intercepta la interacción
- **WHEN** el jugador hace click, mira con el mouse o usa el joystick táctil sobre la zona del indicador
- **THEN** el evento llega al juego como si el indicador no estuviera, porque `#perf` tiene `pointer-events:none`

#### Scenario: Los overlays siguen por encima
- **WHEN** el jugador abre la pausa, el inventario o la pantalla de muerte
- **THEN** el overlay tapa el indicador, porque su `z-index` es mayor que el del HUD

### Requirement: Cálculo de FPS con actualización acotada

El sistema SHALL calcular los FPS en el loop principal contando frames en una ventana de 0.5 s y suavizando el valor entre ventanas, y SHALL actualizar el texto del indicador como máximo una vez por ventana y solo cuando cambió el valor mostrado. El sistema SHALL NOT asignar `textContent` en cada frame ni ejecutar trabajo de DOM cuando el indicador está oculto.

#### Scenario: Valor estable y legible
- **WHEN** el juego corre a una tasa estable
- **THEN** el FPS mostrado se actualiza unas dos veces por segundo y no salta entre valores vecinos por el ruido de un frame suelto

#### Scenario: Sin escrituras por frame
- **WHEN** el indicador está visible y el valor no cambió desde la última ventana
- **THEN** el sistema no vuelve a asignar `textContent`

#### Scenario: Sin trabajo de DOM con el indicador oculto
- **WHEN** el indicador está deshabilitado
- **THEN** el loop puede seguir contando frames, pero no escribe en `#perf` ni lo muestra

### Requirement: Persistencia y aplicación en caliente del toggle

El sistema SHALL leer la visibilidad del indicador de `localStorage` (`mc-stats`) al arranque y SHALL guardar cada cambio inmediatamente. El toggle SHALL ser un checkbox con `label` asociado, SHALL aplicar el cambio en el mismo evento y SHALL NOT requerir recargar la página. Un valor ausente o inválido SHALL equivaler a oculto.

#### Scenario: Se aplica en caliente
- **WHEN** el jugador marca o desmarca "Mostrar FPS y ping"
- **THEN** el indicador aparece o desaparece inmediatamente, sin recargar

#### Scenario: Se recuerda entre recargas
- **WHEN** el jugador habilita el indicador y recarga la página
- **THEN** el indicador vuelve a mostrarse y el checkbox queda marcado

#### Scenario: Valor guardado inválido
- **WHEN** `localStorage` guarda un valor distinto de `'1'` o `'0'` en `mc-stats`
- **THEN** el sistema arranca con el indicador oculto y no falla

### Requirement: Estados sin medición y modo solo

El sistema SHALL mostrar `—` en el ping cuando no haya una medición válida: al arrancar, en modo solo (sin servidor), al vencer el timeout sin `pong` o al cerrarse la conexión. El FPS SHALL seguir midiéndose y mostrándose en modo solo.

#### Scenario: Modo solo sin servidor
- **WHEN** el jugador juega en modo solitario y habilita el indicador
- **THEN** ve `FPS <n> · Ping —`, sin que se envíe ningún `ping`

#### Scenario: Timeout sin respuesta
- **WHEN** el cliente envió un `ping` y no llega el `pong` en el tiempo de timeout
- **THEN** el ping visible pasa a `—` y no se muestra el último valor como si fuera actual

#### Scenario: Desconexión del servidor
- **WHEN** la conexión WebSocket se cierra
- **THEN** el ping visible pasa a `—`

#### Scenario: Reconexión o primer `pong`
- **WHEN** llega un `pong` válido después de un `—`
- **THEN** el ping visible vuelve a mostrar el valor medido en milisegundos
