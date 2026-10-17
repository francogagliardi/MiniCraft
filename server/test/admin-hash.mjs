// Test del módulo de verificación de clave admin (PBKDF2) + e2e WS.
// Cubre: makeHash/verifyAdminKey, formato autodescriptivo, anti pass-the-hash,
// precedencia hash-vs-claro, fail-closed, limitador (token bucket + concurrencia)
// y el cableado real de `server.js` (incluido el e2e del flood del KDF).
// Uso: node test/admin-hash.mjs   (sale con código != 0 si algo falla)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(dir, '..');

// ---- helpers del e2e ----
// Puerto libre REAL (nada de hardcodear 3210/3220: deuda conocida del repo).
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
// Levanta server.js con un mundo temporal (nunca el world.json real).
function startServer(env) {
  const world = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-admin-world-')), 'world.json');
  // Se limpian las vars de admin heredadas del shell y se fuerza un default
  // explícito: la config del test es determinista (env gana).
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
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(pred, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return true; await wait(50); }
  return false;
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
// Un `hello` y espera el `welcome`. Devuelve { ws, m, at } (at = recepción).
function helloWS(port, name, mode, key) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; try { ws.terminate(); } catch (e) {}
      reject(new Error('sin welcome para ' + name));
    }, 8000);
    ws.on('error', (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name, mode, key })));
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.t === 'welcome' && !settled) {
        settled = true; clearTimeout(timer); resolve({ ws, m, at: Date.now() });
      }
    });
  });
}

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};
function failed() {
  if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
  console.log('\n🎉 verificación de clave admin OK');
  process.exit(0);
}

// El módulo es CommonJS (`.js`): Dockerfile:11 copia `server/*.js`, así que el
// require es directo y sin detección de named exports.
let A = null;
try { A = require('../admin-auth.js'); } catch (e) {
  console.log('❌ no se pudo cargar server/admin-auth.js: ' + e.message);
  fails++;
}
if (!A) failed();

// ---- 1. API y formato autodescriptivo ----
ok(typeof A.makeHash === 'function', 'exporta makeHash');
ok(typeof A.verifyAdminKey === 'function', 'exporta verifyAdminKey');

const h1 = A.makeHash('clave-secreta');
ok(/^pbkdf2_sha256\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(h1),
  `makeHash emite el formato autodescriptivo (${String(h1).slice(0, 28)}…)`);
ok((await A.verifyAdminKey('clave-secreta', { hash: h1 })) === true,
  'la clave correcta verifica contra el hash');
ok((await A.verifyAdminKey('otra', { hash: h1 })) === false,
  'una clave distinta no verifica');

// ---- 2. Formato autodescriptivo y round-trip (TRIANGULATE) ----
{
  const clave = 'clave-roundtrip';
  const salt = Buffer.alloc(16, 7);
  const h = A.makeHash(clave, { iterations: 5000, salt });
  const parts = h.split('$');
  ok(parts[0] === 'pbkdf2_sha256', 'el string declara el algoritmo');
  ok(parts[1] === '5000', 'el string declara las iteraciones pedidas');
  ok(Buffer.from(parts[2], 'base64').equals(salt), 'el string declara el salt pedido');
  const parsed = A.parseHash(h);
  ok(!!parsed && parsed.iterations === 5000 && parsed.salt.equals(salt) && parsed.hash.length === 32,
    'parseHash lee algoritmo/iteraciones/salt del propio string');
  ok((await A.verifyAdminKey(clave, { hash: h })) === true,
    'un hash con iteraciones/salt distintos verifica (se leen del string)');
  ok(!h.includes(clave), 'el string generado NO contiene la clave en claro');
  // round-trip: serializar → parsear → verificar preserva los cuatro campos
  const rt = A.parseHash(A.makeHash(clave, { iterations: 5000, salt }));
  ok(rt.iterations === parsed.iterations && rt.salt.equals(parsed.salt) && rt.hash.equals(parsed.hash),
    'round-trip preserva algoritmo/iteraciones/salt/hash');
}

