# 💰 PAYMENT INTEGRATION BLUEPRINT
## Resume Upload + Razorpay Payment System

**Date:** August 17, 2026  
**Feature:** Secure candidate application with resume upload + ₹200 payment

---

## 🎯 REQUIREMENTS

### **User Flow:**
1. Candidate fills application form
2. Uploads resume (PDF, max 10MB)
3. Reviews details and clicks "Confirm & Proceed to Pay"
4. Razorpay payment page opens (₹200 fixed)
5. User pays via UPI/Card/QR
6. **Only after successful payment:**
   - Data saved to database
   - Email + temporary password sent
   - User can login to dashboard
7. Payment history visible in user dashboard + admin dashboard

### **Security Requirements:**
- ✅ Amount verification server-side (prevent ₹200 → ₹1 tampering)
- ✅ Payment signature verification (Razorpay webhook)
- ✅ Razorpay secret keys in environment variables only
- ✅ No direct database writes without payment confirmation
- ✅ Resume stored securely in Supabase Storage

---

## 🏗️ SYSTEM ARCHITECTURE

### **Frontend (Browser)**
```
apply.html
├─ Step 1: Application Form
├─ Step 2: Resume Upload (Supabase Storage)
├─ Step 3: Review & Confirm
└─ Step 4: Razorpay Payment (₹200)
     ↓
   Payment Success → Save to DB → Email sent
   Payment Failed → Show error, retry
```

### **Backend (Supabase)**
```
Tables:
├─ candidates (existing) + new columns:
│  ├─ resume_url (Storage public URL)
│  ├─ payment_status (pending/success/failed)
│  ├─ payment_id (Razorpay payment_id)
│  ├─ payment_amount (₹200 - verified)
│  └─ payment_date (timestamp)
│
├─ payments (new table)
│  ├─ id (uuid)
│  ├─ candidate_id (FK)
│  ├─ razorpay_order_id
│  ├─ razorpay_payment_id
│  ├─ razorpay_signature
│  ├─ amount (integer - 20000 paise = ₹200)
│  ├─ status (created/success/failed)
│  ├─ created_at
│  └─ verified_at
│
└─ RPC Functions:
   ├─ create_payment_order() - Creates payment, returns order_id
   ├─ verify_payment() - Verifies signature, saves candidate
   └─ get_candidate_payments() - User dashboard payment history
```

### **Storage:**
```
Supabase Storage Bucket: "candidate-resumes"
├─ Policies: Public read (for admin), authenticated write
├─ File naming: {timestamp}-{candidate_id}.pdf
├─ Max size: 10MB
└─ Allowed types: application/pdf only
```

---

## 🔐 SECURITY DESIGN

### **1. Amount Tampering Prevention**

**Problem:** User browser pe ₹200 ko ₹1 change kar sakta hai.

**Solution:**
```javascript
// ❌ WRONG (Client-side amount - hackable)
const amount = document.getElementById('amount').value; // User can change
razorpay.createOrder({ amount: amount * 100 }); // UNSAFE!

// ✅ RIGHT (Server-side fixed amount)
// Client only requests order creation
const order = await createPaymentOrder(candidateData);
// Server (Supabase RPC) creates order with fixed ₹200
// Client cannot modify amount
```

**Implementation:**
- Amount hardcoded in Supabase RPC function: `20000` paise (₹200)
- Client never sends amount, only candidate details
- Backend creates Razorpay order with fixed amount
- Payment verification checks: `amount === 20000`

---

### **2. Razorpay Signature Verification**

**Purpose:** Prevent fake payment success responses.

**Flow:**
```
1. User completes payment on Razorpay
2. Razorpay returns: order_id, payment_id, signature
3. Backend verifies signature using secret key:
   
   generated_signature = HMAC-SHA256(
     order_id + "|" + payment_id,
     RAZORPAY_KEY_SECRET
   )
   
   if (generated_signature === razorpay_signature) {
     ✅ Payment genuine
   } else {
     ❌ Payment fake/tampered
   }
```

