// Store en memoria con la MISMA interfaz que server/store-pg.js. Solo lo usan
// los tests (`server/test/*.mjs`); ningún flag de producción lo activa, así que
// no existe un camino de backdoor en el server real.
//
// No hace scrypt: recibe hashes ya calculados o utilidades de auth.js.

export class MemoryStore {
  constructor(opts = {}) {
    this.users = [];
    this.sessions = [];
    this.nextUserId = 1;
    this.nextSessionId = 1;
    this.now = opts.now || (() => new Date());
    this.closed = false;
    this.failNext = null; // { op, error } para simular caídas puntuales (tests)
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
    return u ? { ...u } : null;
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

  async createUser({ username, passwordHash, role = 'user', skin = 'human', active = true }) {
    this._maybeFail('createUser');
    if (this.users.some(u => u.username.toLowerCase() === String(username).toLowerCase())) {
      const e = new Error('username tomado');
      e.code = 'USERNAME_TAKEN';
      throw e;
    }
    const user = {
      id: this.nextUserId++, username, passwordHash, role, skin,
      active: active !== false, createdAt: this.now(), updatedAt: this.now(),
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
