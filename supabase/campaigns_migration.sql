-- ============================================================================
-- Go Hire Consultancy — HIRING CAMPAIGNS
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: every statement is IF NOT EXISTS / CREATE OR REPLACE /
-- DROP-then-CREATE, so re-running never breaks anything.
--
-- WHAT THIS ADDS
--   1. `campaigns` table — admin creates a hiring drive (e.g. "Fitters — 10 needed")
--      with a marketing total (display_total = 50) and the REAL seat count
--      (seats_total = 10). `seats_filled` is a server-maintained counter.
--   2. `candidates.campaign_id` — links an application to the campaign it came from.
--   3. Seat counting via TRIGGERS on `candidates` (NOT inside verify_payment).
--      A seat is consumed only when payment_status becomes 'success', and is
--      released again if that candidate is deleted or un-paid.
--   4. Auto status flip: active → filled when seats run out, filled → active
--      when a seat frees up. Admin's own 'draft'/'closed' choices are respected.
--   5. `create_payment_order()` re-created with campaign validation, so a
--      candidate can NEVER pay ₹200 into a full / closed / expired campaign.
--      >> This is why NO Edge Function redeploy is needed: create-razorpay-order
--         forwards candidateData as-is, so campaign_id reaches this RPC already.
--   6. `recount_campaign_seats()` — admin reconciliation RPC.
--   7. `campaign-images` storage bucket (public read, admin write).
--
-- SECURITY NOTES (deliberate, please keep)
--   * verify_payment() is NOT touched by this migration. Its HMAC-verified,
--     service_role-only contract, the account-takeover fix and the
--     "no payment → no token" rule all stay exactly as they are.
--   * create_payment_order() stays SECURITY DEFINER, granted to service_role
--     ONLY (it is called by the create-razorpay-order Edge Function).
--   * anon can only SELECT live campaigns. It can never INSERT/UPDATE/DELETE
--     them, so seat numbers are tamper-proof from the browser.
--   * seats_filled is written only by the SECURITY DEFINER trigger.
-- ============================================================================


-- ============================================================================
-- 1) CAMPAIGNS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  slug                TEXT UNIQUE,
  trade               TEXT NOT NULL,          -- must match trades.name exactly
  location            TEXT,
  display_total       INTEGER NOT NULL DEFAULT 1,   -- shown publicly ("50 openings")
  seats_total         INTEGER NOT NULL DEFAULT 1,   -- the REAL requirement (10)
  seats_filled        INTEGER NOT NULL DEFAULT 0,   -- server-maintained counter
  salary_text         TEXT,
  experience_required TEXT,
  description         TEXT,
  image_url           TEXT,
  deadline            DATE,
  status              TEXT NOT NULL DEFAULT 'draft', -- draft|active|filled|closed
  is_featured         BOOLEAN NOT NULL DEFAULT false,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columns added defensively in case an earlier partial version of this table exists.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS slug                TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS location            TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS salary_text         TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS experience_required TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS description         TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS image_url           TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS deadline            DATE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_featured         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sort_order          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Sanity constraints. Dropped first so re-running can safely redefine them.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_seats_total_positive;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_display_gte_seats;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_seats_filled_nonneg;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_allowed;

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_seats_total_positive  CHECK (seats_total >= 1),
  ADD CONSTRAINT campaigns_display_gte_seats     CHECK (display_total >= seats_total),
  ADD CONSTRAINT campaigns_seats_filled_nonneg   CHECK (seats_filled >= 0),
  ADD CONSTRAINT campaigns_status_allowed
    CHECK (status IN ('draft', 'active', 'filled', 'closed'));

CREATE INDEX IF NOT EXISTS campaigns_status_idx   ON campaigns (status);
CREATE INDEX IF NOT EXISTS campaigns_trade_idx    ON campaigns (trade);
CREATE INDEX IF NOT EXISTS campaigns_featured_idx ON campaigns (is_featured) WHERE is_featured;


-- ============================================================================
-- 2) LINK APPLICATIONS TO CAMPAIGNS
--    ON DELETE SET NULL: deleting a campaign must never destroy a paying
--    candidate's application — it only unlinks it.
-- ============================================================================
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS campaign_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candidates_campaign_id_fkey'
  ) THEN
    ALTER TABLE candidates
      ADD CONSTRAINT candidates_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS candidates_campaign_id_idx ON candidates (campaign_id);


