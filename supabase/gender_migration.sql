-- ============================================================================
-- Go Hire Consultancy — GENDER field for candidates + employers
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to re-run (ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE = idempotent).
--
-- WHAT THIS DOES
--   1. Adds a `gender` column to BOTH candidates and employers.
--   2. Re-creates create_payment_order() so the candidate row it inserts now
--      also stores gender (comes in from the apply form via payment.js).
--      Employers already save gender straight from the browser (forms.js
--      insert), so no employer RPC change is needed.
--
-- SECURITY (unchanged): create_payment_order stays SECURITY DEFINER and is
--   granted to service_role ONLY (it is called by the create-razorpay-order
--   Edge Function). verify_payment is intentionally NOT touched here so this
--   migration can never re-introduce the old insecure version.
-- ============================================================================


-- ============================================================================
-- 1) Add the gender column to both tables
-- ============================================================================
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE employers  ADD COLUMN IF NOT EXISTS gender TEXT;


-- ============================================================================
-- 2) create_payment_order — identical to the live version, with `gender`
--    added to the candidate INSERT. Everything else (receipt id, payments
--    row, return shape, exception handling) is unchanged.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_payment_order(
  p_candidate_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_candidate_id UUID;
  v_receipt_id TEXT;
  v_amount INTEGER := 20000; -- Fixed ₹200 (in paise)
BEGIN
  -- Step 1: Create candidate record (pending status)
  INSERT INTO candidates (
    full_name,
    phone,
    email,
    gender,
    trade,
    experience,
    location,
    resume_url,
    payment_status,
    status,
    created_at
  )
  VALUES (
    p_candidate_data->>'full_name',
    p_candidate_data->>'phone',
    p_candidate_data->>'email',
    p_candidate_data->>'gender',
    p_candidate_data->>'trade',
    p_candidate_data->>'experience',
    p_candidate_data->>'location',
    p_candidate_data->>'resume_url',
    'pending',
    'pending_payment',
    NOW()
  )
  RETURNING id INTO v_candidate_id;

  -- Step 2: Generate unique receipt ID (for tracking only)
  v_receipt_id := 'rcpt_' || REPLACE(v_candidate_id::TEXT, '-', '');

  -- Step 3: Create payment record
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

  -- Step 4: Return data for client-side Razorpay initialization
  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id,
    'amount', v_amount,
    'candidate_id', v_candidate_id,
    'currency', 'INR'
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
-- 3) Verify (optional — read the output)
-- ============================================================================
-- gender column should now exist on both tables
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name = 'gender'
  AND table_name IN ('candidates', 'employers')
ORDER BY table_name;

-- Done! New candidate applications store gender through create_payment_order,
-- new employer submissions store it directly from the hire form, and the
-- dashboards + admin detail pages read it automatically.
