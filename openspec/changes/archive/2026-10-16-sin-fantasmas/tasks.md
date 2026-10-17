# Tasks

## 1. Server: heartbeat + expiración idle

- [x] 1.1 Extraer limpieza de `ws.on('close')` a `removePlayer(ws)` idempotente y verificar que el cierre normal sigue difundiendo un solo `leave` (test existente `protocol.mjs` verde).
- [x] 1.2 Implementar heartbeat `isAlive` + `ping()` cada 30s (default, parametrizable por env para tests) con `terminate()` sin pong, y verificar con server real que una conexión sin pong es terminada y difundida con `leave`.
- [x] 1.3 Implementar `lastMv` por socket + chequeo idle: cerrar conexiones sin `mv` durante 90s (default, parametrizable por env) reutilizando `removePlayer`, y verificar que una sesión sin `mv` expira con `leave`.

## 2. Cliente: cierre proactivo

- [x] 2.1 Agregar `pagehide` + `beforeunload` → `NET?.close()` en `index.html` y verificar en navegador que salir con flecha atrás dispara el `leave` en los demás clientes.

## 3. Tests de protocolo

- [x] 3.1 Extender `server/test/protocol.mjs` (con intervalos acortados por env): conexión muerta expira con `leave` y conexión viva que manda `mv` no expira; verificar con `node test/protocol.mjs` verde.

## 4. Deploy y verificación final

- [ ] 4.1 Hacer deploy del server con el fix y verificar en producción que un jugador que sale con flecha atrás desaparece de la lista (sin fantasma) y que los tests (`node test/protocol.mjs`) están verdes.
  - Nota apply 2026-10-16: pendiente — deploy a VPS fuera de alcance de esta sesión (sin commit/push/docker por consigna). Requiere verificación manual en navegador (flecha atrás → `leave`) tras el deploy.