-- ============================================================================
-- 3) SLUG + STATUS NORMALISATION  (BEFORE trigger on campaigns)
--    Runs on every insert/update of a campaign and keeps the row coherent:
--      * generates a URL-safe unique slug from the title when missing
--      * clamps seats_filled to >= 0
--      * flips ONLY between 'active' and 'filled' based on seat availability.
--        'draft' and 'closed' are admin decisions and are never overridden.
--      * stamps updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION campaigns_normalise()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base   TEXT;
  v_try    TEXT;
  v_n      INTEGER := 1;
BEGIN
  -- ---- slug ----------------------------------------------------------------
  IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
    v_base := lower(btrim(COALESCE(NEW.title, 'campaign')));
    v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
    v_base := btrim(v_base, '-');
    IF v_base = '' THEN v_base := 'campaign'; END IF;
    v_base := left(v_base, 60);

    v_try := v_base;
    WHILE EXISTS (
      SELECT 1 FROM campaigns c WHERE c.slug = v_try AND c.id IS DISTINCT FROM NEW.id
    ) LOOP
      v_n := v_n + 1;
      v_try := v_base || '-' || v_n;
    END LOOP;
    NEW.slug := v_try;
  END IF;

  -- ---- seat sanity ---------------------------------------------------------
  IF NEW.seats_filled IS NULL OR NEW.seats_filled < 0 THEN
    NEW.seats_filled := 0;
  END IF;

  -- ---- auto open / close by availability ----------------------------------
  IF NEW.status = 'active' AND NEW.seats_filled >= NEW.seats_total THEN
    NEW.status := 'filled';
  ELSIF NEW.status = 'filled' AND NEW.seats_filled < NEW.seats_total THEN
    NEW.status := 'active';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_normalise_trg ON campaigns;
CREATE TRIGGER campaigns_normalise_trg
  BEFORE INSERT OR UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION campaigns_normalise();


-- ============================================================================
-- 4) SEAT COUNTER  (AFTER trigger on candidates)
--    A seat is consumed ONLY by a candidate whose payment_status = 'success'
--    and who is linked to a campaign. Works no matter which code path marks the
--    payment successful (Edge Function, a future webhook, or an admin fix), and
--    releases the seat again on delete / un-pay / campaign change.
--
--    Double-counting is impossible: verify_payment returns early when the
--    payment is already 'success', AND this trigger only reacts to a real
--    transition into 'success'.
-- ============================================================================
CREATE OR REPLACE FUNCTION campaign_seat_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_was_paid BOOLEAN;
  v_is_paid  BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.campaign_id IS NOT NULL AND NEW.payment_status = 'success' THEN
      UPDATE campaigns SET seats_filled = seats_filled + 1 WHERE id = NEW.campaign_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.campaign_id IS NOT NULL AND OLD.payment_status = 'success' THEN
      UPDATE campaigns SET seats_filled = GREATEST(0, seats_filled - 1)
      WHERE id = OLD.campaign_id;
    END IF;
    RETURN OLD;

  ELSE  -- UPDATE
    v_was_paid := (OLD.campaign_id IS NOT NULL AND OLD.payment_status = 'success');
    v_is_paid  := (NEW.campaign_id IS NOT NULL AND NEW.payment_status = 'success');

    IF OLD.campaign_id IS NOT DISTINCT FROM NEW.campaign_id THEN
      -- Same campaign: react only to a change in paid state.
      IF NOT v_was_paid AND v_is_paid THEN
        UPDATE campaigns SET seats_filled = seats_filled + 1 WHERE id = NEW.campaign_id;
      ELSIF v_was_paid AND NOT v_is_paid THEN
        UPDATE campaigns SET seats_filled = GREATEST(0, seats_filled - 1)
        WHERE id = OLD.campaign_id;
      END IF;
    ELSE
      -- Moved between campaigns (or unlinked by ON DELETE SET NULL).
      -- Note: when the parent campaign row is being deleted, the UPDATE below
      -- simply matches zero rows — harmless.
      IF v_was_paid THEN
        UPDATE campaigns SET seats_filled = GREATEST(0, seats_filled - 1)
        WHERE id = OLD.campaign_id;
      END IF;
      IF v_is_paid THEN
        UPDATE campaigns SET seats_filled = seats_filled + 1 WHERE id = NEW.campaign_id;
      END IF;
    END IF;

    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS campaign_seat_sync_trg ON candidates;
CREATE TRIGGER campaign_seat_sync_trg
  AFTER INSERT OR DELETE OR UPDATE OF payment_status, campaign_id ON candidates
  FOR EACH ROW EXECUTE FUNCTION campaign_seat_sync();