// ---- 3. Anti pass-the-hash y salt aleatorio (TRIANGULATE) ----
{
  const clave = 'mi-clave-admin';
  const hashGuardado = A.makeHash(clave);
  // EL ASSERT CLAVE del change: enviar el hash guardado (lo que hay en el host)
  // como clave NO entra, porque el server hashea lo que recibe.
  ok((await A.verifyAdminKey(hashGuardado, { hash: hashGuardado })) === false,
    'anti pass-the-hash: el hash guardado como clave NO entra');
  const hA = A.makeHash(clave), hB = A.makeHash(clave);
  ok(hA !== hB, 'dos hashes de la misma clave son distintos (salt aleatorio)');
  ok((await A.verifyAdminKey(clave, { hash: hA })) === true &&
     (await A.verifyAdminKey(clave, { hash: hB })) === true,
    'la clave original verifica contra ambos hashes');
}

// ---- 4. Validación defensiva del hash configurado (TRIANGULATE) ----
{
  const invalidos = [
    ['malformado (menos de 4 partes)', 'pbkdf2_sha256$210000$YWJj'],
    ['algoritmo desconocido', 'md5$210000$YWJj$ZGVm'],
    ['hash vacío (truncado)', 'pbkdf2_sha256$210000$YWJj$'],
    ['salt vacío', 'pbkdf2_sha256$210000$$ZGVm'],
    ['salt corrupto (base64 basura)', 'pbkdf2_sha256$210000$!!!$ZGVm'],
    ['iteraciones no numéricas', 'pbkdf2_sha256$abc$YWJj$ZGVm'],
    ['iteraciones negativas', 'pbkdf2_sha256$-5$YWJj$ZGVm'],
    ['iteraciones cero', 'pbkdf2_sha256$0$YWJj$ZGVm'],
    ['iteraciones fuera de rango', 'pbkdf2_sha256$999999999$YWJj$ZGVm'],
  ];
  let threw = null;
  for (const [nombre, hash] of invalidos) {
    let r = null;
    try { r = await A.verifyAdminKey('cualquiera', { hash }); }
    catch (e) { threw = `${nombre} -> ${e.message}`; }
    ok(r === false, `hash inválido (${nombre}): deniega`);
  }
  ok(threw === null, 'ningún hash inválido lanza excepción' + (threw ? ` (${threw})` : ''));
  ok(A.parseHash('no-es-un-hash') === null, 'parseHash devuelve null sin lanzar');
  // decodificable pero de largo distinto: timingSafeEqual LANZARÍA sin la guarda de largos
  ok((await A.verifyAdminKey('x', { hash: 'pbkdf2_sha256$5000$YWJjZGVmZ2hpamts$YWJj' })) === false,
    'hash de largo distinto deniega sin lanzar (la guarda de largos evita timingSafeEqual)');
}

// ---- 5. Precedencia hash-vs-claro y fail-closed (TRIANGULATE) ----
{
  const claveHash = 'clave-hash';
  const hash = A.makeHash(claveHash, { iterations: 5000 });
  ok((await A.verifyAdminKey(claveHash, { hash, claro: 'test-key' })) === true,
    'con hash + claro, la clave del hash entra');
  ok((await A.verifyAdminKey('test-key', { hash, claro: 'test-key' })) === false,
    'con hash + claro, la clave en claro NO entra (el hash gana siempre)');
  ok((await A.verifyAdminKey('test-key', { claro: 'test-key' })) === true,
    'camino en claro (compat protocol.mjs): la clave exacta entra');
  ok((await A.verifyAdminKey('', { claro: 'test-key' })) === false, 'camino en claro: vacío no entra');
  ok((await A.verifyAdminKey('otra', { claro: 'test-key' })) === false, 'camino en claro: otra clave no entra');
  ok((await A.verifyAdminKey('test-key', {})) === false, 'fail closed: sin config, nada entra');
  ok((await A.verifyAdminKey('', { claro: '' })) === false, 'fail closed: claro vacío ≠ admin abierto');
  ok((await A.verifyAdminKey('cualquiera', { hash: '', claro: '' })) === false, 'fail closed: ambos vacíos');

  const cfgAmbos = A.resolveConfig({ ADMIN_KEY_HASH: hash, ADMIN_KEY: 'test-key' });
  ok(cfgAmbos.mode === 'hash' && cfgAmbos.hasClaro === true,
    'resolveConfig: hash gana y reporta el claro presente (para el warning)');
  const cfgClaro = A.resolveConfig({ ADMIN_KEY: 'test-key' });
  ok(cfgClaro.mode === 'claro' && cfgClaro.hash === '', 'resolveConfig: solo claro -> modo claro');
  ok(A.resolveConfig({ ADMIN_KEY_HASH: '', ADMIN_KEY: '' }).mode === 'none', 'resolveConfig: vacíos -> none');
  ok(A.resolveConfig({}).mode === 'none', 'resolveConfig: env vacío -> none (fail closed)');
}

