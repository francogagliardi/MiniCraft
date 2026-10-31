// Tests estáticos del cliente: sintaxis del módulo + consistencia del atlas.
// Uso: node test/static.mjs   (sale con código != 0 si algo falla)
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

// 1. sintaxis del <script type="module">
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.log('❌ no se encontró el script del cliente'); process.exit(1); }
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-')), 'client.mjs');
fs.writeFileSync(tmp, m[1]);
try {
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  ok(true, 'sintaxis cliente (node --check)');
} catch (e) { ok(false, 'sintaxis cliente: ' + (e.stderr || e.message)); }

// 2. sintaxis del servidor
try {
  execFileSync(process.execPath, ['--check', path.join(root, 'server', 'server.js')], { stdio: 'pipe' });
  ok(true, 'sintaxis servidor (node --check)');
} catch (e) { ok(false, 'sintaxis servidor: ' + (e.stderr || e.message)); }

// 3. todos los tiles referenciados existen y sus UV son válidas
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, LOG = 4, PLANKS = 5, LEAVES = 6,
  SAND = 7, GLASS = 8, BRICK = 9, GLOW = 10, BEDROCK = 11, WATER = 12,
  FLOWER_R = 13, FLOWER_Y = 14, COBBLE = 15, WOOL = 16, SNOW = 17, CLAY = 18,
  OBSIDIAN = 19, PUMPKIN = 20, BOOKS = 21, MELON = 22, SWORD = 100, PICK = 101;
const DOOR = 23, DOOR_OPEN = 24, HAY = 25, SBRICK = 26, DOOR2 = 27, DOOR2_OPEN = 28;
const DOORZ = 29, DOORZ_OPEN = 30, DOORZ2 = 31, DOORZ2_OPEN = 32, TORCH = 33, SLAB_STONE = 34;
const SLAB_PLANKS = 35, SLAB_COBBLE = 36, SLAB_BRICK = 37, SLAB_SBRICK = 38;
const STAIR_STONE_E = 39, STAIR_STONE_W = 40, STAIR_STONE_S = 41, STAIR_STONE_N = 42;
const STAIR_PLANKS_E = 43, STAIR_PLANKS_W = 44, STAIR_PLANKS_S = 45, STAIR_PLANKS_N = 46;
const STAIR_COBBLE_E = 47, STAIR_COBBLE_W = 48, STAIR_COBBLE_S = 49, STAIR_COBBLE_N = 50;
const STAIR_BRICK_E = 51, STAIR_BRICK_W = 52, STAIR_BRICK_S = 53, STAIR_BRICK_N = 54;
const STAIR_SBRICK_E = 55, STAIR_SBRICK_W = 56, STAIR_SBRICK_S = 57, STAIR_SBRICK_N = 58;
const BED = 59, BED_X_FOOT = 60, BED_X_HEAD = 61, BED_Z_FOOT = 62, BED_Z_HEAD = 63;
const grabObj = (marker) => {
  let i = html.indexOf(marker);
  i = html.indexOf('{', i);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    if (html[j] === '}') { depth--; if (depth === 0) return html.slice(i, j + 1); }
  }
  throw new Error('no balanceado: ' + marker);
};
const tileUV = (t) => {
  const col = t % 8, row = (t / 8) | 0, eU = .6 / 128, eV = .6 / 80;
  return [col / 8 + eU, 1 - (row + 1) / 5 + eV, (col + 1) / 8 - eU, 1 - row / 5 - eV];
};
const drawn = new Set([...html.matchAll(/(?:tile|flat|flower)\((\d+),/g)].map(x => +x[1]));
const DEFS = eval('(' + grabObj('const DEFS = ') + ')');
for (const [id, d] of Object.entries(DEFS)) {
  if (d.item || +id === WATER) continue; // la espada no es bloque; el agua usa tile fijo 13
  const tiles = d.tiles ? Object.values(d.tiles) : [d.tile];
  for (const t of tiles) {
    if (!drawn.has(t)) { ok(false, `tile ${t} de ${d.name} no dibujado`); continue; }
    const [a, b, c, e] = tileUV(t);
    if (!(a >= 0 && c <= 1 && b >= 0 && e <= 1 && a < c && b < e)) ok(false, `UV inválida tile ${t} (${d.name})`);
  }
  if ((d.cube || d.flower || d.glow) && typeof d.hard !== 'number') ok(false, `${d.name} sin dureza`);
}
// 3b. escaleras 39-58: 5 materiales x 4 orientaciones, flag stair + stairDir + stairBase + dureza del base
{
  const baseOf = { 39: 3, 43: 5, 47: 15, 51: 9, 55: 26 };
  const hardOf = { 3: 1.8, 5: 1, 15: 1.8, 9: 2, 26: 2 };
  let stairOk = true;
  for (let g = 0; g < 5; g++) {
    const base = 39 + g * 4;
    for (let d = 0; d < 4; d++) {
      const id = base + d, dd = DEFS[id];
      if (!dd || dd.stair !== 1 || dd.stairDir !== d || dd.stairBase !== baseOf[base] || dd.hard !== hardOf[baseOf[base]]) {
        ok(false, `escalera ${id} mal definida`); stairOk = false;
      }
    }
  }
  if (stairOk) ok(true, 'escaleras 39-58 (5 materiales x 4 dirs, dureza del base)');
}
ok(true, 'tiles del atlas + durezas');

// 4. winding de las 6 caras (normal = (v1-v0)x(v2-v0) debe igualar la dirección)
const grabArr = (marker) => {
  let i = html.indexOf(marker);
  i = html.indexOf('[', i);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '[') depth++;
    if (html[j] === ']') { depth--; if (depth === 0) return html.slice(i, j + 1); }
  }
  throw new Error('no balanceado: ' + marker);
};
const FACES = eval(grabArr('const FACES = '));
let windOk = true;
for (const F of FACES) {
  const e1 = F.v[1].map((c, i) => c - F.v[0][i]);
  const e2 = F.v[2].map((c, i) => c - F.v[0][i]);
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (!n.every((c, i) => Math.abs(c - F.d[i]) < 1e-9)) { windOk = false; }
}
ok(windOk, 'winding de caras (6/6)');

