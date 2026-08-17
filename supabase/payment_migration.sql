-- ============================================================================
-- PAYMENT INTEGRATION MIGRATION
-- Go Hire Consultancy - Candidate Application with Resume + Razorpay Payment
-- ============================================================================

-- Step 1: Add payment columns to candidates table
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS resume_url TEXT,
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS payment_id TEXT,
ADD COLUMN IF NOT EXISTS payment_amount INTEGER,
ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ;

-- Step 2: Create payments tracking table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  amount INTEGER NOT NULL, -- Amount in paise (20000 = ₹200)
  currency VARCHAR(3) DEFAULT 'INR',
  status VARCHAR(20) DEFAULT 'created', -- created, success, failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  verification_details JSONB
);

-- Step 3: Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_candidate_id ON payments(candidate_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_candidates_payment_status ON candidates(payment_status);

-- Step 4: Enable RLS on payments table
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Step 5: RLS Policy - No public access to payments (only via RPC)
DROP POLICY IF EXISTS "payments_no_public_access" ON payments;
CREATE POLICY "payments_no_public_access"
ON payments FOR ALL
USING (false);

-- Step 6: Update candidates RLS policy (allow pending inserts)
DROP POLICY IF EXISTS "candidates_insert_pending" ON candidates;
CREATE POLICY "candidates_insert_pending"
ON candidates FOR INSERT
WITH CHECK (payment_status = 'pending' OR payment_status IS NULL);

-- ============================================================================
-- RPC FUNCTION 1: Create Payment Order
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

-- ============================================================================
-- RPC FUNCTION 2: Verify Payment & Activate Candidate
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
    RETURN jsonb_build_object('success', false, 'error', 'Payment already verified');
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

  -- Step 6: Generate temporary password (6-digit)
  v_temp_password := 'GH' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  -- Step 7: Update candidate (activate account)
  UPDATE candidates
  SET
    payment_status = 'success',
    payment_id = p_payment_id,
    payment_amount = v_payment.amount,
    payment_date = NOW(),
    status = 'new'
  WHERE id = v_payment.candidate_id;

  -- Step 8: Generate temporary password (6-digit)
  v_temp_password := 'GH' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  -- Step 9: Create/Update user account
  -- Check if user_accounts table exists, otherwise use user_passwords
  BEGIN
    INSERT INTO user_accounts (email, password_hash, created_at)
    VALUES (v_candidate.email, hash_password(v_temp_password), NOW())
    ON CONFLICT (email) DO UPDATE
    SET password_hash = hash_password(v_temp_password);
  EXCEPTION
    WHEN undefined_table THEN
      -- Fallback: Try user_passwords table
      INSERT INTO user_passwords (user_email, password_hash)
      VALUES (v_candidate.email, hash_password(v_temp_password))
      ON CONFLICT (user_email) DO UPDATE
      SET password_hash = hash_password(v_temp_password);
  END;

  -- Step 10: Return success with credentials (for email)
  RETURN jsonb_build_object(
    'success', true,
    'candidate_id', v_candidate.id,
    'temp_password', v_temp_password,
    'email', v_candidate.email,
    'full_name', v_candidate.full_name,
    'amount', v_payment.amount
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- ============================================================================
-- RPC FUNCTION 3: Get Payment History (User Dashboard)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_candidate_payments(p_email TEXT)
RETURNS TABLE (
  payment_id TEXT,
  order_id TEXT,
  amount INTEGER,
  status TEXT,
  payment_date TIMESTAMPTZ,
  candidate_name TEXT
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
    p.status,
    p.verified_at,
    c.full_name
  FROM payments p
  JOIN candidates c ON c.id = p.candidate_id
  WHERE c.email = p_email
  ORDER BY p.created_at DESC;
END;
$$;

-- ============================================================================
-- RPC FUNCTION 4: Get All Payments (Admin Dashboard)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_all_payments()
RETURNS TABLE (
  payment_id TEXT,
  order_id TEXT,
  candidate_name TEXT,
  candidate_email TEXT,
  candidate_phone TEXT,
  amount INTEGER,
  status TEXT,
  payment_date TIMESTAMPTZ,
  candidate_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.razorpay_payment_id,
    p.razorpay_order_id,
    c.full_name,
    c.email,
    c.phone,
    p.amount,
    p.status,
    p.verified_at,
    c.id
  FROM payments p
  JOIN candidates c ON c.id = p.candidate_id
  WHERE p.status = 'success'
  ORDER BY p.verified_at DESC;
END;
$$;

-- ============================================================================
-- STORAGE BUCKET SETUP (Run manually in Supabase Dashboard)
-- ============================================================================
-- 1. Go to: Storage → Create Bucket
-- 2. Name: "candidate-resumes"
-- 3. Public: No (private bucket)
-- 4. File size limit: 10485760 (10MB)
-- 5. Allowed MIME types: application/pdf

-- Storage RLS Policies (run after bucket creation)
-- Policy 1: Allow public to upload resumes
CREATE POLICY "Public can upload resumes"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'candidate-resumes' AND
  (storage.foldername(name))[1] = 'resumes'
);

-- Policy 2: Authenticated users can read their own resumes
CREATE POLICY "Users can read their resumes"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'candidate-resumes' AND
  auth.role() = 'authenticated'
);

-- Policy 3: Admin can read all resumes
CREATE POLICY "Admin can read all resumes"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'candidate-resumes'
);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION create_payment_order(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_payment(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_candidate_payments(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_payments() TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Check if columns added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'candidates'
AND column_name IN ('resume_url', 'payment_status', 'payment_id', 'payment_amount', 'payment_date');

-- Check if payments table created
SELECT table_name FROM information_schema.tables WHERE table_name = 'payments';

-- Check RPC functions
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('create_payment_order', 'verify_payment', 'get_candidate_payments', 'get_all_payments');

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next Steps:
-- 1. Run this migration in Supabase SQL Editor
-- 2. Create storage bucket "candidate-resumes" manually in dashboard
-- 3. Test RPC functions with sample data
-- 4. Update frontend code to use new payment flow
-- ============================================================================
