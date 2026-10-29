# Spec Delta

## ADDED Requirements

### Requirement: Aspecto del bot configurable por `BOT_SKIN`

El bot SHALL tomar su aspecto de la variable de entorno `BOT_SKIN`, con `robot` como valor por defecto cuando la variable falte o esté vacía, y SHALL NOT restringir los valores a una whitelist propia: cualquier valor saneable se envía tal cual y el cliente decide cómo dibujarlo.

#### Scenario: Default robot sin variable

- **WHEN** el bot arranca sin `BOT_SKIN`
- **THEN** se presenta con `skin: 'robot'` en su `hello`

#### Scenario: La variable elige otro aspecto

- **WHEN** el bot arranca con `BOT_SKIN=giant`
- **THEN** se presenta con `skin: 'giant'` en su `hello` y los demás lo dibujan como gigante

#### Scenario: Un valor desconocido no rompe el bot

- **WHEN** el bot arranca con un `BOT_SKIN` que el cliente no conoce
- **THEN** el bot se conecta y juega con normalidad, y el cliente lo dibuja con el aspecto humano por defecto

#### Scenario: El aspecto se reenvía al reconectar

- **WHEN** el bot pierde la conexión y se reconecta
- **THEN** el nuevo `hello` vuelve a llevar el mismo aspecto configurado

## MODIFIED Requirements

### Requirement: Aspecto de robot humanoide

El bot SHALL presentarse ante el resto de los jugadores declarando su aspecto en el `hello`, con `robot` como aspecto por defecto, de modo que los demás clientes lo rendericen con ese modelo en vez del avatar humano. Cuando el aspecto configurado sea `robot`, el modelo SHALL ser el robot humanoide existente.

#### Scenario: Los demás lo ven como robot

- **WHEN** el bot entra al mundo
- **THEN** su conexión queda marcada con `skin: 'robot'` y los demás jugadores lo reciben así en la lista de conectados

#### Scenario: Un cliente que ignora el aspecto no se rompe

- **WHEN** un cliente que no entiende el campo `skin` convive con el bot
- **THEN** sigue funcionando con normalidad mostrando el avatar por defecto, sin errores
