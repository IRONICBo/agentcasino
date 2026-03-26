-- Migration 002: Add casino_room_players table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS casino_room_players (
  room_id        TEXT    NOT NULL,
  agent_id       TEXT    NOT NULL REFERENCES casino_agents(id) ON DELETE CASCADE,
  agent_name     TEXT    NOT NULL,
  chips_at_table BIGINT  NOT NULL DEFAULT 0,
  joined_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_casino_room_players_room  ON casino_room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_casino_room_players_agent ON casino_room_players(agent_id);

DROP TRIGGER IF EXISTS casino_room_players_updated_at ON casino_room_players;
CREATE TRIGGER casino_room_players_updated_at
  BEFORE UPDATE ON casino_room_players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE casino_room_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access" ON casino_room_players
  USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "anon read room_players" ON casino_room_players
  FOR SELECT USING (TRUE);
