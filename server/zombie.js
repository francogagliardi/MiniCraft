'use strict';
// Escala de los aspectos compartida con el cliente: el alcance del golpe depende del skin.
const { swordReach } = require('./skins.js');

// Módulo puro de la horda zombi (ver openspec/changes/zombi/design.md, decisión 7).
// No toca WebSocket ni Date.now(): recibe world/predicados/rng/now y devuelve
// intenciones ({zs, events}) para que server.js las cablee a los clientes. Así la IA
// (spawn, campo de visión, persecución, ataque, muerte) se testea determinista y sin
// levantar un server.

// ---- constantes de la criatura ----
const ZOMBIE_HP = 6;          // vida de la criatura
const SWORD_DMG = 2;          // daño que aplica el SERVER por golpe de espada (no confía en el cliente)
const ZOMBIE_DMG = 2;         // daño que el zombi aplica al jugador por golpe
const SPEED = 2.4;            // persecución = 50 % de los 4.8 del jugador
const WANDER_SPEED = 1.2;     // deambulación = 50 % de la persecución
const VIEW_DIST = 16;         // radio de detección (bloques, horizontal, sin ángulo)
const ATTACK_RANGE = 1.2;     // alcance del golpe al jugador
const ATTACK_CD_MS = 1000;    // un golpe por segundo
const HIT_CD_MS = 500;        // cadencia mínima con que el server acepta golpes del jugador
const DEATH_HOLD_MS = 2000;   // el muerto sigue difundido ~2 s (para ver la caída)
const SPAWN_MIN = 18, SPAWN_MAX = 32; // anillo de aparición alrededor del jugador
const SPAWN_MIN_MOB = 2;      // separación mínima entre zombis al aparecer
const SWORD_REACH = 4.6;      // alcance del golpe del jugador (mismo `far` que el raycast del cliente)
const RADIUS = 0.3;           // radio de colisión del cuerpo (mismo criterio que el jugador)
const WANDER_PAUSE_MIN = 3000, WANDER_PAUSE_RANGE = 3000; // pausa de 3-6 s al deambular

