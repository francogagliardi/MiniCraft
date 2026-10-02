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
  const col = t % 8, row = (t / 8) | 0, eU = .6 / 128, eV = .6 / 64;
  return [col / 8 + eU, 1 - (row + 1) / 4 + eV, (col + 1) / 8 - eU, 1 - row / 4 - eV];
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

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 tests estáticos OK');
