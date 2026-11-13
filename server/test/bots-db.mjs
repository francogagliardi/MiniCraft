// Integración REAL con PostgreSQL para bots: migración 003, CHECKs, unicidad
// lower(name), FK created_by, cupo con advisory lock y serialización numérica.
// Corre solo si TEST_DATABASE_URL está definida; REQUIRE_DB_TESTS=1 obliga.
// Uso: node test/bots-db.mjs
import { createRequire } from 'module';
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
  console.log('⏭  integración de DB de bots omitida (definí TEST_DATABASE_URL para correrla)');
  process.exit(0);
}

const { createDb } = require('../db.js');
const { createPgStore } = require('../store-pg.js');
const { runMigrations } = require('../migrate.js');
const A = require('../auth.js');

const db = createDb({ connectionString: URL_DB, max: 6 });
const store = createPgStore({ db });
const migrationsDir = path.join(dir, '..', 'migrations');

async function truncate() {
  await db.query('TRUNCATE bots, admin_audit, sessions, users RESTART IDENTITY CASCADE');
}
const row = (extra = {}) => ({
  name: 'OPSX-bot', behavior: 'cazador', skin: 'robot', hp: 10, damage: 6,
  reach: 4.6, speed: 28.8, takesDamage: false, flying: true, ...extra,
});

