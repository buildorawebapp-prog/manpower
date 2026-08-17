/* ==========================================================================
   Go Hire Consultancy — Shared Chat Attachment Helpers
   Used by both the user dashboard and the admin chat.
   Handles: validation, upload to Supabase Storage, safe HTML rendering,
   and forced downloads.
   ========================================================================== */

const CHAT_ATTACHMENT_BUCKET = 'chat-attachments';
const CHAT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const CHAT_ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const CHAT_ALLOWED_PDF = ['application/pdf'];

/* ---- Validate a file chosen for the chat ---- */
function validateChatFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };

  const isImage = CHAT_ALLOWED_IMAGE.includes(file.type);
  const isPdf = CHAT_ALLOWED_PDF.includes(file.type);

  if (!isImage && !isPdf) {
    return { ok: false, error: 'Only images (JPG, PNG, GIF, WEBP) or PDF files are allowed.' };
  }
  if (file.size > CHAT_MAX_FILE_SIZE) {
    return { ok: false, error: 'File is too large. Maximum size is 10MB.' };
  }
  return { ok: true, type: isImage ? 'image' : 'pdf' };
}

/* ---- Upload a validated file to Supabase Storage ----
   Returns { url, type, name } or throws an Error. */
async function uploadChatAttachment(file) {
  const check = validateChatFile(file);
  if (!check.ok) throw new Error(check.error);

  const client = initSupabase();
  if (!client) throw new Error('Connection not ready. Please refresh and try again.');

  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `chat/${timestamp}_${rand}_${safeName}`;

  const { error } = await client.storage
    .from(CHAT_ATTACHMENT_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) {
    if ((error.message || '').toLowerCase().includes('bucket') ||
        (error.message || '').toLowerCase().includes('not found')) {
      throw new Error('File storage is not set up yet. Please contact the administrator.');
    }
    throw new Error(error.message || 'Upload failed.');
  }

  const { data: urlData } = client.storage
    .from(CHAT_ATTACHMENT_BUCKET)
    .getPublicUrl(path);

  return { url: urlData.publicUrl, type: check.type, name: file.name };
}

/* ---- Build a download URL that forces "Save as" (cross-origin safe) ----
   Supabase public objects honour the ?download=<name> query param. */
function chatDownloadUrl(url, name) {
  if (!url) return '#';
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'download=' + encodeURIComponent(name || 'file');
}

/* ---- Escape text for safe insertion into HTML attributes ---- */
function chatEscapeAttr(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ---- Render the attachment block for a chat message ----
   Returns an HTML string (empty if the message has no attachment). */
function renderChatAttachment(msg) {
  if (!msg || !msg.attachment_url) return '';

  const url = String(msg.attachment_url);

  // Security: only allow real http(s) links (blocks javascript:, data:, etc.)
  if (!/^https?:\/\//i.test(url)) return '';

  const name = msg.attachment_name || 'attachment';
  const safeUrl = chatEscapeAttr(url);
  const safeName = chatEscapeAttr(name);
  const dl = chatEscapeAttr(chatDownloadUrl(url, name));

  if (msg.attachment_type === 'image') {
    return `
      <div class="chat-attachment">
        <a href="${safeUrl}" target="_blank" rel="noopener" class="chat-attachment-imglink">
          <img src="${safeUrl}" alt="${safeName}" class="chat-attachment-img" loading="lazy" />
        </a>
        <a href="${dl}" class="chat-download-btn" title="Download image">⬇ Download</a>
      </div>`;
  }

  // PDF (or any non-image)
  return `
    <div class="chat-attachment">
      <a href="${safeUrl}" target="_blank" rel="noopener" class="chat-attachment-file">
        <span class="chat-file-icon">📄</span>
        <span class="chat-file-name">${safeName}</span>
      </a>
      <a href="${dl}" class="chat-download-btn" title="Download PDF">⬇ Download</a>
    </div>`;
}