-- ============================================================================
-- 4b) LOCK DOWN candidates INSERT  (seat-integrity fix — IMPORTANT)
--     The original setup.sql shipped:
--         create policy "public can apply" on candidates
--           for insert to anon with check (true);
--     Permissive RLS policies are OR'ed together, so that one line let the
--     browser insert a candidate row with ANY column values — including
--     payment_status = 'success' and a campaign_id. With the seat trigger
--     above, that would let anyone burn every seat of every campaign and flip
--     it to "filled" using nothing but the public anon key.
--
--     No page needs anon INSERT on candidates any more: apply.html goes
--     through the create-razorpay-order Edge Function → create_payment_order()
--     (SECURITY DEFINER, service_role only), which bypasses RLS. The only
--     client-side candidates insert left in the codebase is the dead
--     `applyForm` branch of js/forms.js (no page contains an #applyForm).
--
--     We keep a *hardened* anon INSERT policy rather than removing it, so an
--     unknown legacy caller still degrades to a harmless pending row: it can
--     never claim a seat, mark itself paid, or mint a tracking token.
-- ============================================================================
DROP POLICY IF EXISTS "public can apply" ON candidates;
DROP POLICY IF EXISTS "candidates_insert_pending" ON candidates;

CREATE POLICY "candidates_insert_pending" ON candidates
  FOR INSERT TO anon
  WITH CHECK (
    (payment_status IS NULL OR payment_status = 'pending')
    AND campaign_id IS NULL
    AND tracking_token IS NULL
  );
-- Admin (authenticated) keeps full access through "admin all candidates";
-- service_role bypasses RLS entirely, so the real payment flow is untouched.


-- ============================================================================
-- 5) ROW LEVEL SECURITY
--    Public sees only live campaigns and can never modify them.
-- ============================================================================
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read campaigns" ON campaigns;
CREATE POLICY "public read campaigns" ON campaigns
  FOR SELECT TO anon
  USING (status IN ('active', 'filled'));