try {
  // ---- 5.1 migración 003 y 004 idempotentes ----
  await runMigrations(db, { dir: migrationsDir, log: () => {} });
  await runMigrations(db, { dir: migrationsDir, log: () => {} });
  {
    const v = await db.query("SELECT version FROM schema_migrations WHERE version = '003-bots.sql'");
    ok(v.rows.length === 1, '003-bots.sql se aplica una sola vez (idempotente)');
    const v4 = await db.query("SELECT version FROM schema_migrations WHERE version = '004-bot-behaviors.sql'");
    ok(v4.rows.length === 1, '004-bot-behaviors.sql se aplica una sola vez (idempotente)');
    const t = await db.query("SELECT to_regclass('public.bots') AS t");
    ok(!!t.rows[0].t, 'existe la tabla bots');
    const idx = await db.query("SELECT indexname FROM pg_indexes WHERE tablename = 'bots'");
    const names = idx.rows.map(r => r.indexname);
    ok(names.includes('bots_name_lower_key'), 'existe el índice único bots_name_lower_key');
    ok(names.includes('bots_active_idx'), 'existe el índice parcial de activos');
    const fk = await db.query(`SELECT confdeltype FROM pg_constraint
      WHERE conname = 'bots_created_by_fkey'`);
    ok(fk.rows.length === 1 && fk.rows[0].confdeltype === 'n', 'created_by tiene FK ON DELETE SET NULL');
    const check = await db.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conname = 'bots_behavior_allow'`);
    const def = check.rows[0] ? check.rows[0].def : '';
    ok(['cazador', 'merodeador', 'guardian', 'neutral'].every(b => def.includes(`'${b}'`)),
      'el CHECK de comportamiento acepta los cuatro comportamientos');
  }
  await truncate();

  // ---- 5.1 CHECKs ----
  {
    const cases = [
      ['hp', 0], ['hp', 101],
      ['damage', -1], ['damage', 21],
      ['reach', 0.5], ['reach', 10.5],
      ['speed', 0], ['speed', 31],
      ['behavior', 'fantasma'], ['skin', 'dragon'],
    ];
    for (const [field, value] of cases) {
      let err = null;
      try {
        await db.query(
          `INSERT INTO bots (name, behavior, skin, hp, damage, reach, speed)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['bad-' + field + '-' + String(value).replace('.', '_'), 'cazador', 'robot', 10, 6, 4.6, 28.8]
            .map((v, i) => (i === (['name', 'behavior', 'skin', 'hp', 'damage', 'reach', 'speed'].indexOf(field)) ? value : v)),
        );
      } catch (e) { err = e; }
      ok(!!err && err.code === '23514', `el CHECK rechaza ${field}=${JSON.stringify(value)}`);
    }
    for (const behavior of ['guardian', 'neutral']) {
      let err = null;
      try {
        await db.query(
          "INSERT INTO bots (name, behavior, skin) VALUES ($1, $2, 'robot')",
          ['ok-' + behavior, behavior],
        );
      } catch (e) { err = e; }
      ok(!err, `el CHECK acepta behavior='${behavior}' (migración 004)`);
    }
    let nameErr = null;
    try {
      await db.query("INSERT INTO bots (name, behavior, skin) VALUES ('ab', 'cazador', 'robot')");
    } catch (e) { nameErr = e; }
    ok(!!nameErr && nameErr.code === '23514', 'el CHECK rechaza un nombre de 2 caracteres');

    let shapeErr = null;
    try {
      await db.query("INSERT INTO bots (name, behavior, skin) VALUES ('mal nombre', 'cazador', 'robot')");
    } catch (e) { shapeErr = e; }
    ok(!!shapeErr && shapeErr.code === '23514', 'el CHECK rechaza caracteres inválidos');
    await truncate();
  }

  // ---- 5.1 unicidad lower(name) ----
  {
    const first = await store.createBot(row());
    ok(first && first.name === 'OPSX-bot', 'createBot devuelve la fila creada');
    ok(typeof first.id === 'number', 'mapBot normaliza el id BIGSERIAL a number (runtime/store/API)');
    let dup = null;
    try { await store.createBot(row({ name: 'opsx-BOT' })); } catch (e) { dup = e; }
    ok(!!dup && dup.code === 'BOT_NAME_TAKEN', 'el índice lower(name) rechaza duplicados case-insensitive');
    ok((await store.listBots()).length === 1, 'el duplicado no crea otra fila');
    await truncate();
  }

  // ---- 5.2 created_by y listado ----
  {
    const user = await store.createUser({ username: 'autor', passwordHash: await A.hashPassword('clave-1234'), role: 'admin' });
    const bot = await store.createBot(row({ createdBy: user.id }));
    ok(String(bot.createdBy) === String(user.id), 'createBot guarda created_by');
    const active = await store.createBot(row({ name: 'activo', active: true }));
    const off = await store.createBot(row({ name: 'quieto', active: false }));
    ok(active.active === true && off.active === false, 'createBot respeta active (solo para la base)');
    const onlyActive = await store.listBots({ active: true });
    ok(onlyActive.length === 1 && onlyActive[0].id === active.id, 'listBots({active:true}) filtra');
    ok((await store.countActiveBots()) === 1, 'countActiveBots cuenta solo los activos');

    await db.query('DELETE FROM users WHERE id = $1', [user.id]);
    const orphan = await store.getBotById(bot.id);
    ok(orphan && orphan.createdBy === null, 'created_by queda nulo al borrar el usuario');
    await truncate();
  }

  // ---- 5.2 serialización numérica y CRUD ----
  {
    const created = await store.createBot(row({ reach: 4.55, speed: 7.25 }));
    ok(created.reach === 4.6 && created.speed === 7.3, 'createBot redondea reach/speed a un decimal');
    ok(typeof created.reach === 'number' && typeof created.speed === 'number',
      'reach y speed se serializan como number (no string NUMERIC)');

    const updated = await store.updateBot(created.id, { reach: 9.94, speed: 12.04, damage: 3 });
    ok(updated.reach === 9.9 && updated.speed === 12 && updated.damage === 3,
      'updateBot redondea reach/speed y aplica el resto');

    const started = await store.startBot(created.id);
    ok(started.status === 'started' && started.bot.active === true, 'startBot activa el bot');
    const again = await store.startBot(created.id);
    ok(again.status === 'already_active', 'startBot repetido es idempotente');
    const stopped = await store.stopBot(created.id);
    ok(stopped.active === false && stopped.reach === 9.9, 'stopBot desactiva y conserva la configuración');
    ok((await store.deleteBot(created.id)) === true, 'deleteBot borra la fila');
    ok((await store.deleteBot(created.id)) === false, 'deleteBot repetido devuelve false');
  }

  // ---- 5.2 cupo y carrera ----
  {
    const rows = [];
    for (let i = 0; i < 6; i++) {
      rows.push(await store.createBot(row({ name: 'cupo-' + i, damage: 0 })));
    }
    for (let i = 0; i < 4; i++) {
      const r = await store.startBot(rows[i].id);
      ok(r.status === 'started', `startBot ${i + 1}/4 → started`);
    }
    const fifth = await store.startBot(rows[4].id);
    ok(fifth.status === 'started', 'con cuatro activos el quinto se activa');
    const sixth = await store.startBot(rows[5].id);
    ok(sixth.status === 'limit' && sixth.bot.active === false, 'con cinco activos el sexto → limit');
    await store.stopBot(rows[0].id);

    // Carrera: quedan 4 activos y hay dos candidatos.
    const [c1, c2] = await Promise.all([store.startBot(rows[5].id), store.startBot(rows[0].id)]);
    const statuses = [c1.status, c2.status].sort();
    ok(statuses[0] === 'limit' && statuses[1] === 'started',
      'dos startBot simultáneos con cupo para uno aplican exactamente uno');
    ok((await store.countActiveBots()) === 5, 'la carrera deja exactamente cinco activos');
  }

  // ---- 5.2 auditoría que sobrevive al borrado ----
  {
    const bot = await store.createBot(row({ name: 'auditado' }));
    await store.insertAudit({
      actorUserId: null, targetUserId: null, action: 'bot.death',
      details: { botId: bot.id, botName: bot.name, behavior: bot.behavior, system: true },
    });
    await store.deleteBot(bot.id);
    const entries = await store.listAudit(200);
    const death = entries.find(e => e.action === 'bot.death');
    ok(!!death && death.details.botName === 'auditado', 'la auditoría con el nombre del bot sobrevive al borrado');
    ok(!!death && death.actor.id === null, 'la muerte queda con actor nulo');
  }
} finally {
  await db.close();
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 integración de DB de bots OK');
