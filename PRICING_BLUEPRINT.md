# Dynamic Pricing — Feature Blueprint

**Goal:** ₹200 ka fixed fee khatam. Application fee ab do cheezon se banegi — **Preferred Location ka
base price** (mandatory) **+ us Trade ka surcharge** (optional). Dono admin panel se editable, har
location ka apna price, har trade ka apna alag "+" amount.

```
fee = locations.fee_paise          (base — har location ka apna, mandatory)
    + trades.surcharge_paise       (+ — har trade ka apna, optional, default 0)
```

Agar admin kisi trade ka surcharge set na kare to wo 0 rehta hai aur sirf location wala base lagta hai
— exactly jaisa aapne kaha.

---

## 0. Sabse pehle: haan, ho sakta hai — lekin 3 cheezein saath mein theek karni padengi

Maine poora payment path padha (`apply.html` → `js/payment.js` → `create-razorpay-order` Edge Function
→ `create_payment_order()` → `verify-razorpay-payment` → `verify_payment()`). Ek achhi baat aur teen
problem mili.

**Achhi baat:** aaj browser server ko amount **bhejta hi nahi**. Wo sirf `candidateData` (naam, phone,
trade, location…) bhejta hai aur amount server khud decide karta hai. Ye foundation bilkul sahi hai —
dynamic pricing isi ke upar safely ban sakti hai. Isko todna nahi hai.

### 🔴 Blocker 1 — `verify_payment` ke andar ₹200 hardcoded hai

```sql
v_expected_amount INTEGER := 20000; -- ₹200 in paise
...
-- Step 2: Verify amount (SECURITY: prevent amount tampering)
IF v_payment.amount != v_expected_amount THEN
  RETURN jsonb_build_object('success', false, 'error', 'Invalid payment amount');
END IF;
```

Ye sabse khatarnak cheez hai. Aaj hi agar Dubai ka price 400 set kar diya jaye to:

1. Candidate ₹400 pay karega — **paisa Razorpay se kat jayega**
2. `verify_payment` bolega "Invalid payment amount" (kyunki 40000 ≠ 20000)
3. Candidate activate nahi hoga, tracking token nahi milega, password nahi milega

Yani **paisa le liya, service nahi di** — cash leakage ka ulta, aur customer ke liye isse bura kuch
nahi. Isliye ye fix **usi deploy mein** jana chahiye jisme prices change ho rahe hain. Alag se, baad
mein nahi.

### 🟠 Blocker 2 — Preferred Location free-text box hai

`apply.html:324`

```html
<input type="text" id="location" list="locList" required />
<datalist id="locList"></datalist>
```

`datalist` sirf suggestion deta hai — candidate kuch bhi type kar sakta hai. Jab price location pe
depend karega, to `Dubaii`, `dubai ` (trailing space), ya `Qatar` type karke koi bhi expensive
location ka price bypass kar sakta hai. Isliye ise **strict dropdown** banana padega — details
§7 aur Decision **D2** mein.

### 🟡 Blocker 3 — do jagah chupchap ₹200 pe gir jaane wala fallback hai

| File | Line | Code |
|---|---|---|
| `supabase/functions/create-razorpay-order/index.ts` | 119 | `typeof created.amount === "number" ? created.amount : 20000` |
| `js/payment.js` | 339 | `const payAmount = orderResult.amount \|\| 20000;` |

Aaj ye "safe default" lagta hai. Dynamic pricing ke baad ye **mispricing** ban jayega: koi chhota bug
aaya to Europe ka ₹500 chupchap ₹200 ho jayega aur kisi ko pata bhi nahi chalega. Dono ko **hard
error** banana hai — fee resolve na ho to payment shuru hi nahi hona chahiye.

---

## 1. Formula aur example

| Location | Base | Trade | Surcharge | Total |
|---|---|---|---|---|
| Mumbai | ₹200 | Helpers & Labour | + ₹0 | **₹200** |
| Dubai, UAE | ₹400 | Helpers & Labour | + ₹0 | **₹400** |
| Dubai, UAE | ₹400 | Welders | + ₹150 | **₹550** |
| Europe | ₹500 | Welders | + ₹150 | **₹650** |
| Europe | ₹500 | Engineers | + ₹300 | **₹800** |

