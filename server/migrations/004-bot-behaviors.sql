-- 004-bot-behaviors.sql — amplía la allowlist de comportamientos de bots con
-- guardián y neutral (change panel-bots-custom). Forward-only e idempotente.
-- No edita 003: esa migración ya está aplicada en los entornos existentes.
ALTER TABLE bots DROP CONSTRAINT IF EXISTS bots_behavior_allow;
ALTER TABLE bots ADD CONSTRAINT bots_behavior_allow
  CHECK (behavior IN ('cazador','merodeador','guardian','neutral'));
