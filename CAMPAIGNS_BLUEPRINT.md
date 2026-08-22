# Campaigns — Feature Blueprint

**Goal:** Admin ek "campaign" banata hai (e.g. *Fitters chahiye — 10 log*). Public website pe ek naya
**Campaigns** page us campaign ko dikhata hai with a marketing total (50 openings) aur real available
seats (10). Jaise-jaise log paid application karte hain, available seats ghatte hain (10 → 9 → 8 …).
User "Apply" dabata hai to wahi purana `apply.html` khulta hai **lekin Trade/Skill pehle se "Fitters"
selected** hota hai, baaki 3-step + ₹200 payment flow bilkul same rehta hai. Admin campaign ko kabhi
bhi edit / close / delete kar sakta hai.

---

## 1. Seat math — teen numbers, teen kaam

| Field | Example | Kya hai | Public ko dikhta? |
|---|---|---|---|
| `display_total` | 50 | Marketing/"showcase" total openings | ✅ "50 openings" |
| `seats_total` | 10 | **Real** requirement (asli 10 bande) | ✅ via seats-left |
| `seats_filled` | 0 → 10 | Kitne **paid** applications aa gaye | ❌ (derived) |
| `seats_available` | 10 → 0 | `seats_total − seats_filled` | ✅ "10 seats left" |

**Public card pe scarcity bar:**

```
shown_filled = display_total − seats_available      (50 − 10 = 40)
bar %        = shown_filled / display_total         (40/50 = 80%)
```

So card reads: **"50 openings · 10 seats left"** with an 80% full bar → urgency banta hai, aur
numbers ek dusre ko contradict nahi karte. Jab available 0 ho jaaye to bar 100% → "Positions filled".

**Constraint:** `display_total >= seats_total` (DB check + admin form validation), warna bar negative
ho jaayega.

---

## 2. Data model

### `campaigns` (new table)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text NOT NULL | "Fitters Required — Dubai Metro Site" |
| `slug` | text UNIQUE | auto from title, future pretty URLs |
| `trade` | text NOT NULL | **exact `trades.name`** — yehi `apply.html` me pre-select hota hai |
| `location` | text | `locations.name` ya free text |
| `display_total` | int NOT NULL | marketing total (50) |
| `seats_total` | int NOT NULL | real seats (10) |
| `seats_filled` | int NOT NULL default 0 | server-maintained counter |
| `salary_text` | text | "₹22,000 – ₹28,000 / month" |
| `experience_required` | text | "1–3 years" |
| `description` | text | job details |
| `image_url` | text | banner (bucket `campaign-images`) |
| `deadline` | date | optional last date |
| `status` | text default `'draft'` | `draft` \| `active` \| `filled` \| `closed` |
| `is_featured` | boolean | homepage strip me pin karne ke liye |
| `sort_order` | int | |
| `created_at` / `updated_at` | timestamptz | |

### `candidates` — one new column

```sql
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS campaign_id uuid
  REFERENCES campaigns(id) ON DELETE SET NULL;
```

Campaign delete hone par candidate ka record bacha rehta hai (sirf link null ho jaata hai).

**Counter column kyun, live COUNT() kyun nahi?** `candidates` pe RLS anon ko `select` allow nahi karti
(sirf insert). Public page ko live count chahiye, to `candidates` ko public padhwana **galat** hoga.
Isliye `campaigns.seats_filled` ek server-maintained counter hai + ek admin **Recount** RPC jo kabhi
bhi reconcile kar deta hai.

---

## 3. Seat counting — DB trigger, *not* `verify_payment`

`verify_payment` security-critical hai (HMAC verify ke baad service_role se chalta hai, account-takeover
fix + token rule usme baithe hain). Usko chhedna risk hai. Isliye counting ek **trigger** se hogi:

```
AFTER INSERT OR UPDATE OF payment_status ON candidates
  → payment_status 'success' ban gaya (aur pehle nahi tha) AND campaign_id NOT NULL
      → campaigns.seats_filled += 1
AFTER DELETE ON candidates
  → tha paid + campaign_id NOT NULL
      → campaigns.seats_filled = GREATEST(0, seats_filled − 1)
```

Fayde:

- `verify_payment` **bilkul untouched** → koi security regression nahi.
- Jo bhi path payment ko success karega (Edge Function, webhook, ya admin manual fix), count sahi rahega.
- Admin bulk-delete (`admin_delete_submissions`) se seat automatically free ho jaati hai.
- Idempotent: `verify_payment` doosri baar chale to woh pehle hi return kar deta hai (`status='success'`),
  aur trigger bhi `OLD.payment_status IS DISTINCT FROM 'success'` guard rakhta hai → double count impossible.