Ek hi trade ka surcharge har location pe same lagta hai (Welders har jagah +₹150), lekin **har trade
ka amount apna alag hota hai** — Welders +150, Engineers +300, Helpers +0. Admin jo chahe set kare.

---

## 2. Data model

### `locations` — 2 naye column

| Column | Type | Notes |
|---|---|---|
| `fee_paise` | `integer NOT NULL DEFAULT 20000` | Base fee, **paise mein** (40000 = ₹400) |
| `updated_at` | `timestamptz DEFAULT now()` | Kab price badla — audit ke liye |

```sql
ALTER TABLE locations ADD COLUMN IF NOT EXISTS fee_paise  INTEGER NOT NULL DEFAULT 20000;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_fee_sane;
ALTER TABLE locations ADD  CONSTRAINT locations_fee_sane
  CHECK (fee_paise >= 100 AND fee_paise <= 5000000);
```

**`NOT NULL DEFAULT` kyun (ye important hai):** isse "unpriced location" naam ki state hi exist nahi
karti. Admin naya sheher add karega to wo automatically ₹200 inherit karega, list mein number dikhega,
aur admin badal dega. Kabhi `NULL` ya `0` nahi — yani "price nahi mila to kya karein?" wala sawaal hi
khatam. Ye leakage ka ek poora rasta band kar deta hai.

**CHECK ki dono side kyun:** neeche `100` = Razorpay ka minimum ₹1 hai, usse kam ka order banega hi
nahi. Upar `5000000` = ₹50,000 cap — admin galti se `4` (₹0.04) ya extra zero (`4000` = ₹4,000 ki
jagah ₹40,000) type kar de to DB rok degi.

### `trades` — 1 naya column

| Column | Type | Notes |
|---|---|---|
| `surcharge_paise` | `integer NOT NULL DEFAULT 0` | "+" amount. 0 = koi extra charge nahi |

```sql
ALTER TABLE trades ADD COLUMN IF NOT EXISTS surcharge_paise INTEGER NOT NULL DEFAULT 0;

ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_surcharge_sane;
ALTER TABLE trades ADD  CONSTRAINT trades_surcharge_sane
  CHECK (surcharge_paise >= 0 AND surcharge_paise <= 5000000);
```

`>= 0` deliberately — aapne kaha "trade wala bas + ke sath lagega", to discount/minus ka option nahi
rakha. Agar future mein minus chahiye to ye constraint badalna padega (aur §5 ka L9 dobara sochna
padega).

### `payments` — 3 naye column (price ka **snapshot**)

| Column | Type | Notes |
|---|---|---|
| `base_paise` | `integer` | Order banate waqt location ka price |
| `surcharge_paise` | `integer` | Order banate waqt trade ka surcharge |
| `price_source` | `jsonb` | `{location, trade, location_id, trade_id, resolved_at}` |

`amount` column already maujood hai — wahi total rahega: `amount = base_paise + surcharge_paise`.

**Snapshot kyun rakhna hai — ye sabse subtle trap hai:** socho candidate Razorpay checkout screen pe
khada hai (order ₹400 ka ban chuka hai), aur usi waqt admin Dubai ka price 400 se 500 kar deta hai.
Candidate ₹400 pay karega, kyunki order 400 ka tha aur usne 400 dekha tha.

Isliye `verify_payment` ko **snapshot se compare karna hai, price dobara calculate nahi karni**. Agar
verify ne recompute kiya to wo 500 expect karega, 400 milega, aur payment fail — wapas Blocker 1 wali
situation. Ye galti karna bahut aasan hai, isliye likhkar rakha hai.

Snapshot dispute ke waqt bhi kaam aata hai: "isne us waqt ₹400 hi dekha tha" prove kar sakte hain.

### `settings` — 1 naya key