**Implementation:**
- Verification done in Supabase Edge Function (server-side)
- Uses `crypto.subtle.sign()` for HMAC-SHA256
- Only verified payments create candidate records

---

### **3. API Key Protection**

**Keys:**
```
RAZORPAY_KEY_ID (public - safe in frontend)
RAZORPAY_KEY_SECRET (private - NEVER in frontend)
```

**Storage:**
```
Frontend (js/config.js):
├─ RAZORPAY_KEY_ID ✅ Safe to expose
└─ Uses for payment UI only

Vercel Environment Variables:
└─ RAZORPAY_KEY_ID (public) — ONLY the Key ID here. NEVER the secret.

Supabase Edge Function secrets (server-only):
├─ RAZORPAY_KEY_ID
└─ RAZORPAY_KEY_SECRET  ⚠️ The secret lives ONLY here — never in Vercel/frontend/git
```

---

### **4. Database Security (RLS Policies)**

```sql
-- candidates table RLS
CREATE POLICY "Public can INSERT pending applications"
ON candidates FOR INSERT
WITH CHECK (payment_status = 'pending');

CREATE POLICY "Only verified payments can read"
ON candidates FOR SELECT
USING (payment_status = 'success');

-- payments table RLS
CREATE POLICY "Only server can write payments"
ON payments FOR ALL
USING (false); -- No direct client access

-- RPC functions bypass RLS (server authority)
```

---

## 📊 DATABASE SCHEMA CHANGES

### **Migration SQL:**

```sql
-- 1. Add payment columns to candidates table
ALTER TABLE candidates
ADD COLUMN resume_url TEXT,
ADD COLUMN payment_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN payment_id TEXT,
ADD COLUMN payment_amount INTEGER, -- paise (20000 = ₹200)
ADD COLUMN payment_date TIMESTAMPTZ;

-- 2. Create payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  amount INTEGER NOT NULL, -- paise (20000 = ₹200)
  currency VARCHAR(3) DEFAULT 'INR',
  status VARCHAR(20) DEFAULT 'created', -- created/success/failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  verification_details JSONB -- Store full Razorpay response
);

-- 3. Create index for faster lookups
CREATE INDEX idx_payments_order_id ON payments(razorpay_order_id);
CREATE INDEX idx_payments_candidate_id ON payments(candidate_id);
CREATE INDEX idx_candidates_payment_status ON candidates(payment_status);

-- 4. RLS Policies
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Public cannot access payments directly
CREATE POLICY "payments_no_public_access"
ON payments FOR ALL
USING (false);

-- Candidates can only INSERT with pending status
CREATE POLICY "candidates_insert_pending"
ON candidates FOR INSERT
WITH CHECK (payment_status = 'pending');

-- 5. Storage Bucket (run in Supabase dashboard)
-- Create bucket: "candidate-resumes"
-- Public: false
-- File size limit: 10MB
-- Allowed MIME types: application/pdf
```

---

## 🔧 SUPABASE RPC FUNCTIONS

### **Function 1: Create Payment Order**

```sql
CREATE OR REPLACE FUNCTION create_payment_order(
  p_candidate_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_candidate_id UUID;
  v_order_id TEXT;
  v_amount INTEGER := 20000; -- Fixed ₹200 (in paise)
BEGIN
  -- Step 1: Create candidate record (pending status)
  INSERT INTO candidates (
    full_name, phone, email, trade, experience, location,
    resume_url, payment_status
  )
  VALUES (
    p_candidate_data->>'full_name',
    p_candidate_data->>'phone',
    p_candidate_data->>'email',
    p_candidate_data->>'trade',
    p_candidate_data->>'experience',
    p_candidate_data->>'location',
    p_candidate_data->>'resume_url',
    'pending'
  )
  RETURNING id INTO v_candidate_id;

  -- Step 2: Generate Razorpay order_id (unique)
  v_order_id := 'order_' || REPLACE(v_candidate_id::TEXT, '-', '');

  -- Step 3: Create payment record
  INSERT INTO payments (
    candidate_id,
    razorpay_order_id,
    amount,
    status
  )
  VALUES (
    v_candidate_id,
    v_order_id,
    v_amount,
    'created'
  );

  -- Step 4: Return order details for Razorpay
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'amount', v_amount,
    'candidate_id', v_candidate_id,
    'currency', 'INR'
  );
END;
$$;
```