// ---- 6. Generador server/hash-key.mjs (GREEN herramienta) ----
{
  const runCli = (args) => new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: serverDir });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => { stdout += d; });
    p.stderr.on('data', d => { stderr += d; });
    p.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  const clave = 'clave-generador-xyz';
  const out = await runCli(['hash-key.mjs', clave]);
  const line = out.stdout.trim().split(/\r?\n/)[0];
  ok(out.code === 0, 'node hash-key.mjs "clave" sale con código 0');
  ok(/^ADMIN_KEY_HASH=pbkdf2_sha256\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(line),
    'el generador emite la línea ADMIN_KEY_HASH=pbkdf2_sha256$... lista para pegar');
  ok(!out.stdout.includes(clave) && !out.stderr.includes(clave), 'el generador NO imprime la clave en claro (stdout ni stderr)');
  const hash = line.slice('ADMIN_KEY_HASH='.length);
  ok((await A.verifyAdminKey(clave, { hash })) === true, 'el hash generado verifica la clave');
  ok((await A.verifyAdminKey('otra', { hash })) === false, 'el hash generado rechaza otra clave');
}

// ---- 7. Contador de derivaciones + no-bloqueo (GREEN) ----
{
  const crypto = require('crypto');
  A.resetStats();
  const hash = A.makeHash('clave-stats', { iterations: 5000 });
  ok(A.stats.derivations === 0, 'resetStats deja el contador de derivaciones en 0');
  await A.verifyAdminKey('clave-stats', { hash });
  ok(A.stats.derivations === 1, 'una verificación que deriva suma exactamente 1');
  await A.verifyAdminKey('otra', { hash });
  ok(A.stats.derivations === 2, 'una clave incorrecta también deriva (1 más)');
  await A.verifyAdminKey('', { hash });
  ok(A.stats.derivations === 2, 'clave vacía NO deriva (rechazo barato)');
  await A.verifyAdminKey('clave-stats', { claro: 'x' });
  ok(A.stats.derivations === 2, 'el camino en claro NO deriva');
  await A.verifyAdminKey('clave-stats', { hash: 'malformado' });
  ok(A.stats.derivations === 2, 'un hash malformado NO deriva');
  const lim = A.createAdminLimiter({ capacity: 1, refillPerSec: 0, maxConcurrent: 2, now: () => 0 });
  await A.verifyAdminKey('clave-stats', { hash, limiter: lim });
  ok(A.stats.derivations === 3, 'con token disponible deriva (1 más)');
  await A.verifyAdminKey('clave-stats', { hash, limiter: lim });
  ok(A.stats.derivations === 3 && A.stats.limited === 1, 'sin token NO deriva y lo cuenta como limitado');

  // contrato de no-bloqueo: verifyAdminKey devuelve Promise y NO usa pbkdf2Sync.
  // Se intercepta pbkdf2Sync en el módulo (misma instancia de crypto): si el
  // camino de verificación lo usara, la bandera se prendería. Determinista.
  const realSync = crypto.pbkdf2Sync;
  let syncUsed = false, isPromise = false, res = null;
  crypto.pbkdf2Sync = (...a) => { syncUsed = true; return realSync.apply(crypto, a); };
  try {
    const p = A.verifyAdminKey('clave-stats', { hash });
    isPromise = p instanceof Promise;
    res = await p;
  } finally { crypto.pbkdf2Sync = realSync; }
  ok(isPromise, 'verifyAdminKey devuelve una Promise (async)');
  ok(syncUsed === false, 'verifyAdminKey NO usa pbkdf2Sync (contrato de no-bloqueo)');
  ok(res === true, 'y verifica correctamente por el camino async');
}

