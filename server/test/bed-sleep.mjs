// Tests de la cama y el salto de noche (world/sleep).
// Uso: node test/bed-sleep.mjs   (sale con código != 0 si algo falla)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Sleep from '../sleep.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
const bot = fs.readFileSync(path.join(root, 'bot', 'index.js'), 'utf8');
let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

// ---------- 1. quórum puro ----------
const q = (players) => Sleep.quorum(players);
const P = (extra = {}) => ({ mode: 'player', dead: 0, sleeping: false, bot: false, ...extra });

ok(Sleep.isExempt({ mode: 'admin' }) === true, 'isExempt: admin exento');
ok(Sleep.isExempt({ mode: 'player', bot: true }) === true, 'isExempt: bot exento');
ok(Sleep.isExempt({ mode: 'player' }) === false, 'isExempt: jugador real no exento');

{
  const r = q([]);
  ok(r.need === 0 && r.count === 0 && r.ready === false, 'sin jugadores no hay salto');
}
{
  const r = q([P({ sleeping: true })]);
  ok(r.need === 1 && r.count === 1 && r.ready === true, 'un jugador real durmiendo dispara');
}
{
  const r = q([P({ sleeping: false }), P({ sleeping: true })]);
  ok(r.need === 2 && r.count === 1 && r.ready === false, 'con dos reales, uno solo no alcanza');
}
{
  const r = q([P({ sleeping: true }), P({ sleeping: true })]);
  ok(r.need === 2 && r.count === 2 && r.ready === true, 'los dos reales durmiendo disparan');
}
{
  const r = q([P({ sleeping: true }), P({ mode: 'admin' }), P({ bot: true })]);
  ok(r.need === 1 && r.count === 1 && r.ready === true, 'admin y bot despiertos no bloquean');
}
{
  const r = q([P({ mode: 'admin', sleeping: true })]);
  ok(r.need === 0 && r.count === 0 && r.ready === true, 'el admin solo puede amanecer');
}
{
  const r = q([P({ bot: true, sleeping: true })]);
  ok(r.need === 0 && r.count === 0 && r.ready === false, 'un bot durmiendo no dispara nada');
}
{
  const r = q([P({ sleeping: true }), P({ dead: 1 })]);
  ok(r.need === 1 && r.count === 1 && r.ready === true, 'un muerto despierto no bloquea');
}
{
  const r = q([P({ dead: 1, sleeping: true })]);
  ok(r.need === 0 && r.count === 0 && r.ready === false, 'un muerto durmiendo no dispara');
}
{
  const r = q([P({ sleeping: true }), P({ dead: 1, sleeping: false })]);
  ok(r.need === 1 && r.count === 1 && r.ready === true, 'el muerto sale del denominador');
}

// dawnAdvanceMs: avanza hasta después del amanecer (fase 0)
{
  const a = Sleep.dawnAdvanceMs(0.9, 480000);
  ok(Math.abs(a - 49000) < 1, `dawnAdvanceMs(0.9, 480000) ≈ 49000 (${a})`);
  const b = Sleep.dawnAdvanceMs(0.625, 480000);
  ok(Math.abs(b - 181000) < 1, `dawnAdvanceMs(0.625) ≈ 181000 (${b})`);
  ok(Sleep.dawnAdvanceMs(0.8, 480000) > Sleep.dawnAdvanceMs(0.9, 480000), 'cuanto más temprano, más ms hasta el amanecer');
  ok(Sleep.dawnAdvanceMs(0.9, 0) === 0 && Sleep.dawnAdvanceMs(NaN, 1) === 0, 'valores inválidos no rompen el cálculo');
}

