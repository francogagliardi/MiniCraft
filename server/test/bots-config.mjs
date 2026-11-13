// Tests unitarios de la configuración de bots (change panel-bots-custom,
// capability bots/management): rangos, pasos, nombre, allowlists, defaults,
// preset clásico y códigos de error por campo.
// Uso: node test/bots-config.mjs
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const C = require('../bot-config.js');

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

const hasErr = (out, field, code) =>
  !out.ok && Array.isArray(out.errors) && out.errors.some(e => e.field === field && e.code === code);

const base = (extra = {}) => ({ name: 'OPSX-bot', behavior: 'cazador', ...extra });

// ---- 1. constantes y catálogos ----
{
  ok(C.BOT_LIMITS && C.BOT_LIMITS.maxActive === 5, 'BOT_LIMITS.maxActive === 5');
  ok(JSON.stringify(C.BOT_LIMITS.hp) === '[1,100]', 'hp va de 1 a 100');
  ok(JSON.stringify(C.BOT_LIMITS.damage) === '[0,20]', 'damage va de 0 a 20');
  ok(JSON.stringify(C.BOT_LIMITS.reach) === '[1,10]', 'reach va de 1 a 10');
  ok(JSON.stringify(C.BOT_LIMITS.speed) === '[1,30]', 'speed va de 1 a 30');

  ok(C.BOT_NAME_RE instanceof RegExp && C.BOT_NAME_RE.test('OPSX-bot'), 'BOT_NAME_RE acepta OPSX-bot');
  ok(!C.BOT_NAME_RE.test('ab') && !C.BOT_NAME_RE.test('a'.repeat(17)), 'BOT_NAME_RE rechaza 2 y 17 caracteres');
  ok(!C.BOT_NAME_RE.test('bot con espacio') && !C.BOT_NAME_RE.test('bot!'), 'BOT_NAME_RE rechaza caracteres inválidos');

  const skins = C.BOT_SKINS;
  ok(Array.isArray(skins) && skins.includes('robot'), 'el catálogo de skins incluye robot');
  ok(['human', 'fat', 'giant', 'small', 'zombie', 'mujer', 'moreno', 'gojo'].every(s => skins.includes(s)),
    'el catálogo de skins es el de jugador (sin valores inventados)');
  ok(!skins.includes('dragon') && !skins.includes('guardian'), 'el catálogo no inventa valores');

  const d = C.BOT_DEFAULTS;
  ok(d.cazador.skin === 'robot' && d.cazador.hp === 10 && d.cazador.damage === 6 &&
    d.cazador.reach === 4.6 && d.cazador.speed === 28.8 && d.cazador.flying === true &&
    d.cazador.takesDamage === false, 'defaults de cazador: robot/10/6/4.6/28.8/vuela/no recibe daño');
  ok(d.merodeador.skin === 'human' && d.merodeador.hp === 10 && d.merodeador.damage === 0 &&
    d.merodeador.reach === 1 && d.merodeador.speed === 6 && d.merodeador.flying === false &&
    d.merodeador.takesDamage === false, 'defaults de merodeador: human/10/0/1/6/camina/no recibe daño');
  for (const id of ['guardian', 'neutral']) {
    const def = d[id];
    ok(!!def && typeof def.skin === 'string' && Number.isInteger(def.hp) && Number.isInteger(def.damage) &&
      typeof def.reach === 'number' && typeof def.speed === 'number' &&
      typeof def.flying === 'boolean' && typeof def.takesDamage === 'boolean',
      `defaults de ${id}: ficha completa y válida`);
  }
  ok((d.guardian || {}).takesDamage === true && (d.neutral || {}).takesDamage === true,
    'guardián y neutral nacen recibiendo daño (pueden morir y retaliar)');
  ok(JSON.stringify(C.BEHAVIOR_IDS) === JSON.stringify(['cazador', 'merodeador', 'guardian', 'neutral']),
    'BEHAVIOR_IDS incluye los cuatro comportamientos');

  const p = C.CLASSIC_HUNTER_PRESET;
  ok(p.behavior === 'cazador' && p.skin === 'robot' && p.hp === 10 && p.damage === 6 &&
    p.reach === 4.6 && p.speed === 28.8 && p.flying === true && p.takesDamage === false,
    'CLASSIC_HUNTER_PRESET conserva la configuración histórica (28.8 u/s)');
  ok(p.speed <= C.BOT_LIMITS.speed[1], 'la velocidad del preset (28.8) entra en el máximo de 30');
}

