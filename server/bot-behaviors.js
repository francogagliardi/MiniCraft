'use strict';
// Comportamientos de bots y movimiento puro (change panel-bots-custom,
// capability bots/runtime). Un comportamiento SOLO declara intención
// ({ moveTo, stop, face, attackTargetId }); el runtime valida alcance, cadencia,
// admins y bot_ignore, y recién ahí emite el daño. Volar es configuración
// (`flying`), no un comportamiento: el mismo cazador vuela o camina.

const RADIUS = 0.3;          // radio del cuerpo (igual que jugadores/zombis)
const CHASE_STOP = 3.8;      // el cazador deja de acercarse y golpea
const CHASE_VERTICAL = 2.5;  // si el objetivo está más lejos en altura, sigue navegando
const HOME_STOP = 1.0;       // umbral de quietud en el punto de origen
const FLY_Y_OFFSET = 0.5;    // altura objetivo = pies del objetivo + offset
const FLY_Y_DEADBAND = 0.25; // no corrige la altura dentro de esta banda
const WANDER_MIN = 6;        // radio mínimo de deambulación (merodeador/neutral)
const WANDER_MAX = 24;       // radio máximo: recorre más mundo sin perderse
const GUARD_WANDER_MIN = 4;  // el guardián patrulla cerca de su origen…
const GUARD_WANDER_MAX = 16; // …sin salir nunca de su radio de guardia
const WANDER_PAUSE_MIN = 1000;
const WANDER_PAUSE_RANGE = 3000;
const WANDER_TIMEOUT_MS = 15000; // si no llega al destino, elige otro (sin bucle)
const WANDER_SAMPLES = 40;       // candidatos por intento antes de rendirse ese tick
const WANDER_RETRY_MS = 400;     // pausa corta si el mundo no ofrece celda libre
const WANDER_ESCAPE_AFTER = 2;   // resets de navegación que activan el radio cercano
const WANDER_ESCAPE_MIN = 2;     // radio cercano para salir de un rincón
const WANDER_ESCAPE_MAX = 6;
const GUARD_RADIUS = 16;     // zona que defiende el guardián alrededor de su origen
const NEUTRAL_AGGRO_MS = 10000; // ventana de retaliación del neutral
const GIVE_UP_STUCK_MS = 3000;  // empujando sin avanzar: suelta el objetivo
const GIVE_UP_COOLDOWN_MS = 4000; // pausa antes de reintentar ese objetivo

const hypot = (dx, dz) => Math.sqrt(dx * dx + dz * dz);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// Movimiento puro sobre un mundo inyectado
//   world = { W, H, topSolidY(x,z), freeForMob(x,y,z) }
// ---------------------------------------------------------------------------
const cell = (p) => [Math.floor(p - RADIUS), Math.floor(p + RADIUS)];

// Altura del suelo válida para el cuerpo en (nx,nz), o null si no puede estar:
// no sube más de 1 bloque y los 2 bloques del cuerpo quedan libres.
function groundAt(world, nx, nz, y) {
  if (!world) return null;
  const [x0, x1] = cell(nx), [z0, z1] = cell(nz);
  let gy = 0;
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const t = world.topSolidY(cx, cz);
      if (t > gy) gy = t;
    }
  }
  if (gy - y > 1) return null; // desnivel mayor a un bloque: no hay auto-escalón
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      if (!world.freeForMob(cx, gy, cz)) return null;
    }
  }
  return gy;
}

// Mueve con deslizamiento: diagonal → solo-x → solo-z. Aplica auto-escalón de
// un bloque y gravedad; rechaza el paso si el cuerpo no entra o sale del mundo.
function moveTo(world, pos, dx, dz, speed, dt) {
  if (!world || !isNum(speed) || !isNum(dt) || dt <= 0) return false;
  const sx = dx * speed * dt, sz = dz * speed * dt;
  if (Math.abs(sx) < 1e-12 && Math.abs(sz) < 1e-12) return false;
  const tryStep = (nx, nz) => {
    if (nx < 1 || nx > world.W - 2 || nz < 1 || nz > world.W - 2) return false;
    const gy = groundAt(world, nx, nz, pos[1]);
    if (gy === null) return false;
    pos[0] = nx;
    pos[2] = nz;
    pos[1] = gy >= pos[1] ? gy : Math.max(gy, pos[1] - speed * dt);
    return true;
  };
  if (tryStep(pos[0] + sx, pos[2] + sz)) return true;
  if (sx !== 0 && tryStep(pos[0] + sx, pos[2])) return true;
  if (sz !== 0 && tryStep(pos[0], pos[2] + sz)) return true;
  return false;
}

