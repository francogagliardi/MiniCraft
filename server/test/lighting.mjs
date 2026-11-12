// Tests de iluminación (change luces-y-antorchas, specs world/lighting, blocks/torch,
// blocks/lamp, blocks/placement y ui/config): extrae el bloque /* lighting:start */ ...
// /* lighting:end */ de index.html y lo evalúa aislado con `new Function` SIN THREE
// (mismo patrón que cactus.mjs/worldgen.mjs). Encima, estáticos con grabFn/grabObj sobre
// el cableado del cliente (pool de 8 PointLight + 8 SpotLight de farola, visibilidad fija
// por nivel de calidad —sin recompilas en caliente—, sin sombras dinámicas en el pool,
// presupuesto por calidad, reparto spots/puntos —la farola nunca usa un punto—, brillo
// clampeado y reaplicado, índice por chunk, selección cada 250 ms, colocación por cara y
// cascada de soporte) y una
// guarda de regresión sobre la validación del servidor (v <= 64, sin validar soporte).
// Uso: node test/lighting.mjs   (sale con código != 0 si algo falla)
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
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Extrae `function NAME(...) { ... }` con llaves balanceadas ('' si no existe).
const grabFn = (name) => {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let depth = 0, started = false;
  for (let k = i; k < html.length; k++) {
    if (html[k] === '{') { depth++; started = true; }
    else if (html[k] === '}') { depth--; if (started && depth === 0) return html.slice(i, k + 1); }
  }
  return '';
};
// Extrae `{ ... }` balanceado a partir del primer `{` después de `marker`.
const grabObj = (marker) => {
  let i = html.indexOf(marker);
  if (i < 0) throw new Error('no encontrado: ' + marker);
  i = html.indexOf('{', i);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    if (html[j] === '}') { depth--; if (depth === 0) return html.slice(i, j + 1); }
  }
  throw new Error('no balanceado: ' + marker);
};
// Extrae la rama `else if(m.t==='pedit'){ ... }` completa.
const grabBranch = (tag) => {
  const i = html.indexOf(`m.t==='${tag}'`);
  if (i < 0) return '';
  let j = html.indexOf('{', i);
  let depth = 0;
  for (let k = j; k < html.length; k++) {
    if (html[k] === '{') depth++;
    if (html[k] === '}') { depth--; if (depth === 0) return html.slice(j, k + 1); }
  }
  return '';
};

// ---- extracción del bloque lighting (sin THREE / DOM) ----
const START = '/* lighting:start */', END = '/* lighting:end */';
const i = html.indexOf(START), j = html.indexOf(END);
const present = i >= 0 && j > i;
ok(present, 'bloque lighting presente en index.html');
const block = present ? html.slice(i, j) : '';
let API = null;
if (present) {
  try {
    // Los símbolos nuevos se leen con `typeof`: en RED no existen y eso no debe romper
    // los chequeos viejos del bloque (el rojo tiene que ser por la feature ausente).
    API = new Function(block + '\n;return {LT_TORCH, LT_GLOW, LT_LAMP, LIGHT_BUDGET, ' +
      'POINT_VISIBLE: typeof POINT_VISIBLE !== "undefined" ? POINT_VISIBLE : undefined, ' +
      'SPOT_VISIBLE: typeof SPOT_VISIBLE !== "undefined" ? SPOT_VISIBLE : undefined, ' +
      'LIGHT_MAX_DIST, LIGHT_FADE_BAND, LIGHT_PICK_MS, LIGHT_SPEC, isLightEmitter, torchSupportKind, ' +
      'torchQuads, lightAnchor, lightFade, ' +
      'LAMP_POOL_SIZE: typeof LAMP_POOL_SIZE === "number" ? LAMP_POOL_SIZE : undefined, ' +
      'LAMP_SPOT_ANGLE: typeof LAMP_SPOT_ANGLE === "number" ? LAMP_SPOT_ANGLE : undefined, ' +
      'LAMP_SPOT_PENUMBRA: typeof LAMP_SPOT_PENUMBRA === "number" ? LAMP_SPOT_PENUMBRA : undefined, ' +
      'lightSlots: typeof lightSlots === "function" ? lightSlots : null, ' +
      'clampBrightness: typeof clampBrightness === "function" ? clampBrightness : null, ' +
      'paletteFactor: typeof paletteFactor === "function" ? paletteFactor : null, ' +
      'TORCH_WALL_INSET: typeof TORCH_WALL_INSET === "number" ? TORCH_WALL_INSET : undefined, ' +
      'ENCLOSED_DIM: typeof ENCLOSED_DIM === "number" ? ENCLOSED_DIM : undefined, ' +
      'skyExposed: typeof skyExposed === "function" ? skyExposed : null, ' +
      'SKY_REACH_RADIUS: typeof SKY_REACH_RADIUS === "number" ? SKY_REACH_RADIUS : undefined, ' +
      'skyReachable: typeof skyReachable === "function" ? skyReachable : null, ' +
      'blockedLOS: typeof blockedLOS === "function" ? blockedLOS : null};')();
    ok(true, 'bloque lighting evaluable SIN THREE ni DOM');
  } catch (e) { ok(false, 'bloque lighting evaluable SIN THREE: ' + e.message); }
}
const T = (name, fn) => {
  if (!API) { ok(false, `${name}: sin API lighting`); return; }
  try { fn(); } catch (e) { ok(false, `${name}: ${e.message}`); }
};

// 1. constantes y fuentes luminosas
T('isLightEmitter', () => {
  ok(API.LT_TORCH === 33, `LT_TORCH es el id 33 (${API.LT_TORCH})`);
  ok(API.LT_GLOW === 10, `LT_GLOW es el id 10 (${API.LT_GLOW})`);
  ok(API.LT_LAMP === 64, `LT_LAMP es el id 64 (${API.LT_LAMP})`);
  ok(API.isLightEmitter(33) === true, 'la antorcha emite luz');
  ok(API.isLightEmitter(10) === false, 'la lucerita SOLO brilla: no emite luz');
  ok(API.LIGHT_SPEC[10] === undefined, 'la lucerita no tiene especificación de luz');
  ok(API.isLightEmitter(64) === true, 'la farola emite luz');
  for (const id of [0, 1, 8, 12, 32, 34, 59, 63, 65, 100, 101, 255])
    ok(API.isLightEmitter(id) === false, `el bloque ${id} no emite luz`);
});

