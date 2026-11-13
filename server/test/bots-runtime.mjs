// Tests del runtime in-process de bots (change panel-bots-custom, capability
// bots/runtime): boot, roster, join/leave/pm, combate en las dos direcciones,
// muerte, stop, vuelo/caminata y cupo de activos.
// Uso: node test/bots-runtime.mjs
import { createRequire } from 'module';
import { startApp, connect, nextMessage, waitFor, sleep } from './support/app-fixture.mjs';
import { MemoryStore } from './support/memory-store.mjs';

const require = createRequire(import.meta.url);
const BotRuntime = require('../bot-runtime.js');
const Behaviors = require('../bot-behaviors.js');

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};
const json = (res) => res.json().catch(() => null);
const hypot = (dx, dz) => Math.sqrt(dx * dx + dz * dz);

const clock = { t: Date.now() };
const now = () => clock.t;
const advance = (ms) => { clock.t += ms; };

function expectNoFrame(ws, pred, ms = 300) {
  return waitFor(ws, pred, ms).then(() => false).catch(() => true);
}

async function join(base, login, username, password) {
  const cookie = await login(username, password);
  const conn = await connect(base.wsUrl(), { headers: { Cookie: cookie } });
  conn.ws.send(JSON.stringify({ t: 'hello', name: username, mode: 'player', skin: 'human' }));
  const welcome = await nextMessage(conn.ws, 'welcome');
  return { conn, cookie, welcome };
}

function move(conn, pos, extra = {}) {
  conn.ws.send(JSON.stringify({
    t: 'mv', p: [pos[0], pos[1], pos[2]], yaw: 0, pitch: 0, hp: 10, dead: 0, held: 0, seq: 0, ...extra,
  }));
}

const BOT_ROW = (extra = {}) => ({
  name: 'OPSX-bot', behavior: 'cazador', skin: 'robot', hp: 10, damage: 6,
  reach: 4.6, speed: 28.8, flying: true, takesDamage: false, active: true, ...extra,
});

// ===========================================================================
// A. app completa: boot, roster, join/leave/pm y combate cableado
// ===========================================================================
const FIX = await startApp({
  users: [
    { username: 'admin', password: 'admin-12345', role: 'admin' },
    { username: 'ana', password: 'correcta-123', role: 'user', skin: 'human' },
    { username: 'prot', password: 'correcta-123', role: 'user', permissions: { bot_ignore: true } },
  ],
  bots: [
    BOT_ROW(),
    BOT_ROW({ name: 'durmiente', behavior: 'merodeador', skin: 'human', damage: 0, reach: 1, speed: 6, flying: false, active: false }),
  ],
  now,
});

