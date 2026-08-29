/* ==========================================================================
   Go Hire Consultancy — Shared app logic
   - Language switching (persists in localStorage)
   - Injects shared header + footer into every page
   - Mobile menu, scroll reveal
   - DEMO data for trades / locations / contact
     >> TODO(Supabase): replace DEMO_* with live data from Supabase later.
   ========================================================================== */

/* ----------------------------------------------------------------------
   DATA
   These start as fallback defaults, then get overwritten by live data
   from Supabase (loadLiveData). If the DB is unreachable, the fallbacks
   keep the site working offline.
---------------------------------------------------------------------- */
let DEMO_CONTACT = {
  phone: "+91 70523 77101",
  whatsapp: "+91 70523 77101",
  company: "Go Hire Consultancy",
  email: "hello@gohireconsultancy.com",
};

/* Social profiles. Kept here (not in the DB) because these are brand-level and
   change roughly never — the footer renders whatever is listed, so adding a
   channel later is one entry. `path` is the icon's SVG path data, inlined so the
   footer needs no icon font and no extra network request. */
const SOCIAL_LINKS = [
  {
    key: "ig", label: "Instagram",
    url: "https://www.instagram.com/gohireconsultancy/",
    path: "M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 1.8.25 2.2.42.6.23 1 .5 1.5.95.45.45.72.9.95 1.5.17.4.36 1 .42 2.2.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.06 1.2-.25 1.8-.42 2.2-.23.6-.5 1-.95 1.5-.45.45-.9.72-1.5.95-.4.17-1 .36-2.2.42-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.06-1.8-.25-2.2-.42-.6-.23-1-.5-1.5-.95-.45-.45-.72-.9-.95-1.5-.17-.4-.36-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.06-1.2.25-1.8.42-2.2.23-.6.5-1 .95-1.5.45-.45.9-.72 1.5-.95.4-.17 1-.36 2.2-.42C8.4 2.2 8.8 2.2 12 2.2zm0 1.98c-3.14 0-3.5.01-4.73.07-.94.04-1.4.2-1.72.32-.36.14-.6.3-.87.57-.27.27-.43.5-.57.87-.13.33-.28.78-.32 1.72-.06 1.23-.07 1.6-.07 4.73s.01 3.5.07 4.73c.04.94.2 1.4.32 1.72.14.36.3.6.57.87.27.27.5.43.87.57.33.13.78.28 1.72.32 1.23.06 1.6.07 4.73.07s3.5-.01 4.73-.07c.94-.04 1.4-.2 1.72-.32.36-.14.6-.3.87-.57.27-.27.43-.5.57-.87.13-.33.28-.78.32-1.72.06-1.23.07-1.6.07-4.73s-.01-3.5-.07-4.73c-.04-.94-.2-1.4-.32-1.72a2.35 2.35 0 0 0-.57-.87 2.35 2.35 0 0 0-.87-.57c-.33-.13-.78-.28-1.72-.32-1.23-.06-1.6-.07-4.73-.07zm0 3.37a4.45 4.45 0 1 1 0 8.9 4.45 4.45 0 0 1 0-8.9zm0 7.34a2.89 2.89 0 1 0 0-5.78 2.89 2.89 0 0 0 0 5.78zm5.66-7.52a1.04 1.04 0 1 1-2.08 0 1.04 1.04 0 0 1 2.08 0z"
  },
  {
    key: "fb", label: "Facebook",
    url: "https://www.facebook.com/profile.php?id=61593844348276",
    path: "M13.5 21.9v-8.7h2.95l.44-3.42H13.5V7.6c0-.99.27-1.66 1.69-1.66h1.8V2.88c-.31-.04-1.38-.13-2.63-.13-2.6 0-4.38 1.59-4.38 4.5v2.51H7.02v3.42h2.96v8.7h3.52z"
  },
  {
    key: "x", label: "X (Twitter)",
    url: "https://x.com/gohireconsult",
    path: "M17.53 3h3.2l-6.99 7.99L21.9 21h-6.3l-4.6-6.02L5.6 21H2.4l7.3-8.34L2.1 3h6.45l4.3 5.68L17.53 3zm-1.12 16.06h1.77L6.68 4.85H4.78l11.63 14.21z"
  },
  {
    key: "yt", label: "YouTube",
    url: "https://www.youtube.com/channel/UCtG7XcDqbpB8Tbj8d1u84bw",
    path: "M21.58 7.19a2.78 2.78 0 0 0-1.96-1.96C17.88 4.75 12 4.75 12 4.75s-5.88 0-7.62.48A2.78 2.78 0 0 0 2.42 7.2C1.95 8.93 1.95 12 1.95 12s0 3.07.47 4.81a2.78 2.78 0 0 0 1.96 1.96c1.74.48 7.62.48 7.62.48s5.88 0 7.62-.48a2.78 2.78 0 0 0 1.96-1.96c.47-1.74.47-4.81.47-4.81s0-3.07-.47-4.81zM10.1 15.35V8.65L15.9 12l-5.8 3.35z"
  },
];

