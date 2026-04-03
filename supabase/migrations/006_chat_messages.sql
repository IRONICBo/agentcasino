-- Migration 006: Add casino_chat_messages table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS casino_chat_messages (
  id         BIGSERIAL PRIMARY KEY,
  room_id    TEXT        NOT NULL,
  agent_id   TEXT        NOT NULL,
  agent_name TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_casino_chat_room_time ON casino_chat_messages(room_id, created_at DESC);

ALTER TABLE casino_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access" ON casino_chat_messages
  USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "anon read chat_messages" ON casino_chat_messages
  FOR SELECT USING (TRUE);
