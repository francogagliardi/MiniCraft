-- 002-admin-permissions.sql — CRUD admin, permisos por usuario y auditoría.
-- Forward-only e idempotente (el runner garantiza una sola aplicación).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- CHECK idempotente (ADD CONSTRAINT no soporta IF NOT EXISTS en PG 16).
DO $$
BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_permissions_object
    CHECK (jsonb_typeof(permissions) = 'object');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS admin_audit (
  id             BIGSERIAL PRIMARY KEY,
  actor_user_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action         TEXT        NOT NULL,
  details        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_action_len     CHECK (char_length(action) BETWEEN 1 AND 64),
  CONSTRAINT admin_audit_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX IF NOT EXISTS admin_audit_created_at_idx
  ON admin_audit (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_audit_actor_idx
  ON admin_audit (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_target_idx
  ON admin_audit (target_user_id, created_at DESC);
-- Chequeo rápido del "último admin" sin escanear toda la tabla.
CREATE INDEX IF NOT EXISTS users_active_admin_idx
  ON users (id) WHERE role = 'admin' AND active;
