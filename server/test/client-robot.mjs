// Tests del aspecto robot del avatar remoto (change bot-cazador, spec net/avatar):
// extrae el bloque /* robot:start */ ... /* robot:end */ de index.html y lo evalúa
// aislado con un stub mínimo de THREE (patrón de avatar.mjs/lookguard.mjs). Verifica
// su API (makeRobotModel/ROBOT_COLORS) y su geometría (grupo con cuerpo metálico,
// ojos brillantes y antena con luz), más el cableado en makeAvatar/addRemote/applyPm.
// Uso: node test/client-robot.mjs   (sale con código != 0 si algo falla)
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

// ---- stub mínimo de THREE (solo lo que usa el bloque) ----
const vec = (x, y, z) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });
const obj = () => ({
  children: [], position: vec(0, 0, 0), rotation: vec(0, 0, 0),
  scale: { x: 1, y: 1, z: 1, setScalar() {}, set() {} },
  userData: {}, visible: true, castShadow: false, isMesh: false, isMaterial: false,
  add(...o) { for (const c of o) this.children.push(c); return this; },
  traverse(fn) { fn(this); for (const c of this.children) if (c.traverse) c.traverse(fn); },
});
const THREE = {
  Group: function () { return obj(); },
  Mesh: function (g, m) { return Object.assign(obj(), { isMesh: true, geometry: g, material: m }); },
  BoxGeometry: function (w, h, d) { return { w, h, d }; },
  MeshLambertMaterial: function (o) { return Object.assign(obj(), { isMaterial: true }, o); },
  MeshBasicMaterial: function (o) { return Object.assign(obj(), { isMaterial: true }, o); },
};

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
const rgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// ---- extracción del bloque robot ----
const START = '/* robot:start */', END = '/* robot:end */';
const i = html.indexOf(START), j = html.indexOf(END);
const present = i >= 0 && j > i;
ok(present, 'bloque robot presente en index.html');
const code = present ? html.slice(i, j) : '';
let API = null;
if (present) {
  try {
    API = new Function('THREE', code + '\n;return {makeRobotModel, ROBOT_COLORS};')(THREE);
  } catch (e) { ok(false, 'bloque robot evaluable con THREE: ' + e.message); }
}
const T = (name, fn) => { if (!API) { ok(false, `${name}: sin API robot`); return; } try { fn(); } catch (e) { ok(false, `${name}: ${e.message}`); } };

// 1. API y paleta
T('API y paleta', () => {
  ok(typeof API.makeRobotModel === 'function', 'makeRobotModel es función');
  const c = API.ROBOT_COLORS;
  ok(c && typeof c === 'object', 'ROBOT_COLORS disponible');
  const [r, g, b] = rgb(c.shell);
  ok(Math.max(r, g, b) - Math.min(r, g, b) <= 40 && (r + g + b) / 3 >= 90 && (r + g + b) / 3 <= 210,
    `cuerpo metálico GRIS (shell #${c.shell.toString(16)})`);
  ok(typeof c.eye === 'number' && typeof c.light === 'number', 'hay colores de brillo (eye/light)');
});

// 2. geometría: grupo con cuerpo, ojos y antena
T('geometría: cuerpo, ojos y antena', () => {
  const reg = [];
  const r = API.makeRobotModel(7, m => reg.push(m));
  ok(r.g && Array.isArray(r.g.children) && r.g.children.length >= 9,
    `grupo con piezas (${r.g.children.length})`);
  ok(Array.isArray(r.meshes) && r.meshes.length >= 8, `meshes declaradas (${r.meshes.length})`);
  ok(reg.length === r.meshes.length && r.meshes.every(m => reg.includes(m)),
    'todas las mallas pasan por register (entran al PvP)');
  ok(r.meshes.every(m => m.userData.avatarId === 7), 'cada malla lleva su avatarId (raycast del PvP)');

  const torso = r.meshes.find(m => m.geometry.w === .54 && m.geometry.h === .68 && m.geometry.d === .32);
  ok(!!torso, 'torso presente (.54×.68×.32)');
  ok(!!torso && r.mats.includes(torso.material), 'el cuerpo entra en mats (flash de daño)');
  ok(!!torso && rgb(torso.material.color).every(v => v > 100), 'el cuerpo es claro (metálico)');

  ok(r.armL && r.armR && r.legL && r.legR, 'expone armL/armR/legL/legR (animación de caminar/ataque)');
  ok(r.armL.position.x < 0 && r.armR.position.x > 0, 'brazos a los costados');
  ok(r.legL.position.x < 0 && r.legR.position.x > 0, 'piernas a los costados');

  ok(r.eyes && r.eyes.children.length === 2, 'dos ojos');
  for (const e of r.eyes.children) {
    ok(e.material.emissive === API.ROBOT_COLORS.eye, 'ojo con emissive propio (brilla sin luz de escena)');
    ok(r.mats.indexOf(e.material) < 0, 'el ojo queda FUERA de mats (el flash no lo apaga)');
  }

  ok(r.antenna && r.antenna.children.length === 2, 'antena con varilla + punta');
  ok(r.antenna.children[1].material.emissive === API.ROBOT_COLORS.light, 'la punta de la antena brilla');
  ok(r.antenna.position.y > 1.8, 'la antena sale por encima de la cabeza');

  ok(r.chest && r.chest.material.emissive === API.ROBOT_COLORS.light, 'luz en el pecho');

  // el grupo contiene, además de las mallas de cuerpo/extremidades, los grupos de ojos y
  // antena y la luz del pecho suelta
  ok(r.g.children.length === r.meshes.length + 3,
    `el grupo cuelga cuerpo + ojos + antena + pecho (${r.g.children.length})`);
});

// el bloque es autocontenido: no toca la escena ni empuja directo al registro global (recibe `register`)
ok(!/avatarTargets\.(push|splice)|scene\./.test(code) && /register/.test(code),
  'el bloque es autocontenido (usa `register`, no el estado global)');

// 3. cableado en el cliente
{
  const ma = grabFn('makeAvatar');
  ok(/function\s+makeAvatar\(\s*id\s*,\s*name\s*,\s*admin\s*,\s*skin\s*,\s*opts\s*\)/.test(html),
    'makeAvatar recibe el aspecto como 4º parámetro y opts como 5º (remotos intactos)');
  ok(/makeRobotModel\s*\(/.test(ma), 'makeAvatar usa makeRobotModel');
  ok(/sid\s*===\s*'robot'/.test(ma), "makeAvatar elige la rama robot con el id resuelto (sid==='robot')");
  ok(/makeRobotModel\([^)]*avatarTargets\.push/.test(ma), 'las mallas del robot entran a avatarTargets vía register');

  const ar = grabFn('addRemote');
  ok(/makeAvatar\([^)]*typeof\s+p\.skin/.test(ar), 'addRemote propaga p.skin con guarda (cliente viejo ⇒ humano)');

  const ap = grabFn('applyPm');
  ok(/typeof\s+m\.skin\s*===\s*'string'/.test(ap), 'applyPm guarda/propaga m.skin');
  const pmH = html.slice(html.indexOf("m.t==='pm'"), html.indexOf("m.t==='pm'") + 420);
  ok(/pmBuf\.push\(\{[^}]*skin:/.test(pmH), 'el buffer de pm acarrea el skin hacia applyPm');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 client-robot (net/avatar) OK');
