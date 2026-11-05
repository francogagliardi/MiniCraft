# Spec Delta

## MODIFIED Requirements

### Requirement: Menú de configuración en el menú de pausa

El sistema SHALL mostrar un panel de configuración dentro del overlay `#pause`, accesible desde un botón "⚙️ Configuración", con controles para sensibilidad del mouse, brillo del juego, calidad gráfica y un checkbox "Mostrar FPS y ping", y un botón "Volver" para regresar al menú de pausa principal.

#### Scenario: Panel visible y ocultable
- **WHEN** el jugador está en pausa y pulsa "⚙️ Configuración"
- **THEN** se muestra el panel de configuración y se oculta el menú principal de pausa
- **WHEN** pulsa "Volver"
- **THEN** se oculta el panel y se muestra el menú de pausa principal

#### Scenario: El panel incluye el toggle de FPS y ping
- **WHEN** el jugador abre "⚙️ Configuración"
- **THEN** ve una fila "Mostrar FPS y ping" con un checkbox accesible (`#showStats` con su `label`) además de los controles de sensibilidad, brillo y calidad

### Requirement: Todo en localStorage, sin servidor

El sistema SHALL persistir sensibilidad, brillo, calidad y la visibilidad del indicador de FPS y ping en `localStorage` y SHALL NOT enviar ningún mensaje al servidor como consecuencia de cambiar un ajuste. La medición de latencia es independiente del toggle, corre por su propio temporizador y se define en la capacidad `net/latency`.

#### Scenario: Sin cambios de servidor ni protocolo
- **WHEN** el jugador cambia cualquier ajuste de configuración
- **THEN** solo se escribe en `localStorage` y no se envía ningún mensaje al servidor

#### Scenario: El toggle no genera tráfico propio
- **WHEN** el jugador activa o desactiva "Mostrar FPS y ping"
- **THEN** el indicador aparece o desaparece en el acto, se guarda la preferencia y no se envía ningún mensaje nuevo al servidor por ese cambio