/* Role-tagged contact people.
   The HR Manager row has `phone: null` on purpose — it resolves to
   DEMO_CONTACT.phone, which the admin panel already owns (settings.phone), so
   the big Call/WhatsApp buttons and this card can never drift apart. The two
   procurement numbers get their own settings keys (phone_proc1 / phone_proc2)
   with the values below as offline fallbacks. */
let CONTACT_TEAM = [
  { key: "hr",    roleKey: "contact.role.hr",   icon: "🧑‍💼", phone: null },
  { key: "proc1", roleKey: "contact.role.proc", icon: "📋", phone: "+91 76519 99067" },
  { key: "proc2", roleKey: "contact.role.proc", icon: "📋", phone: "+91 96046 13811" },
];

// icon + i18n-friendly names. `name` shown as-is (proper nouns / trades).
let DEMO_TRADES = [
  { icon: "🛠️", name: "Engineers",        desc: "Civil, mechanical & site engineers." },
  { icon: "🔧", name: "Plumbers",         desc: "Pipe fitting, repairs & installation." },
  { icon: "⚡", name: "Electricians",     desc: "Wiring, fittings & maintenance." },
  { icon: "🔥", name: "Welders",          desc: "Arc, MIG & gas welding experts." },
  { icon: "🧱", name: "Masons",           desc: "Brickwork, plaster & construction." },
  { icon: "🪚", name: "Carpenters",       desc: "Woodwork, framing & finishing." },
  { icon: "🎨", name: "Painters",         desc: "Interior & exterior painting." },
  { icon: "👷", name: "Helpers & Labour", desc: "General site & support workers." },
  { icon: "❄️", name: "AC Technicians",   desc: "HVAC install, service & repair." },
  { icon: "🏗️", name: "Crane Operators",  desc: "Heavy equipment & machinery." },
  { icon: "🚿", name: "Fitters",          desc: "Pipe, structural & pump fitters." },
  { icon: "🧰", name: "Fabricators",      desc: "Metal & steel fabrication." },
];

let DEMO_LOCATIONS = [
  "Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata",
  "Pune", "Ahmedabad", "Surat", "Jaipur", "Lucknow", "Nagpur",
  "Coimbatore", "Kochi", "Visakhapatnam", "Bhubaneswar",
];

const EXP_OPTIONS = ["0–1 years", "1–3 years", "3–5 years", "5–10 years", "10+ years"];

/* Local fallback photos for the seeded trades (bundled in /images).
   The admin can override ANY trade's photo from the dashboard — that
   uploaded image (tr.image) always wins. Trades with neither show the
   coloured icon tile. */
