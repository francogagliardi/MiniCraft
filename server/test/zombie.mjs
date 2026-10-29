// Tests del módulo puro de la horda zombi (change zombi). `server/zombie.js` no toca
// WebSocket ni Date.now(): recibe world/predicados/rng/now y devuelve intenciones,
// así que se testea determinista y sin levantar server. Los predicados del mundo se
// extraen del bloque worldgen real (cero drift).
// Uso: node test/zombie.mjs   (sale con código != 0 si algo falla)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const W = 208, H = 40;

// predicados del bloque worldgen real (mismo código que usa el server)
const wcode = html.slice(html.indexOf('/* worldgen:start */'), html.indexOf('/* worldgen:end */'));
const WG = new Function(wcode + '\n;return {WG_W,WG_H,WG_SURFACE,mobBlocked,topSolidY,freeForMob};')();
const preds = (buf) => ({
  mobBlocked: WG.mobBlocked,
  topSolidY: (x, z) => WG.topSolidY(buf, x, z),
  freeForMob: (x, y, z) => WG.freeForMob(buf, x, y, z),
});

// ---- mundo de prueba ----
const mkWorld = () => new Uint8Array(W * H * W);
const set = (b, x, y, z, v) => { if (x >= 0 && x < W && z >= 0 && z < W && y >= 0 && y < H) b[(y * W + z) * W + x] = v; };
const flat = (top = 12, block = 1) => { const b = mkWorld(); for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) for (let y = 0; y <= top; y++) set(b, x, y, z, block); return b; };
const seeded = (s) => { let a = s >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };

let Z = null;
try { Z = require('../zombie.js'); ok(true, 'módulo server/zombie.js cargado'); }
catch (e) { ok(false, 'módulo server/zombie.js cargado: ' + e.message); }
if (!Z) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }

const mkHorde = (buf = flat(12), rng = seeded(42), opts = {}) =>
  Z.createHorde({ world: buf, ...preds(buf), rng, W, H, surface: 10, ...opts });

// ============================ 3.1 constantes + API ============================
{
  ok(Z.ZOMBIE_HP === 6, `ZOMBIE_HP = 6 (${Z.ZOMBIE_HP})`);
  ok(Z.SWORD_DMG === 2, `SWORD_DMG = 2 (${Z.SWORD_DMG})`);
  ok(Z.SPEED < 4.8 && Z.SPEED / 4.8 > 0.45 && Z.SPEED / 4.8 < 0.55,
    `SPEED ≈ 50% del jugador (${Z.SPEED})`);
  ok(near(Z.SPEED, 2.4, 0.05), `SPEED ≈ 2.4 (${Z.SPEED})`);
  ok(near(Z.WANDER_SPEED, Z.SPEED / 2, 0.05), `WANDER_SPEED ≈ SPEED/2 (${Z.WANDER_SPEED})`);
  ok(Z.VIEW_DIST === 16, `VIEW_DIST = 16 (${Z.VIEW_DIST})`);
  ok(!('FOV_HALF' in Z), 'FOV_HALF eliminado (detección circular, sin ángulo)');
  ok(Z.ZOMBIE_DMG === 2, `ZOMBIE_DMG = 2 (${Z.ZOMBIE_DMG})`);
  ok(Z.ATTACK_RANGE === 1.2, `ATTACK_RANGE = 1.2 (${Z.ATTACK_RANGE})`);
  ok(Z.ATTACK_CD_MS === 1000, `ATTACK_CD_MS = 1000 (${Z.ATTACK_CD_MS})`);
  ok(Z.HIT_CD_MS > 0 && Z.HIT_CD_MS < Z.ATTACK_CD_MS, `HIT_CD_MS > 0 y < 1000 (${Z.HIT_CD_MS})`);
  ok(Z.DEATH_HOLD_MS === 2000, `DEATH_HOLD_MS = 2000 (${Z.DEATH_HOLD_MS})`);
  ok(Z.SPAWN_MIN === 18 && Z.SPAWN_MAX === 32, `SPAWN_MIN/MAX = 18/32 (${Z.SPAWN_MIN}/${Z.SPAWN_MAX})`);
  ok(typeof Z.createHorde === 'function', 'API createHorde presente');
  const h = mkHorde();
  ok(typeof h.tick === 'function' && typeof h.spawnWave === 'function' && typeof h.hit === 'function' && Array.isArray(h.zombies),
    'la horda expone tick/spawnWave/hit/zombies');
}