// ---- 2. alta válida y defaults ----
{
  const out = C.normalizeBotInput(base());
  ok(out.ok === true, 'alta mínima (nombre + comportamiento) es válida');
  ok(out.value.behavior === 'cazador' && out.value.skin === 'robot' && out.value.hp === 10 &&
    out.value.damage === 6 && out.value.reach === 4.6 && out.value.speed === 28.8 &&
    out.value.flying === true && out.value.takesDamage === false,
    'el alta aplica los defaults del comportamiento');

  const named = C.normalizeBotInput({ name: 'Camina-1', behavior: 'merodeador' });
  ok(named.ok && named.value.skin === 'human' && named.value.speed === 6 && named.value.flying === false,
    'merodeador arranca caminando y pacífico por default');

  const edges = C.normalizeBotInput(base({ hp: 1, damage: 0, reach: 1, speed: 1, flying: false, takesDamage: true }));
  ok(edges.ok && edges.value.hp === 1 && edges.value.damage === 0 && edges.value.reach === 1 &&
    edges.value.speed === 1 && edges.value.flying === false && edges.value.takesDamage === true,
    'los bordes inferiores (hp 1, damage 0, reach 1, speed 1) se aceptan');
  const top = C.normalizeBotInput(base({ hp: 100, damage: 20, reach: 10, speed: 30 }));
  ok(top.ok && top.value.hp === 100 && top.value.damage === 20 && top.value.reach === 10 && top.value.speed === 30,
    'los bordes superiores (hp 100, damage 20, reach 10, speed 30) se aceptan');
  const tenth = C.normalizeBotInput(base({ reach: 7.5, speed: 9.6 }));
  ok(tenth.ok && tenth.value.reach === 7.5 && tenth.value.speed === 9.6, 'reach/speed aceptan paso 0.1 (7.5 y 9.6)');

  const snake = C.normalizeBotInput(base({ takes_damage: true, flying: false }));
  ok(snake.ok && snake.value.takesDamage === true && snake.value.flying === false,
    'acepta takes_damage (snake_case) como alias de takesDamage');
}

// ---- 3. nombre ----
{
  ok(hasErr(C.normalizeBotInput(base({ name: 'ab' })), 'name', 'invalid_bot_name'), 'nombre de 2 → invalid_bot_name');
  ok(hasErr(C.normalizeBotInput(base({ name: 'a'.repeat(17) })), 'name', 'invalid_bot_name'), 'nombre de 17 → invalid_bot_name');
  ok(hasErr(C.normalizeBotInput(base({ name: 'bot con espacio' })), 'name', 'invalid_bot_name'), 'carácter inválido → invalid_bot_name');
  ok(hasErr(C.normalizeBotInput(base({ name: 42 })), 'name', 'invalid_bot_name'), 'nombre no string → invalid_bot_name');
  ok(C.normalizeBotInput(base({ name: 'ab_' })).ok, 'nombre de 3 se acepta');
}

// ---- 4. comportamiento y skin ----
{
  ok(hasErr(C.normalizeBotInput(base({ behavior: 'fantasma' })), 'behavior', 'invalid_behavior'),
    'behavior fantasma → invalid_behavior');
  ok(hasErr(C.normalizeBotInput(base({ behavior: '' })), 'behavior', 'invalid_behavior'), 'behavior vacío → invalid_behavior');
  for (const id of ['guardian', 'neutral']) {
    const out = C.normalizeBotInput(base({ behavior: id }));
    ok(out.ok && out.value.behavior === id, `behavior ${id} se acepta y aplica sus defaults`);
  }
  ok(hasErr(C.normalizeBotInput(base({ skin: 'dragon' })), 'skin', 'invalid_skin'), 'skin dragon → invalid_skin');
  ok(hasErr(C.normalizeBotInput(base({ skin: 'guardian' })), 'skin', 'invalid_skin'), 'skin inventado → invalid_skin');
  ok(C.normalizeBotInput(base({ skin: 'giant' })).value.skin === 'giant', 'skin giant se acepta');
  ok(C.normalizeBotInput(base({ skin: 'robot' })).value.skin === 'robot', 'skin robot se acepta');
}

