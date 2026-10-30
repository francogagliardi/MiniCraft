// Tests de la cámara en 1ª/3ª trasera/3ª frontal (change aspectos-jugador, spec ui/camera): extrae el
// bloque /* camera:start */ ... /* camera:end */ de index.html y lo evalúa aislado con
// `new Function` SIN THREE (mismo patrón que skins.mjs/client-robot.mjs). Verifica la matemática
// pura (constantes, modo guardado, órbita detrás del ojo y recorte) y, con estáticos, el
// cableado: toggle V/#btnCam, persistencia `mc-cam`, avatar local sin PvP ni HUD, viewmodel
// oculto en 3ª, raycasts/agua desde el ojo y la rama de cámara en physicsGravity.
// Uso: node test/camera.mjs   (sale con código != 0 si algo falla)
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

// Extrae un handler u objeto desde un marcador con llaves balanceadas.
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

// ---- extracción del bloque camera (sin THREE) ----
const START = '/* camera:start */', END = '/* camera:end */';
const i = html.indexOf(START), j = html.indexOf(END);
const present = i >= 0 && j > i;
ok(present, 'bloque camera presente en index.html');
const code = present ? html.slice(i, j) : '';
let API = null;
if (present) {
  try {
    API = new Function(code + '\n;return {CAM_DIST, CAM_MIN, camModeOf, nextCamMode, camOffset, clampCam};')();
    ok(true, 'bloque camera evaluable SIN THREE y con API completa');
  } catch (e) { ok(false, 'bloque camera evaluable SIN THREE: ' + e.message); }
}
const T = (name, fn) => { if (!API) { ok(false, `${name}: sin API camera`); return; } try { fn(); } catch (e) { ok(false, `${name}: ${e.message}`); } };

// 1. constantes, modo guardado y ciclo
T('constantes y camModeOf', () => {
  ok(API.CAM_DIST === 4.5, `CAM_DIST es 4.5 (${API.CAM_DIST})`);
  ok(API.CAM_MIN === 0.6, `CAM_MIN es 0.6 (${API.CAM_MIN})`);
  ok(API.camModeOf('first') === 'first', "camModeOf('first') ⇒ first");
  ok(API.camModeOf('third') === 'third', "camModeOf('third') ⇒ third");
  ok(API.camModeOf('front') === 'front', "camModeOf('front') ⇒ front");
  for (const bad of ['', null, undefined, 'Tercera', 'FRONT', 42])
    ok(API.camModeOf(bad) === 'first', `valor inválido ${JSON.stringify(bad)} ⇒ first`);
});

T('nextCamMode', () => {
  ok(API.nextCamMode('first') === 'third', "nextCamMode('first') ⇒ third");
  ok(API.nextCamMode('third') === 'front', "nextCamMode('third') ⇒ front");
  ok(API.nextCamMode('front') === 'first', "nextCamMode('front') ⇒ first");
  for (const bad of ['', null, undefined, 42, 'FRONT', 'tercera', 'first '])
    ok(API.nextCamMode(bad) === 'third', `nextCamMode inválido ${JSON.stringify(bad)} ⇒ third`);
});

// 2. órbita: -lookDir * dist, sin tocar la rotación
T('camOffset', () => {
  const d = 4.5;
  const back = API.camOffset(0, 0, d); // yaw=0 mira a -Z ⇒ cámara detrás en +Z
  ok(near(back.x, 0) && near(back.y, 0) && near(back.z, d), `yaw=0,pitch=0 ⇒ (0,0,${d})`);
  const right = API.camOffset(Math.PI / 2, 0, d); // mira a -X ⇒ cámara en +X
  ok(near(right.x, d) && near(right.y, 0) && near(right.z, 0), `yaw=π/2 ⇒ (${d},0,0)`);
  const front = API.camOffset(Math.PI, 0, d); // mira a +Z ⇒ cámara en -Z
  ok(near(front.x, 0) && near(front.z, -d), `yaw=π ⇒ (0,0,${-d})`);
  const any = API.camOffset(0.31, -0.42, 2.2);
  ok(near(Math.hypot(any.x, any.y, any.z), 2.2), `el módulo del offset es la distancia (${Math.hypot(any.x, any.y, any.z)})`);
  const up = API.camOffset(0, 0.5, 2); // pitch positivo (mirando arriba) baja la cámara
  ok(up.y < 0, `pitch positivo baja la cámara (y=${up.y})`);
  const down = API.camOffset(0, -0.5, 2);
  ok(down.y > 0 && near(down.y, -up.y), 'pitch negativo sube la cámara (simétrico)');
  // signo negativo: la cámara frontal queda DELANTE (sobre la mirada)
  const fwd = API.camOffset(0, 0, -d);
  ok(near(fwd.x, 0) && near(fwd.y, 0) && near(fwd.z, -d),
    `yaw=0,pitch=0,dist=-${d} ⇒ (0,0,${-d}) (delante)`);
  const fwdRight = API.camOffset(Math.PI / 2, 0, -d);
  ok(near(fwdRight.x, -d) && near(fwdRight.y, 0) && near(fwdRight.z, 0),
    `yaw=π/2,dist=-${d} ⇒ (${-d},0,0) (delante)`);
  ok(near(Math.hypot(fwd.x, fwd.y, fwd.z), d), `el módulo frontal sigue siendo ${d}`);
  const frontAny = API.camOffset(0.31, -0.42, -2.2);
  ok(near(Math.hypot(frontAny.x, frontAny.y, frontAny.z), 2.2), 'el módulo frontal conserva la distancia 2.2');
});

