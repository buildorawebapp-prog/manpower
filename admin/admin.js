/* ==========================================================================
   Asokamanpower — Admin dashboard (live, Supabase-backed)
   Reads/writes real data. Protected by Supabase Auth: if there's no
   logged-in session, the page bounces to login.html.
   ========================================================================== */

const client = initSupabase();

let CANDIDATES = [];
let EMPLOYERS = [];
let ADMIN_LOCATIONS = [];   // [{id, name}]
let ADMIN_TRADES = [];      // [{id, name}]
/* Keys here are written straight to the settings table (Object.entries →
   upsert), so a property name IS the DB key. phone_proc1 / phone_proc2 are
   read by js/app.js to fill the Recruitment Coordinator contact cards. */
let ADMIN_SETTINGS = { phone: "", whatsapp: "", email: "", company: "", address: "", phone_proc1: "", phone_proc2: "" };

/* Best-effort admin identifier (their login email), written to fee_audit so
   price changes are attributable. Set in requireAuth(). */
let ADMIN_EMAIL = "";

/* When set to a campaign id, the Candidates table shows only that campaign's
   applicants. Driven by the "👥 Applicants" button in the Campaigns view. */
let CAND_CAMPAIGN_FILTER = null;

const CAND_STATUSES = ["new", "contacted", "hired", "rejected"];
const EMP_STATUSES = ["new", "contacted", "closed"];

function statusLabel(s) { return (s || "").replace(/_/g, " "); }
function badge(status, id) {
  const idAttr = id ? ` id="${id}"` : "";
  return `<span${idAttr} class="badge badge-${status}">${statusLabel(status)}</span>`;
}
/* Build the <option> list for a status dropdown, keeping the current
   value visible even if it isn't one of the standard choices
   (e.g. "pending_payment"). */
function statusOptions(list, current) {
  const all = list.includes(current) || !current ? list : [current, ...list];
  return all.map(s => `<option value="${s}" ${s === current ? "selected" : ""}>${statusLabel(s)}</option>`).join("");
}
function fmtDate(iso) { return iso ? iso.slice(0, 10) : ""; }
function telHref(p) { return "tel:" + (p || "").replace(/[^0-9+]/g, ""); }
function escAttr(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

/* ---- Auth guard + logout ---- */
async function requireAuth() {
  const { data } = await client.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return false; }
  // Best-effort admin identifier, stamped onto fee_audit rows.
  ADMIN_EMAIL = (data.session.user && data.session.user.email) || "";
  return true;
}
async function logout() {
  await client.auth.signOut();
  window.location.href = "login.html";
}

/* ---- Navigation ---- */
function showView(view, el) {
  document.querySelectorAll(".adm-view").forEach(v => v.classList.add("hide"));
  document.getElementById("view-" + view).classList.remove("hide");
  document.querySelectorAll(".admin-nav a").forEach(a => a.classList.remove("active"));
  if (el) el.classList.add("active");
  document.getElementById("pageTitle").textContent = el ? el.dataset.title : "Dashboard";
  // The price-change history is fetched fresh each time the panel opens (keeps
  // it off the main dashboard load and always current).
  if (view === "pricing" && typeof loadFeeAudit === "function") loadFeeAudit();
}
/* Find a sidebar link by the view it opens — safer than indexing into the
   node list, which shifts every time a menu item is added. */
function navLinkFor(view) {
  return document.querySelector('.admin-nav a[data-view="' + view + '"]');
}

/* ---- Stats ---- */
function renderStats() {
  const newC = CANDIDATES.filter(c => c.status === "new").length;
  const newE = EMPLOYERS.filter(e => e.status === "new").length;
  document.getElementById("statCand").textContent = CANDIDATES.length;
  document.getElementById("statEmp").textContent = EMPLOYERS.length;
  document.getElementById("statNew").textContent = newC + newE;
  document.getElementById("statLoc").textContent = ADMIN_LOCATIONS.length;
}

/* ---- Load everything ---- */
async function loadAll() {
  const [cand, emp, locs, trades, sett] = await Promise.all([
    client.from("candidates").select("*").order("created_at", { ascending: false }),
    client.from("employers").select("*").order("created_at", { ascending: false }),
    client.from("locations").select("*").order("name"),
    client.from("trades").select("*").order("sort_order"),
    client.from("settings").select("*"),
  ]);
  CANDIDATES = cand.data || [];
  EMPLOYERS = emp.data || [];
  ADMIN_LOCATIONS = locs.data || [];
  ADMIN_TRADES = trades.data || [];
  const map = {};
  (sett.data || []).forEach(r => { map[r.key] = r.value; });
  ADMIN_SETTINGS = {
    phone: map.phone || "", whatsapp: map.whatsapp || "",
    email: map.email || "", company: map.company || "", address: map.address || "",
    phone_proc1: map.phone_proc1 || "", phone_proc2: map.phone_proc2 || "",
  };

  renderStats();
  renderCandidates();
  renderCandidatesMini();
  renderEmployers();
  renderLocationsAdmin();
  renderTradesAdmin();
  renderPricing();
  loadSettings();

  // Campaigns live in admin/campaigns.js. Guarded so the dashboard still
  // works if that file is missing or the campaigns table isn't created yet.
  if (typeof loadCampaignsAdmin === "function") { await loadCampaignsAdmin(); }
}

