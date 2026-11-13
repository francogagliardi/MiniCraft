// Tests estáticos del change panel-bots-custom: panel de bots en admin.html,
// barras por maxHp en index.html, y retiro del bot externo (compose, workflow,
// credenciales, imágenes y documentación).
// Uso: node test/bots-static.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

const admin = read('admin.html');
const html = read('index.html');
const compose = read('docker-compose.yml');
const deploy = read('.github/workflows/deploy.yml');
const wsAuth = read('server/ws-auth.js');
const envConfig = read('server/env-config.js');
const readme = read('README.md');
const serverReadme = read('server/README.md');
const agents = read('AGENTS.md');

// ---------------------------------------------------------------------------
// 1. Sección Bots en /admin
// ---------------------------------------------------------------------------
{
  ok(/id="botsTitle"/.test(admin), 'admin.html tiene la sección Bots');
  const iBots = admin.indexOf('id="botsTitle"');
  const iUsers = admin.indexOf('id="usersTitle"');
  ok(iBots >= 0 && iUsers >= 0 && iBots < iUsers, 'la sección Bots va antes de Usuarios');
  ok(/id="botsTable"/.test(admin), 'existe la tabla de bots');
  for (const col of ['Nombre', 'Comportamiento', 'Aspecto', 'Vida', 'Daño', 'Alcance', 'Velocidad', 'Vuelo', 'Recibe daño', 'Estado', 'Acciones']) {
    ok(admin.includes(col), `la tabla/el panel contempla la columna ${col}`);
  }
  ok(/\d+\/5 activos/.test(admin), 'hay un contador N/5 activos');
  ok(/id="botsCount"/.test(admin), 'el contador tiene id botsCount');
  ok(/id="botsEmpty"/.test(admin), 'hay estado vacío para la tabla de bots');
  ok(/id="botsLoadError"/.test(admin) && /id="botsRetryBtn"/.test(admin), 'hay error de carga con reintento');
  ok(/id="newBotBtn"/.test(admin), 'hay botón de alta de bot');
  ok(/aria-live/.test(admin.slice(iBots, iUsers + 2000)), 'la sección anuncia resultados por aria-live');
}

