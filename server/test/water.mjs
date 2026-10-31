// Test comportamental de waterRefill (agua-subterranea).
// Extrae `waterRefill` TAL CUAL del index.html (patrón de extracción + new
// Function como en terrain.mjs) e inyecta get/WATER/AIR/WATER_Y como globals.
// No duplica la lógica: si el cliente cambia la vecindad, el test usa la nueva.
// Uso: node test/water.mjs   (sale con código != 0 si algo falla)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

// Extrae el cuerpo balanceado `{...}` que sigue al marker (igual que static.mjs).
const grabObj = (marker) => {
  let i = html.indexOf(marker);
  if (i < 0) throw new Error('no se encontró: ' + marker);
  i = html.indexOf('{', i);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    if (html[j] === '}') { depth--; if (depth === 0) return html.slice(i, j + 1); }
  }
  throw new Error('no balanceado: ' + marker);
};

// Constantes reales del cliente (spec world/water).
const AIR = 0, WATER = 12, WATER_Y = 10;
const W = 208, H = 40;

// Mock de `get` con la semántica real: AIR fuera de límites, valor del mapa adentro.
const inB = (x, y, z) => x >= 0 && x < W && z >= 0 && z < W && y >= 0 && y < H;
const cells = new Map();
const key = (x, y, z) => x + ',' + y + ',' + z;
const put = (x, y, z, v) => cells.set(key(x, y, z), v);
const get = (x, y, z) => (inB(x, y, z) && cells.has(key(x, y, z))) ? cells.get(key(x, y, z)) : AIR;

let waterRefill;
try {
  const src = 'return function waterRefill(x,y,z)' + grabObj('function waterRefill(x,y,z)');
  const factory = new Function('get', 'WATER', 'AIR', 'WATER_Y', src);
  waterRefill = factory(get, WATER, AIR, WATER_Y);
  ok(typeof waterRefill === 'function', 'waterRefill extraído y evaluable de index.html');
} catch (e) {
  ok(false, 'extracción de waterRefill: ' + (e.message + '').slice(0, 200));
}

if (!fails) {
  const refill = (x, y, z) => waterRefill(x, y, z);

  // 1. Fondo del mar: celda en/bajo el nivel del mar con agua arriba → WATER.
  put(0, 11, 0, WATER);
  ok(refill(0, 10, 0) === WATER, 'fondo del mar (agua arriba) → WATER');

  // 2. Subterráneo sin agua vecina: en/bajo el mar pero sin vecinos con agua → AIR.
  ok(refill(50, 5, 50) === AIR, 'celda subterránea sin agua vecina → AIR');

  // 3. Costado de lago: agua en un vecino lateral → WATER.
  put(6, 8, 0, WATER);
  ok(refill(5, 8, 0) === WATER, 'vecino lateral agua (costado de lago) → WATER');

  // 4. Sobre el nivel del mar: y > WATER_Y → AIR aunque tenga vecino con agua.
  put(20, 12, 20, WATER);
  ok(refill(20, 11, 20) === AIR, 'sobre el nivel del mar (y > WATER_Y) → AIR');

  // 5. Borde del mundo: sin vecinos dentro de límites, no debe crashear.
  let borderOk = true;
  try {
    borderOk = refill(0, 0, 0) === AIR && refill(207, 10, 207) === AIR && refill(-1, 5, 5) === AIR;
  } catch (e) { borderOk = false; }
  ok(borderOk, 'borde del mundo seguro (get fuera de límites = AIR, sin crash)');

  // 6. Las tres ramas de doBreak usan el helper y la condición amplia desapareció.
  const doBreak = grabObj('function doBreak(pre)');
  const calls = (doBreak.match(/waterRefill\(/g) || []).length;
  ok(calls === 3, `doBreak usa waterRefill en las tres ramas (normal + puerta + cama): ${calls} llamadas`);
  ok(!/<=WATER_Y\s*\?\s*WATER\s*:\s*AIR/.test(doBreak),
    'doBreak sin la condición amplia y<=WATER_Y ? WATER : AIR');
  ok(/edits\.push/.test(doBreak) && /netSend\(\{\s*t:'edit'/.test(doBreak),
    'rama MP/SP intacta en doBreak (edits.push local + netSend edit)');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 waterRefill OK');
