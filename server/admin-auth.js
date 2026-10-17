// server/admin-auth.js — verificación de la clave del modo admin.
//
// POR QUÉ EXISTE (contexto del change `clave-admin-hash`)
// -------------------------------------------------------
// La clave admin vivía en claro en el entorno del proceso (`ADMIN_KEY`). Quien
// tenga root en el host la lee sin esfuerzo (`docker inspect`,
// `/proc/<pid>/environ`, panel de Easypanel). Este módulo permite guardar un
// HASH en vez de la clave: el server deriva PBKDF2-SHA256 de lo que recibe y lo
// compara con el hash guardado. El valor guardado deja de ser una credencial
// usable (anti pass-the-hash: hashear el hash no reproduce el hash).
//
// FORMATO AUTODESCRIPTIVO
// -----------------------
//   pbkdf2_sha256$<iteraciones>$<saltB64>$<hashB64>
// El algoritmo, las iteraciones y el salt se leen del propio string, así que
// rotar/ajustar el costo es cambiar una sola variable de entorno sin tocar el
// server. `hashB64` es el derivado de 32 bytes (keylen fijo: el formato no lo
// codifica y no hace falta — el largo correcto se valida al comparar).
//
// PRECEDENCIA (hash gana SIEMPRE)
// -------------------------------
//   ADMIN_KEY_HASH seteado (no vacío) -> se usa SOLO el hash; `ADMIN_KEY` en
//                                        claro se IGNORA (aunque coincida).
//   Sin hash y `ADMIN_KEY` no vacía   -> camino en claro (compat dev/tests).
//   Ninguna de las dos                -> admin DESHABILITADO (fail closed).
// "Vacío" se trata como ausente en ambos casos.
//
// FAIL CLOSED
// -----------
// Antes, `ADMIN_KEY === ''` significaba admin ABIERTO para cualquiera que
// eligiera `mode:'admin'`. Ahora no hay ninguna configuración que abra el admin:
// sin hash y sin clave en claro, `verifyAdminKey` siempre devuelve `false`.
//
// POR QUÉ `.js` Y NO `.mjs`
// -------------------------
// `Dockerfile:11` copia `server/*.js` al container; un `.mjs` no entra y el
// `require` del server crashearía con `Cannot find module` (el bug que ya pasó
// con `zombie.js`). Los tests y la herramienta generadora sí van en `.mjs`.
//
// COSTO DEL KDF (no bloqueo)
// --------------------------
// La verificación deriva con `crypto.pbkdf2` ASÍNCRONO (nunca `pbkdf2Sync`): el
// KDF corre en el threadpool de libuv y no detiene el event loop (tick de 20 Hz
// y snapshots de zombis). El costo se acota además con un token bucket global y
// una cota de derivaciones concurrentes (ver `createAdminLimiter`).
'use strict';
const crypto = require('crypto');

const ALGO = 'pbkdf2_sha256';
const DIGEST = 'sha256';
const DEFAULT_ITERATIONS = 210000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
// Cota de cordura para las iteraciones leídas del string: un valor basura o
// absurdo (que dispararía un KDF carísimo) se trata como hash inválido.
const MAX_ITERATIONS = 10000000;

// Contador de derivaciones observable por los tests (y por el server, para el
// log rate-limited del rechazo por limitador). No expone secretos.
const stats = { derivations: 0, limited: 0 };

function resetStats() { stats.derivations = 0; stats.limited = 0; }

// Cadena no vacía o null (para la resolución de precedencia).
function nonEmpty(s) { return (typeof s === 'string' && s.length > 0) ? s : null; }

// Promisifica `crypto.pbkdf2` (versión ASÍNCRONA: no bloquea el event loop).
function pbkdf2Async(password, salt, iterations, keylen, digest) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, keylen, digest, (err, dk) => {
      if (err) reject(err); else resolve(dk);
    });
  });
}

// Parsea el string autodescriptivo. Devuelve { iteraciones, salt, hash } (Buffers)
// o null si es inválido. NUNCA lanza: un hash corrupto se trata como inválido.
function parseHash(str) {
  if (typeof str !== 'string') return null;
  const parts = str.split('$');
  if (parts.length !== 4) return null;
  const [algo, iterStr, saltB64, hashB64] = parts;
  if (algo !== ALGO) return null;
  const iterations = Number(iterStr);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) return null;
  const salt = Buffer.from(saltB64, 'base64');
  const hash = Buffer.from(hashB64, 'base64');
  if (salt.length === 0 || hash.length === 0) return null;
  return { iterations, salt, hash };
}

