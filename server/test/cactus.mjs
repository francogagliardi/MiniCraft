// Tests del cactus (change cactus-y-spawn, specs blocks/cactus, player/physics y ui/branding):
// extrae el bloque /* cactus:start */ ... /* cactus:end */ de index.html y lo evalúa aislado con
// `new Function` SIN THREE (mismo patrón que skins.mjs/worldgen.mjs) para probar el contacto de la
// caja del aspecto contra las celdas de cactus y la validación del punto de aparición preferido.
// Encima, estáticos con grabFn sobre el cableado: tickCactus en el loop, damage(1,'cactus'), la
// rama de die, findSpawn antes del espiral, respawn/startGame y el favicon data URI del <head>.
// Uso: node test/cactus.mjs   (sale con código != 0 si algo falla)
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

// ---- extracción del bloque cactus (sin THREE) ----
const START = '/* cactus:start */', END = '/* cactus:end */';
const i = html.indexOf(START), j = html.indexOf(END);
const present = i >= 0 && j > i;
ok(present, 'bloque cactus presente en index.html');
const block = present ? html.slice(i, j) : '';
let API = null;
if (present) {
  try {
    API = new Function(block + '\n;return {CACTUS_ID, CACTUS_MARGIN, CACTUS_WATER, SPAWN_PREF, ' +
      'cactusCells, touchingCactus, spawnPrefOk};')();
  } catch (e) { ok(false, 'bloque cactus evaluable SIN THREE: ' + e.message); }
}
const T = (name, fn) => {
  if (!API) { ok(false, `${name}: sin API cactus`); return; }
  try { fn(); } catch (e) { ok(false, `${name}: ${e.message}`); }
};

// `getBlock` falso: mapa "x,y,z" → id; el resto es AIR (0).
const mapGet = (cells) => {
  const m = new Map(Object.entries(cells));
  return (x, y, z) => { const k = `${x},${y},${z}`; return m.has(k) ? m.get(k) : 0; };
};
// `env` falso para spawnPrefOk: por defecto suelo sólido, sin colisión y sin agua.
const envOf = (o = {}) => ({
  get: o.get || (() => 0),
  solidAt: o.solidAt || (() => true),
  collidesAt: o.collidesAt || (() => false),
});
// Cajas de los aspectos (mismas que playerBox: r = 0.3*f, h = 1.8*f).
const HUMAN = { r: 0.3, h: 1.8 };
const SMALL = { r: 0.3 * (0.9 / 1.97), h: 1.8 * (0.9 / 1.97) };
const GIANT = { r: 0.3 * (5 / 1.97), h: 1.8 * (5 / 1.97) };

// 1. constantes y barrido de celdas
T('constantes del cactus', () => {
  ok(API.CACTUS_ID === 22, `CACTUS_ID es el bloque existente 22 (${API.CACTUS_ID})`);
  ok(API.CACTUS_MARGIN === 0.06, `el margen de contacto es 0.06 (${API.CACTUS_MARGIN})`);
  ok(API.CACTUS_WATER === 12, `CACTUS_WATER es el id de WATER (${API.CACTUS_WATER})`);
  const cells = API.cactusCells(0.5, 0.01, 0.5, HUMAN.r, HUMAN.h);
  ok(Array.isArray(cells) && cells.length > 0, 'cactusCells devuelve celdas');
  ok(cells.every(c => Array.isArray(c) && c.length === 3 && c.every(Number.isInteger)),
    'cada celda es un entero [x,y,z]');
  const ys = [...new Set(cells.map(c => c[1]))];
  ok(Math.min(...ys) === 0 && Math.max(...ys) === 1,
    `el barrido cubre y=0..1 para un human de pie en y=.01 (${ys.join(',')})`);
  const top = API.cactusCells(0.5, 1.01, 0.5, HUMAN.r, HUMAN.h);
  ok(!top.some(c => c[1] === 0), 'parado arriba (pies en y+1) la celda del cactus NO entra al barrido');
  const wide = API.cactusCells(0.5, 0.01, 0.5, GIANT.r, GIANT.h);
  ok(Math.max(...wide.map(c => c[1])) === 4, 'el giant barre hasta y=4 con el margen del tope');
});

