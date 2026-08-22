/* ==========================================================================
   Go Hire Consultancy — Hiring Campaigns (public)
   Shared by campaigns.html (full grid + filters) and index.html (featured
   strip). Depends on: js/supabase.js, js/i18n.js, js/app.js.

   Seat model (see supabase/campaigns_migration.sql):
     display_total  → the marketing total we advertise ("50 openings")
     seats_total    → the REAL requirement (10)
     seats_filled   → paid applications so far (server-maintained)
     available      = seats_total - seats_filled          ("10 seats left")
     shown_filled   = display_total - available           (scarcity bar)

   Security: `campaigns` is readable by anon for status IN ('active','filled')
   only, and anon has no write access — so these numbers can't be tampered
   with from the browser. All real validation happens again server-side in
   create_payment_order() before any money is taken.
   ========================================================================== */

/* Cache so the homepage strip and the page grid don't double-fetch. */
let CAMPAIGNS = [];

/* ---------------------------------------------------------------- fetching */
async function fetchCampaigns() {
  const client = (typeof initSupabase === "function") ? initSupabase() : null;
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("campaigns")
      .select("id,title,slug,trade,location,display_total,seats_total,seats_filled,salary_text,experience_required,description,image_url,deadline,status,is_featured,sort_order,created_at")
      .in("status", ["active", "filled"])
      .order("is_featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    CAMPAIGNS = data || [];
  } catch (err) {
    console.warn("Campaigns load failed:", err);
    CAMPAIGNS = [];
  }
  return CAMPAIGNS;
}

/* Fetch a single campaign by id (used by apply.html deep link). */
async function fetchCampaignById(id) {
  if (!id || !isUuid(id)) return null;
  const client = (typeof initSupabase === "function") ? initSupabase() : null;
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("campaigns")
      .select("id,title,trade,location,display_total,seats_total,seats_filled,salary_text,experience_required,deadline,status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (err) {
    console.warn("Campaign lookup failed:", err);
    return null;
  }
}

