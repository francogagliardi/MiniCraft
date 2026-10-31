// Tests del bloque worldgen compartido (change zombi): el cliente y el servidor
// cargan el MISMO generador desde index.html. Este test extrae el bloque marcado
// /* worldgen:start */ ... /* worldgen:end */ y lo evalúa aislado (mismo enfoque
// que avatar.mjs), de modo que si el cliente cambia el generador el test usa la
// versión nueva (cero drift). Cubre: extractabilidad, autocontención, API,
// determinismo, hash dorado y el predicado de colisión de mob.
// Uso: node test/worldgen.mjs   (sale con código != 0 si algo falla)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let fails = 0;
// Hash dorado del mundo (seed real usada por terrain.mjs) para detectar cambios
// silenciosos del terreno sin tocar la semilla.
const GOLDEN_SEED = 457473416;
const GOLDEN_FNV = 3511370443;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

// ---- extracción del bloque worldgen (patrón net/avatar) ----
const START = '/* worldgen:start */', END = '/* worldgen:end */';
const i = html.indexOf(START), j = html.indexOf(END);
const present = i >= 0 && j > i;
ok(present, 'bloque worldgen presente en index.html');
const code = present ? html.slice(i, j) : '';

// autocontención: el bloque no puede referenciar símbolos externos (DEFS, THREE,
// document, window...). Detecta identificadores prohibidos y se auto-verifica con
// un bloque falso que sí los usa (caso negativo).
const externos = (src) => [...new Set([...src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').matchAll(/\b(DEFS|THREE|document|window|atlasTex|scene|camera|renderer)\b/g)].map(m => m[1]))];
if (present) {
  const bad = externos(code);
  ok(bad.length === 0, 'bloque worldgen autocontenido (sin símbolos externos' + (bad.length ? ': ' + bad.join(',') : '') + ')');
  ok(externos('const x = DEFS[1] + THREE.foo').length === 2, 'detector de autocontención funciona (caso negativo DEFS/THREE)');
}

let WG = null;
if (present) {
  try {
    WG = new Function(code + '\n;return {WG_W,WG_H,WG_SURFACE,WG_OX,WG_OZ,hash2,vnoise,fbm,hAt,mulberry,genWorld,mobBlocked};')();
    ok(true, 'bloque worldgen evaluable y con API completa');
  } catch (e) { ok(false, 'bloque worldgen evaluable: ' + e.message); }
}
const T = (name, fn) => { if (!WG) { ok(false, `${name}: sin API worldgen`); return; } try { fn(); } catch (e) { ok(false, `${name}: ${e.message}`); } };

// 1. constantes del mundo expuestas y coherentes
T('constantes', () => {
  ok(WG.WG_W === 208 && WG.WG_H === 40, `WG_W=208 WG_H=40 (${WG.WG_W}x${WG.WG_H})`);
  ok(WG.WG_SURFACE === 10, `WG_SURFACE=10 = WATER_Y (${WG.WG_SURFACE})`);
  ok(WG.WG_OX === 48 && WG.WG_OZ === 48, `WG_OX=WG_OZ=48 (${WG.WG_OX},${WG.WG_OZ})`);
});

// 2. genWorld(buf, seed) existe, llena el buffer y escribe con stride 208
T('genWorld llena el buffer', () => {
  const buf = new Uint8Array(WG.WG_W * WG.WG_H * WG.WG_W);
  WG.genWorld(buf, 457473416);
  let nonAir = 0;
  for (let k = 0; k < buf.length; k++) if (buf[k] !== 0) nonAir++;
  ok(nonAir > 1000, `genWorld escribe bloques (${nonAir} celdas non-air)`);
  // bedrock en y=0 de toda columna
  let bedrockOk = true;
  for (let x = 0; x < 208; x++) for (let z = 0; z < 208; z++) if (buf[(0 * 208 + z) * 208 + x] !== 11) bedrockOk = false;
  ok(bedrockOk, 'genWorld pone BEDROCK en y=0 de cada columna');
});

// 3. el cliente usa la firma nueva (sin llamadas genWorld() vacías)
ok(!/genWorld\(\s*\)/.test(html), 'sin llamadas genWorld() sin argumentos en index.html');
ok(/genWorld\(world,\s*SEED\)/.test(html), 'el cliente llama genWorld(world, SEED)');

// 4. contrato viejo intacto (terrain.mjs lo exige; acá dejamos el assert explícito)
ok(html.includes('function hash2(x,z){'), 'texto `function hash2(x,z){` presente (terrain.mjs)');
ok(html.includes('const hAt = '), 'texto `const hAt = ` presente (terrain.mjs)');
ok([...html.matchAll(/\bhAt\((x,z|sx,sz)\)/g)].length === 0, 'sin hAt con coords de array (0 restos)');
ok([...html.matchAll(/hAt\(x-OX,z-OZ\)/g)].length >= 5, 'hAt(x-OX,z-OZ) en >= 5 lugares (genWorld×3 + spawn + animales)');
ok(/hAt\(sx-OX,sz-OZ\)/.test(html), 'hAt(sx-OX,sz-OZ) presente');

// 5. determinismo + sensibilidad a la seed + hash dorado (FNV-1a)
const fnv1a = (buf) => { let h = 0x811c9dc5; for (let k = 0; k < buf.length; k++) { h ^= buf[k]; h = Math.imul(h, 0x01000193); } return h >>> 0; };
T('determinismo y sensibilidad', () => {
  const a = new Uint8Array(208 * 40 * 208), b = new Uint8Array(208 * 40 * 208);
  WG.genWorld(a, 457473416); WG.genWorld(b, 457473416);
  let same = true; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) { same = false; break; }
  ok(same, 'genWorld determinista: misma seed → mismo buffer');
  const c = new Uint8Array(208 * 40 * 208);
  WG.genWorld(c, 457473417);
  let diff = false; for (let k = 0; k < c.length; k++) if (a[k] !== c[k]) { diff = true; break; }
  ok(diff, 'genWorld sensible a la seed: seeds distintas → buffers distintos');
  const h = fnv1a(a);
  ok(h === GOLDEN_FNV, `hash dorado del buffer con seed ${GOLDEN_SEED} (${h}${h === GOLDEN_FNV ? '' : ' ≠ ' + GOLDEN_FNV + ' ⚠️ el terreno cambió'})`);
  ok(typeof WG.mulberry === 'function' && WG.hash2(-48, -48) >= 0 && WG.hash2(-48, -48) < 1, 'hash2/mulberry expuestos y en rango');
});

// ─────────────────────────── grupo 2: colisión de mob ───────────────────────────
// ---- extracción de los predicados de mob (bloque worldgen) ----
let WGP = null;
if (present) {
  try {
    WGP = new Function(code + '\n;return {WG_W,WG_H,WG_SURFACE,mobBlocked,topSolidY,freeForMob};')();
    ok(true, 'predicados de mob expuestos (mobBlocked/topSolidY/freeForMob)');
  } catch (e) { ok(false, 'predicados de mob expuestos: ' + e.message); }
}
const T2 = (name, fn) => { if (!WGP) { ok(false, `${name}: sin predicados de mob`); return; } try { fn(); } catch (e) { ok(false, `${name}: ${e.message}`); } };

// 2.1 mobBlocked: exento lo pasable, bloquea el resto
T2('mobBlocked', () => {
  const pasable = [0, 12, 13, 14, 33, 24, 28, 30, 32];      // aire, agua, flores, antorcha, puertas abiertas
  const traba  = [1, 2, 3, 4, 6, 7, 8, 10, 23, 27, 29, 31, 34, 39]; // pasto..escaleras, puertas cerradas
  const badP = pasable.filter(v => WGP.mobBlocked(v) !== false);
  const badT = traba.filter(v => WGP.mobBlocked(v) !== true);
  ok(badP.length === 0, `mobBlocked no bloquea lo pasable (${pasable.length} ids)${badP.length ? ' malos:' + badP : ''}`);
  ok(badT.length === 0, `mobBlocked bloquea lo sólido (${traba.length} ids)${badT.length ? ' malos:' + badT : ''}`);
});

// 2.3 drift: mobBlocked vs isSolid derivado de DEFS id por id
{
  const grabObj = (marker) => {
    let i = html.indexOf(marker); i = html.indexOf('{', i);
    let depth = 0;
    for (let j = i; j < html.length; j++) {
      if (html[j] === '{') depth++;
      if (html[j] === '}') { depth--; if (depth === 0) return html.slice(i, j + 1); }
    }
    throw new Error('no balanceado: ' + marker);
  };
  let DEFS = null;
  try {
    const idDecl = html.match(/const AIR=0, GRASS=1[\s\S]*?BED_Z_HEAD=63;/)[0];
    DEFS = new Function(idDecl + '; const SWORD=100, PICK=101; return (' + grabObj('const DEFS = ') + ');')();
  } catch (e) { ok(false, 'parseo de DEFS para drift: ' + e.message); }
  if (DEFS && WGP) {
    // misma regla que isSolid del cliente: door abierta pasa; cube|glow traba.
    const isSolidOf = (id) => {
      if (id === 0) return false;             // AIR (sin entrada en DEFS)
      const d = DEFS[id]; if (!d) return false;
      if (d.door) return !d.open;
      return !!(d.cube || d.glow);
    };
    // los ítems (espada/pico) no son bloques del mundo: no entran en la comparación
    const ids = [0, ...Object.keys(DEFS).map(Number).filter(id => !DEFS[id].item)];
    const bad = ids.filter(id => isSolidOf(id) !== WGP.mobBlocked(id));
    ok(bad.length === 0, `sin drift mobBlocked↔DEFS (${ids.length} ids)${bad.length ? ' — discrepan:' + bad.join(',') : ''}`);
  }
}

// 2.5 topSolidY / freeForMob sobre un buffer armado a mano
T2('topSolidY/freeForMob', () => {
  const W = WGP.WG_W, H = WGP.WG_H, WATER_Y = WGP.WG_SURFACE;
  const mk = () => new Uint8Array(W * H * W);
  const cell = (buf, x, y, z, v) => { buf[(y * W + z) * W + x] = v; };

  const a = mk(); cell(a, 50, 5, 50, 1);              // GRASS en y=5
  ok(WGP.topSolidY(a, 50, 50) === 6, `sólido en y=5 → topSolidY=6 (${WGP.topSolidY(a, 50, 50)})`);
  ok(WGP.freeForMob(a, 50, 6, 50) === true, 'freeForMob sobre el suelo: cuerpo libre');
  ok(WGP.freeForMob(a, 50, 5, 50) === false, 'freeForMob dentro del bloque: ocupado');

  const b = mk();                                     // columna de aire: sin suelo
  ok(WGP.topSolidY(b, 5, 5) === 0, `columna de aire → topSolidY=0 (${WGP.topSolidY(b, 5, 5)})`);
  ok(WGP.freeForMob(b, 5, 5, 5) === true, 'aire: freeForMob libre');

  const wcol = mk(); for (let y = 0; y <= WATER_Y; y++) cell(wcol, 7, y, 7, 12); // agua hasta el nivel del mar
  ok(WGP.topSolidY(wcol, 7, 7) === 0, 'el agua no es suelo para el mob');
  ok(WGP.freeForMob(wcol, 7, WATER_Y, 7) === true, 'el agua no bloquea al mob');

  const hi = mk(); cell(hi, 9, 5, 9, 1); cell(hi, 9, 7, 9, 3); // suelo y techo con una celda libre en 6
  ok(WGP.freeForMob(hi, 9, 6, 9) === false, 'freeForMob exige 2 bloques libres (cuerpo completo)');
  ok(WGP.topSolidY(hi, 9, 9) === 8, `topSolidY usa el sólido más alto + 1 (${WGP.topSolidY(hi, 9, 9)})`);
});

// 2.10 bordes: el índice idx=(y*208+z)*208+x con stride 208 mapea a la celda correcta
T2('parcheo por índice (stride 208)', () => {
  const W = WGP.WG_W, H = WGP.WG_H;
  const corners = [[0, 0, 0], [207, 39, 207], [0, 39, 207], [207, 0, 0], [0, 5, 207], [207, 5, 0]];
  let mappingOk = true;
  for (const [x, y, z] of corners) {
    const idx = (y * 208 + z) * 208 + x;
    if (idx < 0 || idx >= W * H * W) { mappingOk = false; break; }
    const buf = new Uint8Array(W * H * W); buf[idx] = 3;                 // STONE via índice
    if (WGP.topSolidY(buf, x, z) !== y + 1) { mappingOk = false; break; } // el bloque cae en (x,z) a la altura y
  }
  ok(mappingOk, 'idx→(x,y,z) con stride 208 correcto en los bordes (x=0/207, z=0/207, y=0/39)');
});

// 2.7/2.9 el servidor carga el bloque desde index.html y escribe el mundo replicado
{
  const srv = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
  ok(/worldgen:start/.test(srv), 'server.js referencia el marcador worldgen:start (extrae el bloque)');
  ok(/function loadWorldGen\s*\(/.test(srv), 'server.js define loadWorldGen()');
  ok(/loadWorldGen\s*\(\s*STATIC\s*\)/.test(srv), 'server.js llama loadWorldGen(STATIC)');
  ok(/\.genWorld\s*\(/.test(srv), 'server.js llama genWorld(...) para replicar el mundo');
  ok(/new Uint8Array\s*\(/.test(srv), 'server.js aloja el buffer del mundo (Uint8Array)');
  ok(!/function\s+(hash2|hAt|vnoise|mulberry|genWorld)\s*\(/.test(srv),
    'server.js NO define un generador propio (sin hash2/hAt/vnoise/mulberry/genWorld)');
  ok(/world\[idx\]\s*=\s*v/.test(srv), 'el handler edit del server escribe world[idx]=v (mismo índice)');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 worldgen OK');

