# Spec Delta

## ADDED Requirements

### Requirement: Catálogo de aspectos de jugador en el lobby

El lobby SHALL ofrecer un selector con exactamente ocho opciones de jugador (`human`, `fat`, `giant`, `small`, `zombie`, `mujer`, `moreno`, `gojo`) y MUST NOT ofrecer `robot`, reservado al bot. Cada opción SHALL declarar su id en `data-skin`, comportarse como botón de radio accesible (`role="radio"`, `aria-checked`) y tener como mínimo 44 px de alto.

#### Scenario: El lobby muestra ocho aspectos

- **WHEN** el jugador autenticado abre el lobby
- **THEN** ve las ocho opciones de jugador y ninguna opción `robot`

#### Scenario: La opción elegida se marca

- **WHEN** el lobby muestra el skin guardado `fat`
- **THEN** la opción `fat` aparece como seleccionada y las demás no

#### Scenario: Navegación accesible

- **WHEN** el jugador recorre el selector con teclado o lector de pantalla
- **THEN** cada opción anuncia su etiqueta y si está seleccionada

### Requirement: Aclaraciones del selector

El lobby SHALL aclarar que el aspecto define cómo ven al jugador los demás, que su tamaño cambia altura de ojos, caja de colisión y alcances, y que en primera persona no ve su propio modelo. La aclaración MUST NOT prometer que el aspecto cambia velocidad, salto, vida o daño.

#### Scenario: Aclaración de alcance visible

- **WHEN** el jugador lee el lobby
- **THEN** encuentra que el aspecto es cómo lo ven los demás y que el tamaño afecta ojo, caja y alcances

#### Scenario: Sin promesas falsas

- **WHEN** el jugador compara la aclaración con el comportamiento del juego
- **THEN** la velocidad, el salto, la vida y el daño son los mismos para todos los aspectos

### Requirement: Persistencia del aspecto en el perfil

El sistema SHALL guardar el aspecto elegido en el perfil del usuario mediante `PATCH /api/me` y SHALL restaurarlo al abrir el lobby en cualquier dispositivo. `localStorage` MAY usarse solo como caché visual y MUST NOT ser la fuente de verdad ni pisar el perfil del server.

#### Scenario: La elección sobrevive a otro dispositivo

- **WHEN** el jugador elige `giant` en un navegador y abre el lobby en otro con la misma cuenta
- **THEN** el selector muestra `giant` porque viene del perfil

#### Scenario: Fallo al guardar

- **WHEN** `PATCH /api/me` falla por red o por sesión expirada
- **THEN** el lobby avisa que no se guardó y no muestra el skin como confirmado

#### Scenario: Un valor viejo de localStorage no pisa el perfil

- **WHEN** `localStorage` guarda un skin distinto al del perfil
- **THEN** el lobby muestra y usa el skin del perfil

### Requirement: Aspecto por defecto `human`

El sistema SHALL usar `human` cuando la cuenta no tenga un skin válido guardado o cuando el valor almacenado no pertenezca al catálogo de jugador.

#### Scenario: Cuenta nueva

- **WHEN** una cuenta recién creada abre el lobby
- **THEN** el selector arranca en `human`

#### Scenario: Valor inválido en la base

- **WHEN** el perfil tiene un skin que no está en el catálogo
- **THEN** el sistema resuelve a `human` sin errores y ofrece corregirlo en el lobby

### Requirement: Compatibilidad con clientes que ignoran el selector

El sistema SHALL NOT romper la partida cuando el cliente no dibuje el selector o no entienda el campo `skin`; el server SHALL asignar igualmente un aspecto válido del perfil y difundirlo.

#### Scenario: Cliente viejo entra con cuenta válida

- **WHEN** un cliente sin selector de lobby se conecta con una sesión válida
- **THEN** juega con el skin del perfil o `human` por defecto, sin errores

#### Scenario: Aspecto desconocido en un cliente viejo

- **WHEN** un cliente que no conoce un aspecto recibe ese valor
- **THEN** dibuja el avatar humano por defecto y la sesión sigue funcionando

## REMOVED Requirements

### Requirement: Selector de aspectos en el menú inicial

**Reason**: El menú inicial del juego se reemplaza por login → lobby; la elección de aspecto se muda al lobby autenticado.

**Migration**: Usar el selector de `/lobby`; el juego ya no muestra el selector.

### Requirement: Estado seleccionado visible y aclaración de alcance

**Reason**: Se reescribe junto con el selector del lobby, conservando la aclaración y agregando accesibilidad y tamaño táctil.

**Migration**: El nuevo requisito "Aclaraciones del selector" cubre la aclaración en el lobby.

### Requirement: El aspecto por defecto del menú es `human`

**Reason**: El menú inicial deja de existir; el valor por defecto pasa a depender del perfil.

**Migration**: El nuevo requisito "Aspecto por defecto `human`" aplica al perfil y al lobby.

### Requirement: Persistencia del aspecto en localStorage

**Reason**: `localStorage` no permite compartir el aspecto entre dispositivos ni lo vuelve server-authoritative.

**Migration**: El aspecto se guarda con `PATCH /api/me` en el perfil; `localStorage` queda como caché opcional.

### Requirement: El aspecto elegido viaja en el `hello`

**Reason**: El server ahora impone el skin del perfil e ignora el campo `skin` del cliente para la identidad propia.

**Migration**: El cliente y el bot siguen enviando `skin` por compatibilidad, pero su valor se ignora para usuarios de sesión.

### Requirement: Un cliente que ignora el selector sigue funcionando

**Reason**: Se reemplaza por una versión que cubre clientes sin lobby y aspectos desconocidos.

**Migration**: El nuevo requisito "Compatibilidad con clientes que ignoran el selector" mantiene la garantía.
