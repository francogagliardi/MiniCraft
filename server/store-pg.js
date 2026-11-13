'use strict';
// Implementación PostgreSQL de la interfaz de store (users/sessions/admin_audit).
// Todas las consultas son parametrizadas; nunca se concatena SQL con datos.
const Permissions = require('./permissions.js');

const DUPLICATE = 'USERNAME_TAKEN';
const BOT_DUPLICATE = 'BOT_NAME_TAKEN';
const BOT_ACTIVE_LIMIT = 5;

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    skin: row.skin,
    active: row.active,
    permissions: Permissions.materializePermissions(row.permissions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Proyección pública: nunca expone `password_hash` (listados, admin, CLI).
function mapPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    skin: row.skin,
    active: row.active,
    permissions: Permissions.materializePermissions(row.permissions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  };
}

function mapAuditRow(row) {
  if (!row) return null;
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  return {
    id: row.id,
    action: row.action,
    actor: {
      id: row.actor_user_id == null ? null : row.actor_user_id,
      username: row.actor_username || details.actorUsername || null,
    },
    target: {
      id: row.target_user_id == null ? null : row.target_user_id,
      username: row.target_username || details.targetUsername || null,
    },
    details,
    createdAt: row.created_at,
  };
}

function isDuplicateUsername(e) {
  return e && e.code === '23505' && /users_username_lower_key/.test(String(e.constraint || ''));
}

function usernameTaken() {
  const e = new Error('username tomado');
  e.code = DUPLICATE;
  return e;
}

// Redondeo a un decimal de los NUMERIC(3,1)/(4,1): el módulo de config ya valida
// el paso 0.1; acá se garantiza que la fila guardada no derive por float.
const round1 = (v) => (Number.isFinite(+v) ? Math.round(+v * 10) / 10 : v);