T('presupuesto y visibilidad fija por calidad', () => {
  ok(Array.isArray(API.POINT_VISIBLE) && API.POINT_VISIBLE.length === 3,
    `POINT_VISIBLE tiene un valor por nivel (${JSON.stringify(API.POINT_VISIBLE)})`);
  ok(JSON.stringify(API.POINT_VISIBLE) === '[0,2,8]',
    `POINT_VISIBLE = [0,2,8] puntos por nivel (${JSON.stringify(API.POINT_VISIBLE)})`);
  ok(Array.isArray(API.SPOT_VISIBLE) && API.SPOT_VISIBLE.length === 3,
    `SPOT_VISIBLE tiene un valor por nivel (${JSON.stringify(API.SPOT_VISIBLE)})`);
  ok(JSON.stringify(API.SPOT_VISIBLE) === '[0,2,8]',
    `SPOT_VISIBLE = [0,2,8] spots por nivel (${JSON.stringify(API.SPOT_VISIBLE)})`);
  ok(Array.isArray(API.LIGHT_BUDGET) && API.LIGHT_BUDGET.length === 3,
    `LIGHT_BUDGET tiene un valor por nivel (${JSON.stringify(API.LIGHT_BUDGET)})`);
  ok(API.LIGHT_BUDGET[0] === 0, `nivel 0 (2 núcleos) → 0 luces (${API.LIGHT_BUDGET[0]})`);
  ok(API.LIGHT_BUDGET[1] === 4, `nivel 1 → 2 puntos + 2 spots = 4 luces (${API.LIGHT_BUDGET[1]})`);
  ok(API.LIGHT_BUDGET[2] === 16, `nivel 2 → 8 puntos + 8 spots = 16 luces (${API.LIGHT_BUDGET[2]})`);
  for (let n = 0; n < 3; n++)
    ok(API.LIGHT_BUDGET[n] === API.POINT_VISIBLE[n] + API.SPOT_VISIBLE[n],
      `nivel ${n}: el presupuesto es la suma de puntos y spots visibles`);
  ok(API.LIGHT_MAX_DIST === 20, `LIGHT_MAX_DIST = 20 (${API.LIGHT_MAX_DIST})`);
  ok(API.LIGHT_FADE_BAND === 6, `LIGHT_FADE_BAND = 6 (${API.LIGHT_FADE_BAND})`);
  ok(API.LIGHT_PICK_MS === 250, `LIGHT_PICK_MS = 250 ms (${API.LIGHT_PICK_MS})`);
});

T('LIGHT_SPEC por bloque', () => {
  const t = API.LIGHT_SPEC[33], l = API.LIGHT_SPEC[64];
  ok(!!t && !!l, 'hay especificación para antorcha y farola');
  ok(API.LIGHT_SPEC[10] === undefined, 'la lucerita NO tiene especificación de luz (material unlit)');
  if (!t || !l) return;
  ok(l.intensity > t.intensity,
    `intensidad lamp > torch (${l.intensity} > ${t.intensity})`);
  ok(l.distance > t.distance,
    `distancia lamp > torch (${l.distance} > ${t.distance})`);
  for (const [name, s] of [['antorcha', t], ['farola', l]]) {
    ok(typeof s.color === 'number', `${name}: color numérico (${s.color})`);
    ok(s.decay === 2, `${name}: decay = 2 (unidades físicas de r160)`);
    ok(Array.isArray(s.anchor) && s.anchor.length === 3, `${name}: ancla [x,y,z]`);
    ok(s.anchor.every(v => v >= 0 && v <= 1), `${name}: el ancla cae dentro de la celda`);
  }
});

// 1b. fade suave antes del corte por distancia (evita el pop al alejarse)
T('lightFade', () => {
  const max = API.LIGHT_MAX_DIST, band = API.LIGHT_FADE_BAND;
  ok(API.lightFade(0, max, band) === 1, 'a distancia 0 la luz está al 100 %');
  ok(API.lightFade(max - band, max, band) === 1, `a ${max - band} bloques sigue al 100 %`);
  ok(API.lightFade(max, max, band) === 0, `en el corte (${max}) la luz vale 0`);
  ok(API.lightFade(max + 5, max, band) === 0, 'más allá del corte sigue en 0');
  ok(API.lightFade(-3, max, band) === 1, 'distancias negativas se clampean a 1');
  let prev = 1, mono = true;
  for (let d = max - band + 0.5; d < max; d += 0.5) {
    const f = API.lightFade(d, max, band);
    if (f > prev + 1e-9) mono = false;
    prev = f;
  }
  ok(mono, 'dentro de la banda el factor decrece de forma monótona');
  const mid = API.lightFade(max - band / 2, max, band);
  ok(mid > 0 && mid < 1, `a mitad de la banda el factor es parcial (${mid.toFixed(3)})`);
  ok(Math.abs(API.lightFade(max - band * 0.1, max, band)) < 0.05,
    'cerca del corte el factor es casi nulo (sin salto visible)');
});

// 2. orientación de la antorcha: precedencia piso → techo → pared → fallback
T('torchSupportKind', () => {
  const kindOf = (s) => API.torchSupportKind(s);
  const k = (s) => kindOf(s).kind;
  const d = (s) => kindOf(s).dir;
  ok(k({ below: true }) === 'floor', 'soporte abajo → piso');
  ok(k({ above: true }) === 'ceiling', 'soporte arriba (sin abajo) → techo');
  for (const [flag, axis, sign] of [['px', 0, -1], ['nx', 0, 1], ['pz', 2, -1], ['nz', 2, 1]]) {
    const s = { [flag]: true };
    ok(k(s) === 'wall', `soporte lateral ${flag} → pared`);
    const dir = d(s);
    ok(Array.isArray(dir) && dir[axis] === sign &&
      dir.filter((v, n) => n !== axis).every(v => v === 0),
      `pared ${flag}: la normal sale del soporte hacia la celda ${JSON.stringify(dir)}`);
  }
  ok(k({ below: true, above: true, px: true }) === 'floor', 'precedencia: piso gana a techo y pared');
  ok(k({ above: true, px: true }) === 'ceiling', 'precedencia: techo gana a pared');
  ok(k({ px: true, nx: true, pz: true, nz: true }) === 'wall' && d({ nx: true }).join() === '1,0,0',
    'precedencia entre paredes: +X, -X, +Z, -Z');
  ok(k({}) === 'floor', 'sin soporte reconocible → fallback piso');
  ok(k(undefined) === 'floor', 'sin datos de soporte → fallback piso');
  ok(d({ below: true }).join() === '0,1,0' && d({ above: true }).join() === '0,-1,0',
    'las normales de piso/techo apuntan a la cara del soporte');
});

T('torchQuads', () => {
  const cases = [['floor', [0, 1, 0]], ['ceiling', [0, -1, 0]],
    ['wall', [1, 0, 0]], ['wall', [-1, 0, 0]], ['wall', [0, 0, 1]], ['wall', [0, 0, -1]]];
  for (const [kind, dir] of cases) {
    const q = API.torchQuads(kind, dir);
    const tag = `${kind} ${JSON.stringify(dir)}`;
    ok(Array.isArray(q) && q.length === 8, `${tag}: devuelve 8 vértices (2 cross-quads)`);
    if (!Array.isArray(q) || q.length !== 8) continue;
    // Piso/techo: los 8 vértices quedan dentro de la celda. La pared se embebe en el
    // soporte a propósito (el palo tiene margen transparente): lo cubre su propio test.
    ok(kind === 'wall' || q.every(p => Array.isArray(p) && p.length === 3 && p.every(v => v >= 0 && v <= 1)),
      `${tag}: los 8 vértices caen dentro de la celda`);
  }
  // piso: palo abajo, llama arriba (índices 0/1 = palo, 2/3 = llama en cada quad)
  const fl = API.torchQuads('floor', [0, 1, 0]);
  const yBase = (q) => (q[0][1] + q[1][1] + q[4][1] + q[5][1]) / 4;
  const yTip = (q) => (q[2][1] + q[3][1] + q[6][1] + q[7][1]) / 4;
  ok(yBase(fl) < yTip(fl), `piso: el palo queda abajo y la llama arriba (${yBase(fl)} < ${yTip(fl)})`);
  // techo: colgada, llama abajo
  const ce = API.torchQuads('ceiling', [0, -1, 0]);
  ok(yBase(ce) > yTip(ce), `techo: la llama cuelga hacia abajo (${yBase(ce)} > ${yTip(ce)})`);
  // pared: la llama queda del lado libre (más lejos de la pared que la base)
  for (const [dir, axis, sign] of [[[1, 0, 0], 0, 1], [[-1, 0, 0], 0, -1], [[0, 0, 1], 2, 1], [[0, 0, -1], 2, -1]]) {
    const q = API.torchQuads('wall', dir);
    const base = (q[0][axis] + q[1][axis] + q[4][axis] + q[5][axis]) / 4;
    const tip = (q[2][axis] + q[3][axis] + q[6][axis] + q[7][axis]) / 4;
    ok(sign > 0 ? tip > base : tip < base,
      `pared ${JSON.stringify(dir)}: la llama se inclina hacia el lado libre (${tip.toFixed(3)} vs ${base.toFixed(3)})`);
    // La cara del soporte queda en 0 (+dir) o 1 (-dir): la base no puede quedar flotando.
    const face = sign > 0 ? 0 : 1, gap = Math.abs(base - face);
    ok(gap <= .1, `pared ${JSON.stringify(dir)}: la base queda pegada a la cara (${gap.toFixed(3)} ≤ .1)`);
  }
});

