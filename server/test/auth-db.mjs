// Integración REAL con PostgreSQL (servidor/migraciones/store).
// Corre solo si TEST_DATABASE_URL está definida. En CI REQUIRE_DB_TESTS=1 hace
// que la ausencia de la URL sea un fallo (no se puede saltear en silencio).
// Uso: node test/auth-db.mjs
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

const URL_DB = process.env.TEST_DATABASE_URL;
if (!URL_DB) {
  if (process.env.REQUIRE_DB_TESTS === '1') {
    console.log('❌ REQUIRE_DB_TESTS=1 pero falta TEST_DATABASE_URL');
    process.exit(1);
  }
  console.log('⏭  integración de DB omitida (definí TEST_DATABASE_URL para correrla)');
  process.exit(0);
}

const { createDb } = require('../db.js');
const { createPgStore } = require('../store-pg.js');
const { runMigrations } = require('../migrate.js');
const A = require('../auth.js');
const B = require('../admin-bootstrap.js');

const db = createDb({ connectionString: URL_DB, max: 4 });
const store = createPgStore({ db });
const migrationsDir = path.join(dir, '..', 'migrations');

async function truncate() {
  await db.query('TRUNCATE sessions, users RESTART IDENTITY CASCADE');
}

try {
  // ---- migraciones idempotentes ----
  await runMigrations(db, { dir: migrationsDir, log: () => {} });
  await runMigrations(db, { dir: migrationsDir, log: () => {} });
  {
    const r = await db.query("SELECT version FROM schema_migrations WHERE version = '001-auth.sql'");
    ok(r.rows.length === 1, '001-auth.sql se aplica una sola vez (idempotente)');
    const t = await db.query("SELECT to_regclass('public.users') AS u, to_regclass('public.sessions') AS s");
    ok(!!t.rows[0].u && !!t.rows[0].s, 'existen las tablas users y sessions');
  }
  await truncate();

  // ---- usuarios ----
  const ph = await A.hashPassword('password-123');
  const ana = await store.createUser({ username: 'Ana_01', passwordHash: ph, role: 'user', skin: 'human' });
  ok(ana.id && ana.role === 'user' && ana.skin === 'human' && ana.active === true, 'createUser guarda la fila activa');
  const got = await store.getUserByUsername('ana_01');
  ok(got && got.id === ana.id, 'getUserByUsername es case-insensitive');
  let dup = null;
  try { await store.createUser({ username: 'ANA_01', passwordHash: ph }); } catch (e) { dup = e; }
  ok(dup && dup.code === 'USERNAME_TAKEN', 'username duplicado con otra capitalización → USERNAME_TAKEN');
  const count = await db.query('SELECT count(*)::int AS n FROM users');
  ok(count.rows[0].n === 1, 'no se creó una segunda cuenta');

  // ---- sesiones: solo se guarda el hash ----
  const tok = A.createSessionToken();
  const sess = await store.createSession({ userId: ana.id, tokenHash: tok.tokenHash, expiresAt: new Date(Date.now() + 3600000) });
  const raw = await db.query('SELECT token_hash FROM sessions WHERE id = $1', [sess.id]);
  ok(raw.rows[0].token_hash === tok.tokenHash && raw.rows[0].token_hash !== tok.token, 'sessions guarda el hash, nunca el token');
  {
    const found = await store.getSessionByTokenHash(tok.tokenHash);
    ok(found && found.user.username === 'Ana_01', 'getSessionByTokenHash devuelve sesión + usuario');
    ok(A.isSessionActive(found.session, found.user, Date.now()) === true, 'la sesión vigente es usable');
  }
  await store.revokeSession(tok.tokenHash);
  {
    const found = await store.getSessionByTokenHash(tok.tokenHash);
    ok(found.session.revokedAt && A.isSessionActive(found.session, found.user, Date.now()) === false,
      'una sesión revocada no autentica aunque no expire');
  }
  {
    const tok2 = A.createSessionToken();
    await store.createSession({ userId: ana.id, tokenHash: tok2.tokenHash, expiresAt: new Date(Date.now() - 1000) });
    const found = await store.getSessionByTokenHash(tok2.tokenHash);
    ok(A.isSessionActive(found.session, found.user, Date.now()) === false, 'una sesión expirada no autentica');
  }

  // ---- registro público transaccional ----
  await truncate();
  {
    const reg = await store.registerUser({
      username: 'nuevo_1', passwordHash: await A.hashPassword('password-123'),
      tokenHash: A.createSessionToken().tokenHash, expiresAt: new Date(Date.now() + 3600000),
    });
    ok(reg.user.role === 'user' && reg.user.skin === 'human' && reg.user.active === true, 'registerUser fuerza user/human/active');
    const s = await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [reg.user.id]);
    ok(s.rows[0].n === 1, 'registerUser crea la sesión en la misma transacción');
  }
  {
    // rollback: token_hash inválido viola el CHECK de longitud
    const before = await db.query('SELECT count(*)::int AS n FROM users');
    let failed = null;
    try {
      await store.registerUser({
        username: 'rollback_1', passwordHash: await A.hashPassword('password-123'),
        tokenHash: 'corto', expiresAt: new Date(Date.now() + 3600000),
      });
    } catch (e) { failed = e; }
    const after = await db.query('SELECT count(*)::int AS n FROM users');
    ok(!!failed, 'si falla la sesión, registerUser falla');
    ok(after.rows[0].n === before.rows[0].n, 'el rollback no deja la cuenta creada sin sesión');
    const u = await store.getUserByUsername('rollback_1');
    ok(u === null, 'no queda fila parcial del usuario');
  }
  {
    // carrera de usernames
    const hash = await A.hashPassword('password-123');
    const results = await Promise.allSettled([
      store.registerUser({ username: 'race_1', passwordHash: hash, tokenHash: A.createSessionToken().tokenHash, expiresAt: new Date(Date.now() + 3600000) }),
      store.registerUser({ username: 'RACE_1', passwordHash: hash, tokenHash: A.createSessionToken().tokenHash, expiresAt: new Date(Date.now() + 3600000) }),
    ]);
    const okCount = results.filter(r => r.status === 'fulfilled').length;
    const dupCount = results.filter(r => r.status === 'rejected' && r.reason.code === 'USERNAME_TAKEN').length;
    ok(okCount === 1 && dupCount === 1, 'carrera de registro: una alta y un 409 (USERNAME_TAKEN)');
  }

  // ---- bootstrap admin ----
  await truncate();
  {
    B.resetLegacyWarning();
    const created = await B.bootstrapAdmin({ store, env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin-12345' }, log: () => {}, warn: () => {} });
    const u = await store.getUserByUsername('admin');
    ok(created === true && u.role === 'admin', 'el bootstrap crea el admin');
    const before = u.passwordHash;
    const again = await B.bootstrapAdmin({ store, env: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'otra-clave-1' }, log: () => {}, warn: () => {} });
    const after = await store.getUserByUsername('admin');
    ok(again === false && after.passwordHash === before, 'el reinicio no rota la contraseña del admin');
  }

  // ---- rotación/desactivación revocan sesiones ----
  {
    const u = await store.getUserByUsername('admin');
    for (let i = 0; i < 2; i++) {
      await store.createSession({ userId: u.id, tokenHash: A.createSessionToken().tokenHash, expiresAt: new Date(Date.now() + 3600000) });
    }
    const revoked = await store.revokeUserSessions(u.id);
    ok(revoked >= 2, 'revokeUserSessions revoca todas las sesiones de la cuenta');
    const live = await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL', [u.id]);
    ok(live.rows[0].n === 0, 'no queda ninguna sesión viva tras revocar');
    await store.setUserPassword(u.id, await A.hashPassword('nueva-clave-123'));
    const still = await store.getUserByUsername('admin');
    ok(await A.verifyPassword('nueva-clave-123', still.passwordHash), 'setUserPassword guarda el hash nuevo');
    await store.setUserActive(u.id, false);
    const off = await store.getUserByUsername('admin');
    ok(off.active === false, 'setUserActive desactiva la cuenta');
  }

  // ---- CLI user-tool (crear/passwd) ----
  {
    const cli = path.join(dir, '..', 'user-tool.mjs');
    const run = (args, input) => spawnSync(process.execPath, [cli, ...args, '--url', URL_DB], { input, encoding: 'utf8' });
    const r = run(['create', 'cli_1', '--role', 'user'], 'password-123\n');
    ok(r.status === 0 && !r.stdout.includes('password-123'), 'user-tool create no imprime la contraseña');
    const u = await store.getUserByUsername('cli_1');
    ok(u && u.role === 'user' && await A.verifyPassword('password-123', u.passwordHash), 'user-tool crea una cuenta que puede loguearse');
    const r2 = run(['passwd', 'cli_1'], 'nueva-clave-123\n');
    ok(r2.status === 0, 'user-tool passwd termina bien');
    const u2 = await store.getUserByUsername('cli_1');
    ok(await A.verifyPassword('nueva-clave-123', u2.passwordHash), 'user-tool passwd cambia la contraseña');
    const r3 = run(['disable', 'cli_1'], '');
    ok(r3.status === 0 && (await store.getUserByUsername('cli_1')).active === false, 'user-tool disable desactiva la cuenta');
    const r4 = run(['list'], '');
    ok(r4.status === 0 && r4.stdout.includes('cli_1') && !r4.stdout.includes(u2.passwordHash), 'user-tool list no imprime hashes');
  }

  // ---- cleanup ----
  {
    const u = await store.getUserByUsername('admin');
    await store.createSession({ userId: u.id, tokenHash: A.createSessionToken().tokenHash, expiresAt: new Date(Date.now() - 60 * 24 * 3600 * 1000) });
    const n = await store.cleanupSessions(new Date(Date.now() - 30 * 24 * 3600 * 1000));
    ok(n >= 1, 'cleanupSessions borra sesiones viejas');
  }

  // ---- skin / list ----
  {
    const u0 = await store.getUserByUsername('admin');
    await store.updateUserSkin(u0.id, 'giant');
    const u = await store.getUserById(u0.id);
    ok(u.skin === 'giant', 'updateUserSkin persiste el aspecto');
    const list = await store.listUsers();
    ok(Array.isArray(list) && list.length >= 1 && !('passwordHash' in list[0]), 'listUsers lista cuentas sin hash');
  }
} catch (e) {
  console.log('❌ excepción en la integración: ' + (e && e.stack || e));
  fails++;
} finally {
  try { await store.close(); } catch (e) {}
  try { await db.close(); } catch (e) {}
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 integración PostgreSQL (migraciones, store, registro) OK');
