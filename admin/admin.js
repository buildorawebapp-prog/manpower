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
let ADMIN_SETTINGS = { phone: "", whatsapp: "", email: "", company: "", address: "" };

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

/* ---- Auth guard + logout ---- */
async function requireAuth() {
  const { data } = await client.auth.getSession();
  if (!data.session) { window.location.href = "login.html"; return false; }
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
  };

  renderStats();
  renderCandidates();
  renderCandidatesMini();
  renderEmployers();
  renderLocationsAdmin();
  renderTradesAdmin();
  loadSettings();
}

/* ---- Candidates ---- */
function renderCandidates() {
  document.getElementById("candBody").innerHTML = CANDIDATES.map(c => `
    <tr>
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
    </tr>`).join("") || emptyRow(8);
  document.getElementById("candCount").textContent = CANDIDATES.length;
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
    </tr>`).join("") || emptyRow(8);
  document.getElementById("empCount").textContent = EMPLOYERS.length;
}
async function setEmpStatus(id, val) {
  const e = EMPLOYERS.find(x => x.id === id); if (e) e.status = val;
  const b = document.getElementById("empBadge-" + id);
  if (b) { b.className = "badge badge-" + val; b.textContent = statusLabel(val); }
  renderStats();
  await client.from("employers").update({ status: val }).eq("id", id);
}

function emptyRow(cols) { return `<tr><td colspan="${cols}" style="text-align:center;color:var(--muted);padding:26px">No records yet.</td></tr>`; }

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

/* ---- Settings ---- */
function loadSettings() {
  document.getElementById("setPhone").value = ADMIN_SETTINGS.phone;
  document.getElementById("setWhatsapp").value = ADMIN_SETTINGS.whatsapp;
  document.getElementById("setEmail").value = ADMIN_SETTINGS.email;
  document.getElementById("setCompany").value = ADMIN_SETTINGS.company;
  document.getElementById("setAddress").value = ADMIN_SETTINGS.address;
}
async function saveSettings() {
  ADMIN_SETTINGS = {
    phone: document.getElementById("setPhone").value,
    whatsapp: document.getElementById("setWhatsapp").value,
    email: document.getElementById("setEmail").value,
    company: document.getElementById("setCompany").value,
    address: document.getElementById("setAddress").value,
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