try {
  const adminCookie = await FIX.login('admin', 'admin-12345');
  const botRows = await FIX.store.listBots();
  const hunterRow = botRows.find(b => b.name === 'OPSX-bot');
  const sleeperRow = botRows.find(b => b.name === 'durmiente');
  const hunterId = -hunterRow.id;

  // ---- 3.1 boot y roster ----
  {
    const { conn, welcome } = await join(FIX, FIX.login, 'ana', 'correcta-123');
    const entry = (welcome.players || []).find(p => p.name === 'OPSX-bot');
    ok(!!entry, 'un bot activo aparece en welcome.players al bootear');
    ok(entry && entry.bot === true, 'la entrada del bot lleva bot:true');
    ok(entry && entry.id === hunterId && entry.id < 0, 'el id del bot es negativo y reservado');
    ok(entry && entry.skin === 'robot' && entry.name === 'OPSX-bot', 'el roster trae skin y nombre configurados');
    ok(entry && entry.hp === 10 && entry.maxHp === 10, 'el roster trae hp y maxHp');
    ok(entry && Array.isArray(entry.pos) && entry.pos.length === 3, 'el roster trae la posición del bot');
    ok(!(welcome.players || []).some(p => p.name === 'durmiente'), 'un bot inactivo no aparece en el roster');
    ok(welcome.sleepNeed === 1, 'el bot no suma al quórum de sueño (need=1)');
    conn.ws.close();
    await sleep(20);
  }

  // ---- 3.2 join/leave/pm y convivencia de ids ----
  {
    const { conn } = await join(FIX, FIX.login, 'ana', 'correcta-123');
    const joinP = waitFor(conn.ws, m => m.t === 'join' && m.name === 'durmiente');
    const start = await FIX.request(`/api/admin/bots/${sleeperRow.id}/start`, { method: 'POST', cookie: adminCookie });
    ok(start.status === 200, 'start de un bot inactivo → 200');
    const jn = await joinP;
    ok(jn.bot === true && jn.id === -sleeperRow.id, 'lanzar un bot difunde join con bot:true e id negativo');

    advance(120);
    FIX.app.bots.tick(0.05);
    const pm = await waitFor(conn.ws, m => m.t === 'pm' && m.id === jn.id);
    ok(Array.isArray(pm.p) && pm.p.length === 3 && Number.isFinite(pm.hp) && pm.dead === 0,
      'el pm del bot trae posición, hp y dead');
    ok(pm.maxHp === 10 && pm.skin === 'human', 'el pm aditivo trae maxHp y skin');

    const hunterIds = FIX.app.bots.list().map(b => b.id);
    ok(new Set(hunterIds).size === hunterIds.length && hunterIds.every(id => id < 0),
      'dos bots activos tienen ids negativos sin colisión');
    ok(hunterIds.includes(hunterId) && hunterIds.includes(-sleeperRow.id),
      'los ids de los bots conviven con el id positivo del jugador');

    const lvP = waitFor(conn.ws, m => m.t === 'leave' && m.id === jn.id);
    const stop = await FIX.request(`/api/admin/bots/${sleeperRow.id}/stop`, { method: 'POST', cookie: adminCookie });
    ok(stop.status === 200, 'stop de un bot activo → 200');
    const lv = await lvP;
    ok(lv.id === jn.id, 'detener un bot difunde su leave');    conn.ws.close();
    await sleep(20);
  }

  // ---- 3.3 cazador: persigue, daña y respeta las reglas ----
  {
    const { conn } = await join(FIX, FIX.login, 'ana', 'correcta-123');
    const bot = FIX.app.bots.getByDbId(hunterRow.id);
    ok(!!bot, 'el runtime expone el bot activo');
    move(conn, [bot.pos[0] + 1, bot.pos[1], bot.pos[2]]);
    await sleep(40);

    advance(700);
    FIX.app.bots.tick(0.05);
    const hit1 = await waitFor(conn.ws, m => m.t === 'phit' && m.fromId === hunterId);
    ok(hit1.dmg === 6 && hit1.from === 'OPSX-bot', 'el cazador emite phit con su damage configurado');

    const noDup = await expectNoFrame(conn.ws, m => m.t === 'phit' && m.fromId === hunterId, 250);
    ok(noDup, 'no repite golpe antes de los 650 ms');
    advance(700);
    FIX.app.bots.tick(0.05);
    const hit2 = await waitFor(conn.ws, m => m.t === 'phit' && m.fromId === hunterId);
    ok(hit2.dmg === 6, 'pasada la ventana de 650 ms vuelve a golpear');
    conn.ws.close();
    await sleep(20);
  }
  {
    const { conn } = await join(FIX, FIX.login, 'admin', 'admin-12345');
    const bot = FIX.app.bots.getByDbId(hunterRow.id);
    move(conn, [bot.pos[0] + 0.5, bot.pos[1], bot.pos[2]]);
    await sleep(40);
    for (let i = 0; i < 3; i++) { advance(700); FIX.app.bots.tick(0.05); }
    ok(await expectNoFrame(conn.ws, m => m.t === 'phit', 300), 'el cazador nunca ataca a un admin');
    conn.ws.close();
    await sleep(20);
  }
  {
    const { conn } = await join(FIX, FIX.login, 'prot', 'correcta-123');
    const bot = FIX.app.bots.getByDbId(hunterRow.id);
    move(conn, [bot.pos[0] + 0.5, bot.pos[1], bot.pos[2]]);
    await sleep(40);
    for (let i = 0; i < 3; i++) { advance(700); FIX.app.bots.tick(0.05); }
    ok(await expectNoFrame(conn.ws, m => m.t === 'phit', 300), 'el cazador nunca ataca a un jugador con bot_ignore');
    conn.ws.close();
    await sleep(20);
  }
  {
    // bot_ignore aplicado en caliente por el panel.
    const { conn } = await join(FIX, FIX.login, 'ana', 'correcta-123');
    let bot = FIX.app.bots.getByDbId(hunterRow.id);
    move(conn, [bot.pos[0] + 0.5, bot.pos[1], bot.pos[2]]);
    await sleep(40);
    advance(700); FIX.app.bots.tick(0.05);
    const first = await waitFor(conn.ws, m => m.t === 'phit' && m.fromId === hunterId);
    ok(first.dmg === 6, 'el cazador golpea a un jugador sin bot_ignore');

    const usersRes = await json(await FIX.request('/api/admin/users', { cookie: adminCookie }));
    const anaId = usersRes.users.find(u => u.username === 'ana').id;
    await FIX.request(`/api/admin/users/${anaId}`, {
      method: 'PATCH', cookie: adminCookie, body: { permissions: { bot_ignore: true } },
    });
    bot = FIX.app.bots.getByDbId(hunterRow.id);
    move(conn, [bot.pos[0] + 0.5, bot.pos[1], bot.pos[2]]);
    await sleep(40);
    advance(700); FIX.app.bots.tick(0.05);
    ok(await expectNoFrame(conn.ws, m => m.t === 'phit' && m.fromId === hunterId, 300),
      'bot_ignore en caliente: el cazador lo abandona en el siguiente tick');

    await FIX.request(`/api/admin/users/${anaId}`, {
      method: 'PATCH', cookie: adminCookie, body: { permissions: {} },
    });
    bot = FIX.app.bots.getByDbId(hunterRow.id);
    move(conn, [bot.pos[0] + 0.5, bot.pos[1], bot.pos[2]]);
    await sleep(40);
    advance(700); FIX.app.bots.tick(0.05);
    const back = await waitFor(conn.ws, m => m.t === 'phit' && m.fromId === hunterId);
    ok(back.dmg === 6, 'al revocar bot_ignore vuelve a considerarlo una presa válida');
    conn.ws.close();
    await sleep(20);
  }
  {
    // damage:0 no emite, aunque persiga.
    const created = await FIX.request('/api/admin/bots', {
      method: 'POST', cookie: adminCookie,
      body: { name: 'sin-dano', behavior: 'cazador', damage: 0, flying: true },
    });
    const row = (await created.json()).bot;
    await FIX.request(`/api/admin/bots/${row.id}/start`, { method: 'POST', cookie: adminCookie });
    const { conn } = await join(FIX, FIX.login, 'ana', 'correcta-123');
    const bot = FIX.app.bots.getByDbId(row.id);
    move(conn, [bot.pos[0] + 0.5, bot.pos[1], bot.pos[2]]);
    await sleep(40);
    for (let i = 0; i < 3; i++) { advance(700); FIX.app.bots.tick(0.05); }
    ok(await expectNoFrame(conn.ws, m => m.t === 'phit' && m.fromId === -row.id, 300),
      'un cazador con damage:0 persigue pero no emite daño');
    conn.ws.close();
    await sleep(20);
    await FIX.request(`/api/admin/bots/${row.id}/stop`, { method: 'POST', cookie: adminCookie });
  }
  {
    // merodeador con damage>0 nunca ataca.
    const created = await FIX.request('/api/admin/bots', {
      method: 'POST', cookie: adminCookie,
      body: { name: 'paseante', behavior: 'merodeador', damage: 6, flying: false },
    });
    const row = (await created.json()).bot;
    await FIX.request(`/api/admin/bots/${row.id}/start`, { method: 'POST', cookie: adminCookie });
    const { conn } = await join(FIX, FIX.login, 'ana', 'correcta-123');
    const bot = FIX.app.bots.getByDbId(row.id);
    move(conn, [bot.pos[0] + 0.5, bot.pos[1], bot.pos[2]]);
    await sleep(40);
    for (let i = 0; i < 3; i++) { advance(700); FIX.app.bots.tick(0.05); }
    ok(await expectNoFrame(conn.ws, m => m.t === 'phit' && m.fromId === -row.id, 300),
      'el merodeador no emite daño aunque tenga damage mayor que cero');
    conn.ws.close();
    await sleep(20);
    await FIX.request(`/api/admin/bots/${row.id}/stop`, { method: 'POST', cookie: adminCookie });
  }

  // ---- 3.4 golpes del jugador a un bot ----
  {
    const created = await FIX.request('/api/admin/bots', {
      method: 'POST', cookie: adminCookie,
      body: { name: 'vulnerable', behavior: 'merodeador', hp: 10, takesDamage: true, flying: false },
    });
    const row = (await created.json()).bot;
    await FIX.request(`/api/admin/bots/${row.id}/start`, { method: 'POST', cookie: adminCookie });
    const { conn } = await join(FIX, FIX.login, 'ana', 'correcta-123');
    const bot = FIX.app.bots.getByDbId(row.id);
    move(conn, [bot.pos[0] + 0.5, bot.pos[1], bot.pos[2]]);
    await sleep(40);

    conn.ws.send(JSON.stringify({ t: 'hit', id: -row.id, dmg: 6, dx: 1, dz: 0 }));
    const h1P = waitFor(conn.ws, m => m.t === 'hitok' && m.id === -row.id);
    const h1 = await h1P;
    ok(h1.dmg === 2 && h1.hp === 8, 'un golpe válido descuenta 2 e ignora el dmg del frame');

    const h2P = waitFor(conn.ws, m => m.t === 'hitok' && m.id === -row.id);
    conn.ws.send(JSON.stringify({ t: 'hit', id: -row.id, dmg: 6, dx: 1, dz: 0 }));
    const h2 = await h2P;
    ok(h2.dmg === 0 && h2.hp === 8, 'dentro del cooldown no descuenta vida');

    advance(600);
    const h3P = waitFor(conn.ws, m => m.t === 'hitok' && m.id === -row.id);
    conn.ws.send(JSON.stringify({ t: 'hit', id: -row.id, dmg: 6, dx: 1, dz: 0 }));
    const h3 = await h3P;
    ok(h3.dmg === 2 && h3.hp === 6, 'pasado el cooldown vuelve a descontar 2');

    move(conn, [bot.pos[0] + 40, bot.pos[1], bot.pos[2]]);
    await sleep(40);
    advance(600);
    const h4P = waitFor(conn.ws, m => m.t === 'hitok' && m.id === -row.id);
    conn.ws.send(JSON.stringify({ t: 'hit', id: -row.id, dmg: 6, dx: 1, dz: 0 }));
    const h4 = await h4P;
    ok(h4.dmg === 0 && h4.hp === 6, 'fuera del alcance de la espada no descuenta vida');

    move(conn, [bot.pos[0] + 0.5, bot.pos[1], bot.pos[2]]);
    await sleep(40);
    advance(600);
    const immuneP = waitFor(conn.ws, m => m.t === 'hitok' && m.id === hunterId);
    conn.ws.send(JSON.stringify({ t: 'hit', id: hunterId, dmg: 6, dx: 1, dz: 0 }));
    const immune = await immuneP;
    ok(immune.dmg === 0 && immune.hp === 10, 'un bot con takes_damage:false responde dmg:0 sin cambiar su vida');
    conn.ws.close();
    await sleep(20);
    await FIX.request(`/api/admin/bots/${row.id}/stop`, { method: 'POST', cookie: adminCookie });
  }

  // ---- 3.5 muerte, stop y mundo intacto ----
  {
    const created = await FIX.request('/api/admin/bots', {
      method: 'POST', cookie: adminCookie,
      body: { name: 'fragil', behavior: 'merodeador', hp: 4, takesDamage: true, flying: false },
    });
    const row = (await created.json()).bot;
    await FIX.request(`/api/admin/bots/${row.id}/start`, { method: 'POST', cookie: adminCookie });
    const { conn } = await join(FIX, FIX.login, 'ana', 'correcta-123');
    const frames = [];
    conn.ws.on('message', raw => { try { frames.push(JSON.parse(raw.toString())); } catch (e) {} });
    const bot = FIX.app.bots.getByDbId(row.id);
    move(conn, [bot.pos[0] + 0.5, bot.pos[1], bot.pos[2]]);
    await sleep(40);

    const firstP = waitFor(conn.ws, m => m.t === 'hitok' && m.id === -row.id);
    conn.ws.send(JSON.stringify({ t: 'hit', id: -row.id, dmg: 2, dx: 1, dz: 0 }));
    await firstP;
    advance(600);
    const deadHitP = waitFor(conn.ws, m => m.t === 'hitok' && m.id === -row.id && m.dead === 1);
    const leaveP = waitFor(conn.ws, m => m.t === 'leave' && m.id === -row.id);
    conn.ws.send(JSON.stringify({ t: 'hit', id: -row.id, dmg: 2, dx: 1, dz: 0 }));
    const deadHit = await deadHitP;
    ok(deadHit.dmg === 2 && deadHit.hp === 0, 'el golpe mortal lleva hp 0 y dead 1');

    const lv = await leaveP;
    ok(!!lv, 'al morir el bot difunde leave');
    ok(!FIX.app.bots.list().some(b => b.dbId === row.id), 'el bot muerto sale del runtime');
    const stored = await FIX.store.getBotById(row.id);
    ok(stored && stored.active === false, 'el bot muerto queda active:false en la base');
    ok(stored && stored.hp === 4, 'la configuración del bot muerto queda intacta');
    const audit = await FIX.store.listAudit(200);
    const death = audit.find(e => e.action === 'bot.death');
    ok(!!death && death.actor.id === null, 'la muerte se audita como bot.death con actor nulo');
    ok(!!death && death.details && death.details.botName === 'fragil', 'la auditoría guarda el nombre del bot');

    await FIX.app.bots.boot();
    ok(!FIX.app.bots.list().some(b => b.dbId === row.id), 'el bot muerto no reaparece al volver a bootear');
    ok(!frames.some(f => f.t === 'pedit'), 'los bots no emiten pedit (no modifican el mundo)');
    conn.ws.close();
    await sleep(20);
  }
  {
    // stop conserva la configuración.
    const created = await FIX.request('/api/admin/bots', {
      method: 'POST', cookie: adminCookie,
      body: { name: 'temporal', behavior: 'merodeador', hp: 7 },
    });
    const row = (await created.json()).bot;
    await FIX.request(`/api/admin/bots/${row.id}/start`, { method: 'POST', cookie: adminCookie });
    await FIX.request(`/api/admin/bots/${row.id}/stop`, { method: 'POST', cookie: adminCookie });
    const stored = await FIX.store.getBotById(row.id);
    ok(stored && stored.active === false && stored.hp === 7 && stored.name === 'temporal',
      'stop lo saca del mundo sin borrar su configuración');
  }

  // ---- 3.3bis prefijo de hora de Argentina en el log del golpe ----
  {
    const logs = [];
    const store = new MemoryStore({ now: () => clock.t });
    const row = { id: 99, name: 'LogBot', behavior: 'cazador', skin: 'robot', hp: 10, damage: 6, reach: 4.6, speed: 28.8, flying: true, takesDamage: false };
    const rt = BotRuntime.create({
      store, world: { W: 64, H: 40, topSolidY: () => 30, freeForMob: () => true, surface: 10 },
      env: {}, now, log: (...a) => logs.push(a.join(' ')), warn: () => {},
      getPlayers: () => [{ id: 1, name: 'Presa', pos: [11, 30, 10.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }],
      broadcast: () => {}, sendToPlayer: () => {},
    });
    const spawned = rt.spawn(row);
    spawned.pos = [10.5, 30, 10.5];
    advance(700);
    rt.tick(0.05);
    const golpe = logs.find(l => l.includes('golpe a Presa'));
    ok(!!golpe, 'el runtime loguea cada golpe');
    ok(!!golpe && /^\[\d{2}:\d{2}\] /.test(golpe), 'la línea del golpe EMPIEZA con [HH:MM] de Argentina');
    ok(!!golpe && !golpe.includes('[bot]'), 'la línea del golpe no lleva tag [bot]');
    rt.close();
  }
} finally {
  await FIX.close();
}

// ===========================================================================
// B. runtime puro con mundo sintético: colisión, vuelo y cupo de boot
// ===========================================================================
function makeRuntime({ bots = [], world, warnLog = [], zombies = [], rng = Math.random } = {}) {
  const store = new MemoryStore({ bots, now: () => clock.t });
  const sent = [];
  const broadcasts = [];
  const zombieHits = [];
  const rt = BotRuntime.create({
    store, world, env: {}, now, rng,
    log: () => {}, warn: (...a) => warnLog.push(a.join(' ')),
    getPlayers: () => rt._players || [],
    getZombies: () => zombies.filter(z => !z.dead),
    damageZombie: (id, dmg, t) => {
      const z = zombies.find(q => q.i === id && !q.dead);
      if (!z || !(dmg > 0)) return null;
      z.hp -= dmg;
      if (z.hp <= 0) { z.hp = 0; z.dead = 1; z.deadAt = t; }
      zombieHits.push({ id, dmg, hp: z.hp, dead: z.dead, t });
      return { ok: true, hp: z.hp, dead: z.dead, z };
    },
    broadcast: (m) => broadcasts.push(m),
    sendToPlayer: (id, m) => sent.push({ id, ...m }),
  });
  rt._sent = sent;
  rt._broadcasts = broadcasts;
  rt._store = store;
  rt._zombies = zombies;
  rt._zombieHits = zombieHits;
  return rt;
}

const flatWorld = () => ({
  W: 64, H: 40, surface: 10,
  topSolidY: () => 30,
  freeForMob: () => true,
});
const wallWorld = () => ({
  W: 64, H: 40, surface: 10,
  topSolidY: (x, z) => (z === 20 ? 34 : 30),
  freeForMob: (x, y, z) => !(z === 20 && y >= 30 && y < 34),
});
// Un tronco de 1x1 (4 de alto) en la celda (10,20): se puede rodear por los
// costados, a diferencia de la pared que cruza todo el mundo.
const trunkWorld = () => {
  const trunk = (x, z) => Math.floor(x) === 10 && Math.floor(z) === 20;
  return {
    W: 64, H: 40, surface: 10,
    topSolidY: (x, z) => (trunk(x, z) ? 34 : 30),
    freeForMob: (x, y, z) => !(trunk(x, z) && y >= 30 && y < 34),
  };
};
// Pozo de una celda: todas las columnas vecinas están dos bloques más altas, así
// que el caminante no tiene ningún paso posible (objetivo inalcanzable).
const pitWorld = () => {
  const inside = (x, z) => Math.floor(x) === 10 && Math.floor(z) === 10;
  return {
    W: 64, H: 40, surface: 10,
    topSolidY: (x, z) => (inside(x, z) ? 30 : 32),
    freeForMob: (x, y, z) => (inside(x, z) ? (y >= 30 && y < 34) : (y >= 32 && y < 34)),
  };
};
// Pared de 3 columnas de ancho: el rodeo tiene que irse más lejos que un tronco.
const wideWallWorld = () => {
  const wall = (x, z) => Math.floor(z) === 20 && Math.floor(x) >= 9 && Math.floor(x) <= 11;
  return {
    W: 64, H: 40, surface: 10,
    topSolidY: (x, z) => (wall(x, z) ? 34 : 30),
    freeForMob: (x, y, z) => !(wall(x, z) && y >= 30 && y < 34),
  };
};
// Bosque denso: 2 de cada 3 columnas tienen un árbol de 4 bloques (30..33).
// Reproduce el síntoma del neutral que se quedaba casi quieto en el bosque.
const forestWorld = (every = 4) => {
  const tree = (x, z) => {
    const h = Math.imul(Math.floor(x), 73856093) ^ Math.imul(Math.floor(z), 19349663);
    return ((h >>> 0) % every) === 0;
  };
  return {
    W: 64, H: 40, surface: 10,
    topSolidY: (x, z) => (tree(x, z) ? 34 : 30),
    freeForMob: (x, y, z) => !(tree(x, z) && y >= 30 && y < 34),
  };
};
// Primera celda caminable (suelo en 30 y cuerpo libre) cerca del centro.
const freeSpot = (world, x0 = 32, z0 = 32) => {
  for (let r = 0; r < 24; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const x = x0 + dx, z = z0 + dz;
        if (world.topSolidY(x, z) === 30 && world.freeForMob(x, 30, z)) return [x + 0.5, 30, z + 0.5];
      }
    }
  }
  return [x0 + 0.5, 30, z0 + 0.5];
};
// Celda rodeada por un anillo de bloques de 4 de alto: los destinos lejanos son
// celdas libres, pero ningún caminante puede salir (rincón cerrado sin avance).
const cageWorld = () => {
  const ring = (x, z) => Math.max(Math.abs(Math.floor(x) - 10), Math.abs(Math.floor(z) - 10)) === 1;
  return {
    W: 64, H: 40, surface: 10,
    topSolidY: (x, z) => (ring(x, z) ? 34 : 30),
    freeForMob: (x, y, z) => (ring(x, z) ? !(y >= 30 && y < 34) : true),
  };
};
// PRNG reproducible: los casos de navegación no dependen de Math.random.
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const insideSolid = (world, pos) =>
  !world.freeForMob(Math.floor(pos[0]), Math.floor(pos[1]), Math.floor(pos[2]));

