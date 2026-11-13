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
    this.bots = [];
    this.nextUserId = 1;
    this.nextSessionId = 1;
    this.nextAuditId = 1;
    this.nextBotId = 1;
    this.now = opts.now || (() => new Date());
    this.closed = false;
    this.failNext = null; // { op, error } para simular caídas puntuales (tests)
    this._txQueue = Promise.resolve(); // serializa transacciones (como el advisory lock)
    this._seed(opts.users || []);
    this._seedBots(opts.bots || []);
  }

  _seedBots(list) {
    for (const b of list) {
      this.bots.push({
        id: this.nextBotId++,
        name: b.name,
        behavior: b.behavior || 'cazador',
        skin: b.skin || 'human',
        hp: b.hp ?? 10,
        damage: b.damage ?? 0,
        reach: b.reach ?? 4.6,
        speed: b.speed ?? 6,
        takesDamage: b.takesDamage === true,
        flying: b.flying === true,
        active: b.active === true,
        createdBy: b.createdBy ?? null,
        createdAt: b.createdAt || this.now(),
        updatedAt: b.updatedAt || this.now(),
      });
    }
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
    // FK bots.created_by ON DELETE SET NULL.
    for (const b of this.bots) {
      if (String(b.createdBy) === String(id)) b.createdBy = null;
    }
    return true;
  }

  // ---- bots (misma interfaz que store-pg.js) ----
  _bot(id) {
    return this.bots.find(b => String(b.id) === String(id)) || null;
  }

  _botView(b) {
    return b ? { ...b } : null;
  }

  async listBots({ active } = {}) {
    this._maybeFail('listBots');
    const list = active === true ? this.bots.filter(b => b.active === true)
      : active === false ? this.bots.filter(b => b.active !== true)
        : this.bots;
    return list.slice().sort((a, b) => a.id - b.id).map(b => this._botView(b));
  }

  async getBotById(id) {
    this._maybeFail('getBotById');
    return this._botView(this._bot(id));
  }

  async getBotByName(name) {
    this._maybeFail('getBotByName');
    const key = String(name || '').toLowerCase();
    return this._botView(this.bots.find(b => b.name.toLowerCase() === key));
  }

  async createBot(data = {}) {
    this._maybeFail('createBot');
    if (this.bots.some(b => b.name.toLowerCase() === String(data.name).toLowerCase())) {
      const e = new Error('nombre de bot tomado');
      e.code = 'BOT_NAME_TAKEN';
      throw e;
    }
    const bot = {
      id: this.nextBotId++,
      name: data.name,
      behavior: data.behavior || 'cazador',
      skin: data.skin || 'human',
      hp: data.hp ?? 10,
      damage: data.damage ?? 0,
      reach: data.reach ?? 4.6,
      speed: data.speed ?? 6,
      takesDamage: data.takesDamage === true,
      flying: data.flying === true,
      active: data.active === true,
      createdBy: data.createdBy ?? null,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.bots.push(bot);
    return this._botView(bot);
  }

  async updateBot(id, patch = {}) {
    this._maybeFail('updateBot');
    const bot = this._bot(id);
    if (!bot) return null;
    if (patch.name !== undefined) {
      const clash = this.bots.some(b => String(b.id) !== String(id) &&
        b.name.toLowerCase() === String(patch.name).toLowerCase());
      if (clash) {
        const e = new Error('nombre de bot tomado');
        e.code = 'BOT_NAME_TAKEN';
        throw e;
      }
      bot.name = patch.name;
    }
    if (patch.behavior !== undefined) bot.behavior = patch.behavior;
    if (patch.skin !== undefined) bot.skin = patch.skin;
    if (patch.hp !== undefined) bot.hp = patch.hp;
    if (patch.damage !== undefined) bot.damage = patch.damage;
    if (patch.reach !== undefined) bot.reach = Math.round(+patch.reach * 10) / 10;
    if (patch.speed !== undefined) bot.speed = Math.round(+patch.speed * 10) / 10;
    if (patch.takesDamage !== undefined) bot.takesDamage = patch.takesDamage === true;
    if (patch.flying !== undefined) bot.flying = patch.flying === true;
    bot.updatedAt = this.now();
    return this._botView(bot);
  }

  async deleteBot(id) {
    this._maybeFail('deleteBot');
    const idx = this.bots.findIndex(b => String(b.id) === String(id));
    if (idx < 0) return false;
    this.bots.splice(idx, 1);
    return true;
  }

  async stopBot(id) {
    this._maybeFail('stopBot');
    const bot = this._bot(id);
    if (!bot) return null;
    bot.active = false;
    bot.updatedAt = this.now();
    return this._botView(bot);
  }

  async countActiveBots() {
    this._maybeFail('countActiveBots');
    return this.bots.filter(b => b.active === true).length;
  }

  // Igual que store-pg: serializa con la cola y valida el cupo en la misma sección
  // crítica (en Postgres lo hace pg_advisory_xact_lock).
  async startBot(id) {
    this._maybeFail('startBot');
    const run = async () => {
      const bot = this._bot(id);
      if (!bot) return { status: 'not_found', bot: null };
      if (bot.active === true) return { status: 'already_active', bot: this._botView(bot) };
      if (this.bots.filter(b => b.active === true).length >= 5) {
        return { status: 'limit', bot: this._botView(bot) };
      }
      bot.active = true;
      bot.updatedAt = this.now();
      return { status: 'started', bot: this._botView(bot) };
    };
    const p = this._txQueue.then(run, run);
    this._txQueue = p.then(() => {}, () => {});
    return p;
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
        bots: this.bots.map(b => ({ ...b })),
        nextUserId: this.nextUserId,
        nextSessionId: this.nextSessionId,
        nextAuditId: this.nextAuditId,
        nextBotId: this.nextBotId,
      };
      try {
        return await fn(this);
      } catch (e) {
        this.users = snapshot.users;
        this.sessions = snapshot.sessions;
        this.audit = snapshot.audit;
        this.bots = snapshot.bots;
        this.nextUserId = snapshot.nextUserId;
        this.nextSessionId = snapshot.nextSessionId;
        this.nextAuditId = snapshot.nextAuditId;
        this.nextBotId = snapshot.nextBotId;
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
