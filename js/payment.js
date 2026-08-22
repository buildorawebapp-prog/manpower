/* ==========================================================================
   Go Hire Consultancy — Payment Integration
   Handles resume upload + Razorpay payment for candidate applications
   ========================================================================== */

// Multi-step form state
let currentStep = 1;
let candidateData = {};
let resumeUrl = null;

/* ----------------------------------------------------------------------
   Step Navigation
---------------------------------------------------------------------- */
function showStep(stepNum) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.add('hide'));
  const step = document.getElementById('step' + stepNum);
  if (step) step.classList.remove('hide');
  currentStep = stepNum;

  // Update progress indicator
  document.querySelectorAll('.step-indicator .step').forEach((s, i) => {
    s.classList.toggle('active', i + 1 <= stepNum);
    s.classList.toggle('completed', i + 1 < stepNum);
  });
}

/* ----------------------------------------------------------------------
   Step 1: Basic Form Submission
---------------------------------------------------------------------- */
async function submitBasicForm(event) {
  event.preventDefault();

  // International phone: combine selected country dial code + national digits
  // into a single stored value like "+91 9876543210".
  const phoneInputEl = document.getElementById('phone');
  const phoneCountryEl = document.getElementById('phoneCountry');
  const phoneDigits = window.PhoneInput
    ? PhoneInput.getDigits(phoneInputEl)
    : String((phoneInputEl && phoneInputEl.value) || '').replace(/[^0-9]/g, '');
  const fullPhone = window.PhoneInput
    ? PhoneInput.getFullNumber(phoneCountryEl, phoneInputEl)
    : ((phoneCountryEl && phoneCountryEl.value
        ? '+' + String(phoneCountryEl.value).replace(/[^0-9]/g, '') + ' ' : '') + phoneDigits);

  // Collect form data
  candidateData = {
    full_name: document.getElementById('fullName').value.trim(),
    phone: fullPhone,
    email: document.getElementById('email').value.trim(),
    gender: document.getElementById('gender').value,
    trade: document.getElementById('trade').value,
    experience: document.getElementById('experience').value,
    location: document.getElementById('location').value,
  };

  // Applying through a hiring campaign? Attach it so the server can validate
  // the seat and link the application. window.CAMPAIGN_CONTEXT is set by
  // apply.html only after it has verified the campaign is live and has seats;
  // create_payment_order() re-validates everything before any money is taken.
  if (window.CAMPAIGN_CONTEXT && window.CAMPAIGN_CONTEXT.id) {
    candidateData.campaign_id = window.CAMPAIGN_CONTEXT.id;
  }

  // Validate
  if (!candidateData.full_name || !candidateData.phone || !candidateData.email) {
    alert('Please fill all required fields');
    return;
  }

  // Gender is required
  if (!candidateData.gender) {
    alert('Please select your gender');
    return;
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(candidateData.email)) {
    alert('Please enter a valid email address');
    return;
  }

  // Phone validation (flexible 6–15 digits to support any country)
  if (phoneDigits.length < 6 || phoneDigits.length > 15) {
    alert('Please enter a valid phone number');
    return;
  }

  // One-role-per-email guard: an email already registered as an EMPLOYER must
  // NOT be used to apply as a candidate. Check now — BEFORE resume upload and
  // payment — so the user never pays only to be blocked later. The database
  // trigger is the real, unbypassable guard; this is just a friendly heads-up.
  try {
    const client = (typeof initSupabase === 'function') ? initSupabase() : null;
    if (client) {
      const { data: existingRole, error: roleErr } = await client.rpc('get_email_role', {
        p_email: candidateData.email
      });
      if (!roleErr && (existingRole === 'employer' || existingRole === 'both')) {
        alert('This email is already registered as an employer account. Please use a different email to apply as a candidate.');
        return;
      }
    }
  } catch (e) {
    // Non-blocking: if the pre-check fails, let the flow continue and rely on
    // the database trigger (verified again in proceedToPayment).
    console.warn('Role pre-check skipped:', e);
  }

  // Move to step 2 (resume upload)
  showStep(2);
}

