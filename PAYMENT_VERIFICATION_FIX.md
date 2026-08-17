# 🚨 PAYMENT VERIFICATION FIX - IMMEDIATE

**Error:** `relation "user_passwords" does not exist`

**Fix:** Update `verify_payment` function to use `user_accounts` table

---

## 📝 QUICK FIX (Copy & Run):

### **Supabase Dashboard → SQL Editor → Run This:**

```sql
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

  -- Update candidate
  UPDATE candidates SET
    payment_status = 'success',
    payment_id = p_payment_id,
    payment_amount = v_payment.amount,
    payment_date = NOW(),
    status = 'new'
  WHERE id = v_payment.candidate_id;

  -- Generate password
  v_temp_password := 'GH' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  -- Create user account (FIXED: use user_accounts table)
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

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'candidate_id', v_candidate.id,
    'temp_password', v_temp_password,
    'email', v_candidate.email,
    'full_name', v_candidate.full_name,
    'amount', v_payment.amount
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
```

Click **Run** button.

---

## ✅ After Running:

1. **Refresh website** (Ctrl + Shift + R)
2. **Fill form again** (new test)
3. **Make payment**
4. **Should show:** Success screen with temp password

---

## 🧪 Test Again:

```
Name: Test User 2
Email: test2@example.com
Phone: 9876543211
Trade: Plumbers
Upload PDF → Pay ₹200
```

**Expected:** Success screen with password displayed.

---

**Time:** Run SQL (1 min) → Test payment (2 min) = **Total 3 minutes**

SQL run kar lo aur batao! 🚀