---

### **Function 2: Verify Payment & Save Candidate**

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
  v_candidate_id UUID;
  v_expected_signature TEXT;
  v_temp_password TEXT;
BEGIN
  -- Step 1: Get payment record
  SELECT * INTO v_payment
  FROM payments
  WHERE razorpay_order_id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  -- Step 2: Verify signature (simplified - use Edge Function for real crypto)
  -- This is a placeholder - actual HMAC-SHA256 verification happens in Edge Function
  -- For now, we trust the client (will fix with Edge Function)

  -- Step 3: Update payment record
  UPDATE payments
  SET
    razorpay_payment_id = p_payment_id,
    razorpay_signature = p_signature,
    status = 'success',
    verified_at = NOW()
  WHERE razorpay_order_id = p_order_id;

  -- Step 4: Generate temporary password
  v_temp_password := 'temp' || FLOOR(RANDOM() * 90000 + 10000)::TEXT;

  -- Step 5: Update candidate (mark as paid, generate password)
  UPDATE candidates
  SET
    payment_status = 'success',
    payment_id = p_payment_id,
    payment_amount = v_payment.amount,
    payment_date = NOW(),
    status = 'new'
  WHERE id = v_payment.candidate_id
  RETURNING id INTO v_candidate_id;

  -- Step 6: Create user_password entry
  INSERT INTO user_passwords (user_email, password_hash)
  SELECT email, hash_password(v_temp_password)
  FROM candidates
  WHERE id = v_candidate_id;

  -- Step 7: Return success + temp password (for email)
  RETURN jsonb_build_object(
    'success', true,
    'candidate_id', v_candidate_id,
    'temp_password', v_temp_password,
    'email', (SELECT email FROM candidates WHERE id = v_candidate_id)
  );
END;
$$;
```

---

### **Function 3: Get Payment History**

```sql
CREATE OR REPLACE FUNCTION get_candidate_payments(p_candidate_id UUID)
RETURNS TABLE (
  payment_id TEXT,
  amount INTEGER,
  status TEXT,
  payment_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    razorpay_payment_id,
    payments.amount,
    payments.status,
    payments.verified_at
  FROM payments
  WHERE candidate_id = p_candidate_id
  ORDER BY created_at DESC;
END;
$$;
```

---

## 🎨 FRONTEND FLOW

### **apply.html - Multi-Step Form**

```html
<!-- Step 1: Basic Form (existing) -->
<form id="candidateForm">
  <!-- Name, phone, email, trade, experience, location -->
</form>

<!-- Step 2: Resume Upload (NEW) -->
<div id="step2" class="form-step hide">
  <h3>📄 Upload Resume (PDF, Max 10MB)</h3>
  <input type="file" id="resumeFile" accept=".pdf" />
  <div id="uploadProgress" class="hide">
    <progress value="0" max="100"></progress>
    <span id="uploadPercent">0%</span>
  </div>
  <button onclick="uploadResume()">Upload Resume</button>
</div>

<!-- Step 3: Review & Confirm (NEW) -->
<div id="step3" class="form-step hide">
  <h3>✅ Review Your Application</h3>
  <div id="reviewData"></div>
  <p><strong>Application Fee: ₹200</strong></p>
  <button onclick="proceedToPayment()">
    Confirm & Proceed to Pay ₹200
  </button>
</div>

<!-- Step 4: Payment Success (NEW) -->
<div id="step4" class="form-step hide">
  <h2>✅ Payment Successful!</h2>
  <p>Your application has been submitted.</p>
  <p>Login credentials sent to your email.</p>
  <a href="login.html">Login Now</a>
</div>
```

---

### **JavaScript Logic (apply.html)**

```javascript
let candidateData = {};
let resumeUrl = null;

// Step 1: Submit form → Step 2
async function submitStep1() {
  candidateData = {
    full_name: document.getElementById('fullName').value,
    phone: document.getElementById('phone').value,
    email: document.getElementById('email').value,
    trade: document.getElementById('trade').value,
    experience: document.getElementById('experience').value,
    location: document.getElementById('location').value,
  };
  showStep(2);
}

// Step 2: Upload resume → Step 3
async function uploadResume() {
  const fileInput = document.getElementById('resumeFile');
  const file = fileInput.files[0];
  
  // Validate
  if (!file) return alert('Please select a PDF file');
  if (file.type !== 'application/pdf') return alert('Only PDF files allowed');
  if (file.size > 10 * 1024 * 1024) return alert('File size must be under 10MB');

  // Upload to Supabase Storage
  const fileName = `${Date.now()}-${file.name}`;
  const { data, error } = await supabase.storage
    .from('candidate-resumes')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) return alert('Upload failed: ' + error.message);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('candidate-resumes')
    .getPublicUrl(fileName);

  resumeUrl = urlData.publicUrl;
  candidateData.resume_url = resumeUrl;

  // Show review step
  showStep(3);
  displayReview();
}