/* ---- Candidates ---- */
/* Rows currently shown — respects the campaign filter, if any. */
function visibleCandidates() {
  if (!CAND_CAMPAIGN_FILTER) return CANDIDATES;
  return CANDIDATES.filter(c => c.campaign_id === CAND_CAMPAIGN_FILTER);
}
/* Header strip that appears while a campaign filter is active. */
function renderCandFilterNote() {
  const note = document.getElementById("candFilterNote");
  if (!note) return;
  if (!CAND_CAMPAIGN_FILTER) { note.classList.add("hide"); note.innerHTML = ""; return; }
  const camp = (typeof ADMIN_CAMPAIGNS !== "undefined" ? ADMIN_CAMPAIGNS : [])
    .find(c => c.id === CAND_CAMPAIGN_FILTER);
  note.innerHTML = `📣 Showing applicants for <strong>${escAttr(camp ? camp.title : "this campaign")}</strong>
    <button class="mini-btn" style="margin-left:10px" onclick="clearCandCampaignFilter()">✕ Show all candidates</button>`;
  note.classList.remove("hide");
}
function clearCandCampaignFilter() {
  CAND_CAMPAIGN_FILTER = null;
  renderCandidates();
}
function renderCandidates() {
  const rows = visibleCandidates();
  document.getElementById("candBody").innerHTML = rows.map(c => `
      <tr>
        <td class="sel-col"><input type="checkbox" class="row-check" value="${c.id}" onchange="onRowCheck('cand')" aria-label="Select ${escAttr(c.full_name)}"></td>
        <td><strong>${c.full_name}</strong></td>
        <td>${c.phone}</td>
        <td>${c.trade}</td>
        <td>${c.experience || ""}</td>
        <td>${c.location || ""}</td>
        <td>
          <div class="status-cell">
            ${badge(c.status, "candBadge-" + c.id)}
            <select class="mini-btn status-select" onchange="setCandStatus('${c.id}', this.value)">
              ${statusOptions(CAND_STATUSES, c.status)}
            </select>
          </div>
        </td>
        <td>${fmtDate(c.created_at)}</td>
        <td>
          <a class="mini-btn" href="candidate-detail.html?id=${c.id}">View Details</a>
        </td>
      </tr>`).join("") || emptyRow(9);
  document.getElementById("candCount").textContent =
    CAND_CAMPAIGN_FILTER ? rows.length + " of " + CANDIDATES.length : rows.length;
  renderCandFilterNote();
  updateBulkBar("cand");
}
function renderCandidatesMini() {
  const el = document.getElementById("candBodyMini");
  if (!el) return;
  el.innerHTML = CANDIDATES.slice(0, 5).map(c => `
    <tr><td><strong>${c.full_name}</strong></td><td>${c.phone}</td><td>${c.trade}</td>
    <td>${c.experience || ""}</td><td>${c.location || ""}</td><td>${badge(c.status)}</td>
    <td>${fmtDate(c.created_at)}</td>
    <td><a class="mini-btn" href="candidate-detail.html?id=${c.id}">View</a></td></tr>`).join("") || emptyRow(8);
}
async function setCandStatus(id, val) {
  const c = CANDIDATES.find(x => x.id === id); if (c) c.status = val;
  const b = document.getElementById("candBadge-" + id);
  if (b) { b.className = "badge badge-" + val; b.textContent = statusLabel(val); }
  renderStats();
  await client.from("candidates").update({ status: val }).eq("id", id);
}