// ---- 8. Limitador: token bucket con `now` inyectable + cota concurrente (GREEN + TRIANGULATE) ----
{
  // Reloj falso: los asserts son deterministas y NO miden tiempos reales.
  let t = 0;
  const now = () => t;
  const b = A.createTokenBucket({ capacity: 3, now }); // refillPerSec default 0.5
  ok(b.take() && b.take() && b.take(), 'los primeros 3 take() dan true (capacidad 3)');
  ok(b.take() === false, 'el 4º take() da false (bucket agotado)');
  t += 2000; // 2 s × 0.5/s = 1 token
  ok(b.take() === true, 'tras avanzar el reloj 2 s hay 1 token disponible');
  ok(b.take() === false, 'y solo 1: el siguiente vuelve a false');

  const b0 = A.createTokenBucket({ capacity: 3, refillPerSec: 0, now: () => 0 });
  b0.take(); b0.take(); b0.take();
  ok(b0.take() === false, 'con refillPerSec:0 el 4º take() sigue false (sin recarga)');

  // defaults del limitador: capacidad 3, recarga 0.5/s, cota concurrente 2
  const def = A.createAdminLimiter({ now: () => 0 });
  ok(def.tokens === 3, 'default del limitador: capacidad 3');
  const d1 = def.acquire(), d2 = def.acquire();
  ok(typeof d1 === 'function' && typeof d2 === 'function' && def.acquire() === null,
    'default del limitador: cota de 2 derivaciones concurrentes');

  // cota de concurrencia: rechaza SIN consumir token
  const lim = A.createAdminLimiter({ capacity: 3, refillPerSec: 0, maxConcurrent: 2, now: () => 0 });
  const r1 = lim.acquire(), r2 = lim.acquire();
  ok(typeof r1 === 'function' && typeof r2 === 'function', 'con maxConcurrent:2 las 2 primeras se conceden');
  ok(lim.tokens === 1, 'las 2 concesiones consumieron 2 tokens');
  ok(lim.acquire() === null, 'la 3ª se rechaza por cota concurrente');
  ok(lim.tokens === 1, 'el rechazo por concurrencia NO consume token');
  r1(); r2();
  const r4 = lim.acquire();
  ok(typeof r4 === 'function' && lim.tokens === 0, 'liberadas las 2, la siguiente se concede y gasta el token restante');
  r4(); r4();
  ok(lim.inFlight === 0, 'release es idempotente (inFlight no baja de 0)');
}

// ---- 9. e2e WS: cableado real de server.js (RED) ----
{
  const clave = 'clave-e2e-larga-y-secreta';
  const hash = A.makeHash(clave); // iteraciones reales (210k)
  const port = await freePort();
  const srv = startServer({ PORT: String(port), ADMIN_KEY_HASH: hash, ADMIN_KEY: '' });
  try {
    if (!(await waitReady(port))) ok(false, 'e2e: el server con ADMIN_KEY_HASH levanta');
    else {
      const a = await helloWS(port, 'AdminOk', 'admin', clave);
      ok(a.m.admin === true && !a.m.adminDenied, 'e2e: la clave correcta entra como admin');
      const b = await helloWS(port, 'PassHash', 'admin', hash);
      ok(b.m.admin === false, 'e2e anti pass-the-hash: el hash guardado como clave NO entra');
      const c = await helloWS(port, 'MalaClave', 'admin', 'mal');
      ok(c.m.admin === false && c.m.adminDenied === true, 'e2e: clave incorrecta → adminDenied');
      for (const x of [a, b, c]) { try { x.ws.close(); } catch (e) {} }
    }
  } finally { try { srv.proc.kill(); } catch (e) {} }
}