// ============================ 3.3–3.5 spawnWave ============================
{
  const players = [{ id: 7, pos: [100.5, 13, 100.5], dead: 0 }];
  const day = mkHorde(); day.zombies.length = 0;
  ok(day.spawnWave(players, 100000, false) === 0, 'spawnWave de día = 0');
  const alone = mkHorde();
  ok(alone.spawnWave([], 100000, true) === 0, 'spawnWave sin jugadores = 0');
  const noche = mkHorde(flat(12), seeded(1));
  const n = noche.spawnWave(players, 100000, true);
  ok(n >= 3 && n <= 4, `spawnWave de noche con terreno: 3-4 (${n})`);
  ok(noche.zombies.length === n, `los zombis quedan registrados (${noche.zombies.length})`);
  let boundsOk = noche.zombies.every(z => z.x > 0 && z.x < W - 1 && z.z > 0 && z.z < W - 1);
  ok(boundsOk, 'spawn dentro del mundo');
  let surfaceOk = noche.zombies.every(z => z.y >= 11 && z.y <= H);
  ok(surfaceOk, 'spawn sobre superficie por encima del agua (y >= 11)');
  // a second call the same night must not spawn again
  ok(noche.spawnWave(players, 100000 + 10, true) === 0, 'una sola pasada por noche (sin re-spawn)');

  // superficie bajo el agua (ground en y=5) → rechazado
  const under = mkHorde(flat(5));
  ok(under.spawnWave(players, 100000, true) === 0, 'superficie bajo el agua rechazada (top < 11)');
  // sin espacio para el cuerpo (columna tapada hasta el techo del mundo) → rechazado
  const roofed = flat(12); for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) set(roofed, x, 39, z, 3);
  ok(mkHorde(roofed).spawnWave(players, 100000, true) === 0, 'cuerpo sin espacio (tapado hasta el techo) rechazado');
  // determinismo del spawn con RNG sembrado
  const a = mkHorde(flat(12), seeded(7)); const b = mkHorde(flat(12), seeded(7));
  const na = a.spawnWave(players, 100000, true), nb = b.spawnWave(players, 100000, true);
  const same = na === nb && a.zombies.every((z, k) => near(z.x, b.zombies[k].x) && near(z.z, b.zombies[k].z) && near(z.y, b.zombies[k].y));
  ok(same, 'spawnWave determinista con RNG sembrado (mismas posiciones)');
  // jugador pegado a la esquina: clamp, sin crash
  const corner = mkHorde(flat(12), seeded(3));
  const nc = corner.spawnWave([{ id: 1, pos: [1, 13, 1], dead: 0 }], 100000, true);
  ok(nc >= 0 && corner.zombies.every(z => z.x >= 0 && z.x <= W && z.z >= 0 && z.z <= W), 'candidato fuera del mundo clampado');
}

// ============================ 3.6–3.10 detección circular ============================
const addZ = (h, over = {}) => { h.zombies.push({ i: (over.i || 100), x: 50.5, y: 13, z: 50.5, yaw: 0, hp: 6, dead: 0, deadAt: 0, atk: 0, target: null, lastAtk: -1e9, wander: { tx: null, tz: null, waitUntil: 0 }, ...over }); return h.zombies[h.zombies.length - 1]; };
const P = (id, x, y, z, dead = 0) => ({ id, pos: [x, y, z], dead });

