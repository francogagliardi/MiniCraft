// Test end-to-end del bot cazador (change bot-cazador, capability bots/hunter).
// Levanta el SERVER de verdad (puerto propio + WORLD_FILE temporal + ADMIN_KEY de
// test) y cablea el bot real (`bot/index.js` con un `send` espía que registra todo
// frame saliente) contra CLIENTES FALSOS.
//
// El punto clave (a): el cliente falso de la víctima EMULA a propósito la ventana
// de invulnerabilidad `godT` de 0.6 s del cliente real (index.html:1565). Por eso
// un bot que mandara los dos golpes pegados en el mismo tick NO mataría y este
// test fallaría: es lo que hace que el test no mienta.
//
// Criterios cubiertos: (a) kill en dos toques separados, (b) ignora admins,
// (c) sigueme/espera (+turreta), (d) SEGURIDAD por id (impostor con el nombre del
// admin), (e) invulnerabilidad, (f) velocidad doble, (g) reconexión, (h) cero
// `edit`, (i) `skin:'robot'` difundido. Extra: la réplica de findSpawn() coincide
// con la del cliente.
//
// Uso: node test/bot-cazador.mjs   (sale con código != 0 si algo falla)
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(dir, '..');
const root = path.join(serverDir, '..');
const { createBotClient, createHunter, parseWorld } = require(path.join(root, 'bot', 'index.js'));

const PORT = 3240;
const WORLD = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-botworld-')), 'world.json');
const TIMEOUT = 8000;
const SWORD = 100;
const GROUND = 30;           // y del mundo plano de test
const BOT_NAME = 'OPSX-bot';
const ADMIN_KEY = 'test-key';
const hypot = (dx, dz) => Math.sqrt(dx * dx + dz * dz);

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '✅ ' : '❌ ') + msg); if (!cond) fails++; };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = TIMEOUT) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    let v = null; try { v = fn(); } catch (e) { v = null; }
    if (v) return v;
    await wait(25);
  }
  return null;
}

// ---- mundo plano inyectado (determinismo: sin terreno que trabe el pathing) ----
const flatWorld = (sx = 100.5, sz = 100.5) => ({
  W: 208, H: 40, topSolidY: () => GROUND, blocked: () => false, set() {},
  findSpawn: () => [sx, GROUND, sz],
});

// ---- bot real con espía de frames salientes ----
const harnesses = [];
function startBot(opts = {}) {
  const frames = [];
  const spawnAt = opts.spawn || [100.5, 100.5];
  const client = createBotClient({
    url: `ws://localhost:${PORT}`,
    name: BOT_NAME,
    worldBuilder: opts.worldBuilder || (() => flatWorld(spawnAt[0], spawnAt[1])),
    backoffBaseMs: 80, backoffCapMs: 400, backoffFactor: 2, rng: () => 0,
    log: () => {},
    onOutgoing: (f) => frames.push(Object.assign({}, f, { _t: Date.now() })),
  });
  client.start();
  const h = { client, frames };
  harnesses.push(h);
  return h;
}
const mvFrames = (h) => h.frames.filter(f => f.t === 'mv');
const hits = (h) => h.frames.filter(f => f.t === 'hit');
const chats = (h) => h.frames.filter(f => f.t === 'chat');
const lastPos = (h) => { const l = mvFrames(h); return l.length ? l[l.length - 1].p : null; };
// Posición del bot EN el momento del toque: el `mv` del mismo tick se emite justo
// después del golpe (tick: mover → golpear → mv), así que el primer mv con _t >= hit._t
// es exactamente la posición de ataque.
const posAtHit = (h, hit) => { const m = h.frames.find(f => f.t === 'mv' && f._t >= hit._t); return m ? m.p : lastPos(h); };
const stopBot = (h) => { try { h.client.stop(); } catch (e) {} };
// Readiness: el bot entra al server recién cuando llega su `welcome` (ahí recibe su id).
// El server ya lo registró antes de mandarlo (`players.set` precede al `welcome`), así que
// esperar el id garantiza que un `welcome.players` posterior lo incluya. Sin esta espera el
// test asumía un orden de llegada (bot antes que el testigo) que NO está garantizado.
const botReady = (h) => until(() => h.client.getId() !== null, TIMEOUT);

