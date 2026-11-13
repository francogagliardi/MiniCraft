// Tests de la API administrativa (HTTP + MemoryStore, sin DB real).
// Cubre CRUD, validaciones, guardas, auditoría, rate limit, CSRF y gate de /admin.
// Uso: node test/admin.mjs
import { startApp } from './support/app-fixture.mjs';
import { MemoryStore } from './support/memory-store.mjs';

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};
const json = (res) => res.json().catch(() => null);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ADMIN_PASSWORD = 'admin-12345';
const FIX = await startApp({
  users: [
    { username: 'admin', password: ADMIN_PASSWORD, role: 'admin', skin: 'human' },
    { username: 'root', password: ADMIN_PASSWORD, role: 'admin', skin: 'giant' },
    { username: 'ana', password: 'correcta-123', role: 'user', skin: 'human' },
  ],
});

let adminCookie = await FIX.login('admin', ADMIN_PASSWORD);
const anaCookie = await FIX.login('ana', 'correcta-123');

async function listUsers(cookie = adminCookie) {
  const res = await FIX.request('/api/admin/users', { cookie });
  return { res, body: await json(res) };
}
async function byName(name) {
  const { body } = await listUsers();
  return (body && body.users || []).find(u => u.username === name) || null;
}

try {
  // ===================================================================
  // 2.1 listado y gate
  // ===================================================================
  {
    const res = await FIX.request('/api/admin/users');
    const body = await json(res);
    ok(res.status === 401 && body.error === 'unauthorized', 'listado sin cookie → 401 unauthorized');

    const forbidden = await FIX.request('/api/admin/users', { cookie: anaCookie });
    const fb = await json(forbidden);
    ok(forbidden.status === 403 && fb.error === 'admin_required', 'listado con rol user → 403 admin_required');
    ok(!('users' in fb), 'el 403 no filtra datos de otras cuentas');

    const { res: r, body: b } = await listUsers();
    ok(r.status === 200 && Array.isArray(b.users) && b.users.length === 3, 'admin lista las tres cuentas');
    ok((r.headers.get('cache-control') || '').includes('no-store'), 'el listado responde Cache-Control: no-store');
    const names = b.users.map(u => u.username);
    ok(['admin', 'ana', 'root'].every(n => names.includes(n)), 'el listado trae todas las cuentas');
    const u = b.users.find(x => x.username === 'ana');
    for (const field of ['id', 'username', 'role', 'skin', 'active', 'permissions', 'createdAt', 'updatedAt']) {
      ok(u && field in u, `el usuario de admin incluye ${field}`);
    }
    ok(u.permissions && Object.keys(u.permissions).sort().join(',') === 'bot_ignore,fly,instant_break',
      'permissions materializa exactamente las tres claves');
    ok(!('passwordHash' in u) && !('password_hash' in u), 'el listado no expone el hash');
    ok(!JSON.stringify(b).includes('scrypt$'), 'ninguna respuesta del listado contiene un hash scrypt');
  }

  // ===================================================================
  // 2.2 alta de usuarios
  // ===================================================================
  {
    const res = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'beto', password: 'clave-1234', role: 'user', skin: 'small', permissions: { fly: true } },
    });
    const body = await json(res);
    ok(res.status === 201 && body.user && body.user.username === 'beto', 'alta válida → 201 con el usuario');
    ok(!res.headers.get('set-cookie'), 'el alta no crea sesión ni setea cookie');
    ok(body.user.active === true && body.user.role === 'user' && body.user.skin === 'small',
      'el alta aplica rol, skin y estado activo');
    ok(body.user.permissions.fly === true && body.user.permissions.bot_ignore === false &&
      body.user.permissions.instant_break === false, 'el alta materializa los permisos elegidos');
    ok(!('passwordHash' in body.user) && !JSON.stringify(body).includes('clave-1234'),
      'el alta no devuelve contraseña ni hash');
    ok((await byName('beto')) !== null, 'la cuenta creada aparece en el listado');
  }
  {
    const dup = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'BETO', password: 'clave-1234' },
    });
    ok(dup.status === 409 && (await json(dup)).error === 'username_taken',
      'username duplicado con otra capitalización → 409 username_taken');

    const reserved = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'admin', password: 'clave-1234' },
    });
    ok(reserved.status === 422 && (await json(reserved)).error === 'username_reserved',
      'username reservado → 422 username_reserved');

    const invalidName = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'ab', password: 'clave-1234' },
    });
    ok(invalidName.status === 422 && (await json(invalidName)).error === 'invalid_username',
      'username inválido → 422 invalid_username');

    const shortPass = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'malo_pass', password: 'corta12' },
    });
    ok(shortPass.status === 422 && (await json(shortPass)).error === 'invalid_password',
      'contraseña de 7 → 422 invalid_password');

    const badRole = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'malo_rol', password: 'clave-1234', role: 'superadmin' },
    });
    ok(badRole.status === 422 && (await json(badRole)).error === 'invalid_role',
      'role superadmin → 422 invalid_role');

    const badSkin = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'malo_skin', password: 'clave-1234', skin: 'robot' },
    });
    ok(badSkin.status === 422 && (await json(badSkin)).error === 'invalid_skin',
      'skin robot → 422 invalid_skin');

    const badPerm = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'malo_perm', password: 'clave-1234', permissions: { god_mode: true } },
    });
    const bp = await json(badPerm);
    ok(badPerm.status === 422 && bp.error === 'invalid_permissions',
      'permiso desconocido → 422 invalid_permissions');
    ok(bp.details && Array.isArray(bp.details.invalid) && bp.details.invalid.includes('god_mode'),
      'el 422 de permisos detalla la clave inválida');

    const nonBool = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'malo_bool', password: 'clave-1234', permissions: { fly: 'si' } },
    });
    const nb = await json(nonBool);
    ok(nonBool.status === 422 && nb.error === 'invalid_permissions' && nb.details.nonBoolean.includes('fly'),
      'permiso no booleano → 422 con detalle nonBoolean');

    for (const name of ['malo_rol', 'malo_skin', 'malo_perm', 'malo_bool', 'malo_pass']) {
      ok((await byName(name)) === null, `el alta rechazada (${name}) no crea la cuenta`);
    }
  }

  // ===================================================================
  // 2.3 edición acotada y username inmutable
  // ===================================================================
  {
    const created = await json(await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'carla', password: 'clave-1234', role: 'user', skin: 'human' },
    }));
    const id = created.user.id;

    const edit = await FIX.request(`/api/admin/users/${id}`, {
      method: 'PATCH', cookie: adminCookie,
      body: { skin: 'giant', role: 'admin', active: true },
    });
    const eb = await json(edit);
    ok(edit.status === 200 && eb.user.skin === 'giant' && eb.user.role === 'admin',
      'PATCH aplica skin y rol');
    ok(eb.user.username === 'carla', 'PATCH no cambia el username');

    const rename = await FIX.request(`/api/admin/users/${id}`, {
      method: 'PATCH', cookie: adminCookie, body: { username: 'otro' },
    });
    ok(rename.status === 422 && (await json(rename)).error === 'username_immutable',
      'PATCH con username distinto → 422 username_immutable');

    const sameName = await FIX.request(`/api/admin/users/${id}`, {
      method: 'PATCH', cookie: adminCookie, body: { username: 'carla' },
    });
    ok(sameName.status === 422 && (await json(sameName)).error === 'username_immutable',
      'PATCH con el mismo username también → 422 username_immutable');
    ok((await byName('carla')) !== null && (await byName('otro')) === null, 'el intento de renombrar no cambia nada');

    const passField = await FIX.request(`/api/admin/users/${id}`, {
      method: 'PATCH', cookie: adminCookie, body: { password: 'clave-9999' },
    });
    ok(passField.status === 422 && (await json(passField)).error === 'invalid_field',
      'PATCH con password → 422 invalid_field');

    const unknown = await FIX.request(`/api/admin/users/${id}`, {
      method: 'PATCH', cookie: adminCookie, body: { foo: 1 },
    });
    ok(unknown.status === 422 && (await json(unknown)).error === 'invalid_field',
      'PATCH con campo desconocido → 422 invalid_field');

    const empty = await FIX.request(`/api/admin/users/${id}`, {
      method: 'PATCH', cookie: adminCookie, body: {},
    });
    ok(empty.status === 400 && (await json(empty)).error === 'invalid_request',
      'PATCH sin campos editables → 400 invalid_request');

    const missing = await FIX.request('/api/admin/users/999999', {
      method: 'PATCH', cookie: adminCookie, body: { skin: 'small' },
    });
    ok(missing.status === 404 && (await json(missing)).error === 'user_not_found',
      'PATCH de id inexistente → 404 user_not_found');

    const badId = await FIX.request('/api/admin/users/abc', {
      method: 'PATCH', cookie: adminCookie, body: { skin: 'small' },
    });
    ok(badId.status === 400, 'PATCH con :id no numérico → 400');

    const perms = await FIX.request(`/api/admin/users/${id}`, {
      method: 'PATCH', cookie: adminCookie,
      body: { permissions: { fly: true, instant_break: true } },
    });
    const pb = await json(perms);
    ok(perms.status === 200 && pb.user.permissions.fly === true && pb.user.permissions.instant_break === true,
      'PATCH reemplaza el mapa de permisos');
    ok(pb.user.permissions.bot_ignore === false, 'el mapa reemplazado materializa el resto en false');

    const cleared = await FIX.request(`/api/admin/users/${id}`, {
      method: 'PATCH', cookie: adminCookie, body: { permissions: {} },
    });
    const cb = await json(cleared);
    ok(cleared.status === 200 && cb.user.permissions.fly === false && cb.user.permissions.instant_break === false,
      'PATCH con {} vacía los permisos');
  }

  // ===================================================================
  // 2.4 guardas de self y último admin
  // ===================================================================
  {
    const me = await byName('admin');
    const root = await byName('root');

    const degradeSelf = await FIX.request(`/api/admin/users/${me.id}`, {
      method: 'PATCH', cookie: adminCookie, body: { role: 'user' },
    });
    ok(degradeSelf.status === 409 && (await json(degradeSelf)).error === 'guard_self_action',
      'degradarse a sí mismo → 409 guard_self_action');
    ok((await byName('admin')).role === 'admin', 'la guarda de self no cambió el rol');

    const offSelf = await FIX.request(`/api/admin/users/${me.id}`, {
      method: 'PATCH', cookie: adminCookie, body: { active: false },
    });
    ok(offSelf.status === 409 && (await json(offSelf)).error === 'guard_self_action',
      'desactivarse a sí mismo → 409 guard_self_action');
    ok((await byName('admin')).active === true, 'la guarda de self no desactivó la cuenta');

    const deleteSelf = await FIX.request(`/api/admin/users/${me.id}`, {
      method: 'DELETE', cookie: adminCookie,
    });
    ok(deleteSelf.status === 409 && (await json(deleteSelf)).error === 'guard_self_action',
      'borrarse a sí mismo → 409 guard_self_action');
    ok((await byName('admin')) !== null, 'la guarda de self no borró la cuenta');

    // Con dos admins activos (admin y root), admin degrada a root: queda uno.
    const demoteRoot = await FIX.request(`/api/admin/users/${root.id}`, {
      method: 'PATCH', cookie: adminCookie, body: { role: 'user' },
    });
    ok(demoteRoot.status === 200, 'con dos admins, degradar al otro se aplica');
    ok((await byName('root')).role === 'user', 'el otro admin queda como user');
  }

  // ===================================================================
  // 2.5 reset de contraseña
  // ===================================================================
  {
    const created = await json(await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'dario', password: 'vieja-1234' },
    }));
    const id = created.user.id;
    const oldCookie = await FIX.login('dario', 'vieja-1234');

    const reset = await FIX.request(`/api/admin/users/${id}/password`, {
      method: 'POST', cookie: adminCookie, body: { password: 'nueva-1234' },
    });
    const rb = await json(reset);
    ok(reset.status === 200 && rb.ok === true && rb.sessionsRevoked >= 1,
      'reset válido → 200 {ok:true, sessionsRevoked}');
    ok(!JSON.stringify(rb).includes('nueva-1234'), 'la respuesta del reset no repite la contraseña');
    ok(!('self' in rb), 'el reset de otro usuario no marca self');

    const oldLogin = await FIX.request('/api/login', { method: 'POST', body: { username: 'dario', password: 'vieja-1234' } });
    ok(oldLogin.status === 401, 'la contraseña vieja deja de servir');
    const newLogin = await FIX.request('/api/login', { method: 'POST', body: { username: 'dario', password: 'nueva-1234' } });
    ok(newLogin.status === 200, 'la contraseña nueva permite entrar');
    const oldSession = await FIX.request('/api/me', { cookie: oldCookie });
    ok(oldSession.status === 401, 'la sesión previa del target queda revocada');

    const currentCookie = await FIX.login('dario', 'nueva-1234');
    const shortPass = await FIX.request(`/api/admin/users/${id}/password`, {
      method: 'POST', cookie: adminCookie, body: { password: 'corta12' },
    });
    ok(shortPass.status === 422 && (await json(shortPass)).error === 'invalid_password',
      'reset con contraseña corta → 422 invalid_password');
    const still = await FIX.request('/api/me', { cookie: currentCookie });
    ok(still.status === 200, 'el reset inválido no revoca sesiones');

    // Desactivar/reactivar para cubrir las acciones de auditoría.
    const off = await FIX.request(`/api/admin/users/${id}`, {
      method: 'PATCH', cookie: adminCookie, body: { active: false },
    });
    ok(off.status === 200 && (await json(off)).user.active === false, 'desactivar una cuenta devuelve 200');
    const offLogin = await FIX.request('/api/login', { method: 'POST', body: { username: 'dario', password: 'nueva-1234' } });
    ok(offLogin.status === 401, 'una cuenta inactiva no puede loguearse');
    const on = await FIX.request(`/api/admin/users/${id}`, {
      method: 'PATCH', cookie: adminCookie, body: { active: true },
    });
    ok(on.status === 200 && (await json(on)).user.active === true, 'reactivar la cuenta devuelve 200');

    // Reset de la propia cuenta: self:true + cookie limpia.
    const selfId = (await byName('admin')).id;
    const selfReset = await FIX.request(`/api/admin/users/${selfId}/password`, {
      method: 'POST', cookie: adminCookie, body: { password: 'admin-9999' },
    });
    const sb = await json(selfReset);
    ok(selfReset.status === 200 && sb.self === true, 'reset de la propia cuenta → self:true');
    ok(/Max-Age=0/.test(selfReset.headers.get('set-cookie') || ''), 'el reset propio limpia la cookie de sesión');
    const oldAdmin = await FIX.request('/api/me', { cookie: adminCookie });
    ok(oldAdmin.status === 401, 'la sesión propia queda revocada tras el reset');
    adminCookie = await FIX.login('admin', 'admin-9999');
    ok((await FIX.request('/api/me', { cookie: adminCookie })).status === 200,
      'el admin vuelve a entrar con la contraseña nueva');
  }

  // ===================================================================
  // 2.6 borrado definitivo
  // ===================================================================
  {
    const created = await json(await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'efimero', password: 'clave-1234' },
    }));
    const id = created.user.id;
    await FIX.login('efimero', 'clave-1234');

    const del = await FIX.request(`/api/admin/users/${id}`, { method: 'DELETE', cookie: adminCookie });
    ok(del.status === 204, 'DELETE de una cuenta → 204');
    ok((await del.text()) === '', 'el 204 no trae cuerpo');
    ok((del.headers.get('cache-control') || '').includes('no-store'), 'el DELETE responde no-store');
    const loginAfter = await FIX.request('/api/login', { method: 'POST', body: { username: 'efimero', password: 'clave-1234' } });
    ok(loginAfter.status === 401, 'la cuenta borrada ya no puede autenticarse');
    ok((await byName('efimero')) === null, 'la cuenta borrada desaparece del listado');

    const again = await FIX.request(`/api/admin/users/${id}`, { method: 'DELETE', cookie: adminCookie });
    ok(again.status === 404 && (await json(again)).error === 'user_not_found', 'borrar dos veces → 404');
  }

  // ===================================================================
  // 2.7 auditoría
  // ===================================================================
  {
    const res = await FIX.request('/api/admin/audit?limit=200', { cookie: adminCookie });
    const body = await json(res);
    ok(res.status === 200 && Array.isArray(body.entries) && body.entries.length > 0, 'la auditoría devuelve entradas');
    const actions = new Set(body.entries.map(e => e.action));
    for (const action of ['user.create', 'user.update', 'user.permissions', 'user.password',
      'user.activate', 'user.deactivate', 'user.delete', 'user.guard_rejected']) {
      ok(actions.has(action), `la auditoría registra ${action}`);
    }
    const ids = body.entries.map(e => e.id);
    ok(ids.every((v, i) => i === 0 || ids[i - 1] > v), 'las entradas vienen en orden descendente por id');
    const entry = body.entries.find(e => e.action === 'user.create');
    ok(entry.actor && entry.actor.username === 'admin', 'la entrada trae el actor');
    ok(entry.target && typeof entry.target.username === 'string', 'la entrada trae el target');
    ok(entry.details && typeof entry.details === 'object', 'la entrada trae detalles');
    const rejected = body.entries.find(e => e.action === 'user.guard_rejected');
    ok(rejected && rejected.details.reason === 'guard_self_action', 'el rechazo por guarda queda auditado con motivo');

    const serialized = JSON.stringify(body);
    for (const secret of ['nueva-1234', 'vieja-1234', 'admin-9999', 'clave-1234', 'scrypt$', 'mc_sid=']) {
      ok(!serialized.includes(secret), `la auditoría no contiene "${secret}"`);
    }

    const limited = await json(await FIX.request('/api/admin/audit?limit=10', { cookie: adminCookie }));
    ok(limited.entries.length <= 10, 'limit=10 acota la respuesta');
    const zero = await FIX.request('/api/admin/audit?limit=0', { cookie: adminCookie });
    ok(zero.status === 200 || zero.status === 400, 'limit=0 responde acotado o 400, sin crash');
    const bad = await FIX.request('/api/admin/audit?limit=abc', { cookie: adminCookie });
    ok(bad.status === 400 && (await json(bad)).error === 'invalid_request', 'limit no numérico → 400');
    const denied = await FIX.request('/api/admin/audit', { cookie: anaCookie });
    ok(denied.status === 403, 'un usuario común no ve la auditoría');
  }

  // ===================================================================
  // 2.8 protección de la API y gate de /admin
  // ===================================================================
  {
    const foreign = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'csrf1', password: 'clave-1234' },
      headers: { Origin: 'https://otro-sitio.example' },
    });
    ok(foreign.status === 403, 'Origin ajeno → 403');
    ok((await byName('csrf1')) === null, 'el pedido con Origin ajeno no crea la cuenta');

    const crossSite = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'csrf2', password: 'clave-1234' },
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    });
    ok(crossSite.status === 403, 'Sec-Fetch-Site cross-site → 403');

    const textPlain = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie, body: 'username=x',
      headers: { 'Content-Type': 'text/plain' },
    });
    ok(textPlain.status === 415, 'Content-Type text/plain → 415');

    const big = await FIX.request('/api/admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'grande', password: 'x'.repeat(9000) },
    });
    ok(big.status === 413, 'body > 8 KB → 413');

    const noStore = await FIX.request('/api/admin/users', { cookie: adminCookie });
    ok((noStore.headers.get('cache-control') || '').includes('no-store'), 'las respuestas admin llevan no-store');
    ok((noStore.headers.get('x-content-type-options') || '') === 'nosniff', 'las respuestas admin llevan nosniff');

    FIX.store.failNext = { op: 'getSessionByTokenHash', error: new Error('db caída') };
    const down = await FIX.request('/api/admin/users', { cookie: adminCookie });
    ok(down.status === 503 && (await json(down)).error === 'unavailable', 'base caída → 503 unavailable');
  }
  {
    const anon = await FIX.request('/admin');
    ok(anon.status === 302 && anon.headers.get('location') === '/login', '/admin sin sesión → 302 /login');
    const user = await FIX.request('/admin', { cookie: anaCookie });
    ok(user.status === 302 && user.headers.get('location') === '/lobby', '/admin con rol user → 302 /lobby');
    const adminPage = await FIX.request('/admin', { cookie: adminCookie });
    const html = await adminPage.text();
    ok(adminPage.status === 200 && html.includes('id="usersTable"'), '/admin con admin → 200 admin.html');
    ok((adminPage.headers.get('cache-control') || '').includes('no-store'), '/admin responde no-store');
  }
} finally {
  await FIX.close();
}

