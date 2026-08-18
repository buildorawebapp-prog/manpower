# Video Intro Feature — Blueprint (Go Hire Consultancy)

**Goal:** Let a user (candidate **and** employer) send a short **40‑second introduction video** from their chat. The video is **compressed in the browser** (ffmpeg.wasm) and must end up **≤ 20 MB**. In the **admin chat**, each video gets a **Download** button (file name carries the user's **email + tracking token**) and a **Delete** button that removes the video from Storage + the database so storage doesn't fill up.

Decisions locked with you: **(1)** real compression via ffmpeg, **(2)** button shown to both candidates and employers.

---

## 1. What we reuse (already in the repo)

- **`chat_messages`** table already has `attachment_url`, `attachment_type`, `attachment_name`. We add a new `attachment_type = 'video'` — **no new table, no new columns**.
- **Storage bucket `chat-attachments`** (public) already allows anon + admin to upload/read. We only need to **add a DELETE rule** (for the admin delete button).
- **`js/chat-attachments.js`** already centralizes validate + upload + render + download. All video logic goes here so both chats get it "for free".
- **User chat** = inline JS in `user-dashboard.html`. **Admin chat** = `admin/detail.js`. Both composers have a hidden `#chatFileInput` and a 📎 button — we add a **🎥 button** next to it.
- Admin page already loads `submissionData.email` and `submissionData.tracking_token` → we build the download name from these.

---

## 2. User experience (candidate + employer)

1. In chat, next to 📎, a new **🎥 Intro video** button.
2. Tapping it opens the phone's file picker / camera (`accept="video/*"`). User records on their phone or picks a clip.
3. The browser then:
   - **Checks duration ≤ 40s** (reads video metadata). Longer → friendly reject: *"Video must be 40 seconds or less."*
   - **Compresses** the video (progress bar: *"Compressing… 45%"*). Target: 720p, H.264 MP4, tuned so output is comfortably **under 20 MB**.
   - **Checks final size ≤ 20 MB**. If somehow still bigger, it compresses harder once (480p); if still bigger, rejects with guidance to record a shorter clip.
4. A small **preview** (a playable thumbnail + file size) shows in the composer, with an ✕ to remove.
5. **Send** uploads the compressed MP4 to `chat-attachments` and inserts the chat message (`attachment_type = 'video'`). The video appears in the chat bubble with inline `<video controls>`.

**Fallback (important for cheap/old phones):** if ffmpeg fails to load or errors out:
- If the **original** file is already **≤ 20 MB and ≤ 40s**, we upload it **as‑is** (no compression) so the user isn't blocked.
- Otherwise we show: *"We couldn't process this video on your device. Please record a shorter, lower‑quality clip (under 20 MB)."*

---

## 3. Admin experience

In the admin chat (`candidate-detail.html` / `employer-detail.html` via `detail.js`), every **video** message shows:

- Inline `<video controls>` player.
- **⬇ Download** button. The saved file name is:
  `intro_<email>_<token>.mp4` — e.g. `intro_rocky_gmail_com_ABC12345.mp4`
  (email sanitized to safe characters; token = the submission's `tracking_token`). This is how the admin knows *which user / which form* the video belongs to.
- **🗑 Delete** button (on the side). On click → confirm → the video file is removed from Storage **and** the message's attachment fields are cleared in the database, so storage stays clean. The bubble then shows *"🎥 Video deleted"* (text of the message, if any, is kept).

Admin can optionally also send a video (same pipeline) — but the required pieces are **download + delete**.

---

## 4. Technical design

### 4a. SQL / Storage migration — `supabase/video_intro_migration.sql`
- **No table changes** (reuse attachment columns).
- Add a Storage **DELETE** policy so the admin (role `authenticated`) can remove chat files:
  ```sql
  DROP POLICY IF EXISTS "admin delete chat attachments" ON storage.objects;
  CREATE POLICY "admin delete chat attachments"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'chat-attachments');
  ```
- (Optional safety) set a 20 MB size limit + video mime types on the bucket. Not required; our client-side checks already enforce it.

### 4b. `js/chat-attachments.js` (shared) — additions
- Constants: `CHAT_MAX_VIDEO_SIZE = 20MB`, `CHAT_MAX_VIDEO_DURATION = 40` (+1s tolerance), allowed input `video/*`, hard input cap (~150 MB) to avoid memory blow‑ups.
- `getVideoDuration(file)` → reads metadata via a temporary `<video>`.
- `compressVideoIfNeeded(file, onProgress)` → lazy‑loads ffmpeg, transcodes to MP4 (`scale=-2:720`, `libx264 -crf 28 -preset veryfast`, `aac 96k`, `+faststart`), returns a `File`. Handles the 480p re‑try + fallback described above.
- Extend `validateChatFile` / add `validateChatVideo` so `video` is an allowed type (≤ 20 MB **after** compression).
- Extend `uploadChatAttachment` to accept the video type.
- Extend `renderChatAttachment(msg, opts)` — new `video` branch renders `<video controls>`. Optional `opts = { downloadName, showDelete, msgId }` so admin can pass the `intro_email_token.mp4` name and show the 🗑 button. (Backward compatible — user side calls it the same as today.)
- `chatStoragePathFromUrl(url)` → derives the in‑bucket path from a public URL (needed for delete).

### 4c. ffmpeg.wasm loading (lazy, safe on static Vercel)
- Loaded **only when a user actually adds a video** (kept out of normal page load).
- **Single‑threaded core** (`@ffmpeg/core`) from a CDN via blob URLs. The ST core does **not** need `SharedArrayBuffer`, so **no COOP/COEP headers and no `vercel.json` change** are required (multi‑thread would need them). Trade‑off: slower, which is fine for one 40s clip.
- Emits progress → drives the composer progress bar.

### 4d. User dashboard (`user-dashboard.html`)
- Add 🎥 button + a second hidden input `#chatVideoInput` (`accept="video/*"`).
- New handlers `handleChatVideoSelect()` + a video preview; reuse the existing `chatSelectedFile` → `sendMessage()` path (which already inserts attachment fields and reloads).

### 4e. Admin (`admin/detail.js`, `candidate-detail.html`, `employer-detail.html`)
- Add 🎥 button + `#chatVideoInput` to both detail pages' composers.
- In `displayChatMessages`, for `attachment_type === 'video'` pass `opts` with `downloadName = intro_<sanitizedEmail>_<token>.mp4`, `showDelete = true`, `msgId`.
- Add `deleteChatVideo(msgId, url)` → confirm → `storage.remove([path])` → `update chat_messages set attachment_* = null where id = msgId` → reload.

### 4f. CSS
- Small additions (in the page `<style>` blocks that already hold chat CSS) for the video player size, the 🎥 button, the compressing/progress bar, and the 🗑 delete button.

### 4g. Cache‑busting
- Bump `js/chat-attachments.js?v=N` (and any touched JS) on `user-dashboard.html`, `candidate-detail.html`, `employer-detail.html` so browsers fetch the new code.

---

## 5. Files touched

- **New:** `supabase/video_intro_migration.sql`
- **Edit:** `js/chat-attachments.js` (video validate/compress/render/delete + ffmpeg loader)
- **Edit:** `user-dashboard.html` (🎥 button, video input, handlers, CSS, cache bump)
- **Edit:** `admin/detail.js` (video render opts, download name, delete)
- **Edit:** `admin/candidate-detail.html` + `admin/employer-detail.html` (🎥 button, video input, CSS, cache bump)

---

## 6. Deploy steps (after you approve + I code)

1. **Supabase → SQL Editor:** run `supabase/video_intro_migration.sql` (adds the delete policy).
2. **git add/commit/push** → Vercel auto‑deploys.
3. **Hard‑refresh** (Ctrl/Cmd+Shift+R).
4. **Test:** send a 40s video as a user → confirm it compresses, uploads, and plays. As admin: download (check the `intro_email_token.mp4` name) and delete (confirm it disappears from Storage).

---

## 7. Risks / trade‑offs (so there are no surprises)

- **ffmpeg is heavy (~30 MB) and CPU‑intensive.** First video on a session downloads the engine; compression of a 40s clip can take a while on budget phones and could fail — the **fallback** (upload as‑is if ≤ 20 MB, else ask to re‑record) keeps users unblocked.
- **iOS Safari** works but has tighter memory; 720p/40s is within range, very old iPhones are the risk (fallback covers them).
- **Public bucket:** video URLs are public but long/unguessable (same model as current image/PDF attachments). Delete removes them permanently.

---

## 8. Defaults I chose (tell me to change any)

- Compressed output: **720p H.264 MP4**, ~ under 20 MB (re‑try at 480p if needed).
- Download name: `intro_<email>_<token>.mp4`.
- Delete keeps the text message (if any) and just removes the video.
- Video button shown in **both** candidate and employer chats (as you chose).
