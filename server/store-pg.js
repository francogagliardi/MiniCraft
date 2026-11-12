'use strict';
// Implementación PostgreSQL de la interfaz de store (users/sessions).
// Todas las consultas son parametrizadas; nunca se concatena SQL con datos.
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

  async function insertUser(query, { username, passwordHash, role = 'user', skin = 'human', active = true }) {
    try {
      const r = await query(
        `INSERT INTO users (username, password_hash, role, skin, active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, password_hash, role, skin, active, created_at, updated_at`,
        [username, passwordHash, role, skin, active !== false],
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

  return {
    async ping() { await db.query('SELECT 1'); return true; },

    async getUserByUsername(username) {
      const r = await db.query(
        'SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1', [String(username || '')]);
      return mapUser(r.rows[0]);
    },

    async getUserById(id) {
      const r = await db.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
      return mapUser(r.rows[0]);
    },

    async listUsers() {
      const r = await db.query(
        'SELECT id, username, role, skin, active, created_at, updated_at FROM users ORDER BY lower(username)',
      );
      return r.rows.map(mapPublicUser);
    },

    async createUser(data) {
      return insertUser((text, params) => db.query(text, params), data);
    },

    // Registro público: usuario + sesión en UNA transacción. Si cualquiera falla,
    // no queda cuenta creada sin sesión (ni sesión sin cuenta).
    async registerUser({ username, passwordHash, tokenHash, expiresAt }) {
      return db.withTransaction(async (client) => {
        const user = await insertUser((text, params) => client.query(text, params), {
          username, passwordHash, role: 'user', skin: 'human', active: true,
        });
        const session = await insertSession((text, params) => client.query(text, params), {
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
      const r = await db.query(
        'UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [id, passwordHash]);
      return r.rowCount > 0;
    },

    async setUserActive(id, active) {
      const r = await db.query(
        'UPDATE users SET active = $2, updated_at = now() WHERE id = $1', [id, active !== false]);
      return r.rowCount > 0;
    },

    async createSession({ userId, tokenHash, expiresAt }) {
      return insertSession((text, params) => db.query(text, params), { userId, tokenHash, expiresAt });
    },

    async getSessionByTokenHash(tokenHash) {
      const r = await db.query(
        `SELECT s.id AS s_id, s.token_hash, s.user_id, s.created_at AS s_created_at,
                s.expires_at, s.last_seen_at, s.revoked_at,
                u.id AS u_id, u.username, u.password_hash, u.role, u.skin, u.active,
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
      const r = await db.query(
        'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
      return r.rowCount;
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

module.exports = { createPgStore, DUPLICATE };