// 3. recorte por obstáculo
T('clampCam', () => {
  ok(API.clampCam(4.5, null) === 4.5, 'sin impacto (null) ⇒ distancia objetivo 4.5');
  ok(API.clampCam(4.5, 2) === 1.75, 'pared a 2 ⇒ 1.75 (hit - 0.25)');
  ok(API.clampCam(4.5, 0.7) === 0.6, 'obstáculo muy cerca ⇒ mínimo 0.6');
  ok(API.clampCam(4.5, 10) === 4.5, 'impacto lejano ⇒ distancia objetivo 4.5');
  ok(API.clampCam(4.5, 4.7) === 4.45, 'impacto apenas detrás del objetivo recorta (4.7-0.25)');
  ok(API.clampCam(3, null) === 3, 'sin impacto conserva cualquier distancia pedida');
  ok(API.clampCam(4.5, 2, 1.5) === 1.75, 'mínimo escalado: pared a 2 ⇒ 1.75 (margen .25 intacto)');
  ok(API.clampCam(4.5, 0.7, 1.5) === 1.5, 'mínimo escalado: obstáculo cerca ⇒ 1.5');
  ok(API.clampCam(4.5, 10, 1.5) === 4.5, 'mínimo escalado: impacto lejano ⇒ distancia objetivo');
  ok(API.clampCam(4.5, null, 0.3) === 4.5, 'mínimo escalado: sin impacto ⇒ distancia objetivo');
});

// 4. el bloque es autocontenido (no arrastra estado del juego)
{
  const externos = (src) => [...new Set([...src
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    .matchAll(/\b(THREE|DEFS|document|window|player|camera|scene|world)\b/g)].map(m => m[1]))];
  if (present) {
    const bad = externos(code);
    ok(bad.length === 0, 'bloque camera autocontenido (sin símbolos externos' + (bad.length ? ': ' + bad.join(',') : '') + ')');
  }
  ok(externos('const x = THREE.foo + DEFS[1] + player.pos.x').length === 3, 'detector de autocontención funciona');
}