/* ---- Employers ---- */
function renderEmployers() {
  document.getElementById("empBody").innerHTML = EMPLOYERS.map(e => `
    <tr>
      <td class="sel-col"><input type="checkbox" class="row-check" value="${e.id}" onchange="onRowCheck('emp')" aria-label="Select ${escAttr(e.company_name)}"></td>
      <td><strong>${e.company_name}</strong></td>
      <td>${e.contact_person}</td>
      <td>${e.phone}</td>
      <td>${e.trade_needed}</td>
      <td>${e.workers_count || ""}</td>
      <td>${e.location || ""}</td>
      <td>
        <div class="status-cell">
          ${badge(e.status, "empBadge-" + e.id)}
          <select class="mini-btn status-select" onchange="setEmpStatus('${e.id}', this.value)">
            ${statusOptions(EMP_STATUSES, e.status)}
          </select>
        </div>
      </td>
      <td>
        <a class="mini-btn" href="employer-detail.html?id=${e.id}">View Details</a>
      </td>
    </tr>`).join("") || emptyRow(9);
  document.getElementById("empCount").textContent = EMPLOYERS.length;
  updateBulkBar("emp");
}
async function setEmpStatus(id, val) {
  const e = EMPLOYERS.find(x => x.id === id); if (e) e.status = val;
  const b = document.getElementById("empBadge-" + id);
  if (b) { b.className = "badge badge-" + val; b.textContent = statusLabel(val); }
  renderStats();
  await client.from("employers").update({ status: val }).eq("id", id);
}

function emptyRow(cols) { return `<tr><td colspan="${cols}" style="text-align:center;color:var(--muted);padding:26px">No records yet.</td></tr>`; }

/* ==========================================================================
   Bulk delete — select candidates / employers and permanently remove them
   plus ALL connected data (chats, status history, payments, resume + chat
   files, and the login account when it has no other submission left).
   ========================================================================== */
const BULK = {
  cand: { body: "candBody", selectAll: "candSelectAll", count: "candSelCount", delBtn: "candDelBtn", label: "candidate" },
  emp:  { body: "empBody",  selectAll: "empSelectAll",  count: "empSelCount",  delBtn: "empDelBtn",  label: "employer" },
};

function rowChecks(which) {
  return Array.from(document.querySelectorAll("#" + BULK[which].body + " .row-check"));
}
function getSelectedIds(which) {
  return rowChecks(which).filter(b => b.checked).map(b => b.value);
}
// Header "select all" toggled → match every row checkbox.
function toggleSelectAll(which) {
  const master = document.getElementById(BULK[which].selectAll);
  const on = !!(master && master.checked);
  rowChecks(which).forEach(b => { b.checked = on; });
  updateBulkBar(which);
}
// A single row checkbox changed.
function onRowCheck(which) { updateBulkBar(which); }
// Keep the toolbar count, Delete button and header checkbox in sync.
function updateBulkBar(which) {
  const cfg = BULK[which];
  const boxes = rowChecks(which);
  const n = boxes.filter(b => b.checked).length;
  const countEl = document.getElementById(cfg.count);
  if (countEl) countEl.textContent = n;
  const delBtn = document.getElementById(cfg.delBtn);
  if (delBtn) delBtn.disabled = n === 0;
  const master = document.getElementById(cfg.selectAll);
  if (master) {
    master.checked = n > 0 && n === boxes.length;
    master.indeterminate = n > 0 && n < boxes.length;
  }
}

// Pull the in-bucket path out of a stored Storage URL (public or signed form).
function bucketPathFromUrl(url, bucket) {
  if (!url) return null;
  const markers = ["/object/public/" + bucket + "/", "/object/sign/" + bucket + "/", "/object/" + bucket + "/"];
  for (const m of markers) {
    const i = String(url).indexOf(m);
    if (i !== -1) {
      let p = String(url).slice(i + m.length);
      const q = p.indexOf("?"); if (q !== -1) p = p.slice(0, q);
      try { return decodeURIComponent(p); } catch (_) { return p; }
    }
  }
  return null;
}
// Delete the physical files from a bucket. Non-fatal: DB rows are already gone,
// a leftover file only wastes storage, so we log instead of throwing.
async function removeStorageFiles(bucket, urls) {
  if (!urls || !urls.length) return;
  const paths = urls.map(u => bucketPathFromUrl(u, bucket)).filter(Boolean);
  if (!paths.length) return;
  const { error } = await client.storage.from(bucket).remove(paths);
  if (error) console.warn("Could not remove some " + bucket + " files:", error.message);
}

