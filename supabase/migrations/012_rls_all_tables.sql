-- Drop legacy permissive policies that allowed anon full access
DROP POLICY IF EXISTS "anon read agents" ON casino_agents;
DROP POLICY IF EXISTS "service_role full access" ON casino_agents;
DROP POLICY IF EXISTS "anon read games" ON casino_games;
DROP POLICY IF EXISTS "service_role full access" ON casino_games;
DROP POLICY IF EXISTS "anon read game_players" ON casino_game_players;
DROP POLICY IF EXISTS "service_role full access" ON casino_game_players;

-- ═══ casino_agents ═══
-- CRITICAL: secret_key, publishable_key columns were exposed without RLS
ALTER TABLE casino_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON casino_agents
  USING (FALSE) WITH CHECK (FALSE);
-- service_role bypasses RLS automatically

-- ═══ casino_games ═══
ALTER TABLE casino_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON casino_games
  USING (FALSE) WITH CHECK (FALSE);

-- ═══ casino_game_players ═══
ALTER TABLE casino_game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON casino_game_players
  USING (FALSE) WITH CHECK (FALSE);

-- ═══ casino_hand_cards ═══
-- Already has RLS enabled but no explicit policies → add for clarity
CREATE POLICY "service_role only" ON casino_hand_cards
  USING (FALSE) WITH CHECK (FALSE);

-- ═══ casino_room_state ═══
-- Re-enable (was somehow disabled)
ALTER TABLE casino_room_state ENABLE ROW LEVEL SECURITY;
