'use strict';
// Bootstrap del admin inicial y aviso de migración por variables legacy.
const A = require('./auth.js');
const { adminUsername } = require('./env-config.js');

let legacyWarned = false;

function resetLegacyWarning() { legacyWarned = false; }

// ADMIN_KEY/ADMIN_KEY_HASH ya no autentican a nadie. Si siguen presentes, se
// avisa UNA vez por proceso y nunca se loguea el valor.
function warnLegacyAdmin(env = process.env, warn = console.warn) {
  if (legacyWarned) return false;
  const hasKey = typeof env.ADMIN_KEY === 'string' && env.ADMIN_KEY !== '';
  const hasHash = typeof env.ADMIN_KEY_HASH === 'string' && env.ADMIN_KEY_HASH !== '';
  if (!hasKey && !hasHash) return false;
  legacyWarned = true;
  const names = [hasKey ? 'ADMIN_KEY' : null, hasHash ? 'ADMIN_KEY_HASH' : null].filter(Boolean).join(' y ');
  warn(`   ⚠️ ${names} ya no se usa: el admin ahora es una cuenta con rol admin. ` +
    'Remové esas variables y usá ADMIN_PASSWORD (bootstrap) o server/user-tool.mjs.');
  return true;
}

// Crea el admin si no existe. No sobrescribe contraseñas ni avisa secretos.
async function bootstrapAdmin({ store, env = process.env, log = console.log, warn = console.warn } = {}) {
  const username = adminUsername(env);
  const password = typeof env.ADMIN_PASSWORD === 'string' ? env.ADMIN_PASSWORD : '';
  if (!A.isValidUsername(username)) {
    warn('   ⚠️ ADMIN_USERNAME inválido (3–16, [A-Za-z0-9_-]): no se crea admin.');
    return false;
  }
  const existing = await store.getUserByUsername(username);
  if (existing) {
    log(`   👤 Admin "${username}" ya existe: no se modifica.`);
    return false;
  }
  if (!password) {
    warn('   ⚠️ Sin ADMIN_PASSWORD no se crea admin. El juego sigue para usuarios comunes (sin admins).');
    return false;
  }
  if (password.length < A.PASSWORD_MIN) {
    warn(`   ⚠️ ADMIN_PASSWORD tiene menos de ${A.PASSWORD_MIN} caracteres: no se crea admin.`);
    return false;
  }
  const passwordHash = await A.hashPassword(password);
  await store.createUser({ username, passwordHash, role: 'admin', skin: 'human', active: true });
  log(`   👑 Admin "${username}" creado con rol admin.`);
  return true;
}

module.exports = { bootstrapAdmin, warnLegacyAdmin, resetLegacyWarning, adminUsername };