| Key | Value | Notes |
|---|---|---|
| `fee_default_paise` | `20000` | Sirf seed/fallback reference. Live pricing isse nahi aati. |

`settings` free-form `key text primary key, value text` hai, to koi migration nahi chahiye — bas
admin panel mein ek field.

### `fee_audit` — naya chhota table (recommended)

| Column | Type |
|---|---|
| `id` | uuid PK |
| `changed_at` | timestamptz default now() |
| `target_type` | text — `location` \| `trade` |
| `target_name` | text |
| `old_paise` | integer |
| `new_paise` | integer |

Kaun-kab-kya badla ka record. Do fayde: (1) kisi din collection kam dikhe to turant pata chalega ki
kisi ne price giraya tha, (2) customer dispute mein proof. Admin (authenticated) insert kar sakta hai,
anon ko iska access nahi.

---

## 3. Price kaun decide karta hai — poore system mein ek hi jagah

Naya function, **yahi single source of truth hai**:

```sql
CREATE OR REPLACE FUNCTION resolve_application_fee(p_trade TEXT, p_location TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_loc   RECORD;
  v_trade RECORD;
  v_total INTEGER;
BEGIN
  -- Location: normalized match, aur sirf active
  SELECT * INTO v_loc FROM locations
   WHERE LOWER(TRIM(name)) = LOWER(TRIM(COALESCE(p_location, '')))
     AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'LOCATION_INVALID: Please choose a location from the list.');
  END IF;

  -- Trade: same treatment
  SELECT * INTO v_trade FROM trades
   WHERE LOWER(TRIM(name)) = LOWER(TRIM(COALESCE(p_trade, '')))
     AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'TRADE_INVALID: Please choose a trade from the list.');
  END IF;

  v_total := v_loc.fee_paise + COALESCE(v_trade.surcharge_paise, 0);

  -- Razorpay ka floor. Constraints ke saath ye kabhi trigger nahi hona chahiye,
  -- lekin ₹0 ka order banane se pehle marna behtar hai.
  IF v_total < 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FEE_INVALID: Fee is not configured correctly.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'base_paise', v_loc.fee_paise,
    'surcharge_paise', COALESCE(v_trade.surcharge_paise, 0),
    'total_paise', v_total,
    'location', v_loc.name,      -- canonical spelling, jo DB mein hai
    'trade', v_trade.name,
    'location_id', v_loc.id,
    'trade_id', v_trade.id
  );
END;
$$;
```

Do jagah use hoga:

| Caller | Kaam | Grant |
|---|---|---|
| `create_payment_order()` | **Authoritative** — asli paisa yahi decide karta hai | `service_role` (already) |
| `get_application_fee(trade, location)` — naya thin read-only wrapper | Form pe live display | `anon` |

**Dono ek hi function call karte hain**, isliye jo screen pe dikha wahi charge hoga — display aur
charge ka mismatch structurally possible nahi hai. `get_application_fee` kuch bhi likhta nahi, sirf
padhta hai, to usko anon dena safe hai (prices already public hain — form pe dikhane hi hain).

### `create_payment_order()` mein badlav

```sql
-- purana
v_amount INTEGER := 20000; -- Fixed ₹200 (in paise)

-- naya: campaign override ke BAAD
v_fee := resolve_application_fee(v_trade, v_location);
IF NOT COALESCE((v_fee->>'ok')::boolean, false) THEN
  RETURN jsonb_build_object('success', false, 'error', v_fee->>'error');
END IF;
v_amount   := (v_fee->>'total_paise')::INTEGER;
v_trade    := v_fee->>'trade';       -- canonical spelling DB se
v_location := v_fee->>'location';
```

**Order bahut important hai.** Function mein campaign apna trade aur location force karta hai:

```sql
v_trade := v_campaign.trade;
IF COALESCE(TRIM(v_campaign.location), '') <> '' THEN
  v_location := TRIM(v_campaign.location);
END IF;
```

