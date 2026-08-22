-- ============================================================================
-- CAMPAIGN LOCATION LOCK  —  follow-up migration
-- Run this ONLY if you have already run campaigns_migration.sql.
-- (If you have not run that yet, just run campaigns_migration.sql instead — it
--  already contains this exact function. Running both, in either order, is
--  harmless: the two copies are byte-identical.)
--
-- WHAT CHANGES
--   The apply form now locks "Preferred Location" to the campaign's location,
--   exactly like Trade/Skill. This makes the SERVER the authority for that
--   field too: when a campaign_id is supplied and that campaign names a
--   location, the candidate row stores the campaign's location and ignores
--   whatever the browser sent. Campaigns with no location keep the applicant's
--   own free-text choice.
--
-- WHAT DOES NOT CHANGE
--   * Grants: create_payment_order stays SECURITY DEFINER, service_role ONLY.
--     No anon / authenticated execute — do not add any.
--   * Seat counting, campaign validation, payment amount, receipt format,
--     gender handling, and every CAMPAIGN_* error string: all untouched.
--   * verify_payment is not touched at all.
--
-- SAFE TO RE-RUN: CREATE OR REPLACE, no data is read or written.
-- Existing candidate rows are left exactly as they are (no backfill).
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


-- ---------------------------------------------------------------------------
-- Verification (optional): grants must be service_role only.
-- Expect exactly one row: create_payment_order / service_role / EXECUTE.
-- ---------------------------------------------------------------------------
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'create_payment_order';
