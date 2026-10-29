// Tests estáticos del cliente para los zombis (change zombi). No levanta el navegador:
// verifica la FORMA del código de `index.html` (mismo enfoque que static.mjs/avatar.mjs),
// extrayendo cuerpos de función con llaves balanceadas para no dar falsos positivos.
// Uso: node test/zombie-client.mjs   (sale con código != 0 si algo falla)
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
// Extrae `{ ... }` balanceado que sigue a `marker` (objeto/opciones).
const grabObj = (marker) => {
  let i = html.indexOf(marker); i = html.indexOf('{', i);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    if (html[j] === '}') { depth--; if (depth === 0) return html.slice(i, j + 1); }
  }
  return '';
};

// ============================ 6.1 API del cliente ============================
for (const needle of ['makeZombie', 'zombies', 'zombieTargets', 'applyZs', 'applyZsList', 'tickZombie', 'zombieHit', 'drawZBar', 'removeZombie'])
  ok(html.includes(needle), `index.html tiene ${needle}`);

// ============================ 6.2 modelo y registro ============================
{
  const mz = grabFn('makeZombie');
  ok(/armL/.test(mz) && /armR/.test(mz) && /legL/.test(mz) && /legR/.test(mz) && /mats/.test(mz) && /deadK/.test(mz) && /\bbar\b/.test(mz),
    'makeZombie arma el shape {armL,armR,legL,legR,mats,deadK,bar}');
  ok(/0x6a9a4a/.test(mz) && /0x3f6b2f/.test(mz), 'makeZombie con piel verdosa (0x6a9a4a/0x3f6b2f)');
  ok(!/nameSprite/.test(mz), 'makeZombie sin etiqueta de nombre');
  ok(/hp:\s*6/.test(mz), 'makeZombie arranca con hp 6');
  ok(/zombieTargets\.push/.test(mz) && /userData\.zombieId/.test(mz), 'las piezas del zombi entran en zombieTargets con zombieId');
  ok(/const zombies\s*=\s*new Map\(\)/.test(html), 'registro zombies = Map()');
  ok(/const zombieTargets\s*=\s*\[\]/.test(html), 'registro zombieTargets = []');
  const zb = grabFn('drawZBar');
  ok(/\/\s*6\b/.test(zb), 'drawZBar dibuja sobre hp/6');
  const rz = grabFn('removeZombie');
  ok(/zombieTargets/.test(rz) && /splice/.test(rz), 'removeZombie libera la malla de zombieTargets');
  ok(/zombies\.delete/.test(rz), 'removeZombie borra del registro');
}

