# Spec Delta

## ADDED Requirements

### Requirement: Autorización de las rutas de bots

Todas las rutas `/api/admin/bots*` SHALL exigir una sesión válida con `role=admin` y MUST responder `401 unauthorized` sin sesión y `403 admin_required` con rol `user`. Las respuestas MUST llevar `Cache-Control: no-store` y MUST NOT exponer datos de bots a quien no es admin.

#### Scenario: Sin sesión

- **WHEN** un visitante sin cookie llama `GET /api/admin/bots`
- **THEN** recibe `401 unauthorized` y ningún dato de bots

#### Scenario: Usuario común

- **WHEN** un usuario con rol `user` intenta listar, crear, editar, lanzar, detener o borrar un bot
- **THEN** recibe `403 admin_required` y la operación no tiene efecto

#### Scenario: Admin autenticado

- **WHEN** un admin autenticado llama cualquier ruta de bots
- **THEN** la petición se procesa y la respuesta lleva `Cache-Control: no-store`

#### Scenario: Sin caché intermedia

- **WHEN** un proxy inspecciona una respuesta de bots
- **THEN** encuentra `Cache-Control: no-store` y no la almacena

### Requirement: Protección de escritura de la API de bots

Las rutas de escritura de bots SHALL exigir `application/json`, `Origin` o `Referer` del mismo host, un cuerpo máximo de 8 KB y el bucket de rate limit administrativo. Al agotarse el límite MUST responder `429 rate_limited` sin crear, editar, lanzar, detener ni borrar nada.

#### Scenario: Origin ajeno

- **WHEN** llega un `POST /api/admin/bots` con `Origin: https://otro-sitio.example`
- **THEN** la respuesta es `403` y no se crea el bot

#### Scenario: Content-Type incorrecto

- **WHEN** una escritura usa `text/plain` o un formulario clásico
- **THEN** la respuesta es `415` y no se procesa

#### Scenario: Cuerpo demasiado grande

- **WHEN** el cuerpo supera 8 KB
- **THEN** la respuesta es `413` y no se crea ni modifica nada

#### Scenario: Ráfaga de acciones

- **WHEN** una IP supera el límite del bucket administrativo
- **THEN** los pedidos siguientes reciben `429` sin tocar bots ni auditoría

#### Scenario: Base caída

- **WHEN** la base no responde durante una acción de bots
- **THEN** la respuesta es `503 unavailable` y no se asume éxito

### Requirement: Rechazos de bots sin efectos parciales

Un rechazo por cupo, nombre duplicado, bot activo o validación SHALL dejar la base y el runtime exactamente como estaban y SHALL auditarse cuando corresponda, sin activar un bot a medias ni dejarlo en el roster.

#### Scenario: Cupo agotado

- **WHEN** el lanzamiento responde `409 bot_limit_reached`
- **THEN** el bot sigue inactivo, no aparece en el roster y no se consumió cupo

#### Scenario: Nombre duplicado

- **WHEN** el alta responde `409 bot_name_taken`
- **THEN** no queda ninguna fila nueva ni un bot a medio crear

#### Scenario: Borrado de un bot activo

- **WHEN** el borrado responde `409 bot_active`
- **THEN** el bot sigue funcionando y su configuración no cambió
