-- Migration 007: Add poker stats columns to casino_agents
-- Run this in Supabase SQL Editor

ALTER TABLE casino_agents
  ADD COLUMN IF NOT EXISTS vpip_hands          INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pfr_hands           INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aggressive_actions  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passive_actions     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS showdown_hands      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS showdown_wins       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cbet_opportunities  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cbet_made           INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_win_streak     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worst_loss_streak   INT NOT NULL DEFAULT 0;
