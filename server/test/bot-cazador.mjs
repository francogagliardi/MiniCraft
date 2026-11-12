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
// admin), (e) invulnerabilidad, (f) velocidad 28.8, (g) reconexión, (h) cero
// `edit`, (i) `skin:'robot'` difundido. Extra: la réplica de findSpawn() coincide
// con la del cliente.
//
// Change cazador-noclip-vuelo (casos de lógica pura, reloj fijo y mundos
// inyectados): (j) no-clip horizontal, (k) vuelo a una torre, (l) vuelo a una
// cueva, (m) sin gravedad/snap al suelo, (n) constantes exportadas, (o) banda
// muerta, (s) alineación en SIGUEME, (t) alineación al spawn, (r) límites del
// mundo (x/z y vertical) y (u) ESPERA congela también la altura.
//
// Uso: node test/bot-cazador.mjs   (sale con código != 0 si algo falla)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import WebSocket from 'ws';
import { startApp, connect } from './support/app-fixture.mjs';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(dir, '..');
const root = path.join(serverDir, '..');
const { createBotClient, createHunter, parseWorld } = require(path.join(root, 'bot', 'index.js'));
const { SPEED, FLY_Y_OFFSET, FLY_Y_DEADBAND } = require(path.join(root, 'bot', 'cazador.js'));

const TIMEOUT = 8000;
const SWORD = 100;
const GROUND = 30;           // y del mundo plano de test
const BOT_NAME = 'OPSX-bot';
const BOT_TOKEN = 'bot-secret-1234567890';
const ACCOUNTS = {
  Boss: { password: 'admin-12345', role: 'admin' },
  Witness: { password: 'admin-12345', role: 'admin' },
  Victima: { password: 'password-123' },
  Impostor: { password: 'password-123' },
};
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
const flatWorld = (sx = 100.5, sz = 100.5, H = 40) => ({
  W: 208, H, topSolidY: () => GROUND, blocked: () => false, set() {},
  findSpawn: () => [sx, GROUND, sz],
});
// ---- mundo SÓLIDO inyectado: `blocked` total y techo alto. Con el no-clip el
// bot debe moverse igual; con la colisión vieja se quedaba clavado. ----
const solidWorld = (sx = 100.5, sz = 100.5, H = 40) => ({
  W: 208, H, topSolidY: () => GROUND + 30, blocked: () => true, set() {},
  findSpawn: () => [sx, GROUND, sz],
});

// ---- lógica pura con reloj fijo: un welcome con UNA presa y N ticks ----
function pureHunt(cfg) {
  const frames = [];
  const hunter = createHunter({
    send: (f) => frames.push(f), now: () => 0, log: () => {},
    world: cfg.world || flatWorld(), spawn: cfg.spawn,
  });
  const players = cfg.players || [{
    id: 2, name: 'Ref', mode: 'player', hp: 10, dead: 0, pos: cfg.prey,
  }];
  hunter.handle({ t: 'welcome', id: 1, players });
  for (let i = 0; i < (cfg.ticks ?? 0); i++) hunter.tick(cfg.dt ?? 0.05);
  return { hunter, frames };
}
const pureHits = (frames) => frames.filter(f => f.t === 'hit');