// 1-bis. antorcha de pared: el quad se embebe en la cara para que el dibujo del palo
// (que tiene margen transparente en la textura) arranque pegado a la pared.
T('antorcha de pared embebida', () => {
  const inset = API.TORCH_WALL_INSET;
  ok(typeof inset === 'number' && inset > 0 && inset <= .1,
    `existe TORCH_WALL_INSET acotado a (0,.1] (${inset})`);
  for (const [dir, axis, sign] of [[[1, 0, 0], 0, 1], [[-1, 0, 0], 0, -1], [[0, 0, 1], 2, 1], [[0, 0, -1], 2, -1]]) {
    const q = API.torchQuads('wall', dir);
    const tag = `pared ${JSON.stringify(dir)}`;
    ok(Array.isArray(q) && q.length === 8 && q.every(p => Array.isArray(p) && p.length === 3),
      `${tag}: devuelve 8 vértices 3D`);
    if (!Array.isArray(q) || q.length !== 8) continue;
    // Coordenada relativa a la cara del soporte: el quad tiene que cruzar la cara
    // (parte adentro del bloque, oculta por la pared opaca; parte afuera, visible).
    const face = sign > 0 ? 0 : 1;
    const rel = q.map(p => p[axis] - face);
    ok(Math.min(...rel) < 0 && Math.max(...rel) > 0,
      `${tag}: el quad cruza la cara (${Math.min(...rel).toFixed(3)} … ${Math.max(...rel).toFixed(3)})`);
    // El resto de las coordenadas (ejes no soporte) sigue dentro de la celda.
    ok(q.every(p => [0, 1, 2].filter(a => a !== axis).every(a => p[a] >= 0 && p[a] <= 1)),
      `${tag}: el resto de coordenadas queda en [0,1]`);
    // La base queda pegada a la cara: su centro cae dentro del inset (no flota).
    const base = [0, 1, 4, 5].map(k => q[k][axis]);
    const center = base.reduce((a, b) => a + b, 0) / base.length;
    ok(Math.abs(center - face) <= .02 + 1e-9,
      `${tag}: la base queda pegada a la cara (${Math.abs(center - face).toFixed(3)} ≤ .02)`);
    const a = API.lightAnchor('wall', dir);
    ok(a.every(v => v >= 0 && v <= 1),
      `${tag}: el ancla de luz acompaña el inset y sigue dentro de la celda (${JSON.stringify(a)})`);
  }
});

T('lightAnchor', () => {
  const cases = [['floor', [0, 1, 0]], ['ceiling', [0, -1, 0]],
    ['wall', [1, 0, 0]], ['wall', [-1, 0, 0]], ['wall', [0, 0, 1]], ['wall', [0, 0, -1]]];
  for (const [kind, dir] of cases) {
    const a = API.lightAnchor(kind, dir);
    ok(Array.isArray(a) && a.length === 3 && a.every(v => v >= 0 && v <= 1),
      `ancla ${kind} ${JSON.stringify(dir)} dentro de la celda (${JSON.stringify(a)})`);
  }
  const fl = API.lightAnchor('floor', [0, 1, 0]), ce = API.lightAnchor('ceiling', [0, -1, 0]);
  ok(near(fl[1], 0.62, 1e-9), `antorcha de piso: la luz sale a y=0.62 (${fl[1]})`);
  ok(near(ce[1], 0.28, 1e-9), `antorcha de techo: la luz sale a y=0.28 (${ce[1]})`);
  const w = API.lightAnchor('wall', [1, 0, 0]);
  ok(w[0] > 0.1, `antorcha de pared +X: la luz sale hacia el lado libre (x=${w[0].toFixed(3)})`);
});

// 2b. cielo visible desde la celda del jugador (atenuación ambiental bajo techo)
T('ENCLOSED_DIM y skyExposed', () => {
  // Encerrarse tiene que verse como de noche: un ambiente casi apagado, no un 32 %.
  ok(typeof API.ENCLOSED_DIM === 'number' && API.ENCLOSED_DIM > 0 && API.ENCLOSED_DIM <= .15,
    `ENCLOSED_DIM es nivel noche: (0,.15] (${API.ENCLOSED_DIM})`);
  const f = API.skyExposed;
  ok(typeof f === 'function', 'existe skyExposed(isOpaqueAt, x, y, z, top)');
  if (typeof f !== 'function') return;
  // Columna de prueba: isOpaqueAt responde solo para las celdas de la lista.
  const at = (cells) => (x, y, z) => cells.some(([cx, cy, cz]) => cx === x && cy === y && cz === z);
  ok(f(at([]), 3, 2, 4, 10) === true, 'columna abierta → ve el cielo');
  ok(f(at([[3, 5, 4]]), 3, 2, 4, 10) === false, 'bloque opaco arriba → no ve el cielo');
  ok(f(at([[3, 2, 4]]), 3, 2, 4, 10) === true, 'un bloque en la misma celda no tapa (ya está adentro)');
  ok(f(at([[3, 1, 4]]), 3, 2, 4, 10) === true, 'un bloque abajo no tapa el cielo');
  ok(f(at([[3, 10, 4]]), 3, 2, 4, 10) === false, 'el borde superior (top) se revisa inclusive');
  ok(f(at([[3, 11, 4]]), 3, 2, 4, 10) === true, 'por encima de top no se revisa');
  ok(f(at([[3, 9, 4]]), 3, 10, 4, 10) === true, 'en el borde (y === top) no hay celdas arriba');
});

