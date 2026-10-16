# Spec Delta

## Purpose

Define las dimensiones canónicas del mundo Minicraft (208×208×40), cómo se indexan los voxels, cómo se migran los edits guardados entre tamaños y cómo se invalidan los guardados locales incompatibles.

## ADDED Requirements

### Requirement: Dimensiones del mundo 208

El mundo SHALL tener W=208, H=40 y tamaño de chunk CH=16, es decir 13×13 chunks que cubren el mundo exacto sin resto.

#### Scenario: Cobertura exacta por chunks

- **WHEN** el cliente genera o renderiza el mundo
- **THEN** 13 chunks de 16 cubren las 208 celdas de cada eje horizontal sin solape ni hueco

#### Scenario: Altura invariante

- **WHEN** se genera el terreno
- **THEN** la altura máxima sigue acotada por H=40 como antes del cambio

### Requirement: Indexación de voxels con stride 208

El índice lineal de un voxel SHALL ser `(y*208+z)*208+x`, y toda lectura/escritura dentro de bordes SHALL usar ese stride; las coordenadas fuera de `[0,208)×[0,40)×[0,208)` SHALL rechazarse.

#### Scenario: Escritura y lectura consistentes

- **WHEN** un jugador edita el bloque `(x,y,z)` dentro de bordes
- **THEN** el valor queda visible en esa misma coordenada tras recargar y se replica a los demás jugadores

#### Scenario: Edición fuera de bordes rechazada

- **WHEN** llega un edit con `x` o `z` ≥ 208 (o negativos), `y` fuera de `[0,40)`, o `v` fuera de rango
- **THEN** el servidor lo descarta sin guardarlo ni replicarlo

### Requirement: Seed invariante bajo el mundo viejo (offset 48)

Con el mismo seed, el terreno generado en el rectángulo de array `[48,208)×[48,208)` SHALL ser idéntico al generado antes de la migración en `[0,160)×[0,160)`; las celdas nuevas `[0,48)` (tierra al NORTE/OESTE) se generan con la misma función de ruido extendida a coords de mundo negativas.

#### Scenario: Zona vieja idéntica

- **WHEN** se genera el mundo con el seed del VPS tras migrar
- **THEN** cada columna de array `(ax,az)` con `ax,az≥48` tiene la misma altura y capas que la columna `(ax-48,az-48)` antes del cambio

#### Scenario: Zona vieja idéntica

- **WHEN** se genera el mundo con el seed del VPS tras migrar
- **THEN** cada columna de array `(ax,az)` con `ax,az≥48` tiene la misma altura y capas que la columna `(ax-48,az-48)` antes del cambio

### Requirement: Migración de edits 160→208

Cada edit `[i,v]` con índice de stride 160 SHALL remapearse a stride 208 con offset 48 mediante `x=i%160, z=((i/160)|0)%160, y=(i/25600)|0 → i'=(y*208+(z+48))*208+(x+48)`; el mundo viejo ocupa el array `48..207` y ningún edit válido queda fuera porque el dominio solo crece hacia el N/O.

#### Scenario: Construcción preservada

- **WHEN** se migra el `world.json` del VPS y se carga en el build nuevo
- **THEN** cada bloque construido por jugadores aparece en `(x+48,y,z+48)` (mundo viejo desplazado al S/E) y con su mismo valor

#### Scenario: Entradas corruptas se saltan

- **WHEN** un edit no es un par `[número, número]` válido
- **THEN** se omite sin interrumpir la carga ni la migración

### Requirement: Guardado local incompatible invalidado

El cliente SHALL usar una clave de localStorage distinta (`minicraft-save-v3`) para que los edits con índices de stride 160 nunca se apliquen sobre el mundo de 208.

#### Scenario: Save viejo ignorado

- **WHEN** un navegador conserva un save `minicraft-save-v2` y carga el build nuevo
- **THEN** no lo lee (empieza del mundo del servidor o genera uno nuevo) en vez de pintar bloques en posiciones corruptas

### Requirement: Versión de cliente visible

El cliente SHALL exponer el sello `v9` en el menú y la pausa para distinguir el build de 208 del anterior.

#### Scenario: Sello visible

- **WHEN** un jugador abre el menú o la pausa
- **THEN** ve el sello `v9` junto al estado de conexión

### Requirement: Spawn y ambiente escalados a 208

El spawn inicial (junto a las casas desplazadas, `(128.5,·,136.5)`) y `findSpawn` (búsqueda desde el centro `(104,·,104)`), los animales, las nubes/polen, el sol y su frustum de sombras, y la niebla SHALL cubrir el mundo de 208; todo muestreo de terreno SHALL usar coords de mundo (`hAt(x-OX,z-OZ)` con `OX=OZ=48`).

#### Scenario: Spawn en el centro nuevo

- **WHEN** un jugador nuevo conecta o cae del mundo
- **THEN** aparece sobre tierra firme cerca de las casas (spawn inicial) o del centro de 208 (respawn), nunca dentro de un árbol ni bajo el agua

#### Scenario: Sombras y niebla cubren el mundo

- **WHEN** el jugador mira de un borde al opuesto en el mundo de 208
- **THEN** las sombras se proyectan en todo el rango visible y la niebla lejana no recorta el terreno nuevo
