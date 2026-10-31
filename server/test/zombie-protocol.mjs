// Test end-to-end del protocolo de zombis (server-auth): levanta el server de verdad
// de noche (ZOMBIE_FORCE_NIGHT=1) y verifica welcome.zom, difusión `zs`, el golpe
// `zhit`→`zhitok`, la ventana de muerte (~2 s) y que sin noche no aparece nada.
// Uso: node test/zombie-protocol.mjs   (sale con código != 0 si algo falla)
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const dir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(dir, '..');
const PORT = 3220;
const WORLD = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-zworld-')), 'world.json');
const PORT2 = 3221;
const WORLD2 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-zworld-')), 'world.json');
const TIMEOUT = 8000;

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));
// Espera hasta que `pred()` sea true (o se acabe el tiempo). Devuelve el veredicto.
async function waitUntil(pred, ms = TIMEOUT) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    let v = false;
    try { v = !!pred(); } catch (e) { v = false; }
    if (v) return true;
    await wait(50);
  }
  return false;
}

let srv, srv2;
function shutdown(code) {
  try { srv && srv.kill(); } catch (e) {}
  try { srv2 && srv2.kill(); } catch (e) {}
  if (fails || code) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
  console.log('\n🎉 protocolo de zombis OK');
  process.exit(0);
}
setTimeout(() => { console.log('❌ timeout global'); shutdown(1); }, 90000).unref();

async function hello(name, port = PORT) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const seen = [];
  await new Promise((res, rej) => {
    ws.on('open', res); ws.on('error', rej);
    setTimeout(() => rej(new Error('sin conexión')), TIMEOUT);
  });
  ws.on('message', (raw) => {
    try { seen.push(Object.assign(JSON.parse(raw), { _t: Date.now() })); } catch (e) {}
  });
  ws.send(JSON.stringify({ t: 'hello', name, mode: 'player', key: '' }));
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
  return null;
}
// Último snapshot de la horda recibido por un cliente (o null si no llegó ninguno).
function zsLatest(c) {
  const l = c.seen.filter(m => m.t === 'zs' && Array.isArray(m.z));
  return l.length ? l[l.length - 1] : null;
}
// Estado (en el último snapshot) de un id concreto de zombi.
function zState(c, id) {
  const s = zsLatest(c);
  return s ? (s.z.find(q => q.i === id) || null) : null;
}
async function serverReady(port) {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try {
      const probe = new WebSocket(`ws://localhost:${port}`);
      await new Promise((res, rej) => { probe.on('open', res); probe.on('error', rej); });
      probe.close(); return true;
    } catch (e) { await wait(200); }
  }
  return false;
}

// ---- server 1: noche forzada, intervalos cortos por env ----
srv = spawn(process.execPath, ['server.js'], {
  cwd: serverDir,
  env: {
    ...process.env, PORT: String(PORT), ADMIN_KEY: 'test-key', WORLD_FILE: WORLD,
    ZOMBIE_FORCE_NIGHT: '1', ZOMBIE_TICK_MS: '50', ZOMBIE_SNAP_MS: '100', TOD_INTERVAL_MS: '150',
  },
});
srv.stderr.on('data', d => process.stdout.write('[SRV-ERR] ' + d));
if (!(await serverReady(PORT))) { console.log('❌ el server no levantó'); shutdown(1); }