// ---- 5. rangos y precisión ----
{
  for (const [field, code, values] of [
    ['hp', 'invalid_hp', [0, 101, 1.5, '10', null]],
    ['damage', 'invalid_damage', [-1, 21, 2.5, '6']],
    ['reach', 'invalid_reach', [0.5, 10.5, 4.65, '4.6']],
    ['speed', 'invalid_speed', [0, 31, 7.25, '20']],
  ]) {
    for (const v of values) {
      ok(hasErr(C.normalizeBotInput(base({ [field]: v })), field, code),
        `${field}:${JSON.stringify(v)} → 422 ${code}`);
    }
  }
}

// ---- 6. flags booleanos estrictos ----
{
  ok(hasErr(C.normalizeBotInput(base({ flying: 'si' })), 'flying', 'invalid_flag'), 'flying:"si" → invalid_flag');
  ok(hasErr(C.normalizeBotInput(base({ takesDamage: 1 })), 'takesDamage', 'invalid_flag'), 'takesDamage:1 → invalid_flag');
  ok(hasErr(C.normalizeBotInput(base({ takes_damage: 'no' })), 'takesDamage', 'invalid_flag'), 'takes_damage:"no" → invalid_flag');
}

// ---- 7. campos desconocidos y estado ----
{
  ok(hasErr(C.normalizeBotInput(base({ foo: 1 })), 'foo', 'invalid_field'), 'campo desconocido → invalid_field');
  ok(hasErr(C.normalizeBotInput(base({ active: true })), 'active', 'invalid_field'),
    'active en el body → invalid_field (solo start/stop)');
  const many = C.normalizeBotInput(base({ hp: 0, skin: 'dragon' }));
  ok(many.ok === false && many.errors.length >= 2, 'varios errores se informan juntos');
  ok(many.errors.some(e => e.field === 'hp') && many.errors.some(e => e.field === 'skin'),
    'el detalle identifica ambos campos inválidos');
}

// ---- 8. edición parcial ----
{
  const part = C.normalizeBotInput({ damage: 4, speed: 12.5 }, { partial: true });
  ok(part.ok && part.value.damage === 4 && part.value.speed === 12.5 && !('name' in part.value) &&
    !('hp' in part.value), 'partial solo devuelve los campos enviados');
  ok(hasErr(C.normalizeBotInput({ hp: 0 }, { partial: true }), 'hp', 'invalid_hp'),
    'partial valida igual los rangos');
  ok(hasErr(C.normalizeBotInput({ active: true }, { partial: true }), 'active', 'invalid_field'),
    'partial rechaza active');
  ok(C.normalizeBotInput({}, { partial: true }).ok, 'partial con {} no es un error de validación (lo decide el router)');
}

// ---- 9. proyección pública ----
{
  const row = {
    id: 3, name: 'OPSX-bot', behavior: 'cazador', skin: 'robot',
    hp: 10, damage: 6, reach: 4.6, speed: 28.8, takesDamage: false, flying: true, active: true,
    createdBy: 1, createdAt: '2026-11-12T00:00:00.000Z', updatedAt: '2026-11-12T00:00:00.000Z',
  };
  const view = C.botView(row, { online: true, hp: 7, pos: [1.5, 30, 2.5] });
  const fields = ['id', 'name', 'behavior', 'skin', 'hp', 'damage', 'reach', 'speed', 'takesDamage',
    'flying', 'active', 'runtime', 'createdAt', 'updatedAt'];
  ok(fields.every(f => f in view), 'BotView incluye todos los campos del contrato');
  ok(view.runtime && view.runtime.online === true && view.runtime.hp === 7 &&
    Array.isArray(view.runtime.pos), 'BotView incluye runtime cuando el bot está en línea');
  ok(!('createdBy' in view), 'BotView no expone createdBy');
  const off = C.botView({ ...row, active: false }, null);
  ok(off.runtime === null, 'un bot detenido tiene runtime nulo');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 configuración de bots (rangos, defaults y preset) OK');