const TRADE_IMAGES = {
  "engineers": "images/engineer.jpg",
  "plumbers": "images/plumber.jpg",
  "electricians": "images/electrician.jpg",
  "welders": "images/welder.jpg",
  "masons": "images/mason.jpg",
  "fitters": "images/plumber.jpg",
  "fabricators": "images/welder.jpg",
  "helpers & labour": "images/worker.jpg",
};
// Prefer the admin-uploaded photo (tr.image), else a bundled local one, else null.
function tradeImage(tr) {
  if (tr && typeof tr === "object") {
    if (tr.image) return tr.image;
    return TRADE_IMAGES[(tr.name || "").trim().toLowerCase()] || null;
  }
  // Backward-compat: called with a plain name string.
  return TRADE_IMAGES[(tr || "").trim().toLowerCase()] || null;
}

/* ----------------------------------------------------------------------
   Live data from Supabase (trades, locations, contact settings)
   Pages call loadLiveData() then an optional onReady callback to re-render.
---------------------------------------------------------------------- */
async function loadLiveData(onReady) {
  const client = (typeof initSupabase === "function") ? initSupabase() : null;
  if (!client) { if (onReady) onReady(); return; }
  try {
    const [tradesRes, locsRes, setRes] = await Promise.all([
      client.from("trades").select("name,icon,descr,image_url").eq("is_active", true).order("sort_order"),
      client.from("locations").select("name").eq("is_active", true).order("name"),
      client.from("settings").select("key,value"),
    ]);

    if (tradesRes.data && tradesRes.data.length) {
      DEMO_TRADES = tradesRes.data.map((t) => ({ icon: t.icon || "🛠️", name: t.name, desc: t.descr || "", image: t.image_url || null }));
    }
    if (locsRes.data && locsRes.data.length) {
      DEMO_LOCATIONS = locsRes.data.map((l) => l.name);
    }
    if (setRes.data && setRes.data.length) {
      const map = {};
      setRes.data.forEach((r) => { map[r.key] = r.value; });
      DEMO_CONTACT = {
        phone: map.phone || DEMO_CONTACT.phone,
        whatsapp: map.whatsapp || DEMO_CONTACT.whatsapp,
        company: map.company || DEMO_CONTACT.company,
        email: map.email || DEMO_CONTACT.email,
        address: map.address || "Al Quoz Third Block - B Office 311, Dubai, UAE",
      };
      /* Procurement numbers are editable from the admin Contact Settings too.
         Only overwrite when the key exists AND is non-empty, so a DB that was
         never given these keys keeps the bundled fallbacks instead of blanking
         the cards. */
      CONTACT_TEAM = CONTACT_TEAM.map((p) => {
        const val = (map["phone_" + p.key] || "").trim();
        return val ? { ...p, phone: val } : p;
      });
    }
  } catch (err) {
    console.warn("Live data load failed, using fallback:", err);
  }
  wireContact();
  if (onReady) onReady();
}

/* ----------------------------------------------------------------------
   i18n engine
---------------------------------------------------------------------- */
const LANG_KEY = "asoka_lang";
function getLang() { return localStorage.getItem(LANG_KEY) || "en"; }
function setLang(code) { localStorage.setItem(LANG_KEY, code); applyLang(code); }

function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}

function applyLang(code) {
  document.documentElement.lang = code;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const val = (I18N[code] && I18N[code][key]) || I18N.en[key];
    if (val != null) el.textContent = val;
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const key = el.getAttribute("data-i18n-ph");
    const val = (I18N[code] && I18N[code][key]) || I18N.en[key];
    if (val != null) el.setAttribute("placeholder", val);
  });
  // update current label in switcher
  const cur = LANGS.find((l) => l.code === code) || LANGS[0];
  const lbl = document.getElementById("langCurrent");
  if (lbl) lbl.textContent = cur.label;
  document.querySelectorAll(".lang-menu button").forEach((b) => {
    b.classList.toggle("active", b.dataset.code === code);
  });
  /* The role tags on the contact cards are translated at render time, not via
     data-i18n, so they have to be rebuilt when the language changes. */
  renderContactTeam();
}

