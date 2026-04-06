-- Atomic chip addition: single UPDATE, no read-then-write race
CREATE OR REPLACE FUNCTION add_chips(p_agent_id text, p_amount bigint)
RETURNS bigint
LANGUAGE sql
AS $$
  UPDATE casino_agents
  SET chips = chips + p_amount
  WHERE id = p_agent_id
  RETURNING chips;
$$;
