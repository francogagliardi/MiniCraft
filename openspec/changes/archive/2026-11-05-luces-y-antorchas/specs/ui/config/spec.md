# Spec Delta

## MODIFIED Requirements

### Requirement: Tres niveles de calidad gráfica

El sistema SHALL ofrecer tres niveles de calidad gráfica: `0` (super optimizada para 2 núcleos), `1` (baja/rápida) y `2` (alta). SHALL leer el nivel de `localStorage` (`mc-quality`) al arranque y SHALL aplicar pixelRatio, sombras, antialias, distancia de niebla y la cantidad fija de luces dinámicas visibles según el nivel. SHALL guardar cambios inmediatamente en `localStorage`.

#### Scenario: Nivel super optimizada (0)

- **WHEN** el jugador elige calidad 0
- **THEN** pixelRatio = 1, sin sombras, sin antialias, niebla corta, sombras del sol desactivadas y ninguna luz dinámica visible (ni puntos ni spots)

#### Scenario: Nivel baja/rápida (1)

- **WHEN** el jugador elige calidad 1
- **THEN** pixelRatio = 1, sin sombras, sin antialias, niebla normal y como máximo 2 puntos + 2 spots visibles

#### Scenario: Nivel alta (2)

- **WHEN** el jugador elige calidad 2
- **THEN** pixelRatio = devicePixelRatio (máx 1.5), antialias encendido, niebla normal, sombras del sol encendidas y 8 puntos + 8 spots visibles como máximo (las luces dinámicas no proyectan sombra)

#### Scenario: Bajar la calidad apaga las luces

- **WHEN** el jugador pasa de calidad 2 o 1 a calidad 0
- **THEN** todas las luces dinámicas (puntos y spots) se ocultan en el frame siguiente, sin recargar la página ni reiniciar el mundo

#### Scenario: Subir la calidad vuelve a encenderlas

- **WHEN** el jugador pasa de calidad 0 a 1 o 2
- **THEN** se hace visible el set fijo del nuevo nivel (2 + 2 o 8 + 8) y las fuentes cercanas vuelven a encenderse, sin recargar la página

### Requirement: Brillo del juego configurable

El sistema SHALL leer el brillo de `localStorage` (`mc-brightness`) al arranque, con valor por defecto `1.0`, SHALL acotarlo al rango `[1,3]` y SHALL descartar valores no finitos volviendo a `1`. SHALL aplicarlo como una única luz efectiva (`brightLevel`) para las intensidades compartidas por `applyAtmosphere` y `tickSky`, SHALL derivar la paleta de cielo, niebla, fondo y colores del ambiente solo de la fase del ciclo (`paletteFactor`), SHALL exponer un slider de 1.0 a 3.0, SHALL guardar cambios inmediatamente en `localStorage` y SHALL reaplicar la atmósfera en el mismo evento del slider, sin esperar a que cambie la fase del ciclo.

#### Scenario: Brillo aclara las noches

- **WHEN** el jugador sube el brillo por encima de 1.0
- **THEN** las intensidades del ambiente, el sol y la luna se aclaran de inmediato, mientras el cielo, la niebla y el fondo conservan su paleta nocturna, sin llegar nunca a un día pleno

#### Scenario: El brillo no convierte la noche en día

- **WHEN** el jugador pone el brillo al máximo (3.0×) en plena noche
- **THEN** el cielo, la niebla y el fondo siguen viéndose nocturnos: el brillo solo cambia intensidades, no la paleta del ciclo

#### Scenario: Transiciones sin parpadeo

- **WHEN** el ciclo pasa por el atardecer o el amanecer
- **THEN** la luz cambia de forma continua, sin alternar entre dos intensidades (el sol y la atmósfera usan la misma luz efectiva)

#### Scenario: El cambio se ve al instante

- **WHEN** el jugador mueve el slider de brillo en plena noche
- **THEN** la iluminación cambia en el mismo evento, sin esperar al próximo amanecer o atardecer

#### Scenario: Un brillo viejo no lava la noche

- **WHEN** al arrancar `localStorage` guarda un brillo fuera de `[1,3]` o un valor inválido
- **THEN** el sistema lo acota al extremo del rango (o a 1 si no es finito) y la noche se ve con el brillo permitido