function mapBot(row) {
  if (!row) return null;
  return {
    // BIGSERIAL llega como string desde `pg`: se normaliza a number para que los
    // ids del runtime, el store y la API sean siempre del mismo tipo.
    id: Number(row.id),
    name: row.name,
    behavior: row.behavior,
    skin: row.skin,
    hp: row.hp,
    damage: row.damage,
    reach: round1(row.reach),
    speed: round1(row.speed),
    takesDamage: row.takes_damage === true,
    flying: row.flying === true,
    active: row.active === true,
    createdBy: row.created_by == null ? null : Number(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isDuplicateBot(e) {
  return e && e.code === '23505' && /bots_name_lower_key/.test(String(e.constraint || ''));
}

function botNameTaken() {
  const e = new Error('nombre de bot tomado');
  e.code = BOT_DUPLICATE;
  return e;
}

const BOT_COLUMNS = `id, name, behavior, skin, hp, damage, reach, speed,
  takes_damage, flying, active, created_by, created_at, updated_at`;

function botValues(data = {}) {
  return [
    data.name, data.behavior, data.skin, data.hp, data.damage,
    round1(data.reach), round1(data.speed),
    data.takesDamage === true, data.flying === true, data.active === true,
    data.createdBy == null ? null : data.createdBy,
  ];
}


function createPgStore({ db, now = () => new Date() } = {}) {
  const t = () => now();

  async function insertUser(query, { username, passwordHash, role = 'user', skin = 'human', active = true, permissions = {} }) {
    try {
      const r = await query(
        `INSERT INTO users (username, password_hash, role, skin, active, permissions)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id, username, password_hash, role, skin, active, permissions, created_at, updated_at`,
        [username, passwordHash, role, skin, active !== false, JSON.stringify(permissions || {})],
      );
      return mapUser(r.rows[0]);
    } catch (e) {
      if (isDuplicateUsername(e)) throw usernameTaken();
      throw e;
    }
  }

  async function insertSession(query, { userId, tokenHash, expiresAt, at = t() }) {
    const r = await query(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $3)
       RETURNING id, token_hash, user_id, created_at, expires_at, last_seen_at, revoked_at`,
      [tokenHash, userId, at, expiresAt],
    );
    return mapSession(r.rows[0]);
  }

  // Operaciones parametrizadas sobre un `query` (pool o cliente de transacción).
  // Es la MISMA implementación para las rutas administrativas y para los tests.
  function scoped(query) {
    return {
      async getUserById(id) {
        const r = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
        return mapUser(r.rows[0]);
      },

      async getUserByUsername(username) {
        const r = await query(
          'SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1', [String(username || '')]);
        return mapUser(r.rows[0]);
      },

      async createUser(data) {
        return insertUser(query, data);
      },

      async countActiveAdmins({ excludeId = null } = {}) {
        const r = await query(
          `SELECT count(*)::int AS n FROM users
           WHERE role = 'admin' AND active
             AND ($1::bigint IS NULL OR id <> $1::bigint)`,
          [excludeId],
        );
        return r.rows[0].n;
      },

      // Actualiza solo los campos presentes en `patch` (allowlist del router).
      async updateAdminUser(id, patch = {}) {
        const sets = [];
        const params = [id];
        let n = 1;
        if (patch.skin !== undefined) { sets.push(`skin = $${++n}`); params.push(patch.skin); }
        if (patch.role !== undefined) { sets.push(`role = $${++n}`); params.push(patch.role); }
        if (patch.active !== undefined) { sets.push(`active = $${++n}`); params.push(patch.active !== false); }
        if (patch.permissions !== undefined) {
          sets.push(`permissions = $${++n}::jsonb`);
          params.push(JSON.stringify(patch.permissions || {}));
        }
        if (!sets.length) {
          const r = await query(
            'SELECT id, username, role, skin, active, permissions, created_at, updated_at FROM users WHERE id = $1 LIMIT 1',
            [id],
          );
          return mapPublicUser(r.rows[0]);
        }
        const r = await query(
          `UPDATE users SET ${sets.join(', ')}, updated_at = now()
           WHERE id = $1
           RETURNING id, username, role, skin, active, permissions, created_at, updated_at`,
          params,
        );
        return mapPublicUser(r.rows[0]);
      },

      async setUserPassword(id, passwordHash) {
        const r = await query(
          'UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [id, passwordHash]);
        return r.rowCount > 0;
      },

      async revokeUserSessions(userId) {
        const r = await query(
          'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
        return r.rowCount;
      },

      async deleteUser(id) {
        const r = await query('DELETE FROM users WHERE id = $1', [id]);
        return r.rowCount > 0;
      },

      async insertAudit({ actorUserId = null, targetUserId = null, action, details = {} }) {
        const r = await query(
          `INSERT INTO admin_audit (actor_user_id, target_user_id, action, details)
           VALUES ($1, $2, $3, $4::jsonb)
           RETURNING id, actor_user_id, target_user_id, action, details, created_at`,
          [actorUserId, targetUserId, action, JSON.stringify(details || {})],
        );
        return mapAuditRow(r.rows[0]);
      },

      // ---- bots (change panel-bots-custom) ----
      async getBotById(id) {
        const r = await query(`SELECT ${BOT_COLUMNS} FROM bots WHERE id = $1 LIMIT 1`, [id]);
        return mapBot(r.rows[0]);
      },

      async getBotByName(name) {
        const r = await query(
          `SELECT ${BOT_COLUMNS} FROM bots WHERE lower(name) = lower($1) LIMIT 1`, [String(name || '')]);
        return mapBot(r.rows[0]);
      },

      async listBots({ active } = {}) {
        const filter = active === true ? 'WHERE active' : active === false ? 'WHERE NOT active' : '';
        const r = await query(`SELECT ${BOT_COLUMNS} FROM bots ${filter} ORDER BY id`);
        return r.rows.map(mapBot);
      },

      async createBot(data = {}) {
        try {
          const r = await query(
            `INSERT INTO bots (name, behavior, skin, hp, damage, reach, speed,
                               takes_damage, flying, active, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING ${BOT_COLUMNS}`,
            botValues(data),
          );
          return mapBot(r.rows[0]);
        } catch (e) {
          if (isDuplicateBot(e)) throw botNameTaken();
          throw e;
        }
      },

      // Actualiza solo los campos de configuración presentes (allowlist del router).
      async updateBot(id, patch = {}) {
        const sets = [];
        const params = [id];
        let n = 1;
        const put = (col, v) => { sets.push(`${col} = $${++n}`); params.push(v); };
        if (patch.name !== undefined) put('name', patch.name);
        if (patch.behavior !== undefined) put('behavior', patch.behavior);
        if (patch.skin !== undefined) put('skin', patch.skin);
        if (patch.hp !== undefined) put('hp', patch.hp);
        if (patch.damage !== undefined) put('damage', patch.damage);
        if (patch.reach !== undefined) put('reach', round1(patch.reach));
        if (patch.speed !== undefined) put('speed', round1(patch.speed));
        if (patch.takesDamage !== undefined) put('takes_damage', patch.takesDamage === true);
        if (patch.flying !== undefined) put('flying', patch.flying === true);
        if (!sets.length) {
          const r = await query(`SELECT ${BOT_COLUMNS} FROM bots WHERE id = $1 LIMIT 1`, [id]);
          return mapBot(r.rows[0]);
        }
        try {
          const r = await query(
            `UPDATE bots SET ${sets.join(', ')}, updated_at = now()
             WHERE id = $1 RETURNING ${BOT_COLUMNS}`, params);
          return mapBot(r.rows[0]);
        } catch (e) {
          if (isDuplicateBot(e)) throw botNameTaken();
          throw e;
        }
      },

      async deleteBot(id) {
        const r = await query('DELETE FROM bots WHERE id = $1', [id]);
        return r.rowCount > 0;
      },

      async stopBot(id) {
        const r = await query(
          `UPDATE bots SET active = false, updated_at = now()
           WHERE id = $1 RETURNING ${BOT_COLUMNS}`, [id]);
        return mapBot(r.rows[0]);
      },

      async countActiveBots() {
        const r = await query('SELECT count(*)::int AS n FROM bots WHERE active');
        return r.rows[0].n;
      },
    };
  }

  const poolScoped = scoped((text, params) => db.query(text, params));

  return {
    async ping() { await db.query('SELECT 1'); return true; },

    async getUserByUsername(username) {
      const r = await db.query(
        'SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1', [String(username || '')]);
      return mapUser(r.rows[0]);
    },

    getUserById: (id) => poolScoped.getUserById(id),

    async listUsers() {
      const r = await db.query(
        `SELECT id, username, role, skin, active, permissions, created_at, updated_at
         FROM users ORDER BY lower(username)`,
      );
      return r.rows.map(mapPublicUser);
    },

    createUser: (data) => poolScoped.createUser(data),

    // Registro público: usuario + sesión en UNA transacción. Si cualquiera falla,
    // no queda cuenta creada sin sesión (ni sesión sin cuenta).
    async registerUser({ username, passwordHash, tokenHash, expiresAt }) {
      return db.withTransaction(async (client) => {
        const query = (text, params) => client.query(text, params);
        const user = await insertUser(query, {
          username, passwordHash, role: 'user', skin: 'human', active: true,
        });
        const session = await insertSession(query, {
          userId: user.id, tokenHash, expiresAt,
        });
        return { user, session };
      });
    },

    async updateUserSkin(id, skin) {
      const r = await db.query(
        'UPDATE users SET skin = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, skin]);
      return mapUser(r.rows[0]);
    },

    async setUserPassword(id, passwordHash) {
      return poolScoped.setUserPassword(id, passwordHash);
    },

    async setUserActive(id, active) {
      const r = await db.query(
        'UPDATE users SET active = $2, updated_at = now() WHERE id = $1', [id, active !== false]);
      return r.rowCount > 0;
    },

    updateAdminUser: (id, patch) => poolScoped.updateAdminUser(id, patch),
    deleteUser: (id) => poolScoped.deleteUser(id),
    countActiveAdmins: (opts) => poolScoped.countActiveAdmins(opts),
    insertAudit: (entry) => poolScoped.insertAudit(entry),

    async listAudit(limit = 50) {
      const n = Math.max(1, Math.min(200, Number.isFinite(+limit) ? (+limit | 0) : 50));
      const r = await db.query(
        `SELECT a.id, a.action, a.details, a.created_at, a.actor_user_id, a.target_user_id,
                actor.username AS actor_username, target.username AS target_username
         FROM admin_audit a
         LEFT JOIN users actor ON actor.id = a.actor_user_id
         LEFT JOIN users target ON target.id = a.target_user_id
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT $1`, [n]);
      return r.rows.map(mapAuditRow);
    },

    // Transacción administrativa: advisory lock + interfaz `tx` acotada. El lock
    // serializa las guardas entre réplicas; el commit/rollback lo maneja db.js.
    async withTransaction(fn) {
      return db.withTransaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['minicraft:admin-guards']);
        return fn(scoped((text, params) => client.query(text, params)));
      });
    },

    // ---- bots: interfaz pública (change panel-bots-custom) ----
    listBots: (opts) => poolScoped.listBots(opts),
    getBotById: (id) => poolScoped.getBotById(id),
    getBotByName: (name) => poolScoped.getBotByName(name),
    createBot: (data) => poolScoped.createBot(data),
    updateBot: (id, patch) => poolScoped.updateBot(id, patch),
    deleteBot: (id) => poolScoped.deleteBot(id),
    stopBot: (id) => poolScoped.stopBot(id),
    countActiveBots: () => poolScoped.countActiveBots(),

    // Lanzamiento con cupo: advisory lock dedicado (no el de guardas admin) y
    // lectura/actualización dentro de la MISMA transacción. Dos lanzamientos
    // simultáneos se serializan y solo uno puede ocupar el quinto lugar.
    async startBot(id) {
      return db.withTransaction(async (client) => {
        const query = (text, params) => client.query(text, params);
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['minicraft:bots-active']);
        const cur = await query(`SELECT ${BOT_COLUMNS} FROM bots WHERE id = $1 FOR UPDATE`, [id]);
        if (!cur.rows.length) return { status: 'not_found', bot: null };
        const bot = mapBot(cur.rows[0]);
        if (bot.active) return { status: 'already_active', bot };
        const count = await query('SELECT count(*)::int AS n FROM bots WHERE active');
        if (count.rows[0].n >= BOT_ACTIVE_LIMIT) return { status: 'limit', bot };
        const upd = await query(
          `UPDATE bots SET active = true, updated_at = now()
           WHERE id = $1 RETURNING ${BOT_COLUMNS}`, [id]);
        return { status: 'started', bot: mapBot(upd.rows[0]) };
      });
    },

    async createSession({ userId, tokenHash, expiresAt }) {
      return insertSession((text, params) => db.query(text, params), { userId, tokenHash, expiresAt });
    },

    async getSessionByTokenHash(tokenHash) {
      const r = await db.query(
        `SELECT s.id AS s_id, s.token_hash, s.user_id, s.created_at AS s_created_at,
                s.expires_at, s.last_seen_at, s.revoked_at,
                u.id AS u_id, u.username, u.password_hash, u.role, u.skin, u.active,
                u.permissions,
                u.created_at AS u_created_at, u.updated_at AS u_updated_at
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 LIMIT 1`, [tokenHash]);
      if (!r.rows.length) return null;
      const row = r.rows[0];
      return {
        session: {
          id: row.s_id, userId: row.user_id, tokenHash: row.token_hash,
          createdAt: row.s_created_at, expiresAt: row.expires_at,
          lastSeenAt: row.last_seen_at, revokedAt: row.revoked_at,
        },
        user: mapUser({
          id: row.u_id, username: row.username, password_hash: row.password_hash,
          role: row.role, skin: row.skin, active: row.active,
          permissions: row.permissions,
          created_at: row.u_created_at, updated_at: row.u_updated_at,
        }),
      };
    },

    async revokeSession(tokenHash) {
      const r = await db.query(
        'UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash]);
      return r.rowCount > 0;
    },

    async revokeUserSessions(userId) {
      return poolScoped.revokeUserSessions(userId);
    },

    async touchSession(sessionId, at) {
      await db.query('UPDATE sessions SET last_seen_at = $2 WHERE id = $1', [sessionId, at || t()]);
    },

    async cleanupSessions(before) {
      const cutoff = before instanceof Date ? before : new Date(before);
      const r = await db.query(
        `DELETE FROM sessions
         WHERE (revoked_at IS NOT NULL AND revoked_at < $1)
            OR (revoked_at IS NULL AND expires_at < $1)`, [cutoff]);
      return r.rowCount;
    },

    async close() { await db.close(); },
  };
}

module.exports = { createPgStore, DUPLICATE, BOT_DUPLICATE, mapAuditRow, mapBot, round1 };
