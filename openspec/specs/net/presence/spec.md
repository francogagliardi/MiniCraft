# net/presence Specification

## Purpose
Mantiene la lista de jugadores multijugador libre de fantasmas: detecta conexiones muertas y expira sesiones inactivas para que los demás jugadores dejen de verlas.

## Requirements

### Requirement: Cierre proactivo del cliente al salir

El cliente SHALL cerrar su WebSocket al abandonar la página mediante los eventos `pagehide` y `beforeunload`.

#### Scenario: Salida con flecha atrás

- **WHEN** el jugador abandona la página (flecha atrás, cerrar pestaña o recargar)
- **THEN** el cliente cierra el WebSocket antes de descargar la página y el server difunde `leave` a los demás jugadores.

### Requirement: Heartbeat del server con ping/pong

El server SHALL enviar ping WebSocket cada 30s a cada conexión y MUST cerrar con `terminate()` las que no respondan pong.

#### Scenario: Conexión viva responde pong

- **WHEN** el server envía ping cada 30s a una conexión sana
- **THEN** el cliente responde pong automáticamente y la sesión sigue activa sin efecto visible.

#### Scenario: Conexión muerta sin pong

- **WHEN** una conexión no responde pong al ping de 30s
- **THEN** el server la termina con `terminate()`, elimina al jugador y difunde `leave` a los demás.

### Requirement: Expiración por inactividad sin movimiento

El server SHALL expirar y limpiar toda sesión que no reciba ningún mensaje `mv` durante 90s, difundiendo `leave` como en un cierre normal.

#### Scenario: Jugador AFK largo expira

- **WHEN** un jugador conectado deja de enviar `mv` durante más de 90s
- **THEN** el server cierra su conexión, lo elimina de la lista y difunde `leave` a los demás.

#### Scenario: Jugador lento pero activo no expira

- **WHEN** un jugador envía `mv` al menos una vez cada 90s (el cliente normal lo manda cada 70ms)
- **THEN** su sesión MUST permanecer activa y no recibe ningún cierre forzado.
