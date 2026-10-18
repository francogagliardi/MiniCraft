# Spec Delta

## ADDED Requirements

### Requirement: Hora de Argentina en el log de golpe del bot

El bot SHALL prefijar su log de consola de **cada golpe** con la hora local de Argentina en formato `[HH:MM]` (24 h, sin segundos) al **inicio de la línea de consola** —sin ningún tag ni texto delante—, correspondiente a la zona `America/Argentina/Buenos_Aires`, y SHALL conservar **intacto** el texto original del mensaje detrás del prefijo. El prefijo SHALL NOT depender de la zona horaria del proceso ni de la env var `TZ`.

#### Scenario: Golpe a una presa

- **WHEN** el bot ejecuta un ataque contra una presa dentro de alcance
- **THEN** el log de consola empieza con `[HH:MM] ` y a continuación el texto original `⚔️  golpe a <nombre> (d=<dist>, seq=<seq>)`, sin alterarlo

#### Scenario: El logger por defecto no antepone ningún tag

- **WHEN** el bot corre con su **logger por defecto** (sin `log` inyectado) y loguea un golpe
- **THEN** la línea de consola empieza con `[HH:MM] ` (el `[HH:MM]` es el primer carácter de la línea) y **no** lleva ningún tag —como `[bot]`— delante

#### Scenario: La hora es la de Argentina aunque el contenedor corra en otra zona

- **WHEN** el proceso del bot corre con el reloj del sistema en una zona distinta a la de Argentina (por ejemplo UTC) en un instante conocido
- **THEN** el prefijo `[HH:MM]` refleja la hora de Argentina de ese instante y no la de la zona del contenedor
