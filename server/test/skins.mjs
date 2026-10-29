// Tests del catálogo de aspectos del avatar remoto (change aspectos-jugador, specs net/avatar y
// ui/skins): extrae el bloque /* skins:start */ ... /* skins:end */ de index.html y lo evalúa
// aislado con `new Function` SIN THREE (mismo patrón que client-robot.mjs/avatar.mjs). Verifica el
// catálogo (ids, alturas, escala), el fallback a `human`, las alturas derivadas de etiqueta/barra/
// saludo/daño y, con estáticos, el cableado en makeAvatar/addRemote/applyPm/greetRemote/hitok y el
// selector del menú (#skinPicker, localStorage `mc-skin`, `skin` en el hello).
// Uso: node test/skins.mjs   (sale con código != 0 si algo falla)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
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

// ---- extracción del bloque skins (sin THREE) ----
const START = '/* skins:start */', END = '/* skins:end */';
const i = html.indexOf(START), j = html.indexOf(END);
const present = i >= 0 && j > i;
ok(present, 'bloque skins presente en index.html');
const code = present ? html.slice(i, j) : '';
let API = null;
if (present) {
  try {
    API = new Function(code + '\n;return {BASE_H, SKIN_SPECS, PLAYER_SKINS, DEFAULT_SKIN, ' +
      'resolveSkin, skinSpec, avatarTagY, avatarBarY, avatarGreetY, avatarDamageY, ' +
      'sizeFactor, playerBox, eyeHeight, playerTop, reachFor};')();
  } catch (e) { ok(false, 'bloque skins evaluable SIN THREE: ' + e.message); }
}
const T = (name, fn) => { if (!API) { ok(false, `${name}: sin API skins`); return; } try { fn(); } catch (e) { ok(false, `${name}: ${e.message}`); } };

// 1. catálogo: seis ids exactos, etiquetas, alturas y escala
T('catálogo de aspectos', () => {
  const ids = Object.keys(API.SKIN_SPECS).sort();
  ok(ids.join(',') === 'fat,giant,human,robot,small,zombie',
    `el catálogo tiene exactamente seis aspectos (${ids.join(',')})`);
  for (const id of ids) {
    const s = API.SKIN_SPECS[id];
    ok(typeof s.label === 'string' && s.label.trim().length > 0, `${id}: declara etiqueta (${s.label})`);
    ok(typeof s.height === 'number' && s.height > 0, `${id}: declara altura (${s.height})`);
    ok(s.colors && typeof s.colors === 'object' && Object.keys(s.colors).length > 0,
      `${id}: declara datos de color del modelo`);
  }
  ok(API.BASE_H === 1.97, `BASE_H es el top real del rig humano (${API.BASE_H})`);
  ok(API.SKIN_SPECS.human.height === 1.97, `human mide 1.97 (${API.SKIN_SPECS.human.height})`);
  ok(API.SKIN_SPECS.zombie.height === 1.97, `zombie mide 1.97 (${API.SKIN_SPECS.zombie.height})`);
  ok(API.SKIN_SPECS.fat.height === 1.70, `fat mide 1.70 (${API.SKIN_SPECS.fat.height})`);
  ok(API.SKIN_SPECS.giant.height === 5, `giant mide exactamente 5 (${API.SKIN_SPECS.giant.height})`);
  ok(API.SKIN_SPECS.small.height === 0.9, `small mide exactamente 0.9 (${API.SKIN_SPECS.small.height})`);
  ok(API.SKIN_SPECS.robot.height === 1.90, `robot mide 1.90 nominal (${API.SKIN_SPECS.robot.height})`);

  ok(API.PLAYER_SKINS.length === 5, `PLAYER_SKINS tiene cinco opciones (${API.PLAYER_SKINS.length})`);
  ok(API.PLAYER_SKINS.join(',') === 'human,fat,giant,small,zombie',
    `PLAYER_SKINS son los cinco de jugador (${API.PLAYER_SKINS.join(',')})`);
  ok(!API.PLAYER_SKINS.includes('robot'), 'robot no es una opción de jugador');
  ok(API.DEFAULT_SKIN === 'human', 'el aspecto por defecto es human');
});