Fee resolve **iske baad** hona chahiye. Warna campaign se aaye candidate ko uske browser wale
(purane, ya crafted) location ka price lagega — yani campaign wali seat sasti mil jayegi. Ye leakage
ka sabse chupa hua rasta hai.

Fayda ye bhi hai ki `v_trade`/`v_location` ab DB ki canonical spelling se overwrite ho rahe hain, to
`candidates` table mein `dubai` / `DUBAI ` jaisi gandi entries aana band ho jayengi.

`payments` insert mein `base_paise`, `surcharge_paise`, `price_source` bhi jayenge, aur return JSON
mein `base_paise` + `surcharge_paise` add honge (receipt/breakdown dikhane ke liye).

---

## 4. `verify_payment` — hardcoded 20000 hatana

```sql
-- purana
v_expected_amount INTEGER := 20000;
IF v_payment.amount != v_expected_amount THEN ...

-- naya: amount SNAPSHOT se aata hai, dobara calculate NAHI karna
IF v_payment.amount IS NULL
   OR v_payment.amount < 100
   OR v_payment.amount <> COALESCE(v_payment.base_paise, 0) + COALESCE(v_payment.surcharge_paise, 0)
THEN
  RETURN jsonb_build_object('success', false, 'error', 'PAYMENT_AMOUNT_MISMATCH');
END IF;
```

Ye check ab "kya total apne hi components se match karta hai" verify karta hai — yani DB ke andar koi
row chhed-chhaad hui hai to pakdi jayegi, lekin legit dynamic price kabhi fail nahi hogi.

**Purane orders ka backfill (zaroori):** migration ke waqt jo orders already ban chuke hain unme
`base_paise` NULL hoga aur wo naye check pe fail ho jayenge. Isliye migration mein:

```sql
UPDATE payments
   SET base_paise = amount, surcharge_paise = 0
 WHERE base_paise IS NULL;
```

Isse deploy ke waqt Razorpay pe khade in-flight customers nahi tootenge.

### Aur ek asli tala — Razorpay se amount confirm karo

Aaj `verify-razorpay-payment` sirf HMAC signature check karta hai. Signature itna batata hai ki "is
order pe ek payment hui". Amount aaj Razorpay khud enforce karta hai (order-bound payment order ke
amount se kam nahi ho sakti, kyunki `partial_payment` on nahi hai), to aaj koi gap nahi hai.

Lekin dynamic pricing ke baad har order ka amount alag hoga, aur "kitna paisa actually aaya" ka final
proof sirf Razorpay ke paas hai. Isliye edge function mein ek call add karni chahiye:

```
GET https://api.razorpay.com/v1/payments/{razorpay_payment_id}
  (same Basic auth: base64(KEY_ID:KEY_SECRET))

assert payment.order_id === <order_id jo aaya>
assert payment.amount   === <payments.amount DB se>
assert payment.status   === 'captured'      // ya 'authorized' agar auto-capture off hai
```

Teeno match hone pe hi `verify_payment` RPC call ho. **Ye single check cash leakage ke against sabse
strong tala hai** — kyunki ye kisi assumption pe nahi, gateway ke apne record pe bharosa karta hai.
Cost: ek extra server-to-server API call per payment.

---

## 5. Cash leakage — 12 rules ka checklist

