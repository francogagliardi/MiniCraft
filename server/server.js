// Minicraft server — HTTP estático + WebSocket multijugador.
// Uso:  npm install   →   node server.js
// Env:  PORT (3000), MINICRAFT_DIR (por defecto: carpeta padre)
//   Admin:  ADMIN_KEY_HASH  →  PRODUCCIÓN: hash PBKDF2 (generalo con server/hash-key.mjs)
//           ADMIN_KEY       →  solo dev local: clave EN CLARO, legible por quien acceda al host
//   Precedencia: si hay ADMIN_KEY_HASH, se usa SOLO el hash y se ignora ADMIN_KEY en claro.
//   Sin ninguna de las dos (o vacías): modo admin DESHABILITADO (fail closed).
//   Sin default público: la vieja clave publicada en el README fue removida.
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const AdminAuth = require('./admin-auth.js');

const PORT = +(process.env.PORT || 3000);
// Número por env con default (knobs del limitador, overridables en tests).
const envNum = (v, d) => (v === undefined || v === '' || !Number.isFinite(+v)) ? d : +v;
// Limitador del KDF (anti-DoS): derivación async + token bucket global + cota de
// derivaciones concurrentes. Defaults del design §10: 3 tokens / 0.5 por segundo / 2.
const adminLimiter = AdminAuth.createAdminLimiter({
  capacity: envNum(process.env.ADMIN_RATE_CAPACITY, 3),
  refillPerSec: envNum(process.env.ADMIN_RATE_REFILL_PER_SEC, 0.5),
  maxConcurrent: envNum(process.env.ADMIN_RATE_MAX_CONCURRENT, 2),
});
// Config de admin resuelta una sola vez (la precedencia vive en el módulo, no acá).
// Sin default: sin configuración el admin queda CERRADO, nunca abierto.
const adminCfg = AdminAuth.resolveConfig(process.env, { limiter: adminLimiter });
// Aviso rate-limited del rechazo por limitador: no inunda los logs (spec).
const RATE_WARN_MS = 10000;
let lastRateWarn = 0;
function warnAdminRateLimited() {
  const now = Date.now();
  if (now - lastRateWarn < RATE_WARN_MS) return;
  lastRateWarn = now;
  console.warn('   ⚠️ intento de admin rechazado por el limitador del KDF (rate limited)');
}
const STATIC = process.env.MINICRAFT_DIR || path.join(__dirname, '..');
const SAVE_FILE = process.env.WORLD_FILE || path.join(__dirname, 'world.json');
// Presencia sin fantasmas: heartbeat ping/pong + expiración idle sin `mv`.
// Defaults de producción 30s/90s; por env se acortan solo en tests.
const HB_MS = Math.max(50, +(process.env.HB_INTERVAL_MS || 30000));
const IDLE_MS = Math.max(100, +(process.env.IDLE_TIMEOUT_MS || 90000));

// ---- ciclo día/noche: el server es dueño del reloj ----
// Ancla al boot + Date.now(): el reloj es puro y NO se persiste en world.json.
// Todos los jugadores ven la misma hora (necesario para el futuro zombi server-auth).
const DAY_MS = 300000, NIGHT_MS = 180000, CYCLE_MS = DAY_MS + NIGHT_MS, DAWN_MS = 25000, DUSK_MS = 25000;
const NIGHT_MIN = 0.50, NIGHT_START = DAY_MS / CYCLE_MS;
const TOD_INTERVAL_MS = Math.max(50, +(process.env.TOD_INTERVAL_MS || 4000));
// Tick de la horda zombi (server-auth). Knobs por env para los tests. ZOMBIE_FORCE_NIGHT
// es un atajo SOLO de test de isNight(); no reformatea el patrón `phaseNow() >= NIGHT_START`
// que exige static.mjs §8d.
const ZOMBIE_TICK_MS = Math.max(25, +(process.env.ZOMBIE_TICK_MS || 50));
const ZOMBIE_SNAP_MS = Math.max(25, +(process.env.ZOMBIE_SNAP_MS || 100));
const FORCE_NIGHT = process.env.ZOMBIE_FORCE_NIGHT === '1';
const T0 = Date.now();
function phaseNow() { return ((Date.now() - T0) % CYCLE_MS) / CYCLE_MS; }
const isNight = () => FORCE_NIGHT || phaseNow() >= NIGHT_START;

// Asegura que la carpeta de persistencia exista (ej: /data en Easypanel/Docker).
try { fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true }); } catch (e) {}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
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
});

