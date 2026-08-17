-- ============================================================================
-- PAYMENT VERIFICATION — SECURE VERSION
-- Replace the verify_payment function with this. Run in the Supabase SQL editor.
--
-- This is called ONLY by the verify-razorpay-payment Edge Function (as the
-- service_role) AFTER that function has verified the Razorpay HMAC signature.
-- It is intentionally NOT granted to anon/authenticated — it does not verify
-- the signature itself, so a public grant would reopen the "mark myself paid"
-- hole.
--
-- SECURITY NOTES:
--  * Account takeover fix: a paid application must NEVER reset the password of
--    an email that already has an account. Otherwise someone could apply as a
--    candidate using a victim's email, pay ₹200, and receive a working
--    credential for the victim. Existing accounts are only LINKED to the new
--    submission; their password is left untouched.
--  * Temp passwords use generate_temp_password() (same generator as signup and
--    admin reset) for consistency and better entropy than the old 'GH####'.
--  * search_path includes `extensions` because hash_password() -> digest()
--    lives in the extensions schema in Supabase.
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

  -- Step 5: Activate the candidate
  UPDATE candidates
  SET payment_status = 'success',
      payment_id     = p_payment_id,
      payment_amount = v_payment.amount,
      payment_date   = NOW(),
      status         = 'new'
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
