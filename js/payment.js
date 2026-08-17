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

  // Collect form data
  candidateData = {
    full_name: document.getElementById('fullName').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    email: document.getElementById('email').value.trim(),
    trade: document.getElementById('trade').value,
    experience: document.getElementById('experience').value,
    location: document.getElementById('location').value,
  };

  // Validate
  if (!candidateData.full_name || !candidateData.phone || !candidateData.email) {
    alert('Please fill all required fields');
    return;
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(candidateData.email)) {
    alert('Please enter a valid email address');
    return;
  }

  // Phone validation (10 digits)
  const phoneRegex = /^[0-9]{10}$/;
  if (!phoneRegex.test(candidateData.phone.replace(/[^0-9]/g, ''))) {
    alert('Please enter a valid 10-digit phone number');
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

  reviewData.innerHTML = `
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

    const client = initSupabase();
    if (!client) {
      throw new Error('Database connection not initialized. Please refresh the page.');
    }

    // Step 1: Save candidate data first (without payment)
    const { data: candidateResult, error: candidateError } = await client.rpc('create_payment_order', {
      p_candidate_data: candidateData
    });

    if (candidateError || !candidateResult) {
      // Backstop: the database trigger blocks an employer email applying as a
      // candidate. Surface it as a friendly message instead of a generic error.
      const emsg = (candidateError && candidateError.message) ? candidateError.message : '';
      if (emsg.indexOf('ROLE_CONFLICT') !== -1) {
        alert('This email is already registered as an employer account. Please use a different email to apply as a candidate.');
        payBtn.disabled = false;
        payBtn.textContent = 'Confirm & Proceed to Pay ₹200';
        return;
      }
      throw new Error(candidateError?.message || 'Failed to save application');
    }

    // Store candidate_id for later verification
    const candidateId = candidateResult.candidate_id;
    const receiptId = candidateResult.receipt_id;

    // Step 2: Initialize Razorpay (without order_id for test mode)
    const options = {
      key: CONFIG.razorpayKeyId,
      amount: 20000, // ₹200 fixed amount
      currency: 'INR',
      name: 'Go Hire Consultancy',
      description: 'Candidate Application Fee',
      image: 'https://gohireconsultancy.com/images/logo.png',
      handler: async function(response) {
        // Payment success
        payBtn.textContent = 'Verifying payment...';
        await verifyPaymentAndSave(response, candidateId, receiptId);
      },
      prefill: {
        name: candidateData.full_name,
        email: candidateData.email,
        contact: candidateData.phone,
      },
      notes: {
        candidate_id: candidateId,
        receipt_id: receiptId,
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
    rzp.on('payment.failed', function(response) {
      alert('Payment failed: ' + response.error.description);
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
async function verifyPaymentAndSave(razorpayResponse, candidateId, receiptId) {
  const payBtn = document.getElementById('proceedPayBtn');
  payBtn.textContent = 'Verifying payment...';

  try {
    // Verify payment on server
    const client = initSupabase();
    const { data, error } = await client.rpc('verify_payment', {
      p_order_id: receiptId,
      p_payment_id: razorpayResponse.razorpay_payment_id,
      p_signature: razorpayResponse.razorpay_signature || 'no_signature'
    });

    if (error || !data || !data.success) {
      throw new Error(data?.error || error?.message || 'Payment verification failed');
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

  successDetails.innerHTML = `
    <div class="success-message">
      <div class="success-icon">✅</div>
      <h2>Application Submitted Successfully!</h2>
      <p>Your payment of <strong>₹${(data.amount / 100).toFixed(2)}</strong> has been received.</p>
    </div>

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
      <p class="cred-note">📧 These credentials have been sent to your email.</p>
      <p class="cred-warning">⚠️ Please change your password after first login.</p>
    </div>

    <div class="next-steps">
      <h3>📋 Next Steps:</h3>
      <ol>
        <li>Check your email for confirmation</li>
        <li>Login to your dashboard using the credentials above</li>
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
