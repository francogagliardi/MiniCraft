'use strict';
/* ============================================================================
 * bot/cazador.js — lógica PURA del bot cazador (capability bots/hunter).
 *
 * Sin red, sin fs, sin env: recibe `send`, `now`, el mundo y el RNG por
 * inyección (determinista en tests). `bot/index.js` es el cableado (WebSocket +
 * worldgen + reconexión + CLI).
 *
 * Contrato (spec openspec/changes/bot-cazador/specs/bots/hunter/spec.md):
 *  - Presa = jugador con `mode !== 'admin'` y `dead === 0`. NUNCA ataca admins.
 *  - Golpe mortal en DOS toques separados: `dmg: 6` (techo del clamp del server)
 *    y el siguiente `hit` contra la MISMA víctima recién ≥ 0.65 s después
 *    (respeta la ventana godT de 0.6 s del cliente, index.html:1565; 6+6=12>10).
 *    Cada toque avanza `seq` UNA vez (dos golpes visibles, no un burst).
 *  - Alcance DURO ≤ 4.6 u horizontales: se ACERCA de verdad antes de golpear.
 *  - Velocidad 9.6 u/s (200 % de los 4.8 del jugador).
 *  - Invulnerable: ignora todo `phit`, reporta siempre hp:10/dead:0, sin daño de
 *    caída; si y < -10 se teletransporta al spawn.
 *  - Máquina de estados CAZA / ESPERA / SIGUEME (ver `setMode`).
 *  - Sin presas: camina al spawn y se queda quieto, pero SIGUE mandando `mv`
 *    (si no, el idle-kick de 90 s del server lo echa, server.js:179).
 *  - Huésped de solo lectura: NUNCA manda `edit`.
 *
 * Replica de `findSpawn()` de index.html:1684 (ver `parseWorld`): el `welcome`
 * no trae spawn y el cliente lo calcula localmente con el mundo ya editado.
 * ========================================================================== */

// ---- constantes del combate (espejo del cliente: vida 10, velocidad 4.8) ----
const MAX_HP = 10;
const SPEED = 9.6;        // 200 % de los 4.8 de caminata del jugador (spec: Velocidad doble)
const RANGE = 4.6;        // techo DURO de alcance horizontal de ataque
const DMG = 6;            // techo que clampa el server (server.js) — 6 + 6 = 12 > 10
const HIT_GAP_MS = 650;   // > ventana godT de 0.6 s del cliente (index.html:1565)
const MV_MS = 150;        // cadencia de `mv` (keepalive: nunca calla, aun quieto)
const SWORD = 100;        // ítem en mano: la víctima ve el arma (held)
const CHASE_STOP = 3.8;   // deja de acercarse y golpea (≤ RANGE)
const FOLLOW_STOP = 1.5;  // SIGUEME: umbral de convergencia con el admin objetivo
const SPAWN_STOP = 1.0;   // CAZA sin presas: umbral de quietud en el spawn
// Fallback si no hay mundo (p. ej. tests de lógica): el spawn del server.
const DEFAULT_SPAWN = [128.5, 20, 136.5];
const VOID_Y = -10;       // por debajo: teletransporte al spawn (igual que el cliente)

const hypot = (dx, dz) => Math.sqrt(dx * dx + dz * dz);

/** Normaliza un jugador de `welcome.players` / `join` a la forma interna. */
function normPlayer(p) {
  return {
    id: p.id,
    name: typeof p.name === 'string' && p.name ? p.name : 'Jugador#' + p.id,
    mode: p.mode === 'admin' ? 'admin' : 'player',
    pos: Array.isArray(p.pos) ? [p.pos[0], p.pos[1], p.pos[2]] : [0, 0, 0],
    dead: p.dead === 1 ? 1 : 0,
    hp: Number.isFinite(p.hp) ? p.hp : MAX_HP,
  };
}

/**
 * Crea la lógica del bot. Config inyectable:
 *   send(obj)                 — manda un frame (obligatorio)
 *   now()                     — reloj en ms (default Date.now)
 *   log(...)                  — logging opcional
 *   mvMs                      — cadencia de `mv` (default 150)
 *   world                     — { W, H, topSolidY(x,z), blocked(x,y,z) } | null
 *   spawn                     — [x,y,z] del punto de aparición
 *   id                        — id propio (llega con el `welcome`)
 */
