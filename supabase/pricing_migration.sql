-- ============================================================================
-- GO HIRE — DYNAMIC APPLICATION FEE  (location base + trade surcharge)
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- SAFE TO RE-RUN: every statement is idempotent
--   (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP..IF EXISTS then CREATE).
--
-- WHAT THIS DOES
--   The fixed ₹200 application fee becomes dynamic:
--
--        fee  =  locations.fee_paise            (per-location BASE, mandatory)
--             +  trades.surcharge_paise         (per-trade  "+",  optional, >= 0)
--
--   Admin sets a price per location and an optional "+" per trade. If a trade
--   has no surcharge set, only the location base applies. All money is INTEGER
--   PAISE (20000 = ₹200). One source of truth: resolve_application_fee().
--
-- WHY IT IS SAFE FOR PEOPLE WHO ALREADY PAID  ("unka data mat chedna")
--   * The browser NEVER sends an amount — the server decides. Unchanged.
--   * Every location defaults to fee_paise = 20000, so the instant this runs,
--     the price is still exactly ₹200 everywhere → zero behaviour change until
--     an admin edits a price. Deploy is effectively a no-op for pricing.
--   * Existing payments rows are backfilled base_paise = amount, surcharge = 0.
--     Their amount is NOT changed. Already-'success' payments early-return at
--     the idempotency check in verify_payment (Step 3) — they are never touched.
--   * verify_payment compares against the SNAPSHOT frozen on the payments row
--     (base + surcharge), never a live recompute — so an admin editing a price
--     while someone is on the Razorpay screen can never fail their payment.
--
-- ANTI-LEAKAGE / NO-BYPASS GUARANTEES
--   * Fee is resolved AFTER the campaign trade/location override, so a campaign
--     seat is priced off the campaign — never off the browser's field.
--   * Location must match an ACTIVE, known location (LOCATION_INVALID otherwise);
--     a non-blank trade must match an ACTIVE trade (TRADE_INVALID otherwise) —
--     so a misspelled trade can't dodge its surcharge.
--   * create_payment_order / verify_payment stay SECURITY DEFINER, service_role
--     ONLY. get_application_fee (read-only display) is the only anon-callable
--     piece and it can only READ prices.
-- ============================================================================


-- ============================================================================
-- 1) COLUMNS
-- ============================================================================

-- locations: per-location base fee (paise). DEFAULT 20000 keeps today's ₹200.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS fee_paise  INTEGER NOT NULL DEFAULT 20000;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- ₹1 floor (Razorpay minimum) .. ₹50,000 admin-typo cap.
ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_fee_sane;
ALTER TABLE locations ADD  CONSTRAINT locations_fee_sane
  CHECK (fee_paise >= 100 AND fee_paise <= 5000000);

-- trades: optional additive surcharge (paise). DEFAULT 0 = no surcharge.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS surcharge_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_surcharge_sane;
ALTER TABLE trades ADD  CONSTRAINT trades_surcharge_sane
  CHECK (surcharge_paise >= 0 AND surcharge_paise <= 5000000);

-- payments: freeze the fee breakdown at order-creation time (the SNAPSHOT).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS base_paise      INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS surcharge_paise INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS price_source    JSONB;


-- ============================================================================
-- 2) FEE AUDIT  — every admin price change is logged (who / old / new).
-- ============================================================================
CREATE TABLE IF NOT EXISTS fee_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by  TEXT,                       -- admin identifier (best-effort)
  target_type TEXT NOT NULL CHECK (target_type IN ('location','trade')),
  target_id   UUID,
  target_name TEXT,
  old_paise   INTEGER,
  new_paise   INTEGER
);

ALTER TABLE fee_audit ENABLE ROW LEVEL SECURITY;
-- Admins (authenticated) may read + append. Anon: nothing.
DROP POLICY IF EXISTS "fee_audit admin read"   ON fee_audit;
CREATE POLICY "fee_audit admin read"   ON fee_audit FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "fee_audit admin insert" ON fee_audit;
CREATE POLICY "fee_audit admin insert" ON fee_audit FOR INSERT TO authenticated WITH CHECK (true);


-- ============================================================================
-- 3) BACKFILL existing payments so in-flight + historical orders survive.
--    Sets base = amount, surcharge = 0 (their total is unchanged). Runs only on
--    rows not yet snapshotted → safe to re-run.
-- ============================================================================
UPDATE payments
SET base_paise      = amount,
    surcharge_paise = 0
