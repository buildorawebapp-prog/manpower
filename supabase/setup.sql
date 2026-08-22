-- ==========================================================================
-- Asokamanpower — Supabase database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run
-- Safe to run once. Creates tables, security rules, and seed data.
-- ==========================================================================

-- ---------- CANDIDATES (people applying for work) ----------
create table if not exists candidates (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  full_name    text not null,
  phone        text not null,
  trade        text not null,
  experience   text,
  location     text,
  message      text,
  status       text not null default 'new'   -- new | contacted | hired | rejected
);

-- ---------- EMPLOYERS (companies needing workers) ----------
create table if not exists employers (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  company_name   text not null,
  contact_person text not null,
  phone          text not null,
  trade_needed   text not null,
  workers_count  int,
  location       text,
  message        text,
  status         text not null default 'new'  -- new | contacted | closed
);

-- ---------- LOCATIONS (shown in public search) ----------
create table if not exists locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- TRADES (services offered) ----------
create table if not exists trades (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  icon       text default '🛠️',
  descr      text,
  image_url  text,
  is_active  boolean not null default true,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

-- ---------- SETTINGS (phone, whatsapp, etc. — key/value) ----------
create table if not exists settings (
  key   text primary key,
  value text
);

-- ==========================================================================
-- ROW LEVEL SECURITY  (this is what keeps your data safe)
-- ==========================================================================
alter table candidates enable row level security;
alter table employers  enable row level security;
alter table locations  enable row level security;
alter table trades     enable row level security;
alter table settings   enable row level security;

-- Public visitors: can SUBMIT forms (insert), but cannot read/edit anyone's data.
--
-- ⚠️  "public can apply" on candidates was REMOVED (see campaigns_migration.sql §4b).
--     `with check (true)` let the browser set any column — including
--     payment_status='success' and campaign_id — which would let anyone burn
--     every campaign seat with just the public anon key. Candidate rows are now
--     created only by create_payment_order() (SECURITY DEFINER, service_role),
--     with a hardened anon fallback policy named "candidates_insert_pending".
--     Do NOT re-add the line below.
-- create policy "public can apply"   on candidates for insert to anon with check (true);
create policy "public can request"    on employers  for insert to anon with check (true);

-- Public visitors: can READ active locations / trades / settings (for the website).
create policy "public read locations" on locations  for select to anon using (is_active = true);
create policy "public read trades"    on trades     for select to anon using (is_active = true);
create policy "public read settings"  on settings   for select to anon using (true);

-- Logged-in admin: full access to everything.
create policy "admin all candidates"  on candidates for all to authenticated using (true) with check (true);
create policy "admin all employers"   on employers  for all to authenticated using (true) with check (true);
create policy "admin all locations"   on locations  for all to authenticated using (true) with check (true);
create policy "admin all trades"      on trades     for all to authenticated using (true) with check (true);
create policy "admin all settings"    on settings   for all to authenticated using (true) with check (true);

-- ==========================================================================
-- SEED DATA (starting locations, trades, contact info)
-- ==========================================================================
insert into locations (name) values
  ('Mumbai'),('Delhi'),('Bengaluru'),('Hyderabad'),('Chennai'),('Kolkata'),
  ('Pune'),('Ahmedabad'),('Surat'),('Jaipur'),('Lucknow'),('Nagpur'),
  ('Coimbatore'),('Kochi'),('Visakhapatnam'),('Bhubaneswar')
on conflict (name) do nothing;

insert into trades (name, icon, descr, sort_order) values
  ('Engineers',        '🛠️', 'Civil, mechanical & site engineers.', 1),
  ('Plumbers',         '🔧', 'Pipe fitting, repairs & installation.', 2),
  ('Electricians',     '⚡', 'Wiring, fittings & maintenance.', 3),
  ('Welders',          '🔥', 'Arc, MIG & gas welding experts.', 4),
  ('Masons',           '🧱', 'Brickwork, plaster & construction.', 5),
  ('Carpenters',       '🪚', 'Woodwork, framing & finishing.', 6),
  ('Painters',         '🎨', 'Interior & exterior painting.', 7),
  ('Helpers & Labour', '👷', 'General site & support workers.', 8),
  ('AC Technicians',   '❄️', 'HVAC install, service & repair.', 9),
  ('Crane Operators',  '🏗️', 'Heavy equipment & machinery.', 10),
  ('Fitters',          '🚿', 'Pipe, structural & pump fitters.', 11),
  ('Fabricators',      '🧰', 'Metal & steel fabrication.', 12)
on conflict (name) do nothing;

insert into settings (key, value) values
  ('phone',    '+91 98765 43210'),
  ('whatsapp', '+91 98765 43210'),
  ('email',    'hello@gohireconsultancy.com'),
  ('company',  'Go Hire Consultancy'),
  ('address',  'Bengaluru, Karnataka, India')
on conflict (key) do nothing;

-- ==========================================================================
-- STORAGE  (bucket for admin-uploaded trade photos)
-- ==========================================================================
insert into storage.buckets (id, name, public)
values ('trade-images', 'trade-images', true)
on conflict (id) do nothing;

create policy "public read trade images"
  on storage.objects for select to anon
  using (bucket_id = 'trade-images');
create policy "admin upload trade images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'trade-images');
create policy "admin update trade images"
  on storage.objects for update to authenticated
  using (bucket_id = 'trade-images');
create policy "admin delete trade images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'trade-images');

-- Done! You should see "Success. No rows returned".
