// Store en memoria con la MISMA interfaz que server/store-pg.js. Solo lo usan
// los tests (`server/test/*.mjs`); ningún flag de producción lo activa, así que
// no existe un camino de backdoor en el server real.
//
// No hace scrypt: recibe hashes ya calculados o utilidades de auth.js.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Permissions = require('../../permissions.js');

export class MemoryStore {
  constructor(opts = {}) {
    this.users = [];
    this.sessions = [];
    this.audit = [];
    this.nextUserId = 1;
    this.nextSessionId = 1;
    this.nextAuditId = 1;
    this.now = opts.now || (() => new Date());
    this.closed = false;
    this.failNext = null; // { op, error } para simular caídas puntuales (tests)
    this._txQueue = Promise.resolve(); // serializa transacciones (como el advisory lock)
    this._seed(opts.users || []);
  }

  _seed(list) {
    for (const u of list) {
      this.users.push({
        id: this.nextUserId++,
        username: u.username,
        passwordHash: u.passwordHash || 'scrypt$16384$8$1$AA$AA',
        role: u.role || 'user',
        skin: u.skin || 'human',
        active: u.active !== false,
        permissions: { ...(u.permissions || {}) },
        createdAt: u.createdAt || this.now(),
        updatedAt: u.updatedAt || this.now(),
      });
    }
  }

  _maybeFail(op) {
    if (this.failNext && this.failNext.op === op) {
      const e = this.failNext.error;
      this.failNext = null;
      throw e;
    }
  }

  _publicUser(u) {
    if (!u) return null;
    return { ...u, permissions: Permissions.materializePermissions(u.permissions) };
  }

  _auditView(entry) {
    const actor = this.users.find(x => String(x.id) === String(entry.actorUserId));
    const target = this.users.find(x => String(x.id) === String(entry.targetUserId));
    return {
      id: entry.id,
      action: entry.action,
      actor: {
        id: entry.actorUserId ?? null,
        username: actor ? actor.username : (entry.details.actorUsername || null),
      },
      target: {
        id: entry.targetUserId ?? null,
        username: target ? target.username : (entry.details.targetUsername || null),
      },
      details: { ...entry.details },
      createdAt: entry.createdAt,
    };
  }

  async ping() {
    this._maybeFail('ping');
    return true;
  }

  async getUserByUsername(username) {
    this._maybeFail('getUserByUsername');
    const key = String(username || '').toLowerCase();
    const u = this.users.find(x => x.username.toLowerCase() === key);
    return this._publicUser(u);
  }

  async getUserById(id) {
    this._maybeFail('getUserById');
    const u = this.users.find(x => String(x.id) === String(id));
    return this._publicUser(u);
  }

  async listUsers() {
    this._maybeFail('listUsers');
    return this.users.map(u => this._publicUser(u)).sort((a, b) => a.username.localeCompare(b.username));
  }

  async createUser({ username, passwordHash, role = 'user', skin = 'human', active = true, permissions = {} }) {
    this._maybeFail('createUser');
    if (this.users.some(u => u.username.toLowerCase() === String(username).toLowerCase())) {
      const e = new Error('username tomado');
      e.code = 'USERNAME_TAKEN';
      throw e;
    }
    const user = {
      id: this.nextUserId++, username, passwordHash, role, skin,
      active: active !== false, permissions: { ...(permissions || {}) },
      createdAt: this.now(), updatedAt: this.now(),
    };
    this.users.push(user);
    return this._publicUser(user);
  }

  async updateUserSkin(id, skin) {
    this._maybeFail('updateUserSkin');
    const u = this.users.find(x => String(x.id) === String(id));
    if (!u) return null;
    u.skin = skin;
    u.updatedAt = this.now();
    return this._publicUser(u);
  }

  // Misma semántica que store-pg: solo actualiza los campos presentes.
  async updateAdminUser(id, patch = {}) {
    this._maybeFail('updateAdminUser');
    const u = this.users.find(x => String(x.id) === String(id));
    if (!u) return null;
    if (patch.skin !== undefined) u.skin = patch.skin;
    if (patch.role !== undefined) u.role = patch.role;
    if (patch.active !== undefined) u.active = patch.active !== false;
    if (patch.permissions !== undefined) u.permissions = { ...(patch.permissions || {}) };
    u.updatedAt = this.now();
    return this._publicUser(u);
  }

  async setUserPassword(id, passwordHash) {
    this._maybeFail('setUserPassword');
    const u = this.users.find(x => String(x.id) === String(id));
    if (!u) return false;
    u.passwordHash = passwordHash;
    u.updatedAt = this.now();
    return true;
  }

  async setUserActive(id, active) {
    this._maybeFail('setUserActive');
    const u = this.users.find(x => String(x.id) === String(id));
    if (!u) return false;
    u.active = active !== false;
    u.updatedAt = this.now();
    return true;
  }

  async countActiveAdmins({ excludeId = null } = {}) {
    this._maybeFail('countActiveAdmins');
    return this.users.filter(u => u.role === 'admin' && u.active !== false &&
      (excludeId == null || String(u.id) !== String(excludeId))).length;
  }