// 2. contacto de costado, lejos, arriba y dentro del cuerpo (cactus en 0,0,0)
T('contacto del cactus', () => {
  const t = (px, py, pz, box) => API.touchingCactus(px, py, pz, box.r, box.h, mapGet({ '0,0,0': 22 }));
  ok(t(1.31, 0.01, 0.5, HUMAN) === true, 'human de costado a .01 de la cara: toca');
  ok(t(2.31, 0.01, 0.5, HUMAN) === false, 'human a 1 bloque: no toca');
  ok(t(0.5, 1.01, 0.5, HUMAN) === false, 'human parado arriba del cactus: no toca');
  ok(t(0.5, 0.01, 0.5, HUMAN) === true, 'cactus dentro del cuerpo del human: toca');
  ok(t(1.32, 0.01, 0.5, HUMAN) === true, 'borde de la caja a .02 de la cara (dentro del margen): toca');
  ok(t(1.37, 0.01, 0.5, HUMAN) === false, 'borde de la caja a .07 de la cara (fuera del margen): no toca');
  ok(t(0.5, 0.01, 1.0, HUMAN) === true, 'cactus en el eje z dentro del cuerpo: toca');
  ok(t(0.5, 0.01, 2.0, HUMAN) === false, 'cactus a 1 bloque en z: no toca');
  ok(API.touchingCactus(0.5, 0.01, 0.5, HUMAN.r, HUMAN.h, () => 0) === false,
    'un mapa sin cactus nunca toca');
});

// 3. cada aspecto usa su propia caja (small ≈ .137×.822, giant ≈ .761×4.568)
T('contacto por aspecto', () => {
  const t = (px, box) => API.touchingCactus(px, 0.01, 0.5, box.r, box.h, mapGet({ '0,0,0': 22 }));
  ok(near(SMALL.r, 0.1371, 1e-4) && near(SMALL.h, 0.8223, 1e-4),
    `small: caja ≈ .1371 × .822 (${SMALL.r.toFixed(4)} × ${SMALL.h.toFixed(4)})`);
  ok(t(1.15, SMALL) === true, 'small a 1.15 del centro del cactus: toca');
  ok(t(2.15, SMALL) === false, 'small a 2.15 del centro del cactus: no toca');
  ok(near(GIANT.r, 0.7614, 1e-4) && near(GIANT.h, 4.5685, 1e-4),
    `giant: caja ≈ .7614 × 4.5685 (${GIANT.r.toFixed(4)} × ${GIANT.h.toFixed(4)})`);
  ok(t(1.8, GIANT) === true, 'giant con el costado cerca del cactus: toca');
  ok(t(2.9, GIANT) === false, 'giant a 2.9 del centro del cactus: no toca');
  ok(API.touchingCactus(0.5, 0.01, 0.5, GIANT.r, GIANT.h, mapGet({ '0,5,0': 22 })) === false,
    'giant con el cactus 1 bloque sobre la cabeza: no toca');
});

// 4. spawn preferido: punto, condiciones y agua
T('spawnPrefOk', () => {
  const P = API.SPAWN_PREF || {};
  ok(P.x === 108.5 && P.y === 16.01 && P.z === 117.5,
    `SPAWN_PREF es {108.5, 16.01, 117.5} (${P.x}, ${P.y}, ${P.z})`);
  const sp = (env) => API.spawnPrefOk(108.5, 16.01, 117.5, HUMAN.r, HUMAN.h, env);
  ok(sp(envOf()) === true, 'punto válido para un human: se usa');
  ok(sp(envOf({ solidAt: () => false })) === false, 'bloque de abajo no sólido: se descarta');
  ok(sp(envOf({ get: mapGet({ '108,16,117': 12 }) })) === false, 'agua en los pies: se descarta');
  ok(sp(envOf({ get: mapGet({ '108,17,117': 12 }) })) === false, 'agua a la altura de la cabeza: se descarta');
  ok(sp(envOf({ collidesAt: () => true })) === false, 'caja que colisiona: se descarta');
  ok(sp(envOf({ get: mapGet({ '108,16,117': 22 }) })) === false, 'cactus en el punto: se descarta');
  ok(sp(envOf({ get: mapGet({ '109,16,117': 22 }) })) === true,
    'cactus a 1 bloque del punto (sin contacto): el preferido sigue sirviendo');
});

// 5. spawn por aspecto: hueco de 4 bloques (techo en y=20)
T('spawn por aspecto', () => {
  const hueco = envOf({ collidesAt: (x, y, z, r, h) => y + h > 20 });
  const at = (box) => API.spawnPrefOk(108.5, 16.01, 117.5, box.r, box.h, hueco);
  ok(at(GIANT) === false, 'giant bajo un techo de 4: cae al fallback');
  ok(at(HUMAN) === true, 'human bajo un techo de 4: usa el preferido');
  ok(at(SMALL) === true, 'small bajo un techo de 4: usa el preferido');
  ok(API.spawnPrefOk(108.5, 16.01, 117.5, 0.3, 3.99, envOf()) === true &&
    API.spawnPrefOk(108.5, 16.01, 117.5, 0.3, 4.01,
      envOf({ collidesAt: (x, y, z, r, h) => y + h > 20 })) === false,
    'la validación es exactamente la de la caja recibida (h 3.99 sí, 4.01 no)');
});