/* ----------------------------------------------------------------------
   Header + footer injection
---------------------------------------------------------------------- */
function buildHeader(active) {
  const links = [
    { href: "index.html",     key: "nav.home" },
    { href: "index.html#services", key: "nav.services" },
    { href: "campaigns.html", key: "nav.campaigns" },
    { href: "locations.html", key: "nav.locations" },
    { href: "apply.html",     key: "nav.apply" },
  ];
  const navLinks = links.map(
    (l) => `<a href="${l.href}" class="${active === l.href ? "active" : ""}" data-i18n="${l.key}"></a>`
  ).join("");

  const langItems = LANGS.map(
    (l) => `<button data-code="${l.code}" onclick="setLang('${l.code}')">
              <span class="flag">${l.flag}</span> ${l.label}
            </button>`
  ).join("");

  const isLoggedIn = sessionStorage.getItem('userId');
  const loginBtn = isLoggedIn
    ? `<a href="user-dashboard.html" class="btn-login-nav" style="margin-left:8px;padding:9px 18px;display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:15px;border-radius:12px;background:rgba(255,138,30,0.12);color:var(--saffron);border:1.5px solid rgba(255,138,30,0.35);text-decoration:none;transition:all .2s;white-space:nowrap;" onmouseover="this.style.background='rgba(255,138,30,0.22)'" onmouseout="this.style.background='rgba(255,138,30,0.12)'">👤 My Dashboard</a>`
    : `<a href="login.html" class="btn-login-nav" style="margin-left:8px;padding:9px 18px;display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:15px;border-radius:12px;background:rgba(255,255,255,0.08);color:var(--navy-900);border:1.5px solid var(--line);text-decoration:none;transition:all .2s;white-space:nowrap;" onmouseover="this.style.background='rgba(11,27,58,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">🔐 Login</a>`;

  return `
  <header class="site-header">
    <div class="container nav">
      <a href="index.html" class="brand brand-lockup" aria-label="Go Hire Consultancy — Bridging Talent, Building Futures">
        <img src="images/full-logo.png" alt="Go Hire Consultancy" class="brand-full" width="900" height="294" />
      </a>
      <nav class="nav-links" id="navLinks">${navLinks}
        <a href="hire.html" class="btn btn-primary" style="margin-left:8px;padding:9px 18px" data-i18n="nav.hire"></a>${loginBtn}
      </nav>
      <div class="nav-right">
        <div class="lang-switch">
          <button class="lang-btn" onclick="toggleLangMenu(event)">
            🌐 <span id="langCurrent">English</span> ▾
          </button>
          <div class="lang-menu" id="langMenu">${langItems}</div>
        </div>
        <button class="hamburger" onclick="toggleNav()" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </header>`;
}

function buildFooter() {
  // Build address from DEMO_CONTACT
  const addr = DEMO_CONTACT.address || "Al Quoz Third Block - B Office 311, Dubai, UAE";
  const addressHTML = typeof addr === 'object'
    ? `${addr.line1 || ''}${addr.line2 ? '<br/>' + addr.line2 : ''}${addr.city ? '<br/>' + addr.city + ', ' + (addr.state || '') + ' - ' + (addr.pincode || '') : ''}`
    : addr;

  /* The footer sits on navy and the logo artwork is navy-on-transparent, so it
     would vanish there. It gets a white rounded plate instead of a second,
     inverted image file — one asset, always legible. */
  return `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="index.html" class="brand brand-lockup" aria-label="Go Hire Consultancy">
            <img src="images/full-logo.png" alt="Go Hire Consultancy" class="brand-full on-plate" width="900" height="294" />
          </a>
          <p data-i18n="footer.about"></p>
          <h5 class="social-head" data-i18n="footer.follow"></h5>
          <div class="footer-social">${buildSocialLinks()}</div>
        </div>
        <div>
          <h5 data-i18n="footer.company"></h5>
          <a href="index.html" data-i18n="nav.home"></a>
          <a href="index.html#why" data-i18n="why.eyebrow"></a>
          <a href="locations.html" data-i18n="nav.locations"></a>
        </div>
        <div>
          <h5 data-i18n="footer.services"></h5>
          <a href="index.html#services" data-i18n="nav.services"></a>
          <a href="campaigns.html" data-i18n="nav.campaigns"></a>
          <a href="apply.html" data-i18n="nav.apply"></a>
          <a href="hire.html" data-i18n="nav.hire"></a>
        </div>
        <div>
          <h5 data-i18n="footer.talk"></h5>
          <div class="contact-team" data-contact-team></div>
          <a class="foot-mail" id="footMail" href="#"></a>
          <div style="margin-top:16px;">
            <h5 style="margin-bottom:12px;">📍 Address</h5>
            <p style="color:rgba(255,255,255,0.8); font-size:14px; line-height:1.6;">${addressHTML}</p>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        © <span id="year"></span> Go Hire Consultancy. <span data-i18n="footer.rights"></span>
      </div>
    </div>
  </footer>`;
}

