// Tests unitarios de comportamientos y movimiento puro de bots (change
// panel-bots-custom, capability bots/runtime): registro extensible, cazador,
// merodeador, vuelo libre y caminata con colisión/gravedad.
// Uso: node test/bots-behaviors.mjs
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const B = require('../bot-behaviors.js');

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};
const hypot = (a, b) => Math.sqrt(a * a + b * b);

// ---------------------------------------------------------------------------
// Mundo sintético inyectado
// ---------------------------------------------------------------------------
const flat = () => ({
  W: 64, H: 40,
  topSolidY: () => 30,
  freeForMob: () => true,
});
const solid = () => ({
  W: 64, H: 40,
  topSolidY: () => 30,
  freeForMob: () => false,
});
// Pared de 4 bloques en la columna z = 20 (de y 30 a 33).
const wall = () => ({
  W: 64, H: 40,
  topSolidY: (x, z) => (z === 20 ? 34 : 30),
  freeForMob: (x, y, z) => !(z === 20 && y >= 30 && y < 34),
});
// Escalón de 1 bloque desde z >= 20.
const step = () => ({
  W: 64, H: 40,
  topSolidY: (x, z) => (z >= 20 ? 31 : 30),
  freeForMob: () => true,
});
// Bosque denso: 2 de cada 3 columnas tienen un árbol de 4 bloques (30..33). La
// copa queda "libre" en y=34, pero un caminante no puede subir 4 bloques: por eso
// el destino tiene que validarse contra el suelo alcanzable, no solo contra el aire.
const forest = (every = 3) => {
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
// PRNG reproducible: los casos de deambular no dependen de Math.random.
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const freshWander = () => ({ tx: null, tz: null, waitUntil: 0, deadline: 0 });

// ---------------------------------------------------------------------------
// 1. registro extensible
// ---------------------------------------------------------------------------
{
  const list = B.listBehaviors();
  const ids = list.map(b => b.id);
  ok(ids.includes('cazador') && ids.includes('merodeador'), 'el registro trae cazador y merodeador');
  ok(ids.includes('guardian') && ids.includes('neutral'), 'el registro trae guardián y neutral');
  ok(list.every(b => typeof b.label === 'string' && typeof b.hostile === 'boolean'),
    'cada comportamiento expone etiqueta y hostilidad');
  ok(list.every(b => typeof b.attacksPlayers === 'boolean' && typeof b.attacksEnemies === 'boolean'),
    'cada comportamiento declara si ataca jugadores y criaturas');
  ok(list.find(b => b.id === 'cazador').hostile === true, 'cazador es hostil');
  ok(list.find(b => b.id === 'cazador').attacksPlayers === true &&
    list.find(b => b.id === 'cazador').attacksEnemies === false, 'cazador ataca jugadores y no criaturas');
  ok(list.find(b => b.id === 'merodeador').hostile === false &&
    list.find(b => b.id === 'merodeador').attacksPlayers === false, 'merodeador es pacífico');
  const gMeta = list.find(b => b.id === 'guardian') || {};
  const nMeta = list.find(b => b.id === 'neutral') || {};
  ok(gMeta.label === 'Guardián' && gMeta.attacksPlayers === false && gMeta.attacksEnemies === true,
    'guardián pelea contra criaturas y nunca contra jugadores');
  ok(nMeta.label === 'Neutral' && nMeta.attacksPlayers === false && nMeta.attacksEnemies === false,
    'neutral no ataca por iniciativa propia (solo en retaliación)');
  ok(typeof B.getBehavior('cazador').decide === 'function', 'getBehavior devuelve la función decide');
  ok(B.getBehavior('fantasma') === null, 'getBehavior de un id inexistente devuelve null');

  let dup = null;
  try {
    B.registerBehavior({ id: 'cazador', label: 'Otro', hostile: false, decide: () => null });
  } catch (e) { dup = e; }
  ok(!!dup, 'registrar un id duplicado lanza error');

  let missing = null;
  try { B.registerBehavior({ id: 'incompleto' }); } catch (e) { missing = e; }
  ok(!!missing, 'registrar un comportamiento sin campos obligatorios lanza error');

  const testBehavior = {
    id: 'prueba', label: 'Prueba', hostile: false,
    decide: () => ({ stop: true, attackTargetId: null }),
  };
  B.registerBehavior(testBehavior);
  ok(B.listBehaviors().some(b => b.id === 'prueba'), 'un comportamiento registrado aparece en el catálogo');
  ok(B.getBehavior('prueba').decide() && B.getBehavior('prueba').decide().stop === true,
    'el comportamiento registrado se puede decidir sin tocar el runtime');
  ok(B.getBehavior('prueba').attacksPlayers === false && B.getBehavior('prueba').attacksEnemies === false,
    'la metadata de ataque tiene defaults seguros (no ataca)');

  let badMeta = null;
  try {
    B.registerBehavior({ id: 'meta-mala', label: 'Mala', hostile: true, attacksPlayers: 'si', decide: () => null });
  } catch (e) { badMeta = e; }
  ok(!!badMeta, 'registerBehavior rechaza una metadata de ataque no booleana');
}

// ---------------------------------------------------------------------------
// 2. cazador: selección de presas y contrato declarativo
// ---------------------------------------------------------------------------
{
  const cazador = B.getBehavior('cazador');
  const self = { pos: [10.5, 30, 10.5], yaw: 0 };
  const home = [10.5, 30, 10.5];
  const base = { self, home, now: 1000, rng: () => 0.5, dt: 0.05, world: flat() };
  const at = (id, pos, extra = {}) => ({
    id, name: 'p' + id, pos, dead: 0, mode: 'player', admin: false, bot: false, ...extra,
  });

  const admin = at(1, [11, 30, 10.5], { admin: true, mode: 'admin' });
  const dead = at(2, [11.5, 30, 10.5], { dead: 1 });
  const ignored = at(3, [11.2, 30, 10.5], { botIgnore: true });
  const bot = at(4, [11.1, 30, 10.5], { bot: true });
  const prey = at(5, [16, 30, 10.5]);

  const out = cazador.decide({ ...base, players: [admin, dead, ignored, bot, prey] });
  ok(out && out.attackTargetId === 5, 'elige al jugador válido más cercano e ignora admin/muerto/protegido/bot');
  ok(out.moveTo && hypot(out.moveTo[0] - 16, out.moveTo[2] - 10.5) < 1e-9,
    'declara moverse hacia la presa');
  ok(!('dmg' in out) && !('damage' in out) && !('reach' in out) && !('flying' in out),
    'decide no emite daño ni conoce damage/reach/flying');

  const onlyAdmin = cazador.decide({ ...base, players: [admin] });
  ok(onlyAdmin && onlyAdmin.attackTargetId == null, 'con solo un admin pegado no declara ataque');
  const onlyDead = cazador.decide({ ...base, players: [dead] });
  ok(onlyDead && onlyDead.attackTargetId == null, 'con el único no-admin muerto no declara ataque');
  const onlyIgnored = cazador.decide({ ...base, players: [ignored] });
  ok(onlyIgnored && onlyIgnored.attackTargetId == null, 'con bot_ignore no declara ataque');
  const onlyBot = cazador.decide({ ...base, players: [bot] });
  ok(onlyBot && onlyBot.attackTargetId == null, 'no ataca a otro bot');

  const close = cazador.decide({ ...base, players: [at(6, [10.8, 30, 10.5])] });
  ok(close && close.stop === true, 'dentro del umbral de persecución se detiene a golpear');

  const noPrey = cazador.decide({ ...base, players: [] });
  ok(noPrey && noPrey.attackTargetId == null && noPrey.stop === true,
    'sin presas y en el origen se queda quieto');

  const far = { ...base, self: { pos: [30.5, 30, 30.5], yaw: 0 } };
  const back = cazador.decide({ ...far, players: [] });
  ok(back && Array.isArray(back.moveTo) && back.moveTo[0] === home[0] && back.moveTo[2] === home[2],
    'sin presas vuelve a su punto de origen');

  const src = String(cazador.decide);
  ok(!/\bdamage\b|\breach\b|\bflying\b/.test(src), 'el código del cazador no conoce damage/reach/flying');
}

// ---------------------------------------------------------------------------
// 3. merodeador: deambula, nunca ataca
// ---------------------------------------------------------------------------
{
  const mer = B.getBehavior('merodeador');
  const self = { pos: [32.5, 30, 32.5], yaw: 0, wander: { tx: null, tz: null, waitUntil: 0 } };
  const home = [32.5, 30, 32.5];
  const world = flat();
  let t = 1000;
  const rng = () => 0.42;
  let attacks = 0;
  let maxR = 0;
  for (let i = 0; i < 50; i++) {
    t += 500;
    const out = mer.decide({
      self, home, world, now: t, rng, dt: 0.05,
      players: [{ id: 1, name: 'p', pos: [33, 30, 32.5], dead: 0, mode: 'player', admin: false, bot: false }],
    });
    if (out && out.attackTargetId != null) attacks++;
    if (self.wander.tx !== null) {
      maxR = Math.max(maxR, hypot(self.wander.tx - home[0], self.wander.tz - home[2]));
    }
  }
  ok(attacks === 0, 'el merodeador nunca declara ataque aunque haya un jugador al lado');
  ok(maxR >= 6 && maxR <= 24.0001,
    `el merodeador deambula en un radio amplio alrededor de su origen (6–24; radio ${maxR.toFixed(2)})`);
  const src = String(mer.decide);
  ok(!/\bdamage\b|\breach\b|\bflying\b/.test(src), 'el código del merodeador no conoce damage/reach/flying');
}

// ---------------------------------------------------------------------------
// 4. vuelo libre (sin colisión) y alineación de altura
// ---------------------------------------------------------------------------
{
  const pos = [10.5, 30, 10.5];
  B.freeMove(pos, 1.5, 2, -0.5);
  ok(pos[0] === 12 && pos[1] === 32 && pos[2] === 10, 'freeMove suma los tres ejes sin consultar el mundo');

  const through = [10.5, 30, 10.5];
  B.freeMove(through, 5, 0, 0);
  ok(through[0] === 15.5, 'un mundo totalmente sólido no frena el vuelo (sin colisión)');

  const y = [10.5, 30, 10.5];
  B.alignAltitude(y, 40, 0.01, 28.8);
  ok(y[1] > 30 && y[1] <= 30 + 28.8 * 0.01 + 1e-9, 'alignAltitude sube como máximo speed*dt');
  const target = 40.5;
  for (let i = 0; i < 100; i++) B.alignAltitude(y, target - 0.5, 0.05, 28.8);
  ok(Math.abs(y[1] - target) <= 0.25 + 1e-9, 'la altura converge al objetivo + offset dentro de la banda muerta');

  const stable = [10.5, target - 0.1, 10.5];
  B.alignAltitude(stable, target - 0.5, 0.05, 28.8);
  ok(stable[1] === target - 0.1, 'dentro de la banda muerta no corrige la altura (sin oscilación)');

  const edge = [63.8, 30, 0.2];
  B.clampToWorld(edge, 64, 40);
  ok(edge[0] <= 62 && edge[2] >= 1 && edge[1] >= 0 && edge[1] <= 39, 'clampToWorld respeta el borde del mundo');
}

// ---------------------------------------------------------------------------
// 5. caminata: colisión, gravedad, auto-escalón y borde
// ---------------------------------------------------------------------------
{
  const w = wall();
  const pos = [10.5, 30, 19.5];
  const moved = B.moveTo(w, pos, 0, 1, 4, 0.1);
  ok(moved === false, 'una pared frena al caminante (no atraviesa el bloque)');
  ok(pos[0] === 10.5 && pos[2] === 19.5 && pos[1] === 30, 'el paso rechazado no mueve la posición');

  const s = step();
  const up = [10.5, 30, 19.5];
  B.moveTo(s, up, 0, 1, 5, 0.1);
  ok(up[1] === 31 && up[2] > 19.5, 'sube un escalón de 1 bloque sin saltar');

  const g = [10.5, 35, 10.5];
  B.applyGravity(flat(), g, 10, 0.1);
  ok(g[1] < 35 && g[1] >= 30, 'la gravedad baja al caminante hacia el suelo');
  for (let i = 0; i < 100; i++) B.applyGravity(flat(), g, 10, 0.1);
  ok(g[1] === 30, 'cae hasta el suelo y no queda flotando');

  const over = [10.5, 35, 10.5];
  B.moveTo(flat(), over, 0, 0, 10, 0.1);
  ok(over[1] >= 30, 'moverse sobre el suelo no lo hunde');

  const b = [30.5, 30, 1.2];
  B.moveTo(flat(), b, 0, -1, 10, 0.1);
  ok(b[2] >= 1, 'el caminante respeta el borde del mundo');
}

// ---------------------------------------------------------------------------
// 6. guardián: pelea solo contra criaturas dentro de su zona
// ---------------------------------------------------------------------------
{
  const guardian = B.getBehavior('guardian') || { decide: () => ({}) };
  const self = { pos: [10.5, 30, 10.5], yaw: 0 };
  const home = [10.5, 30, 10.5];
  const base = { self, home, world: flat(), now: 1000, rng: () => 0.5, dt: 0.05 };
  const at = (id, pos, extra = {}) => ({
    id, name: 'p' + id, pos, dead: 0, mode: 'player', admin: false, bot: false, ...extra,
  });
  const Z = (i, pos, extra = {}) => ({ i, pos, dead: 0, hp: 6, ...extra });

  const out = guardian.decide({ ...base, players: [], zombies: [Z(7, [16, 30, 10.5])] });
  ok(out && out.attackZombieId === 7 && out.attackTargetId == null,
    'guardián declara ataque contra el zombi cercano (nunca attackTargetId)');
  ok(out && Array.isArray(out.moveTo) && Math.abs(out.moveTo[0] - 16) < 1e-9,
    'guardián persigue al zombi dentro de la zona');

  const close = guardian.decide({ ...base, players: [], zombies: [Z(7, [11.2, 30, 10.5])] });
  ok(close && close.attackZombieId === 7 && close.stop === true,
    'guardián se detiene a golpear cuando el zombi está al alcance');

  const two = guardian.decide({ ...base, players: [], zombies: [Z(8, [20, 30, 10.5]), Z(9, [13, 30, 10.5])] });
  ok(two && two.attackZombieId === 9, 'guardián elige el zombi vivo más cercano');

  const deadZ = guardian.decide({ ...base, players: [], zombies: [Z(7, [16, 30, 10.5], { dead: 1 })] });
  ok(deadZ && deadZ.attackZombieId == null, 'guardián ignora un zombi muerto');

  const outside = guardian.decide({ ...base, players: [], zombies: [Z(7, [30.5, 30, 10.5])] });
  ok(outside && outside.attackZombieId == null, 'guardián no persigue criaturas fuera de su zona');

  const withPlayer = guardian.decide({ ...base, players: [at(5, [11, 30, 10.5])], zombies: [] });
  ok(withPlayer && withPlayer.attackTargetId == null && withPlayer.attackZombieId == null,
    'guardián nunca ataca a un jugador pegado');

  const far = { ...base, self: { pos: [30.5, 30, 30.5], yaw: 0 } };
  const back = guardian.decide({ ...far, players: [], zombies: [] });
  ok(back && Array.isArray(back.moveTo) && back.moveTo[0] === home[0] && back.moveTo[2] === home[2],
    'sin criaturas vuelve a su origen');

  const src = String(guardian.decide);
  ok(!/\bdamage\b|\breach\b|\bflying\b/.test(src), 'el código del guardián no conoce damage/reach/flying');
}

// ---------------------------------------------------------------------------
// 7. neutral: deambula y solo responde al atacante durante la ventana
// ---------------------------------------------------------------------------
{
  const neutral = B.getBehavior('neutral') || { decide: () => ({}) };
  const home = [32.5, 30, 32.5];
  const self = { pos: [32.5, 30, 32.5], yaw: 0, wander: { tx: null, tz: null, waitUntil: 0 }, aggro: null };
  const world = flat();
  const base = { self, home, world, now: 1000, rng: () => 0.42, dt: 0.05 };
  const at = (id, pos, extra = {}) => ({
    id, name: 'p' + id, pos, dead: 0, mode: 'player', admin: false, bot: false, ...extra,
  });
  const Z = (i, pos, extra = {}) => ({ i, pos, dead: 0, hp: 6, ...extra });

  const calm = neutral.decide({ ...base, players: [at(5, [33, 30, 32.5])], zombies: [] });
  ok(calm && calm.attackTargetId == null && calm.attackZombieId == null,
    'neutral sin aggro deambula y no ataca aunque tenga un jugador al lado');

  self.aggro = { kind: 'player', id: 5, until: 5000 };
  const chaseP = neutral.decide({ ...base, players: [at(5, [40, 30, 32.5])], zombies: [] });
  ok(chaseP && chaseP.attackTargetId === 5 && chaseP.attackZombieId == null,
    'neutral persigue al jugador que lo golpeó');
  ok(chaseP && Array.isArray(chaseP.moveTo) && Math.abs(chaseP.moveTo[0] - 40) < 1e-9,
    'neutral se mueve hacia el atacante');
  ok(self.aggro && self.aggro.kind === 'player', 'el aggro sigue vigente dentro de la ventana');

  const expired = neutral.decide({ ...base, now: 5000, players: [at(5, [40, 30, 32.5])], zombies: [] });
  ok(expired && expired.attackTargetId == null && self.aggro == null,
    'pasada la ventana limpia el aggro y vuelve a deambular');

  self.aggro = { kind: 'player', id: 5, until: 5000 };
  const gone = neutral.decide({ ...base, players: [], zombies: [] });
  ok(gone && gone.attackTargetId == null && self.aggro == null,
    'si el atacante desaparece (o es admin/protegido) limpia el aggro');
  ok(gone && gone.attackZombieId == null, 'sin objetivo de criatura no declara ataque a zombis');

  self.aggro = { kind: 'zombie', id: 9, until: 5000 };
  const chaseZ = neutral.decide({ ...base, players: [], zombies: [Z(9, [40, 30, 32.5])] });
  ok(chaseZ && chaseZ.attackZombieId === 9 && chaseZ.attackTargetId == null,
    'neutral golpeado por una criatura persigue a la criatura');

  const deadZ = neutral.decide({ ...base, players: [], zombies: [Z(9, [40, 30, 32.5], { dead: 1 })] });
  ok(deadZ && deadZ.attackZombieId == null && self.aggro == null,
    'si la criatura muere limpia el aggro');

  self.aggro = { kind: 'player', id: 5, until: 5000 };
  B.setAggro(self, 'zombie', 11, 1000);
  ok(self.aggro && self.aggro.kind === 'zombie' && self.aggro.id === 11 &&
    self.aggro.until === 1000 + B.NEUTRAL_AGGRO_MS,
    'setAggro cambia al atacante más reciente y fija la ventana de 10 s');
  self.aggro = null;

  const src = String(neutral.decide);
  ok(!/\bdamage\b|\breach\b|\bflying\b/.test(src), 'el código del neutral no conoce damage/reach/flying');
}

// ---------------------------------------------------------------------------
// 8. persecución: no se detiene si el objetivo está al alcance horizontal pero
//    a otra altura (torre, techo, árbol). El runtime sigue validando ±2.5 al golpear.
// ---------------------------------------------------------------------------
{
  const at = (id, pos, extra = {}) => ({
    id, name: 'p' + id, pos, dead: 0, mode: 'player', admin: false, bot: false, ...extra,
  });
  const Z = (i, pos, extra = {}) => ({ i, pos, dead: 0, hp: 6, ...extra });
  const home = [10.5, 30, 10.5];
  const world = flat();
  const base = { home, world, now: 1000, rng: () => 0.5, dt: 0.05 };

  // cazador
  const cazador = B.getBehavior('cazador');
  const selfC = { pos: [10.5, 30, 10.5], yaw: 0 };
  const highC = cazador.decide({ ...base, self: selfC, players: [at(7, [11.5, 34, 10.5])] });
  ok(highC && highC.stop === false && Array.isArray(highC.moveTo),
    'el cazador no se detiene con el objetivo a ≤3.8 horizontal pero >2.5 vertical');
  ok(highC && highC.attackTargetId === 7, 'aun así declara el ataque: el runtime decide si el golpe entra por altura');
  const edgeC = cazador.decide({ ...base, self: selfC, players: [at(8, [11.5, 32.5, 10.5])] });
  ok(edgeC && edgeC.stop === true, 'el cazador se detiene cuando la diferencia vertical es exactamente 2.5');

  // guardián
  const guardian = B.getBehavior('guardian');
  const selfG = { pos: [10.5, 30, 10.5], yaw: 0 };
  const highG = guardian.decide({ ...base, self: selfG, players: [], zombies: [Z(9, [11.5, 34, 10.5])] });
  ok(highG && highG.stop === false && Array.isArray(highG.moveTo) && highG.attackZombieId === 9,
    'el guardián sigue acercándose a una criatura al alcance horizontal pero a otra altura');

  // neutral en retaliación
  const neutral = B.getBehavior('neutral');
  const selfN = { pos: [10.5, 30, 10.5], yaw: 0, aggro: { kind: 'player', id: 5, until: 9000 }, wander: { tx: null, tz: null, waitUntil: 0 } };
  const highN = neutral.decide({ ...base, self: selfN, players: [at(5, [11.5, 34, 10.5])], zombies: [] });
  ok(highN && highN.stop === false && Array.isArray(highN.moveTo) && highN.attackTargetId === 5,
    'el neutral en retaliación no se detiene con el atacante a otra altura');
}

// ---------------------------------------------------------------------------
// 9. deambular amplio, guardián dentro de su zona y neutral reactivado
// ---------------------------------------------------------------------------
{
  const guardian = B.getBehavior('guardian');
  const world = flat();
  let t = 1000;
  const self = { pos: [32.5, 30, 32.5], yaw: 0, wander: { tx: null, tz: null, waitUntil: 0 } };
  const home = [32.5, 30, 32.5];
  let moves = 0, maxR = 0;
  for (let i = 0; i < 300; i++) {
    t += 100;
    const out = guardian.decide({ self, home, world, now: t, rng: () => 0.9, dt: 0.05, players: [], zombies: [] });
    if (out && Array.isArray(out.moveTo)) moves++;
    if (self.wander.tx !== null) maxR = Math.max(maxR, hypot(self.wander.tx - home[0], self.wander.tz - home[2]));
  }
  ok(moves > 0, 'el guardián sin enemigos se mueve en vez de quedarse estático');
  ok(maxR >= 4 && maxR <= 16.0001, `el guardián deambula dentro de su zona (4–16; radio ${maxR.toFixed(2)})`);

  const near = { pos: [34.5, 30, 30.5], yaw: 0, wander: { tx: null, tz: null, waitUntil: 0 } };
  const patrol = guardian.decide({ self: near, home, world, now: 1000, rng: () => 0.9, dt: 0.05, players: [], zombies: [] });
  ok(patrol && !(Array.isArray(patrol.moveTo) && patrol.moveTo[0] === home[0] && patrol.moveTo[2] === home[2]),
    'el guardián cerca de su origen patrulla en vez de volver al centro en cada tick');

  const far = { pos: [30.5, 30, 30.5], yaw: 0, wander: { tx: null, tz: null, waitUntil: 0 } };
  const back = guardian.decide({ self: far, home: [10.5, 30, 10.5], world, now: 1000, rng: () => 0.5, dt: 0.05, players: [], zombies: [] });
  ok(back && Array.isArray(back.moveTo) && back.moveTo[0] === 10.5 && back.moveTo[2] === 10.5,
    'fuera del radio de guardia el guardián vuelve a su origen');
}

{
  const neutral = B.getBehavior('neutral');
  const world = flat();
  const home = [32.5, 30, 32.5];
  const at = (id, pos, extra = {}) => ({
    id, name: 'p' + id, pos, dead: 0, mode: 'player', admin: false, bot: false, ...extra,
  });
  const self = {
    pos: [32.5, 30, 32.5], yaw: 0, aggro: null,
    wander: { tx: null, tz: null, waitUntil: 0 },
  };
  let t = 1000;
  neutral.decide({ self, home, world, now: t, rng: () => 0.3, dt: 0.05, players: [], zombies: [] });
  const first = { tx: self.wander.tx, tz: self.wander.tz };
  ok(first.tx !== null && first.tz !== null, 'el neutral elige un destino de deambulación antes del combate');

  B.setAggro(self, 'player', 5, t);
  ok(self.wander.tx === null && self.wander.tz === null && self.wander.waitUntil === 0,
    'al entrar en aggro el neutral reinicia su deambular (sin destino viejo)');

  t += 100;
  const chase = neutral.decide({ self, home, world, now: t, rng: () => 0.3, dt: 0.05, players: [at(5, [40, 30, 32.5])], zombies: [] });
  ok(chase && chase.attackTargetId === 5 && Array.isArray(chase.moveTo), 'mientras dura el aggro persigue al atacante');

  t += 100;
  const gone = neutral.decide({ self, home, world, now: t, rng: () => 0.7, dt: 0.05, players: [at(5, [40, 30, 32.5], { dead: 1 })], zombies: [] });
  ok(gone && gone.attackTargetId == null && self.aggro == null, 'si el atacante muere limpia el aggro y vuelve a deambular');
  ok(self.wander.tx !== null && (self.wander.tx !== first.tx || self.wander.tz !== first.tz),
    'tras el combate elige un destino de deambulación nuevo, no el viejo');

  t += 5000;
  const resume = neutral.decide({ self, home, world, now: t, rng: () => 0.7, dt: 0.05, players: [], zombies: [] });
  ok(resume && Array.isArray(resume.moveTo), 'pasada la pausa el neutral vuelve a caminar hacia el destino nuevo');
}

// ---------------------------------------------------------------------------
// 10. rendirse con un objetivo inalcanzable (evita bucles infinitos)
// ---------------------------------------------------------------------------
{
  const self = { pos: [10.5, 30, 10.5], yaw: 0, giveUp: null };
  B.abandonTarget(self, 'player', 7, 1000);
  ok(self.giveUp && self.giveUp.kind === 'player' && self.giveUp.id === 7,
    'abandonTarget recuerda el objetivo que no se puede alcanzar');
  ok(B.targetAbandoned(self, 'player', 7, 1000), 'el objetivo abandonado se ignora mientras dura la pausa');
  ok(!B.targetAbandoned(self, 'player', 8, 1000), 'solo se ignora el objetivo abandonado, no otro del mismo tipo');
  ok(!B.targetAbandoned(self, 'zombie', 7, 1000), 'el tipo forma parte de la clave del abandono');
  ok(!B.targetAbandoned(self, 'player', 7, 1000 + B.GIVE_UP_COOLDOWN_MS + 1),
    'pasada la pausa el bot vuelve a intentar con ese objetivo');
}

// ---------------------------------------------------------------------------
// 11. deambular: el destino tiene que ser una celda libre y alcanzable
// ---------------------------------------------------------------------------
{
  const mer = B.getBehavior('merodeador');
  const world = forest();
  const start = freeSpot(world);
  const home = [start[0] - 0.5, start[1], start[2] - 0.5];
  const rng = seeded(20261113);
  let picks = 0, inalcanzables = 0, solidos = 0, quietos = 0;
  for (let i = 0; i < 400; i++) {
    const self = { pos: start.slice(), yaw: 0, wander: freshWander() };
    const out = mer.decide({ self, home, world, now: 1000, rng, dt: 0.05, players: [] });
    if (self.wander.tx === null || self.wander.tz === null) {
      quietos++;
      if (out && out.moveTo !== null) solidos++;
      continue;
    }
    picks++;
    // groundAt exige cuerpo de 2 bloques libre y desnivel ≤ 1: la copa de un árbol
    // queda descartada porque no se puede subir 4 bloques.
    if (B.groundAt(world, self.wander.tx, self.wander.tz, self.pos[1]) === null) inalcanzables++;
    const [x0, x1] = [Math.floor(self.wander.tx - B.RADIUS), Math.floor(self.wander.tx + B.RADIUS)];
    const [z0, z1] = [Math.floor(self.wander.tz - B.RADIUS), Math.floor(self.wander.tz + B.RADIUS)];
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        if (!world.freeForMob(cx, world.topSolidY(cx, cz), cz)) solidos++;
      }
    }
  }
  ok(picks > 300, `en un bosque denso igual encuentra destino casi siempre (${picks}/400)`);
  ok(inalcanzables === 0, `ningún destino de deambular queda inalcanzable (${inalcanzables} malos)`);
  ok(solidos === 0, `ningún destino de deambular cae sobre una celda sólida (${solidos} malos)`);
  ok(quietos === 0 || picks > quietos, 'si no hay celda libre se queda quieto ese tick en vez de fijar una sólida');
}