// ---- cliente falso (víctima / admin / impostor) ----
async function fakePlayer(name, opts = {}) {
  const p = {
    name, admin: !!opts.admin, key: opts.key || (opts.admin ? ADMIN_KEY : ''),
    hp: 10, dead: 0, godT: 0, phitApplied: [], phitIgnored: 0,
    pos: (opts.pos || [128.5, 20, 136.5]).slice(), seen: [], id: null, botId: null, seq: 0,
  };
  p.ws = new WebSocket(`ws://localhost:${PORT}`);
  await new Promise((res, rej) => { p.ws.on('open', res); p.ws.on('error', rej); setTimeout(() => rej(new Error('sin conexión ' + name)), TIMEOUT); });
  p.ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    p.seen.push(Object.assign({}, m, { _t: Date.now() }));
    if (m.t === 'welcome') for (const q of (m.players || [])) if (q.name === BOT_NAME) p.botId = q.id;
    if (m.t === 'join' && m.name === BOT_NAME) p.botId = m.id;
    // La víctima del bot SÍ tiene la ventana de 0.6 s (como el cliente real).
    if (m.t === 'phit' && p.botId !== null && m.fromId === p.botId) applyDamage(p, m.dmg);
  });
  p.ws.send(JSON.stringify({ t: 'hello', name, mode: p.admin ? 'admin' : 'player', key: p.key, skin: 'human' }));
  const w = await until(() => p.seen.find(m => m.t === 'welcome'));
  if (!w) throw new Error('sin welcome para ' + name);
  p.id = w.id; p.welcome = w;
  for (const q of (w.players || [])) if (q.name === BOT_NAME) p.botId = q.id;
  return p;
}
function applyDamage(p, dmg) {
  const now = Date.now() / 1000;
  if (now - p.godT < 0.6) { p.phitIgnored++; return; } // ventana godT del cliente real
  p.godT = now;
  p.hp = Math.max(0, p.hp - dmg);
  p.phitApplied.push({ at: Date.now(), dmg });
  if (p.hp <= 0) p.dead = 1;
}
function sendMv(p) {
  if (p.ws.readyState !== WebSocket.OPEN) return;
  p.seq++;
  p.ws.send(JSON.stringify({ t: 'mv', p: p.pos, yaw: 0, pitch: 0, hp: p.hp, dead: p.dead, held: SWORD, seq: p.seq }));
}
function mvLoop(p, ms = 80) { p.mvTimer = setInterval(() => sendMv(p), ms); sendMv(p); }
function closePlayer(p) { if (!p) return; try { clearInterval(p.mvTimer); } catch (e) {} try { p.ws.close(); } catch (e) {} }

// ---- server real ----
let srv;
function shutdown(code) {
  try { srv && srv.kill(); } catch (e) {}
  if (fails || code) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
  console.log('\n🎉 bot cazador OK');
  process.exit(0);
}
setTimeout(() => { console.log('❌ timeout global'); shutdown(1); }, 150000).unref();

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

srv = spawn(process.execPath, ['server.js'], {
  cwd: serverDir,
  env: {
    ...process.env, PORT: String(PORT), ADMIN_KEY: 'test-key', WORLD_FILE: WORLD,
    TOD_INTERVAL_MS: '500',
  },
});
srv.stderr.on('data', d => process.stdout.write('[SRV-ERR] ' + d));

