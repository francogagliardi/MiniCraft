// Tests del bug "aprieto Enter para chatear y me teletransporto":
// el handler de keydown maneja Enter SIN preventDefault, y los overlays se ocultan con
// opacity:0 (NO display:none), asi que el boton que el jugador clickeo (JUGAR / Reaparecer)
// queda con el foco y el navegador dispara su click: startGame()/respawn() llaman a
// findSpawn() y el jugador salta al spawn. Y estando muerto openChat() corta (if(dead)),
// con lo cual el chat no abre y lo unico que pasa es el teletransporte.
// El bug es de foco del browser (no reproducible headless), asi que —igual que
// lookguard.mjs/worldgen.mjs— este test EXTRAE el handler real de index.html y lo ejecuta
// contra eventos falsos: asierta el comportamiento REAL del codigo que corre el navegador.
// Cubre: que Enter cancele la accion por defecto con el juego iniciado, que abra el chat
// vivo, que reaparezca estando muerto, que NO cancele en el menu (ahi Enter debe activar el
// boton) y que los overlays ocultos dejen de ser focuseables.
// Uso: node test/enter-chat.mjs   (sale con código != 0 si algo falla)
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

// ---- extracción del handler real de keydown ----
const MARK = "addEventListener('keydown', e=>{";
const i = html.indexOf(MARK);
const j = i >= 0 ? html.indexOf('\n});', i) : -1;
const present = i >= 0 && j > i;
ok(present, 'handler keydown presente en index.html');
let handler = null;
if (present) {
  try {
    handler = new Function('e', 'keys', 'state', 'dead', 'started', 'openChat', 'respawn',
      'closeChat', 'openInv', 'closeInv', 'toggleFull', 'select', 'isAdmin', 'toggleFly', 'canAct',
      html.slice(i + MARK.length, j));
    ok(true, 'handler de keydown evaluable aislado del resto del juego');
  } catch (e) { ok(false, 'handler evaluable: ' + e.message); }
}

// corre el handler con un evento falso y espías de las funciones que importan
function press(code, { state = 'play', dead = false, started = true } = {}) {
  const called = [];
  const spy = n => () => called.push(n);
  const e = {
    code, target: { tagName: 'CANVAS' },
    preventDefault: spy('preventDefault'), stopPropagation: spy('stopPropagation'),
  };
  if (handler) handler(e, {}, state, dead, started, spy('openChat'), spy('respawn'),
    spy('closeChat'), spy('openInv'), spy('closeInv'), spy('toggleFull'), spy('select'),
    () => false, spy('toggleFly'), () => true);
  return called;
}
const T = (name, fn) => { if (!handler) { ok(false, `${name}: sin handler`); return; } try { fn(); } catch (e) { ok(false, `${name}: ${e.message}`); } };

// 1. vivo: Enter tiene que cancelar el default (si no, el navegador clickea el boton que
//    quedo con foco = JUGAR => startGame => findSpawn) y abrir el chat
T('Enter vivo', () => {
  const c = press('Enter');
  ok(c.includes('preventDefault'), 'Enter con el juego iniciado → e.preventDefault() (no dispara el click del boton con foco)');
  ok(c.includes('openChat'), 'Enter vivo → abre el chat');
  ok(!c.includes('respawn'), 'Enter vivo → NO reaparece');
});

// 2. muerto: openChat() corta por dead, asi que antes quedaba SOLO el click del boton
//    Reaparecer (= el teletransporte reportado). Ahora: respawn explicito + default cancelado.
T('Enter muerto', () => {
  const c = press('Enter', { dead: true });
  ok(c.includes('preventDefault'), 'Enter muerto → e.preventDefault() (no clickea el boton de Reaparecer)');
  ok(c.includes('respawn'), 'Enter muerto → reaparece (accion explicita, no un click fantasma)');
  ok(!c.includes('openChat'), 'Enter muerto → no intenta abrir el chat');
});

// 3. en el menu (sin iniciar) Enter NO se cancela: ahi el default ES lo correcto
//    (Enter activa el boton enfocado: navegacion por teclado)
T('Enter en el menu', () => {
  const c = press('Enter', { state: 'menu', started: false });
  ok(!c.includes('preventDefault'), 'Enter sin juego iniciado → NO cancela (el menu sigue navegable con teclado)');
  ok(!c.includes('openChat') && !c.includes('respawn'), 'Enter en el menu → no abre chat ni reaparece');
});

// 4. la otra mitad del fix: un overlay oculto no puede retener el foco
{
  const ov = /\.overlay\.hidden\s*\{([^}]*)\}/.exec(html);
  const inv = /#inv\.hidden\s*\{([^}]*)\}/.exec(html);
  ok(!!ov && /visibility\s*:\s*hidden/.test(ov[1]),
    '.overlay.hidden usa visibility:hidden (el boton de adentro deja de ser focuseable)');
  ok(!!inv && /visibility\s*:\s*hidden/.test(inv[1]), '#inv.hidden usa visibility:hidden');
  const tr = /\.overlay\s*\{([^}]*)\}/.exec(html);
  ok(!!tr && /visibility\s+\.4s/.test(tr[1]), '.overlay transiciona visibility (el fade no se corta)');
}

if (fails) console.log(`\n💥 ${fails} chequeo(s) fallaron`);
else console.log('\n🎉 Enter/chat/foco OK');
process.exit(fails ? 1 : 0);
