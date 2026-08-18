/* ==========================================================================
   Go Hire Consultancy — Form handling (client-side validation + demo submit)
   >> TODO(Supabase): replace fakeSubmit() with a real insert into Supabase
      (candidates / employers tables). Honeypot + validation already in place.
   ========================================================================== */

function fillTradeSelect(sel) {
  if (!sel) return;
  const first = `<option value="" data-i18n="f.selectTrade"></option>`;
  sel.innerHTML = first + DEMO_TRADES.map(tr => `<option value="${tr.name}">${tr.name}</option>`).join("");
}
function fillExpSelect(sel) {
  if (!sel) return;
  const first = `<option value="" data-i18n="f.selectExp"></option>`;
  sel.innerHTML = first + EXP_OPTIONS.map(e => `<option value="${e}">${e}</option>`).join("");
}
function fillLocationList(listEl) {
  if (!listEl) return;
  listEl.innerHTML = DEMO_LOCATIONS.map(l => `<option value="${l}"></option>`).join("");
}

function setError(field, msgKey) {
  field.classList.add("error");
  const em = field.querySelector(".err-msg");
  if (em) em.textContent = t(msgKey);
}
function clearError(field) { field.classList.remove("error"); }

function validateField(input) {
  const field = input.closest(".field");
  if (!field) return true;
  const val = input.value.trim();
  if (input.hasAttribute("required") && !val) { setError(field, "err.required"); return false; }
  if (input.dataset.type === "phone" && val) {
    const digits = val.replace(/[^0-9]/g, "");
    if (digits.length < 6 || digits.length > 15) { setError(field, "err.phone"); return false; }
  }
  if (input.dataset.type === "email" && val) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(val)) { setError(field, "err.email"); return false; }
  }
  clearError(field);
  return true;
}

function initForm(formId, successId) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.querySelectorAll("input, select, textarea").forEach((inp) => {
    inp.addEventListener("blur", () => validateField(inp));
    inp.addEventListener("input", () => { if (inp.closest(".field").classList.contains("error")) validateField(inp); });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    // Honeypot: if filled, silently drop (bot).
    const hp = form.querySelector('input[name="company_website"]');
    if (hp && hp.value) return;

    let ok = true;
    form.querySelectorAll("input[required], select[required], textarea[required]").forEach((inp) => {
      if (!validateField(inp)) ok = false;
    });
    if (!ok) {
      const firstErr = form.querySelector(".field.error");
      if (firstErr) firstErr.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    delete data.company_website;

    // International phone: merge the selected country dial code (phone_country)
    // with the national digits into one stored value like "+91 9876543210".
    if (typeof data.phone_country !== "undefined") {
      const natDigits = String(data.phone || "").replace(/[^0-9]/g, "");
      const dial = String(data.phone_country || "").replace(/[^0-9]/g, "");
      data.phone = natDigits ? ((dial ? "+" + dial + " " : "") + natDigits) : "";
      delete data.phone_country;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalTxt = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "..."; }

    saveSubmission(formId, data).then((res) => {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalTxt; }
      if (!res.ok) {
        if (res.roleConflict) {
          showRoleConflict(form, res.conflictRole);
        } else {
          alert(t("err.submit") || "Could not submit. Please try again or contact us on WhatsApp.");
        }
        return;
      }

      // Show success screen with different messages for new/existing users
      if (res.token) {
        showTokenSuccess(res, formId);
      } else {
        // Fallback to old behavior if no token
        form.classList.add("hide");
        const s = document.getElementById(successId);
        if (s) { s.classList.add("show"); s.scrollIntoView({ behavior: "smooth", block: "center" }); }
      }
    });
  });
}

// Generate a unique 8-character alphanumeric token
function generateToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Detect the database "one role per email" guard inside any Supabase error
// shape and return which role currently owns the email ('candidate' |
// 'employer'), or null if this isn't a role-conflict error.
function roleConflictFromError(err) {
  let s = "";
  try { s = JSON.stringify(err || {}); } catch (e) { s = ""; }
  s += " " + String((err && err.message) || err || "");
  if (s.indexOf("ROLE_CONFLICT_CANDIDATE") !== -1) return "candidate";
  if (s.indexOf("ROLE_CONFLICT_EMPLOYER") !== -1) return "employer";
  return null;
}