{
  // zombi en (50.5,50.5) mirando +Z (yaw=0): la detección es CIRCULAR, sin ángulo.
  const h = mkHorde(); const z = addZ(h);
  h.tick(0.05, { night: false, now: 0, players: [P(7, 50.5, 13, 50.5 + Z.VIEW_DIST - 1)] });
  ok(z.target === 7, `adquiere al jugador dentro del radio (target ${z.target})`);
  // por DETRÁS del zombi (ángulo ≈ π): dentro del radio igual se adquiere
  const hb = mkHorde(); const zb = addZ(hb);
  hb.tick(0.05, { night: false, now: 0, players: [P(7, 50.5, 13, 44.5)] });
  ok(zb.target === 7, 'detecta al jugador que se acerca por detrás (sin ángulo)');
  // fuera de distancia
  const h2 = mkHorde(); const z2 = addZ(h2);
  h2.tick(0.05, { night: false, now: 0, players: [P(7, 50.5, 13, 50.5 + Z.VIEW_DIST + 2)] });
  ok(z2.target === null, 'no adquiere fuera del radio (VIEW_DIST + 2)');
  // dos dentro del radio → menor id (desempate determinista)
  const h4 = mkHorde(); const z4 = addZ(h4);
  h4.tick(0.05, { night: false, now: 0, players: [P(9, 50.5, 13, 55.5), P(3, 51.5, 13, 55.5)] });
  ok(z4.target === 3, `con dos en el radio gana el menor id (${z4.target})`);
  // borde exacto del radio (dentro vs apenas fuera)
  const hv = mkHorde(); const zv = addZ(hv);
  hv.tick(0.05, { night: false, now: 0, players: [P(1, 50.5, 13, 50.5 + Z.VIEW_DIST - 1e-6)] });
  ok(zv.target === 1, 'adquiere en el borde de VIEW_DIST (VIEW_DIST − ε)');
  const hv2 = mkHorde(); const zv2 = addZ(hv2);
  hv2.tick(0.05, { night: false, now: 0, players: [P(1, 50.5, 13, 50.5 + Z.VIEW_DIST + 1e-3)] });
  ok(zv2.target === null, 'no adquiere apenas fuera de VIEW_DIST (VIEW_DIST + 1e-3)');
  // jugador muerto nunca adquirido
  const hm = mkHorde(); const zm = addZ(hm);
  hm.tick(0.05, { night: false, now: 0, players: [P(1, 50.5, 13, 55.5, 1)] });
  ok(zm.target === null, 'jugador muerto nunca adquirido');
  // mantiene el objetivo aunque haya una pared en el medio (sin LOS)
  const wall = flat(12); for (let y = 13; y <= 14; y++) for (let x = 48; x <= 53; x++) set(wall, x, y, 53, 3);
  const hw = mkHorde(wall); const zw = addZ(hw);
  hw.tick(0.05, { night: false, now: 0, players: [P(1, 50.5, 13, 56.5)] });
  ok(zw.target === 1, 'mantiene el objetivo detrás de una pared (sin chequeo de línea de vista)');
}

// ============================ 3.8–3.9 pérdida de objetivo y deambulación ============================
{
  const h = mkHorde(); const z = addZ(h);
  h.tick(0.05, { night: false, now: 0, players: [P(7, 50.5, 13, 56.5)] });
  ok(z.target === 7, 'adquirido');
  h.tick(0.05, { night: false, now: 50, players: [P(7, 50.5, 13, 56.5, 1)] }); // muere
  ok(z.target === null, 'pierde el objetivo si el jugador muere → deambula');
  h.tick(0.05, { night: false, now: 100, players: [P(7, 50.5, 13, 56.5, 0)] }); // revive y reaparece
  ok(z.target === 7, 'vuelve a adquirirlo si reaparece en visión');
  // desconexión
  h.tick(0.05, { night: false, now: 150, players: [] });
  ok(z.target === null, 'pierde el objetivo si el jugador se desconecta');
  // sale del campo de visión
  h.tick(0.05, { night: false, now: 200, players: [P(7, 50.5, 13, 56.5)] });
  h.tick(0.05, { night: false, now: 250, players: [P(7, 150.5, 13, 150.5)] });
  ok(z.target === null, 'pierde el objetivo si sale de la visión → deambula');
  // deambula: destino ±16 clampeado y velocidad < persecución
  ok(Number.isFinite(z.wander.tx) || z.wander.tx === null, 'estado de deambulación presente');
  const hw = mkHorde(); const zw = addZ(hw, { x: 100.5, z: 100.5 });
  hw.tick(0.05, { night: false, now: 0, players: [] });
  const before = { x: zw.x, z: zw.z };
  for (let k = 0; k < 40; k++) hw.tick(0.05, { night: false, now: 500 * k, players: [] });
  const moved = Math.hypot(zw.x - before.x, zw.z - before.z);
  ok(moved > 0, `deambula (se movió ${moved.toFixed(2)} bloques)`);
  ok(moved < Z.SPEED * 40 * 0.05 + 1e-6, 'la deambulación va más lento que la persecución');
  ok(zw.wander.tx === null || (zw.wander.tx >= 0 && zw.wander.tx <= W), 'destino de deambulación clampeado al mundo');
}

