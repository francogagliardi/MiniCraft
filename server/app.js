'use strict';
// Minicraft — wiring de la aplicación (HTTP estático + API + WebSocket + mundo +
// zombis + sueño). Todo el estado vive en la instancia que devuelve `createApp`,
// así los tests pueden levantar una app en proceso sin tocar el proceso global.
//
// `server.js` es el bootstrap delgado: lee env, crea el store, migra, bootstrapea
// el admin y llama a `createApp(...).listen()`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const Sleep = require('./sleep.js');
const Zombie = require('./zombie.js');
const Skins = require('./skins.js');

const DEFAULT_SKIN = 'human';
const RATE_WARN_MS = 10000;

// Número por env con default (knobs del limitador, overridables en tests).
const envNum = (v, d) => (v === undefined || v === '' || !Number.isFinite(+v)) ? d : +v;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

// Sanea el nombre visible (compatibilidad con clientes viejos y bot de servicio).
function cleanName(s) {
  return String(s || 'Aventurero').slice(0, 16).replace(/[<>&"]/g, '');
}
// Aspecto: string corto y saneado. El server resuelve valores inválidos al skin
// por defecto; `robot` es válido para el bot aunque no sea opción de jugador.
function cleanSkin(s) {
  if (typeof s !== 'string') return DEFAULT_SKIN;
  const v = s.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16);
  return v || DEFAULT_SKIN;
}

/**
 * Crea una instancia de la aplicación.
 *
 * @param {object} opts
 * @param {object} [opts.env]        env inyectable (default process.env)
 * @param {object} [opts.store]      store de usuarios/sesiones (PgStore o MemoryStore)
 * @param {string} [opts.staticDir]  carpeta de archivos estáticos
 * @param {string} [opts.worldFile]  archivo de persistencia del mundo
 * @param {function} [opts.now]      reloj inyectable (default Date.now)
 */
function createApp(opts = {}) {
  const env = opts.env || process.env;
  const store = opts.store || null;
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const log = typeof opts.log === 'function' ? opts.log : (...a) => console.log(...a);
  const warn = typeof opts.warn === 'function' ? opts.warn : (...a) => console.warn(...a);
  const STATIC = opts.staticDir || env.MINICRAFT_DIR || path.join(__dirname, '..');
  const SAVE_FILE = opts.worldFile || env.WORLD_FILE || path.join(__dirname, 'world.json');
  const PORT = envNum(env.PORT, 3000);

  // ---- knobs de tiempo (env para tests) ----
  const HB_MS = Math.max(50, envNum(env.HB_INTERVAL_MS, 30000));
  const IDLE_MS = Math.max(100, envNum(env.IDLE_TIMEOUT_MS, 90000));
  const TOD_INTERVAL_MS = Math.max(50, envNum(env.TOD_INTERVAL_MS, 4000));
  const ZOMBIE_TICK_MS = Math.max(25, envNum(env.ZOMBIE_TICK_MS, 50));
  const ZOMBIE_SNAP_MS = Math.max(25, envNum(env.ZOMBIE_SNAP_MS, 100));
  const FORCE_NIGHT = env.ZOMBIE_FORCE_NIGHT === '1';
  const TIME_SCALE = Math.max(0.01, envNum(env.TIME_SCALE, 1));

  // ---- hora de Argentina para los logs ----
  // El timestamp de Easypanel es UTC: la hora va DENTRO del texto, formateada con
  // Intl sobre la zona Argentina (UTC−3 todo el año). `hourCycle:'h23'` y no
  // `hour12:false` (en Node 20 este último resuelve h24 y la medianoche sale 24:00).
  /* hora-ar:start */
  const FMT_AR = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const horaAr = (t = now()) => `[${FMT_AR.format(new Date(t))}] `;
  /* hora-ar:end */

  // ---- ciclo día/noche: el server es dueño del reloj ----
  const DAY_MS = 300000, NIGHT_MS = 180000, CYCLE_MS = DAY_MS + NIGHT_MS, DAWN_MS = 25000, DUSK_MS = 25000;
  const NIGHT_MIN = 0.50, NIGHT_START = DAY_MS / CYCLE_MS;
  const cycleNowMs = () => CYCLE_MS / TIME_SCALE;
  const T0 = Date.now();
  let sleepOffsetMs = 0;
  function phaseNow() { return ((Date.now() - T0 + sleepOffsetMs) % cycleNowMs()) / cycleNowMs(); }
  const isNight = () => FORCE_NIGHT || phaseNow() >= NIGHT_START;

  // Asegura que la carpeta de persistencia exista (ej: /data en Easypanel/Docker).
  try { fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true }); } catch (e) { /* sin permiso: se ignora */ }

  // ---- estado del mundo ----
  let SEED = (Math.random() * 1e9) | 0;
  let edits = []; // [[idx, val], ...]
  try {
    const d = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    if (d && typeof d.seed === 'number' && Array.isArray(d.edits)) {
      SEED = d.seed; edits = d.edits;
      log(`💾 Mundo cargado: seed ${SEED}, ${edits.length} ediciones`);
    }
  } catch (e) { log('🌱 Mundo nuevo con seed', SEED); }

  // ---- réplica del mundo para la simulación de criaturas ----
  // Se extrae el bloque worldgen de index.html (el MISMO código del cliente) y se
  // evalúa: así el server conoce el terreno exacto y colisiona sin drift.
  const WG_START = '/* worldgen:start */', WG_END = '/* worldgen:end */';
  function loadWorldGen(dir) {
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const i = html.indexOf(WG_START), j = html.indexOf(WG_END);
    if (i < 0 || j < i) throw new Error('worldgen: marcadores ausentes en index.html');
    return new Function(html.slice(i, j) + '\n;return {WG_W,WG_H,WG_SURFACE,WG_OX,WG_OZ,hash2,vnoise,fbm,hAt,mulberry,genWorld,mobBlocked,topSolidY,freeForMob};')();
  }
  const WG = loadWorldGen(STATIC);
  const world = new Uint8Array(WG.WG_W * WG.WG_H * WG.WG_W);
  {
    const t0 = now();
    WG.genWorld(world, SEED);
    for (const e of edits) { // parcheo de las ediciones ya validadas (idx = (y*208+z)*208+x)
      if (!Array.isArray(e)) continue;
      const [idx, v] = e;
      if (Number.isInteger(idx) && idx >= 0 && idx < world.length && Number.isInteger(v)) world[idx] = v;
    }
    log(`🗺️  Mundo replicado (${WG.WG_W}×${WG.WG_H}×${WG.WG_W} = ${world.length} celdas) en ${now() - t0} ms`);
  }

  // ---- horda de zombis (server-auth) ----
  const horde = Zombie.createHorde({
    world, mobBlocked: WG.mobBlocked,
    topSolidY: (x, z) => WG.topSolidY(world, x, z),
    freeForMob: (x, y, z) => WG.freeForMob(world, x, y, z),
    rng: WG.mulberry((SEED ^ 0x2b1d) >>> 0),
    W: WG.WG_W, H: WG.WG_H, surface: WG.WG_SURFACE,
  });