T('escala de los modelos', () => {
  for (const id of ['human', 'fat', 'zombie', 'robot'])
    ok(API.SKIN_SPECS[id].scale === 1, `${id}: no se escala (scale 1)`);
  for (const id of ['giant', 'small']) {
    const s = API.SKIN_SPECS[id];
    ok(s.scale === s.height / API.BASE_H, `${id}: scale === height/BASE_H (${s.scale})`);
    ok(near(s.scale * API.BASE_H, s.height), `${id}: el modelo escalado da su altura (${s.scale * API.BASE_H})`);
  }
  ok(near(API.SKIN_SPECS.giant.scale * API.BASE_H, 5), 'giant escala a 5.00 (tolerancia < 1e-9)');
  ok(near(API.SKIN_SPECS.small.scale * API.BASE_H, 0.9), 'small escala a 0.90 (tolerancia < 1e-9)');
});

// 2. fallback a human
T('resolveSkin', () => {
  for (const id of ['human', 'fat', 'giant', 'small', 'zombie', 'robot'])
    ok(API.resolveSkin(id) === id, `${id}: un id válido se conserva`);
  ok(API.resolveSkin('robot') === 'robot', 'robot sigue siendo válido (aspecto del bot)');
  for (const bad of [undefined, '', null, 42, {}, [], 'dragon', 'Human!'])
    ok(API.resolveSkin(bad) === 'human', `valor inválido ${JSON.stringify(bad)} ⇒ human`);
  ok(API.skinSpec('dragon') === API.SKIN_SPECS.human, 'skinSpec(desconocido) cae en la spec humana');
  ok(API.skinSpec('giant') === API.SKIN_SPECS.giant, 'skinSpec(giant) devuelve la spec del gigante');
});

// 3. alturas derivadas de etiqueta, barra, saludo y daño
T('alturas derivadas', () => {
  const H = id => API.SKIN_SPECS[id];
  // human conserva EXACTAMENTE los valores actuales (pixel-idéntico)
  ok(API.avatarTagY(H('human')) === 2.45, `human: etiqueta 2.45 (${API.avatarTagY(H('human'))})`);
  ok(API.avatarBarY(H('human')) === 2.1, `human: barra 2.10 (${API.avatarBarY(H('human'))})`);
  ok(API.avatarGreetY(H('human')) === 1.7, `human: saludo 1.70 (${API.avatarGreetY(H('human'))})`);
  ok(API.avatarDamageY(H('human')) === 2.2, `human: daño 2.20 (${API.avatarDamageY(H('human'))})`);

  ok(near(API.avatarTagY(H('giant')), 5.48), `giant: etiqueta 5.48 (${API.avatarTagY(H('giant'))})`);
  ok(near(API.avatarBarY(H('giant')), 5.13), `giant: barra 5.13 (${API.avatarBarY(H('giant'))})`);
  ok(near(API.avatarGreetY(H('giant')), 4.73), `giant: saludo 4.73 (${API.avatarGreetY(H('giant'))})`);
  ok(near(API.avatarDamageY(H('giant')), 5.23), `giant: daño 5.23 (${API.avatarDamageY(H('giant'))})`);

  ok(near(API.avatarTagY(H('small')), 1.38), `small: etiqueta 1.38 (${API.avatarTagY(H('small'))})`);
  ok(near(API.avatarBarY(H('small')), 1.03), `small: barra 1.03 (${API.avatarBarY(H('small'))})`);
  ok(near(API.avatarGreetY(H('small')), 0.63), `small: saludo 0.63 (${API.avatarGreetY(H('small'))})`);
  ok(near(API.avatarDamageY(H('small')), 1.13), `small: daño 1.13 (${API.avatarDamageY(H('small'))})`);

  // las cuatro alturas crecen con la altura del aspecto (monotonía human < giant / small < human)
  for (const id of ['fat', 'small', 'human', 'giant']) {
    ok(API.avatarTagY(H(id)) > H(id).height, `${id}: la etiqueta queda sobre la cabeza`);
    ok(API.avatarBarY(H(id)) > H(id).height, `${id}: la barra queda sobre la cabeza`);
    ok(API.avatarGreetY(H(id)) < H(id).height, `${id}: el saludo queda dentro del cuerpo`);
  }
  ok(API.avatarTagY(H('small')) < API.avatarTagY(H('human')) && API.avatarTagY(H('human')) < API.avatarTagY(H('giant')),
    'las alturas derivadas son monótonas con la altura del aspecto');
});