// ---- estado del mundo ----
let SEED = (Math.random() * 1e9) | 0;
let edits = []; // [[idx, val], ...]
try {
  const d = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
  if (d && typeof d.seed === 'number' && Array.isArray(d.edits)) {
    SEED = d.seed; edits = d.edits;
    console.log(`💾 Mundo cargado: seed ${SEED}, ${edits.length} ediciones`);
  }
} catch (e) { console.log('🌱 Mundo nuevo con seed', SEED); }

// ---- réplica del mundo para la simulación de criaturas ----
// El server extrae el bloque worldgen de index.html (el MISMO código que ejecuta el
// cliente) y lo evalúa: así conoce el terreno exacto y colisiona sin drift. Fail
// fast y ruidoso si el bloque falta: mejor no arrancar que simular otro mundo.
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
  const t0 = Date.now();
  WG.genWorld(world, SEED);
  for (const e of edits) { // parcheo de las ediciones ya validadas (idx = (y*208+z)*208+x)
    if (!Array.isArray(e)) continue;
    const [idx, v] = e;
    if (Number.isInteger(idx) && idx >= 0 && idx < world.length && Number.isInteger(v)) world[idx] = v;
  }
  console.log(`🗺️  Mundo replicado (${WG.WG_W}×${WG.WG_H}×${WG.WG_W} = ${world.length} celdas) en ${Date.now() - t0} ms`);
}

// ---- horda de zombis (server-auth) ----
// Módulo puro: recibe la réplica del mundo, los predicados del bloque worldgen y un
// RNG propio. El server solo tickea, difunde el estado y aplica los eventos.
const Zombie = require('./zombie.js');
const horde = Zombie.createHorde({
  world, mobBlocked: WG.mobBlocked,
  topSolidY: (x, z) => WG.topSolidY(world, x, z),
  freeForMob: (x, y, z) => WG.freeForMob(world, x, y, z),
  rng: WG.mulberry((SEED ^ 0x2b1d) >>> 0),
  W: WG.WG_W, H: WG.WG_H, surface: WG.WG_SURFACE,
});

function save() {
  try { fs.writeFileSync(SAVE_FILE, JSON.stringify({ seed: SEED, edits })); } catch (e) {}
}
setInterval(save, 15000);
function shutdown(sig) { try { save(); } catch (e) {} process.exit(0); }
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ---- jugadores ----
const players = new Map(); // ws -> {id, name, mode, admin, pos}
let nextId = 1;
const cleanName = s => String(s || 'Aventurero').slice(0, 16).replace(/[<>&"]/g, '');
// Aspecto declarado por el cliente (`skin`, aditivo — net/avatar): string corto,
// saneado (sin basura) y en minúsculas; cualquier valor ausente o vacío cae al
// aspecto humano por defecto. El render remoto elige el modelo según ese valor.
const DEFAULT_SKIN = 'human';
const cleanSkin = s => {
  if (typeof s !== 'string') return DEFAULT_SKIN;
  const v = s.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16);
  return v || DEFAULT_SKIN;
};

const wss = new WebSocket.Server({ server });
function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const [ws] of players) {
    if (ws !== except && ws.readyState === WebSocket.OPEN) ws.send(s);
  }
}
function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
// Limpieza compartida e idempotente: un solo `leave` por jugador,
// la invoquen `close`, el heartbeat o el chequeo idle.
function removePlayer(ws) {
  const p = players.get(ws);
  if (!p) return false;
  players.delete(ws);
  broadcast({ t: 'leave', id: p.id });
  broadcast({ t: 'chat', from: '🌿', text: `${p.name} se fue` });
  console.log(`➖ ${p.name} — ${players.size} conectados`);
  return true;
}