// 5. inventario y hotbar válidos
const INV = eval(html.match(/const INVENTORY = (\[[^\]]+\])/)[1]);
ok(INV.every(id => DEFS[id]), `inventario (${INV.length} items válidos)`);
const HB = html.match(/DEFAULT_HOTBAR = \[([^\]]+)\]/)[1].split(',').length;
ok(HB === 9, 'hotbar de 9 slots');

// 5b. mundo 208 (migrar-mundo-208): constantes, claves y ambiente escalados
{
  const W = html.match(/const W = (\d+), H = (\d+), CH = (\d+)/);
  ok(W && +W[1] === 208 && +W[2] === 40 && +W[3] === 16, `dimensiones W=208 H=40 CH=16 (${W ? W[0] : 'sin match'})`);
  ok(html.includes("const SAVE_KEY = 'minicraft-save-v3'"), 'SAVE_KEY -v3 (invalida saves stride-160)');
  ok(!html.includes('minicraft-save-v2'), 'sin restos de save-v2');
  ok(/const CLIENT_V = 'v9'/.test(html), 'CLIENT_V v9');
  ok(!/const CLIENT_V = 'v8'/.test(html), 'sin restos de CLIENT_V v8');
  // widx usa W (stride paramétrico, no literal 160)
  ok(/const widx = \(x,y,z\) => \(y\*W \+ z\)\*W \+ x/.test(html), 'widx con stride W');
  ok(!/y \* 160|160 \* 160|25600/.test(html), 'sin stride-160 residual en lógica de mundo');
  // ambiente escalado a 208 + offset del mundo viejo (migrar-mundo-208: tierra nueva al N/O)
  ok(/const OX = 48, OZ = 48/.test(html), 'offset OX=OZ=48 (mundo viejo en array 48..207)');
  ok([...html.matchAll(/\bhAt\(x-OX,z-OZ\)/g)].length >= 5 && /hAt\(sx-OX,sz-OZ\)/.test(html),
    'terreno muestreado con coords de mundo (genWorld×3 + findSpawn + animales + fallback)');
  ok(!/\bhAt\((x,z|sx,sz)\)/.test(html), 'sin hAt con coords de array (desincronizaría suelo vs spawn)');
  ok(/for\(let r=0;r<104;r\+\+\)/.test(html), 'findSpawn radio ~104 (mitad de 208)');
  ok(/left:-114, right:114, top:114, bottom:-114/.test(html), 'frustum sombras ±114');
  ok(/new THREE\.Fog\(0xbfe3ff, 34, 180\)/.test(html) && /scene\.fog\.far=180/.test(html),
    'fog far 180 (cubre borde a borde 208)');
  ok(html.includes('const moonSprite') && /W\/2\+Math\.cos\(a\)\*radius/.test(html),
    'sol/luna sobre el arco anclado a W/2 (skyArc)');
  ok(/Math\.random\(\)\*\(W\+40\)-20/.test(html), 'nubes cubren W (rango W+40)');
}

// 5c. servidor 208 + offset: validación, stride y spawn junto a las casas desplazadas
{
  const srv = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
  ok(/x >= 208/.test(srv) && /\(y \* 208 \+ z\) \* 208 \+ x/.test(srv), 'server valida 0..207 e indexa con stride 208');
  ok(/pos: \[128\.5, 20, 136\.5\]/.test(srv), 'spawn default junto a las casas desplazadas (+48)');
  ok(!/104\.5, 20, 104\.5/.test(srv), 'sin resto del spawn centrado anterior');
}