Same trigger `status` bhi auto-flip karta hai: full hote hi `active → filled`, seat free hote hi
`filled → active`.

---

## 4. Full-campaign guard — pehle hi rok do, paise lene se pehle

Nobody should pay ₹200 for a campaign that just filled up. Check `create_payment_order()` ke andar
jaata hai (yeh RPC already Edge Function se call hota hai aur pura `candidateData` JSONB paas karta hai):

```
campaign_id aaya hai?
  → campaign exist karta hai?           nahi → error
  → status IN ('active')?               nahi → "CAMPAIGN_CLOSED"
  → seats_filled < seats_total?         nahi → "CAMPAIGN_FULL"
  → deadline nikal gayi?                haan → "CAMPAIGN_EXPIRED"
  → sab theek → candidates.campaign_id set karke insert
```

**Isse Edge Function redeploy nahi karna padta** — `create-razorpay-order` `candidateData` ko
as-is RPC ko forward karta hai, to `campaign_id` khud pahunch jaata hai. Sirf SQL migration + frontend.

**Race condition (last seat, do log ek saath):** Dono ka order ban sakta hai kyunki check aur payment
ke beech gap hai. Payment success par trigger `seats_filled` ko 11/10 tak le jaa sakta hai — us case me
UI `GREATEST(0, …)` se "0 seats left / Filled" dikhata hai, aur **jisne paise diye uska registration
valid rehta hai** (₹200 registration fee hai, seat reservation nahi). Admin dashboard par
`11 / 10` overfill highlight ho jaata hai taaki pata chale. Ye deliberate trade-off hai — paying
customer ko kabhi reject nahi karte.

---

## 5. Public page — `campaigns.html`

- Same shell (`initShell`), same header/footer, i18n-ready, mobile-first.
- Hero: "Live Hiring Campaigns".
- Filters: trade + location dropdowns + search box (client-side, data already loaded).
- Card per campaign:
  - banner image (ya trade icon tile fallback)
  - status pill: `🟢 Hiring now` / `🔴 Positions filled`
  - title + trade badge + 📍 location badge
  - salary, experience, deadline
  - **`50 openings · 10 seats left`** + scarcity bar
  - `Apply Now →` → `apply.html?campaign=<id>&trade=<url-encoded trade>`
  - filled hone par button disabled + "Filled" text
- Sirf `active` + `filled` campaigns dikhte hain (`draft`/`closed` public me nahi).
- Empty state: "No live campaigns right now — apply anytime" + link to `apply.html`.
- Nav me naya link **Campaigns**, i18n keys 6 languages (en, hi, bn, ta, te, mr).

---

## 6. Apply flow — deep link

`apply.html?campaign=<uuid>&trade=Fitters`

1. Page load → campaign ko DB se fetch (anon read allowed).
2. Valid + active + seats bache → **campaign banner** step 1 ke upar:
   `📣 Applying for: Fitters Required — Dubai · Fitters · Dubai — 10 seats left`
3. Trade select me "Fitters" pre-selected (aur lock — decision below).
4. `campaign_id` `candidateData` me chala jaata hai → `create_payment_order` → `candidates.campaign_id`.
5. Baaki sab same: resume upload → review → ₹200 Razorpay → verify → temp password.
6. Campaign invalid / full / closed → banner ke bajaye ek soft notice: *"Yeh campaign bhar gaya hai —
   aap normally apply kar sakte hain"* + trade unlock + `campaign_id` drop. Flow rukta nahi.
7. `trade` param sirf tab maanta hai jab woh **live trades list me exist** karta ho (spoof-proof, aur
   `trade` DB me free-text hai to garbage nahi jaana chahiye).

`fillFormDropdowns()` do baar chalta hai (fallback data + live data), isliye pre-select uske end me
re-apply hota hai — warna live data aane par selection reset ho jaati.

---

## 7. Admin panel — `📣 Campaigns`

`admin/dashboard.html` me naya sidebar item + naya view, logic `admin/campaigns.js` me (admin.js
already 19KB hai, usko aur mota nahi karna).

**List:** card grid — banner, title, status pill, trade/location, `seats_filled / seats_total`
progress, `display_total`, applicants count, deadline.

**Actions per campaign:**

- ✏️ **Edit** → modal (saare fields)
- ➕ **Seats** → quick +/- seats_total adjust
- ⏸ **Close** / ▶️ **Activate** / 📝 Draft
- 🔄 **Recount seats** → `recount_campaign_seats(id)` RPC se counter reconcile
- 👥 **Applicants** → candidates view campaign filter ke saath
- 🗑 **Delete** → confirm; candidates safe rehte hain (link null)