// Heartbeat + idle: ping cada HB_MS (terminate sin pong) y
// terminate + leave a sesiones sin `mv` durante IDLE_MS.
setInterval(() => {
  const now = Date.now();
  for (const ws of [...wss.clients]) {
    if (ws.isAlive === false) {
      removePlayer(ws);
      try { ws.terminate(); } catch (e) {}
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
    if (players.has(ws) && now - (ws.lastMv || 0) > IDLE_MS) {
      removePlayer(ws);
      try { ws.terminate(); } catch (e) {}
    }
  }
}, HB_MS);

// Difusión de la hora del ciclo (aditiva: los clientes viejos la ignoran).
setInterval(() => { broadcast({ t: 'tod', v: phaseNow() }); }, TOD_INTERVAL_MS);

// ---- tick de la horda: la IA corre aparte y el server cablea los eventos a los ws ----
let zLast = [], zSnapN = 0;
function wsById(id) {
  for (const [ws, p] of players) if (p.id === id) return ws;
  return null;
}
let ztPrev = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - ztPrev) / 1000); // dt real, clamp ante un stall
  ztPrev = now;
  const arr = [];
  for (const p of players.values()) arr.push({ id: p.id, pos: p.pos, dead: p.dead || 0 });
  const res = horde.tick(dt, { night: isNight(), now, players: arr });
  zLast = res.zs; // se difunde en el snapshot; el tick NO emite red por sí solo
  for (const ev of res.events) {
    const target = wsById(ev.to);
    if (!target) continue;
    if (ev.t === 'phit') send(target, { t: 'phit', from: ev.from, fromId: ev.fromId, dmg: ev.dmg, dx: ev.dx, dz: ev.dz });
    else if (ev.t === 'zhitok') send(target, { t: 'zhitok', id: ev.id, dmg: ev.dmg, hp: ev.hp, dead: ev.dead });
  }
}, ZOMBIE_TICK_MS);

// Difusión periódica del estado de la horda (mismo espíritu que `tod`): sin zombis y
// sin cambio de cantidad no se emite, para no spamear mensajes vacíos.
setInterval(() => {
  if (zLast.length === 0 && zSnapN === 0) return;
  zSnapN = zLast.length;
  broadcast({ t: 'zs', z: zLast });
}, ZOMBIE_SNAP_MS);

