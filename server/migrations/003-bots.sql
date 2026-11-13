-- 003-bots.sql — bots configurables administrados desde /admin (change panel-bots-custom).
-- Forward-only e idempotente (el runner garantiza una sola aplicación).
-- Sin backfill ni seed: el deploy no crea ningún bot.
CREATE TABLE IF NOT EXISTS bots (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  behavior     TEXT        NOT NULL,
  skin         TEXT        NOT NULL,
  hp           INTEGER     NOT NULL DEFAULT 10,
  damage       INTEGER     NOT NULL DEFAULT 2,
  reach        NUMERIC(3,1) NOT NULL DEFAULT 4.6,
  speed        NUMERIC(4,1) NOT NULL DEFAULT 9.6,
  takes_damage BOOLEAN     NOT NULL DEFAULT TRUE,
  flying       BOOLEAN     NOT NULL DEFAULT TRUE,
  active       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by   BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bots_name_len     CHECK (char_length(name) BETWEEN 3 AND 16),
  CONSTRAINT bots_name_shape   CHECK (name ~ '^[A-Za-z0-9_-]+$'),
  CONSTRAINT bots_hp_range     CHECK (hp BETWEEN 1 AND 100),
  CONSTRAINT bots_damage_range CHECK (damage BETWEEN 0 AND 20),
  CONSTRAINT bots_reach_range  CHECK (reach BETWEEN 1 AND 10),
  CONSTRAINT bots_speed_range  CHECK (speed BETWEEN 1 AND 30),
  CONSTRAINT bots_behavior_allow CHECK (behavior IN ('cazador','merodeador')),
  CONSTRAINT bots_skin_allow CHECK (skin IN ('human','fat','giant','small','zombie','mujer','moreno','gojo','robot'))
);

-- Unicidad de nombre sin distinguir mayúsculas (mismo criterio que users).
CREATE UNIQUE INDEX IF NOT EXISTS bots_name_lower_key ON bots (lower(name));
-- Chequeo rápido del cupo de activos sin escanear toda la tabla.
CREATE INDEX IF NOT EXISTS bots_active_idx ON bots (id) WHERE active;