// 5. estáticos del toggle, persistencia y topbar
{
  const kd = grabFrom("addEventListener('keydown'");
  ok(/e\.code\s*===\s*'KeyV'/.test(kd), "el handler de teclado escucha 'KeyV'");
  ok(kd.indexOf("'KeyV'") > kd.indexOf("state!=='play'||!canAct()||dead"),
    'KeyV está después del guard de juego activo (no abre nada ni actúa en chat/inv/pausa/muerte)');
  ok(/toggleCam\s*\(/.test(kd.slice(kd.indexOf("'KeyV'"), kd.indexOf("'KeyV'") + 120)),
    'KeyV llama a toggleCam()');

  const btn = (html.match(/<div[^>]*id="btnCam"[^>]*>/) || [''])[0];
  ok(btn.length > 0, 'la topbar tiene #btnCam');
  ok(/class="[^"]*\bpill\b/.test(btn), '#btnCam es una pill de la topbar (sirve en táctil sin control nuevo)');
  ok(/aria-pressed="(?:true|false)"/.test(btn), '#btnCam expone aria-pressed');
  ok(/title="[^"]*[Cc]ámara/.test(btn), '#btnCam tiene title de cámara');
  ok(/getElementById\('btnCam'\)\.onclick/.test(html), '#btnCam tiene onclick');
  ok(/stopPropagation\s*\(/.test(html.slice(html.indexOf("getElementById('btnCam').onclick"),
    html.indexOf("getElementById('btnCam').onclick") + 220)), 'el click de #btnCam corta la propagación');

  ok(/localStorage\.getItem\(\s*'mc-cam'/.test(html), "el boot restaura localStorage('mc-cam')");
  ok(/localStorage\.setItem\(\s*'mc-cam'/.test(html), "el toggle persiste localStorage('mc-cam')");
  ok(/camModeOf\(/.test(html), 'el modo guardado se valida con camModeOf');

  const scm = grabFn('setCamMode');
  ok(/aria-pressed/.test(scm), 'setCamMode actualiza aria-pressed');
  ok(/camMode\s*!==\s*'first'/.test(scm),
    "setCamMode marca aria-pressed/.on para las dos terceras (camMode!=='first')");
  ok(/camMode\s*===\s*'front'/.test(scm) && /3ª persona frontal/.test(scm),
    'setCamMode distingue el title de la 3ª frontal');
  ok(/3ª persona trasera/.test(scm), 'setCamMode distingue el title de la 3ª trasera');
  ok(/1ª persona/.test(scm), 'setCamMode conserva el title de la 1ª persona');
  ok(/classList\.toggle\(\s*'on'\s*,\s*camMode\s*!==\s*'first'\s*\)/.test(scm),
    '.on sólo en las terceras, nunca en primera');
  ok(/localStorage\.setItem\(\s*'mc-cam'\s*,\s*camMode\s*\)/.test(scm),
    "la persistencia guarda first/third/front (camMode)");

  const tcm = grabFn('toggleCam');
  ok(/nextCamMode\s*\(\s*camMode\s*\)/.test(tcm), 'toggleCam avanza con nextCamMode(camMode)');
  ok(/setCamMode\s*\(\s*nextCamMode\s*\(\s*camMode\s*\)\s*,\s*true\s*\)/.test(tcm),
    'toggleCam persiste el modo elegido');
  ok(/camModeOf\(savedCam\)/.test(html), 'el boot normaliza mc-cam (acepta third y front) con camModeOf');
  ok(/'front'/.test(code) && /'third'/.test(code), "el bloque camera conoce 'third' y 'front' para mc-cam");
}

// 6. avatar local sin PvP ni HUD, fuera de remotes/avatarTargets
{
  const ma = grabFn('makeAvatar');
  ok(/function\s+makeAvatar\(\s*id\s*,\s*name\s*,\s*admin\s*,\s*skin\s*,\s*opts\s*\)/.test(html),
    'makeAvatar recibe opts como 5º parámetro opcional');
  ok(/opts\.pvp|pvp\s*=\s*opts\.pvp/.test(ma), 'makeAvatar interpreta opts.pvp');
  ok(/opts\.hud|hud\s*=\s*opts\.hud/.test(ma), 'makeAvatar interpreta opts.hud');
  ok(/if\s*\(\s*pvp\s*\)/.test(ma), 'pvp:false evita registrar mallas en avatarTargets');
  ok(/if\s*\(\s*hud\s*\)/.test(ma), 'hud:false evita crear etiqueta y barra');
  ok(/if\s*\(\s*o\.bar\s*\)/.test(grabFn('poseDead')), 'poseDead tolera la barra ausente');

  const localCall = (html.match(/localAvatar\s*=\s*makeAvatar\([^;]*\);/) || [''])[0];
  ok(localCall.length > 0, 'el avatar local se crea con makeAvatar en startGame');
  ok(/mySkin/.test(localCall), 'el avatar local usa el aspecto elegido (mySkin)');
  ok(/pvp\s*:\s*false/.test(localCall) && /hud\s*:\s*false/.test(localCall),
    'el avatar local se crea con {pvp:false,hud:false}');
  ok(/local:\-?\d|\-1\s*,\s*myName/.test(localCall) || /myName/.test(localCall), 'el avatar local usa el nombre propio');
  ok(!/remotes\.set\([^)]*localAvatar/.test(html), 'el avatar local NO entra en remotes');
  ok(!/avatarTargets\.push\([^)]*localAvatar/.test(html), 'el avatar local NO se registra en avatarTargets');

  const tickLocal = grabFn('tickLocalAvatar');
  ok(/camMode\s*!==\s*'first'\s*&&\s*!dead/.test(tickLocal),
    "la visibilidad del avatar local es camMode!=='first' && !dead (trasera y frontal)");
  ok(/a\.target\.copy\(\s*player\.pos\s*\)/.test(tickLocal), 'el avatar local copia la posición del jugador sin lerp');
  ok(/a\.held\s*=\s*hotbarIds\[sel\]/.test(tickLocal), 'el avatar local muestra el ítem de la hotbar');
  ok(/a\.seq\s*=\s*swingSeq/.test(tickLocal), 'el avatar local anima el gesto con swingSeq');
}

// 7. viewmodel oculto en 3ª
{
  for (const fn of ['tickSword', 'tickPick']) {
    const body = grabFn(fn);
    ok(/camMode\s*===\s*'first'/.test(body), `${fn} condiciona el viewmodel a camMode==='first'`);
    ok(/\.visible\s*=/.test(body), `${fn} sigue controlando .visible`);
  }
}

// 8. raycasts y agua desde el ojo
{
  ok(/function\s+eyePos\s*\(/.test(html), 'index.html define eyePos()');
  const eye = grabFn('eyePos');
  ok(/player\.pos\.y\s*\+\s*eyeHeight\s*\(\s*mySkin\s*\)/.test(eye),
    'eyePos() usa eyeHeight(mySkin) sobre los pies (sin bob)');

  const rc = grabFn('raycast');
  ok(/eyePos\(\)/.test(rc), 'raycast arranca en eyePos()');
  ok(!/camera\.position/.test(rc), 'raycast ya no arranca en camera.position');
  ok(/requested\s*=\s*maxD\s*==\s*null\s*\?\s*8\s*:\s*maxD/.test(rc),
    'raycast resuelve requested = maxD ?? 8 y conserva el alcance base');
  ok(/reachFor\s*\(\s*requested\s*,\s*mySkin\s*\)/.test(rc),
    'raycast escala el alcance con el aspecto');

  const ah = grabFn('avatarHit');
  ok(/eyePos\(\)/.test(ah) && /far\s*=\s*reachFor\s*\(\s*4\.6\s*,\s*mySkin\s*\)/.test(ah),
    'avatarHit sale del ojo con far 4.6 escalado');
  const zh = grabFn('zombieHit');
  ok(/eyePos\(\)/.test(zh) && /far\s*=\s*reachFor\s*\(\s*4\.6\s*,\s*mySkin\s*\)/.test(zh),
    'zombieHit sale del ojo con far 4.6 escalado');
  const an = grabFn('animalHit');
  ok(/eyePos\(\)/.test(an) && /far\s*=\s*reachFor\s*\(\s*6\s*,\s*mySkin\s*\)/.test(an),
    'animalHit sale del ojo con far 6 escalado');

  const tw = grabFn('tickWater');
  ok(/eyePos\(\)/.test(tw), 'tickWater evalúa la celda del ojo');
  ok(!/camera\.position/.test(tw), 'tickWater ya no usa camera.position (la cámara orbital puede quedar fuera del agua)');
}

// 9. cámara orbital en physicsGravity, con recorte DDA
{
  const pg = grabFn('physicsGravity');
  ok(/camMode\s*===\s*'third'/.test(pg), "physicsGravity tiene la rama camMode==='third'");
  ok(/camOffset\s*\(/.test(pg), 'physicsGravity posiciona la cámara con camOffset');
  ok(/clampCam\s*\(/.test(pg), 'physicsGravity recorta con clampCam');
  ok(/camObstacle\s*\(/.test(pg), 'physicsGravity consulta camObstacle');
  ok(/eyeHeight\s*\(\s*mySkin\s*\)/.test(pg), 'la 1ª persona usa eyeHeight(mySkin)');
  ok(/sizeFactor\s*\(\s*mySkin\s*\)/.test(pg), 'physicsGravity deriva la escala del aspecto');
  ok(/CAM_DIST\s*\*\s*f/.test(pg) && /CAM_MIN\s*\*\s*f/.test(pg),
    'la 3ª persona escala CAM_DIST y CAM_MIN por el factor');
  ok(/0?\.05\s*\*\s*f/.test(pg), 'el bob de 1ª escala la amplitud 0.05 por el factor');
  const thirdStart = pg.indexOf("camMode==='third'");
  const thirdEnd = pg.indexOf('} else {', thirdStart);
  const third = thirdStart >= 0 && thirdEnd > thirdStart ? pg.slice(thirdStart, thirdEnd) : '';
  ok(third.length > 0 && !/Math\.sin\(bob\)/.test(third), 'la 3ª persona no tiene bob');

  const frontStart = pg.indexOf("camMode==='front'");
  const frontEnd = pg.indexOf('} else {', frontStart);
  const front = frontStart >= 0 && frontEnd > frontStart ? pg.slice(frontStart, frontEnd) : '';
  ok(front.length > 0, "physicsGravity tiene la rama camMode==='front'");
  ok(/camOffset\s*\(\s*player\.yaw\s*,\s*player\.pitch\s*,\s*-/.test(front),
    'la frontal usa camOffset con signo negativo (delante del ojo)');
  ok(/camObstacle\s*\([\s\S]*?camOffset\s*\(\s*player\.yaw\s*,\s*player\.pitch\s*,\s*-\s*1\s*\)/.test(front),
    'la frontal hace el DDA hacia adelante con camOffset(...,-1)');
  ok(/clampCam\s*\([\s\S]*?CAM_MIN\s*\*\s*f/.test(front),
    'la frontal recorta con clampCam y el mínimo CAM_MIN*f');
  ok(!/Math\.sin\(bob\)/.test(front), 'la frontal no tiene bob');
  ok(/camera\.rotateY\s*\(\s*player\.yaw\s*\+\s*Math\.PI\s*\)/.test(pg),
    'la frontal rota yaw+π para mirar al jugador');
  ok(/camera\.rotateX\s*\(\s*-\s*player\.pitch\s*\)/.test(pg),
    'la frontal rota -pitch para mirar a la cara');

  ok(/camera\.rotateY\(\s*player\.yaw\s*\)/.test(pg) && /camera\.rotateX\(\s*player\.pitch\s*\)/.test(pg),
    'la trasera y la 1ª conservan yaw/pitch sin invertir');

  const loop = grabFn('loop');
  ok(/eyeHeight\s*\(\s*mySkin\s*\)/.test(loop), 'la cámara de muerte parte de eyeHeight(mySkin)');
  ok(/0?\.32\s*\*\s*f/.test(loop), 'la cámara de muerte baja hasta 0.32 por el factor');

  const co = grabFn('camObstacle');
  ok(co.length > 0, 'camObstacle() existe');
  ok(/get\s*\(/.test(co), 'camObstacle consulta la grilla con get()');
  ok(/\.cube/.test(co), 'camObstacle considera sólidos por cubo');
  ok(!/\.flower/.test(co) && !/\.glow/.test(co),
    'camObstacle ignora flores y glow (no frenan la cámara)');
}

// 10. alta en la suite (20 archivos)
{
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'server', 'package.json'), 'utf8'));
  const s = pkg.scripts.test;
  const hits = (s.match(/test\/camera\.mjs/g) || []).length;
  ok(hits === 1, `npm test da de alta test/camera.mjs exactamente una vez (${hits})`);

  const lg = fs.readFileSync(path.join(root, 'server', 'test', 'lookguard.mjs'), 'utf8');
  ok(/'camera'/.test(lg), 'lookguard.mjs lista camera entre los tests de la suite');
  ok(/count\s*===\s*20/.test(lg), 'lookguard.mjs espera 20 archivos');

  const zp = fs.readFileSync(path.join(root, 'server', 'test', 'zombie-protocol.mjs'), 'utf8');
  ok(/'camera'/.test(zp), 'zombie-protocol.mjs lista camera entre los tests de la suite');
  ok(/20 archivos/.test(zp), 'zombie-protocol.mjs documenta 20 archivos');
}

// 11. documentación
{
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  ok(/\|\s*`V`\s*\|/.test(readme), 'README documenta la tecla V');
  ok(/1ª|primera/.test(readme) && /3ª|tercera/.test(readme), 'README menciona cámara en 1ª y 3ª persona');
  ok(/frontal/i.test(readme), 'README documenta la 3ª persona frontal');
  ok(/vanidad|no coincide/i.test(readme), 'README aclara que el frontal es de vanidad / el crosshair no coincide');
  const hint = (html.match(/id="hint"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
  ok(/<b>V<\/b>/.test(hint), '#hint del menú menciona la tecla V');
  ok(/frontal/i.test(hint), '#hint menciona la 3ª frontal');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 cámara 1ª/3ª trasera/frontal (ui/camera) OK');
