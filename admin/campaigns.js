/* ==========================================================================
   Go Hire Consultancy — Admin › Campaigns
   Create / edit / activate / close hiring campaigns.

   Depends on admin.js for: client, ADMIN_TRADES, ADMIN_LOCATIONS, CANDIDATES,
   showView(), navLinkFor(), renderCandidates(), CAND_CAMPAIGN_FILTER, escAttr().

   Seat model (see CAMPAIGNS_BLUEPRINT.md §1):
     display_total  → the big "openings" number shown to the public (for show)
     seats_total    → the REAL number of people we want (e.g. 10)
     seats_filled   → maintained by a DB trigger; +1 on every paid application
     available      = seats_total - seats_filled     (this is what counts down)
   The public card shows "display_total openings · available seats left", so
   both numbers read coherently. Admin sees the truth: filled / seats_total.
   ========================================================================== */

const CAMPAIGN_BUCKET = "campaign-images";
const CAMPAIGN_STATUSES = ["draft", "active", "closed"];   // "filled" is set by the DB trigger
const CAMPAIGN_IMG_MAX = 5 * 1024 * 1024;                  // 5 MB

let ADMIN_CAMPAIGNS = [];
let CAMP_FILTER_STATUS = "";     // "" = all
let CAMP_FILTER_TEXT = "";
let CAMP_EDIT_ID = null;         // null = creating a new campaign
let CAMP_IMAGE_URL = null;       // image currently attached in the open modal
let CAMP_SAVING = false;

/* ---------------------------------------------------------------- helpers */
function cEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function cNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
/* Real seat maths — admin view, no display inflation. */
function campSeatInfo(c) {
  const total = Math.max(1, cNum(c.seats_total, 1));
  const filled = Math.max(0, cNum(c.seats_filled, 0));
  const available = Math.max(0, total - filled);
  const pct = Math.min(100, Math.round((filled / total) * 100));
  const level = available <= 0 ? "none" : (available <= Math.max(1, Math.ceil(total * 0.3)) ? "low" : "");
  return { total, filled, available, pct, level };
}
/* How many people actually applied through this campaign, from the candidate
   rows we already have in memory. `paid` should match seats_filled — if it
   doesn't, the card shows a "Recount" nudge. */
function campApplicants(id) {
  const rows = (typeof CANDIDATES !== "undefined" ? CANDIDATES : []).filter(c => c.campaign_id === id);
  return { total: rows.length, paid: rows.filter(c => c.payment_status === "success").length };
}
function campTradeIcon(name) {
  const want = String(name || "").trim().toLowerCase();
  const tr = (typeof ADMIN_TRADES !== "undefined" ? ADMIN_TRADES : [])
    .find(t => String(t.name || "").trim().toLowerCase() === want);
  return (tr && tr.icon) || "📣";
}
function campNote(msg, ok) {
  const n = document.getElementById("campNote");
  if (!n) return;
  n.textContent = msg;
  n.style.color = ok ? "var(--green)" : "#e5484d";
  n.classList.remove("hide");
  setTimeout(() => n.classList.add("hide"), 3000);
}
function campDeadlineLabel(c) {
  if (!c.deadline) return "";
  // IST, to match create_payment_order() and the public cards.
  let todayStr;
  try { todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }
  catch (_) { todayStr = new Date().toISOString().slice(0, 10); }
  const today = new Date(todayStr + "T00:00:00");
  const d = new Date(String(c.deadline).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return "⏳ expired " + c.deadline;
  if (days === 0) return "⏳ last day today";
  if (days === 1) return "⏳ 1 day left";
  return "⏳ " + days + " days left";
}

/* ------------------------------------------------------------------ load */
async function loadCampaignsAdmin() {
  const { data, error } = await client
    .from("campaigns")
    .select("*")
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Campaigns load failed:", error.message);
    ADMIN_CAMPAIGNS = [];
    const grid = document.getElementById("campCards");
    if (grid) {
      grid.innerHTML = `<div class="cadm-empty">Could not load campaigns.<br />
        <span style="font-weight:600;font-size:13px">Run <code>supabase/campaigns_migration.sql</code> in the Supabase SQL editor, then reload this page.</span></div>`;
    }
    const cnt = document.getElementById("campCount");
    if (cnt) cnt.textContent = "0";
    return;
  }
  ADMIN_CAMPAIGNS = data || [];
  renderCampaignsAdmin();
}

