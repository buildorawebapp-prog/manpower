/* ==========================================================================
   Asokamanpower — Admin Detail Page (Candidate/Employer with Chat)
   Shared JS for both candidate-detail.html and employer-detail.html
   ========================================================================== */

const client = initSupabase();

let submissionId = null;
let submissionType = null; // 'candidate' or 'employer'
let submissionData = null;
let chatRefreshInterval = null;

/* ---- Auth Guard ---- */
async function requireAuth() {
  const { data } = await client.auth.getSession();
  if (!data.session) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

/* ---- Initialize Page ---- */
async function initDetailPage(type) {
  if (!(await requireAuth())) return;

  submissionType = type;

  // Get ID from URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  submissionId = urlParams.get('id');

  if (!submissionId) {
    alert("No submission ID provided.");
    window.location.href = "dashboard.html";
    return;
  }

  await loadSubmissionDetails();
  await loadChatMessages();

  // Auto-refresh chat every 5 seconds
  chatRefreshInterval = setInterval(loadChatMessages, 5000);
}

/* ---- Load Submission Details ---- */
async function loadSubmissionDetails() {
  try {
    const tableName = submissionType === 'candidate' ? 'candidates' : 'employers';
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .eq('id', submissionId)
      .single();

    if (error || !data) {
      alert("Submission not found.");
      window.location.href = "dashboard.html";
      return;
    }

    submissionData = data;
    displaySubmissionDetails(data);

    // Load payment information for candidates
    if (submissionType === 'candidate' && data.payment_status === 'success') {
      await loadPaymentInformation(submissionId);
    }

    // Hide loading, show content
    document.getElementById('loadingState').classList.add('hide');
    document.getElementById('contentArea').classList.remove('hide');
  } catch (err) {
    console.error("Error loading details:", err);
    alert("Could not load submission details.");
    window.location.href = "dashboard.html";
  }
}

/* ---- Display Submission Details ---- */
function displaySubmissionDetails(data) {
  // Token
  document.getElementById('detailToken').textContent = data.tracking_token || 'N/A';

  // Status Badge
  const statusBadge = document.getElementById('statusBadge');
  statusBadge.innerHTML = `<span class="badge badge-${data.status}">${data.status}</span>`;

  // Status Select
  document.getElementById('statusSelect').value = data.status;

  // Date
  document.getElementById('detailDate').textContent = formatDateTime(data.created_at);

  // Phone
  const phone = data.phone || 'N/A';
  document.getElementById('detailPhone').textContent = phone;
  document.getElementById('detailPhoneCall').href = "tel:" + phone.replace(/[^0-9+]/g, "");

  // Email
  document.getElementById('detailEmail').textContent = data.email || 'N/A';

  if (submissionType === 'candidate') {
    // Candidate specific fields
    document.getElementById('detailName').textContent = data.full_name || 'N/A';
    document.getElementById('detailTrade').textContent = data.trade || 'N/A';
    document.getElementById('detailExperience').textContent = data.experience || 'N/A';
    document.getElementById('detailLocation').textContent = data.location || 'N/A';

    if (data.message) {
      document.getElementById('detailMessage').textContent = data.message;
    } else {
      document.getElementById('detailMessageSection').classList.add('hide');
    }
  } else {
    // Employer specific fields
    document.getElementById('detailCompany').textContent = data.company_name || 'N/A';
    document.getElementById('detailContact').textContent = data.contact_person || 'N/A';
    document.getElementById('detailTrade').textContent = data.trade_needed || 'N/A';
    document.getElementById('detailWorkers').textContent = data.workers_count || 'N/A';
    document.getElementById('detailLocation').textContent = data.location || 'N/A';

    if (data.message) {
      document.getElementById('detailMessage').textContent = data.message;
    } else {
      document.getElementById('detailMessageSection').classList.add('hide');
    }
  }
}

/* ---- Load Payment Information (candidates only) ---- */
async function loadPaymentInformation(candidateId) {
  const d = submissionData;

  // Reveal the payment section
  const section = document.getElementById('paymentSection');
  if (!section) return;
  section.classList.remove('hide');

  // --- Populate from candidate record (always available once paid) ---
  // Status badge
  document.getElementById('paymentStatusBadge').innerHTML =
    '<span class="badge badge-hired">Paid ✓</span>';

  // Amount (stored in paise → rupees)
  const amountPaise = Number(d.payment_amount) || 0;
  document.getElementById('paymentAmount').textContent =
    '₹' + (amountPaise / 100).toFixed(2);

  // Payment ID
  document.getElementById('paymentId').textContent = d.payment_id || 'N/A';

  // Payment date
  document.getElementById('paymentDate').textContent =
    d.payment_date ? formatDateTime(d.payment_date) : 'N/A';

  // Defaults for fields that come from the payments table
  document.getElementById('paymentOrderId').textContent = '—';
  document.getElementById('paymentVerifiedAt').textContent = '—';

  // --- Enrich with details from the payments table via RPC ---
  try {
    const { data, error } = await client.rpc('get_candidate_payment_info', {
      p_candidate_id: candidateId
    });

    if (!error && data && data.length > 0) {
      const p = data[0];

      // Order ID
      document.getElementById('paymentOrderId').textContent =
        p.razorpay_order_id || 'N/A';

      // Verified timestamp
      document.getElementById('paymentVerifiedAt').textContent =
        p.verified_at ? formatDateTime(p.verified_at) : 'N/A';

      // Prefer authoritative payments-table values where present
      if (p.payment_id) {
        document.getElementById('paymentId').textContent = p.payment_id;
      }
      if (p.amount != null) {
        const amt = Number(p.amount);
        const label = (p.currency ? p.currency + ' ' : '₹') +
          (amt / 100).toFixed(2);
        document.getElementById('paymentAmount').textContent =
          (p.currency && p.currency !== 'INR')
            ? label
            : '₹' + (amt / 100).toFixed(2);
      }
    }
  } catch (err) {
    // Non-fatal: candidate-level payment fields are already shown
    console.warn('Could not load extended payment info:', err);
  }
}

/* ---- Update Status ---- */
async function updateStatus() {
  const newStatus = document.getElementById('statusSelect').value;
  const tableName = submissionType === 'candidate' ? 'candidates' : 'employers';

  try {
    const { error } = await client
      .from(tableName)
      .update({ status: newStatus })
      .eq('id', submissionId);

    if (error) throw error;

    // Update badge
    const statusBadge = document.getElementById('statusBadge');
    statusBadge.innerHTML = `<span class="badge badge-${newStatus}">${newStatus}</span>`;

    // Show success note
    const note = document.getElementById('statusSaveNote');
    note.classList.remove('hide');
    setTimeout(() => note.classList.add('hide'), 2000);

    // Record status change in history
    await client.from('status_history').insert({
      submission_type: submissionType,
      submission_id: submissionId,
      old_status: submissionData.status,
      new_status: newStatus,
      changed_by: 'admin'
    });

    submissionData.status = newStatus;
  } catch (err) {
    console.error("Error updating status:", err);
    alert("Could not update status. Please try again.");
  }
}

/* ---- Load Chat Messages ---- */
async function loadChatMessages() {
  try {
    const { data, error } = await client
      .from('chat_messages')
      .select('*')
      .eq('submission_type', submissionType)
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    displayChatMessages(data || []);

    // Count unread user messages
    const unreadCount = (data || []).filter(m => m.sender_type === 'user' && !m.is_read).length;
    updateUnreadBadge(unreadCount);

    // Mark all user messages as read
    if (unreadCount > 0) {
      await client
        .from('chat_messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('submission_type', submissionType)
        .eq('submission_id', submissionId)
        .eq('sender_type', 'user')
        .eq('is_read', false);
    }
  } catch (err) {
    console.error("Error loading chat:", err);
  }
}

/* ---- Display Chat Messages ---- */
function displayChatMessages(messages) {
  const container = document.getElementById('chatMessages');

  if (messages.length === 0) {
    container.innerHTML = '<div class="chat-empty">No messages yet.</div>';
    return;
  }

  container.innerHTML = '';
  messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `admin-chat-message ${msg.sender_type}`;

    const avatarText = msg.sender_type === 'user' ? 'U' : 'A';
    const senderLabel = msg.sender_type === 'user' ? 'User' : 'Admin';

    const textHtml = (msg.message && msg.message.trim())
      ? `<div class="admin-chat-text">${escapeHtml(msg.message)}</div>` : '';
    const attachHtml = (typeof renderChatAttachment === 'function') ? renderChatAttachment(msg) : '';

    div.innerHTML = `
      <div class="admin-chat-avatar">${avatarText}</div>
      <div class="admin-chat-bubble">
        <div class="admin-chat-sender">${senderLabel}</div>
        ${textHtml}
        ${attachHtml}
        <div class="admin-chat-time">${formatTime(msg.created_at)}</div>
      </div>
    `;

    container.appendChild(div);
  });

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

/* ---- Update Unread Badge ---- */
function updateUnreadBadge(count) {
  const badge = document.getElementById('unreadBadge');
  if (count > 0) {
    badge.textContent = `${count} unread`;
    badge.classList.remove('hide');
  } else {
    badge.classList.add('hide');
  }
}

/* ---- Chat attachment state ---- */
let adminChatSelectedFile = null;

/* ---- Send Message ---- */
async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();

  if (!message && !adminChatSelectedFile) return;

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;
  sendBtn.textContent = '⏳';

  try {
    let attachment = null;
    if (adminChatSelectedFile) {
      attachment = await uploadChatAttachment(adminChatSelectedFile);
    }

    const { error } = await client.from('chat_messages').insert({
      submission_type: submissionType,
      submission_id: submissionId,
      sender_type: 'admin',
      message: message || null,
      attachment_url: attachment ? attachment.url : null,
      attachment_type: attachment ? attachment.type : null,
      attachment_name: attachment ? attachment.name : null
    });

    if (error) throw error;

    input.value = '';
    autoGrowAdminChat(input);
    clearAdminChatAttachment();
    await loadChatMessages();
  } catch (err) {
    console.error("Error sending message:", err);
    alert(err.message || "Could not send message. Please try again.");
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '➤';
  }
}

