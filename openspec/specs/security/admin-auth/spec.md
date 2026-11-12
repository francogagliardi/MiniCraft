# security/admin-auth Specification

## Purpose

Define el retiro de la autenticación de admin por clave compartida: el server ya no usa `ADMIN_KEY` ni `ADMIN_KEY_HASH` y los privilegios de admin se derivan del rol de una cuenta con sesión (ver `security/auth`). Queda acá únicamente el comportamiento de compatibilidad: ignorar la configuración legacy y avisar de la migración sin exponer sus valores en los logs.

## Requirements

### Requirement: Retiro de la configuración legacy de admin

El server MUST NOT usar `ADMIN_KEY` ni `ADMIN_KEY_HASH` para autenticar a nadie. Si cualquiera de las dos está presente al arrancar, SHALL ignorarla, SHALL registrar una advertencia de migración una sola vez por proceso y MUST NOT incluir el valor en el log.

#### Scenario: Arranque con variables legacy

- **WHEN** el server arranca con `ADMIN_KEY` o `ADMIN_KEY_HASH` configuradas
- **THEN** el modo admin no se habilita por esa vía y el log indica que deben removerse y usar usuarios con rol admin

#### Scenario: Configuración legacy y usuario admin conviven

- **WHEN** existen las variables legacy y además una cuenta con rol admin
- **THEN** solo la cuenta con rol admin puede entrar como admin

#### Scenario: El valor legacy nunca se loguea

- **WHEN** el server arranca con una clave legacy
- **THEN** la salida de consola no contiene ni la clave ni el hash