// ---- 10. e2e fail-closed (TRIANGULATE) ----
{
  // Regresión del agujero "env vacía = admin abierto": ahora vacío = cerrado.
  const p1 = await freePort();
  const s1 = startServer({ PORT: String(p1), ADMIN_KEY: '', ADMIN_KEY_HASH: '' });
  try {
    if (!(await waitReady(p1))) ok(false, 'e2e fail-closed: el server sin config levanta');
    else {
      const x = await helloWS(p1, 'Nadie', 'admin', 'cualquiera');
      ok(x.m.admin === false && x.m.adminDenied === true, 'e2e: sin config, admin denegado (fail closed)');
      const y = await helloWS(p1, 'Nadie2', 'admin', '');
      ok(y.m.admin === false && y.m.adminDenied === true, 'e2e: sin config, admin con clave vacía denegado');
      try { x.ws.close(); } catch (e) {}
      try { y.ws.close(); } catch (e) {}
    }
  } finally { try { s1.proc.kill(); } catch (e) {} }

  // ADMIN_KEY='' (sin hash): DESHABILITADO.
  const p2 = await freePort();
  const s2 = startServer({ PORT: String(p2), ADMIN_KEY: '', ADMIN_KEY_HASH: '' });
  try {
    if (!(await waitReady(p2))) ok(false, 'e2e fail-closed: ADMIN_KEY vacía levanta');
    else {
      const z = await helloWS(p2, 'Vacio', 'admin', 'cualquiera');
      ok(z.m.admin === false && z.m.adminDenied === true, 'e2e: ADMIN_KEY vacía → admin DESHABILITADO (ya no abierto)');
      try { z.ws.close(); } catch (e) {}
    }
  } finally { try { s2.proc.kill(); } catch (e) {} }
}

// ---- 11. e2e precedencia: el hash gana sobre el claro (TRIANGULATE) ----
{
  const claveHash = 'clave-del-hash-e2e';
  const hash = A.makeHash(claveHash);
  const p = await freePort();
  const s = startServer({ PORT: String(p), ADMIN_KEY_HASH: hash, ADMIN_KEY: 'clave-en-claro' });
  try {
    if (!(await waitReady(p))) ok(false, 'e2e precedencia: el server levanta');
    else {
      const a = await helloWS(p, 'PorHash', 'admin', claveHash);
      ok(a.m.admin === true, 'e2e precedencia: la clave del hash entra');
      const b = await helloWS(p, 'PorClaro', 'admin', 'clave-en-claro');
      ok(b.m.admin === false && b.m.adminDenied === true, 'e2e precedencia: la clave EN CLARO es rechazada (gana el hash)');
      try { a.ws.close(); } catch (e) {}
      try { b.ws.close(); } catch (e) {}
    }
  } finally { try { s.proc.kill(); } catch (e) {} }
}

// ---- 12. e2e warnings de boot y no filtrado de secretos (GREEN) ----
{
  // (a) hash presente: avisa que verifica por hash y no expone clave ni hash.
  const claveH = 'clave-warn-hash';
  const hashH = A.makeHash(claveH);
  const pH = await freePort();
  const sH = startServer({ PORT: String(pH), ADMIN_KEY_HASH: hashH, ADMIN_KEY: '' });
  try {
    if (!(await waitReady(pH))) ok(false, 'boot con hash: el server levanta');
    else {
      await wait(150);
      ok(/Clave admin: verificada por hash \(PBKDF2-SHA256\)/.test(sH.out()),
        'boot con hash: avisa "verificada por hash (PBKDF2-SHA256)"');
      ok(!(sH.out() + sH.err()).includes(claveH) && !(sH.out() + sH.err()).includes(hashH),
        'boot con hash: no expone la clave ni el hash en la salida');
      // la clave enviada por un cliente no aparece en los logs
      const a = await helloWS(pH, 'AdminLog', 'admin', claveH);
      await wait(150);
      ok(!(sH.out() + sH.err()).includes(claveH), 'la clave enviada por el cliente NO aparece en los logs');
      ok(/➕ AdminLog \(admin\)/.test(sH.out()), 'log de conexión mantiene nombre+modo, sin la clave');
      try { a.ws.close(); } catch (e) {}
    }
  } finally { try { sH.proc.kill(); } catch (e) {} }

  // (b) solo claro: avisa del riesgo y no expone la clave.
  const pC = await freePort();
  const sC = startServer({ PORT: String(pC), ADMIN_KEY: 'clave-dev-local', ADMIN_KEY_HASH: '' });
  try {
    if (!(await waitReady(pC))) ok(false, 'boot solo claro: el server levanta');
    else {
      await wait(150);
      ok(/Clave admin en claro: legible por quien acceda al host/.test(sC.err()),
        'boot solo claro: avisa que la clave es legible en el host');
      ok(!(sC.out() + sC.err()).includes('clave-dev-local'), 'boot solo claro: no expone la clave');
    }
  } finally { try { sC.proc.kill(); } catch (e) {} }

  // (c) sin config: avisa que el admin queda deshabilitado.
  const pN = await freePort();
  const sN = startServer({ PORT: String(pN), ADMIN_KEY: '', ADMIN_KEY_HASH: '' });
  try {
    if (!(await waitReady(pN))) ok(false, 'boot sin config: el server levanta');
    else {
      await wait(150);
      ok(/Modo admin DESHABILITADO: configurá ADMIN_KEY_HASH/.test(sN.err()),
        'boot sin config: avisa "Modo admin DESHABILITADO"');
    }
  } finally { try { sN.proc.kill(); } catch (e) {} }
}

