// Integración REAL con PostgreSQL para el CRUD admin: migración 002, JSONB,
// auditoría, cascada y guardas con advisory lock.
// Corre solo si TEST_DATABASE_URL está definida; REQUIRE_DB_TESTS=1 obliga.
// Uso: node test/admin-db.mjs
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { startApp } from './support/app-fixture.mjs';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};
const json = (res) => res.json().catch(() => null);

const URL_DB = process.env.TEST_DATABASE_URL;
if (!URL_DB) {
  if (process.env.REQUIRE_DB_TESTS === '1') {
    console.log('❌ REQUIRE_DB_TESTS=1 pero falta TEST_DATABASE_URL');
    process.exit(1);
  }
  console.log('⏭  integración de DB admin omitida (definí TEST_DATABASE_URL para correrla)');
  process.exit(0);
}

const { createDb } = require('../db.js');
const { createPgStore } = require('../store-pg.js');
const { runMigrations } = require('../migrate.js');
const A = require('../auth.js');
const RACE_PASSWORD = 'admin-12345';

const db = createDb({ connectionString: URL_DB, max: 6 });
const store = createPgStore({ db });
const migrationsDir = path.join(dir, '..', 'migrations');

async function truncate() {
  await db.query('TRUNCATE admin_audit, sessions, users RESTART IDENTITY CASCADE');
}