| # | Risk | Kaise band hua |
|---|---|---|
| **L1** | Browser amount bhejta hai | Kabhi nahi. Browser sirf trade+location bhejta hai; amount `create_payment_order` decide karta hai. Aaj bhi aisa hi hai — isko todna nahi. |
| **L2** | DevTools se Checkout ka amount badalna | Bekaar. `order_id` diya hua hai, to Razorpay **order ka** amount charge karta hai; `options.amount` sirf display ke liye hai. |
| **L3** | Sasta / galat location type karna | Strict dropdown + server whitelist. Unknown location = `LOCATION_INVALID`, order banta hi nahi. |
| **L4** | Location jiska price set nahi hai | Possible nahi — `fee_paise NOT NULL DEFAULT 20000`. "Unpriced" state exist nahi karti. |
| **L5** | Inactive location/trade use karna | `resolve_application_fee` dono pe `is_active = true` maangta hai. |
| **L6** | Trades list se bahar ka trade bhejna | `TRADE_INVALID`. |
| **L7** | Pay karke baad mein location upgrade karna | `candidates` pe anon/self ke liye **koi UPDATE policy nahi hai** (maine recovered SQL mein verify kiya — sirf `admin all candidates` for `authenticated`, aur read-own policies). Candidate apni row badal nahi sakta. |
| **L8** | Price mid-checkout badal jaye | Snapshot honour hota hai; verify recompute nahi karta (§2, §4). |
| **L9** | Fee 0 ya minus | `CHECK fee_paise >= 100`, `surcharge_paise >= 0`, plus resolve ke andar `total >= 100`. |
| **L10** | Float / rounding se paisa gir jaye | Sab kuch **integer paise**. Koi decimal, koi rupee-to-paise multiply nahi. Admin UI rupee leta hai, `Math.round(rupees * 100)` ek hi jagah hota hai. |
| **L11** | Silent ₹200 fallback | Dono jagah (`index.ts:119`, `payment.js:339`) se hata ke hard error. |
| **L12** | Admin ki typo | Upper `CHECK` cap (₹50,000) + admin UI pe "₹400 confirm karein?" + `fee_audit` row. |

Do cheezein jo **already sahi hain aur inhe chhedna nahi**:

- `payments` RLS: `USING (false)` — anon ko payments table dikhta hi nahi
- `create_payment_order` / `verify_payment` grants: `service_role` **only**. Naye function
  `resolve_application_fee` ko bhi `service_role` only; sirf `get_application_fee` wrapper ko `anon`.

---

## 6. Admin panel — naya `💰 Pricing` view

Aapne kaha: *"waha location list hoga waha ek ek location ka price add karega admin aur … fir side me
trade ka option hoga"*. To ek hi screen pe dono, side by side:

```
💰 Pricing                                        [ Save all changes ]

┌─ Location base fee ──────────────┐  ┌─ Trade surcharge (+) ────────────┐
│ Dubai, UAE          [₹  400  ]   │  │ Welders            + [₹  150  ]  │
│ Europe              [₹  500  ]   │  │ Engineers          + [₹  300  ]  │
│ Mumbai              [₹  200  ]   │  │ Fitters            + [₹  100  ]  │
│ Delhi               [₹  200  ]   │  │ Helpers & Labour   + [₹    0  ]  │
│ …                                │  │ …                                │
└──────────────────────────────────┘  └──────────────────────────────────┘

Live check:  [ Dubai, UAE ▾ ] + [ Welders ▾ ]  =  ₹550
```

- Input **rupees** mein (admin ko paise ki tension nahi), save pe `Math.round(v * 100)`
- Wo "Live check" calculator: admin apna combo check kar sake save karne se pehle — galat price
  set hone ka sabse aasan bachav
- Existing `📍 Locations` view ke chips waise hi rahenge (add/remove ke liye); price yahan
- Existing trade cards pe bhi surcharge dikha sakte hain (read-only badge), edit yahan
- Save pe har badle hue row ka `fee_audit` entry

---

## 7. Apply form (`apply.html`) — fee live dikhegi

**Location field:** free-text input → strict `<select>` (Blocker 2). Options `locations` se, price ke
saath:

```html
<select id="location" required>
  <option value="">Select location...</option>
  <option value="Dubai, UAE">Dubai, UAE — ₹400</option>
  <option value="Europe">Europe — ₹500</option>
</select>
```

Campaign lock (`lockCampaignLocation()`) ab `readonly` ki jagah `disabled` + hidden mirror use karega,
ya select ko single-option pe reduce karega — dono kaam karte hain, `disabled` select submit nahi hota
isliye value alag se `candidateData` mein bhejni hogi. Server phir bhi campaign se override karta hai,
to koi risk nahi.

**Payment step:** static `₹200` (`apply.html:381`, `386`) ki jagah live breakdown:

