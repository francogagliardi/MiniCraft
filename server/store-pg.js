'use strict';
// Implementación PostgreSQL de la interfaz de store (users/sessions/admin_audit).
// Todas las consultas son parametrizadas; nunca se concatena SQL con datos.
const Permissions = require('./permissions.js');

const DUPLICATE = 'USERNAME_TAKEN';

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

module.exports = { createPgStore, DUPLICATE, mapAuditRow };