// Show the one-role-per-email error inline on the email field.
// conflictRole = the role that already owns this email.
function showRoleConflict(form, conflictRole) {
  const emailInput = form.querySelector('input[name="email"], input[type="email"], #email');
  const field = emailInput ? emailInput.closest(".field") : null;
  const msg = conflictRole === "candidate"
    ? "This email is already registered as a candidate. Please use a different email for an employer request."
    : conflictRole === "employer"
      ? "This email is already registered as an employer. Please use a different email to apply as a candidate."
      : "This email is already registered under a different account type. Please use a different email.";
  if (field) {
    field.classList.add("error");
    const em = field.querySelector(".err-msg");
    if (em) em.textContent = msg;
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    if (emailInput) { try { emailInput.focus(); } catch (e) {} }
  } else {
    alert(msg);
  }
}

// Save to Supabase with user account creation
async function saveSubmission(formId, data) {
  const client = (typeof initSupabase === "function") ? initSupabase() : null;
  if (!client) {
    console.log("[no DB — demo submit]", formId, data);
    return { ok: true, token: "DEMO1234", email: data.email };
  }
  try {
    // Step 0: One-role-per-email guard. An email that already belongs to the
    // OTHER department must not be reused here. The database triggers enforce
    // this no matter what — this pre-check just shows a friendly message first
    // (and, for candidates, avoids taking payment before the block).
    const { data: existingRole, error: roleErr } = await client.rpc('get_email_role', {
      p_email: data.email
    });
    if (!roleErr) {
      const conflict =
        (formId === "hireForm"  && (existingRole === "candidate" || existingRole === "both")) ||
        (formId === "applyForm" && (existingRole === "employer"  || existingRole === "both"));
      if (conflict) {
        return {
          ok: false,
          roleConflict: true,
          conflictRole: formId === "hireForm" ? "candidate" : "employer"
        };
      }
    }

    const token = generateToken();

    // Step 1: Get or create user account
    const { data: accountData, error: accountError } = await client.rpc('get_or_create_user_account', {
      p_email: data.email
    });

    console.log('Account creation result:', { accountData, accountError });

    if (accountError) throw accountError;
    if (!accountData || accountData.length === 0) throw new Error('Failed to create user account');

    const userAccount = accountData[0];
    const userId = userAccount.user_id;
    const tempPassword = userAccount.temp_password;
    const isNewUser = userAccount.is_new_user;

    // Step 2: Insert submission
    let result;
    if (formId === "applyForm") {
      result = await client.from("candidates").insert({
        user_id:         userId,
        full_name:       data.full_name,
        phone:           data.phone,
        email:           data.email,
        trade:           data.trade,
        experience:      data.experience,
        location:        data.location,
        message:         data.message || null,
        tracking_token:  token,
        token_generated_at: new Date().toISOString(),
      }).select();
      if (result.error) throw result.error;
    } else if (formId === "hireForm") {
      result = await client.from("employers").insert({
        user_id:         userId,
        company_name:    data.company_name,
        contact_person:  data.contact_person,
        phone:           data.phone,
        email:           data.email,
        gender:          data.gender || null,
        trade_needed:    data.trade_needed,
        workers_count:   data.workers_count ? parseInt(data.workers_count, 10) : null,
        location:        data.location,
        message:         data.message || null,
        tracking_token:  token,
        token_generated_at: new Date().toISOString(),
      }).select();
      if (result.error) throw result.error;
    }

    return {
      ok: true,
      token: token,
      email: data.email,
      submissionId: result.data[0].id,
      isNewUser: isNewUser,
      tempPassword: tempPassword // Only set for new users
    };
  } catch (err) {
    console.error("Submit failed:", err);
    // Backstop: if the database trigger blocked a cross-role email, surface it
    // as a friendly role-conflict instead of a generic failure.
    const conflictRole = roleConflictFromError(err);
    if (conflictRole) {
      return { ok: false, roleConflict: true, conflictRole: conflictRole };
    }
    return { ok: false, error: err };
  }
}

