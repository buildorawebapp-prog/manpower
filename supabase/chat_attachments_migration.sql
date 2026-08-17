-- ==========================================================================
-- Go Hire Consultancy — Migration: Chat Attachments (image / PDF)
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to run on an existing database (does not touch your data).
--
-- What it does:
--   1. Adds attachment columns to chat_messages (url, type, name).
--   2. Makes the message text optional (so an attachment can be sent alone).
--   3. Creates a public Storage bucket `chat-attachments`.
--   4. Adds security rules: users (anon) and admins (authenticated) can
--      upload; everyone can read/download.
-- ==========================================================================

-- 1) Attachment columns on chat_messages ------------------------------------
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachment_url  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT,   -- 'image' or 'pdf'
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;   -- original filename

-- 2) Allow attachment-only messages (no text) -------------------------------
ALTER TABLE chat_messages ALTER COLUMN message DROP NOT NULL;

-- 3) Public storage bucket for chat files -----------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 4) Storage security rules -------------------------------------------------
--    Drop first so this file is safe to re-run.
DROP POLICY IF EXISTS "public read chat attachments"   ON storage.objects;
DROP POLICY IF EXISTS "anyone upload chat attachments"  ON storage.objects;

--    Anyone can READ/DOWNLOAD chat files (URLs are long & unguessable).
CREATE POLICY "public read chat attachments"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'chat-attachments');

--    Users (anon) and admins (authenticated) can UPLOAD into this bucket.
CREATE POLICY "anyone upload chat attachments"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

-- Done! You should see "Success. No rows returned".
