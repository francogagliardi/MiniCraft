// Test del prefijo de hora de Argentina en los logs (change hora-argentina-logs).
// Cubre las dos superficies: `server/app.js` (unión/salida, sobre el stdout REAL
// del server) y `server/bot-runtime.js` (golpe de un bot in-process).
//
// Nunca asierta contra el reloj real ni contra la TZ de la máquina: usa epochs
// FIJOS (`Date.UTC`) y el helper formatea con `timeZone:
// 'America/Argentina/Buenos_Aires'` (UTC−3 todo el año, sin DST).
//
// Uso: node test/hora-argentina.mjs   (sale con código != 0 si algo falla)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { startApp, connect } from './support/app-fixture.mjs';
import { MemoryStore } from './support/memory-store.mjs';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(dir, '..');
const root = path.join(serverDir, '..');

const BotRuntime = require('../bot-runtime.js');

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
const GROUND = 30; // y de un mundo plano de test

// ---- extracción de los bloques marcados con `new Function` (patrón avatar-held.mjs) ----
const HORA_AR_START = '/* hora-ar:start */', HORA_AR_END = '/* hora-ar:end */';
function loadHoraAr(src) {
  const i = src.indexOf(HORA_AR_START), j = src.indexOf(HORA_AR_END);
  if (i < 0 || j < 0 || j < i) return null;
  return new Function(src.slice(i, j + HORA_AR_END.length) + '\n;return { horaAr, FMT_AR };')();
}
const ZONA_AR = ['America/Buenos_Aires', 'America/Argentina/Buenos_Aires'];
const srvSrc = fs.readFileSync(path.join(serverDir, 'app.js'), 'utf8');
const rtSrc = fs.readFileSync(path.join(serverDir, 'bot-runtime.js'), 'utf8');