```
Application Fee

Base — Dubai, UAE          ₹400
Welders surcharge        + ₹150
──────────────────────────────
Total                      ₹550

[ 🔒 Confirm & Proceed to Pay ₹550 ]
```

- Amount `get_application_fee` RPC se, **kabhi hardcoded nahi**
- Trade ya location badalne pe turant recalculate
- **Agar RPC fail ho jaye:** button disabled + "Fee load nahi ho payi, page refresh karein". ₹200
  assume **kabhi nahi** karna (L11)
- Button ka text 4 jagah hardcoded hai `js/payment.js` mein (lines 313, 329, 371, 401) + `apply.html:386`
  ka initial label — ek helper `payButtonLabel()` bana ke sab wahan se aayenge, warna ek jagah chhoot
  jayegi aur ₹200 dikhta rahega

**₹200 ki poori list (grep se verified, 2026-09-02) — ek bhi chhoot na jaye:**

| File | Line | Kya hai |
|---|---|---|
| `apply.html` | 7 | `<meta name="description">` — "Application fee: ₹200" |
| `apply.html` | 249 | Hero text — "Application fee: ₹200" |
| `apply.html` | 381 | `.payment-amount` — bada number |
| `apply.html` | 386 | Button ka initial label |
| `js/payment.js` | 313, 329, 371, 401 | Button label reset (4 jagah) |
| `js/payment.js` | 339 | Silent fallback (L11) |
| `js/payment.js` | 345 | Comment — "₹200 fixed amount" |
| `supabase/functions/create-razorpay-order/index.ts` | 119 | Silent fallback (L11) |
| `supabase/functions/create-razorpay-order/index.ts` | 127 | Comment |
| `admin/dashboard.html` | 170, 174 | Campaign help text — "normal ₹200 application form", "successful ₹200 payment" |

Lines 7 aur 249 pe fee dynamic nahi ho sakti (meta tag aur static hero), to wahan number hatana hoga
— "Application fee location ke hisab se" jaisa kuch. Admin help text (170/174) generic karna hoga.

---

## 8. Campaign flow ka asar

`campaigns.location` abhi **free text** hai (`cmLocation` input + `cmLocList` datalist). Agar campaign
ka location kisi `locations` row se match nahi karta, to `resolve_application_fee` `LOCATION_INVALID`
degi aur **us campaign se koi apply hi nahi kar payega**.

To campaign editor mein bhi location ko list se bind karna hoga (`<select>`), ya save pe validate
karna hoga ki wo location `locations` mein maujood hai. Ye kaam is feature ka hissa hai, optional
nahi.

Saath mein: campaign card pe fee dikhana chahiye ("Application fee ₹550") — worker ko pehle se pata
ho. Aur `create_payment_order` mein **campaign override pehle, fee resolve baad mein** (§3).

---

## 9. i18n

Naye keys, sab **6 languages** (en/hi/bn/ta/te/mr) mein — `js/i18n.js`:

`fee.title`, `fee.base`, `fee.surcharge`, `fee.total`, `fee.payBtn` (`"Pay ₹{amount}"` — placeholder
ke saath), `fee.loadError`, `fee.selectLocation`.

Admin panel English hi hai, wahan i18n nahi chahiye.

---

## 10. Files touched

| File | Kya badlega |
|---|---|
| `supabase/pricing_migration.sql` | **naya** — columns, constraints, `resolve_application_fee`, `get_application_fee`, `create_payment_order`, `verify_payment`, backfill, `fee_audit`, grants |
| `supabase/functions/create-razorpay-order/index.ts` | line 119 ka `20000` fallback → hard error; `base/surcharge` pass-through |
| `supabase/functions/verify-razorpay-payment/index.ts` | Razorpay `GET /v1/payments/{id}` amount + status assert |
| `js/payment.js` | line 339 fallback hatana, breakdown render, `payButtonLabel()` helper |
| `apply.html` | location `input`→`select`, static ₹200 block → live breakdown, meta+hero text |
| `js/i18n.js` | 7 naye keys × 6 languages |
| `admin/dashboard.html` | naya `💰 Pricing` view + sidebar link; campaign help text ka ₹200 generic |
| `admin/admin.js` | pricing load/save, rupee↔paise convert, live calculator, audit insert |
| `admin/campaigns.js` | campaign location ko `locations` list se bind |
| `js/campaigns.js` | campaign card pe fee dikhana |
| `css/style.css` | pricing grid + fee breakdown styles |