**Create/Edit modal validations:** title required; trade required (dropdown from `trades`);
`seats_total >= 1`; `display_total >= seats_total`; banner ≤ 5MB image.

---

## 8. Security / RLS

```sql
alter table campaigns enable row level security;

-- public: sirf live campaigns padh sakta hai
create policy "public read campaigns" on campaigns
  for select to anon using (status in ('active','filled'));

-- admin: full access
create policy "admin all campaigns" on campaigns
  for all to authenticated using (true) with check (true);
```

- `seats_filled` ko **koi bhi frontend likh nahi sakta** — sirf trigger (SECURITY DEFINER) badalta hai.
- Anon `campaigns` ko **update/insert/delete nahi** kar sakta → seat numbers tamper-proof.
- URL ka `campaign_id` user-controlled hai par harmless: validation server-side (`create_payment_order`)
  hoti hai, aur wahi decide karta hai ki candidate row me kya likha jaayega.
- `candidates` ki RLS unchanged (anon insert-only, koi select nahi).
- Razorpay secret / service_role key ka koi naya exposure nahi — **koi Edge Function change nahi**.
- `verify_payment` untouched (service_role-only, account-takeover fix, "no payment → no token" rule intact).
- New storage bucket `campaign-images`: public read, authenticated (admin) write — `trade-images` ka
  exact same pattern.

---

## 9. Edge cases

| Case | Behaviour |
|---|---|
| Campaign delete, candidate paid | candidate record safe, `campaign_id → NULL`, seat count us campaign ke saath chala jaata hai |
| Admin `seats_total` ghata deta hai (10 → 3) jab 5 paid hain | `seats_available = 0`, status auto `filled`, admin ko overfill (5/3) dikhta hai |
| Trade rename ho gaya | campaign ka `trade` text purana reh jaayega → pre-select fail → apply.html soft-fallback (trade unlocked). Admin ko edit karna hoga |
| Same email dobara paid apply (existing account) | normal flow — password reset nahi hota, seat phir bhi count hoti hai (naya application hai) |
| Unpaid / abandoned form | seat count **nahi** hoti (trigger sirf `payment_status='success'` par) |
| Deadline nikal gayi | `create_payment_order` block karta hai; public card "Closed" dikhata hai |
| Do log last seat ke liye ek saath pay karte hain | dono register hote hain, counter overfill dikhata hai, kisi ko reject nahi karte (§4) |

---

## 10. Files touched

**New**

- `supabase/campaigns_migration.sql`
- `campaigns.html`
- `js/campaigns.js`
- `admin/campaigns.js`

**Modified**

- `js/app.js` — nav me Campaigns link
- `js/i18n.js` — campaign keys × 6 languages
- `apply.html` — campaign banner + pre-select wiring
- `js/payment.js` — `campaign_id` in `candidateData`, `CAMPAIGN_FULL/CLOSED/EXPIRED` messages
- `admin/dashboard.html` — Campaigns view + edit modal
- `css/style.css` — campaign card + admin campaign styles
- `index.html` — (optional) featured campaigns strip
- saari HTML pages — cache-bust `?v=` bumps

---

## 11. Deploy steps (user ke liye)

1. Supabase → SQL Editor → `supabase/campaigns_migration.sql` **poora paste karke Run**
   (idempotent — dobara chala sakte hain).
2. `git add -A && git commit && git push` → Vercel auto-deploy.
3. Admin panel → 📣 Campaigns → pehla campaign banao (status **active** rakho warna public me nahi dikhega).
4. **Koi Edge Function redeploy nahi**, koi naya secret nahi.

---

## 12. Test plan

1. Migration run → `campaigns` table + `candidates.campaign_id` exist karte hain.
2. Admin: campaign banao (display 50, seats 10, trade Fitters) → status active.
3. Public `campaigns.html` → card dikhe: "50 openings · 10 seats left", bar 80%.
4. Apply Now → `apply.html` khule, Trade = **Fitters** pre-selected + banner visible.
5. Full flow with a real ₹200 payment (ya Razorpay Test Mode) → success.
6. `campaigns.html` refresh → **9 seats left**, bar 82%.
7. Admin → seats_total 1 kar do → status auto `filled`, public card "Positions filled", Apply disabled.
8. Full campaign ka URL manually kholo → soft notice + normal apply (trade unlocked).
9. Admin → candidate delete → seat wapas free, status `active`.
10. Recount seats → counter DB ke paid candidates se match kare.
11. Mobile (Android Chrome) — cards, filters, banner, modal sab responsive.
12. Anon se `campaigns` update try karo (console) → RLS block kare.

