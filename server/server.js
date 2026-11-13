'use strict';
// Minicraft — bootstrap delgado del servidor.
// Env → Pool Postgres → migraciones → bootstrap del admin → createApp().listen()
// → logs y shutdown ordenado. Toda la lógica de juego/HTTP vive en app.js.
const { createApp } = require('./app.js');
const { createDb } = require('./db.js');
const { createPgStore } = require('./store-pg.js');
const { runMigrations } = require('./migrate.js');
const { bootstrapAdmin, warnLegacyAdmin, warnLegacyBotToken } = require('./admin-bootstrap.js');
const CFG = require('./env-config.js');

const env = process.env;
const PORT = +(env.PORT || 3000);
const CLEANUP_EVERY_MS = 6 * 60 * 60 * 1000;

async function main() {
  // Las variables legacy ya no autentican; se avisa una vez sin exponer valores.
  warnLegacyAdmin(env, console.warn);
  warnLegacyBotToken(env, console.warn);

  if (!env.DATABASE_URL) {
    console.error('❌ falta DATABASE_URL: el server necesita PostgreSQL para autenticar.');
    console.error('   En Docker/Easypanel configurá DATABASE_URL (ver README).');
    process.exit(1);
  }

  const db = createDb({ connectionString: env.DATABASE_URL, logger: console });
  const store = createPgStore({ db });

  if (CFG.migrationsAuto(env)) {
    try {
      await runMigrations(db, { log: console.log });
    } catch (e) {
      console.error('❌ fallaron las migraciones: ' + (e && e.message));
      await db.close().catch(() => {});
      process.exit(1);
    }
  }

  try {
    await bootstrapAdmin({ store, env, log: console.log, warn: console.warn });
  } catch (e) {
    console.warn('   ⚠️ no se pudo bootstrapear el admin: ' + (e && e.message));
  }

  // Limpieza oportunista de sesiones muertas (no bloquea el arranque).
  store.cleanupSessions(new Date(Date.now() - 30 * 24 * 3600 * 1000))
    .catch((e) => console.warn('   ⚠️ limpieza de sesiones: ' + (e && e.message)));

  const app = createApp({ env, store });
  let cleanupTimer = setInterval(() => {
    store.cleanupSessions(new Date(Date.now() - 30 * 24 * 3600 * 1000))
      .catch((e) => console.warn('   ⚠️ limpieza de sesiones: ' + (e && e.message)));
  }, CLEANUP_EVERY_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();

  await app.listen(PORT);
  console.log(`⛏ Minicraft server en http://localhost:${PORT}`);
  console.log(`   STATIC=${app.staticDir} SAVE_FILE=${app.worldFile}`);

  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(cleanupTimer);
    try { await app.close(); } catch (e) {}
    try { await db.close(); } catch (e) {}
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('❌ no pude arrancar el server: ' + (e && e.stack || e));
  process.exit(1);
});
