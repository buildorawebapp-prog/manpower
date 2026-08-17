# 🚨 CRITICAL FIX NEEDED - Razorpay Order Creation

**Current Error:** `400 Bad Request` from Razorpay API

**Root Cause:** Client-side generated `order_id` invalid hai. Razorpay ko server-side created order chahiye.

---

## 🔧 SOLUTION: Supabase Edge Function

### **Step 1: Create Edge Function**

Supabase Dashboard me:
1. **Edge Functions** (left menu)
2. **New Function**
3. Name: `create-razorpay-order`

```typescript
// supabase/functions/create-razorpay-order/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { candidateData } = await req.json()

    // 1. Create Razorpay order
    const orderData = {
      amount: 20000, // ₹200 in paise (FIXED - cannot be changed)
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        candidate_name: candidateData.full_name,
        candidate_email: candidateData.email,
      }
    }

    const basicAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)
    
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData)
    })

    if (!razorpayResponse.ok) {
      throw new Error('Razorpay order creation failed')
    }

    const razorpayOrder = await razorpayResponse.json()

    // 2. Save candidate to database
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: candidate, error: dbError } = await supabaseClient
      .from('candidates')
      .insert({
        full_name: candidateData.full_name,
        phone: candidateData.phone,
        email: candidateData.email,
        trade: candidateData.trade,
        experience: candidateData.experience,
        location: candidateData.location,
        resume_url: candidateData.resume_url,
        payment_status: 'pending',
        status: 'pending_payment',
      })
      .select()
      .single()

    if (dbError) throw dbError

    // 3. Save payment record
    await supabaseClient.from('payments').insert({
      candidate_id: candidate.id,
      razorpay_order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      status: 'created',
    })

    // 4. Return Razorpay order details
    return new Response(
      JSON.stringify({
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        candidate_id: candidate.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

---

### **Step 2: Deploy Edge Function**

```bash
# Install Supabase CLI (one-time)
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref srbudwxaxqfddwmwhobw

# Deploy function
supabase functions deploy create-razorpay-order

# Set secrets
supabase secrets set RAZORPAY_KEY_ID=rzp_test_TQnucWOp8cFQo0
supabase secrets set RAZORPAY_KEY_SECRET=your_secret_key_here
```

---

### **Step 3: Update Frontend Code**

Change `js/payment.js`:

```javascript
async function proceedToPayment() {
  const payBtn = document.getElementById('proceedPayBtn');
  payBtn.disabled = true;
  payBtn.textContent = 'Creating order...';

  try {
    if (typeof Razorpay === 'undefined') {
      throw new Error('Razorpay SDK not loaded. Please refresh and try again.');
    }

    // Call Edge Function instead of RPC
    const response = await fetch(
      'https://srbudwxaxqfddwmwhobw.supabase.co/functions/v1/create-razorpay-order',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.supabaseAnonKey}`,
        },
        body: JSON.stringify({ candidateData })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create order');
    }

    const data = await response.json();

    // Initialize Razorpay with real order_id
    const options = {
      key: CONFIG.razorpayKeyId,
      amount: data.amount,
      currency: 'INR',
      name: 'Go Hire Consultancy',
      description: 'Candidate Application Fee',
      order_id: data.order_id, // Real Razorpay order ID
      handler: function(response) {
        verifyPaymentAndSave(response);
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

  } catch (error) {
    console.error('Payment error:', error);
    alert('Failed: ' + error.message);
    payBtn.disabled = false;
    payBtn.textContent = 'Retry Payment';
  }
}
```

---

## ⚠️ PROBLEM:

Edge Functions setup **complex** hai aur time lagega.

---

## 🎯 ALTERNATIVE: Quick Working Solution

**Option:** Test mode me **amount-based simple checkout** use karo (bina order API ke).

Main ek **simplified working version** bana deta hu jo **immediately work karega**:

