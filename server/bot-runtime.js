'use strict';
// Runtime in-process de bots (change panel-bots-custom, capability bots/runtime).
// Los bots viven en el mismo proceso que el juego: no abren sockets, no tienen
// sesión ni credenciales y su vida es server-authoritative. El comportamiento
// solo declara intención; ESTE módulo valida alcance, cadencia, admins y
// bot_ignore antes de emitir cualquier daño.
const Behaviors = require('./bot-behaviors.js');
const Skins = require('./skins.js');
const Zombie = require('./zombie.js');

const HIT_GAP_MS = 650;          // ventana del cliente (godT 0.6 s)
const PLAYER_HIT_CD_MS = 500;    // cadencia mínima de golpes del jugador a un bot
const HIT_DMG = Zombie.SWORD_DMG; // daño fijo del servidor por golpe de espada (2)
const VOID_Y = -10;              // por debajo: vuelve a su origen sin morir
const BOT_HELD = 100;            // espada en mano (gesto visible para la víctima)
const DEFAULT_TICK_MS = 50;
const DEFAULT_SNAP_MS = 100;
const MAX_ACTIVE = 5;
const STUCK_MIN_MS = 3500;       // caminante persiguiendo sin acercarse: se rinde
const WANDER_STUCK_MS = 2000;    // caminante deambulando sin acercarse: elige otro destino
const WANDER_PROGRESS = 0.5;     // acercamiento real que reinicia la ventana (el vibrado no cuenta)
const DETOUR_MS_MIN = 400;       // recuerda el lado del rodeo para no oscilar
const DETOUR_MS_RANGE = 300;

const hypot = (dx, dz) => Math.sqrt(dx * dx + dz * dz);
const envNum = (v, d) => (v === undefined || v === '' || !Number.isFinite(+v)) ? d : +v;

// Hora de Argentina para los logs de golpe (misma trampa que en app.js:
// `hourCycle:'h23'` y NO `hour12:false`, que en Node 20 da la medianoche 24:00).
/* hora-ar:start */
const FMT_AR = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const horaAr = (t = Date.now()) => `[${FMT_AR.format(new Date(t))}] `;
/* hora-ar:end */

/** Entrada de roster de un bot: avatar fake con id negativo reservado. */
function botEntry(bot) {
  return {
    id: bot.id,
    name: bot.name,
    mode: 'player',
    bot: true,
    skin: bot.skin,
    hp: bot.hp,
    maxHp: bot.hpMax,
    dead: bot.dead ? 1 : 0,
    pos: [bot.pos[0], bot.pos[1], bot.pos[2]],
    yaw: bot.yaw,
    pitch: 0,
    held: BOT_HELD,
    seq: bot.seq,
  };
}