/* ---------------------------------------------------------------- render */
function onCampFilter() {
  const s = document.getElementById("campStatusFilter");
  const q = document.getElementById("campSearch");
  CAMP_FILTER_STATUS = s ? s.value : "";
  CAMP_FILTER_TEXT = q ? q.value.trim().toLowerCase() : "";
  renderCampaignsAdmin();
}

function renderCampaignsAdmin() {
  const grid = document.getElementById("campCards");
  const cnt = document.getElementById("campCount");
  if (!grid) return;
  if (cnt) cnt.textContent = ADMIN_CAMPAIGNS.length;

  const list = ADMIN_CAMPAIGNS.filter(c => {
    if (CAMP_FILTER_STATUS && c.status !== CAMP_FILTER_STATUS) return false;
    if (!CAMP_FILTER_TEXT) return true;
    return [c.title, c.trade, c.location, c.salary_text]
      .join(" ").toLowerCase().includes(CAMP_FILTER_TEXT);
  });

  if (!list.length) {
    grid.innerHTML = ADMIN_CAMPAIGNS.length
      ? `<div class="cadm-empty">No campaign matches this filter.</div>`
      : `<div class="cadm-empty">No campaigns yet.<br />
         <span style="font-weight:600;font-size:13px">Click “＋ New Campaign” to post your first hiring drive.</span></div>`;
    return;
  }

  grid.innerHTML = list.map(c => {
    const s = campSeatInfo(c);
    const app = campApplicants(c.id);
    const mismatch = app.paid !== s.filled;
    const thumbStyle = c.image_url ? ` style="background-image:url('${cEsc(c.image_url)}')"` : "";
    const thumbInner = c.image_url ? "" : `<span class="cadm-ic">${cEsc(campTradeIcon(c.trade))}</span>`;
    const deadline = campDeadlineLabel(c);

    return `<div class="cadm-card${c.status === "draft" ? " is-draft" : ""}">
      <div class="cadm-thumb"${thumbStyle}>
        ${thumbInner}
        <span class="cadm-status badge badge-${cEsc(c.status)}">${cEsc(c.status)}</span>
        ${c.is_featured ? `<span class="cadm-feat" title="Featured">⭐</span>` : ""}
      </div>
      <div class="cadm-body">
        <h4>${cEsc(c.title)}</h4>
        <p class="cadm-sub">${cEsc(campTradeIcon(c.trade))} ${cEsc(c.trade)}${c.location ? " · 📍 " + cEsc(c.location) : ""}</p>
        <div class="cadm-nums">
          <div class="cadm-num"><b>${s.available}</b><span>seats left</span></div>
          <div class="cadm-num"><b>${s.filled}/${s.total}</b><span>filled</span></div>
          <div class="cadm-num"><b>${cNum(c.display_total, s.total)}</b><span>shown</span></div>
        </div>
        <div class="cadm-prog"><i class="${s.level}" style="width:${s.pct}%"></i></div>
        <div class="cadm-meta">
          <span>👥 ${app.total} applied${app.total ? " · " + app.paid + " paid" : ""}</span>
          ${deadline ? `<span>${cEsc(deadline)}</span>` : ""}
          ${c.salary_text ? `<span>💰 ${cEsc(c.salary_text)}</span>` : ""}
          ${mismatch ? `<span style="color:#b26a00">⚠️ counter says ${s.filled} — recount</span>` : ""}
        </div>
      </div>
      <div class="cadm-acts">
        <button class="mini-btn" onclick="openCampaignModal('${c.id}')">✏️ Edit</button>
        <button class="mini-btn" onclick="bumpCampaignSeats('${c.id}', 1)" title="Add one real seat">＋ Seat</button>
        <button class="mini-btn" onclick="bumpCampaignSeats('${c.id}', -1)" title="Remove one real seat">－ Seat</button>
        ${c.status === "active"
          ? `<button class="mini-btn" onclick="setCampaignStatus('${c.id}','closed')">⏸ Close</button>`
          : `<button class="mini-btn" onclick="setCampaignStatus('${c.id}','active')">▶️ Activate</button>`}
        <button class="mini-btn" onclick="recountCampaignSeats('${c.id}')" title="Recompute filled seats from paid applications">🔄 Recount</button>
        <button class="mini-btn" onclick="showCampaignApplicants('${c.id}')">👥 Applicants</button>
        <button class="mini-btn cadm-del" onclick="deleteCampaign('${c.id}')">🗑 Delete</button>
      </div>
    </div>`;
  }).join("");
}

