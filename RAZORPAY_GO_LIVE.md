# Razorpay Go-Live Guide — Go Hire Consultancy

This is the exact, step-by-step process to switch candidate payments from
**test mode** to **real (live) money**, securely.

> **What changed and why (read this once).**
> The old flow was insecure for real money:
> 1. Razorpay Checkout opened **without a server order id**, and
> 2. `verify_payment()` did **no signature check** and was callable by the
>    public `anon` key — so anyone could mark themselves "paid" without paying.
>
> The new flow fixes both:
> - **`create-razorpay-order`** Edge Function creates a genuine Razorpay order
>   using the secret key (server-side only).
> - **`verify-razorpay-payment`** Edge Function verifies the Razorpay signature
>   (HMAC-SHA256) before anything is marked paid.
> - **`razorpay_secure_lockdown.sql`** removes `anon`'s ability to call the old
>   RPCs directly, so the browser bypass is gone.
>
> **Golden rule:** the Razorpay **Key Secret** and the Supabase **service_role**
> key must NEVER appear in any frontend file or in git. They live only in
> Supabase Edge Function secrets.

---

## 0. Files involved (already in the repo)

- `supabase/functions/create-razorpay-order/index.ts` — creates the real order
- `supabase/functions/verify-razorpay-payment/index.ts` — verifies the signature
- `supabase/verify_payment_fix.sql` — **secure** verify_payment (no password reset
  for existing accounts; service_role-only). Run this in SQL editor.
- `supabase/razorpay_secure_lockdown.sql` — locks down the old RPCs from anon
- `js/payment.js` — updated to call the Edge Functions + pass the real order_id
- `js/config.js` — publishable Key ID only (secret never here)
- `apply.html` — `payment.js` bumped to `?v=3`

---

## 1. Activate LIVE mode on Razorpay (KYC)

1. Log in to the Razorpay Dashboard → complete **KYC / Account Activation**
   (business details, bank account, PAN, etc.). Live keys don't work until the
   account is activated.
2. Switch the dashboard toggle from **Test Mode** to **Live Mode**.
3. Go to **Settings → API Keys → Generate Live Key**.
4. Copy both:
   - **Key ID** — looks like `rzp_live_XXXXXXXX` (publishable, safe in browser)
   - **Key Secret** — shown **once**. Copy it now and keep it private.

> Keep the test keys too — useful for staging.

---

## 2. Install & connect the Supabase CLI

On your computer (one-time). On Windows the easiest is to install it as a dev
dependency and run it with `npx` (a global `supabase` install is not supported):

```bash
# Install into this project (Windows/macOS/Linux)
npm install supabase --save-dev

# IMPORTANT: run every CLI command with `npx` — plain `supabase` is NOT on PATH.
# Log in (opens the browser; if not, create a token at
# https://supabase.com/dashboard/account/tokens and paste it)
npx supabase login

# Link this folder to the project (ref is in your Supabase URL)
npx supabase link --project-ref srbudwxaxqfddwmwhobw
```

---

## 3. Deploy the two Edge Functions

From the repo root (the folder containing the `supabase/` directory):

```bash
npx supabase functions deploy create-razorpay-order
npx supabase functions deploy verify-razorpay-payment
```

> Leave JWT verification ON (the default). The site calls these with the
> Supabase anon key in the `Authorization` header, which is a valid project
> JWT, so requests pass — and random anonymous internet traffic without a valid
> project JWT is rejected.

---

## 4. Set the Edge Function secrets (LIVE keys)

```bash
npx supabase secrets set RAZORPAY_KEY_ID=rzp_live_XXXXXXXX RAZORPAY_KEY_SECRET=YOUR_LIVE_SECRET
```

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **auto-provided** to Edge
  Functions — you do **not** set those.
- Verify what's set (values are hidden):

  ```bash
  npx supabase secrets list
  ```

> Never paste the secret into chat, code, or a committed file. If it ever
> leaks, rotate it in the Razorpay dashboard and re-run `secrets set`.

---

## 5. Point the frontend at the LIVE publishable key

The server now returns `key_id` and the checkout uses it, so this step is about
consistency and the fallback path.

- **Vercel** → Project → **Settings → Environment Variables** → set
  `RAZORPAY_KEY_ID = rzp_live_XXXXXXXX` → **Redeploy**.
- The fallback in `js/config.js` is still the **test** key — that's fine; the
  live `key_id` returned by the Edge Function takes priority at checkout.

---

