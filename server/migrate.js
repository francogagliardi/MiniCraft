'use strict';
// Runner de migraciones SQL propio: orden por nombre, transacción por archivo,
// advisory lock para que dos réplicas no migren a la vez y fail fast.
const fs = require('fs');
const path = require('path');

const LOCK_KEY = 'minicraft:migrations';

async function runMigrations(db, { dir = path.join(__dirname, 'migrations'), log = console.log } = {}) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const files = fs.readdirSync(dir)
    .filter(f => /^\d+.*\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b));
  let applied = 0;
  for (const file of files) {
    const done = await db.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (done.rows.length) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_KEY]);
      const again = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
      if (again.rows.length) return; // otra réplica la aplicó mientras esperábamos
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    });
    applied++;
    if (log) log(`   🗄️  migración aplicada: ${file}`);
  }
  return { applied, total: files.length };
}

module.exports = { runMigrations, LOCK_KEY };
