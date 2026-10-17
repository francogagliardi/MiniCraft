# Design

## Context

Ver `proposal.md` (Why). Estado actual: `server/server.js` solo limpia en `ws.on('close')` (:129), sin ping/pong ni timeout de inactividad; el cliente (`index.html`) manda `mv` cada 70ms pero nunca cierra el WS al salir, y el server nunca expira sesiones. Salir con flecha atrás deja el WS medio-abierto y el fantasma dura largo rato.

## Goals / Non-Goals

**Goals:**
- Eliminar fantasmas en segundos (cierre proactivo) o como máximo ~90s (idle) / ~30s+ (heartbeat).
- No patear conexiones lentas o jugadores AFK cortos: umbrales generosos.
- Reutilizar el path de limpieza existente (`close` → `leave`) para la expiración.

**Non-Goals:**
- Reconexión automática o persistencia de sesión tras expirar.
- Distinguir AFK intencional de conexión muerta (ambos expiran igual).
- Cambios en el protocolo visible (`hello`/`welcome`/`mv`/`leave` no cambian).

## Decisions

1. **Cierre proactivo en cliente (`pagehide` + `beforeunload` → `NET?.close()`).**
   Por qué: `pagehide` cubre navegación atrás/adelante y caché bfcache en móvil; `beforeunload` cubre recarga/cierre en desktop. Alternativa (mensaje `bye` explícito) descartada: el `close` ya dispara la limpieza del server sin nuevo tipo de mensaje.
2. **Heartbeat: `ws.isAlive` + `ping()` cada 30s, `terminate()` sin pong.**
   Por qué: es el patrón estándar de `ws`; 30s equilibra detección rápida con tráfico despreciable. Alternativa (intervalo menor, 10-15s) descartada: más wakeups sin beneficio visible. El `pong` lo responde la librería automáticamente, sin cambios de protocolo.
3. **Idle timeout: 90s sin `mv` → cierre + `leave`.**
   Por qué: el cliente sano manda `mv` cada 70ms (~1280 mensajes en 90s), así 90s es claramente "muerto o colgado" y a la vez generoso con redes lentas y pestañas en segundo plano. Alternativa (60s) descartada por riesgo de falsos positivos en móviles; 90s es el compromiso pedido. Se rastrea con `lastMv` por socket, actualizado en cada `mv`.
4. **Limpieza compartida.**
   Por qué: extraer la lógica actual de `close` a una función `removePlayer(ws)` reutilizada por heartbeat e idle evita doble `leave` (guardia con `players.has(ws)` / `me` nulo).
5. **Tests en `server/test/protocol.mjs`.**
   Por qué: extiende el harness existente (levanta el server real). Para no esperar 90s reales, los intervalos se parametrizan por env (`HB_INTERVAL_MS`, `IDLE_TIMEOUT_MS`) con defaults 30s/90s; los tests usan valores cortos y verifican que la conexión muerta expira y la viva no.

## Risks / Trade-offs

- [Risk] Pestaña en segundo plano throttled deja de mandar `mv` y expira aunque el usuario "sigue ahí" → Mitigación: umbral generoso de 90s; al volver, el cliente ya muestra "Desconectado" vía `onclose` existente.
- [Risk] Doble `leave` si `terminate()` y `close` compiten → Mitigación: guardia idempotente en `removePlayer`.
- [Risk] Env vars de test divergen de producción → Mitigación: defaults fijos 30s/90s en código; env solo acorta en tests.

## Migration Plan

- Deploy: solo cambia `server/server.js` + estático `index.html`; deploy normal del server (incluye deploy en tasks). Rollback: revert del change, sin migración de datos (el `world.json` no se toca).