function save() {
  try { fs.writeFileSync(SAVE_FILE, JSON.stringify({ seed: SEED, edits })); } catch (e) { /* disco lleno: no rompe el juego */ }
}

  // ---- jugadores ----
  const players = new Map(); // ws -> {id, name, mode, admin, pos, ...}
  let nextId = 1;

  // ---- HTTP ----
  // Router de auth (se inyecta o se construye desde el store). Si no hay router,
  // el comportamiento es el estático histórico (modo legacy del paso 0).
  let auth = opts.auth || null;
  if (!auth && store) {
    auth = require('./http-auth.js').createAuthRouter({
      store, env, staticDir: STATIC, now: () => now(), log, warn,
      onSessionRevoked: (userId) => closeUserSockets(userId),
    });
  }
  const httpServer = http.createServer((req, res) => {
    handleHttp(req, res).catch((e) => {
      try { res.writeHead(500, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('err'); } catch (e2) {}
      warn('   ⚠️ error HTTP: ' + (e && e.message));
    });
  });

  async function handleHttp(req, res) {
    if (auth) {
      const handled = await auth.handle(req, res);
      if (handled) return;
    }
    serveStatic(req, res);
  }

  function serveStatic(req, res) {
    try {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const file = path.normalize(path.join(STATIC, urlPath));
      if (!file.startsWith(STATIC)) { res.writeHead(403); res.end('no'); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('404'); return; }
        // sin caché: el index.html cambia en cada deploy y los celus lo cachean agresivo
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-cache' });
        res.end(data);
      });
    } catch (e) { res.writeHead(500); res.end('err'); }
  }

  // ---- WebSocket ----
  const wss = new WebSocket.Server({ noServer: true });
  let gate = opts.wsGate || null;
  if (!gate && store) gate = require('./ws-auth.js').createWsGate({ store, env, now, log, warn });

  // Identidad autoritativa: usuario desde la sesión del gate; bot desde BOT_NAME/BOT_SKIN.
  let resolveIdentity = opts.resolveIdentity || null;
  if (!resolveIdentity && store) {
    resolveIdentity = (m, ws) => {
      const a = ws.auth;
      if (!a) return null;
      if (a.kind === 'bot') {
        return { name: m.name, skin: m.skin, mode: 'player', admin: false, bot: true };
      }
      const isAdmin = a.role === 'admin';
      return {
        name: a.username, skin: a.skin, mode: isAdmin ? 'admin' : 'player',
        admin: isAdmin, bot: false,
        profile: { username: a.username, role: a.role, skin: a.skin },
        userId: a.userId, tokenHash: a.tokenHash,
      };
    };
  }

  httpServer.on('upgrade', (req, socket, head) => {
    if (!gate) { wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req)); return; }
    gate.handleUpgrade(req, socket, head, wss).catch((e) => {
      warn('   ⚠️ error en el upgrade: ' + (e && e.message));
      try { socket.destroy(); } catch (e2) {}
    });
  });

  function broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const [ws] of players) {
      if (ws !== except && ws.readyState === WebSocket.OPEN) ws.send(s);
    }
  }
  function send(ws, msg) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  // ---- sueño: quórum de jugadores reales (lógica pura en server/sleep.js) ----
  const anySleeping = () => [...players.values()].some(p => p.sleeping);
  const sleepQuorum = () => Sleep.quorum([...players.values()]);
  function broadcastSleep(extra) {
    const q = sleepQuorum();
    broadcast({ t: 'sleep', count: q.count, need: q.need, ...(extra || {}) });
    return q;
  }
  function wakePlayer(p) {
    if (!p || !p.sleeping) return false;
    p.sleeping = false;
    p.sleepBed = null;
    return true;
  }
  function wakeAndBroadcast(p) {
    if (!wakePlayer(p)) return false;
    const q = broadcastSleep({ id: p.id, name: p.name, on: false });
    if (q.ready) skipNight();
    return true;
  }
  function checkSleep() {
    const q = broadcastSleep();
    if (q.ready) skipNight();
    return q;
  }
  function skipNight() {
    sleepOffsetMs += Sleep.dawnAdvanceMs(phaseNow(), cycleNowMs());
    for (const p of players.values()) { p.sleeping = false; p.sleepBed = null; }
    const q = sleepQuorum();
    broadcast({ t: 'sleep', reset: true, count: q.count, need: q.need });
    broadcast({ t: 'tod', v: phaseNow() });
    broadcast({ t: 'chat', from: '☀️', text: 'Amaneció' });
  }
  // Limpieza compartida e idempotente: un solo `leave` por jugador.
  function removePlayer(ws) {
    const p = players.get(ws);
    if (!p) return false;
    players.delete(ws);
    broadcast({ t: 'leave', id: p.id });
    broadcast({ t: 'chat', from: '🌿', text: `${p.name} se fue` });
    log(horaAr() + `➖ ${p.name} — ${players.size} conectados`);
    if (p.sleeping || anySleeping()) checkSleep();
    return true;
  }

  // Cierra los sockets de un usuario (logout/revocación desde HTTP).
  function closeUserSockets(userId) {
    for (const ws of [...players.keys()]) {
      const p = players.get(ws);
      if (p && p.userId === userId) {
        removePlayer(ws);
        try { ws.close(4001, 'session revoked'); } catch (e) { try { ws.terminate(); } catch (e2) {} }
      }
    }
  }

  function wsById(id) {
    for (const [ws, p] of players) if (p.id === id) return ws;
    return null;
  }

  const timers = [];
  const every = (ms, fn) => { const t = setInterval(fn, ms); if (t.unref) t.unref(); timers.push(t); return t; };

  // Heartbeat + idle: ping cada HB_MS (terminate sin pong) y terminate + leave a
  // sesiones sin `mv` durante IDLE_MS. Además revalida la sesión de cada socket.
  every(HB_MS, () => {
    const t = now();
    for (const ws of [...wss.clients]) {
      if (ws.isAlive === false) {
        removePlayer(ws);
        try { ws.terminate(); } catch (e) {}
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch (e) {}
      if (players.has(ws) && t - (ws.lastMv || 0) > IDLE_MS) {
        removePlayer(ws);
        try { ws.terminate(); } catch (e) {}
      }
      if (typeof ws.revalidate === 'function') {
        ws.revalidate().catch(() => {});
      }
    }
  });

  // Difusión de la hora del ciclo (aditiva: los clientes viejos la ignoran).
  every(TOD_INTERVAL_MS, () => { broadcast({ t: 'tod', v: phaseNow() }); });

  // ---- tick de la horda ----
  let zLast = [], zSnapN = 0;
  let ztPrev = now();
  every(ZOMBIE_TICK_MS, () => {
    const t = now();
    const dt = Math.min(0.1, (t - ztPrev) / 1000);
    ztPrev = t;
    const arr = [];
    for (const p of players.values()) arr.push({ id: p.id, pos: p.pos, dead: p.dead || 0 });
    const res = horde.tick(dt, { night: isNight(), now: t, players: arr });
    zLast = res.zs;
    for (const ev of res.events) {
      const target = wsById(ev.to);
      if (!target) continue;
      if (ev.t === 'phit') send(target, { t: 'phit', from: ev.from, fromId: ev.fromId, dmg: ev.dmg, dx: ev.dx, dz: ev.dz });
      else if (ev.t === 'zhitok') send(target, { t: 'zhitok', id: ev.id, dmg: ev.dmg, hp: ev.hp, dead: ev.dead });
    }
  });

  every(ZOMBIE_SNAP_MS, () => {
    if (zLast.length === 0 && zSnapN === 0) return;
    zSnapN = zLast.length;
    broadcast({ t: 'zs', z: zLast });
  });

  const saveTimer = every(15000, save);

  wss.on('connection', (ws) => {
    let me = null;
    let helloInFlight = false;
    ws.isAlive = true;
    ws.lastMv = now();
    // Revalidación de sesión en el heartbeat: revocada/expirada/inactiva → 4001.
    ws.revalidate = async () => {
      if (!gate || typeof gate.revalidate !== 'function') return;
      const okSession = await gate.revalidate(ws);
      if (!okSession) {
        removePlayer(ws);
        try { ws.close(4001, 'session revoked'); } catch (e) { try { ws.terminate(); } catch (e2) {} }
      }
    };
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', async (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }

      if (m.t === 'hello') {
        if (me || helloInFlight) return;
        helloInFlight = true;
        let identity = null;
        try { identity = resolveIdentity ? await resolveIdentity(m, ws) : null; }
        catch (e) { identity = null; }
        helloInFlight = false;
        if (!identity) return; // gate sin identidad: fail closed
        me = {
          id: nextId++,
          name: cleanName(identity.name),
          skin: cleanSkin(identity.skin),
          mode: identity.mode === 'admin' ? 'admin' : 'player',
          admin: identity.admin === true,
          bot: identity.bot === true,
          profile: identity.profile || null,
          userId: identity.userId || null,
          tokenHash: identity.tokenHash || null,
          sleeping: false, sleepBed: null,
          pos: [128.5, 20, 136.5], yaw: Math.PI, pitch: 0, hp: 10, dead: 0,
          held: 0, seq: 0,
        };
        players.set(ws, me);
        ws.lastMv = now();
        const welcomeQ = sleepQuorum();
        const welcome = {
          t: 'welcome', id: me.id, seed: SEED, edits, admin: me.admin === true,
          tod: phaseNow(), cyc: cycleNowMs(),
          sleeping: [...players.values()].filter(p => p.sleeping).map(p => p.id),
          sleepNeed: welcomeQ.need,
          zom: horde.zombies.map(z => ({ i: z.i, p: [z.x, z.y, z.z], yaw: z.yaw, hp: z.hp, dead: z.dead, atk: z.atk || 0 })),
          adminDenied: identity.adminDenied === true,
          players: [...players.values()].filter(p => p !== me)
            .map(p => ({ id: p.id, name: p.name, mode: p.mode, hp: p.hp ?? 10, dead: p.dead ?? 0, pos: p.pos, yaw: p.yaw, pitch: p.pitch, held: p.held ?? 0, seq: p.seq ?? 0, skin: p.skin ?? DEFAULT_SKIN })),
        };
        if (me.profile) welcome.user = { username: me.profile.username, role: me.profile.role, skin: me.profile.skin };
        send(ws, welcome);
        broadcast({ t: 'join', id: me.id, name: me.name, mode: me.mode, dead: 0, pos: me.pos, yaw: me.yaw, pitch: me.pitch, held: me.held, seq: me.seq, skin: me.skin }, ws);
        broadcast({ t: 'chat', from: '🌿', text: `${me.name} se unió (${me.mode === 'admin' ? 'admin 🛠' : 'jugador 🌱'})` }, ws);
        log(horaAr() + `➕ ${me.name} (${me.mode}) — ${players.size} conectados`);
        if (anySleeping()) checkSleep();
        return;
      }
      if (!me) return;

      if (m.t === 'ping') {
        const ts = Number(m.ts);
        if (Number.isFinite(ts)) send(ws, { t: 'pong', ts });
        return;
      }

      if (m.t === 'mv') {
        if (!Array.isArray(m.p)) return;
        ws.lastMv = now();
        me.pos = m.p; me.yaw = m.yaw; me.pitch = m.pitch;
        if (Number.isFinite(+m.hp)) me.hp = Math.max(0, Math.min(10, +m.hp));
        if (m.dead === 1 || m.dead === 0) me.dead = m.dead;
        if (Number.isInteger(+m.held)) me.held = +m.held;
        if (Number.isInteger(+m.seq)) me.seq = +m.seq;
        broadcast({ t: 'pm', id: me.id, p: me.pos, yaw: me.yaw, pitch: me.pitch, hp: me.hp ?? 10, dead: me.dead ?? 0, held: me.held, seq: me.seq, skin: me.skin }, ws);
        if (me.dead === 1 && me.sleeping) wakeAndBroadcast(me);
      } else if (m.t === 'edit') {
        const { x, y, z, v } = m;
        if (![x, y, z, v].every(n => Number.isInteger(n))) return;
        if (x < 0 || x >= 208 || z < 0 || z >= 208 || y < 0 || y >= 40 || v < 0 || v > 64) return;
        if (v === 11 || y === 0) return; // bedrock solo la pone el generador
        const idx = (y * 208 + z) * 208 + x;
        edits.push([idx, v]);
        world[idx] = v;
        if (edits.length > 300000) edits.splice(0, edits.length - 300000);
        broadcast({ t: 'pedit', x, y, z, v, by: me.name }, ws);
        for (const p of [...players.values()]) {
          if (p.sleeping && Array.isArray(p.sleepBed) &&
              p.sleepBed[0] === x && p.sleepBed[1] === y && p.sleepBed[2] === z) wakeAndBroadcast(p);
        }
      } else if (m.t === 'sleep') {
        if (me.dead || me.sleeping) return;
        if (!isNight()) {
          send(ws, { t: 'sleep', id: me.id, name: me.name, on: false, denied: 'day', count: sleepQuorum().count, need: sleepQuorum().need });
          return;
        }
        me.sleeping = true;
        me.sleepBed = [Math.trunc(+m.x || 0), Math.trunc(+m.y || 0), Math.trunc(+m.z || 0)];
        const q = broadcastSleep({ id: me.id, name: me.name, on: true });
        broadcast({ t: 'chat', from: '😴', text: `${me.name} se durmió (${q.count}/${q.need})` });
        if (q.ready) skipNight();
      } else if (m.t === 'wake') {
        wakeAndBroadcast(me);
      } else if (m.t === 'hit') {
        const target = [...players.keys()].find(w => players.get(w).id === m.id);
        if (target) {
          const dmg = Math.min(6, +m.dmg || 2);
          send(target, { t: 'phit', from: me.name, fromId: me.id, dmg, dx: +m.dx || 0, dz: +m.dz || 0 });
          send(ws, { t: 'hitok', id: m.id, dmg });
        }
      } else if (m.t === 'zhit') {
        const id = +m.id;
        if (!Number.isInteger(id)) return;
        const res = horde.hit(me.id, id, now(), me.pos, me.skin);
        if (res) send(ws, { t: 'zhitok', id, dmg: Zombie.SWORD_DMG, hp: res.hp, dead: res.dead });
      } else if (m.t === 'chat') {
        const text = String(m.text || '').slice(0, 140).replace(/[<>&"]/g, '');
        if (text) broadcast({ t: 'chat', from: me.name, fromId: me.id, text, ...(me.admin ? { admin: true } : {}) });
      }
    });
    ws.on('close', () => {
      removePlayer(ws);
    });
  });

  function listen(port = PORT, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, host, () => {
        httpServer.removeListener('error', reject);
        resolve(httpServer.address());
      });
    });
  }

  async function close() {
    for (const t of timers) clearInterval(t);
    try { clearInterval(saveTimer); } catch (e) {}
    save();
    for (const ws of [...wss.clients]) { try { ws.terminate(); } catch (e) {} }
    await new Promise((resolve) => { try { wss.close(() => resolve()); } catch (e) { resolve(); } });
    await new Promise((resolve) => { try { httpServer.close(() => resolve()); } catch (e) { resolve(); } });
  }

  return {
    httpServer, wss, listeners: players, listen, close, save,
    getPort: () => (httpServer.address() ? httpServer.address().port : null),
    broadcast, send, removePlayer, closeUserSockets, phaseNow, isNight,
    store, env, staticDir: STATIC, worldFile: SAVE_FILE,
  };
}

module.exports = { createApp, cleanName, cleanSkin, DEFAULT_SKIN, Skins };
