'use strict';
// Rate limit de autenticación: token bucket por IP + cota global de derivaciones
// scrypt concurrentes. Reloj inyectable para tests deterministas.

function createTokenBucket({ capacity, refillPerSec, now = Date.now }) {
  const cap = Math.max(0, +capacity || 0);
  const rate = Math.max(0, +refillPerSec || 0);
  let tokens = cap;
  let last = now();
  function refill() {
    const t = now();
    const elapsed = Math.max(0, t - last) / 1000;
    if (elapsed > 0) {
      tokens = Math.min(cap, tokens + elapsed * rate);
      last = t;
    }
    return tokens;
  }
  return {
    capacity: cap,
    refillPerSec: rate,
    tryTake() {
      if (refill() < 1) return false;
      tokens -= 1;
      return true;
    },
    // Alias histórico usado por los tests y por el limiter combinado.
    take() { return this.tryTake(); },
    tokens: () => refill(),
    remaining: () => refill(),
  };
}

function createConcurrencyLimiter(max) {
  const limit = Math.max(1, +max || 1);
  let active = 0;
  return {
    maxConcurrent: limit,
    active: () => active,
    tryAcquire() {
      if (active >= limit) return null;
      active++;
      let released = false;
      return function release() {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
      };
    },
  };
}

// Limiter combinado: primero descuenta un token; solo si hay cupo concurrente se
// entrega un release. Un rechazo NO consume derivación (ni token si no hay cupo).
function createLimiter({ capacity, refillPerSec, maxConcurrent, now = Date.now, concurrency }) {
  const bucket = createTokenBucket({ capacity, refillPerSec, now });
  const conc = concurrency || createConcurrencyLimiter(maxConcurrent);
  return {
    capacity: bucket.capacity,
    refillPerSec: bucket.refillPerSec,
    maxConcurrent: conc.maxConcurrent,
    active: () => conc.active(),
    tryAcquire() {
      const release = conc.tryAcquire();
      if (!release) return null; // sin cupo: ni se toca el bucket
      if (!bucket.tryTake()) { release(); return null; } // sin token: no se deriva
      return release;
    },
  };
}

// Configuración de producción: login 5 tokens / 0.2 por segundo; registro 3 /
// 0.05 (más estricto); ambos comparten la MISMA cota global de 2 derivaciones.
// Los knobs por env permiten tests rápidos y ajustes operativos.
function createAuthLimiters({ env = process.env, now = Date.now, maxConcurrent } = {}) {
  const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(+v)) ? d : +v;
  const conc = createConcurrencyLimiter(num(maxConcurrent !== undefined ? maxConcurrent : env.AUTH_MAX_CONCURRENT, 2));
  const login = createLimiter({
    capacity: num(env.LOGIN_RATE_CAPACITY, 5),
    refillPerSec: num(env.LOGIN_RATE_REFILL_PER_SEC, 0.2),
    now,
    concurrency: conc,
  });
  const register = createLimiter({
    capacity: num(env.REGISTER_RATE_CAPACITY, 3),
    refillPerSec: num(env.REGISTER_RATE_REFILL_PER_SEC, 0.05),
    now,
    concurrency: conc,
  });
  return { login, register, maxConcurrent: conc.maxConcurrent };
}

module.exports = { createTokenBucket, createConcurrencyLimiter, createLimiter, createAuthLimiters };
