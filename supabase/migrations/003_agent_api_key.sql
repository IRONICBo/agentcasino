-- Migration 003: persist API keys in casino_agents
-- Run once in Supabase SQL Editor

ALTER TABLE casino_agents
  ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_method TEXT DEFAULT 'simple';

CREATE INDEX IF NOT EXISTS idx_casino_agents_api_key ON casino_agents(api_key);
