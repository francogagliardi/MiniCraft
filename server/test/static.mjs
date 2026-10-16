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
  OBSIDIAN = 19, PUMPKIN = 20, BOOKS = 21, MELON = 22, SWORD = 100;
const DOOR = 23, DOOR_OPEN = 24, HAY = 25, SBRICK = 26, DOOR2 = 27, DOOR2_OPEN = 28;
const DOORZ = 29, DOORZ_OPEN = 30, DOORZ2 = 31, DOORZ2_OPEN = 32, TORCH = 33, SLAB_STONE = 34;
const SLAB_PLANKS = 35, SLAB_COBBLE = 36, SLAB_BRICK = 37, SLAB_SBRICK = 38;
const STAIR_STONE_E = 39, STAIR_STONE_W = 40, STAIR_STONE_S = 41, STAIR_STONE_N = 42;
const STAIR_PLANKS_E = 43, STAIR_PLANKS_W = 44, STAIR_PLANKS_S = 45, STAIR_PLANKS_N = 46;
const STAIR_COBBLE_E = 47, STAIR_COBBLE_W = 48, STAIR_COBBLE_S = 49, STAIR_COBBLE_N = 50;
const STAIR_BRICK_E = 51, STAIR_BRICK_W = 52, STAIR_BRICK_S = 53, STAIR_BRICK_N = 54;
const STAIR_SBRICK_E = 55, STAIR_SBRICK_W = 56, STAIR_SBRICK_S = 57, STAIR_SBRICK_N = 58;
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
  ok(/sunSprite\.position\.set\(W\/2\+120, 130, W\/2-240\)/.test(html), 'sunSprite re-anclado a W/2');
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

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 tests estáticos OK');
