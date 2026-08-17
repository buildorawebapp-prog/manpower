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
  phone: "+91 98765 43210",
  whatsapp: "+91 98765 43210",
  company: "Go Hire Consultancy",
  email: "hello@gohireconsultancy.com",
};

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
}

/* ----------------------------------------------------------------------
   Header + footer injection
---------------------------------------------------------------------- */
function buildHeader(active) {
  const links = [
    { href: "index.html",     key: "nav.home" },
    { href: "index.html#services", key: "nav.services" },
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
      <a href="index.html" class="brand">
        <span class="brand-logo"></span>
        <span>Go Hire Consultancy<small data-i18n="brand.tag"></small></span>
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

  return `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="index.html" class="brand" style="color:#fff">
            <span class="brand-logo"></span>
            <span>Go Hire Consultancy</span>
          </a>
          <p data-i18n="footer.about"></p>
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
          <a href="apply.html" data-i18n="nav.apply"></a>
          <a href="hire.html" data-i18n="nav.hire"></a>
        </div>
        <div>
          <h5 data-i18n="footer.getstarted"></h5>
          <a href="apply.html" data-i18n="split.worker.b"></a>
          <a href="hire.html" data-i18n="split.employer.b"></a>
          <a id="footCall" href="#"></a>
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
   Contact wiring (phone / whatsapp)  — DEMO for now
---------------------------------------------------------------------- */
function wireContact() {
  const tel = DEMO_CONTACT.phone.replace(/[^0-9+]/g, "");
  const wa = DEMO_CONTACT.whatsapp.replace(/[^0-9]/g, "");
  document.querySelectorAll("[data-call]").forEach((a) => { a.href = "tel:" + tel; });
  document.querySelectorAll("[data-whatsapp]").forEach((a) => {
    a.href = "https://wa.me/" + wa + "?text=" + encodeURIComponent("Hi Go Hire Consultancy, I'd like to know more.");
    a.target = "_blank"; a.rel = "noopener";
  });
  document.querySelectorAll("[data-phone-text]").forEach((el) => { el.textContent = DEMO_CONTACT.phone; });
  const fc = document.getElementById("footCall");
  if (fc) { fc.href = "tel:" + tel; fc.textContent = DEMO_CONTACT.phone; }
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