// Gravedad en el lugar: baja hacia el suelo sin atravesarlo. No mueve si el
// cuerpo no entra en la celda actual.
function applyGravity(world, pos, speed, dt) {
  if (!world || !isNum(speed) || !isNum(dt) || dt <= 0) return false;
  const gy = groundAt(world, pos[0], pos[2], pos[1]);
  if (gy === null) return false;
  if (pos[1] > gy) pos[1] = Math.max(gy, pos[1] - speed * dt);
  return true;
}

// Vuelo libre: suma directa en los tres ejes, sin consultar el mundo.
function freeMove(pos, dx, dy, dz) {
  pos[0] += dx;
  pos[1] += dy;
  pos[2] += dz;
}

// Alinea la altura hacia `ty + offset` con paso máximo speed*dt y banda muerta.
function alignAltitude(pos, ty, dt, speed, deadband = FLY_Y_DEADBAND, offset = FLY_Y_OFFSET) {
  if (!isNum(ty) || !isNum(dt) || !(dt > 0) || !isNum(speed)) return;
  const dy = (ty + offset) - pos[1];
  if (Math.abs(dy) <= deadband) return;
  const step = speed * dt;
  pos[1] += Math.sign(dy) * Math.min(Math.abs(dy), step);
}

// Contiene la posición dentro del área jugable (borde, no colisión).
function clampToWorld(pos, W, H) {
  if (!isNum(W) || !isNum(H)) return;
  pos[0] = clamp(pos[0], 1, W - 2);
  pos[2] = clamp(pos[2], 1, W - 2);
  pos[1] = clamp(pos[1], 0, H - 1);
}

// ---------------------------------------------------------------------------
// Registro extensible
// ---------------------------------------------------------------------------
const registry = new Map();

function registerBehavior(def) {
  if (!def || typeof def !== 'object') throw new Error('registerBehavior: falta la definición');
  if (typeof def.id !== 'string' || !def.id) throw new Error('registerBehavior: falta id');
  if (typeof def.label !== 'string' || !def.label) throw new Error('registerBehavior: falta label');
  if (typeof def.hostile !== 'boolean') throw new Error('registerBehavior: falta hostile');
  if (typeof def.decide !== 'function') throw new Error('registerBehavior: falta decide');
  // Metadata de ataque: si no se declara, el default es seguro (nunca ataca).
  const attacksPlayers = def.attacksPlayers === undefined ? def.hostile : def.attacksPlayers;
  const attacksEnemies = def.attacksEnemies === undefined ? false : def.attacksEnemies;
  if (typeof attacksPlayers !== 'boolean') throw new Error('registerBehavior: attacksPlayers debe ser booleano');
  if (typeof attacksEnemies !== 'boolean') throw new Error('registerBehavior: attacksEnemies debe ser booleano');
  if (registry.has(def.id)) throw new Error(`registerBehavior: id duplicado "${def.id}"`);
  const entry = { ...def, attacksPlayers, attacksEnemies };
  registry.set(def.id, entry);
  return entry;
}

const getBehavior = (id) => registry.get(id) || null;
const listBehaviors = () => [...registry.values()].map(b => ({
  id: b.id, label: b.label, hostile: b.hostile,
  attacksPlayers: b.attacksPlayers, attacksEnemies: b.attacksEnemies,
}));

// ---------------------------------------------------------------------------
// Presas: vivo, no admin, no bot y sin bot_ignore. El runtime filtra además;
// el comportamiento repite el filtro como segunda barrera.
// ---------------------------------------------------------------------------
function eligible(p, selfId) {
  return !!p && p.id !== selfId && p.dead !== 1 && p.admin !== true &&
    p.mode !== 'admin' && p.bot !== true && p.botIgnore !== true;
}