async function deleteSelected(which) {
  const cfg = BULK[which];
  const ids = getSelectedIds(which);
  if (!ids.length) return;

  const noun = ids.length + " " + cfg.label + (ids.length === 1 ? "" : "s");
  const typed = prompt(
    "⚠️ PERMANENTLY delete " + noun + " and ALL their data?\n\n" +
    "This removes their chats, images, videos, resume file, payment records " +
    "and login account. It CANNOT be undone.\n\n" +
    "Type DELETE (capitals) to confirm:"
  );
  if (typed === null) return;                 // Cancel pressed
  if (typed.trim() !== "DELETE") {
    alert("Cancelled — you did not type DELETE. Nothing was deleted.");
    return;
  }

  const delBtn = document.getElementById(cfg.delBtn);
  const oldText = delBtn ? delBtn.textContent : "";
  if (delBtn) { delBtn.disabled = true; delBtn.textContent = "Deleting…"; }

  try {
    const args = which === "cand"
      ? { p_candidate_ids: ids, p_employer_ids: [] }
      : { p_candidate_ids: [], p_employer_ids: ids };
    const { data, error } = await client.rpc("admin_delete_submissions", args);
    if (error) throw error;

    // Remove the physical Storage files the server reported.
    const d = data || {};
    await removeStorageFiles("candidate-resumes", d.resume_urls || []);
    await removeStorageFiles("chat-attachments", d.attachment_urls || []);

    // Reset header checkbox, then reload fresh data (re-renders + updateBulkBar).
    const master = document.getElementById(cfg.selectAll);
    if (master) { master.checked = false; master.indeterminate = false; }
    await loadAll();

    let msg = "✓ Deleted " + noun + " and all connected data.";
    if (d.deleted_accounts) msg += "\nLogin accounts removed: " + d.deleted_accounts + ".";
    alert(msg);
  } catch (e) {
    console.error("Bulk delete failed:", e);
    alert("Delete failed: " + (e && e.message ? e.message : e));
  } finally {
    if (delBtn) { delBtn.textContent = oldText; }
    updateBulkBar(which);
  }
}

/* ---- Locations ---- */
function renderLocationsAdmin() {
  document.getElementById("locChips").innerHTML = ADMIN_LOCATIONS.map(l => `
    <span class="chip">${l.name} <button onclick="removeLocation('${l.id}')" title="Remove">×</button></span>`).join("");
}
async function addLocation() {
  const inp = document.getElementById("newLoc");
  const v = inp.value.trim();
  inp.value = "";
  if (!v || ADMIN_LOCATIONS.some(l => l.name.toLowerCase() === v.toLowerCase())) return;
  const { data, error } = await client.from("locations").insert({ name: v }).select().single();
  if (!error && data) { ADMIN_LOCATIONS.push(data); ADMIN_LOCATIONS.sort((a,b)=>a.name.localeCompare(b.name)); renderLocationsAdmin(); renderStats(); }
}
async function removeLocation(id) {
  ADMIN_LOCATIONS = ADMIN_LOCATIONS.filter(l => l.id !== id);
  renderLocationsAdmin(); renderStats();
  await client.from("locations").delete().eq("id", id);
}

/* ---- Trades ---- */
const TRADE_BUCKET = "trade-images";

function renderTradesAdmin() {
  const grid = document.getElementById("tradeCards");
  document.getElementById("tradeCount").textContent = ADMIN_TRADES.length;
  grid.innerHTML = ADMIN_TRADES.map(tr => {
    const thumb = tr.image_url
      ? `<div class="ta-thumb" style="background-image:url('${tr.image_url}')"><span class="ta-ic">${tr.icon || "🛠️"}</span></div>`
      : `<div class="ta-thumb ta-noimg"><span class="ta-ic-big">${tr.icon || "🛠️"}</span><span class="ta-noimg-t">No photo</span></div>`;
    return `<div class="ta-card">
      ${thumb}
      <div class="ta-body">
        <h4>${tr.name}</h4>
        <p>${tr.descr || ""}</p>
        <div class="ta-actions">
          <button class="mini-btn" onclick="triggerChangePhoto('${tr.id}')">📷 ${tr.image_url ? "Change photo" : "Add photo"}</button>
          <button class="mini-btn ta-del" onclick="removeTrade('${tr.id}')">🗑 Remove</button>
        </div>
      </div>
    </div>`;
  }).join("") || `<p style="color:var(--muted)">No trades yet. Add one above.</p>`;
}

// Preview the chosen file in the add-form before uploading
function previewTradeFile(input) {
  const img = document.getElementById("tPreview");
  const file = input.files && input.files[0];
  if (!file) { img.classList.add("hide"); return; }
  img.src = URL.createObjectURL(file);
  img.classList.remove("hide");
}

