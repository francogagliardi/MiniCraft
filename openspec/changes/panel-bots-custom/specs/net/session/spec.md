# Spec Delta

## ADDED Requirements

### Requirement: Bots como entradas de roster

El server SHALL publicar cada bot activo en `welcome.players` y `join` con `bot:true`, un id negativo reservado, `name`, `skin`, `pos`, `yaw`, `hp`, `maxHp` y `dead`, y SHALL difundir `pm` con su posición y vida cuando cambian. Los clientes que no conocen esos campos MUST seguir funcionando sin errores.

#### Scenario: Roster con bot

- **WHEN** un jugador recibe el `welcome` con un bot activo
- **THEN** la entrada del bot trae `bot:true`, id negativo, nombre, skin, vida y `maxHp`

#### Scenario: Bot que aparece y desaparece

- **WHEN** un admin lanza o detiene un bot
- **THEN** los jugadores reciben el `join` o el `leave` correspondiente en el acto

#### Scenario: Actualización de posición y vida

- **WHEN** un bot se mueve o recibe daño
- **THEN** los clientes reciben `pm` con su posición, `hp` y `dead` actuales

#### Scenario: Los ids de bot no chocan con usuarios

- **WHEN** conviven jugadores con ids positivos y bots con ids negativos
- **THEN** el `hit`, el `pm` y el `leave` de cada uno se resuelven sin ambigüedad

#### Scenario: Cliente viejo

- **WHEN** un cliente no conoce `bot` ni `maxHp`
- **THEN** dibuja al bot como un avatar normal y sigue jugando sin errores

### Requirement: El upgrade solo acepta sesión de usuario

El gate del WebSocket SHALL autenticar únicamente la cookie de sesión. Un upgrade con `Authorization: Bearer` MUST rechazarse con `401` aunque exista `BOT_TOKEN` en el entorno, sin crear jugador ni revelar el token.

#### Scenario: Bearer legado

- **WHEN** un cliente envía `Authorization: Bearer <token>` y no trae cookie de sesión
- **THEN** el upgrade se rechaza con `401` y no aparece ningún jugador

#### Scenario: Variable legada seteada

- **WHEN** el server arranca con `BOT_TOKEN` en el entorno
- **THEN** avisa una vez que la variable ya no se usa y no habilita ninguna conexión de servicio

#### Scenario: El token no se filtra

- **WHEN** se rechaza un upgrade con Bearer
- **THEN** ni el token ni el header aparecen en logs

### Requirement: Golpes del jugador a un bot

El server SHALL resolver un `hit` cuyo `id` corresponde a un bot, validar alcance y cadencia, aplicar su propio daño y responder `hitok` con el daño efectivamente aplicado, sin retransmitir `phit` a un socket inexistente. Un bot inmune MUST responder con daño cero.

#### Scenario: Golpe confirmado

- **WHEN** un jugador golpea a un bot vulnerable dentro de alcance
- **THEN** recibe `hitok` con el daño aplicado y los demás clientes ven la vida nueva por `pm`

#### Scenario: Bot inmune

- **WHEN** un jugador golpea a un bot con `takes_damage:false`
- **THEN** recibe `hitok` con `dmg:0` y no aparece número de daño

#### Scenario: Id inexistente

- **WHEN** un jugador golpea a un id negativo que no corresponde a ningún bot activo
- **THEN** el golpe se descarta sin error y sin efectos

## REMOVED Requirements

### Requirement: Credencial de servicio del bot

**Reason**: El bot externo y `BOT_TOKEN` se retiran: los bots son internos y no hay una conexión de servicio que autenticar.

**Migration**: Crear y lanzar bots desde `/admin`. Un cliente que siga usando Bearer recibe `401`; el operador debe detener o borrar la App `minicraft-bot` en Easypanel y quitar `BOT_TOKEN` de los secretos.

### Requirement: Un usuario de sesión no puede declararse bot

**Reason**: Ya no existe ninguna conexión de bot por WebSocket; el flag `bot` solo lo asigna el servidor a sus bots internos y el campo del `hello` se ignora.

**Migration**: No aplica para jugadores: el `hello` sigue sin poder otorgar rol, permisos ni identidad de bot. Los bots del roster son estado del servidor.
