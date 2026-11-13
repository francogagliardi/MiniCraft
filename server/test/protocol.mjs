// Test end-to-end del protocolo multijugador: levanta createApp EN PROCESO con
// MemoryStore, autentica por POST /api/login y usa la cookie en el upgrade.
// Verifica welcome, movimiento, bloques, daño PvP, muerte, chat, sueño, zombis
// y el ping/pong de aplicación (aditivo, eco solo al emisor).
// Uso: node test/protocol.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startApp, connect, sleep as wait } from './support/app-fixture.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(dir, '..');
const TIMEOUT = 8000;

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

async function nextOf(seen, from, type) {
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT) {
    const i = seen.findIndex((m, k) => k >= from && m.t === type);
    if (i >= 0) return seen[i];
    await wait(50);
  }
  throw new Error('no llegó ' + type);
}
async function waitFor(seen, pred, from = 0) {
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT) {
    const m = seen.slice(from).find(pred);
    if (m) return m;
    await wait(50);
  }
  return null;
}
async function waitWelcome(seen) {
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT) {
    const w = seen.find(m => m.t === 'welcome');
    if (w) return w;
    await wait(50);
  }
  throw new Error('sin welcome');
}

async function userSession(app, username, password, helloExtra = {}) {
  const cookie = await app.login(username, password);
  const r = await connect(app.wsUrl(), { headers: { Cookie: cookie } });
  if (r.status !== 101) throw new Error('upgrade rechazado ' + r.status);
  const seen = [];
  r.ws.on('message', (raw) => { try { seen.push(JSON.parse(raw.toString())); } catch (e) {} });
  r.ws.send(JSON.stringify({ t: 'hello', name: username, mode: 'player', ...helloExtra }));
  const m = await waitWelcome(seen);
  return { ws: r.ws, m, seen };
}

// El bot de servicio se retiró: una sesión de cookie que intente declararse
// `bot:true` es un usuario normal (el hello no otorga identidad de bot).
async function spoofedBotSession(app, name) {
  return userSession(app, name, 'password-123', { bot: true });
}

const USERS = [
  { username: 'Jefe', password: 'admin-12345', role: 'admin' },
  { username: 'Atac', password: 'password-123' },
  { username: 'Vict', password: 'password-123' },
  { username: 'Testigo', password: 'password-123' },
  { username: 'BotZzz', password: 'password-123' },
  { username: 'Diurno', password: 'password-123' },
];

