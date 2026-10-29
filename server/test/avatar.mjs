// Tests del suavizado de avatares remotos (change suavizar-lag, spec net/avatar):
// snap si dist>6, lerp acotado si dist<=6, interpolación de yaw, buffer de pm y
// protección contra que un pedit remoto deje al jugador local dentro de un bloque.
// Extrae el bloque marcado /* net/avatar:start */ ... /* net/avatar:end */ de
// index.html y lo evalúa aislado (mismo enfoque que static.mjs).
// Uso: node test/avatar.mjs   (sale con código != 0 si algo falla)
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

// ---- extracción del bloque net/avatar ----
const START = '/* net/avatar:start */', END = '/* net/avatar:end */';
const i = html.indexOf(START), j = html.indexOf(END);
const present = i >= 0 && j > i;
ok(present, 'bloque net/avatar presente en index.html');
const code = present ? html.slice(i, j) : '';
let API = null;
if (present) {
  try {
    API = new Function(code + '\n;return {TELEPORT_DIST,PM_BUF_MS,PM_BUF_MAX,avatarShouldSnap,avatarLerpFactor,yawToward,pmQueueDrain,outOfCell};')();
  } catch (e) { ok(false, 'bloque net/avatar evaluable: ' + e.message); }
}
const T = (name, fn) => { if (!API) { ok(false, `${name}: sin API net/avatar`); return; } try { fn(); } catch (e) { ok(false, `${name}: ${e.message}`); } };

// 1. umbral de teleport: dist > 6 → snap; dist <= 6 → lerp
T('umbral teleport', () => {
  ok(API.TELEPORT_DIST === 6, `TELEPORT_DIST = 6 (${API.TELEPORT_DIST})`);
  ok(API.avatarShouldSnap(6.001) === true, 'dist 6.001 → snap');
  ok(API.avatarShouldSnap(12) === true, 'dist 12 → snap (ráfaga atrasada)');
  ok(API.avatarShouldSnap(6) === false, 'dist 6 → lerp (borde)');
  ok(API.avatarShouldSnap(2.5) === false, 'dist 2.5 → lerp');
  ok(API.avatarShouldSnap(0) === false, 'dist 0 → lerp (sin cambio)');
});

// 2. lerp acotado por frame
T('lerp acotado', () => {
  ok(near(API.avatarLerpFactor(0.016), 0.16), 'dt 16ms → factor 0.16');
  ok(API.avatarLerpFactor(0.05) === 0.5, 'dt 50ms → factor 0.5');
  ok(API.avatarLerpFactor(0.1) === 1, 'dt 100ms → factor 1 (tope)');
  ok(API.avatarLerpFactor(1) === 1, 'dt grande → factor topeado en 1 (no salta)');
});

// 3. interpolación de yaw
T('yaw interpolado', () => {
  ok(API.yawToward(1.2, 1.2, 0.016, 10) === 1.2, 'yaw igual → no cambia (estable)');
  const step = API.yawToward(0, 1, 0.016, 10);
  ok(step > 0 && step < 1, `yaw gira progresivo (${step.toFixed(3)})`);
  ok(API.yawToward(0, 1, 10, 10) === 1, 'rate completo → llega al objetivo');
  // camino angular más corto: cruzar ±π no debe dar un giro de 2π
  const cross = API.yawToward(Math.PI - 0.1, -Math.PI + 0.1, 0.5, 1);
  ok(cross > Math.PI - 0.1, 'yaw cruza ±π por el lado corto (no gira 2π)');
});

// 4. buffer de pm: ordena ráfagas, acota latencia
T('buffer pm', () => {
  const mk = (ts) => ts.map(t => ({ t, p: [t, 0, 0], yaw: 0 }));
  const buf = mk([0, 20, 40]);
  const d1 = API.pmQueueDrain(buf, 100, API.PM_BUF_MS, API.PM_BUF_MAX);
  ok(d1.length === 1 && d1[0].t === 0, 'ráfaga: solo madura el más viejo a los 100ms');
  const d2 = API.pmQueueDrain(buf, 140, API.PM_BUF_MS, API.PM_BUF_MAX);
  ok(d2.length === 2 && d2[0].t === 20 && d2[1].t === 40, 'ráfaga: el resto sale en orden de llegada');
  ok(d1[0].t < d2[0].t && d2[0].t < d2[1].t, 'pm nunca se aplican fuera de orden');
  // pm aislado espera hasta 100ms (no aplica a la mitad)
  const lone = mk([0]);
  ok(API.pmQueueDrain(lone, 50, API.PM_BUF_MS, API.PM_BUF_MAX).length === 0, 'pm aislado: bufferiza <100ms');
  ok(API.pmQueueDrain(lone, 100, API.PM_BUF_MS, API.PM_BUF_MAX).length === 1, 'pm aislado: aplica a los 100ms');
  // tope de latencia: el buffer no crece sin límite
  const many = mk(Array.from({ length: 15 }, () => 0));
  const drained = API.pmQueueDrain(many, 0, API.PM_BUF_MS, API.PM_BUF_MAX);
  ok(drained.length === 15 - API.PM_BUF_MAX, `overflow drena los más viejos (${drained.length})`);
  ok(many.length === API.PM_BUF_MAX, `buffer acotado a PM_BUF_MAX (${many.length})`);
});

