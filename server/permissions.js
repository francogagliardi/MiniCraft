'use strict';
// Modelo de permisos por usuario (change admin-crud-permisos): allowlist,
// normalización estricta de escritura y materialización tolerante de lectura.
// Módulo puro: sin DB, sin red, sin dependencias del server.
const PERMISSIONS = ['bot_ignore', 'fly', 'instant_break'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Normaliza la entrada de la API (estricta): solo claves de la allowlist con
// valor booleano. Se guardan únicamente las claves `true` (canónico `{}`).
// Devuelve { ok:true, value } o { ok:false, invalid, nonBoolean, notObject }.
function normalizePermissions(input) {
  if (!isPlainObject(input)) {
    return { ok: false, invalid: [], nonBoolean: [], notObject: true };
  }
  const value = {};
  const invalid = [];
  const nonBoolean = [];
  for (const key of Object.keys(input)) {
    if (!PERMISSIONS.includes(key)) { invalid.push(key); continue; }
    if (typeof input[key] !== 'boolean') { nonBoolean.push(key); continue; }
    if (input[key] === true) value[key] = true;
  }
  if (invalid.length || nonBoolean.length) return { ok: false, invalid, nonBoolean };
  return { ok: true, value };
}

// Lectura tolerante: siempre las tres claves booleanas; descarta claves
// desconocidas o valores no booleanos (una fila editada a mano no rompe nada).
function materializePermissions(stored) {
  const src = isPlainObject(stored) ? stored : {};
  return {
    bot_ignore: src.bot_ignore === true,
    fly: src.fly === true,
    instant_break: src.instant_break === true,
  };
}

// Permisos efectivos: el rol admin suma capacidades sin tocar lo guardado.
function canFly(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return materializePermissions(user.permissions).fly === true;
}

function canInstantBreak(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return materializePermissions(user.permissions).instant_break === true;
}

function botIgnores(user) {
  if (!user) return false;
  return materializePermissions(user.permissions).bot_ignore === true;
}

// Proyección para la API/CLI de administración: identidad, rol, skin, estado,
// permisos materializados y fechas; NUNCA el hash de contraseña.
function adminUserView(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    skin: user.skin,
    active: user.active,
    permissions: materializePermissions(user.permissions),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

module.exports = {
  PERMISSIONS,
  normalizePermissions,
  materializePermissions,
  canFly,
  canInstantBreak,
  botIgnores,
  adminUserView,
};