/* ----------------------------------------------------------------------
   Step 2: Resume Upload (Supabase Storage)
---------------------------------------------------------------------- */
async function uploadResume() {
  const fileInput = document.getElementById('resumeFile');
  const file = fileInput.files[0];

  // Validation
  if (!file) {
    alert('Please select a PDF file');
    return;
  }

  if (file.type !== 'application/pdf') {
    alert('Only PDF files are allowed');
    return;
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    alert('File size must be under 10MB');
    return;
  }

  // Show progress
  const uploadBtn = document.getElementById('uploadBtn');
  const progress = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressPercent');

  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';
  progress.classList.remove('hide');

  try {
    // Simulate progress
    let progressValue = 0;
    const progressInterval = setInterval(() => {
      progressValue += 10;
      if (progressValue <= 90) {
        progressBar.style.width = progressValue + '%';
        progressText.textContent = progressValue + '%';
      }
    }, 150);

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const fileName = `resumes/${timestamp}_${sanitizedName}`;

    // Upload to Supabase Storage
    const client = initSupabase();
    const { data, error } = await client.storage
      .from('candidate-resumes')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    clearInterval(progressInterval);

    if (error) {
      if (error.message.includes('bucket') || error.message.includes('not found')) {
        throw new Error('Storage not configured. Please contact administrator.');
      }
      throw new Error(error.message);
    }

    // Get public URL
    const { data: urlData } = client.storage
      .from('candidate-resumes')
      .getPublicUrl(fileName);

    resumeUrl = urlData.publicUrl;
    candidateData.resume_url = resumeUrl;

    // Success
    progressBar.style.width = '100%';
    progressText.textContent = '100%';
    uploadBtn.textContent = '✓ Uploaded Successfully';

    // Wait 1 second then move to review
    setTimeout(() => {
      showStep(3);
      displayReview();
    }, 1000);

  } catch (error) {
    console.error('Upload error:', error);
    alert('Resume upload failed: ' + error.message);
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload Resume';
    progress.classList.add('hide');
  }
}

// File input change handler (show file name)
function handleFileSelect(input) {
  const fileInfo = document.getElementById('fileInfo');
  const fileName = document.getElementById('fileName');
  const uploadBtn = document.getElementById('uploadBtn');

  if (input.files && input.files[0]) {
    fileName.textContent = input.files[0].name;
    fileInfo.classList.add('show');
    uploadBtn.disabled = false;
  } else {
    fileName.textContent = '';
    fileInfo.classList.remove('show');
    uploadBtn.disabled = true;
  }
}

/* ----------------------------------------------------------------------
   Step 3: Review & Confirm
---------------------------------------------------------------------- */
function displayReview() {
  const reviewData = document.getElementById('reviewData');

  const campaignRow = (window.CAMPAIGN_CONTEXT && window.CAMPAIGN_CONTEXT.title)
    ? `<div class="review-item">
      <span class="review-label">📣 Campaign:</span>
      <span class="review-value">${window.CAMPAIGN_CONTEXT.title}</span>
    </div>` : '';

  reviewData.innerHTML = `
    ${campaignRow}
    <div class="review-item">
      <span class="review-label">👤 Full Name:</span>
      <span class="review-value">${candidateData.full_name}</span>
    </div>
    <div class="review-item">
      <span class="review-label">📞 Phone:</span>
      <span class="review-value">${candidateData.phone}</span>
    </div>
    <div class="review-item">
      <span class="review-label">📧 Email:</span>
      <span class="review-value">${candidateData.email}</span>
    </div>
    <div class="review-item">
      <span class="review-label">⚧ Gender:</span>
      <span class="review-value">${candidateData.gender}</span>
    </div>
    <div class="review-item">
      <span class="review-label">🛠️ Trade:</span>
      <span class="review-value">${candidateData.trade}</span>
    </div>
    <div class="review-item">
      <span class="review-label">⏱️ Experience:</span>
      <span class="review-value">${candidateData.experience}</span>
    </div>
    <div class="review-item">
      <span class="review-label">📍 Location:</span>
      <span class="review-value">${candidateData.location}</span>
    </div>
    <div class="review-item">
      <span class="review-label">📄 Resume:</span>
      <span class="review-value"><a href="${resumeUrl}" target="_blank" class="resume-link">View PDF ↗</a></span>
    </div>
  `;
}

function goBackToEdit() {
  showStep(1);
}