/* --------------------------------------------------------- modal (CRUD) */
function campaignModalEl() { return document.getElementById("campModal"); }

function openCampaignModal(id) {
  const c = id ? ADMIN_CAMPAIGNS.find(x => x.id === id) : null;
  CAMP_EDIT_ID = c ? c.id : null;
  CAMP_IMAGE_URL = c ? (c.image_url || null) : null;

  document.getElementById("campModalTitle").textContent = c ? "Edit Campaign" : "New Campaign";
  document.getElementById("campSaveBtn").textContent = c ? "Save Changes" : "Create Campaign";

  // Trade dropdown from the live trades list. If the campaign's trade was
  // renamed/removed we keep it as an extra option so saving can't silently
  // change it.
  const trades = (typeof ADMIN_TRADES !== "undefined" ? ADMIN_TRADES : []).map(t => t.name);
  if (c && c.trade && !trades.some(n => n.toLowerCase() === String(c.trade).toLowerCase())) {
    trades.unshift(c.trade);
  }
  document.getElementById("cmTrade").innerHTML =
    `<option value="">Select trade…</option>` +
    trades.map(n => `<option value="${cEsc(n)}"${c && c.trade === n ? " selected" : ""}>${cEsc(n)}</option>`).join("");

  // Location suggestions
  document.getElementById("cmLocList").innerHTML =
    (typeof ADMIN_LOCATIONS !== "undefined" ? ADMIN_LOCATIONS : [])
      .map(l => `<option value="${cEsc(l.name)}"></option>`).join("");

  // Status dropdown — "filled" is trigger-managed, only shown if already set.
  const statuses = c && c.status === "filled" ? ["filled", ...CAMPAIGN_STATUSES] : CAMPAIGN_STATUSES;
  document.getElementById("cmStatus").innerHTML = statuses.map(s => {
    const sel = c ? c.status === s : s === "draft";
    return `<option value="${s}"${sel ? " selected" : ""}>${s}</option>`;
  }).join("");

  document.getElementById("cmTitle").value = c ? (c.title || "") : "";
  document.getElementById("cmLocation").value = c ? (c.location || "") : "";
  document.getElementById("cmSeats").value = c ? cNum(c.seats_total, 10) : 10;
  document.getElementById("cmDisplay").value = c ? cNum(c.display_total, 50) : 50;
  document.getElementById("cmSalary").value = c ? (c.salary_text || "") : "";
  document.getElementById("cmExp").value = c ? (c.experience_required || "") : "";
  document.getElementById("cmDeadline").value = c ? (c.deadline || "") : "";
  document.getElementById("cmSort").value = c ? cNum(c.sort_order, 0) : 0;
  document.getElementById("cmFeatured").checked = !!(c && c.is_featured);
  document.getElementById("cmDesc").value = c ? (c.description || "") : "";
  document.getElementById("cmFile").value = "";

  const filledNote = document.getElementById("cmFilledNote");
  if (filledNote) {
    filledNote.textContent = c
      ? `${cNum(c.seats_filled, 0)} of these seats are already taken by paid applications.`
      : "";
    filledNote.classList.toggle("hide", !c);
  }

  renderCampImagePreview();
  campModalError("");
  campaignModalEl().classList.add("open");
  document.body.style.overflow = "hidden";
  setTimeout(() => document.getElementById("cmTitle").focus(), 60);
}

function closeCampaignModal() {
  if (CAMP_SAVING) return;
  campaignModalEl().classList.remove("open");
  document.body.style.overflow = "";
  CAMP_EDIT_ID = null;
  CAMP_IMAGE_URL = null;
}

function campModalError(msg) {
  const el = document.getElementById("cmError");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("hide", !msg);
}

function renderCampImagePreview() {
  const img = document.getElementById("cmPreview");
  const rm = document.getElementById("cmRemoveImg");
  if (!img) return;
  if (CAMP_IMAGE_URL) {
    img.src = CAMP_IMAGE_URL;
    img.classList.remove("hide");
    if (rm) rm.classList.remove("hide");
  } else {
    img.removeAttribute("src");
    img.classList.add("hide");
    if (rm) rm.classList.add("hide");
  }
}

/* Local preview straight away; the real upload happens on save so a cancelled
   modal never leaves an orphan file in the bucket. */