// ---------------------------------------------------------------------------
// 2. Diálogo de alta/edición y preset
// ---------------------------------------------------------------------------
{
  const ids = ['botDialog', 'botForm', 'botName', 'botBehavior', 'botSkin', 'botHp',
    'botDamage', 'botReach', 'botSpeed', 'botFlying', 'botTakesDamage', 'botPresetBtn', 'botSaveBtn'];
  for (const id of ids) ok(admin.includes(`id="${id}"`), `el formulario de bots tiene #${id}`);
  ok(/Preset cazador clásico/.test(admin), 'existe el botón “Preset cazador clásico”');
  ok(/id="botHp"[^>]*min="1"[^>]*max="100"[^>]*step="1"/.test(admin), 'vida: min 1, max 100, step 1');
  ok(/id="botDamage"[^>]*min="0"[^>]*max="20"[^>]*step="1"/.test(admin), 'daño: min 0, max 20, step 1');
  ok(/id="botReach"[^>]*min="1"[^>]*max="10"[^>]*step="0?\.1"/.test(admin), 'alcance: min 1, max 10, step 0.1');
  ok(/id="botSpeed"[^>]*min="1"[^>]*max="30"[^>]*step="0?\.1"/.test(admin), 'velocidad: min 1, max 30, step 0.1');
  ok(/id="botFlying"[^>]*type="checkbox"|type="checkbox"[^>]*id="botFlying"/.test(admin), 'vuelo es un checkbox');
  ok(/id="botTakesDamage"[^>]*type="checkbox"|type="checkbox"[^>]*id="botTakesDamage"/.test(admin), 'recibe daño es un checkbox');
  ok(/28\.8/.test(admin), 'el preset usa la velocidad clásica 28.8');
  ok(/id="botDeleteDialog"/.test(admin), 'hay diálogo de borrado de bot');
  ok(/id="botDeleteConfirm"/.test(admin) && /id="botDeleteName"/.test(admin), 'el borrado confirma escribiendo el nombre');
  ok(/Detener y borrar/.test(admin), 'el borrado de un activo ofrece “Detener y borrar”');
  ok(/id="botDeleteStopBtn"/.test(admin), 'existe la acción Detener y borrar');
  ok(/class="field-error"/.test(admin) || /class="field-error /.test(admin), 'hay errores por campo en el formulario');
}

// ---------------------------------------------------------------------------
// 3. Accesibilidad, tema y ausencia de frameworks
// ---------------------------------------------------------------------------
{
  ok(/data-theme="dark"/.test(admin) && /prefers-reduced-motion/.test(admin), 'el panel mantiene tema claro/oscuro y movimiento reducido');
  ok(/:focus-visible/.test(admin), 'la sección conserva foco visible');
  ok(/min-height:\s*44px/.test(admin), 'los controles mantienen 44 px mínimos');
  ok(/lang="es"/.test(admin), 'el panel está en español');
  ok(!/<script[^>]+src=/.test(admin), 'admin.html no carga frameworks ni scripts externos');
  for (const fw of ['react', 'vue', 'angular', 'jquery', 'bootstrap']) {
    ok(!new RegExp(`<script[^>]+${fw}`, 'i').test(admin), `admin.html no incluye ${fw}`);
  }
}

// ---------------------------------------------------------------------------
// 3.b Referencias de jugador, descripciones y etiqueta de daño recibido
// ---------------------------------------------------------------------------
{
  for (const hint of [
    'Jugador normal: 10 de vida.',
    'Jugador normal: 6 a jugadores (2 golpes) · 2 a criaturas.',
    'Jugador normal: 4.6.',
    'Jugador normal: 4.8.',
  ]) {
    ok(admin.includes(hint), `el formulario muestra la referencia “${hint}”`);
  }
  ok((admin.match(/class="field-hint"/g) || []).length >= 4, 'las referencias usan el estilo discreto field-hint');
  ok(/\.field-hint\s*\{[^}]*color:\s*var\(--dim\)/.test(admin),
    'field-hint usa el color secundario del tema (legible en claro y oscuro)');
  ok(/id="botBehaviorHelp"/.test(admin) && /aria-describedby="botBehaviorHelp"/.test(admin),
    'el select de comportamiento describe la opción elegida');
  ok(/BEHAVIOR_LABELS\s*=\s*\{[^}]*guardian:\s*'Guardián'[^}]*neutral:\s*'Neutral'/.test(admin),
    'BEHAVIOR_LABELS incluye Guardián y Neutral');
  ok(/BEHAVIOR_HELP\s*=\s*\{[\s\S]*guardian:[\s\S]*neutral:/.test(admin) ||
    /BEHAVIOR_HELP\s*=\s*\{[\s\S]*neutral:[\s\S]*guardian:/.test(admin),
    'el panel define ayuda por comportamiento');
  ok(/updateBehaviorHelp/.test(admin), 'la ayuda del comportamiento cambia con la selección');
  ok(/Recibe daño \(jugadores y criaturas\)/.test(admin),
    'la casilla de daño recibido aclara que incluye criaturas');
}

// ---------------------------------------------------------------------------
// 3.c Permisos implícitos del admin en la tabla de usuarios
// ---------------------------------------------------------------------------
{
  const i = admin.indexOf("const perms = cell('Permisos')");
  const block = i < 0 ? '' : admin.slice(i, admin.indexOf('tr.append(perms)', i));
  ok(!!block, 'la tabla de usuarios tiene el bloque de permisos');
  ok(/u\.role === 'admin'/.test(block), 'el bloque de permisos distingue al rol admin');
  ok(/Administrador/.test(block), 'un admin muestra la etiqueta Administrador');
  ok(/Poderes implícitos/.test(block), 'la etiqueta del admin aclara que sus poderes son implícitos');
  ok(/if\s*\(!any\s*&&\s*u\.role !== 'admin'\)/.test(block),
    '“Sin permisos” queda reservado a los usuarios sin poderes implícitos');
}

// ---------------------------------------------------------------------------
// 4. index.html: barra por maxHp y golpe inmune
// ---------------------------------------------------------------------------
{
  const bar = (html.match(/function drawBar\(a\)\{[\s\S]*?\n\}/) || [''])[0];
  ok(/a\.maxHp\s*\|\|\s*10/.test(bar), 'drawBar usa a.maxHp || 10');
  const add = (html.match(/function addRemote\(p\)\{[\s\S]*?\n\}/) || [''])[0];
  ok(/maxHp/.test(add) && /Number\.isFinite\(p\.maxHp\)/.test(add), 'addRemote guarda maxHp con fallback');
  const pm = html.slice(html.indexOf("if(m.t==='pm')"), html.indexOf("else if(m.t==='pedit')"));
  ok(/m\.maxHp/.test(pm) && /drawBar\(a\)/.test(pm), 'el handler pm actualiza maxHp y redibuja');
  const hitok = html.slice(html.indexOf("else if(m.t==='hitok')"), html.indexOf("else if(m.t==='zs')"));
  ok(/m\.dmg\s*>\s*0/.test(hitok), 'hitok solo dibuja el número de daño cuando m.dmg > 0');
  ok(/maxHp/.test(html), 'index.html conoce el campo aditivo maxHp');
}

// ---------------------------------------------------------------------------
// 5. Retiro del bot externo
// ---------------------------------------------------------------------------
{
  ok(!/minicraft-bot/.test(compose), 'docker-compose.yml ya no tiene el servicio minicraft-bot');
  ok(!/BOT_TOKEN/.test(compose), 'docker-compose.yml ya no pasa BOT_TOKEN');
  ok(!/EASYPANEL_BOT_WEBHOOK/.test(deploy), 'deploy.yml ya no redeploya el bot');
  ok(!/easypanel_bot_webhook/.test(deploy), 'deploy.yml ya no usa el archivo temporal del bot');
  ok(!/Authorization/i.test(wsAuth), 'ws-auth.js ya no acepta Authorization/Bearer');
  ok(/Bearer/.test(read('openspec/specs/net/session/spec.md')),
    'la spec viva documenta el rechazo de Bearer (sanidad del test)');
  ok(!/botToken/.test(envConfig), 'env-config.js ya no exporta botToken');
  ok(!fs.existsSync(path.join(root, 'Dockerfile.bot')), 'Dockerfile.bot fue eliminado');
  ok(!fs.existsSync(path.join(root, 'bot')), 'el directorio bot/ fue eliminado');
  ok(!fs.existsSync(path.join(root, 'server', 'test', 'bot-cazador.mjs')), 'bot-cazador.mjs fue eliminado');

  for (const [name, src] of [['README.md', readme], ['server/README.md', serverReadme], ['AGENTS.md', agents]]) {
    ok(/minicraft-bot/.test(src), `${name} documenta la App minicraft-bot de Easypanel`);
    ok(/Easypanel/i.test(src), `${name} explica el paso operativo en Easypanel`);
    ok(/BOT_TOKEN/.test(src), `${name} documenta el retiro de BOT_TOKEN`);
  }
  ok(/\/admin/.test(readme) && /Bots/i.test(readme), 'README.md documenta el panel de bots');
  ok(/Preset cazador clásico/.test(readme), 'README.md menciona el preset del cazador');
  ok(/5/.test(readme) && /activos/i.test(readme), 'README.md documenta el límite de 5 activos');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 estáticos de bots (panel, cliente y retiro) OK');
