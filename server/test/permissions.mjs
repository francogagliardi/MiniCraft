// Tests unitarios del modelo de permisos por usuario (sin DB, sin red).
// Uso: node test/permissions.mjs
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const P = require('../permissions.js');

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keys = (o) => Object.keys(o).sort();

// ---- allowlist ----
ok(same(P.PERMISSIONS, ['bot_ignore', 'fly', 'instant_break']),
  'PERMISSIONS declara exactamente las tres claves permitidas');

// ---- normalización feliz ----
{
  const r = P.normalizePermissions({ bot_ignore: true, fly: false, instant_break: true });
  ok(r.ok === true, 'normalizePermissions acepta el mapa completo');
  ok(same(r.value, { bot_ignore: true, instant_break: true }),
    'normalizePermissions guarda solo las claves true (canónico)');
}
{
  const r = P.normalizePermissions({});
  ok(r.ok === true && same(r.value, {}), '{} es válido y canónico (sin permisos)');
}
{
  const r = P.normalizePermissions({ fly: true, instant_break: false });
  ok(r.ok === true && same(r.value, { fly: true }), 'false se omite del mapa guardado');
}

// ---- entradas inválidas ----
{
  const r = P.normalizePermissions({ god_mode: true });
  ok(r.ok === false && r.invalid.includes('god_mode'), 'clave desconocida → invalid incluye la clave');
  ok(!r.value || !('god_mode' in r.value), 'la clave desconocida no se persiste');
}
for (const [label, value] of [['"si"', 'si'], ['1', 1], ['null', null]]) {
  const r = P.normalizePermissions({ fly: value });
  ok(r.ok === false && r.nonBoolean.includes('fly'), `valor no booleano (${label}) → nonBoolean incluye fly`);
}
{
  const r = P.normalizePermissions({ fly: 'si', god_mode: true });
  ok(r.ok === false && r.invalid.includes('god_mode') && r.nonBoolean.includes('fly'),
    'un pedido mixto reporta claves inválidas y valores no booleanos');
}
for (const [label, value] of [['array', []], ['null', null], ['string', 'fly'], ['número', 3]]) {
  const r = P.normalizePermissions(value);
  ok(r.ok === false, `permissions como ${label} se rechaza (no es objeto plano)`);
}
{
  const r = P.normalizePermissions(undefined);
  ok(r.ok === false, 'permissions undefined se rechaza en la API de escritura');
}

// ---- materialización tolerante ----
{
  const m = P.materializePermissions({ fly: true });
  ok(same(keys(m), ['bot_ignore', 'fly', 'instant_break']), 'materializePermissions devuelve las tres claves');
  ok(m.fly === true && m.bot_ignore === false && m.instant_break === false,
    'las claves ausentes se materializan en false');
}
{
  const m = P.materializePermissions({ god_mode: true, fly: true });
  ok(!('god_mode' in m) && m.fly === true, 'la lectura descarta claves desconocidas (tolerante)');
}
for (const [label, value] of [['undefined', undefined], ['null', null], ['string', '{"fly":true}'], ['array', []]]) {
  const m = P.materializePermissions(value);
  ok(m && m.fly === false && m.bot_ignore === false && m.instant_break === false,
    `materializePermissions(${label}) devuelve las tres claves en false`);
}

// ---- permisos efectivos ----
{
  const user = { role: 'user', permissions: { fly: true } };
  ok(P.canFly(user) === true, 'canFly: true por permiso');
  ok(P.canInstantBreak(user) === false, 'canInstantBreak: false sin el permiso');
  ok(P.botIgnores(user) === false, 'botIgnores: false sin bot_ignore');
}
{
  const admin = { role: 'admin', permissions: {} };
  ok(P.canFly(admin) === true, 'canFly: el rol admin implica vuelo con el mapa vacío');
  ok(P.canInstantBreak(admin) === true, 'canInstantBreak: el rol admin implica rotura instantánea');
  ok(P.botIgnores(admin) === false, 'botIgnores: el rol admin NO implica bot_ignore');
}
{
  ok(P.canFly({ role: 'user', permissions: { fly: false } }) === false, 'canFly: false explícito no habilita');
  ok(P.canFly(null) === false, 'canFly: sin usuario es false');
  ok(P.canInstantBreak(undefined) === false, 'canInstantBreak: sin usuario es false');
}
{
  ok(P.botIgnores({ role: 'user', permissions: { bot_ignore: true } }) === true,
    'botIgnores: true solo con bot_ignore true');
}

// ---- proyección de administración ----
{
  const created = new Date('2026-11-12T18:00:00.000Z');
  const row = {
    id: 7, username: 'ana', passwordHash: 'scrypt$16384$8$1$AA$BB',
    role: 'user', skin: 'small', active: true,
    permissions: { bot_ignore: true }, createdAt: created, updatedAt: created,
  };
  const view = P.adminUserView(row);
  ok(view.id === 7 && view.username === 'ana' && view.role === 'user' && view.skin === 'small' && view.active === true,
    'adminUserView conserva identidad, rol, skin y estado');
  ok(!('passwordHash' in view) && !('password_hash' in view), 'adminUserView nunca expone el hash');
  ok(same(view.permissions, { bot_ignore: true, fly: false, instant_break: false }),
    'adminUserView materializa las tres claves de permisos');
  ok(view.createdAt === created && view.updatedAt === created, 'adminUserView conserva las fechas');
  ok(P.adminUserView(null) === null, 'adminUserView(null) es null');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 modelo de permisos (allowlist, materialización y efectivos) OK');