{
  // Fallback local: si TODO el radio lejano es inalcanzable (colinas/bosque),
  // igual elige un destino cercano alcanzable en vez de quedarse esperando.
  {
    const W = 64, start = 32.5;
    const world = {
      W, H: 40,
      topSolidY: (x, z) => (Math.hypot(x - start, z - start) <= 5 ? 30 : 35),
      freeForMob: (x, y, z) => y === 30,
    };
    const home = [start, 30, start];
    const self = { pos: [start, 30, start], yaw: 0, wander: freshWander() };
    B.wanderIntent(self, home, world, 1000, () => 0.1);
    const d = self.wander.tx === null ? Infinity : hypot(self.wander.tx - self.pos[0], self.wander.tz - self.pos[2]);
    ok(self.wander.tx !== null && self.wander.tz !== null && d >= 2 && d <= 6.0001,
      `radio lejano inalcanzable: usa un destino local válido (${d.toFixed(2)})`);
  }

  // Mundo totalmente sólido: no se fija destino y se reintenta sin trabarse.
  const world = solid();
  const home = [10.5, 30, 10.5];
  const self = { pos: [10.5, 30, 10.5], yaw: 0, wander: freshWander() };
  const out = B.wanderIntent(self, home, world, 1000, () => 0.5);
  ok(out && out.moveTo === null && out.stop === true, 'con todo sólido no declara movimiento ese tick');
  ok(self.wander.tx === null && self.wander.tz === null, 'con todo sólido no fija un destino');
  let fijados = 0;
  for (let i = 0; i < 40; i++) {
    B.wanderIntent(self, home, world, 1000 + i * 400, () => 0.5);
    if (self.wander.tx !== null) fijados++;
  }
  ok(fijados === 0, 'reintentar contra un mundo sólido nunca fija un destino sólido');
}