function nearestPrey(self, players, now) {
  let best = null, bestD = Infinity;
  for (const p of players || []) {
    if (!eligible(p, self.id)) continue;
    if (targetAbandoned(self, 'player', p.id, now)) continue;
    const d = hypot(p.pos[0] - self.pos[0], p.pos[2] - self.pos[2]);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// Posición normalizada de una criatura, sea del runtime ({ pos }) o cruda del
// zombi ({ x, y, z }).
function zombiePos(z) {
  if (!z) return null;
  if (Array.isArray(z.pos)) return z.pos;
  if (isNum(z.x) && isNum(z.z)) return [z.x, isNum(z.y) ? z.y : 0, z.z];
  return null;
}

// Criatura viva más cercana dentro de la zona de guardia (radio desde `origin`).
function nearestEnemyInZone(self, zombies, origin, now) {
  const home = Array.isArray(origin) ? origin : self.pos;
  let best = null, bestD = Infinity;
  for (const z of zombies || []) {
    if (!z || z.dead) continue;
    const pos = zombiePos(z);
    if (!pos) continue;
    if (targetAbandoned(self, 'zombie', z.i, now)) continue;
    if (hypot(pos[0] - home[0], pos[2] - home[2]) > GUARD_RADIUS) continue;
    const d = hypot(pos[0] - self.pos[0], pos[2] - self.pos[2]);
    if (d < bestD) { bestD = d; best = { z, pos }; }
  }
  return best;
}

// Intención de persecución/golpe hacia una posición; se detiene al alcance
// horizontal SOLO si además está dentro de la ventana vertical (±2.5). Si el
// objetivo está en una torre, un techo o del otro lado de un tronco, el bot
// sigue navegando en vez de quedarse congelado sin poder golpear.
function chaseIntent(self, pos, attackTargetId, attackZombieId) {
  const d = hypot(pos[0] - self.pos[0], pos[2] - self.pos[2]);
  const dy = Math.abs((isNum(pos[1]) ? pos[1] : self.pos[1]) - self.pos[1]);
  const out = {
    face: [pos[0], pos[1], pos[2]],
    attackTargetId: attackTargetId == null ? null : attackTargetId,
    attackZombieId: attackZombieId == null ? null : attackZombieId,
    stop: false,
    moveTo: null,
  };
  if (d > CHASE_STOP || dy > CHASE_VERTICAL) out.moveTo = [pos[0], pos[1], pos[2]];
  else out.stop = true;
  return out;
}

// ---------------------------------------------------------------------------
// Rendirse con un objetivo inalcanzable (evita empujar contra un árbol para
// siempre). El runtime lo marca cuando el caminante lleva GIVE_UP_STUCK_MS sin
// avanzar y los comportamientos ignoran ese objetivo hasta que vence la pausa.
// ---------------------------------------------------------------------------
function abandonTarget(self, kind, id, now) {
  if (!self || (kind !== 'player' && kind !== 'zombie') || !isNum(+id)) return null;
  self.giveUp = { kind, id: +id, until: (isNum(now) ? now : 0) + GIVE_UP_COOLDOWN_MS };
  return self.giveUp;
}

function targetAbandoned(self, kind, id, now) {
  const g = self && self.giveUp;
  if (!g || typeof g !== 'object' || !isNum(g.until)) return false;
  if (isNum(now) && now >= g.until) { self.giveUp = null; return false; }
  return g.kind === kind && +g.id === +id;
}

// Deambular nuevo desde cero: lo usan el aggro del neutral y los reinicios para
// que no retome un destino viejo (que era lo que lo dejaba quieto).
function resetWander(self) {
  if (!self || typeof self !== 'object') return null;
  self.wander = { tx: null, tz: null, waitUntil: 0, deadline: 0 };
  return self.wander;
}

// ¿El bot puede estar parado en (tx,tz)? Fuera del mundo nunca; el volador no
// consulta colisión (solo el borde). Un caminante necesita una columna con
// suelo, el cuerpo de 2 bloques libre en TODAS las celdas que ocupa y un
// desnivel de a lo sumo un bloque respecto de sus pies: no hay auto-escalón
// más alto, así que la copa de un árbol no es un destino válido.
function wanderCell(world, tx, tz, y, flying) {
  if (!isNum(tx) || !isNum(tz)) return false;
  const W = world && isNum(world.W) ? world.W : null;
  if (W !== null && (tx < 1 || tx > W - 2 || tz < 1 || tz > W - 2)) return false;
  if (flying) return true;
  if (!world || typeof world.topSolidY !== 'function') return true;
  const [x0, x1] = cell(tx), [z0, z1] = cell(tz);
  let gy = 0;
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const top = world.topSolidY(cx, cz);
      if (isNum(top) && top > gy) gy = top;
    }
  }
  if (gy < 1) return false;                   // columna sin suelo (vacío/agua)
  if (isNum(y) && gy - y > 1) return false;   // no hay auto-escalón más alto
  const free = typeof world.freeForMob === 'function' ? world.freeForMob : null;
  if (!free) return true;
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      if (!free(cx, gy, cz)) return false;
    }
  }
  return true;
}