// ============================ 4.1–4.5 movimiento, colisión, auto-escalón ============================
{
  // pared entre el zombi y el jugador → no la atraviesa
  const buf = flat(12); for (let y = 13; y <= 14; y++) for (let x = 48; x <= 53; x++) set(buf, x, y, 53, 3);
  const h = mkHorde(buf); const z = addZ(h);
  const players = [P(1, 50.5, 13, 60.5)];
  for (let k = 0; k < 200; k++) h.tick(0.05, { night: false, now: k * 50, players });
  ok(z.z < 53, `no atraviesa la pared (z=${z.z.toFixed(2)})`);
  ok(z.z > 51, `queda pegado empujando contra la pared (z=${z.z.toFixed(2)})`);
  ok(Math.abs(z.yaw) < 0.25, `mira hacia el objetivo (+Z, yaw=${z.yaw.toFixed(3)})`);
  // velocidad en persecución ≈ SPEED
  const h2 = mkHorde(); const z2 = addZ(h2, { x: 50.5, z: 50.5 });
  const z0 = z2.z;
  h2.tick(0.1, { night: false, now: 0, players: [P(1, 50.5, 13, 60.5)] });
  ok(near(z2.z - z0, Z.SPEED * 0.1, 0.02), `avanza SPEED*dt por tick (${(z2.z - z0).toFixed(3)})`);

  // deslizamiento: diagonal bloqueada pero un eje libre (dt=0.2 para conservar el
  // desplazamiento por paso de la configuración espacial con SPEED=2.4)
  const slide = flat(12); set(slide, 51, 13, 51, 3); set(slide, 51, 14, 51, 3); // esquina diagonal ocupada
  const hs = mkHorde(slide); const zs = addZ(hs, { x: 50.5, z: 50.5 });
  hs.tick(0.2, { night: false, now: 0, players: [P(1, 60.5, 13, 60.5)] });
  ok(zs.x > 50.5 + 1e-3 && near(zs.z, 50.5, 0.02), `desliza por el eje libre (x=${zs.x.toFixed(3)}, z=${zs.z.toFixed(3)})`);

  // ambos ejes bloqueados → no se mueve
  const box = flat(12); // rodea al zombi con paredes en +X y +Z
  for (let y = 13; y <= 14; y++) { set(box, 51, y, 50, 3); set(box, 51, y, 51, 3); set(box, 50, y, 51, 3); }
  const hb = mkHorde(box); const zb = addZ(hb, { x: 50.5, z: 50.5 });
  hb.tick(0.2, { night: false, now: 0, players: [P(1, 60.5, 13, 60.5)] });
  ok(near(zb.x, 50.5, 1e-6) && near(zb.z, 50.5, 1e-6), 'ambos ejes bloqueados → no se mueve');

  // auto-escalón: sube 1 bloque, no 2 (yaw π/2 = mira a +X, jugador al frente)
  const step1 = flat(12); set(step1, 51, 13, 50, 1); // peldaño de 1
  const h1 = mkHorde(step1); const z1 = addZ(h1, { x: 50.5, z: 50.5, yaw: Math.PI / 2 });
  h1.tick(0.1, { night: false, now: 0, players: [P(1, 60.5, 13, 50.5)] });
  ok(z1.x > 50.5 && near(z1.y, 14, 1e-6), `auto-escalón de 1 bloque sube (y=${z1.y})`);
  const step2 = flat(12); set(step2, 51, 13, 50, 1); set(step2, 51, 14, 50, 1); // pared de 2
  const h2b = mkHorde(step2); const z2b = addZ(h2b, { x: 50.5, z: 50.5, yaw: Math.PI / 2 });
  for (let k = 0; k < 20; k++) h2b.tick(0.1, { night: false, now: k * 100, players: [P(1, 60.5, 13, 50.5)] });
  ok(z2b.x < 51, `no sube 2 bloques (x=${z2b.x.toFixed(3)})`);

  // caída sigue el terreno, nunca dentro de un sólido
  const hf = mkHorde(); const zf = addZ(hf, { x: 50.5, y: 16, z: 50.5 });
  for (let k = 0; k < 60; k++) hf.tick(0.05, { night: false, now: k * 50, players: [P(1, 50.5, 13, 60.5)] });
  ok(near(zf.y, 13, 1e-6), `cae hasta el suelo y no lo atraviesa (y=${zf.y})`);

  // el agua no bloquea
  const water = flat(12); for (let y = 13; y <= 14; y++) for (let x = 48; x <= 53; x++) set(water, x, y, 51, 12);
  const hwt = mkHorde(water); const zwt = addZ(hwt, { x: 50.5, z: 50.5 });
  for (let k = 0; k < 40; k++) hwt.tick(0.05, { night: false, now: k * 50, players: [P(1, 50.5, 13, 60.5)] });
  ok(zwt.z > 50.5, `camina a través del agua (z=${zwt.z.toFixed(2)})`);
  ok(near(zwt.y, 13, 1e-6), 'no se hunde por el agua (el agua no es suelo)');
}