/* ---- Admin chat attachment helpers ---- */
function handleChatFileSelect(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) { clearAdminChatAttachment(); return; }

  const check = (typeof validateChatFile === 'function')
    ? validateChatFile(file) : { ok: true, type: 'file' };
  if (!check.ok) {
    alert(check.error);
    clearAdminChatAttachment();
    return;
  }
  adminChatSelectedFile = file;
  showAdminAttachPreview(file, check.type);
}

function showAdminAttachPreview(file, type) {
  const preview = document.getElementById('attachPreview');
  if (!preview) return;
  let thumb = '<span style="font-size:22px;">📄</span>';
  if (type === 'image') {
    const objUrl = URL.createObjectURL(file);
    thumb = `<img src="${objUrl}" class="ap-thumb" alt="preview" />`;
  }
  preview.innerHTML = `
    ${thumb}
    <span class="ap-name">${escapeHtml(file.name)}</span>
    <button type="button" class="ap-remove" onclick="clearAdminChatAttachment()" title="Remove" aria-label="Remove attachment">✕</button>
  `;
  preview.classList.remove('hide');
}

function clearAdminChatAttachment() {
  adminChatSelectedFile = null;
  const preview = document.getElementById('attachPreview');
  if (preview) { preview.innerHTML = ''; preview.classList.add('hide'); }
  const fileInput = document.getElementById('chatFileInput');
  if (fileInput) fileInput.value = '';
}

