/* ==========================================================================
   Go Hire Consultancy — Shared Chat Attachment Helpers
   Used by both the user dashboard and the admin chat.
   Handles: validation, upload to Supabase Storage, safe HTML rendering,
   and forced downloads.
   ========================================================================== */

const CHAT_ATTACHMENT_BUCKET = 'chat-attachments';
const CHAT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB (images / PDF)
const CHAT_ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const CHAT_ALLOWED_PDF = ['application/pdf'];

/* ---- Intro-video limits ---- */
const CHAT_MAX_VIDEO_SIZE = 20 * 1024 * 1024;    // 20 MB — final uploaded size cap
const CHAT_MAX_VIDEO_DURATION = 40;              // seconds (a 1s tolerance is added)
const CHAT_MAX_VIDEO_INPUT = 300 * 1024 * 1024;  // reject absurd inputs before we even try (memory safety)

/* Small helper: bytes → "12.3MB" */
function chatFmtMB(bytes) {
  return (Number(bytes || 0) / (1024 * 1024)).toFixed(1) + 'MB';
}

/* ---- Validate a file chosen for the chat ---- */
function validateChatFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };

  const isImage = CHAT_ALLOWED_IMAGE.includes(file.type);
  const isPdf = CHAT_ALLOWED_PDF.includes(file.type);
  const isVideo = typeof file.type === 'string' && file.type.indexOf('video/') === 0;

  // Video: allowed up to 20MB (the compressor should have brought it under this).
  if (isVideo) {
    if (file.size > CHAT_MAX_VIDEO_SIZE) {
      return { ok: false, error: 'Video is too large. Maximum size is 20MB.' };
    }
    return { ok: true, type: 'video' };
  }

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

/* ---- Upload with LIVE progress (XMLHttpRequest) ----
   Same result shape as uploadChatAttachment ({url,type,name}) but reports the
   real upload percentage via onProgress({ percent, loaded, total }).

   Why XHR: the supabase-js storage upload uses fetch(), which cannot report
   upload progress. We POST straight to the Storage REST endpoint instead —
   XHR's upload.onprogress gives us the bytes-sent percentage.

   Auth: uses the logged-in Supabase session token when there is one (admin
   pages), otherwise the public anon key (user pages use custom auth, so there
   is no Supabase session — anon is correct and matches the existing policy).

   Safety: if the direct REST path isn't available for any reason, it silently
   falls back to the plain fetch-based uploadChatAttachment (no progress). */
