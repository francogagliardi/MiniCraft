// Tests del menú de configuración (change menu-configuracion, spec ui/config):
// verifica el botón ⚙️ Configuración en #pause, el panel oculto por defecto,
// las constantes MOUSE_SENSITIVITY/BRIGHTNESS/QUALITY_LEVEL, applyQuality(),
// el pointermove con MOUSE_SENSITIVITY, applyAtmosphere con BRIGHTNESS, la
// persistencia localStorage (mc-mouse-sens, mc-brightness, mc-quality), que
// npm test da de alta 21 archivos y las regresiones del reporte en navegador
// (panel oculto, sensibilidad del mouse, brillo sin lavado blanco).
// Uso: node test/config.mjs   (sale con código != 0 si algo falla)
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

// ---- 1. HTML del menú de pausa ----
{
  const pause = (html.match(/<div[^>]*id="pause"[\s\S]*?<\/div>/) || [''])[0];
  ok(/id="pause"/.test(html), 'existe el overlay #pause');
  ok(/id="btnConfig"/.test(html), 'el menú de pausa tiene el botón ⚙️ Configuración (#btnConfig)');
  ok(/id="configPanel"/.test(html), 'existe el panel de configuración (#configPanel)');
  const cfgPanel = (html.match(/id="configPanel"[^>]*>/) || [''])[0];
  ok(/\bhidden\b/.test(cfgPanel), '#configPanel arranca oculto (.hidden)');
  ok(/id="sensSlider"/.test(html), 'el panel tiene el slider de sensibilidad (#sensSlider)');
  ok(/id="brightSlider"/.test(html), 'el panel tiene el slider de brillo (#brightSlider)');
  ok(/id="qualitySelect"/.test(html), 'el panel tiene el select de calidad (#qualitySelect)');
  ok(/id="btnConfigBack"/.test(html), 'el panel tiene el botón Volver (#btnConfigBack)');
  ok(/value="0"/.test(html) && /value="1"/.test(html) && /value="2"/.test(html),
    'el select de calidad ofrece los 3 niveles (0/1/2)');
  ok(/Super optimizada/.test(html) && /Baja\/rápida/.test(html) && /Alta/.test(html),
    'las 3 opciones de calidad tienen sus etiquetas');
  ok(/id="sensSlider"[^>]*value="1"/.test(html), 'el slider de sensibilidad arranca en 1');
  ok(/id="brightSlider"[^>]*value="1"/.test(html), 'el slider de brillo arranca en 1');
}