function createHorde(env) {
  const { topSolidY, freeForMob, rng, W = 208, H = 40, surface = 10 } = env;
  const zombies = [];
  const hitCd = new Map(); // playerId -> now del último golpe aceptado
  let nextZid = 1;
  let spawnedThisNight = false;
  let wasNight = false;

  const clampCell = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const cell = (p) => [Math.floor(p - RADIUS), Math.floor(p + RADIUS)];

  // Altura del suelo válida para el cuerpo en (nx,nz), o null si no puede estar:
  // no sube más de 1 bloque y los 2 bloques del cuerpo quedan libres en todas las
  // celdas que ocupa (radio).
  function groundAt(nx, nz, y) {
    const [x0, x1] = cell(nx), [z0, z1] = cell(nz);
    let gy = 0;
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const t = topSolidY(cx, cz);
        if (t > gy) gy = t;
      }
    if (gy - y > 1) return null;
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++)
        if (!freeForMob(cx, gy, cz)) return null;
    return gy;
  }

  // Mueve con deslizamiento: diagonal → solo-x → solo-z. `false` si no pudo moverse.
  function moveTo(z, dx, dz, sp, dt) {
    const sx = dx * sp * dt, sz = dz * sp * dt;
    const tryStep = (nx, nz) => {
      const gy = groundAt(nx, nz, z.y);
      if (gy === null) return false;
      z.x = nx; z.z = nz; z.y = gy;
      return true;
    };
    if (tryStep(z.x + sx, z.z + sz)) return true;
    if (sx !== 0 && tryStep(z.x + sx, z.z)) return true;
    if (sz !== 0 && tryStep(z.x, z.z + sz)) return true;
    return false;
  }

  // ¿El jugador `p` está dentro del radio de detección del zombi `z`? (circular, sin
  // ángulo: al zombi le da igual hacia dónde mira — se lo detecta también por detrás).
  function visible(z, p) {
    if (!p || p.dead) return false;
    const dx = p.pos[0] - z.x, dz = p.pos[2] - z.z;
    return Math.hypot(dx, dz) <= VIEW_DIST;
  }

  // Adquisición determinista: primer jugador visible ordenando por id.
  function acquireTarget(z, players) {
    const sorted = players.slice().sort((a, b) => a.id - b.id);
    for (const p of sorted) if (visible(z, p)) return p.id;
    return null;
  }

  // Deambulación: destino aleatorio ±16 (clampeado) con pausa de 3-6 s entre tramos.
  function wander(z, now, dt) {
    if (z.wander.tx === null) {
      z.wander.tx = clampCell(Math.round(z.x + (rng() * 32 - 16)), 0, W - 1);
      z.wander.tz = clampCell(Math.round(z.z + (rng() * 32 - 16)), 0, W - 1);
      z.wander.waitUntil = now + WANDER_PAUSE_MIN + rng() * WANDER_PAUSE_RANGE;
      return; // arranca en pausa
    }
    if (now < z.wander.waitUntil) return;
    const dx = z.wander.tx - z.x, dz = z.wander.tz - z.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) { z.wander.tx = null; z.wander.tz = null; return; }
    z.yaw = Math.atan2(dx, dz);
    moveTo(z, dx / d, dz / d, WANDER_SPEED, dt);
  }

  function farFromOthers(cx, cz) {
    for (const o of zombies)
      if (Math.hypot(o.x - (cx + 0.5), o.z - (cz + 0.5)) < SPAWN_MIN_MOB) return false;
    return true;
  }

  // Busca un punto válido en el anillo del jugador girando el ángulo y alejando el
  // anillo; si no hay, omite ese zombi (nunca deja de spawnear por eso).
  function findSpawnPoint(p, rnd) {
    const px = p.pos[0], pz = p.pos[2];
    let theta = rnd() * Math.PI * 2;
    for (let ring = 0; ring < 3; ring++) {
      for (let attempt = 0; attempt < 24; attempt++) {
        const d = SPAWN_MIN + rnd() * (SPAWN_MAX - SPAWN_MIN) + ring * (SPAWN_MAX - SPAWN_MIN);
        const cx = clampCell(Math.round(px + Math.cos(theta) * d), 0, W - 1);
        const cz = clampCell(Math.round(pz + Math.sin(theta) * d), 0, W - 1);
        const gy = topSolidY(cx, cz);
        if (gy >= surface + 1 && gy < H - 1 && freeForMob(cx, gy, cz) && farFromOthers(cx, cz))
          return { x: cx + 0.5, y: gy, z: cz + 0.5 };
        theta += (Math.PI * 2) / 24;
      }
    }
    return null;
  }

  // Una sola pasada por noche: 3-4 zombis si hay al menos un jugador vivo.
  function spawnWave(players, now, night) {
    if (!night || spawnedThisNight) return 0;
    const alive = (players || []).filter(p => p && !p.dead);
    if (!alive.length) return 0; // sin jugadores no se marca la noche: puede spawnear más tarde
    spawnedThisNight = true;
    const n = 3 + Math.floor(rng() * 2);
    const from = alive[Math.floor(rng() * alive.length)];
    let made = 0;
    for (let k = 0; k < n; k++) {
      const c = findSpawnPoint(from, rng);
      if (!c) continue;
      zombies.push({
        i: nextZid++, x: c.x, y: c.y, z: c.z, yaw: 0, hp: ZOMBIE_HP,
        dead: 0, deadAt: 0, atk: 0, target: null, lastAtk: -1e9,
        wander: { tx: null, tz: null, waitUntil: 0 },
      });
      made++;
    }
    return made;
  }

  // Un tick de la IA: devuelve { zs, events } (sin red). El server cablea los eventos.
  function tick(dt, st) {
    const night = !!st.night, now = +st.now || 0;
    const players = st.players || [];
    const events = [];

    // noche→día: todos pasan a muriendo y se rehabilita el spawn para la próxima noche.
    if (wasNight && !night) {
      for (const z of zombies) if (!z.dead) { z.dead = 1; z.deadAt = now; }
      spawnedThisNight = false;
    }
    wasNight = night;

    if (night && !spawnedThisNight && !zombies.some(z => !z.dead)) spawnWave(players, now, true);

    for (const z of zombies) {
      if (z.dead) continue; // el muerto no se mueve ni ataca (solo espera su ventana en el zs)

      if (z.target !== null) {
        const p = players.find(q => q.id === z.target);
        if (!visible(z, p)) { z.target = null; z.wander.tx = null; z.wander.tz = null; }
      }
      if (z.target === null) {
        z.target = acquireTarget(z, players);
        if (z.target !== null) { z.wander.tx = null; z.wander.tz = null; }
      }

      if (z.target !== null) {
        const p = players.find(q => q.id === z.target);
        const dx = p.pos[0] - z.x, dz = p.pos[2] - z.z;
        const d = Math.hypot(dx, dz) || 1e-9;
        z.yaw = Math.atan2(dx, dz);
        if (d > ATTACK_RANGE) moveTo(z, dx / d, dz / d, SPEED, dt);
        if (d <= ATTACK_RANGE && Math.abs(p.pos[1] - z.y) <= 1.5 && now - z.lastAtk >= ATTACK_CD_MS) {
          z.lastAtk = now;
          z.atk = (z.atk || 0) + 1; // el contador de golpes viaja en el snapshot (decisión 16)
          events.push({ t: 'phit', to: z.target, from: 'Zombi', fromId: 0, dmg: ZOMBIE_DMG, dx: dx / d, dz: dz / d });
        }
      } else {
        wander(z, now, dt);
      }
    }

    // Retiro de los muertos pasada la ventana de retención.
    for (let k = zombies.length - 1; k >= 0; k--) {
      const z = zombies[k];
      if (z.dead && now - z.deadAt >= DEATH_HOLD_MS) zombies.splice(k, 1);
    }

    const zs = zombies.map(z => ({ i: z.i, p: [z.x, z.y, z.z], yaw: z.yaw, hp: z.hp, dead: z.dead, atk: z.atk || 0 }));
    return { zs, events };
  }

  // Golpe del jugador a la criatura: el server valida y aplica SU daño (SWORD_DMG).
  // Devuelve { ok, hp, dead, z } si se aplicó, o null si se rechaza (no existe, muerto,
  // fuera de alcance o dentro del cooldown por jugador). El alcance base 4.6 se escala por
  // el aspecto (sin quinto parámetro ⇒ human 4.6).
  function hit(playerId, zombieId, now, playerPos, skin) {
    const z = zombies.find(q => q.i === zombieId && !q.dead);
    if (!z) return null;
    if (playerPos) {
      const dx = playerPos[0] - z.x, dz = playerPos[2] - z.z;
      const reach = swordReach(skin);
      if (Math.hypot(dx, dz) > reach) return null;
    }
    const last = hitCd.get(playerId);
    if (last !== undefined && now - last < HIT_CD_MS) return null;
    hitCd.set(playerId, now);
    z.hp -= SWORD_DMG;
    if (z.hp <= 0) { z.hp = 0; z.dead = 1; z.deadAt = now; }
    return { ok: true, hp: z.hp, dead: z.dead, z };
  }

  return { tick, spawnWave, hit, zombies };
}

module.exports = {
  ZOMBIE_HP, SWORD_DMG, ZOMBIE_DMG, SPEED, WANDER_SPEED, VIEW_DIST,
  ATTACK_RANGE, ATTACK_CD_MS, HIT_CD_MS, DEATH_HOLD_MS,
  SPAWN_MIN, SPAWN_MAX, SPAWN_MIN_MOB, SWORD_REACH, createHorde,
};