DROP POLICY IF EXISTS "admin all campaigns" ON campaigns;
CREATE POLICY "admin all campaigns" ON campaigns
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- ============================================================================
-- 6) create_payment_order — WITH CAMPAIGN VALIDATION
--    Identical to the live (gender_migration) version, plus:
--      * validates campaign_id when one is supplied
--      * forces the candidate's trade to the campaign's trade (so a crafted
--        request can't book a Fitters seat as a Welder)
--      * stores campaign_id on the candidate row
--    Error strings are prefixed CAMPAIGN_* so the frontend can show a clean,
--    friendly message and fall back to a normal (campaign-less) application.
--
--    Grants unchanged: service_role ONLY.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_payment_order(
  p_candidate_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidate_id UUID;
  v_receipt_id   TEXT;
  v_amount       INTEGER := 20000; -- Fixed ₹200 (in paise)
  v_campaign_id  UUID;
  v_campaign     RECORD;
  v_trade        TEXT;
BEGIN
  v_trade := p_candidate_data->>'trade';

  -- ---- Campaign validation (only when the application came from one) ------
  IF COALESCE(p_candidate_data->>'campaign_id', '') <> '' THEN
    BEGIN
      v_campaign_id := (p_candidate_data->>'campaign_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CAMPAIGN_MISSING: This hiring campaign could not be found. You can still apply normally.'
      );
    END;

    SELECT * INTO v_campaign FROM campaigns WHERE id = v_campaign_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CAMPAIGN_MISSING: This hiring campaign is no longer available. You can still apply normally.'
      );
    END IF;

    IF v_campaign.status <> 'active' THEN
      IF v_campaign.status = 'filled' OR v_campaign.seats_filled >= v_campaign.seats_total THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'CAMPAIGN_FULL: All seats for this campaign have been taken. You can still apply normally.'
        );
      END IF;
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CAMPAIGN_CLOSED: This campaign is not accepting applications right now. You can still apply normally.'
      );
    END IF;

    IF v_campaign.seats_filled >= v_campaign.seats_total THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CAMPAIGN_FULL: All seats for this campaign have been taken. You can still apply normally.'
      );
    END IF;

    -- Deadline is inclusive: the campaign stays open for the whole of that day.
    -- Compared in IST (not UTC) so the server agrees with what the campaign
    -- card told the worker — CURRENT_DATE would be a day behind for the first
    -- 5.5 hours of every Indian day.
    IF v_campaign.deadline IS NOT NULL
       AND v_campaign.deadline < (NOW() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CAMPAIGN_EXPIRED: The last date for this campaign has passed. You can still apply normally.'
      );
    END IF;

    -- Server is the authority on which trade this seat belongs to.
    v_trade := v_campaign.trade;
  END IF;

  -- ---- Step 1: Create candidate record (pending status) -------------------
  INSERT INTO candidates (
    full_name,
    phone,
    email,
    gender,
    trade,
    experience,
    location,
    resume_url,
    campaign_id,
    payment_status,
    status,
    created_at
  )
  VALUES (
    p_candidate_data->>'full_name',
    p_candidate_data->>'phone',
    p_candidate_data->>'email',
    p_candidate_data->>'gender',
    v_trade,
    p_candidate_data->>'experience',
    p_candidate_data->>'location',
    p_candidate_data->>'resume_url',
    v_campaign_id,
    'pending',
    'pending_payment',
    NOW()
  )
  RETURNING id INTO v_candidate_id;

  -- ---- Step 2: Generate unique receipt ID (for tracking only) -------------
  v_receipt_id := 'rcpt_' || REPLACE(v_candidate_id::TEXT, '-', '');

  -- ---- Step 3: Create payment record -------------------------------------
  INSERT INTO payments (
    candidate_id,
    razorpay_order_id,
    amount,
    currency,
    status,
    created_at
  )
  VALUES (
    v_candidate_id,
    v_receipt_id,
    v_amount,
    'INR',
    'created',
    NOW()
  );

  -- ---- Step 4: Return data for the Edge Function --------------------------
  RETURN jsonb_build_object(
    'receipt_id',   v_receipt_id,
    'amount',       v_amount,
    'candidate_id', v_candidate_id,
    'currency',     'INR',
    'campaign_id',  v_campaign_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Keep the grants exactly as the secure flow requires: service_role ONLY.
REVOKE ALL ON FUNCTION create_payment_order(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_payment_order(JSONB) TO service_role;


-- ============================================================================
-- 7) recount_campaign_seats — admin reconciliation
--    Recomputes seats_filled straight from the candidates table. Pass NULL to
--    recount every campaign. The BEFORE trigger then re-derives status.
--    Granted to `authenticated` because the admin panel logs in with Supabase
--    Auth. It only ever recomputes a count — it cannot create or reveal data.
-- ============================================================================
CREATE OR REPLACE FUNCTION recount_campaign_seats(p_campaign_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE campaigns c
  SET seats_filled = (
        SELECT COUNT(*) FROM candidates ca
        WHERE ca.campaign_id = c.id
          AND ca.payment_status = 'success'
      )
  WHERE p_campaign_id IS NULL OR c.id = p_campaign_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'campaigns_recounted', v_count);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION recount_campaign_seats(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION recount_campaign_seats(UUID) TO authenticated, service_role;


-- ============================================================================
-- 8) STORAGE — campaign banner images (same pattern as trade-images)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-images', 'campaign-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public read campaign images"   ON storage.objects;
DROP POLICY IF EXISTS "admin upload campaign images"  ON storage.objects;
DROP POLICY IF EXISTS "admin update campaign images"  ON storage.objects;
DROP POLICY IF EXISTS "admin delete campaign images"  ON storage.objects;

CREATE POLICY "public read campaign images"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'campaign-images');
CREATE POLICY "admin upload campaign images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-images');
CREATE POLICY "admin update campaign images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'campaign-images');
CREATE POLICY "admin delete campaign images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-images');


-- ============================================================================
-- 9) Reconcile once, so an existing database starts from a correct count
-- ============================================================================
SELECT recount_campaign_seats(NULL);


-- ============================================================================
-- 10) VERIFY (optional — read the output)
-- ============================================================================
-- campaigns table + the new candidates column should both be listed
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE (table_name = 'campaigns')
   OR (table_name = 'candidates' AND column_name = 'campaign_id')
ORDER BY table_name, ordinal_position;

-- both triggers should exist
SELECT tgname, relname
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE tgname IN ('campaigns_normalise_trg', 'campaign_seat_sync_trg');

-- policies: anon read-only, admin full
SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'campaigns';

-- create_payment_order must be service_role only (no anon / authenticated)
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'create_payment_order';

-- Done! Now create your first campaign from Admin → 📣 Campaigns and set its
-- status to "Active" so it appears on the public Campaigns page.