// Upload a file to Storage, return its public URL (or null on failure)
async function uploadTradeImage(file) {
  const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const path = `${Date.now()}-${safe}`;
  const { error } = await client.storage.from(TRADE_BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false,
  });
  if (error) { console.error("Upload failed:", error); return null; }
  const { data } = client.storage.from(TRADE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function tradeNote(msg, ok) {
  const n = document.getElementById("tAddNote");
  n.textContent = msg;
  n.style.color = ok ? "var(--green)" : "#e5484d";
  n.classList.remove("hide");
  setTimeout(() => n.classList.add("hide"), 2600);
}

async function addTrade() {
  const nameEl = document.getElementById("tName");
  const iconEl = document.getElementById("tIcon");
  const descEl = document.getElementById("tDesc");
  const fileEl = document.getElementById("tFile");
  const btn = document.getElementById("tAddBtn");

  const name = nameEl.value.trim();
  if (!name) { tradeNote("Enter a trade name", false); return; }
  if (ADMIN_TRADES.some(t => t.name.toLowerCase() === name.toLowerCase())) {
    tradeNote("That trade already exists", false); return;
  }

  btn.disabled = true; btn.textContent = "Adding...";
  let image_url = null;
  const file = fileEl.files && fileEl.files[0];
  if (file) { image_url = await uploadTradeImage(file); }

  const nextOrder = (ADMIN_TRADES.reduce((m, t) => Math.max(m, t.sort_order || 0), 0)) + 1;
  const { data, error } = await client.from("trades").insert({
    name, icon: iconEl.value.trim() || "🛠️", descr: descEl.value.trim() || null,
    image_url, sort_order: nextOrder,
  }).select().single();

  btn.disabled = false; btn.textContent = "+ Add Trade";
  if (error || !data) { tradeNote("Could not add trade", false); return; }

  ADMIN_TRADES.push(data);
  ADMIN_TRADES.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  renderTradesAdmin();
  nameEl.value = ""; iconEl.value = ""; descEl.value = ""; fileEl.value = "";
  document.getElementById("tPreview").classList.add("hide");
  tradeNote("✓ Trade added", true);
}

// Change / add photo for an existing trade
let CHANGE_PHOTO_ID = null;
function triggerChangePhoto(id) {
  CHANGE_PHOTO_ID = id;
  document.getElementById("changePhotoFile").click();
}
async function onChangePhoto(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file || !CHANGE_PHOTO_ID) return;
  const id = CHANGE_PHOTO_ID;
  const url = await uploadTradeImage(file);
  if (!url) { alert("Photo upload failed. Please try again."); return; }
  const { error } = await client.from("trades").update({ image_url: url }).eq("id", id);
  if (error) { alert("Could not save photo."); return; }
  const tr = ADMIN_TRADES.find(t => t.id === id);
  if (tr) tr.image_url = url;
  renderTradesAdmin();
}

async function removeTrade(id) {
  const tr = ADMIN_TRADES.find(t => t.id === id);
  if (!confirm(`Remove "${tr ? tr.name : "this trade"}"?`)) return;
  ADMIN_TRADES = ADMIN_TRADES.filter(t => t.id !== id);
  renderTradesAdmin();
  await client.from("trades").delete().eq("id", id);
}

/* ==========================================================================
   Pricing — per-location BASE fee + per-trade optional SURCHARGE.
   The applicant pays  location.fee_paise + trade.surcharge_paise  (the exact
   same maths the server's resolve_application_fee() enforces). This panel only
   edits the price columns; it can NEVER set an amount on a payment. All money is
   stored as INTEGER PAISE; admins think in rupees, so we convert at the edges.
   Every change is UPDATE + a fee_audit row (who / old / new).
   ========================================================================== */
const FEE_MIN_PAISE = 100;        // ₹1  — Razorpay floor (also the DB CHECK)
const FEE_MAX_PAISE = 5000000;    // ₹50,000 — admin-typo cap (also the DB CHECK)

/* paise -> value for a rupee <input>: whole rupees when clean, else 2 dp. */
function paiseToRupeeInput(paise) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return "";
  return (n % 100 === 0) ? String(Math.round(n / 100)) : (n / 100).toFixed(2);
}
/* paise -> "₹1,234" (or "₹1,234.50") for labels. */
function paiseToRupeeLabel(paise) {
  const n = Number(paise) || 0;
  const opts = (n % 100 === 0)
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return "₹" + (n / 100).toLocaleString("en-IN", opts);
}
/* rupee text -> integer paise, or NaN if it isn't a sane non-negative number.
   Math.round avoids binary-float drift (e.g. 200.1*100 = 20009.9999...). */
function rupeesToPaise(text) {
  const r = Number(String(text == null ? "" : text).trim().replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(r) || r < 0) return NaN;
  return Math.round(r * 100);
}
function locFeePaise(l) {
  const n = Number(l && l.fee_paise);
  return Number.isFinite(n) ? n : 20000;         // default ₹200 until edited
}
function tradeSurPaise(t) {
  const n = Number(t && t.surcharge_paise);
  return Number.isFinite(n) ? n : 0;             // default: no surcharge
}
function priceNote(el, msg, ok) {
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "var(--green)" : "#e5484d";
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ""; }, 2800);
}

/* ---- render (all in-memory; called from loadAll) ---- */
function renderPricing() {
  renderLocPriceRows();
  renderTradePriceRows();
  renderPriceCalcOptions();
  renderPriceCalc();
}