function uploadChatAttachmentWithProgress(file, onProgress, controls) {
  return new Promise((resolve, reject) => {
    const check = validateChatFile(file);
    if (!check.ok) { reject(new Error(check.error)); return; }

    // Cancellation: the caller passes an empty `controls` object; we attach an
    // abort() to it that the Stop button can call.
    let aborted = false;
    let activeXhr = null;
    if (controls) {
      controls.abort = function () {
        aborted = true;
        if (activeXhr) { try { activeXhr.abort(); } catch (_) {} }
      };
    }

    const client = initSupabase();
    if (!client) { reject(new Error('Connection not ready. Please refresh and try again.')); return; }

    const baseUrl = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) ? String(SUPABASE_URL) : '';
    const anonKey = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ? String(SUPABASE_ANON_KEY) : '';

    // Graceful fallback: no config or no XHR → use the plain uploader.
    // (The plain fetch upload can't be aborted mid-flight; if the user already
    // hit Stop we just reject so the message isn't sent.)
    const fallback = () => {
      uploadChatAttachment(file).then((r) => {
        if (aborted) { reject(new Error('__CANCELLED__')); return; }
        if (onProgress) { try { onProgress({ percent: 100 }); } catch (_) {} }
        resolve(r);
      }).catch(reject);
    };
    if (!baseUrl || !anonKey || typeof XMLHttpRequest === 'undefined') { fallback(); return; }

    const timestamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = 'chat/' + timestamp + '_' + rand + '_' + safeName;
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const endpoint = baseUrl.replace(/\/+$/, '') +
      '/storage/v1/object/' + CHAT_ATTACHMENT_BUCKET + '/' + encodedPath;

    Promise.resolve()
      .then(() => client.auth.getSession())
      .catch(() => ({ data: { session: null } }))
      .then((res) => {
        if (aborted) { reject(new Error('__CANCELLED__')); return; }
        const session = (res && res.data) ? res.data.session : null;
        const token = (session && session.access_token) ? session.access_token : anonKey;

        const xhr = new XMLHttpRequest();
        activeXhr = xhr;
        xhr.open('POST', endpoint, true);
        xhr.setRequestHeader('apikey', anonKey);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.setRequestHeader('cache-control', 'max-age=3600');
        // Let the browser set Content-Type from the Blob when file.type is empty.
        if (file.type) xhr.setRequestHeader('Content-Type', file.type);

        if (xhr.upload) {
          xhr.upload.onprogress = (e) => {
            if (!onProgress || !e.lengthComputable) return;
            const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
            try { onProgress({ percent: pct, loaded: e.loaded, total: e.total }); } catch (_) {}
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            if (onProgress) { try { onProgress({ percent: 100 }); } catch (_) {} }
            let publicUrl = '';
            try {
              const { data: urlData } = client.storage.from(CHAT_ATTACHMENT_BUCKET).getPublicUrl(path);
              publicUrl = urlData.publicUrl;
            } catch (_) {
              publicUrl = baseUrl.replace(/\/+$/, '') +
                '/storage/v1/object/public/' + CHAT_ATTACHMENT_BUCKET + '/' + encodedPath;
            }
            resolve({ url: publicUrl, type: check.type, name: file.name });
          } else {
            let msg = 'Upload failed.';
            try {
              const j = JSON.parse(xhr.responseText || '{}');
              msg = j.message || j.error || msg;
            } catch (_) {}
            const low = String(msg).toLowerCase();
            if (low.indexOf('bucket') !== -1 || low.indexOf('not found') !== -1) {
              msg = 'File storage is not set up yet. Please contact the administrator.';
            }
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload. Please check your connection and try again.'));
        xhr.onabort = () => reject(new Error('__CANCELLED__'));

        try {
          xhr.send(file);
        } catch (_) {
          fallback();
        }
      })
      .catch(reject);
  });
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

/* ---- Escape text for safe insertion inside a single-quoted JS string
   (used for inline onclick="fn('...')" handlers) ---- */
function chatEscapeJs(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '\\u003C')
    .replace(/\r?\n/g, ' ');
}

/* ---- Render the attachment block for a chat message ----
   Returns an HTML string (empty if the message has no attachment).
   opts (optional, used by the admin chat):
     { downloadName, showDelete, msgId }  — sets the saved filename and shows
     a 🗑 Delete button (which calls the page's deleteChatVideo(msgId, url)). */
function renderChatAttachment(msg, opts) {
  if (!msg || !msg.attachment_url) return '';

  const url = String(msg.attachment_url);

  // Security: only allow real http(s) links (blocks javascript:, data:, etc.)
  if (!/^https?:\/\//i.test(url)) return '';

  const o = opts || {};
  const name = msg.attachment_name || 'attachment';
  const safeUrl = chatEscapeAttr(url);
  const safeName = chatEscapeAttr(name);
  const dl = chatEscapeAttr(chatDownloadUrl(url, name));

  // ---- Video (intro clip) ----
  if (msg.attachment_type === 'video') {
    const dlName = o.downloadName || name;
    const dlVideo = chatEscapeAttr(chatDownloadUrl(url, dlName));
    const deleteBtn = o.showDelete
      ? `<button type="button" class="chat-delete-btn"
             onclick="deleteChatVideo('${chatEscapeJs(o.msgId)}','${chatEscapeJs(url)}')"
             title="Delete this video from storage">🗑 Delete</button>`
      : '';
    return `
      <div class="chat-attachment chat-attachment-video">
        <video class="chat-video" controls preload="metadata" playsinline src="${safeUrl}"></video>
        <div class="chat-video-actions">
          <a href="${dlVideo}" class="chat-download-btn" title="Download video">⬇ Download</a>
          ${deleteBtn}
        </div>
      </div>`;
  }

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

/* ==========================================================================
   INTRO VIDEO — duration check, ffmpeg.wasm compression, storage delete
   ========================================================================== */

/* ---- Read a video's duration (seconds) from its metadata, without ffmpeg ----
   Resolves NaN if the browser can't read it (we then skip the duration check). */
function getVideoDuration(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      let done = false;
      const finish = (val) => {
        if (done) return; done = true;
        try { URL.revokeObjectURL(url); } catch (_) {}
        resolve(val);
      };
      v.onloadedmetadata = () => finish(Number(v.duration));
      v.onerror = () => finish(NaN);
      // Safety timeout — never hang the UI.
      setTimeout(() => finish(NaN), 8000);
      v.src = url;
    } catch (_) {
      resolve(NaN);
    }
  });
}

/* ---- ffmpeg.wasm lazy loader (single-thread core; no COOP/COEP needed) ----
   Loaded only when a user actually adds a video. If anything here fails, the
   caller falls back to uploading a small-enough clip as-is. */
let _ffmpeg = null;
let _ffmpegLoading = null;
let _ffmpegFetchFile = null;

