-- ============================================================================
-- Go Hire Consultancy — FIX: paid candidates were getting tracking_token = NULL
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to re-run (everything is CREATE OR REPLACE / idempotent).
--
-- THE BUG
--   A candidate fills the form → pays → gets a temp password → logs in, but
--   their dashboard shows "TOKEN: null".
--
-- WHY IT HAPPENED
--   The secure Razorpay rewrite replaced verify_payment() with a version that
--   activates the candidate (status = 'new') but NEVER assigns a tracking_token.
--   The token is what the user dashboard + chat use to identify a submission,
--   so it showed up as null. (Employers still got a token because the employer
--   form generates it in the browser; only the paid-candidate path was broken.)
--
-- WHAT THIS MIGRATION DOES
--   1. Hardens generate_tracking_token() so it ALWAYS returns a value that is
--      unique across BOTH candidates and employers (no rare collision can ever
--      break a payment).
--   2. Re-creates verify_payment() — identical to the current secure version
--      (HMAC checked in the Edge Function, account-takeover fix, service_role
--      only) but now it also assigns a tracking_token when the candidate has
--      none.
--   3. Backfills a token ONLY for candidates whose payment already SUCCEEDED
--      (payment_status = 'success') and are still missing one — e.g.
--      ssinghasoka@gmail.com. Re-verifying can't help them because their
--      payment is already 'success', so verify_payment returns early at the
--      idempotency check. Candidates who never paid stay token-less BY DESIGN
--      (no payment → no token). Employers are NOT touched — they don't pay;
--      their token is created when they submit the hire form.
-- ============================================================================


-- ============================================================================
-- 1) Unique-by-construction token generator
--    SECURITY DEFINER so the uniqueness check always sees ALL rows, whoever
--    calls it. Loops until the random 8-char token is free in both tables.
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_tracking_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  chars  TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no confusing 0/O/1/I
  result TEXT;
  i      INTEGER;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    -- tracking_token is UNIQUE on BOTH tables — make sure it's free in each.
    EXIT WHEN NOT EXISTS (SELECT 1 FROM candidates WHERE tracking_token = result)
          AND NOT EXISTS (SELECT 1 FROM employers  WHERE tracking_token = result);
  END LOOP;
  RETURN result;
END;
$$;


-- ============================================================================
-- 2) verify_payment — SECURE version + tracking-token assignment
--    This is the SAME function currently live (called only by the
--    verify-razorpay-payment Edge Function as service_role, AFTER it has checked
--    the Razorpay HMAC signature). The ONLY change vs. the live version is in
--    Step 5: it now also sets tracking_token + token_generated_at.
--
--    Security preserved:
--      * NOT granted to anon/authenticated — signature is verified in the Edge
--        Function; a public grant would reopen the "mark myself paid" hole.
--      * Account-takeover fix kept: a paid application NEVER resets the password
--        of an email that already has an account (existing accounts are linked
--        only, password untouched).
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
  v_expected_amount INTEGER := 20000; -- ₹200 in paise
  v_user_id         UUID;
  v_existing        UUID;
  v_tracking_token  TEXT;
BEGIN
  -- Step 1: Get payment record
  SELECT * INTO v_payment FROM payments WHERE razorpay_order_id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- Step 2: Verify amount (SECURITY: prevent amount tampering)
  IF v_payment.amount != v_expected_amount THEN
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
-- 3) Backfill: give a token ONLY to candidates whose payment SUCCEEDED and who
--    are still missing one. Re-running verify_payment can't fix already-paid
--    users (their payment is already 'success', so it returns early at the
--    idempotency check). Unpaid candidates are intentionally skipped — no
--    payment → no token, same rule as the live flow. Employers are not touched.
-- ============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM candidates
    WHERE (tracking_token IS NULL OR tracking_token = '')
      AND payment_status = 'success'
  LOOP
    UPDATE candidates
    SET tracking_token     = generate_tracking_token(),
        token_generated_at = COALESCE(token_generated_at, NOW())
    WHERE id = r.id;
  END LOOP;
END $$;


-- ============================================================================
-- 4) Verify (optional — read the output)
--    paid_candidates_without_token MUST be 0. The unpaid count is informational
--    (those are SUPPOSED to have no token). The named candidate should now show
--    a token.
-- ============================================================================
SELECT
  (SELECT count(*) FROM candidates
     WHERE payment_status = 'success'
       AND (tracking_token IS NULL OR tracking_token = '')) AS paid_candidates_without_token,
  (SELECT count(*) FROM candidates
     WHERE payment_status IS DISTINCT FROM 'success')       AS unpaid_candidates_no_token_expected;

SELECT full_name, email, status, payment_status, tracking_token
FROM candidates
WHERE email = 'ssinghasoka@gmail.com';

-- Done! Every PAID candidate now has a token, and every future paid candidate
-- gets one automatically inside verify_payment. Unpaid form-fills get none.