// ============================ 4.6–4.7 ataque ============================
{
  const h = mkHorde(); const z = addZ(h, { x: 50.5, z: 50.5 });
  const r1 = h.tick(0.05, { night: false, now: 100000, players: [P(7, 50.5, 13, 51.2)] });
  const ev = r1.events.find(e => e.t === 'phit');
  ok(!!ev && ev.to === 7 && ev.from === 'Zombi' && ev.dmg === Z.ZOMBIE_DMG && ev.dmg === 2,
    `emite phit al alcance con dmg === ZOMBIE_DMG (2) (${JSON.stringify(ev)})`);
  ok(!!ev && near(Math.hypot(ev.dx, ev.dz), 1, 1e-6) && ev.dz > 0, 'empuje normalizado zombi→jugador (dz>0)');
  // 11.1 el snapshot trae un contador `atk` por zombi: arranca en 0 y sube 1 por golpe
  {
    const ha = mkHorde(); addZ(ha, { i: 11, x: 50.5, z: 50.5 });
    // jugador en el radio pero fuera de ATTACK_RANGE → sin golpe → atk 0
    const s0 = ha.tick(0.05, { night: false, now: 200000, players: [P(7, 50.5, 13, 55.5)] });
    const e0 = s0.zs.find(e => e.i === 11);
    ok(!!e0 && e0.atk === 0, `zs trae atk por zombi y arranca en 0 (${e0 && e0.atk})`);
    const s1 = ha.tick(0.05, { night: false, now: 200100, players: [P(7, 50.5, 13, 55.5)] });
    ok(s1.zs.find(e => e.i === 11).atk === 0, 'atk permanece igual entre golpes (sin golpe nuevo)');
    const s2 = ha.tick(0.05, { night: false, now: 201100, players: [P(7, 50.5, 13, 51.2)] });
    ok(s2.events.some(e => e.t === 'phit'), 'emite el phit en el mismo tick que sube atk');
    ok(s2.zs.find(e => e.i === 11).atk === 1, `atk sube 1 por cada golpe (${s2.zs.find(e => e.i === 11).atk})`);
    const s3 = ha.tick(0.05, { night: false, now: 202000, players: [P(7, 50.5, 13, 51.2)] });
    ok(s3.zs.find(e => e.i === 11).atk === 1, 'atk no vuelve a subir antes de ATTACK_CD_MS');
  }
  // 11.3 (triangulación) el atk solo cambia al golpear: no cambia al perder/re-adquirir
  // el objetivo ni al moverse; el muerto conserva su último atk durante la ventana
  {
    const ht = mkHorde(); addZ(ht, { i: 12, x: 50.5, z: 50.5 });
    ht.tick(0.05, { night: false, now: 300000, players: [P(7, 50.5, 13, 51.2)] }); // golpea → atk 1
    ok(ht.zombies.find(z => z.i === 12).atk === 1, 'atk = 1 tras el primer golpe');
    for (let k = 1; k <= 5; k++) ht.tick(0.05, { night: false, now: 300000 + k * 2000, players: [] });
    ok(ht.zombies.find(z => z.i === 12).atk === 1, 'atk no cambia al perder el objetivo ni al moverse');
    ht.tick(0.05, { night: false, now: 320000, players: [P(7, 50.5, 13, 55.5)] }); // re-adquiere sin golpear
    const zt = ht.zombies.find(z => z.i === 12);
    ok(zt.target === 7 && zt.atk === 1, 'atk no cambia al re-adquirir el objetivo sin golpear');
    zt.hp = 0; zt.dead = 1; zt.deadAt = 322000; // muere
    const sDead = ht.tick(0.05, { night: false, now: 323000, players: [] });
    const ed = sDead.zs.find(e => e.i === 12);
    ok(!!ed && ed.dead === 1 && ed.atk === 1, 'el muerto conserva su último atk durante la ventana');
    const sGone = ht.tick(0.05, { night: false, now: 322000 + Z.DEATH_HOLD_MS + 1, players: [] });
    ok(!sGone.zs.some(e => e.i === 12), 'el muerto desaparece del zs con su último atk');
  }
  // adquirido pero fuera de rango → sin evento
  const h2 = mkHorde(); const z2 = addZ(h2, { x: 50.5, z: 50.5 });
  const r2 = h2.tick(0.05, { night: false, now: 100000, players: [P(7, 50.5, 13, 55.5)] });
  ok(z2.target === 7 && !r2.events.some(e => e.t === 'phit'), 'adquirido pero no golpea fuera de ATTACK_RANGE');
  // cadencia: no dos antes de 1 s
  const r3a = h.tick(0.05, { night: false, now: 100500, players: [P(7, 50.5, 13, 51.2)] });
  const r3b = h.tick(0.05, { night: false, now: 101000, players: [P(7, 50.5, 13, 51.2)] });
  ok(!r3a.events.some(e => e.t === 'phit'), 'no re-golpea antes de ATTACK_CD_MS');
  ok(r3b.events.some(e => e.t === 'phit'), 'vuelve a golpear tras ATTACK_CD_MS');
  // triangulación (borde): cada golpe vale ZOMBIE_DMG (2) y el siguiente no llega
  // antes de ATTACK_CD_MS, pero sí al cumplirse
  const e1 = h.tick(0.05, { night: false, now: 102100, players: [P(7, 50.5, 13, 51.2)] }).events.find(e => e.t === 'phit');
  const e2 = h.tick(0.05, { night: false, now: 102600, players: [P(7, 50.5, 13, 51.2)] }).events.find(e => e.t === 'phit');
  const e3 = h.tick(0.05, { night: false, now: 103100, players: [P(7, 50.5, 13, 51.2)] }).events.find(e => e.t === 'phit');
  ok(!!e1 && e1.dmg === 2 && !e2, 'golpe al borde: vale 2 y no re-golpea antes de ATTACK_CD_MS');
  ok(!!e3 && e3.dmg === Z.ZOMBIE_DMG, 'el siguiente golpe (tras ATTACK_CD_MS) también vale ZOMBIE_DMG');
}