/* ---- Cancellation ----
   Set true when the user hits "Stop". compressVideoIfNeeded checks it at each
   step and throws the sentinel '__CANCELLED__' (which callers treat as a quiet
   cancel, not an error). cancelVideoWork() also terminates the ffmpeg worker so
   an in-progress compression stops immediately. */
let _videoCancelled = false;

function resetVideoCancel() { _videoCancelled = false; }
function isVideoCancelled() { return _videoCancelled; }

function cancelVideoWork() {
  _videoCancelled = true;
  const ff = _ffmpeg;
  _ffmpeg = null;         // force a clean reload next time
  _ffmpegLoading = null;
  try { if (ff && typeof ff.terminate === 'function') ff.terminate(); } catch (_) {}
}

// Pinned versions. NOTE: 0.12.6's UMD worker chunk is "814.ffmpeg.js" — if you
// bump @ffmpeg/ffmpeg, confirm the chunk filename in dist/umd or compression
// will fall back to upload-as-is.
const FFMPEG_JS   = 'https://cdn.jsdelivr.net/npm/@ffmpeg/[email protected]/dist/umd/ffmpeg.js';
const FFMPEG_WORK = 'https://cdn.jsdelivr.net/npm/@ffmpeg/[email protected]/dist/umd/814.ffmpeg.js';
const FFMPEG_UTIL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/[email protected]/dist/umd/index.js';
const FFMPEG_CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/[email protected]/dist/umd/ffmpeg-core.js';
const FFMPEG_WASM = 'https://cdn.jsdelivr.net/npm/@ffmpeg/[email protected]/dist/umd/ffmpeg-core.wasm';

function _injectScript(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.prototype.slice.call(document.scripts)
      .some((s) => s.src === src);
    if (existing) { resolve(); return; }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Could not load video engine script.'));
    document.head.appendChild(el);
  });
}

async function loadFfmpeg(onProgress) {
  if (_ffmpeg) return _ffmpeg;
  if (_ffmpegLoading) return _ffmpegLoading;

  _ffmpegLoading = (async () => {
    if (onProgress) onProgress({ phase: 'loading', percent: 0, note: 'Preparing video tools…' });
    await _injectScript(FFMPEG_UTIL);
    await _injectScript(FFMPEG_JS);
    if (!window.FFmpegWASM || !window.FFmpegUtil) {
      throw new Error('Video engine unavailable.');
    }
    const FFmpeg = window.FFmpegWASM.FFmpeg;
    const toBlobURL = window.FFmpegUtil.toBlobURL;
    _ffmpegFetchFile = window.FFmpegUtil.fetchFile;

    const ff = new FFmpeg();
    await ff.load({
      classWorkerURL: await toBlobURL(FFMPEG_WORK, 'text/javascript'),
      coreURL: await toBlobURL(FFMPEG_CORE, 'text/javascript'),
      wasmURL: await toBlobURL(FFMPEG_WASM, 'application/wasm'),
    });
    _ffmpeg = ff;
    return ff;
  })();

  try {
    return await _ffmpegLoading;
  } catch (e) {
    _ffmpegLoading = null; // allow a later retry
    throw e;
  }
}

/* pick a sensible input extension so ffmpeg can demux */
function _videoExt(file) {
  const n = (file && file.name) ? file.name : '';
  const m = n.match(/\.([a-z0-9]{2,5})$/i);
  if (m) return '.' + m[1].toLowerCase();
  const t = (file && file.type) || '';
  if (t.indexOf('quicktime') !== -1) return '.mov';
  if (t.indexOf('webm') !== -1) return '.webm';
  if (t.indexOf('3gpp') !== -1) return '.3gp';
  if (t.indexOf('x-matroska') !== -1) return '.mkv';
  return '.mp4';
}

/* ---- One compression pass to a given target height (720 or 480) ---- */
async function _ffmpegCompress(file, targetHeight, onProgress) {
  const ff = _ffmpeg;
  const inName = 'in' + _videoExt(file);
  const outName = 'out.mp4';

  const onProg = (p) => {
    if (!onProgress) return;
    const pct = Math.max(0, Math.min(100, Math.round((p && p.progress ? p.progress : 0) * 100)));
    onProgress({ phase: 'compress', percent: pct });
  };
  ff.on('progress', onProg);

  try {
    await ff.writeFile(inName, await _ffmpegFetchFile(file));
    await ff.exec([
      '-i', inName,
      '-vf', 'scale=-2:' + targetHeight,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      '-y', outName,
    ]);
    const data = await ff.readFile(outName);
    const blob = new Blob([data], { type: 'video/mp4' });
    return new File([blob], 'intro-video.mp4', { type: 'video/mp4' });
  } finally {
    try { if (ff.off) ff.off('progress', onProg); } catch (_) {}
    try { await ff.deleteFile(inName); } catch (_) {}
    try { await ff.deleteFile(outName); } catch (_) {}
  }
}