// Muestrea hasta WANDER_SAMPLES candidatos y devuelve el primero transitable.
// Tras WANDER_ESCAPE_AFTER resets sin avanzar busca cerca del bot (2–6) para
// salir de un rincón, siempre dentro de la zona del comportamiento.
function pickWanderTarget(self, home, world, random, min, max, originOverride = null) {
  const home0 = Array.isArray(home) ? home : self.pos;
  const resets = isNum(self.wanderResets) ? self.wanderResets : 0;
  const escaping = resets >= WANDER_ESCAPE_AFTER;
  const zone = Math.max(0, max);
  const lo = escaping ? WANDER_ESCAPE_MIN : Math.max(0, min);
  const hi = escaping ? Math.min(WANDER_ESCAPE_MAX, Math.max(lo, zone)) : Math.max(lo, zone);
  const origin = originOverride || (escaping ? self.pos : home0);
  const W = world && isNum(world.W) ? world.W : 208;
  const flying = self.flying === true;
  for (let i = 0; i < WANDER_SAMPLES; i++) {
    const angle = random() * Math.PI * 2;
    const radius = lo + random() * Math.max(0, hi - lo);
    const tx = origin[0] + Math.cos(angle) * radius;
    const tz = origin[2] + Math.sin(angle) * radius;
    if (tx < 1 || tx > W - 2 || tz < 1 || tz > W - 2) continue;
    if (hypot(tx - home0[0], tz - home0[2]) > zone) continue;
    if (!wanderCell(world, tx, tz, self.pos[1], flying)) continue;
    return [tx, tz];
  }
  return null;
}

