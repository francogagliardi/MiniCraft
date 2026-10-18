// Test del prefijo de hora de Argentina en los logs (change hora-argentina-logs).
// Cubre las dos superficies: `server.js` (unión/salida, sobre el stdout REAL del
// server) y `bot/cazador.js` (golpe, con `log` inyectado).
//
// Nunca asierta contra el reloj real ni contra la TZ de la máquina: usa epochs
// FIJOS (`Date.UTC`) y el helper formatea con `timeZone:
// 'America/Argentina/Buenos_Aires'` (UTC−3 todo el año, sin DST).
//
// Uso: node test/hora-argentina.mjs   (sale con código != 0 si algo falla)
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(dir, '..');
const root = path.join(serverDir, '..');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '✅ ' : '❌ ') + msg); if (!cond) fails++; };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    let v = null; try { v = fn(); } catch (e) { v = null; }
    if (v) return v;
    await wait(25);
  }
  return null;
}

// ---- epochs FIJOS (Argentina = UTC−3 todo el año) ----
const EPOCH_2353 = Date.UTC(2026, 9, 17, 2, 53); // 17/10/2026 02:53 UTC ⇒ 23:53 en Argentina
const EPOCH_0000 = Date.UTC(2026, 9, 17, 3, 0);  // 17/10/2026 03:00 UTC ⇒ 00:00 en Argentina

// ---- extracción de los bloques marcados con `new Function` (patrón avatar-held.mjs) ----
const HORA_AR_START = '/* hora-ar:start */', HORA_AR_END = '/* hora-ar:end */';
// Devuelve { horaAr, FMT_AR } del bloque marcado de `src` (null si el bloque no existe).
function loadHoraAr(src) {
  const i = src.indexOf(HORA_AR_START), j = src.indexOf(HORA_AR_END);
  if (i < 0 || j < 0 || j < i) return null;
  return new Function(src.slice(i, j + HORA_AR_END.length) + '\n;return { horaAr, FMT_AR };')();
}
// La zona debe ser la de Argentina. `resolvedOptions()` devuelve el alias canónico
// `America/Buenos_Aires`, no el id de entrada: se toleran ambos nombres.
const ZONA_AR = ['America/Buenos_Aires', 'America/Argentina/Buenos_Aires'];
const srvSrc = fs.readFileSync(path.join(serverDir, 'server.js'), 'utf8');

// ---- bot: módulo PURO, sin red (createHunter con `log` capturado) ----
const HUNTER = require(path.join(root, 'bot', 'cazador.js'));
const botSrc = fs.readFileSync(path.join(root, 'bot', 'cazador.js'), 'utf8');
const GROUND = 30; // y de un mundo plano de test

// ---- server real: spawn + captura de stdout (patrón admin-hash.mjs) ----
// Puerto libre REAL (nada de hardcodear).
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}
// Levanta server.js con un mundo temporal (nunca el world.json real) y sin admin.
function startServer(env) {
  const world = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-hora-world-')), 'world.json');
  const base = { ...process.env };
  delete base.ADMIN_KEY;
  delete base.ADMIN_KEY_HASH;
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: serverDir,
    env: { ...base, WORLD_FILE: world, ADMIN_KEY: '', ADMIN_KEY_HASH: '', ...env },
  });
  let stdout = '', stderr = '';
  proc.stdout.on('data', d => { stdout += d; });
  proc.stderr.on('data', d => { stderr += d; });
  return { proc, world, out: () => stdout, err: () => stderr };
}
async function waitReady(port, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      await new Promise((res, rej) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        ws.on('open', () => { ws.close(); res(); });
        ws.on('error', rej);
      });
      return true;
    } catch (e) { await wait(150); }
  }
  return false;
}

