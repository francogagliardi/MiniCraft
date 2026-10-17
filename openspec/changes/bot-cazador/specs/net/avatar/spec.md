# Spec Delta

## ADDED Requirements

### Requirement: Aspecto declarado por el jugador y difundido por el protocolo

El sistema SHALL conocer el aspecto (`skin`) declarado por cada jugador al entrar y SHALL difundirlo al resto de las conexiones al presentarlo y en su estado periódico, de modo que todos los clientes dispongan del dato antes de dibujar su avatar remoto.

#### Scenario: Un jugador que entra ya ve el aspecto de los demás

- **WHEN** un jugador se conecta y otros ya declararon su aspecto
- **THEN** ve el aspecto de cada uno sin esperar a que lo vuelvan a declarar

#### Scenario: El aspecto llega también en el estado periódico

- **WHEN** un jugador existente emite su estado periódico
- **THEN** ese estado sigue incluyendo su aspecto declarado

#### Scenario: Sin aspecto declarado se usa el avatar por defecto

- **WHEN** un jugador no declara ningún aspecto (o manda un valor desconocido)
- **THEN** su avatar remoto se dibuja con el modelo humano por defecto

### Requirement: Avatar remoto con variante robot humanoide

Cuando el aspecto declarado es `robot`, el sistema SHALL dibujar el avatar remoto como un robot humanoide metálico con ojos brillantes y antena, con el mismo estilo low-poly del resto de los modelos del juego, conservando el comportamiento del avatar remoto (posición, orientación, vida y arma en mano).

#### Scenario: El bot se ve como robot

- **WHEN** un jugador con aspecto `robot` está presente
- **THEN** su avatar remoto se dibuja como robot humanoide (cuerpo metálico, ojos brillantes y antena) en lugar del modelo humano

#### Scenario: El robot conserva el resto del comportamiento del avatar

- **WHEN** el avatar robot se mueve, mira, muere o lleva un arma
- **THEN** se suaviza, orienta, se desploma y muestra el arma igual que cualquier otro avatar remoto

#### Scenario: Un cliente que ignora el aspecto no se rompe

- **WHEN** un cliente que no entiende el campo `skin` recibe el estado de un jugador con aspecto `robot`
- **THEN** sigue funcionando con normalidad y muestra su avatar por defecto, sin errores