function renderLocPriceRows() {
  const wrap = document.getElementById("locPriceRows");
  if (!wrap) return;
  if (!ADMIN_LOCATIONS.length) {
    wrap.innerHTML = `<p style="color:var(--muted)">No locations yet. Add them in the 📍 Locations tab first — every location needs a base fee.</p>`;
    return;
  }
  wrap.innerHTML = ADMIN_LOCATIONS.map(l => {
    const off = l.is_active === false ? ` <span class="price-off">inactive</span>` : "";
    return `<div class="price-row">
      <div class="price-name">${escAttr(l.name)}${off}</div>
      <div class="price-input"><span class="rupee">₹</span>
        <input type="number" min="1" max="50000" step="1" inputmode="decimal"
               id="locFee-${l.id}" value="${escAttr(paiseToRupeeInput(locFeePaise(l)))}"
               oninput="markPriceDirty('loc','${l.id}')"
               onkeydown="if(event.key==='Enter')saveLocationFee('${l.id}')" /></div>
      <button class="btn btn-primary price-save" id="locSave-${l.id}" onclick="saveLocationFee('${l.id}')" disabled>Save</button>
      <span class="price-note" id="locNote-${l.id}"></span>
    </div>`;
  }).join("");
}

function renderTradePriceRows() {
  const wrap = document.getElementById("tradePriceRows");
  if (!wrap) return;
  if (!ADMIN_TRADES.length) {
    wrap.innerHTML = `<p style="color:var(--muted)">No trades yet. Add them in the 🛠️ Trades tab. A surcharge is optional — leave it at ₹0 for no extra charge.</p>`;
    return;
  }
  wrap.innerHTML = ADMIN_TRADES.map(t => {
    const off = t.is_active === false ? ` <span class="price-off">inactive</span>` : "";
    return `<div class="price-row">
      <div class="price-name">${escAttr(t.icon || "🛠️")} ${escAttr(t.name)}${off}</div>
      <div class="price-input"><span class="rupee">+₹</span>
        <input type="number" min="0" max="50000" step="1" inputmode="decimal"
               id="tradeSur-${t.id}" value="${escAttr(paiseToRupeeInput(tradeSurPaise(t)))}"
               oninput="markPriceDirty('trade','${t.id}')"
               onkeydown="if(event.key==='Enter')saveTradeSurcharge('${t.id}')" /></div>
      <button class="btn btn-primary price-save" id="tradeSave-${t.id}" onclick="saveTradeSurcharge('${t.id}')" disabled>Save</button>
      <span class="price-note" id="tradeNote-${t.id}"></span>
    </div>`;
  }).join("");
}

/* Enable a row's Save button only when the typed value differs from what's
   stored (and is itself a valid integer paise). */
function markPriceDirty(kind, id) {
  const isLoc = kind === "loc";
  const arr = isLoc ? ADMIN_LOCATIONS : ADMIN_TRADES;
  const rec = arr.find(x => x.id === id);
  const inp = document.getElementById((isLoc ? "locFee-" : "tradeSur-") + id);
  const btn = document.getElementById((isLoc ? "locSave-" : "tradeSave-") + id);
  if (!rec || !inp || !btn) return;
  const stored = isLoc ? locFeePaise(rec) : tradeSurPaise(rec);
  const now = rupeesToPaise(inp.value);
  const min = isLoc ? FEE_MIN_PAISE : 0;
  btn.disabled = !(Number.isInteger(now) && now >= min && now <= FEE_MAX_PAISE && now !== stored);
}

/* Typo guard (L12): confirm unusually large or big-swing edits before they go
   live. Fires on a large absolute amount (≥ ₹2,000), a 3×+ jump, or a drop to
   ≤ ⅓ of the current price (the money-leakage direction). Normal small
   adjustments save silently. Returns true to proceed, false if admin cancels. */
function confirmBigPriceChange(kind, name, oldPaise, newPaise) {
  const BIG_ABS = 200000;                       // ₹2,000 — well above a normal fee
  const old = Number.isInteger(oldPaise) ? oldPaise : 0;
  let unusual = newPaise >= BIG_ABS;
  if (old > 0 && (newPaise >= old * 3 || newPaise * 3 <= old)) unusual = true;
  if (!unusual) return true;
  const what = kind === "loc"
    ? "Base fee for “" + name + "”"
    : "Surcharge for “" + name + "”";
  const arrow = newPaise > old ? "▲ increase" : "▼ decrease";
  return confirm(
    what + "\n\n" +
    "Current:  " + paiseToRupeeLabel(old) + "\n" +
    "New:      " + paiseToRupeeLabel(newPaise) + "   (" + arrow + ")\n\n" +
    "This is what every applicant for it will be charged. Save this price?"
  );
}