// ---------- 2. bloque de cama en el cliente ----------
const grabObj = (marker) => {
  let i = html.indexOf(marker); i = html.indexOf('{', i);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    if (html[j] === '}') { depth--; if (depth === 0) return html.slice(i, j + 1); }
  }
  throw new Error('no balanceado: ' + marker);
};
const BED = 59, BED_X_FOOT = 60, BED_X_HEAD = 61, BED_Z_FOOT = 62, BED_Z_HEAD = 63;
const idsLine = html.match(/const AIR=0, GRASS=1[\s\S]*?BED_Z_HEAD=63;/);
ok(!!idsLine, 'ids: la línea de constantes llega hasta BED_Z_HEAD=63');
if (idsLine) {
  const l = idsLine[0];
  ok(/BED=59/.test(l) && /BED_X_FOOT=60/.test(l) && /BED_X_HEAD=61/.test(l) &&
     /BED_Z_FOOT=62/.test(l) && /BED_Z_HEAD=63/.test(l), 'ids 59-63 declarados');
}
let DEFS = null;
try {
  DEFS = new Function(idsLine[0] + '; const SWORD=100, PICK=101; return (' + grabObj('const DEFS = ') + ');')();
} catch (e) { ok(false, 'parseo de DEFS: ' + e.message); }
if (DEFS) {
  ok(DEFS[BED] && DEFS[BED].item === 'bed', 'BED es ítem de paleta');
  const want = [
    [BED_X_FOOT, 'x', false], [BED_X_HEAD, 'x', true],
    [BED_Z_FOOT, 'z', false], [BED_Z_HEAD, 'z', true],
  ];
  for (const [id, axis, head] of want) {
    const d = DEFS[id];
    ok(!!d && d.cube === 1 && d.bed === 1 && d.bedAxis === axis && d.bedHead === head && d.hard === 0.3,
      `mitad ${id}: cube+bed, eje ${axis}, head=${head}, dureza 0.3`);
  }
}

