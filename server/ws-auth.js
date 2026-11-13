'use strict';
// Gate de autenticación del upgrade WebSocket: cookie de sesión para usuarios y
// `Authorization: Bearer <BOT_TOKEN>` para el bot de servicio (tiempo constante).
const A = require('./auth.js');
const CFG = require('./env-config.js');
const Permissions = require('./permissions.js');

const REASONS = { 401: 'Unauthorized', 503: 'Service Unavailable' };

function reject(socket, status) {
  try {
    socket.write(`HTTP/1.1 ${status} ${REASONS[status] || 'Error'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } catch (e) {}
  try { socket.destroy(); } catch (e) {}
}

function bearer(req) {
  const raw = req.headers.authorization;
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function createWsGate({ store, env = process.env, now = () => Date.now(), log = () => {}, warn = () => {} } = {}) {
  const token = CFG.botToken(env);

  async function authenticate(req) {
    const header = req.headers.authorization;
    if (typeof header === 'string' && header.length > 0) {
      const got = bearer(req);
      // Un Bearer inválido NO cae a cookie: es un cliente de servicio mal configurado.
      if (!token) return { status: 401 };
      if (!got || !A.tokensEqual(got, token)) return { status: 401 };
      return { kind: 'bot' };
    }

    const cookies = A.parseCookies(req.headers.cookie);
    const sid = cookies[A.SESSION_COOKIE];
    if (!sid) return { status: 401 };
    let found;
    try {
      found = await store.getSessionByTokenHash(A.hashToken(sid));
    } catch (e) {
      warn('   ⚠️ upgrade: error de base al verificar la sesión');
      return { status: 503 };
    }
    if (!found || !A.isSessionActive(found.session, found.user, now())) return { status: 401 };
    return {
      kind: 'user',
      sessionId: found.session.id,
      tokenHash: found.session.tokenHash,
      userId: found.user.id,
      username: found.user.username,
      role: found.user.role,
      skin: found.user.skin,
      permissions: Permissions.materializePermissions(found.user.permissions),
    };
  }

  async function handleUpgrade(req, socket, head, wss) {
    const auth = await authenticate(req);
    if (auth.status) { reject(socket, auth.status); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.auth = auth;
      wss.emit('connection', ws, req);
    });
  }

  // Revalidación periódica (heartbeat): devuelve false si la sesión dejó de valer.
  async function revalidate(ws) {
    const auth = ws && ws.auth;
    if (!auth || auth.kind !== 'user') return true;
    let found;
    try { found = await store.getSessionByTokenHash(auth.tokenHash); }
    catch (e) { return true; } // DB caída: no expulsamos por un error transitorio
    if (!found) return false;
    return A.isSessionActive(found.session, found.user, now());
  }

  return { authenticate, handleUpgrade, revalidate, hasBotToken: !!token };
}

module.exports = { createWsGate, reject };
