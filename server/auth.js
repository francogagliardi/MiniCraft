'use strict';
// Autenticación base: hash scrypt, tokens de sesión, cookies y validaciones.
// Sin dependencias fuera de `node:crypto`; todo asíncrono en el camino de request.
const crypto = require('crypto');

// Parámetros del KDF (decisión 2 del design). El formato es autodescriptivo, así
// que estos valores son los que se usan para hashes NUEVOS; verificar respeta los
// parámetros guardados (con cotas de cordura).
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const SALT_BYTES = 16;

const USERNAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const SESSION_COOKIE = 'mc_sid';
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;
const SESSION_TOKEN_BYTES = 32;
const RESERVED_USERNAMES = ['admin', 'system', 'server', 'bot', 'null', 'undefined'];

function isValidUsername(username) {
  return typeof username === 'string' && USERNAME_RE.test(username);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

function isReservedUsername(username, { adminUsername } = {}) {
  if (typeof username !== 'string') return false;
  const key = username.trim().toLowerCase();
  if (!key) return false;
  const list = RESERVED_USERNAMES.slice();
  if (typeof adminUsername === 'string' && adminUsername.trim()) list.push(adminUsername.trim().toLowerCase());
  return list.includes(key);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// scrypt async: nunca bloquea el event loop. `maxmem` acota el costo.
function scryptAsync(password, salt, N, r, p, keylen) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, keylen, { N, r, p, maxmem: SCRYPT_MAXMEM }, (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEYLEN);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${b64url(salt)}$${b64url(key)}`;
}

// Parser con cotas: un hash manipulado no puede disparar un KDF carísimo.
function parseHash(stored) {
  if (typeof stored !== 'string') return null;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (N < 2 || N > 1 << 20 || (N & (N - 1)) !== 0) return null; // potencia de 2 razonable
  if (r < 1 || r > 32 || p < 1 || p > 16) return null;
  let salt, hash;
  try {
    salt = Buffer.from(parts[4], 'base64url');
    hash = Buffer.from(parts[5], 'base64url');
  } catch (e) { return null; }
  if (salt.length < 8 || salt.length > 64) return null;
  if (hash.length < 16 || hash.length > 128) return null;
  return { N, r, p, salt, hash };
}

async function verifyPassword(password, stored) {
  if (typeof password !== 'string') return false;
  const parsed = parseHash(stored);
  if (!parsed) return false;
  let derived;
  try {
    derived = await scryptAsync(password, parsed.salt, parsed.N, parsed.r, parsed.p, parsed.hash.length);
  } catch (e) {
    return false; // hash corrupto o parámetros imposibles: deniega sin lanzar
  }
  if (derived.length !== parsed.hash.length) return false;
  try { return crypto.timingSafeEqual(derived, parsed.hash); } catch (e) { return false; }
}

// Hash de relleno: mismo costo que un hash real para usuario inexistente/inactivo.
let dummyHashPromise = null;
function getDummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(8).toString('hex'));
  return dummyHashPromise;
}

// Deriva contra el dummy y descarta el resultado: iguala el tiempo del camino
// válido y evita enumeración por timing.
async function burnPasswordCheck(password) {
  try { await verifyPassword(typeof password === 'string' ? password : '', await getDummyHash()); } catch (e) {}
  return false;
}

function createSessionToken() {
  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Comparación en tiempo constante de dos strings (tokens/hashes).
function tokensEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch (e) { return false; }
}

function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string' || !header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; }
  }
  return out;
}

function serializeSessionCookie(token, { secure = false, maxAge = SESSION_MAX_AGE_SEC } = {}) {
  const parts = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie({ secure = false } = {}) {
  return serializeSessionCookie('', { secure, maxAge: 0 });
}

// Una sesión es usable si no fue revocada, no expiró y la cuenta sigue activa.
function isSessionActive(session, user, now = Date.now()) {
  if (!session || !user) return false;
  if (session.revokedAt) return false;
  if (user.active === false) return false;
  const exp = session.expiresAt instanceof Date ? session.expiresAt.getTime() : new Date(session.expiresAt).getTime();
  if (!Number.isFinite(exp) || exp <= now) return false;
  return true;
}

module.exports = {
  SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEYLEN,
  PASSWORD_MIN, PASSWORD_MAX, SESSION_COOKIE, SESSION_MAX_AGE_SEC, RESERVED_USERNAMES,
  hashPassword, verifyPassword, parseHash, getDummyHash, burnPasswordCheck,
  createSessionToken, hashToken, tokensEqual,
  parseCookies, serializeSessionCookie, clearSessionCookie, isSessionActive,
  isValidUsername, isValidPassword, isReservedUsername,
};