function create({
  store, world, env = {}, now = Date.now,
  log = (...a) => console.log(...a), warn = (...a) => console.warn(...a),
  getPlayers = () => [], getZombies = () => [], damageZombie = null,
  broadcast = () => {}, sendToPlayer = () => {}, rng = Math.random,
} = {}) {
  const enabled = String(env.BOTS_ENABLED || '') !== '0';
  const tickMs = Math.max(25, envNum(env.BOTS_TICK_MS, DEFAULT_TICK_MS));
  const snapMs = Math.max(25, envNum(env.BOTS_SNAP_MS, DEFAULT_SNAP_MS));
  const byDbId = new Map();
  const byId = new Map();
  let timer = null;
  let ready = Promise.resolve(false);

  const W = world && Number.isFinite(world.W) ? world.W : 208;
  const H = world && Number.isFinite(world.H) ? world.H : 40;

  function findSpawnPoint() {
    if (!world || typeof world.topSolidY !== 'function') return [W / 2 + 0.5, 20, W / 2 + 0.5];
    const sx = W / 2 | 0, sz = W / 2 | 0;
    const surface = Number.isFinite(world.surface) ? world.surface : 10;
    const free = typeof world.freeForMob === 'function' ? world.freeForMob : () => true;
    for (let r = 0; r < 104; r++) {
      for (let a = 0; a < 12; a++) {
        const x = Math.max(2, Math.min(W - 3, sx + Math.round(Math.cos(a / 12 * 6.28) * r)));
        const z = Math.max(2, Math.min(W - 3, sz + Math.round(Math.sin(a / 12 * 6.28) * r)));
        const gy = world.topSolidY(x, z);
        if (gy <= surface + 1 || gy >= H - 7) continue;
        if (!free(x, gy, z)) continue;
        return [x + 0.5, gy, z + 0.5];
      }
    }
    const gy = world.topSolidY(sx, sz);
    return [sx + 0.5, Math.max(surface + 1, gy), sz + 0.5];
  }

  function makeBot(row) {
    const spawn = findSpawnPoint();
    return {
      id: -row.id,
      dbId: row.id,
      name: row.name,
      behavior: row.behavior,
      skin: row.skin,
      hpMax: row.hp,
      hp: row.hp,
      damage: row.damage,
      reach: row.reach,
      speed: row.speed,
      flying: row.flying === true,
      takesDamage: row.takesDamage === true,
      active: true,
      pos: spawn.slice(),
      home: spawn.slice(),
      yaw: Math.PI,
      seq: 0,
      dead: 0,
      aggro: null,           // neutral: { kind:'player'|'zombie', id, until }
      attackZombieId: null,
      lastHitAt: new Map(),
      lastZombieHitAt: new Map(),
      lastSnapAt: 0,
      wander: { tx: null, tz: null, waitUntil: 0, deadline: 0 },
      detour: null,          // caminante: { sign, until } mientras rodea un obstáculo
      stuckMs: 0,            // caminante: tiempo acumulado sin acercarse al objetivo
      navKey: null,          // objetivo que se está navengando (kind:id)
      navBest: Infinity,     // mejor distancia lograda contra ese objetivo
      giveUp: null,          // objetivo inalcanzable: { kind, id, until }
      wanderStuckMs: 0,      // caminante: tiempo deambulando sin avanzar
      wanderKey: null,       // destino de deambular que se está navegando
      wanderBest: Infinity,  // mejor distancia lograda hacia ese destino
      wanderResets: 0,       // resets seguidos de deambular (activa el radio cercano)
    };
  }

  /** Agrega un bot al mundo y difunde su `join`. Idempotente por dbId. */
  function spawn(row) {
    if (!row || row.id == null) throw new Error('bot-runtime: fila inválida');
    if (!Behaviors.getBehavior(row.behavior)) {
      throw new Error(`bot-runtime: comportamiento desconocido "${row.behavior}"`);
    }
    const existing = byDbId.get(row.id);
    if (existing) return existing;
    const bot = makeBot(row);
    byDbId.set(bot.dbId, bot);
    byId.set(bot.id, bot);
    broadcast({ t: 'join', ...botEntry(bot) });
    return bot;
  }

  /** Saca un bot del mundo y difunde su `leave` (no toca la base). */
  function despawn(dbId, { announce = true, chat = false } = {}) {
    const bot = byDbId.get(dbId);
    if (!bot) return null;
    byDbId.delete(bot.dbId);
    byId.delete(bot.id);
    if (announce) broadcast({ t: 'leave', id: bot.id });
    if (chat) broadcast({ t: 'chat', from: '💀', text: `${bot.name} fue destruido` });
    return bot;
  }

  const list = () => [...byDbId.values()].sort((a, b) => a.dbId - b.dbId);
  const getById = (runtimeId) => byId.get(runtimeId) || null;
  const getByDbId = (dbId) => byDbId.get(dbId) || null;
  const runtimeState = (dbId) => {
    const bot = byDbId.get(dbId);
    return bot ? { online: true, hp: bot.hp, pos: [bot.pos[0], bot.pos[1], bot.pos[2]] } : null;
  };

  function snapshot(bot, t) {
    broadcast({
      t: 'pm', id: bot.id, p: [bot.pos[0], bot.pos[1], bot.pos[2]],
      yaw: bot.yaw, pitch: 0, hp: bot.hp, maxHp: bot.hpMax, dead: bot.dead ? 1 : 0,
      held: BOT_HELD, seq: bot.seq, skin: bot.skin,
    });
    bot.lastSnapAt = t;
  }

  function moveFly(bot, target, dt) {
    const dx = target[0] - bot.pos[0], dz = target[2] - bot.pos[2];
    const d = hypot(dx, dz);
    const step = bot.speed * dt;
    if (d > 1e-6 && step > 0) {
      const s = Math.min(step, d);
      Behaviors.freeMove(bot.pos, dx / d * s, 0, dz / d * s);
    }
    Behaviors.alignAltitude(bot.pos, target[1], dt, bot.speed);
    Behaviors.clampToWorld(bot.pos, W, H);
  }

  // Caminata con rodeo simple (no hay A*): primero el paso directo; si está
  // bloqueado prueba el costado (±90°) y por último atrás, recordando el lado
  // durante ~400–700 ms para no oscilar. Nunca atraviesa bloques ni teletransporta.
  function moveWalk(bot, target, dt, t) {
    const dx = target[0] - bot.pos[0], dz = target[2] - bot.pos[2];
    const d = hypot(dx, dz);
    if (!(d > 1e-6)) {
      Behaviors.applyGravity(world, bot.pos, bot.speed, dt);
      return;
    }
    const ux = dx / d, uz = dz / d;
    const want = Math.min(bot.speed * dt, d);
    // Prueba un paso y evalúa dos cosas: cuánto se desplazó y cuánto ACERCA al
    // objetivo. El deslizamiento de `moveTo` contra un tronco mueve apenas y no
    // acerca nada; en ese caso se deshace y se prueba el rodeo.
    const tryStep = (mx, mz, minMove, minProgress) => {
      const px = bot.pos[0], py = bot.pos[1], pz = bot.pos[2];
      if (Behaviors.moveTo(world, bot.pos, mx, mz, bot.speed, dt)) {
        const moved = hypot(bot.pos[0] - px, bot.pos[2] - pz);
        const before = hypot(target[0] - px, target[2] - pz);
        const after = hypot(target[0] - bot.pos[0], target[2] - bot.pos[2]);
        if (moved >= want * minMove && before - after >= want * minProgress) return true;
      }
      bot.pos[0] = px; bot.pos[1] = py; bot.pos[2] = pz;
      return false;
    };
    if (tryStep(ux, uz, 0.3, 0.5)) {
      bot.detour = null; // volvió a avanzar directo: se limpia el rodeo
      return;
    }
    const nowMs = Number.isFinite(t) ? t : 0;
    const prev = bot.detour && nowMs < bot.detour.until ? bot.detour.sign : 0;
    const sides = prev ? [prev, -prev] : [1, -1];
    for (const sign of sides) {
      // perpendicular a la dirección deseada: (-uz, ux) * sign
      if (tryStep(-uz * sign, ux * sign, 0.3, -1)) {
        bot.detour = { sign, until: nowMs + DETOUR_MS_MIN + rng() * DETOUR_MS_RANGE };
        return;
      }
    }
    if (tryStep(-ux, -uz, 0.3, -Infinity)) {
      bot.detour = { sign: prev || 1, until: nowMs + DETOUR_MS_MIN };
      return;
    }
    bot.detour = null;
    Behaviors.applyGravity(world, bot.pos, bot.speed, dt);
  }

  function yawTo(bot, target) {
    return Math.atan2(-(target[0] - bot.pos[0]), -(target[2] - bot.pos[2]));
  }

  async function persistDeath(bot) {
    try { await store.stopBot(bot.dbId); }
    catch (e) { warn('   ⚠️ bots: no se pudo marcar inactivo al morir: ' + (e && e.message)); }
    try {
      await store.insertAudit({
        actorUserId: null, targetUserId: null, action: 'bot.death',
        details: { botId: bot.dbId, botName: bot.name, behavior: bot.behavior, system: true },
      });
    } catch (e) { warn('   ⚠️ bots: no se pudo auditar la muerte: ' + (e && e.message)); }
  }

  function die(bot) {
    bot.dead = 1;
    bot.hp = 0;
    despawn(bot.dbId, { announce: true, chat: true });
    // La persistencia no bloquea el mundo: si falla, se loguea y se acepta el riesgo.
    return persistDeath(bot);
  }

  function maybeAttack(bot, behavior, players, t) {
    if (!(bot.damage > 0)) return;
    const victim = players.find(p => p.id === bot.attackTargetId);
    if (!victim) return;
    // Un comportamiento solo ataca jugadores si lo declara; el neutral además
    // debe estar retaliando exactamente contra esa víctima.
    const retaliating = bot.aggro && bot.aggro.kind === 'player' && bot.aggro.id === victim.id;
    if (!behavior.attacksPlayers && !retaliating) return;
    // Doble barrera: el comportamiento ya recibió jugadores filtrados, pero el
    // runtime vuelve a verificar antes de emitir daño.
    if (victim.dead === 1 || victim.admin === true || victim.mode === 'admin') return;
    if (victim.bot === true) return;
    if (victim.botIgnore === true) return;
    const d = hypot(victim.pos[0] - bot.pos[0], victim.pos[2] - bot.pos[2]);
    if (d > bot.reach) return;                         // techo DURO de alcance
    if (Math.abs((victim.pos[1] || 0) - bot.pos[1]) > 2.5) return;
    const last = bot.lastHitAt.get(victim.id) ?? -Infinity;
    if (t - last < HIT_GAP_MS) return;                 // ventana del cliente
    bot.lastHitAt.set(victim.id, t);
    bot.seq++;
    const den = d || 1e-6;
    sendToPlayer(victim.id, {
      t: 'phit', from: bot.name, fromId: bot.id, dmg: bot.damage,
      dx: (victim.pos[0] - bot.pos[0]) / den, dz: (victim.pos[2] - bot.pos[2]) / den,
    });
    log(horaAr(t) + `⚔️  golpe a ${victim.name} (d=${d.toFixed(2)}, seq=${bot.seq})`);
  }

  /**
   * Golpe del bot a una criatura. El runtime valida alcance, altura, cadencia y
   * que el comportamiento pueda atacar criaturas (o que sea retaliación del
   * neutral); el daño lo aplica la horda de forma server-side.
   */
  function maybeAttackZombie(bot, behavior, zombies, t) {
    if (!(bot.damage > 0)) return;
    const id = bot.attackZombieId;
    if (id == null) return;
    const zombie = (zombies || []).find(z => z && z.i === id && !z.dead);
    if (!zombie) return;
    const retaliating = bot.aggro && bot.aggro.kind === 'zombie' && bot.aggro.id === zombie.i;
    if (!behavior.attacksEnemies && !retaliating) return;
    const pos = Behaviors.zombiePos(zombie);
    if (!Array.isArray(pos)) return;
    const d = hypot(pos[0] - bot.pos[0], pos[2] - bot.pos[2]);
    if (d > bot.reach) return;
    if (Math.abs((pos[1] || 0) - bot.pos[1]) > 2.5) return;
    const last = bot.lastZombieHitAt.get(zombie.i) ?? -Infinity;
    if (t - last < HIT_GAP_MS) return;
    const res = typeof damageZombie === 'function' ? damageZombie(zombie.i, bot.damage, t) : null;
    if (!res) return;
    bot.lastZombieHitAt.set(zombie.i, t);
    bot.seq++;
    log(horaAr(t) + `⚔️  golpe a criatura #${zombie.i} (d=${d.toFixed(2)}, hp=${res.hp}, seq=${bot.seq})`);
  }

  /** Un paso de simulación para todos los bots activos. */
  function tick(dt) {
    const t = now();
    const players = getPlayers() || [];
    const zombies = (typeof getZombies === 'function' ? getZombies() : []) || [];
    for (const bot of list()) {
      const behavior = Behaviors.getBehavior(bot.behavior);
      if (!behavior) continue;
      const eligible = players.filter(p => Behaviors.eligible(p, bot.id));
      let intent = null;
      try {
        intent = behavior.decide({
          self: bot, players: eligible, zombies, home: bot.home, world,
          now: t, rng, dt,
        });
      } catch (e) {
        warn('   ⚠️ bots: decide falló (' + bot.name + '): ' + (e && e.message));
        continue;
      }
      if (intent) {
        if (Array.isArray(intent.face)) bot.yaw = yawTo(bot, intent.face);
        // Distancia al destino ANTES de moverse: la comparación entre ticks es la
        // que dice si el bot está avanzando o empujando contra un obstáculo.
        const nav = Array.isArray(intent.moveTo)
          ? {
            x: intent.moveTo[0], z: intent.moveTo[2],
            dist: hypot(intent.moveTo[0] - bot.pos[0], intent.moveTo[2] - bot.pos[2]),
          }
          : null;
        if (nav) {
          if (bot.flying) moveFly(bot, intent.moveTo, dt);
          else moveWalk(bot, intent.moveTo, dt, t);
        } else if (bot.flying) {
          if (Array.isArray(intent.face)) Behaviors.alignAltitude(bot.pos, intent.face[1], dt, bot.speed);
          Behaviors.clampToWorld(bot.pos, W, H);
        } else {
          Behaviors.applyGravity(world, bot.pos, bot.speed, dt);
        }
        const walking = nav !== null && !bot.flying;
        const chasing = intent.attackTargetId != null || intent.attackZombieId != null;
        // Un caminante que persigue pero no logra ACERCARSE (tronco, pared,
        // objetivo en una torre) se rinde a los ~3.5 s en vez de empujar para
        // siempre. El comportamiento lo reintenta cuando vence la pausa.
        if (walking && chasing) {
          const kind = intent.attackTargetId != null ? 'player' : 'zombie';
          const id = intent.attackTargetId != null ? intent.attackTargetId : intent.attackZombieId;
          const key = kind + ':' + id;
          if (bot.navKey !== key) { bot.navKey = key; bot.navBest = nav.dist; bot.stuckMs = 0; }
          if (nav.dist < bot.navBest - 0.5) {
            bot.navBest = nav.dist;
            bot.stuckMs = 0;
            bot.wanderResets = 0; // vuelve a avanzar: radio de deambular normal
          } else bot.stuckMs += dt * 1000;
          if (bot.stuckMs >= STUCK_MIN_MS) {
            Behaviors.abandonTarget(bot, kind, id, t);
            bot.stuckMs = 0;
            bot.navKey = null;
            bot.navBest = Infinity;
          }
        } else {
          bot.stuckMs = 0;
          bot.navKey = null;
          bot.navBest = Infinity;
        }
        // Deambular: si el destino elegido no se alcanza (árbol, pared, rincón) no
        // se empuja para siempre. A los ~2 s sin ACERCARSE se suelta el destino y
        // el rodeo, y el comportamiento elige otro; a los dos resets seguidos pasa
        // a un radio cercano (2–6) para salir del rincón.
        if (walking && !chasing) {
          const key = nav.x.toFixed(2) + ',' + nav.z.toFixed(2);
          if (bot.wanderKey !== key) { bot.wanderKey = key; bot.wanderBest = nav.dist; bot.wanderStuckMs = 0; }
          if (nav.dist < bot.wanderBest - WANDER_PROGRESS) {
            bot.wanderBest = nav.dist;
            bot.wanderStuckMs = 0;
            bot.wanderResets = 0; // vuelve a moverse: se restaura el radio normal
          } else if ((bot.wanderStuckMs += dt * 1000) >= WANDER_STUCK_MS) {
            Behaviors.resetWander(bot);
            bot.detour = null;
            bot.wanderStuckMs = 0;
            bot.wanderKey = null;
            bot.wanderBest = Infinity;
            bot.wanderResets = Math.min(bot.wanderResets + 1, 9);
          }
        } else {
          bot.wanderStuckMs = 0;
          bot.wanderKey = null;
          bot.wanderBest = Infinity;
        }
        bot.attackTargetId = intent.attackTargetId == null ? null : intent.attackTargetId;
        bot.attackZombieId = intent.attackZombieId == null ? null : intent.attackZombieId;
        if (bot.attackTargetId != null) maybeAttack(bot, behavior, players, t);
        if (bot.attackZombieId != null) maybeAttackZombie(bot, behavior, zombies, t);
      }
      if (bot.pos[1] < VOID_Y) bot.pos = bot.home.slice();
      if (t - bot.lastSnapAt >= snapMs) snapshot(bot, t);
    }
    return list();
  }

  /**
   * Golpe de un jugador a un bot. El server ignora el `dmg` del frame, aplica 2
   * por golpe válido y responde `{ accepted, dmg, hp, dead }`. Un bot neutral
   * recuerda al atacante (retaliación) aunque sea inmune; nunca si el atacante
   * es admin o tiene bot_ignore.
   */
  async function applyPlayerHit(bot, me, t = now()) {
    if (!bot) return { accepted: false, dmg: 0, hp: 0, dead: 0 };
    const d = hypot((me.pos && me.pos[0]) - bot.pos[0], (me.pos && me.pos[2]) - bot.pos[2]);
    if (d > Skins.swordReach(me.skin)) return { accepted: false, dmg: 0, hp: bot.hp, dead: 0 };
    const protectedAttacker = me.admin === true || me.mode === 'admin' ||
      (me.permissions && me.permissions.bot_ignore === true) || me.botIgnore === true;
    if (bot.behavior === 'neutral' && !protectedAttacker) {
      Behaviors.setAggro(bot, 'player', me.id, t);
    }
    if (!bot.takesDamage) return { accepted: false, dmg: 0, hp: bot.hp, dead: 0 };
    if (!bot.hitAt) bot.hitAt = new Map();
    const last = bot.hitAt.get(me.id) ?? -Infinity;
    if (t - last < PLAYER_HIT_CD_MS) return { accepted: false, dmg: 0, hp: bot.hp, dead: 0 };
    bot.hitAt.set(me.id, t);
    bot.hp = Math.max(0, bot.hp - HIT_DMG);
    bot.seq++;
    if (bot.hp <= 0) {
      await die(bot);
      return { accepted: true, dmg: HIT_DMG, hp: 0, dead: 1 };
    }
    snapshot(bot, t);
    return { accepted: true, dmg: HIT_DMG, hp: bot.hp, dead: 0 };
  }

  /**
   * Golpe de una criatura (zombi) a un bot, ruteado desde el tick de la horda.
   * El daño es server-authoritative; `takesDamage:false` lo vuelve inmune, pero
   * un neutral igual recuerda al atacante para retaliar.
   */
  async function applyEnemyHit(bot, dmg, sourceZombieId, t = now()) {
    if (!bot) return { accepted: false, dmg: 0, hp: 0, dead: 0 };
    const source = +sourceZombieId;
    if (bot.behavior === 'neutral' && Number.isFinite(source)) {
      Behaviors.setAggro(bot, 'zombie', source, t);
    }
    if (!bot.takesDamage) {
      if (bot.behavior === 'neutral') snapshot(bot, t);
      return { accepted: false, dmg: 0, hp: bot.hp, dead: 0 };
    }
    const applied = Math.max(0, Math.min(20, Math.round(Number(dmg) || 0)));
    if (applied === 0) return { accepted: false, dmg: 0, hp: bot.hp, dead: 0 };
    bot.hp = Math.max(0, bot.hp - applied);
    bot.seq++;
    if (bot.hp <= 0) {
      await die(bot);
      return { accepted: true, dmg: applied, hp: 0, dead: 1 };
    }
    snapshot(bot, t);
    return { accepted: true, dmg: applied, hp: bot.hp, dead: 0 };
  }

  /** Detiene un bot en el runtime sin tocar la base (la API persiste primero). */
  function stop(dbId) {
    return despawn(dbId, { announce: true, chat: false });
  }

  /** Arranca el runtime: spawnea hasta 5 `active:true` y deja `ready` resuelto. */
  function boot() {
    ready = (async () => {
      if (!enabled || !store || typeof store.listBots !== 'function') return false;
      try {
        const rows = (await store.listBots({ active: true })).slice().sort((a, b) => a.id - b.id);
        if (rows.length > MAX_ACTIVE) {
          warn(`   ⚠️ bots: hay ${rows.length} activos en la base; el exceso (más de ${MAX_ACTIVE}) se ignora al arrancar`);
        }
        for (const row of rows.slice(0, MAX_ACTIVE)) {
          try { spawn(row); }
          catch (e) { warn('   ⚠️ bots: no se pudo spawnear ' + row.name + ': ' + (e && e.message)); }
        }
        return true;
      } catch (e) {
        warn('   ⚠️ bots: no se pudieron leer los activos al arrancar: ' + (e && e.message));
        return false;
      }
    })();
    return ready;
  }

  function close() {
    if (timer) { clearInterval(timer); timer = null; }
    byDbId.clear();
    byId.clear();
  }

  if (enabled) {
    timer = setInterval(() => {
      try { tick(Math.min(0.1, tickMs / 1000)); }
      catch (e) { warn('   ⚠️ bots: error en el tick: ' + (e && e.message)); }
    }, tickMs);
    if (timer.unref) timer.unref();
  }

  return {
    ready, boot, spawn, despawn, list, getById, getByDbId, runtimeState,
    tick, applyPlayerHit, applyEnemyHit, stop, close,
  };
}

module.exports = {
  create, botEntry, horaAr,
  HIT_GAP_MS, PLAYER_HIT_CD_MS, HIT_DMG, MAX_ACTIVE, VOID_Y, BOT_HELD,
  STUCK_MIN_MS, WANDER_STUCK_MS, WANDER_PROGRESS, DETOUR_MS_MIN, DETOUR_MS_RANGE,
};