WHERE base_paise IS NULL;


-- ============================================================================
-- 4) resolve_application_fee(trade, location)  — THE SINGLE SOURCE OF TRUTH
--    Read-only. Returns { ok, base_paise, surcharge_paise, total_paise,
--    location, trade } or { ok:false, error }. Location mandatory + must be an
--    ACTIVE location; a non-blank trade must be an ACTIVE trade.
-- ============================================================================
CREATE OR REPLACE FUNCTION resolve_application_fee(
  p_trade    TEXT,
  p_location TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_loc_in     TEXT := NULLIF(TRIM(p_location), '');
  v_trade_in   TEXT := NULLIF(TRIM(p_trade), '');
  v_loc_name   TEXT;
  v_base       INTEGER;
  v_trade_name TEXT;
  v_sur        INTEGER := 0;
BEGIN
  -- Location is mandatory and must be a known, ACTIVE location.
  IF v_loc_in IS NULL THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'LOCATION_INVALID: Please choose a valid location from the list so we can calculate your fee.');
  END IF;

  SELECT name, fee_paise INTO v_loc_name, v_base
  FROM locations
  WHERE is_active = true
    AND LOWER(TRIM(name)) = LOWER(v_loc_in)
  ORDER BY created_at
  LIMIT 1;

  IF v_loc_name IS NULL THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'LOCATION_INVALID: Please choose a valid location from the list so we can calculate your fee.');
  END IF;

  -- Trade surcharge is optional and ADDITIVE. A blank trade = base only. A
  -- non-blank trade that doesn't match an ACTIVE trade is rejected so a bogus /
  -- misspelled trade can never dodge its surcharge.
  IF v_trade_in IS NOT NULL THEN
    SELECT name, COALESCE(surcharge_paise, 0) INTO v_trade_name, v_sur
    FROM trades
    WHERE is_active = true
      AND LOWER(TRIM(name)) = LOWER(v_trade_in)
    ORDER BY sort_order, created_at
    LIMIT 1;

    IF v_trade_name IS NULL THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'TRADE_INVALID: Please choose a valid trade/skill from the list.');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'base_paise',      v_base,
    'surcharge_paise', COALESCE(v_sur, 0),
    'total_paise',     v_base + COALESCE(v_sur, 0),
    'location',        v_loc_name,
    'trade',           v_trade_name
  );
END;
$$;