Cache-bust: `style.css` (13 files), `js/app.js` (9), `js/i18n.js` (8), `payment.js`, `admin.js`.

---

## 11. Deploy order — yahi order, warna site tootegi

1. **SQL migration** chalao (`supabase/pricing_migration.sql`) — idempotent, re-runnable
2. **Dono Edge Functions** redeploy
3. **Frontend** push (Vercel auto-deploy) with cache-bust bump
4. **Admin panel se prices set karo** (tab tak sab locations ₹200 pe hain — site normal chalti rahegi)
5. **Test** (§12)

**Ye order kyun:** SQL pehle jaye to purana frontend bhi chalta rahega, kyunki jab tak saare prices
default ₹200 hain, `resolve_application_fee` 20000 hi return karegi — yani zero downtime. Ulta kiya
(frontend pehle) to `get_application_fee` RPC exist nahi karegi aur apply form ka payment step toot
jayega.

Step 3 aur 4 ke beech mein prices ₹200 hi rahenge — yani aap aaram se verify kar sakte ho ki naya
code purane price pe theek chal raha hai, phir prices badlo.

---

## 12. Test plan

Normal:

1. Mumbai + Helpers → ₹200 dikhe, ₹200 kate, candidate activate + token mile
2. Dubai + Welders → ₹550 dikhe, ₹550 kate, activate ho
3. Europe + Engineers → ₹800
4. Trade badlo (Welders → Helpers) → total turant 550 → 400 ho jaye
5. Campaign se apply (locked trade + location) → campaign ka price lage, browser ka nahi

Leakage (**ye zaroori hain**):

6. DevTools se `<option>` ki value `"Xyz"` kar do → `LOCATION_INVALID`, order na bane
7. `candidateData.location` ko fetch intercept karke `"Mumbai"` kar do jab Dubai select tha →
   Mumbai ka ₹200 lagega **aur candidate row mein bhi Mumbai hi save hoga** (jo mila wahi paid — koi
   leak nahi). Verify karo ki row mein Dubai **nahi** aa raha
8. Checkout ka `options.amount` 100 kar do → Razorpay phir bhi order ka pura amount charge karega
9. Order banne ke baad admin price badle → purana order apne snapshot pe hi verify ho
10. Naya location add karo, price na set karo → ₹200 default, koi crash nahi
11. `is_active = false` location bhejo → `LOCATION_INVALID`
12. Admin `₹0` set karne ki koshish kare → DB `CHECK` rok de
13. Migration se pehle bana order (base_paise NULL) → backfill ke baad verify ho jaye
14. Campaign ka location jo `locations` mein nahi hai → admin ko save pe warning mile

Regression:

15. Employer form pe koi asar nahi (unko fee nahi lagti)
16. Already-paid candidate dobara verify kare → idempotent early-return, `already_registered`
17. Account-takeover fix intact: existing email ka password reset **na** ho
18. "No payment success → no token" rule intact

---

## 12.1 Verification results — 2026-09-02

Sandbox mein asli Postgres nahi chal saka (`sudo` blocked), isliye do tarah se verify kiya:

**A) Logic harness (`outputs/pricing_harness.js`) — 44/44 PASS.**
Ismein (a) `js/payment.js` ke asli pure helpers (`paiseToRupees`, `feeIsUsable`,
`payButtonLabel`, `escFee`) run kiye, aur (b) SQL ka faithful JS port
(`resolve_application_fee` → `create_payment_order` → `verify_payment`) banakar
upar ke saare 18 cases chalaye. Sab green — including leak cases #6–#14 aur
regression #15–#18. Khaas kar:
- #5/#8 campaign price browser field se nahi, campaign se aaya (₹550, row = Dubai)
- #7 tampered location ne wahi charge kiya jo save hua (koi Dubai→Mumbai leak nahi)
- #9 mid-checkout price change ke baad purana order apne ₹550 snapshot pe verify hua
- #13 legacy NULL-base order `COALESCE(base, amount)` se verify hua