// ===================================================================
// 2.8 rate limit admin (bucket propio)
// ===================================================================
{
  const L = await startApp({
    users: [{ username: 'admin', password: ADMIN_PASSWORD, role: 'admin' }],
    env: { ADMIN_RATE_CAPACITY: '2', ADMIN_RATE_REFILL_PER_SEC: '0' },
  });
  try {
    const c = await L.login('admin', ADMIN_PASSWORD);
    const first = await L.request('/api/admin/users', { cookie: c });
    const second = await L.request('/api/admin/users', { cookie: c });
    const third = await L.request('/api/admin/users', { cookie: c });
    ok(first.status === 200 && second.status === 200, 'rate limit admin: las dos primeras pasan');
    ok(third.status === 429 && (await third.json()).error === 'rate_limited', 'rate limit admin: la tercera → 429');
    const create = await L.request('/api/admin/users', {
      method: 'POST', cookie: c, body: { username: 'bloqueado', password: 'clave-1234' },
    });
    ok(create.status === 429, 'rate limit admin: el POST también recibe 429');
    ok((await L.store.getUserByUsername('bloqueado')) === null, 'el 429 no tiene efectos en la base');
  } finally { await L.close(); }
}

// ===================================================================
// 2.4 guard_last_admin: segunda mutación con sesión ya validada (carrera)
// ===================================================================
{
  const base = new MemoryStore();
  let enteredResolve;
  const entered = new Promise(r => { enteredResolve = r; });
  let releaseResolve;
  const release = new Promise(r => { releaseResolve = r; });
  let first = true;
  const gated = new Proxy(base, {
    get(target, prop) {
      if (prop === 'withTransaction') {
        return async (fn) => {
          if (first) { first = false; enteredResolve(); await release; }
          return base.withTransaction(fn);
        };
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const G = await startApp({
    store: gated,
    users: [
      { username: 'g1', password: ADMIN_PASSWORD, role: 'admin' },
      { username: 'g2', password: ADMIN_PASSWORD, role: 'admin' },
    ],
  });
  try {
    const c1 = await G.login('g1', ADMIN_PASSWORD);
    const c2 = await G.login('g2', ADMIN_PASSWORD);
    const list = await json(await G.request('/api/admin/users', { cookie: c1 }));
    const g1 = list.users.find(u => u.username === 'g1');
    const g2 = list.users.find(u => u.username === 'g2');

    const pending = G.request(`/api/admin/users/${g2.id}`, {
      method: 'PATCH', cookie: c1, body: { role: 'user' },
    });
    await entered;
    const second = await G.request(`/api/admin/users/${g1.id}`, {
      method: 'PATCH', cookie: c2, body: { role: 'user' },
    });
    ok(second.status === 200, 'carrera de guardas: la primera mutación se aplica');
    releaseResolve();
    const firstRes = await pending;
    const fb = await json(firstRes);
    ok(firstRes.status === 409 && fb.error === 'guard_last_admin',
      'carrera de guardas: la segunda → 409 guard_last_admin');
    const after = await json(await G.request('/api/admin/users', { cookie: c2 }));
    const activeAdmins = after.users.filter(u => u.role === 'admin' && u.active);
    ok(activeAdmins.length === 1, 'carrera de guardas: queda exactamente un admin activo');
  } finally { await G.close(); }
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 API administrativa (CRUD, guardas, auditoría y protección) OK');
