# Spec Delta

## MODIFIED Requirements

### Requirement: Aspecto declarado por el jugador y difundido por el protocolo

El sistema SHALL conocer el aspecto (`skin`) de cada jugador a partir del perfil de su cuenta autenticada y SHALL difundirlo al resto de las conexiones al presentarlo y en su estado periódico, de modo que todos los clientes dispongan del dato antes de dibujar su avatar remoto. El cliente SHALL resolver el valor recibido contra el catálogo de aspectos y SHALL usar `human` cuando falte, sea inválido o no exista en el catálogo. El campo `skin` que envíe el cliente para su propia identidad MUST ignorarse.

#### Scenario: Un jugador que entra ya ve el aspecto de los demás

- **WHEN** un jugador se conecta con una sesión válida y otros ya tienen un skin de perfil
- **THEN** ve el aspecto de cada uno sin esperar a que lo vuelvan a declarar

#### Scenario: El aspecto llega también en el estado periódico

- **WHEN** un jugador existente emite su estado periódico
- **THEN** ese estado sigue incluyendo el aspecto de su perfil

#### Scenario: Sin aspecto declarado se usa el avatar por defecto

- **WHEN** el perfil no tiene un skin válido o la conexión es de un bot sin skin conocido
- **THEN** su avatar remoto se dibuja con el modelo humano por defecto

#### Scenario: Un aspecto nuevo llega a clientes viejos

- **WHEN** un cliente que solo conoce `human` y `robot` recibe un aspecto nuevo como `giant`
- **THEN** sigue funcionando sin errores y dibuja su avatar por defecto

#### Scenario: El cliente no puede imponer su propio aspecto

- **WHEN** un cliente envía en su `hello` un `skin` distinto al guardado en su perfil
- **THEN** los demás jugadores reciben el skin del perfil y no el enviado por el cliente
