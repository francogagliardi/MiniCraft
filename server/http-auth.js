'use strict';
// Router HTTP de autenticación y páginas: login, registro público, logout,
// perfil, lobby/juego y healthcheck. Sin framework: un handler que devuelve
// `true` cuando atendió el pedido; si no, cae al estático histórico.
const fs = require('fs');
const path = require('path');
const A = require('./auth.js');
const Skins = require('./skins.js');
const RL = require('./rate-limit.js');
const CFG = require('./env-config.js');
const Permissions = require('./permissions.js');
const { createAdminRouter } = require('./admin-api.js');

const BODY_LIMIT = 8 * 1024;
const RATE_LOG_MS = 10000;

const ERRORS = {
  invalid_credentials: 'Usuario o contraseña incorrectos',
  invalid_request: 'Pedido inválido',
  invalid_username: 'El nombre de usuario no es válido (3 a 16 caracteres: letras, números, guion y guion bajo)',
  invalid_password: `La contraseña debe tener entre ${A.PASSWORD_MIN} y ${A.PASSWORD_MAX} caracteres`,
  username_taken: 'Ese nombre ya está en uso',
  username_reserved: 'Ese nombre está reservado',
  registration_disabled: 'El registro está cerrado',
  rate_limited: 'Demasiados intentos: esperá un momento',
  unauthorized: 'No autenticado',
  unavailable: 'Servicio no disponible, intentá de nuevo',
  invalid_skin: 'Ese aspecto no es válido',
};

function publicUser(u) {
  return {
    username: u.username,
    role: u.role,
    skin: u.skin,
    permissions: Permissions.materializePermissions(u.permissions),
  };
}

