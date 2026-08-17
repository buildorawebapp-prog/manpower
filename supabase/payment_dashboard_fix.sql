-- ============================================================================
-- COMPLETE FIX: Token Generation + Payment Display
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Update verify_payment to generate tracking token
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
  v_tracking_token TEXT;
  v_expected_amount INTEGER := 20000;
  v_user_id UUID;
BEGIN
  -- Get payment record
  SELECT * INTO v_payment FROM payments WHERE razorpay_order_id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- Verify amount
  IF v_payment.amount != v_expected_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  -- Check if already processed
  IF v_payment.status = 'success' THEN
    SELECT * INTO v_candidate FROM candidates WHERE id = v_payment.candidate_id;
    RETURN jsonb_build_object(
      'success', true,
      'candidate_id', v_candidate.id,
      'temp_password', 'Check your email for password',
      'email', v_candidate.email,
      'full_name', v_candidate.full_name,
      'amount', v_payment.amount
    );
  END IF;

  -- Update payment
  UPDATE payments SET
    razorpay_payment_id = p_payment_id,
    razorpay_signature = p_signature,
    status = 'success',
    verified_at = NOW()
  WHERE razorpay_order_id = p_order_id;

  -- Get candidate
  SELECT * INTO v_candidate FROM candidates WHERE id = v_payment.candidate_id;

  -- Generate tracking token (8-char alphanumeric)
  v_tracking_token := generate_tracking_token();

  -- Update candidate with payment info AND tracking token
  UPDATE candidates SET
    payment_status = 'success',
    payment_id = p_payment_id,
    payment_amount = v_payment.amount,
    payment_date = NOW(),
    status = 'new',
    tracking_token = v_tracking_token,
    token_generated_at = NOW()
  WHERE id = v_payment.candidate_id;

  -- Generate password
  v_temp_password := 'GH' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  -- Create user account
  BEGIN
    INSERT INTO user_accounts (email, password_hash, is_temp_password, created_at)
    VALUES (v_candidate.email, hash_password(v_temp_password), true, NOW())
    RETURNING id INTO v_user_id;
  EXCEPTION WHEN unique_violation THEN
    UPDATE user_accounts SET
      password_hash = hash_password(v_temp_password),
      is_temp_password = true
    WHERE email = v_candidate.email
    RETURNING id INTO v_user_id;
  END;

  -- Link user account
  UPDATE candidates SET user_id = v_user_id WHERE id = v_candidate.id;

  -- Return success with all details
  RETURN jsonb_build_object(
    'success', true,
    'candidate_id', v_candidate.id,
    'temp_password', v_temp_password,
    'email', v_candidate.email,
    'full_name', v_candidate.full_name,
    'amount', v_payment.amount,
    'tracking_token', v_tracking_token
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 2. Function to get payment details for user dashboard
CREATE OR REPLACE FUNCTION get_user_payment_details(p_email TEXT)
RETURNS TABLE (
  payment_id TEXT,
  payment_amount INTEGER,
  payment_date TIMESTAMPTZ,
  tracking_token TEXT,
  candidate_name TEXT,
  application_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.payment_id,
    c.payment_amount,
    c.payment_date,
    c.tracking_token,
    c.full_name,
    c.created_at
  FROM candidates c
  WHERE c.email = p_email
    AND c.payment_status = 'success'
  ORDER BY c.created_at DESC;
END;
$$;

-- 3. Function to get payment details for admin dashboard
CREATE OR REPLACE FUNCTION get_candidate_payment_info(p_candidate_id UUID)
RETURNS TABLE (
  payment_id TEXT,
  razorpay_order_id TEXT,
  amount INTEGER,
  currency TEXT,
  payment_status TEXT,
  payment_date TIMESTAMPTZ,
  verified_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.razorpay_payment_id,
    p.razorpay_order_id,
    p.amount,
    p.currency,
    p.status,
    c.payment_date,
    p.verified_at
  FROM payments p
  JOIN candidates c ON c.id = p.candidate_id
  WHERE p.candidate_id = p_candidate_id
  ORDER BY p.created_at DESC
  LIMIT 1;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION verify_payment(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_payment_details(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_candidate_payment_info(UUID) TO authenticated;
