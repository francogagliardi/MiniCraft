# Spec Delta

## MODIFIED Requirements

### Requirement: Spawn y ambiente escalados a 208

El spawn inicial (junto a las casas desplazadas, `(128.5,·,136.5)`) y `findSpawn` (búsqueda desde el centro `(104,·,104)`), los animales, las nubes/polen, el sol y su frustum de sombras, y la niebla SHALL cubrir el mundo de 208; todo muestreo de terreno SHALL usar coords de mundo (`hAt(x-OX,z-OZ)` con `OX=OZ=48`). Cada animal generado SHALL aparecer sobre pasto con su columna libre (celdas `h+1..h+2` en aire) y sin colisión de cuerpo antes de ser aceptado.

#### Scenario: Spawn en el centro nuevo

- **WHEN** un jugador nuevo conecta o cae del mundo
- **THEN** aparece sobre tierra firme cerca de las casas (spawn inicial) o del centro de 208 (respawn), nunca dentro de un árbol ni bajo el agua

#### Scenario: Sombras y niebla cubren el mundo

- **WHEN** el jugador mira de un borde al opuesto en el mundo de 208
- **THEN** las sombras se proyectan en todo el rango visible y la niebla lejana no recorta el terreno nuevo

#### Scenario: Animales con columna libre

- **WHEN** el sistema genera un animal (inicial o re-spawn) sobre pasto con `h > WATER_Y+1`
- **THEN** solo acepta el punto si las celdas `h+1..h+2` están en aire y `collidesAt` confirma que el cuerpo no colisiona; en caso contrario sigue buscando otro punto