/* ---- Public: check + compress a chosen intro video ----
   Returns { file, compressed, originalSize } or throws a user-friendly Error.
   onProgress({ phase:'loading'|'compress', percent, note }) drives the UI. */
async function compressVideoIfNeeded(file, onProgress) {
  if (!file) throw new Error('No video selected.');
  if (typeof file.type === 'string' && file.type.indexOf('video/') !== 0) {
    throw new Error('Please choose a video file.');
  }

  resetVideoCancel(); // fresh start — clear any prior "Stop"

  // 1) Duration guard (cheap, before loading the heavy engine).
  let duration = NaN;
  try { duration = await getVideoDuration(file); } catch (_) {}
  if (!isNaN(duration) && duration > CHAT_MAX_VIDEO_DURATION + 1) {
    throw new Error('Your intro video is ' + Math.round(duration) +
      ' seconds. Please keep it to ' + CHAT_MAX_VIDEO_DURATION + ' seconds or less.');
  }

  // 2) Absurdly large input → don't risk crashing the tab.
  if (file.size > CHAT_MAX_VIDEO_INPUT) {
    throw new Error('This video file is very large (' + chatFmtMB(file.size) +
      '). Please record a shorter clip.');
  }

  // 3) Try real compression (720p, then a harder 480p pass if still >20MB).
  let compressed = null;
  try {
    await loadFfmpeg(onProgress);
    if (_videoCancelled) throw new Error('__CANCELLED__');
    compressed = await _ffmpegCompress(file, 720, onProgress);
    if (_videoCancelled) throw new Error('__CANCELLED__');
    if (compressed.size > CHAT_MAX_VIDEO_SIZE) {
      if (onProgress) onProgress({ phase: 'compress', percent: 0, note: 'Optimising further…' });
      const smaller = await _ffmpegCompress(file, 480, onProgress);
      if (_videoCancelled) throw new Error('__CANCELLED__');
      if (smaller.size < compressed.size) compressed = smaller;
    }
  } catch (err) {
    // If the user hit Stop, surface it as a clean cancel — do NOT fall back to
    // uploading the original.
    if (_videoCancelled || (err && err.message === '__CANCELLED__')) {
      throw new Error('__CANCELLED__');
    }
    console.warn('[intro-video] compression unavailable, trying fallback:', err && err.message);
    compressed = null;
  }

  if (_videoCancelled) throw new Error('__CANCELLED__');

  // 4) Decide what to upload.
  if (compressed && compressed.size <= CHAT_MAX_VIDEO_SIZE) {
    return { file: compressed, compressed: true, originalSize: file.size };
  }
  // Fallback: original is already small enough → send as-is (keeps cheap phones working).
  if (file.size <= CHAT_MAX_VIDEO_SIZE) {
    return { file: file, compressed: false, originalSize: file.size };
  }
  // Compressed but still too big.
  if (compressed && compressed.size > CHAT_MAX_VIDEO_SIZE) {
    throw new Error('Even after compression the video is ' + chatFmtMB(compressed.size) +
      ' (limit is 20MB). Please record a shorter clip.');
  }
  // Compression failed AND the original is over 20MB.
  throw new Error('We could not process this video on your device. ' +
    'Please record a shorter, lower-quality clip (under 20MB).');
}

/* ---- Derive the in-bucket storage path from a public URL (for deletes) ---- */
function chatStoragePathFromUrl(url) {
  if (!url) return null;
  const marker = '/object/public/' + CHAT_ATTACHMENT_BUCKET + '/';
  const i = String(url).indexOf(marker);
  if (i === -1) return null;
  let p = String(url).slice(i + marker.length);
  const q = p.indexOf('?');
  if (q !== -1) p = p.slice(0, q);
  try { return decodeURIComponent(p); } catch (_) { return p; }
}

/* ---- Delete a chat attachment file from Storage (admin only) ----
   Removes ONLY the storage object. The caller is responsible for clearing the
   attachment columns on the chat_messages row. */
async function deleteChatAttachment(url) {
  const path = chatStoragePathFromUrl(url);
  if (!path) throw new Error('Could not determine the file location.');
  const client = initSupabase();
  if (!client) throw new Error('Connection not ready. Please refresh and try again.');
  const { error } = await client.storage.from(CHAT_ATTACHMENT_BUCKET).remove([path]);
  if (error) throw new Error(error.message || 'Could not delete the file.');
  return { ok: true };
}
