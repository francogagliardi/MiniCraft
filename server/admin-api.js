'use strict';
// API administrativa de Minicraft (change admin-crud-permisos): CRUD acotado de
// cuentas, guardas de integridad del último admin/self, auditoría append-only,
// permisos por usuario y gate de la página /admin. Sin framework HTTP.
const fs = require('fs');
const path = require('path');
const A = require('./auth.js');
const Skins = require('./skins.js');
const RL = require('./rate-limit.js');
const CFG = require('./env-config.js');
const Permissions = require('./permissions.js');
const BotConfig = require('./bot-config.js');
const Behaviors = require('./bot-behaviors.js');

const BODY_LIMIT = 8 * 1024;
const RATE_LOG_MS = 10000;
const EDITABLE_FIELDS = ['skin', 'role', 'active', 'permissions'];

const ERRORS = {
  invalid_request: 'Pedido inválido',
  invalid_username: 'El nombre de usuario no es válido (3 a 16 caracteres: letras, números, guion y guion bajo)',
  invalid_password: `La contraseña debe tener entre ${A.PASSWORD_MIN} y ${A.PASSWORD_MAX} caracteres`,
  username_taken: 'Ese nombre ya está en uso',
  username_reserved: 'Ese nombre está reservado',
  invalid_skin: 'Ese aspecto no es válido',
  invalid_role: 'El rol debe ser user o admin',
  invalid_permissions: 'Los permisos enviados no son válidos',
  username_immutable: 'El nombre de usuario no se puede cambiar',
  invalid_field: 'Hay un campo que no se puede editar',
  user_not_found: 'Esa cuenta no existe',
  guard_self_action: 'No podés desactivar, borrar ni degradar tu propia cuenta',
  guard_last_admin: 'El sistema debe conservar al menos un admin activo',
  unauthorized: 'No autenticado',
  admin_required: 'Se requiere rol de administrador',
  rate_limited: 'Demasiadas acciones: esperá un momento',
  unavailable: 'Servicio no disponible, intentá de nuevo',
  invalid_bot_name: 'El nombre del bot debe tener 3 a 16 caracteres: letras, números, guion y guion bajo',
  invalid_behavior: 'Ese comportamiento no existe',
  invalid_hp: 'La vida debe ser un entero entre 1 y 100',
  invalid_damage: 'El daño debe ser un entero entre 0 y 20',
  invalid_reach: 'El alcance debe ir de 1 a 10 con paso de 0.1',
  invalid_speed: 'La velocidad debe ir de 1 a 30 con paso de 0.1',
  invalid_flag: 'Ese valor debe ser verdadero o falso',
  bot_name_taken: 'Ese nombre de bot ya está en uso',
  bot_not_found: 'Ese bot no existe',
  bot_active: 'Detené el bot antes de borrarlo',
  bot_limit_reached: 'Ya hay cinco bots activos: detené uno para lanzar otro',
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Compara dos mapas de permisos por sus claves `true` (canónico, sin importar orden).
function samePermissions(a, b) {
  const canonical = (p) => Object.keys(Permissions.materializePermissions(p))
    .filter(k => Permissions.materializePermissions(p)[k] === true).sort();
  const ka = canonical(a);
  const kb = canonical(b);
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

function createAdminRouter({
  store, env = process.env, staticDir, now = Date.now,
  log = console.log, warn = console.warn,
  onSessionRevoked, onPermissionsChanged,
  currentSession: injectedSession, sameOrigin: injectedSameOrigin,
  readJson: injectedReadJson, clientIp: injectedClientIp,
  secure = CFG.cookieSecure(env), derivations,
  bots = null,
} = {}) {
  const adminLimiter = RL.createAdminLimiter({ env, now });
  const trustProxy = CFG.trustProxy(env);
  const adminUser = CFG.adminUsername(env);
  const deriveLimit = derivations || RL.createConcurrencyLimiter(env.AUTH_MAX_CONCURRENT || 2);
  let lastRateLog = 0;

  function rateWarn(what) {
    const t = now();
    if (t - lastRateLog < RATE_LOG_MS) return;
    lastRateLog = t;
    warn(`   ⚠️ ${what} rechazado por rate limit`);
  }

  function sendJson(res, status, body, headers = {}) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(data),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    res.end(data);
  }

  function sendError(res, status, code, extra = {}) {
    sendJson(res, status, { error: code, message: ERRORS[code] || ERRORS.invalid_request, ...extra });
  }

  function sendPage(res, status, html, headers = {}) {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      ...headers,
    });
    res.end(html);
  }

  function redirect(res, location) {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
    res.end();
  }

  function sendNoContent(res, headers = {}) {
    res.writeHead(204, {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    res.end();
  }

  // ---- CSRF / body / IP (por defecto; http-auth inyecta sus versiones) ----
  function sameOrigin(req) {
    const host = String(req.headers.host || '');
    const secFetch = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    if (secFetch === 'cross-site') return false;
    const origin = req.headers.origin;
    if (origin) {
      try { return new URL(origin).host === host; } catch (e) { return false; }
    }
    const referer = req.headers.referer;
    if (referer) {
      try { return new URL(referer).host === host; } catch (e) { return false; }
    }
    return true;
  }

  function readJson(req) {
    return new Promise((resolve) => {
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      if (!ct.startsWith('application/json')) { resolve({ status: 415, error: 'invalid_request' }); return; }
      let size = 0;
      const chunks = [];
      let done = false;
      const finish = (v) => { if (done) return; done = true; resolve(v); };
      req.on('data', (c) => {
        if (done) return;
        size += c.length;
        if (size > BODY_LIMIT) {
          finish({ status: 413, error: 'invalid_request' });
          try { req.pause(); } catch (e) {}
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (done) return;
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) { finish({ status: 400, error: 'invalid_request' }); return; }
        let body;
        try { body = JSON.parse(raw); } catch (e) { finish({ status: 400, error: 'invalid_request' }); return; }
        if (!isPlainObject(body)) { finish({ status: 400, error: 'invalid_request' }); return; }
        finish({ body });
      });
      req.on('error', () => finish({ status: 400, error: 'invalid_request' }));
    });
  }

  function clientIp(req) {
    if (trustProxy) {
      const xff = req.headers['x-forwarded-for'];
      if (typeof xff === 'string' && xff.trim()) {
        const first = xff.split(',')[0].trim();
        if (/^[0-9a-fA-F:.]{3,45}$/.test(first)) return first;
      }
    }
    return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
  }

  const readBody = injectedReadJson || readJson;
  const originOk = injectedSameOrigin || sameOrigin;
  const ipOf = injectedClientIp || clientIp;
  const getSession = injectedSession || (async (req) => {
    const cookies = A.parseCookies(req.headers.cookie);
    const token = cookies[A.SESSION_COOKIE];
    if (!token) return null;
    const found = await store.getSessionByTokenHash(A.hashToken(token));
    if (!found) return null;
    if (!A.isSessionActive(found.session, found.user, now())) return null;
    return { ...found, token };
  });

  // ---- gate ----
  async function requireAdmin(req, res) {
    let session;
    try { session = await getSession(req); }
    catch (e) { sendError(res, 503, 'unavailable'); return null; }
    if (!session) { sendError(res, 401, 'unauthorized'); return null; }
    if (session.user.role !== 'admin') { sendError(res, 403, 'admin_required'); return null; }
    return session;
  }

  function rateLimited(req, res, what) {
    if (adminLimiter.tryTake(ipOf(req))) return false;
    rateWarn(what);
    sendError(res, 429, 'rate_limited');
    return true;
  }

  function parseId(raw) {
    if (!/^\d+$/.test(String(raw || ''))) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  function auditSnapshots(actor, target) {
    return {
      actorUsername: actor.username,
      targetUsername: target ? target.username : null,
    };
  }

  async function rejectGuard(session, target, reason, attempted) {
    try {
      await store.insertAudit({
        actorUserId: session.user.id,
        targetUserId: target ? target.id : null,
        action: 'user.guard_rejected',
        details: {
          reason,
          attempted,
          ...auditSnapshots(session.user, target),
        },
      });
    } catch (e) {
      warn('   ⚠️ admin: no se pudo auditar el rechazo: ' + (e && e.message));
    }
  }

  // ---- GET /api/admin/users ----
  async function handleList(req, res) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (rateLimited(req, res, 'admin:list')) return true;
    try {
      const users = await store.listUsers();
      sendJson(res, 200, { users: users.map(Permissions.adminUserView) });
    } catch (e) {
      warn('   ⚠️ admin: error al listar: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
    }
    return true;
  }

  // ---- GET /api/admin/audit ----
  async function handleAudit(req, res) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (rateLimited(req, res, 'admin:audit')) return true;
    const query = String(req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(query);
    let limit = 50;
    const raw = params.get('limit');
    if (raw !== null && raw !== '') {
      if (!/^\d+$/.test(raw)) { sendError(res, 400, 'invalid_request'); return true; }
      limit = Math.max(1, Math.min(200, Number(raw)));
    }
    try {
      const entries = await store.listAudit(limit);
      sendJson(res, 200, { entries });
    } catch (e) {
      warn('   ⚠️ admin: error al leer auditoría: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
    }
    return true;
  }

  // ---- POST /api/admin/users ----
  async function handleCreate(req, res) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (!originOk(req)) { sendError(res, 403, 'invalid_request'); return true; }
    if (rateLimited(req, res, 'admin:create')) return true;
    const parsed = await readBody(req);
    if (parsed.status) { sendError(res, parsed.status, parsed.error); return true; }
    const body = parsed.body || {};

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = body.role === undefined ? 'user' : body.role;
    const skin = body.skin === undefined ? 'human' : body.skin;
    const active = body.active === undefined ? true : body.active;

    if (!A.isValidUsername(username)) { sendError(res, 422, 'invalid_username'); return true; }
    if (A.isReservedUsername(username, { adminUsername: adminUser })) {
      sendError(res, 422, 'username_reserved'); return true;
    }
    if (!A.isValidPassword(password)) { sendError(res, 422, 'invalid_password'); return true; }
    if (role !== 'user' && role !== 'admin') { sendError(res, 422, 'invalid_role'); return true; }
    if (!Skins.isPlayerSkin(skin)) { sendError(res, 422, 'invalid_skin'); return true; }
    if (typeof active !== 'boolean') { sendError(res, 422, 'invalid_field'); return true; }
    const perms = Permissions.normalizePermissions(body.permissions === undefined ? {} : body.permissions);
    if (!perms.ok) {
      sendError(res, 422, 'invalid_permissions', { details: { invalid: perms.invalid, nonBoolean: perms.nonBoolean } });
      return true;
    }

    const release = deriveLimit.tryAcquire();
    if (!release) { rateWarn('admin:create scrypt'); sendError(res, 429, 'rate_limited'); return true; }
    try {
      const passwordHash = await A.hashPassword(password);
      const user = await store.withTransaction(async (tx) => {
        const created = await tx.createUser({ username, passwordHash, role, skin, active, permissions: perms.value });
        await tx.insertAudit({
          actorUserId: session.user.id,
          targetUserId: created.id,
          action: 'user.create',
          details: {
            username: created.username, role, skin,
            permissions: Permissions.materializePermissions(perms.value),
            ...auditSnapshots(session.user, created),
          },
        });
        return created;
      });
      log(`   👤 admin ${session.user.username} → user.create ${user.username}`);
      sendJson(res, 201, { user: Permissions.adminUserView(user) });
    } catch (e) {
      if (e && e.code === 'USERNAME_TAKEN') { sendError(res, 409, 'username_taken'); return true; }
      warn('   ⚠️ admin: error al crear: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
    } finally {
      release();
    }
    return true;
  }

  // ---- PATCH /api/admin/users/:id ----
  async function handlePatch(req, res, rawId) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (!originOk(req)) { sendError(res, 403, 'invalid_request'); return true; }
    if (rateLimited(req, res, 'admin:patch')) return true;
    const id = parseId(rawId);
    if (!id) { sendError(res, 400, 'invalid_request'); return true; }
    const parsed = await readBody(req);
    if (parsed.status) { sendError(res, parsed.status, parsed.error); return true; }
    const body = parsed.body || {};

    if (Object.prototype.hasOwnProperty.call(body, 'username')) {
      sendError(res, 422, 'username_immutable'); return true;
    }
    for (const key of Object.keys(body)) {
      if (!EDITABLE_FIELDS.includes(key)) { sendError(res, 422, 'invalid_field'); return true; }
    }
    if (!Object.keys(body).some(k => EDITABLE_FIELDS.includes(k))) {
      sendError(res, 400, 'invalid_request'); return true;
    }

    const patch = {};
    if (body.skin !== undefined) {
      if (!Skins.isPlayerSkin(body.skin)) { sendError(res, 422, 'invalid_skin'); return true; }
      patch.skin = body.skin;
    }
    if (body.role !== undefined) {
      if (body.role !== 'user' && body.role !== 'admin') { sendError(res, 422, 'invalid_role'); return true; }
      patch.role = body.role;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') { sendError(res, 422, 'invalid_field'); return true; }
      patch.active = body.active;
    }
    if (body.permissions !== undefined) {
      const perms = Permissions.normalizePermissions(body.permissions);
      if (!perms.ok) {
        sendError(res, 422, 'invalid_permissions', { details: { invalid: perms.invalid, nonBoolean: perms.nonBoolean } });
        return true;
      }
      patch.permissions = perms.value;
    }

    let outcome;
    try {
      outcome = await store.withTransaction(async (tx) => {
        const target = await tx.getUserById(id);
        if (!target) return { notFound: true };
        const self = String(target.id) === String(session.user.id);
        const wouldDegrade = patch.role === 'user' && target.role === 'admin';
        const wouldDeactivate = patch.active === false && target.active !== false;

        if (self && (wouldDegrade || wouldDeactivate)) {
          return { guard: 'guard_self_action', target };
        }
        if (target.role === 'admin' && target.active !== false && (wouldDegrade || wouldDeactivate)) {
          const remaining = await tx.countActiveAdmins({ excludeId: target.id });
          if (remaining === 0) return { guard: 'guard_last_admin', target };
        }

        const changes = {};
        if (patch.skin !== undefined && patch.skin !== target.skin) changes.skin = [target.skin, patch.skin];
        if (patch.role !== undefined && patch.role !== target.role) changes.role = [target.role, patch.role];
        if (patch.active !== undefined && patch.active !== (target.active !== false)) {
          changes.active = [target.active !== false, patch.active];
        }
        const permissionsChanged = patch.permissions !== undefined &&
          !samePermissions(patch.permissions, target.permissions);
        const roleChanged = changes.role !== undefined;
        const deactivated = changes.active !== undefined && patch.active === false;

        if (!Object.keys(changes).length && !permissionsChanged) {
          return { user: Permissions.adminUserView(target), unchanged: true };
        }

        let sessionsRevoked = 0;
        if (roleChanged || deactivated) sessionsRevoked = await tx.revokeUserSessions(target.id);
        const updated = await tx.updateAdminUser(target.id, patch);

        if (changes.skin || changes.role) {
          await tx.insertAudit({
            actorUserId: session.user.id, targetUserId: target.id, action: 'user.update',
            details: { changes, ...auditSnapshots(session.user, target) },
          });
        }
        if (permissionsChanged) {
          await tx.insertAudit({
            actorUserId: session.user.id, targetUserId: target.id, action: 'user.permissions',
            details: {
              before: Permissions.materializePermissions(target.permissions),
              after: Permissions.materializePermissions(patch.permissions),
              ...auditSnapshots(session.user, target),
            },
          });
        }
        if (changes.active) {
          await tx.insertAudit({
            actorUserId: session.user.id, targetUserId: target.id,
            action: patch.active ? 'user.activate' : 'user.deactivate',
            details: { active: patch.active, sessionsRevoked, ...auditSnapshots(session.user, target) },
          });
        }

        return {
          user: updated, target, permissionsChanged, revoked: roleChanged || deactivated,
        };
      });
    } catch (e) {
      warn('   ⚠️ admin: error al editar: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
      return true;
    }

    if (outcome.notFound) { sendError(res, 404, 'user_not_found'); return true; }
    if (outcome.guard) {
      const attempted = {};
      if (patch.role !== undefined) attempted.role = patch.role;
      if (patch.active !== undefined) attempted.active = patch.active;
      await rejectGuard(session, outcome.target, outcome.guard, attempted);
      sendError(res, 409, outcome.guard);
      return true;
    }
    if (outcome.permissionsChanged && typeof onPermissionsChanged === 'function') {
      try { onPermissionsChanged(outcome.user.id, Permissions.materializePermissions(outcome.user.permissions)); }
      catch (e) { warn('   ⚠️ admin: hook de permisos: ' + (e && e.message)); }
    }
    if (outcome.revoked && typeof onSessionRevoked === 'function') {
      try { onSessionRevoked(outcome.user.id); }
      catch (e) { warn('   ⚠️ admin: hook de revocación: ' + (e && e.message)); }
    }
    if (!outcome.unchanged) {
      log(`   ✏️  admin ${session.user.username} → user.update ${outcome.target.username}`);
    }
    sendJson(res, 200, { user: outcome.user });
    return true;
  }

  // ---- POST /api/admin/users/:id/password ----
  async function handlePassword(req, res, rawId) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (!originOk(req)) { sendError(res, 403, 'invalid_request'); return true; }
    if (rateLimited(req, res, 'admin:password')) return true;
    const id = parseId(rawId);
    if (!id) { sendError(res, 400, 'invalid_request'); return true; }
    const parsed = await readBody(req);
    if (parsed.status) { sendError(res, parsed.status, parsed.error); return true; }
    const password = parsed.body && typeof parsed.body.password === 'string' ? parsed.body.password : '';
    if (!A.isValidPassword(password)) { sendError(res, 422, 'invalid_password'); return true; }

    const release = deriveLimit.tryAcquire();
    if (!release) { rateWarn('admin:password scrypt'); sendError(res, 429, 'rate_limited'); return true; }
    let outcome;
    try {
      const passwordHash = await A.hashPassword(password);
      outcome = await store.withTransaction(async (tx) => {
        const target = await tx.getUserById(id);
        if (!target) return { notFound: true };
        await tx.setUserPassword(target.id, passwordHash);
        const sessionsRevoked = await tx.revokeUserSessions(target.id);
        await tx.insertAudit({
          actorUserId: session.user.id, targetUserId: target.id, action: 'user.password',
          details: { passwordChanged: true, sessionsRevoked, ...auditSnapshots(session.user, target) },
        });
        return { target, sessionsRevoked };
      });
    } catch (e) {
      warn('   ⚠️ admin: error al resetear contraseña: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
      return true;
    } finally {
      release();
    }

    if (outcome.notFound) { sendError(res, 404, 'user_not_found'); return true; }
    if (typeof onSessionRevoked === 'function') {
      try { onSessionRevoked(outcome.target.id); }
      catch (e) { warn('   ⚠️ admin: hook de revocación: ' + (e && e.message)); }
    }
    const self = String(outcome.target.id) === String(session.user.id);
    log(`   🔑 admin ${session.user.username} → user.password ${outcome.target.username}`);
    sendJson(res, 200,
      { ok: true, sessionsRevoked: outcome.sessionsRevoked, ...(self ? { self: true } : {}) },
      self ? { 'Set-Cookie': A.clearSessionCookie({ secure }) } : {});
    return true;
  }

  // ---- DELETE /api/admin/users/:id ----
  async function handleDelete(req, res, rawId) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (!originOk(req)) { sendError(res, 403, 'invalid_request'); return true; }
    if (rateLimited(req, res, 'admin:delete')) return true;
    const id = parseId(rawId);
    if (!id) { sendError(res, 400, 'invalid_request'); return true; }

    let outcome;
    try {
      outcome = await store.withTransaction(async (tx) => {
        const target = await tx.getUserById(id);
        if (!target) return { notFound: true };
        if (String(target.id) === String(session.user.id)) {
          return { guard: 'guard_self_action', target };
        }
        if (target.role === 'admin' && target.active !== false) {
          const remaining = await tx.countActiveAdmins({ excludeId: target.id });
          if (remaining === 0) return { guard: 'guard_last_admin', target };
        }
        await tx.insertAudit({
          actorUserId: session.user.id, targetUserId: target.id, action: 'user.delete',
          details: {
            username: target.username, role: target.role, skin: target.skin,
            ...auditSnapshots(session.user, target),
          },
        });
        await tx.deleteUser(target.id);
        return { target };
      });
    } catch (e) {
      warn('   ⚠️ admin: error al borrar: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
      return true;
    }

    if (outcome.notFound) { sendError(res, 404, 'user_not_found'); return true; }
    if (outcome.guard) {
      await rejectGuard(session, outcome.target, outcome.guard, { delete: true });
      sendError(res, 409, outcome.guard);
      return true;
    }
    if (typeof onSessionRevoked === 'function') {
      try { onSessionRevoked(outcome.target.id); }
      catch (e) { warn('   ⚠️ admin: hook de revocación: ' + (e && e.message)); }
    }
    log(`   🗑️  admin ${session.user.username} → user.delete ${outcome.target.username}`);
    sendNoContent(res);
    return true;
  }

  // ---- GET /admin ----
  async function handlePage(req, res) {
    let session;
    try { session = await getSession(req); }
    catch (e) { sendError(res, 503, 'unavailable'); return true; }
    if (!session) { redirect(res, '/login'); return true; }
    if (session.user.role !== 'admin') { redirect(res, '/lobby'); return true; }
    try {
      const html = await fs.promises.readFile(path.join(staticDir, 'admin.html'), 'utf8');
      sendPage(res, 200, html);
    } catch (e) {
      warn('   ⚠️ admin: no pude servir admin.html: ' + (e && e.message));
      sendPage(res, 500, 'err');
    }
    return true;
  }

  // ---- bots: helpers y handlers (change panel-bots-custom) ----
  function botRuntimeState(row) {
    if (!row || !row.active || !bots || typeof bots.runtimeState !== 'function') return null;
    return bots.runtimeState(row.id);
  }

  function botDetails(errors) {
    const first = errors[0] || { field: null, reason: 'valor inválido' };
    return { details: { field: first.field, reason: first.reason, errors } };
  }

  function sendValidation(res, errors) {
    sendError(res, 422, errors[0].code, botDetails(errors));
  }

  async function botNameInUse(name) {
    if (await store.getUserByUsername(name)) return true;
    return !!(await store.getBotByName(name));
  }

  async function auditBot(session, action, bot, extra = {}) {
    await store.insertAudit({
      actorUserId: session.user.id, targetUserId: null, action,
      details: {
        botId: bot.id, botName: bot.name, behavior: bot.behavior, ...extra,
        actorUsername: session.user.username,
      },
    });
  }

  // ---- GET /api/admin/bots ----
  async function handleBotsList(req, res) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (rateLimited(req, res, 'admin:bots:list')) return true;
    try {
      const rows = await store.listBots();
      sendJson(res, 200, {
        bots: rows.map(row => BotConfig.botView(row, botRuntimeState(row))),
        limits: { maxActive: BotConfig.BOT_LIMITS.maxActive },
        catalog: { behaviors: Behaviors.listBehaviors(), skins: BotConfig.BOT_SKINS },
      });
    } catch (e) {
      warn('   ⚠️ admin: error al listar bots: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
    }
    return true;
  }

  // ---- POST /api/admin/bots ----
  async function handleBotCreate(req, res) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (!originOk(req)) { sendError(res, 403, 'invalid_request'); return true; }
    if (rateLimited(req, res, 'admin:bots:create')) return true;
    const parsed = await readBody(req);
    if (parsed.status) { sendError(res, parsed.status, parsed.error); return true; }

    const norm = BotConfig.normalizeBotInput(parsed.body || {});
    if (!norm.ok) { sendValidation(res, norm.errors); return true; }

    try {
      const outcome = await store.withTransaction(async (tx) => {
        if (await tx.getBotByName(norm.value.name)) return { taken: true };
        if (await tx.getUserByUsername(norm.value.name)) return { taken: true };
        const created = await tx.createBot({ ...norm.value, createdBy: session.user.id });
        await tx.insertAudit({
          actorUserId: session.user.id, targetUserId: null, action: 'bot.create',
          details: {
            botId: created.id, botName: created.name, behavior: created.behavior,
            actorUsername: session.user.username,
          },
        });
        return { created };
      });
      if (outcome.taken) {
        sendError(res, 409, 'bot_name_taken', { details: { field: 'name', reason: 'ese nombre ya está en uso' } });
        return true;
      }
      log(`   🤖 admin ${session.user.username} → bot.create ${outcome.created.name}`);
      sendJson(res, 201, { bot: BotConfig.botView(outcome.created, botRuntimeState(outcome.created)) });
    } catch (e) {
      if (e && e.code === 'BOT_NAME_TAKEN') {
        sendError(res, 409, 'bot_name_taken', { details: { field: 'name', reason: 'ese nombre de bot ya está en uso' } });
        return true;
      }
      warn('   ⚠️ admin: error al crear bot: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
    }
    return true;
  }

  // ---- PATCH /api/admin/bots/:id ----
  async function handleBotPatch(req, res, rawId) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (!originOk(req)) { sendError(res, 403, 'invalid_request'); return true; }
    if (rateLimited(req, res, 'admin:bots:patch')) return true;
    const id = parseId(rawId);
    if (!id) { sendError(res, 400, 'invalid_request'); return true; }
    const parsed = await readBody(req);
    if (parsed.status) { sendError(res, parsed.status, parsed.error); return true; }
    const body = parsed.body || {};

    const norm = BotConfig.normalizeBotInput(body, { partial: true });
    if (!norm.ok) { sendValidation(res, norm.errors); return true; }
    const changes = Object.keys(norm.value);
    if (!changes.length) { sendError(res, 400, 'invalid_request'); return true; }
    // `active` nunca entra en `value` (normalize lo marca invalid_field).

    if (norm.value.name && await botNameInUse(norm.value.name)) {
      const current = await store.getBotById(id);
      if (!current) { sendError(res, 404, 'bot_not_found'); return true; }
      if (current.name.toLowerCase() !== norm.value.name.toLowerCase()) {
        sendError(res, 409, 'bot_name_taken', { details: { field: 'name', reason: 'ese nombre ya está en uso' } });
        return true;
      }
    }

    let outcome;
    try {
      outcome = await store.withTransaction(async (tx) => {
        const current = await tx.getBotById(id);
        if (!current) return { notFound: true };
        const updated = await tx.updateBot(id, norm.value);
        await tx.insertAudit({
          actorUserId: session.user.id, targetUserId: null, action: 'bot.update',
          details: {
            botId: updated.id, botName: updated.name, behavior: updated.behavior,
            before: BotConfig.botView(current), after: BotConfig.botView(updated),
            actorUsername: session.user.username,
          },
        });
        return { updated, wasActive: current.active === true };
      });
    } catch (e) {
      if (e && e.code === 'BOT_NAME_TAKEN') {
        sendError(res, 409, 'bot_name_taken', { details: { field: 'name', reason: 'ese nombre de bot ya está en uso' } });
        return true;
      }
      warn('   ⚠️ admin: error al editar bot: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
      return true;
    }

    if (outcome.notFound) { sendError(res, 404, 'bot_not_found'); return true; }
    // Edición en caliente: se reemplaza el avatar (leave + join) y la vida vuelve
    // a su hp configurado, para que el panel y el juego muestren lo mismo.
    if (outcome.wasActive && bots) {
      try { bots.stop(id); bots.spawn(outcome.updated); }
      catch (e) { warn('   ⚠️ admin: no se pudo aplicar la edición en caliente: ' + (e && e.message)); }
    }
    log(`   🤖 admin ${session.user.username} → bot.update ${outcome.updated.name}`);
    sendJson(res, 200, { bot: BotConfig.botView(outcome.updated, botRuntimeState(outcome.updated)) });
    return true;
  }

  // ---- DELETE /api/admin/bots/:id ----
  async function handleBotDelete(req, res, rawId) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (!originOk(req)) { sendError(res, 403, 'invalid_request'); return true; }
    if (rateLimited(req, res, 'admin:bots:delete')) return true;
    const id = parseId(rawId);
    if (!id) { sendError(res, 400, 'invalid_request'); return true; }

    let outcome;
    try {
      outcome = await store.withTransaction(async (tx) => {
        const target = await tx.getBotById(id);
        if (!target) return { notFound: true };
        if (target.active === true) return { active: true };
        await tx.insertAudit({
          actorUserId: session.user.id, targetUserId: null, action: 'bot.delete',
          details: {
            botId: target.id, botName: target.name, behavior: target.behavior,
            actorUsername: session.user.username,
          },
        });
        await tx.deleteBot(target.id);
        return { target };
      });
    } catch (e) {
      warn('   ⚠️ admin: error al borrar bot: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
      return true;
    }
    if (outcome.notFound) { sendError(res, 404, 'bot_not_found'); return true; }
    if (outcome.active) {
      sendError(res, 409, 'bot_active', { details: { field: 'active', reason: 'detené el bot antes de borrarlo' } });
      return true;
    }
    log(`   🗑️  admin ${session.user.username} → bot.delete ${outcome.target.name}`);
    sendNoContent(res);
    return true;
  }

  // ---- POST /api/admin/bots/:id/start | stop ----
  async function handleBotStart(req, res, rawId) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (!originOk(req)) { sendError(res, 403, 'invalid_request'); return true; }
    if (rateLimited(req, res, 'admin:bots:start')) return true;
    const id = parseId(rawId);
    if (!id) { sendError(res, 400, 'invalid_request'); return true; }

    let outcome;
    try { outcome = await store.startBot(id); }
    catch (e) {
      warn('   ⚠️ admin: error al lanzar bot: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
      return true;
    }
    if (outcome.status === 'not_found') { sendError(res, 404, 'bot_not_found'); return true; }
    if (outcome.status === 'limit') { sendError(res, 409, 'bot_limit_reached'); return true; }
    if (outcome.status === 'already_active') {
      sendJson(res, 200, { bot: BotConfig.botView(outcome.bot, botRuntimeState(outcome.bot)) });
      return true;
    }

    // Persistido como activo: recién ahora se materializa en el mundo. Si el spawn
    // falla (config corrupta), se revierte para no dejar activo sin runtime.
    try {
      if (bots) bots.spawn(outcome.bot);
    } catch (e) {
      warn('   ⚠️ admin: no se pudo spawnear el bot: ' + (e && e.message));
      try { await store.stopBot(id); } catch (e2) { /* se loguea el 503 igual */ }
      sendError(res, 503, 'unavailable');
      return true;
    }
    try { await auditBot(session, 'bot.start', outcome.bot); }
    catch (e) { warn('   ⚠️ admin: no se pudo auditar bot.start: ' + (e && e.message)); }
    log(`   🤖 admin ${session.user.username} → bot.start ${outcome.bot.name}`);
    sendJson(res, 200, { bot: BotConfig.botView(outcome.bot, botRuntimeState(outcome.bot)) });
    return true;
  }

  async function handleBotStop(req, res, rawId) {
    const session = await requireAdmin(req, res);
    if (!session) return true;
    if (!originOk(req)) { sendError(res, 403, 'invalid_request'); return true; }
    if (rateLimited(req, res, 'admin:bots:stop')) return true;
    const id = parseId(rawId);
    if (!id) { sendError(res, 400, 'invalid_request'); return true; }

    let bot;
    try { bot = await store.stopBot(id); }
    catch (e) {
      warn('   ⚠️ admin: error al detener bot: ' + (e && e.message));
      sendError(res, 503, 'unavailable');
      return true;
    }
    if (!bot) { sendError(res, 404, 'bot_not_found'); return true; }
    try { if (bots) bots.stop(id); }
    catch (e) { warn('   ⚠️ admin: no se pudo detener el runtime del bot: ' + (e && e.message)); }
    try { await auditBot(session, 'bot.stop', bot); }
    catch (e) { warn('   ⚠️ admin: no se pudo auditar bot.stop: ' + (e && e.message)); }
    log(`   🤖 admin ${session.user.username} → bot.stop ${bot.name}`);
    sendJson(res, 200, { bot: BotConfig.botView(bot, botRuntimeState(bot)) });
    return true;
  }

  async function route(req, res) {
    const method = req.method || 'GET';
    let urlPath;
    try { urlPath = decodeURIComponent(String(req.url || '').split('?')[0]); } catch (e) { return false; }
    if (urlPath.length > 1 && urlPath.endsWith('/')) urlPath = urlPath.replace(/\/+$/, '') || '/';

    if (urlPath === '/admin') {
      if (method !== 'GET' && method !== 'HEAD') return false;
      return handlePage(req, res);
    }
    if (urlPath === '/api/admin/users') {
      if (method === 'GET') return handleList(req, res);
      if (method === 'POST') return handleCreate(req, res);
      sendError(res, 404, 'invalid_request');
      return true;
    }
    let m = urlPath.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
    if (m) {
      if (method !== 'POST') { sendError(res, 404, 'invalid_request'); return true; }
      return handlePassword(req, res, m[1]);
    }
    m = urlPath.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (m) {
      if (method === 'PATCH') return handlePatch(req, res, m[1]);
      if (method === 'DELETE') return handleDelete(req, res, m[1]);
      sendError(res, 404, 'invalid_request');
      return true;
    }
    if (urlPath === '/api/admin/audit') {
      if (method !== 'GET') { sendError(res, 404, 'invalid_request'); return true; }
      return handleAudit(req, res);
    }
    if (urlPath === '/api/admin/bots') {
      if (method === 'GET') return handleBotsList(req, res);
      if (method === 'POST') return handleBotCreate(req, res);
      sendError(res, 404, 'invalid_request');
      return true;
    }
    let bm = urlPath.match(/^\/api\/admin\/bots\/([^/]+)\/(start|stop)$/);
    if (bm) {
      if (method !== 'POST') { sendError(res, 404, 'invalid_request'); return true; }
      return bm[2] === 'start' ? handleBotStart(req, res, bm[1]) : handleBotStop(req, res, bm[1]);
    }
    bm = urlPath.match(/^\/api\/admin\/bots\/([^/]+)$/);
    if (bm) {
      if (method === 'PATCH') return handleBotPatch(req, res, bm[1]);
      if (method === 'DELETE') return handleBotDelete(req, res, bm[1]);
      sendError(res, 404, 'invalid_request');
      return true;
    }
    if (urlPath.startsWith('/api/admin/')) {
      sendError(res, 404, 'invalid_request');
      return true;
    }
    return false;
  }

  async function handle(req, res) {
    try {
      return await route(req, res);
    } catch (e) {
      warn('   ⚠️ admin: error inesperado: ' + (e && e.message));
      if (!res.headersSent) sendError(res, 503, 'unavailable');
      else { try { res.end(); } catch (e2) {} }
      return true;
    }
  }

  return { handle, limiter: adminLimiter, ERRORS };
}

module.exports = { createAdminRouter, ERRORS, BODY_LIMIT };
