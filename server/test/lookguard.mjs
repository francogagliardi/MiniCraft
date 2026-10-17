// Tests del guard de mirada (change camara-giro-repentino, spec player/look):
// un evento de mouse/táctil con un delta desproporcionado (pico de pointer lock,
// mouse al despertar, salto de pointer capture) o no finito NO debe girar la
// cámara. El bug es un evento de browser (no reproducible headless), así que —
// igual que worldgen.mjs/avatar.mjs — este test EXTRAE el bloque marcado
// /* look:start */ ... /* look:end */ de index.html y lo evalúa aislado, de modo
// que asierta el comportamiento REAL de la función que corre el navegador.
// Cubre: extractabilidad, API, umbral/borde por eje, valores no finitos, la
// marca del primer evento tras el pointer lock, el diagnóstico en consola, la
// autocontención del bloque y el orden estructural guard→aplicar en los handlers.
// Uso: node test/lookguard.mjs   (sale con código != 0 si algo falla)
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

// ---- extracción del bloque look (patrón net/avatar y worldgen) ----
const START = '/* look:start */', END = '/* look:end */';
const i = html.indexOf(START), j = html.indexOf(END);
const present = i >= 0 && j > i;
ok(present, 'bloque look presente en index.html');
const code = present ? html.slice(i, j) : '';

let API = null;
if (present) {
  try {
    API = new Function(code + '\n;return {LOOK_MAX_PX,LOOK_WARN_MAX,lookDeltaOk,lookLockSkip,noteLookSpike,spikes:()=>lookSpikes,warned:()=>lookSpikesWarned,setLockPending:v=>{lookLockPending=v}};')();
    ok(true, 'bloque look evaluable y con API completa');
  } catch (e) { ok(false, 'bloque look evaluable: ' + e.message); }
}
const T = (name, fn) => { if (!API) { ok(false, `${name}: sin API look`); return; } try { fn(); } catch (e) { ok(false, `${name}: ${e.message}`); } };

// 1. comportamiento básico: un delta normal gira, uno enorme se descarta
T('delta normal y enorme', () => {
  ok(API.lookDeltaOk(12, -4) === true, 'delta normal (12,-4) → true (gira)');
  ok(API.lookDeltaOk(1e6, 0) === false, 'delta enorme (1e6,0) → false (descarta)');
});

// 1.3 umbral y borde: LOOK_MAX_PX = 1000 y borde EXCLUSIVO por eje.
T('umbral y borde', () => {
  ok(API.LOOK_MAX_PX === 1000, `LOOK_MAX_PX = 1000 (${API.LOOK_MAX_PX})`);
  // apenas por debajo del umbral ⇒ gira
  ok(API.lookDeltaOk(999, 0) === true, '999 → true (apenas por debajo)');
  ok(API.lookDeltaOk(0, -999) === true, '(0,-999) → true (apenas por debajo)');
  // borde exacto ⇒ implausible, se descarta (strict <)
  ok(API.lookDeltaOk(1000, 0) === false, '(1000,0) → false (borde exacto)');
  ok(API.lookDeltaOk(0, 1000) === false, '(0,1000) → false (borde exacto)');
  ok(API.lookDeltaOk(-1000, 0) === false, '(-1000,0) → false (borde exacto)');
  // desproporcionado ⇒ descarta en cualquier eje y signo
  ok(API.lookDeltaOk(1e6, 0) === false, '(1e6,0) → false');
  ok(API.lookDeltaOk(-1e6, 0) === false, '(-1e6,0) → false');
  ok(API.lookDeltaOk(0, 1e6) === false, '(0,1e6) → false');
  // basta un componente fuera de rango para descartar el evento entero
  ok(API.lookDeltaOk(3, 1e6) === false, 'un componente enorme descarta el evento entero');
});