// ============================ 6.3 poseDead compartido ============================
{
  ok(html.includes('function poseDead('), 'helper poseDead extraído');
  const avStart = html.indexOf('/* net/avatar:start */'), avEnd = html.indexOf('/* net/avatar:end */');
  ok(avStart >= 0 && avEnd > avStart && html.slice(avStart, avEnd).includes('function poseDead('),
    'poseDead vive en el bloque net/avatar (reescrito junto a tickAvatar)');
  const pd = grabFn('poseDead');
  ok(/deadK/.test(pd) && /rotation\.x/.test(pd) && /bar\.visible/.test(pd), 'poseDead: deadK→rotación y barra oculta');
  ok(/poseDead\s*\(/.test(grabFn('tickAvatar')), 'tickAvatar usa poseDead');
  ok(/poseDead\s*\(/.test(grabFn('tickZombie')), 'tickZombie usa poseDead');
  // tickAvatar conserva los helpers que exige avatar.mjs
  const ta = grabFn('tickAvatar');
  ok(/avatarShouldSnap\s*\(/.test(ta) && /avatarLerpFactor\s*\(/.test(ta) && /yawToward\s*\(/.test(ta),
    'tickAvatar conserva avatarShouldSnap/avatarLerpFactor/yawToward (avatar.mjs)');
}

// ============================ 6.4 tickZombie ============================
{
  const tz = grabFn('tickZombie');
  ok(/avatarShouldSnap\s*\(/.test(tz), 'tickZombie usa avatarShouldSnap');
  ok(/avatarLerpFactor\s*\(/.test(tz), 'tickZombie usa avatarLerpFactor');
  ok(/yawToward\s*\(/.test(tz), 'tickZombie interpola yaw con yawToward');
  ok(/yawToward\([^;]*z\.yaw\b/.test(tz) && !/z\.yaw\s*\+\s*Math\.PI/.test(tz),
    'tickZombie gira hacia z.yaw SIN sumar π (convención del modelo del server)');
  ok(/zombies\.values\(\)[\s\S]*tickZombie|tickZombie[\s\S]*zombies\.values\(\)/.test(html), 'el loop tickea todos los zombis');
}

// ============================ 6.5 applyZs / applyZsList ============================
{
  const az = grabFn('applyZs');
  ok(/zombies\.get/.test(az) && /zombies\.set/.test(az), 'applyZs hace upsert por id');
  ok(/makeZombie\s*\(/.test(az), 'applyZs crea la malla si no existe');
  ok(/target\.set/.test(az) && /\.yaw/.test(az), 'applyZs setea target/yaw');
  ok(/hp/.test(az) && /drawZBar\s*\(/.test(az), 'applyZs setea hp y redibuja la barra');
  ok(/\.dead/.test(az), 'applyZs setea dead');
  const azl = grabFn('applyZsList');
  ok(/applyZs\s*\(/.test(azl), 'applyZsList aplica la lista con applyZs');
  ok(/removeZombie\s*\(/.test(azl), 'applyZsList borra los que desaparecieron (removeZombie)');
  // cableado: welcome.zom y handler zs
  ok(/m\.zom/.test(html) && /applyZsList\s*\(\s*m\.zom\s*\)/.test(html), 'welcome.zom → applyZsList');
  const zsH = html.slice(html.indexOf("m.t==='zs'"), html.indexOf("m.t==='zs'") + 200);
  ok(/applyZsList\s*\(\s*m\.z\s*\)/.test(zsH), "handler zs → applyZsList(m.z)");
}

// ============================ 6.6 golpe del jugador a la criatura ============================
{
  const zh = grabFn('zombieHit');
  ok(/zombieTargets/.test(zh), 'zombieHit hace raycast contra zombieTargets');
  ok(/far\s*=\s*reachFor\s*\(\s*4\.6\s*,\s*mySkin\s*\)/.test(zh),
    'zombieHit usa far=reachFor(4.6, mySkin) (alcance escalado por aspecto)');
  ok(/remotes/.test(zh) === false, 'zombieHit no toca el registro de jugadores (espacios separados)');
  const sw = grabFn('swordAttack');
  ok(/zombieHit\s*\(/.test(sw), 'swordAttack prueba zombieHit()');
  ok(/t:\s*'zhit'/.test(sw), "swordAttack manda { t:'zhit', id }");
  ok(/if\s*\(\s*mp\s*\)\s*netSend\(\s*\{\s*t:\s*'zhit'/.test(sw), 'el envío de zhit está guardado por mp (modo solo no manda nada)');
}

// ============================ 6.7 handler zhitok ============================
{
  const i = html.indexOf("m.t==='zhitok'");
  ok(i >= 0, "existe el handler m.t==='zhitok'");
  const zhk = i >= 0 ? html.slice(i, i + 460) : '';
  ok(/getElementById\('hitm'\)/.test(zhk) || /#hitm|hitm/.test(zhk), 'zhitok marca el impacto (#hitm)');
  ok(/tone\s*\(/.test(zhk), 'zhitok suena (tone)');
  ok(/spawnDmgNum\s*\(/.test(zhk) && /-\s*\+\s*m\.dmg|-m\.dmg|'-'\+m\.dmg|'\s*\+\s*'/.test(zhk), 'zhitok muestra el número de daño negativo');
  ok(/zombies\.get/.test(zhk), 'zhitok mergea hp/dead del zombi local');
}

// ============================ 6.8 espacios de id separados / modo solo ============================
{
  const zhk = html.slice(html.indexOf("m.t==='zhitok'"), html.indexOf("m.t==='zhitok'") + 460);
  ok(!/remotes\.get/.test(zhk) && /zombies\.get/.test(zhk), 'zhitok usa el registro de zombis (no toca remotes)');
  const azl = grabFn('applyZsList');
  ok(/removeZombie\s*\(/.test(azl), 'un zs que quita un zombi lo elimina del registro');
  const rz = grabFn('removeZombie');
  ok(/zombieTargets\.splice|indexOf/.test(rz), 'y también de zombieTargets (no queda target fantasma)');
  // el onclose limpia los zombis (sin server no hay estado de horda)
  const onclose = html.slice(html.indexOf('NET.onclose'), html.indexOf('NET.onclose') + 320);
  ok(/removeZombie|zombies\.(clear|forEach|keys)/.test(onclose), 'onclose limpia los zombis');
}

// ============================ 7.x buff de la espada (dmg 1 → 2) ============================
{
  const sw = grabFn('swordAttack');
  ok(/t:\s*'hit',\s*id:[^,]+,\s*dmg:2/.test(sw), 'el golpe de espada del PvP manda dmg:2');
  ok(!/dmg:1/.test(sw), 'sin dmg:1 residual en swordAttack');
  ok(!/medio corazón/.test(html), 'el toast ya no dice "medio corazón"');
  ok(/Un corazón a/.test(html), 'el toast del PvP dice "Un corazón a …"');
  // comparación cruzada cliente↔servidor (mismo patrón que static.mjs §8 para el ciclo)
  const zombieSrc = fs.readFileSync(path.join(root, 'server', 'zombie.js'), 'utf8');
  ok(/SWORD_DMG\s*=\s*2\b/.test(zombieSrc), 'server/zombie.js fija SWORD_DMG = 2');
  const Z = require('../zombie.js');
  ok(Z.ZOMBIE_HP === 6 && Z.SWORD_DMG === 2 && Z.ZOMBIE_HP / Z.SWORD_DMG === 3,
    `6 HP ÷ 2 = 3 golpes (módulo real: ${Z.ZOMBIE_HP}/${Z.SWORD_DMG})`);
}

// ============================ 11.4 ojos rojos + animación de ataque ============================
{
  const mz = grabFn('makeZombie');
  ok(/MeshBasicMaterial/.test(mz), 'los ojos del zombi usan MeshBasicMaterial (autoiluminado, sin luz de escena)');
  ok(/0xff2a2a/.test(mz), 'los ojos son rojos (0xff2a2a)');
  ok(/eyeL/.test(mz) && /eyeR/.test(mz), 'dos ojos rojos (eyeL/eyeR sobre la cara delantera)');
  ok(!/PointLight/.test(mz), 'sin PointLight por zombi (no ilumina la escena)');
  const zsec = html.slice(html.indexOf('/* ============ ZOMBIS'), html.indexOf('/* ============ ROMPER'));
  ok(!/PointLight/.test(zsec), 'ninguna luz por zombi en toda la sección de zombis');
  const tz = grabFn('tickZombie');
  ok(/atkSeen/.test(tz), 'tickZombie compara el contador atk contra atkSeen');
  ok(/SWING_DUR/.test(tz), 'tickZombie anima el golpe reutilizando SWING_DUR');
  ok(/(swingK|swingT)/.test(tz) && /armR\.rotation\.x/.test(tz), 'tickZombie pisa la rotación de armR durante el gesto');
  ok(/poseDead\s*\(/.test(tz), 'tickZombie sigue usando poseDead (no pelea con la caída)');
  const az = grabFn('applyZs');
  ok(/\.atk\b/.test(az) && /atkSeen/.test(az), 'applyZs setea atk y atkSeen');
  ok(/if\(fresh\)\s*z\.atkSeen=m\.atk/.test(az), 'applyZs inicializa atkSeen con el atk de entrada (sin animación falsa)');
}

// ============================ 11.7 triangulación (cliente) ============================
{
  const az = grabFn('applyZs');
  // atkSeen solo se sincroniza al CREAR la malla (fresh): un zs repetido con el mismo atk
  // no re-dispara la animación (idempotente ante difusiones repetidas)
  ok(/if\(Number\.isInteger\(m\.atk\)\)\{[^}]*if\(fresh\)\s*z\.atkSeen=m\.atk/.test(az),
    'un zs repetido con el mismo atk no reanima (atkSeen solo se alinea al entrar)');
  const tz = grabFn('tickZombie');
  ok(/if\(z\.atk!==z\.atkSeen\)\{[^}]*z\.atkSeen=z\.atk/.test(tz),
    'el disparo de la animación es el cambio de atk, y se consume una sola vez');
  ok(/z\.swingK<1\s*&&\s*z\.deadK<\.5/.test(tz),
    'un zombi muerto no anima golpe (el gesto no pelea con poseDead)');
  ok(/if\(fresh\)\s*z\.g\.position\.copy/.test(az),
    'un zombi que ya venía golpeado al entrar (welcome.zom) no anima al aparecer');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 zombie-client (cliente) OK');