// ============================ 4.8–4.9 hit() ============================
{
  const h = mkHorde(); const z = addZ(h, { i: 5, x: 50.5, z: 50.5 });
  const pos = [51.2, 13, 50.5];
  ok(h.hit(1, 999, 0, pos) === null, 'hit a un zombi inexistente → null');
  ok(h.hit(1, 5, 0, [70.5, 13, 70.5]) === null && z.hp === 6, 'hit fuera de alcance → rechazado sin daño');
  const a = h.hit(1, 5, 1000, pos);
  ok(a && a.hp === 4 && a.dead === 0, `primer golpe: 6→4 (${a && a.hp})`);
  ok(h.hit(1, 5, 1100, pos) === null, 'spam dentro de HIT_CD_MS → descartado');
  const b = h.hit(1, 5, 1600, pos);
  ok(b && b.hp === 2, `segundo golpe: 4→2 (${b && b.hp})`);
  const c = h.hit(1, 5, 2200, pos);
  ok(c && c.hp === 0 && c.dead === 1, `tercer golpe mata: 2→0 (${c && c.hp})`);
  ok(h.hit(1, 5, 3000, pos) === null, 'hit a un zombi ya muerto → null (no cambia nada)');
}

// ============================ 4.9b alcance por aspecto ============================
{
  // A 8 bloques exactos: el gigante (4.6 × 2.538 ≈ 11.675) llega y el humano (4.6) no.
  const hg = mkHorde(); const zg = addZ(hg, { i: 21 });
  const rg = hg.hit(31, 21, 1000, [58.5, 13, 50.5], 'giant');
  ok(rg && rg.hp === 4, `giant a 8 bloques: el golpe entra (${rg && rg.hp})`);

  const hh = mkHorde(); const zh = addZ(hh, { i: 22 });
  ok(hh.hit(32, 22, 1000, [58.5, 13, 50.5], 'human') === null && zh.hp === 6,
    'human a 8 bloques: el servidor rechaza el golpe sin daño');

  const hs = mkHorde(); const zs = addZ(hs, { i: 23 });
  ok(hs.hit(33, 23, 1000, [58.5, 13, 50.5], 'small') === null && zs.hp === 6,
    'small a 8 bloques: también queda fuera de su alcance ≈ 2.102');

  // Sin quinto parámetro se conserva human: acepta a 4.0 y rechaza a 5.0.
  const hd = mkHorde(); addZ(hd, { i: 24 });
  ok(hd.hit(34, 24, 1000, [54.5, 13, 50.5]) !== null,
    'hit sin skin ⇒ human: a 4.0 bloques entra');
  const hf = mkHorde(); const zf = addZ(hf, { i: 25 });
  ok(hf.hit(35, 25, 1000, [55.5, 13, 50.5]) === null && zf.hp === 6,
    'hit sin skin ⇒ human: a 5.0 bloques se rechaza');
}