try {
  // =====================================================================
  // 0. La réplica de findSpawn() coincide con la del cliente real
  // =====================================================================
  {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const grabFn = (name) => {
      const i = html.indexOf('function ' + name + '(');
      if (i < 0) return '';
      let depth = 0, started = false;
      for (let k = i; k < html.length; k++) {
        if (html[k] === '{') { depth++; started = true; }
        else if (html[k] === '}') { depth--; if (started && depth === 0) return html.slice(i, k + 1); }
      }
      return '';
    };
    const src = grabFn('findSpawn');
    ok(src.length > 0, 'findSpawn() presente en index.html (extraído por llaves balanceadas)');
    // La caja del jugador ahora sale del aspecto: para el bot (human) se inyecta la real del cliente.
    const s0 = html.indexOf('/* skins:start */'), s1 = html.indexOf('/* skins:end */');
    const SK = new Function(html.slice(s0, s1) + '; return {playerBox};')();
    const seeds = [457473416, 123456789, 987654321, 42, 2026];
    let allMatch = !!src;
    const shown = [];
    for (const seed of seeds) {
      const w = parseWorld(html).gen(seed, []);
      const clientFn = new Function(
        'W', 'H', 'WATER_Y', 'OX', 'OZ', 'hAt', 'get', 'AIR', 'WATER', 'collidesAt', 'THREE',
        'playerBox', 'mySkin',
        src + '; return findSpawn;'
      )(
        w.W, w.H, w.WG.WG_SURFACE, w.WG.WG_OX, w.WG.WG_OZ, w.WG.hAt,
        (x, y, z) => { const b = w.get(x, y, z); return b === null ? w.WG.AIR : b; },
        w.WG.AIR, w.WG.WATER,
        (px, py, pz, r, hgt) => w._collidesAt(px, py, pz, r, hgt),
        { Vector3: function (x, y, z) { return { x, y, z }; } },
        SK.playerBox, 'human'
      );
      const a = clientFn();
      const b = w.findSpawn();
      if (Math.abs(a.x - b[0]) > 1e-9 || Math.abs(a.y - b[1]) > 1e-9 || Math.abs(a.z - b[2]) > 1e-9) allMatch = false;
      shown.push(`${seed}→[${b[0]},${b[2]}]`);
    }
    ok(allMatch, 'la réplica de findSpawn coincide con el cliente para varios seeds: ' + shown.join(' '));
  }

  if (!(await serverReady(PORT))) { console.log('❌ el server no levantó'); shutdown(1); }

  // =====================================================================
  // 1. (b) ignora a un admin pegado + (i) skin difundido + (h) cero edit
  // =====================================================================
  {
    const adminA = await fakePlayer('Boss', { admin: true });
    const botA = startBot();
    // (i) `welcome.players` trae solo a los YA registrados: esperamos que el bot esté
    // adentro antes de que entre el testigo (si no, el snapshot puede no traerlo).
    await botReady(botA);
    const adminB = await fakePlayer('Witness', { admin: true });
    // admin pegado al lado del bot (spawn plano en [100.5,·,100.5])
    adminA.pos = [101.5, GROUND, 100.5]; mvLoop(adminA);
    await wait(2500);
    const adminId = adminA.id;
    ok(hits(botA).length === 0, `(b) con SOLO admins presentes el bot no da ningún golpe (${hits(botA).length})`);
    ok(!hits(botA).some(f => f.id === adminId), '(b) ningún `hit` con el id del admin');
    // (i) AdminA (previo al bot) recibió el `join` del bot con skin robot
    const jn = adminA.seen.find(m => m.t === 'join' && m.name === BOT_NAME);
    ok(!!jn && jn.skin === 'robot', `(i) el join del bot llega con skin:'robot' (${jn && jn.skin})`);
    // (i) AdminB (posterior) ve al bot en welcome.players con skin robot
    const inW = (adminB.welcome.players || []).find(p => p.name === BOT_NAME);
    ok(!!inW && inW.skin === 'robot', `(i) welcome.players del recién llegado trae skin:'robot' (${inW && inW.skin})`);
    closePlayer(adminA); closePlayer(adminB); stopBot(botA);
  }
  await wait(300);

  // =====================================================================
  // 2. (a) mata a un no-admin con DOS toques separados + (e) invulnerabilidad
  // =====================================================================
  {
    const botB = startBot();
    await botReady(botB);
    const victim = await fakePlayer('Victima', { pos: [100.5 + 16, GROUND, 100.5] });
    ok(victim.botId !== null, '(a) la víctima resolvió el id del bot');
    // (e) la víctima le pega al bot: además de cazarla, el bot debe seguir en 10/0
    for (let i = 0; i < 3; i++) { victim.ws.send(JSON.stringify({ t: 'hit', id: victim.botId, dmg: 6 })); await wait(60); }
    mvLoop(victim);
    const killed = await until(() => victim.dead === 1, 8000);
    ok(killed, `(a) la víctima murió (hp=${victim.hp}, dead=${victim.dead})`);
    ok(victim.hp === 0, `(a) la vida de la víctima llegó a 0 (${victim.hp})`);
    const vHits = hits(botB).filter(f => f.id === victim.id);
    // La REGLA (spec bots/hunter) es: "no otro `hit` a la MISMA víctima antes de 0.65 s,
    // repitiendo hasta verla muerta" — se afirma el ESPACIADO del wire y que muera con DOS
    // impactos aplicados (10/6), no el conteo exacto. El cliente falso emula la ventana
    // `godT` de 0.6 s MEDIDA AL RECIBIR, así que bajo carga un `phit` puede descartarse
    // aunque el bot lo mande ≥0.65 s después y el bot necesite un toque más (spec: repite).
    const vGaps = vHits.map((f, i) => (i ? f._t - vHits[i - 1]._t : 0));
    ok(vHits.length >= 2, `(a) la víctima recibió dos o más toques del bot (${vHits.length})`);
    ok(victim.phitApplied.length === 2, `(a) la víctima aplicó dos phit (${victim.phitApplied.length}); ignoró ${victim.phitIgnored} dentro de la ventana`);
    ok(vGaps.slice(1).every(g => g >= 650), `(a) ningún toque a menos de 0.65 s del anterior (gaps ${vGaps.slice(1).join(', ')} ms)`);
    ok(vHits.every(f => f.dmg === 6), '(a) cada `hit` lleva dmg:6 (techo del clamp del server)');
    const dists = vHits.map(f => { const p = posAtHit(botB, f); return hypot(p[0] - victim.pos[0], p[2] - victim.pos[2]); });
    ok(dists.every(d => d <= 4.6 + 1e-6), `(a) cada golpe dentro de alcance ≤4.6 (${dists.map(d => d.toFixed(2)).join(', ')})`);
    ok(vHits.length >= 2 && vHits[1]._t > vHits[0]._t, '(a) los toques son de ticks distintos (no un burst)');
    // secuencia de gesto: el `mv` del wire llega a seq ≥ 2 (un avance por toque). El `mv`
    // sale a CADENCIA (150 ms) y puede no caer en el tick del 2º golpe: se espera a que el
    // wire lo refleje, en vez de leer un snapshot (la lectura inmediata veía seq=1).
    const seqSeen = await until(() => mvFrames(botB).some(f => f.seq >= 2), 2000);
    const lastMv = mvFrames(botB).pop();
    ok(seqSeen, `(a) cada toque avanzó seq en el wire (seq final=${lastMv && lastMv.seq})`);
    // anuncio de la muerte por chat (llega cuando el server difunde el `pm dead:1` de la víctima)
    ok(await until(() => chats(botB).some(f => /Fulminé/.test(f.text) && f.text.indexOf('Victima') >= 0), 2500),
      '(a) el bot anunció la kill por chat');
    // (e) invulnerabilidad: TODOS los mv del bot reportan hp:10/dead:0
    const mvs = mvFrames(botB);
    ok(mvs.length > 5 && mvs.every(f => f.hp === 10 && f.dead === 0),
      `(e) el bot ignora el daño y reporta siempre hp:10/dead:0 (${mvs.length} mv)`);
    closePlayer(victim); stopBot(botB);
  }
  await wait(300);

  // =====================================================================
  // 3. (c) sigueme / espera + turreta  y  (d) SEGURIDAD por id
  // =====================================================================
  {
    const admin = await fakePlayer('Boss', { admin: true, pos: [128.5, GROUND, 128.5] });
    const botC = startBot();
    await botReady(botC);
    // impostor: MISMO NOMBRE que el admin pero NO admin (otro id del server)
    const imp = await fakePlayer('Boss', { pos: [190, GROUND, 190] });
    mvLoop(imp);
    mvLoop(admin);
    ok(botC.client.getMode() === 'CAZA', '(c/d) el bot arranca en CAZA');

    // (d) los comandos del impostor son ignorados (el bot conserva CAZA)
    const chatsBefore = chats(botC).length;
    imp.ws.send(JSON.stringify({ t: 'chat', text: 'sigueme' }));
    await wait(700);
    ok(botC.client.getMode() === 'CAZA', '(d) `sigueme` de un no-admin con el nombre del admin ⇒ sigo en CAZA');
    imp.ws.send(JSON.stringify({ t: 'chat', text: 'espera' }));
    await wait(700);
    ok(botC.client.getMode() === 'CAZA', '(d) `espera` del impostor ⇒ sigo en CAZA');
    ok(chats(botC).length === chatsBefore, '(d) el impostor NO provocó ningún anuncio de cambio de modo');

    // (c) el ADMIN ordena `seguime` (variante) ⇒ sigue al admin
    admin.pos = [112.5, GROUND, 100.5]; sendMv(admin);
    admin.ws.send(JSON.stringify({ t: 'chat', text: 'seguime' }));
    ok(await until(() => botC.client.getMode() === 'SIGUEME', 2000), '(c) `seguime` del admin ⇒ modo SIGUEME');
    const converge = await until(() => {
      const b = lastPos(botC); if (!b) return false;
      return hypot(b[0] - admin.pos[0], b[2] - admin.pos[2]) < 2;
    }, 6000);
    const bp = lastPos(botC);
    ok(converge, `(c) la pos del bot converge a la del admin (d=${bp ? hypot(bp[0] - admin.pos[0], bp[2] - admin.pos[2]).toFixed(2) : '?'})`);

    // (c) el ADMIN ordena `espera` (con espacios y mayúsculas ⇒ trim + case-insensitive)
    admin.ws.send(JSON.stringify({ t: 'chat', text: '  ESPERA  ' }));
    ok(await until(() => botC.client.getMode() === 'ESPERA', 2000), '(c) `  ESPERA  ` del admin ⇒ modo ESPERA (trim + case-insensitive)');
    const frozen = botC.client.getBot().getPos().slice();
    const mvFrom = mvFrames(botC).length;
    admin.pos = [150, GROUND, 150]; // el admin se va: el bot NO debe seguirlo
    for (let i = 0; i < 30; i++) sendMv(admin);
    await wait(2500);
    const during = mvFrames(botC).slice(mvFrom);
    const samePos = during.length >= 5 && during.every(f => Math.abs(f.p[0] - frozen[0]) < 1e-9 && Math.abs(f.p[1] - frozen[1]) < 1e-9 && Math.abs(f.p[2] - frozen[2]) < 1e-9);
    ok(samePos, `(c) en ESPERA la pos es idéntica a lo largo de ~2.5 s (${during.length} mv)`);
    ok(during.length >= 5, `(c) y los \`mv\` siguen llegando estando quieto (${during.length})`);

    // frase que CONTIENE el comando: no cambia el modo (match exacto)
    admin.ws.send(JSON.stringify({ t: 'chat', text: 'espera que me mareo' }));
    await wait(600);
    ok(botC.client.getMode() === 'ESPERA', '(c) una frase con el comando NO dispara el cambio de modo');

    // (c) ESPERA es turreta: mata a un no-admin que se le acerca
    const impBefore = imp.hp;
    imp.pos = [frozen[0] + 3, GROUND, frozen[2]];
    for (let i = 0; i < 4; i++) { sendMv(imp); await wait(40); }
    const impDead = await until(() => imp.dead === 1, 6000);
    ok(impDead, `(c) en ESPERA mata a quien se le acerca (hp ${impBefore}→${imp.hp})`);
    const impHits = hits(botC).filter(f => f.id === imp.id);
    const impGaps = impHits.map((f, i) => (i ? f._t - impHits[i - 1]._t : 0));
    ok(impHits.length >= 2 && impGaps.slice(1).every(g => g >= 650),
      `(c) el bicho de la turreta: toques separados ≥0.65 s (${impHits.length} toques, gaps ${impGaps.slice(1).join(', ')} ms)`);
    ok(botC.client.getBot().getPos()[0] === frozen[0] && botC.client.getBot().getPos()[2] === frozen[2],
      '(c) matar en ESPERA no movió al bot');
    // el bot anunció sus cambios de modo
    ok(chats(botC).some(f => /SIGUEME/.test(f.text)) && chats(botC).some(f => /ESPERA/.test(f.text)),
      '(c) el bot anunció los cambios de modo por chat');
    closePlayer(admin); closePlayer(imp); stopBot(botC);
  }
  await wait(300);

  // =====================================================================
  // 4. (g) sobrevive a un close del server: reconecta con backoff y re-`hello`
  //    (terminate abrupto = lo que ve el bot ante un redeploy del server)
  // =====================================================================
  {
    const botD = startBot();
    ok(await until(() => mvFrames(botD).length > 3, 5000), '(g) el bot entra y late');
    const tBeforeClose = Date.now();
    botD.client.terminate();
    const hello2 = await until(() => botD.frames.find(f => f.t === 'hello' && f._t > tBeforeClose + 10), 6000);
    ok(!!hello2, '(g) tras el close el bot vuelve a mandar `hello` (reconecta)');
    const gap = hello2 ? hello2._t - tBeforeClose : 0;
    ok(gap >= 50, `(g) reconectó con backoff (no martilla): ${gap} ms después del corte`);
    ok(await until(() => mvFrames(botD).filter(f => f._t > tBeforeClose).length > 3, 5000), '(g) y reincorporado vuelve a latir con `mv`');
    ok(botD.frames.filter(f => f.t === 'hello').length >= 2, '(g) hubo al menos dos `hello` (re-`hello`)');
    stopBot(botD);
  }

  // =====================================================================
  // 5. (f) velocidad doble (medida directa sobre la lógica con reloj fijo)
  // =====================================================================
  {
    const mvs = [];
    const hunter = createHunter({
      send: (f) => mvs.push(f), now: () => 0, log: () => {},
      world: flatWorld(100.5, 100.5), spawn: [100.5, GROUND, 100.5],
    });
    hunter.handle({ t: 'welcome', id: 1, players: [{ id: 2, name: 'Ref', mode: 'player', hp: 10, dead: 0, pos: [180, GROUND, 100.5] }] });
    const p0 = hunter.getPos();
    const secs = 2.0, dt = 0.05;
    for (let i = 0; i < Math.round(secs / dt); i++) hunter.tick(dt);
    const p1 = hunter.getPos();
    const speed = hypot(p1[0] - p0[0], p1[2] - p0[2]) / secs;
    ok(Math.abs(speed - 9.6) < 0.1, `(f) el bot se desplaza a ≈9.6 u/s (${speed.toFixed(2)})`);
    ok(Math.abs(speed - 2 * 4.8) < 0.1, `(f) es el DOBLE de los 4.8 del jugador de referencia (200 %)`);
  }

  // =====================================================================
  // 6. (h) cero `edit` en TODA la sesión de TODOS los bots
  // =====================================================================
  {
    const allBotFrames = harnesses.flatMap(h => h.frames);
    const edits = allBotFrames.filter(f => f.t === 'edit');
    ok(allBotFrames.length > 0, `(h) se registraron frames salientes del bot (${allBotFrames.length})`);
    ok(edits.length === 0, `(h) el bot nunca mandó un \`edit\` (${edits.length})`);
  }

  // =====================================================================
  // 7. (BOT_SKIN) el aspecto del bot es configurable y viaja en el hello
  //    Sin server real: WebSocket falso (mismo patrón que hora-argentina.mjs)
  //    para aislar el cableado de `bot/index.js`.
  // =====================================================================
  {
    // WebSocket falso: sólo la superficie que usa el cableado (on/send/close/terminate).
    class FakeWS {
      constructor() {
        this.readyState = FakeWS.OPEN;
        this.handlers = {};
        setTimeout(() => this.fire('open'), 0); // `open` async, como el real
      }
      on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
      fire(ev, ...a) { for (const fn of (this.handlers[ev] || [])) fn(...a); }
      send() {}
      close() { this.fire('close'); }
      terminate() { this.fire('close'); }
    }
    FakeWS.OPEN = 1;

    // Arranca el bot real con el socket falso y devuelve el primer `hello` (y sus frames).
    const helloDe = async (cfg = {}) => {
      const frames = [];
      const client = createBotClient({
        url: 'ws://fake', name: BOT_NAME, WebSocket: FakeWS,
        worldBuilder: () => flatWorld(), mvMs: 100000, log: () => {},
        backoffBaseMs: 10, backoffCapMs: 20,
        onOutgoing: f => frames.push(Object.assign({}, f, { _t: Date.now() })),
        ...cfg,
      });
      client.start();
      const hello = await until(() => frames.find(f => f.t === 'hello'));
      return { client, frames, hello };
    };

    const prevSkin = process.env.BOT_SKIN;
    delete process.env.BOT_SKIN; // el caso "default" no debe heredar el entorno del CI
    try {
      {
        const h = await helloDe({ skin: 'giant' });
        ok(!!h.hello && h.hello.skin === 'giant',
          `(BOT_SKIN) cfg.skin:'giant' ⇒ hello con skin:'giant' (${h.hello && h.hello.skin})`);
        h.client.stop();
      }
      {
        const h = await helloDe();
        ok(!!h.hello && h.hello.skin === 'robot',
          `(BOT_SKIN) sin cfg ni env ⇒ hello con skin:'robot' (${h.hello && h.hello.skin})`);
        h.client.stop();
      }
      {
        process.env.BOT_SKIN = 'fat';
        const h = await helloDe();
        ok(!!h.hello && h.hello.skin === 'fat',
          `(BOT_SKIN) BOT_SKIN=fat ⇒ hello con skin:'fat' (${h.hello && h.hello.skin})`);
        h.client.stop();
      }
      {
        process.env.BOT_SKIN = 'fat';
        const h = await helloDe({ skin: 'small' });
        ok(!!h.hello && h.hello.skin === 'small',
          `(BOT_SKIN) cfg.skin gana sobre BOT_SKIN (${h.hello && h.hello.skin})`);
        h.client.stop();
      }
      {
        const h = await helloDe({ skin: 'giant' });
        h.client.terminate();
        const re = await until(() => h.frames.filter(f => f.t === 'hello').length >= 2, 5000);
        const hellos = h.frames.filter(f => f.t === 'hello');
        ok(!!re && hellos.every(f => f.skin === 'giant'),
          `(BOT_SKIN) al reconectar reenvía el mismo aspecto (${hellos.map(f => f.skin).join(',')})`);
        h.client.stop();
      }
    } finally {
      if (prevSkin === undefined) delete process.env.BOT_SKIN; else process.env.BOT_SKIN = prevSkin;
    }
  }
} catch (e) {
  console.log('❌ excepción: ' + (e && e.stack || e));
  fails++;
}

shutdown(0);
