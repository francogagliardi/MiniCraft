// Tests del guard de mirada (changes camara-giro-repentino y mirada-sin-saltos,
// spec player/look): un evento de mouse/táctil con un delta desproporcionado
// (pico de pointer lock, mouse al despertar, salto de pointer capture) o no
// finito NO debe girar la cámara, y un delta grande ACEPTADO no puede girarla de
// golpe: se encola y se drena con un tope de rotación por frame.
// El bug es un evento de browser (no reproducible headless), así que — igual que
// worldgen.mjs/avatar.mjs — este test EXTRAE el bloque marcado
// /* look:start */ ... /* look:end */ de index.html y lo evalúa aislado, de modo
// que asierta el comportamiento REAL de la función que corre el navegador.
// Cubre: extractabilidad, API, umbral/borde por eje, valores no finitos, el tope
// de giro por frame (clampLookStep), el buffer con su drenaje y reset, la ventana
// de re-lock, el diagnóstico en consola (descartes y deltas grandes), la
// autocontención del bloque y el orden estructural guard→encolar→drenar.
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
    API = new Function(code + '\n;return {LOOK_MAX_PX,LOOK_WARN_MAX,LOOK_MAX_RAD_PER_FRAME,LOOK_BIG_PX,LOOK_LOCK_SKIP_EVENTS,lookDeltaOk,lookLockSkip,noteLookSpike,noteLookBig,clampLookStep,lookQueue,lookReset,buffer:()=>({x:lookBufX,y:lookBufY}),drainLook,spikes:()=>lookSpikes,warned:()=>lookSpikesWarned,big:()=>lookBig,bigWarned:()=>lookBigWarned,setLockPending:v=>{lookLockPending=v}};')();
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

