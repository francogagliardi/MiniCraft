'use strict';
/* ============================================================================
 * bot/index.js — cableado del bot cazador: WebSocket, reconstrucción del
 * mundo, reconexión con backoff + re-`hello` y entrada CLI.
 *
 *   node bot/index.js            (env: SERVER_URL, BOT_NAME)
 *
 * NO comparte el grafo de `require` del server: sólo la dependencia `ws`. La
 * lógica vive en bot/cazador.js (pura y testeable). `require` de este archivo
 * NO conecta: sólo hace efecto si se ejecuta como script principal, o si se
 * llama a `createBotClient(...).start()` (los tests usan esta vía).
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const { createHunter, parseWorld } = require('./cazador.js');

// Dependencia de terceros `ws` (nunca el grafo del server). Se resuelve desde la
// raíz (Docker: `/app/node_modules`) o, en local, desde `server/node_modules`, así
// `node bot/index.js` funciona sin instalar nada extra.
let WebSocket;
try { WebSocket = require('ws'); }
catch (e) { WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws')); }

const DEFAULT_URL = 'ws://minicraft:3000'; // nombre interno del servicio en compose/Easypanel
const DEFAULT_NAME = 'OPSX-bot';
const SKIN = 'robot'; // aspecto declarado (net/avatar): el resto lo ve como robot

/**
 * Crea el cliente del bot (sin conectar todavía). Config inyectable para tests:
 *   url, name, htmlPath, WebSocket, now, rng, log, mvMs,
 *   backoffBaseMs/backoffCapMs/backoffFactor, worldBuilder(html,seed,edits),
 *   onOutgoing(frame)  — espía de todo frame saliente (registra y/o reenvía).
 */
function createBotClient(cfg = {}) {
  const url = cfg.url || process.env.SERVER_URL || DEFAULT_URL;
  const name = cfg.name || process.env.BOT_NAME || DEFAULT_NAME;
  const htmlPath = cfg.htmlPath || path.join(__dirname, '..', 'index.html');
  const WS = cfg.WebSocket || WebSocket;
  const now = cfg.now || Date.now;
  const rng = cfg.rng || Math.random;
  // Logger por defecto SIN tag: el mensaje ya trae su prefijo `[HH:MM] ` y la hora
  // debe ser el PRIMER carácter de la línea (change hora-argentina-logs). El tag
  // `[bot]` era redundante: en Easypanel cada servicio tiene su propia vista de logs
  // y el contenedor ya está identificado como `minicraft-bot`.
  const log = cfg.log || ((...a) => console.log(...a));
  const mvMs = cfg.mvMs ?? 150;
  const bBase = cfg.backoffBaseMs ?? 1000;
  const bCap = cfg.backoffCapMs ?? 30000;
  const bFactor = cfg.backoffFactor ?? 2;
  const onOutgoing = typeof cfg.onOutgoing === 'function' ? cfg.onOutgoing : null;
  const worldBuilder = cfg.worldBuilder || ((html, seed, edits) => parseWorld(html).gen(seed, edits));

  // Fail-fast: sin index.html no se puede reconstruir el mundo (log claro).
  const html = fs.readFileSync(htmlPath, 'utf8');
  if (html.indexOf('/* worldgen:start */') < 0 || html.indexOf('/* worldgen:end */') < 0) {
    throw new Error('bot: faltan los marcadores worldgen en ' + htmlPath);
  }

  let ws = null, bot = null, world = null, ticker = null, reconnectTimer = null;
  let stopped = false, backoffMs = bBase;

  function send(obj) {
    try { if (ws && ws.readyState === WS.OPEN) ws.send(JSON.stringify(obj)); } catch (e) { /* socket caído */ }
    if (onOutgoing) { try { onOutgoing(obj); } catch (e) { /* el espía no rompe el bot */ } }
  }

  function startTicker() {
    if (ticker || stopped) return;
    let prev = now();
    ticker = setInterval(() => {
      if (!bot) return;
      const t = now();
      const dt = Math.max(0, (t - prev) / 1000);
      prev = t;
      try { bot.tick(dt); } catch (e) { log('tick error:', e && e.message); }
    }, mvMs);
    if (ticker.unref) ticker.unref();
  }
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

  function onMessage(m) {
    if (m.t === 'welcome') {
      // Mundo reconstruido ANTES de crear la lógica: findSpawn() ≠ welcome ⇒ se
      // replica del cliente (index.html:1684) sobre el mundo ya editado.
      try { world = worldBuilder(html, m.seed, m.edits); }
      catch (e) { log('!! no pude reconstruir el mundo:', e && e.message); return; }
      // Estado NO persistido entre reconexiones: cada conexión arranca en CAZA (design).
      bot = createHunter({ send, now, log, mvMs, world, spawn: world.findSpawn ? world.findSpawn() : undefined });
      bot.handle(m);
      startTicker();
      log(`welcome id=${m.id} spawn=[${bot.getPos().map(n => (+n).toFixed(1)).join(', ')}] modo=${bot.getMode()}`);
      return;
    }
    if (!bot) return;
    if (m.t === 'pedit' && world && world.set) {
      world.set(m.x, m.y, m.z, m.v); // mantener la réplica al día (tabla (idx) idéntica al server)
    }
    bot.handle(m);
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    // Backoff creciente + jitter (no martilla el server).
    const delay = Math.min(bCap, backoffMs) + Math.round(Math.min(bCap, backoffMs) * 0.25 * rng());
    backoffMs = Math.min(bCap, Math.round(backoffMs * bFactor));
    log(`reconectando en ${delay} ms`);
    // OJO: SIN `unref()` — critico, no lo "limpie" nadie. Al desconectarse se para el
    // ticker (`stopTicker`, en `ws.on('close')`), asi que este timer es lo UNICO que
    // mantiene vivo el event loop mientras espera el reintento. Con `unref()` el loop
    // queda vacio y Node SALE con codigo 0: el bot loguea "reconectando" y se APAGA en
    // vez de reconectar (reproducido matando el server). En produccion duele porque cada
    // redeploy del server tumba el socket del bot y lo dejaba muerto.
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  }

  function connect() {
    if (stopped) return;
    try { ws = new WS(url); } catch (e) { log('no pude abrir el socket:', e && e.message); scheduleReconnect(); return; }
    ws.on('open', () => {
      backoffMs = bBase; // conexión sana: resetea el backoff
      log('conectado a ' + url);
      send({ t: 'hello', name, mode: 'player', skin: SKIN });
    });
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      onMessage(m);
    });
    ws.on('close', () => { log('desconectado'); stopTicker(); bot = null; scheduleReconnect(); });
    ws.on('error', (e) => { log('error ws: ' + (e && e.message)); });
  }

  return {
    start() { stopped = false; connect(); },
    stop() {
      stopped = true;
      stopTicker();
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      try { ws && ws.close(); } catch (e) {}
    },
    /** Cierra el socket actual sin detener el bot: dispara la reconexión (tests). */
    terminate() { try { ws && ws.terminate(); } catch (e) {} },
    getId: () => (bot ? bot.getSelf().id : null),
    getMode: () => (bot ? bot.getMode() : null),
    getBot: () => bot,
    getWorld: () => world,
    getFrames: null,
  };
}

if (require.main === module) {
  const client = createBotClient({});
  const bye = () => { try { client.stop(); } catch (e) {} process.exit(0); };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
  client.start();
}

module.exports = { createBotClient, createHunter, parseWorld };