// 4. estáticos de cableado en makeAvatar/addRemote/applyPm/greetRemote/hitok
{
  const ma = grabFn('makeAvatar');
  ok(/function\s+makeAvatar\(\s*id\s*,\s*name\s*,\s*admin\s*,\s*skin\s*,\s*opts\s*\)/.test(html),
    'makeAvatar conserva la firma y agrega opts (5º, opcional)');
  ok(/resolveSkin\s*\(/.test(ma), 'makeAvatar resuelve el aspecto con resolveSkin');
  ok(/SKIN_SPECS\[/.test(ma), 'makeAvatar lee el catálogo (SKIN_SPECS)');
  const branch = id => new RegExp(`(?:sid|skin)\\s*===\\s*'${id}'`).test(ma);
  for (const id of ['fat', 'giant', 'small', 'zombie', 'robot'])
    ok(branch(id), `makeAvatar tiene la rama ${id}`);
  ok(/makeRobotModel\s*\(/.test(ma) && /makeRobotModel\([^)]*avatarTargets\.push/.test(ma),
    'la rama robot sigue usando makeRobotModel con sus mallas en avatarTargets');
  ok(/avatarTargets\.push\s*\(m\)/.test(ma), 'las mallas del cuerpo entran a avatarTargets (PvP)');
  ok(/avatarTagY\s*\(/.test(ma) && /avatarBarY\s*\(/.test(ma),
    'etiqueta y barra se posicionan con los helpers de altura');
  ok(/g\.add\(tag\)/.test(ma) && /g\.add\(bar\)/.test(ma),
    'etiqueta y barra cuelgan de g (no del sub-grupo escalado)');
  ok(/new THREE\.Group\(\)/.test(ma) && /g\.add\(body\)/.test(ma) && /body\.scale\.setScalar\(spec\.scale\)/.test(ma),
    'giant/small usan un sub-grupo body escalado dentro de g');
  ok(!/(?<![\w.])g\.scale\.setScalar/.test(ma), 'g NO se escala (posición, yaw y texto quedan intactos)');
  ok(/emissive\s*:/.test(ma) && !/mats\.push\(eyeMat\)/.test(ma),
    'los ojos emisivos del zombie quedan FUERA de mats (el flash de daño no los apaga)');

  const ar = grabFn('addRemote');
  ok(/a\.skin\s*=\s*resolveSkin\(p\.skin\)/.test(ar), 'addRemote guarda el id resuelto (no el string crudo)');
  ok(!/a\.skin\s*=\s*p\.skin/.test(ar), 'addRemote no guarda el skin crudo');

  const ap = grabFn('applyPm');
  ok(/a\.skin\s*=\s*resolveSkin\(m\.skin\)/.test(ap), 'applyPm guarda el id resuelto (no el string crudo)');
  ok(!/a\.skin\s*=\s*m\.skin/.test(ap), 'applyPm no guarda el skin crudo');

  const gr = grabFn('greetRemote');
  ok(/avatarGreetY\(skinSpec\(a\.skin\)\)/.test(gr), 'greetRemote usa la altura del saludo del aspecto');

  const hk = html.slice(html.indexOf("m.t==='hitok'"), html.indexOf("m.t==='hitok'") + 520);
  ok(/avatarDamageY\(skinSpec\(a\.skin\)\)/.test(hk), 'el daño flotante del hitok usa la altura del aspecto');
}

// 5. estáticos del menú, localStorage y hello
{
  const picker = (html.match(/<div id="skinPicker"[\s\S]*?<\/div>/) || [''])[0];
  ok(picker.length > 0, 'el menú tiene #skinPicker');
  ok(/role="radiogroup"/.test(picker), 'el selector es un radiogroup accesible');
  const opts = [...picker.matchAll(/data-skin="([^"]+)"/g)].map(m => m[1]);
  ok(opts.length === 5, `el selector ofrece cinco aspectos (${opts.length})`);
  ok(opts.join(',') === 'human,fat,giant,small,zombie', `las opciones son las de jugador (${opts.join(',')})`);
  ok(!opts.includes('robot'), 'robot no aparece en el selector');
  for (const id of opts) ok(/aria-checked="(?:true|false)"/.test(picker), `${id}: botón con aria-checked`);

  const hint = (html.match(/id="skinHint"[^>]*>([^<]*)</) || [])[1] || '';
  ok(/los demás/.test(hint) && /primera persona/.test(hint),
    `#skinHint aclara que el aspecto es cómo te ven los demás (${JSON.stringify(hint.trim())})`);

  const setSkin = grabFn('setSkin');
  ok(/classList\.toggle\('on'/.test(setSkin), 'la opción elegida se marca con .on');
  ok(/aria-checked/.test(setSkin), 'la opción elegida actualiza aria-checked');
  ok(/localStorage\.setItem\(\s*'mc-skin'/.test(setSkin), "la elección se persiste en localStorage('mc-skin')");
  ok(/let mySkin\s*=\s*'human'/.test(html), "mySkin arranca en 'human'");

  const restore = html.slice(html.indexOf("localStorage.getItem('mc-skin')") - 260,
    html.indexOf("localStorage.getItem('mc-skin')") + 160);
  ok(/localStorage\.getItem\(\s*'mc-skin'/.test(html), "el boot restaura localStorage('mc-skin')");
  ok(/PLAYER_SKINS\.includes\(/.test(html), 'la restauración acepta sólo opciones de jugador (PLAYER_SKINS)');
  ok(/savedSkin|guardad|saved/i.test(restore), 'la restauración lee el valor guardado antes de aplicarlo');

  const cmp = grabFn('connectMP');
  ok(/t\s*:\s*'hello'/.test(cmp) && /skin\s*:\s*mySkin/.test(cmp), 'el hello de connectMP lleva skin: mySkin');
}

// 6. escala de jugabilidad derivada del aspecto (10.1)
T('sizeFactor, playerBox, eyeHeight y playerTop', () => {
  const f = API.sizeFactor;
  for (const id of ['human', 'zombie'])
    ok(f(id) === 1, `${id}: factor de tamaño 1 (${f(id)})`);
  ok(near(f('fat'), 0.862944, 1e-6), `fat: factor ≈ 0.86294 (${f('fat')})`);
  ok(near(f('giant'), 2.538071, 1e-6), `giant: factor ≈ 2.53807 (${f('giant')})`);
  ok(near(f('small'), 0.456853, 1e-6), `small: factor ≈ 0.45685 (${f('small')})`);
  ok(near(f('robot'), 0.964467, 1e-6), `robot: factor ≈ 0.96447 (${f('robot')})`);
  ok(f('dragon') === 1 && f(undefined) === 1 && f(null) === 1,
    'un aspecto desconocido cae en human (factor 1)');

  const box = API.playerBox;
  const hb = box('human');
  ok(hb.r === 0.3 && hb.h === 1.8, `human: caja exacta 0.3 × 1.8 (${hb.r} × ${hb.h})`);
  ok(near(box('giant').r, 0.761, 1e-3) && near(box('giant').h, 4.568, 1e-3),
    `giant: caja ≈ 0.761 × 4.568 (${box('giant').r} × ${box('giant').h})`);
  ok(near(box('small').r, 0.137, 1e-3) && near(box('small').h, 0.822, 1e-3),
    `small: caja ≈ 0.137 × 0.822 (${box('small').r} × ${box('small').h})`);
  ok(near(box('fat').r, 0.259, 1e-3) && near(box('fat').h, 1.553, 1e-3),
    `fat: caja ≈ 0.259 × 1.553 (${box('fat').r} × ${box('fat').h})`);

  ok(API.eyeHeight('human') === 1.62, `human: ojo 1.62 (${API.eyeHeight('human')})`);
  ok(near(API.eyeHeight('giant'), 4.112, 1e-3), `giant: ojo ≈ 4.112 (${API.eyeHeight('giant')})`);
  ok(near(API.eyeHeight('small'), 0.740, 1e-3), `small: ojo ≈ 0.740 (${API.eyeHeight('small')})`);

  ok(API.playerTop('human') === 1.97 && API.playerTop('giant') === 5 && API.playerTop('small') === 0.9,
    'playerTop devuelve la altura real de la spec');
});

T('reachFor', () => {
  ok(API.reachFor(8, 'human') === 8 && API.reachFor(4.6, 'human') === 4.6 && API.reachFor(6, 'human') === 6,
    'human: conserva los alcances 8 / 4.6 / 6');
  ok(near(API.reachFor(8, 'giant'), 20.305, 1e-3) && near(API.reachFor(4.6, 'giant'), 11.675, 1e-3) &&
    near(API.reachFor(6, 'giant'), 15.228, 1e-3),
    `giant: alcances ≈ 20.305 / 11.675 / 15.228 (${API.reachFor(8, 'giant')} / ${API.reachFor(4.6, 'giant')} / ${API.reachFor(6, 'giant')})`);
  ok(near(API.reachFor(8, 'small'), 3.655, 1e-3) && near(API.reachFor(4.6, 'small'), 2.102, 1e-3) &&
    near(API.reachFor(6, 'small'), 2.741, 1e-3),
    `small: alcances ≈ 3.655 / 2.102 / 2.741 (${API.reachFor(8, 'small')} / ${API.reachFor(4.6, 'small')} / ${API.reachFor(6, 'small')})`);
  ok(API.reachFor(8, 'dragon') === 8, 'un aspecto desconocido conserva el alcance base');
});

// 7. estáticos del cableado de la escala (10.2)
{
  const col = grabFn('collides');
  ok(/playerBox\s*\(\s*mySkin\s*\)/.test(col), 'collides usa playerBox(mySkin)');
  ok(/collidesAt\s*\(/.test(col) && /\.r\s*,\s*b\.h|\.r\s*,\s*box\.h/.test(col),
    'collides pasa la caja del aspecto a collidesAt');
  ok(!/\.3\s*,\s*1\.8/.test(col), 'collides ya no usa la caja fija .3/1.8');

  const slab = grabFn('slabBlocked');
  ok(/playerBox\s*\(\s*mySkin\s*\)\s*\.r/.test(slab),
    'slabBlocked usa el radio de playerBox(mySkin)');

  const fsp = grabFn('findSpawn');
  ok(/playerBox\s*\(\s*mySkin\s*\)/.test(fsp), 'findSpawn deriva la caja del aspecto');
  ok(/Math\.max\s*\(\s*4\s*,\s*Math\.ceil\s*\(\s*box\.h\s*\)\s*\)/.test(fsp),
    'findSpawn exige max(4, ceil(h)) bloques de aire');
  ok(/collidesAt\s*\([\s\S]*?box\.r\s*,\s*box\.h/.test(fsp),
    'findSpawn valida con collidesAt(..., box.r, box.h)');
  ok(/return new THREE\.Vector3\(sx\+\.5,hAt\(sx-OX,sz-OZ\)\+2,sz\+\.5\)/.test(fsp),
    'findSpawn conserva el fallback actual');

  const push = grabFn('pushLocalOutOfBlock');
  ok(/playerBox\s*\(\s*mySkin\s*\)/.test(push), 'pushLocalOutOfBlock usa playerBox(mySkin)');
  ok(/outOfCell\s*\([\s\S]*?b\.r\s*,\s*b\.h/.test(push),
    'pushLocalOutOfBlock pasa la caja a outOfCell');

  const op = grabFn('ocupadoPor');
  ok(/playerBox\s*\(\s*mySkin\s*\)/.test(op), 'ocupadoPor usa playerBox(mySkin) para el jugador local');
  ok(/playerBox\s*\(\s*a\.skin\s*\)/.test(op), 'ocupadoPor usa playerBox(a.skin) para cada remoto');
  ok(/,\s*0?\.1\s*\)/.test(op), 'ocupadoPor conserva el margen .1 de los remotos');
  ok(/\.32\s*,\s*1\.2/.test(op), 'ocupadoPor conserva la caja de los animales');

  const rc = grabFn('raycast');
  ok(/requested\s*=\s*maxD\s*==\s*null\s*\?\s*8\s*:\s*maxD/.test(rc),
    'raycast resuelve requested = maxD ?? 8');
  ok(/reachFor\s*\(\s*requested\s*,\s*mySkin\s*\)/.test(rc), 'raycast escala el alcance con reachFor');
  ok(/t\s*>\s*max\b/.test(rc), 'raycast corta en el máximo escalado');
  ok(!/function\s+raycast\s*\(\s*maxD\s*=\s*8/.test(html), 'raycast ya no fija maxD=8 en la firma');

  ok(/reachFor\s*\(\s*4\.6\s*,\s*mySkin\s*\)/.test(grabFn('avatarHit')),
    'avatarHit usa reachFor(4.6, mySkin)');
  ok(/reachFor\s*\(\s*4\.6\s*,\s*mySkin\s*\)/.test(grabFn('zombieHit')),
    'zombieHit usa reachFor(4.6, mySkin)');
  ok(/reachFor\s*\(\s*6\s*,\s*mySkin\s*\)/.test(grabFn('animalHit')),
    'animalHit usa reachFor(6, mySkin)');

  const pi = html.indexOf("m.t==='phit'");
  const ph = pi >= 0 ? html.slice(pi, pi + 520) : '';
  ok(/spawnDmgNum\s*\([\s\S]{0,160}?playerTop\s*\(\s*mySkin\s*\)\s*\+\s*0?\.33/.test(ph),
    'el daño propio flotante usa playerTop(mySkin) + 0.33');
  ok(!/\+\s*2\.3\b/.test(ph), 'el daño propio ya no está fijo en 2.3');
}

// 8. servidor: tabla de tamaños y alcance de la espada (10.4)
let SRV = null;
try { SRV = require(path.join(root, 'server', 'skins.js')); } catch (e) { SRV = null; }
{
  ok(SRV !== null, 'server/skins.js existe y se puede importar');
  ok(SRV && SRV.BASE_H === 1.97, `server/skins.js declara BASE_H 1.97 (${SRV && SRV.BASE_H})`);
  ok(SRV && SRV.SKIN_SIZE && Object.keys(SRV.SKIN_SIZE).length === 6,
    'server/skins.js exporta SKIN_SIZE con los seis aspectos');
  for (const id of ['human', 'fat', 'giant', 'small', 'zombie', 'robot']) {
    const want = API ? API.SKIN_SPECS[id].height / API.BASE_H : null;
    ok(SRV && SRV.SKIN_SIZE && near(SRV.SKIN_SIZE[id], want, 1e-12),
      `${id}: el factor del servidor coincide con el cliente (${SRV && SRV.SKIN_SIZE && SRV.SKIN_SIZE[id]})`);
  }
  ok(SRV && typeof SRV.sizeFactor === 'function', 'server/skins.js exporta sizeFactor');
  if (SRV && typeof SRV.sizeFactor === 'function') {
    ok(SRV.sizeFactor('human') === 1 && SRV.sizeFactor('zombie') === 1, 'servidor: human/zombie factor 1');
    ok(near(SRV.sizeFactor('giant'), 2.538071, 1e-6), `servidor: giant ≈ 2.53807 (${SRV.sizeFactor('giant')})`);
    ok(SRV.sizeFactor('dragon') === 1 && SRV.sizeFactor(undefined) === 1,
      'servidor: aspecto desconocido ⇒ 1');
  }
  ok(SRV && typeof SRV.swordReach === 'function', 'server/skins.js exporta swordReach');
  if (SRV && typeof SRV.swordReach === 'function') {
    ok(SRV.swordReach('human') === 4.6, `swordReach(human) = 4.6 (${SRV.swordReach('human')})`);
    ok(SRV.swordReach('giant') > 11.6, `swordReach(giant) > 11.6 (${SRV.swordReach('giant')})`);
    ok(SRV.swordReach('small') < 2.2, `swordReach(small) < 2.2 (${SRV.swordReach('small')})`);
    ok(near(SRV.swordReach('giant'), 11.675, 1e-3) && near(SRV.swordReach('small'), 2.102, 1e-3),
      'swordReach escala 4.6 por el factor del aspecto');
  }
  const zsrc = fs.readFileSync(path.join(root, 'server', 'zombie.js'), 'utf8');
  ok(/function\s+hit\s*\([^)]*playerPos\s*,\s*skin\s*\)/.test(zsrc),
    'zombie.js hit() acepta el skin como quinto parámetro opcional');
  ok(/swordReach\s*\(\s*skin\s*\)/.test(zsrc), 'zombie.js valida el alcance con swordReach(skin)');
  const srvsrc = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
  ok(/horde\.hit\s*\([\s\S]*?me\.pos\s*,\s*me\.skin\s*\)/.test(srvsrc),
    'server.js pasa me.skin al validar el zhit');
}

// 9. la tabla de aspectos del README coincide con SKIN_SPECS
{
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const rows = [...readme.matchAll(/\|\s*`([a-z]+)`\s*\|\s*([^|]+?)\s*\|\s*([\d.]+)\s*\|\s*([^|]*)\|/g)]
    .map(m => ({ id: m[1], label: m[2], height: parseFloat(m[3]), note: m[4] }));
  const byId = new Map(rows.map(r => [r.id, r]));
  let same = true;
  for (const id of Object.keys(API ? API.SKIN_SPECS : {})) {
    const row = byId.get(id);
    if (!row || row.height !== API.SKIN_SPECS[id].height) same = false;
  }
  ok(same && rows.length === 6,
    `README documenta los seis aspectos con las alturas del catálogo (${rows.map(r => r.id + ':' + r.height).join(', ')})`);
  ok(rows.filter(r => r.id === 'giant' || r.id === 'small').every(r => /ya no es s[oó]lo visual/i.test(r.note)),
    'README aclara que giant/small ya no son sólo visuales');
  ok(/ojo/i.test(readme) && /hitbox|caja/i.test(readme) && /alcance/i.test(readme),
    'README documenta que el tamaño cambia ojo, hitbox y alcances');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 skins (net/avatar + ui/skins) OK');