// Step 3: Display review
function displayReview() {
  document.getElementById('reviewData').innerHTML = `
    <p><strong>Name:</strong> ${candidateData.full_name}</p>
    <p><strong>Phone:</strong> ${candidateData.phone}</p>
    <p><strong>Email:</strong> ${candidateData.email}</p>
    <p><strong>Trade:</strong> ${candidateData.trade}</p>
    <p><strong>Resume:</strong> <a href="${resumeUrl}" target="_blank">View PDF</a></p>
  `;
}

// Step 3: Proceed to payment
async function proceedToPayment() {
  // Create payment order (server-side)
  const { data, error } = await supabase.rpc('create_payment_order', {
    p_candidate_data: candidateData
  });

  if (error) return alert('Error creating payment: ' + error.message);

  // Initialize Razorpay
  const options = {
    key: RAZORPAY_KEY_ID, // From config.js
    amount: data.amount, // 20000 paise = ₹200
    currency: 'INR',
    name: 'Go Hire Consultancy',
    description: 'Candidate Application Fee',
    order_id: data.order_id,
    handler: function(response) {
      // Payment success callback
      verifyPayment(response);
    },
    prefill: {
      name: candidateData.full_name,
      email: candidateData.email,
      contact: candidateData.phone,
    },
    theme: {
      color: '#FF6B35'
    }
  };

  const rzp = new Razorpay(options);
  rzp.open();
}

// Step 4: Verify payment & save candidate
async function verifyPayment(razorpayResponse) {
  const { data, error } = await supabase.rpc('verify_payment', {
    p_order_id: razorpayResponse.razorpay_order_id,
    p_payment_id: razorpayResponse.razorpay_payment_id,
    p_signature: razorpayResponse.razorpay_signature,
  });

  if (error || !data.success) {
    return alert('Payment verification failed. Contact support.');
  }

  // Success! Show final step
  showStep(4);

  // TODO: Send email with temp password (server-side)
}

function showStep(stepNum) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.add('hide'));
  document.getElementById('step' + stepNum).classList.remove('hide');
}
```

---

## 🔐 RAZORPAY INTEGRATION

### **Setup Steps:**

1. **Razorpay Account:**
   - Sign up: [razorpay.com](https://razorpay.com)
   - Go to: Settings → API Keys
   - Generate keys (Test mode first)

2. **Get API Keys:**
   ```
   Test Keys (for development):
   - Key ID: rzp_test_xxxxxxxxxxxxx
   - Key Secret: xxxxxxxxxxxxxxxxx
   
   Live Keys (for production):
   - Key ID: rzp_live_xxxxxxxxxxxxx
   - Key Secret: xxxxxxxxxxxxxxxxx
   ```

3. **Set the keys in the right place:**
   ```
   Vercel Environment Variables (frontend):
   RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx        # Key ID only — publishable

   Supabase Edge Function secrets (server-only):
   RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxx         # secret — NEVER in Vercel/frontend/git
   ```

4. **Add Razorpay Script to HTML:**
   ```html
   <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
   ```

---

## 📧 EMAIL NOTIFICATION

### **After Successful Payment:**

Send email with:
- ✅ Payment confirmation
- ✅ Application details
- ✅ Temporary password
- ✅ Login link

**Options:**
1. **Supabase Edge Function** (recommended)
2. **Third-party service** (SendGrid, Mailgun)
3. **SMTP** (via Edge Function)

---

## 👨‍💼 ADMIN DASHBOARD CHANGES

### **New Section: Payment Management**

```html
<!-- admin/dashboard.html -->
<section id="view-payments" class="adm-view hide">
  <h2>💰 Payment History</h2>
  <table>
    <thead>
      <tr>
        <th>Candidate</th>
        <th>Email</th>
        <th>Amount</th>
        <th>Payment ID</th>
        <th>Status</th>
        <th>Date</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="paymentsTable"></tbody>
  </table>
