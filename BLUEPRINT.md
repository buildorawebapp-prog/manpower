# Asokamanpower — Blueprint

Blue-collar manpower supply website. Candidates (Engineer, Plumber, Electrician,
Welder, Mason, etc.) apply for work; employers request workers. Admin manages
everything from a secure dashboard.

---

## 1. Goals

- English-first, with language switch: **Hindi, Bengali, Tamil, Telugu, Marathi**
- Fully responsive (mobile + desktop), smooth, no lag
- Two public forms: **Candidate apply** and **Employer request**
- Submissions appear in **Admin dashboard**; admin contacts them manually
- Admin can edit **phone / WhatsApp numbers** and **available locations** live
- Location search so users see where service is available
- Low cost (₹0 to start), secure, future-proof

---

## 2. Tech Stack (free tier, industry standard)

| Layer            | Choice              | Notes                                  |
|------------------|---------------------|----------------------------------------|
| Framework        | Next.js (App Router)| React, SSR, fast                       |
| Styling          | Tailwind CSS        | Mobile-first, responsive               |
| i18n             | next-intl           | Language switching                     |
| Database         | Supabase (Postgres) | Free 500MB, built-in auth              |
| Auth (admin)     | Supabase Auth       | Secure sessions, password hashing      |
| Hosting          | Vercel              | Free tier, auto-deploy from git        |
| Spam protection  | Honeypot + rate limit | No paid captcha needed initially     |

Starting cost: **₹0**. Scales cheaply.

---

## 3. Pages / Routes

Public (`/[locale]/...`):
- `/` — Home: hero, trades list, CTAs, contact (phone/WhatsApp), locations
- `/apply` — Candidate form
- `/hire` — Employer "need workers" form
- `/locations` — Search available locations
- `/contact` — Phone + WhatsApp + info

Admin (`/admin/...`, login required):
- `/admin/login` — Login
- `/admin` — Dashboard overview (counts)
- `/admin/candidates` — Candidate applications (list, detail, status)
- `/admin/employers` — Employer requests (list, detail, status)
- `/admin/settings` — Edit phone, WhatsApp, company info
- `/admin/locations` — Add / remove locations
- `/admin/trades` — Add / remove trades (Engineer, Plumber, ...)

---

## 4. Database Schema (Supabase / Postgres)

**candidates**
- id (uuid, pk), created_at
- full_name, phone, trade, experience_years, location, message
- status: enum('new','contacted','hired','rejected') default 'new'

**employers** (workers requests)
- id (uuid, pk), created_at
- company_name, contact_person, phone, trade_needed, workers_count, location, message
- status: enum('new','contacted','closed') default 'new'

**locations**
- id (uuid, pk), name, is_active (bool), created_at

**trades**
- id (uuid, pk), name, is_active (bool), created_at

**settings** (single row / key-value)
- key (pk), value  — e.g. phone, whatsapp, company_name, address, email

**admins** — handled by Supabase Auth (auth.users). No separate table needed.

---

## 5. Security

- Admin routes protected by Supabase Auth session (middleware guard).
- **Row Level Security (RLS)** on all tables:
  - `candidates`, `employers`: public can **INSERT** only; **SELECT/UPDATE/DELETE** = authenticated admin only.
  - `locations`, `trades`, `settings`: public **SELECT** (active only); write = admin only.
- Forms: honeypot field + basic rate limiting to block spam bots.
- All keys in `.env.local` (never committed). `service_role` key server-side only.
- Input validation with Zod on every form (client + server).

---

## 6. i18n Plan

- `next-intl` with message files: `messages/en.json`, `hi.json`, `bn.json`, `ta.json`, `te.json`, `mr.json`.
- Locale in URL: `/en/...`, `/hi/...`. English is default.
- Language switcher in header (dropdown), remembers choice.
- Admin dashboard stays English (internal use).

---

## 7. Build Order (milestones)

1. Scaffold Next.js + Tailwind + next-intl; base layout, header, footer, lang switch.
2. Home page + static content (trades, contact) — English first.
3. Supabase project + schema + RLS policies.
4. Candidate `/apply` form → saves to DB (with validation + honeypot).
5. Employer `/hire` form → saves to DB.
6. Locations page + search (reads active locations).
7. Admin auth + protected layout.
8. Admin: candidates list/detail/status.
9. Admin: employers list/detail/status.
10. Admin: settings (phone/whatsapp), locations CRUD, trades CRUD.
11. Wire contact/phone/whatsapp/locations on public site to DB (admin-editable).
12. Translations for hi, bn, ta, te, mr.
13. Polish, responsive QA, deploy to Vercel.

---

## 8. Env Vars

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server only
```