// ---- 2. Constantes y lógica JS ----
{
  ok(/\blet\s+MOUSE_SENSITIVITY\b/.test(html) || /\bMOUSE_SENSITIVITY\s*=/.test(html),
    'se declara MOUSE_SENSITIVITY');
  ok(/\blet\s+BRIGHTNESS\b/.test(html) || /\bBRIGHTNESS\s*=/.test(html),
    'se declara BRIGHTNESS');
  ok(/\blet\s+QUALITY_LEVEL\b/.test(html) || /\bQUALITY_LEVEL\s*=/.test(html),
    'se declara QUALITY_LEVEL');
  ok(/QUALITY_LEVEL\s*=\s*TOUCH\s*\?\s*1\s*:/.test(html) ||
     /QUALITY_LEVEL\s*=\s*TOUCH/.test(html),
    'QUALITY_LEVEL arranca táctil 1 / PC 2');
  ok(/let\s+renderer\s*=/.test(html), 'renderer se declara con let (re-asignable por applyQuality)');
  ok(/player\.yaw\s*-=\s*dx\s*\*\s*MOUSE_SENSITIVITY/.test(html),
    'pointermove aplica dx * MOUSE_SENSITIVITY (yaw)');
  ok(/player\.pitch\s*=\s*Math\.max\(-1\.55,\s*Math\.min\(1\.55,\s*player\.pitch\s*-\s*dy\s*\*\s*MOUSE_SENSITIVITY\)/.test(html),
    'pointermove aplica dy * MOUSE_SENSITIVITY (pitch)');
  const atm = grabFn('applyAtmosphere');
  ok(atm.length > 0, 'se puede extraer el cuerpo de applyAtmosphere');
  ok(/BRIGHTNESS/.test(atm), 'applyAtmosphere usa BRIGHTNESS');
  ok(/function\s+applyQuality\s*\(/.test(html), 'existe function applyQuality(level)');
  const aq = grabFn('applyQuality');
  ok(aq.length > 0, 'se puede extraer el cuerpo de applyQuality');
  ok(/antialias\s*=\s*\(level\s*===\s*2\)/.test(aq) || /level\s*===\s*2/.test(aq),
    'applyQuality activa antialias solo en nivel 2');
  ok(/shadowMap\.enabled\s*=\s*level\s*===\s*2/.test(aq),
    'applyQuality activa sombras solo en nivel 2');
  ok(/fog\.far\s*=\s*100/.test(aq) && /fog\.far\s*=\s*180/.test(aq),
    'applyQuality niebla corta (100) en nivel 0 y normal (180) en 1/2');
  ok(/mapSize\.set\s*\(\s*level\s*===\s*0\s*\?\s*512\s*:2048/.test(aq),
    'applyQuality mapa de sombras 512 en nivel 0, 2048 en 1/2');
}

// ---- 3. Cableado de controles y localStorage ----
{
  ok(/getElementById\('btnConfig'\)\.onclick/.test(html) || /btnConfig\.onclick/.test(html),
    'btnConfig.onclick cableado');
  ok(/getElementById\('btnConfigBack'\)\.onclick/.test(html) || /btnConfigBack\.onclick/.test(html),
    'btnConfigBack.onclick cableado');
  ok(/getElementById\('sensSlider'\)\.oninput/.test(html) || /sensSlider\.oninput/.test(html),
    'sensSlider.oninput cableado');
  ok(/getElementById\('brightSlider'\)\.oninput/.test(html) || /brightSlider\.oninput/.test(html),
    'brightSlider.oninput cableado');
  ok(/getElementById\('qualitySelect'\)\.onchange/.test(html) || /qualitySelect\.onchange/.test(html),
    'qualitySelect.onchange cableado');
  ok(/localStorage\.setItem\(\s*'mc-mouse-sens'/.test(html),
    "se persiste localStorage('mc-mouse-sens')");
  ok(/localStorage\.setItem\(\s*'mc-brightness'/.test(html),
    "se persiste localStorage('mc-brightness')");
  ok(/localStorage\.setItem\(\s*'mc-quality'/.test(html),
    "se persiste localStorage('mc-quality')");
  ok(/localStorage\.getItem\(\s*'mc-mouse-sens'/.test(html),
    "el boot restaura localStorage('mc-mouse-sens')");
  ok(/localStorage\.getItem\(\s*'mc-brightness'/.test(html),
    "el boot restaura localStorage('mc-brightness')");
  ok(/localStorage\.getItem\(\s*'mc-quality'/.test(html),
    "el boot restaura localStorage('mc-quality')");
  ok(/0\.0042\s*\*\s*parseFloat/.test(html),
    'sensSlider escribe MOUSE_SENSITIVITY = 0.0042 * valor');
  ok(/applyQuality\(QUALITY_LEVEL\)/.test(html),
    'qualitySelect aplica applyQuality(QUALITY_LEVEL)');
}

// ---- 4. Regresiones del reporte en navegador ----
{
  ok(/#pause \.card\.hidden\s*\{\s*display:none/.test(html),
    '`.hidden` saca del layout la tarjeta oculta dentro de #pause (no se ven las dos juntas)');
  ok(/id="pauseMain"/.test(html), 'el menú de pausa vive en #pauseMain (se alterna con #configPanel)');
  const cfgClick = (html.match(/getElementById\('btnConfig'\)\.onclick=e=>\{[\s\S]*?\n\};/) || [''])[0];
  ok(/pauseMain'\)\.classList\.add\('hidden'\)/.test(cfgClick) &&
     /configPanel'\)\.classList\.remove\('hidden'\)/.test(cfgClick),
    'btnConfig oculta #pauseMain y muestra #configPanel');
  const backClick = (html.match(/getElementById\('btnConfigBack'\)\.onclick=e=>\{[\s\S]*?\n\};/) || [''])[0];
  ok(/configPanel'\)\.classList\.add\('hidden'\)/.test(backClick) &&
     /pauseMain'\)\.classList\.remove\('hidden'\)/.test(backClick),
    'btnConfigBack oculta #configPanel y vuelve a #pauseMain');
  const mouseMove = (html.match(/addEventListener\('mousemove',e=>\{[\s\S]*?\n\}\);/) || [''])[0];
  ok(/player\.yaw-=mx\*MOUSE_SENSITIVITY/.test(mouseMove) && !/\.0024/.test(mouseMove),
    'mousemove usa MOUSE_SENSITIVITY (el slider de sensibilidad afecta al mouse)');
  const qGet = html.indexOf("getItem('mc-quality')");
  ok(qGet >= 0 && /applyQuality\(QUALITY_LEVEL\)/.test(html.slice(qGet, qGet + 600)),
    'el boot aplica la calidad guardada (applyQuality tras restaurar mc-quality)');
  const atmReg = grabFn('applyAtmosphere');
  ok(/const Lb\s*=/.test(atmReg) && /const d\s*=\s*\(Lb - NIGHT_MIN\)/.test(atmReg),
    'applyAtmosphere deriva la fase de la luz con brillo (aclarar también cielo y niebla)');
  ok(!/0xffffff/.test(atmReg), 'applyAtmosphere no lava el fondo hacia blanco (sin brillo raro de noche)');
  ok(/QUALITY_LEVEL\s*===\s*0\)\s*\?\s*100/.test(atmReg),
    'applyAtmosphere respeta la niebla corta del nivel 0');
}

// ---- 5. Brillo con más rango y sin parpadeo al amanecer/atardecer ----
{
  ok(/id="brightSlider"[^>]*max="3"/.test(html), 'el slider de brillo llega hasta 3.0× (antes 2.0×)');
  ok(/function\s+brightLevel\s*\(/.test(html), 'existe brightLevel(L): una sola fuente del brillo');
  const bLevel = (br) => new Function('BRIGHTNESS', 'return ' + grabFn('brightLevel'))(br);
  let bl = null;
  try { bl = bLevel(1); } catch (e) {}
  ok(typeof bl === 'function', 'brightLevel es evaluable de forma pura');
  if (typeof bl === 'function') {
    ok(Math.abs(bLevel(1)(0.5) - 0.5) < 1e-9, 'brillo 1.0× no altera la noche (0.50)');
    ok(Math.abs(bLevel(2)(0.5) - 0.75) < 1e-9, 'brillo 2.0× deja la noche a mitad de camino del día');
    ok(Math.abs(bLevel(3)(1) - 1) < 1e-9, 'de día el brillo no altera la luz (siempre 1)');
    const maxNight = bLevel(3)(0.5);
    ok(maxNight > 0.75 && maxNight < 0.85,
      `brillo 3.0× aclara la noche al máximo pero sin llegar a día pleno (${maxNight})`);
  }
  const atmB = grabFn('applyAtmosphere');
  ok(/const Lb\s*=\s*brightLevel\(L\)/.test(atmB), 'applyAtmosphere usa brightLevel(L)');
  const skyB = grabFn('tickSky');
  ok(/const Lb\s*=\s*brightLevel\(/.test(skyB), 'tickSky usa el mismo brightLevel (sol y luna)');
  ok(/sun\.intensity\s*=\s*(night\s*\?\s*0\s*:\s*)?SUN_DAY\s*\*\s*Lb/.test(skyB),
    'tickSky fija sun.intensity con la MISMA luz brillante que applyAtmosphere (0 de noche)');
  ok(/night\s*\?\s*0\s*:\s*SUN_DAY\s*\*\s*Lb/.test(skyB),
    'tickSky apaga el sol directo de noche (la luna es la única luz direccional)');
  ok(!/SUN_DAY\s*\*\s*d\b/.test(skyB),
    'tickSky no pisa sun.intensity con la luz sin brillo (sin parpadeo al atardecer/amanecer)');
  ok(/const d\s*=\s*\(Lb - NIGHT_MIN\)/.test(skyB), 'tickSky deriva la fase de la luz brillante');
}

// ---- 6. Alta en la suite (21 archivos) ----
{
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'server', 'package.json'), 'utf8'));
  const s = pkg.scripts.test;
  ok(/test\/config\.mjs/.test(s), 'npm test da de alta test/config.mjs');
  const count = (s.match(/test\/[\w-]+\.mjs/g) || []).length;
  ok(count === 21, `el script test enumera 21 archivos (${count})`);
  ok(!/count\s*===\s*20/.test(s), 'package.json ya no menciona 20 archivos');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 menú de configuración (ui/config) OK');