// Show token success screen
function showTokenSuccess(res, formId) {
  const formCard = document.querySelector('.form-card');
  if (!formCard) return;

  // Hide the form
  const form = document.getElementById(formId);
  if (form) form.classList.add("hide");

  // Create success screen based on user type
  const tokenScreen = document.createElement('div');
  tokenScreen.className = 'token-success';

  if (res.isNewUser && res.tempPassword) {
    // NEW USER: Show credentials
    tokenScreen.innerHTML = `
      <div class="check">✓</div>
      <h3>Application Submitted Successfully!</h3>
      <p style="margin-top:16px; font-size:15px; color:var(--muted);">Your account has been created. Save these credentials to login and track your application.</p>

      <div style="background: linear-gradient(135deg, var(--navy-800), var(--navy-900)); padding: 24px; border-radius: 16px; margin: 24px 0; color: #fff;">
        <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8; margin-bottom: 16px;">
          📧 Your Login Credentials
        </div>

        <div style="background: rgba(255,255,255,0.1); padding: 14px; border-radius: 10px; margin-bottom: 12px;">
          <div style="font-size: 12px; opacity: 0.7; margin-bottom: 4px;">Username (Email)</div>
          <div style="font-size: 16px; font-weight: 700; font-family: monospace;">${res.email}</div>
        </div>

        <div style="background: rgba(255,255,255,0.1); padding: 14px; border-radius: 10px;">
          <div style="font-size: 12px; opacity: 0.7; margin-bottom: 4px;">Temporary Password</div>
          <div style="font-size: 20px; font-weight: 800; font-family: monospace; letter-spacing: 0.1em;">${res.tempPassword}</div>
        </div>
      </div>

      <div style="background: #fff3e0; padding: 16px; border-radius: 12px; border-left: 4px solid var(--saffron); margin-bottom: 20px;">
        <div style="display: flex; align-items: start; gap: 10px;">
          <span style="font-size: 20px;">⚠️</span>
          <div style="font-size: 14px; color: var(--ink);">
            <strong>Important:</strong> Save these credentials! You'll need them to login and track your application status.
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
        <a href="login.html" class="btn btn-primary btn-lg">Login Now</a>
        <a href="index.html" class="btn btn-ghost btn-lg">Back to Home</a>
      </div>
    `;
  } else {
    // EXISTING USER: Welcome back message
    tokenScreen.innerHTML = `
      <div class="check">✓</div>
      <h3>Application Submitted Successfully!</h3>

      <div style="background: linear-gradient(135deg, var(--green), #059669); padding: 32px; border-radius: 16px; margin: 32px 0; color: #fff; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">💼</div>
        <h2 style="color: #fff; margin-bottom: 12px;">You're Already a Member!</h2>
        <p style="font-size: 16px; opacity: 0.95; line-height: 1.6;">
          Your new application has been submitted successfully.<br/>
          Login with your existing credentials to view all your applications.
        </p>
      </div>

      <div style="background: var(--bg); padding: 16px; border-radius: 12px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 12px; justify-content: center;">
          <span style="font-size: 24px;">📧</span>
          <div>
            <div style="font-size: 12px; color: var(--muted); font-weight: 700;">Your Account</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--navy-900);">${res.email}</div>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
        <a href="login.html" class="btn btn-primary btn-lg">Login to Dashboard</a>
        <a href="index.html" class="btn btn-ghost btn-lg">Back to Home</a>
      </div>
    `;
  }

  formCard.appendChild(tokenScreen);
  tokenScreen.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Copy token to clipboard
function copyToken(token) {
  navigator.clipboard.writeText(token).then(() => {
    const btn = document.querySelector('.btn-copy');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = t("token.copied");
      btn.style.background = "#10b981";
      setTimeout(() => {
        btn.textContent = original;
        btn.style.background = "";
      }, 2000);
    }
  }).catch(err => {
    // Fallback for older browsers
    const input = document.createElement('input');
    input.value = token;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    alert('Token copied: ' + token);
  });
}