try {
  // 8.1 welcome.zom es un array y llegan `zs` con la misma horda para dos clientes
  const a = await hello('Ana');
  ok(Array.isArray(a.m.zom), 'welcome.zom es un array (nunca undefined)');

  const gotA = await waitUntil(() => { const s = zsLatest(a); return s && s.z.length > 0; });
  const zsA = zsLatest(a);
  ok(gotA && zsA.z.length >= 1, `llega zs con zombis de noche (${zsA ? zsA.z.length : 0})`);
  ok(zsA && zsA.z.every(z => Array.isArray(z.p) && z.p.length === 3 && z.i !== undefined),
    'cada zombi del zs trae id + posición');

  const b = await hello('Beto');
  const gotB = await waitUntil(() => { const s = zsLatest(b); return s && s.z.length > 0; });
  ok(gotB, 'el segundo cliente también recibe zs con zombis');

  await wait(300); // deja que ambos tomen el snapshot más reciente
  const la = zsLatest(a), lb = zsLatest(b);
  const idsA = la.z.map(z => z.i).slice().sort((x, y) => x - y);
  const idsB = lb.z.map(z => z.i).slice().sort((x, y) => x - y);
  ok(JSON.stringify(idsA) === JSON.stringify(idsB), 'misma horda (ids) difundida a los dos clientes');
  const posOk = idsA.every(i => {
    const pa = la.z.find(z => z.i === i).p, pb = lb.z.find(z => z.i === i).p;
    return Math.hypot(pa[0] - pb[0], pa[2] - pb[2]) < 3;
  });
  ok(posOk, 'misma posición (aprox) por id para ambos clientes');

  // 8.4a zhit fuera de alcance: no responde ni cambia la vida
  // (Ana sigue en su spawn [128.5,20,136.5]; los zombis spawnean a 18-32 bloques)
  const farZ = zsA.z[0];
  const nA0 = a.seen.length;
  a.ws.send(JSON.stringify({ t: 'zhit', id: farZ.i }));
  await wait(700);
  ok(!a.seen.slice(nA0).some(m => m.t === 'zhitok' && m.id === farZ.i),
    'zhit fuera de alcance no responde zhitok');
  const stillFull = zState(a, farZ.i);
  ok(stillFull && stillFull.hp === farZ.hp && stillFull.dead === 0,
    'zhit fuera de alcance no cambia la vida');

  // 8.3 golpe válido: Ana se acerca al zombi y manda zhit → zhitok con dmg:2 y hp 4
  const place = (c, z) => c.ws.send(JSON.stringify({
    t: 'mv', p: [z.p[0], z.p[1], z.p[2]], yaw: 0, pitch: 0, hp: 10, dead: 0,
  }));
  place(a, zState(a, farZ.i) || farZ);
  await wait(120);
  {
    const n = a.seen.length;
    a.ws.send(JSON.stringify({ t: 'zhit', id: farZ.i }));
    const tok = await nextOf(a.seen, n, 'zhitok');
    ok(!!tok && tok.id === farZ.i && tok.dmg === 2, 'zhitok al atacante con dmg:2');
    ok(!!tok && tok.hp === 4 && tok.dead === 0, 'el server aplica su daño (6→4), sin leer dmg del cliente');
  }
  {
    const nB = b.seen.length;
    const seenHp4 = await waitUntil(() =>
      b.seen.slice(nB).some(m => m.t === 'zs' && Array.isArray(m.z) && m.z.some(z => z.i === farZ.i && z.hp === 4)));
    ok(seenHp4, 'el zs siguiente refleja la vida nueva (4) para el otro cliente');
  }

  // 8.4b tres zhit válidos matan al zombi (6→4→2→0) y el muerto queda ~2 s en el zs
  const tDeathBox = { t: 0 };
  for (const expectHp of [2, 0]) {
    await wait(600); // > HIT_CD_MS (500) para que el cooldown no descarte el golpe
    const cur = zState(a, farZ.i);
    if (cur) place(a, cur);
    await wait(100);
    const n = a.seen.length;
    a.ws.send(JSON.stringify({ t: 'zhit', id: farZ.i }));
    const tok = await nextOf(a.seen, n, 'zhitok');
    ok(!!tok && tok.hp === expectHp, `golpe válido → hp ${expectHp}`);
    if (expectHp === 0) {
      ok(!!tok && tok.dead === 1, 'al llegar a 0 hp queda dead:1');
      tDeathBox.t = tok._t || Date.now();
    }
  }
  // el muerto sigue difundido con dead:1
  ok(await waitUntil(() => { const s = zState(a, farZ.i); return s && s.dead === 1; }),
    'el muerto sigue difundido con dead:1 durante la ventana');
  // zhit contra un zombi ya muerto se ignora (sin zhitok)
  {
    const n = a.seen.length;
    a.ws.send(JSON.stringify({ t: 'zhit', id: farZ.i }));
    await wait(700);
    ok(!a.seen.slice(n).some(m => m.t === 'zhitok'), 'zhit contra un zombi muerto se ignora');
  }
  // a ~1 s sigue tirado, y recién después de la ventana desaparece del zs
  ok(await waitUntil(() => { const s = zState(a, farZ.i); return s && s.dead === 1; }, 300),
    'a ~1 s el zombi muerto todavía está en el zs');
  const gone = await waitUntil(() => zState(a, farZ.i) === null, 6000);
  ok(gone, 'el id desaparece de zs tras la ventana de ~2 s');
  ok(gone && Date.now() - tDeathBox.t >= 1500, 'el retiro respeta la ventana (~2 s), no es inmediato');

  // 8.5 la víctima al alcance recibe phit (from 'Zombi', ZOMBIE_DMG, dx/dz) con cadencia ≥1 s
  // (con detección circular alcanza con estar dentro del radio + ATTACK_RANGE: la víctima
  // se ubica a 1.0 bloque del zombi, dentro del alcance de ataque)
  const others = (zsA.z.filter(z => z.i !== farZ.i));
  const targetId = others.length ? others[0].i : null;
  const nPh = a.seen.length;
  // OJO: la cadencia es POR ZOMBI (`z.lastAtk` en zombie.js:180), y TODOS los zombis se
  // llaman 'Zombi'. Filtrar por el nombre mezcla atacantes distintos: dos zombis pueden
  // golpear a la víctima con <1 s entre sí SIN violar nada. El server manda `fromId` en
  // cada `phit` (server.js:231), así que hay que agrupar por atacante y medir el cooldown
  // donde de verdad se aplica: entre dos golpes del MISMO zombi.
  const phitsOf = (seen) => seen.slice(nPh).filter(m => m.t === 'phit' && m.from === 'Zombi');
  // Gaps entre golpes consecutivos del mismo atacante (todos los que golpearon ≥2 veces).
  const selfGaps = (list) => {
    const by = new Map();
    for (const f of list) {
      const k = f.fromId ?? f.from;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(f._t);
    }
    return [...by.values()].filter(t => t.length >= 2).flatMap(t => t.slice(1).map((v, i) => v - t[i]));
  };
  await waitUntil(() => {
    const s = zsLatest(a);
    const z = targetId !== null
      ? (s && s.z.find(q => q.i === targetId && !q.dead))
      : (s && s.z.find(q => !q.dead));
    if (z) {
      a.ws.send(JSON.stringify({ t: 'mv', p: [z.p[0] + 1.0, z.p[1], z.p[2]], yaw: 0, pitch: 0, hp: 10, dead: 0 }));
    }
    // Se espera a que el MISMO zombi golpee dos veces: es lo único que mide el cooldown.
    return selfGaps(phitsOf(a.seen)).length >= 1;
  }, TIMEOUT);
  const phits = phitsOf(a.seen);
  ok(phits.length >= 1 && phits[0].dmg === 2 && (phits[0].dx !== 0 || phits[0].dz !== 0),
    'la víctima recibe phit (from Zombi, dmg 2, dx/dz no nulos)');
  const gaps = selfGaps(phits);
  if (gaps.length) {
    ok(gaps.every(g => g >= 950),
      `dos phit del MISMO zombi no llegan antes de 1 s (ATTACK_CD_MS) (gaps: ${gaps.join(', ')} ms)`);
  } else {
    ok(false, 'no llegaron dos phit del mismo zombi para medir la cadencia');
  }

  // 11.8 el contador `atk` del zombi que golpeó sube y lo ven los DOS clientes en el zs
  if (targetId !== null) {
    const atkOf = (c) => { const s = zState(c, targetId); return s && Number.isInteger(s.atk) ? s.atk : null; };
    const baseA = atkOf(a), baseB = atkOf(b);
    ok(baseA !== null && baseB !== null, `el zs trae el contador atk del zombi (a=${baseA} b=${baseB})`);
    const grew = await waitUntil(() => {
      const va = atkOf(a), vb = atkOf(b);
      return Number.isInteger(va) && Number.isInteger(vb) && va > (baseA ?? -1) && vb > (baseB ?? -1) && va === vb;
    }, TIMEOUT);
    ok(grew, `atk sube por golpe y es el mismo para ambos clientes (a=${atkOf(a)} b=${atkOf(b)})`);
  } else {
    ok(false, 'no hay un segundo zombi vivo para verificar el atk del golpe');
  }

  // 12.6 PvP: `held` + `seq` viajan por `mv`→`pm` y en el `welcome.players` del recién llegado
  {
    const n0 = b.seen.length;
    a.ws.send(JSON.stringify({ t: 'mv', p: [128.5, 20, 136.5], yaw: 0, pitch: 0, hp: 10, dead: 0, held: 100, seq: 1 }));
    const pm1 = await nextOf(b.seen, n0, 'pm');
    ok(!!pm1 && pm1.id === a.m.id && pm1.held === 100 && pm1.seq === 1,
      `B recibe el pm de A con held/seq (held=${pm1 && pm1.held} seq=${pm1 && pm1.seq})`);

    const n1 = b.seen.indexOf(pm1) + 1;
    a.ws.send(JSON.stringify({ t: 'mv', p: [128.6, 20, 136.5], yaw: 0, pitch: 0, hp: 10, dead: 0, held: 101, seq: 2 }));
    const pm2 = await nextOf(b.seen, n1, 'pm');
    ok(!!pm2 && pm2.held === 101 && pm2.seq === 2 && pm2.seq > (pm1 && pm1.seq),
      `el seq crece y el held cambia en el pm siguiente (held=${pm2 && pm2.held} seq=${pm2 && pm2.seq})`);

    // un cliente C que entra después ve el held/seq de A en welcome.players
    const nJoin = b.seen.length;
    const c = await hello('Ciro');
    const aInC = (c.m.players || []).find(p => p.id === a.m.id);
    ok(!!aInC && aInC.held === 101 && aInC.seq === 2,
      `el recién llegado ve held/seq de A en welcome.players (held=${aInC && aInC.held} seq=${aInC && aInC.seq})`);
    // y B recibe el join de C con los campos
    const jn = await nextOf(b.seen, nJoin, 'join');
    ok(!!jn && Number.isInteger(jn.held) && Number.isInteger(jn.seq),
      `B recibe el join del nuevo cliente con held/seq (held=${jn && jn.held} seq=${jn && jn.seq})`);

    // 12.7 un `mv` sin held/seq (cliente viejo) no rompe: el server conserva lo último y difunde
    const n2 = b.seen.length;
    a.ws.send(JSON.stringify({ t: 'mv', p: [128.7, 20, 136.5], yaw: 0, pitch: 0, hp: 10, dead: 0 }));
    const pm3 = await nextOf(b.seen, n2, 'pm');
    ok(!!pm3 && pm3.held === 101 && pm3.seq === 2,
      `mv sin held/seq (cliente viejo) no rompe y conserva lo último (held=${pm3 && pm3.held} seq=${pm3 && pm3.seq})`);
    try { c.ws.close(); } catch (e) {}
  }

  // 8.7 world.json sigue siendo exactamente { seed, edits } (sin campos de zombis)
  {
    const t0 = Date.now();
    while (Date.now() - t0 < 20000 && !fs.existsSync(WORLD)) await wait(200);
    let w = null;
    try { w = JSON.parse(fs.readFileSync(WORLD, 'utf8')); } catch (e) {}
    ok(!!w && typeof w.seed === 'number' && Array.isArray(w.edits), 'world.json escrito con { seed, edits }');
    ok(!!w && Object.keys(w).sort().join(',') === 'edits,seed',
      'world.json sin campos de zombis (' + (w ? Object.keys(w).join(',') : 'sin archivo') + ')');
  }
  // el script `test` corre los 4 archivos nuevos más los 6 existentes
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf8'));
    const s = pkg.scripts.test;
    const required = ['static', 'avatar', 'migrate', 'terrain', 'water', 'protocol', 'worldgen', 'zombie', 'zombie-client', 'zombie-protocol', 'avatar-held', 'client-robot', 'skins', 'camera', 'cactus', 'bot-cazador', 'lookguard', 'admin-hash', 'enter-chat', 'hora-argentina', 'config', 'bed-sleep'];
    const missing = required.filter(n => !new RegExp(`test/${n}\\.mjs`).test(s));
    ok(missing.length === 0, `npm test corre los 22 archivos (faltan: ${missing.join(', ') || 'ninguno'})`);
  }

  for (const c of [a, b]) { try { c.ws.close(); } catch (e) {} }
} catch (e) {
  console.log('❌ excepción: ' + e.message);
  fails++;
}