// Comparación de tiempo constante de dos derivados. Valida largos ANTES de
// llamar a `timingSafeEqual` (que LANZA si difieren) y devuelve false en ese
// caso: un hash guardado corrupto deniega sin crashear.
function constantTimeEqual(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Comparación de tiempo constante para el camino en claro (strings UTF-8).
function constantTimeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return constantTimeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

// Deriva PBKDF2 de `clave` con los parámetros del hash parseado y compara.
async function deriveAndMatch(clave, parsed) {
  const dk = await pbkdf2Async(clave, parsed.salt, parsed.iterations, KEY_BYTES, DIGEST);
  return constantTimeEqual(dk, parsed.hash);
}

// Genera un hash autodescriptivo de `clave`. Es LOCAL (lo usa el generador y los
// tests): puede ser síncrono. El runtime del server NO lo usa (`pbkdf2Sync` está
// prohibido en el camino de verificación).
function makeHash(clave, opts = {}) {
  const iterations = opts.iterations || DEFAULT_ITERATIONS;
  const salt = opts.salt || crypto.randomBytes(SALT_BYTES);
  const dk = crypto.pbkdf2Sync(String(clave), salt, iterations, KEY_BYTES, DIGEST);
  return `${ALGO}$${iterations}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

// Resuelve la configuración de admin desde el entorno aplicando la precedencia.
// Devuelve el modo elegido + los valores crudos, para que el server pueda avisar
// al arrancar sin exponer secretos. `opts.limiter` se adjunta a la config para
// que la verificación lo aplique sin que el handler tome decisiones.
function resolveConfig(env = process.env, opts = {}) {
  const hash = nonEmpty(env.ADMIN_KEY_HASH);
  const claro = nonEmpty(env.ADMIN_KEY);
  const mode = hash ? 'hash' : (claro ? 'claro' : 'none');
  return {
    mode,
    hash: hash || '',
    claro: claro || '',
    hasHash: !!hash,
    hasClaro: !!claro,
    limiter: opts.limiter || null,
  };
}

// Verifica la clave recibida. Devuelve Promise<boolean>.
//   - Con hash: deriva (async) y compara en tiempo constante. Mide el limitador
//     ANTES de derivar (rechazo barato) y no deriva si la clave es vacía.
//   - Sin hash pero con claro: comparación en tiempo constante (dev/tests).
//   - Sin nada: fail closed (false).
async function verifyAdminKey(clave, cfg = {}) {
  const hash = nonEmpty(cfg.hash);
  const claro = nonEmpty(cfg.claro);
  const limiter = cfg.limiter || null;

  if (hash) { // precedencia: el hash gana SIEMPRE
    const parsed = parseHash(hash);
    if (!parsed) return false; // hash malformado -> deniega sin lanzar
    if (typeof clave !== 'string' || clave.length === 0) return false; // vacío no deriva ni consume token
    if (limiter) {
      const release = limiter.acquire();
      if (!release) { stats.limited++; return false; } // sin token -> rechazo barato, SIN derivar
      try { stats.derivations++; return await deriveAndMatch(clave, parsed); }
      finally { release(); }
    }
    stats.derivations++;
    return deriveAndMatch(clave, parsed);
  }

  if (claro) return constantTimeStringEqual(clave, claro); // compat dev/tests

  return false; // fail closed
}

// Token bucket con `now` inyectable (reloj falso en tests => determinista).
function createTokenBucket({ capacity = 3, refillPerSec = 0.5, now = Date.now } = {}) {
  let tokens = capacity;
  let last = now();
  return {
    take(n = 1) {
      const t = now();
      tokens = Math.min(capacity, tokens + ((t - last) / 1000) * refillPerSec);
      last = t;
      if (tokens >= n) { tokens -= n; return true; }
      return false;
    },
    get tokens() { return tokens; },
  };
}

// Limitador de derivaciones: cota de concurrencia + token bucket. `acquire()`
// concede una derivación y devuelve una función `release` (idempotente), o null
// si se rechaza. El orden importa: la cota concurrente se mide ANTES de tocar el
// bucket, así un rechazo por concurrencia NO consume token.
function createAdminLimiter({ capacity = 3, refillPerSec = 0.5, maxConcurrent = 2, now = Date.now } = {}) {
  const bucket = createTokenBucket({ capacity, refillPerSec, now });
  let inFlight = 0;
  return {
    bucket,
    acquire() {
      if (inFlight >= maxConcurrent) return null;
      if (!bucket.take()) return null;
      inFlight++;
      let released = false;
      return () => { if (!released) { released = true; inFlight = Math.max(0, inFlight - 1); } };
    },
    get inFlight() { return inFlight; },
    get tokens() { return bucket.tokens; },
  };
}

module.exports = {
  ALGO, DEFAULT_ITERATIONS, SALT_BYTES, KEY_BYTES,
  stats, resetStats,
  makeHash, parseHash, resolveConfig, verifyAdminKey,
  createTokenBucket, createAdminLimiter,
};
