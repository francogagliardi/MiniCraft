// Minicraft server — HTTP estático + WebSocket multijugador.
// Uso:  npm install   →   node server.js
// Env:  PORT (3000), ADMIN_KEY ('' = sin clave), MINICRAFT_DIR (por defecto: carpeta padre)
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = +(process.env.PORT || 3000);
// Cambiala con la variable de entorno ADMIN_KEY. Compartila solo con tus admins.
const ADMIN_KEY = process.env.ADMIN_KEY || 'minicraft-admin-2026';
const STATIC = process.env.MINICRAFT_DIR || path.join(__dirname, '..');
const SAVE_FILE = process.env.WORLD_FILE || path.join(__dirname, 'world.json');

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
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
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

function save() {
  try { fs.writeFileSync(SAVE_FILE, JSON.stringify({ seed: SEED, edits })); } catch (e) {}
}
setInterval(save, 15000);
process.on('SIGINT', () => { save(); process.exit(); });

// ---- jugadores ----
const players = new Map(); // ws -> {id, name, mode, admin, pos}
let nextId = 1;
const cleanName = s => String(s || 'Aventurero').slice(0, 16).replace(/[<>&"]/g, '');

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

wss.on('connection', (ws) => {
  let me = null;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }

    if (m.t === 'hello') {
      const wantAdmin = m.mode === 'admin';
      const admin = wantAdmin && (ADMIN_KEY === '' || m.key === ADMIN_KEY);
      me = {
        id: nextId++, name: cleanName(m.name),
        mode: admin ? 'admin' : 'player', admin,
        pos: [80.5, 20, 88.5], yaw: Math.PI, pitch: 0, hp: 10, dead: 0,
      };
      players.set(ws, me);
      send(ws, {
        t: 'welcome', id: me.id, seed: SEED, edits, admin,
        adminDenied: wantAdmin && !admin,
        players: [...players.values()].filter(p => p !== me)
          .map(p => ({ id: p.id, name: p.name, mode: p.mode, hp: p.hp ?? 10, dead: p.dead ?? 0, pos: p.pos, yaw: p.yaw, pitch: p.pitch })),
      });
      broadcast({ t: 'join', id: me.id, name: me.name, mode: me.mode, dead: 0, pos: me.pos, yaw: me.yaw, pitch: me.pitch }, ws);
      broadcast({ t: 'chat', from: '🌿', text: `${me.name} se unió (${me.mode === 'admin' ? 'admin 🛠' : 'jugador 🌱'})` }, ws);
      console.log(`➕ ${me.name} (${me.mode}) — ${players.size} conectados`);
      return;
    }
    if (!me) return;

    if (m.t === 'mv') {
      if (!Array.isArray(m.p)) return;
      me.pos = m.p; me.yaw = m.yaw; me.pitch = m.pitch;
      if (Number.isFinite(+m.hp)) me.hp = Math.max(0, Math.min(10, +m.hp));
      if (m.dead === 1 || m.dead === 0) me.dead = m.dead;
      broadcast({ t: 'pm', id: me.id, p: me.pos, yaw: me.yaw, pitch: me.pitch, hp: me.hp ?? 10, dead: me.dead ?? 0 }, ws);
    } else if (m.t === 'edit') {
      const { x, y, z, v } = m;
      if (![x, y, z, v].every(n => Number.isInteger(n))) return;
      if (x < 0 || x >= 160 || z < 0 || z >= 160 || y < 0 || y >= 40 || v < 0 || v > 30) return;
      if (v === 11 || y === 0) return; // bedrock solo la pone el generador
      edits.push([(y * 160 + z) * 160 + x, v]);
      if (edits.length > 300000) edits.splice(0, edits.length - 300000);
      broadcast({ t: 'pedit', x, y, z, v, by: me.name }, ws);
    } else if (m.t === 'hit') {
      const target = [...players.keys()].find(w => players.get(w).id === m.id);
      if (target) {
        const dmg = Math.min(6, +m.dmg || 2);
        send(target, { t: 'phit', from: me.name, fromId: me.id, dmg, dx: +m.dx || 0, dz: +m.dz || 0 });
        send(ws, { t: 'hitok', id: m.id, dmg }); // confirmación al atacante
      }
    } else if (m.t === 'chat') {
      const text = String(m.text || '').slice(0, 140).replace(/[<>&"]/g, '');
      if (text) broadcast({ t: 'chat', from: me.name, text });
    }
  });
  ws.on('close', () => {
    if (!me) return;
    players.delete(ws);
    broadcast({ t: 'leave', id: me.id });
    broadcast({ t: 'chat', from: '🌿', text: `${me.name} se fue` });
    console.log(`➖ ${me.name} — ${players.size} conectados`);
  });
});

server.listen(PORT, () => {
  console.log(`⛏ Minicraft server en http://localhost:${PORT}`);
  console.log(`   Clave admin: ${ADMIN_KEY}`);
});
