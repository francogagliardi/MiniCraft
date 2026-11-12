'use strict';
// Cliente PostgreSQL: Pool único, consultas parametrizadas y transacciones.
const { Pool } = require('pg');

function createDb({ connectionString, max = 10, logger = console } = {}) {
  const pool = new Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  // Un error de una conexión idle no debe tumbar el proceso.
  pool.on('error', (e) => { try { logger.warn('   ⚠️ conexión Postgres: ' + e.message); } catch (x) {} });

  return {
    pool,
    query: (text, params) => pool.query(text, params),
    async withTransaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (x) {}
        throw e;
      } finally {
        client.release();
      }
    },
    async ping() {
      await pool.query('SELECT 1');
      return true;
    },
    async close() { await pool.end(); },
  };
}

module.exports = { createDb };
