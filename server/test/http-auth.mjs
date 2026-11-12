// Tests HTTP de auth con createApp + MemoryStore (sin DB, puerto efímero).
// Uso: node test/http-auth.mjs
import { startApp, cookieOf } from './support/app-fixture.mjs';

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

const FIX = await startApp({
  users: [
    { username: 'ana', password: 'correcta-123', role: 'user', skin: 'human' },
    { username: 'root', password: 'admin-12345', role: 'admin', skin: 'giant' },
    { username: 'off', password: 'correcta-123', active: false },
  ],
});

try {
  // ---- login ----
  {
    const res = await FIX.request('/api/login', { method: 'POST', body: { username: 'ana', password: 'correcta-123' } });
    const body = await res.json();
    const set = res.headers.get('set-cookie') || '';
    ok(res.status === 200, 'login correcto responde 200');
    ok(body.user && body.user.username === 'ana' && body.user.role === 'user' && body.user.skin === 'human',
      'login devuelve el perfil público (username/role/skin)');
    ok(!('password' in body.user) && !('passwordHash' in body.user), 'el perfil no expone hash ni contraseña');
    ok(/mc_sid=/.test(set) && /HttpOnly/.test(set) && /SameSite=Lax/.test(set) && /Max-Age=604800/.test(set),
      'login setea cookie HttpOnly/SameSite=Lax/Max-Age 7d');
    ok((res.headers.get('cache-control') || '').includes('no-store'), 'login responde Cache-Control: no-store');
  }
  {
    const res = await FIX.request('/api/login', { method: 'POST', body: { username: 'ana', password: 'mala' } });
    const t1 = await res.text();
    ok(res.status === 401 && !res.headers.get('set-cookie'), 'contraseña incorrecta → 401 sin cookie');
    const res2 = await FIX.request('/api/login', { method: 'POST', body: { username: 'nadie', password: 'mala' } });
    const t2 = await res2.text();
    ok(res2.status === 401, 'usuario inexistente → 401');
    ok(t1 === t2, 'mismo cuerpo genérico para inexistente y clave mala');
    const res3 = await FIX.request('/api/login', { method: 'POST', body: { username: 'off', password: 'correcta-123' } });
    ok(res3.status === 401, 'usuario inactivo → 401');
  }
  {
    const res = await FIX.request('/api/login', { method: 'POST', body: { username: 'ANA', password: 'correcta-123' } });
    const body = await res.json();
    ok(res.status === 200 && body.user.username === 'ana', 'login case-insensitive devuelve el username almacenado');
  }

  // ---- validaciones HTTP ----
  {
    const res = await FIX.request('/api/login', { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } });
    ok(res.status === 415, 'Content-Type text/plain → 415');
  }
  {
    const res = await FIX.request('/api/login', { method: 'POST', body: { username: 'ana', password: 'x' },
      headers: { Origin: 'https://otro-sitio.example' } });
    ok(res.status === 403, 'Origin ajeno → 403');
  }
  {
    const big = { username: 'ana', password: 'x'.repeat(9000) };
    const res = await FIX.request('/api/login', { method: 'POST', body: big });
    ok(res.status === 413, 'body > 8 KB → 413');
  }
  {
    const res = await FIX.request('/api/login', { method: 'POST', body: { username: 'ana', password: 'correcta-123' },
      headers: { 'Sec-Fetch-Site': 'cross-site' } });
    ok(res.status === 403, 'Sec-Fetch-Site cross-site → 403');
  }

  // ---- sesión / perfil ----
  const cookie = await FIX.login('ana', 'correcta-123');
  {
    const res = await FIX.request('/api/me', { cookie });
    const body = await res.json();
    ok(res.status === 200 && body.user.username === 'ana', '/api/me con cookie devuelve el perfil');
    ok((res.headers.get('cache-control') || '').includes('no-store'), '/api/me responde no-store');
    const anon = await FIX.request('/api/me');
    ok(anon.status === 401, '/api/me sin cookie → 401');
  }
  {
    const res = await FIX.request('/api/me', { method: 'PATCH', cookie, body: { skin: 'giant', role: 'admin', username: 'otro' } });
    const body = await res.json();
    ok(res.status === 200 && body.user.skin === 'giant', 'PATCH /api/me cambia el skin');
    ok(body.user.role === 'user' && body.user.username === 'ana', 'PATCH ignora role y username');
    const bad = await FIX.request('/api/me', { method: 'PATCH', cookie, body: { skin: 'robot' } });
    ok(bad.status === 400, 'PATCH con robot → 400');
    const bad2 = await FIX.request('/api/me', { method: 'PATCH', cookie, body: { skin: 'inventado' } });
    ok(bad2.status === 400, 'PATCH con skin inventado → 400');
    const still = await FIX.request('/api/me', { cookie });
    ok((await still.json()).user.skin === 'giant', 'un skin inválido no pisa el guardado');
  }

  // ---- logout ----
  {
    const res = await FIX.request('/api/logout', { method: 'POST', cookie, body: {} });
    ok(res.status === 204, 'logout responde 204 sin cuerpo');
    ok(/Max-Age=0/.test(res.headers.get('set-cookie') || ''), 'logout limpia la cookie');
    const after = await FIX.request('/api/me', { cookie });
    ok(after.status === 401, 'la sesión revocada ya no autentica');
    const again = await FIX.request('/api/logout', { method: 'POST', cookie, body: {} });
    ok(again.status === 204, 'logout sin sesión es idempotente');
  }

  // ---- páginas y redirecciones ----
  {
    const root = await FIX.request('/');
    ok(root.status === 302 && root.headers.get('location') === '/login', '/ sin sesión → /login');
    const rootC = await FIX.request('/', { cookie: await FIX.login('ana', 'correcta-123') });
    ok(rootC.status === 302 && rootC.headers.get('location') === '/lobby', '/ con sesión → /lobby');
  }
  {
    const c = await FIX.login('ana', 'correcta-123');
    const lobby = await FIX.request('/lobby', { cookie: c });
    ok(lobby.status === 200 && (await lobby.text()).includes('skinPicker'), '/lobby con sesión sirve lobby.html');
    const lobbyAnon = await FIX.request('/lobby');
    ok(lobbyAnon.status === 302 && lobbyAnon.headers.get('location') === '/login', '/lobby sin sesión → /login');
    const game = await FIX.request('/game', { cookie: c });
    const html = await game.text();
    ok(game.status === 200 && html.includes('<script type="module">'), '/game con sesión sirve index.html');
    ok((game.headers.get('cache-control') || '').includes('no-store'), '/game responde no-store');
    const gameAnon = await FIX.request('/game');
    ok(gameAnon.status === 302 && gameAnon.headers.get('location') === '/login', '/game sin sesión → /login');
    const loginC = await FIX.request('/login', { cookie: c });
    ok(loginC.status === 302 && loginC.headers.get('location') === '/lobby', '/login con sesión → /lobby');
    const loginPage = await FIX.request('/login');
    const loginHtml = await loginPage.text();
    ok(loginPage.status === 200 && loginHtml.includes('/register'), '/login sin sesión sirve login.html con link a /register');
    ok(/noindex/i.test(loginHtml), 'login.html es noindex');
  }

  // ---- healthz ----
  {
    const res = await FIX.request('/healthz');
    ok(res.status === 200 && (await res.json()).ok === true, '/healthz 200 con DB sana');
    FIX.store.failNext = { op: 'ping', error: new Error('db caída') };
    const bad = await FIX.request('/healthz');
    ok(bad.status === 503, '/healthz 503 con DB caída');
    const me = await FIX.request('/api/me', { cookie });
    FIX.store.failNext = { op: 'getSessionByTokenHash', error: new Error('db caída') };
    const meBad = await FIX.request('/api/me', { cookie });
    ok(meBad.status === 503, 'sesión no verificable por DB → 503 (sin asumir usuario)');
  }
} finally {
  await FIX.close();
}

// ---- rate limit 429 sin derivar ----
{
  const L = await startApp({
    users: [{ username: 'ana', password: 'correcta-123' }],
    env: { LOGIN_RATE_CAPACITY: '1', LOGIN_RATE_REFILL_PER_SEC: '0' },
  });
  try {
    const first = await L.request('/api/login', { method: 'POST', body: { username: 'ana', password: 'correcta-123' } });
    const second = await L.request('/api/login', { method: 'POST', body: { username: 'ana', password: 'correcta-123' } });
    ok(first.status === 200, 'rate limit: el primer login entra');
    ok(second.status === 429, 'rate limit: el segundo recibe 429');
    ok((await second.json()).error === 'rate_limited', 'rate limit: error rate_limited');
    ok(!second.headers.get('set-cookie'), 'rate limit: no crea sesión');
  } finally { await L.close(); }
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 auth HTTP (login, perfil, sesión, páginas) OK');
