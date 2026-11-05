// Tests del indicador opcional de FPS y ping (change fps-ping-hud, specs ui/hud,
// ui/config y net/latency): extrae el bloque puro /* perf:start */ ... /* perf:end */
// de index.html y lo evalúa con `new Function` SIN THREE ni DOM (mismo patrón que
// cactus.mjs/skins.mjs), y encima verifica con estáticos el HUD (#perf), el toggle
// persistido en mc-stats, el loop, el temporizador de ping y la rama `ping` del server.
// Uso: node test/stats.mjs   (sale con código != 0 si algo falla)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
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

// ---- 1. HTML del HUD: #perf, fuera de #topbar y sin pisar #stats ----
{
  const perfCount = (html.match(/id="perf"/g) || []).length;
  ok(perfCount === 1, `existe #perf exactamente una vez (${perfCount})`);
  ok(/<div id="perf" class="hidden" aria-live="off">FPS — · Ping —<\/div>/.test(html),
    '#perf arranca oculto con el formato FPS — · Ping — y aria-live="off"');

  const statsCount = (html.match(/id="stats"/g) || []).length;
  ok(statsCount === 1, `#stats sigue siendo único (contenedor de pills, ${statsCount})`);
  ok(/<div id="stats">[\s\S]*?id="btnFly"[\s\S]*?<\/div>/.test(html),
    '#stats sigue siendo el contenedor de las pills de la topbar');

  // #perf no puede vivir dentro de #topbar: al llegar a su <div>, los de la topbar ya cerraron.
  const tb = html.indexOf('<div id="topbar">');
  const pf = html.indexOf('<div id="perf"');
  const slice = tb >= 0 && pf > tb ? html.slice(tb, pf) : '';
  const opens = (slice.match(/<div\b/g) || []).length;
  const closes = (slice.match(/<\/div>/g) || []).length;
  ok(tb >= 0 && pf > tb && opens === closes,
    `#perf está fuera de #topbar (${opens} divs abiertos / ${closes} cerrados antes del indicador)`);
}