function createHunter(cfg = {}) {
  const send = cfg.send;
  if (typeof send !== 'function') throw new Error('createHunter: falta `send`');
  const now = cfg.now || Date.now;
  const log = cfg.log || (() => {});
  const mvMs = cfg.mvMs ?? MV_MS;

  let world = cfg.world || null;
  let spawn = Array.isArray(cfg.spawn) ? cfg.spawn.slice() : DEFAULT_SPAWN.slice();

  const self = {
    id: cfg.id ?? null,
    pos: spawn.slice(),
    yaw: Math.PI,
    hp: MAX_HP,   // invulnerable: siempre lleno
    dead: 0,      // invulnerable: nunca muere
  };
  const players = new Map();   // id -> jugador
  const lastHitAt = new Map(); // id víctima -> ms del último toque
  const hitVictims = new Set();// víctimas a las que ya golpeamos (para anunciar la muerte)
  let modo = 'CAZA';
  let adminTargetId = null;
  let anchor = null;           // posición congelada de ESPERA
  let seq = 0;                 // gesto de golpe: +1 por toque
  let lastMvAt = 0;

  // ---------------------------------------------------------------- utilidades
  const sendChat = (text) => send({ t: 'chat', text: String(text).slice(0, 140) });
  const setMode = (m) => { modo = m; };

  /** Presa válida: no-admin, viva y que no sea el propio bot. */
  const isPrey = (p) => p && p.id !== self.id && p.mode !== 'admin' && p.dead === 0;

  /** Presa viva no-admin más cercana (o null). `maxD` acota la distancia horizontal. */
  function nearestPrey(maxD) {
    let best = null, bestD = Infinity;
    for (const p of players.values()) {
      if (!isPrey(p)) continue;
      const d = hypot(p.pos[0] - self.pos[0], p.pos[2] - self.pos[2]);
      if (d < bestD && d <= maxD) { bestD = d; best = p; }
    }
    return best;
  }
  /** Yaw para mirar a un punto: adelante = (-sin yaw, -cos yaw) ⇒ atan2(-dx,-dz). */
  const yawTo = (p) => Math.atan2(-(p[0] - self.pos[0]), -(p[2] - self.pos[2]));

  // -------------------------------------------------------- movimiento/física
  function clampToWorld() {
    if (!world) return;
    self.pos[0] = Math.max(1, Math.min(world.W - 2, self.pos[0]));
    self.pos[2] = Math.max(1, Math.min(world.W - 2, self.pos[2]));
  }
  /**
   * Intenta mover un eje (mx o mz) con colisión de terreno: el cuerpo ocupa 2
   * bloques (pies + cabeza). Auto-step de ≤1 bloque (el robot sube escaloncitos;
   * nunca atraviesa muros de 2+). Si no hay mundo, se mueve libre.
   */
  function tryMove(mx, mz) {
    if (!world) { self.pos[0] += mx; self.pos[2] += mz; return true; }
    const nx = self.pos[0] + mx, nz = self.pos[2] + mz;
    const cx = Math.round(nx), cz = Math.round(nz);
    let ny = self.pos[1];
    const gy = world.topSolidY(cx, cz);
    if (gy > 0) {
      if (gy > ny + 1.01) return false; // escalón de más de 1 bloque: bloqueado
      ny = gy;
    }
    const fy = Math.floor(ny);
    if (world.blocked(cx, fy, cz) || world.blocked(cx, fy + 1, cz)) return false;
    self.pos[0] = nx; self.pos[2] = nz; self.pos[1] = ny;
    return true;
  }
  /** Resuelve el suelo en la celda actual (glide sobre el terreno). */
  function resolveGround() {
    if (!world) return;
    const gy = world.topSolidY(Math.round(self.pos[0]), Math.round(self.pos[2]));
    if (gy > 0) self.pos[1] = gy;
  }
  /** Avanza hacia (tx,tz) hasta `step`, eje por eje para deslizar contra el terreno. */
  function moveToward(tx, tz, step) {
    const dx = tx - self.pos[0], dz = tz - self.pos[2];
    const d = hypot(dx, dz);
    if (d < 1e-6 || step <= 0) return;
    const s = Math.min(step, d);
    const ux = dx / d * s, uz = dz / d * s;
    if (!tryMove(ux, 0)) tryMove(0, uz); // deslizar si un eje se traba
    else tryMove(0, uz);
  }

  // ---------------------------------------------------------------- ataques
  function attack(victim) {
    const dx = victim.pos[0] - self.pos[0], dz = victim.pos[2] - self.pos[2];
    const d = hypot(dx, dz) || 1e-6;
    seq++;                             // un gesto por toque (lado visible en la víctima)
    lastHitAt.set(victim.id, now());
    hitVictims.add(victim.id);
    send({ t: 'hit', id: victim.id, dmg: DMG, dx: dx / d, dz: dz / d });
    log(`⚔️  golpe a ${victim.name} (d=${d.toFixed(2)}, seq=${seq})`);
  }
  function maybeAttack(victim) {
    if (!victim) return;
    const d = hypot(victim.pos[0] - self.pos[0], victim.pos[2] - self.pos[2]);
    if (d > RANGE) return;             // techo DURO: fuera de alcance no se golpea
    const last = lastHitAt.get(victim.id) ?? -Infinity;
    if (now() - last < HIT_GAP_MS) return; // respeta la ventana godT de 0.6 s del cliente
    attack(victim);
  }

  // ---------------------------------------------------------------- comandos
  function announceKill(name) {
    sendChat(`💀 Fulminé a ${name}`);
  }
  function handleChat(m) {
    const text = String(m.text || '').trim().toLowerCase();
    // match EXACTO (trim + case-insensitive, sin prefijo): no se dispara dentro de una frase
    if (text !== 'sigueme' && text !== 'seguime' && text !== 'espera') return;
    const fromId = m.fromId;
    if (fromId === undefined || fromId === null || fromId === self.id) return;
    const who = players.get(fromId);
    // AUTORIDAD POR ID DEL SERVER: el nombre es suplantable ⇒ jamás autorizar por nombre
    if (!who || who.mode !== 'admin') return;
    if (text === 'espera') {
      anchor = [self.pos[0], self.pos[1], self.pos[2]];
      adminTargetId = null;
      setMode('ESPERA');
      sendChat('🛑 Modo ESPERA: me quedo acá y fulmino a quien se acerque.');
      log('orden: espera (admin id ' + fromId + ')');
    } else {
      adminTargetId = fromId;
      anchor = null;
      setMode('SIGUEME');
      sendChat(`🐾 Modo SIGUEME: te sigo, ${who.name}.`);
      log('orden: sigueme a admin id ' + fromId);
    }
  }

  // ------------------------------------------------------------------ frames
  function handle(m) {
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'welcome': {
        self.id = m.id;
        players.clear();
        for (const p of (m.players || [])) if (p && p.id !== self.id) players.set(p.id, normPlayer(p));
        break;
      }
      case 'join': {
        if (m.id !== self.id) players.set(m.id, normPlayer(m));
        break;
      }
      case 'pm': {
        const p = players.get(m.id);
        if (!p) break;
        const wasAlive = p.dead === 0;
        if (Array.isArray(m.p)) p.pos = [m.p[0], m.p[1], m.p[2]];
        if (Number.isFinite(m.hp)) p.hp = m.hp;
        if (m.dead === 1 || m.dead === 0) p.dead = m.dead;
        if (typeof m.name === 'string' && m.name) p.name = m.name;
        if (wasAlive && p.dead === 1 && hitVictims.has(m.id)) announceKill(p.name);
        break;
      }
      case 'leave': {
        players.delete(m.id);
        if (m.id === adminTargetId) { // el admin objetivo se fue ⇒ vuelve a CAZA
          adminTargetId = null;
          anchor = null;
          setMode('CAZA');
          sendChat('🎯 El admin se fue: vuelvo a caza.');
        }
        break;
      }
      case 'chat': {
        handleChat(m);
        break;
      }
      case 'phit':
        // INVULNERABLE: se ignora todo daño (spec: Invulnerabilidad). Sin hp/daño de caída.
        break;
      default:
        break; // zs/pedit/hitok/…: no afectan la lógica de caza
    }
  }

  // -------------------------------------------------------------------- tick
  /**
   * Un paso de simulación. `dt` en segundos (default: derivado del reloj real).
   * Decide movimiento/ataque según el modo y emite `mv` a cadencia (keepalive).
   */
  function tick(dt) {
    const t = now();
    if (dt === undefined) { dt = Math.min(0.25, Math.max(0, (t - (tick._prev ?? t)) / 1000)); }
    tick._prev = t;
    dt = Math.min(0.25, Math.max(0, dt));

    // Invulnerabilidad de caída al vacío: teletransporte al spawn (igual que index.html:1648)
    if (self.pos[1] < VOID_Y) { self.pos = spawn.slice(); }

    if (modo === 'ESPERA') {
      // Posición CONGELADA (turreta): no persigue ni vuelve al spawn.
      if (anchor) self.pos = anchor.slice();
      const victim = nearestPrey(RANGE);
      if (victim) { self.yaw = yawTo(victim.pos); maybeAttack(victim); }
    } else if (modo === 'SIGUEME') {
      const victim = nearestPrey(RANGE); // turreta: no abandona al admin
      const adm = players.get(adminTargetId);
      if (adm) {
        const d = hypot(adm.pos[0] - self.pos[0], adm.pos[2] - self.pos[2]);
        if (d > FOLLOW_STOP) { self.yaw = yawTo(adm.pos); moveToward(adm.pos[0], adm.pos[2], SPEED * dt); }
        else self.yaw = victim ? yawTo(victim.pos) : yawTo(adm.pos);
      }
      clampToWorld();
      resolveGround();
      maybeAttack(victim);
    } else {
      // CAZA (default): presa no-admin viva más cercana; sin presas, al spawn y quieto.
      const victim = nearestPrey(Infinity);
      if (victim) {
        const d = hypot(victim.pos[0] - self.pos[0], victim.pos[2] - self.pos[2]);
        if (d > CHASE_STOP) moveToward(victim.pos[0], victim.pos[2], SPEED * dt);
        self.yaw = yawTo(victim.pos);
      } else {
        const d = hypot(spawn[0] - self.pos[0], spawn[2] - self.pos[2]);
        if (d > SPAWN_STOP) { self.yaw = yawTo(spawn); moveToward(spawn[0], spawn[2], SPEED * dt); }
      }
      clampToWorld();
      resolveGround();
      maybeAttack(victim);
    }

    // `mv` a cadencia: "quieto" = misma pos, nunca silencio (keepalive anti-idle 90 s).
    if (t - lastMvAt >= mvMs) {
      lastMvAt = t;
      send({
        t: 'mv', p: [self.pos[0], self.pos[1], self.pos[2]], yaw: self.yaw, pitch: 0,
        hp: MAX_HP, dead: 0, held: SWORD, seq,
      });
    }
  }

  // ------------------------------------------------------------------- API
  function setWorld(w, sp) {
    world = w || null;
    if (Array.isArray(sp)) { spawn = sp.slice(); self.pos = sp.slice(); }
  }
  return {
    handle, tick, setWorld,
    getMode: () => modo,
    getSeq: () => seq,
    getPos: () => [self.pos[0], self.pos[1], self.pos[2]],
    getSelf: () => self,
    getPlayers: () => players,
  };
}