function isUuid(v) {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

/* ------------------------------------------------------------ seat maths */
function campaignSeats(c) {
  const seatsTotal = Math.max(1, Number(c.seats_total) || 1);
  const filled     = Math.max(0, Number(c.seats_filled) || 0);
  const display    = Math.max(seatsTotal, Number(c.display_total) || seatsTotal);

  const available   = Math.max(0, seatsTotal - filled);
  const shownFilled = Math.max(0, display - available);
  const pct         = Math.min(100, Math.round((shownFilled / display) * 100));

  return { seatsTotal, filled, display, available, shownFilled, pct };
}

/* A campaign is openable only if it's active, has a free seat and hasn't
   expired. This mirrors the server-side check in create_payment_order(). */
function campaignIsOpen(c) {
  if (!c || c.status !== "active") return false;
  if (campaignSeats(c).available <= 0) return false;
  return !campaignDeadlinePassed(c);
}

/* "Today" as a plain YYYY-MM-DD string in IST — the same clock the server uses
   in create_payment_order(). A worker in Dubai and the database must agree on
   when a campaign closes, so we never key this off the visitor's own timezone. */
function campaignTodayIST() {
  // en-CA gives ISO-ish YYYY-MM-DD.
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

function campaignDeadlinePassed(c) {
  if (!c || !c.deadline) return false;
  // Date-only string compare — a campaign is valid through the whole deadline day.
  return String(c.deadline).slice(0, 10) < campaignTodayIST();
}

function campaignDaysLeft(c) {
  if (!c || !c.deadline) return null;
  const today = new Date(campaignTodayIST() + "T00:00:00");
  const d = new Date(String(c.deadline).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime()) || isNaN(today.getTime())) return null;
  return Math.round((d - today) / 86400000);
}

/* ------------------------------------------------------------- rendering */
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function campaignTradeIcon(tradeName) {
  const list = (typeof DEMO_TRADES !== "undefined") ? DEMO_TRADES : [];
  const hit = list.find(t => (t.name || "").trim().toLowerCase() === (tradeName || "").trim().toLowerCase());
  return (hit && hit.icon) || "📣";
}

/* No banner on the campaign? Fall back to the trade's photo. We pass the whole
   trade OBJECT (not just the name) so an admin-uploaded trade photo wins over
   the bundled /images fallback — tradeImage() only checks its hardcoded map
   when it gets a bare string. */
function campaignFallbackImage(tradeName) {
  if (typeof tradeImage !== "function") return null;
  const list = (typeof DEMO_TRADES !== "undefined") ? DEMO_TRADES : [];
  const want = String(tradeName || "").trim().toLowerCase();
  const hit = list.find(t => (t.name || "").trim().toLowerCase() === want);
  return tradeImage(hit || tradeName);
}

function campaignApplyUrl(c) {
  return "apply.html?campaign=" + encodeURIComponent(c.id) +
         "&trade=" + encodeURIComponent(c.trade || "");
}

function campaignCardHTML(c) {
  const s        = campaignSeats(c);
  const open     = campaignIsOpen(c);
  const expired  = campaignDeadlinePassed(c);
  const daysLeft = campaignDaysLeft(c);

  // Seat-pressure level drives the bar + text colour.
  const level = s.available <= 0 ? "none"
              : (s.available <= Math.max(1, Math.ceil(s.seatsTotal * 0.3)) ? "low" : "");

  const img = c.image_url || campaignFallbackImage(c.trade);
  const media = img
    ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(c.title)}" loading="lazy" />`
    : `<span class="camp-icon">${campaignTradeIcon(c.trade)}</span>`;

  const pill = open
    ? `<span class="camp-pill live"><span class="dot"></span>${escapeHtml(t("camp.hiring"))}</span>`
    : `<span class="camp-pill full"><span class="dot"></span>${escapeHtml(
         s.available <= 0 ? t("camp.filled") : (expired ? t("camp.expired") : t("camp.closed"))
       )}</span>`;

  const urgent = (open && level === "low")
    ? `<span class="camp-urgent">${escapeHtml(t("camp.hurry"))}</span>` : "";

  const meta = [];
  if (c.location) meta.push(`<div class="camp-meta-row"><span class="ico">📍</span><span>${escapeHtml(c.location)}</span></div>`);
  if (c.salary_text) meta.push(`<div class="camp-meta-row"><span class="ico">💰</span><b>${escapeHtml(c.salary_text)}</b></div>`);
  if (c.experience_required) meta.push(`<div class="camp-meta-row"><span class="ico">🎯</span><span>${escapeHtml(c.experience_required)}</span></div>`);

  const seatsLeftText = s.available <= 0
    ? t("camp.noSeats")
    : s.available + " " + (s.available === 1 ? t("camp.seatLeft") : t("camp.seatsLeft"));

  let deadlineNote = "";
  if (c.deadline && !expired && daysLeft != null) {
    const soon = daysLeft <= 5;
    const txt = daysLeft === 0 ? t("camp.lastDayToday")
              : daysLeft === 1 ? t("camp.oneDayLeft")
              : daysLeft + " " + t("camp.daysLeft");
    deadlineNote = `<div class="camp-deadline-note${soon ? " soon" : ""}">⏳ ${escapeHtml(txt)}</div>`;
  }

  const cta = open
    ? `<a class="btn btn-primary btn-lg" href="${campaignApplyUrl(c)}">${escapeHtml(t("camp.applyNow"))} →</a>`
    : `<button class="btn btn-primary btn-lg disabled" type="button" disabled>${escapeHtml(
         s.available <= 0 ? t("camp.filled") : t("camp.closed")
       )}</button>`;

  return `
  <article class="camp-card${open ? "" : " is-full"}">
    <div class="camp-media">${media}${pill}${urgent}</div>
    <div class="camp-body">
      <h3 class="camp-title">${escapeHtml(c.title)}</h3>
      <div class="camp-tags">
        <span class="camp-tag trade">${campaignTradeIcon(c.trade)} ${escapeHtml(c.trade)}</span>
        ${c.location ? `<span class="camp-tag">📍 ${escapeHtml(c.location)}</span>` : ""}
      </div>
      ${meta.length ? `<div class="camp-meta">${meta.join("")}</div>` : ""}
      ${c.description ? `<p class="camp-desc">${escapeHtml(c.description)}</p>` : ""}
      <div class="camp-seats">
        <div class="camp-seats-top">
          <span class="camp-seats-total">${s.display} ${escapeHtml(t("camp.openings"))}</span>
          <span class="camp-seats-left ${level}">${escapeHtml(seatsLeftText)}</span>
        </div>
        <div class="camp-bar ${level}"><span style="width:${s.pct}%"></span></div>
      </div>
    </div>
    <div class="camp-foot">
      ${cta}
      ${deadlineNote}
    </div>
  </article>`;
}

function campaignSkeletons(n) {
  return Array.from({ length: n }, () => `<div class="camp-skeleton"></div>`).join("");
}
