# ui/skins Specification

## Purpose
Define la elección del aspecto del jugador en el lobby autenticado entre las ocho opciones de jugador (`human`, `fat`, `giant`, `small`, `zombie`, `mujer`, `moreno`, `gojo`; `robot` queda reservado al bot), su estado visible y accesible, su persistencia en el perfil mediante `PATCH /api/me` (con `localStorage` solo como caché opcional) y la compatibilidad con clientes que ignoran el selector.

## Requirements

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