{
  // Vuelo: no hace falta validar colisión, pero el destino queda dentro del mundo.
  const world = solid();
  const home = [10.5, 30, 10.5];
  const self = { pos: [10.5, 30, 10.5], yaw: 0, flying: true, wander: freshWander() };
  B.wanderIntent(self, home, world, 1000, () => 0.25);
  ok(self.wander.tx !== null && self.wander.tz !== null,
    'un bot que vuela elige destino aunque todo el mundo sea sólido');
  ok(self.wander.tx >= 1 && self.wander.tx <= world.W - 2 && self.wander.tz >= 1 && self.wander.tz <= world.W - 2,
    'el destino del volador queda dentro del mundo');
  const move = B.wanderIntent(self, home, world, 1000 + 10000, () => 0.25);
  ok(move && Array.isArray(move.moveTo), 'pasada la pausa el volador se mueve hacia su destino');
}

{
  // Radio normal (6–24) y radio de escape (2–6) tras dos resets de navegación.
  const world = flat();
  const home = [32.5, 30, 32.5];
  const normal = { pos: [32.5, 30, 32.5], yaw: 0, wanderResets: 0, wander: freshWander() };
  B.wanderIntent(normal, home, world, 1000, () => 0.9);
  const rNormal = hypot(normal.wander.tx - home[0], normal.wander.tz - home[2]);
  ok(rNormal >= 6 && rNormal <= 24.0001, `con el radio normal deambula lejos (${rNormal.toFixed(2)})`);

  const escapado = { pos: [20.5, 30, 20.5], yaw: 0, wanderResets: 2, wander: freshWander() };
  B.wanderIntent(escapado, home, world, 1000, () => 0.9);
  const rEsc = hypot(escapado.wander.tx - escapado.pos[0], escapado.wander.tz - escapado.pos[2]);
  ok(rEsc >= 2 && rEsc <= 6.0001, `tras dos resets elige un destino cercano (${rEsc.toFixed(2)})`);
  ok(hypot(escapado.wander.tx - home[0], escapado.wander.tz - home[2]) <= 24.0001,
    'el destino de escape sigue dentro de la zona del comportamiento');

  const guardia = { pos: [30.5, 30, 30.5], yaw: 0, wanderResets: 3, wander: freshWander() };
  B.wanderIntent(guardia, home, world, 1000, () => 0.9, B.GUARD_WANDER_MIN, B.GUARD_WANDER_MAX);
  ok(guardia.wander.tx !== null &&
    hypot(guardia.wander.tx - guardia.pos[0], guardia.wander.tz - guardia.pos[2]) <= 6.0001,
    'el guardián también usa el radio cercano tras dos resets');
  ok(hypot(guardia.wander.tx - home[0], guardia.wander.tz - home[2]) <= B.GUARD_RADIUS + 1e-9,
    'el guardián no sale de su zona ni en modo escape');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 comportamientos y movimiento de bots OK');
