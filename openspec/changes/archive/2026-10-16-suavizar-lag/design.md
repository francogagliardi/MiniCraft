# Design

## Context

Ver proposal.md (Why). Estado actual: `tickAvatar` (index.html:1689) interpola `g.position` hacia `target` con `lerp(dt*10)` sin umbral de distancia; el handler de `pm` (index.html:2086) asigna `a.target` directamente desde `m.p` y `a.yaw=m.yaw` sin dead-reckoning ni buffer; el handler de `pedit` (index.html:2090) aplica `rawSet` sin chequear si el jugador local queda dentro del bloque nuevo. El servidor (`server/server.js`) no se toca.

## Goals / Non-Goals

**Goals:**
- Suavizar el movimiento de avatares remotos con lag: snap directo si dist>6, lerp si no, sin saltos de posición.
- Interpolar el yaw del avatar remoto de forma estable hacia el yaw del `pm`.
- Opcional: buffer de 100ms en `pm` para suavizar ráfagas.
- Que ningún `pedit` remoto deje al jugador local dentro de un bloque (sacarlo fuera si colisiona).

**Non-Goals:**
- Eliminar el lag completamente: registrado como mitigación, no eliminación (con lag real no se puede solucionar del todo).
- Cambios en el servidor ni en el protocolo (`pm` y `pedit` mantienen su forma).
- Dead-reckoning completo del lado del cliente (fuera de scope; se documenta como limitación).

## Decisions

### 1. Umbral de teleport: dist > 6 → snap directo
Por qué: evita que ráfagas de `pm` atrasadas muevan al avatar suavemente a lo largo de toda la distancia acumulada. 6 unidades es suficientemente grande para no snapear en movimiento normal (un paso de jugador es ~1 unidad) pero lo bastante pequeño para cortar los teletransportes de lag.
Alternativa descartada: sin umbral (comportamiento actual, genera los saltos reportados). Umbral menor (1-2) snappearía demasiado seguido en movimiento normal.

### 2. Lerp acotado solo si dist <= 6
Por qué: conserva la suavidad actual para movimientos pequeños y cortos (el caso común) y solo desactiva el lerp cuando el salto es grande por lag.

### 3. Interpolación de yaw hacia el yaw del `pm`
Por qué: el modelo mira hacia +Z y la cámara hacia −H (hay que sumar π); interpolar suavemente evita giros bruscos. Se reutiliza el patrón de normalización de ángulo ya presente en `tickAvatar`.

### 4. Buffer opcional de 100ms en `pm`
Por qué: agrupa ráfagas de `pm` y reduce saltos perceptibles. Es opcional por incertidumbre del beneficio frente a la latencia añadida; se activa o desactiva sin cambiar el protocolo.

### 5. Pedit: sacar al jugador local fuera en vez de dejarlo dentro
Por qué: una edición remota que coloque un bloque sobre el jugador local no debe atraparlo. Resolver la colisión empujando hacia fuera es menos disruptivo que dejarlo dentro (imposible de mover) o rechazar la edición (que afectaría al remoto).

## Risks / Trade-offs

- [Lag real no eliminable] Con lag muy alto el avatar seguirá saltando ocasionalmente → Mitigación: documentado explícitamente como mitigación, no eliminación; el umbral de 6 corta la mayoría de saltos.
- [Buffer de 100ms añade latencia] Puede hacer que los remotos se vean ligeramente retrasados → Mitigación: opcional y desactivable; 100ms es imperceptible en la mayoría de redes.
- [Pedit saca al jugador de su lugar] Puede mover al jugador local contra su voluntad → Mitigación: solo ocurre cuando un remoto coloca exactamente en su celda, caso raro; se deja al jugador en el borde libre más cercano.
- [Falsos snaps en conexión inestable] Un remoto con pérdida de paquetes puede snapear seguido → Mitigación: el umbral de 6 acepta el salto como "llegó de lejos", que es el comportamiento deseado.

## Migration Plan

- Solo `index.html` (`tickAvatar`, handlers de `pm` y `pedit`). Cambio compatible hacia atrás, sin migración ni deploy del servidor.
- Rollback: revertir el commit del cliente.
- Verificación: `cd server && npm test` verde (servidor intacto) + verificación manual en cliente (avatares con lag, colocar junto al jugador local).

## Open Questions

- Ninguna pendiente que cambie specs, diseño o tareas; el buffer de 100ms se deja opcional y se decide en apply si se implementa.
