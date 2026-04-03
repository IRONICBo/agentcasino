-- Migration 008: Persist active game state + claim tracking
-- Run this in Supabase SQL Editor

-- ── Claim tracking on casino_agents ─────────────────────────────────────────
ALTER TABLE casino_agents
  ADD COLUMN IF NOT EXISTS claims_today    INT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_claim_at   BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_claim_date TEXT   NOT NULL DEFAULT '';

-- ── Active game state per room ───────────────────────────────────────────────
-- Stores full serialized GameState JSON so cold-start instances can restore
-- mid-hand games without losing cards / pot / phase.
-- SECURITY: hole cards are in here — restrict to service_role only.
CREATE TABLE IF NOT EXISTS casino_room_state (
  room_id       TEXT PRIMARY KEY,
  game_json     JSONB NOT NULL,
  state_version INT   NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS casino_room_state_updated_at ON casino_room_state;
CREATE TRIGGER casino_room_state_updated_at
  BEFORE UPDATE ON casino_room_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE casino_room_state ENABLE ROW LEVEL SECURITY;

-- Block all anon/authenticated access; service_role bypasses RLS
CREATE POLICY "service_role only" ON casino_room_state
  USING (FALSE) WITH CHECK (FALSE);