/* ----------------------------------------------------------------------
   Step 4: Payment Integration (Razorpay)
---------------------------------------------------------------------- */
async function proceedToPayment() {
  const payBtn = document.getElementById('proceedPayBtn');
  payBtn.disabled = true;
  payBtn.textContent = 'Processing...';

  try {
    if (typeof Razorpay === 'undefined') {
      throw new Error('Razorpay SDK not loaded. Please refresh and try again.');
    }

    // Step 1: Create a REAL Razorpay order on the SERVER (Edge Function).
    // The server holds the Razorpay secret, creates a genuine order, and saves
    // the candidate + payment row. The browser never sees the secret, and the
    // real order_id is what lets us verify a signature after payment.
    const orderResp = await fetch(`${CONFIG.supabaseUrl}/functions/v1/create-razorpay-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.supabaseAnonKey}`,
        'apikey': CONFIG.supabaseAnonKey,
      },
      body: JSON.stringify({ candidateData })
    });
    const orderResult = await orderResp.json().catch(() => null);

    if (!orderResp.ok || !orderResult || orderResult.success === false) {
      // Friendly message when the email is already an employer account.
      if (orderResult && orderResult.code === 'ROLE_CONFLICT') {
        alert('This email is already registered as an employer account. Please use a different email to apply as a candidate.');
        payBtn.disabled = false;
        payBtn.textContent = 'Confirm & Proceed to Pay ₹200';
        return;
      }

      // The campaign filled up / closed / expired between page load and payment.
      // Nothing was charged. Detach the campaign, unlock the trade field and let
      // the candidate continue as a normal application instead of dead-ending.
      const campaignErr = /^CAMPAIGN_(MISSING|CLOSED|FULL|EXPIRED):\s*([\s\S]*)$/
        .exec((orderResult && orderResult.error) || '');
      if (campaignErr) {
        if (typeof releaseCampaignContext === 'function') releaseCampaignContext();
        delete candidateData.campaign_id;
        displayReview();
        alert('Campaign no longer available\n\n' + campaignErr[2] +
              '\n\nYou have not been charged. Press the pay button again to continue as a normal application.');
        payBtn.disabled = false;
        payBtn.textContent = 'Confirm & Proceed to Pay ₹200';
        return;
      }

      throw new Error((orderResult && orderResult.error) || 'Failed to create payment order');
    }

    // Store details for later verification
    const candidateId = orderResult.candidate_id;
    const orderId = orderResult.order_id;
    const payAmount = orderResult.amount || 20000;

    // Step 2: Open Razorpay Checkout with the REAL order_id. Passing order_id is
    // what makes Razorpay return a signature we verify server-side.
    const options = {
      key: orderResult.key_id || CONFIG.razorpayKeyId,
      amount: payAmount, // ₹200 fixed amount (in paise), set by the server
      currency: orderResult.currency || 'INR',
      order_id: orderId,
      name: 'Go Hire Consultancy',
      description: 'Candidate Application Fee',
      image: 'https://gohireconsultancy.com/images/logo.png',
      handler: async function(response) {
        // Payment success
        payBtn.textContent = 'Verifying payment...';
        await verifyPaymentAndSave(response, candidateId);
      },
      prefill: {
        name: candidateData.full_name,
        email: candidateData.email,
        contact: candidateData.phone,
      },
      notes: {
        candidate_id: candidateId,
        order_id: orderId,
      },
      theme: {
        color: '#FF6B35'
      },
      modal: {
        ondismiss: function() {
          payBtn.disabled = false;
          payBtn.textContent = 'Confirm & Proceed to Pay ₹200';
        }
      }
    };

    const rzp = new Razorpay(options);
    // A payment attempt was declined at the gateway (wrong/invalid card, bank or
    // issuer decline, wallet/gateway outage, or timeout). This is a normal
    // gateway outcome — NOT an app error. Show the customer what happened and
    // what to try next, and reassure them about auto-refund of any debit.
    rzp.on('payment.failed', function(response) {
      const err = (response && response.error) || {};
      const reason = err.description || 'The payment could not be completed.';
      let advice = 'Please try again using UPI, a different card, or net banking.';
      if (err.source === 'issuer' || err.source === 'gateway' || err.reason === 'server_error') {
        advice += ' If any amount was debited, your bank will refund it within 5–7 working days.';
      }
      const ref = (err.metadata && err.metadata.payment_id)
        ? ('\n\nReference: ' + err.metadata.payment_id) : '';
      alert('Payment not completed\n\n' + reason + '\n\n' + advice + ref);
      payBtn.disabled = false;
      payBtn.textContent = 'Retry Payment';
    });

    rzp.open();

  } catch (error) {
    console.error('Payment initiation error:', error);
    alert('Failed to initiate payment: ' + error.message);
    payBtn.disabled = false;
    payBtn.textContent = 'Confirm & Proceed to Pay ₹200';
  }
}