// 2b-ter. accesibilidad al cielo por aire: una ventana también deja entrar el día
T('skyReachable: cielo accesible por ventanas y aberturas', () => {
  const f = API.skyReachable;
  ok(typeof f === 'function', 'existe skyReachable(isOpaqueAt, x0, y0, z0, top, radius)');
  if (typeof f !== 'function') return;
  ok(typeof API.SKY_REACH_RADIUS === 'number' &&
    API.SKY_REACH_RADIUS > 0 && API.SKY_REACH_RADIUS < 40,
    `SKY_REACH_RADIUS acotado a (0,40) (${API.SKY_REACH_RADIUS})`);

  const TOP = 20, r = API.SKY_REACH_RADIUS;
  const at = (cells) => (x, y, z) => cells.some(([cx, cy, cz]) => cx === x && cy === y && cz === z);
  // Cáscara hueca del cubo [x0..x1]×[y0..y1]×[z0..z1]: el interior queda vacío.
  const shell = (x0, y0, z0, x1, y1, z1) => {
    const cells = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
      if (x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1)
        cells.push([x, y, z]);
    return cells;
  };

  // Exterior: nada tapa la columna.
  ok(f(at([]), 30, 10, 30, TOP, r) === true, 'exterior sin techo → alcanza el cielo');

  // Caja cerrada de 3x3x3 con la cabeza adentro (la columna vertical está tapada).
  const box = shell(4, 8, 4, 8, 12, 8);
  ok(f(at(box), 6, 10, 6, TOP, r) === false, 'caja cerrada sin aberturas → encerrado');

  // La misma caja con un hueco de 1 bloque en una pared: se sale por la ventana.
  const hole = box.filter(([x, y, z]) => !(x === 4 && y === 10 && z === 6));
  ok(f(at(hole), 6, 10, 6, TOP, r) === true,
    'caja con un hueco de 1 bloque en la pared → alcanza el cielo');

  // Ventana de vidrio: la celda existe en el mundo pero el predicado no la considera opaca.
  const glass = [4, 10, 6];
  const withGlass = (x, y, z) => at(box)(x, y, z) &&
    !(x === glass[0] && y === glass[1] && z === glass[2]);
  ok(f(withGlass, 6, 10, 6, TOP, r) === true,
    'la ventana de vidrio no bloquea el cielo (el predicado no la marca opaca)');

  // Cueva/pasillo techado con la única abertura lejos: el radio decide si se llega.
  const tunnel = [];
  for (let x = -20; x <= 20; x++) {
    for (let z = -1; z <= 1; z++) tunnel.push([x, 9, z], [x, 11, z]);
    tunnel.push([x, 10, -1], [x, 10, 1]);
  }
  for (let z = -1; z <= 1; z++) tunnel.push([-20, 10, z], [20, 10, z]);
  const openTunnel = tunnel.filter(([x, y, z]) => !(x === 10 && y === 11 && z === 0));
  ok(f(at(tunnel), 0, 10, 0, TOP, 24) === false, 'cueva sin salida → encerrado');
  ok(f(at(openTunnel), 0, 10, 0, TOP, 3) === false, 'radio insuficiente → no llega a la abertura');
  ok(f(at(openTunnel), 0, 10, 0, TOP, 24) === true, 'con radio suficiente llega a la abertura');

  // Bordes del cubo vertical.
  ok(f(at([]), 5, TOP, 5, TOP, r) === true, 'y0 === top → ya está a cielo abierto');
  ok(f(at([[5, 0, 5]]), 5, TOP + 3, 5, TOP, r) === true, 'y0 > top → cielo abierto');
});

// 2b-bis. oclusión por línea de vista: la luz no atraviesa paredes (independiente de la
// calidad gráfica y de cuál sea la fuente más cercana)
T('blockedLOS: la luz no atraviesa paredes', () => {
  const f = API.blockedLOS;
  ok(typeof f === 'function', 'existe blockedLOS(isOpaqueAt, ax,ay,az, bx,by,bz)');
  if (typeof f !== 'function') return;
  const at = (cells) => (x, y, z) => cells.some(([cx, cy, cz]) => cx === x && cy === y && cz === z);
  // Pasillo horizontal a la altura del ojo: fuente en (0,·,0), ojo en (5,·,0).
  ok(f(at([]), .5, 1.5, .5, 5.5, 1.5, .5) === false, 'camino abierto → false');
  ok(f(at([[3, 3, 0]]), .5, 1.5, .5, 5.5, 1.5, .5) === false,
    'un bloque fuera del segmento no tapa');
  ok(f(at([[3, 1, 0]]), .5, 1.5, .5, 5.5, 1.5, .5) === true,
    'pared opaca entre la fuente y el ojo → true');
  ok(f(at([[3, 1, 0], [3, 2, 0], [3, 0, 0]]), .5, 1.5, .5, 5.5, 1.5, .5) === true,
    'una pared de varios bloques también tapa');
  ok(f(at([[1, 1, 0]]), .5, 1.5, .5, 5.5, 1.5, .5) === true,
    'un bloque pegado a la fuente ya tapa');
  // Muro en diagonal (la luz no puede colarse por el vértice de una pared recta).
  ok(f(at([[2, 1, 2]]), .5, 1.5, .5, 5.5, 1.5, 5.5) === true,
    'muro en diagonal → true');
  ok(f(at([[2, 1, 2], [3, 1, 3], [4, 1, 4]]), .5, 1.5, .5, 5.5, 1.5, 5.5) === true,
    'muro diagonal de varios bloques → true');
  // Extremos: ni la celda de la fuente ni la del ojo cuentan como oclusores.
  ok(f(at([[0, 1, 0]]), .2, 1.3, .2, .8, 1.6, .7) === false,
    'origen y destino en la misma celda → false (no se auto-oclupe)');
  ok(f(at([[0, 1, 0]]), .2, 1.3, .2, .8, 1.9, .7) === false,
    'la celda del ojo no se cuenta como pared');
  ok(f(at([]), .5, 1.5, .5, .5, 1.5, .5) === false, 'distancia cero → false');
  ok(f(at([]), .5, 1.5, .5, 20.5, 1.5, 20.5) === false,
    'camino largo y abierto → false');
});

