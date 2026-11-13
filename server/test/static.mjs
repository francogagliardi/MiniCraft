// Tests estáticos del cliente: sintaxis del módulo + consistencia del atlas.
// Uso: node test/static.mjs   (sale con código != 0 si algo falla)
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
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
  execFileSync(process.execPath, ['--check', path.join(root, 'server', 'app.js')], { stdio: 'pipe' });
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
const LAMP = 64;
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
  const srv = fs.readFileSync(path.join(root, 'server', 'app.js'), 'utf8');
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
    const srv = fs.readFileSync(path.join(root, 'server', 'app.js'), 'utf8');
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
    const paletteFactor = new Function('NIGHT_MIN',
      'return function paletteFactor(L)' + grabObj('function paletteFactor('))(NIGHT_MIN);
    const ctxFor = (underVal) => ({
      under: underVal, brightLevel, paletteFactor,
      scene: { fog:{ color:mkC(), near:0, far:0 }, background:mkC() },
      skyMat: { uniforms:{ top:{value:mkC()}, bot:{value:mkC()} } },
      hemi: { color:mkC(), groundColor:mkC(), intensity:0 },
      sun: { intensity:0 }, sunSprite: { visible:true }, ambientK:1,
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
    const paletteFn = new Function('NIGHT_MIN',
      'return function paletteFactor(L)' + grabObj('function paletteFactor('))(NIGHT_MIN);
    const dayProg = new Function('NIGHT_START', 'return function dayProg(v)' + grabObj('function dayProg('))(NIGHT_START);
    const nightProg = new Function('NIGHT_START', 'return function nightProg(v)' + grabObj('function nightProg('))(NIGHT_START);
    const mkBody = () => ({ position: mkOut(), visible:true, lookAt(){} });
    const ctx = {
      light: lightFn, isNight: isNightFn, brightLevel: brightFn, paletteFactor: paletteFn,
      skyArc, dayProg, nightProg,
      NIGHT_MIN, MOON_LIGHT, SUN_SHADOW_MIN_Y, LOW: false, SUN_DAY: 1.9, ambientK: 1,
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

// 9. auth-usuarios-lobby: páginas separadas, rutas y menú sin identidad editable
{
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const login = read('login.html');
  const register = read('register.html');
  const lobby = read('lobby.html');
  for (const [name, page] of [['index.html', html], ['login.html', login], ['register.html', register], ['lobby.html', lobby]]) {
    ok(/rel="icon"/.test(page) && /data:image\/svg\+xml/.test(page), `${name}: favicon inline`);
  }
  ok(login.includes('id="loginForm"') && login.includes('href="/register"'),
    'login.html: formulario y link a /register');
  ok(/noindex/i.test(login) && /noindex/i.test(register) && /noindex/i.test(lobby),
    'login/register/lobby son noindex');
  ok(register.includes('id="registerForm"') && register.includes('Registro cerrado') && register.includes('register:open:start'),
    'register.html: formulario + bloque "Registro cerrado"');
  ok(/<form[^>]*id="loginForm"[^>]*autocomplete="off"/.test(login) &&
    !/autocomplete="(?:username|current-password)"/.test(login),
    'login.html: pide no autocompletar credenciales (política post-prueba)');
  ok(/<form[^>]*id="registerForm"[^>]*autocomplete="off"/.test(register) &&
    !/autocomplete="new-password"/.test(register),
    'register.html: pide no autocompletar contraseñas (política post-prueba)');
  ok(!/id="nameInput"|id="keyInput"|id="skinPicker"|id="btnAdmin"/.test(html),
    'index.html: sin nombre/clave/selector/admin en el menú');
  ok(/id="btnEnter"/.test(html) && /\/api\/me/.test(html) && /location\.replace\('\/login'\)/.test(html),
    'index.html: perfil desde /api/me y redirección a /login');
  // ui/game-menu: la pausa conserva "Volver al lobby" y ya no ofrece cerrar sesión;
  // la muerte gana su salida al lobby y el logout vive solo en lobby.html.
  const pauseMarkup = html.slice(html.indexOf('id="pause"'), html.indexOf('<div id="configPanel"'));
  ok(/id="btnLobby"/.test(pauseMarkup) && /Volver al lobby/.test(pauseMarkup),
    'index.html: la pausa conserva "Volver al lobby"');
  ok(!/btnLogout/.test(html) && !/Cerrar sesión/.test(html),
    'index.html: la pausa ya no ofrece "Cerrar sesión" (ni el botón ni su etiqueta)');
  const deathMarkup = html.slice(html.indexOf('id="death"'), html.indexOf('<script', html.indexOf('id="death"')));
  ok(/<button[^>]*\bid="btnDeathLobby"[^>]*>\s*Volver al lobby\s*<\/button>/.test(deathMarkup),
    'index.html: la muerte ofrece el botón "Volver al lobby"');
  ok(deathMarkup.indexOf('btnRespawn') >= 0 && deathMarkup.indexOf('btnRespawn') < deathMarkup.indexOf('btnDeathLobby'),
    'index.html: "Volver al lobby" aparece después de "Reaparecer" en la muerte');
  const goLobby = html.match(/function goLobby\s*\(\s*\)\s*\{[^}]*location\.href\s*=\s*['"]\/lobby['"][^}]*\}/);
  const usesGoLobby = (id) => new RegExp(`getElementById\\(['"]${id}['"]\\)\\.onclick\\s*=\\s*goLobby`).test(html);
  ok(goLobby && usesGoLobby('btnLobby') && usesGoLobby('btnDeathLobby'),
    'index.html: pausa y muerte navegan a /lobby con el mismo goLobby()');
  ok(!/\/api\/logout/.test(html),
    'index.html: no queda ningún camino de logout dentro del juego');
  ok(/\.btn:focus-visible\s*\{[^}]*outline\s*:/.test(html),
    'index.html: los botones de los overlays tienen foco visible por teclado');
  ok(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]{0,300}?\.btn/.test(html),
    'index.html: los botones respetan prefers-reduced-motion');
  ok(lobby.includes('id="logoutBtn"') && /fetch\(\s*['"]\/api\/logout['"]/.test(lobby),
    'lobby.html: conserva su botón de cerrar sesión y su POST /api/logout');
  ok(!/key:document\.getElementById\('keyInput'\)/.test(html), 'el hello ya no manda clave admin');
  const lobbySkins = [...lobby.matchAll(/data-skin="([^"]+)"/g)].map(m => m[1]);
  const skinsSrc = read('server/skins.js');
  const pm = skinsSrc.match(/const PLAYER_SKINS = \[([^\]]+)\]/);
  const serverSkins = pm ? eval('[' + pm[1] + ']') : [];
  ok(JSON.stringify(lobbySkins) === JSON.stringify(serverSkins),
    'el lobby declara los mismos 8 skins que server/skins.js (' + lobbySkins.join(',') + ')');
  ok(lobbySkins.length === 8 && !lobbySkins.includes('robot'), 'el lobby no ofrece robot (reservado al bot)');
  ok(/role="radio"/.test(lobby) && /aria-checked/.test(lobby), 'el selector del lobby es accesible (role=radio/aria-checked)');
  ok(/aria-disabled="true"/.test(lobby) && /Próximamente/.test(lobby), 'Mundo Infinito deshabilitado con "Próximamente"');
  ok(!lobby.includes('<script src=') && !login.includes('<script src=') && !register.includes('<script src='),
    'páginas de auth autocontenidas (sin assets externos)');

  const httpSrc = read('server/http-auth.js');
  for (const route of ["'/api/login'", "'/api/register'", "'/api/logout'", "'/api/me'", "'/lobby'", "'/game'", "'/healthz'"]) {
    ok(httpSrc.includes(route), 'router de auth cablea ' + route);
  }
  ok(/'Cache-Control': 'no-store'/.test(httpSrc), 'las respuestas de auth llevan Cache-Control: no-store');
  ok(fs.existsSync(path.join(root, 'server', 'migrations', '001-auth.sql')), 'existe la migración 001-auth.sql');
  ok(!fs.existsSync(path.join(root, 'server', 'admin-auth.js')) && !fs.existsSync(path.join(root, 'server', 'hash-key.mjs')),
    'se eliminaron admin-auth.js y hash-key.mjs');
  ok(!/ADMIN_KEY/.test(fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8')),
    'server.js no usa ADMIN_KEY (solo admin-bootstrap avisa de las legacy)');
}

// 10. feedback post-prueba de auth-usuarios-lobby: tema claro/oscuro persistente, hover y
// foco accesibles, etiquetas de aspecto en español y entrada directa a la partida.
{
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const pages = { login: read('login.html'), register: read('register.html'), lobby: read('lobby.html') };

  for (const [name, page] of Object.entries(pages)) {
    // tema: el default vive en <html> y el script inline lo resuelve ANTES del CSS (sin flash)
    ok(/<html[^>]*\sdata-theme="(?:dark|light)"/.test(page), `${name}: <html> declara data-theme`);
    ok(page.includes('mc-theme'), `${name}: persiste la preferencia en localStorage (mc-theme)`);
    ok(/localStorage\.getItem\(\s*['"]mc-theme['"]\s*\)/.test(page), `${name}: lee mc-theme al cargar`);
    ok(/localStorage\.setItem\(\s*['"]mc-theme['"]/.test(page), `${name}: guarda mc-theme al alternar`);
    ok(page.indexOf('mc-theme') >= 0 && page.indexOf('mc-theme') < page.indexOf('<style'),
      `${name}: el tema se aplica antes del CSS (sin flash de tema)`);
    ok(/\[data-theme="light"\]\s*\{/.test(page), `${name}: define variables del tema claro`);
    ok(/--bg\s*:/.test(page) && /--panel\s*:/.test(page) && /--line\s*:/.test(page) &&
      /--text\s*:/.test(page) && /--dim\s*:/.test(page) && /--accent\s*:/.test(page),
      `${name}: variables de color para ambos temas`);
    ok(/color-scheme\s*:\s*(?:dark|light)/.test(page), `${name}: color-scheme acorde al tema`);

    // toggle accesible
    ok(/<button[^>]*id="themeToggle"[^>]*type="button"/.test(page), `${name}: toggle de tema type=button`);
    ok(/id="themeToggle"[^>]*aria-label="[^"]*tema[^"]*"/i.test(page), `${name}: el toggle tiene aria-label en español`);
    ok(/id="themeToggle"[^>]*aria-pressed="(?:true|false)"/.test(page), `${name}: el toggle declara aria-pressed`);

    // interacción y accesibilidad
    ok(/:hover/.test(page) && /:active/.test(page) && /:focus-visible/.test(page),
      `${name}: estados hover/active/focus-visible`);
    ok(/prefers-reduced-motion/.test(page), `${name}: respeta prefers-reduced-motion`);
  }

  // hints y footers centrados (feedback: el texto de la sesión quedaba alineado a la izquierda)
  for (const name of ['login', 'register']) {
    ok(/\.hint\s*\{[^}]*text-align\s*:\s*center/.test(pages[name]), `${name}: hint centrado`);
    ok(/\.foot\s*\{[^}]*text-align\s*:\s*center/.test(pages[name]), `${name}: footer centrado`);
  }

  // todas las etiquetas visibles del selector de aspecto en español, con los ids intactos
  const SKIN_LABELS = [['human', 'Humano'], ['fat', 'Gordo'], ['giant', 'Gigante'],
    ['small', 'Pequeño'], ['zombie', 'Zombi'], ['mujer', 'Mujer'], ['moreno', 'Piel oscura'], ['gojo', 'Gojo']];
  for (const [id, label] of SKIN_LABELS) {
    ok(new RegExp(`data-skin="${id}"[^>]*>\\s*${label}\\s*</button>`).test(pages.lobby),
      `lobby: ${id} se muestra como "${label}" (id intacto)`);
  }
  for (const en of ['Human', 'Fat', 'Giant', 'Small', 'Zombie', 'Moreno'])
    ok(!new RegExp(`>\\s*${en}\\s*<`).test(pages.lobby), `lobby: sin etiqueta inglesa "${en}"`);
  ok(!/Aspecto:\s*'\s*\+\s*mySkin\b/.test(html), 'index.html: el menú no muestra el id crudo del aspecto');
  ok(/playerSkin'\)\.textContent\s*=\s*'Aspecto: '\s*\+\s*skinSpec\(mySkin\)\.label/.test(html),
    'index.html: muestra la etiqueta del aspecto en español (skinSpec(...).label)');

  // entrada directa: /game con sesión autoarranca; el menú queda para archivo local o error
  const start = html.indexOf('if(profile || !isHttp){');
  const end = html.indexOf('\nif(!isHttp)', start);
  const branch = start >= 0 && end > start ? html.slice(start, end) : '';
  ok(branch.length > 0, 'index.html: se extrae la rama de perfil/archivo local');
  const profIdx = branch.indexOf('if(profile){');
  const elseIdx = branch.indexOf('}else{', profIdx);
  const profRegion = profIdx >= 0 && elseIdx > profIdx ? branch.slice(profIdx, elseIdx) : '';
  const localRegion = elseIdx > 0 ? branch.slice(elseIdx) : '';
  ok(/autoStartGame\(\)/.test(profRegion),
    'index.html: /game con sesión autoarranca (autoStartGame en la rama de perfil)');
  ok(/function autoStartGame\(\)\{[\s\S]*?runStart\(\);/.test(html),
    'index.html: autoStartGame lanza la partida (runStart)');
  ok(!/enterBtn|ENTRAR AL MUNDO/.test(profRegion),
    'index.html: con sesión no se muestra el menú intermedio ("ENTRAR AL MUNDO")');
  ok(/enterBtn\.textContent\s*=\s*'ENTRAR AL MUNDO'/.test(localRegion) && /enterBtn\.onclick/.test(localRegion),
    'index.html: el menú con botón queda para el modo archivo local');
  ok(/function autoStartGame\(\)\s*\{\s*if\s*\(\s*started\s*\|\|\s*autoStartRequested\s*\)\s*return;/.test(html),
    'index.html: el autoarranque es idempotente (no arranca dos veces)');
  ok(/Hacé clic para capturar el mouse/.test(html),
    'index.html: avisa cómo capturar el mouse cuando el pointer lock necesita un gesto');
}

// 11. admin-crud-permisos: panel /admin, permisos en el cliente y acceso del lobby
{
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const admin = read('admin.html');
  const lobby = read('lobby.html');
  const httpSrc = read('server/http-auth.js');
  const apiSrc = read('server/admin-api.js');

  ok(/noindex/i.test(admin), 'admin.html es noindex');
  ok(/<html[^>]*\sdata-theme="(?:dark|light)"/.test(admin), 'admin.html declara data-theme en <html>');
  ok(admin.includes('mc-theme') && admin.indexOf('mc-theme') < admin.indexOf('<style'),
    'admin.html aplica mc-theme antes del CSS (sin flash)');
  ok(/localStorage\.getItem\(\s*['"]mc-theme['"]\s*\)/.test(admin), 'admin.html lee mc-theme al cargar');
  ok(/localStorage\.setItem\(\s*['"]mc-theme['"]/.test(admin), 'admin.html guarda mc-theme al alternar');
  ok(/<button[^>]*id="themeToggle"[^>]*type="button"/.test(admin), 'admin.html: toggle de tema type=button');
  ok(/id="themeToggle"[^>]*aria-pressed="(?:true|false)"/.test(admin), 'admin.html: el toggle declara aria-pressed');
  ok(/id="themeToggle"[^>]*aria-label="[^"]*tema[^"]*"/i.test(admin), 'admin.html: aria-label del tema en español');
  ok(/\[data-theme="light"\]\s*\{/.test(admin) && /--bg\s*:/.test(admin) && /--text\s*:/.test(admin),
    'admin.html define variables para ambos temas');
  ok(/:focus-visible/.test(admin), 'admin.html tiene foco visible');
  ok(/prefers-reduced-motion/.test(admin), 'admin.html respeta prefers-reduced-motion');
  ok(/min-height:\s*44px/.test(admin), 'admin.html usa controles de al menos 44 px');
  ok(/aria-live="polite"/.test(admin) && /role="alert"/.test(admin), 'admin.html anuncia estado y errores');
  ok(/<dialog/.test(admin), 'admin.html usa diálogos nativos <dialog>');

  for (const id of ['usersTable', 'usersBody', 'auditList', 'newUserBtn', 'userDialog', 'userForm',
    'passwordDialog', 'passwordForm', 'deleteDialog', 'deleteForm', 'deleteConfirm', 'deleteBtn']) {
    ok(new RegExp(`id="${id}"`).test(admin), `admin.html declara #${id}`);
  }
  ok(admin.includes('Esta acción es definitiva'), 'admin.html advierte que el borrado es definitivo');
  ok(/no se edita|no se puede cambiar/i.test(admin), 'admin.html explica que el username es inmutable');
  ok(admin.includes('El cazador lo ignora') && admin.includes('Vuelo') && admin.includes('Rotura instantánea'),
    'admin.html etiqueta los permisos en español');
  ok(/deleteBtn\.disabled\s*=\s*deleteConfirm\.value\s*!==\s*deleteTarget\.username/.test(admin),
    'admin.html exige el username exacto para habilitar el borrado');
  ok(!admin.includes('<script src=') && !/three(\.min)?\.js/i.test(admin),
    'admin.html es autocontenido (sin scripts externos ni Three.js)');
  ok(!/<script src=/.test(admin) && admin.includes('noindex'), 'admin.html no carga frameworks');

  ok(/<a[^>]*id="adminLink"[^>]*href="\/admin"[^>]*hidden/.test(lobby),
    'lobby.html: el link de administración nace oculto');
  ok(/user\.role\s*===\s*'admin'/.test(lobby) && /adminLink\.hidden\s*=\s*false/.test(lobby),
    'lobby.html: solo muestra el link cuando /api/me confirma role=admin');

  ok(httpSrc.includes("'/admin'"), 'el router HTTP cablea GET /admin');
  ok(apiSrc.includes("'/api/admin/users'") && apiSrc.includes("'/api/admin/audit'"),
    'admin-api.js declara los endpoints de usuarios y auditoría');
  ok(apiSrc.includes('/password'), 'admin-api.js declara el reset de contraseña');
  ok(/'Cache-Control': 'no-store'/.test(apiSrc), 'admin-api.js responde Cache-Control: no-store');

  ok(/const canFly\s*=\s*\(\)\s*=>\s*isAdmin\(\)\s*\|\|\s*myPermissions\.fly === true/.test(html),
    'index.html define canFly() (admin o permiso)');
  ok(/const canInstantBreak\s*=\s*\(\)\s*=>\s*isAdmin\(\)\s*\|\|\s*myPermissions\.instant_break === true/.test(html),
    'index.html define canInstantBreak() (admin o permiso)');
  ok(/e\.code==='KeyF'\s*&&\s*canFly\(\)/.test(html), 'index.html usa canFly() en la tecla F');
  ok(/function toggleFly\(\)\{\s*\n\s*if\(!canFly\(\)\) return;/.test(html),
    'index.html usa canFly() al alternar el vuelo');
  ok(/if\(canInstantBreak\(\)\)\{\s*doBreak\(\);/.test(html), 'index.html usa canInstantBreak() en el click izquierdo');
  ok(/mouseDown\[0\]&&canInstantBreak\(\)/.test(html), 'index.html usa canInstantBreak() en la repetición');
  ok(/function tickBreak\(dt\)\{\s*\n\s*if\(canInstantBreak\(\)\|\|/.test(html),
    'index.html usa canInstantBreak() en tickBreak');
  ok(/m\.t==='perm'/.test(html), 'index.html maneja el frame perm');
  ok(/myPermissions\s*=\s*normalizePerms\(m\.user\.permissions\)/.test(html) &&
    /myPermissions\s*=\s*normalizePerms\(d\.user\.permissions\)/.test(html),
    'index.html carga los permisos de welcome.user en ambos caminos');
  ok(/Te quitaron el vuelo/.test(html), 'index.html avisa cuando revocan fly en caliente');
  ok(!/toast\([^)]*(?:bot_ignore|instant_break)/.test(html), 'el HUD no muestra el id crudo de un permiso');
  ok(/isAdmin\(\)\?'🛠':'🌱'/.test(html), 'index.html mantiene el rol admin para el resto de sus poderes');
}

// 12. feedback post-prueba de admin-crud-permisos: link admin realmente oculto,
// permisos visibles en el lobby, autocompletado suprimido y contraseñas no mostrables.
{
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const login = read('login.html');
  const register = read('register.html');
  const lobby = read('lobby.html');
  const admin = read('admin.html');
  const IGNORE_ATTRS = ['data-lpignore="true"', 'data-1p-ignore="true"', 'data-bwignore="true"', 'data-dashlane-ignore="true"'];
  const inputTag = (page, id) => (page.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];

  // A. el link de administración no se ve ni ocupa espacio para un no-admin: [hidden]
  // debe ganarle al display de a.ghost/button sin romper el toggle de tema.
  ok(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(lobby),
    'lobby: [hidden] gana sobre el display de a.ghost/button (display:none !important)');
  ok(/a\.ghost\s*\{[^}]*display\s*:\s*inline-flex/.test(lobby),
    'lobby: a.ghost conserva inline-flex al mostrarse (el fix es por especificidad)');
  ok(/\.theme-toggle\s*\{[^}]*display\s*:\s*grid/.test(lobby) && !/\.theme-toggle\s*\[hidden\]/.test(lobby),
    'lobby: el fix de [hidden] no toca el toggle de tema');
  ok(/<a[^>]*id="adminLink"[^>]*href="\/admin"[^>]*hidden/.test(lobby) &&
    /if \(user\.role === 'admin'\) adminLink\.hidden = false;/.test(lobby),
    'lobby: el link nace oculto y solo se libera con role=admin');

  // B. sección Permisos en el lobby con las etiquetas exactas y fallback sin permisos
  ok(/<section class="panel" aria-labelledby="permsTitle">/.test(lobby) &&
    /<h2 id="permsTitle">Permisos<\/h2>/.test(lobby) && /id="permsList"/.test(lobby),
    'lobby: sección "Permisos" con título accesible y lista');
  ok(/bot_ignore:\s*'El bot no te ataca'/.test(lobby), 'lobby: bot_ignore se explica como "El bot no te ataca"');
  ok(/fly:\s*'Podés volar'/.test(lobby), 'lobby: fly se explica como "Podés volar"');
  ok(/instant_break:\s*'Rompes bloques al instante'/.test(lobby),
    'lobby: instant_break se explica como "Rompes bloques al instante"');
  ok(/Sin permisos especiales\./.test(lobby), 'lobby: muestra "Sin permisos especiales." cuando no hay ninguno');
  ok(/role === 'admin'/.test(lobby) && /'Administrador'/.test(lobby),
    'lobby: el rol admin se muestra como permiso implícito');
  ok(/renderPermissions\(user\.permissions,\s*user\.role\)/.test(lobby),
    'lobby: renderiza los permisos con el perfil de /api/me (sin romper la carga)');
  ok(/typeof permissions !== 'object'/.test(lobby) || /permissions \|\| \{\}/.test(lobby),
    'lobby: un perfil sin permissions no rompe el render');

  // C. autocompletado y prompt de guardado suprimidos en login/registro/alta/reset
  ok(/<form[^>]*id="loginForm"[^>]*autocomplete="off"/.test(login),
    'login.html: form con autocomplete="off"');
  for (const id of ['username', 'password']) {
    const tag = inputTag(login, id);
    ok(/autocomplete="off"/.test(tag), `login.html: #${id} con autocomplete="off"`);
    ok(!/\sname="/.test(tag), `login.html: #${id} sin name (el JS usa id)`);
    ok(IGNORE_ATTRS.every(a => tag.includes(a)), `login.html: #${id} con atributos de ignorado de gestores`);
  }
  ok(/<form[^>]*id="registerForm"[^>]*autocomplete="off"/.test(register),
    'register.html: form con autocomplete="off"');
  for (const id of ['username', 'password', 'password2']) {
    const tag = inputTag(register, id);
    ok(/autocomplete="off"/.test(tag), `register.html: #${id} con autocomplete="off"`);
    ok(!/\sname="/.test(tag), `register.html: #${id} sin name (el JS usa id)`);
    ok(IGNORE_ATTRS.every(a => tag.includes(a)), `register.html: #${id} con atributos de ignorado de gestores`);
  }
  for (const [formId, name] of [['userForm', 'alta'], ['passwordForm', 'reset'], ['deleteForm', 'borrado']]) {
    ok(new RegExp(`<form[^>]*id="${formId}"[^>]*autocomplete="off"`).test(admin),
      `admin.html: form de ${name} con autocomplete="off"`);
  }
  for (const id of ['passwordInput', 'newPassword', 'repeatPassword']) {
    const tag = inputTag(admin, id);
    ok(/autocomplete="off"/.test(tag), `admin.html: #${id} con autocomplete="off"`);
    ok(!/\sname="/.test(tag), `admin.html: #${id} sin name (el JS usa id)`);
    ok(IGNORE_ATTRS.every(a => tag.includes(a)), `admin.html: #${id} con atributos de ignorado de gestores`);
  }
  ok(!/autocomplete="(?:username|current-password|new-password)"/.test(login + register + admin),
    'ninguna página pide al navegador recordar credenciales');

  // C2. Edge/Chromium: los campos nacen type=text enmascarado (nunca password).
  for (const [name, page] of [['login.html', login], ['register.html', register], ['admin.html', admin]]) {
    ok(/-webkit-text-security\s*:\s*disc/.test(page), `${name}: enmascarado CSS para campos secretos`);
    ok(/CSS\.supports\('-webkit-text-security', 'disc'\)/.test(page),
      `${name}: detecta soporte de enmascarado`);
    ok(/querySelectorAll\('\[data-secret\]'\)/.test(page), `${name}: inicializa los campos data-secret`);
    ok(/el\.type = 'password'/.test(page), `${name}: fallback a password sin enmascarado`);
    ok(!/<input[^>]*type="password"/.test(page), `${name}: ningún input nace type=password`);
  }
  for (const [name, page, ids] of [
    ['login.html', login, ['password']],
    ['register.html', register, ['password', 'password2']],
    ['admin.html', admin, ['passwordInput', 'newPassword', 'repeatPassword']],
  ]) {
    for (const id of ids) {
      const tag = inputTag(page, id);
      ok(/type="text"/.test(tag) && /data-secret="1"/.test(tag) && /class="secret"/.test(tag),
        `${name}: #${id} nace text enmascarado`);
    }
  }
  ok(/passEl\.value = ''/.test(login), 'login.html: vacía la clave antes del submit');
  ok(/passEl\.value = ''; pass2El\.value = ''/.test(register),
    'register.html: vacía las claves antes del submit');
  ok(/newEl\.value = ''; repEl\.value = ''/.test(admin),
    'admin.html: vacía las claves antes del submit');
  ok(/if \(!ok\) passEl\.value = password/.test(login),
    'login.html: restaura la clave si el login falla');
  ok(/if \(!ok\) \{ passEl\.value = password; pass2El\.value = password2; \}/.test(register),
    'register.html: restaura las claves si el registro falla');

  // D. las contraseñas están hasheadas: el panel no las muestra y lo explica
  ok(admin.includes('Las contraseñas se guardan hasheadas y no se pueden mostrar.'),
    'admin.html: avisa que las contraseñas se guardan hasheadas');
  ok(admin.includes('Definí una nueva; se revocan las sesiones.'),
    'admin.html: el reset es la vía y revoca las sesiones');
  ok(!/passwordHash|password_hash/.test(admin), 'admin.html no recibe ni muestra hashes');
  ok(/\/password'[\s\S]{0,80}method:\s*'POST'/.test(admin),
    'admin.html solo envía la contraseña nueva por POST (no hay lectura)');
  ok(!/reveal|plaintext|ver contraseña/i.test(admin), 'admin.html no ofrece ver contraseñas');
}

// 13. ui-tema-juego: tokens --mc-*, tema sin flash, HUD legible sobre el canvas 3D y
// accesibilidad de las superficies del juego. Solo presentación: el render 3D, el
// protocolo y el gameplay no se validan acá (el canvas no es inspeccionable).
{
  const style = (html.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
  const block = (name) => (style.match(new RegExp(`html\\[data-theme="${name}"\\]\\s*\\{([\\s\\S]*?)\\}`)) || ['', ''])[1];
  const dark = block('dark');
  const light = block('light');
  const token = (src, name) => {
    const mm = src.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
    return mm ? mm[1].trim() : '';
  };
  const parseColor = (value) => {
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex) { const n = parseInt(hex[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
    const rgba = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (!rgba) return null;
    return [+rgba[1], +rgba[2], +rgba[3], rgba[4] === undefined ? 1 : +rgba[4]];
  };
  const over = (top, bottom) => {
    const a = top[3];
    return [0, 1, 2].map(i => top[i] * a + bottom[i] * (1 - a)).concat(1);
  };
  const lum = (rgb) => {
    const f = rgb.slice(0, 3).map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratio = (a, b) => {
    const [hi, lo] = lum(a) >= lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
    return (hi + 0.05) / (lo + 0.05);
  };
  const sky = parseColor('#7ec8f7');

  // A. tokens y aislamiento
  ok(dark.length > 0 && light.length > 0,
    'ui/game-theme: bloques de tokens html[data-theme="dark"] y html[data-theme="light"]');
  ok(/color-scheme\s*:\s*dark/.test(dark) && /color-scheme\s*:\s*light/.test(light),
    'ui/game-theme: color-scheme acorde a cada tema (controles nativos)');
  for (const name of ['bg', 'bg-2', 'panel', 'panel-solid', 'line', 'line-strong', 'line-control',
    'text', 'dim', 'accent', 'accent-strong', 'accent-ink', 'accent-deep', 'danger', 'focus', 'hover',
    'hud-scrim', 'hud-text', 'hud-dim', 'hud-line', 'shadow', 'shadow-strong']) {
    ok(token(dark, 'mc-' + name) !== '' && token(light, 'mc-' + name) !== '',
      `ui/game-theme: token --mc-${name} en ambos temas`);
  }
  ok(/--mc-radius-(?:sm|md|lg|xl)\s*:/.test(dark) && /--mc-space-[1-6]\s*:/.test(dark),
    'ui/game-theme: familias de radios y espaciado');
  ok(/<body[^>]*class="game"/.test(html), 'ui/game-theme: <body class="game"> acota los tokens al juego');
  ok(token(dark, 'mc-panel') !== token(light, 'mc-panel') && token(dark, 'mc-text') !== token(light, 'mc-text'),
    'ui/game-theme: claro y oscuro definen superficies y texto propios');
  const gameRule = (style.match(/(?:^|\n)\s*#game\s*\{([^}]*)\}/) || ['', ''])[1];
  ok(gameRule.length > 0 && !/(?:^|[^-])filter\s*:/.test(gameRule) && !/backdrop-filter\s*:/.test(gameRule),
    'ui/game-theme: la regla #game no aplica filter/backdrop-filter al canvas');

  // B. contraste del HUD sobre el peor fondo (cielo diurno)
  for (const [name, src, weakBg, weakToken] of [
    ['oscuro', dark, sky, 'rgba(10,16,24,.3)'],
    ['claro', light, parseColor('#0b1220'), 'rgba(250,253,255,.3)'],
  ]) {
    const scrim = parseColor(token(src, 'mc-hud-scrim'));
    const text = parseColor(token(src, 'mc-hud-text'));
    const comp = scrim && text ? over(scrim, sky) : null;
    const r = comp ? ratio(text, comp) : 0;
    ok(r >= 4.5, `ui/game-theme: HUD ${name} ≥4.5:1 sobre el cielo diurno (${r.toFixed(2)}:1)`);
    const weak = parseColor(weakToken);
    ok(text && weak && ratio(text, over(weak, weakBg)) < 4.5,
      `ui/game-theme: el cálculo ${name} discrimina un scrim débil (sanity del umbral)`);
    ok(scrim && scrim[3] >= 0.7,
      `ui/game-theme: el scrim ${name} es suficientemente opaco frente al fondo`);
  }

  // C. tema sin flash, cambio en caliente y control en la configuración
  ok(/<html[^>]*data-theme="dark"/.test(html),
    'ui/game-theme: <html> nace con data-theme="dark" (default sin preferencia)');
  const head = html.slice(0, html.indexOf('<style>'));
  const themeScript = (head.match(/<script>([\s\S]*?)<\/script>/) || ['', ''])[1];
  ok(themeScript.length > 0, 'ui/game-theme: script de tema inline antes del CSS (sin flash)');
  ok(themeScript.includes('mc-theme') && /getItem\(\s*['"]mc-theme['"]\s*\)/.test(themeScript) &&
    /setItem\(\s*['"]mc-theme['"]/.test(themeScript) && /addEventListener\(\s*['"]storage['"]/.test(themeScript),
    'ui/game-theme: lee/escribe mc-theme y escucha storage');
  const runTheme = (stored) => {
    const writes = [];
    const documentElement = { dataset: {} };
    const document = { documentElement, getElementById: () => null };
    const store = {};
    if (stored !== undefined) store['mc-theme'] = stored;
    const localStorage = {
      getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { writes.push(k); store[k] = String(v); },
    };
    const sandbox = { document, localStorage };
    sandbox.window = sandbox;
    sandbox.addEventListener = () => {};
    vm.createContext(sandbox);
    vm.runInContext(themeScript, sandbox, { timeout: 1000 });
    return { get theme() { return documentElement.dataset.theme; }, writes, store, apply: sandbox.applyGameTheme };
  };
  const noPref = runTheme();
  ok(noPref.theme === 'dark' && noPref.writes.length === 0,
    'ui/game-theme: sin mc-theme arranca oscuro y no escribe storage');
  const lightPref = runTheme('light');
  ok(lightPref.theme === 'light' && lightPref.writes.length === 0,
    'ui/game-theme: mc-theme=light arranca claro sin reescribir la preferencia');
  ok(runTheme('dark').theme === 'dark', 'ui/game-theme: mc-theme=dark arranca oscuro');
  const junk = runTheme('violeta');
  ok(junk.theme === 'dark' && junk.writes.length === 0,
    'ui/game-theme: un valor inválido cae en oscuro y no se "corrige" en storage');
  const applied = runTheme('dark');
  if (typeof applied.apply === 'function') applied.apply('light', true);
  ok(applied.theme === 'light' && applied.store['mc-theme'] === 'light',
    'ui/game-theme: applyGameTheme(claro, persistir) actualiza data-theme y mc-theme');
  const volatile = runTheme('light');
  if (typeof volatile.apply === 'function') volatile.apply('dark', false);
  ok(volatile.theme === 'dark' && volatile.writes.length === 0,
    'ui/game-theme: un cambio sin persistir no toca storage');

  // D. fila "Tema" en la configuración, sincronizada y sin tráfico de red
  ok(/<label[^>]*for="themeSelect"[^>]*>\s*Tema\s*<\/label>/.test(html),
    'ui/config: la fila Tema tiene <label for="themeSelect">');
  ok(/<select[^>]*id="themeSelect"[^>]*>[\s\S]*?<option value="dark">Oscuro<\/option>[\s\S]*?<option value="light">Claro<\/option>/.test(html),
    'ui/config: #themeSelect ofrece Oscuro y Claro');
  const themeChange = (html.match(/getElementById\('themeSelect'\)\.onchange\s*=\s*([^;]+);/) || ['', ''])[1];
  ok(/applyGameTheme/.test(themeChange) && !/netSend|fetch/.test(themeChange),
    'ui/config: el cambio de tema aplica en caliente y no manda red');
  ok(/function syncThemeControl\s*\(\s*\)/.test(html) ||
    /syncThemeControl\s*=\s*\(\s*\)\s*=>/.test(html),
    'ui/config: #themeSelect se sincroniza con el tema activo');
  const cfgOpen = (html.match(/getElementById\('btnConfig'\)\.onclick=e=>\{[\s\S]*?\n\};/) || [''])[0];
  ok(/syncThemeControl\(\)/.test(cfgOpen),
    'ui/config: al abrir el panel el control refleja el tema activo');

  // E. overlays de menú, configuración, muerte, dormir y loading
  const ruleOf = (selector) => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (style.match(new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`)) || ['', ''])[1];
  };
  for (const [sel, label] of [['.overlay', 'overlay'], ['.card', 'tarjeta'], ['#inv .panel', 'panel del inventario']]) {
    ok(/var\(--mc-/.test(ruleOf(sel)), `ui/game-menu: ${label} consume tokens del tema`);
  }
  ok(/#menu,\s*#pause,\s*#death\s*\{[^}]*var\(--mc-/.test(style),
    'ui/game-menu: #menu, #pause y #death usan el fondo de overlay del tema');
  ok(/#configPanel\s*\{[^}]*var\(--mc-/.test(style) && /#loading\s*\{[^}]*var\(--mc-/.test(style) &&
    /#sleep\s*\{[^}]*var\(--mc-/.test(style),
    'ui/game-menu: configuración, loading y dormir usan tokens');
  const cardRule = ruleOf('.card');
  ok(/max-height\s*:\s*92vh/.test(cardRule) && /overflow\s*:\s*auto/.test(cardRule),
    'ui/game-menu: la tarjeta hace scroll interno sin desbordar el viewport');
  ok(/\.btn\s*\{[^}]*min-height\s*:\s*44px/.test(style),
    'ui/game-menu: los botones de los overlays tienen área táctil ≥44 px');
  for (const [id, name] of [['sensSlider', 'la sensibilidad'], ['brightSlider', 'el brillo'],
    ['qualitySelect', 'la calidad'], ['themeSelect', 'el tema'], ['showStats', 'FPS y ping']]) {
    ok(new RegExp(`<label[^>]*for="${id}"`).test(html), `ui/config: ${name} tiene label asociada`);
  }

  // F. HUD legible sobre el mundo 3D y sin blur permanente
  for (const [sel, label] of [['.logo', 'el logo'], ['.pill', 'las pills'], ['#perf', 'FPS/ping'],
    ['#plist', 'la lista de jugadores'], ['#chatlog div', 'el chat'],
    ['#toast', 'los toasts'], ['#hotbar', 'la hotbar']]) {
    const rule = ruleOf(sel);
    ok(/var\(--mc-hud-/.test(rule) && !/backdrop-filter/.test(rule),
      `ui/hud: ${label} usa scrim del HUD y no depende de backdrop-filter`);
  }
  const blurRules = [...style.matchAll(/([^{}]+)\{([^}]*backdrop-filter[^}]*)\}/g)].map(mm => mm[1].trim());
  ok(blurRules.length > 0 && blurRules.every(sel => sel === '.card'),
    'ui/game-theme: el blur queda reservado a .card (modales pausados)');
  const healthRule = ruleOf('#health');
  ok(/text-shadow/.test(healthRule) && !/(?:^|[^-])filter\s*:/.test(healthRule),
    'ui/hud: la vida usa text-shadow y scrim, sin filter:drop-shadow');
  ok(/#cross::before[^{]*\{[^}]*0 0 0 1px rgba\(0,\s*0,\s*0/.test(style) &&
    /0 0 8px rgba\(255,\s*255,\s*255/.test(style) && !/mix-blend-mode/.test(style),
    'ui/hud: el crosshair combina contorno oscuro y halo claro (sin mix-blend-mode)');

  // I. Feedback: el tema claro aclara el HUD, la vida queda sin chip y la guía de
  // controles pasa del HUD fijo a la tarjeta de pausa (colapsable y usable en 360 px).
  const lightScrim = parseColor(token(light, 'mc-hud-scrim'));
  const lightRaised = parseColor(token(light, 'mc-hud-raised'));
  const lightSlot = parseColor(token(light, 'mc-hud-slot'));
  const lightText = parseColor(token(light, 'mc-hud-text'));
  const lightDim = parseColor(token(light, 'mc-hud-dim'));
  const lightLine = parseColor(token(light, 'mc-hud-line'));
  ok(lightScrim && lum(lightScrim) > 0.6 && lightScrim[3] >= 0.7 && lightScrim[3] < 1,
    'ui/game-theme: el HUD claro usa un scrim claro y semi-opaco (no el oscuro)');
  ok(lightRaised && lum(lightRaised) > 0.8 && lightRaised[3] >= 0.9,
    'ui/game-theme: las superficies elevadas del HUD claro son claras y casi opacas');
  ok(lightSlot && lightSlot[3] <= 0.15 && lum(lightSlot) < 0.25,
    'ui/game-theme: los slots del HUD claro son un velo suave sobre superficie clara');
  ok(lightText && lum(lightText) < 0.08 && lightDim && lum(lightDim) < 0.2,
    'ui/game-theme: el texto del HUD claro es oscuro (normal y atenuado)');
  ok(lightLine && lightLine[3] >= 0.25 && lightLine[3] <= 0.6 && lum(lightLine) < 0.2,
    'ui/game-theme: el borde del HUD claro es una línea oscura translúcida');
  ok(token(light, 'mc-hud-scrim') !== token(dark, 'mc-hud-scrim') &&
    token(light, 'mc-hud-text') !== token(dark, 'mc-hud-text'),
    'ui/game-theme: el HUD claro y el oscuro no comparten paleta');
  const darkScrim = parseColor(token(dark, 'mc-hud-scrim'));
  const darkText = parseColor(token(dark, 'mc-hud-text'));
  ok(darkScrim && lum(darkScrim) < 0.1 && darkText && lum(darkText) > 0.7,
    'ui/game-theme: el tema oscuro conserva su HUD de scrim oscuro y texto claro');

  // contraste del HUD claro sobre agua y noche, no solo sobre el cielo diurno
  for (const [bgName, bgHex] of [['agua', '#2b6fb8'], ['noche', '#0b1220']]) {
    for (const [name, src] of [['oscuro', dark], ['claro', light]]) {
      const scrim = parseColor(token(src, 'mc-hud-scrim'));
      const text = parseColor(token(src, 'mc-hud-text'));
      const r = scrim && text ? ratio(text, over(scrim, parseColor(bgHex))) : 0;
      ok(r >= 4.5, `ui/game-theme: HUD ${name} ≥4.5:1 sobre ${bgName} (${r.toFixed(2)}:1)`);
    }
  }

  // la vida son solo corazones: sin chip de fondo/borde/radio/padding
  ok(!/\bbackground\s*:/.test(healthRule) && !/\bborder\s*:/.test(healthRule) &&
    !/border-radius\s*:/.test(healthRule) && !/\bpadding\s*:/.test(healthRule),
    'ui/hud: la vida son solo corazones, sin chip de fondo, borde, radio ni padding');
  ok(/html\[data-theme="light"\]\s+#health\s*\{[^}]*rgba\(255,\s*255,\s*255/.test(style),
    'ui/hud: en tema claro los corazones llevan halo claro para leerse sin caja');

  // crosshair oscuro con halo claro en tema claro (en oscuro queda el original)
  ok(/html\[data-theme="light"\]\s+#cross::before[^{]*\{[^}]*rgba\(255,\s*255,\s*255/.test(style),
    'ui/hud: en tema claro el crosshair oscuro lleva halo claro');
  ok(/#cross::before[^{]*\{[^}]*background\s*:\s*var\(--mc-hud-text\)/.test(style),
    'ui/hud: el crosshair sigue resolviendo su color desde el tema');

  // la guía de controles vive en la tarjeta de pausa, no flotando en el HUD
  const pauseBlock = html.slice(html.indexOf('id="pauseMain"'), html.indexOf('id="configPanel"'));
  ok(/<details class="controls-guide">/.test(pauseBlock) &&
    /<summary>Guía de controles<\/summary>/.test(pauseBlock) &&
    /<div id="hint"><\/div>/.test(pauseBlock),
    'ui/game-menu: la guía de controles vive en la pausa dentro de <details>');
  ok(pauseBlock.indexOf('<details') > pauseBlock.indexOf('id="btnLobby"'),
    'ui/game-menu: la guía aparece después de los botones de la pausa');
  ok((html.match(/id="hint"/g) || []).length === 1 &&
    html.indexOf('id="hint"') > html.indexOf('id="pauseMain"'),
    'ui/hud: hay una sola guía y ya no está en el HUD del juego');
  const hudMarkup = html.slice(html.indexOf('<div id="health">'), html.indexOf('<div id="inv"'));
  ok(!/id="hint"/.test(hudMarkup), 'ui/hud: el HUD no reserva espacio para la guía fija');
  const hintRule = ruleOf('#hint');
  ok(hintRule.length > 0 && /var\(--mc-/.test(hintRule) && /text-align\s*:\s*left/.test(hintRule) &&
    !/position\s*:\s*fixed/.test(hintRule),
    'ui/game-menu: #hint es un bloque alineado a la izquierda dentro de la tarjeta');
  ok(/\.controls-guide summary\s*\{[^}]*min-height\s*:\s*44px[^}]*cursor\s*:\s*pointer/.test(style),
    'ui/game-menu: el summary de la guía tiene objetivo táctil ≥44 px');
  ok(/\.controls-guide summary:focus-visible\s*\{[^}]*outline\s*:\s*3px solid var\(--mc-focus\)/.test(style),
    'ui/game-menu: el summary de la guía muestra foco visible por teclado');
  ok(!/#hint\s*\{\s*display\s*:\s*none/.test(style) &&
    !/getElementById\('hint'\)\.style\.display\s*=\s*'none'/.test(html),
    'ui/game-menu: la guía no se oculta por CSS ni en táctil (sigue disponible en pausa)');
  ok(/\.controls-guide\s*\{[^}]*text-align\s*:\s*left/.test(style) &&
    !/\.controls-guide\s*\{[^}]*width\s*:\s*\d+px/.test(style),
    'ui/game-menu: la guía se adapta al ancho de la tarjeta (sin ancho fijo a 360 px)');

  // el overlay de dormir sigue el tema: texto del tema y fondo claro en claro
  ok(/#sleep\s*\{[^}]*color\s*:\s*var\(--mc-text\)/.test(style),
    'ui/game-menu: el overlay de dormir usa el texto del tema activo');
  ok(/--mc-sleep\s*:\s*radial-gradient\([^;]*rgba\(\s*2[0-9][0-9]\s*,/.test(light),
    'ui/game-theme: en tema claro el overlay de dormir es claro');

  // G. chat, inventario, hotbar y toasts tokenizados
  ok(!/id="chatSend"[^>]*style=/.test(html),
    'ui/inventory: #chatSend ya no lleva color literal en el atributo style');
  ok(/#chatSend\s*\{[^}]*var\(--mc-/.test(style),
    'ui/inventory: #chatSend consume tokens del tema');
  ok(/var\(--mc-/.test(ruleOf('#chatbox input')), 'ui/inventory: el input del chat consume tokens');
  ok(/var\(--mc-/.test(ruleOf('#chatlog div')), 'ui/inventory: el log del chat consume tokens');
  const invItemRule = ruleOf('.invItem');
  ok(/var\(--mc-/.test(invItemRule) && /min-height\s*:\s*44px/.test(invItemRule),
    'ui/inventory: los ítems consumen tokens y tienen objetivo táctil ≥44 px');
  ok(/min-height\s*:\s*44px/.test(ruleOf('#invClose')),
    'ui/inventory: el botón "Listo" tiene objetivo táctil ≥44 px');
  ok(/var\(--mc-/.test(ruleOf('#inv .sub')), 'ui/inventory: el subtítulo del inventario consume tokens');
  ok(/var\(--mc-/.test(ruleOf('.slot')), 'ui/inventory: los slots de la hotbar consumen tokens');
  ok(/\.slot\.sel\s*\{[^}]*border-color\s*:\s*var\(--mc-/.test(style) &&
    /\.invItem\.inSlot\s*\{[^}]*border-color/.test(style),
    'ui/inventory: selección por borde y relleno, no solo por color');
  ok(/body\.touch\s+\.slot\s*\{[^}]*height\s*:\s*46px/.test(style),
    'ui/inventory: la hotbar táctil conserva sus 9 slots con 46 px de alto');

  // H. accesibilidad, responsive y fallback de rendimiento
  for (const [sel, label] of [['.btn', 'los botones'], ['.slot', 'los slots'],
    ['.invItem', 'los ítems del inventario'], ['.pill', 'las pills'], ['#invClose', 'el botón Listo']]) {
    ok(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':focus-visible').test(style),
      `ui/game-theme: foco visible en ${label}`);
  }
  ok(/#configPanel select:focus-visible/.test(style) && /#configPanel input:focus-visible/.test(style) &&
    /#chatbox input:focus-visible/.test(style), 'ui/game-theme: foco visible en select e input');
  ok(/outline\s*:\s*3px solid var\(--mc-focus\)/.test(style) && /outline-offset\s*:\s*2px/.test(style) &&
    /box-shadow\s*:\s*0 0 0 1px var\(--mc-panel-solid\)/.test(style),
    'ui/game-theme: anillo de foco de doble contraste (paneles claros y oscuros)');
  const reduced = (style.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\s*\}/) || ['', ''])[1];
  ok(/\.slot/.test(reduced) && /\.card/.test(reduced) && /\.zzz/.test(reduced) &&
    /animation\s*:\s*none/.test(reduced) && !/display\s*:\s*none/.test(reduced),
    'ui/game-theme: reduced-motion desactiva animaciones sin ocultar información');
  ok(/@supports\s+not\s*\(\(backdrop-filter:\s*blur\(1px\)\)/.test(style),
    'ui/game-theme: fallback declarado para navegadores sin backdrop-filter');
  ok(/@media\s*\(max-width:\s*360px\)\s*\{[\s\S]*?\.card\{[^}]*width:calc\(100% - 24px\)/.test(style) &&
    /@media\s*\(max-width:\s*360px\)\s*\{[\s\S]*?#invGrid\{[^}]*repeat\(4,1fr\)/.test(style),
    'ui/game-theme: a 360 px la tarjeta y la grilla se recomponen sin desbordar');
  const floatCubes = html.match(/<div class="float-cube"[^>]*>/g) || [];
  ok(floatCubes.length > 0 && floatCubes.every(tag => /aria-hidden="true"/.test(tag)),
    'ui/game-theme: los float-cube decorativos son aria-hidden');
  ok(/s\.tabIndex\s*=\s*0/.test(html) && /el\.tabIndex\s*=\s*0/.test(html),
    'ui/inventory: slots e ítems son alcanzables con Tab');
  ok(/s\.onkeydown/.test(html) && /el\.onkeydown/.test(html),
    'ui/inventory: slots e ítems se activan con Enter/Espacio');
}

if (fails) { console.log(`\n❌ ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 tests estáticos OK');