/* ============================================================================
 * Reconstrucción del mundo (misma que server.js:100-107): extrae el bloque
 * marcado `worldgen:start` … `worldgen:end` de index.html con `new Function`,
 * genera con la seed del `welcome` y aplica los `edits` (idx = (y*W+z)*W+x).
 * Incluye una réplica fiel de `findSpawn()` (index.html:1684) porque el
 * `welcome` NO trae spawn.
 * ========================================================================== */
const WG_START = '/* worldgen:start */', WG_END = '/* worldgen:end */';

function parseWorld(html) {
  if (typeof html !== 'string' || html.indexOf(WG_START) < 0 || html.indexOf(WG_END) < 0) {
    throw new Error('worldgen: marcadores ausentes en index.html');
  }
  const i = html.indexOf(WG_START), j = html.indexOf(WG_END);
  const WG = new Function(html.slice(i, j) +
    '\n;return {WG_W,WG_H,WG_SURFACE,WG_OX,WG_OZ,hAt,genWorld,mobBlocked,topSolidY,AIR,WATER};')();
  const W = WG.WG_W, H = WG.WG_H;
  const buf = new Uint8Array(W * H * W);

  const self = {
    W, H,
    WG,
    /** Regenera el buffer con la seed y aplica los edits del welcome (aditivo). */
    gen(seed, edits) {
      WG.genWorld(buf, seed);
      for (const e of (edits || [])) {
        if (!Array.isArray(e)) continue;
        const [idx, v] = e;
        if (Number.isInteger(idx) && idx >= 0 && idx < buf.length && Number.isInteger(v)) buf[idx] = v;
      }
      return self;
    },
    get(x, y, z) {
      if (x < 0 || x >= W || y < 0 || y >= H || z < 0 || z >= W) return null;
      return buf[(y * W + z) * W + x];
    },
    /** Sólido como lo ve el cliente (isSolid ≡ mobBlocked para ids válidos; ver nota abajo). */
    blocked(x, y, z) {
      if (y < 0) return true;                             // bajo el mundo: sólido
      if (x < 0 || x >= W || z < 0 || z >= W) return true; // afuera: pared
      if (y >= H) return false;                            // cielo: libre
      return WG.mobBlocked(buf[(y * W + z) * W + x]);
    },
    set(x, y, z, v) {
      if (x < 0 || x >= W || y < 0 || y >= H || z < 0 || z >= W) return;
      buf[(y * W + z) * W + x] = v;
    },
    topSolidY(x, z) { return WG.topSolidY(buf, x, z); },
    /**
     * Réplica de findSpawn() (index.html:1684): primer punto de tierra firme con
     * la columna despejada. Grilla de candidatos FIDA al cliente; el `collidesAt`
     * del cliente simplifica acá (a y = h+1.01 el salto de losas/escaleras es
     * inalcanzable) y `isSolid ≡ mobBlocked` para todo id de bloque válido.
     */
    findSpawn() {
      const sx = W / 2 | 0, sz = W / 2 | 0;
      for (let r = 0; r < 104; r++) for (let a = 0; a < 12; a++) {
        const x = Math.max(2, Math.min(W - 3, sx + Math.round(Math.cos(a / 12 * 6.28) * r)));
        const z = Math.max(2, Math.min(W - 3, sz + Math.round(Math.sin(a / 12 * 6.28) * r)));
        const h = WG.hAt(x - WG.WG_OX, z - WG.WG_OZ);
        if (h <= WG.WG_SURFACE + 1 || h >= H - 7) continue;
        let ok = true;
        for (let y = h + 1; y <= h + 4 && ok; y++) {
          const b = self.get(x, y, z);
          if (b !== WG.AIR && b !== WG.WATER) ok = false;
        }
        if (!ok) continue;
        if (self._collidesAt(x + .5, h + 1.01, z + .5, .3, 1.8)) continue;
        return [x + .5, h + 1.01, z + .5];
      }
      return [sx + .5, WG.hAt(sx - WG.WG_OX, sz - WG.WG_OZ) + 2, sz + .5];
    },
    _collidesAt(px, py, pz, r, hgt) {
      for (let x = Math.floor(px - r); x <= Math.floor(px + r); x++)
        for (let y = Math.floor(py); y <= Math.floor(py + hgt - .01); y++)
          for (let z = Math.floor(pz - r); z <= Math.floor(pz + r); z++) {
            if (self.blocked(x, y, z)) return true;
          }
      return false;
    },
  };
  return self;
}

module.exports = {
  createHunter, parseWorld, normPlayer,
  MAX_HP, SPEED, RANGE, DMG, HIT_GAP_MS, MV_MS, SWORD, DEFAULT_SPAWN, VOID_Y,
};