// Deambulación compartida (merodeador, guardián y neutral) dentro de su zona.
// `min`/`max` acotan el radio: el guardián usa 4–16 para no salir de su zona.
// El destino SIEMPRE se valida antes de fijarlo: si la celda es sólida, no tiene
// suelo o el desnivel es inalcanzable, se descarta el candidato y se muestrea otro
// (así el bot no empuja contra un árbol para siempre).
function wanderIntent(self, home, world, now, rng, min = WANDER_MIN, max = WANDER_MAX) {
  const origin = Array.isArray(home) ? home : self.pos;
  if (!self.wander || typeof self.wander !== 'object') resetWander(self);
  const w = self.wander;
  const random = typeof rng === 'function' ? rng : Math.random;
  const t = isNum(now) ? now : 0;
  // Destino que no se alcanzó a tiempo: se descarta y se elige otro.
  if (isNum(w.deadline) && w.deadline > 0 && t > w.deadline) {
    w.tx = null; w.tz = null; w.waitUntil = 0; w.deadline = 0;
  }
  if (w.tx === null || w.tz === null) {
    // Pausa corta entre reintentos: si el mundo no ofrece ninguna celda libre se
    // espera y se vuelve a muestrear en vez de fijar un destino sólido.
    if (isNum(w.waitUntil) && t < w.waitUntil) {
      return { moveTo: null, face: null, attackTargetId: null, attackZombieId: null, stop: true };
    }
    let spot = pickWanderTarget(self, origin, world, random, min, max);
    if (!spot) {
      // Fallback local: en bosque/terreno empinado casi ningún punto lejano es
      // alcanzable; probar 2–6 bloques desde la posición actual encuentra celdas
      // llanas sin dejar al bot esperando para siempre.
      spot = pickWanderTarget(self, origin, world, random, WANDER_ESCAPE_MIN, WANDER_ESCAPE_MAX, self.pos);
    }
    if (!spot) {
      w.tx = null; w.tz = null; w.deadline = 0;
      w.waitUntil = t + WANDER_RETRY_MS;
      return { moveTo: null, face: null, attackTargetId: null, attackZombieId: null, stop: true };
    }
    w.tx = spot[0]; w.tz = spot[1];
    w.waitUntil = t + WANDER_PAUSE_MIN + random() * WANDER_PAUSE_RANGE;
    w.deadline = t + WANDER_TIMEOUT_MS;
    return { moveTo: null, face: [w.tx, self.pos[1], w.tz], attackTargetId: null, attackZombieId: null, stop: true };
  }
  if (isNum(now) && now < w.waitUntil) {
    return { moveTo: null, face: [w.tx, self.pos[1], w.tz], attackTargetId: null, attackZombieId: null, stop: true };
  }
  const dx = w.tx - self.pos[0], dz = w.tz - self.pos[2];
  if (hypot(dx, dz) < 0.5) {
    w.tx = null; w.tz = null; w.waitUntil = 0; w.deadline = 0;
    return { moveTo: null, face: null, attackTargetId: null, attackZombieId: null, stop: true };
  }
  return { moveTo: [w.tx, self.pos[1], w.tz], face: [w.tx, self.pos[1], w.tz], attackTargetId: null, attackZombieId: null, stop: false };
}

// Ventana de retaliación del neutral: el runtime la fija cuando el bot recibe un
// golpe y el comportamiento la consume en el tick siguiente. Al entrar en aggro
// se reinicia el deambular para que al salir elija un destino nuevo.
function setAggro(bot, kind, id, now, ms = NEUTRAL_AGGRO_MS) {
  const targetId = +id;
  if (!bot || !isNum(targetId)) return null;
  bot.aggro = { kind, id: targetId, until: (isNum(now) ? now : 0) + ms };
  resetWander(bot);
  return bot.aggro;
}

// ---------------------------------------------------------------------------
// cazador: persigue al jugador válido más cercano; sin presas vuelve al origen.
// ---------------------------------------------------------------------------
registerBehavior({
  id: 'cazador',
  label: 'Cazador',
  hostile: true,
  attacksPlayers: true,
  attacksEnemies: false,
  decide({ self, players, home, now }) {
    const prey = nearestPrey(self, players, now);
    if (prey) return chaseIntent(self, prey.pos, prey.id, null);
    const origin = Array.isArray(home) ? home : self.pos;
    const d = hypot(origin[0] - self.pos[0], origin[2] - self.pos[2]);
    if (d > HOME_STOP) {
      return { moveTo: [origin[0], origin[1], origin[2]], face: [origin[0], origin[1], origin[2]], attackTargetId: null, attackZombieId: null, stop: false };
    }
    return { moveTo: null, face: null, attackTargetId: null, attackZombieId: null, stop: true };
  },
});

// ---------------------------------------------------------------------------
// merodeador: deambula con pausas dentro de su zona; nunca ataca.
// ---------------------------------------------------------------------------
registerBehavior({
  id: 'merodeador',
  label: 'Merodeador',
  hostile: false,
  attacksPlayers: false,
  attacksEnemies: false,
  decide({ self, home, world, now, rng }) {
    return wanderIntent(self, home, world, now, rng);
  },
});