## 6. Deploy the site (commit + push)

The VM/bash was down while building this, so run these yourself:

```bash
git add -A
git commit -m "Razorpay live: server-side order + HMAC signature verify + lock down RPCs"
git push
```

Vercel auto-builds on push. Hard-refresh the site afterward (the `?v=3` bump
busts the old `payment.js` cache).

---

## 7. Run the secure SQL (do this AFTER steps 3–6 work)

Open **Supabase → SQL Editor** and run these two files, in order:

**7a.** Paste the contents of `supabase/verify_payment_fix.sql` and run it. This
installs the hardened `verify_payment`:
- It never resets the password of an email that already has an account (closes
  an account-takeover path where someone pays ₹200 with a victim's email to get
  a working credential). Existing accounts are only *linked* to the new
  application; new accounts get a fresh temporary password.
- It is granted to `service_role` only.

**7b.** Paste the contents of `supabase/razorpay_secure_lockdown.sql` and run it.
The final `SELECT` should return:

| anon_create_order | anon_verify_payment | auth_create_order | auth_verify_payment | service_create_order | service_verify_payment |
|-------------------|---------------------|-------------------|---------------------|----------------------|------------------------|
| false             | false               | false             | false               | true                 | true                   |

> Do this **last**. If you lock down before the Edge Functions are live, the
> apply form will break (the browser can no longer call the RPCs directly, by
> design).

---

## 8. Do one REAL end-to-end test (₹200) + refund

1. Open `apply.html` on the live site, fill the form, upload a resume.
2. Pay the real ₹200 with a real method (UPI/card).
3. Confirm:
   - The success screen shows your email + a temporary password.
   - **Admin dashboard → Payments** shows the payment as `success`.
   - You can log in with the temp password and are forced to set a new one.
4. **Refund** the ₹200 from the Razorpay Dashboard → Payments → Refund (so your
   test doesn't cost you). Refunds don't undo the account, which is fine for a test.

### Confirm the hole is actually closed
Try calling the old RPC directly with the anon key (should now be **denied**):

```bash
curl -s -X POST "https://srbudwxaxqfddwmwhobw.supabase.co/rest/v1/rpc/verify_payment" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_order_id":"x","p_payment_id":"y","p_signature":"z"}'
```

Expect a **permission denied for function verify_payment** error. If you still
get a JSON result, the lockdown SQL didn't run — re-run step 7.

---

## 9. (Optional but recommended) Webhook safety net

If a candidate pays but closes the tab before verification returns, the browser
never calls the verify function. A webhook catches these:

1. Razorpay Dashboard → **Settings → Webhooks → Add** →
   URL: `https://srbudwxaxqfddwmwhobw.supabase.co/functions/v1/razorpay-webhook`
   Events: `payment.captured`. Set a **webhook secret**.
2. Add a third Edge Function `razorpay-webhook` that verifies the
   `X-Razorpay-Signature` header (HMAC-SHA256 of the raw body with the webhook
   secret), looks up the order, and calls `verify_payment` if not already done.
3. `supabase secrets set RAZORPAY_WEBHOOK_SECRET=...` and deploy with
   `supabase functions deploy razorpay-webhook --no-verify-jwt` (Razorpay can't
   send a Supabase JWT, so JWT verification must be OFF for this one — the
   webhook signature is its auth instead).

Ask me and I'll write this function when you're ready — it's optional; the main
flow already works without it.

---

## Security checklist

- [ ] Razorpay **Key Secret** only in `supabase secrets` (never in git/browser)
- [ ] Supabase **service_role** key only in Edge Functions (auto-injected)
- [ ] `verify_payment_fix.sql` run — hardened verify_payment (no takeover, service_role-only)
- [ ] `razorpay_secure_lockdown.sql` run — anon/authenticated can't call the RPCs
- [ ] Live ₹200 test passed, payment shows `success`, then refunded
- [ ] Direct `verify_payment` curl with anon key is **denied**
- [ ] (Housekeeping) Rotate the GitHub token in `.git/config` if it was ever exposed

## Rollback

If something misbehaves, you can revert to the previous behavior temporarily by
re-granting the RPCs (only do this knowingly — it reopens the bypass):

```sql
GRANT EXECUTE ON FUNCTION create_payment_order(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION verify_payment(TEXT, TEXT, TEXT) TO anon;
```

Better: keep the lockdown and fix forward (check `supabase functions logs
create-razorpay-order` / `verify-razorpay-payment` for errors).
