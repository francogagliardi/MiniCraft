// Tests del script de migración 160→208 con offset OX=OZ=48 (migrar-mundo-208).
// El mundo viejo ocupa el array 48..207; la tierra nueva queda al N/O (0..47).
// Trabaja SOLO con fixtures sintéticos en tmpdirs: nunca toca world.json real.
// Uso: node test/migrate.mjs   (sale con código != 0 si algo falla)
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(dir, '..', 'migrate-160-to-208.mjs');
const OLD = 160, NW = 208, H = 40, OX = 48, OZ = 48;
const oldIdx = (x, y, z) => (y * OLD + z) * OLD + x;
const newIdx = (x, y, z) => (y * NW + (z + OZ)) * NW + (x + OX);

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-mig-'));
const IN = path.join(tmp, 'world-160.json');
const OUT = path.join(tmp, 'world-208.json');

// Fixture sintético: esquinas, borde máximo, centro + entradas corruptas.
const SEED = 123456789;
const validCoords = [
  [0, 5, 0],      // esquina vieja (0,·,0) → nueva (48,·,48)
  [159, 20, 159], // borde máximo viejo → (207,·,207)
  [159, 39, 0],   // y máxima + borde x
  [0, 39, 159],   // y máxima + borde z
  [80, 15, 80],   // centro viejo / construcción conocida simulada → (128,·,128)
  [3, 12, 150],   // punto interior arbitrario
];
const fixtureEdits = validCoords.map(([x, y, z], k) => [oldIdx(x, y, z), 9 + (k % 5)]);
const corrupt = [
  ['x', 9], [123], null, [1.5, 9], [-5, 9],
  [OLD * H * OLD + 999, 9], // fuera de rango stride-160: no remapear
];
fs.writeFileSync(IN, JSON.stringify({ seed: SEED, edits: [...fixtureEdits, ...corrupt] }));

// RED sin script: si falta, esto falla acá (fase RED del TDD).
let ran = false;
try {
  execFileSync(process.execPath, [SCRIPT, IN, OUT], { stdio: 'pipe' });
  ran = true;
} catch (e) {
  ok(false, 'el script corre sobre la copia sin errores: ' + ((e.stderr || e.message) + '').slice(0, 200));
}
ok(ran, 'el script corre sobre la copia sin errores (offset default 48)');

if (ran) {
  const before = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const after = JSON.parse(fs.readFileSync(OUT, 'utf8'));

  // seed sin cambiar
  ok(after.seed === SEED, `seed idéntico (${after.seed})`);
  // conteo: válidos preservados, corruptos saltados
  ok(after.edits.length === fixtureEdits.length,
    `mismo edits.length válido antes/después (${before.edits.length} tot → ${after.edits.length} migrados, ${corrupt.length} corruptos saltados)`);
  // marcador w:208 + offset usado
  ok(after.w === 208 && after.ox === OX && after.oz === OZ,
    `marca w:208 + offset usado (w=${after.w}, ox=${after.ox}, oz=${after.oz})`);
  // cota stride-208
  const maxI = Math.max(...after.edits.map(e => e[0]));
  ok(maxI < NW * H * NW, `max(i')=${maxI} < 208*40*208 (${NW * H * NW})`);
  // esquinas del offset: (0,·,0)→(48,·,48), (159,·,159)→(207,·,207)
  ok(after.edits.some(([i]) => i === newIdx(0, 5, 0)),
    `esquina vieja (0,5,0) → nueva (48,5,48) [i'=${newIdx(0, 5, 0)}]`);
  ok(after.edits.some(([i]) => i === newIdx(159, 20, 159)),
    `borde viejo (159,20,159) → (207,20,207) [i'=${newIdx(159, 20, 159)}]`);
  // round-trip muestra con offset: i' → (ax,ay,az)₂₀₈ → (ax-48,ay,az-48)₁₆₀ original
  let rtOk = true;
  for (const [i2] of after.edits) {
    const ax = i2 % NW, az = ((i2 / NW) | 0) % NW, ay = (i2 / (NW * NW)) | 0;
    const x = ax - OX, z = az - OZ;
    if (!validCoords.some(([vx, vy, vz]) => vx === x && vy === ay && vz === z)) { rtOk = false; break; }
    if (!fixtureEdits.some(([i]) => i === oldIdx(x, ay, z))) { rtOk = false; break; }
  }
  ok(rtOk, 'round-trip con offset: i\' → (ax,az)₂₀₈ → (ax-48,az-48)₁₆₀ original');
  // bloque conocido en sus mismas coords + offset: (80,15,80) → (128,15,128)
  {
    const want = newIdx(80, 15, 80);
    const got = after.edits.find(([i]) => i === want);
    const origV = fixtureEdits.find(([i]) => i === oldIdx(80, 15, 80))[1];
    ok(got && got[1] === origV, `bloque conocido (80,15,80)→(128,15,128) intacto con valor ${origV}`);
  }
  // índice viejo 160-stride NO copiado tal cual
  ok(!after.edits.some(([i]) => fixtureEdits.some(([oi]) => oi === i && oi !== newIdx(0, 0, 0))),
    'índices stride-160 no copiados tal cual (salvo coincidencia degenerada)');

  // --offset 0: compat hacia atrás (mapeo identidad anterior)
  const OUT0 = path.join(tmp, 'world-208-o0.json');
  try {
    execFileSync(process.execPath, [SCRIPT, IN, OUT0, '--offset', '0'], { stdio: 'pipe' });
    const z = JSON.parse(fs.readFileSync(OUT0, 'utf8'));
    const want0 = (15 * NW + 80) * NW + 80;
    ok(z.edits.some(([i]) => i === want0) && z.ox === 0 && z.oz === 0,
      `--offset 0 mapea sin desplazar (80,15,80)→i'=${want0}, ox=0)`);
  } catch (e) { ok(false, '--offset 0: ' + (e.message + '').slice(0, 160)); }

  // idempotencia: segunda corrida sobre la salida no cambia nada
  const snap = fs.readFileSync(OUT, 'utf8');
  try {
    const out2 = execFileSync(process.execPath, [SCRIPT, OUT, OUT], { encoding: 'utf8' });
    ok(fs.readFileSync(OUT, 'utf8') === snap && /already/.test(out2),
      'idempotente: re-correr sobre migrado no cambia el archivo (marca w:208+offset)');
  } catch (e) { ok(false, 'idempotencia: ' + (e.message + '').slice(0, 160)); }

  // dry-run: no escribe, reporta conteos
  const DRY = path.join(tmp, 'dry.json');
  try {
    const out = execFileSync(process.execPath, [SCRIPT, IN, DRY, '--dry-run'], { encoding: 'utf8' });
    ok(!fs.existsSync(DRY) && /migrated/.test(out), 'dry-run: no escribe archivo y reporta conteos');
  } catch (e) { ok(false, 'dry-run: ' + (e.message + '').slice(0, 160)); }
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 migración 160→208 con offset 48 OK');