REVOKE ALL ON FUNCTION resolve_application_fee(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_application_fee(TEXT, TEXT) TO service_role;


-- ============================================================================
-- 5) get_application_fee(trade, location)  — anon-callable DISPLAY wrapper.
--    Read-only; lets the apply form show the live breakdown before payment.
--    (SECURITY DEFINER so it can call resolve_application_fee as the owner.)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_application_fee(
  p_trade    TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT resolve_application_fee(p_trade, p_location);
$$;

REVOKE ALL ON FUNCTION get_application_fee(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_application_fee(TEXT, TEXT) TO anon, authenticated, service_role;


-- ============================================================================
-- 6) create_payment_order  — REWRITE
--    Identical to the live (campaign-lock) version EXCEPT: the fee is resolved
--    on the server AFTER the campaign override, and base/surcharge/price_source
--    are snapshotted onto the payments row. Grants unchanged: service_role ONLY.
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
  v_amount       INTEGER;          -- resolved on the server (paise)
  v_base         INTEGER;
  v_sur          INTEGER;
  v_fee          JSONB;
  v_price_source JSONB;
  v_campaign_id  UUID;
  v_campaign     RECORD;
  v_trade        TEXT;
  v_location     TEXT;
BEGIN
  v_trade    := p_candidate_data->>'trade';
  v_location := p_candidate_data->>'location';

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

    -- Same for the posting's location, but only when the campaign actually
    -- names one — campaigns without a location leave the applicant's own
    -- preferred location untouched.
    IF COALESCE(TRIM(v_campaign.location), '') <> '' THEN
      v_location := TRIM(v_campaign.location);
    END IF;
  END IF;

  -- ---- Resolve the fee AFTER any campaign override ------------------------
  -- Pricing is decided on the SERVER from the FINAL trade + location (for a
  -- campaign that is the campaign's, not the browser's). The browser never
  -- sends an amount. resolve_application_fee is the single source of truth.
  v_fee := resolve_application_fee(v_trade, v_location);
  IF NOT COALESCE((v_fee->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', COALESCE(v_fee->>'error', 'FEE_UNRESOLVED: Could not calculate the application fee. Please try again.')
    );
  END IF;

  v_base   := (v_fee->>'base_paise')::INTEGER;
  v_sur    := (v_fee->>'surcharge_paise')::INTEGER;
  v_amount := (v_fee->>'total_paise')::INTEGER;

  -- Store the canonical DB spellings so the candidate row + seat logic never
  -- drift on case / whitespace.
  v_location := v_fee->>'location';
  IF COALESCE(v_fee->>'trade', '') <> '' THEN
    v_trade := v_fee->>'trade';
  END IF;

  v_price_source := jsonb_build_object(
    'base_paise',      v_base,
    'surcharge_paise', v_sur,
    'location',        v_location,
    'trade',           v_trade,
    'campaign_id',     v_campaign_id,
    'resolved_at',     NOW()
  );

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
    v_location,
    p_candidate_data->>'resume_url',
    v_campaign_id,
    'pending',
    'pending_payment',
    NOW()
  )
  RETURNING id INTO v_candidate_id;

  -- ---- Step 2: Generate unique receipt ID (for tracking only) -------------
  v_receipt_id := 'rcpt_' || REPLACE(v_candidate_id::TEXT, '-', '');

  -- ---- Step 3: Create payment record (+ frozen fee SNAPSHOT) --------------
  INSERT INTO payments (
    candidate_id,
    razorpay_order_id,
    amount,
    base_paise,
    surcharge_paise,
    price_source,
    currency,
    status,
    created_at
  )
  VALUES (
    v_candidate_id,
    v_receipt_id,
    v_amount,
    v_base,
    v_sur,
    v_price_source,
    'INR',
    'created',
    NOW()
  );

  -- ---- Step 4: Return data for the Edge Function --------------------------
  RETURN jsonb_build_object(
    'receipt_id',      v_receipt_id,
    'amount',          v_amount,
    'base_paise',      v_base,
    'surcharge_paise', v_sur,
    'candidate_id',    v_candidate_id,
    'currency',        'INR',
    'campaign_id',     v_campaign_id
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
-- 7) verify_payment  — REWRITE
--    Byte-identical to the live (token-fix) version EXCEPT Step 2: the amount
--    is checked against the SNAPSHOT frozen on the payments row (base +
--    surcharge). It NEVER recomputes from the live price tables, so an admin
--    price edit mid-checkout can't fail a correct payment. Everything else —
--    idempotency, tracking-token, account-takeover safety, service_role-only
--    grants — is preserved exactly.
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_payment(
  p_order_id TEXT,
  p_payment_id TEXT,
  p_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_payment         RECORD;
  v_candidate       RECORD;
  v_temp_password   TEXT;
  v_expected_amount INTEGER;      -- from the frozen snapshot, not a recompute
  v_user_id         UUID;
  v_existing        UUID;
  v_tracking_token  TEXT;
BEGIN
  -- Step 1: Get payment record
  SELECT * INTO v_payment FROM payments WHERE razorpay_order_id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- Step 2: Verify amount against the SNAPSHOT taken when the order was created
  -- (base + surcharge frozen on the payments row). We do NOT recompute from the
  -- live price tables here: if an admin edits a price while someone is on the
  -- Razorpay screen, their already-correct payment must still verify. Razorpay
  -- order-binding guarantees the amount actually charged equals payments.amount.
  v_expected_amount := COALESCE(v_payment.base_paise, v_payment.amount)
                     + COALESCE(v_payment.surcharge_paise, 0);
  IF v_payment.amount IS NULL OR v_payment.amount < 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment amount');
  END IF;
  IF v_payment.amount <> v_expected_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment amount');
  END IF;

  -- Candidate for this payment
  SELECT * INTO v_candidate FROM candidates WHERE id = v_payment.candidate_id;

  -- Step 3: Idempotency — already verified (e.g. webhook + browser both fired)
  IF v_payment.status = 'success' THEN
    RETURN jsonb_build_object(
      'success', true,
      'candidate_id', v_candidate.id,
      'temp_password', NULL,
      'email', v_candidate.email,
      'full_name', v_candidate.full_name,
      'amount', v_payment.amount,
      'already_registered', true,
      'message', 'This application is already registered. Please log in with your existing password.'
    );
  END IF;

  -- Step 4: Mark payment as success
  UPDATE payments
  SET razorpay_payment_id  = p_payment_id,
      razorpay_signature   = p_signature,
      status               = 'success',
      verified_at          = NOW(),
      verification_details = jsonb_build_object(
        'payment_id', p_payment_id,
        'signature',  p_signature,
        'verified_at', NOW()
      )
  WHERE razorpay_order_id = p_order_id;

  -- Step 5: Activate the candidate (+ assign a tracking token if missing).
  -- The tracking_token powers the user dashboard + chat. Only generate one when
  -- the candidate doesn't already have it (COALESCE short-circuits, so the
  -- generator isn't called when a token already exists).
  v_tracking_token := COALESCE(NULLIF(v_candidate.tracking_token, ''), generate_tracking_token());

  UPDATE candidates
  SET payment_status     = 'success',
      payment_id         = p_payment_id,
      payment_amount     = v_payment.amount,
      payment_date       = NOW(),
      status             = 'new',
      tracking_token     = v_tracking_token,
      token_generated_at = COALESCE(token_generated_at, NOW())
  WHERE id = v_payment.candidate_id;

  -- Step 6: Account handling.
  -- SECURITY: never reset the password of an EXISTING account during a paid
  -- application. Only issue credentials for a genuinely NEW account; otherwise
  -- just link the submission and tell the user to use their existing password.
  SELECT id INTO v_existing FROM user_accounts WHERE email = v_candidate.email;

  IF v_existing IS NULL THEN
    -- Brand-new account → issue a temporary password (forced change on login).
    v_temp_password := generate_temp_password();
    INSERT INTO user_accounts (email, password_hash, is_temp_password, created_at)
    VALUES (v_candidate.email, hash_password(v_temp_password), true, NOW())
    RETURNING id INTO v_user_id;

    UPDATE candidates SET user_id = v_user_id WHERE id = v_candidate.id;

    RETURN jsonb_build_object(
      'success', true,
      'candidate_id', v_candidate.id,
      'temp_password', v_temp_password,
      'email', v_candidate.email,
      'full_name', v_candidate.full_name,
      'amount', v_payment.amount,
      'tracking_token', v_tracking_token,
      'is_new_user', true
    );
  ELSE
    -- Existing account → link only, do NOT touch the password.
    v_user_id := v_existing;
    UPDATE candidates SET user_id = v_user_id WHERE id = v_candidate.id;

    RETURN jsonb_build_object(
      'success', true,
      'candidate_id', v_candidate.id,
      'temp_password', NULL,
      'email', v_candidate.email,
      'full_name', v_candidate.full_name,
      'amount', v_payment.amount,
      'tracking_token', v_tracking_token,
      'already_registered', true,
      'message', 'You already have an account. Please log in with your existing password (use "Reset Password" via admin if forgotten).'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Lock down: ONLY the service_role (used by the verify-razorpay-payment Edge
-- Function) may call this. Never grant to anon/authenticated.
REVOKE ALL ON FUNCTION verify_payment(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION verify_payment(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION verify_payment(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION verify_payment(TEXT, TEXT, TEXT) TO service_role;


-- ============================================================================
-- 8) VERIFY (optional — read the output)
-- ============================================================================

-- 8a. Grants must be service_role-only on both write RPCs.
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name IN ('create_payment_order','verify_payment')
ORDER BY routine_name, grantee;

-- 8b. Every location is priced (no NULLs), and all within the sane range.
SELECT count(*) AS total_locations,
       count(*) FILTER (WHERE fee_paise IS NULL) AS unpriced_locations,
       min(fee_paise) AS min_fee_paise,
       max(fee_paise) AS max_fee_paise
FROM locations;

-- 8c. Every payments row is snapshotted (base + surcharge = amount).
SELECT count(*) AS total_payments,
       count(*) FILTER (WHERE base_paise IS NULL) AS not_snapshotted,
       count(*) FILTER (WHERE COALESCE(base_paise,amount)+COALESCE(surcharge_paise,0) <> amount) AS inconsistent
FROM payments;

-- 8d. Sanity: default price everywhere = ₹200 (20000 paise) right after this runs.
--     Then set real prices from the admin Pricing panel (or manually):
--       UPDATE locations SET fee_paise = 40000 WHERE name = 'Dubai, UAE';   -- ₹400
--       UPDATE trades    SET surcharge_paise = 15000 WHERE name = 'Welders'; -- +₹150
