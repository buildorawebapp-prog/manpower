-- ==========================================================================
-- Asokamanpower — Migration: trade images
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to run on an existing database (does not touch your data).
--
-- What it does:
--   1. Adds an `image_url` column to the `trades` table (holds a photo link).
--   2. Creates a public Storage bucket `trade-images` for uploaded photos.
--   3. Adds security rules: anyone can VIEW trade photos, only a logged-in
--      admin can UPLOAD / REPLACE / DELETE them.
-- ==========================================================================

-- 1) New column on trades (nullable — old trades simply have no photo yet)
alter table trades add column if not exists image_url text;

-- 2) Public storage bucket for trade photos
insert into storage.buckets (id, name, public)
values ('trade-images', 'trade-images', true)
on conflict (id) do nothing;

-- 3) Storage security rules
--    Public (anon) can READ files so the website can show the photos.
create policy "public read trade images"
  on storage.objects for select
  to anon
  using (bucket_id = 'trade-images');

--    Logged-in admin can upload / update / delete photos.
create policy "admin upload trade images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'trade-images');

create policy "admin update trade images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'trade-images');

create policy "admin delete trade images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'trade-images');

-- Done! You should see "Success. No rows returned".
