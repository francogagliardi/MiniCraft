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

async function hello(name, mode, key = '', port = PORT) {
  const ws = new WebSocket(`ws://localhost:${port}`);
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
  // ciclo-dia-noche: welcome expone la hora del ciclo (tod) y su duración (cyc)
  ok(typeof boss.m.tod === 'number' && boss.m.tod >= 0 && boss.m.tod < 1, 'welcome trae tod en [0,1)');
  {
    // cyc = DAY_MS + NIGHT_MS declarado por el server (tuneable)
    const srvSrc = fs.readFileSync(path.join(serverDir, 'server.js'), 'utf8');
    const dm = srvSrc.match(/const DAY_MS = (\d+), NIGHT_MS = (\d+), CYCLE_MS = DAY_MS \+ NIGHT_MS/);
    const expCyc = dm ? +dm[1] + +dm[2] : null;
    ok(!!dm && boss.m.cyc === expCyc, `welcome trae cyc = DAY_MS+NIGHT_MS (${expCyc})`);
  }

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
  // escaleras 39-58: las 20 variantes viajan por la red como cualquier bloque
  for (let v = 39; v <= 58; v++) {
    a.ws.send(JSON.stringify({ t: 'edit', x: 80 + (v - 39), y: 16, z: 81, v }));
    const pe2 = await nextOf(b.seen, b.seen.length, 'pedit');
    ok(pe2.v === v, `relay de escalera (${v})`);
  }

  // 4b. mundo 208: borde nuevo aceptado, fuera de bordes rechazado, stride 208
  a.ws.send(JSON.stringify({ t: 'edit', x: 207, y: 15, z: 207, v: 9 }));
  const peEdge = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(peEdge.x === 207 && peEdge.z === 207, 'edit en borde 207 aceptado y replicado');
  a.ws.send(JSON.stringify({ t: 'edit', x: 208, y: 15, z: 80, v: 9 }));
  await wait(400);
  ok(!b.seen.some(m => m.t === 'pedit' && m.x === 208), 'edit x=208 rechazado');
  a.ws.send(JSON.stringify({ t: 'edit', x: 80, y: 40, z: 80, v: 9 }));
  await wait(400);
  ok(!b.seen.some(m => m.t === 'pedit' && m.y === 40), 'edit y=40 rechazado');
  const wit = await hello('Testigo', 'player');
  const edgeIdx = (15 * 208 + 207) * 208 + 207;
  ok(wit.m.edits.some(e => Array.isArray(e) && e[0] === edgeIdx && e[1] === 9),
    `índice persistido con stride 208 (${edgeIdx})`);
  wit.ws.close();

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

  // 7. sin fantasmas: sesión sin `mv` expira con `leave`, sesión viva con `mv` no
  // (segundo server con intervalos acortados por env: HB 200ms / idle 800ms)
  {
    const PORT2 = 3211;
    const WORLD2 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-world-')), 'world.json');
    const srv2 = spawn(process.execPath, ['server.js'], {
      cwd: serverDir,
      env: { ...process.env, PORT: String(PORT2), ADMIN_KEY: 'test-key', WORLD_FILE: WORLD2, HB_INTERVAL_MS: '200', IDLE_TIMEOUT_MS: '800', TOD_INTERVAL_MS: '150' },
    });
    srv2.stderr.on('data', d => process.stdout.write('[SRV2-ERR] ' + d));
    let keepObs = null, keepVivo = null;
    try {
      {
        const t0 = Date.now();
        let ready2 = false;
        while (Date.now() - t0 < 15000) {
          try {
            const probe = new WebSocket(`ws://localhost:${PORT2}`);
            await new Promise((res, rej) => { probe.on('open', res); probe.on('error', rej); });
            probe.close(); ready2 = true; break;
          } catch (e) { await wait(200); }
        }
        ok(ready2, 'server con intervalos cortos levanta');
      }
      const hello2 = (name) => hello(name, 'player', '', PORT2);
      const obs2 = await hello2('Obs2');
      // ciclo-dia-noche: el server difunde `tod` periódicamente (TOD_INTERVAL_MS corto por env)
      {
        const t0 = Date.now();
        let tod = null;
        while (Date.now() - t0 < TIMEOUT) {
          tod = obs2.seen.find(m => m.t === 'tod');
          if (tod) break;
          await wait(50);
        }
        ok(!!tod && typeof tod.v === 'number' && tod.v >= 0 && tod.v < 1,
          'difusión periódica de tod (v en [0,1))');
      }
      const ghost2 = await hello2('Fantasma');
      const vivo = await hello2('Vivo');
      const nObs = obs2.seen.length;
      // observador y viva mandan `mv` periódico → no deben expirar
      const mv = (c) => { try { c.ws.send(JSON.stringify({ t: 'mv', p: [90, 20, 90], yaw: 0, pitch: 0 })); } catch (e) {} };
      keepObs = setInterval(() => mv(obs2), 150);
      keepVivo = setInterval(() => mv(vivo), 150);
      // el fantasma no manda nada → debe expirar con `leave` una sola vez
      {
        const t0 = Date.now();
        let leaves = [];
        while (Date.now() - t0 < TIMEOUT) {
          leaves = obs2.seen.slice(nObs).filter(m => m.t === 'leave' && m.id === ghost2.m.id);
          if (leaves.length >= 1) break;
          await wait(100);
        }
        ok(leaves.length === 1, 'conexión muerta sin `mv` expira con un solo `leave`');
      }
      // la viva sigue: su `mv` llega al observador y no recibe `leave`
      const nObs2 = obs2.seen.length;
      vivo.ws.send(JSON.stringify({ t: 'mv', p: [91, 20, 91], yaw: 0, pitch: 0 }));
      {
        const t1 = Date.now();
        let pmVivo = null;
        while (Date.now() - t1 < TIMEOUT) {
          pmVivo = obs2.seen.slice(nObs2).find(m => m.t === 'pm' && m.id === vivo.m.id);
          if (pmVivo) break;
          await wait(50);
        }
        ok(!!pmVivo, 'conexión viva que manda `mv` sigue activa (relay ok)');
      }
      ok(!obs2.seen.slice(nObs).some(m => m.t === 'leave' && m.id === vivo.m.id),
        'conexión viva no expira');
      for (const c of [obs2, ghost2, vivo]) try { c.ws.close(); } catch (e) {}
    } finally {
      if (keepObs) clearInterval(keepObs);
      if (keepVivo) clearInterval(keepVivo);
      try { srv2.kill(); } catch (e) {}
    }
  }

  // 8. el reloj del ciclo NO se persiste: world.json queda como { seed, edits }
  // (el server guarda cada 15 s; el resto de la suite ya corrió, así que esperamos poco)
  {
    const t0 = Date.now();
    while (Date.now() - t0 < 17000 && !fs.existsSync(WORLD)) await wait(200);
    let w = null;
    try { w = JSON.parse(fs.readFileSync(WORLD, 'utf8')); } catch (e) {}
    ok(!!w && typeof w.seed === 'number' && Array.isArray(w.edits), 'world.json escrito con { seed, edits }');
    ok(!!w && Object.keys(w).sort().join(',') === 'edits,seed',
      'world.json sin campos de ciclo/reloj (' + (w ? Object.keys(w).join(',') : 'sin archivo') + ')');
  }

  for (const c of [boss, a, b]) c.ws.close();
} catch (e) {
  console.log('❌ excepción: ' + e.message);
  fails++;
}
shutdown(0);