// 6. controles táctiles + reglas de ataque (sin romper el camino de PC)
const nModule = (html.match(/<script type="module">/g) || []).length;
ok(nModule === 1, 'un solo <script type="module">');
// estructura HTML sana: sin esto el navegador traga el body como CSS/JS (página vacía)
for (const tag of ['style', 'script', 'head', 'body', 'html', 'div', 'canvas']) {
  const open = (html.match(new RegExp(`<${tag}(?=[\\s>])`, 'g')) || []).length;
  const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
  ok(open > 0 && open === close, `tags <${tag}> balanceados (${open}/${close})`);
}
for (const needle of ['const TOUCH', 'canAct()', 'touchControls', 'jumpTouch', 'placeTouch',
    'atkTouch', 'btnFull', 'toggleFull', 'only-touch', 'needSword']) {
  ok(html.includes(needle), `táctil/ataque: ${needle} presente`);
}
ok(/function tryLock\(\)\{\s*if \(TOUCH\) return;/.test(html), 'tryLock con guarda TOUCH');
ok(!/hotbarIds\[sel\]!==SWORD/.test(html), 'sin bloqueo total sin espada (romper/poner/acariciar libres)');
ok(html.includes('Necesitás la espada'), 'aviso al atacar sin espada');

// 7. ajustes del pico por feedback en Docker: 0.25 s + golpe animado + pose girada
{
  // 7a. tiempo objetivo: pico 0.25 s (constante tuneable), mano ×1.5, BEDROCK ∞
  const hm = html.match(/const HAND_MULT = ([\d.]+), PICK_TIME = ([\d.]+)/);
  ok(hm && +hm[1] === 1.5, `HAND_MULT = 1.5 (${hm ? hm[1] : 'sin match'})`);
  if (hm) {
    const HAND_MULT = +hm[1], PICK_TIME = +hm[2];
    const mk = new Function('DEFS', 'HAND_MULT', 'PICK_TIME',
      'return function breakTime(blockId, heldItem)' + grabObj('function breakTime(blockId, heldItem)'));
    const breakTime = mk(DEFS, HAND_MULT, PICK_TIME);
    ok(PICK_TIME === .25, `PICK_TIME = .25 (${PICK_TIME})`);
    ok(Math.abs(breakTime(STONE, PICK) - .25) < 1e-9, 'pico rompe piedra en 0.25 s');
    ok(Math.abs(breakTime(OBSIDIAN, PICK) - .25) < 1e-9, 'pico universal (obsidiana también 0.25 s)');
    ok(Math.abs(breakTime(PLANKS, SWORD) - 1.5) < 1e-9, 'mano ×1.5 intacto (tablones 1.5 s)');
    ok(Math.abs(breakTime(OBSIDIAN, SWORD) - 9) < 1e-9, 'mano escala con la dureza (obsidiana 9 s)');
    ok(breakTime(BEDROCK, PICK) === Infinity && breakTime(BEDROCK, SWORD) === Infinity,
      'BEDROCK inviolable con y sin pico');
  }

  // 7b. animación de golpe del pico reutilizando swingT/SWING_DUR (como la espada)
  const tp = grabObj('function tickPick(dt, now)');
  ok(/mouseDown\[0\]/.test(tp) && /swingT=0/.test(tp), 'tickPick reinicia el golpe mientras se pica');
  ok(/swingT=Math\.min\(1,swingT\+dt\/SWING_DUR\)/.test(tp), 'tickPick progresa el golpe como la espada');
  ok(/swingT>=1/.test(tp) && /PICK_ROT/.test(tp), 'tickPick vuelve al idle (pose base) al soltar');
  const ts = grabObj('function tickSword(dt, now)');
  ok(/swingT/.test(ts) && /SWING_DUR/.test(ts), 'tickSword conserva su animación (regresión)');

  // 7c. pose girada: cabeza hacia el fondo (~90° Y) y tamaño reducido
  ok(/const PICK_POS = new THREE\.Vector3\(-\.42,-\.42,-\.7\)/.test(html), 'pico espejado a la izquierda');
  ok(/const PICK_ROT = new THREE\.Euler\([^)]*Math\.PI\/2/.test(html), 'pose girada ~90° sobre Y');
  ok(/pickG\.scale\.setScalar\(/.test(html), 'pico reducido de tamaño');
}

// 8. ciclo día/noche (ciclo-dia-noche): constantes, light(), isNight(), atmósfera y agua
{
  // 8a. constantes del ciclo: mismas en cliente y servidor (tuneables)
  const cliDur = html.match(/const DAY_MS=(\d+), NIGHT_MS=(\d+), CYCLE_MS=DAY_MS\+NIGHT_MS, DAWN_MS=(\d+), DUSK_MS=(\d+);/);
  ok(!!cliDur, 'constantes del ciclo en el cliente (DAY/NIGHT/CYCLE/DAWN/DUSK)');
  const cliMin = html.match(/const NIGHT_MIN=([\d.]+), NIGHT_START=DAY_MS\/CYCLE_MS/);
  ok(!!cliMin && +cliMin[1] === 0.50, `NIGHT_MIN=0.50 cliente (noche más clara) [${cliMin ? cliMin[1] : '?'}]`);
  ok(/const TOD_SNAP_DELTA=0\.05, TOD_CORRECT_K=0\.5/.test(html), 'TOD_SNAP_DELTA=0.05 + TOD_CORRECT_K=0.5');

  const DAY_MS = +cliDur[1], NIGHT_MS = +cliDur[2], DAWN_MS = +cliDur[3], DUSK_MS = +cliDur[4];
  const CYCLE_MS = DAY_MS + NIGHT_MS, NIGHT_MIN = +cliMin[1], NIGHT_START = DAY_MS / CYCLE_MS;
  const DAWN_V = DAWN_MS / CYCLE_MS, DUSK_V = (DAY_MS - DUSK_MS) / CYCLE_MS;

  // 8b. light(v): triangular por tramos (amanecer NIGHT_MIN→1, día 1, atardecer 1→NIGHT_MIN, noche NIGHT_MIN)
  const hasLight = html.includes('function light(v)');
  ok(hasLight, 'cliente define light(v)');
  if (hasLight) {
    const light = new Function('DAY_MS', 'NIGHT_MS', 'CYCLE_MS', 'DAWN_MS', 'DUSK_MS', 'NIGHT_MIN', 'NIGHT_START', 'DAWN_V', 'DUSK_V',
      'return function light(v)' + grabObj('function light(v)')
    )(DAY_MS, NIGHT_MS, CYCLE_MS, DAWN_MS, DUSK_MS, NIGHT_MIN, NIGHT_START, DAWN_V, DUSK_V);
    const eps = 1e-9;
    ok(Math.abs(light(0) - NIGHT_MIN) < eps, 'light(0) = NIGHT_MIN (arranque del amanecer)');
    ok(Math.abs(light(DAWN_V) - 1) < eps, 'light(fin amanecer) = 1');
    ok(Math.abs(light(CYCLE_MS / 2 / CYCLE_MS) - 1) < eps, 'light(mediodía) = 1');
    ok(Math.abs(light(DUSK_V) - 1) < eps, 'light(inicio atardecer) = 1');
    ok(light(NIGHT_START - 1e-4) > NIGHT_MIN && light(NIGHT_START - 1e-4) < NIGHT_MIN + 0.01,
      'light(fin atardecer) se acerca a NIGHT_MIN sin hueco');
    ok(Math.abs(light(NIGHT_START) - NIGHT_MIN) < eps, 'light(noche) = NIGHT_MIN');
    ok(Math.abs(light(0.9) - NIGHT_MIN) < eps, 'light(noche plena) = NIGHT_MIN');
    ok(light(DAWN_V) > light(DAWN_V / 2) && light(DAWN_V / 2) > light(0), 'amanecer crece por tramos');
    // monotonía + continuidad (paso fino ⇒ sin saltos)
    const M = 2000;
    let inc = true, dec = true, cont = true;
    for (let i = 1; i <= M; i++) {
      const a = light(DAWN_V * (i - 1) / M), b = light(DAWN_V * i / M);
      if (b < a - 1e-9) inc = false;
      if (Math.abs(b - a) > 0.02) cont = false;
      const c = light(DUSK_V + (NIGHT_START - DUSK_V) * (i - 1) / M), d = light(DUSK_V + (NIGHT_START - DUSK_V) * i / M);
      if (d > c + 1e-9) dec = false;
      if (Math.abs(d - c) > 0.02) cont = false;
    }
    ok(inc, 'light crece monotonamente durante el amanecer');
    ok(dec, 'light decrece monotonamente durante el atardecer');
    ok(cont, 'light es continua (sin saltos bruscos)');
  }

  // 8c. isNight(v): noche cuando v >= NIGHT_START (0.625), consistente con el server
  const hasIsNight = html.includes('function isNight(v)');
  ok(hasIsNight, 'cliente define isNight(v)');
  if (hasIsNight) {
    const isNight = new Function('NIGHT_START', 'return function isNight(v)' + grabObj('function isNight(v)'))(NIGHT_START);
    ok(isNight(NIGHT_START) === true, 'isNight verdadero de noche (v = 0.625)');
    ok(isNight(0.7) === true, 'isNight verdadero en plena noche');
    ok(isNight(NIGHT_START - 1e-9) === false, 'isNight falso justo antes de la noche');
    ok(isNight(0.1) === false, 'isNight falso de día');
  }

  // 8d. reloj del server (estructural): ancla, constantes, difusión y welcome
  {
    const srv = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
    ok(/const T0 = Date\.now\(\)/.test(srv), 'server: ancla el reloj (T0) al boot');
    const srvDur = srv.match(/const DAY_MS = (\d+), NIGHT_MS = (\d+), CYCLE_MS = DAY_MS \+ NIGHT_MS, DAWN_MS = (\d+), DUSK_MS = (\d+);/);
    ok(!!srvDur, 'server: constantes del ciclo');
    const srvMin = srv.match(/const NIGHT_MIN = ([\d.]+), NIGHT_START = DAY_MS \/ CYCLE_MS/);
    ok(!!srvMin && +srvMin[1] === 0.50, `server: NIGHT_MIN = 0.50 (noche más clara) [${srvMin ? srvMin[1] : '?'}]`);
    ok(!!srvDur && +srvDur[1] === DAY_MS && +srvDur[2] === NIGHT_MS && +srvDur[3] === DAWN_MS && +srvDur[4] === DUSK_MS,
      'server: mismas constantes de ciclo que el cliente');
    ok(/function phaseNow\(\)/.test(srv) && /phaseNow\(\)\s*>=\s*NIGHT_START/.test(srv),
      'server: phaseNow() en [0,1) + isNight() = v >= NIGHT_START');
    ok(/tod: phaseNow\(\), cyc: cycleNowMs\(\)/.test(srv), 'server: welcome lleva tod + cyc');
    ok(/broadcast\(\{ t: 'tod', v: phaseNow\(\) \}\)/.test(srv), "server: difunde { t:'tod', v: phaseNow() }");
    const saveMatch = srv.match(/function save\(\)\s*\{[\s\S]*?\n\}/);
    ok(!!saveMatch && !/phaseNow/.test(saveMatch[0]), 'server: save() no persiste el reloj');
  }

  // 8e. applyAtmosphere(): único punto que compone día/noche con "bajo el agua"
  const hasAtmo = html.includes('function applyAtmosphere(');
  ok(hasAtmo, 'cliente define applyAtmosphere() (único punto de atmósfera)');
  if (hasAtmo) {
    const atmo = grabObj('function applyAtmosphere(');
    ok(/WATER_FOG/.test(atmo) && /near=1/.test(atmo) && /far=26/.test(atmo),
      'sumergido: azul de agua + niebla corta');
    ok(/FOG_NIGHT/.test(atmo) && /FOG_DAY/.test(atmo) && /lerp/.test(atmo),
      'superficie: niebla día/noche interpolada');
    ok(/skyMat\.uniforms\.top/.test(atmo) && /skyMat\.uniforms\.bot/.test(atmo), 'cielo (shader) interpolado');
    ok(/hemi\.intensity/.test(atmo), 'hemi modulado por la fase');
    ok(/NIGHT_MIN/.test(atmo), 'NIGHT_MIN aplicado a la iluminación (noche al 50%)');
    // el agua tiene prioridad cuando `under` (no la pisa el ciclo)
    ok(/if\(under\)\{/.test(atmo) && /scene\.fog\.color\.copy\(FOG_NIGHT\)/.test(atmo),
      'applyAtmosphere prioriza el estado "bajo el agua" y si no aplica el ciclo');

    // comportamiento con stubs mínimos: agua manda; NIGHT_MIN al 50%; colores por fase
    const mkC = () => ({ hex:null, lerpTo:null, setHex(h){ this.hex=h; return this; }, copy(){ return this; }, lerp(_c,t){ this.lerpTo=t; return this; } });
    // brillo neutro (BRIGHTNESS=1): la fórmula real se cubre en config.mjs
    const brightLevel = new Function('BRIGHTNESS',
      'return function brightLevel(L)' + grabObj('function brightLevel('))(1);
    const ctxFor = (underVal) => ({
      under: underVal, brightLevel,
      scene: { fog:{ color:mkC(), near:0, far:0 }, background:mkC() },
      skyMat: { uniforms:{ top:{value:mkC()}, bot:{value:mkC()} } },
      hemi: { color:mkC(), groundColor:mkC(), intensity:0 },
      sun: { intensity:0 }, sunSprite: { visible:true },
      NIGHT_MIN:0.50, HEMI_DAY:0.95, SUN_DAY:1.9, WATER_FOG:0x1a6fd0,
      FOG_DAY:mkC(), FOG_NIGHT:mkC(), BG_DAY:mkC(), BG_NIGHT:mkC(),
      SKY_TOP_DAY:mkC(), SKY_TOP_NIGHT:mkC(), SKY_BOT_DAY:mkC(), SKY_BOT_NIGHT:mkC(),
      HEMI_SKY_DAY:mkC(), HEMI_SKY_NIGHT:mkC(), HEMI_GROUND_DAY:mkC(), HEMI_GROUND_NIGHT:mkC(),
    });
    const atmoFn = (ctx) => new Function('ctx',
      'with(ctx){ return function applyAtmosphere(L)' + grabObj('function applyAtmosphere(') + ' }')(ctx);

    // sumergido (de día y de noche): manda el azul del agua, no la paleta del ciclo
    for (const L of [1, 0.50]) {
      const c = ctxFor(true); atmoFn(c)(L);
      ok(c.scene.fog.color.hex === 0x1a6fd0 && c.scene.fog.near === 1 && c.scene.fog.far === 26
        && c.scene.background.hex === 0x1a6fd0, `sumergido (L=${L}): fondo/niebla = azul de agua`);
    }
    // superficie de día: valores diurnos
    {
      const c = ctxFor(false); atmoFn(c)(1);
      ok(c.scene.fog.near === 34 && c.scene.fog.far === 180 && c.scene.fog.color.lerpTo === 1
        && c.scene.background.lerpTo === 1, 'superficie de día: niebla 34/180 y colores 100% día');
      ok(Math.abs(c.hemi.intensity - 0.95) < 1e-9, 'superficie de día: hemi al 100%');
    }
    // superficie de noche: NIGHT_MIN (50%), sin sol directo
    {
      const c = ctxFor(false); atmoFn(c)(0.50);
      ok(c.scene.fog.color.lerpTo === 0 && c.scene.background.lerpTo === 0, 'superficie de noche: colores 100% noche');
      ok(Math.abs(c.hemi.intensity - 0.475) < 1e-9, 'NIGHT_MIN respetado: hemi al 50% (0.475)');
    }
    // el agua manda aunque cambie la fase (día vs noche sumergido ⇒ mismo azul)
    {
      const d1 = ctxFor(true); atmoFn(d1)(1);
      const n1 = ctxFor(true); atmoFn(n1)(0.50);
      ok(d1.scene.fog.color.hex === n1.scene.fog.color.hex && d1.scene.fog.color.hex === 0x1a6fd0,
        'agua manda sobre la paleta de día y de noche');
    }
  }
  const tw = grabObj('function tickWater()');
  ok(!/scene\.(fog|background)/.test(tw), 'tickWater no pisa fog/background (los compone applyAtmosphere)');
  ok(/applyAtmosphere/.test(tw), 'tickWater compone con applyAtmosphere al cambiar `under`');
  ok(/under=uw/.test(tw) && /waterEl\.style\.opacity=under\?1:0/.test(tw),
    'tickWater mantiene el flag `under` y el overlay DOM');

  // 8f. difusión del cliente: adopción directa + corrección suave + snap + modo solo
  const hasOnTod = html.includes('function onTod(v, now)');
  ok(hasOnTod, 'cliente define onTod(v, now) (adopción + corrección + snap + timestamp)');
  ok(/else if\(m\.t==='tod'\)\{ onTod\(m\.v\); \}/.test(html), "handler de red enruta { t:'tod' } a onTod");
  ok(/if\(Number\.isFinite\(m\.cyc\)\) cycleMs=m\.cyc;/.test(html) && /if\(Number\.isFinite\(m\.tod\)\) onTod\(m\.tod\);/.test(html),
    'welcome adopta tod + cyc del server');
  ok(html.includes('function todNow(now, cyc)') || html.includes('function todNow('),
    'cliente define todNow() (target extrapolado a la tasa del ciclo)');
  if (hasOnTod) {
    const mk = new Function('TOD_SNAP_DELTA',
      'let dayV=0, dayTarget=0, todAt=0, hasTod=false;' +
      'function onTod(v, now)' + grabObj('function onTod(') +
      '; return { onTod, adopt:(v)=>{ dayV=v; hasTod=true; }, state:()=>({ dayV, dayTarget, todAt, hasTod }) };');
    const A = mk(0.05);
    A.onTod(0.42, 0);
    ok(A.state().hasTod === true && Math.abs(A.state().dayV - 0.42) < 1e-9,
      'onTod adopta la fase en la primera difusión');
    A.onTod(0.45, 1000);
    ok(Math.abs(A.state().dayV - 0.42) < 1e-9 && Math.abs(A.state().dayTarget - 0.45) < 1e-9,
      'desfase pequeño no salta (deja el objetivo para la corrección suave)');
    ok(Math.abs(A.state().todAt - 1000) < 1e-9, 'onTod guarda el instante de recepción (todAt)');
    A.onTod(0.9, 2000);
    ok(Math.abs(A.state().dayV - 0.9) < 1e-9, 'desfase grande (reconexión) → snap');
    ok(Math.abs(A.state().todAt - 2000) < 1e-9, 'el snap también refresca todAt (base de la extrapolación)');
    const B = mk(0.05);
    B.adopt(0.98);
    B.onTod(0.02, 0);
    ok(Math.abs(B.state().dayV - 0.98) < 1e-9,
      'wrap 0.98→0.02 se trata como desfase corto (sin snap)');
    ok(/if\(!hasTod\)\{ dayV=v; hasTod=true; return; \}/.test(grabObj('function onTod(')),
      'onTod adoptando sin corrección la primera vez');

    const hasAdv = html.includes('function cycleAdvance('), hasCor = html.includes('function cycleCorrect(');
    ok(hasAdv && hasCor, 'cliente define cycleAdvance() + cycleCorrect()');
    if (hasAdv && hasCor) {
      const adv = new Function('return function cycleAdvance(v,dt,cyc)' + grabObj('function cycleAdvance('))();
      const cor = new Function('TOD_CORRECT_K', 'return function cycleCorrect(v,target,dt)' + grabObj('function cycleCorrect('))(0.5);
      ok(Math.abs(adv(0, 1, CYCLE_MS) - 1000 / CYCLE_MS) < 1e-12, 'cycleAdvance avanza dt*1000/cyc (dt en s)');
      ok(adv(0.9999, 1, CYCLE_MS) >= 0 && adv(0.9999, 1, CYCLE_MS) < 1, 'cycleAdvance envuelve en [0,1)');
      let v = 0.40, maxJump = 0;
      for (let i = 0; i < 200; i++) { const nv = cor(v, 0.45, 1 / 60); maxJump = Math.max(maxJump, Math.abs(nv - v)); v = nv; }
      ok(maxJump < 0.01, 'cycleCorrect converge sin saltos (salto por frame < 0.01)');
      ok(v > 0.40, 'cycleCorrect se mueve hacia el objetivo del server');
      let w = 0.40;
      for (let i = 0; i < 300; i++) w = cor(w, 0.45, 0.25);
      ok(Math.abs(w - 0.45) < 1e-6, 'cycleCorrect converge al objetivo');
      const wrapC = cor(0.98, 0.02, 0.25);
      ok(wrapC > 0.98 && wrapC < 1, 'cycleCorrect envuelve por el lado corto (0.98→0.02)');
      // modo solo: sin `tod` el cliente avanza igual con la misma tasa
      let s = 0;
      for (let i = 0; i < 60; i++) s = adv(s, 1 / 60, CYCLE_MS);
      ok(s > 0 && s < 1 && Math.abs(s - 1 / CYCLE_MS * 1000) < 1e-9,
        'modo solo: la fase avanza sin servidor (misma tasa)');
      // el loop avanza la fase y aplica corrección suave solo si hay `tod`
      const loopSrc = grabObj('function loop(now)');
      ok(/dayV=cycleAdvance\(dayV,dt,cycleMs\)/.test(loopSrc), 'loop avanza la fase localmente');
      ok(/if\(hasTod\) dayV=cycleCorrect\(dayV,todNow\(now,cycleMs\),dt\)/.test(loopSrc),
        'loop corrige contra el target extrapolado todNow(now, cycleMs)');
      ok(/applyAtmosphere/.test(loopSrc), 'loop aplica la atmósfera');
    }
  }

  // 8h. uniformidad del avance: con el target CONGELADO la fase frena entre difusiones y
  // salta en cada `tod` (diente de sierra); extrapolando el target (todNow) la velocidad
  // se mantiene ≈ constante y la corrección solo absorbe la deriva real.
  {
    const hasTodNow = html.includes('function todNow(');
    ok(hasTodNow, 'cliente define todNow(now, cyc) (target extrapolado)');
    if (hasTodNow) {
      // mini-cliente fiel: mismo dayV/dayTarget/todAt/hasTod + funciones reales extraídas
      const mkCycle = new Function('TOD_SNAP_DELTA', 'TOD_CORRECT_K',
        'let dayV=0, dayTarget=0, todAt=0, hasTod=false;\n' +
        'function cycleAdvance(v,dt,cyc)' + grabObj('function cycleAdvance(') + '\n' +
        'function cycleCorrect(v,target,dt)' + grabObj('function cycleCorrect(') + '\n' +
        'function todNow(now,cyc)' + grabObj('function todNow(') + '\n' +
        'function onTod(v,now)' + grabObj('function onTod(') + '\n' +
        'return {' +
        '  tod:(v,now)=>onTod(v,now),' +
        '  frame:(now,dt,cyc,mode)=>{ const b=dayV; dayV=cycleAdvance(dayV,dt,cyc);' +
        '    if(hasTod) dayV=cycleCorrect(dayV, mode==="frozen"?dayTarget:todNow(now,cyc), dt);' +
        '    let d=dayV-b; d-=Math.round(d); return d/dt; },' +
        '  state:()=>({ dayV, dayTarget, todAt, hasTod })' +
        '};');
      const velSim = (mode, todIntMs) => {
        const mod = mkCycle(0.05, 0.5);
        const dt = 1 / 60, cyc = CYCLE_MS; // TEMP: CYCLE_MS lo fija el cliente (se recalcula solo)
        const TOD_INT = todIntMs;
        const vels = [];
        const N = Math.round((cyc / 1000) * 60 * 2); // ~2 ciclos de frames
        let nextTod = 0;
        for (let i = 0; i < N; i++) {
          const now = i * dt * 1000; // ms (misma base que el `now` del loop)
          if (now >= nextTod) { mod.tod((now % cyc) / cyc, now); nextTod += TOD_INT; } // fase del server + instante
          const vel = mod.frame(now, dt, cyc, mode);
          if (i > Math.round(TOD_INT / 1000 * 60 * 2)) vels.push(vel); // descartar 2 intervalos de warmup
        }
        return vels;
      };
      const stats = (a) => {
        const m = a.reduce((x, y) => x + y, 0) / a.length;
        const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
        return { m, sd, min: Math.min(...a), max: Math.max(...a) };
      };
      const expected = 1000 / CYCLE_MS; // fracción por segundo (tasa del ciclo)
      const fixed = stats(velSim('extrap', 4000));   // fix: todNow extrapolado
      const frozen = stats(velSim('frozen', 4000));  // bug: dayTarget congelado (TOD_INTERVAL_MS=4000)
      ok(Math.abs(fixed.m - expected) < 0.05 * expected,
        `fix: velocidad media ≈ tasa del ciclo (${fixed.m.toExponential(2)} vs ${expected.toExponential(2)})`);
      ok(fixed.sd < 0.1 * expected,
        `fix: velocidad uniforme, sd baja (sd=${fixed.sd.toExponential(2)}, tasa=${expected.toExponential(2)})`);
      ok(fixed.min > 0.5 * expected && fixed.max < 1.5 * expected,
        `fix: la fase no frena ni se acelera entre difusiones (min/max ≈ tasa)`);
      ok(frozen.min < 0.5 * expected,
        `bug (target congelado): la fase casi se detiene entre difusiones (min=${frozen.min.toExponential(2)})`);
      ok(frozen.sd > 0.3 * expected,
        `bug (target congelado): velocidad no uniforme, diente de sierra (sd=${frozen.sd.toExponential(2)})`);
      ok(fixed.sd < frozen.sd / 5,
        `fix vs bug: la extrapolación reduce la dispersión de velocidad >5x (${fixed.sd.toExponential(2)} vs ${frozen.sd.toExponential(2)})`);

      // triangulación: sin servidor (nunca llega `tod`) el avance local ya es uniforme
      const solo = mkCycle(0.05, 0.5);
      const soloVels = [];
      for (let i = 0; i < 600; i++) { const vel = solo.frame(i / 60 * 1000, 1 / 60, CYCLE_MS, 'extrap'); if (i > 60) soloVels.push(vel); }
      const ss = stats(soloVels);
      ok(Math.abs(ss.m - expected) < 1e-9 && ss.sd < 1e-9,
        'modo solo: sin `tod` el avance local es perfectamente uniforme');

      // triangulación: wrap 0.98→0.02 con extrapolación no salta de más
      const wrapMod = mkCycle(0.05, 0.5);
      wrapMod.tod(0.98, 0);
      wrapMod.tod(0.02, 1000);
      ok(Math.abs(wrapMod.state().dayV - 0.98) < 1e-9, 'wrap con target extrapolado no hace snap');
    }
  }

  // 8g. sol y luna móviles (feedback): arco del cielo, ocultado por fase y luz de luna
  {
    ok(html.includes('const moonSprite'), 'cliente define moonSprite (luna)');
    ok(html.includes('const moonLight'), 'cliente define moonLight (luz de luna tenue)');
    ok(html.includes('function skyArc('), 'cliente define skyArc() (arco del cielo)');
    ok(html.includes('function tickSky('), 'cliente define tickSky() (mueve sol/luna por frame)');
    ok(/tickSky\(dayV\)/.test(html), 'loop llama tickSky(dayV) cada frame');

    const skyC = html.match(/const SKY_R=(\d+), SKY_TILT=(\d+), SKY_Y0=(\d+), LIGHT_R=(\d+);/);
    const moonC = html.match(/const SUN_SHADOW_MIN_Y=(\d+), MOON_LIGHT=([\d.]+);/);
    ok(!!skyC, 'constantes del arco del cielo (SKY_R/SKY_TILT/SKY_Y0/LIGHT_R)');
    ok(!!moonC, 'constantes de luna/sombra (SUN_SHADOW_MIN_Y/MOON_LIGHT)');
    if (skyC && moonC) {
    const SKY_R = +skyC[1], SKY_TILT = +skyC[2], SKY_Y0 = +skyC[3], LIGHT_R = +skyC[4];
    const SUN_SHADOW_MIN_Y = +moonC[1], MOON_LIGHT = +moonC[2];
    ok(SKY_R > LIGHT_R && LIGHT_R > 0, `radio sprite (${SKY_R}) > radio luz (${LIGHT_R})`);
    ok(MOON_LIGHT > 0 && MOON_LIGHT < 0.5, `luz de luna tenue (MOON_LIGHT=${MOON_LIGHT})`);

    // skyArc(): 0=horizonte este, 0.5=cenit, 1=horizonte oeste; sol y luna comparten este sentido
    const mkOut = () => ({ x:0, y:0, z:0, set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; } });
    const skyArc = new Function('W', 'SKY_Y0', 'return function skyArc(p, flip, radius, tilt, out)' + grabObj('function skyArc('))(208, SKY_Y0);
    const east = mkOut(); skyArc(0, false, SKY_R, SKY_TILT, east);
    const zenit = mkOut(); skyArc(0.5, false, SKY_R, SKY_TILT, zenit);
    const west = mkOut(); skyArc(1, false, SKY_R, SKY_TILT, west);
    ok(east.x > 104 && west.x < 104, 'sol: sale por el este (p=0) y se pone por el oeste (p=1)');
    ok(Math.abs(east.y - SKY_Y0) < 1e-9 && Math.abs(west.y - SKY_Y0) < 1e-9, 'sol sobre el horizonte en p=0 y p=1');
    ok(zenit.y > east.y && Math.abs(zenit.x - 104) < 1e-9, 'sol en el cenit a mitad del día (p=0.5)');
    ok(zenit.y > west.y && zenit.y > east.y, 'el sol sube y baja (arco, no posición fija)');
    let monoX = true, prevX = Infinity;
    for (let i = 0; i <= 50; i++) { const o = mkOut(); skyArc(i / 50, false, SKY_R, SKY_TILT, o); if (o.x > prevX + 1e-9) monoX = false; prevX = o.x; }
    ok(monoX, 'el sol avanza de este a oeste sin retroceder');
    // la luna debe recorrer su arco en el MISMO sentido que el sol (este→oeste); quién elige
    // ese sentido es tickSky(), así que el sentido real se verifica más abajo sobre tickSky().

    // tickSky(v): visibilidad, sombras y luz de luna según la fase
    const lightFn = new Function('DAY_MS', 'NIGHT_MS', 'CYCLE_MS', 'DAWN_MS', 'DUSK_MS', 'NIGHT_MIN', 'NIGHT_START', 'DAWN_V', 'DUSK_V',
      'return function light(v)' + grabObj('function light(v)')
    )(DAY_MS, NIGHT_MS, CYCLE_MS, DAWN_MS, DUSK_MS, NIGHT_MIN, NIGHT_START, DAWN_V, DUSK_V);
    const isNightFn = new Function('NIGHT_START', 'return function isNight(v)' + grabObj('function isNight(v)'))(NIGHT_START);
    const brightFn = new Function('BRIGHTNESS',
      'return function brightLevel(L)' + grabObj('function brightLevel('))(1);
    const dayProg = new Function('NIGHT_START', 'return function dayProg(v)' + grabObj('function dayProg('))(NIGHT_START);
    const nightProg = new Function('NIGHT_START', 'return function nightProg(v)' + grabObj('function nightProg('))(NIGHT_START);
    const mkBody = () => ({ position: mkOut(), visible:true, lookAt(){} });
    const ctx = {
      light: lightFn, isNight: isNightFn, brightLevel: brightFn, skyArc, dayProg, nightProg,
      NIGHT_MIN, MOON_LIGHT, SUN_SHADOW_MIN_Y, LOW: false, SUN_DAY: 1.9,
      W: 208, SKY_R, SKY_TILT, SKY_Y0, LIGHT_R,
      sun: { position: mkOut(), castShadow: true, intensity: 0 }, sunSprite: mkBody(),
      moonSprite: mkBody(), moonLight: { position: mkOut(), intensity: 0 },
    };
    const tickSky = new Function('ctx', 'with(ctx){ return function tickSky(v)' + grabObj('function tickSky(') + ' }')(ctx);
    const midday = (DAWN_V + DUSK_V) / 2;
    tickSky(midday);
    ok(ctx.sunSprite.visible === true, 'tickSky: sol visible de día');
    ok(ctx.moonSprite.visible === false, 'tickSky: luna oculta de día');
    ok(ctx.sun.castShadow === true, 'tickSky: el sol proyecta sombras de día');
    ok(Math.abs(ctx.sun.intensity - 1.9) < 1e-9, 'tickSky: sol a plena intensidad de día');
    ok(ctx.moonLight.intensity === 0, 'tickSky: sin luz de luna de día');
    const sunZenitY = ctx.sunSprite.position.y;
    tickSky(0.02); // amanecer: sol bajo
    ok(ctx.sunSprite.position.y < sunZenitY, 'tickSky: al amanecer el sol está más bajo que al mediodía');
    tickSky(NIGHT_START + (1 - NIGHT_START) / 2); // plena noche
    ok(ctx.sunSprite.visible === false, 'tickSky: sol oculto de noche');
    ok(ctx.moonSprite.visible === true, 'tickSky: luna visible de noche');
    ok(ctx.sun.castShadow === false, 'tickSky: el sol no proyecta sombras de noche');
    ok(ctx.sun.intensity === 0, 'tickSky: sin sol directo de noche (intensidad 0)');
    ok(ctx.moonLight.intensity > 0, 'tickSky: luz de luna tenue de noche');
    ok(ctx.sun.position.y <= ctx.sunSprite.position.y, 'tickSky: la luz del sol sigue al sprite (misma dirección)');
    // la luna recorre un arco propio durante la noche (no queda fija)
    const moonY1 = ctx.moonSprite.position.y;
    tickSky(NIGHT_START + 0.02);
    ok(ctx.moonSprite.position.y < moonY1, 'tickSky: la luna recorre su arco durante la noche');
    // la luna comparte el sentido del sol (este→oeste) en vez del arco opuesto: sale donde el sol
    // salió y se pone donde el sol se puso, sin retroceder a lo largo de la noche
    let moonMonoX = true, prevMoonX = Infinity;
    for (let i = 0; i <= 50; i++) {
      tickSky(NIGHT_START + (1 - NIGHT_START) * (i / 50));
      const mx = ctx.moonSprite.position.x;
      if (mx > prevMoonX + 1e-9) moonMonoX = false;
      prevMoonX = mx;
    }
    ok(moonMonoX, 'tickSky: la luna avanza de este a oeste sin retroceder (mismo sentido que el sol)');
    tickSky(NIGHT_START + 1e-6);
    const moonRiseX = ctx.moonSprite.position.x;
    tickSky(1 - 1e-6);
    const moonSetX = ctx.moonSprite.position.x;
    ok(moonRiseX > 104 && moonSetX < 104,
      'tickSky: la luna sale por el este y se pone por el oeste (mismo sentido que el sol)');
    // comparación directa: sol y luna viajan en el mismo sentido (este→oeste)
    tickSky(DAWN_V * 0.5);
    const sunRiseX = ctx.sunSprite.position.x;
    tickSky(DUSK_V + (NIGHT_START - DUSK_V) * 0.5);
    const sunSetX = ctx.sunSprite.position.x;
    ok(Math.sign(moonRiseX - moonSetX) === Math.sign(sunRiseX - sunSetX) && sunRiseX > sunSetX,
      'tickSky: luna y sol viajan en el mismo sentido (este→oeste)');
    // continuidad: al cruzar el límite día/noche ni el sol ni la luna saltan
    tickSky(NIGHT_START - 1e-4);
    const sunPreX = ctx.sunSprite.position.x, moonPreX = ctx.moonSprite.position.x;
    tickSky(NIGHT_START + 1e-4);
    ok(Math.abs(ctx.sunSprite.position.x - sunPreX) < 1 && Math.abs(ctx.moonSprite.position.x - moonPreX) < 1,
      'tickSky: sol y luna son continuos al cruzar el límite día/noche (sin saltos)');
    }
  }
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 tests estáticos OK');
