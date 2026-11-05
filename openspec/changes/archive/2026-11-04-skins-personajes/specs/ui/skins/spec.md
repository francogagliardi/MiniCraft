# Spec Delta

## MODIFIED Requirements

### Requirement: Selector de aspectos en el menú inicial

El menú inicial SHALL ofrecer un selector con exactamente ocho opciones para jugadores (`human`, `fat`, `giant`, `small`, `zombie`, `mujer`, `moreno`, `gojo`) y SHALL NOT ofrecer `robot` en ese selector. Cada opción SHALL declarar su id en `data-skin` y comportarse como un botón de radio accesible (`role="radio"` con `aria-checked`).

#### Scenario: El menú muestra cinco aspectos

- **WHEN** el jugador abre el menú inicial
- **THEN** ve las cinco opciones históricas (humano, gordo, gigante, pequeño y zombie) y, además, las tres nuevas, ocho en total

#### Scenario: Los tres personajes nuevos son elegibles

- **WHEN** el jugador recorre las opciones del selector
- **THEN** encuentra `mujer` (etiqueta `Mujer`), `moreno` (etiqueta `Piel oscura`) y `gojo` (etiqueta `Gojo`) como opciones elegibles, con su etiqueta visible y su botón de radio accesible como el resto

#### Scenario: El robot no es una opción de jugador

- **WHEN** el jugador recorre las opciones del selector
- **THEN** `robot` no aparece entre ellas