// ---- 13. e2e: segundo hello (higiene/anti-race) y derivación solo en admin (TRIANGULATE) ----
{
  const clave = 'clave-higiene';
  const hash = A.makeHash(clave);
  const connect = async (port, name, mode, key) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const msgs = [];
    ws.on('message', raw => { try { msgs.push(JSON.parse(raw)); } catch (e) {} });
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    ws.send(JSON.stringify({ t: 'hello', name, mode, key }));
    return { ws, msgs };
  };

  // (A) los hellos de JUGADOR no consumen tokens (bucket cap 3, refill 0):
  //     si derivaran, el bucket quedaría vacío y el admin de después no entraría.
  const pA = await freePort();
  const sA = startServer({ PORT: String(pA), ADMIN_KEY_HASH: hash, ADMIN_RATE_CAPACITY: '3', ADMIN_RATE_REFILL_PER_SEC: '0' });
  try {
    if (!(await waitReady(pA))) ok(false, 'e2e higiene: el server levanta');
    else {
      const jugadores = [];
      for (let i = 0; i < 8; i++) jugadores.push(await helloWS(pA, 'P' + i, 'player', 'clave-ignorada'));
      ok(jugadores.every(x => x.m.admin === false && !x.m.adminDenied),
        'e2e: un hello de jugador con clave no vacía nunca entra como admin');
      const adm = await helloWS(pA, 'AdminTras8', 'admin', clave);
      ok(adm.m.admin === true,
        'e2e: la derivación corre SOLO en admin (8 hellos de jugador no tocaron el bucket)');
      for (const x of jugadores) { try { x.ws.close(); } catch (e) {} }
      try { adm.ws.close(); } catch (e) {}
    }
  } finally { try { sA.proc.kill(); } catch (e) {} }

  // (B) anti-race + higiene: dos hello rápidos en la misma conexión -> UNA sesión.
  const pB = await freePort();
  const sB = startServer({ PORT: String(pB), ADMIN_KEY_HASH: hash });
  try {
    if (!(await waitReady(pB))) ok(false, 'e2e anti-race: el server levanta');
    else {
      const obs = await connect(pB, 'Obs', 'player', '');
      ok(await waitFor(() => obs.msgs.some(m => m.t === 'welcome')), 'e2e anti-race: el observador entra');
      const doble = await connect(pB, 'Doble', 'admin', clave); // 1er hello (deriva async)
      doble.ws.send(JSON.stringify({ t: 'hello', name: 'Doble', mode: 'admin', key: clave })); // 2º inmediato
      await wait(1500);
      ok(doble.msgs.filter(m => m.t === 'welcome').length === 1,
        'e2e anti-race: dos hello rápidos → UN solo welcome (guard marcado antes del await)');
      ok(obs.msgs.filter(m => m.t === 'join' && m.name === 'Doble').length === 1,
        'e2e anti-race: dos hello rápidos → UN solo join difundido (no re-crea la sesión)');
      doble.ws.send(JSON.stringify({ t: 'hello', name: 'Doble2', mode: 'admin', key: clave }));
      await wait(400);
      ok(doble.msgs.filter(m => m.t === 'welcome').length === 1 &&
         obs.msgs.filter(m => m.t === 'join' && m.name === 'Doble2').length === 0,
        'e2e: un hello posterior en una conexión ya identificada retorna temprano (higiene)');
      try { doble.ws.close(); } catch (e) {}
      try { obs.ws.close(); } catch (e) {}
    }
  } finally { try { sB.proc.kill(); } catch (e) {} }
}