wss.on('connection', (ws) => {
  let me = null;
  let helloInFlight = false; // guard anti-race: la verificación admin es async
  ws.isAlive = true;
  ws.lastMv = Date.now();
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }

    if (m.t === 'hello') {
      // Higiene + anti-race: con la verificación async (PBKDF2) dos `hello`
      // seguidos podrían pasar ambos el chequeo antes de crear la sesión. La
      // marca se pone ANTES de cualquier await. El cliente real nunca reenvía
      // `hello` por el mismo socket (index.html:2556-2558).
      if (me || helloInFlight) return;
      helloInFlight = true;
      const wantAdmin = m.mode === 'admin';
      // Deriva PBKDF2 SOLO en intentos de admin con clave no vacía (el resto se
      // rechaza barato). `verifyAdminKey` aplica precedencia hash→claro→fail-closed
      // y, cuando hay hash, el limitador (bucket + concurrencia) ANTES de derivar.
      let admin = false;
      if (wantAdmin && typeof m.key === 'string' && m.key.length > 0) {
        const limitedAntes = AdminAuth.stats.limited;
        try { admin = await AdminAuth.verifyAdminKey(m.key, adminCfg); }
        catch (e) { console.warn('   ⚠️ error verificando la clave admin: ' + e.message); admin = false; }
        // Rechazo por limitador (no por clave mala): se registra, pero rate-limited.
        if (!admin && AdminAuth.stats.limited > limitedAntes) warnAdminRateLimited();
      }
      me = {
        id: nextId++, name: cleanName(m.name),
        mode: admin ? 'admin' : 'player', admin,
        pos: [128.5, 20, 136.5], yaw: Math.PI, pitch: 0, hp: 10, dead: 0,
        held: 0, seq: 0, // ítem en mano + contador de golpes (PvP): el rival ve el arma y el gesto
        skin: cleanSkin(m.skin), // aspecto declarado (aditivo): el resto ve el robot/piel pedida
      };
      players.set(ws, me);
      ws.lastMv = Date.now();
      send(ws, {
        t: 'welcome', id: me.id, seed: SEED, edits, admin,
        tod: phaseNow(), cyc: CYCLE_MS,
        zom: horde.zombies.map(z => ({ i: z.i, p: [z.x, z.y, z.z], yaw: z.yaw, hp: z.hp, dead: z.dead, atk: z.atk || 0 })),
        adminDenied: wantAdmin && !admin,
        players: [...players.values()].filter(p => p !== me)
          .map(p => ({ id: p.id, name: p.name, mode: p.mode, hp: p.hp ?? 10, dead: p.dead ?? 0, pos: p.pos, yaw: p.yaw, pitch: p.pitch, held: p.held ?? 0, seq: p.seq ?? 0, skin: p.skin ?? DEFAULT_SKIN })),
      });
      broadcast({ t: 'join', id: me.id, name: me.name, mode: me.mode, dead: 0, pos: me.pos, yaw: me.yaw, pitch: me.pitch, held: me.held, seq: me.seq, skin: me.skin }, ws);
      broadcast({ t: 'chat', from: '🌿', text: `${me.name} se unió (${me.mode === 'admin' ? 'admin 🛠' : 'jugador 🌱'})` }, ws);
      console.log(`➕ ${me.name} (${me.mode}) — ${players.size} conectados`);
      helloInFlight = false;
      return;
    }
    if (!me) return;

    if (m.t === 'mv') {
      if (!Array.isArray(m.p)) return;
      ws.lastMv = Date.now();
      me.pos = m.p; me.yaw = m.yaw; me.pitch = m.pitch;
      if (Number.isFinite(+m.hp)) me.hp = Math.max(0, Math.min(10, +m.hp));
      if (m.dead === 1 || m.dead === 0) me.dead = m.dead;
      // ítem en mano + contador de golpes: solo si vienen (un `mv` de cliente viejo no los trae)
      if (Number.isInteger(+m.held)) me.held = +m.held;
      if (Number.isInteger(+m.seq)) me.seq = +m.seq;
      broadcast({ t: 'pm', id: me.id, p: me.pos, yaw: me.yaw, pitch: me.pitch, hp: me.hp ?? 10, dead: me.dead ?? 0, held: me.held, seq: me.seq, skin: me.skin }, ws);
    } else if (m.t === 'edit') {
      const { x, y, z, v } = m;
      if (![x, y, z, v].every(n => Number.isInteger(n))) return;
      if (x < 0 || x >= 208 || z < 0 || z >= 208 || y < 0 || y >= 40 || v < 0 || v > 64) return;
      if (v === 11 || y === 0) return; // bedrock solo la pone el generador
      const idx = (y * 208 + z) * 208 + x;
      edits.push([idx, v]);
      world[idx] = v; // mantener la réplica del mundo en sync con las ediciones
      if (edits.length > 300000) edits.splice(0, edits.length - 300000);
      broadcast({ t: 'pedit', x, y, z, v, by: me.name }, ws);
    } else if (m.t === 'hit') {
      const target = [...players.keys()].find(w => players.get(w).id === m.id);
      if (target) {
        const dmg = Math.min(6, +m.dmg || 2);
        send(target, { t: 'phit', from: me.name, fromId: me.id, dmg, dx: +m.dx || 0, dz: +m.dz || 0 });
        send(ws, { t: 'hitok', id: m.id, dmg }); // confirmación al atacante
      }
    } else if (m.t === 'zhit') {
      // Golpe del jugador a una criatura: el server es la autoridad del daño. Sin
      // zombi/alcance/cooldown válido se rechaza en silencio (sin respuestas).
      const id = +m.id;
      if (!Number.isInteger(id)) return;
      const res = horde.hit(me.id, id, Date.now(), me.pos);
      if (res) send(ws, { t: 'zhitok', id, dmg: Zombie.SWORD_DMG, hp: res.hp, dead: res.dead });
    } else if (m.t === 'chat') {
      const text = String(m.text || '').slice(0, 140).replace(/[<>&"]/g, '');
      if (text) broadcast({ t: 'chat', from: me.name, fromId: me.id, text });
    }
  });
  ws.on('close', () => {
    removePlayer(ws);
  });
});

// Aviso de arranque según el estado de configuración (nunca expone el secreto).
// Fail closed ≠ no arrancar: el juego sigue sirviendo aunque el admin quede cerrado.
function logAdminConfig() {
  if (adminCfg.mode === 'hash') {
    console.log('   🔐 Clave admin: verificada por hash (PBKDF2-SHA256)');
    if (adminCfg.hasClaro) {
      console.warn('   ⚠️ ADMIN_KEY en claro IGNORADA por precedencia del hash — borrá ADMIN_KEY: la clave en claro sigue estando en el host y es legible');
    }
  } else if (adminCfg.mode === 'claro') {
    console.warn('   ⚠️ Clave admin en claro: legible por quien acceda al host. Usá ADMIN_KEY_HASH.');
  } else {
    console.warn('   ⚠️ Modo admin DESHABILITADO: configurá ADMIN_KEY_HASH.');
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`⛏ Minicraft server en http://localhost:${PORT}`);
  console.log(`   STATIC=${STATIC} SAVE_FILE=${SAVE_FILE}`);
  logAdminConfig();
});
