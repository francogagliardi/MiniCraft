# Tasks

## 1. index.html: suavizado de avatar remoto (tickAvatar)

- [x] 1.1 En `tickAvatar`: si la distancia horizontal entre `g.position` y `target` supera 6 unidades, hacer snap directo a `target`; si no, lerpear con `lerp(dt*10)` acotado por frame. Verificación: lectura de `index.html` confirma que `tickAvatar` aplica snap cuando dist > 6 y lerp cuando dist <= 6.
- [x] 1.2 Interpolar el yaw del avatar remoto suavemente hacia el yaw reportado en `pm` (sin giros bruscos), reutilizando la normalización de ángulo ya presente en `tickAvatar`. Verificación: `tickAvatar` rota `g.rotation.y` progresivamente hacia `a.yaw` del `pm` en vez de usar el delta crudo.
- [x] 1.3 (Opcional) Agregar buffer de hasta 100ms en los mensajes `pm` para ordenar y suavizar ráfagas antes de aplicar la posición a `target`. Verificación: varios `pm` en <100ms se aplican en orden al `target` sin saltos intermedios (revisión de código + manual en cliente).

## 2. index.html: pedit no deja al jugador local dentro de un bloque

- [x] 2.1 En el handler de `pedit`, tras `rawSet`, detectar si el jugador local queda dentro del bloque recién colocado y, si es así, reubicarlo fuera del bloque (colisión resuelta hacia fuera) en vez de dejarlo dentro. Verificación: colocar un bloque remoto sobre el jugador local no lo deja atrapado (manual en cliente).

## 3. Verificación final (integración)

- [x] 3.1 Ejecutar `cd server && npm test` y confirmar que todos los tests están verdes (servidor intacto, sin cambios en `server.js` ni protocolo). Verificación: `npm test` termina con exit code 0 y todos los casos pasan (estáticos + protocolo).
- [x] 3.2 Verificación manual en cliente: avatares remotos con lag no "saltan" (snap si dist > 6, lerp si no); el yaw se interpola; un `pedit` sobre el jugador local lo saca fuera. Verificación: observable en el navegador con dos pestañas/nombres distintos. — Verificado y aprobado por el usuario en Docker (cliente en navegador).

## Workflow follow-up

- Cuando los artifacts de planificación estén revisados, ejecutar `/opsx-apply` para implementar el change en `index.html`.
- Tras la implementación, archivar el change con `/opsx-archive` y verificar el resultado.