// ---- 14. e2e del flood del KDF (RED → GREEN) ----
{
  const clave = 'clave-flood';
  const hash = A.makeHash(clave);
  // refill 0 => resultado exacto (3 aceptados, 5 denegados) SIN medir tiempos.
  // maxConcurrent alto para aislar el token bucket en este assert.
  const p = await freePort();
  const s = startServer({
    PORT: String(p), ADMIN_KEY_HASH: hash,
    ADMIN_RATE_CAPACITY: '3', ADMIN_RATE_REFILL_PER_SEC: '0', ADMIN_RATE_MAX_CONCURRENT: '16',
  });
  try {
    if (!(await waitReady(p))) ok(false, 'e2e flood: el server levanta');
    else {
      // 8 intentos admin con la clave CORRECTA en rápida sucesión
      const res = await Promise.all(Array.from({ length: 8 }, (_, i) => helloWS(p, 'F' + i, 'admin', clave)));
      const aceptados = res.filter(x => x.m.admin === true).length;
      const denegados = res.filter(x => x.m.admin === false && x.m.adminDenied === true).length;
      ok(aceptados === 3, `e2e flood: entran exactamente los del bucket (aceptados=${aceptados}, esperado 3)`);
      ok(denegados === 5, `e2e flood: el resto se deniega sin derivar (denegados=${denegados}, esperado 5)`);
      ok(res.every(x => x.m.admin === true || x.m.adminDenied === true), 'e2e flood: todo intento termina aceptado o denegado');
      for (const x of res) { try { x.ws.close(); } catch (e) {} }
    }
  } finally { try { s.proc.kill(); } catch (e) {} }

  // Un admin legítimo (pocas entradas) no se ve afectado por el limitador.
  const p2 = await freePort();
  const s2 = startServer({ PORT: String(p2), ADMIN_KEY_HASH: hash, ADMIN_RATE_CAPACITY: '3', ADMIN_RATE_REFILL_PER_SEC: '100' });
  try {
    if (!(await waitReady(p2))) ok(false, 'e2e flood: el server con recarga generosa levanta');
    else {
      let todosOk = true;
      for (let i = 0; i < 5; i++) {
        const r = await helloWS(p2, 'Legit' + i, 'admin', clave);
        if (r.m.admin !== true) todosOk = false;
        try { r.ws.close(); } catch (e) {}
      }
      ok(todosOk, 'e2e: un admin legítimo entra normal (el limitador no lo afecta)');
    }
  } finally { try { s2.proc.kill(); } catch (e) {} }
}

// ---- 15. e2e: la derivación no bloquea el event loop (TRIANGULATE) ----
{
  // No es un assert de tiempos frágil: las DOS conexiones ya están abiertas y los
  // frames se mandan back-to-back, así que el welcome del jugador (camino sin
  // await) se emite necesariamente mientras el PBKDF2 del admin sigue en vuelo.
  const clave = 'clave-nobloqueo';
  const hash = A.makeHash(clave);
  const p = await freePort();
  const s = startServer({ PORT: String(p), ADMIN_KEY_HASH: hash });
  try {
    if (!(await waitReady(p))) ok(false, 'e2e no-bloqueo: el server levanta');
    else {
      const openWs = () => new Promise((res, rej) => {
        const ws = new WebSocket(`ws://127.0.0.1:${p}`);
        ws.on('open', () => res(ws)); ws.on('error', rej);
      });
      const adminWs = await openWs();
      const jugWs = await openWs();
      const adminMsgs = [], jugMsgs = [];
      adminWs.on('message', raw => { try { adminMsgs.push({ m: JSON.parse(raw), at: Date.now() }); } catch (e) {} });
      jugWs.on('message', raw => { try { jugMsgs.push({ m: JSON.parse(raw), at: Date.now() }); } catch (e) {} });
      adminWs.send(JSON.stringify({ t: 'hello', name: 'AdminLento', mode: 'admin', key: clave }));
      jugWs.send(JSON.stringify({ t: 'hello', name: 'JugadorRapido', mode: 'player', key: '' }));
      await waitFor(() => jugMsgs.some(x => x.m.t === 'welcome') && adminMsgs.some(x => x.m.t === 'welcome'));
      const jugW = jugMsgs.find(x => x.m.t === 'welcome');
      const admW = adminMsgs.find(x => x.m.t === 'welcome');
      ok(!!jugW && jugW.m.admin === false, 'e2e no-bloqueo: el jugador concurrente recibe su welcome');
      ok(!!admW && admW.m.admin === true, 'e2e no-bloqueo: el admin termina aceptado después de derivar');
      ok(!!jugW && !!admW && jugW.at < admW.at,
        'e2e no-bloqueo: el jugador se atiende MIENTRAS la derivación admin está en vuelo');
      try { jugWs.close(); } catch (e) {}
      try { adminWs.close(); } catch (e) {}
    }
  } finally { try { s.proc.kill(); } catch (e) {} }
}

