// Tests estáticos de la capability net/avatar ampliada (change zombi, grupo 12): el
// ítem en mano (`held`) y el contador de golpes (`seq`) de cada jugador viajan por la red
// para que los avatares remotos muestren el arma y la animación de golpe. No levanta el
// navegador: verifica la FORMA del código de `index.html`/`server.js` (mismo enfoque que
// static.mjs/avatar.mjs/zombie-client.mjs), extrayendo cuerpos con llaves balanceadas.
// Uso: node test/avatar-held.mjs   (sale con código != 0 si algo falla)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const srv = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

// Extrae `function NAME(...) { ... }` con llaves balanceadas ('' si no existe).
const grabFn = (src, name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let depth = 0, started = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { depth++; started = true; }
    else if (src[k] === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  return '';
};
// Trozo de texto a partir de `marker` (vacío si no existe).
const after = (src, marker, len) => { const i = src.indexOf(marker); return i < 0 ? '' : src.slice(i, i + len); };

// ============================ 12.1 builders compartidos ============================
{
  ok(html.includes('function makeSwordModel('), 'index.html define el builder makeSwordModel()');
  ok(html.includes('function makePickModel('), 'index.html define el builder makePickModel()');
  ok(/swordG\.add\(makeSwordModel\(\)\)/.test(html), 'el viewmodel swordG usa makeSwordModel()');
  ok(/pickG\.add\(makePickModel\(\)\)/.test(html), 'el viewmodel pickG usa makePickModel()');
  const ma = grabFn(html, 'makeAvatar');
  ok(/makeSwordModel\(\)/.test(ma), 'el avatar remoto usa makeSwordModel() (mismo builder, sin duplicar geometría)');
  ok(/makePickModel\(\)/.test(ma), 'el avatar remoto usa makePickModel()');
  ok(/armR\.add\(/.test(ma), 'los modelos en mano cuelgan de armR (heredan el balanceo y el gesto)');
  ok(/\.visible\s*=\s*false/.test(ma), 'los modelos en mano del avatar arrancan ocultos');
  // los modelos en mano no se agregan al raycast de avatares (no cambian la superficie de golpe)
  const held = ma.slice(ma.indexOf('makeSwordModel'));
  ok(!/avatarTargets\.push/.test(held), 'el arma del avatar no entra en avatarTargets');
}

// ============================ 12.1/12.4 held + seq en el protocolo ============================
{
  const sm = grabFn(html, 'sendMove');
  ok(/held\s*:/.test(sm) && /seq\s*:/.test(sm), 'sendMove manda held + seq');
  ok(/hotbarIds\[sel\]/.test(sm), 'held = hotbarIds[sel] (el ítem en mano)');
  const pmH = after(html, "m.t==='pm'", 620);
  ok(/held/.test(pmH) && /seq/.test(pmH), 'el handler pm guarda held/seq del jugador remoto');
  ok(/Number\.isInteger\(m\.held\)/.test(pmH) && /Number\.isInteger\(m\.seq\)/.test(pmH),
    'pm sin held/seq (cliente viejo) no rompe el cliente (guard Number.isInteger)');
  const ar = grabFn(html, 'addRemote');
  ok(/\.held\s*=/.test(ar) && /\.seq\s*=/.test(ar), 'addRemote (welcome.players/join) guarda held/seq');
  const ap = grabFn(html, 'applyPm');
  ok(/held/.test(ap) && /seq/.test(ap), 'applyPm aplica held/seq');
  ok(/html\.includes|\b/.test('') || /let swingSeq\s*=\s*0/.test(html), 'contador local swingSeq declarado');
  const sw = grabFn(html, 'swordAttack');
  ok((sw.match(/swingSeq\+\+/g) || []).length >= 2, 'swordAttack incrementa swingSeq en cada golpe real (PvP y criatura)');
}

// ============================ 12.1 tickAvatar muestra el arma y anima ============================
{
  const ta = grabFn(html, 'tickAvatar');
  ok(/\.held/.test(ta) && /SWORD/.test(ta) && /PICK/.test(ta), 'tickAvatar muestra el arma según held (SWORD/PICK)');
  ok(/\.seq/.test(ta) && /seqSeen/.test(ta) && /SWING_DUR/.test(ta), 'tickAvatar anima el golpe al cambiar seq (SWING_DUR)');
  ok(/armR\.rotation\.x/.test(ta), 'el gesto de golpe pisa armR.rotation.x');
}

// ============================ 12.5 server: welcome.players / join / pm ============================
{
  ok(/held/.test(srv) && /seq/.test(srv), 'el server transporta held/seq');
  ok(/m\.t === 'mv'/.test(srv) && /me\.held/.test(srv) && /me\.seq/.test(srv), "handler 'mv' guarda held/seq en me");
  ok(/broadcast\(\{\s*t:\s*'pm'[\s\S]{0,160}held/.test(srv), "el 'pm' relayado incluye held");
  ok(/broadcast\(\{\s*t:\s*'pm'[\s\S]{0,160}seq/.test(srv), "el 'pm' relayado incluye seq");
  const plMap = after(srv, 'players: [...players.values()]', 340);
  ok(/held/.test(plMap) && /seq/.test(plMap), 'welcome.players incluye held/seq (el recién llegado ve las armas)');
  const join = after(srv, "t: 'join'", 220);
  ok(/held/.test(join) && /seq/.test(join), 'join incluye held/seq');
}

// ============================ 12.7 triangulación (reglas de resync / robustez) ============================
{
  const ta = grabFn(html, 'tickAvatar');
  ok(/a\.seq!==a\.seqSeen/.test(ta), 'un seq repetido (mismo valor) no reanima');
  ok(/a\.seq>a\.seqSeen/.test(ta), 'solo anima cuando el seq CRECE (una reconexión que lo resetea no anima)');
  const pmH = after(html, "m.t==='pm'", 620);
  ok(/Number\.isInteger\(m\.held\)/.test(pmH), 'un held ausente/desconocido no rompe (guard Number.isInteger)');
  ok(/m\.t === 'mv'/.test(srv) && /Number\.isInteger\(\+m\.held\)/.test(srv),
    'un mv sin held (cliente viejo) no rompe el server (guard Number.isInteger)');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 avatar-held (net/avatar: arma + golpe remoto) OK');