/* ----------------------------------------------------------------------
   Step 5: Verify Payment & Save to Database
---------------------------------------------------------------------- */
async function verifyPaymentAndSave(razorpayResponse, candidateId) {
  const payBtn = document.getElementById('proceedPayBtn');
  payBtn.textContent = 'Verifying payment...';

  try {
    // Verify the payment signature on the SERVER (Edge Function). Only a valid
    // HMAC signature (computed with the Razorpay secret, which the browser never
    // has) will finalize the application and issue login credentials.
    const resp = await fetch(`${CONFIG.supabaseUrl}/functions/v1/verify-razorpay-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.supabaseAnonKey}`,
        'apikey': CONFIG.supabaseAnonKey,
      },
      body: JSON.stringify({
        razorpay_order_id: razorpayResponse.razorpay_order_id,
        razorpay_payment_id: razorpayResponse.razorpay_payment_id,
        razorpay_signature: razorpayResponse.razorpay_signature,
      })
    });
    const data = await resp.json().catch(() => null);

    if (!resp.ok || !data || !data.success) {
      throw new Error((data && data.error) || 'Payment verification failed');
    }

    // Success! Show final step
    showStep(4);
    displaySuccess(data);

  } catch (error) {
    console.error('Payment verification error:', error);
    alert('Payment verification failed: ' + error.message + '\n\nPlease contact support with your payment ID: ' + razorpayResponse.razorpay_payment_id);
    payBtn.disabled = false;
    payBtn.textContent = 'Contact Support';
  }
}

/* ----------------------------------------------------------------------
   Step 4: Success Display
---------------------------------------------------------------------- */
function displaySuccess(data) {
  const successDetails = document.getElementById('successDetails');

  // Returning users keep their existing password — we never issue (or reset)
  // one for an email that already has an account.
  const credentialsBox = (data.already_registered || !data.temp_password)
    ? `
    <div class="credentials-box">
      <h3>🔐 Your Account</h3>
      <div class="credential-item">
        <span class="cred-label">Email:</span>
        <span class="cred-value">${data.email}</span>
      </div>
      <p class="cred-note">✅ You already have an account. Please log in with your <strong>existing password</strong>.</p>
      <p class="cred-warning">Forgot it? Contact us and an admin will reset it for you.</p>
    </div>`
    : `
    <div class="credentials-box">
      <h3>🔐 Login Credentials</h3>
      <div class="credential-item">
        <span class="cred-label">Email:</span>
        <span class="cred-value">${data.email}</span>
      </div>
      <div class="credential-item">
        <span class="cred-label">Temporary Password:</span>
        <span class="cred-value temp-password">${data.temp_password}</span>
      </div>
      <p class="cred-note">📝 Save these now. You'll be asked to set your own password on first login.</p>
      <p class="cred-warning">⚠️ Please change your password after first login.</p>
    </div>`;

  successDetails.innerHTML = `
    <div class="success-message">
      <div class="success-icon">✅</div>
      <h2>Application Submitted Successfully!</h2>
      <p>Your payment of <strong>₹${(data.amount / 100).toFixed(2)}</strong> has been received.</p>
    </div>

    ${credentialsBox}

    <div class="next-steps">
      <h3>📋 Next Steps:</h3>
      <ol>
        <li>Login to your dashboard using the details above</li>
        <li>Complete your profile if needed</li>
        <li>Our team will review your application</li>
      </ol>
    </div>

    <a href="login.html" class="btn btn-primary btn-lg">Login to Dashboard →</a>
  `;
}

/* ----------------------------------------------------------------------
   Initialization
---------------------------------------------------------------------- */
function initPaymentForm() {
  // Check if required libraries are loaded
  if (typeof initSupabase !== 'function') {
    console.error('Supabase not loaded. Retrying...');
    setTimeout(initPaymentForm, 500);
    return;
  }

  // Show step 1 by default
  showStep(1);

  // Bind form submit
  const form = document.getElementById('candidateForm');
  if (form) {
    form.addEventListener('submit', submitBasicForm);
  }

  // Bind file input
  const fileInput = document.getElementById('resumeFile');
  if (fileInput) {
    fileInput.addEventListener('change', function() {
      handleFileSelect(this);
    });
  }

  console.log('Payment form initialized successfully');
}

// Auto-initialize with delay to ensure CDN scripts are loaded
if (document.getElementById('candidateForm')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(initPaymentForm, 200);
    });
  } else {
    setTimeout(initPaymentForm, 200);
  }
}