function autoGrowAdminChat(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

// Allow Enter to send (Shift+Enter for new line)
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('chatInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});

/* ---- Copy Token ---- */
function copyToken() {
  const token = document.getElementById('detailToken').textContent;
  navigator.clipboard.writeText(token).then(() => {
    alert('Token copied to clipboard!');
  }).catch(() => {
    alert('Could not copy token. Please copy manually: ' + token);
  });
}

/* ==========================================================================
   Reset User Password (admin action)
   Issues a fresh temporary password for the candidate/employer's login,
   forces a change on their next login, and lets the admin send it on
   WhatsApp. Works for both candidates and employers (shared login identity).
   ========================================================================== */
async function resetUserPassword() {
  const email = (submissionData && submissionData.email) ? submissionData.email : '';
  const phone = (submissionData && submissionData.phone) ? submissionData.phone : '';

  if (!email) {
    alert('This record has no email address, so there is no login account to reset.');
    return;
  }

  const who = (submissionType === 'candidate')
    ? (submissionData.full_name || email)
    : (submissionData.company_name || email);

  if (!confirm(
    'Reset the login password for ' + who + ' (' + email + ')?\n\n' +
    "Their current password will stop working immediately. You'll get a new " +
    'temporary password to send them on WhatsApp.'
  )) return;

  const btn = document.getElementById('resetPwdBtn');
  const resultBox = document.getElementById('resetPwdResult');
  const originalTxt = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Resetting…'; }

  try {
    const { data, error } = await client.rpc('admin_reset_user_password', { p_email: email });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.success) {
      throw new Error((row && row.message) || 'Reset failed.');
    }

    renderResetResult(resultBox, email, phone, row.temp_password);
  } catch (err) {
    console.error('Password reset failed:', err);
    alert('Could not reset password: ' + (err.message || 'Unknown error'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalTxt || '🔑 Reset Password'; }
  }
}

function renderResetResult(box, email, phone, tempPwd) {
  if (!box) return;

  const waLink = buildWhatsAppResetLink(phone, email, tempPwd);
  const waBtn = waLink
    ? '<a class="mini-btn" href="' + waLink + '" target="_blank" rel="noopener" ' +
      'style="background:#25D366;color:#fff;border-color:#25D366;">📲 Send on WhatsApp</a>'
    : '<span style="color:var(--muted);font-size:13px;">No phone number on file — copy and send it manually.</span>';

  box.innerHTML =
    '<div style="background:#fff8ec;border:1px solid var(--saffron);border-radius:12px;padding:14px;">' +
      '<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px;">New Temporary Password</div>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<code id="tempPwdValue" style="font-size:20px;font-weight:800;letter-spacing:.08em;font-family:monospace;background:#fff;padding:6px 12px;border-radius:8px;border:1px dashed #cbb48a;color:var(--navy-900);">' + escapeHtml(tempPwd) + '</code>' +
        '<button class="mini-btn" onclick="copyTempPassword()">📋 Copy</button>' +
        waBtn +
      '</div>' +
      '<p style="margin:10px 0 0;font-size:13px;color:var(--muted);line-height:1.5;">' +
        'Send this to the user. They log in with their email + this password, then set their own new password. ' +
        'It is shown only until you leave this page — copy it now.' +
      '</p>' +
    '</div>';
  box.classList.remove('hide');
}

// Build a wa.me deep link with a pre-filled reset message. Normalises Indian
// numbers to +91 (10-digit) and returns null if there is no usable phone.
function buildWhatsAppResetLink(phone, email, tempPwd) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;

  let intl = digits;
  if (digits.length === 10) intl = '91' + digits;                       // bare 10-digit → India
  else if (digits.length === 11 && digits.charAt(0) === '0') intl = '91' + digits.slice(1);
  // otherwise assume it already includes a country code

  const msg =
    'Hello,\n\n' +
    'Your Go Hire Consultancy login password has been reset.\n\n' +
    'Login Email: ' + email + '\n' +
    'Temporary Password: ' + tempPwd + '\n\n' +
    'Please login here: https://gohireconsultancy.com/login.html\n' +
    "For your security, you'll be asked to set your own new password right after logging in.";

  return 'https://wa.me/' + intl + '?text=' + encodeURIComponent(msg);
}

function copyTempPassword() {
  const el = document.getElementById('tempPwdValue');
  if (!el) return;
  const val = el.textContent;
  navigator.clipboard.writeText(val).then(() => {
    alert('Temporary password copied: ' + val);
  }).catch(() => {
    alert('Could not copy automatically. Password: ' + val);
  });
}

/* ---- Utility Functions ---- */
function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return d.toLocaleDateString('en-US', options);
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return d.toLocaleDateString('en-US', options);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (chatRefreshInterval) {
    clearInterval(chatRefreshInterval);
  }
});
