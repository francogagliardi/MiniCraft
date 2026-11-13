'use strict';
// Lectura y normalización de la configuración de autenticación desde el entorno.
// Fail closed: los valores inválidos nunca habilitan de más.

function str(v) { return typeof v === 'string' ? v.trim() : ''; }

// REGISTRATION_ENABLED: ausente → abierto; 1/true → abierto; 0/false → cerrado;
// cualquier otro valor → cerrado + warning (fail closed).
function registrationEnabled(env = process.env, warn = () => {}) {
  const raw = env.REGISTRATION_ENABLED;
  if (raw === undefined || raw === null || str(raw) === '') return true;
  const v = str(raw).toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  warn(`   ⚠️ REGISTRATION_ENABLED="${str(raw)}" no es válido: el registro queda CERRADO (fail closed). Usá 1/0.`);
  return false;
}

function cookieSecure(env = process.env) {
  const v = str(env.COOKIE_SECURE).toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return str(env.NODE_ENV).toLowerCase() === 'production';
}

function trustProxy(env = process.env) {
  const v = str(env.TRUST_PROXY).toLowerCase();
  return v === '1' || v === 'true';
}

function adminUsername(env = process.env) {
  return str(env.ADMIN_USERNAME) || 'admin';
}

function migrationsAuto(env = process.env) {
  const v = str(env.MIGRATIONS_AUTO).toLowerCase();
  return !(v === '0' || v === 'false');
}

module.exports = { registrationEnabled, cookieSecure, trustProxy, adminUsername, migrationsAuto };