try {
  // ---- 3.1 migración 002 idempotente ----
  await runMigrations(db, { dir: migrationsDir, log: () => {} });
  await runMigrations(db, { dir: migrationsDir, log: () => {} });
  {
    const v = await db.query("SELECT version FROM schema_migrations WHERE version = '002-admin-permissions.sql'");
    ok(v.rows.length === 1, '002-admin-permissions.sql se aplica una sola vez (idempotente)');
    const col = await db.query(`SELECT is_nullable, column_default
      FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'permissions'`);
    ok(col.rows.length === 1, 'users.permissions existe');
    ok(col.rows[0].is_nullable === 'NO', 'users.permissions es NOT NULL');
    ok(String(col.rows[0].column_default).includes("'{}'"), 'users.permissions tiene default {}');
    const audit = await db.query("SELECT to_regclass('public.admin_audit') AS t");
    ok(!!audit.rows[0].t, 'existe la tabla admin_audit');
    const idx = await db.query("SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_active_admin_idx'");
    ok(idx.rows.length === 1, 'existe el índice parcial users_active_admin_idx');
  }
  await truncate();

  // ---- 3.1 default, CHECK y roundtrip JSONB ----
  {
    const user = await store.createUser({ username: 'sin_perm', passwordHash: await A.hashPassword('clave-1234') });
    const raw = await db.query('SELECT permissions FROM users WHERE id = $1', [user.id]);
    ok(JSON.stringify(raw.rows[0].permissions) === '{}', 'una cuenta sin permisos guarda {} por default');
    ok(user.permissions && user.permissions.bot_ignore === false && user.permissions.fly === false,
      'el usuario devuelto materializa los tres permisos en false');
  }
  for (const [label, value] of [['array', '[]'], ['string', '"texto"'], ['número', '3']]) {
    let err = null;
    try {
      await db.query(`INSERT INTO users (username, password_hash, permissions) VALUES ($1, 'x', $2::jsonb)`,
        ['bad_' + label, value]);
    } catch (e) { err = e; }
    ok(!!err && err.code === '23514', `el CHECK rechaza permissions ${label} (no objeto)`);
  }
  {
    const user = await store.createUser({ username: 'con_perm', passwordHash: await A.hashPassword('clave-1234') });
    const updated = await store.updateAdminUser(user.id, { permissions: { bot_ignore: true } });
    ok(updated.permissions.bot_ignore === true && updated.permissions.fly === false,
      'updateAdminUser persiste y materializa los permisos');
    const raw = await db.query('SELECT permissions FROM users WHERE id = $1', [user.id]);
    ok(JSON.stringify(raw.rows[0].permissions) === JSON.stringify({ bot_ignore: true }),
      'la DB guarda solo las claves true (canónico)');
    const again = await store.getUserById(user.id);
    ok(again.permissions && again.permissions.bot_ignore === true, 'getUserById devuelve los permisos materializados');
  }

  // ---- 3.2 auditoría, borrado y cascada ----
  await truncate();
  {
    const adm = await store.createUser({ username: 'adm1', passwordHash: await A.hashPassword('clave-1234'), role: 'admin' });
    const victim = await store.createUser({ username: 'victima', passwordHash: await A.hashPassword('clave-1234') });
    const tok = A.createSessionToken();
    await store.createSession({ userId: victim.id, tokenHash: tok.tokenHash, expiresAt: new Date(Date.now() + 3600000) });

    const entry = await store.insertAudit({
      actorUserId: adm.id, targetUserId: victim.id, action: 'user.update',
      details: { changes: { skin: ['human', 'giant'] }, actorUsername: 'adm1', targetUsername: 'victima' },
    });
    ok(entry && entry.id, 'insertAudit devuelve la entrada creada');

    const deleted = await store.deleteUser(victim.id);
    ok(deleted === true, 'deleteUser borra la cuenta');
    ok((await store.getUserById(victim.id)) === null, 'la cuenta borrada ya no existe');
    const sessions = await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [victim.id]);
    ok(sessions.rows[0].n === 0, 'borrar la cuenta elimina sus sesiones por cascada');

    const row = await db.query('SELECT actor_user_id, target_user_id, details FROM admin_audit WHERE id = $1', [entry.id]);
    ok(row.rows.length === 1, 'la entrada de auditoría sobrevive al borrado');
    ok(row.rows[0].target_user_id === null, 'el target borrado queda en NULL (ON DELETE SET NULL)');
    ok(row.rows[0].actor_user_id === adm.id, 'el actor existente conserva su FK');
    ok(row.rows[0].details.targetUsername === 'victima', 'el snapshot del username sobrevive en details');

    const listed = await store.listAudit(10);
    const found = listed.find(e => e.id === entry.id);
    ok(found && found.target.id === null && found.target.username === 'victima',
      'listAudit devuelve target nulo con el username histórico');
    ok(found && found.actor.id === adm.id && found.actor.username === 'adm1',
      'listAudit resuelve el actor existente por join');
    ok(!JSON.stringify(listed).includes('password'), 'la auditoría no expone contraseñas');
  }

  // ---- 3.2 countActiveAdmins y listUsers ----
  await truncate();
  {
    const a1 = await store.createUser({ username: 'adm1', passwordHash: await A.hashPassword('clave-1234'), role: 'admin' });
    const a2 = await store.createUser({ username: 'adm2', passwordHash: await A.hashPassword('clave-1234'), role: 'admin' });
    await store.createUser({ username: 'adm3', passwordHash: await A.hashPassword('clave-1234'), role: 'admin', active: false });
    await store.createUser({ username: 'comun', passwordHash: await A.hashPassword('clave-1234'), permissions: { fly: true } });

    ok((await store.countActiveAdmins()) === 2, 'countActiveAdmins cuenta solo role=admin AND active');
    ok((await store.countActiveAdmins({ excludeId: a1.id })) === 1, 'countActiveAdmins respeta excludeId');
    await store.updateAdminUser(a2.id, { active: false });
    ok((await store.countActiveAdmins({ excludeId: a1.id })) === 0,
      'countActiveAdmins con un solo admin activo excluido da 0');

    const list = await store.listUsers();
    ok(list.every(u => 'permissions' in u), 'listUsers devuelve permissions en todas las filas');
    ok(list.every(u => !('password_hash' in u) && !('passwordHash' in u)), 'listUsers no devuelve password_hash');
    const comun = list.find(u => u.username === 'comun');
    ok(comun.permissions.fly === true && comun.permissions.bot_ignore === false,
      'listUsers materializa los permisos guardados');
  }

  // ---- 3.3 advisory lock serializa transacciones administrativas ----
  await truncate();
  {
    const a1 = await store.createUser({ username: 'ser1', passwordHash: await A.hashPassword('clave-1234'), role: 'admin' });
    await store.createUser({ username: 'ser2', passwordHash: await A.hashPassword('clave-1234'), role: 'admin' });
    const order = [];
    await Promise.all([
      store.withTransaction(async (tx) => {
        order.push('a-start');
        await tx.getUserById(a1.id);
        await new Promise(r => setTimeout(r, 40));
        order.push('a-end');
      }),
      store.withTransaction(async (tx) => {
        order.push('b-start');
        await tx.countActiveAdmins({});
        order.push('b-end');
      }),
    ]);
    const aEnd = order.indexOf('a-end');
    const bStart = order.indexOf('b-start');
    const aStart = order.indexOf('a-start');
    const bEnd = order.indexOf('b-end');
    ok((aEnd < bStart) || (bEnd < aStart),
      `las transacciones admin se serializan (${order.join(' → ')})`);
  }

  // ---- 3.3 carrera de guardas con dos admins (segunda sesión ya validada) ----
  await truncate();
  {
    const base = store;
    let enteredResolve;
    const entered = new Promise(r => { enteredResolve = r; });
    let releaseResolve;
    const release = new Promise(r => { releaseResolve = r; });
    let first = true;
    const gated = {
      ...base,
      async withTransaction(fn) {
        if (first) { first = false; enteredResolve(); await release; }
        return base.withTransaction(fn);
      },
    };
    const APP = await startApp({
      store: gated,
      users: [
        { username: 'race1', password: RACE_PASSWORD, role: 'admin' },
        { username: 'race2', password: RACE_PASSWORD, role: 'admin' },
      ],
    });
    try {
      const c1 = await APP.login('race1', RACE_PASSWORD);
      const c2 = await APP.login('race2', RACE_PASSWORD);
      const list = await json(await APP.request('/api/admin/users', { cookie: c1 }));
      const r1 = list.users.find(u => u.username === 'race1');
      const r2 = list.users.find(u => u.username === 'race2');

      const pending = APP.request(`/api/admin/users/${r2.id}`, {
        method: 'PATCH', cookie: c1, body: { role: 'user' },
      });
      await entered;
      const second = await APP.request(`/api/admin/users/${r1.id}`, {
        method: 'PATCH', cookie: c2, body: { role: 'user' },
      });
      ok(second.status === 200, 'carrera en PG: una degradación pasa');
      releaseResolve();
      const firstRes = await pending;
      const fb = await json(firstRes);
      ok(firstRes.status === 409 && fb.error === 'guard_last_admin',
        'carrera en PG: la otra recibe 409 guard_last_admin');
      const after = await json(await APP.request('/api/admin/users', { cookie: c2 }));
      const activeAdmins = after.users.filter(u => u.role === 'admin' && u.active);
      ok(activeAdmins.length === 1, 'carrera en PG: queda exactamente un admin activo');
    } finally {
      // APP.close() cierra el pool de la DB de este test.
      await APP.close();
    }
  }
} catch (e) {
  console.log('❌ excepción en la integración admin: ' + (e && e.stack || e));
  fails++;
} finally {
  try { await db.close(); } catch (e) {}
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 integración PostgreSQL admin (migración 002, JSONB, auditoría y guardas) OK');
