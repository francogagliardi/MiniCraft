# Spec Delta

## ADDED Requirements

### Requirement: Hora de Argentina en los logs de conexión del server

El server SHALL prefijar cada log de consola de **unión** y de **salida** de jugador con la hora local de Argentina en formato `[HH:MM]` (24 h, sin segundos) al **inicio** del mensaje, correspondiente a la zona `America/Argentina/Buenos_Aires`, y SHALL conservar **intacto** el texto original del mensaje detrás del prefijo. El prefijo SHALL NOT depender de la zona horaria del proceso ni de la env var `TZ`.

#### Scenario: Unión de un jugador

- **WHEN** un jugador se une al mundo
- **THEN** el log de consola empieza con `[HH:MM] ` y a continuación el texto original `➕ <nombre> (<modo>) — <N> conectados`, sin alterarlo

#### Scenario: Salida de un jugador

- **WHEN** un jugador se desconecta y el server lo quita de la lista de conectados
- **THEN** el log de consola empieza con `[HH:MM] ` y a continuación el texto original `➖ <nombre> — <N> conectados`, sin alterarlo

#### Scenario: La hora es la de Argentina aunque el contenedor corra en otra zona

- **WHEN** el proceso corre con el reloj del sistema en una zona distinta a la de Argentina (por ejemplo UTC) en un instante conocido
- **THEN** el prefijo `[HH:MM]` refleja la hora de Argentina de ese instante y no la de la zona del contenedor