// ============================ 4.10–4.12 muerte y despawn ============================
{
  // muerte por golpe: sigue en zs con dead:1 durante la ventana y luego desaparece
  const h = mkHorde(); const z = addZ(h, { i: 9, x: 50.5, z: 50.5 });
  const pos = [51.2, 13, 50.5];
  h.hit(1, 9, 1000, pos); h.hit(1, 9, 1600, pos); h.hit(1, 9, 2200, pos);
  ok(z.dead === 1, 'el zombi queda muerto tras 3 golpes');
  const s0 = h.tick(0.05, { night: false, now: 3000, players: [] });
  ok(s0.zs.some(e => e.i === 9 && e.dead === 1), 'el muerto sigue en zs con dead:1');
  const s1 = h.tick(0.05, { night: false, now: 4199, players: [] });
  ok(s1.zs.some(e => e.i === 9), 'dentro de DEATH_HOLD_MS sigue difundido');
  const s2 = h.tick(0.05, { night: false, now: 4200, players: [] });
  ok(!s2.zs.some(e => e.i === 9), 'pasada la ventana desaparece del zs');
  // el muerto no se mueve ni ataca
  const hz = mkHorde(); const zz = addZ(hz, { i: 2, x: 50.5, z: 50.5, dead: 1, deadAt: 0 });
  const before = { x: zz.x, z: zz.z };
  const rr = hz.tick(0.05, { night: false, now: 100, players: [P(1, 51.2, 13, 50.5)] });
  ok(near(zz.x, before.x) && near(zz.z, before.z) && !rr.events.some(e => e.t === 'phit'),
    'el zombi muerto no se mueve ni ataca');

  // amanecer: todos pasan a muriendo y desaparecen
  const hd = mkHorde(flat(12), seeded(1));
  hd.tick(0.05, { night: true, now: 0, players: [P(1, 100.5, 13, 100.5)] });
  ok(hd.zombies.length >= 3, 'de noche spawnea la horda');
  hd.tick(0.05, { night: false, now: 1000, players: [P(1, 100.5, 13, 100.5)] });
  ok(hd.zombies.every(z => z.dead === 1), 'al amanecer todos pasan a muriendo');
  hd.tick(0.05, { night: false, now: 1000 + Z.DEATH_HOLD_MS + 1, players: [P(1, 100.5, 13, 100.5)] });
  ok(hd.zombies.length === 0, 'al amanecer despawnan tras la ventana (sin haber sido golpeados)');

  // no hay spawn nuevo la misma noche tras limpiar la horda
  const hk = mkHorde(flat(12), seeded(5));
  hk.tick(0.05, { night: true, now: 0, players: [P(1, 100.5, 13, 100.5)] });
  const total = hk.zombies.length;
  for (let k = 0; k < hk.zombies.length; k++) hk.hit(1, hk.zombies[k].i, 10000 + k * 600, [100.5, 13, 100.5]);
  hk.zombies.forEach(z => { if (!z.dead) { z.dead = 1; z.deadAt = 20000; } });
  hk.tick(0.05, { night: true, now: 30000, players: [P(1, 100.5, 13, 100.5)] });
  ok(hk.zombies.filter(z => !z.dead).length === 0, 'no spawnea de nuevo la misma noche tras limpiar la horda');
  ok(total >= 3, 'la horda inicial tenía 3-4');
}

