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

    div.innerHTML = `
      <div class="admin-chat-avatar">${avatarText}</div>
      <div class="admin-chat-bubble">
        <div class="admin-chat-sender">${senderLabel}</div>
        <div class="admin-chat-text">${escapeHtml(msg.message)}</div>
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

/* ---- Send Message ---- */
async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();

  if (!message) return;

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';

  try {
    const { error } = await client.from('chat_messages').insert({
      submission_type: submissionType,
      submission_id: submissionId,
      sender_type: 'admin',
      message: message
    });

    if (error) throw error;

    input.value = '';
    await loadChatMessages();
  } catch (err) {
    console.error("Error sending message:", err);
    alert("Could not send message. Please try again.");
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Reply';
  }
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