// 5. pedit vs jugador local: sacarlo fuera de la celda, nunca dejarlo dentro
T('pedit saca al local', () => {
  const R = 0.3, HGT = 1.8;
  const inCell = (x, z, cx, cz) => x >= cx && x < cx + 1 && z >= cz && z < cz + 1;

  // no solapa la celda → no lo toca
  ok(API.outOfCell(10.5, 5, 10.5, R, HGT, 5, 5, 5, () => false) === null,
    'celda libre: el local no se mueve');

  // cubierto por la celda (5,5,5) → sale fuera
  const blockedCell = (nx, _ny, nz) => inCell(nx, nz, 5, 5);
  const a = API.outOfCell(5.5, 5, 5.5, R, HGT, 5, 5, 5, blockedCell);
  ok(!!a, 'cubierto: devuelve una salida');
  ok(!inCell(a.x, a.z, 5, 5), `sale de la celda (${a.x.toFixed(2)},${a.z.toFixed(2)})`);
  ok(!blockedCell(a.x, a.y, a.z), 'la salida elegida no está bloqueada');

  // el borde más cercano está bloqueado por otro bloque → elige el libre
  const blocked2 = (nx, _ny, nz) => inCell(nx, nz, 5, 5) || inCell(nx, nz, 5, 4);
  const b = API.outOfCell(5.5, 5, 5.2, R, HGT, 5, 5, 5, blocked2);
  ok(!!b && !inCell(b.x, b.z, 5, 5), 'borde cercano bloqueado: sale igual de la celda');
  ok(!blocked2(b.x, b.y, b.z), 'elige el borde libre (no el bloqueado)');

  // todo rodeado → igual lo saca (no lo deja atrapado)
  const c = API.outOfCell(5.5, 5, 5.5, R, HGT, 5, 5, 5, () => true);
  ok(!!c && !inCell(c.x, c.z, 5, 5), 'rodeado: igual lo saca de la celda (no queda dentro)');
});

// 5b. triangulación: bordes y casos adversos
T('triangulación', () => {
  const R = 0.3, HGT = 1.8, e = 1e-3;
  const inCell = (x, z, cx, cz) => x >= cx && x < cx + 1 && z >= cz && z < cz + 1;

  // cercanía al borde +X: elige ese borde (el más cercano), no el de −X
  const plusX = API.outOfCell(5.8, 5, 5.5, R, HGT, 5, 5, 5, (nx, _y, nz) => inCell(nx, nz, 5, 5));
  ok(plusX.x >= 6 - e, `elige el borde más cercano (+X: ${plusX.x.toFixed(2)})`);

  // bloque en otra altura no afecta al jugador (Y exacto)
  ok(API.outOfCell(5.5, 10, 5.5, R, HGT, 5, 5, 5, () => true) === null,
    'misma XZ pero otra Y: no lo toca');

  // umbral estricto: justo por debajo de 6 sigue siendo lerp
  ok(API.avatarShouldSnap(API.TELEPORT_DIST - 1e-9) === false, 'dist 6−ε → lerp (umbral estricto)');
  ok(API.avatarShouldSnap(API.TELEPORT_DIST + 1e-9) === true, 'dist 6+ε → snap (umbral estricto)');

  // lerp no decrece con dt (factor acotado, monótono hasta 1)
  let mono = true, prev = -1;
  for (let dt = 0; dt <= 0.2; dt += 0.01) { const f = API.avatarLerpFactor(dt); if (f < prev || f > 1) mono = false; prev = f; }
  ok(mono, 'avatarLerpFactor monótono y acotado a 1');

  // yaw opuesto (π): no debe oscilar ni dar NaN (elige un sentido estable)
  const flip = API.yawToward(0, Math.PI, 0.016, 10);
  ok(Number.isFinite(flip) && flip > 0, `yaw opuesto gira hacia el objetivo (${flip.toFixed(3)})`);

  // buffer vacío no rompe
  ok(API.pmQueueDrain([], 999, API.PM_BUF_MS, API.PM_BUF_MAX).length === 0, 'buffer vacío → nada');
});

// 6. cableado real: los handlers usan los helpers (evita código muerto)
{
  const tick = html.slice(html.indexOf('function tickAvatar'), html.indexOf('function tickAvatar') + 1400);
  ok(/avatarShouldSnap\s*\(/.test(tick) && /avatarLerpFactor\s*\(/.test(tick),
    'tickAvatar usa avatarShouldSnap + avatarLerpFactor');
  ok(/yawToward\s*\(/.test(tick), 'tickAvatar interpola yaw con yawToward');
  const pedit = html.slice(html.indexOf("m.t==='pedit'"), html.indexOf("m.t==='pedit'") + 320);
  ok(/pushLocalOutOfBlock\s*\(/.test(pedit), 'handler pedit llama a pushLocalOutOfBlock');
  const pm = html.slice(html.indexOf("m.t==='pm'"), html.indexOf("m.t==='pm'") + 420);
  ok(/pmQueueDrain|applyPm|pmBuf/.test(pm), 'handler pm usa el buffer/applyPm');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 avatar (net/avatar) OK');
