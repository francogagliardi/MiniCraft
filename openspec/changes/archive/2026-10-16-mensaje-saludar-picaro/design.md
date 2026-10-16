# Design

## Context

Ver `proposal.md` (Why). El saludo vive en `index.html`: `onRightDown()` detecta el avatar con `avatarHit()` (raycast, alcance 4.6) y llama a `greetRemote(a)`, que hoy muestra `💕 ${a.name} te saluda` junto a un burst rosa (`0xff6b9d`, 14 partículas) y un tono (`tone(600,920,.12,'sine',.15)`). Cambio de 1 línea, solo cliente, sin tocar `server/server.js` ni el protocolo.

## Goals / Non-Goals

**Goals:**
- Cambiar únicamente el string del toast al texto pícaro acordado, manteniendo emoji, burst y sonido.

**Non-Goals:**
- No cambiar alcance, detección, red, persistencia ni validación de bloques (W=160 del servidor).
- No agregar configuración, i18n ni variantes aleatorias del mensaje.

## Decisions

- **Editar solo la línea del `toast` dentro de `greetRemote(a)`** (`index.html` ~1615): de `` `💕 ${a.name} te saluda` `` a `` `💕 A ${a.name} le gusta que lo toquen ahí` ``.
  - Alternativa considerada (plantilla con nombre al final): descartada, el texto exacto pedido pone el nombre en el medio.
- **Mantener emoji 💕, burst y tono sin cambios**: el pedido es solo el texto; conservar los efectos evita regresiones visuales/sonoras.
  - Alternativa (quitar emoji o cambiar sonido): descartada por salir del alcance.

## Risks / Trade-offs

- [Riesgo] El tono pícaro puede no gustar a todos los jugadores → Mitigación: cambio de 1 línea, fácil de revertir; sin persistencia afectada.
- [Riesgo] Ninguno técnico: sin cambios en red ni en tests de servidor (`cd server && npm test` debe seguir en verde).