// 2c. estáticos: el loop atenúa el ambiente y la atmósfera respeta ambientK
{
  const ap = grabFn('applyAtmosphere');
  ok(/ambientK/.test(ap), 'applyAtmosphere multiplica por ambientK');
  ok(/const d\s*=\s*paletteFactor\(L\)/.test(ap),
    'applyAtmosphere deriva la paleta (d) de paletteFactor(L), no del brillo');
  ok(!/const d\s*=\s*\(Lb - NIGHT_MIN\)/.test(ap),
    'applyAtmosphere ya no mezcla el brillo en la paleta del cielo');
  ok(/HEMI_DAY\s*\*\s*Lb\s*\*\s*ambientK/.test(ap),
    'la luz ambiental baja con ambientK (HEMI_DAY * Lb * ambientK)');
  ok(/SUN_DAY\s*\*\s*Lb\s*\*\s*ambientK/.test(ap),
    'la luz del sol baja con ambientK (SUN_DAY * Lb * ambientK)');
  // Lb solo puede aparecer en las intensidades (hemi/sun), nunca en los colores.
  const apColors = ap
    .replace(/\/\/[^\n]*/g, '')
    .replace(/const Lb\s*=\s*brightLevel\(L\);/, '')
    .replace(/hemi\.intensity\s*=[^;]*;/g, '')
    .replace(/sun\.intensity\s*=[^;]*;/g, '');
  ok(!/\bLb\b/.test(apColors), 'applyAtmosphere usa Lb solo en las intensidades');

  const ts = grabFn('tickSky');
  ok(/const d\s*=\s*paletteFactor\(L\)/.test(ts),
    'tickSky deriva la visibilidad del cielo de paletteFactor(L)');
  ok(!/const d\s*=\s*\(Lb - NIGHT_MIN\)/.test(ts),
    'tickSky ya no mezcla el brillo en la visibilidad del sol/luna');
  ok(/sunSprite\.visible\s*=\s*[^;]*\bd\s*>\s*0\.15/.test(ts),
    'la visibilidad del sol sale de la paleta (d), no del brillo');
  ok(/moonLight\.intensity[^;]*ambientK/.test(ts),
    'tickSky multiplica la luz de la luna por ambientK');
  ok(/sun\.intensity[^;]*ambientK/.test(ts),
    'tickSky también atenúa el sol con ambientK (no lo repone en cada frame)');
  const tsColors = ts
    .replace(/\/\/[^\n]*/g, '')
    .replace(/const Lb\s*=\s*brightLevel\([^)]*\);/, '')
    .replace(/sun\.intensity\s*=[^;]*;/g, '')
    .replace(/moonLight\.intensity\s*=[^;]*;/g, '');
  ok(!/\bLb\b/.test(tsColors), 'tickSky usa Lb solo en las intensidades');

  const loop = grabFn('loop');
  ok(/skyReachable\s*\(/.test(loop), 'loop() consulta skyReachable para la celda de la cabeza');
  ok(!/skyExposed\s*\(/.test(loop), 'loop() ya no usa skyExposed (solo miraba la columna)');
  ok(/Math\.floor\(player\.pos\.y\)\s*\+\s*1/.test(loop),
    'loop() parte de la celda de la cabeza (Math.floor(player.pos.y)+1)');
  ok(/SKY_REACH_RADIUS/.test(loop) && /H\s*-\s*1/.test(loop),
    'loop() acota el BFS a SKY_REACH_RADIUS con top = H-1');
  ok(/isOpaque\s*\(/.test(loop), 'loop() evalúa opacidad con isOpaque(get(...))');
  ok(/isDoor\s*\(/.test(loop) && /doorOpen\s*\(/.test(loop) && /get\s*\(/.test(loop),
    'loop() trata la puerta cerrada como opaca (el vidrio y la losa no bloquean)');
  ok(/skyCell/.test(loop) && /skyPending/.test(loop),
    'loop() solo recalcula al cambiar de celda de la cabeza (skyCell/skyPending)');
  ok(/300/.test(loop), 'loop() limita el BFS a ~0.3 s como máximo');
  ok(/ENCLOSED_DIM/.test(loop), 'loop() atenúa hacia ENCLOSED_DIM cuando está encerrado');
  ok(/ambientK\s*\+=/.test(loop) && /dt/.test(loop),
    'loop() suaviza ambientK con interpolación por dt');
  ok(/ambientK\s*\+=[^;]*dt\s*\*\s*6/.test(loop),
    'loop() suaviza ambientK más rápido (dt*6): el encierro llega a nivel noche');
  ok(/airAmbient/.test(loop) && /ambientK\s*-\s*airAmbient/.test(loop),
    'el guard de reaplicación incluye ambientK vs airAmbient');
}

// 3. estáticos del cliente: pool de luces
{
  const pool = (html.match(/new THREE\.PointLight\(/g) || []).length;
  ok(pool === 1, `la PointLight se instancia una sola vez en el código (${pool})`);
  ok(/for\(let i=0;i<LIGHT_POOL_SIZE;i\+\+\)/.test(html) && /LIGHT_POOL_SIZE\s*=\s*8/.test(html),
    'el loop del pool recorre LIGHT_POOL_SIZE = 8');
  ok(/LIGHT_POOL_SIZE\s*=\s*8/.test(html), 'LIGHT_POOL_SIZE = 8');
  const aq = grabFn('applyQuality');
  ok(aq.length > 0, 'el cliente define applyQuality()');
  ok(!/new THREE\.PointLight/.test(aq), 'applyQuality NO crea luces');
  ok(!/scene\.(add|remove)\s*\(\s*(pl|light|pool)/.test(aq),
    'applyQuality NO agrega ni quita luces de la escena');
  ok(/refreshLights\s*\(\s*true\s*\)/.test(aq), 'applyQuality aplica el presupuesto con refreshLights(true)');
  ok(/lightBudget\s*=\s*LIGHT_BUDGET\[level\]/.test(aq), 'applyQuality fija lightBudget = LIGHT_BUDGET[level]');
  ok(/applyLightVisibility\s*\(\s*\)/.test(aq),
    'applyQuality fija la visibilidad del pool para el nivel (una sola recompila por cambio)');

  // el pool se arma una sola vez al inicializar la escena, con intensity 0 y sin sombras
  const poolSrc = html.slice(html.indexOf('LIGHT_POOL_SIZE'), html.indexOf('LIGHT_POOL_SIZE') + 1400);
  ok(/intensity\s*=\s*0|,\s*0\s*,/.test(poolSrc), 'las luces del pool nacen con intensidad 0');
  ok(/castShadow\s*=\s*false/.test(poolSrc), 'las luces del pool no proyectan sombras');
  ok(/pl\.visible\s*=\s*false/.test(poolSrc),
    'los puntos nacen ocultos: applyLightVisibility enciende el set fijo del nivel');
  ok(/decay\s*=\s*2/.test(poolSrc) || /,\s*2\s*\)/.test(poolSrc), 'las luces usan decay = 2');
  ok(/scene\.add\s*\(\s*pl\s*\)/.test(poolSrc), 'las luces se agregan una sola vez a la escena');

  const rf = grabFn('refreshLights');
  ok(rf.length > 0, 'el cliente define refreshLights(force)');
  ok(/LIGHT_PICK_MS/.test(rf) && /lightBudget/.test(rf),
    'refreshLights respeta la cadencia y el presupuesto vigente');
  ok(/dcx\s*=\s*-2/.test(rf) && /dcz\s*=\s*-2/.test(rf) && /<=\s*2/.test(rf),
    'refreshLights recorre los chunks en radio 2');
  ok(/LIGHT_MAX_DIST/.test(rf), 'refreshLights descarta candidatos por LIGHT_MAX_DIST');
  ok(/lightFade\s*\(/.test(rf), 'refreshLights atenúa con lightFade antes del corte (sin pop)');
  ok(/intensity\s*=\s*spec\.intensity\s*\*\s*fade|intensity\s*=\s*spec\.intensity\s*\*\s*lightFade/.test(rf),
    'la intensidad asignada se multiplica por el factor de fade');
  ok(/intensity\s*=\s*0/.test(rf), 'refreshLights apaga el resto del pool con intensity = 0');
  // Oclusión por línea de vista: una fuente fuera del encierro no aporta luz, sin
  // depender de la calidad ni de cuál sea la más cercana.
  ok(/blockedLOS\s*\(/.test(rf), 'refreshLights descarta fuentes ocluidas con blockedLOS');
  ok(/eyePos\s*\(\s*\)/.test(rf), 'la línea de vista se traza contra el ojo (eyePos())');
  ok(/isOpaque\s*\(\s*get\s*\(/.test(rf), 'la oclusión se evalúa con isOpaque(get(...))');
  ok(/blockedLOS\s*\([\s\S]*?e\.x[\s\S]*?e\.y[\s\S]*?e\.z/.test(rf),
    'blockedLOS compara el ancla de la fuente con el ojo, no con el centro del bloque');
  ok(/isLightEmitter/.test(grabFn('buildGlobalsForChunk')), 'buildGlobalsForChunk indexa con isLightEmitter');
}

// 4. estáticos del cliente: índice por chunk, dirty y loop
{
  const bg = grabFn('buildGlobalsForChunk');
  ok(/chunkLights\[key\]/.test(bg), 'buildGlobalsForChunk puebla chunkLights[key]');
  ok(/chunkLights\[key\]\s*=\s*\[\]/.test(bg) || /chunkLights\[key\]\s*=\s*lights/.test(bg),
    'la entrada del chunk se limpia/crea antes de reconstruir');

  const ra = grabFn('refreshAt');
  ok(/lightsDirty\s*=\s*true/.test(ra), 'refreshAt marca lightsDirty');
  ok(/skyPending\s*=\s*true/.test(ra),
    'refreshAt marca skyPending: una edición recalcula el cielo aunque el jugador no se mueva');

  const loop = grabFn('loop');
  ok(/refreshLights\s*\(\s*false\s*\)/.test(loop), 'loop() llama refreshLights(false) cada frame');
  ok((loop.match(/refreshLights\s*\(/g) || []).length === 1, 'loop() llama refreshLights una sola vez por frame');

  const pedit = grabBranch('pedit');
  ok(pedit.length > 0, 'existe el handler pedit');
  ok(/refreshAt\s*\(/.test(pedit), 'pedit refresca el chunk (y con eso el índice de luces)');
  ok(!/breakOrphanSupports/.test(pedit), 'pedit NO dispara la cascada local');
  ok(!/lightsDirty/.test(pedit) || /refreshAt|lightsDirty\s*=\s*true/.test(pedit),
    'pedit no introduce un camino de luces alternativo (usa refreshAt)');
}

// 5. estáticos del cliente: antorcha orientable y farola
{
  const eg = grabFn('emitGlobalCell');
  ok(/torchQuads\s*\(/.test(eg), 'emitGlobalCell dibuja la antorcha con torchQuads');
  ok(/torchSupportKind\s*\(/.test(eg), 'emitGlobalCell deriva la orientación con torchSupportKind');
  ok(/b===LAMP/.test(eg), 'emitGlobalCell tiene la rama LAMP');
  ok(/DEFS\[LAMP\]|LT_LAMP|tile:37|37,/.test(eg) || /LAMP/.test(eg), 'la rama LAMP usa su propio tile');
  // Bordes de chunk: la orientación y el ancla leen `get()` del mundo completo (no del
  // chunk), así que una antorcha en x=0/x=15 ve el soporte del chunk vecino.
  ok(/get\(x\+1,y,z\)/.test(eg) && /get\(x-1,y,z\)/.test(eg) && /get\(x,y,z\+1\)/.test(eg),
    'la orientación de la antorcha lee los 6 vecinos del mundo completo');
  const rl = grabFn('refreshLights');
  ok(/get\(b\.x\+1,b\.y,b\.z\)/.test(rl) || /get\(b\.x,b\.y-1,b\.z\)/.test(rl),
    'el ancla de la luz también se calcula leyendo el mundo completo');
}

// 6. estáticos del cliente: bloque farola y atlas
{
  const ids = html.match(/const AIR=0, GRASS=1[\s\S]*?LAMP=64;/);
  ok(!!ids, 'LAMP=64 está en la línea de constantes compartida');
  let DEFS = null;
  try { DEFS = new Function(ids[0] + '; const SWORD=100, PICK=101; return (' + grabObj('const DEFS = ') + ');')(); }
  catch (e) { ok(false, 'parseo de DEFS: ' + e.message); }
  if (DEFS) {
    const l = DEFS[64];
    ok(!!l, 'DEFS tiene la farola (id 64)');
    if (l) {
      ok(l.lamp === 1, 'la farola se marca con lamp:1');
      ok(l.tile === 37, `la farola usa el tile 37 (${l.tile})`);
      ok(typeof l.hard === 'number' && l.hard > 0 && l.hard <= 0.5,
        `la farola se rompe de un toque (hard=${l.hard})`);
      ok(/Farola/.test(l.name), `el nombre es Farola (${l.name})`);
      ok(!l.cube && !l.glow, 'la farola no se meshéa como cubo ni como glow');
      ok(!!l.css, 'la farola tiene ícono propio por CSS');
    }
  }
  ok(/tile\(37,/.test(html) || /flat\(37,/.test(html) || /flower\(37,/.test(html),
    'el tile 37 se dibuja en el atlas procedural');
  const inv = (html.match(/const INVENTORY = \[([^\]]*)\]/) || [])[1] || '';
  ok(/(?:^|,)LAMP(?:,|$)/.test(inv.replace(/\s+/g, '')), 'LAMP está en la paleta INVENTORY');
  const hb = (html.match(/DEFAULT_HOTBAR = \[([^\]]+)\]/) || [])[1] || '';
  ok(hb.split(',').length === 9 && !/LAMP/.test(hb), 'la hotbar por defecto sigue en 9 slots sin la farola');
}

// 7. estáticos del cliente: colocación por cara y cascada
{
  const dp = grabFn('doPlace');
  ok(dp.length > 0, 'el cliente define doPlace()');
  ok(/isSolid\(\s*get\(\s*h\.x\s*,\s*h\.y\s*,\s*h\.z\s*\)\s*\)/.test(dp),
    'doPlace exige que el bloque clickeado (h.x,h.y,h.z) sea sólido');
  ok(/h\.ny\s*!==\s*-1/.test(dp), 'doPlace exige h.ny === -1 para la farola');
  ok(/id===LAMP\s*&&\s*cur!==AIR/.test(dp), 'la farola exige una celda libre (no reemplaza agua ni flores)');
  ok(/TORCH/.test(dp) && /LAMP/.test(dp), 'la regla de soporte cubre antorcha y farola');

  const bos = grabFn('breakOrphanSupports');
  ok(bos.length > 0, 'el cliente define breakOrphanSupports(x,y,z)');
  ok(/rawSet\s*\(/.test(bos), 'la cascada aplica las roturas con rawSet en lote');
  ok(/edits\.push/.test(bos) && /netSend/.test(bos), 'la cascada sincroniza en solo y multijugador');
  ok(/affectedChunks|buildGlobalsForChunk/.test(bos), 'la cascada refresca los chunks afectados');
  const bosBody = bos.slice(bos.indexOf('{') + 1);
  ok(!/breakOrphanSupports/.test(bosBody), 'la cascada no se llama a sí misma (sin recursión)');

  const db = grabFn('doBreak');
  ok(/breakOrphanSupports\s*\(/.test(db), 'doBreak llama a breakOrphanSupports');
  ok(/isSolid\s*\(\s*h\.b\s*\)/.test(db), 'la cascada solo corre cuando el bloque roto era sólido');
  ok(db.indexOf('breakOrphanSupports') > db.indexOf('rawSet'),
    'la cascada corre después de romper el bloque');
}

// 8. estáticos del cliente: paso de mobs, raycast y presupuesto en la UI
{
  const mb = grabFn('mobBlocked');
  ok(/v===TORCH/.test(mb), 'mobBlocked conserva la antorcha exenta');
  ok(/v===LAMP/.test(mb), 'mobBlocked exime la farola (no bloquea el paso)');
  ok(/dd\.lamp/.test(grabFn('raycast')) || /\.lamp/.test(grabFn('raycast')),
    'raycast considera la farola como objetivo apuntable');

  const spec = fs.readFileSync(path.join(root, 'openspec', 'specs', 'ui', 'config', 'spec.md'), 'utf8');
  ok(/cantidad fija de luces dinámicas/.test(spec), 'la spec ui/config documenta la cantidad fija de luces por nivel');
}

// 9. Farola direccional: spots creados una sola vez y ancla baja
T('LAMP_POOL_SIZE y ancla de la farola', () => {
  ok(API.LAMP_POOL_SIZE === 8, `LAMP_POOL_SIZE = 8 spots para farolas (${API.LAMP_POOL_SIZE})`);
  const l = API.LIGHT_SPEC[64];
  ok(Array.isArray(l.anchor) && near(l.anchor[1], 0.68, 1e-9),
    `el ancla de la farola baja a y=0.68, debajo de la pantalla (${l.anchor && l.anchor[1]})`);
  ok(near(l.anchor[0], 0.5, 1e-9) && near(l.anchor[2], 0.5, 1e-9),
    'el ancla de la farola sigue centrada en la celda');
  ok(API.LAMP_SPOT_ANGLE > 1 && API.LAMP_SPOT_ANGLE < 1.3,
    `el cono del spot abre ~1.15 rad (${API.LAMP_SPOT_ANGLE})`);
  ok(API.LAMP_SPOT_PENUMBRA > 0 && API.LAMP_SPOT_PENUMBRA < 1,
    `el borde del cono es suave, penumbra ~0.5 (${API.LAMP_SPOT_PENUMBRA})`);
});

T('lightSlots: farolas solo a spots, sin fallback al punto', () => {
  const f = API.lightSlots;
  ok(typeof f === 'function', 'existe lightSlots(ids, budget, spots)');
  if (typeof f !== 'function') return;
  const noLamp = f([33, 8], 2, 8);
  ok(noLamp.length === 2 && noLamp.every(s => s.spot === 0),
    'sin farolas todo va al pool de puntos');
  ok(noLamp[0].slot === 0 && noLamp[1].slot === 1,
    'los puntos se numeran 0,1 en orden de cercanía');
  ok(noLamp[0].src === 0 && noLamp[1].src === 1,
    'cada slot recuerda el índice de su fuente en ids (src)');
  // 7 farolas (el caso de la captura): las 7 entran en los 8 spots, ninguna usa un punto.
  const seven = f(Array(7).fill(64), 8, 8);
  ok(seven.length === 7, 'las 7 farolas se encienden');
  ok(seven.every(s => s.spot === 1), 'las 7 farolas usan spots (ninguna ilumina el techo)');
  ok(seven.map(s => s.slot).join() === '0,1,2,3,4,5,6', 'los spots se numeran 0..6');
  ok(seven.every((s, i) => s.src === i), 'cada farola conserva su índice de origen');
  // 9 farolas: los 8 spots; la novena se omite y NO cae al pool de puntos.
  const nine = f(Array(9).fill(64), 9, 8);
  ok(nine.length === 8, 'con 9 farolas solo se encienden 8 (los 8 spots)');
  ok(nine.every(s => s.spot === 1), 'la novena farola queda apagada: nunca cae al punto');
  ok(nine[nine.length - 1].slot === 7, 'el último spot usado es el 7');
  // Mezcla: farolas a spots y antorchas a puntos, sin cruzarse ni desalinearse.
  const mix = f([64, 33, 64, 33], 8, 8);
  ok(mix.length === 4, 'la mezcla enciende las 4 fuentes');
  ok([0, 2].every(i => { const s = mix.find(x => x.src === i); return s && s.spot === 1; }),
    'las farolas quedan en spots');
  ok([1, 3].every(i => { const s = mix.find(x => x.src === i); return s && s.spot === 0; }),
    'las antorchas quedan en puntos');
  ok(f([64], 0, 8).length === 0, 'sin presupuesto no se enciende nada');
  ok(f([64, 33], 1, 8).length === 1 && f([64, 33], 1, 8)[0].spot === 1,
    'el presupuesto recorta la lista de fuentes (el spot también cuenta)');
  // Un solo spot libre: la segunda farola se omite; la antorcha siguiente usa un punto.
  const few = f([64, 64, 33], 8, 1);
  ok(few.length === 2, 'con 1 spot se enciende 1 farola y la otra se omite');
  ok(few[0].spot === 1 && few[0].slot === 0, 'la farola más cercana usa el spot 0');
  ok(few[1].spot === 0 && few[1].slot === 0 && few[1].src === 2,
    'la antorcha posterior usa el punto 0 aunque haya una farola omitida');
});

T('sin sombras dinámicas en las luces del pool', () => {
  ok(!/function\s+shadowCaster\s*\(/.test(html),
    'no existe el selector shadowCaster(slots, quality): las luces dinámicas no proyectan sombra');
  ok(!/function\s+setShadowCaster\s*\(/.test(html), 'no existe setShadowCaster(kind, light)');
  ok(!/shadowCasterKey|shadowCasterLight/.test(html),
    'no queda estado de shadow caster (ni claves ni luz registrada)');
  const poolSrc = html.slice(html.indexOf('const LIGHT_POOL_SIZE'), html.indexOf('const LIGHT_POOL_SIZE') + 1400);
  ok((poolSrc.match(/castShadow\s*=\s*false/g) || []).length >= 2,
    'los puntos y los spots del pool nacen con castShadow = false');
  ok(!/castShadow\s*=\s*true/.test(poolSrc), 'ninguna luz del pool enciende castShadow');
  ok(/sun\.castShadow/.test(html), 'el sol conserva su sombra (calidad 2)');
});

// 9b. estáticos del cliente: pool de spots, targets y sombra registrada
{
  ok((html.match(/new THREE\.SpotLight\(/g) || []).length === 1,
    'el SpotLight se instancia una sola vez en el código (dentro del loop del pool)');
  ok(/for\(let i=0;i<LAMP_POOL_SIZE;i\+\+\)/.test(html),
    'el pool de spots recorre LAMP_POOL_SIZE');
  ok(/LAMP_POOL_SIZE\s*=\s*8/.test(html),
    'LAMP_POOL_SIZE = 8 (el presupuesto máximo de la calidad 2)');
  const at = html.indexOf('new THREE.SpotLight(');
  const spotSrc = at < 0 ? '' : html.slice(at - 320, at + 900);
  ok(/new THREE\.SpotLight\([^)]*,\s*0\s*,/.test(spotSrc), 'los spots nacen con intensidad 0');
  ok(/castShadow\s*=\s*false/.test(spotSrc), 'los spots no proyectan sombras al crearse');
  ok(/new THREE\.Object3D\(\)/.test(spotSrc), 'cada spot tiene un Object3D target propio');
  ok(/scene\.add\s*\(\s*tg\s*\)/.test(spotSrc), 'el target se agrega a la escena');
  ok(/sp\.target\s*=\s*tg/.test(spotSrc), 'el spot apunta a su target');
  ok(/scene\.add\s*\(\s*sp\s*\)/.test(spotSrc), 'el spot se agrega una sola vez a la escena');
  ok(/lampTargets\.push\(\s*tg\s*\)/.test(spotSrc),
    'el pool guarda los 8 targets (8 spots + 8 targets en la escena)');
  ok(/lampPool\.push\(\s*sp\s*\)/.test(spotSrc), 'el pool guarda los 8 spots');

  const ls = grabFn('lightSlots');
  ok(/if\s*\(\s*ids\[i\]\s*===\s*LT_LAMP\s*\)\s*\{\s*if\s*\(\s*ns\s*<\s*spots\s*\)/.test(ls),
    'lightSlots solo asigna la farola si queda un spot libre (sin fallback a punto)');

  const rl = grabFn('refreshLights');
  ok(/lampPool/.test(rl) && /lightSlots\(/.test(rl),
    'refreshLights reparte farolas/puntos con lightSlots (spots primero)');
  ok(/lampPool\[i\]\.intensity\s*=\s*0/.test(rl), 'refreshLights apaga los spots sobrantes');
  ok(/best\[s\.src\]/.test(rl),
    'cada slot se aplica a su fuente por src (las farolas omitidas no desalinean)');
  ok(/sp\.target|tg\.position\.set\(b\.x\+\.5,b\.y-\.5,b\.z\+\.5\)/.test(rl) &&
     /b\.y-\.5/.test(rl), 'el target del spot queda justo debajo de la farola (y-0.5)');
  ok(/sp\.position\.set\(b\.x\+ax,b\.y\+ay,b\.z\+az\)/.test(rl),
    'el spot se ubica en el ancla de la spec (debajo de la pantalla)');
  ok(/sp\.angle/.test(rl) && /sp\.penumbra/.test(rl),
    'refreshLights refresca ángulo y penumbra del spot');
  ok(/sp\.distance\s*=\s*spec\.distance/.test(rl) && /sp\.decay\s*=\s*spec\.decay/.test(rl),
    'el spot usa distancia y decay de la spec');
  ok(/sp\.intensity\s*=\s*spec\.intensity\s*\*\s*fade/.test(rl),
    'la intensidad del spot también pasa por lightFade');
  ok(!/setShadowCaster|shadowCaster\s*\(/.test(rl),
    'refreshLights ya no elige ni registra un shadow caster');
  ok(!/castShadow/.test(rl), 'refreshLights no toca castShadow');
  ok(!/\.visible\s*=/.test(rl), 'refreshLights no toca visible (la visibilidad es fija por nivel)');
  ok(!/applyLightVisibility/.test(rl),
    'refreshLights no recompila shaders cambiando la visibilidad del pool');
}

// 9c. Visibilidad fija por calidad: el set visible se decide UNA vez al arrancar y al
// cambiar de nivel, no según el uso de cada tick. Así caminar no recompila shaders.
{
  const vis = grabFn('applyLightVisibility');
  ok(vis.length > 0, 'el cliente define applyLightVisibility()');
  ok(/function\s+applyLightVisibility\s*\(\s*\)/.test(vis),
    'applyLightVisibility no recibe conteos: lee la calidad vigente');
  ok(/QUALITY_LEVEL/.test(vis), 'lee QUALITY_LEVEL');
  ok(/POINT_VISIBLE\[\s*QUALITY_LEVEL\s*\]/.test(vis),
    'usa POINT_VISIBLE[QUALITY_LEVEL]');
  ok(/SPOT_VISIBLE\[\s*QUALITY_LEVEL\s*\]/.test(vis),
    'usa SPOT_VISIBLE[QUALITY_LEVEL]');
  ok(/lightPool\[i\]\.visible\s*=\s*i\s*<\s*pv/.test(vis),
    'deja visibles los primeros pv puntos del nivel');
  ok(/lampPool\[i\]\.visible\s*=\s*i\s*<\s*sv/.test(vis),
    'deja visibles los primeros sv spots del nivel');
  ok(!/LIGHT_VIS_MS|lightVis|performance\.now|setTimeout/.test(vis),
    'sin debounce ni estado de conteos usados');

  ok(!/LIGHT_VIS_MS/.test(html), 'no queda LIGHT_VIS_MS en el cliente');
  ok(!/tickLightVisibility/.test(html), 'no queda tickLightVisibility en el cliente');
  ok((html.match(/applyLightVisibility\s*\(\s*\)/g) || []).length >= 2,
    'la visibilidad se aplica al arrancar y en cada cambio de calidad');

  const rf = grabFn('refreshLights');
  ok(/POINT_VISIBLE\[\s*QUALITY_LEVEL\s*\]/.test(rf) &&
     /SPOT_VISIBLE\[\s*QUALITY_LEVEL\s*\]/.test(rf),
    'refreshLights lee la visibilidad fija de su nivel');
  ok(/s\.slot\s*>=\s*sv/.test(rf) && /s\.slot\s*>=\s*pv/.test(rf),
    'refreshLights ignora los slots que no están visibles en el nivel');
  ok(!/\.visible\s*=/.test(rf), 'refreshLights nunca cambia visible');
  ok(!/applyLightVisibility/.test(rf),
    'refreshLights no llama a applyLightVisibility');
}

// 10. Brillo del cliente: clamp al cargar y reaplicación en caliente
T('clampBrightness: el brillo guardado queda en [1,3]', () => {
  const f = API.clampBrightness;
  ok(typeof f === 'function', 'existe clampBrightness(v)');
  if (typeof f !== 'function') return;
  ok(f(1) === 1 && f(3) === 3, 'los extremos del slider se respetan');
  ok(f(2.5) === 2.5, 'un valor intermedio válido no se toca');
  ok(f(0.4) === 1, 'un valor viejo por debajo del rango sube a 1 (la noche clara del server)');
  ok(f(5) === 3, 'un valor por encima del rango baja a 3');
  ok(f('2.5') === 2.5, 'acepta el string que devuelve localStorage');
  ok(f(NaN) === 1 && f('abc') === 1 && f(undefined) === 1 && f(null) === 1,
    'valores no finitos → 1 (nunca NaN en la atmósfera)');
});

T('paletteFactor: la paleta depende de la fase, no del brillo', () => {
  const f = API.paletteFactor;
  ok(typeof f === 'function', 'existe paletteFactor(L)');
  if (typeof f !== 'function') return;
  ok(near(f(0.50), 0), `paletteFactor(NIGHT_MIN) = 0 (${f(0.50)})`);
  ok(near(f(1), 1), `paletteFactor(1) = 1 (${f(1)})`);
  let prev = -Infinity, mono = true;
  for (let L = 0.5; L <= 1.00001; L += 0.01) {
    const v = f(L);
    if (v < prev - 1e-9) mono = false;
    prev = v;
  }
  ok(mono, 'paletteFactor es monótono entre NIGHT_MIN y el día pleno');
});

{
  const handler = (html.match(/getElementById\('brightSlider'\)\.oninput=e=>\{[\s\S]*?\n\};/) || [''])[0];
  ok(handler.length > 0, 'se puede extraer el handler de #brightSlider');
  ok(/clampBrightness\(/.test(handler), 'el slider clampea el brillo a [1,3]');
  ok(/applyAtmosphere\(/.test(handler) && /tickSky\(/.test(handler),
    'el slider reaplica la atmósfera y el cielo en caliente (no espera a que cambie la fase)');
  ok(/airL\s*=\s*-1/.test(handler) && /light\(dayV\)/.test(handler),
    'la reaplicación usa la fase vigente y obliga al loop a rehacerla');
  ok(!/HEMI_DAY|SUN_DAY|NIGHT_MIN|HEMI_SKY_DAY/.test(handler),
    'el brillo no toca las constantes globales de día/noche');
  const boot = (html.match(/try\{\s*const b=localStorage\.getItem\('mc-brightness'\)[\s\S]*?\}catch\(e\)\{\}/) || [''])[0];
  ok(boot.length > 0, 'se puede extraer la restauración de mc-brightness');
  ok(/clampBrightness\(/.test(boot), 'el arranque clampea el brillo guardado a [1,3]');
  ok(!/BRIGHTNESS\s*=\s*parseFloat\(b\)/.test(boot), 'el arranque no asigna el valor crudo de localStorage');
}

// 11. guarda de regresión del servidor: v <= 64, sin validar soporte
{
  const srv = fs.readFileSync(path.join(root, 'server', 'app.js'), 'utf8');
  ok(/\bv\s*<\s*0\s*\|\|\s*v\s*>\s*64/.test(srv), 'el servidor acepta ids 0..64 y rechaza v > 64');
  ok(!/isSolid|solidAt|torchSupportKind|isLightEmitter/.test(srv),
    'el servidor no valida soporte ni iluminación (sin cambios de protocolo)');
  ok(/broadcast\(\{\s*t:\s*'pedit'/.test(srv), 'el servidor difunde el edit como pedit (id 64 incluido)');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 iluminación, presupuesto, orientaciones y farola (world/lighting + blocks/lamp) OK');