try {
  // ==================== 1.1 helper horaAr en server.js (contrato determinista) ====================
  {
    const H = loadHoraAr(srvSrc);
    ok(!!H && typeof H.horaAr === 'function', 'server.js define el bloque hora-ar con horaAr()');
    if (H) {
      const got = H.horaAr(EPOCH_2353);
      ok(got === '[23:53] ', `horaAr(UTC 02:53) ⇒ '[23:53] ' (Argentina UTC−3) → ${JSON.stringify(got)}`);
      // medianoche: fija que `hour12:false` no renderice el quirk `24:00`
      const mid = H.horaAr(EPOCH_0000);
      ok(mid === '[00:00] ', `horaAr(UTC 03:00) ⇒ '[00:00] ' (medianoche, sin quirk 24:00) → ${JSON.stringify(mid)}`);
      // contrato de formato: prefijo completo, con el espacio final
      ok(/^\[\d{2}:\d{2}\] $/.test(got) && /^\[\d{2}:\d{2}\] $/.test(mid),
        'el prefijo cumple /^\\[\\d{2}:\\d{2}\\] $/ (HH:MM 24 h + espacio final)');
      // la zona del formatter es la de Argentina (tolerando el alias canónico)
      const tz = H.FMT_AR && H.FMT_AR.resolvedOptions && H.FMT_AR.resolvedOptions().timeZone;
      ok(ZONA_AR.includes(tz), `la zona del formatter es la de Argentina (${tz})`);
    }
  }

  // ==================== 1.1 comportamiento: unión/salida en el stdout REAL ====================
  {
    const port = await freePort();
    const s = startServer({ PORT: String(port) });
    try {
      if (!(await waitReady(port))) ok(false, 'el server levanta para el test de stdout');
      else {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        await new Promise((res, rej) => {
          ws.on('open', res);
          ws.on('error', rej);
        });
        ws.send(JSON.stringify({ t: 'hello', name: 'TZProbe', mode: 'player', skin: 'human' }));
        const join = await until(() => s.out().match(/^\[(\d{2}:\d{2})\] (➕ TZProbe \(player\) — \d+ conectados)$/m));
        ok(!!join, 'unión: la línea de stdout lleva `[HH:MM] ` con el texto original intacto detrás');
        if (join) ok(/^\d{2}:\d{2}$/.test(join[1]), `unión: el prefijo es una hora HH:MM (${join[1]})`);
        try { ws.close(); } catch (e) {}
        const leave = await until(() => s.out().match(/^\[(\d{2}:\d{2})\] (➖ TZProbe — \d+ conectados)$/m));
        ok(!!leave, 'salida: la línea de stdout lleva `[HH:MM] ` con el texto original intacto detrás');
        if (leave) ok(/^\d{2}:\d{2}$/.test(leave[1]), `salida: el prefijo es una hora HH:MM (${leave[1]})`);
      }
    } finally { try { s.proc.kill(); } catch (e) {} }
  }

  // ==================== 2.1 helper horaAr en bot/cazador.js (mismo contrato) ====================
  {
    const H = loadHoraAr(botSrc);
    ok(!!H && typeof H.horaAr === 'function', 'bot/cazador.js define el bloque hora-ar con horaAr()');
    if (H) {
      const got = H.horaAr(EPOCH_2353);
      ok(got === '[23:53] ', `horaAr del bot (UTC 02:53) ⇒ '[23:53] ' → ${JSON.stringify(got)}`);
    }
    ok(typeof HUNTER.horaAr === 'function', 'bot/cazador.js exporta horaAr en module.exports');
  }

  // ==================== 2.1 comportamiento: golpe del bot (log inyectado) ====================
  {
    const logs = [], sent = [];
    const h = HUNTER.createHunter({
      send: (f) => sent.push(f), log: (s) => logs.push(String(s)),
      now: () => EPOCH_2353, spawn: [100.5, GROUND, 100.5],
    });
    // presa viva no-admin a 1.5 u (dentro de CHASE_STOP ⇒ no se mueve y golpea en el tick)
    h.handle({ t: 'welcome', id: 1, players: [{ id: 2, name: 'Presa', mode: 'player', hp: 10, dead: 0, pos: [102, GROUND, 100.5] }] });
    h.tick(0.05);
    const golpe = logs.find(l => l.includes('golpe a'));
    ok(!!golpe, 'el bot loguea el golpe (escenario de sanidad)');
    if (golpe) {
      const m = golpe.match(/^\[(\d{2}:\d{2})\] (⚔️  golpe a Presa \(d=1\.50, seq=1\))$/);
      ok(!!m, 'golpe: la línea empieza con `[HH:MM] ` y el texto original queda intacto detrás');
      if (m) ok(m[1] === '23:53', `golpe: el prefijo es la hora de Argentina (${m[1]})`);
    }
    ok(sent.some(f => f.t === 'hit'), 'el golpe realmente salió por la red (sanidad del escenario)');
  }

  // ============= 2.3 anti-drift server↔bot (misma salida por epoch) + medianoche del bot =============
  {
    const S = loadHoraAr(srvSrc), B = loadHoraAr(botSrc);
    ok(!!S && !!B, 'anti-drift: existen las dos copias del helper (server y bot)');
    if (S && B) {
      // epochs variados: mismo instante ⇒ salida byte a byte idéntica en ambas copias
      const epochs = [EPOCH_2353, EPOCH_0000, Date.UTC(2026, 11, 31, 23, 59), Date.UTC(2027, 0, 1, 6, 30)];
      const drift = epochs.filter(e => S.horaAr(e) !== B.horaAr(e));
      ok(drift.length === 0, `anti-drift: las dos copias coinciden para el mismo epoch (${epochs.length} casos)`);
      const mid = B.horaAr(EPOCH_0000);
      ok(mid === '[00:00] ', `medianoche del bot (UTC 03:00) ⇒ '[00:00] ' → ${JSON.stringify(mid)}`);
    }
  }

  // ====== 3.1 comportamiento: el logger POR DEFECTO del bot no antepone `[bot]` ======
  // Levanta el bot REAL (`bot/index.js`) con un WebSocket falso y SIN inyectar `log`
  // (⇒ usa el logger por defecto) y captura `console.log`. Es el único camino que
  // prueba el comportamiento REAL del logger por defecto: el test de `createHunter`
  // (2.1) inyecta `log`, así que no ve el cableado de `index.js`. La hora DEBE ser el
  // primer carácter de la línea (pedido del usuario), sin ningún tag delante.
  {
    const { createBotClient } = require(path.join(root, 'bot', 'index.js'));
    // Mundo plano inyectado (determinismo: sin terreno que trabe el pathing).
    const flatWorld = () => ({
      W: 208, H: 40, topSolidY: () => GROUND, blocked: () => false, set() {},
      findSpawn: () => [100.5, GROUND, 100.5],
    });
    // WebSocket falso: sólo la superficie que usa el cableado (on/send/close/terminate).
    let fire = null, sock = null;
    class FakeWS {
      constructor() {
        this.readyState = FakeWS.OPEN;
        this.handlers = {};
        this.opened = false;
        sock = this;
        fire = (ev, ...args) => { for (const f of (this.handlers[ev] || [])) f(...args); };
        setTimeout(() => { this.opened = true; fire('open'); }, 0); // `open` async, como el real
      }
      on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
      send() {}
      close() {}
      terminate() {}
    }
    FakeWS.OPEN = 1;

    const origLog = console.log;
    const lines = [];
    console.log = (...a) => { lines.push(a.map(x => (typeof x === 'string' ? x : String(x))).join(' ')); };
    let client = null, opened = null;
    try {
      client = createBotClient({
        url: 'ws://fake', name: 'OPSX-bot', WebSocket: FakeWS,
        worldBuilder: flatWorld, now: () => EPOCH_2353, mvMs: 100000, // ticker fuera del test
      });
      client.start();
      opened = await until(() => sock && sock.opened); // `open` ya despachado (dentro de la captura)
      // welcome con una presa a 1.5 u (dentro de CHASE_STOP ⇒ golpea en el tick, sin acercarse)
      if (opened) fire('message', JSON.stringify({
        t: 'welcome', id: 1,
        players: [{ id: 2, name: 'Presa', mode: 'player', hp: 10, dead: 0, pos: [102, GROUND, 100.5] }],
      }));
      await until(() => client.getBot());
      if (client.getBot()) client.getBot().tick(0.05);
    } finally {
      console.log = origLog; // restaurar ANTES de asertar (los `ok` usan console.log)
      try { client && client.stop(); } catch (e) {}
    }
    ok(!!opened, 'bot real: el WebSocket falso emitió `open` y el bot quedó cableado');
    const golpe = lines.find(l => l.includes('golpe a'));
    ok(!!golpe, 'bot real + logger por defecto: loguea el golpe');
    if (golpe) {
      ok(/^\[\d{2}:\d{2}\] ⚔️  golpe a Presa \(d=1\.50, seq=1\)$/.test(golpe),
        `la línea del golpe EMPIEZA con [HH:MM] y no lleva ningún tag delante → ${JSON.stringify(golpe)}`);
      ok(golpe.startsWith('[23:53] '), `el reloj inyectado da 23:53 al inicio → ${JSON.stringify(golpe.slice(0, 8))}`);
      ok(golpe.indexOf('[bot]') < 0, 'la línea del golpe NO contiene el tag [bot]');
    }
  }
} catch (e) {
  console.log('❌ excepción: ' + (e && e.stack || e));
  fails++;
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 hora-argentina (logs con hora de Argentina) OK');
