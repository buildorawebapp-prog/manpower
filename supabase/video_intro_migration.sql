-- ==========================================================================
-- Go Hire Consultancy — Migration: Chat Intro Video (delete support)
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to run on an existing database (does not touch your data).
--
-- CONTEXT:
--   Intro videos reuse the SAME chat plumbing as image/PDF attachments:
--     chat_messages.attachment_url / attachment_type / attachment_name
--   with attachment_type = 'video'. So there are NO table changes here and
--   NO new columns — that all already exists from chat_attachments_migration.sql.
--
-- WHAT THIS ADDS:
--   A Storage DELETE rule so the ADMIN (role = authenticated) can permanently
--   remove a video file from the `chat-attachments` bucket via the 🗑 button,
--   keeping storage from filling up. Anon (public site users) still CANNOT
--   delete — only read + upload, exactly as before.
--
-- WHY NO MIME / SIZE CHANGE:
--   The `chat-attachments` bucket was created with no allowed_mime_types and no
--   file_size_limit, i.e. it already accepts video files. The 20 MB + 40-second
--   limits are enforced in the browser BEFORE upload (js/chat-attachments.js),
--   which is the right place for a good user message. If your Supabase project
--   has a low GLOBAL upload limit (Project Settings → Storage) below ~25 MB,
--   raise it there; the optional block at the bottom can pin a per-bucket limit.
-- ==========================================================================

-- 1) Admin (authenticated) can DELETE chat files ----------------------------
--    Drop first so this file is safe to re-run.
DROP POLICY IF EXISTS "admin delete chat attachments" ON storage.objects;

CREATE POLICY "admin delete chat attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-attachments');

-- 2) (OPTIONAL) Pin a per-bucket size limit of 25 MB ------------------------
--    Uncomment ONLY if you want the server to also reject >25 MB uploads.
--    Leaving allowed_mime_types NULL keeps ALL current image/PDF/video uploads
--    working — do NOT set an allow-list unless it includes every type in use.
--
-- UPDATE storage.buckets
--   SET file_size_limit = 26214400   -- 25 MB in bytes
--   WHERE id = 'chat-attachments';

-- Done! You should see "Success. No rows returned".
