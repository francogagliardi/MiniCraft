# Spec Delta

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Verificación de la clave admin contra un hash

**Reason**: El modo admin deja de autenticarse con una clave compartida; ahora se deriva del rol de una cuenta con sesión.

**Migration**: Crear el admin inicial con `ADMIN_PASSWORD` (bootstrap) o con `server/user-tool.mjs`; el login por usuario y contraseña reemplaza el `hello` con clave.

### Requirement: Costo de verificación acotado y no bloqueante

**Reason**: Ya no hay verificación de clave admin en el `hello`; el costo de autenticación se acota en el login de usuarios.

**Migration**: El rate limit y la cota de derivaciones se aplican a `POST /api/login` según `security/auth`.

### Requirement: El hash guardado no es una credencial usable

**Reason**: El hash de la clave admin desaparece del diseño; las contraseñas de usuario se almacenan con `scrypt` y nunca se comparan como credencial.

**Migration**: Migrar a cuentas con contraseña; ningún hash de configuración vuelve a ser una credencial.

### Requirement: Formato autodescriptivo del hash

**Reason**: El formato `pbkdf2_sha256$...` era exclusivo de la clave admin compartida.

**Migration**: Las contraseñas usan el formato autodescriptivo de `scrypt` definido en `security/auth`.

### Requirement: Precedencia del hash sobre la clave en claro

**Reason**: Ambas variables se retiran; no hay precedencia que resolver.

**Migration**: Remover `ADMIN_KEY` y `ADMIN_KEY_HASH` del entorno y del compose; el server las ignora con un aviso.

### Requirement: Compatibilidad del camino de clave en claro

**Reason**: El camino en claro era solo para desarrollo local y ya no existe autenticación por clave.

**Migration**: En desarrollo, usar una cuenta local creada con `server/user-tool.mjs` o el bootstrap de admin.

### Requirement: Fail closed sin configuración de admin

**Reason**: El fail closed del admin ahora lo garantiza el rol `admin` en la base: sin cuenta admin nadie tiene privilegios.

**Migration**: Configurar `ADMIN_PASSWORD` en el primer arranque o crear un admin con la herramienta; sin eso el juego sigue para usuarios comunes pero sin admins.

### Requirement: Sin clave admin por defecto

**Reason**: Se mantiene el principio, pero la unidad ya no es una clave sino una cuenta; el requisito queda cubierto por `security/auth`.

**Migration**: No existe una cuenta admin por defecto: el bootstrap exige `ADMIN_PASSWORD`.

### Requirement: Validación defensiva del hash configurado

**Reason**: No hay hash de configuración que validar.

**Migration**: La validación de hashes de contraseña corruptos se cubre en `security/auth`.

### Requirement: La clave nunca se registra en logs

**Reason**: Se retira la clave admin; la prohibición de loguear secretos se mantiene para contraseñas y tokens.

**Migration**: `security/auth` exige no registrar contraseñas; `net/session` exige no registrar tokens de sesión ni `BOT_TOKEN`.

### Requirement: Herramienta generadora del hash de admin

**Reason**: Ya no se genera ningún hash de configuración.

**Migration**: `server/user-tool.mjs` reemplaza al generador: crea usuarios, cambia contraseñas y administra cuentas.
