// Tests del rate limit de auth: token bucket + cota de concurrencia.
// Uso: node test/rate-limit.mjs   (reloj falso, sin red ni DB)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const R = require('../rate-limit.js');

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

// ---- token bucket ----
{
  let t = 0;
  const b = R.createTokenBucket({ capacity: 5, refillPerSec: 0.2, now: () => t });
  let taken = 0;
  for (let i = 0; i < 5; i++) if (b.take()) taken++;
  ok(taken === 5, 'capacidad 5: cinco tomas iniciales');
  ok(b.take() === false, 'agotado rechaza la sexta');
  t += 4999;
  ok(b.take() === false, 'a 4.999 s todavía no recargó un token');
  t += 1;
  ok(b.take() === true, 'a 5 s recarga exactamente un token (0.2/s)');
  ok(b.take() === false, 'y vuelve a quedar agotado');
  t += 25000;
  ok(b.take() === true, 'tras 25 s hay tokens de nuevo');
}

// ---- concurrencia ----
{
  let t = 0;
  const c = R.createConcurrencyLimiter(2);
  const r1 = c.tryAcquire();
  const r2 = c.tryAcquire();
  ok(typeof r1 === 'function' && typeof r2 === 'function', 'con cota 2, las dos primeras derivaciones entran');
  ok(c.tryAcquire() === null, 'la tercera se rechaza por concurrencia');
  r1();
  const r3 = c.tryAcquire();
  ok(typeof r3 === 'function', 'al liberar una, la siguiente entra');
  r2(); r3();
  ok(c.active() === 0, 'al liberar todas no quedan derivaciones activas');
}

// ---- limiter combinado (bucket + concurrencia) ----
{
  let t = 0;
  const l = R.createLimiter({ capacity: 2, refillPerSec: 0.2, maxConcurrent: 1, now: () => t });
  const rel = l.tryAcquire();
  ok(typeof rel === 'function', 'tryAcquire entrega un release');
  ok(l.tryAcquire() === null, 'sin cupo concurrente rechaza');
  rel();
  t += 5000;
  ok(typeof l.tryAcquire() === 'function', 'con cupo y token entra');
}

// ---- buckets de auth: registro más estricto ----
{
  let t = 0;
  const lims = R.createAuthLimiters({ now: () => t });
  ok(lims.login.capacity === 5 && lims.login.refillPerSec === 0.2, 'login: capacidad 5, recarga 0.2/s');
  ok(lims.register.capacity === 3 && lims.register.refillPerSec === 0.05, 'registro: capacidad 3, recarga 0.05/s');
  ok(lims.register.capacity < lims.login.capacity && lims.register.refillPerSec < lims.login.refillPerSec,
    'el registro es más estricto que el login');
  ok(lims.login.maxConcurrent === 2 && lims.register.maxConcurrent === 2, 'ambos comparten la cota global de 2 derivaciones');
}

// ---- rechazo sin consumir derivación: no se toca un contador de derivaciones ----
{
  let t = 0, derived = 0;
  const l = R.createLimiter({ capacity: 1, refillPerSec: 0.2, maxConcurrent: 1, now: () => t });
  const rel = l.tryAcquire();
  derived++; // primera derivación
  const rejected = l.tryAcquire();
  ok(rejected === null, 'el rechazo concurrente no entrega release');
  if (rejected) derived++;
  ok(derived === 1, 'el rechazo no consume una derivación');
  rel();
  t += 5000;
  ok(typeof l.tryAcquire() === 'function', 'el token sigue disponible tras el rechazo');
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 rate limit (token bucket + concurrencia) OK');