// ---- 16. compat con protocol.mjs (intocable): declarado + verificado (TRIANGULATE) ----
{
  // Declaración estructural acotada sobre el test INTOCABLE: protocol.mjs corre con
  // `ADMIN_KEY: 'test-key'` y hace 2 hello admin: `''` (denegado barato, sin derivar)
  // y `'test-key'` (aceptado). El limitador del KDF acota DERIVACIONES; el camino en
  // claro no deriva, así que no puede romperlo (se prueba con capacidad 1).
  const src = fs.readFileSync(path.join(dir, 'protocol.mjs'), 'utf8');
  ok(/ADMIN_KEY: 'test-key'/.test(src), 'protocol.mjs (intocable) corre con ADMIN_KEY: test-key (camino en claro)');
  ok(/hello\('Evil', 'admin', ''\)/.test(src), 'protocol.mjs pide admin con clave vacía');
  ok(/hello\('Jefe', 'admin', 'test-key'\)/.test(src), 'protocol.mjs pide admin con la clave en claro');

  const p = await freePort();
  const s = startServer({ PORT: String(p), ADMIN_KEY: 'test-key', ADMIN_RATE_CAPACITY: '1', ADMIN_RATE_REFILL_PER_SEC: '0' });
  try {
    if (!(await waitReady(p))) ok(false, 'e2e compat protocol.mjs: el server en claro levanta');
    else {
      // Con capacidad 1: si el camino en claro consumiera token, el 2º hello fallaría.
      const evil = await helloWS(p, 'Evil', 'admin', '');
      ok(evil.m.admin === false && evil.m.adminDenied === true, 'compat: admin sin clave → denegado (barato, sin derivar)');
      const jefe = await helloWS(p, 'Jefe', 'admin', 'test-key');
      ok(jefe.m.admin === true, 'compat: admin con la clave en claro → aceptado (el limitador no lo toca)');
      for (const c of [evil, jefe]) { try { c.ws.close(); } catch (e) {} }
    }
  } finally { try { s.proc.kill(); } catch (e) {} }
}

// ---- 17. e2e: el warning de "ambas variables" empuja a BORRAR ADMIN_KEY (GREEN 3.4) ----
{
  const clave = 'clave-warn-ambas';
  const hash = A.makeHash(clave);
  const p = await freePort();
  const s = startServer({ PORT: String(p), ADMIN_KEY_HASH: hash, ADMIN_KEY: 'clave-en-claro-vieja' });
  try {
    if (!(await waitReady(p))) ok(false, 'e2e warning ambas: el server levanta');
    else {
      await wait(150);
      const salida = s.out() + s.err();
      ok(/borrá ADMIN_KEY/.test(salida),
        'warning con hash+claro: dice explícitamente "borrá ADMIN_KEY" (la clave sigue legible en el host)');
      ok(/ADMIN_KEY en claro IGNORADA por precedencia del hash/.test(salida),
        'warning con hash+claro: explica que la precedencia la ignora');
      ok(!salida.includes('clave-en-claro-vieja'), 'warning con hash+claro: no expone la clave en claro');
    }
  } finally { try { s.proc.kill(); } catch (e) {} }
}

failed();
