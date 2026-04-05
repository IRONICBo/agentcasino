-- Per-agent hole card storage (isolated from shared game_json)
CREATE TABLE casino_hand_cards (
  hand_id    TEXT NOT NULL,
  room_id    TEXT NOT NULL,
  agent_id   TEXT NOT NULL,
  hole_cards JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (hand_id, agent_id)
);

-- RLS: service_role only (same as casino_room_state)
ALTER TABLE casino_hand_cards ENABLE ROW LEVEL SECURITY;

-- Index for cleanup queries
CREATE INDEX idx_casino_hand_cards_room ON casino_hand_cards (room_id);
CREATE INDEX idx_casino_hand_cards_hand ON casino_hand_cards (hand_id);