  async deleteUser(id) {
    this._maybeFail('deleteUser');
    const idx = this.users.findIndex(x => String(x.id) === String(id));
    if (idx < 0) return false;
    this.users.splice(idx, 1);
    this.sessions = this.sessions.filter(s => String(s.userId) !== String(id));
    // ON DELETE SET NULL: la auditoría sobrevive con el snapshot en details.
    for (const e of this.audit) {
      if (String(e.actorUserId) === String(id)) e.actorUserId = null;
      if (String(e.targetUserId) === String(id)) e.targetUserId = null;
    }
    return true;
  }

  async insertAudit({ actorUserId = null, targetUserId = null, action, details = {} }) {
    this._maybeFail('insertAudit');
    const entry = {
      id: this.nextAuditId++, actorUserId, targetUserId, action,
      details: { ...(details || {}) }, createdAt: this.now(),
    };
    this.audit.push(entry);
    return this._auditView(entry);
  }

  async listAudit(limit = 50) {
    this._maybeFail('listAudit');
    const n = Math.max(1, Math.min(200, Number.isFinite(+limit) ? (+limit | 0) : 50));
    return this.audit.slice()
      .sort((a, b) => b.id - a.id)
      .slice(0, n)
      .map(e => this._auditView(e));
  }

  // Transacción con snapshot/rollback y serialización (en el server real el
  // advisory lock cumple el mismo rol entre réplicas).
  async withTransaction(fn) {
    this._maybeFail('withTransaction');
    const run = async () => {
      const snapshot = {
        users: this.users.map(u => ({ ...u, permissions: { ...u.permissions } })),
        sessions: this.sessions.map(s => ({ ...s })),
        audit: this.audit.map(a => ({ ...a, details: { ...a.details } })),
        nextUserId: this.nextUserId,
        nextSessionId: this.nextSessionId,
        nextAuditId: this.nextAuditId,
      };
      try {
        return await fn(this);
      } catch (e) {
        this.users = snapshot.users;
        this.sessions = snapshot.sessions;
        this.audit = snapshot.audit;
        this.nextUserId = snapshot.nextUserId;
        this.nextSessionId = snapshot.nextSessionId;
        this.nextAuditId = snapshot.nextAuditId;
        throw e;
      }
    };
    const p = this._txQueue.then(run, run);
    this._txQueue = p.then(() => {}, () => {});
    return p;
  }

  async createSession({ userId, tokenHash, expiresAt, now }) {
    this._maybeFail('createSession');
    const session = {
      id: this.nextSessionId++, userId, tokenHash,
      createdAt: now || this.now(), expiresAt,
      revokedAt: null, lastSeenAt: now || this.now(),
    };
    this.sessions.push(session);
    return { ...session };
  }

  // Registro público: usuario + sesión en una sola "transacción" (aquí, atómico
  // por construcción: si la sesión falla, se revierte el usuario insertado).
  async registerUser({ username, passwordHash, tokenHash, expiresAt, now }) {
    this._maybeFail('registerUser');
    const before = this.users.length;
    const user = await this.createUser({ username, passwordHash, role: 'user', skin: 'human', active: true });
    try {
      const session = await this.createSession({ userId: user.id, tokenHash, expiresAt, now });
      return { user, session };
    } catch (e) {
      this.users.length = before;
      throw e;
    }
  }

  async getSessionByTokenHash(tokenHash) {
    this._maybeFail('getSessionByTokenHash');
    const s = this.sessions.find(x => x.tokenHash === tokenHash);
    if (!s) return null;
    const u = this.users.find(x => String(x.id) === String(s.userId));
    if (!u) return null;
    return { session: { ...s }, user: this._publicUser(u) };
  }

  async revokeSession(tokenHash) {
    this._maybeFail('revokeSession');
    const s = this.sessions.find(x => x.tokenHash === tokenHash && !x.revokedAt);
    if (!s) return false;
    s.revokedAt = this.now();
    return true;
  }

  async revokeUserSessions(userId) {
    this._maybeFail('revokeUserSessions');
    let n = 0;
    for (const s of this.sessions) {
      if (String(s.userId) === String(userId) && !s.revokedAt) { s.revokedAt = this.now(); n++; }
    }
    return n;
  }

  async touchSession(sessionId, at) {
    this._maybeFail('touchSession');
    const s = this.sessions.find(x => String(x.id) === String(sessionId));
    if (s) s.lastSeenAt = at || this.now();
  }

  async cleanupSessions(before) {
    this._maybeFail('cleanupSessions');
    const cutoff = before instanceof Date ? before : new Date(before);
    const keep = [];
    let n = 0;
    for (const s of this.sessions) {
      const dead = (s.revokedAt && new Date(s.revokedAt) < cutoff)
        || (!s.revokedAt && new Date(s.expiresAt) < cutoff);
      if (dead) n++; else keep.push(s);
    }
    this.sessions = keep;
    return n;
  }

  async close() { this.closed = true; }
}

export default MemoryStore;