// ---- server 2: SIN noche forzada → no debe spawnear ni difundir zombis ----
// (phaseNow() está anclado al boot: al arrancar el reloj vale 0 = día pleno)
srv2 = spawn(process.execPath, ['server.js'], {
  cwd: serverDir,
  env: {
    ...process.env, PORT: String(PORT2), ADMIN_KEY: 'test-key', WORLD_FILE: WORLD2,
    ZOMBIE_TICK_MS: '50', ZOMBIE_SNAP_MS: '100', TOD_INTERVAL_MS: '150',
  },
});
srv2.stderr.on('data', d => process.stdout.write('[SRV2-ERR] ' + d));
try {
  if (!(await serverReady(PORT2))) { console.log('❌ el server de día no levantó'); fails++; }
  else {
    const c2 = await hello('Dia', PORT2);
    ok(Array.isArray(c2.m.zom) && c2.m.zom.length === 0, 'sin noche: welcome.zom vacío (array)');
    await wait(1500); // varios ticks y snapshots
    ok(!c2.seen.some(m => m.t === 'zs' && Array.isArray(m.z) && m.z.length > 0),
      'sin noche: no se difunde ningún zs con zombis (el spawn depende de isNight)');
    try { c2.ws.close(); } catch (e) {}
  }
} catch (e) {
  console.log('❌ excepción (server de día): ' + e.message);
  fails++;
}

shutdown(0);