const FIX = await startApp({ users: USERS });
try {
  // 1. admin por rol de sesión (sin clave)
  const boss = await userSession(FIX, 'Jefe', 'admin-12345');
  ok(boss.m.admin === true && boss.m.mode === undefined, 'admin por rol de sesión → aceptado');
  ok(typeof boss.m.seed === 'number' && Array.isArray(boss.m.edits), 'welcome trae seed + edits');
  ok(typeof boss.m.tod === 'number' && boss.m.tod >= 0 && boss.m.tod < 1, 'welcome trae tod en [0,1)');
  {
    const srvSrc = fs.readFileSync(path.join(serverDir, 'app.js'), 'utf8');
    const dm = srvSrc.match(/const DAY_MS = (\d+), NIGHT_MS = (\d+), CYCLE_MS = DAY_MS \+ NIGHT_MS/);
    const expCyc = dm ? +dm[1] + +dm[2] : null;
    ok(!!dm && boss.m.cyc === expCyc, `welcome trae cyc = DAY_MS+NIGHT_MS (${expCyc})`);
  }

  // 2. jugador y lista de jugadores
  const a = await userSession(FIX, 'Atac', 'password-123');
  const b = await userSession(FIX, 'Vict', 'password-123');
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
  a.ws.send(JSON.stringify({ t: 'edit', x: 81, y: 15, z: 80, v: 23 }));
  const pd1 = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(pd1.v === 23, 'relay de puerta cerrada (23)');
  a.ws.send(JSON.stringify({ t: 'edit', x: 81, y: 15, z: 80, v: 24 }));
  const pd2 = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(pd2.v === 24, 'relay de puerta abierta (24)');
  a.ws.send(JSON.stringify({ t: 'edit', x: 82, y: 15, z: 80, v: 26 }));
  const pd3 = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(pd3.v === 26, 'relay de bloque nuevo (26)');
  a.ws.send(JSON.stringify({ t: 'edit', x: 83, y: 15, z: 80, v: 27 }));
  const pd4 = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(pd4.v === 27, 'relay de puerta doble (27)');
  a.ws.send(JSON.stringify({ t: 'edit', x: 84, y: 15, z: 80, v: 29 }));
  const pd5 = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(pd5.v === 29, 'relay de puerta en Z (29)');
  for (let v = 39; v <= 58; v++) {
    a.ws.send(JSON.stringify({ t: 'edit', x: 80 + (v - 39), y: 16, z: 81, v }));
    const pe2 = await nextOf(b.seen, b.seen.length, 'pedit');
    ok(pe2.v === v, `relay de escalera (${v})`);
  }

  // 4b. mundo 208
  a.ws.send(JSON.stringify({ t: 'edit', x: 207, y: 15, z: 207, v: 9 }));
  const peEdge = await nextOf(b.seen, b.seen.length, 'pedit');
  ok(peEdge.x === 207 && peEdge.z === 207, 'edit en borde 207 aceptado y replicado');
  a.ws.send(JSON.stringify({ t: 'edit', x: 208, y: 15, z: 80, v: 9 }));
  await wait(400);
  ok(!b.seen.some(m => m.t === 'pedit' && m.x === 208), 'edit x=208 rechazado');
  a.ws.send(JSON.stringify({ t: 'edit', x: 80, y: 40, z: 80, v: 9 }));
  await wait(400);
  ok(!b.seen.some(m => m.t === 'pedit' && m.y === 40), 'edit y=40 rechazado');
  const wit = await userSession(FIX, 'Testigo', 'password-123');
  const edgeIdx = (15 * 208 + 207) * 208 + 207;
  ok(wit.m.edits.some(e => Array.isArray(e) && e[0] === edgeIdx && e[1] === 9),
    `índice persistido con stride 208 (${edgeIdx})`);
  wit.ws.close();

  // 5. daño PvP
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

  // 6b. latencia de aplicación
  {
    const nA2 = a.seen.length, nB3 = b.seen.length;
    a.ws.send(JSON.stringify({ t: 'ping', ts: 12345 }));
    const pong = await nextOf(a.seen, nA2, 'pong');
    ok(pong.ts === 12345, 'el server responde pong con el mismo ts (12345)');
    await wait(300);
    ok(!b.seen.slice(nB3).some(m => m.t === 'pong' || m.t === 'ping'),
      'los demás jugadores no reciben ni el ping ni su pong');
    const nNoTs = a.seen.length;
    a.ws.send(JSON.stringify({ t: 'ping' }));
    await wait(300);
    ok(!a.seen.slice(nNoTs).some(m => m.t === 'pong'), 'un ping sin ts no responde');
    a.ws.send(JSON.stringify({ t: 'tipo-inexistente', x: 1 }));
    await wait(300);
    ok(a.ws.readyState === 1, 'un tipo de mensaje desconocido no cierra la conexión');
    const nVivo = b.seen.length;
    a.ws.send(JSON.stringify({ t: 'mv', p: [81, 20, 88], yaw: 1, pitch: 0, hp: 10, dead: 0 }));
    const pmVivo = await nextOf(b.seen, nVivo, 'pm');
    ok(pmVivo.id === a.m.id && pmVivo.p[0] === 81, 'después de un ts inválido la sesión sigue viva (mv → pm)');
  }

  // 7. sin fantasmas (segunda app con intervalos cortos)
  {
    const app2 = await startApp({
      users: [
        { username: 'Obs2', password: 'password-123' },
        { username: 'Fantasma', password: 'password-123' },
        { username: 'Vivo', password: 'password-123' },
      ],
      env: { HB_INTERVAL_MS: '200', IDLE_TIMEOUT_MS: '800', TOD_INTERVAL_MS: '150' },
    });
    try {
      ok(true, 'server con intervalos cortos levanta');
      const obs2 = await userSession(app2, 'Obs2', 'password-123');
      {
        const t0 = Date.now();
        let tod = null;
        while (Date.now() - t0 < TIMEOUT) {
          tod = obs2.seen.find(m => m.t === 'tod');
          if (tod) break;
          await wait(50);
        }
        ok(!!tod && typeof tod.v === 'number' && tod.v >= 0 && tod.v < 1, 'difusión periódica de tod (v en [0,1))');
      }
      const ghost2 = await userSession(app2, 'Fantasma', 'password-123');
      const vivo = await userSession(app2, 'Vivo', 'password-123');
      const nObs = obs2.seen.length;
      const mv = (c) => { try { c.ws.send(JSON.stringify({ t: 'mv', p: [90, 20, 90], yaw: 0, pitch: 0 })); } catch (e) {} };
      const keepObs = setInterval(() => mv(obs2), 150);
      const keepVivo = setInterval(() => mv(vivo), 150);
      try {
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
        ok(!obs2.seen.slice(nObs).some(m => m.t === 'leave' && m.id === vivo.m.id), 'conexión viva no expira');
      } finally {
        clearInterval(keepObs);
        clearInterval(keepVivo);
      }
      for (const c of [obs2, ghost2, vivo]) try { c.ws.close(); } catch (e) {}
    } finally { await app2.close(); }
  }

  // 8. el reloj del ciclo NO se persiste
  {
    const WORLD = FIX.app.worldFile;
    const t0 = Date.now();
    while (Date.now() - t0 < 17000 && !fs.existsSync(WORLD)) await wait(200);
    let w = null;
    try { w = JSON.parse(fs.readFileSync(WORLD, 'utf8')); } catch (e) {}
    ok(!!w && typeof w.seed === 'number' && Array.isArray(w.edits), 'world.json escrito con { seed, edits }');
    ok(!!w && Object.keys(w).sort().join(',') === 'edits,seed',
      'world.json sin campos de ciclo/reloj (' + (w ? Object.keys(w).join(',') : 'sin archivo') + ')');
  }

  // 9. sueño: welcome, rechazo diurno y hello con bot:true ignorado
  {
    const zzz = await spoofedBotSession(FIX, 'BotZzz');
    ok(Array.isArray(zzz.m.sleeping) && typeof zzz.m.sleepNeed === 'number', 'welcome trae sleeping + sleepNeed');
    const expected = zzz.m.players.filter(p => p.mode === 'player' && !p.dead).length + 1;
    ok(zzz.m.sleepNeed === expected,
      `un usuario de cookie con bot:true cuenta como real (need=${zzz.m.sleepNeed}, reales=${expected})`);
    const diurno = await userSession(FIX, 'Diurno', 'password-123');
    const nD = diurno.seen.length;
    diurno.ws.send(JSON.stringify({ t: 'sleep', x: 10, y: 10, z: 10 }));
    const denied = await waitFor(diurno.seen, m => m.t === 'sleep' && m.id === diurno.m.id, nD);
    ok(!!denied && denied.denied === 'day' && denied.on === false, 'de día el server rechaza el sueño (denied:day)');
    zzz.ws.close(); diurno.ws.close();
  }

  // 10. salto al amanecer (tercera app: noche forzada y tick alto)
  {
    const app3 = await startApp({
      users: [
        { username: 'Somnia', password: 'password-123' },
        { username: 'Rem', password: 'password-123' },
      ],
      env: {
        ZOMBIE_FORCE_NIGHT: '1', ZOMBIE_TICK_MS: '60000', ZOMBIE_SNAP_MS: '60000', TOD_INTERVAL_MS: '60000',
      },
    });
    try {
      ok(true, 'server nocturno de prueba levanta');
      const h1 = await userSession(app3, 'Somnia', 'password-123');
      const h2 = await userSession(app3, 'Rem', 'password-123');
      ok(h2.m.sleepNeed === 2, `need cuenta solo a los dos jugadores reales (${h2.m.sleepNeed})`);
      const n1 = h1.seen.length;
      h1.ws.send(JSON.stringify({ t: 'sleep', x: 10, y: 10, z: 10 }));
      const on1 = await waitFor(h1.seen, m => m.t === 'sleep' && m.id === h1.m.id && m.on === true, n1);
      ok(!!on1 && on1.count === 1 && on1.need === 2, 'primer durmiente 1/2');
      const n1b = h1.seen.length;
      h2.ws.send(JSON.stringify({ t: 'edit', x: 10, y: 10, z: 10, v: 0 }));
      const woke = await waitFor(h1.seen, m => m.t === 'sleep' && m.id === h1.m.id && m.on === false, n1b);
      ok(!!woke, 'romper la cama despierta al durmiente');
      const n2 = h2.seen.length;
      h1.ws.send(JSON.stringify({ t: 'sleep', x: 11, y: 10, z: 10 }));
      await waitFor(h1.seen, m => m.t === 'sleep' && m.id === h1.m.id && m.on === true, 0);
      h2.ws.send(JSON.stringify({ t: 'sleep', x: 12, y: 10, z: 10 }));
      const reset = await waitFor(h2.seen, m => m.t === 'sleep' && m.reset === true, n2);
      ok(!!reset, 'al dormir todos llega el reset del sueño');
      const dawn = await waitFor(h2.seen, m => m.t === 'tod' && m.v < 0.5, n2);
      ok(!!dawn && dawn.v >= 0 && dawn.v < 0.1, `el tod salta al amanecer (${dawn && dawn.v})`);
      const chatDawn = await waitFor(h2.seen, m => m.t === 'chat' && /Amaneció/.test(m.text || ''), n2);
      ok(!!chatDawn, 'aviso de amanecer por chat');
      ok(h2.m.sleepNeed === 2, `sin bots el quórum es de dos (need=${h2.m.sleepNeed})`);
      for (const c of [h1, h2]) try { c.ws.close(); } catch (e) {}
    } finally { await app3.close(); }
  }

  for (const c of [boss, a, b]) try { c.ws.close(); } catch (e) {}
} catch (e) {
  console.log('❌ excepción: ' + (e && e.stack || e));
  fails++;
} finally {
  await FIX.close();
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 protocolo OK');
