// Tests del registro público (/register + POST /api/register) con MemoryStore.
// Uso: node test/register.mjs
import { startApp, cookieOf } from './support/app-fixture.mjs';

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

const FIX = await startApp({ users: [{ username: 'ana', password: 'correcta-123' }] });
try {
  // ---- alta válida + auto-login ----
  {
    const res = await FIX.request('/api/register', { method: 'POST', body: { username: 'nuevo_1', password: 'password-123' } });
    const body = await res.json();
    const set = res.headers.get('set-cookie') || '';
    ok(res.status === 201, 'alta válida → 201');
    ok(body.user && body.user.username === 'nuevo_1' && body.user.role === 'user' && body.user.skin === 'human',
      'el perfil devuelto es user/human');
    ok(/mc_sid=/.test(set), 'el alta setea cookie (auto-login)');
    ok((res.headers.get('cache-control') || '').includes('no-store'), 'registro responde no-store');
    const me = await FIX.request('/api/me', { cookie: cookieOf(res) });
    ok(me.status === 200 && (await me.json()).user.username === 'nuevo_1', 'GET /api/me ya responde con la cuenta nueva');
  }

  // ---- duplicado case-insensitive ----
  {
    const res = await FIX.request('/api/register', { method: 'POST', body: { username: 'ANA', password: 'password-123' } });
    const body = await res.json();
    ok(res.status === 409 && body.error === 'username_taken', 'username duplicado (otra capitalización) → 409 username_taken');
    ok(!(await FIX.store.getUserByUsername('ANA2')), 'no se creó una cuenta extra');
    const stored = await FIX.store.getUserByUsername('ana');
    ok(stored && stored.username === 'ana', 'la cuenta existente no cambia');
  }

  // ---- reservados ----
  for (const name of ['admin', 'Server', 'null', 'undefined']) {
    const res = await FIX.request('/api/register', { method: 'POST', body: { username: name, password: 'password-123' } });
    const body = await res.json();
    ok(res.status === 400 && body.error === 'username_reserved', `username reservado "${name}" → 400 username_reserved`);
  }
  {
    const R = await startApp({ env: { ADMIN_USERNAME: 'jefe' } });
    try {
      const res = await R.request('/api/register', { method: 'POST', body: { username: 'Jefe', password: 'password-123' } });
      ok(res.status === 400 && (await res.json()).error === 'username_reserved', 'ADMIN_USERNAME también está reservado');
    } finally { await R.close(); }
  }

  // ---- validaciones de formato ----
  {
    const res = await FIX.request('/api/register', { method: 'POST', body: { username: 'ab', password: 'password-123' } });
    ok(res.status === 400 && (await res.json()).error === 'invalid_username', 'username de 2 caracteres → invalid_username');
    const res2 = await FIX.request('/api/register', { method: 'POST', body: { username: 'con espacio', password: 'password-123' } });
    ok(res2.status === 400 && (await res2.json()).error === 'invalid_username', 'username con espacio → invalid_username');
    const res3 = await FIX.request('/api/register', { method: 'POST', body: { username: 'otro_1', password: '1234567' } });
    ok(res3.status === 400 && (await res3.json()).error === 'invalid_password', 'password de 7 → invalid_password');
    const res4 = await FIX.request('/api/register', { method: 'POST', body: { username: 'otro_2', password: 'x'.repeat(129) } });
    ok(res4.status === 400 && (await res4.json()).error === 'invalid_password', 'password de 129 → invalid_password');
    ok(!(await FIX.store.getUserByUsername('otro_1')), 'una validación fallida no crea cuenta');
  }

  // ---- el cliente no elige rol/skin/active ----
  {
    const res = await FIX.request('/api/register', {
      method: 'POST',
      body: { username: 'forzado_1', password: 'password-123', role: 'admin', skin: 'robot', active: false },
    });
    const body = await res.json();
    ok(res.status === 201 && body.user.role === 'user' && body.user.skin === 'human', 'role/skin del body se ignoran');
    const u = await FIX.store.getUserByUsername('forzado_1');
    ok(u && u.role === 'user' && u.skin === 'human' && u.active === true, 'la fila queda user/human/active');
  }

  // ---- anti-fixation: registrar con una cookie previa revoca la sesión vieja ----
  {
    const old = await FIX.login('ana', 'correcta-123');
    const res = await FIX.request('/api/register', { method: 'POST', cookie: old, body: { username: 'fix_1', password: 'password-123' } });
    ok(res.status === 201, 'registro con cookie previa funciona');
    const fresh = cookieOf(res);
    ok(fresh !== old, 'el registro emite una cookie nueva');
    const oldMe = await FIX.request('/api/me', { cookie: old });
    ok(oldMe.status === 401, 'la sesión anterior quedó revocada (anti-fixation)');
    const newMe = await FIX.request('/api/me', { cookie: fresh });
    ok(newMe.status === 200, 'la sesión nueva autentica');
  }

  // ---- CSRF / body / Origin en registro ----
  {
    const res = await FIX.request('/api/register', { method: 'POST', body: { username: 'x_1', password: 'password-123' },
      headers: { Origin: 'https://otro-sitio.example' } });
    ok(res.status === 403, 'registro con Origin ajeno → 403');
    const big = await FIX.request('/api/register', { method: 'POST', body: { username: 'x_2', password: 'x'.repeat(9000) } });
    ok(big.status === 413, 'registro con body > 8 KB → 413');
    const ct = await FIX.request('/api/register', { method: 'POST', body: 'usuario=ana', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    ok(ct.status === 415, 'registro con form clásico → 415');
  }

  // ---- /register con sesión redirige al lobby ----
  {
    const c = await FIX.login('ana', 'correcta-123');
    const res = await FIX.request('/register', { cookie: c });
    ok(res.status === 302 && res.headers.get('location') === '/lobby', '/register con sesión → /lobby');
    const page = await FIX.request('/register');
    const html = await page.text();
    ok(page.status === 200 && html.includes('registerForm') && html.includes('/login'), '/register sin sesión sirve el formulario');
  }
} finally { await FIX.close(); }

// ---- registro cerrado ----
{
  for (const value of ['0', 'false', 'cualquier-cosa']) {
    const C = await startApp({ env: { REGISTRATION_ENABLED: value } });
    try {
      const page = await C.request('/register');
      const html = await page.text();
      ok(page.status === 200 && /Registro cerrado/.test(html) && !html.includes('registerForm'),
        `REGISTRATION_ENABLED=${value} → página "Registro cerrado" sin formulario`);
      const post = await C.request('/api/register', { method: 'POST', body: { username: 'nuevo_x', password: 'password-123' } });
      ok(post.status === 403 && (await post.json()).error === 'registration_disabled', `REGISTRATION_ENABLED=${value} → POST 403`);
    } finally { await C.close(); }
  }
  const O = await startApp({ env: { REGISTRATION_ENABLED: '1' } });
  try {
    const page = await O.request('/register');
    ok((await page.text()).includes('registerForm'), 'REGISTRATION_ENABLED=1 deja el formulario');
  } finally { await O.close(); }
}

// ---- rate limit del registro ----
{
  const L = await startApp({ env: { REGISTER_RATE_CAPACITY: '1', REGISTER_RATE_REFILL_PER_SEC: '0' } });
  try {
    const first = await L.request('/api/register', { method: 'POST', body: { username: 'r_1', password: 'password-123' } });
    const second = await L.request('/api/register', { method: 'POST', body: { username: 'r_2', password: 'password-123' } });
    ok(first.status === 201, 'rate limit registro: la primera alta entra');
    ok(second.status === 429 && !(await L.store.getUserByUsername('r_2')), 'rate limit registro: la segunda 429 sin crear cuenta');
  } finally { await L.close(); }
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 registro público (auto-login, reservados, toggle, anti-abuso) OK');
