// Tests de terreno con offset OX=OZ=48 (migrar-mundo-208).
// Extrae hash2/vnoise/fbm/hAt TAL CUAL del index.html y los evalúa con la seed
// real: verifica que el muestreo con coords negativas (celdas nuevas 0..47 →
// mundo -48..-1) es válido, determinista y sensible a la seed. No duplica la
// lógica: si el cliente cambia la función de ruido, el test usa la nueva.
// Uso: node test/terrain.mjs   (sale con código != 0 si algo falla)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const SEED_REAL = 457473416;

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

// Extrae las funciones de ruido del cliente (de `function hash2` hasta la def de hAt).
const start = html.indexOf('function hash2(x,z){');
const endMark = 'const hAt = ';
const endIx = html.indexOf(endMark);
const hAtLine = html.slice(endIx, html.indexOf('\n', endIx));
if (start < 0 || endIx < 0) { console.log('❌ no se encontraron las funciones de ruido en index.html'); process.exit(1); }
const src = html.slice(start, endIx) + hAtLine;
let hash2, vnoise, fbm, hAt;
try {
  const factory = new Function(`${src}; return {hash2, vnoise, fbm, hAt};`);
  ({ hash2, vnoise, fbm, hAt } = factory.call(null));
  // Las funciones usan el SEED global del cliente: lo inyectamos como global.
  globalThis.SEED = SEED_REAL;
  ok(true, 'ruido del cliente extraído y evaluable');
} catch (e) { ok(false, 'extracción de ruido: ' + (e.message + '').slice(0, 200)); }

if (!fails) {
  // 1. Terreno negativo válido: toda la zona nueva (mundo -48..-1) da alturas finitas en rango.
  let bad = 0;
  for (let x = -48; x < 0; x++) for (let z = -48; z < 0; z++) {
    const h = hAt(x, z);
    if (!Number.isFinite(h) || h < 0 || h > 40) bad++;
  }
  ok(bad === 0, `terreno negativo válido: 48×48 celdas del N/O con hAt finito en [0,40] (${bad} malas)`);

  // 2. hash2 determinista y en [0,1) también con negativos.
  const a = hash2(-48, -48), b = hash2(-48, -48), c = hash2(-1, -1);
  ok(a === b && a >= 0 && a < 1 && c >= 0 && c < 1,
    `hash2 determinista en negativos (h(-48,-48)=${a.toFixed(3)}, h(-1,-1)=${c.toFixed(3)})`);

  // 3. Sensible a la seed (las celdas nuevas no son un calco de otra zona).
  const underA = [];
  for (let k = 0; k < 20; k++) underA.push(hAt(-48 + k, -k - 1));
  globalThis.SEED = SEED_REAL + 1;
  let diffSeed = hash2(-10, -10) !== a;
  for (let k = 0; k < 20 && !diffSeed; k++) diffSeed = hAt(-48 + k, -k - 1) !== underA[k];
  globalThis.SEED = SEED_REAL;
  ok(diffSeed, 'el ruido depende de la seed (no es constante)');

  // 4. Identidad del offset: el suelo bajo el mundo viejo (array 48..207) es el
  //    original (mundo 0..159) con la misma seed — por construcción hAt(ax-OX,az-OZ).
  //    Triangulación en 3 puntos: esquina N/O, esquina S/E y centro desplazado.
  const OX = 48, OZ = 48;
  const pts = [[48, 48, 0, 0], [207, 207, 159, 159], [128, 128, 80, 80]];
  let idOk = true;
  for (const [ax, az, wx, wz] of pts) {
    if (hAt(ax - OX, az - OZ) !== hAt(wx, wz)) { idOk = false; break; }
  }
  ok(idOk, 'identidad del offset: hAt(ax-48,az-48)==hAt_original en (48,48),(207,207),(128,128)');

  // 5. Todo muestreo de terreno del cliente pasa por el offset (nada de hAt directo
  //    con coords de array: eso desincronizaría suelo generado vs spawn/flores).
  const bare = [...html.matchAll(/\bhAt\((x,z|sx,sz)\)/g)].length;
  const off = [...html.matchAll(/hAt\(x-OX,z-OZ\)/g)].length;
  const offFallback = /hAt\(sx-OX,sz-OZ\)/.test(html);
  ok(bare === 0, `sin hAt con coords de array (${bare} restos)`);
  ok(off >= 5 && offFallback, `muestreo con offset en genWorld×3+findSpawn+animales (${off} + fallback)`);
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 terreno con offset OK');