function previewCampaignFile(input) {
  const file = input.files && input.files[0];
  const img = document.getElementById("cmPreview");
  if (!file) { renderCampImagePreview(); return; }
  if (!/^image\//.test(file.type)) {
    campModalError("Banner must be an image file (JPG / PNG / WebP).");
    input.value = ""; return;
  }
  if (file.size > CAMPAIGN_IMG_MAX) {
    campModalError("Banner is too large (" + (file.size / 1048576).toFixed(1) + " MB). Max 5 MB.");
    input.value = ""; return;
  }
  campModalError("");
  img.src = URL.createObjectURL(file);
  img.classList.remove("hide");
  const rm = document.getElementById("cmRemoveImg");
  if (rm) rm.classList.remove("hide");
}

function removeCampaignImage() {
  CAMP_IMAGE_URL = null;
  document.getElementById("cmFile").value = "";
  renderCampImagePreview();
}

async function uploadCampaignImage(file) {
  const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const path = `${Date.now()}-${safe}`;
  const { error } = await client.storage.from(CAMPAIGN_BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false,
  });
  if (error) { console.error("Campaign image upload failed:", error); return null; }
  const { data } = client.storage.from(CAMPAIGN_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function saveCampaign() {
  if (CAMP_SAVING) return;

  const title = document.getElementById("cmTitle").value.trim();
  const trade = document.getElementById("cmTrade").value;
  const seats = Math.floor(cNum(document.getElementById("cmSeats").value, NaN));
  const display = Math.floor(cNum(document.getElementById("cmDisplay").value, NaN));
  const deadline = document.getElementById("cmDeadline").value || null;

  // --- validation (mirrors the DB constraints so the user gets a clean message)
  if (!title) { campModalError("Give the campaign a title, e.g. “Urgent: 10 Fitters for Dubai site”."); return; }
  if (!trade) { campModalError("Pick the trade this campaign hires for — it gets locked on the apply form."); return; }
  if (!Number.isFinite(seats) || seats < 1) { campModalError("Real available seats must be 1 or more."); return; }
  if (!Number.isFinite(display) || display < seats) {
    campModalError("Display total must be at least the real seat count (" + seats + ").");
    return;
  }
  const existing = CAMP_EDIT_ID ? ADMIN_CAMPAIGNS.find(c => c.id === CAMP_EDIT_ID) : null;
  const alreadyFilled = existing ? Math.max(0, cNum(existing.seats_filled, 0)) : 0;
  if (existing && seats < alreadyFilled) {
    if (!confirm(
      `${alreadyFilled} people have already paid for this campaign, but you set only ${seats} seats.\n\n` +
      "The campaign will immediately flip to “Filled” and no one else can apply.\n\nContinue?"
    )) return;
  }

  const btn = document.getElementById("campSaveBtn");
  const oldTxt = btn.textContent;
  const wasEdit = !!CAMP_EDIT_ID;          // captured before closeCampaignModal() clears it
  const oldImageUrl = existing ? existing.image_url : null;
  CAMP_SAVING = true;
  btn.disabled = true; btn.textContent = "Saving…";
  campModalError("");

  try {
    // Upload the new banner only now that everything else has validated.
    const file = document.getElementById("cmFile").files[0];
    let image_url = CAMP_IMAGE_URL;
    if (file) {
      const url = await uploadCampaignImage(file);
      if (!url) throw new Error("Banner upload failed. Try a smaller image, or save without a photo.");
      image_url = url;
    }

    const row = {
      title,
      trade,
      location: document.getElementById("cmLocation").value.trim() || null,
      seats_total: seats,
      display_total: display,
      salary_text: document.getElementById("cmSalary").value.trim() || null,
      experience_required: document.getElementById("cmExp").value.trim() || null,
      description: document.getElementById("cmDesc").value.trim() || null,
      image_url: image_url || null,
      deadline,
      status: document.getElementById("cmStatus").value,
      is_featured: document.getElementById("cmFeatured").checked,
      sort_order: Math.floor(cNum(document.getElementById("cmSort").value, 0)),
    };

    if (CAMP_EDIT_ID) {
      const { error } = await client.from("campaigns").update(row).eq("id", CAMP_EDIT_ID);
      if (error) throw error;
    } else {
      const { error } = await client.from("campaigns").insert(row);
      if (error) throw error;
    }

    // The old banner is now unreferenced — bin it so the bucket doesn't grow
    // forever. Non-fatal: the row is already saved.
    if (oldImageUrl && oldImageUrl !== row.image_url && typeof removeStorageFiles === "function") {
      await removeStorageFiles(CAMPAIGN_BUCKET, [oldImageUrl]);
    }

    CAMP_SAVING = false;
    btn.disabled = false; btn.textContent = oldTxt;
    closeCampaignModal();
    await loadCampaignsAdmin();       // re-read: slug + auto status come from the DB
    campNote(wasEdit ? "✓ Campaign updated" : "✓ Campaign created", true);
  } catch (e) {
    console.error("Save campaign failed:", e);
    CAMP_SAVING = false;
    btn.disabled = false; btn.textContent = oldTxt;
    campModalError((e && e.message ? e.message : String(e)));
  }
}

/* ------------------------------------------------------- quick row actions */
async function setCampaignStatus(id, status) {
  const c = ADMIN_CAMPAIGNS.find(x => x.id === id);
  if (!c) return;
  if (status === "active" && !c.trade) { campNote("Add a trade before activating.", false); return; }
  const { error } = await client.from("campaigns").update({ status }).eq("id", id);
  if (error) { campNote("Could not update status: " + error.message, false); return; }
  await loadCampaignsAdmin();
  const now = ADMIN_CAMPAIGNS.find(x => x.id === id);
  campNote(now && now.status !== status
    ? `Saved — the campaign is “${now.status}” because every seat is taken.`
    : `✓ Campaign is now “${status}”.`, true);
}

/* One-click seat bump. display_total is dragged along when it would otherwise
   fall below seats_total (the DB enforces display_total >= seats_total). */
async function bumpCampaignSeats(id, delta) {
  const c = ADMIN_CAMPAIGNS.find(x => x.id === id);
  if (!c) return;
  const seats = Math.max(1, cNum(c.seats_total, 1) + delta);
  const filled = Math.max(0, cNum(c.seats_filled, 0));
  if (seats < filled && !confirm(
    `${filled} people have already paid for “${c.title}”.\n\n` +
    `Dropping to ${seats} seat(s) flips the campaign to “Filled” straight away and stops new applications.\n\nContinue?`
  )) return;

  const display = Math.max(seats, cNum(c.display_total, seats));
  const { error } = await client.from("campaigns")
    .update({ seats_total: seats, display_total: display }).eq("id", id);
  if (error) { campNote("Could not change seats: " + error.message, false); return; }
  await loadCampaignsAdmin();
  campNote("✓ Real seats: " + seats, true);
}

/* Recompute seats_filled from the paid candidate rows. Safe to run any time —
   use it after a manual delete or if the number ever looks wrong. */
async function recountCampaignSeats(id) {
  const { error } = await client.rpc("recount_campaign_seats", { p_campaign_id: id });
  if (error) { campNote("Recount failed: " + error.message, false); return; }
  await loadCampaignsAdmin();
  campNote("✓ Seats recounted from paid applications.", true);
}

async function recountAllCampaignSeats() {
  const { error } = await client.rpc("recount_campaign_seats", { p_campaign_id: null });
  if (error) { campNote("Recount failed: " + error.message, false); return; }
  await loadCampaignsAdmin();
  campNote("✓ All campaigns recounted.", true);
}

/* Jump to the Candidates table filtered to this campaign's applicants. */
function showCampaignApplicants(id) {
  CAND_CAMPAIGN_FILTER = id;
  renderCandidates();
  showView("cand", navLinkFor("cand"));
}

/* Deleting a campaign never touches candidates — the FK is ON DELETE SET NULL,
   so their applications survive with campaign_id = NULL. */
async function deleteCampaign(id) {
  const c = ADMIN_CAMPAIGNS.find(x => x.id === id);
  if (!c) return;
  const app = campApplicants(id);
  const warn = app.total
    ? `\n\n${app.total} application(s) came through this campaign. They will NOT be deleted — they just stop being linked to a campaign.`
    : "";
  if (!confirm(`Delete the campaign “${c.title}”?${warn}\n\nThis cannot be undone.`)) return;

  const { error } = await client.from("campaigns").delete().eq("id", id);
  if (error) { campNote("Could not delete: " + error.message, false); return; }
  // Bin the banner too (non-fatal — the row is already gone).
  if (c.image_url && typeof removeStorageFiles === "function") {
    await removeStorageFiles(CAMPAIGN_BUCKET, [c.image_url]);
  }
  if (CAND_CAMPAIGN_FILTER === id) { CAND_CAMPAIGN_FILTER = null; renderCandidates(); }
  await loadCampaignsAdmin();
  campNote("✓ Campaign deleted. Applications were kept.", true);
}

/* Esc closes the modal. */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const m = campaignModalEl();
  if (m && m.classList.contains("open")) closeCampaignModal();
});