// bloque puro /* bed:start */ ... /* bed:end */
const bedBlock = html.match(/\/\* bed:start \*\/([\s\S]*?)\/\* bed:end \*\//);
ok(!!bedBlock, 'existe el bloque autocontenido bed:start/end');
let Bed = null;
try {
  Bed = new Function('return (function(){' + (bedBlock ? bedBlock[1] : '') +
    '; return { bedKind, bedCells, bedPlacement, BED_WORLD_IDS }; })()')();
} catch (e) { ok(false, 'parseo del bloque bed: ' + e.message); }
if (Bed) {
  ok(JSON.stringify(Bed.BED_WORLD_IDS) === JSON.stringify([BED_X_FOOT, BED_X_HEAD, BED_Z_FOOT, BED_Z_HEAD]),
    'BED_WORLD_IDS coincide con las constantes');
  const kx = Bed.bedKind(BED_X_HEAD);
  ok(kx && kx.axis === 'x' && kx.head === true, 'bedKind: cabecera X');
  const kz = Bed.bedKind(BED_Z_FOOT);
  ok(kz && kz.axis === 'z' && kz.head === false, 'bedKind: pie Z');
  ok(Bed.bedKind(1) === null, 'bedKind: un bloque que no es cama devuelve null');
  const cellsHead = Bed.bedCells(10, 5, 10, BED_X_HEAD, (x) => x === 9);
  ok(cellsHead.length === 2 && cellsHead[1][0] === 9 && cellsHead[1][2] === 10, 'bedCells: cabecera X empareja con -X');
  const cellsFootNeg = Bed.bedCells(10, 5, 10, BED_X_FOOT, (x) => x === 9);
  ok(cellsFootNeg.length === 2 && cellsFootNeg[1][0] === 9, 'bedCells: pie X empareja hacia -X (cama mirada al oeste)');
  const cellsFootZ = Bed.bedCells(10, 5, 10, BED_Z_FOOT, (x, y, z) => z === 11);
  ok(cellsFootZ.length === 2 && cellsFootZ[1][0] === 10 && cellsFootZ[1][2] === 11, 'bedCells: pie Z empareja con +Z');
  const cellsAlone = Bed.bedCells(10, 5, 10, BED_X_HEAD, () => false);
  ok(cellsAlone.length === 1, 'bedCells: sin pareja devuelve solo la celda propia');
  const px = Bed.bedPlacement(0.9, 0.1);
  ok(px.axis === 'x' && px.dx === 1 && px.dz === 0 && px.foot === BED_X_FOOT && px.head === BED_X_HEAD,
    'bedPlacement: mirada +X usa pie/cabecera X');
  const pz = Bed.bedPlacement(-0.1, -0.9);
  ok(pz.axis === 'z' && pz.dx === 0 && pz.dz === -1 && pz.foot === BED_Z_FOOT && pz.head === BED_Z_HEAD,
    'bedPlacement: mirada -Z usa pie/cabecera Z');
}

ok(/const INVENTORY = \[[\s\S]*?\bBED\b[\s\S]*?\];/.test(html), 'INVENTORY incluye BED');
ok(html.includes('BED_WORLD_IDS'), 'el cliente usa la tabla de ids de cama');

// rama de render / colisión
const emitIdx = html.indexOf('function emitGlobalCell');
const emitEnd = html.indexOf('\n}', html.indexOf('DEFS[b]?.bed', emitIdx));
ok(emitIdx > 0 && emitEnd > emitIdx, 'emitGlobalCell tiene rama para DEFS[b]?.bed');
ok(/function collidesAt\([\s\S]*?DEFS\[b\]\?\.bed[\s\S]*?solidAt/.test(html), 'collidesAt deja pasar sobre la cama');
ok(/function slabBlocked\([\s\S]*?DEFS\[b\]\?\.bed[\s\S]*?return slab/.test(html), 'slabBlocked trata la cama como step');

// funciones de juego
const fnSrc = (name) => {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = html.indexOf('\nfunction ', i + 1);
  return html.slice(i, j > i ? j : i + 4000);
};
const doPlace = fnSrc('doPlace');
ok(/item\s*===\s*'bed'/.test(doPlace) && /bedPlacement\(/.test(doPlace), 'doPlace arma la cama con bedPlacement');
ok((doPlace.match(/editBlock\(/g) || []).length >= 2, 'doPlace manda dos ediciones para la cama');
const doBreak = fnSrc('doBreak');
ok(/DEFS\[h\.b\]\?\.bed/.test(doBreak) && /bedCellsAt\(/.test(doBreak), 'doBreak rompe la pareja de cama');
ok(/enterSleep\(/.test(fnSrc('onRightDown')), 'click derecho sobre cama llama a enterSleep');
ok(/wakeUp\(/.test(fnSrc('damage')), 'el daño despierta al durmiente');
ok(/function enterSleep\(/.test(html) && /function wakeUp\(/.test(html), 'existen enterSleep y wakeUp');
ok(/t:\s*'sleep'/.test(html) && /t:\s*'wake'/.test(html), 'el cliente manda sleep y wake');
ok(/m\.t\s*===\s*'sleep'/.test(html), 'el cliente procesa el mensaje sleep');
ok(/id="sleep"/.test(html) && /sleepCount/.test(html), 'existe el overlay de sueño con contador');
ok(/state\s*===\s*'sleep'/.test(html), 'el cliente tiene estado sleep');
ok(/pointerlockchange[\s\S]*?wakeUp\(/.test(html), 'perder el lock despierta');
ok(/keydown[\s\S]*?wakeUp\(/.test(html.slice(html.indexOf("addEventListener('keydown'"), html.indexOf("addEventListener('keyup'"))),
  'una tecla de movimiento despierta');

// ---------- 3. servidor ----------
ok(/require\('\.\/sleep\.js'\)/.test(server), 'server requiere el módulo sleep');
ok(/let sleepOffsetMs\s*=\s*0/.test(server), 'server declara sleepOffsetMs mutable');
ok(/function phaseNow\(\)\s*\{\s*return\s*\(\(Date\.now\(\)\s*-\s*T0\s*\+\s*sleepOffsetMs\)/.test(server),
  'phaseNow suma el offset de sueño');
ok(/m\.t\s*===\s*'sleep'/.test(server) && /m\.t\s*===\s*'wake'/.test(server), 'server maneja sleep y wake');
ok(/bot:\s*m\.bot\s*===\s*true/.test(server), 'server registra el flag bot del hello');
ok(/sleeping:\s*\[/.test(server) && /sleepNeed/.test(server), 'welcome incluye sleeping y sleepNeed');
ok(/dawnAdvanceMs\(/.test(server) && /skipNight\(/.test(server), 'server salta al amanecer con el módulo puro');
ok(/sleepBed/.test(server), 'server recuerda la celda de la cama por durmiente');

// ---------- 4. bot ----------
ok(/t:\s*'hello'[^;]*bot:\s*true/s.test(bot), 'el bot declara bot:true en el hello');

// ---------- 5. alta en la suite (22 archivos) ----------
{
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'server', 'package.json'), 'utf8'));
  const s = pkg.scripts.test;
  ok(/test\/bed-sleep\.mjs/.test(s), 'npm test da de alta test/bed-sleep.mjs');
  const count = (s.match(/test\/[\w-]+\.mjs/g) || []).length;
  ok(count === 22, `el script test enumera 22 archivos (${count})`);
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 cama y salto de noche (world/sleep) OK');