// Runtime con mundo plano y una presa a 1.5 u (dentro del umbral de golpe).
function runtimeAt(epoch, { log } = {}) {
  const store = new MemoryStore({ now: () => epoch });
  const rt = BotRuntime.create({
    store,
    world: { W: 208, H: 40, surface: 10, topSolidY: () => GROUND, freeForMob: () => true },
    env: {}, now: () => epoch, ...(log ? { log } : {}), warn: () => {},
    getPlayers: () => [{ id: 2, name: 'Presa', pos: [102, GROUND, 100.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }],
    broadcast: () => {}, sendToPlayer: () => {},
  });
  const bot = rt.spawn({
    id: 1, name: 'OPSX-bot', behavior: 'cazador', skin: 'robot', hp: 10,
    damage: 6, reach: 4.6, speed: 28.8, flying: true, takesDamage: false,
  });
  bot.pos = [100.5, GROUND, 100.5];
  return rt;
}

// ---- server real: createApp EN PROCESO con log capturado ----
const lines = [];
function startServer(env) {
  return startApp({
    users: [{ username: 'TZProbe', password: 'password-123' }],
    env,
    log: (...a) => { lines.push(a.join(' ')); },
    warn: (...a) => { lines.push(a.join(' ')); },
  });
}

try {
  // ==================== 1.1 helper horaAr en app.js (contrato determinista) ====================
  {
    const H = loadHoraAr(srvSrc);
    ok(!!H && typeof H.horaAr === 'function', 'app.js define el bloque hora-ar con horaAr()');
    if (H) {
      const got = H.horaAr(EPOCH_2353);
      ok(got === '[23:53] ', `horaAr(UTC 02:53) ⇒ '[23:53] ' (Argentina UTC−3) → ${JSON.stringify(got)}`);
      const mid = H.horaAr(EPOCH_0000);
      ok(mid === '[00:00] ', `horaAr(UTC 03:00) ⇒ '[00:00] ' (medianoche, sin quirk 24:00) → ${JSON.stringify(mid)}`);
      ok(/^\[\d{2}:\d{2}\] $/.test(got) && /^\[\d{2}:\d{2}\] $/.test(mid),
        'el prefijo cumple /^\\[\\d{2}:\\d{2}\\] $/ (HH:MM 24 h + espacio final)');
      const tz = H.FMT_AR && H.FMT_AR.resolvedOptions && H.FMT_AR.resolvedOptions().timeZone;
      ok(ZONA_AR.includes(tz), `la zona del formatter es la de Argentina (${tz})`);
    }
  }

  // ==================== 1.1 comportamiento: unión/salida en el log REAL ====================
  {
    const s = await startServer({});
    try {
      const cookie = await s.login('TZProbe', 'password-123');
      const c = await connect(s.wsUrl(), { headers: { Cookie: cookie } });
      c.ws.send(JSON.stringify({ t: 'hello', name: 'TZProbe', mode: 'player', skin: 'human' }));
      const join = await until(() => lines.find(l => /^\[(\d{2}:\d{2})\] (➕ TZProbe \(player\) — \d+ conectados)$/.test(l)));
      ok(!!join, 'unión: la línea de log lleva `[HH:MM] ` con el texto original intacto detrás');
      try { c.ws.close(); } catch (e) {}
      const leave = await until(() => lines.find(l => /^\[(\d{2}:\d{2})\] (➖ TZProbe — \d+ conectados)$/.test(l)));
      ok(!!leave, 'salida: la línea de log lleva `[HH:MM] ` con el texto original intacto detrás');
    } finally { await s.close(); }
  }

  // ==================== 2.1 helper horaAr en bot-runtime.js (mismo contrato) ====================
  {
    const H = loadHoraAr(rtSrc);
    ok(!!H && typeof H.horaAr === 'function', 'bot-runtime.js define el bloque hora-ar con horaAr()');
    if (H) {
      const got = H.horaAr(EPOCH_2353);
      ok(got === '[23:53] ', `horaAr del runtime (UTC 02:53) ⇒ '[23:53] ' → ${JSON.stringify(got)}`);
    }
    ok(typeof BotRuntime.horaAr === 'function', 'bot-runtime.js exporta horaAr en module.exports');
  }

  // ==================== 2.2 comportamiento: golpe del bot (log inyectado) ====================
  {
    const logs = [];
    const rt = runtimeAt(EPOCH_2353, { log: (...a) => logs.push(a.join(' ')) });
    rt.tick(0.05);
    const golpe = logs.find(l => l.includes('golpe a'));
    ok(!!golpe, 'el runtime loguea el golpe (escenario de sanidad)');
    if (golpe) {
      const m = golpe.match(/^\[(\d{2}:\d{2})\] (⚔️  golpe a Presa \(d=1\.50, seq=1\))$/);
      ok(!!m, 'golpe: la línea empieza con `[HH:MM] ` y el texto original queda intacto detrás');
      if (m) ok(m[1] === '23:53', `golpe: el prefijo es la hora de Argentina (${m[1]})`);
    }
    rt.close();
  }

  // ============= 2.3 anti-drift app↔runtime (misma salida por epoch) + medianoche =============
  {
    const S = loadHoraAr(srvSrc), B = loadHoraAr(rtSrc);
    ok(!!S && !!B, 'anti-drift: existen las dos copias del helper (app y runtime)');
    if (S && B) {
      const epochs = [EPOCH_2353, EPOCH_0000, Date.UTC(2026, 11, 31, 23, 59), Date.UTC(2027, 0, 1, 6, 30)];
      const drift = epochs.filter(e => S.horaAr(e) !== B.horaAr(e));
      ok(drift.length === 0, `anti-drift: las dos copias coinciden para el mismo epoch (${epochs.length} casos)`);
      const mid = B.horaAr(EPOCH_0000);
      ok(mid === '[00:00] ', `medianoche del runtime (UTC 03:00) ⇒ '[00:00] ' → ${JSON.stringify(mid)}`);
    }
  }

  // ====== 3.1 comportamiento: el logger POR DEFECTO del runtime no antepone `[bot]` ======
  {
    const origLog = console.log;
    const captured = [];
    console.log = (...a) => { captured.push(a.map(x => (typeof x === 'string' ? x : String(x))).join(' ')); };
    let rt = null;
    try {
      rt = runtimeAt(EPOCH_2353); // sin `log` inyectado ⇒ logger por defecto
      rt.tick(0.05);
    } finally {
      console.log = origLog; // restaurar ANTES de asertar (los `ok` usan console.log)
      try { rt && rt.close(); } catch (e) {}
    }
    const golpe = captured.find(l => l.includes('golpe a'));
    ok(!!golpe, 'runtime real + logger por defecto: loguea el golpe');
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
