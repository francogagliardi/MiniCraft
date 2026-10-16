// Migra world.json de mundo 160 → 208 con offset OX/OZ (change migrar-mundo-208).
// El mundo viejo ocupa el array 48..207; la tierra nueva queda al N/O (0..47).
// Por cada edit [i,v] en stride-160: x=i%160, z=((i/160)|0)%160,
// y=(i/25600)|0 → i'=(y*208+(z+OZ))*208+(x+OX). El seed NO cambia.
// Entradas corruptas o fuera de rango se saltan (cuentan como skipped).
// Idempotente: si la entrada ya trae w:208 se sale sin cambios (salvo --force).
// Uso: node migrate-160-to-208.mjs <input> <output> [--dry-run] [--force]
//   [--from 160] [--to 208] [--offset 48]. Nunca toca producción: opera sobre las rutas dadas.
import fs from 'fs';

const FROM = 160, TO = 208, H = 40, OFF = 48;

function usage() {
  console.error('Uso: node migrate-160-to-208.mjs <input> <output> [--dry-run] [--force] [--from 160] [--to 208] [--offset 48]');
  process.exit(2);
}

const args = process.argv.slice(2);
const [input, output] = args;
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const optVal = (name, dflt) => {
  const ix = args.indexOf(name);
  return ix >= 0 ? +args[ix + 1] : dflt;
};
const FROM_N = optVal('--from', FROM);
const TO_N = optVal('--to', TO);
const OFF_N = optVal('--offset', OFF);
const OX = OFF_N, OZ = OFF_N;
if (!input || !output || !Number.isInteger(FROM_N) || !Number.isInteger(TO_N) || !Number.isInteger(OFF_N)) usage();

const encode = (x, y, z, n) => (y * n + z) * n + x;

let data;
try {
  data = JSON.parse(fs.readFileSync(input, 'utf8'));
} catch (e) {
  console.error(`no se pudo leer ${input}: ${e.message}`);
  process.exit(1);
}
if (!data || typeof data.seed !== 'number' || !Array.isArray(data.edits)) {
  console.error('formato inválido: se espera {seed:number, edits:array}');
  process.exit(1);
}

// Idempotencia: entrada ya migrada → no tocar (salvo --force).
if (data.w === TO_N && !force) {
  console.log(JSON.stringify({ migrated: 0, skipped: 0, total: data.edits.length, already: true }));
  console.log(`ya migrado (w:${TO_N}): sin cambios`);
  process.exit(0);
}

const maxOld = FROM_N * H * FROM_N, maxNew = TO_N * H * TO_N;
let migrated = 0, skipped = 0, maxBefore = -1, maxAfter = -1;
const out = [];
for (const e of data.edits) {
  if (!Array.isArray(e) || e.length < 2 || !Number.isInteger(e[0]) || !Number.isInteger(e[1])) { skipped++; continue; }
  const [i, v] = e;
  if (i < 0 || i >= maxOld) { skipped++; continue; }
  const [x, z, y] = [i % FROM_N, ((i / FROM_N) | 0) % FROM_N, (i / (FROM_N * FROM_N)) | 0];
  if (x < 0 || x >= FROM_N || z < 0 || z >= FROM_N || y < 0 || y >= H) { skipped++; continue; }
  const ni = encode(x + OX, y, z + OZ, TO_N);
  if (ni < 0 || ni >= maxNew) { skipped++; continue; } // imposible al crecer, pero por las dudas
  out.push([ni, v]);
  migrated++;
  if (i > maxBefore) maxBefore = i;
  if (ni > maxAfter) maxAfter = ni;
}

const summary = {
  total: data.edits.length, migrated, skipped,
  maxBefore, maxAfter, seed: data.seed, from: FROM_N, to: TO_N, ox: OX, oz: OZ, dryRun,
};
console.log(JSON.stringify(summary));
console.log(`seed ${data.seed}: ${migrated} migrados, ${skipped} saltados (total ${data.edits.length}), max ${maxBefore} → ${maxAfter}, offset ${OX},${OZ}`);

if (!dryRun) {
  const payload = {
    seed: data.seed, edits: out, w: TO_N, h: H, ox: OX, oz: OZ,
    migratedFrom: FROM_N, migratedAt: new Date().toISOString(),
  };
  fs.writeFileSync(output, JSON.stringify(payload));
}