// ---- bot real con espía de frames salientes ----
const harnesses = [];
function startBot(opts = {}) {
  const frames = [];
  const spawnAt = opts.spawn || [100.5, 100.5];
  const client = createBotClient({
    url: APP.wsUrl(),
    token: BOT_TOKEN,
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
  const acct = ACCOUNTS[name];
  if (!acct) throw new Error('cuenta de test inexistente: ' + name);
  const p = {
    name, admin: acct.role === 'admin',
    hp: 10, dead: 0, godT: 0, phitApplied: [], phitIgnored: 0,
    pos: (opts.pos || [128.5, 20, 136.5]).slice(), seen: [], id: null, botId: null, seq: 0,
  };
  const cookie = await APP.login(name, acct.password);
  const c = await connect(APP.wsUrl(), { headers: { Cookie: cookie } });
  if (c.status !== 101) throw new Error('upgrade rechazado ' + c.status);
  p.ws = c.ws;
  p.ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    p.seen.push(Object.assign({}, m, { _t: Date.now() }));
    if (m.t === 'welcome') for (const q of (m.players || [])) if (q.name === BOT_NAME) p.botId = q.id;
    if (m.t === 'join' && m.name === BOT_NAME) p.botId = m.id;
    // La víctima del bot SÍ tiene la ventana de 0.6 s (como el cliente real).
    if (m.t === 'phit' && p.botId !== null && m.fromId === p.botId) applyDamage(p, m.dmg);
  });
  p.ws.send(JSON.stringify({ t: 'hello', name, mode: p.admin ? 'admin' : 'player', skin: 'human' }));
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

// ---- app real (createApp en proceso + MemoryStore) ----
let APP = null;
function shutdown(code) {
  if (fails || code) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
  console.log('\n🎉 bot cazador OK');
  process.exit(0);
}
setTimeout(() => { console.log('❌ timeout global'); shutdown(1); }, 150000).unref();

APP = await startApp({
  users: Object.entries(ACCOUNTS).map(([username, a]) => ({ username, password: a.password, role: a.role || 'user' })),
  botToken: BOT_TOKEN,
  env: { TOD_INTERVAL_MS: '500' },
});
ok(true, 'server en proceso levanta');

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

  // =====================================================================
  // 1. (b) ignora a un admin pegado + (i) skin difundido + (h) cero edit
  // =====================================================================
  {
    const adminA = await fakePlayer('Boss');
    const botA = startBot();
    // (i) `welcome.players` trae solo a los YA registrados: esperamos que el bot esté
    // adentro antes de que entre el testigo (si no, el snapshot puede no traerlo).
    await botReady(botA);
    const adminB = await fakePlayer('Witness');
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
    const admin = await fakePlayer('Boss', { pos: [128.5, GROUND, 128.5] });
    const botC = startBot();
    await botReady(botC);
    // impostor: cuenta común (el server impone su username, no puede usar el del admin)
    const imp = await fakePlayer('Impostor', { pos: [190, GROUND, 190] });
    mvLoop(imp);
    mvLoop(admin);
    ok(botC.client.getMode() === 'CAZA', '(c/d) el bot arranca en CAZA');

    // (d) los comandos del impostor son ignorados (el bot conserva CAZA)
    const chatsBefore = chats(botC).length;
    imp.ws.send(JSON.stringify({ t: 'chat', text: 'sigueme' }));
    await wait(700);
    ok(botC.client.getMode() === 'CAZA', '(d) `sigueme` de un no-admin ⇒ sigo en CAZA');
    imp.ws.send(JSON.stringify({ t: 'chat', text: 'espera' }));
    await wait(700);
    ok(botC.client.getMode() === 'CAZA', '(d) `espera` del impostor ⇒ sigo en CAZA');
    ok(chats(botC).length === chatsBefore, '(d) el impostor NO provocó ningún anuncio de cambio de modo');

    // (d) el flag `admin:true` del SERVER es autoritativo aunque el roster diga player
    // (carrera chat/join): se prueba con la lógica pura.
    {
      const frames = [];
      const h = createHunter({ send: (f) => frames.push(f), now: () => 0, log: () => {}, world: flatWorld(), spawn: [100.5, GROUND, 100.5] });
      h.handle({ t: 'welcome', id: 1, players: [{ id: 7, name: 'FlagAdmin', mode: 'player', dead: 0, pos: [120, GROUND, 120] }] });
      h.handle({ t: 'chat', fromId: 7, from: 'FlagAdmin', text: 'espera', admin: true });
      ok(h.getMode() === 'ESPERA', '(d) chat con admin:true del server autoriza aunque el roster diga player');
    }

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
  // 5. (f) velocidad 28.8 (medida directa sobre la lógica con reloj fijo)
  // =====================================================================
  {
    // 80 bloques de distancia: 2 s a 28.8 = 57.6 < 80 - CHASE_STOP, así no se
    // frena en el umbral y la medición es de velocidad pura.
    const { hunter } = pureHunt({
      world: flatWorld(100.5, 100.5), spawn: [100.5, GROUND, 100.5],
      prey: [180.5, GROUND, 100.5], ticks: 40, dt: 0.05,
    });
    const p0 = [100.5, GROUND, 100.5];
    const p1 = hunter.getPos();
    const speed = hypot(p1[0] - p0[0], p1[2] - p0[2]) / 2.0;
    ok(Math.abs(speed - 28.8) < 0.1, `(f) el bot se desplaza a ≈28.8 u/s (${speed.toFixed(2)})`);
    ok(Math.abs(speed - 6 * 4.8) < 0.1, `(f) es SEIS veces los 4.8 del jugador de referencia (600 %)`);

    // (f-borde) la rapidez HORIZONTAL no depende del vuelo: mismo cómputo con la
    // presa 12 bloques más arriba (el bot sube mientras avanza).
    const tower = pureHunt({
      world: flatWorld(100.5, 100.5, 80), spawn: [100.5, GROUND, 100.5],
      prey: [180.5, GROUND + 12, 100.5], ticks: 20, dt: 0.05,
    });
    const t1 = tower.hunter.getPos();
    const hSpeed = hypot(t1[0] - p0[0], t1[2] - p0[2]) / 1.0;
    ok(Math.abs(hSpeed - 28.8) < 0.1, `(f) subiendo, la rapidez horizontal sigue ≈28.8 u/s (${hSpeed.toFixed(2)})`);
    ok(Math.abs(t1[1] - (GROUND + 12 + FLY_Y_OFFSET)) < 0.3,
      `(f) mientras avanza también ganó altura (y=${t1[1].toFixed(2)})`);
  }

  // =====================================================================
  // 6. (n) constantes exportadas del vuelo
  // =====================================================================
  {
    ok(SPEED === 28.8, `(n) SPEED === 28.8 (${SPEED})`);
    ok(Math.abs(SPEED - 6 * 4.8) < 1e-9, `(n) 28.8 = 6 × 4.8 (${SPEED / 4.8})`);
    ok(FLY_Y_OFFSET === 0.5, `(n) FLY_Y_OFFSET === 0.5 (${FLY_Y_OFFSET})`);
    ok(FLY_Y_DEADBAND === 0.25, `(n) FLY_Y_DEADBAND === 0.25 (${FLY_Y_DEADBAND})`);
    ok(FLY_Y_DEADBAND < FLY_Y_OFFSET, `(n) la banda muerta es menor que el offset (${FLY_Y_DEADBAND} < ${FLY_Y_OFFSET})`);
  }

  // =====================================================================
  // 7. (j) no-clip horizontal: atraviesa un mundo con `blocked` TOTAL
  // =====================================================================
  {
    const { hunter, frames } = pureHunt({
      world: solidWorld(100.5, 100.5), spawn: [100.5, GROUND, 100.5],
      prey: [116.5, GROUND, 100.5], ticks: 40, dt: 0.05,
    });
    const p = hunter.getPos();
    const d = hypot(p[0] - 116.5, p[2] - 100.5);
    ok(d <= 3.8 + 1e-6, `(j) atraviesa la pared y llega a la distancia de detención (d=${d.toFixed(3)})`);
    ok(d >= 3.8 - 1e-6, `(j) no se pasa de largo ni termina encima de la presa (d=${d.toFixed(3)})`);
    const hits = pureHits(frames);
    ok(hits.length >= 1, `(j) golpea a la presa del otro lado del bloque (${hits.length} hit)`);

    // (j-borde) con dt máximo (0.25 s ⇒ paso 7.2 u) tampoco se pasa del umbral.
    const near = pureHunt({
      world: solidWorld(100.5, 100.5), spawn: [100.5, GROUND, 100.5],
      prey: [106.5, GROUND, 100.5], ticks: 1, dt: 0.25,
    });
    const np = near.hunter.getPos();
    const nd = hypot(np[0] - 106.5, np[2] - 100.5);
    ok(Math.abs(nd - 3.8) < 1e-6, `(j) con dt máximo recorta el paso a la distancia de detención (d=${nd.toFixed(3)})`);
  }

  // =====================================================================
  // 8. (k) torre y (l) cueva: la altura converge al objetivo + offset
  // =====================================================================
  {
    const tower = pureHunt({
      world: solidWorld(100.5, 100.5, 80), spawn: [100.5, GROUND, 100.5],
      prey: [116.5, GROUND + 12, 100.5], ticks: 80, dt: 0.05,
    });
    const tp = tower.hunter.getPos();
    const td = hypot(tp[0] - 116.5, tp[2] - 100.5);
    ok(Math.abs(tp[1] - (GROUND + 12 + FLY_Y_OFFSET)) <= 0.3,
      `(k) sube a la torre y queda en presa.y + offset (y=${tp[1].toFixed(2)}, esperado ${GROUND + 12 + FLY_Y_OFFSET})`);
    ok(td <= 3.8 + 1e-6, `(k) la distancia horizontal cae a la de detención (d=${td.toFixed(3)})`);
    ok(pureHits(tower.frames).length >= 1, `(k) golpea a la presa de la torre (${pureHits(tower.frames).length} hit)`);

    const cave = pureHunt({
      world: solidWorld(100.5, 100.5), spawn: [100.5, GROUND, 100.5],
      prey: [116.5, GROUND - 10, 100.5], ticks: 80, dt: 0.05,
    });
    const cp = cave.hunter.getPos();
    const cd = hypot(cp[0] - 116.5, cp[2] - 100.5);
    ok(Math.abs(cp[1] - (GROUND - 10 + FLY_Y_OFFSET)) <= 0.3,
      `(l) baja a la cueva y queda en presa.y + offset (y=${cp[1].toFixed(2)}, esperado ${GROUND - 10 + FLY_Y_OFFSET})`);
    ok(cd <= 3.8 + 1e-6, `(l) la distancia horizontal cae a la de detención (d=${cd.toFixed(3)})`);
    ok(pureHits(cave.frames).length >= 1, `(l) golpea a la presa de la cueva (${pureHits(cave.frames).length} hit)`);
  }

  // =====================================================================
  // 9. (m) sin gravedad/snap y (o) banda muerta
  // =====================================================================
  {
    // (m) ya alineado, 20 ticks más con `topSolidY` alto: la y NO se mueve ni
    // cae al suelo. El `resolveGround` viejo la pegaba a `topSolidY`.
    const { hunter } = pureHunt({
      world: solidWorld(100.5, 100.5, 80), spawn: [100.5, GROUND + 20, 100.5],
      prey: [116.5, GROUND, 100.5], ticks: 30, dt: 0.05,
    });
    const yAligned = hunter.getPos()[1];
    ok(Math.abs(yAligned - (GROUND + FLY_Y_OFFSET)) <= 0.3,
      `(m) converge al objetivo (y=${yAligned.toFixed(2)})`);
    for (let i = 0; i < 20; i++) hunter.tick(0.05);
    const yAfter = hunter.getPos()[1];
    ok(Math.abs(yAfter - yAligned) < 1e-6,
      `(m) 20 ticks en el aire no la bajan ni la snapean al suelo (${yAligned.toFixed(2)} → ${yAfter.toFixed(2)})`);
    ok(yAfter > GROUND + 0.2, `(m) sigue por encima del suelo (y=${yAfter.toFixed(2)})`);

    // (o) dentro de la banda muerta no corrige: |Δy| = 0.1 < 0.25.
    const dead = pureHunt({
      world: flatWorld(100.5, 100.5), spawn: [100.5, GROUND + 0.4, 100.5],
      prey: [110.5, GROUND, 100.5], ticks: 5, dt: 0.05,
    });
    const yFlat = dead.hunter.getPos()[1];
    ok(yFlat === GROUND + 0.4, `(o) la y no cambia dentro de la banda muerta (${yFlat})`);

    // (o-borde) apenas por encima de la banda SÍ corrige hasta el objetivo.
    const edge = pureHunt({
      world: flatWorld(100.5, 100.5), spawn: [100.5, GROUND + FLY_Y_OFFSET + FLY_Y_DEADBAND + 0.1, 100.5],
      prey: [110.5, GROUND, 100.5], ticks: 5, dt: 0.05,
    });
    const yEdge = edge.hunter.getPos()[1];
    ok(Math.abs(yEdge - (GROUND + FLY_Y_OFFSET)) < 1e-9,
      `(o) fuera de la banda corrige al objetivo (y=${yEdge.toFixed(3)})`);
  }

  // =====================================================================
  // 10. (s) SIGUEME alinea con el admin y (t) el retorno al spawn también
  // =====================================================================
  {
    const { hunter } = pureHunt({
      world: solidWorld(100.5, 100.5, 80), spawn: [100.5, GROUND, 100.5],
      players: [{ id: 2, name: 'Boss', mode: 'admin', hp: 10, dead: 0, pos: [110.5, GROUND + 8, 100.5] }],
      ticks: 0,
    });
    hunter.handle({ t: 'chat', text: 'sigueme', fromId: 2 });
    for (let i = 0; i < 60; i++) hunter.tick(0.05);
    const sp = hunter.getPos();
    ok(hunter.getMode() === 'SIGUEME', '(s) el bot entró en SIGUEME');
    ok(Math.abs(sp[1] - (GROUND + 8 + FLY_Y_OFFSET)) <= 0.3,
      `(s) en SIGUEME la y converge al admin + offset (y=${sp[1].toFixed(2)})`);
    ok(hypot(sp[0] - 110.5, sp[2] - 100.5) <= 1.5 + 1e-6,
      `(s) converge horizontalmente al admin (d=${hypot(sp[0] - 110.5, sp[2] - 100.5).toFixed(2)})`);

    // (t) CAZA sin presas: vuelve al spawn y alinea con SU altura + offset.
    const home = pureHunt({
      world: solidWorld(100.5, 100.5, 80), spawn: [100.5, GROUND + 5, 100.5],
      players: [], ticks: 30, dt: 0.05,
    });
    const hp = home.hunter.getPos();
    ok(Math.abs(hp[1] - (GROUND + 5 + FLY_Y_OFFSET)) <= 0.3,
      `(t) sin presas alinea con la altura del spawn (y=${hp[1].toFixed(2)})`);
    ok(Math.abs(hp[0] - 100.5) < 1e-9 && Math.abs(hp[2] - 100.5) < 1e-9,
      '(t) ya en el spawn no se desplaza en horizontal');
  }

  // =====================================================================
  // 11. (r) límites del mundo: x/z a [1, W-2] y la y a [0, H-1]
  // =====================================================================
  {
    const { hunter } = pureHunt({
      world: flatWorld(100.5, 100.5), spawn: [100.5, GROUND, 100.5],
      prey: [500, GROUND + 100, 100.5], ticks: 200, dt: 0.05,
    });
    const p = hunter.getPos();
    ok(p[0] === 208 - 2, `(r) la x se clava en el borde [1, 206] (${p[0]})`);
    ok(p[1] === 40 - 1, `(r) la y se clava en el borde [0, 39] (${p[1]})`);
    ok(p[1] > GROUND, `(r) no la clava al suelo persiguiendo algo alto (y=${p[1].toFixed(2)})`);
  }

  // =====================================================================
  // =====================================================================
  // 12. (u) ESPERA congela las tres coordenadas, también la altura
  // =====================================================================
  {
    const { hunter } = pureHunt({
      world: flatWorld(100.5, 100.5), spawn: [100.5, GROUND + 4, 100.5],
      players: [
        { id: 2, name: 'Boss', mode: 'admin', hp: 10, dead: 0, pos: [100.5, GROUND, 100.5] },
        { id: 3, name: 'Presa', mode: 'player', hp: 10, dead: 0, pos: [103.5, GROUND + 12, 100.5] },
      ], ticks: 0,
    });
    hunter.handle({ t: 'chat', text: 'espera', fromId: 2 });
    const frozen = hunter.getPos().slice();
    for (let i = 0; i < 30; i++) hunter.tick(0.05);
    const after = hunter.getPos();
    ok(hunter.getMode() === 'ESPERA', '(u) el bot está en ESPERA');
    ok(after[0] === frozen[0] && after[1] === frozen[1] && after[2] === frozen[2],
      `(u) un objetivo 12 bloques más alto no mueve el ancla (${frozen.join(',')} → ${after.join(',')})`);
  }

  // =====================================================================
  // 13. (h) cero `edit` en TODA la sesión de TODOS los bots
  // =====================================================================
  {
    const allBotFrames = harnesses.flatMap(h => h.frames);
    const edits = allBotFrames.filter(f => f.t === 'edit');
    ok(allBotFrames.length > 0, `(h) se registraron frames salientes del bot (${allBotFrames.length})`);
    ok(edits.length === 0, `(h) el bot nunca mandó un \`edit\` (${edits.length})`);
  }

  // =====================================================================
  // 14. (BOT_SKIN) el aspecto del bot es configurable y viaja en el hello
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