// ---- 2. CSS del indicador ----
{
  const perfCss = (html.match(/#perf\s*\{[^}]*\}/) || [''])[0];
  ok(perfCss.length > 0, 'hay una regla CSS para #perf');
  ok(/position\s*:\s*fixed/.test(perfCss), '#perf es position:fixed');
  ok(/top\s*:\s*64px/.test(perfCss), '#perf va debajo del logo (top:64px)');
  ok(/left\s*:\s*16px/.test(perfCss), '#perf va a la izquierda (left:16px)');
  ok(/pointer-events\s*:\s*none/.test(perfCss), '#perf no intercepta clicks (pointer-events:none)');
  const z = perfCss.match(/z-index\s*:\s*(\d+)/);
  ok(!!z && +z[1] < 40, `#perf queda debajo de los overlays (z-index ${z ? z[1] : 'ausente'} < 40)`);
  ok(/#perf\.hidden\s*\{\s*display\s*:\s*none/.test(html), '#perf.hidden lo saca del layout (display:none)');
  ok(/font-variant-numeric\s*:\s*tabular-nums/.test(perfCss),
    'el ancho no baila al cambiar los dígitos (tabular-nums)');
}

// ---- 3. Toggle en #configPanel y persistencia en mc-stats ----
{
  const cfgStart = html.indexOf('id="configPanel"');
  const cfgEnd = html.indexOf('id="btnConfigBack"');
  const cfgBody = cfgStart >= 0 && cfgEnd > cfgStart ? html.slice(cfgStart, cfgEnd) : '';
  ok(/id="showStats"/.test(cfgBody), 'el toggle #showStats vive dentro de #configPanel');
  ok(/<label[^>]*for="showStats"[^>]*>\s*<input[^>]*type="checkbox"[^>]*id="showStats"[^>]*>\s*Mostrar FPS y ping\s*<\/label>/.test(cfgBody),
    '#showStats es un checkbox con label asociado y texto "Mostrar FPS y ping"');
  ok(!/id="showStats"[^>]*checked/.test(html), 'el checkbox arranca desmarcado (oculto por defecto)');

  ok(/localStorage\.setItem\(\s*'mc-stats'/.test(html), "se persiste localStorage('mc-stats')");
  ok(/localStorage\.getItem\(\s*'mc-stats'/.test(html), "el boot restaura localStorage('mc-stats')");

  const handler = (html.match(/getElementById\('showStats'\)\.onchange=[\s\S]*?\n\};/) || [''])[0];
  ok(handler.length > 0, 'showStats.onchange está cableado');
  ok(/STATS_ON\s*=\s*e\.target\.checked/.test(handler), 'el handler actualiza STATS_ON con el checkbox');
  ok(/localStorage\.setItem\(\s*'mc-stats'/.test(handler), "el handler persiste '1'/'0' en mc-stats");
  ok(/perfLastText\s*=\s*''/.test(handler), 'el handler resetea perfLastText (aplica en caliente)');
  ok(/renderPerf\(\)/.test(handler), 'el handler llama a renderPerf() en el mismo evento');

  const bootAt = html.indexOf("getItem('mc-stats')");
  const boot = bootAt >= 0 ? html.slice(bootAt, bootAt + 500) : '';
  ok(/showStats'\)\.checked\s*=\s*STATS_ON/.test(boot), 'el boot restaura el checkbox desde mc-stats');
  ok(/renderPerf\(\)/.test(boot), 'el boot aplica renderPerf() con la preferencia guardada');
}

// ---- 4. Bloque puro /* perf:start */ ... /* perf:end */ ----
const START = '/* perf:start */', END = '/* perf:end */';
const pi = html.indexOf(START), pj = html.indexOf(END);
const present = pi >= 0 && pj > pi;
ok(present, 'bloque /* perf:start */ ... /* perf:end */ presente en index.html');
const block = present ? html.slice(pi, pj) : '';
let API = null;
if (present) {
  try {
    API = new Function(block + '\n;return {PERF_WINDOW_MS, PERF_PING_MS, PERF_PING_TIMEOUT_MS, ' +
      'formatPerf, perfFpsOf, perfSmooth, perfRtt};')();
  } catch (e) { ok(false, 'bloque perf evaluable SIN THREE ni DOM: ' + e.message); }
}
const T = (name, fn) => {
  if (!API) { ok(false, `${name}: sin API perf`); return; }
  try { fn(); } catch (e) { ok(false, `${name}: ${e.message}`); }
};

T('constantes del indicador', () => {
  ok(API.PERF_WINDOW_MS === 500, `la ventana de FPS es 500 ms (${API.PERF_WINDOW_MS})`);
  ok(API.PERF_PING_MS === 2000, `el intervalo de ping es 2000 ms (${API.PERF_PING_MS})`);
  ok(API.PERF_PING_TIMEOUT_MS === 3000, `el timeout de ping es 3000 ms (${API.PERF_PING_TIMEOUT_MS})`);
});

T('formatPerf', () => {
  ok(API.formatPerf(60, 24) === 'FPS 60 · Ping 24 ms', `formato con medición (${API.formatPerf(60, 24)})`);
  ok(API.formatPerf(60, null) === 'FPS 60 · Ping —', `sin ping usa guion largo (${API.formatPerf(60, null)})`);
  ok(API.formatPerf(null, null) === 'FPS — · Ping —', `sin medición usa guiones (${API.formatPerf(null, null)})`);
  ok(API.formatPerf(59.6, 24.4) === 'FPS 60 · Ping 24 ms', 'redondea FPS y ping');
  ok(API.formatPerf(undefined, undefined) === 'FPS — · Ping —', 'valores ausentes no rompen el formato');
  ok(API.formatPerf(0, 0) === 'FPS 0 · Ping 0 ms', 'un cero medido es un valor, no un guion');
});

T('cálculo de FPS', () => {
  ok(API.perfFpsOf(30, 500) === 60, `30 frames en 500 ms = 60 FPS (${API.perfFpsOf(30, 500)})`);
  ok(API.perfFpsOf(0, 500) === 0, 'una ventana sin frames da 0 (no NaN)');
  ok(API.perfFpsOf(30, 0) === null, 'sin ventana transcurrida no hay FPS');
  ok(API.perfFpsOf(30, -100) === null, 'una ventana negativa se descarta');
  ok(API.perfSmooth(null, 60) === 60, 'la primera ventana usa el valor crudo');
  ok(API.perfSmooth(0, 45) === 45, 'un prev inválido (0) se reemplaza por el valor crudo');
  ok(API.perfSmooth(60, 30) === 48, `suaviza 0.6/0.4 (${API.perfSmooth(60, 30)})`);
  ok(API.perfSmooth(60, 60) === 60, 'una tasa estable no se mueve');
});

T('cálculo de RTT', () => {
  ok(API.perfRtt(1000, 1024) === 24, `RTT en ms (${API.perfRtt(1000, 1024)})`);
  ok(API.perfRtt(1000, 1024.6) === 25, 'la RTT se redondea');
  ok(API.perfRtt(1000, 900) === null, 'una RTT negativa (reloj que salta) se descarta');
  ok(API.perfRtt(undefined, 1000) === null, 'un ts ausente se descarta');
  ok(API.perfRtt(NaN, 1000) === null, 'un ts no finito se descarta');
});

// ---- 5. Loop, renderPerf y ping del cliente ----
{
  const loop = grabFn('loop');
  ok(loop.length > 0, 'se puede extraer function loop(now)');
  ok(/perfFrames\s*\+\+/.test(loop), 'el loop cuenta frames');
  ok(/PERF_WINDOW_MS/.test(loop), 'el loop cierra la ventana de 500 ms');
  ok((loop.match(/renderPerf\(\);/g) || []).length === 1, 'renderPerf() se llama una sola vez por ventana');
  ok(/perfSmooth\(/.test(loop), 'el loop aplica el suavizado 0.6/0.4');

  const render = grabFn('renderPerf');
  ok(render.length > 0, 'se puede extraer function renderPerf()');
  const offGuard = render.indexOf('STATS_ON');
  const assign = render.indexOf('textContent');
  ok(offGuard >= 0 && assign > offGuard, 'renderPerf sale temprano si el indicador está oculto (antes de tocar el DOM)');
  ok(/perfLastText/.test(render), 'renderPerf compara con el último texto mostrado');
  ok(/if\s*\(\s*txt\s*===\s*perfLastText\s*\)\s*return/.test(render),
    'no asigna textContent cuando el texto no cambió');
  ok(/textContent\s*=\s*txt/.test(render), 'solo escribe textContent con el texto formateado');
  ok(/classList\.(remove|add)\('hidden'\)/.test(render), 'renderPerf alterna .hidden según STATS_ON');

  const setup = grabFn('setupNetHandlers');
  ok(setup.length > 0, 'se puede extraer function setupNetHandlers()');
  ok(/m\.t\s*===\s*'pong'/.test(setup), "setupNetHandlers maneja m.t === 'pong'");
  ok(/if\s*\(\s*perfPend\s*\)/.test(setup), 'un pong sin ping pendiente se ignora');
  ok(/perfPend/.test(setup) && /perfRtt\(/.test(setup),
    'solo acepta el pong si hay un ping pendiente y calcula la RTT');

  const close = (setup.match(/NET\.onclose=[\s\S]*?\n  \};/) || [''])[0];
  ok(close.length > 0, 'se puede extraer NET.onclose');
  ok(/perfPing\s*=\s*null/.test(close), 'NET.onclose limpia el ping visible');
  ok(/perfPend\s*=\s*false/.test(close), 'NET.onclose limpia el ping pendiente');
  ok(/renderPerf\(\)/.test(close), 'NET.onclose refresca el HUD (Ping —)');

  ok(/setInterval\(\s*tickPerfPing\s*,\s*PERF_TICK_MS\s*\)/.test(html),
    'el temporizador de ping corre cada PERF_TICK_MS (500 ms)');
  const tick = grabFn('tickPerfPing');
  ok(tick.length > 0, 'se puede extraer function tickPerfPing()');
  ok(/!mp|mp\s*&&/.test(tick) && /NET\.readyState/.test(tick),
    'en modo solo (sin mp) no se envía ping, así no se inventa latencia');
  ok(/netSend\(\s*\{\s*t\s*:\s*'ping'\s*,\s*ts/.test(tick), "envía {t:'ping', ts} con netSend");
  ok(/PERF_PING_TIMEOUT_MS/.test(tick) && /PERF_PING_MS/.test(tick),
    'usa PERF_PING_MS y PERF_PING_TIMEOUT_MS para el intervalo y el timeout');
  ok(/perfPing\s*=\s*null/.test(tick), 'al vencer el timeout el ping visible pasa a —');
}

// ---- 6. Rama `ping` del servidor: eco solo al emisor ----
{
  const at = server.indexOf("if (m.t === 'ping')");
  ok(at >= 0, "server.js tiene la rama m.t === 'ping'");
  const meGuard = server.indexOf('if (!me) return;');
  ok(meGuard >= 0 && at > meGuard, 'la rama ping está después de la guarda de sesión (if (!me) return)');
  const branch = at >= 0 ? (server.slice(at).match(/^[\s\S]*?\n    \}/) || [''])[0] : '';
  ok(/send\(ws, \{ t: 'pong', ts \}\)/.test(branch), 'responde pong al emisor con el mismo ts');
  ok(!/broadcast/.test(branch), 'la rama ping no difunde a otros jugadores');
  ok(/Number\.isFinite/.test(branch), 'un ts no finito no dispara respuesta');
  ok(/return/.test(branch), 'la rama ping retorna (no cae en mv/edit/etc.)');
  // el heartbeat de WebSocket sigue siendo el único que usa ws.ping()
  ok(/ws\.ping\(\)/.test(server) && !/ws\.ping\([^)]*\)\s*;[\s\S]{0,80}pong/.test(branch),
    'el heartbeat ws.ping() no se reemplaza por el ping de aplicación');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 indicador de FPS y ping (ui/hud, ui/config, net/latency) OK');