// 1.3 (bis) valores no finitos o ausentes ⇒ false en dx y en dy
T('valores no finitos', () => {
  const bad = [NaN, Infinity, -Infinity, undefined, null];
  for (const v of bad) {
    ok(API.lookDeltaOk(v, 0) === false, `dx=${String(v)} → false`);
    ok(API.lookDeltaOk(0, v) === false, `dy=${String(v)} → false`);
  }
});

// 1.4 la marca del pointer lock se consume EXACTAMENTE una vez
T('pointer lock (lookLockSkip)', () => {
  API.setLockPending(false);
  ok(API.lookLockSkip() === false, 'sin marca → false (no ignora nada)');
  API.setLockPending(true);
  ok(API.lookLockSkip() === true, 'con marca → true (ignora el primer evento)');
  ok(API.lookLockSkip() === false, 'la marca se consumió → false (el siguiente gira)');
  ok(API.lookLockSkip() === false, 'sigue consumida → false');
});

// 1.5 diagnóstico: SIEMPRE cuenta, avisa solo los primeros LOOK_WARN_MAX
T('diagnóstico en consola', () => {
  ok(API.LOOK_WARN_MAX === 3, `LOOK_WARN_MAX = 3 (${API.LOOK_WARN_MAX})`);
  const warns = [];
  const realWarn = console.warn;
  try {
    console.warn = (...a) => warns.push(a.join(' '));
    for (let k = 0; k < API.LOOK_WARN_MAX + 2; k++) API.noteLookSpike(1e6, 0, 'mouse');
  } finally {
    console.warn = realWarn;
  }
  ok(API.spikes() === API.LOOK_WARN_MAX + 2, `spikes() sube en cada llamada (${API.spikes()})`);
  ok(API.warned() === API.LOOK_WARN_MAX, `solo se avisan LOOK_WARN_MAX (${API.warned()})`);
  ok(warns.length === API.LOOK_WARN_MAX, `console.warn emitido ${API.LOOK_WARN_MAX} veces (${warns.length})`);
  ok(/dx=1000000/.test(warns[0]) && /#1\b/.test(warns[0]) && /\(mouse\)/.test(warns[0]),
    `el 1er aviso trae contador, origen y valores (${warns[0]})`);
  ok(console.warn === realWarn, 'console.warn restaurado en finally');
});

// 1.6 autocontención: el bloque no referencia símbolos externos (patrón worldgen)
{
  const externos = (src) => [...new Set([...src
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    .matchAll(/\b(DEFS|THREE|document|window|atlasTex|scene|camera|renderer)\b/g)].map(m => m[1]))];
  if (present) {
    const bad = externos(code);
    ok(bad.length === 0, 'bloque look autocontenido (sin símbolos externos' + (bad.length ? ': ' + bad.join(',') : '') + ')');
  }
  ok(externos('const x = DEFS[1] + THREE.foo').length === 2, 'detector de autocontención funciona (caso negativo DEFS/THREE)');
}

// ---- 2/3. estructura del cableado (assert ACOTADO y comentado: no reemplaza al
// de comportamiento de la función pura; fija el ORDEN guard→aplicar, que es
// imposible de asertar con `lookDeltaOk` sola). Extrae el cuerpo del handler. ----
const grabFrom = (marker) => {
  const k = html.indexOf(marker);
  if (k < 0) return '';
  let d = 0, started = false;
  for (let p = k; p < html.length; p++) {
    if (html[p] === '{') { d++; started = true; }
    else if (html[p] === '}') { d--; if (started && d === 0) return html.slice(k, p + 1); }
  }
  return '';
};
const mh = grabFrom("addEventListener('mousemove'");
const pl = grabFrom("document.addEventListener('pointerlockchange'");
const th = grabFrom("canvas.addEventListener('pointermove'");
ok(mh !== '' && pl !== '' && th !== '', 'handlers mousemove/pointerlockchange/pointermove presentes');