async function saveLocationFee(id) {
  const rec = ADMIN_LOCATIONS.find(l => l.id === id);
  const inp = document.getElementById("locFee-" + id);
  const btn = document.getElementById("locSave-" + id);
  const note = document.getElementById("locNote-" + id);
  if (!rec || !inp) return;
  const paise = rupeesToPaise(inp.value);
  if (!Number.isInteger(paise) || paise < FEE_MIN_PAISE || paise > FEE_MAX_PAISE) {
    priceNote(note, "Enter ₹1 – ₹50,000", false); return;
  }
  const old = locFeePaise(rec);
  if (paise === old) { priceNote(note, "No change", true); if (btn) btn.disabled = true; return; }
  if (!confirmBigPriceChange("loc", rec.name, old, paise)) {
    priceNote(note, "Cancelled — not saved", false); markPriceDirty("loc", id); return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  const { error } = await client.from("locations")
    .update({ fee_paise: paise, updated_at: new Date().toISOString() }).eq("id", id);
  if (btn) btn.textContent = "Save";
  if (error) { priceNote(note, "✗ " + error.message, false); markPriceDirty("loc", id); return; }

  rec.fee_paise = paise;                       // keep local state in sync
  await writeFeeAudit("location", id, rec.name, old, paise);
  priceNote(note, "✓ Saved " + paiseToRupeeLabel(paise), true);
  renderPriceCalc();                           // calculator reflects the new price
  if (!document.getElementById("view-pricing").classList.contains("hide")) loadFeeAudit();
}

async function saveTradeSurcharge(id) {
  const rec = ADMIN_TRADES.find(t => t.id === id);
  const inp = document.getElementById("tradeSur-" + id);
  const btn = document.getElementById("tradeSave-" + id);
  const note = document.getElementById("tradeNote-" + id);
  if (!rec || !inp) return;
  const paise = rupeesToPaise(inp.value);
  if (!Number.isInteger(paise) || paise < 0 || paise > FEE_MAX_PAISE) {
    priceNote(note, "Enter ₹0 – ₹50,000", false); return;
  }
  const old = tradeSurPaise(rec);
  if (paise === old) { priceNote(note, "No change", true); if (btn) btn.disabled = true; return; }
  if (!confirmBigPriceChange("trade", rec.name, old, paise)) {
    priceNote(note, "Cancelled — not saved", false); markPriceDirty("trade", id); return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  const { error } = await client.from("trades")
    .update({ surcharge_paise: paise, updated_at: new Date().toISOString() }).eq("id", id);
  if (btn) btn.textContent = "Save";
  if (error) { priceNote(note, "✗ " + error.message, false); markPriceDirty("trade", id); return; }

  rec.surcharge_paise = paise;
  await writeFeeAudit("trade", id, rec.name, old, paise);
  priceNote(note, paise === 0 ? "✓ Surcharge removed" : "✓ Saved +" + paiseToRupeeLabel(paise), true);
  renderPriceCalc();
  if (!document.getElementById("view-pricing").classList.contains("hide")) loadFeeAudit();
}

/* One audit row per change. Best-effort: the price is already saved, so an
   audit failure only loses history — never blocks the edit. */
async function writeFeeAudit(target_type, target_id, target_name, old_paise, new_paise) {
  try {
    await client.from("fee_audit").insert({
      changed_by: ADMIN_EMAIL || null,
      target_type, target_id, target_name,
      old_paise, new_paise,
    });
  } catch (e) { console.warn("fee_audit insert failed:", e && e.message ? e.message : e); }
}

/* ---- live calculator (mirrors resolve_application_fee: base + optional +) ---- */
function renderPriceCalcOptions() {
  const locSel = document.getElementById("calcLoc");
  const trSel = document.getElementById("calcTrade");
  if (locSel) {
    const prev = locSel.value;
    locSel.innerHTML = `<option value="">Select location…</option>` +
      ADMIN_LOCATIONS.filter(l => l.is_active !== false)
        .map(l => `<option value="${escAttr(l.name)}">${escAttr(l.name)}</option>`).join("");
    if (prev) locSel.value = prev;
  }
  if (trSel) {
    const prev = trSel.value;
    trSel.innerHTML = `<option value="">No trade (base only)</option>` +
      ADMIN_TRADES.filter(t => t.is_active !== false)
        .map(t => `<option value="${escAttr(t.name)}">${escAttr((t.icon ? t.icon + " " : "") + t.name)}</option>`).join("");
    if (prev) trSel.value = prev;
  }
}
function renderPriceCalc() {
  const locEl = document.getElementById("calcLoc");
  const trEl = document.getElementById("calcTrade");
  const totalEl = document.getElementById("calcTotal");
  const breakEl = document.getElementById("calcBreak");
  if (!totalEl) return;
  const locName = locEl ? locEl.value : "";
  const trName = trEl ? trEl.value : "";
  if (!locName) {
    totalEl.textContent = "—";
    if (breakEl) breakEl.textContent = "Pick a location to preview the fee.";
    return;
  }
  const loc = ADMIN_LOCATIONS.find(l => String(l.name).toLowerCase() === locName.toLowerCase());
  const base = loc ? locFeePaise(loc) : 20000;
  let sur = 0, trLabel = "";
  if (trName) {
    const tr = ADMIN_TRADES.find(t => String(t.name).toLowerCase() === trName.toLowerCase());
    sur = tr ? tradeSurPaise(tr) : 0;
    trLabel = tr ? tr.name : "";
  }
  totalEl.textContent = paiseToRupeeLabel(base + sur);
  if (breakEl) {
    breakEl.textContent = sur > 0
      ? `${paiseToRupeeLabel(base)} ${loc ? loc.name : locName} base + ${paiseToRupeeLabel(sur)} ${trLabel} surcharge`
      : `${paiseToRupeeLabel(base)} ${loc ? loc.name : locName} base • no trade surcharge`;
  }
}

/* ---- change history ---- */
function fmtDateTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
  catch (_) { return String(iso).slice(0, 16).replace("T", " "); }
}
async function loadFeeAudit() {
  const wrap = document.getElementById("feeAuditList");
  if (!wrap) return;
  const { data, error } = await client
    .from("fee_audit").select("*")
    .order("changed_at", { ascending: false }).limit(20);
  if (error) {
    wrap.innerHTML = `<p style="color:var(--muted)">Could not load change history${error.message ? " (" + escAttr(error.message) + ")" : ""}.</p>`;
    return;
  }
  if (!data || !data.length) {
    wrap.innerHTML = `<p style="color:var(--muted)">No price changes yet. Edits you make above will be logged here.</p>`;
    return;
  }
  wrap.innerHTML = data.map(a => {
    const oldP = Number(a.old_paise), newP = Number(a.new_paise);
    const dir = newP > oldP ? "up" : (newP < oldP ? "down" : "same");
    const arrow = dir === "up" ? "▲" : (dir === "down" ? "▼" : "•");
    const icon = a.target_type === "trade" ? "🛠️" : "📍";
    return `<div class="price-audit-row">
      <span class="pa-when">${escAttr(fmtDateTime(a.changed_at))}</span>
      <span class="pa-what">${icon} ${escAttr(a.target_name || a.target_type)}</span>
      <span class="pa-change pa-${dir}">${arrow} ${escAttr(paiseToRupeeLabel(a.old_paise))} → ${escAttr(paiseToRupeeLabel(a.new_paise))}</span>
      <span class="pa-who" title="${escAttr(a.changed_by || "")}">${escAttr(a.changed_by || "admin")}</span>
    </div>`;
  }).join("");
}

/* ---- Settings ---- */
function loadSettings() {
  document.getElementById("setPhone").value = ADMIN_SETTINGS.phone;
  document.getElementById("setWhatsapp").value = ADMIN_SETTINGS.whatsapp;
  document.getElementById("setEmail").value = ADMIN_SETTINGS.email;
  document.getElementById("setCompany").value = ADMIN_SETTINGS.company;
  document.getElementById("setAddress").value = ADMIN_SETTINGS.address;
  document.getElementById("setPhoneProc1").value = ADMIN_SETTINGS.phone_proc1;
  document.getElementById("setPhoneProc2").value = ADMIN_SETTINGS.phone_proc2;
}
async function saveSettings() {
  ADMIN_SETTINGS = {
    phone: document.getElementById("setPhone").value,
    whatsapp: document.getElementById("setWhatsapp").value,
    email: document.getElementById("setEmail").value,
    company: document.getElementById("setCompany").value,
    address: document.getElementById("setAddress").value,
    phone_proc1: document.getElementById("setPhoneProc1").value.trim(),
    phone_proc2: document.getElementById("setPhoneProc2").value.trim(),
  };
  const rows = Object.entries(ADMIN_SETTINGS).map(([key, value]) => ({ key, value }));
  const { error } = await client.from("settings").upsert(rows);
  const note = document.getElementById("saveNote");
  note.textContent = error ? "✗ Save failed" : "✓ Saved";
  note.style.color = error ? "#e5484d" : "var(--green)";
  note.classList.remove("hide");
  setTimeout(() => note.classList.add("hide"), 2400);
}

/* ---- Boot ---- */
async function initAdmin() {
  if (!(await requireAuth())) return;
  await loadAll();
}