// 1.4 ventana tras (re)adquirir el pointer lock: se ignoran LOOK_LOCK_SKIP_EVENTS
T('pointer lock (lookLockSkip)', () => {
  ok(API.LOOK_LOCK_SKIP_EVENTS >= 2, `LOOK_LOCK_SKIP_EVENTS >= 2 (${API.LOOK_LOCK_SKIP_EVENTS})`);
  API.setLockPending(0);
  ok(API.lookLockSkip() === false, 'sin ventana → false (no ignora nada)');
  API.setLockPending(API.LOOK_LOCK_SKIP_EVENTS);
  const skipped = [];
  for (let k = 0; k < API.LOOK_LOCK_SKIP_EVENTS; k++) skipped.push(API.lookLockSkip());
  ok(skipped.every(v => v === true), `los ${API.LOOK_LOCK_SKIP_EVENTS} primeros eventos se ignoran (${skipped.join(',')})`);
  ok(API.lookLockSkip() === false, 'el evento siguiente a la ventana se procesa');
  ok(API.lookLockSkip() === false, 'la ventana quedó consumida → false');
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

// 1.6 tope de giro por frame: clampLookStep recorta el paso sin perder dirección
T('tope de giro por frame (clampLookStep)', () => {
  const max = API.LOOK_MAX_RAD_PER_FRAME, sens = 0.0042;
  ok(Math.abs(max - 0.30) < 1e-9, `LOOK_MAX_RAD_PER_FRAME = 0.30 (${max})`);

  // delta chico: pasa entero, sin escalado
  const small = API.clampLookStep(10, -4, sens, max);
  ok(Math.abs(small.yaw - (-10 * sens)) < 1e-12, `delta chico dx=10 → yaw completo (${small.yaw})`);
  ok(Math.abs(small.pitch - (4 * sens)) < 1e-12, `delta chico dy=-4 → pitch completo (${small.pitch})`);
  ok(small.usedX === 10 && small.usedY === -4, `delta chico consume el delta entero (${small.usedX},${small.usedY})`);

  // signos: el mouse a la derecha gira el yaw a la izquierda (menor)
  ok(API.clampLookStep(900, 0, sens, max).yaw < 0, 'dx>0 ⇒ yaw<0');
  ok(API.clampLookStep(-900, 0, sens, max).yaw > 0, 'dx<0 ⇒ yaw>0');
  ok(API.clampLookStep(0, 900, sens, max).pitch < 0, 'dy>0 ⇒ pitch<0');
  ok(API.clampLookStep(0, -900, sens, max).pitch > 0, 'dy<0 ⇒ pitch>0');

  // delta grande: ningún eje supera el tope y la dirección del gesto se conserva
  const big = API.clampLookStep(900, 300, sens, max);
  ok(Math.abs(big.yaw) <= max + 1e-12 && Math.abs(big.pitch) <= max + 1e-12,
    `delta grande (900,300) queda dentro del tope (${big.yaw}, ${big.pitch})`);
  ok(Math.abs(Math.abs(big.yaw) - max) < 1e-9, `el eje dominante aplica exactamente el tope (${big.yaw})`);
  ok(Math.abs(big.pitch / big.yaw - 300 / 900) < 1e-9, `la proporción entre ejes se conserva (${big.pitch / big.yaw})`);
  ok(Math.abs(big.usedX - Math.abs(big.yaw) / sens) < 1e-9, `usedX = píxeles aplicados en yaw (${big.usedX})`);
  ok(Math.abs(big.usedY - Math.abs(big.pitch) / sens) < 1e-9, `usedY = píxeles aplicados en pitch (${big.usedY})`);
  ok(Math.abs(big.usedX) < 900 && Math.abs(big.usedY) < 300, 'deja excedente para los frames siguientes');

  // eje dominante en Y y escala Chebyshev (mismo factor en ambos ejes)
  const bigBy = API.clampLookStep(200, 900, sens, max);
  ok(Math.abs(bigBy.pitch) <= max + 1e-12 && Math.abs(Math.abs(bigBy.pitch) - max) < 1e-9,
    `con dy dominante el tope cae en pitch (${bigBy.pitch})`);
  const diag = API.clampLookStep(700, 700, sens, max);
  ok(Math.abs(diag.yaw) <= max + 1e-12 && Math.abs(diag.pitch) <= max + 1e-12,
    `diagonal: ningún eje supera el tope (${diag.yaw}, ${diag.pitch})`);
  ok(Math.abs(Math.abs(diag.yaw) - Math.abs(diag.pitch)) < 1e-12,
    'diagonal: el MISMO factor escala ambos ejes (Chebyshev, no magnitud euclidiana)');
  ok(Math.abs(diag.yaw) > max * 0.99, `diagonal: el gesto se aprovecha al tope (${diag.yaw})`);
});

// 1.7 buffer de píxeles: acumula, drena con tope por frame y se resetea
T('buffer de mirada (lookQueue/drainLook/lookReset)', () => {
  const max = API.LOOK_MAX_RAD_PER_FRAME, sens = 0.0042;
  API.lookReset();
  ok(API.buffer().x === 0 && API.buffer().y === 0, 'lookReset() deja el buffer en cero');

  API.lookQueue(900, 0);
  ok(API.buffer().x === 900 && API.buffer().y === 0, `lookQueue acumula los píxeles (${API.buffer().x},${API.buffer().y})`);
  API.lookQueue(0, -30);
  ok(API.buffer().x === 900 && API.buffer().y === -30, 'lookQueue suma ambos ejes');
  API.lookQueue(-900, 30);
  ok(API.buffer().x === 0 && API.buffer().y === 0, 'lookQueue acumula en negativo y vuelve a cero');

  // sin drenar, lo pendiente se conserva
  API.lookQueue(900, 0);
  ok(API.buffer().x === 900, 'un frame sin drenar conserva lo pendiente');

  // drenaje frame a frame: nunca supera el tope, no pierde píxeles y termina vacío
  const target = { yaw: 0, pitch: 0 };
  let frames = 0, consumed = 0, overTop = false;
  while ((API.buffer().x !== 0 || API.buffer().y !== 0) && frames < 200) {
    const before = API.buffer().x;
    const step = API.drainLook(target, sens, max);
    if (Math.abs(step.yaw) > max + 1e-12 || Math.abs(step.pitch) > max + 1e-12) overTop = true;
    consumed += before - API.buffer().x;
    frames++;
  }
  ok(!overTop, `ningún frame supera LOOK_MAX_RAD_PER_FRAME (${max})`);
  ok(frames > 1, `900 px se reparten en varios frames (${frames})`);
  ok(Math.abs(consumed - 900) < 1e-6, `la suma de lo consumido iguala lo encolado (${consumed})`);
  ok(API.buffer().x === 0 && API.buffer().y === 0, 'el buffer termina vacío');
  ok(Math.abs(target.yaw - (-900 * sens)) < 1e-6, `la mirada giró el total exacto (${target.yaw})`);

  // el pitch se clampa a ±1.55 y el reset descarta lo pendiente
  const t2 = { yaw: 0, pitch: 0 };
  API.lookQueue(0, -900);
  while (API.buffer().y !== 0) API.drainLook(t2, sens, max);
  ok(Math.abs(t2.pitch - 1.55) < 1e-9, `el pitch drenado se clampa a +1.55 (${t2.pitch})`);
  API.lookQueue(500, 500);
  API.lookReset();
  ok(API.buffer().x === 0 && API.buffer().y === 0, 'al perder el lock el reset descarta el giro pendiente');
  const t3 = { yaw: 0, pitch: 0 };
  const none = API.drainLook(t3, sens, max);
  ok(none.yaw === 0 && none.pitch === 0 && t3.yaw === 0 && t3.pitch === 0, 'drenar sin buffer no gira nada');
});

// 1.8 diagnóstico de deltas grandes ACEPTADOS (distinto de los descartes)
T('diagnóstico de deltas grandes', () => {
  ok(API.LOOK_BIG_PX === 150, `LOOK_BIG_PX = 150 (${API.LOOK_BIG_PX})`);
  const warns = [];
  const realWarn = console.warn;
  const before = API.big();
  try {
    console.warn = (...a) => warns.push(a.join(' '));
    for (let k = 0; k < API.LOOK_WARN_MAX + 2; k++) API.noteLookBig(420, -3);
  } finally {
    console.warn = realWarn;
  }
  ok(API.big() === before + API.LOOK_WARN_MAX + 2, `big() sube en cada llamada (${API.big() - before})`);
  ok(warns.length === API.LOOK_WARN_MAX, `avisa solo LOOK_WARN_MAX veces (${warns.length})`);
  ok(/dx=420/.test(warns[0]) && /dy=-3/.test(warns[0]) && /#1\b/.test(warns[0]),
    `el 1er aviso trae contador y valores (${warns[0]})`);
  ok(API.bigWarned() === API.LOOK_WARN_MAX, `solo cuenta como avisados los primeros (${API.bigWarned()})`);
  ok(console.warn === realWarn, 'console.warn restaurado en finally');
});

// 1.9 autocontención: el bloque no referencia símbolos externos (patrón worldgen)
{
  const externos = (src) => [...new Set([...src
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    .matchAll(/\b(DEFS|THREE|document|window|player|MOUSE_SENSITIVITY|atlasTex|scene|camera|renderer)\b/g)].map(m => m[1]))];
  if (present) {
    const bad = externos(code);
    ok(bad.length === 0, 'bloque look autocontenido (sin símbolos externos' + (bad.length ? ': ' + bad.join(',') : '') + ')');
  }
  ok(externos('const x = DEFS[1] + THREE.foo + player.yaw').length === 3, 'detector de autocontención funciona (caso negativo DEFS/THREE/player)');
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

// 2.1 orden guard→encolar en el handler de escritorio (ya no escribe la mirada)
{
  const g = mh.indexOf('lookDeltaOk('), q = mh.search(/lookQueue\(/);
  const s = mh.indexOf('lookLockSkip()'), big = mh.indexOf('noteLookBig(');
  ok(g >= 0, 'estructura: mousemove consulta lookDeltaOk(');
  ok(q >= 0, 'estructura: mousemove encola el delta con lookQueue(');
  ok(g >= 0 && q >= 0 && g < q, 'estructura: en mousemove `lookDeltaOk(` aparece ANTES de encolar');
  ok(s >= 0 && q >= 0 && s < q, 'estructura: en mousemove `lookLockSkip()` antes de encolar');
  ok(big >= 0 && q >= 0 && big < q, 'estructura: mousemove llama noteLookBig( antes de encolar el delta grande');
  ok(!/player\.yaw/.test(mh) && !/player\.pitch/.test(mh), 'estructura: mousemove NO escribe player.yaw/pitch (lo hace el drenaje)');
  ok(/if\(locked\(\)\)\{[\s\S]*lookLockPending\s*=\s*LOOK_LOCK_SKIP_EVENTS/.test(pl),
    'estructura: pointerlockchange arma lookLockPending=LOOK_LOCK_SKIP_EVENTS dentro de if(locked())');
  ok(/lookReset\(\)/.test(pl), 'estructura: pointerlockchange resetea el buffer (lookReset)');
}

// 2.2 el loop drena el giro ANTES de armar la cámara (physicsGravity)
{
  const lp = grabFrom('function loop(now)');
  ok(lp !== '', 'estructura: se puede extraer function loop(now)');
  const d = lp.indexOf('drainLook('), pg = lp.indexOf('physicsGravity(');
  ok(d >= 0, 'estructura: loop drena el giro pendiente con drainLook(');
  ok(d >= 0 && pg >= 0 && d < pg, 'estructura: drainLook( aparece ANTES de physicsGravity( (sin frame de atraso)');
  ok(/started&&state==='play'&&!dead[^\n]*drainLook\(/.test(lp), 'estructura: sólo se drena en play y sin dead');
  ok(/drainLook\(\s*player\s*,\s*MOUSE_SENSITIVITY/.test(lp), 'estructura: el drenaje recibe MOUSE_SENSITIVITY (el slider sigue afectando al mouse)');
}

// 2.3 pointer lock sin aceleración del SO, con UN fallback clásico
{
  const tl = grabFrom('function tryLock()');
  ok(tl !== '', 'estructura: se puede extraer function tryLock()');
  ok(/requestPointerLock\(\s*\{\s*unadjustedMovement\s*:\s*true\s*\}\s*\)/.test(tl),
    'estructura: tryLock pide requestPointerLock({unadjustedMovement:true})');
  ok(/requestPointerLock\(\s*\)/.test(tl), 'estructura: tryLock tiene el fallback requestPointerLock() sin opciones');
  const plainCalls = (tl.match(/requestPointerLock\(\s*\)/g) || []).length;
  ok(plainCalls === 1, `un solo reintento clásico, sin cascada (${plainCalls})`);
  ok(/catch\(/.test(tl), 'estructura: el fallback cubre excepción síncrona y promesa rechazada');
}

// 2.4 no romper el control normal: sensibilidad, rango de pitch y guards intactos
{
  ok(/state!=='play'\|\|!locked\(\)\|\|dead/.test(mh), 'mousemove conserva los guards previos (play/lock/dead) en orden');
  ok(/-1\.55/.test(code) && /\b1\.55\b/.test(code), 'el drenaje conserva el rango de pitch (±1.55)');
  const dec = (html.match(/player\.yaw\s*-=/g) || []).length;
  ok(dec === 1, `solo el táctil escribe player.yaw -= (${dec})`);
  ok(/target\.yaw\s*\+=/.test(code), 'el drenaje acumula con target.yaw += (suma, nunca asigna)');
  ok(/drainLook\(\s*player\s*,/.test(html), 'el loop drena sobre el jugador (drainLook(player, …))');
  ok(/target\.pitch\s*=\s*Math\.max\(\s*-1\.55/.test(code), 'el drenaje clampa target.pitch con ±1.55');
  ok(!/player\.yaw\s*=(?!=)/.test(html), 'sin escrituras directas de player.yaw= en ningún lado');
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
  ok(/MOUSE_SENSITIVITY/.test(th), 'pointermove táctil usa MOUSE_SENSITIVITY (por defecto 0.0042)');
  ok(/-1\.55/.test(th) && /\b1\.55\b/.test(th), 'pointermove conserva el rango de pitch (±1.55)');
}

// 4.1 el script `test` de server/package.json da de alta este archivo (22 en total)
{
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'server', 'package.json'), 'utf8'));
  const s = pkg.scripts.test;
  const required = ['static','avatar','migrate','terrain','water','worldgen','zombie','zombie-client','zombie-protocol','avatar-held','client-robot','skins','camera','bot-cazador','lookguard','admin-hash','enter-chat','protocol','hora-argentina','cactus','config','bed-sleep'];
  const missing = required.filter(n => !new RegExp(`test/${n}\\.mjs`).test(s));
  const count = (s.match(/test\/[\w-]+\.mjs/g) || []).length;
  ok(missing.length === 0, `npm test da de alta los 22 archivos (faltan: ${missing.join(', ') || 'ninguno'})`);
  ok(count === 22, `el script test enumera 22 archivos (${count})`);
}

if (fails) console.log(`\n💥 ${fails} chequeo(s) fallaron`);
else console.log('\n🎉 guard de mirada OK');
process.exit(fails ? 1 : 0);