// ---------------------------------------------------------------------------
// guardián: defiende una zona alrededor de su origen contra criaturas. Nunca
// declara ataque contra jugadores, aunque lo golpeen.
// ---------------------------------------------------------------------------
registerBehavior({
  id: 'guardian',
  label: 'Guardián',
  hostile: false,
  attacksPlayers: false,
  attacksEnemies: true,
  decide({ self, zombies, home, world, now, rng }) {
    const origin = Array.isArray(home) ? home : self.pos;
    const enemy = nearestEnemyInZone(self, zombies, origin, now);
    if (enemy) return chaseIntent(self, enemy.pos, null, enemy.z.i);
    const d = hypot(origin[0] - self.pos[0], origin[2] - self.pos[2]);
    // Solo vuelve al centro si quedó FUERA de su zona de guardia; dentro de la
    // zona patrulla, si no se quedaría clavado en el centro entre combates.
    if (d > GUARD_RADIUS) {
      return { moveTo: [origin[0], origin[1], origin[2]], face: [origin[0], origin[1], origin[2]], attackTargetId: null, attackZombieId: null, stop: false };
    }
    return wanderIntent(self, origin, world, now, rng, GUARD_WANDER_MIN, GUARD_WANDER_MAX);
  },
});

// ---------------------------------------------------------------------------
// neutral: deambula como el merodeador; si lo golpean, persigue y pelea contra
// el atacante durante NEUTRAL_AGGRO_MS y después vuelve a deambular. Los
// jugadores que recibe ya vienen filtrados (sin admins ni bot_ignore).
// ---------------------------------------------------------------------------
registerBehavior({
  id: 'neutral',
  label: 'Neutral',
  hostile: false,
  attacksPlayers: false,
  attacksEnemies: false,
  decide({ self, players, zombies, home, world, now, rng }) {
    const aggro = self.aggro && typeof self.aggro === 'object' ? self.aggro : null;
    if (aggro) {
      if (isNum(aggro.until) && isNum(now) && now >= aggro.until) {
        self.aggro = null; // ventana vencida: vuelve a deambular
        resetWander(self);
      } else if (aggro.kind === 'player') {
        if (targetAbandoned(self, 'player', aggro.id, now)) {
          self.aggro = null; // no puede alcanzarlo: suelta y deambula
          resetWander(self);
        } else {
          const prey = (players || []).find(p => p && p.id === aggro.id && p.dead !== 1);
          if (prey) return chaseIntent(self, prey.pos, prey.id, null);
          self.aggro = null; // murió, se fue o quedó protegido
          resetWander(self);
        }
      } else if (aggro.kind === 'zombie') {
        if (targetAbandoned(self, 'zombie', aggro.id, now)) {
          self.aggro = null;
          resetWander(self);
        } else {
          const enemy = (zombies || []).find(z => z && z.i === aggro.id && !z.dead);
          const pos = zombiePos(enemy);
          if (pos) return chaseIntent(self, pos, null, enemy.i);
          self.aggro = null; // la criatura murió o desapareció
          resetWander(self);
        }
      } else {
        self.aggro = null;
        resetWander(self);
      }
    }
    return wanderIntent(self, home, world, now, rng);
  },
});

module.exports = {
  registerBehavior, getBehavior, listBehaviors,
  groundAt, moveTo, applyGravity, freeMove, alignAltitude, clampToWorld, eligible,
  nearestEnemyInZone, wanderIntent, wanderCell, pickWanderTarget, setAggro, zombiePos,
  abandonTarget, targetAbandoned, resetWander,
  RADIUS, CHASE_STOP, CHASE_VERTICAL, HOME_STOP, FLY_Y_OFFSET, FLY_Y_DEADBAND,
  WANDER_MIN, WANDER_MAX, GUARD_WANDER_MIN, GUARD_WANDER_MAX, WANDER_TIMEOUT_MS,
  WANDER_SAMPLES, WANDER_RETRY_MS, WANDER_ESCAPE_AFTER, WANDER_ESCAPE_MIN, WANDER_ESCAPE_MAX,
  GUARD_RADIUS, NEUTRAL_AGGRO_MS, GIVE_UP_STUCK_MS, GIVE_UP_COOLDOWN_MS,
};