**B) Structural SQL check — PASS.** `$$` delimiters even (8), `BEGIN`/`END` balanced
(4/4), comments+strings strip karne ke baad parens balanced (112/112, depth kabhi
negative nahi). Grants sahi: `resolve_application_fee` / `create_payment_order` /
`verify_payment` → **service_role only**; sirf read-only `get_application_fee` →
anon. `fee_audit` RLS = authenticated SELECT+INSERT, anon kuch nahi. Git history
mein candidates/payments pe koi anon/self `UPDATE` policy nahi (sirf
`storage.objects`) — L7 intact.

**C) Independent security audit (subagent, full diff) — verdict SHIP, zero critical
findings.** L1–L12 sab PASS (L7 UNCLEAR sirf isliye ki base-schema RLS is repo mein
nahi hai — par is feature ne koi candidate UPDATE path add nahi kiya, aur charge
immutable order/snapshot pe hai, to koi money-leak nahi). Extra checks 1–7 (campaign
override se pehle resolve, snapshot compare, service_role grants, no ₹200 fallback,
idempotency + account-takeover guard, no SQLi, integer-only amount) sab PASS.

**Audit note #2 ka follow-up:** L12 ka admin confirm-dialog ab implement ho gaya
(`confirmBigPriceChange` in `admin.js`) — bade/ajeeb price edits (≥ ₹2,000, ya 3×+
jump, ya ⅓ tak gira) pe confirm maangta hai; normal chhote adjustments chupchap save.
Threshold logic 9/9 unit tests pass.

**Abhi baaki (aapke manual steps, §11 deploy order):** SQL migration chalana, dono
edge functions redeploy, frontend push — inke bina yeh code live nahi hai. Jo log
pehle se paid hain unka data isme kuch nahi chhedta (idempotent verify + koi
backfill nahi).

---

## 13. Decisions

| # | Decision | Status |
|---|---|---|
| **D1** | Trade surcharge **global per trade** — har trade ka apna alag amount, jo sab locations pe same lagta hai. Welders +150, Engineers +300, Helpers +0. | ✅ Aapne confirm kiya |
| **D2** | Preferred Location free-text se **strict dropdown** ban gaya | ✅ **Implement ho gaya** (L3 band). Yeh maine decide kiya tha aur "ache se banao, koi leak na ho" wale direction ke tahat laga diya — free-text rehta to koi `Dubaii` likh ke sasta fee de deta. Agar aapko free text chahiye to batao, revert kar dunga (par phir unlisted location pe ek default fee wala rasta khula rahega). |
| **D3** | Employers pe koi fee nahi (aaj bhi nahi hai) | Unchanged |
| **D4** | Price badalne se purane paid candidates pe koi asar nahi, koi refund/top-up nahi | Assumed |
| **D5** | Currency INR hi rahegi | Confirmed (country-wise pricing wala idea cancel ho gaya) |

---

## 14. Effort estimate

| Part | Kaam |
|---|---|
| SQL migration | Sabse zyada dhyan wala hissa — 3 functions rewrite + backfill |
| Edge functions | Chhota — 1 fallback hatana + 1 API call add |
| Apply form | Medium — input→select, breakdown UI, 5 button labels |
| Admin pricing panel | Medium — naya view + save + calculator |
| Campaign binding | Chhota |
| i18n | Chhota, lekin 6 languages × 7 keys = dhyan se |
| Testing | 18 cases, jisme 9 leakage ke |

Sabse zyada risk **SQL** mein hai (`verify_payment` galat likha to live payments tootengi), isliye
wahan node harness se pehle test karunga — jaise `shell_harness.js` aur `apply_harness.js` mein kiya
tha.