function clientIp(req, { trustProxy }) {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const first = xff.split(',')[0].trim();
      if (/^[0-9a-fA-F:.]{3,45}$/.test(first)) return first;
    }
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function createAuthRouter({ store, env = process.env, staticDir, now = () => Date.now(), log = console.log, warn = console.warn, onSessionRevoked, onPermissionsChanged, bots } = {}) {
  const secure = CFG.cookieSecure(env);
  const trustProxy = CFG.trustProxy(env);
  const registrationOpen = CFG.registrationEnabled(env, warn);
  const adminUser = CFG.adminUsername(env);
  const limiters = RL.createAuthLimiters({ env, now });
  let lastRateLog = 0;

  const admin = createAdminRouter({
    store, env, staticDir, now: () => now(), log, warn,
    currentSession, sameOrigin, readJson,
    clientIp: (req) => clientIp(req, { trustProxy }),
    secure, derivations: limiters.derivations,
    onSessionRevoked, onPermissionsChanged, bots,
  });

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

  function sendError(res, status, code, headers = {}) {
    sendJson(res, status, { error: code, message: ERRORS[code] || ERRORS.invalid_request }, headers);
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

  function readFile(name) {
    return fs.promises.readFile(path.join(staticDir, name), 'utf8');
  }

  // ---- CSRF / body ----
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
        if (!body || typeof body !== 'object' || Array.isArray(body)) { finish({ status: 400, error: 'invalid_request' }); return; }
        finish({ body });
      });
      req.on('error', () => finish({ status: 400, error: 'invalid_request' }));
    });
  }

  // ---- sesión ----
  function cookieToken(req) {
    const cookies = A.parseCookies(req.headers.cookie);
    return cookies[A.SESSION_COOKIE] || null;
  }

  // Devuelve { session, user, token } | null. Los errores de DB se propagan.
  async function currentSession(req) {
    const token = cookieToken(req);
    if (!token) return null;
    const found = await store.getSessionByTokenHash(A.hashToken(token));
    if (!found) return null;
    if (!A.isSessionActive(found.session, found.user, now())) return null;
    // Observabilidad: `last_seen_at` se actualiza como máximo cada 5 minutos y
    // NO extiende la expiración (la sesión es absoluta).
    const last = found.session.lastSeenAt instanceof Date
      ? found.session.lastSeenAt.getTime() : new Date(found.session.lastSeenAt).getTime();
    if (Number.isFinite(last) && now() - last > 5 * 60 * 1000) {
      Promise.resolve(store.touchSession(found.session.id, new Date(now()))).catch(() => {});
    }
    return { ...found, token };
  }

  async function revokeCookieSession(req) {
    const token = cookieToken(req);
    if (!token) return null;
    const hash = A.hashToken(token);
    const found = await store.getSessionByTokenHash(hash);
    if (!found) return null;
    await store.revokeSession(hash);
    return found.user.id;
  }

  function sessionCookie(token) {
    return A.serializeSessionCookie(token, { secure });
  }

  // ---- endpoints ----
  async function handleLogin(req, res) {
    if (!sameOrigin(req)) return sendError(res, 403, 'invalid_request'), true;
    const parsed = await readJson(req);
    if (parsed.status) return sendError(res, parsed.status, parsed.error), true;
    const { username, password } = parsed.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return sendError(res, 400, 'invalid_request'), true;
    }
    const release = limiters.login.tryAcquire();
    if (!release) { rateWarn('login'); return sendError(res, 429, 'rate_limited'), true; }
    try {
      const user = await store.getUserByUsername(username.trim());
      if (!user || user.active === false) {
        await A.burnPasswordCheck(password);
        return sendError(res, 401, 'invalid_credentials'), true;
      }
      const ok = await A.verifyPassword(password, user.passwordHash);
      if (!ok) return sendError(res, 401, 'invalid_credentials'), true;
      // Anti session fixation: revoca la sesión previa de esta cookie, si existe.
      await revokeCookieSession(req);
      const tok = A.createSessionToken();
      await store.createSession({
        userId: user.id, tokenHash: tok.tokenHash,
        expiresAt: new Date(now() + A.SESSION_MAX_AGE_SEC * 1000),
      });
      return sendJson(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(tok.token) }), true;
    } catch (e) {
      warn('   ⚠️ login: error de base: ' + (e && e.message));
      return sendError(res, 503, 'unavailable'), true;
    } finally {
      release();
    }
  }

  async function handleRegister(req, res) {
    if (!registrationOpen) return sendError(res, 403, 'registration_disabled'), true;
    if (!sameOrigin(req)) return sendError(res, 403, 'invalid_request'), true;
    const parsed = await readJson(req);
    if (parsed.status) return sendError(res, parsed.status, parsed.error), true;
    const body = parsed.body || {};
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!A.isValidUsername(username)) return sendError(res, 400, 'invalid_username'), true;
    if (A.isReservedUsername(username, { adminUsername: adminUser })) return sendError(res, 400, 'username_reserved'), true;
    if (!A.isValidPassword(password)) return sendError(res, 400, 'invalid_password'), true;

    const release = limiters.register.tryAcquire();
    if (!release) { rateWarn('registro'); return sendError(res, 429, 'rate_limited'), true; }
    try {
      const passwordHash = await A.hashPassword(password);
      const tok = A.createSessionToken();
      const { user } = await store.registerUser({
        username, passwordHash, tokenHash: tok.tokenHash,
        expiresAt: new Date(now() + A.SESSION_MAX_AGE_SEC * 1000),
      });
      // Anti-fixation: recién con el alta confirmada se revoca la sesión previa.
      await revokeCookieSession(req);
      log(`   ➕ registro: ${user.username}`);
      return sendJson(res, 201, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(tok.token) }), true;
    } catch (e) {
      if (e && e.code === 'USERNAME_TAKEN') return sendError(res, 409, 'username_taken'), true;
      warn('   ⚠️ registro: error de base: ' + (e && e.message));
      return sendError(res, 503, 'unavailable'), true;
    } finally {
      release();
    }
  }

  async function handleLogout(req, res) {
    if (!sameOrigin(req)) return sendError(res, 403, 'invalid_request'), true;
    const parsed = await readJson(req);
    if (parsed.status) return sendError(res, parsed.status, parsed.error), true;
    try {
      const userId = await revokeCookieSession(req);
      if (userId && typeof onSessionRevoked === 'function') onSessionRevoked(userId);
      res.writeHead(204, {
        'Set-Cookie': A.clearSessionCookie({ secure }),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end();
      return true;
    } catch (e) {
      warn('   ⚠️ logout: error de base: ' + (e && e.message));
      return sendError(res, 503, 'unavailable'), true;
    }
  }

  async function handleMe(req, res, method) {
    let session;
    try { session = await currentSession(req); }
    catch (e) { return sendError(res, 503, 'unavailable'), true; }
    if (!session) return sendError(res, 401, 'unauthorized'), true;
    if (method === 'GET') return sendJson(res, 200, { user: publicUser(session.user) }), true;

    // PATCH: solo skin.
    if (!sameOrigin(req)) return sendError(res, 403, 'invalid_request'), true;
    const parsed = await readJson(req);
    if (parsed.status) return sendError(res, parsed.status, parsed.error), true;
    const skin = parsed.body && parsed.body.skin;
    if (!Skins.isPlayerSkin(skin)) return sendError(res, 400, 'invalid_skin'), true;
    try {
      const updated = await store.updateUserSkin(session.user.id, skin);
      if (!updated) return sendError(res, 503, 'unavailable'), true;
      return sendJson(res, 200, { user: publicUser(updated) }), true;
    } catch (e) {
      warn('   ⚠️ perfil: error de base: ' + (e && e.message));
      return sendError(res, 503, 'unavailable'), true;
    }
  }

  async function serveRegisterPage(req, res) {
    let html;
    try { html = await readFile('register.html'); }
    catch (e) { return sendPage(res, 500, 'err'), true; }
    const openBlock = /<!-- register:open:start -->([\s\S]*?)<!-- register:open:end -->/;
    const closedBlock = /<!-- register:closed:start -->([\s\S]*?)<!-- register:closed:end -->/;
    const scriptBlock = /<!-- register:script:start -->([\s\S]*?)<!-- register:script:end -->/;
    if (registrationOpen) html = html.replace(closedBlock, '');
    else html = html.replace(openBlock, '').replace(scriptBlock, '');
    return sendPage(res, 200, html), true;
  }

  async function handle(req, res) {
    const method = req.method || 'GET';
    let urlPath;
    try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch (e) { return false; }
    if (urlPath.length > 1 && urlPath.endsWith('/')) urlPath = urlPath.replace(/\/+$/, '') || '/';

    if (urlPath === '/healthz' && method === 'GET') {
      try { await store.ping(); sendJson(res, 200, { ok: true }); }
      catch (e) { sendJson(res, 503, { ok: false }); }
      return true;
    }

    // API JSON.
    if (urlPath === '/api/login' && method === 'POST') return handleLogin(req, res);
    if (urlPath === '/api/register' && method === 'POST') return handleRegister(req, res);
    if (urlPath === '/api/logout' && method === 'POST') return handleLogout(req, res);
    if (urlPath === '/api/me' && (method === 'GET' || method === 'PATCH')) return handleMe(req, res, method);

    // Administración (CRUD de cuentas, auditoría y página /admin).
    if (urlPath === '/admin' || urlPath.startsWith('/api/admin/')) return admin.handle(req, res);

    // Rutas que no son de este router: si empiezan con /api/ respondemos 404 JSON.
    if (urlPath.startsWith('/api/')) { sendError(res, 404, 'invalid_request'); return true; }

    // Páginas.
    if (method !== 'GET' && method !== 'HEAD') return false;

    let session = null;
    if (urlPath === '/' || urlPath === '/login' || urlPath === '/register' || urlPath === '/lobby' || urlPath === '/game') {
      try { session = await currentSession(req); }
      catch (e) { sendError(res, 503, 'unavailable'); return true; }
    }

    if (urlPath === '/') { redirect(res, session ? '/lobby' : '/login'); return true; }
    if (urlPath === '/login') {
      if (session) { redirect(res, '/lobby'); return true; }
      try { sendPage(res, 200, await readFile('login.html')); } catch (e) { sendPage(res, 500, 'err'); }
      return true;
    }
    if (urlPath === '/register') {
      if (session) { redirect(res, '/lobby'); return true; }
      return serveRegisterPage(req, res);
    }
    if (urlPath === '/lobby') {
      if (!session) { redirect(res, '/login'); return true; }
      try { sendPage(res, 200, await readFile('lobby.html')); } catch (e) { sendPage(res, 500, 'err'); }
      return true;
    }
    if (urlPath === '/game') {
      if (!session) { redirect(res, '/login'); return true; }
      try { sendPage(res, 200, await readFile('index.html')); } catch (e) { sendPage(res, 500, 'err'); }
      return true;
    }
    return false;
  }

  return {
    handle,
    registrationOpen,
    limiters,
    clientIp: (req) => clientIp(req, { trustProxy }),
  };
}

module.exports = { createAuthRouter, publicUser, ERRORS, BODY_LIMIT };