// 6. estáticos: tickCactus, loop, damage y die
{
  const tick = grabFn('tickCactus');
  ok(tick.length > 0, 'el cliente define tickCactus()');
  ok(/damage\(\s*1\s*,\s*'cactus'\s*\)/.test(tick), "tickCactus llama damage(1,'cactus')");
  ok(/touchingCactus\s*\(/.test(tick), 'tickCactus consulta touchingCactus');
  ok(/playerBox\s*\(\s*mySkin\s*\)/.test(tick), 'tickCactus usa la caja de playerBox(mySkin)');
  ok(/!started|started\s*===/.test(tick), 'tickCactus exige partida iniciada');
  ok(/!dead/.test(tick), 'tickCactus exige jugador vivo');
  ok(/state\s*!==\s*'play'|state\s*===\s*'play'/.test(tick), "tickCactus exige state 'play'");

  const loop = grabFn('loop');
  ok(/tickCactus\(\)/.test(loop), 'loop() llama a tickCactus()');
  ok((loop.match(/tickCactus\(\)/g) || []).length === 1, 'loop() llama a tickCactus() una sola vez por frame');

  const dmg = grabFn('damage');
  ok(/isAdmin\(\)/.test(dmg) && /dead/.test(dmg), 'damage conserva la guarda de admin/muerto');
  ok(/godT/.test(dmg) && /hp\s*=\s*Math\.max\(0\s*,\s*hp-amount\)/.test(dmg),
    'damage conserva la invulnerabilidad (godT) y la resta de HP');

  const die = grabFn('die');
  ok(/cause\s*===\s*'cactus'/.test(die), "die tiene la rama cause==='cactus'");
  ok(die.includes('Te pinchaste con un cactus. 🌵'), 'el cartel del cactus es `Te pinchaste con un cactus. 🌵`');
  ok(/cause\s*===\s*'fall'/.test(die) && die.includes('Te caíste muy fuerte.'), 'die conserva la rama de caída');
  ok(/Te derrotó \$\{cause\}/.test(die), 'die conserva el mensaje del jugador que te derrotó');
}

// 7. alcance negativo: sin criaturas/animales/bot y sin worldgen de cactus
{
  const tick = grabFn('tickCactus');
  for (const tok of ['tickZombie', 'animals', 'bot'])
    ok(!block.includes(tok) && !tick.includes(tok), `el cactus no toca \`${tok}\``);

  const gen = grabFn('genWorld');
  ok(gen.length > 0, 'genWorld sigue existiendo');
  ok(!/MELON|CACTUS/.test(gen), 'genWorld no genera cactus (sin MELON ni CACTUS)');
  const wg = html.slice(html.indexOf('/* worldgen:start */'), html.indexOf('/* worldgen:end */'));
  ok((wg.match(/CACTUS/g) || []).length === 0, 'el bloque worldgen no menciona CACTUS');
  ok((wg.match(/MELON/g) || []).length === 1 && /MELON\s*=\s*22/.test(wg),
    'en worldgen MELON aparece sólo como el id 22 compartido (sin uso en el generador)');

  ok(/\[MELON\]:\s*\{\s*name:\s*'Cactus 🌵'/.test(html), "DEFS[MELON].name sigue siendo 'Cactus 🌵'");
  const inv = (html.match(/const INVENTORY = \[([^\]]*)\]/) || [])[1] || '';
  ok(/(?:^|,)MELON(?:,|$)/.test(inv.replace(/\s+/g, '')), 'MELON sigue en INVENTORY');

  ok(!/tickZombie|animals/.test(block), 'el bloque cactus no mezcla lógica de criaturas');
}

// 8. estáticos del cableado de findSpawn / startGame / respawn
{
  const fsp = grabFn('findSpawn');
  ok(fsp.length > 0, 'findSpawn sigue existiendo');
  ok(fsp.includes('SPAWN_PREF'), 'findSpawn prueba SPAWN_PREF');
  const pref = fsp.indexOf('spawnPrefOk'), spiral = fsp.indexOf('for(let r=0');
  ok(pref >= 0, 'findSpawn consulta spawnPrefOk');
  ok(pref >= 0 && spiral >= 0 && pref < spiral, 'el preferido se prueba ANTES del bucle espiral');
  ok(/spawnPrefOk\([\s\S]{0,160}?playerBox\(mySkin\)|const box=playerBox\(mySkin\)/.test(fsp),
    'findSpawn valida con la caja de playerBox(mySkin)');
  ok(/Math\.max\s*\(\s*4\s*,\s*Math\.ceil\s*\(\s*box\.h\s*\)\s*\)/.test(fsp),
    'el fallback conserva max(4, ceil(box.h)) bloques de aire');
  ok(/collidesAt\(x\+\.5,h\+1\.01,z\+\.5,box\.r,box\.h\)/.test(fsp),
    'el fallback conserva collidesAt(x+.5,h+1.01,z+.5,box.r,box.h)');
  ok(/return new THREE\.Vector3\(sx\+\.5,hAt\(sx-OX,sz-OZ\)\+2,sz\+\.5\)/.test(fsp),
    'el fallback conserva la salida de siempre');

  const st = grabFn('startGame');
  ok(/findSpawn\(\)/.test(st), 'startGame usa findSpawn()');
  const rs = grabFn('respawn');
  ok(/findSpawn\(\)/.test(rs), 'respawn usa findSpawn()');
  ok(!/108\.5|16\.01|117\.5/.test(rs), 'respawn no duplica las coordenadas del spawn preferido');
}

// 9. favicon: data URI SVG con el lenguaje visual de .logo-cube
{
  const head = html.slice(0, html.indexOf('</head>'));
  const link = (head.match(/<link[^>]*rel="icon"[^>]*>/) || [''])[0];
  ok(link.length > 0, 'el <head> declara un <link rel="icon">');
  ok(/type="image\/svg\+xml"/.test(link), 'el favicon es SVG (type="image/svg+xml")');
  ok(/sizes="any"/.test(link), 'el favicon declara sizes="any"');
  const href = (link.match(/href="([^"]*)"/) || [])[1] || '';
  ok(href.indexOf('data:image/svg+xml,') === 0, 'el href es un data URI SVG (sin archivo externo)');
  ok(!/href="[^"]*\.(?:svg|png|ico)"/i.test(head), 'no hay <link> a una imagen externa');
  ok(head.indexOf('rel="manifest"') >= 0 && head.indexOf('rel="apple-touch-icon"') >= 0,
    'el manifest y el apple-touch-icon siguen en el <head>');
  ok(head.indexOf('<title>') < head.indexOf('rel="icon"'), 'el favicon va después del <title>');

  let svg = '';
  try { svg = decodeURIComponent(href.slice('data:image/svg+xml,'.length)); }
  catch (e) { ok(false, 'el href se decodifica con decodeURIComponent: ' + e.message); }
  ok(svg.length > 0 && svg.indexOf('<svg') >= 0, 'el data URI decodificado contiene un <svg>');
  ok(/viewBox="0 0 100 100"/.test(svg), 'el SVG usa viewBox="0 0 100 100"');
  ok(/<rect[^>]*rx=/.test(svg), 'el SVG tiene un rect con rx (cuadrado redondeado)');
  ok(/linearGradient[^>]*x1='0'[^>]*y1='0'[^>]*x2='1'[^>]*y2='1'/.test(svg),
    'el linearGradient va en diagonal (0,0 → 1,1)');
  ok(svg.includes('#8bd450') && svg.includes('#9a6a45'), 'el SVG usa #8bd450 y #9a6a45');
  ok((svg.match(/offset='\.5'/g) || []).length >= 2, 'el degradado tiene hard stop al 50 %');
  ok(/stroke='#fff'/.test(svg) && /stroke-width='4'/.test(svg), 'el SVG lleva borde interior blanco sutil');
  ok(/<rect[^>]*rx='22'[^>]*stroke='#fff'/.test(svg) || /<rect[^>]*stroke='#fff'[^>]*rx='22'/.test(svg),
    'el borde interior usa rx=22');

  const logo = (html.match(/\.logo-cube\s*\{[^}]*\}/) || [''])[0];
  ok(logo.includes('#8bd450') && logo.includes('#9a6a45'),
    '.logo-cube usa los mismos dos hex que el favicon');
  ok(/linear-gradient\(135deg,#8bd450 0 50%,#9a6a45 50% 100%\)/.test(logo),
    '.logo-cube conserva su diagonal con hard stop al 50 %');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 cactus (blocks/cactus + player/physics + ui/branding) OK');