// ============================ 5.x cableado del servidor ============================
// Estáticos: el server crea la horda, la tickea con dt real y cablea los eventos a
// los `ws`; conserva el patrón del ciclo que exige static.mjs y no persiste zombis.
{
  const srv = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
  ok(/require\(\s*'\.\/zombie\.js'\s*\)/.test(srv), 'server requiere ./zombie.js');
  ok(/\.createHorde\s*\(/.test(srv), 'server crea la horda con createHorde');
  ok(/ZOMBIE_TICK_MS/.test(srv) && /ZOMBIE_SNAP_MS/.test(srv), 'server: knobs ZOMBIE_TICK_MS / ZOMBIE_SNAP_MS');
  ok(/ZOMBIE_FORCE_NIGHT/.test(srv), 'server: atajo SOLO de test ZOMBIE_FORCE_NIGHT');
  ok(/phaseNow\(\)\s*>=\s*NIGHT_START/.test(srv), 'server conserva isNight() = phaseNow() >= NIGHT_START (static.mjs §8d)');
  ok(/,\s*ZOMBIE_TICK_MS\s*\)/.test(srv), 'server corre el tick en un setInterval(…, ZOMBIE_TICK_MS)');
  ok(/horde\.tick\s*\(/.test(srv), 'server llama horde.tick(...)');
  ok(/Math\.min\(\s*0\.1/.test(srv), 'server clampa dt a 0.1 s (stall)');
  ok(/t:\s*'phit'/.test(srv) && /send\(/.test(srv), 'server cablea los eventos de tick a send(ws, …)');
  ok(/t:\s*'zs'/.test(srv) && /z:\s*zLast/.test(srv), "server difunde { t:'zs', z:[…] }");
  ok(/if\s*\(\s*zLast\.length === 0 && zSnapN === 0\s*\)\s*return;/.test(srv),
    'zs no se emite en vacío salvo cuando cambió la cantidad');
  ok(/zom:\s*horde\.zombies\.map\(/.test(srv), 'welcome lleva zom como array (nunca undefined)');
  ok(/m\.t === 'zhit'/.test(srv) && /horde\.hit\s*\(/.test(srv), "server maneja { t:'zhit', id } → horde.hit");
  ok(/Number\.isInteger\(id\)/.test(srv), 'zhit con id no numérico no rompe el server');
  ok(/t:\s*'zhitok'/.test(srv) && /send\(ws,\s*\{[^}]*zhitok/.test(srv), 'server responde zhitok SOLO al atacante');
  ok(!/zombie|horda|zombis/i.test((srv.match(/function save\(\)\s*\{[\s\S]*?\n\}/) || [''])[0]),
    'save() no persiste zombis (world.json sigue {seed, edits})');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 zombie (módulo puro) OK');
