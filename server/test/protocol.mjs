// Test end-to-end del protocolo multijugador: levanta el server de verdad
// y verifica welcome, movimiento, bloques, daño PvP, muerte, chat y admin key.
// Uso: node test/protocol.mjs   (sale con código != 0 si algo falla)
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const dir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(dir, '..');
const PORT = 3210;
const WORLD = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-world-')), 'world.json');
const TIMEOUT = 8000;

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const srv = spawn(process.execPath, ['server.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), ADMIN_KEY: 'test-key', WORLD_FILE: WORLD },
});
srv.stderr.on('data', d => process.stdout.write('[SRV-ERR] ' + d));
let serverReady = false;

function shutdown(code) {
  try { srv.kill(); } catch (e) {}
  if (fails || code) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
  console.log('\n🎉 protocolo OK');
  process.exit(0);
}
setTimeout(() => { console.log('❌ timeout global'); shutdown(1); }, 45000).unref();

async function hello(name, mode, key = '') {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const seen = [];
  await new Promise((res, rej) => {
    ws.on('open', res); ws.on('error', rej);
    setTimeout(() => rej(new Error('sin conexión')), TIMEOUT);
  });
  ws.on('message', (raw) => {
    try { seen.push(JSON.parse(raw)); } catch (e) {}
  });
  ws.send(JSON.stringify({ t: 'hello', name, mode, key }));
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT) {
    const w = seen.find(m => m.t === 'welcome');
    if (w) return { ws, m: w, seen };
    await wait(50);
  }
  throw new Error('sin welcome para ' + name);
}
async function nextOf(seen, from, type) {
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT) {
    const i = seen.findIndex((m, k) => k >= from && m.t === type);
    if (i >= 0) return seen[i];
    await wait(50);
  }
  throw new Error('no llegó ' + type);
}

// esperar a que el server escuche
{
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try {
      const probe = new WebSocket(`ws://localhost:${PORT}`);
      await new Promise((res, rej) => { probe.on('open', res); probe.on('error', rej); });
      probe.close(); serverReady = true; break;
    } catch (e) { await wait(200); }
  }
}
if (!serverReady) { console.log('❌ el server no levantó'); shutdown(1); }

try {
  // 1. admin sin clave → denegado; con clave → ok
  const evil = await hello('Evil', 'admin', '');
  ok(evil.m.admin === false && evil.m.adminDenied === true, 'admin sin clave → denegado');
  evil.ws.close();
  const boss = await hello('Jefe', 'admin', 'test-key');
  ok(boss.m.admin === true && boss.m.mode === undefined, 'admin con clave → aceptado');
  ok(typeof boss.m.seed === 'number' && Array.isArray(boss.m.edits), 'welcome trae seed + edits');

  // 2. jugador y lista de jugadores
  const a = await hello('Atac', 'player');
  const b = await hello('Vict', 'player');
  ok(b.m.players.length >= 1 && b.m.players.some(p => p.name === 'Atac'), 'lista de jugadores en welcome');

  // 3. movimiento + hp + dead
  const nB = b.seen.length;
  a.ws.send(JSON.stringify({ t: 'mv', p: [80, 20, 88], yaw: 1, pitch: 0, hp: 7, dead: 0 }));
  const pm = await nextOf(b.seen, nB, 'pm');
  ok(pm.id === a.m.id && pm.hp === 7 && pm.p[0] === 80, 'relay de movimiento + hp');
  a.ws.send(JSON.stringify({ t: 'mv', p: [80, 20, 88], yaw: 1, pitch: 0, hp: 0, dead: 1 }));
  const pm2 = await nextOf(b.seen, b.seen.length, 'pm');
  ok(pm2.dead === 1 && pm2.hp === 0, 'relay de muerte (dead=1, hp=0)');

  // 4. bloques
  a.ws.send(JSON.stringify({ t: 'edit', x: 80, y: 15, z: 80, v: 9 }));
  const pe = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(pe.x === 80 && pe.y === 15 && pe.z === 80 && pe.v === 9, 'relay de bloques');
  a.ws.send(JSON.stringify({ t: 'edit', x: 1, y: 1, z: 1, v: 11 }));
  await wait(400);
  ok(!b.seen.some(m => m.t === 'pedit' && m.v === 11), 'bedrock por red bloqueado');
  // puerta (23↔24) y bloques nuevos (25, 26) viajan por la red como cualquier bloque
  a.ws.send(JSON.stringify({ t: 'edit', x: 81, y: 15, z: 80, v: 23 }));
  const pd1 = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(pd1.v === 23, 'relay de puerta cerrada (23)');
  a.ws.send(JSON.stringify({ t: 'edit', x: 81, y: 15, z: 80, v: 24 }));
  const pd2 = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(pd2.v === 24, 'relay de puerta abierta (24)');
  a.ws.send(JSON.stringify({ t: 'edit', x: 82, y: 15, z: 80, v: 26 }));
  const pd3 = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(pd3.v === 26, 'relay de bloque nuevo (26)');
  // puerta doble (bisagra espejada 27↔28) también viaja por la red
  a.ws.send(JSON.stringify({ t: 'edit', x: 83, y: 15, z: 80, v: 27 }));
  const pd4 = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(pd4.v === 27, 'relay de puerta doble (27)');
  // puerta orientada en Z (29↔30) también viaja por la red
  a.ws.send(JSON.stringify({ t: 'edit', x: 84, y: 15, z: 80, v: 29 }));
  const pd5 = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(pd5.v === 29, 'relay de puerta en Z (29)');

  // 5. daño PvP: víctima recibe phit + atacante recibe hitok
  // (los índices se capturan ANTES de mandar el hit: phit puede llegar primero)
  const nA = a.seen.length, nB2 = b.seen.length;
  a.ws.send(JSON.stringify({ t: 'hit', id: b.m.id, dmg: 1, dx: 1, dz: 0 }));
  const hitok = await nextOf(a.seen, nA, 'hitok');
  const phit = await nextOf(b.seen, nB2, 'phit');
  ok(hitok.id === b.m.id && hitok.dmg === 1, 'hitok al atacante');
  ok(phit.dmg === 1 && phit.from === 'Atac', 'phit a la víctima');

  // 6. chat
  a.ws.send(JSON.stringify({ t: 'chat', text: 'hola' }));
  const ch = await nextOf(b.seen, b.seen.length, 'chat');
  ok(ch.from === 'Atac' && ch.text === 'hola', 'chat');

  for (const c of [boss, a, b]) c.ws.close();
} catch (e) {
  console.log('❌ excepción: ' + e.message);
  fails++;
}
shutdown(0);