/* Social icon row — used in the footer, safe to drop anywhere else. */
function buildSocialLinks() {
  return SOCIAL_LINKS.map((s) => `
    <a href="${s.url}" class="is-${s.key}" target="_blank" rel="noopener noreferrer"
       title="${s.label}" aria-label="${s.label}">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${s.path}"/></svg>
    </a>`).join("");
}

function toggleNav() { document.getElementById("navLinks").classList.toggle("mobile-open"); }
function toggleLangMenu(e) {
  e.stopPropagation();
  document.getElementById("langMenu").classList.toggle("open");
}
document.addEventListener("click", () => {
  const m = document.getElementById("langMenu");
  if (m) m.classList.remove("open");
});

/* ----------------------------------------------------------------------
   Scroll reveal
---------------------------------------------------------------------- */
function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

/* ----------------------------------------------------------------------
   Contact wiring (phone / whatsapp / role-tagged team cards)
---------------------------------------------------------------------- */

/* Private to this file — js/campaigns.js also defines a global escapeHtml(),
   and app.js loads on pages that don't include campaigns.js, so it can't rely
   on it (and must not re-declare it). */
function contactSafe(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const telDigits = (p) => String(p || "").replace(/[^0-9+]/g, "");
const waDigits  = (p) => String(p || "").replace(/[^0-9]/g, "");
const WA_TEXT = "Hi Go Hire Consultancy, I'd like to know more.";
const waLink = (p) => "https://wa.me/" + waDigits(p) + "?text=" + encodeURIComponent(WA_TEXT);

/* One house style for every number on the site: +91 XXXXX XXXXX. The three
   numbers arrive written three different ways (DB value, and two the way they
   were handed to us), and a footer showing three formats looks careless.
   Anything that isn't a 10-digit Indian mobile is left exactly as given. */
function formatPhone(raw) {
  const s = String(raw || "").trim();
  const d = s.replace(/[^0-9]/g, "");
  if (/^91[6-9]\d{9}$/.test(d)) return "+91 " + d.slice(2, 7) + " " + d.slice(7);
  if (/^[6-9]\d{9}$/.test(d) && !s.startsWith("+")) return "+91 " + d.slice(0, 5) + " " + d.slice(5);
  return s;
}

/* Groups CONTACT_TEAM by role so "Procurement Coordinator" is one card with two
   numbers rather than the same tag printed twice. */
function contactTeamGroups() {
  const groups = [];
  CONTACT_TEAM.forEach((p) => {
    const phone = (p.phone || DEMO_CONTACT.phone || "").trim();
    if (!phone) return;
    let g = groups.find((x) => x.roleKey === p.roleKey);
    if (!g) { g = { roleKey: p.roleKey, icon: p.icon, phones: [] }; groups.push(g); }
    if (!g.phones.some((x) => waDigits(x) === waDigits(phone))) g.phones.push(phone);
  });
  return groups;
}

const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84c0 1.74.46 3.44 1.32 4.93L2 22l5.35-1.4a9.8 9.8 0 0 0 4.69 1.2h.01c5.43 0 9.84-4.4 9.84-9.84A9.78 9.78 0 0 0 12.04 2zm0 17.96h-.01a8.15 8.15 0 0 1-4.15-1.14l-.3-.18-3.08.81.82-3.01-.19-.31a8.13 8.13 0 0 1-1.25-4.34c0-4.51 3.67-8.18 8.18-8.18a8.14 8.14 0 0 1 8.16 8.19c0 4.51-3.67 8.16-8.18 8.16zm4.49-6.11c-.25-.12-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12-.17.25-.66.8-.81.97-.15.17-.3.19-.55.06a6.66 6.66 0 0 1-1.96-1.21 7.4 7.4 0 0 1-1.36-1.69c-.14-.25-.02-.38.11-.51.11-.11.25-.3.37-.45.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.55-1.34-.76-1.83-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.42.06-.64.31-.22.25-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.17 1.7 2.6 4.11 3.64.57.25 1.02.4 1.37.51.58.18 1.1.16 1.52.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.47-.28z"/></svg>';

function renderContactTeam() {
  const nodes = document.querySelectorAll("[data-contact-team]");
  if (!nodes.length) return;
  const html = contactTeamGroups().map((g) => {
    const role = t(g.roleKey);
    const lines = g.phones.map((ph) => {
      const shown = formatPhone(ph);
      return `<div class="tcard-line">
          <a class="tcard-num" href="tel:${contactSafe(telDigits(ph))}">${contactSafe(shown)}</a>
          <a class="tcard-wa" href="${contactSafe(waLink(ph))}" target="_blank" rel="noopener noreferrer"
             title="WhatsApp ${contactSafe(shown)}"
             aria-label="WhatsApp ${contactSafe(role)} ${contactSafe(shown)}">${WA_ICON}</a>
        </div>`;
    }).join("");
    return `<div class="tcard">
        <span class="tcard-role"><span class="tcard-ico" aria-hidden="true">${g.icon || "📞"}</span>${contactSafe(role)}</span>
        ${lines}
      </div>`;
  }).join("");
  nodes.forEach((el) => { el.innerHTML = html; });
}

function wireContact() {
  const tel = telDigits(DEMO_CONTACT.phone);
  document.querySelectorAll("[data-call]").forEach((a) => { a.href = "tel:" + tel; });
  document.querySelectorAll("[data-whatsapp]").forEach((a) => {
    a.href = waLink(DEMO_CONTACT.whatsapp);
    a.target = "_blank"; a.rel = "noopener";
  });
  document.querySelectorAll("[data-phone-text]").forEach((el) => { el.textContent = formatPhone(DEMO_CONTACT.phone); });
  /* Kept for any page that still has the old single-number footer link. */
  const fc = document.getElementById("footCall");
  if (fc) { fc.href = "tel:" + tel; fc.textContent = formatPhone(DEMO_CONTACT.phone); }
  const fm = document.getElementById("footMail");
  if (fm && DEMO_CONTACT.email) {
    fm.href = "mailto:" + DEMO_CONTACT.email;
    fm.textContent = "✉️ " + DEMO_CONTACT.email;
  }
  renderContactTeam();
}

/* ----------------------------------------------------------------------
   Boot — call on every page
---------------------------------------------------------------------- */
function initShell(activePage) {
  const h = document.getElementById("header-slot");
  const f = document.getElementById("footer-slot");
  if (h) h.innerHTML = buildHeader(activePage);
  if (f) f.innerHTML = buildFooter();
  const yr = document.getElementById("year");
  if (yr) yr.textContent = new Date().getFullYear();
  applyLang(getLang());
  wireContact();
  initReveal();
}
