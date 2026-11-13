// Tests del retiro de ADMIN_KEY/ADMIN_KEY_HASH y del bootstrap del admin.
// Uso: node test/admin-retirement.mjs  (sin DB: MemoryStore)
import { createRequire } from 'module';
import { startApp, connect, nextMessage } from './support/app-fixture.mjs';

const require = createRequire(import.meta.url);
const B = require('../admin-bootstrap.js');
const { MemoryStore } = await import('./support/memory-store.mjs');

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

// ---- warning legacy, una sola vez y sin valor ----
{
  const seen = [];
  const warn = (...a) => seen.push(a.join(' '));
  B.resetLegacyWarning();
  ok(B.warnLegacyAdmin({ ADMIN_KEY: 'super-secreta-123' }, warn) === true, 'ADMIN_KEY dispara el aviso de migración');
  B.warnLegacyAdmin({ ADMIN_KEY: 'super-secreta-123' }, warn);
  ok(seen.length === 1, 'el aviso se registra una sola vez por proceso');
  ok(seen[0].includes('ADMIN_KEY') && !seen[0].includes('super-secreta-123'), 'el aviso nombra la variable pero no su valor');
  const seen2 = [];
  B.resetLegacyWarning();
  ok(B.warnLegacyAdmin({ ADMIN_KEY_HASH: 'pbkdf2_sha256$1$AA$BB' }, (...a) => seen2.push(a.join(' '))) === true,
    'ADMIN_KEY_HASH también dispara el aviso');
  ok(!seen2[0].includes('pbkdf2'), 'el hash legacy no se loguea');
  const seen3 = [];
  B.resetLegacyWarning();
  ok(B.warnLegacyAdmin({}, (...a) => seen3.push(a.join(' '))) === false, 'sin variables legacy no hay aviso');
  ok(seen3.length === 0, 'no se escribe nada sin variables legacy');
}

// ---- warning de BOT_TOKEN retirado, una sola vez y sin valor ----
{
  const seen = [];
  B.resetLegacyBotToken();
  ok(typeof B.warnLegacyBotToken === 'function', 'existe el aviso de BOT_TOKEN legado');
  if (typeof B.warnLegacyBotToken === 'function') {
    ok(B.warnLegacyBotToken({ BOT_TOKEN: 'bot-secreto-999' }, (...a) => seen.push(a.join(' '))) === true,
      'BOT_TOKEN dispara el aviso de retiro');
    B.warnLegacyBotToken({ BOT_TOKEN: 'bot-secreto-999' }, (...a) => seen.push(a.join(' ')));
    ok(seen.length === 1, 'el aviso de BOT_TOKEN se registra una sola vez por proceso');
    ok(seen[0] && seen[0].includes('BOT_TOKEN') && !seen[0].includes('bot-secreto-999'),
      'el aviso nombra BOT_TOKEN sin loguear su valor');
    ok(/\/admin/.test(seen[0] || ''), 'el aviso indica que los bots se administran en /admin');
    const none = [];
    B.resetLegacyBotToken();
    ok(B.warnLegacyBotToken({}, (...a) => none.push(a.join(' '))) === false, 'sin BOT_TOKEN no hay aviso');
    ok(none.length === 0, 'no se escribe nada sin BOT_TOKEN');
  }
}

// ---- bootstrap del admin ----
{
  const store = new MemoryStore();
  const logs = [];
  const warns = [];
  B.resetLegacyWarning();
  const created = await B.bootstrapAdmin({
    store, env: { ADMIN_USERNAME: 'jefe', ADMIN_PASSWORD: 'admin-12345' },
    log: (...a) => logs.push(a.join(' ')), warn: (...a) => warns.push(a.join(' ')),
  });
  ok(created === true, 'primer arranque crea el admin');
  const u = await store.getUserByUsername('jefe');
  ok(u && u.role === 'admin' && u.skin === 'human' && u.active === true, 'el admin queda role=admin, skin=human y activo');
  ok(!logs.concat(warns).some(l => l.includes('admin-12345')), 'el bootstrap no loguea la contraseña');

  const before = u.passwordHash;
  const created2 = await B.bootstrapAdmin({
    store, env: { ADMIN_USERNAME: 'jefe', ADMIN_PASSWORD: 'otra-clave-999' },
    log: (...a) => logs.push(a.join(' ')), warn: (...a) => warns.push(a.join(' ')),
  });
  const after = await store.getUserByUsername('jefe');
  ok(created2 === false && after.passwordHash === before, 'un reinicio no sobrescribe la contraseña');
}
{
  const store = new MemoryStore();
  const warns = [];
  const created = await B.bootstrapAdmin({ store, env: {}, log: () => {}, warn: (...a) => warns.push(a.join(' ')) });
  ok(created === false && (await store.getUserByUsername('admin')) === null, 'sin ADMIN_PASSWORD no se crea admin');
  ok(warns.some(w => /ADMIN_PASSWORD/.test(w)), 'sin contraseña avisa y no expone secretos');
  const short = await B.bootstrapAdmin({ store, env: { ADMIN_PASSWORD: 'corta' }, log: () => {}, warn: (...a) => warns.push(a.join(' ')) });
  ok(short === false && (await store.getUserByUsername('admin')) === null, 'una contraseña corta tampoco crea admin');
}

// ---- el hello con clave no otorga admin, aunque ADMIN_KEY esté presente ----
{
  const FIX = await startApp({
    users: [{ username: 'ana', password: 'correcta-123', role: 'user' }],
    env: { ADMIN_KEY: 'clave-vieja' },
  });
  try {
    const cookie = await FIX.login('ana', 'correcta-123');
    const ws = await connect(FIX.wsUrl(), { headers: { Cookie: cookie } });
    ws.ws.send(JSON.stringify({ t: 'hello', name: 'ana', mode: 'admin', key: 'clave-vieja' }));
    const w = await nextMessage(ws.ws, 'welcome');
    ok(w.admin === false, 'hello con mode admin y clave legacy no otorga admin');
    ws.ws.close();
  } finally { await FIX.close(); }
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 retiro de ADMIN_KEY* y bootstrap del admin OK');
