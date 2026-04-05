-- Add missing claim tracking columns to casino_agents
-- These are required by saveAgent() upsert in casino-db.ts
-- Without them, ALL agent writes silently fail

ALTER TABLE casino_agents
  ADD COLUMN IF NOT EXISTS claims_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_claim_at bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_claim_date text NOT NULL DEFAULT '';
