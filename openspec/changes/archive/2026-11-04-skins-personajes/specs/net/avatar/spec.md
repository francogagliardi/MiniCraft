# Spec Delta

## MODIFIED Requirements

### Requirement: Catálogo de aspectos con altura declarada

El sistema SHALL exponer un catálogo declarativo de nueve aspectos (`human`, `fat`, `giant`, `small`, `zombie`, `robot`, `mujer`, `moreno`, `gojo`) y cada entrada SHALL declarar al menos su etiqueta, su altura total en unidades del mundo y los datos de color o escala que su modelo necesita.

#### Scenario: Los seis aspectos existen

- **WHEN** el cliente resuelve el catálogo de aspectos
- **THEN** encuentra las seis entradas históricas (`human`, `fat`, `giant`, `small`, `zombie`, `robot`) más las tres nuevas (`mujer`, `moreno`, `gojo`): nueve en total, cada una con etiqueta, altura y datos de modelo

#### Scenario: Alturas declaradas

- **WHEN** se consulta la altura de cada aspecto
- **THEN** `human`, `zombie`, `mujer`, `moreno` y `gojo` miden 1.97, `fat` 1.70, `small` 0.90, `robot` 1.90 nominal y `giant` mide exactamente 5.00

#### Scenario: La altura del humano es la del rig real

- **WHEN** se mide el modelo `human` completo (cabellera incluida)
- **THEN** su parte superior queda a 1.97 unidades sobre su base, igual que la constante `BASE_H`

#### Scenario: Los personajes nuevos declaran datos de modelo

- **WHEN** se consulta la entrada de `mujer`, `moreno` o `gojo`
- **THEN** cada una declara etiqueta, altura 1.97, escala 1 y los colores de piel, ropa y pelo que su modelo usa

## ADDED Requirements

### Requirement: Render del aspecto `mujer`

El sistema SHALL dibujar el aspecto `mujer` como un humanoide de 1.97 con silueta femenina: torso más angosto que `human`, pecho marcado del color de la remera, falda visible, pelo largo con melena en la nuca y mechones a los costados, y una paleta fija de pelo y ropa que no depende del id del jugador.

#### Scenario: La mujer se distingue del humano

- **WHEN** un jugador con aspecto `mujer` está presente
- **THEN** su avatar remoto muestra torso angosto, pecho marcado del color de la remera, falda, melena trasera y mechones laterales, con el pelo y la ropa de la paleta del catálogo

#### Scenario: La mujer mide lo mismo que el humano

- **WHEN** se mide el modelo `mujer` completo
- **THEN** su parte superior queda a 1.97 unidades sobre su base, igual que `BASE_H`

#### Scenario: La mujer conserva el resto del comportamiento

- **WHEN** el avatar `mujer` camina, mira, muere o lleva un arma
- **THEN** se anima, orienta, se desploma y muestra el arma igual que cualquier otro avatar remoto, con nombre y barra de vida

### Requirement: Render del aspecto `moreno`

El sistema SHALL dibujar el aspecto `moreno` (etiqueta visible `Piel oscura`) como un humanoide de 1.97 con tono de piel oscuro, pelo corto negro y barba corta, con ropa de paleta fija, sin rasgos faciales exagerados ni accesorios caricaturescos.

#### Scenario: El hombre de piel oscura se distingue del humano

- **WHEN** un jugador con aspecto `moreno` está presente
- **THEN** su avatar remoto muestra el tono de piel oscuro del catálogo, casquete de pelo corto negro y barba corta

#### Scenario: El aspecto conserva el rig humano

- **WHEN** se compara el modelo `moreno` con el `human`
- **THEN** tiene las mismas proporciones (torso, cabeza, brazos y piernas) y la misma altura de 1.97, y sólo cambian los colores y los detalles de pelo y barba

#### Scenario: El moreno conserva el resto del comportamiento

- **WHEN** el avatar `moreno` camina, mira, muere o lleva un arma
- **THEN** se anima, orienta, se desploma y muestra el arma igual que cualquier otro avatar remoto, con nombre y barra de vida

### Requirement: Render del aspecto `gojo`

El sistema SHALL dibujar el aspecto `gojo` como un humanoide de 1.97 con pelo blanco en puntas, una venda negra que cubre la franja de los ojos (sin ojos dibujados) y uniforme oscuro de cuello alto, sin assets externos ni imágenes de la obra.

#### Scenario: La venda cubre los ojos

- **WHEN** un jugador con aspecto `gojo` está presente
- **THEN** su avatar remoto muestra una banda negra que envuelve la cabeza a la altura de los ojos y no se dibujan ojos en el rostro

#### Scenario: El pelo blanco y el uniforme oscuro

- **WHEN** se mira el avatar `gojo` de frente o de espaldas
- **THEN** se ven el pelo claro en puntas y el uniforme oscuro del catálogo, con la venda reconocible también desde atrás por el nudo

#### Scenario: El gojo conserva el resto del comportamiento

- **WHEN** el avatar `gojo` camina, mira, muere o lleva un arma
- **THEN** se anima, orienta, se desploma y muestra el arma igual que cualquier otro avatar remoto, con nombre y barra de vida

### Requirement: Los personajes nuevos conservan la jugabilidad del humano

El sistema SHALL tratar `mujer`, `moreno` y `gojo` como variantes visuales de `human`: altura 1.97, factor de tamaño 1, caja de colisión 0.3 × 1.8, altura de ojos 1.62 y alcances de 8 / 4.6 / 6 sin escalar. El servidor SHALL aplicarles el mismo alcance de espada y de golpe que a `human`.

#### Scenario: La caja y el ojo no cambian

- **WHEN** un jugador elige `mujer`, `moreno` o `gojo` y juega
- **THEN** su caja de colisión es 0.3 × 1.8 y su altura de ojos es 1.62, igual que con `human`

#### Scenario: Los alcances no cambian

- **WHEN** un jugador con uno de los aspectos nuevos rompe o coloca bloques, o golpea a una criatura o a otro jugador
- **THEN** sus alcances son los del humano (8 para bloques, 6 para animales y 4.6 para pelea), sin factor adicional

#### Scenario: El servidor no aumenta el alcance de la espada

- **WHEN** un jugador con uno de los aspectos nuevos golpea a una criatura hostil
- **THEN** el servidor valida el alcance de espada con el mismo valor que para `human`

#### Scenario: Un cliente viejo los dibuja como humano

- **WHEN** un cliente que no conoce los ids `mujer`, `moreno` o `gojo` recibe uno de ellos
- **THEN** dibuja el avatar humano por defecto y la sesión sigue funcionando sin errores