// 2.1 orden guard→aplicar en el handler de escritorio
{
  const g = mh.indexOf('lookDeltaOk('), y = mh.search(/player\.yaw\s*-=/);
  ok(g >= 0, 'estructura: mousemove consulta lookDeltaOk(');
  ok(g >= 0 && y >= 0 && g < y, 'estructura: en mousemove `lookDeltaOk(` aparece ANTES de `player.yaw -=`');
  const s = mh.indexOf('lookLockSkip()');
  ok(s >= 0 && y >= 0 && s < y, 'estructura: en mousemove `lookLockSkip()` antes de aplicar');
  ok(/if\(locked\(\)\)\{[\s\S]*lookLockPending\s*=\s*true/.test(pl),
    'estructura: pointerlockchange marca lookLockPending=true dentro de if(locked())');
}

// 2.3 no romper el control normal: sensibilidad, rango de pitch y guards intactos
{
  ok(/\.0024/.test(mh), 'mousemove conserva la sensibilidad de escritorio (.0024)');
  ok(/-1\.55/.test(mh) && /\b1\.55\b/.test(mh), 'mousemove conserva el rango de pitch (±1.55)');
  ok(/state!=='play'\|\|!locked\(\)\|\|dead/.test(mh), 'mousemove conserva los guards previos (play/lock/dead) en orden');
  const writes = (html.match(/player\.yaw\s*-=/g) || []).length;
  ok(writes === 2, `solo 2 escrituras de player.yaw -= (mouse+táctil): ${writes}`);
  ok(!/player\.yaw\s*=(?!=)/.test(html), 'sin escrituras directas de player.yaw= fuera de los handlers');
}

// 3.1 orden guard→aplicar y referencia-antes-del-guard en el handler táctil
{
  const g = th.search(/lookDeltaOk\(\s*dx\s*,\s*dy\s*\)/), y = th.search(/player\.yaw\s*-=/);
  const ref = th.search(/lookLX\s*=\s*e\.clientX/);
  ok(g >= 0, 'estructura: pointermove táctil consulta lookDeltaOk(dx,dy)');
  ok(g >= 0 && y >= 0 && g < y, 'estructura: en pointermove `lookDeltaOk(dx,dy)` ANTES de `player.yaw -=`');
  ok(ref >= 0 && g >= 0 && ref < g, 'estructura: la referencia lookLX/lookLY se actualiza ANTES del guard');
  ok(/noteLookSpike\([^)]*'touch'/.test(th), "estructura: el descarte táctil llama noteLookSpike(...,'touch')");
  ok(!/lookLockPending|lookLockSkip/.test(th), 'el handler táctil NO usa la marca de pointer lock (no hay lock en táctil)');
  ok(/Math\.hypot\(e\.clientX - tapX, e\.clientY - tapY\) > 12/.test(th), 'el umbral de tapMoved (>12) no cambió');
  ok(/\.0042/.test(th), 'pointermove conserva la sensibilidad táctil (.0042)');
  ok(/-1\.55/.test(th) && /\b1\.55\b/.test(th), 'pointermove conserva el rango de pitch (±1.55)');
}

// 4.1 el script `test` de server/package.json da de alta este archivo (12 en total)
{
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'server', 'package.json'), 'utf8'));
  const s = pkg.scripts.test;
  const required = ['static','avatar','migrate','terrain','water','worldgen','zombie','zombie-client','zombie-protocol','avatar-held','lookguard','protocol'];
  const missing = required.filter(n => !new RegExp(`test/${n}\\.mjs`).test(s));
  const count = (s.match(/test\/[\w-]+\.mjs/g) || []).length;
  ok(missing.length === 0, `npm test da de alta los 12 archivos (faltan: ${missing.join(', ') || 'ninguno'})`);
  ok(count === 12, `el script test enumera 12 archivos (${count})`);
}

if (fails) console.log(`\n💥 ${fails} chequeo(s) fallaron`);
else console.log('\n🎉 guard de mirada OK');
process.exit(fails ? 1 : 0);