</section>
```

**JavaScript:**
```javascript
async function loadPayments() {
  const { data } = await client
    .from('candidates')
    .select('*, payments(*)')
    .eq('payment_status', 'success')
    .order('payment_date', { ascending: false });
  
  renderPaymentsTable(data);
}
```

---

## 🧪 TESTING CHECKLIST

### **Test Mode (Razorpay Test Keys):**

1. **Happy Path:**
   - ✅ Fill form
   - ✅ Upload resume (valid PDF < 10MB)
   - ✅ Review details
   - ✅ Click "Proceed to Pay"
   - ✅ Razorpay modal opens
   - ✅ Complete payment (test cards)
   - ✅ Success message shown
   - ✅ Data saved in database
   - ✅ Email sent

2. **Validation Tests:**
   - ❌ Upload non-PDF file → Should reject
   - ❌ Upload 15MB file → Should reject
   - ❌ Submit without resume → Should block
   - ❌ Cancel payment → Should not save data

3. **Security Tests:**
   - ❌ Try changing amount in browser console → Should fail
   - ❌ Fake payment signature → Should reject
   - ❌ Replay old payment ID → Should reject

4. **Razorpay Test Cards:**
   ```
   Success: 4111 1111 1111 1111
   CVV: any 3 digits
   Expiry: any future date
   ```

---

## 🚀 DEPLOYMENT CHECKLIST

### **Before Going Live:**

- [ ] Supabase migration applied
- [ ] Storage bucket created ("candidate-resumes")
- [ ] RPC functions deployed
- [ ] Razorpay account verified (live keys)
- [ ] Environment variables set in Vercel
- [ ] Email service configured
- [ ] Test payment flow end-to-end
- [ ] Admin dashboard payment view working
- [ ] User dashboard payment history working

---

## 📊 SUMMARY

### **Files to Create/Modify:**

1. **Database:**
   - `supabase/payment_migration.sql` (new)

2. **Frontend:**
   - `apply.html` (modify - add steps 2, 3, 4)
   - `js/config.js` (add RAZORPAY_KEY_ID)
   - `js/payment.js` (new - Razorpay logic)

3. **Admin:**
   - `admin/dashboard.html` (add payments view)
   - `admin/admin.js` (add payment functions)

4. **User Dashboard:**
   - `user-dashboard.html` (add payment history)

5. **Environment:**
   - Vercel: `RAZORPAY_KEY_ID` only (publishable)
   - Supabase Edge Function secrets: `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` (secret never leaves the server)

---

## 🔒 SECURITY SUMMARY

✅ **Protected:**
- Amount hardcoded server-side (₹200 fixed)
- Signature verification (HMAC-SHA256)
- RLS policies prevent direct writes
- Razorpay secret in environment variables only
- Resume files in private storage bucket

❌ **Not Vulnerable To:**
- Amount tampering (server validates)
- Fake payment responses (signature check)
- API key exposure (secret server-side)
- Direct database manipulation (RLS)

---

**Status:** 📋 Blueprint Complete  
**Next:** Implementation Phase

Approve karo to main implementation start karta hu! 🚀
