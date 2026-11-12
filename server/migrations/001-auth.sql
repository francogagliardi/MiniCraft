-- 001-auth.sql — identidad de usuarios y sesiones (change auth-usuarios-lobby).
-- Unicidad de username case-insensitive por índice funcional (sin citext).
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  skin          TEXT        NOT NULL DEFAULT 'human',
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_username_len   CHECK (char_length(username) BETWEEN 3 AND 16),
  CONSTRAINT users_username_chars CHECK (username ~ '^[A-Za-z0-9_-]+$')
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  id           BIGSERIAL PRIMARY KEY,
  token_hash   TEXT        NOT NULL UNIQUE,
  user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ,
  CONSTRAINT sessions_token_hash_len CHECK (char_length(token_hash) = 64)
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_live_expiry_idx
  ON sessions (expires_at) WHERE revoked_at IS NULL;