{
  // ---- 3.6 caminante frena en la pared, volador la atraviesa ----
  const walker = makeRuntime({
    bots: [{ name: 'andarin', behavior: 'cazador', skin: 'human', hp: 10, damage: 6, reach: 4.6, speed: 4, flying: false, takesDamage: false, active: true }],
    world: wallWorld(),
  });
  const flyer = makeRuntime({
    bots: [{ name: 'volador', behavior: 'cazador', skin: 'robot', hp: 10, damage: 6, reach: 4.6, speed: 28.8, flying: true, takesDamage: false, active: true }],
    world: wallWorld(),
  });
  walker._players = [{ id: 1, name: 'Presa', pos: [10.5, 30, 25.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }];
  flyer._players = [{ id: 1, name: 'Presa', pos: [10.5, 30, 25.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }];
  const wb = walker.spawn(walker._store.bots[0]);
  wb.pos = [10.5, 30, 18.5];
  const fb = flyer.spawn(flyer._store.bots[0]);
  fb.pos = [10.5, 30, 18.5];
  const walkerId = wb.dbId;
  for (let i = 0; i < 200; i++) walker.tick(0.05);
  const wNow = walker.getByDbId(walkerId);
  ok(wNow.pos[2] < 20, `el bot caminante no atraviesa la pared (z=${wNow.pos[2].toFixed(2)})`);
  ok(Math.abs(wNow.pos[0] - 10.5) > 0.5 || wNow.pos[2] > 19,
    'con una pared que cruza todo el mundo el caminante se desplaza por el costado (no se congela)');
  for (let i = 0; i < 200; i++) flyer.tick(0.05);
  const fNow = flyer.getByDbId(fb.dbId);
  ok(fNow.pos[2] > 20, `el bot volador atraviesa la pared (z=${fNow.pos[2].toFixed(2)})`);
  walker.close(); flyer.close();
}
{
  // ---- 3.6bis caminante rodea un tronco y llega al objetivo sin atravesarlo ----
  const world = trunkWorld();
  const rt = makeRuntime({
    bots: [{ name: 'rodeador', behavior: 'cazador', skin: 'human', hp: 10, damage: 6, reach: 4.6, speed: 4, flying: false, takesDamage: false, active: true }],
    world,
    players: [{ id: 1, name: 'Presa', pos: [10.5, 30, 24.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }],
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 18.5];
  rt._players = [{ id: 1, name: 'Presa', pos: [10.5, 30, 24.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }];
  let atravieso = false;
  let minX = Infinity, maxX = -Infinity;
  let ticksToReach = -1;
  for (let i = 0; i < 400; i++) {
    rt.tick(0.05);
    const now = rt.getByDbId(b.dbId);
    if (insideSolid(world, now.pos)) atravieso = true;
    minX = Math.min(minX, now.pos[0]);
    maxX = Math.max(maxX, now.pos[0]);
    if (ticksToReach < 0 && hypot(now.pos[0] - 10.5, now.pos[2] - 24.5) <= 4) ticksToReach = i + 1;
  }
  const now = rt.getByDbId(b.dbId);
  ok(!atravieso, 'el caminante nunca ocupa la celda del tronco');
  ok(maxX - minX > 0.6, `el caminante se aparta del tronco (x de ${minX.toFixed(2)} a ${maxX.toFixed(2)})`);
  ok(hypot(now.pos[0] - 10.5, now.pos[2] - 24.5) <= 4,
    `el caminante rodea el tronco y llega al alcance (d=${hypot(now.pos[0] - 10.5, now.pos[2] - 24.5).toFixed(2)})`);
  ok(ticksToReach > 0 && ticksToReach < 150,
    `el rodeo converge sin oscilar (llegó en ${ticksToReach} ticks)`);
  rt.close();
}
{
  // ---- 3.6ter objetivo inalcanzable: se rinde en vez de empujar para siempre ----
  const rt = makeRuntime({
    bots: [{ name: 'encerrado', behavior: 'cazador', skin: 'human', hp: 10, damage: 6, reach: 4.6, speed: 4, flying: false, takesDamage: false, active: true }],
    world: pitWorld(),
    players: [{ id: 7, name: 'Presa', pos: [10.5, 30, 16.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }],
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  rt._players = [{ id: 7, name: 'Presa', pos: [10.5, 30, 16.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }];
  rt.tick(0.05);
  ok(b.attackTargetId === 7, 'antes de rendirse el cazador persigue al objetivo inalcanzable');
  for (let i = 0; i < 80; i++) rt.tick(0.05);
  ok(b.giveUp && b.giveUp.kind === 'player' && b.giveUp.id === 7,
    'tras ~3.5 s sin poder acercarse abandona el objetivo');
  ok(b.attackTargetId === null, 'mientras dura el abandono no lo vuelve a perseguir (sin bucle infinito)');
  advance(5000);
  for (let i = 0; i < 5; i++) rt.tick(0.05);
  ok(b.attackTargetId === 7, 'pasada la pausa vuelve a intentarlo (el objetivo sigue siendo válido)');
  rt.close();
}
{
  // ---- guardián con una criatura inalcanzable: se rinde y vuelve a patrullar ----
  const rt = makeRuntime({
    bots: [{ name: 'guarda-pozo', behavior: 'guardian', skin: 'robot', hp: 20, damage: 6, reach: 4.6, speed: 4, flying: false, takesDamage: true, active: true }],
    world: pitWorld(),
    zombies: [{ i: 21, pos: [10.5, 30, 16.5], dead: 0, hp: 6 }],
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  b.home = [10.5, 30, 10.5];
  rt._players = [];
  rt.tick(0.05);
  ok(b.attackZombieId === 21, 'el guardián persigue a la criatura dentro de su zona');
  let ticks = 1;
  while (!b.giveUp && ticks < 200) { advance(50); rt.tick(0.05); ticks++; }
  ok(b.giveUp && b.giveUp.kind === 'zombie' && b.giveUp.id === 21,
    'el guardián se rinde con una criatura inalcanzable');
  ok(ticks <= 80, `se rinde a los ~3,5 s: el rodeo lateral no reinicia el contador (${(ticks * 0.05).toFixed(2)} s)`);
  advance(50);
  rt.tick(0.05);
  ok(b.attackZombieId === null, 'mientras dura el abandono no vuelve a perseguirla');
  rt.close();
}
{
  // ---- 3.6quater altura: el guardián no golpea a una criatura por encima del techo ----
  const zombies = [{ i: 21, pos: [11.5, 34, 10.5], dead: 0, hp: 6 }];
  const rt = makeRuntime({
    bots: [{ name: 'guarda-altura', behavior: 'guardian', skin: 'robot', hp: 20, damage: 6, reach: 4.6, speed: 4, flying: false, takesDamage: true, active: true }],
    world: flatWorld(), zombies,
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  b.home = [10.5, 30, 10.5];
  rt._players = [];
  advance(700);
  rt.tick(0.05);
  ok(rt._zombieHits.length === 0, 'no daña una criatura al alcance horizontal pero fuera de la ventana de altura');
  ok(b.attackZombieId === 21, 'sigue intentando acercarse a la criatura en vez de congelarse');
  rt.close();
}
{
  // ---- 3.6quinquies guardián sin enemigos deambula dentro de su zona ----
  const rt = makeRuntime({
    bots: [{ name: 'patrulla', behavior: 'guardian', skin: 'robot', hp: 20, damage: 6, reach: 4.6, speed: 6, flying: false, takesDamage: true, active: true }],
    world: flatWorld(),
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [32.5, 30, 32.5];
  b.home = [32.5, 30, 32.5];
  rt._players = [];
  let maxD = 0, moves = 0;
  let prev = b.pos.slice();
  for (let i = 0; i < 400; i++) {
    advance(50);
    rt.tick(0.05);
    const d = hypot(b.pos[0] - b.home[0], b.pos[2] - b.home[2]);
    maxD = Math.max(maxD, d);
    if (hypot(b.pos[0] - prev[0], b.pos[2] - prev[2]) > 1e-6) moves++;
    prev = b.pos.slice();
  }
  ok(moves > 20, 'el guardián sin enemigos camina en vez de quedarse quieto');
  ok(maxD > 1.5 && maxD <= 16.0001,
    `el guardián deambula sin salir de su radio de guardia (máx ${maxD.toFixed(2)})`);
  rt.close();
}
{
  // ---- 3.6sexies neutral: tras el combate vuelve a caminar ----
  const rt = makeRuntime({
    bots: [{ name: 'vuelve', behavior: 'neutral', skin: 'human', hp: 10, damage: 6, reach: 4.6, speed: 6, flying: false, takesDamage: false, active: true }],
    world: flatWorld(),
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [32.5, 30, 32.5];
  b.home = [32.5, 30, 32.5];
  const me = { id: 5, name: 'Presa', pos: [34, 30, 32.5], dead: 0, mode: 'player', admin: false, skin: 'human', permissions: {} };
  rt._players = [me];
  advance(700);
  await rt.applyPlayerHit(b, me, clock.t);
  ok(b.aggro && b.aggro.kind === 'player', 'el neutral entra en retaliación al ser golpeado');
  ok(b.wander && b.wander.tx === null, 'al entrar en combate reinicia el destino de deambulación');
  for (let i = 0; i < 10; i++) { advance(50); rt.tick(0.05); }
  me.dead = 1;
  advance(50);
  rt.tick(0.05);
  ok(b.aggro == null, 'cuando el atacante muere limpia el aggro');
  const before = b.pos.slice();
  for (let i = 0; i < 400; i++) { advance(50); rt.tick(0.05); }
  ok(hypot(b.pos[0] - before[0], b.pos[2] - before[2]) > 1,
    `tras el combate vuelve a deambular (se movió ${hypot(b.pos[0] - before[0], b.pos[2] - before[2]).toFixed(2)} bloques)`);
  rt.close();
}
{
  // ---- 3.6septies neutral caminante en un bosque denso: deambula y no se traba ----
  const world = forestWorld();
  const rt = makeRuntime({
    bots: [{ name: 'NeutralTest', behavior: 'neutral', skin: 'human', hp: 10, damage: 0, reach: 1, speed: 6, flying: false, takesDamage: false, active: true }],
    world, rng: seeded(42),
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = freeSpot(world);
  b.home = b.pos.slice();
  rt._players = [];
  const start = b.pos.slice();
  let solido = false, cambios = -1, ultimaClave = '', moviendo = 0;
  let prev = b.pos.slice();
  for (let i = 0; i < 400; i++) {
    advance(50);
    rt.tick(0.05);
    if (insideSolid(world, b.pos)) solido = true;
    if (hypot(b.pos[0] - prev[0], b.pos[2] - prev[2]) > 1e-6) moviendo++;
    prev = b.pos.slice();
    if (b.wander.tx === null) ultimaClave = '';
    else {
      const clave = b.wander.tx.toFixed(2) + ',' + b.wander.tz.toFixed(2);
      if (clave !== ultimaClave) { cambios++; ultimaClave = clave; }
    }
  }
  const movido = hypot(b.pos[0] - start[0], b.pos[2] - start[2]);
  ok(movido > 5, `en un bosque denso el neutral igual recorre el mundo (${movido.toFixed(2)} bloques en 20 s)`);
  ok(!solido, 'el neutral caminante nunca ocupa una celda sólida');
  ok(cambios >= 1, 'elige destinos nuevos en vez de empujar siempre contra el mismo árbol');
  ok(moviendo > 40, `pasa la mayor parte del tiempo caminando, no empujando (${moviendo}/${400} ticks con avance)`);
  rt.close();
}
{
  // ---- triangulación: dos neutrales deambulan el bosque sin trabarse ni pisarse ----
  const world = forestWorld();
  const rt = makeRuntime({
    bots: [
      { name: 'bosque-a', behavior: 'neutral', skin: 'human', hp: 10, damage: 0, reach: 1, speed: 6, flying: false, takesDamage: false, active: true },
      { name: 'bosque-b', behavior: 'neutral', skin: 'robot', hp: 10, damage: 0, reach: 1, speed: 6, flying: false, takesDamage: false, active: true },
    ],
    world, rng: seeded(31337),
  });
  const a = rt.spawn(rt._store.bots[0]);
  const bb = rt.spawn(rt._store.bots[1]);
  a.pos = freeSpot(world, 32, 32);
  bb.pos = freeSpot(world, 40, 40);
  a.home = a.pos.slice();
  bb.home = bb.pos.slice();
  rt._players = [];
  const startA = a.pos.slice(), startB = bb.pos.slice();
  let solido = false;
  for (let i = 0; i < 400; i++) {
    advance(50);
    rt.tick(0.05);
    if (insideSolid(world, a.pos) || insideSolid(world, bb.pos)) solido = true;
  }
  ok(!solido, 'dos bots deambulando no ocupan celdas sólidas');
  ok(hypot(a.pos[0] - startA[0], a.pos[2] - startA[2]) > 2 ||
    hypot(bb.pos[0] - startB[0], bb.pos[2] - startB[2]) > 2,
  `al menos uno de los dos recorre el bosque (A ${hypot(a.pos[0] - startA[0], a.pos[2] - startA[2]).toFixed(2)}, B ${hypot(bb.pos[0] - startB[0], bb.pos[2] - startB[2]).toFixed(2)})`);
  rt.close();
}
{
  // ---- 3.6octies destino de deambular inalcanzable: reset a los ~2 s ----
  const rt = makeRuntime({
    bots: [{ name: 'trabado', behavior: 'merodeador', skin: 'human', hp: 10, damage: 0, reach: 1, speed: 4, flying: false, takesDamage: false, active: true }],
    world: wallWorld(), rng: seeded(99),
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 18.5];
  b.home = [10.5, 30, 18.5];
  rt._players = [];
  // Destino del otro lado de una pared que cruza el mundo: la celda es libre,
  // pero ningún caminante puede llegar.
  b.wander = { tx: 10.5, tz: 25.5, waitUntil: 0, deadline: clock.t + 15000 };
  for (let i = 0; i < 30; i++) { advance(50); rt.tick(0.05); }
  ok(b.wander.tx === 10.5 && b.wander.tz === 25.5, 'antes de los 2 s mantiene el destino que eligió');
  ok(b.pos[2] < 20, 'mientras empuja no atraviesa la pared');
  for (let i = 0; i < 20; i++) { advance(50); rt.tick(0.05); }
  ok(b.wanderResets >= 1, 'tras ~2 s sin avanzar cuenta un reset de deambular');
  ok(!(b.wander.tx === 10.5 && b.wander.tz === 25.5), 'suelta el destino inalcanzable en vez de empujar para siempre');
  ok(b.detour === null, 'el reset también limpia el estado de rodeo');
  rt.close();
}
{
  // ---- 3.6nonies rincón cerrado: dos resets seguidos → destino cercano (2–6) ----
  const rt = makeRuntime({
    bots: [{ name: 'escape', behavior: 'merodeador', skin: 'human', hp: 10, damage: 0, reach: 1, speed: 4, flying: false, takesDamage: false, active: true }],
    world: cageWorld(), rng: seeded(99),
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  b.home = [10.5, 30, 10.5];
  rt._players = [];
  b.wander = { tx: 10.5, tz: 25.5, waitUntil: 0, deadline: clock.t + 60000 };
  for (let i = 0; i < 400 && b.wanderResets < 2; i++) { advance(50); rt.tick(0.05); }
  ok(b.wanderResets >= 2, `un rincón cerrado acumula resets de deambular (${b.wanderResets})`);
  let guard = 0;
  while (b.wander.tx === null && guard++ < 10) { advance(50); rt.tick(0.05); }
  const cerca = hypot(b.wander.tx - b.pos[0], b.wander.tz - b.pos[2]);
  ok(b.wander.tx !== null && cerca >= 1.5 && cerca <= 6.5,
    `tras dos resets elige un destino cercano para salir del rincón (${cerca.toFixed(2)})`);
  rt.close();

  // Volver a moverse restaura el radio normal (6–24) y el contador en cero.
  const flatRt = makeRuntime({
    bots: [{ name: 'vuelve-radio', behavior: 'merodeador', skin: 'human', hp: 10, damage: 0, reach: 1, speed: 4, flying: false, takesDamage: false, active: true }],
    world: flatWorld(), rng: seeded(5),
  });
  const fb = flatRt.spawn(flatRt._store.bots[0]);
  fb.pos = [32.5, 30, 32.5];
  fb.home = [32.5, 30, 32.5];
  flatRt._players = [];
  fb.wanderResets = 2;
  fb.wander = { tx: 36.5, tz: 32.5, waitUntil: 0, deadline: clock.t + 15000 };
  for (let i = 0; i < 5; i++) { advance(50); flatRt.tick(0.05); }
  ok(fb.wanderResets === 0, 'al volver a avanzar el contador de resets queda en cero');
  for (let i = 0; i < 40; i++) { advance(50); flatRt.tick(0.05); }
  const radio = fb.wander.tx === null
    ? 0
    : hypot(fb.wander.tx - fb.home[0], fb.wander.tz - fb.home[2]);
  ok(fb.wander.tx === null || (radio >= 6 && radio <= 24.0001),
    `con el contador en cero vuelve al radio normal de deambulación (${radio.toFixed(2)})`);
  flatRt.close();
}
{
  // ---- 3.6decies guardián patrullando un bosque denso ----
  const world = forestWorld();
  const rt = makeRuntime({
    bots: [{ name: 'guarda-bosque', behavior: 'guardian', skin: 'robot', hp: 20, damage: 6, reach: 4.6, speed: 6, flying: false, takesDamage: true, active: true }],
    world, rng: seeded(4242),
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = freeSpot(world);
  b.home = b.pos.slice();
  rt._players = [];
  let moves = 0, solido = false, maxD = 0;
  let prev = b.pos.slice();
  for (let i = 0; i < 400; i++) {
    advance(50);
    rt.tick(0.05);
    if (insideSolid(world, b.pos)) solido = true;
    if (hypot(b.pos[0] - prev[0], b.pos[2] - prev[2]) > 1e-6) moves++;
    prev = b.pos.slice();
    maxD = Math.max(maxD, hypot(b.pos[0] - b.home[0], b.pos[2] - b.home[2]));
  }
  ok(moves > 20, `el guardián sin enemigos patrulla el bosque (${moves} ticks con movimiento)`);
  ok(!solido, 'el guardián nunca ocupa una celda sólida');
  ok(maxD <= 17, `el guardián no se escapa de su zona patrullando (máx ${maxD.toFixed(2)})`);
  rt.close();
}

{
  // ---- triangulación: dos caminantes rodean el mismo tronco sin estorbarse ----
  const world = trunkWorld();
  const rt = makeRuntime({
    bots: [
      { name: 'gemelo-a', behavior: 'cazador', skin: 'human', hp: 10, damage: 6, reach: 4.6, speed: 4, flying: false, takesDamage: false, active: true },
      { name: 'gemelo-b', behavior: 'cazador', skin: 'robot', hp: 10, damage: 6, reach: 4.6, speed: 4, flying: false, takesDamage: false, active: true },
    ],
    world,
  });
  const a = rt.spawn(rt._store.bots[0]);
  const bb = rt.spawn(rt._store.bots[1]);
  a.pos = [10.5, 30, 18.5];
  bb.pos = [10.5, 30, 18.5];
  rt._players = [{ id: 1, name: 'Presa', pos: [10.5, 30, 24.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }];
  let choque = false;
  for (let i = 0; i < 400; i++) {
    rt.tick(0.05);
    if (insideSolid(world, a.pos) || insideSolid(world, bb.pos)) choque = true;
  }
  ok(!choque, 'dos caminantes juntos tampoco atraviesan el tronco');
  ok(hypot(a.pos[0] - 10.5, a.pos[2] - 24.5) <= 4 && hypot(bb.pos[0] - 10.5, bb.pos[2] - 24.5) <= 4,
    'dos caminantes cerca del mismo obstáculo llegan los dos al objetivo');
  rt.close();
}
{
  // ---- triangulación: bloqueo ancho por los dos costados del tronco ----
  const world = wideWallWorld();
  const rt = makeRuntime({
    bots: [{ name: 'rodeo-ancho', behavior: 'cazador', skin: 'human', hp: 10, damage: 6, reach: 4.6, speed: 4, flying: false, takesDamage: false, active: true }],
    world,
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 18.5];
  rt._players = [{ id: 1, name: 'Presa', pos: [10.5, 30, 24.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }];
  let dentro = false;
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < 400; i++) {
    rt.tick(0.05);
    if (insideSolid(world, b.pos)) dentro = true;
    minX = Math.min(minX, b.pos[0]);
    maxX = Math.max(maxX, b.pos[0]);
  }
  ok(!dentro, 'con una pared de tres bloques el caminante tampoco atraviesa bloques');
  ok(maxX - minX > 1.5, `el rodeo se abre paso por el costado de una pared ancha (x de ${minX.toFixed(2)} a ${maxX.toFixed(2)})`);
  ok(hypot(b.pos[0] - 10.5, b.pos[2] - 24.5) <= 4,
    `con una pared ancha el caminante rodea y llega (d=${hypot(b.pos[0] - 10.5, b.pos[2] - 24.5).toFixed(2)})`);
  rt.close();
}
{
  // ---- triangulación: el volador no usa el rodeo (sigue sin colisión) ----
  const world = trunkWorld();
  const rt = makeRuntime({
    bots: [{ name: 'volador-tronco', behavior: 'cazador', skin: 'robot', hp: 10, damage: 6, reach: 4.6, speed: 10, flying: true, takesDamage: false, active: true }],
    world,
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 18.5];
  rt._players = [{ id: 1, name: 'Presa', pos: [10.5, 30, 24.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }];
  for (let i = 0; i < 60; i++) rt.tick(0.05);
  ok(b.pos[2] > 20.5, `el volador atraviesa el tronco en línea recta (z=${b.pos[2].toFixed(2)})`);
  ok(b.detour === null && b.giveUp == null, 'el volador no acumula estado de rodeo ni se rinde');
  rt.close();
}
{
  // ---- gravedad del caminante ----
  const rt = makeRuntime({
    bots: [{ name: 'cae', behavior: 'merodeador', skin: 'human', hp: 10, damage: 0, reach: 1, speed: 8, flying: false, takesDamage: false, active: true }],
    world: flatWorld(),
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 36, 10.5];
  rt._players = [];
  for (let i = 0; i < 120; i++) rt.tick(0.05);
  const after = rt.getByDbId(b.dbId);
  ok(after.pos[1] < 36 && after.pos[1] >= 30, `el bot caminante cae al suelo (y=${after.pos[1]})`);
  rt.close();
}
{
  // ---- cupo de 5 en el boot ----
  const warnLog = [];
  const rows = [];
  for (let i = 0; i < 6; i++) {
    rows.push({ name: 'bot' + i, behavior: 'merodeador', skin: 'human', hp: 10, damage: 0, reach: 1, speed: 6, flying: false, takesDamage: false, active: true });
  }
  const rt = makeRuntime({ bots: rows, world: flatWorld(), warnLog });
  await rt.boot();
  ok(rt.list().length === 5, 'con seis activos el boot spawnea como máximo cinco');
  ok(warnLog.some(l => /exceso|más de 5|más de cinco/i.test(l)), 'el boot deja constancia del exceso de activos');
  rt.close();
}

{
  // ---- BOTS_ENABLED=0 apaga el runtime ----
  const off = BotRuntime.create({
    store: new MemoryStore({ bots: [{ name: 'apagado', behavior: 'cazador', active: true }] }),
    world: flatWorld(), env: { BOTS_ENABLED: '0' }, now, log: () => {}, warn: () => {},
    getPlayers: () => [], broadcast: () => {}, sendToPlayer: () => {},
  });
  await off.boot();
  ok(off.list().length === 0, 'BOTS_ENABLED=0 no spawnea ningún bot al arrancar');
  off.close();
}

{
  // ---- doble barrera: un comportamiento que intente atacar a un protegido ----
  Behaviors.registerBehavior({
    id: 'test-agresivo', label: 'Agresivo de prueba', hostile: true,
    decide: () => ({ attackTargetId: 99, face: [10.5, 30, 10.5], stop: true }),
  });
  const rt = makeRuntime({
    bots: [{ name: 'malo', behavior: 'test-agresivo', skin: 'robot', hp: 10, damage: 6, reach: 10, speed: 1, flying: true, takesDamage: false, active: true }],
    world: flatWorld(),
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  const victim = { id: 99, name: 'Protegido', pos: [11, 30, 10.5], dead: 0, mode: 'player', admin: false, bot: false, botIgnore: true };
  rt._players = [victim];
  rt.tick(0.05);
  ok(rt._sent.filter(f => f.t === 'phit').length === 0, 'el runtime descarta el daño aunque el comportamiento apunte a un protegido');
  victim.botIgnore = false;
  b.lastHitAt.clear();
  rt.tick(0.05);
  ok(rt._sent.some(f => f.t === 'phit' && f.id === 99), 'sin bot_ignore el mismo ataque sí se emite');
  rt.close();
}

// ===========================================================================
// C. criaturas: guardián, neutral, retaliación y muertes por zombi
// ===========================================================================
const ZOMBIE = (i, x, z, extra = {}) => ({ i, pos: [x, 30, z], dead: 0, hp: 6, ...extra });

{
  // ---- guardián: daña criaturas con su damage y respeta alcance/cadencia ----
  const zombies = [ZOMBIE(7, 12, 10.5)];
  const rt = makeRuntime({
    bots: [{ name: 'guarda', behavior: 'guardian', skin: 'robot', hp: 20, damage: 6, reach: 4.6, speed: 6, flying: false, takesDamage: true, active: true }],
    world: flatWorld(), zombies,
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  b.home = [10.5, 30, 10.5];
  rt._players = [];
  advance(700);
  rt.tick(0.05);
  ok(rt._zombieHits.length === 1 && rt._zombieHits[0].id === 7 && rt._zombieHits[0].dmg === 6,
    'el guardián daña a la criatura con su damage configurado');
  ok(zombies[0].hp === 0 && zombies[0].dead === 1, 'la criatura muere cuando el daño agota su vida');
  ok(rt._sent.filter(f => f.t === 'phit').length === 0, 'el guardián nunca emite phit a jugadores');
  rt.close();
}
{
  // ---- guardián: sin criaturas en alcance no daña; damage:0 tampoco ----
  const zombies = [ZOMBIE(7, 30, 30)];
  const rt = makeRuntime({
    bots: [{ name: 'guarda2', behavior: 'guardian', skin: 'robot', hp: 20, damage: 6, reach: 4.6, speed: 6, flying: false, takesDamage: true, active: true }],
    world: flatWorld(), zombies,
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  b.home = [10.5, 30, 10.5];
  for (let i = 0; i < 5; i++) { advance(700); rt.tick(0.05); }
  ok(rt._zombieHits.length === 0, 'el guardián no daña criaturas fuera de su zona (radio 16)');
  rt.close();

  const zero = makeRuntime({
    bots: [{ name: 'guarda0', behavior: 'guardian', skin: 'robot', hp: 20, damage: 0, reach: 4.6, speed: 6, flying: false, takesDamage: true, active: true }],
    world: flatWorld(), zombies: [ZOMBIE(8, 12, 10.5)],
  });
  const bz = zero.spawn(zero._store.bots[0]);
  bz.pos = [10.5, 30, 10.5];
  bz.home = [10.5, 30, 10.5];
  advance(700);
  zero.tick(0.05);
  ok(zero._zombieHits.length === 0, 'un bot con damage:0 no daña criaturas');
  zero.close();
}
{
  // ---- neutral: responde al jugador que lo golpea ----
  const rt = makeRuntime({
    bots: [{ name: 'neutro', behavior: 'neutral', skin: 'human', hp: 10, damage: 6, reach: 4.6, speed: 6, flying: false, takesDamage: false, active: true }],
    world: flatWorld(),
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  const me = { id: 5, name: 'Presa', pos: [11, 30, 10.5], dead: 0, mode: 'player', admin: false, skin: 'human', permissions: {} };
  rt._players = [me];
  advance(700);
  const res = await rt.applyPlayerHit(b, me, clock.t);
  ok(res.dmg === 0 && res.hp === 10, 'un neutral inmune no pierde vida al ser golpeado');
  ok(b.aggro && b.aggro.kind === 'player' && b.aggro.id === 5,
    'un neutral inmune igual recuerda al jugador que lo golpeó');
  rt.tick(0.05);
  const hit = rt._sent.find(f => f.t === 'phit' && f.id === 5);
  ok(!!hit && hit.dmg === 6, 'el neutral persigue y golpea al atacante tras la retaliación');
  rt.close();
}
{
  // ---- neutral: admin y bot_ignore no generan aggro ----
  const rt = makeRuntime({
    bots: [{ name: 'neutro2', behavior: 'neutral', skin: 'human', hp: 10, damage: 6, reach: 4.6, speed: 6, flying: false, takesDamage: true, active: true }],
    world: flatWorld(),
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  const admin = { id: 1, name: 'Admin', pos: [11, 30, 10.5], dead: 0, mode: 'admin', admin: true, skin: 'human', permissions: {} };
  await rt.applyPlayerHit(b, admin, clock.t);
  ok(!b.aggro, 'si lo golpea un admin no responde');
  ok(b.hp === 8, 'el neutral recibe el daño de un golpe válido');
  advance(600);
  const prot = { id: 2, name: 'Prot', pos: [11, 30, 10.5], dead: 0, mode: 'player', admin: false, skin: 'human', permissions: { bot_ignore: true } };
  await rt.applyPlayerHit(b, prot, clock.t);
  ok(!b.aggro, 'si lo golpea una cuenta con bot_ignore no responde');
  rt.close();
}
{
  // ---- neutral: golpeado por una criatura y muere por ella ----
  const zombies = [ZOMBIE(11, 12, 10.5)];
  const rt = makeRuntime({
    bots: [{ name: 'carne', behavior: 'neutral', skin: 'human', hp: 2, damage: 4, reach: 4.6, speed: 6, flying: false, takesDamage: true, active: true }],
    world: flatWorld(), zombies,
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  rt._players = [];
  const r = await rt.applyEnemyHit(b, 2, 11, clock.t);
  ok(r.dead === 1 && r.hp === 0, 'una criatura puede matar a un bot con takes_damage:true');
  ok(!rt.getByDbId(b.dbId), 'el bot muerto por una criatura sale del runtime');
  const stored = await rt._store.getBotById(b.dbId);
  ok(stored && stored.active === false, 'el bot muerto por una criatura queda active:false');
  const audit = await rt._store.listAudit(50);
  ok(audit.some(e => e.action === 'bot.death'), 'la muerte por criatura se audita como bot.death');
  rt.close();
}
{
  // ---- neutral golpeado por criatura persigue y contraataca ----
  const zombies = [ZOMBIE(12, 12, 10.5)];
  const rt = makeRuntime({
    bots: [{ name: 'vengador', behavior: 'neutral', skin: 'human', hp: 10, damage: 5, reach: 4.6, speed: 6, flying: false, takesDamage: true, active: true }],
    world: flatWorld(), zombies,
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  rt._players = [];
  await rt.applyEnemyHit(b, 2, 12, clock.t);
  ok(b.hp === 8 && b.aggro && b.aggro.kind === 'zombie' && b.aggro.id === 12,
    'un neutral golpeado por una criatura la marca como atacante');
  advance(700);
  rt.tick(0.05);
  ok(rt._zombieHits.some(h => h.id === 12 && h.dmg === 5), 'el neutral contraataca a la criatura atacante');
  rt.close();
}
{
  // ---- guardián: nunca declara ataque a un jugador aunque esté pegado ----
  const rt = makeRuntime({
    bots: [{ name: 'custodio', behavior: 'guardian', skin: 'robot', hp: 20, damage: 6, reach: 4.6, speed: 6, flying: false, takesDamage: true, active: true }],
    world: flatWorld(),
  });
  const b = rt.spawn(rt._store.bots[0]);
  b.pos = [10.5, 30, 10.5];
  rt._players = [{ id: 5, name: 'Presa', pos: [11, 30, 10.5], dead: 0, mode: 'player', admin: false, bot: false, permissions: {} }];
  for (let i = 0; i < 3; i++) { advance(700); rt.tick(0.05); }
  ok(rt._sent.filter(f => f.t === 'phit').length === 0, 'el guardián no ataca jugadores aunque estén al lado');
  rt.close();
}

{
  // ---- triangulación: guardián volador, inmunidad de criaturas y cambio de atacante ----
  const zombies = [ZOMBIE(13, 14, 10.5)];
  const fly = makeRuntime({
    bots: [{ name: 'guarda-vol', behavior: 'guardian', skin: 'robot', hp: 20, damage: 3, reach: 4.6, speed: 10, flying: true, takesDamage: false, active: true }],
    world: flatWorld(), zombies,
  });
  const fb = fly.spawn(fly._store.bots[0]);
  fb.pos = [10.5, 30, 10.5];
  fb.home = [10.5, 30, 10.5];
  advance(700);
  fly.tick(0.05);
  ok(fly._zombieHits.length === 1 && fly._zombieHits[0].dmg === 3,
    'un guardián volador también pelea contra criaturas');
  const hpBefore = fb.hp;
  await fly.applyEnemyHit(fb, 2, 13, clock.t);
  ok(fb.hp === hpBefore && !fb.aggro,
    'un guardián inmune no pierde vida ni entra en retaliación');
  fly.close();

  const mixed = makeRuntime({
    bots: [{ name: 'cambia', behavior: 'neutral', skin: 'human', hp: 10, damage: 4, reach: 4.6, speed: 6, flying: false, takesDamage: true, active: true }],
    world: flatWorld(), zombies: [ZOMBIE(14, 12, 10.5)],
  });
  const mb = mixed.spawn(mixed._store.bots[0]);
  mb.pos = [10.5, 30, 10.5];
  await mixed.applyEnemyHit(mb, 2, 14, clock.t);
  ok(mb.aggro && mb.aggro.kind === 'zombie', 'el neutral marca a la criatura que lo golpeó');
  advance(600);
  const p = { id: 21, name: 'Presa', pos: [11, 30, 10.5], dead: 0, mode: 'player', admin: false, skin: 'human', permissions: {} };
  await mixed.applyPlayerHit(mb, p, clock.t);
  ok(mb.aggro && mb.aggro.kind === 'player' && mb.aggro.id === 21,
    'si lo golpea otro atacante, el neutral cambia al más reciente');
  mixed.close();
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 runtime de bots (roster, combate, muerte y movimiento) OK');
