-- ============================================================================
-- PAYMENT VERIFICATION FIX
-- Replace the verify_payment function with this corrected version
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_payment(
  p_order_id TEXT,
  p_payment_id TEXT,
  p_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment RECORD;
  v_candidate RECORD;
  v_temp_password TEXT;
  v_expected_amount INTEGER := 20000; -- ₹200 in paise
  v_user_id UUID;
BEGIN
  -- Step 1: Get payment record
  SELECT * INTO v_payment
  FROM payments
  WHERE razorpay_order_id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- Step 2: Verify amount (SECURITY: Prevent amount tampering)
  IF v_payment.amount != v_expected_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment amount');
  END IF;

  -- Step 3: Check if already verified
  IF v_payment.status = 'success' THEN
    -- Already processed - return existing credentials
    SELECT * INTO v_candidate FROM candidates WHERE id = v_payment.candidate_id;
    RETURN jsonb_build_object(
      'success', true,
      'candidate_id', v_candidate.id,
      'temp_password', 'Already registered - use existing password',
      'email', v_candidate.email,
      'full_name', v_candidate.full_name,
      'amount', v_payment.amount,
      'already_registered', true
    );
  END IF;

  -- Step 4: Update payment record (mark as success)
  UPDATE payments
  SET
    razorpay_payment_id = p_payment_id,
    razorpay_signature = p_signature,
    status = 'success',
    verified_at = NOW(),
    verification_details = jsonb_build_object(
      'payment_id', p_payment_id,
      'signature', p_signature,
      'verified_at', NOW()
    )
  WHERE razorpay_order_id = p_order_id;

  -- Step 5: Get candidate details
  SELECT * INTO v_candidate
  FROM candidates
  WHERE id = v_payment.candidate_id;

  -- Step 6: Update candidate (activate account)
  UPDATE candidates
  SET
    payment_status = 'success',
    payment_id = p_payment_id,
    payment_amount = v_payment.amount,
    payment_date = NOW(),
    status = 'new'
  WHERE id = v_payment.candidate_id;

  -- Step 7: Generate temporary password (6-digit)
  v_temp_password := 'GH' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  -- Step 8: Create/Update user account (use user_accounts table)
  BEGIN
    -- Try to insert new account
    INSERT INTO user_accounts (email, password_hash, is_temp_password, created_at)
    VALUES (v_candidate.email, hash_password(v_temp_password), true, NOW())
    RETURNING id INTO v_user_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- User already exists - update password
      UPDATE user_accounts
      SET
        password_hash = hash_password(v_temp_password),
        is_temp_password = true,
        updated_at = NOW()
      WHERE email = v_candidate.email
      RETURNING id INTO v_user_id;
  END;

  -- Step 9: Link candidate to user account
  UPDATE candidates
  SET user_id = v_user_id
  WHERE id = v_candidate.id;

  -- Step 10: Return success with credentials
  RETURN jsonb_build_object(
    'success', true,
    'candidate_id', v_candidate.id,
    'temp_password', v_temp_password,
    'email', v_candidate.email,
    'full_name', v_candidate.full_name,
    'amount', v_payment.amount,
    'is_new_user', true
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION verify_payment(TEXT, TEXT, TEXT) TO anon, authenticated;
