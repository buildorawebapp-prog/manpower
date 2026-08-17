# Asokamanpower

Blue-collar manpower supply website. Candidates (engineers, plumbers,
electricians, welders, etc.) apply for work; employers request workers.
Admin manages everything from a dashboard.

**Current stage:** Connected to Supabase (live database + admin auth).
Forms save to the DB, the public site reads live trades/locations/contact,
and the admin dashboard reads/writes real data behind a login.

---

## Run locally

No build step. Any static server works:

```
python -m http.server 5500
```

Then open http://localhost:5500

---

## Structure

```
index.html          Home page
apply.html          Candidate "apply for work" form
hire.html           Employer "need workers" form
locations.html      Searchable location list
admin/
  login.html        Admin login (demo — any click signs in)
  dashboard.html    Admin dashboard (candidates, employers, settings, locations, trades)
  admin.js          Admin demo logic + mock records
css/style.css       Full design system (navy + saffron theme, responsive)
js/
  i18n.js           Translations: English, Hindi, Bengali, Tamil, Telugu, Marathi
  app.js            Shared header/footer, language switch, contact wiring, DEMO data
  forms.js          Form validation + honeypot + demo submit
BLUEPRINT.md        Full project plan
```

## Languages

English is default. Switch via the 🌐 button in the header. To add a language:
1. Add an entry to `LANGS` in `js/i18n.js`.
2. Add its translation block to `I18N` in the same file.
No HTML changes needed — text uses `data-i18n` keys.

---

## Connecting Supabase (DONE)

The site is wired to Supabase. Key files:

- `js/supabase.js` — project URL + anon key + client init
- `supabase/setup.sql` — run once in Supabase SQL Editor to create tables,
  Row Level Security, and seed data
- Forms (`js/forms.js`) insert into `candidates` / `employers`
- Public pages (`js/app.js` → `loadLiveData`) read `trades`, `locations`, `settings`
- Admin (`admin/admin.js`) reads/writes all tables, protected by Supabase Auth

### Admin access

Create an admin user in Supabase → Authentication → Users → Add user
(enable "Auto Confirm User"). Then sign in at `admin/login.html`.

### Trade photos (admin-managed)

Each trade can have its own photo, set from the admin dashboard (Trades tab):
add a trade with name + details + icon + photo, or click "Add/Change photo"
on any existing trade. Photos upload to a public Supabase Storage bucket
(`trade-images`) and show automatically on the public site. Trades without a
photo fall back to a bundled image (if one exists for that name) or a coloured
icon tile.

**One-time setup:** run `supabase/migration_trade_images.sql` in the Supabase
SQL Editor. It adds the `image_url` column and creates the `trade-images`
Storage bucket with the right security rules. (Fresh installs using
`supabase/setup.sql` already include this — the migration is only for databases
created before this feature.)

### Security notes

- The `anon` key in `js/supabase.js` is safe to expose — Row Level Security
  is what protects the data. Public visitors can only INSERT applications and
  READ active locations/trades/settings; everything else needs an admin login.
- Never put the `service_role` key in any browser file.

### Going fully production (optional, later)

For a future-proof build, port these pages into Next.js and host on Vercel
(see BLUEPRINT.md). The Supabase schema stays the same.