---

## 13. Post-audit hardening (implementation ke baad ka review)

Implementation complete hone ke baad ek independent audit kiya gaya. Ek **real security
hole** mila jo campaigns ki wajah se exploitable ban gaya tha, plus kuch chhoti
polish. Sab fix ho chuka hai — yahan record ke liye:

### 13.1 🔴 Seat integrity — `"public can apply"` policy (FIXED)

`supabase/setup.sql` me shuru se ye line thi:

```sql
create policy "public can apply" on candidates for insert to anon with check (true);
```

Postgres me permissive RLS policies **OR** hoti hain, to `payment_migration.sql`
ka stricter `candidates_insert_pending` isko override nahi karta tha. Matlab
browser console se koi bhi ye kar sakta tha:

```js
sb.from('candidates').insert({ full_name:'x', phone:'x', trade:'Fitters',
  campaign_id:'<public campaigns table se uthaya hua uuid>',
  payment_status:'success' })
```

Naya seat trigger `payment_status='success'` dekh ke seat count kar deta, aur
`campaigns_normalise()` campaign ko `filled` flip kar deta — bina ek rupaya diye
saare campaigns offline. (Campaign ids public hain by design, to attacker ke
paas sab kuch tha.)

**Fix** — `campaigns_migration.sql` §4b:

```sql
DROP POLICY IF EXISTS "public can apply" ON candidates;
DROP POLICY IF EXISTS "candidates_insert_pending" ON candidates;
CREATE POLICY "candidates_insert_pending" ON candidates
  FOR INSERT TO anon
  WITH CHECK (
    (payment_status IS NULL OR payment_status = 'pending')
    AND campaign_id IS NULL
    AND tracking_token IS NULL
  );
```

Safe kyon: apply.html ka asli path Edge Function → `create_payment_order()`
(SECURITY DEFINER / service_role) hai, jo RLS bypass karta hai. Client-side
candidates insert sirf `js/forms.js` ke dead `applyForm` branch me bacha hai
(kisi bhi page me `#applyForm` nahi hai). Anon ke paas candidates par UPDATE
policy pehle se nahi hai, to purani row ko bhi paid nahi bana sakta.
`setup.sql` me wo line comment out kar di gayi hai taki dobara chalane par
hole wapas na aaye.

### 13.2 Trigger scope

`AFTER INSERT OR UPDATE OR DELETE` → `AFTER INSERT OR DELETE OR UPDATE OF
payment_status, campaign_id`. Pehle har candidate status change par bhi trigger
chalta tha (guards ki wajah se no-op, par bekaar overhead).

### 13.3 Deadline timezone (client ↔ server agreement)

Server `CURRENT_DATE` (UTC) use kar raha tha, cards visitor ka local midnight.
IST me din ke pehle 5.5 ghante dono disagree karte the. Ab **dono taraf IST**:
SQL me `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`, JS me
`campaignTodayIST()` + plain `YYYY-MM-DD` string compare.

### 13.4 Homepage strip

Pehle open-first sort karke top 3 leta tha — agar saare campaigns filled ho
jaate to homepage par 3 disabled "Positions filled" cards ki shelf dikhti.
Ab `filter(campaignIsOpen)` — kuch open nahi to poora section hidden.
Featured (⭐) campaigns `fetchCampaigns()` ke order se pehle aate hain.

### 13.5 Chhoti polish

- `campaignFallbackImage()` ab trade **object** paas karta hai, to admin ka
  uploaded trade photo bundled `/images` fallback se jeet jaata hai.
- `saveCampaign()` ka "✓ Campaign updated" toast: `wasEdit` flag
  `closeCampaignModal()` se pehle capture hota hai (pehle hamesha "created").
- "－ Seat" button ab overfill par confirm maangta hai (jaise modal karta hai).
- Campaign delete / banner replace par purani image `campaign-images` bucket se
  hata di jaati hai (`removeStorageFiles()` reuse).
- Candidates panel ka count campaign filter ke waqt "N of TOTAL" dikhata hai.

### 13.6 Audit me PASS hua

Undefined identifiers (script order), DOM id ↔ JS match (26/26), CSS classes
(56/56), bulk-delete + campaign filter interaction, migration idempotency,
column list ↔ JS read/write match, trigger ke chaaron cases (insert-paid,
pending→paid, delete, campaign change — koi double count nahi), koi secret
frontend me nahi, `create_payment_order` sirf service_role ko granted,
`verify_payment` chhua hi nahi gaya, aur migration se pehle / empty table par
koi JS error nahi (sab guarded).
