// src/CinemaWeb/CinemaWebApp.jsx
// karyaOS — Cinema Web Booking (customer-facing, mobile + desktop)
// Route: /?movies=1
// Flow: outlet pick → films grid → showtime → seats → checkout → success
//
// Reuses backend /api/cinema/* (films, showtimes, seats, tickets).
// Premium dark theme, brand-aware via /api/companies/branding.

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import QRCode from "qrcode";
import API_HOST from "../apiBase.js";
import { fmtMoney as rp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";
import { ErrorInline } from "../components/ConnectionError.jsx";
import CinemaCelebration from "../CinemaCelebration.jsx";
import { useTenantTheme } from "../lib/tenantTheme.js";
import { LocaleSwitcher } from "../i18n";

// ════════════════════════════════════════════════════════════════════
// PREMIUM SKELETON COMPONENTS
// ════════════════════════════════════════════════════════════════════
function Skeleton({ w, h, r = 8, style }) {
  return <div className="cw-skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

function GridSkeleton({ count = 6, height = 160 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="cw-skeleton" style={{ height, borderRadius: 14, animationDelay: `${i * 0.06}s` }} />
      ))}
    </div>
  );
}

function FilmGridSkeleton({ count = 6 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))", gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ animationDelay: `${i * 0.06}s` }}>
          <div className="cw-skeleton" style={{ aspectRatio: "2/3", borderRadius: 12, marginBottom: 8 }} />
          <Skeleton h={14} w="70%" />
          <div style={{ height: 4 }} />
          <Skeleton h={10} w="50%" />
        </div>
      ))}
    </div>
  );
}

// Star rating display (read-only). value 0..5 (decimals ok).
function Stars({ value = 0, size = 14, color = "#d4af37", muted = "#3f3f46" }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span style={{ position: "relative", display: "inline-block", lineHeight: 1, fontSize: size, letterSpacing: 1, fontFamily: "sans-serif" }} aria-label={`Rating ${v.toFixed(1)} dari 5`}>
      <span style={{ color: muted }}>★★★★★</span>
      <span style={{ color, position: "absolute", inset: 0, overflow: "hidden", width: `${(v / 5) * 100}%`, whiteSpace: "nowrap" }}>★★★★★</span>
    </span>
  );
}

// Interactive star picker (1..5). onChange(n) called on click.
function StarsPicker({ value = 0, onChange, size = 28, color = "#d4af37" }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div style={{ display: "inline-flex", gap: 4 }} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: size, lineHeight: 1, padding: 2,
            color: n <= shown ? color : "#3f3f46",
            transition: "transform 0.1s, color 0.15s",
            transform: n === hover ? "scale(1.15)" : "scale(1)",
          }}
          aria-label={`Beri ${n} bintang`}>★</button>
      ))}
    </div>
  );
}

// Load Midtrans Snap.js once per page lifecycle. Returns Promise resolved when
// window.snap is ready. Idempotent — multiple calls share the same load.
let _snapPromise = null;
function loadSnapScript() {
  if (_snapPromise) return _snapPromise;
  _snapPromise = new Promise((resolve, reject) => {
    fetch(`${API_HOST}/api/payment/config`)
      .then(r => r.json())
      .then(cfg => {
        if (!cfg.configured) { reject(new Error("Midtrans not configured on server")); return; }
        const s = document.createElement("script");
        s.src = cfg.snapUrl;
        s.setAttribute("data-client-key", cfg.clientKey || "");
        s.onload = () => resolve(window.snap);
        s.onerror = () => reject(new Error("Failed to load Snap.js"));
        document.head.appendChild(s);
      })
      .catch(reject);
  });
  return _snapPromise;
}

// Netflix-mood: flat dark #141414, no gradient (cinematic streaming standard)
// Semantic cinema accents:
//   - gold (NOW PLAYING, premium IMAX, ratings) — aspirational warmth
//   - crimson (PREMIERE, urgent, limited) — alert/scarcity drama
//   - brand (purple — secondary accent, customization)
const C = {
  bg: "#141414",
  bgGrad: "#141414",
  card: "rgba(255,255,255,0.04)",
  cardHover: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.1)",
  borderSubtle: "rgba(255,255,255,0.06)",
  text: "#fafafa",
  sub: "rgba(250,250,250,0.7)",
  dim: "rgba(250,250,250,0.45)",
  meta: "rgba(250,250,250,0.55)",
  brand: "#a855f7",
  amber: "#fbbf24",
  green: "#10b981",
  red: "#ef4444",
  // ─── CINEMA SEMANTIC PALETTE ───
  gold:    "#fbbf24",   // NOW PLAYING, IMAX/premium, rating stars — aspirational
  goldDim: "#92710a",   // gold accent at 30% opacity feel
  crimson: "#dc2626",   // PREMIERE, urgent, last-show, sold-out — drama
  ember:   "#f59e0b",   // PRE-SALE, COMING SOON warm accent (between gold + crimson)
  premium: "#fbbf24",   // IMAX/4DX/Premium format badges
  midnight: "#0a0a0f",  // deeper dark for vignettes/overlays
};

// ════════════════════════════════════════════════════════════════════
// DESIGN TOKENS — Stripe/Linear/Vercel inspired scale
// Single source of truth. NEVER hardcode size/weight/spacing dlm style{}.
// ════════════════════════════════════════════════════════════════════
//
// Typography scale — 7 tier. Skip-fibonacci untuk visual rhythm jelas.
// Pakai sebagai T.lg, T.bold, T.tracking_wider, T.sans, dst.
const T = {
  // Size (px)
  xs:    11,    // meta, eyebrow, caption, copyright
  sm:    13,   // body secondary, footer link, table cell
  base:  14,   // body default, button label
  md:    16,   // emphasized body, list item primary
  lg:    18,   // card title, footer brand name
  xl:    22,   // section heading, modal title
  '2xl': 28,  // page heading
  '3xl': 40,  // hero / large display
  '4xl': 56,  // landing hero only

  // Weight — pakai semibold (600) sebagai default heading, bukan 800.
  // 800/900 cuma utk hero atau emphasis dramatis. Body 400, never 600+.
  regular:  400,
  medium:   500,
  semibold: 600,
  bold:     700,
  black:    800,

  // Line-height (unitless)
  tight:   1.15,   // > 24px headings — biar gak floppy
  snug:    1.35,   // 16-22px headings
  normal:  1.5,    // body text
  relaxed: 1.65,   // long paragraphs

  // Letter-spacing (em) — Stripe: tight di big headings, wide di eyebrows mono
  tracking_tight:  '-0.02em',  // > 28px
  tracking_normal: '0',
  tracking_wide:   '0.04em',   // small body emphasis
  tracking_wider:  '0.12em',   // uppercase eyebrow / mono label

  // Font families — Inter utk semuanya, JetBrains Mono khusus meta/numerik/code
  sans: "'Inter', 'SF Pro Text', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', Menlo, ui-monospace, monospace",
};

// ────────────────────────────────────────────────────────────────────
// Typography PRESETS — composed style objects (size+weight+line-height+tracking).
// Pakai ini daripada inline {fontSize: NN, fontWeight: 800, ...} berulang-ulang.
// Hierarchy pyramid: display → headline → title → subtitle → body → caption → eyebrow.
// Setiap preset adalah style object spreadable: <div style={{ ...TY.headline, color: "#fff" }}>
// ────────────────────────────────────────────────────────────────────
const TY = {
  // DISPLAY — landing hero only (1 per page). Theatrical drama.
  display: {
    fontSize: 'clamp(40px, 6vw, 72px)',
    fontWeight: 900,
    lineHeight: 1.05,
    letterSpacing: '-0.035em',
    fontFamily: T.sans,
  },
  // HEADLINE — page heading, FilmDetail title. Strong but readable.
  headline: {
    fontSize: 'clamp(28px, 3.6vw, 44px)',
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '-0.025em',
    fontFamily: T.sans,
  },
  // TITLE — card title, modal title, section heading.
  title: {
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.25,
    letterSpacing: '-0.012em',
    fontFamily: T.sans,
  },
  // SUBTITLE — section sub, sub-card heading.
  subtitle: {
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: '-0.005em',
    fontFamily: T.sans,
  },
  // BODY — paragraph default, list item primary.
  body: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.55,
    letterSpacing: '0',
    fontFamily: T.sans,
  },
  // BODY-SM — secondary text, footer body.
  bodySm: {
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.55,
    letterSpacing: '0',
    fontFamily: T.sans,
  },
  // CAPTION — meta, helper text, fine print.
  caption: {
    fontSize: 11.5,
    fontWeight: 500,
    lineHeight: 1.45,
    letterSpacing: '0.005em',
    fontFamily: T.sans,
  },
  // EYEBROW — uppercase label di atas heading. Use mono for premium feel.
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    fontFamily: T.mono,
  },
  // NUMBER — large numeric display (price, stat) — mono for tabular feel.
  number: {
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1.05,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: T.mono,
  },
  // BUTTON — CTA label.
  button: {
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-0.005em',
    fontFamily: T.sans,
  },
};

// Spacing scale (px) — 4px base. S[1]=4, S[4]=16, S[6]=24, dst.
// PENTING: numeric key >= 10 harus pakai bracket access: S[10], S[12], S[16]
// (JS parser: S[10] invalid — `10` interpreted as number literal, bukan identifier)
const S = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80, 24: 96 };

// Built-in steps — custom slugs from admin akan auto-allowed via fallback
const BUILTIN_STEPS = ["outlet", "films", "filmDetail", "showtime", "seats", "bundles", "checkout", "success", "about", "history", "movies", "promo", "studio", "locations", "faq"];
const STEPS = BUILTIN_STEPS;  // legacy alias

// ════════════════════════════════════════════════════════════════════
// DRAFT BOOKING PERSISTENCE
// ════════════════════════════════════════════════════════════════════
const DRAFT_KEY = "cinema_web_draft";
const DRAFT_TTL_HOURS = 48;

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!d) return null;
    // TTL: hapus kalau >48h
    if (Date.now() - (d.timestamp || 0) > DRAFT_TTL_HOURS * 3600 * 1000) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    // Expired showtime check: kalau show_date+start_time sudah lewat
    if (d.showtime?.show_date) {
      const [Y, M, D] = String(d.showtime.show_date).split("-").map(Number);
      const [h, m] = String(d.showtime.start_time || "00:00").split(":").map(Number);
      const shouldStart = new Date(Y, M - 1, D, h, m).getTime();
      // Beri buffer 15 menit (booking masih bisa hingga showtime - 15m)
      if (shouldStart - 15 * 60 * 1000 < Date.now()) {
        localStorage.removeItem(DRAFT_KEY);
        return null;
      }
    }
    return d;
  } catch { return null; }
}
function saveDraft(d) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, timestamp: Date.now() })); } catch {}
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

export default function CinemaWebApp() {
  const [step, setStep] = useState(() => {
    // Persist outlet selection across reload
    try {
      const o = localStorage.getItem("cinema_web_outlet");
      return o ? "films" : "outlet";
    } catch { return "outlet"; }
  });
  const [outlet, setOutlet] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cinema_web_outlet") || "null"); }
    catch { return null; }
  });
  const [film, setFilm] = useState(null);
  const [showtime, setShowtime] = useState(null);
  const [seats, setSeats] = useState([]);
  const [bundlesCart, setBundlesCart] = useState({}); // { [bundle_id]: qty }
  const [booking, setBooking] = useState(null); // result from POST /tickets
  // Signed-in user session (phone-based, persisted)
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cinema_web_session") || "null"); } catch { return null; }
  });
  const [signInOpen, setSignInOpen] = useState(false);

  // Brand theming (auto-load tenant brand for color hint)
  const [brand, setBrand] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/companies/branding`).then(r => r.json()).then(setBrand).catch(() => {});
  }, []);
  const brandPrimary = brand?.brand_color || "#a855f7";

  // P5 — Theme Studio (shared helper)
  const { fontFamily: resolvedFontFamily, background: resolvedBackground } = useTenantTheme(brand, { fallbackBg: C.bgGrad });

  // Web config (nav + footer customization per tenant)
  const [webConfig, setWebConfig] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/web-config`).then(r => r.json()).then(d => setWebConfig(d.config || {})).catch(() => setWebConfig({}));
  }, []);
  // Resolved nav: pakai config kalau ada, fallback default
  const resolvedNavItems = (webConfig?.nav_items && Array.isArray(webConfig.nav_items) && webConfig.nav_items.length)
    ? webConfig.nav_items.filter(i => i.visible !== false).sort((a, b) => (a.order || 0) - (b.order || 0))
    : NAV_ITEMS;
  const resolvedFooterConfig = webConfig?.footer_config || null;

  const pickOutlet = (o) => {
    setOutlet(o);
    try { localStorage.setItem("cinema_web_outlet", JSON.stringify(o)); } catch {}
    // Kalau user udah pilih featured film dari hero, langsung lanjut ke filmDetail
    setStep(film ? "filmDetail" : "films");
  };
  const resetOutlet = () => {
    try { localStorage.removeItem("cinema_web_outlet"); } catch {}
    setOutlet(null);
    setFilm(null); setShowtime(null); setSeats([]); setBooking(null);
    setStep("outlet");
  };

  // Cross-step navigation helpers
  const goBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };
  const goTo = (s) => setStep(s);
  // Click brand → go to home (outlet picker) but keep outlet selection
  const goHome = () => {
    setFilm(null); setShowtime(null); setSeats([]); setBundlesCart({}); setBooking(null);
    setStep(outlet ? "films" : "outlet");
  };
  const handleSignIn = (sess) => {
    setSession(sess);
    try { localStorage.setItem("cinema_web_session", JSON.stringify(sess)); } catch {}
    setSignInOpen(false);
  };
  const handleSignOut = () => {
    setSession(null);
    try { localStorage.removeItem("cinema_web_session"); } catch {}
  };

  // ═══ DRAFT AUTO-SAVE: simpan saat user pilih sesuatu di flow booking ═══
  // Save kalau punya film + outlet (dari step "filmDetail" ke atas, sebelum "success")
  useEffect(() => {
    if (!film || !outlet) return;
    if (step === "success" || step === "outlet" || step === "films") return;
    // Hanya save STEPS yg di-flow booking
    if (!["filmDetail", "showtime", "seats", "bundles", "checkout"].includes(step)) return;
    saveDraft({
      outlet: { code: outlet.code, name: outlet.name, area: outlet.area },
      film: { id: film.id, title: film.title, poster_url: film.poster_url, duration_min: film.duration_min, genre: film.genre, rating: film.rating },
      showtime: showtime ? { id: showtime.id, show_date: showtime.show_date, start_time: showtime.start_time, format: showtime.format, studio_name: showtime.studio_name } : null,
      seats,
      bundlesCart,
      lastStep: step,
    });
  }, [film, outlet, showtime, seats, bundlesCart, step]);

  // ═══ AUTO-CLEAR DRAFT pada success ═══
  useEffect(() => {
    if (step === "success") clearDraft();
  }, [step]);

  // ═══ RESTORE DRAFT (klik "Lanjutkan Booking" di home) ═══
  const restoreDraft = useCallback((d) => {
    if (!d) return;
    if (d.outlet) {
      setOutlet(d.outlet);
      try { localStorage.setItem("cinema_web_outlet", JSON.stringify(d.outlet)); } catch {}
    }
    if (d.film) setFilm(d.film);
    if (d.showtime) setShowtime(d.showtime);
    if (d.seats) setSeats(d.seats);
    if (d.bundlesCart) setBundlesCart(d.bundlesCart);
    setStep(d.lastStep || "filmDetail");
  }, []);
  const dismissDraft = useCallback(() => clearDraft(), []);

  return (
    <div style={{ minHeight: "100vh", background: resolvedBackground, color: C.text, fontFamily: resolvedFontFamily, paddingBottom: 80, ["--brand-primary"]: brandPrimary }}>
      <style>{`
        /* ═══ PREMIUM TYPOGRAPHY SYSTEM ═══ */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');

        /* Apply Inter as primary, tighter rendering */
        body, .cw-section-pad, .cw-section-pad * {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
          font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11', 'ss01';
        }

        /* Custom scrollbar — thin, brand-aware */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

        /* Selection color */
        ::selection { background: rgba(168,85,247,0.35); color: #fff; }

        /* Smooth scroll */
        html { scroll-behavior: smooth; }

        /* Animations */
        @keyframes cwFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cwFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cwHeroGlow { 0%,100% { filter: drop-shadow(0 0 24px rgba(168,85,247,0.3)); } 50% { filter: drop-shadow(0 0 36px rgba(168,85,247,0.55)); } }
        @keyframes cwPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes cwShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

        /* Premium skeleton shimmer */
        .cw-skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
          background-size: 200% 100%;
          animation: cwShimmer 1.5s ease-in-out infinite;
          border-radius: 8px;
        }

        /* Footer link hover */
        footer a, footer button { transition: color 0.15s ease; }
        footer a:hover, footer button:hover { color: #fff !important; }

        /* ═══ PREMIUM GLASS CARD ═══
           Apply via className="cw-glass" to any card container.
           Inline style boleh tetap ada utk padding/radius — class hanya handle
           bg/border/shadow utk glassmorphism layered look. */
        .cw-glass {
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)) !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          backdrop-filter: blur(16px) saturate(140%);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.06) inset,                /* top highlight */
            0 -1px 0 rgba(0,0,0,0.3) inset,                       /* bottom shade */
            0 8px 24px rgba(0,0,0,0.35),                          /* drop shadow */
            0 1px 2px rgba(0,0,0,0.25);
          position: relative;
          transition: transform 0.25s cubic-bezier(.2,.8,.2,1),
                      box-shadow 0.25s cubic-bezier(.2,.8,.2,1),
                      border-color 0.25s;
        }
        .cw-glass::before {
          content: '';
          position: absolute; inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg,
            rgba(255,255,255,0.22) 0%,
            rgba(255,255,255,0.04) 35%,
            rgba(255,255,255,0.02) 65%,
            rgba(255,255,255,0.10) 100%);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        .cw-glass:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.14) !important;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.09) inset,
            0 -1px 0 rgba(0,0,0,0.3) inset,
            0 16px 40px rgba(0,0,0,0.45),
            0 2px 6px rgba(0,0,0,0.3);
        }

        /* Variant: glass dgn brand glow di top edge (utk featured/hero cards) */
        .cw-glass-brand::after {
          content: '';
          position: absolute;
          top: 0; left: 12%; right: 12%; height: 1px;
          background: linear-gradient(90deg,
            transparent,
            var(--brand-primary, #f97316) 50%,
            transparent);
          opacity: 0.7;
          pointer-events: none;
          border-radius: inherit;
        }

        /* Auto-apply glass treatment ke SEMUA inline-styled card yg pakai
           background: C.card (rgba(255,255,255,0.04)). Match string yg cukup
           spesifik biar gak nyangkut element lain. */
        [style*="background: rgba(255,255,255,0.04)"],
        [style*="background:rgba(255,255,255,0.04)"] {
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.06) inset,
            0 -1px 0 rgba(0,0,0,0.25) inset,
            0 6px 20px rgba(0,0,0,0.32),
            0 1px 2px rgba(0,0,0,0.2);
          transition: transform 0.25s cubic-bezier(.2,.8,.2,1),
                      box-shadow 0.25s cubic-bezier(.2,.8,.2,1),
                      border-color 0.25s;
        }
        [style*="background: rgba(255,255,255,0.04)"]:hover,
        [style*="background:rgba(255,255,255,0.04)"]:hover {
          box-shadow:
            0 1px 0 rgba(255,255,255,0.1) inset,
            0 -1px 0 rgba(0,0,0,0.3) inset,
            0 14px 36px rgba(0,0,0,0.45),
            0 2px 6px rgba(0,0,0,0.28);
        }

        /* Legacy alias — beberapa file lain mungkin sudah pakai */
        .cw-card-premium {
          transition: transform 0.3s cubic-bezier(.2,.8,.2,1), box-shadow 0.3s cubic-bezier(.2,.8,.2,1), border-color 0.3s;
          position: relative;
        }
        .cw-card-premium::before {
          content: '';
          position: absolute; inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }

        .cw-film-poster:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 14px 36px rgba(168,85,247,0.4); }
        .cw-outlet-card { transform: translateY(0); }
        .cw-outlet-card:hover { transform: translateY(-6px); box-shadow: 0 16px 40px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.1); }
        .cw-outlet-card:active { transform: translateY(-2px); }
        .cw-location-card { transform: translateY(0); }
        .cw-location-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08) !important; border-color: rgba(255,255,255,0.15) !important; }
        .cw-section-pad > * { animation: cwFadeUp 0.4s ease both; }
        .cw-section-pad > *:nth-child(2) { animation-delay: 0.08s; }
        .cw-section-pad > *:nth-child(3) { animation-delay: 0.16s; }

        /* Hide scrollbar on carousel for clean look */
        .cw-section-pad > div::-webkit-scrollbar { display: none; }

        /* ═══════════════════════════════════════════════════════════
           NETFLIX FILM ROW — horizontal carousel + tile hover
           ═══════════════════════════════════════════════════════════ */
        .cw-row-track {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .cw-row-track::-webkit-scrollbar { display: none; }
        .cw-genre-chips::-webkit-scrollbar { display: none; }

        .cw-row-card {
          will-change: transform;
        }
        .cw-row-card:hover {
          transform: scale(1.14) translateY(-8px);
          z-index: 10;
        }
        /* Cinema premium hover — gold ring + deeper shadow + golden glow accent */
        .cw-row-card:hover > div {
          box-shadow: 0 18px 42px rgba(0,0,0,0.72), 0 0 0 2px rgba(251,191,36,0.65), 0 0 28px rgba(251,191,36,0.18);
        }
        .cw-row-card:hover .cw-row-card-info {
          opacity: 1 !important;
        }
        /* Play button reveal — gold pill bounces in on hover */
        .cw-row-card .cw-card-play {
          opacity: 0; transform: scale(0.7) translateY(8px);
          transition: opacity 0.28s ease, transform 0.32s cubic-bezier(.34,1.56,.64,1);
        }
        .cw-row-card:hover .cw-card-play {
          opacity: 1; transform: scale(1) translateY(0);
        }

        /* Seat picker — hover + tap drama (premium cinema feel) */
        .cw-seat:not(:disabled):hover {
          transform: translateY(-2px) scale(1.08);
          background: rgba(251,191,36,0.18) !important;
          border-color: rgba(251,191,36,0.5) !important;
          color: #fafafa !important;
          box-shadow: 0 4px 12px rgba(251,191,36,0.35), inset 0 1px 0 rgba(255,255,255,0.15) !important;
        }
        @keyframes cwSeatTap {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.25); }
          100% { transform: scale(1); }
        }
        .cw-seat-tapped {
          animation: cwSeatTap 0.28s cubic-bezier(.34,1.56,.64,1);
        }
        /* Ujung karena di-scale, kasih ruang lebih utk hover yg di edge */
        .cw-row-card:first-child:hover {
          transform-origin: left bottom;
        }
        .cw-row-card:last-child:hover {
          transform-origin: right bottom;
        }

        /* Mobile responsive overrides */
        @media (max-width: 900px) {
          .cw-nav-desktop { display: none !important; }
          .cw-nav-mobile-toggle { display: inline-flex !important; align-items: center; justify-content: center; }
          .cw-nav-mobile-menu { display: block !important; }
        }
        @media (max-width: 768px) {
          .cw-checkout { grid-template-columns: 1fr !important; gap: 16px !important; }
          .cw-checkout aside > div { position: static !important; }
          .cw-header h1 { font-size: 14px !important; }
          .cw-outlet-pill { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .cw-page-title { font-size: 24px !important; }
          .cw-films-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .cw-bundles-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .cw-showtimes-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .cw-seat { width: 22px !important; height: 22px !important; font-size: 7px !important; }
          .cw-seat-row { gap: 4px !important; margin-bottom: 4px !important; }
          /* Netflix billboard hero mobile-friendly */
          .cw-hero-billboard { min-height: 75vh !important; }
          .cw-hero-billboard > div { padding: 80px 20px 60px !important; min-height: 75vh !important; }
          .cw-hero-billboard h1 { font-size: clamp(28px, 9vw, 44px) !important; letter-spacing: -1.2 !important; }
          .cw-hero-cta { width: 100% !important; justify-content: center !important; }
          .cw-hero-dots { position: static !important; margin-top: 18px !important; }
          /* FilmRow chevron always visible di touch */
          .cw-row-chevron { opacity: 0.85 !important; width: 36px !important; font-size: 22px !important; }
          .cw-row-card:hover { transform: scale(1) translateY(0) !important; }
          .cw-row-card:hover .cw-row-card-info { opacity: 0 !important; }
        }
          .cw-section-pad { padding: 20px 0 !important; }
        }
        @media (max-width: 420px) {
          .cw-films-grid { grid-template-columns: 1fr !important; }
          .cw-bundles-grid { grid-template-columns: 1fr !important; }
          .cw-showtimes-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .cw-seat { width: 18px !important; height: 18px !important; }
        }
      `}</style>
      <Header
        outlet={outlet} step={step}
        onResetOutlet={resetOutlet} onBack={goBack} onHome={goHome}
        brand={brand} brandPrimary={brandPrimary}
        session={session} onSignInClick={() => setSignInOpen(true)} onSignOut={handleSignOut}
        onNav={(target) => goTo(target)}
        onPickFilm={(f) => { setFilm(f); goTo(outlet ? "filmDetail" : "outlet"); }}
        navItems={resolvedNavItems}
      />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px" }}>
        {step === "outlet" && (
          <OutletPicker
            onPick={pickOutlet}
            pendingFilm={film}
            onPickFeaturedFilm={(f) => {
              setFilm(f);
              // User belum pilih outlet → tetap di sini, scroll ke outlet grid
              setTimeout(() => {
                const el = document.querySelector('.cw-outlets-grid');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 100);
            }}
            brandPrimary={brandPrimary}
            onRestoreDraft={restoreDraft}
            onDismissDraft={dismissDraft}
          />
        )}
        {step === "films" && outlet && (
          <>
            <ContinueBookingRow brandPrimary={brandPrimary} onRestore={restoreDraft} onDismiss={dismissDraft} />
            <FilmsGrid outlet={outlet} onPickFilm={(f) => { setFilm(f); goTo("filmDetail"); }} brandPrimary={brandPrimary} />
          </>
        )}
        {step === "filmDetail" && film && (
          <FilmDetail outlet={outlet} film={film} onPickShowtime={() => goTo("showtime")} brandPrimary={brandPrimary} session={session} onSignInClick={() => setSignInOpen(true)} />
        )}
        {step === "showtime" && film && (
          <ShowtimesList outlet={outlet} film={film} onPickShowtime={(s) => { setShowtime(s); goTo("seats"); }} brandPrimary={brandPrimary} />
        )}
        {step === "seats" && showtime && (
          <SeatPicker showtime={showtime} film={film} initialSeats={seats}
            onConfirm={(picked) => { setSeats(picked); goTo("bundles"); }}
            brandPrimary={brandPrimary} />
        )}
        {step === "bundles" && (
          <BundlesStep outlet={outlet} cart={bundlesCart}
            onChange={setBundlesCart}
            onContinue={() => goTo("checkout")}
            brandPrimary={brandPrimary} />
        )}
        {step === "checkout" && (
          <Checkout outlet={outlet} film={film} showtime={showtime} seats={seats}
            bundlesCart={bundlesCart}
            onBooked={(b) => { setBooking(b); goTo("success"); }}
            onEdit={(target) => goTo(target)}
            brandPrimary={brandPrimary} />
        )}
        {step === "success" && booking && (
          <SuccessPage booking={booking} film={film} showtime={showtime} seats={seats}
            bundlesCart={bundlesCart}
            onNewBooking={() => { setFilm(null); setShowtime(null); setSeats([]); setBundlesCart({}); setBooking(null); setStep("outlet"); }}
            brandPrimary={brandPrimary} />
        )}
        {step === "about" && (
          <AboutPage brand={brand} brandPrimary={brandPrimary} onBack={goHome} heroOverride={webConfig?.page_heros?.about} />
        )}
        {step === "history" && (
          <HistoryPage session={session} brandPrimary={brandPrimary} onSignInClick={() => setSignInOpen(true)} />
        )}
        {step === "movies" && (
          <MoviesPage brandPrimary={brandPrimary} session={session} onPick={(f) => { setFilm(f); goTo(outlet ? "filmDetail" : "outlet"); }} sectionToggles={webConfig?.section_toggles} customSections={webConfig?.custom_sections} />
        )}
        {step === "promo" && (
          <PromoPage brandPrimary={brandPrimary} heroOverride={webConfig?.page_heros?.promo} />
        )}
        {step === "studio" && (
          <StudioPage brandPrimary={brandPrimary} heroOverride={webConfig?.page_heros?.studio} />
        )}
        {step === "locations" && (
          <LocationsPage brandPrimary={brandPrimary} onPick={pickOutlet} heroOverride={webConfig?.page_heros?.locations} />
        )}
        {step === "faq" && (
          <FAQPage brandPrimary={brandPrimary} customFaqGroups={webConfig?.faq_groups} heroOverride={webConfig?.page_heros?.faq} />
        )}
        {/* Custom pages (admin-defined) */}
        {(() => {
          const cp = (webConfig?.custom_pages || []).find(p => p.slug === step && p.visible !== false);
          return cp ? <CustomPage page={cp} brandPrimary={brandPrimary} /> : null;
        })()}
      </main>
      <Footer brand={brand} brandPrimary={brandPrimary} onAbout={() => goTo("about")} onNav={(t) => goTo(t)} footerConfig={resolvedFooterConfig} />
      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} onSignIn={handleSignIn} brandPrimary={brandPrimary} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SIGN-IN MODAL — phone-only auth (lookup loyalty + save session)
// ════════════════════════════════════════════════════════════════════
function SignInModal({ onClose, onSignIn, brandPrimary }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState("phone"); // 'phone' | 'otp' | 'newuser'
  const [resendCountdown, setResendCountdown] = useState(0);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const requestOtp = async () => {
    const cleaned = phone.replace(/[^\d]/g, "");
    if (cleaned.length < 8) { setError("Nomor HP minimal 8 digit"); return; }
    setBusy(true); setError("");
    try {
      const r = await fetch(`${API_HOST}/api/cinema/auth/request-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleaned }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setPhoneMasked(d.phone_masked || cleaned);
      setStep("otp");
      setResendCountdown(60);
      setOtp("");
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) { setError("OTP harus 6 digit"); return; }
    setBusy(true); setError("");
    try {
      const r = await fetch(`${API_HOST}/api/cinema/auth/verify-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/[^\d]/g, ""), code: otp }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      if (d.customer) {
        // Existing member — sign in
        onSignIn({
          phone: d.phone, name: d.customer.name, points: d.customer.points,
          tier: d.customer.tier, lifetime_spend: d.customer.lifetime_spend,
          total_visits: d.customer.total_visits, signed_in_at: Date.now(),
          verified: true,
        });
      } else {
        // New user — ask name
        setStep("newuser");
      }
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const submitNewUser = () => {
    if (!name.trim()) { setError("Nama wajib"); return; }
    const cleaned = phone.replace(/[^\d]/g, "");
    onSignIn({
      phone: cleaned, name: name.trim(), points: 0, tier: "BRONZE",
      lifetime_spend: 0, total_visits: 0, new_user: true, signed_in_at: Date.now(),
      verified: true,
    });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      animation: "cwFadeIn 0.2s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 420,
        background: "linear-gradient(180deg, #16161a, #0d0d11)",
        border: `1px solid ${C.border}`, borderRadius: 18, padding: 28,
        animation: "cwFadeUp 0.3s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: brandPrimary, fontWeight: 800, letterSpacing: 2, fontFamily: "'Geist Mono',monospace" }}>🔐 SIGN IN · OTP WA</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0, marginTop: 4 }}>
              {step === "phone" ? "Masuk Akun" : step === "otp" ? "Verifikasi OTP" : "Daftar Member"}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.dim, fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {step === "phone" && (
          <>
            <p style={{ fontSize: 13, color: C.sub, margin: 0, marginBottom: 18, lineHeight: 1.5 }}>
              Masukkan nomor WhatsApp. Kami kirim <strong style={{ color: brandPrimary }}>kode OTP 6 digit</strong> via WA untuk verifikasi.
            </p>
            <label style={{ display: "block", marginBottom: 8, fontSize: 11, color: C.dim, fontWeight: 600 }}>No. WhatsApp</label>
            <input value={phone} onChange={e => { setPhone(e.target.value); setError(""); }} type="tel"
              onKeyDown={e => { if (e.key === "Enter") requestOtp(); }}
              placeholder="08xxxxxxxxxx" autoFocus
              style={{
                width: "100%", background: C.card, border: `1px solid ${C.border}`,
                color: C.text, borderRadius: 10, padding: "12px 14px", fontSize: 15,
                fontFamily: "'Geist Mono',monospace", outline: "none", boxSizing: "border-box",
                letterSpacing: 1,
              }} />
            {error && <div style={{ marginTop: 10, fontSize: 12, color: "#fca5a5" }}>⚠ {error}</div>}
            <button onClick={requestOtp} disabled={busy || phone.replace(/\D/g, "").length < 8} style={{
              width: "100%", marginTop: 18, padding: 14,
              background: phone.replace(/\D/g, "").length >= 8 && !busy ? brandPrimary : "rgba(255,255,255,0.1)",
              border: "none", color: "#fff", borderRadius: 12,
              fontSize: 14, fontWeight: 800, cursor: phone.replace(/\D/g, "").length >= 8 && !busy ? "pointer" : "not-allowed",
              fontFamily: "inherit", boxShadow: phone.replace(/\D/g, "").length >= 8 && !busy ? `0 6px 20px ${brandPrimary}55` : "none",
            }}>{busy ? "📤 Mengirim OTP…" : "📩 Kirim Kode OTP"}</button>
            <div style={{ marginTop: 12, fontSize: 11, color: C.dim, textAlign: "center" }}>
              Cek WhatsApp Anda dalam 1-2 menit setelah klik.
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, padding: 12, marginBottom: 18, fontSize: 12.5, color: "#10b981" }}>
              📨 OTP terkirim ke WhatsApp <strong style={{ fontFamily: "'Geist Mono',monospace" }}>{phoneMasked}</strong>. Cek pesan + masukkan 6 digit code.
            </div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 11, color: C.dim, fontWeight: 600 }}>Kode OTP (6 digit)</label>
            <input value={otp} onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              type="text" inputMode="numeric" maxLength={6} autoFocus
              onKeyDown={e => { if (e.key === "Enter" && otp.length === 6) verifyOtp(); }}
              placeholder="123456"
              style={{
                width: "100%", background: C.card, border: `1px solid ${C.border}`,
                color: C.text, borderRadius: 10, padding: "14px 16px", fontSize: 24,
                fontFamily: "'Geist Mono',monospace", outline: "none", boxSizing: "border-box",
                letterSpacing: 8, textAlign: "center", fontWeight: 800,
              }} />
            {error && <div style={{ marginTop: 10, fontSize: 12, color: "#fca5a5" }}>⚠ {error}</div>}
            <button onClick={verifyOtp} disabled={busy || otp.length !== 6} style={{
              width: "100%", marginTop: 14, padding: 14,
              background: otp.length === 6 && !busy ? brandPrimary : "rgba(255,255,255,0.1)",
              border: "none", color: "#fff", borderRadius: 12,
              fontSize: 14, fontWeight: 800, cursor: otp.length === 6 && !busy ? "pointer" : "not-allowed",
              fontFamily: "inherit", boxShadow: otp.length === 6 && !busy ? `0 6px 20px ${brandPrimary}55` : "none",
            }}>{busy ? "🔐 Verifikasi…" : "✓ Verifikasi & Masuk"}</button>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: C.dim }}>
              <button onClick={() => { setStep("phone"); setOtp(""); setError(""); }} style={{
                background: "transparent", border: "none", color: C.sub, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: 0,
              }}>← Ganti nomor</button>
              {resendCountdown > 0 ? (
                <span>Resend OTP dlm {resendCountdown}s</span>
              ) : (
                <button onClick={requestOtp} disabled={busy} style={{
                  background: "transparent", border: "none", color: brandPrimary, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: 0, fontWeight: 700,
                }}>📩 Kirim ulang</button>
              )}
            </div>
          </>
        )}

        {step === "newuser" && (
          <>
            <div style={{ background: `${brandPrimary}11`, border: `1px solid ${brandPrimary}44`, borderRadius: 10, padding: 12, marginBottom: 18, fontSize: 12, color: brandPrimary }}>
              ✅ HP <strong>{phoneMasked}</strong> terverifikasi! Belum ada akun — isi nama untuk daftar member baru.
            </div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 11, color: C.dim, fontWeight: 600 }}>Nama Lengkap</label>
            <input value={name} onChange={e => { setName(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") submitNewUser(); }}
              placeholder="Nama Anda" autoFocus
              style={{
                width: "100%", background: C.card, border: `1px solid ${C.border}`,
                color: C.text, borderRadius: 10, padding: "12px 14px", fontSize: 14,
                fontFamily: "inherit", outline: "none", boxSizing: "border-box",
              }} />
            {error && <div style={{ marginTop: 10, fontSize: 12, color: "#fca5a5" }}>⚠ {error}</div>}
            <button onClick={submitNewUser} style={{
              width: "100%", marginTop: 18, padding: 14, background: brandPrimary, border: "none", color: "#fff",
              borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              boxShadow: `0 6px 20px ${brandPrimary}55`,
            }}>🎉 Daftar & Masuk</button>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// HISTORY / MOVIES / PROMO / STUDIO / LOCATIONS PAGES (MVP stubs)
// ════════════════════════════════════════════════════════════════════
function HistoryPage({ session, brandPrimary, onSignInClick }) {
  const [bookings, setBookings] = useState(null);
  const [loyalty, setLoyalty] = useState(null);
  const [promos, setPromos] = useState([]);
  const [error, setError] = useState("");

  const [reviewable, setReviewable] = useState({});  // key: `${purchase_id}|${film_id}` => true if NOT reviewed yet

  const loadAll = useCallback(() => {
    if (!session?.phone) return;
    // Load 4 in parallel: bookings, fresh loyalty, active promos, reviewable list
    Promise.all([
      fetch(`${API_HOST}/api/cinema/tickets?phone=${encodeURIComponent(session.phone)}`).then(r => r.json()).catch(() => []),
      fetch(`${API_HOST}/api/cinema/loyalty-points?phone=${encodeURIComponent(session.phone)}`).then(r => r.json()).catch(() => null),
      fetch(`${API_HOST}/api/cinema/promotions/active`).then(r => r.json()).catch(() => []),
      fetch(`${API_HOST}/api/cinema/reviewable-films?phone=${encodeURIComponent(session.phone)}`).then(r => r.json()).catch(() => ({ items: [] })),
    ]).then(([t, l, p, rv]) => {
      const list = Array.isArray(t.tickets) ? t.tickets : Array.isArray(t) ? t : [];
      const grouped = list.reduce((acc, x) => {
        const pid = x.purchase_id || `single-${x.id}`;
        if (!acc[pid]) acc[pid] = { purchase_id: pid, tickets: [], film_title: x.film_title, film_id: x.film_id, showtime_id: x.showtime_id, show_date: x.show_date, start_time: x.start_time, total: 0, sold_at: x.sold_at };
        acc[pid].tickets.push(x);
        acc[pid].total += (x.price || 0);
        return acc;
      }, {});
      // Mark reviewed = true kalau (purchase_id, film_id) TIDAK ada di reviewable list
      const reviewableSet = new Set((rv.items || []).map(i => `${i.purchase_id}|${i.film_id}`));
      const items = Object.values(grouped).map(b => ({ ...b, reviewed: b.film_id && b.purchase_id && !reviewableSet.has(`${b.purchase_id}|${b.film_id}`) }));
      setBookings(items.sort((a, b) => (b.sold_at || 0) - (a.sold_at || 0)));
      setLoyalty(l);
      setPromos(p.promotions || p || []);
      setReviewable(reviewableSet);
    }).catch(e => setError(e.message));
  }, [session?.phone]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onReviewed = useCallback((pid, fid) => {
    setBookings(prev => (prev || []).map(b => (b.purchase_id === pid && b.film_id === fid) ? { ...b, reviewed: true } : b));
  }, []);

  if (!session) return (
    <div style={{ padding: "60px 0", textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontSize: 64, marginBottom: 18 }}>🔐</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0, marginBottom: 10 }}>Sign In Dulu</h2>
      <p style={{ fontSize: 13, color: C.sub, marginBottom: 20 }}>Untuk lihat akun Anda (booking, poin, promo), masuk dengan nomor HP.</p>
      <button onClick={onSignInClick} style={{ padding: "12px 24px", background: brandPrimary, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🔐 Sign In</button>
    </div>
  );

  // Split bookings: upcoming (showtime in future) vs past
  const now = new Date();
  const isUpcoming = (b) => {
    if (!b.show_date) return false;
    const [Y, M, D] = String(b.show_date).split("-").map(Number);
    const [h, m] = String(b.start_time || "00:00").split(":").map(Number);
    return new Date(Y, M - 1, D, h, m, 0) > now;
  };
  const upcoming = (bookings || []).filter(isUpcoming);
  const past = (bookings || []).filter(b => !isUpcoming(b));
  const points = loyalty?.customer?.points ?? session.points ?? 0;
  const tier = loyalty?.customer?.tier || session.tier || "BRONZE";
  const lifetime = loyalty?.customer?.lifetime_spend ?? session.lifetime_spend ?? 0;

  return (
    <div style={{ padding: "30px 0 60px" }}>
      {/* Member hero card */}
      <div style={{
        background: `linear-gradient(135deg, ${brandPrimary}26, rgba(251,191,36,0.12))`,
        border: `1px solid ${brandPrimary}55`, borderRadius: 18, padding: 22, marginBottom: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: brandPrimary, fontWeight: 800, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", marginBottom: 4, textTransform: "uppercase" }}>👤 MEMBER {tier}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Halo, {session.name}</div>
            <div style={{ fontSize: 12, color: C.sub }}>📱 {session.phone} · {(bookings || []).length} booking · lifetime {rp(lifetime)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: brandPrimary, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>⭐ SALDO POIN</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", fontFamily: "'Geist Mono',monospace", lineHeight: 1 }}>{points}</div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>≈ Rp {(points * 10).toLocaleString("id-ID")} di booking berikutnya</div>
          </div>
        </div>
      </div>

      {error && <ErrorInline error={new Error(error)} label="Gagal load data" />}
      {!bookings ? <LoadingState label="Memuat akun Anda…" /> : (
        <>
          {/* Upcoming bookings — show QR mini */}
          {upcoming.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0, marginBottom: 12 }}>🎟️ Booking Aktif ({upcoming.length})</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
                {upcoming.map(b => <BookingCard key={b.purchase_id} b={b} brandPrimary={brandPrimary} upcoming session={session} onReviewed={onReviewed} />)}
              </div>
            </div>
          )}

          {/* Active promos for member */}
          {promos.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0, marginBottom: 12 }}>🎟 Promo Tersedia</h2>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, margin: "0 -20px", padding: "0 20px" }}>
                {promos.slice(0, 6).map(p => (
                  <div key={p.id || p.code} style={{
                    flexShrink: 0, minWidth: 220, background: `linear-gradient(135deg, ${brandPrimary}22, ${brandPrimary}08)`,
                    border: `1px solid ${brandPrimary}44`, borderRadius: 12, padding: 14,
                  }}>
                    <div style={{ fontSize: 10, color: brandPrimary, fontFamily: "'Geist Mono',monospace", fontWeight: 800, letterSpacing: 1.2, marginBottom: 4 }}>{p.discount_type === "percentage" ? `${p.discount_value}% OFF` : `Rp ${(p.discount_value || 0).toLocaleString("id-ID")} OFF`}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{p.name || p.code}</div>
                    <div style={{ background: "rgba(0,0,0,0.4)", border: `1px dashed ${brandPrimary}66`, borderRadius: 6, padding: "5px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                      <span style={{ color: brandPrimary, fontFamily: "'Geist Mono',monospace", fontWeight: 700, letterSpacing: 1 }}>{p.code}</span>
                      <button onClick={() => navigator.clipboard?.writeText(p.code)} style={{ background: "transparent", border: "none", color: C.sub, fontSize: 10, cursor: "pointer" }}>📋</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Past bookings — with re-order */}
          {past.length > 0 ? (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0, marginBottom: 12 }}>📜 History Pembelian ({past.length})</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {past.map(b => <BookingCard key={b.purchase_id} b={b} brandPrimary={brandPrimary} session={session} onReviewed={onReviewed} />)}
              </div>
            </div>
          ) : upcoming.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: C.dim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
              <div style={{ fontSize: 48, marginBottom: 14 }}>🎬</div>
              <div style={{ fontSize: 15, marginBottom: 4 }}>Belum ada booking</div>
              <div style={{ fontSize: 12 }}>Mulai pesan tiket pertama Anda!</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// BookingCard with mini QR + re-order + post-watch review
function BookingCard({ b, brandPrimary, upcoming, session, onReviewed }) {
  const [qrSrc, setQrSrc] = useState(null);
  const [showReview, setShowReview] = useState(false);
  useEffect(() => {
    if (!upcoming || !b.purchase_id) return;
    QRCode.toDataURL(`${window.location.origin}/?purchase=${b.purchase_id}`, { width: 140, margin: 1, color: { dark: "#000", light: "#fff" } })
      .then(setQrSrc).catch(() => {});
  }, [b.purchase_id, upcoming]);
  const canReview = !upcoming && b.film_id && b.purchase_id && session?.phone && !b.reviewed;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", gap: 14 }}>
      {upcoming && qrSrc && (
        <a href={`/?purchase=${b.purchase_id}`} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
          <img src={qrSrc} alt="QR" style={{ width: 80, height: 80, borderRadius: 6, background: "#fff", padding: 4 }} />
        </a>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.film_title || "Booking"}</div>
          {upcoming && <span style={{ fontSize: 10, fontWeight: 800, color: "#10b981", background: "rgba(16,185,129,0.15)", padding: "2px 8px", borderRadius: 999, flexShrink: 0 }}>AKTIF</span>}
          {b.reviewed && <span style={{ fontSize: 10, fontWeight: 800, color: brandPrimary, background: `${brandPrimary}26`, border: `1px solid ${brandPrimary}55`, padding: "2px 8px", borderRadius: 999, flexShrink: 0 }}>✓ REVIEWED</span>}
        </div>
        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>📅 {b.show_date} · {b.start_time}</div>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 8, fontFamily: "'Geist Mono',monospace" }}>💺 {b.tickets.map(t => t.seat).join(", ")} · {b.purchase_id}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: brandPrimary, fontFamily: "'Geist Mono',monospace" }}>{rp(b.total)}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <a href={`/?purchase=${b.purchase_id}`} target="_blank" rel="noopener noreferrer" style={{
              padding: "5px 10px", background: brandPrimary + "22", border: `1px solid ${brandPrimary}55`, color: brandPrimary,
              borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: "none", fontFamily: "inherit",
            }}>🎫 E-Ticket</a>
            {canReview && (
              <button onClick={() => setShowReview(true)} style={{
                padding: "5px 10px", background: `${brandPrimary}26`, border: `1px solid ${brandPrimary}55`, color: brandPrimary,
                borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>⭐ Beri Review</button>
            )}
            {!upcoming && (
              <a href="/?movies=1" style={{
                padding: "5px 10px", background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: C.text,
                borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: "none", fontFamily: "inherit",
              }}>🔁 Pesan Lagi</a>
            )}
          </div>
        </div>
      </div>
      {showReview && (
        <ReviewModal
          booking={b}
          session={session}
          brandPrimary={brandPrimary}
          onClose={() => setShowReview(false)}
          onSubmitted={() => { setShowReview(false); onReviewed?.(b.purchase_id, b.film_id); }}
        />
      )}
    </div>
  );
}

// Modal: kirim review utk film yg sudah ditonton
function ReviewModal({ booking, session, brandPrimary, onClose, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!rating) { setErr("Pilih bintang dulu (1-5)"); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch(`${API_HOST}/api/cinema/films/${booking.film_id}/rate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comment: comment.trim(),
          customer_name: session?.name || "",
          customer_phone: session?.phone || "",
          purchase_id: booking.purchase_id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onSubmitted?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24,
        maxWidth: 440, width: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: brandPrimary, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 4 }}>⭐ BERI REVIEW</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{booking.film_title}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2, fontFamily: "'Geist Mono',monospace" }}>{booking.purchase_id}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.dim, fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ margin: "20px 0 16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.sub, marginBottom: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>RATING ANDA</div>
          <StarsPicker value={rating} onChange={setRating} size={36} color={brandPrimary} />
          {rating > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: brandPrimary, fontWeight: 700 }}>
              {["", "Kurang", "Lumayan", "Cukup Baik", "Bagus", "Luar Biasa"][rating]}
            </div>
          )}
        </div>
        <label style={{ display: "block", fontSize: 11, color: C.sub, marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>KOMENTAR (opsional)</label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Ceritakan pengalaman menonton Anda…"
          rows={4}
          maxLength={500}
          style={{
            width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`,
            color: "#fff", borderRadius: 8, padding: 10, fontSize: 13, fontFamily: "inherit", resize: "vertical",
          }}
        />
        <div style={{ fontSize: 10, color: C.dim, textAlign: "right", marginTop: 4 }}>{comment.length}/500</div>
        {err && <div style={{ marginTop: 10, padding: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: "#fca5a5", fontSize: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} disabled={busy} style={{
            flex: 1, padding: "12px 0", background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, color: C.text,
            borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}>Batal</button>
          <button onClick={submit} disabled={busy || !rating} style={{
            flex: 2, padding: "12px 0", background: rating ? brandPrimary : "rgba(255,255,255,0.1)", color: "#fff", border: "none",
            borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: (busy || !rating) ? "not-allowed" : "pointer", fontFamily: "inherit",
            opacity: busy ? 0.6 : 1,
          }}>{busy ? "Mengirim…" : "Kirim Review"}</button>
        </div>
      </div>
    </div>
  );
}

// Helper: split genre string ("Action / Adventure" / "Drama, Romance") jadi array
function splitGenres(film) {
  return String(film.genre || "").split(/[,\/]/).map(s => s.trim()).filter(Boolean);
}
function filmMatchesGenre(film, genre) {
  if (genre === "all") return true;
  return splitGenres(film).some(g => g.toLowerCase() === genre.toLowerCase());
}

// Default section toggles — semua ON
const DEFAULT_SECTION_TOGGLES = {
  my_list: true,
  now_showing: true,
  top10: true,
  top_picks: true,
  coming_soon: true,
  by_genre: true,
  genre_filter: true,
};

function MoviesPage({ brandPrimary, onPick, session, sectionToggles, customSections }) {
  const tg = { ...DEFAULT_SECTION_TOGGLES, ...(sectionToggles || {}) };
  const customRows = Array.isArray(customSections) ? customSections.filter(s => s.visible !== false).sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
  const [films, setFilms] = useState(null);
  const [top10, setTop10] = useState([]);
  const [top10Loading, setTop10Loading] = useState(false);
  const [top10Period, setTop10Period] = useState("month");  // "week" | "month" | "all"
  const [watchlist, setWatchlist] = useState([]);
  const [genreFilter, setGenreFilter] = useState("all");

  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/films`).then(r => r.json()).then(d => setFilms(d.films || [])).catch(() => setFilms([]));
  }, []);

  // Top 10: refetch saat period berubah
  useEffect(() => {
    const days = top10Period === "week" ? 7 : top10Period === "month" ? 30 : 365;
    setTop10Loading(true);
    fetch(`${API_HOST}/api/cinema/films/top10?days=${days}`)
      .then(r => r.json()).then(d => setTop10(d.items || []))
      .catch(() => {})
      .finally(() => setTop10Loading(false));
  }, [top10Period]);

  // My List — fetch when signed-in
  useEffect(() => {
    if (!session?.phone) { setWatchlist([]); return; }
    fetch(`${API_HOST}/api/cinema/watchlist?phone=${encodeURIComponent(session.phone)}`)
      .then(r => r.json()).then(d => setWatchlist(d.items || [])).catch(() => setWatchlist([]));
  }, [session?.phone]);

  const removeFromList = async (film) => {
    if (!session?.phone) return;
    await fetch(`${API_HOST}/api/cinema/watchlist/${film.id}?phone=${encodeURIComponent(session.phone)}`, { method: "DELETE" });
    setWatchlist(w => w.filter(x => x.film_id !== film.id));
  };

  // Available genres: collect dari semua film (now showing + coming soon), count occurrences
  const genreCounts = useMemo(() => {
    const counts = {};
    (films || []).forEach(f => {
      splitGenres(f).forEach(g => { counts[g] = (counts[g] || 0) + 1; });
    });
    return counts;
  }, [films]);
  const availableGenres = useMemo(() => {
    return Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).map(([g]) => g);
  }, [genreCounts]);

  if (!films) return (
    <div style={{ padding: "30px 0 60px" }}>
      <Skeleton h={28} w={180} style={{ marginBottom: 8 }} />
      <Skeleton h={14} w={260} style={{ marginBottom: 30 }} />
      <FilmGridSkeleton count={6} />
    </div>
  );

  // Apply genre filter ke semua row (kalau "all" → pass through)
  const fg = (list) => list.filter(f => filmMatchesGenre(f, genreFilter));

  const nowShowing = fg(films.filter(f => f.status === "now_showing" || !f.status));
  const comingSoon = fg(films.filter(f => f.status === "coming_soon"));
  const topRated = fg([...films].filter(f => (f.avg_rating || 0) >= 4 && f.ratings_count >= 1).sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0))).slice(0, 10);
  const top10Filtered = fg(top10);
  const watchlistFiltered = fg(watchlist);

  // By-genre rows hanya dipakai saat filter "all" (kalau sudah filter ke 1 genre, redundant)
  const byGenre = {};
  if (genreFilter === "all") {
    nowShowing.forEach(f => {
      const g = splitGenres(f)[0] || "Lainnya";
      if (!byGenre[g]) byGenre[g] = [];
      byGenre[g].push(f);
    });
  }
  const genreEntries = Object.entries(byGenre).filter(([, list]) => list.length >= 2);

  const totalFiltered = nowShowing.length + comingSoon.length;

  return (
    <div style={{ padding: "20px 0 60px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, margin: 0, marginBottom: 8, color: "#fff" }}>Movies</h1>
      <p style={{ fontSize: 13.5, color: C.sub, margin: 0, marginBottom: 20 }}>
        {genreFilter === "all"
          ? `${films.length} film tersedia di KaryaOS Cinema`
          : `${totalFiltered} film bergenre "${genreFilter}"`}
      </p>

      {/* Genre filter chips — horizontal scroll (toggleable via admin) */}
      {tg.genre_filter && (
        <div className="cw-genre-chips" style={{
          display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 22,
          scrollbarWidth: "none",
        }}>
          <GenreChip label="Semua" active={genreFilter === "all"} onClick={() => setGenreFilter("all")} count={films.length} brandPrimary={brandPrimary} />
          {availableGenres.map(g => (
            <GenreChip key={g} label={g} active={genreFilter === g} onClick={() => setGenreFilter(g)} count={genreCounts[g]} brandPrimary={brandPrimary} />
          ))}
        </div>
      )}

      {totalFiltered === 0 && watchlistFiltered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.dim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🎬</div>
          <div style={{ fontSize: 15, marginBottom: 4 }}>Tidak ada film bergenre "{genreFilter}"</div>
          <button onClick={() => setGenreFilter("all")} style={{
            marginTop: 14, padding: "8px 18px", background: brandPrimary, color: "#fff",
            border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>Reset filter</button>
        </div>
      ) : (
        <>
          {tg.my_list && watchlistFiltered.length > 0 && <FilmRow title="📑 My List" films={watchlistFiltered} onPick={onPick} brandPrimary={brandPrimary} onRemove={removeFromList} />}
          {tg.now_showing && nowShowing.length > 0 && <FilmRow title={genreFilter === "all" ? "🎬 Sedang Tayang" : `🎬 Sedang Tayang · ${genreFilter}`} films={nowShowing} onPick={onPick} brandPrimary={brandPrimary} />}
          {tg.top10 && top10Filtered.length > 0 && (
            <FilmRow
              title={`🔥 Top 10 ${top10Period === "week" ? "Minggu Ini" : top10Period === "month" ? "Bulan Ini" : "Sepanjang Waktu"}`}
              titleExtra={<Top10PeriodToggle value={top10Period} onChange={setTop10Period} brandPrimary={brandPrimary} loading={top10Loading} />}
              films={top10Filtered} onPick={onPick} brandPrimary={brandPrimary} numbered
            />
          )}
          {tg.top_picks && topRated.length > 0 && <FilmRow title="⭐ Top Picks Member" films={topRated} onPick={onPick} brandPrimary={brandPrimary} showRating />}
          {tg.coming_soon && comingSoon.length > 0 && <FilmRow title="🔜 Segera Tayang" films={comingSoon} onPick={onPick} brandPrimary={brandPrimary} />}
          {tg.by_genre && genreEntries.map(([genre, list]) => (
            <FilmRow key={genre} title={`🎭 ${genre}`} films={list} onPick={onPick} brandPrimary={brandPrimary} />
          ))}
          {/* Custom sections — admin-curated film row */}
          {customRows.map(s => {
            const ids = new Set((s.film_ids || []).map(Number));
            const list = fg(films.filter(f => ids.has(f.id)));
            if (!list.length) return null;
            return <FilmRow key={`custom-${s.id}`} title={s.title} films={list} onPick={onPick} brandPrimary={brandPrimary} />;
          })}
        </>
      )}
    </div>
  );
}

function GenreChip({ label, count, active, onClick, brandPrimary }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, padding: "8px 16px", borderRadius: 999,
      background: active ? brandPrimary : "rgba(255,255,255,0.06)",
      border: `1px solid ${active ? brandPrimary : "rgba(255,255,255,0.12)"}`,
      color: active ? "#fff" : "rgba(255,255,255,0.85)",
      fontSize: 12.5, fontWeight: active ? 800 : 600, cursor: "pointer",
      fontFamily: "inherit", whiteSpace: "nowrap",
      display: "inline-flex", alignItems: "center", gap: 6,
      transition: "all 0.15s",
    }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.85)"; } }}>
      {label}
      {count != null && (
        <span style={{
          fontSize: 10, padding: "1px 6px", borderRadius: 999,
          background: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
        }}>{count}</span>
      )}
    </button>
  );
}

// Segment-style toggle Minggu/Bulan/Semua — di header Top 10 row
function Top10PeriodToggle({ value, onChange, brandPrimary, loading }) {
  const opts = [
    { key: "week",  label: "Minggu Ini" },
    { key: "month", label: "Bulan Ini" },
    { key: "all",   label: "Sepanjang Waktu" },
  ];
  return (
    <div style={{
      display: "inline-flex", padding: 3,
      background: "rgba(255,255,255,0.06)", borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.12)",
      opacity: loading ? 0.6 : 1, transition: "opacity 0.2s",
    }}>
      {opts.map(o => {
        const active = value === o.key;
        return (
          <button key={o.key} onClick={() => onChange(o.key)} disabled={loading} style={{
            padding: "5px 14px", borderRadius: 999, border: "none",
            background: active ? brandPrimary : "transparent",
            color: active ? "#fff" : "rgba(255,255,255,0.7)",
            fontSize: 11.5, fontWeight: active ? 800 : 600,
            cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
            transition: "all 0.15s", whiteSpace: "nowrap",
          }}
            onMouseEnter={(e) => { if (!active && !loading) e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { if (!active && !loading) e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// FILM ROW — Netflix-style horizontal scroll carousel
// ════════════════════════════════════════════════════════════════════
function FilmRow({ title, titleExtra = null, films, onPick, brandPrimary, showRating = false, numbered = false, onRemove = null }) {
  const scrollRef = useRef(null);
  const [hover, setHover] = useState(false);
  const scrollBy = (dir) => {
    const el = scrollRef.current; if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: "smooth" });
  };
  return (
    <section className="cw-film-row" style={{ marginBottom: S[10] }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[3], marginBottom: S[4], flexWrap: "wrap" }}>
        {/* Section heading — cinema row title dgn gold accent bar (Netflix/AMC vibe) */}
        <h2 style={{
          fontSize: "clamp(22px, 2.4vw, 28px)", fontWeight: 900, color: C.text, margin: 0,
          letterSpacing: -0.5, lineHeight: 1.1, fontFamily: T.sans,
          display: "flex", alignItems: "center", gap: S[3],
          position: "relative",
        }}>
          {/* Left accent bar — gold (mostly) atau crimson kalau title contain "Premiere/Soon" */}
          <span style={{
            width: 4, height: "1.2em",
            background: `linear-gradient(180deg, ${C.gold}, ${C.ember})`,
            borderRadius: 2,
            boxShadow: `0 0 12px ${C.gold}66`,
          }} />
          {title}
        </h2>
        {titleExtra}
      </div>
      <div style={{ position: "relative" }}>
        {/* Left chevron */}
        <button className="cw-row-chevron" onClick={() => scrollBy(-1)} aria-label="Prev" style={{
          position: "absolute", left: -2, top: 0, bottom: 0, width: 48, zIndex: 5,
          background: "linear-gradient(90deg, rgba(20,20,20,0.95), transparent)",
          border: "none", color: "#fff", fontSize: 28, cursor: "pointer",
          opacity: hover ? 1 : 0, transition: "opacity 0.25s",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>‹</button>
        {/* Scroll track */}
        <div ref={scrollRef} className="cw-row-track" style={{
          display: "flex", gap: numbered ? 0 : 8, overflowX: "auto",
          scrollSnapType: "x mandatory", scrollPaddingLeft: 8,
          paddingBottom: 30, marginBottom: -30, // ruang utk hover scale, mask balik dgn neg margin
          paddingLeft: numbered ? 30 : 0,  // ruang utk numeral di kiri card pertama
        }}>
          {films.map((f, i) => {
            const rank = f.rank || (i + 1);
            return (
            <div key={f.id} style={{
              flexShrink: 0, scrollSnapAlign: "start",
              display: "flex", alignItems: "stretch",
              width: numbered ? "clamp(220px, 26vw, 320px)" : "clamp(140px, 18vw, 220px)",
            }}>
              {/* Netflix-style huge numeral di kiri card */}
              {numbered && (
                <div style={{
                  flexShrink: 0, width: "38%", display: "flex", alignItems: "flex-end",
                  marginRight: "-12%",  // overlap poster
                  fontFamily: "'Arial Black','Inter',sans-serif",
                  fontSize: "clamp(120px, 18vw, 200px)",
                  fontWeight: 900, lineHeight: 0.85,
                  color: "transparent",
                  WebkitTextStroke: "3px rgba(255,255,255,0.85)",
                  textShadow: "8px 8px 0 rgba(0,0,0,0.5)",
                  pointerEvents: "none",
                  letterSpacing: -8,
                }}>{rank}</div>
              )}
              <button onClick={() => onPick(f)} className="cw-row-card" style={{
                flex: 1, position: "relative",
                background: "transparent", border: "none", padding: 0,
                cursor: "pointer", color: "#fff", fontFamily: "inherit",
                transition: "transform 0.3s cubic-bezier(.2,.8,.2,1)",
                transformOrigin: numbered ? "left bottom" : "center bottom",
              }}>
                <div style={{
                  aspectRatio: "2/3",
                  backgroundImage: f.poster_url ? `url(${f.poster_url})` : "none",
                  background: f.poster_url ? `url(${f.poster_url}) center/cover` : "#1c1c22",
                  borderRadius: 6, position: "relative", overflow: "hidden",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                }}>
                  {!f.poster_url && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, opacity: 0.3 }}>🎬</div>
                  )}
                  {f.status === "coming_soon" && !numbered && (
                    <div style={{
                      position: "absolute", top: 8, left: 8,
                      background: `linear-gradient(135deg, ${C.gold}, ${C.ember})`, color: C.midnight,
                      padding: "3px 8px", fontSize: 9, fontWeight: 900, letterSpacing: 1.2,
                      fontFamily: "'JetBrains Mono',monospace", borderRadius: 3,
                      boxShadow: `0 2px 8px ${C.gold}55`,
                    }}>SOON</div>
                  )}

                  {/* ▶ Play overlay (revealed on hover via .cw-card-play CSS class) */}
                  <div className="cw-card-play" style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 56, height: 56, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${C.gold}, ${C.ember})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 8px 22px rgba(0,0,0,0.6), 0 0 0 3px rgba(255,255,255,0.18)`,
                    pointerEvents: "none",
                  }}>
                    <span style={{ fontSize: 22, color: C.midnight, marginLeft: 3 }}>▶</span>
                  </div>
                  {/* Remove button utk My List */}
                  {onRemove && (
                    <button onClick={(e) => { e.stopPropagation(); onRemove(f); }} aria-label="Hapus dari My List" style={{
                      position: "absolute", top: 6, right: 6,
                      width: 26, height: 26, borderRadius: "50%",
                      background: "rgba(0,0,0,0.7)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)",
                      fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "inherit", padding: 0,
                    }}>×</button>
                  )}
                  {/* Bottom gradient + title on hover */}
                  <div className="cw-row-card-info" style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    padding: "30px 10px 10px",
                    background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.92))",
                    opacity: 0, transition: "opacity 0.25s",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>
                      {f.duration_min ? `${f.duration_min}mnt` : ""}
                      {f.rating ? ` · ${f.rating}` : ""}
                    </div>
                    {(showRating && f.ratings_count > 0) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                        <Stars value={f.avg_rating || 0} size={9} color={brandPrimary} />
                        <span style={{ fontSize: 9, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{Number(f.avg_rating || 0).toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            </div>
            );
          })}
        </div>
        {/* Right chevron */}
        <button className="cw-row-chevron" onClick={() => scrollBy(1)} aria-label="Next" style={{
          position: "absolute", right: -2, top: 0, bottom: 0, width: 48, zIndex: 5,
          background: "linear-gradient(-90deg, rgba(20,20,20,0.95), transparent)",
          border: "none", color: "#fff", fontSize: 28, cursor: "pointer",
          opacity: hover ? 1 : 0, transition: "opacity 0.25s",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>›</button>
      </div>
    </section>
  );
}

function FilmGroup({ title, films, onPick, brandPrimary }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0, marginBottom: 14 }}>{title}</h2>
      <div className="cw-films-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))", gap: 14 }}>
        {films.map(f => (
          <button key={f.id} onClick={() => onPick(f)} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
            padding: 0, textAlign: "left", cursor: "pointer", color: C.text, fontFamily: "inherit", transition: "all 0.15s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${brandPrimary}66`; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "translateY(0)"; }}>
            <div style={{
              aspectRatio: "2/3", background: f.poster_url ? `url(${f.poster_url}) center/cover` : "#1a1a22",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, opacity: f.poster_url ? 1 : 0.3,
            }}>{!f.poster_url && "🎬"}</div>
            <div style={{ padding: "10px 12px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{f.genre || "—"} · {f.duration_min || 0}mnt</div>
              {f.ratings_count > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
                  <Stars value={f.avg_rating || 0} size={10} color={brandPrimary} />
                  <span style={{ fontSize: 10, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{Number(f.avg_rating || 0).toFixed(1)} ({f.ratings_count})</span>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// PAGE HERO — compact billboard untuk non-homepage (Promo/Studio/FAQ/dll)
// ════════════════════════════════════════════════════════════════════
function PageHero({ tag, title, subtitle, brandPrimary, accent = "🎬", bgImage }) {
  return (
    <section style={{
      position: "relative", width: "100vw", minHeight: "min(40vh, 360px)",
      marginLeft: "calc(-50vw + 50%)", marginRight: "calc(-50vw + 50%)",
      overflow: "hidden", marginBottom: S[8],
      background: bgImage
        ? `linear-gradient(180deg, rgba(20,20,20,0.55) 0%, rgba(20,20,20,0.94) 100%), url(${bgImage}) center/cover`
        : `radial-gradient(ellipse 80% 70% at 30% 40%, ${brandPrimary}1f, transparent 70%), #141414`,
    }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto", padding: `${S[16]}px ${S[12]}px ${S[10]}px`,
        minHeight: "min(40vh, 360px)",
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
        {/* Eyebrow tag — mono uppercase, brand color pill */}
        <div style={{
          display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: S[2], marginBottom: S[5],
          padding: `${S[1]}px ${S[3]}px`, borderRadius: 4,
          background: `${brandPrimary}cc`,
          fontSize: T.xs, fontWeight: T.semibold, letterSpacing: T.tracking_wider, color: "#fff",
          fontFamily: T.mono, textTransform: "uppercase",
        }}>
          <span>{accent}</span>
          {tag}
        </div>
        {/* Title — CINEMA drama: heavy 900 weight + tight tracking (Netflix/AMC style) */}
        <h1 style={{
          fontSize: "clamp(32px, 5.5vw, 60px)", fontWeight: 900,
          letterSpacing: -1.8, lineHeight: 1.02,
          margin: 0, marginBottom: S[3], color: C.text, fontFamily: T.sans,
          textShadow: "0 4px 24px rgba(0,0,0,0.7)",
        }}>{title}</h1>
        {subtitle && (
          <p style={{
            fontSize: "clamp(13px, 1.2vw, 16px)", color: "rgba(255,255,255,0.85)",
            lineHeight: T.relaxed, margin: 0, maxWidth: 580,
            fontWeight: T.regular, fontFamily: T.sans,
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
          }}>{subtitle}</p>
        )}
      </div>
    </section>
  );
}

function PromoPage({ brandPrimary, heroOverride }) {
  const [promos, setPromos] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/promotions/active`).then(r => r.json()).then(d => setPromos(d.promotions || d || []))
      .catch(() => setPromos([]));
  }, []);
  if (!promos) return <LoadingState label="Memuat promo…" />;
  return (
    <div style={{ paddingBottom: 60 }}>
      <PageHero
        tag={heroOverride?.tag || "Promo & Event"}
        title={heroOverride?.title || "Nonton Lebih Hemat"}
        subtitle={heroOverride?.subtitle || `${promos.length} promo aktif menunggu Anda. Pakai kode saat checkout — diskon langsung kepotong, tanpa drama.`}
        accent={heroOverride?.accent || "🎟"}
        brandPrimary={brandPrimary}
      />
      {promos.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.dim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🎟</div>
          <div style={{ fontSize: 15 }}>Belum ada promo aktif saat ini</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 14 }}>
          {promos.map(p => (
            <div key={p.id || p.code} style={{
              background: `linear-gradient(135deg, ${brandPrimary}22, ${brandPrimary}08)`,
              border: `1px solid ${brandPrimary}44`, borderRadius: 14, padding: 18,
            }}>
              <div style={{ fontSize: 11, color: brandPrimary, fontWeight: 800, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", marginBottom: 4, textTransform: "uppercase" }}>{p.discount_type === "percentage" ? `${p.discount_value}% OFF` : `Rp ${(p.discount_value || 0).toLocaleString("id-ID")} OFF`}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{p.name || p.code}</div>
              {p.description && <div style={{ fontSize: 12, color: C.sub, marginBottom: 10, lineHeight: 1.5 }}>{p.description}</div>}
              <div style={{ background: "rgba(0,0,0,0.4)", border: `1px dashed ${brandPrimary}66`, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: brandPrimary, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{p.code}</span>
                <button onClick={() => navigator.clipboard?.writeText(p.code)} style={{ background: "transparent", border: "none", color: C.sub, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>📋 Copy</button>
              </div>
              {(p.min_purchase > 0 || p.valid_to) && (
                <div style={{ marginTop: 10, fontSize: 10, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>
                  {p.min_purchase > 0 && <span>MIN Rp {p.min_purchase.toLocaleString("id-ID")}</span>}
                  {p.valid_to && <span> · BERLAKU SAMPAI {p.valid_to}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudioPage({ brandPrimary, heroOverride }) {
  const [packages, setPackages] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/party-packages`).then(r => r.ok ? r.json() : { packages: [] })
      .then(d => setPackages(d.packages || d || []))
      .catch(() => setPackages([]));
  }, []);
  if (!packages) return <LoadingState label="Memuat paket studio…" />;
  return (
    <div style={{ paddingBottom: 60 }}>
      <PageHero
        tag={heroOverride?.tag || "Studio Booking"}
        title={heroOverride?.title || "Sewa Bioskop Sendiri"}
        subtitle={heroOverride?.subtitle || "Ulang tahun anak, anniversary, gathering kantor, screening rilis perdana — semua bisa di sini. Studio jadi milik Anda dari layar sampai snack."}
        accent={heroOverride?.accent || "🎉"}
        brandPrimary={brandPrimary}
      />
      {packages.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 32, textAlign: "center", color: C.dim }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🎉</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Hubungi Kami untuk Booking Studio</div>
          <div style={{ fontSize: 12, marginBottom: 20 }}>Custom event, ulang tahun anak, gathering kantor, screening privat — semua bisa kami atur.</div>
          <a href="https://wa.me/6285190062368?text=Halo,%20saya%20mau%20tanya%20booking%20studio%20cinema" target="_blank" rel="noopener noreferrer" style={{
            display: "inline-block", padding: "12px 24px", background: "#25D366", color: "#fff",
            borderRadius: 10, fontSize: 14, fontWeight: 800, textDecoration: "none", fontFamily: "inherit",
          }}>📱 Chat WhatsApp</a>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 14 }}>
          {packages.map(p => (
            <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{p.name}</div>
              {p.description && <div style={{ fontSize: 12, color: C.sub, marginBottom: 10, lineHeight: 1.5 }}>{p.description}</div>}
              <div style={{ fontSize: 18, fontWeight: 800, color: brandPrimary, fontFamily: "'Geist Mono',monospace", marginBottom: 10 }}>{rp(p.price || 0)}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{p.duration_hours} jam · max {p.max_pax} pax</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LocationsPage({ brandPrimary, onPick, heroOverride }) {
  const [outlets, setOutlets] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/outlet-master`).then(r => r.json()).then(d => {
      const list = Array.isArray(d) ? d : (d.outlets || d.data || []);
      setOutlets(list.filter(o => (o.primary_vertical === "cinema" || o.vertical === "cinema") && o.status !== "inactive"));
    }).catch(() => setOutlets([]));
  }, []);
  if (!outlets) return <LoadingState label="Memuat lokasi…" />;
  return (
    <div style={{ paddingBottom: 60 }}>
      <PageHero
        tag={heroOverride?.tag || "Lokasi"}
        title={heroOverride?.title || "Cari Cinema Terdekat"}
        subtitle={heroOverride?.subtitle || `${outlets.length} outlet KaryaOS siap menyambut Anda di kota-kota besar Indonesia. Klik kota, lihat jadwal, pesan dari sofa.`}
        accent={heroOverride?.accent || "📍"}
        brandPrimary={brandPrimary}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: S[4] }}>
        {outlets.map(o => {
          const visual = getCityVisual(o);
          const city = o.area || o.name?.replace("Karya Cinema ", "") || o.code;
          const mapsUrl = o.address ? `https://maps.google.com/?q=${encodeURIComponent(o.address)}` : null;
          return (
            <div key={o.code} className="cw-location-card" style={{
              background: DEFAULT_CITY_GRADIENT,
              border: `1px solid ${C.borderSubtle}`, borderRadius: 14, padding: 0, overflow: "hidden",
              minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "flex-end",
              transition: "all 0.3s cubic-bezier(.2,.8,.2,1)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              position: "relative",
            }}>
              {/* Image layer (zIndex 0) — local file pertama, fallback ke Unsplash kalau 404,
                  fallback final ke gradient kalau Unsplash juga gagal */}
              {visual.url && (
                <img
                  src={visual.url}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    if (visual.fallback && e.currentTarget.src !== visual.fallback) {
                      e.currentTarget.src = visual.fallback;
                    } else {
                      e.currentTarget.style.display = "none";  // give up → biarkan gradient
                    }
                  }}
                  style={{
                    position: "absolute", inset: 0, width: "100%", height: "100%",
                    objectFit: "cover", zIndex: 0,
                  }}
                />
              )}
              {/* Overlay gradient (zIndex 1) */}
              <div style={{
                position: "absolute", inset: 0, zIndex: 1,
                background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 45%, rgba(10,10,10,0.96) 100%)",
              }} />
              {/* Emoji bubble top-right */}
              <div style={{
                position: "absolute", top: S[4], right: S[4], zIndex: 3,
                background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
                width: 36, height: 36, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: T.md, border: `1px solid rgba(255,255,255,0.12)`,
              }}>{visual.emoji}</div>

              <div style={{ padding: `${S[5]}px ${S[5]}px ${S[5]}px`, position: "relative", zIndex: 2 }}>
                {/* Eyebrow city tag */}
                <div style={{
                  fontSize: T.xs, color: brandPrimary, fontFamily: T.mono,
                  letterSpacing: T.tracking_wider, textTransform: "uppercase",
                  fontWeight: T.semibold, marginBottom: S[2],
                }}>📍 {city}</div>

                {/* Outlet name */}
                {o.name && <div style={{
                  fontSize: T.lg, fontWeight: T.bold, color: C.text,
                  letterSpacing: T.tracking_tight, lineHeight: T.snug,
                  marginBottom: S[2],
                  textShadow: "0 1px 8px rgba(0,0,0,0.6)",
                }}>{o.name}</div>}

                {/* Address */}
                {o.address && <div style={{
                  fontSize: T.sm, color: C.sub, lineHeight: T.normal,
                  marginBottom: S[4], fontWeight: T.regular,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>{o.address}</div>}

                {/* CTAs */}
                <div style={{ display: "flex", gap: S[2] }}>
                  <button onClick={() => onPick(o)} style={{
                    flex: 1, padding: `${S[3]}px ${S[4]}px`,
                    background: brandPrimary, color: "#fff", border: "none",
                    borderRadius: 8, fontSize: T.sm, fontWeight: T.semibold,
                    cursor: "pointer", fontFamily: T.sans,
                    letterSpacing: T.tracking_normal,
                    transition: "all 0.15s ease",
                    boxShadow: `0 2px 8px ${brandPrimary}55`,
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.1)"; e.currentTarget.style.boxShadow = `0 4px 14px ${brandPrimary}88`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; e.currentTarget.style.boxShadow = `0 2px 8px ${brandPrimary}55`; }}
                  >Lihat Jadwal</button>
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{
                      padding: `${S[3]}px ${S[4]}px`,
                      background: "rgba(0,0,0,0.55)", color: C.text,
                      border: `1px solid rgba(255,255,255,0.15)`,
                      borderRadius: 8, fontSize: T.sm, fontWeight: T.semibold,
                      textDecoration: "none", fontFamily: T.sans,
                      letterSpacing: T.tracking_normal,
                      display: "inline-flex", alignItems: "center", gap: S[1],
                      transition: "all 0.15s ease",
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.75)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.55)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
                    >🗺️ Maps</a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// FAQ PAGE — frequently asked questions dgn accordion
// ════════════════════════════════════════════════════════════════════
const FAQ_GROUPS = [
  {
    title: "🎟️ Pemesanan Tiket",
    items: [
      { q: "Bagaimana cara pesan tiket?", a: "Lima langkah, lima menit: pilih lokasi → pilih film → pilih jadwal → pilih kursi → checkout. Tiket otomatis dikirim ke WhatsApp Anda dalam bentuk QR. Tinggal tunjukin di counter, beres." },
      { q: "Bayarnya di mana?", a: "Dua pilihan: bayar online lewat Midtrans (QRIS, e-wallet, transfer bank, kartu) atau bayar tunai/QRIS di counter saat ambil tiket. Pilih sesuai mood Anda saat checkout." },
      { q: "Bisa pilih kursi sendiri?", a: "Tentu. Peta kursi real-time — kursi yang sudah dibeli orang lain langsung terblok, jadi tidak ada cerita kursi kembar atau double-booking." },
      { q: "Harus print tiket?", a: "Tidak. Cukup tunjukkan QR code dari WhatsApp atau halaman E-Ticket. Staf scan, tiket fisik tercetak otomatis untuk Anda. Hemat kertas, hemat antri." },
      { q: "Sampai jam berapa bisa booking?", a: "Sampai 15 menit sebelum film mulai. Tapi makin awal makin bagus — kursi tengah suka cepat habis." },
    ],
  },
  {
    title: "💳 Pembayaran & Refund",
    items: [
      { q: "Metode pembayaran apa saja?", a: "Hampir semua: QRIS, kartu kredit/debit, e-wallet (GoPay, OVO, Dana, ShopeePay), Virtual Account semua bank besar (BCA, BNI, Mandiri, BRI, Permata), bahkan bayar tunai di Alfamart/Indomaret." },
      { q: "Ada biaya admin tersembunyi?", a: "Tidak ada. Harga yang Anda lihat adalah harga yang Anda bayar — sudah termasuk PPN 11%. Tidak ada surprise di akhir transaksi." },
      { q: "Bisa refund tiket?", a: "Tiket tidak bisa di-refund dalam bentuk uang, tapi bisa reschedule ke jadwal lain di hari yang sama (tergantung kursi tersedia). Hubungi CS minimal 2 jam sebelum showtime." },
      { q: "Kalau filmnya dibatalkan, gimana?", a: "Kalau pembatalan dari pihak kami, Anda dihubungi langsung. Pilih: full refund kembali ke metode pembayaran, atau reschedule gratis ke jadwal lain." },
    ],
  },
  {
    title: "🎁 Promo & Loyalty",
    items: [
      { q: "Cara pakai kode promo?", a: "Di halaman checkout, ada kolom 'Kode Promo' — masukkan kodenya, klik Apply. Diskon langsung kepotong, tanpa ribet." },
      { q: "Bagaimana cara dapat poin?", a: "Setiap booking, Anda otomatis dapat poin: setiap Rp 5.000 = 1 poin. Tidak perlu daftar member terpisah — cukup pakai nomor HP yang sama tiap booking, sistem yang urus." },
      { q: "Poin bisa ditukar jadi apa?", a: "Diskon tiket berikutnya. Rumus mudah: 100 poin = Rp 1.000. Pilih jumlah poin di checkout (kelipatan 100), diskon langsung diterapkan." },
      { q: "Poin bisa expired?", a: "Berlaku 12 bulan sejak transaksi terakhir Anda. Selama Anda masih nonton, poin Anda aman." },
    ],
  },
  {
    title: "🎬 Film & Studio",
    items: [
      { q: "Format film yang tersedia?", a: "2D (standar), 3D (kacamata disediakan), IMAX (layar raksasa + audio premium), dan 4DX (kursi bergerak + efek wind/water). Ketersediaan tergantung outlet — cek saat pilih jadwal." },
      { q: "Apa arti rating SU, 13+, 17+, D21?", a: "SU bebas semua usia, 13+ remaja 13 tahun ke atas, 17+ remaja 17 tahun ke atas, D21 khusus dewasa 21 tahun ke atas. Detail lengkap + kebijakan ada di section 'Klasifikasi Usia Film' di atas." },
      { q: "Ada subtitle Indonesia?", a: "Hampir semua film impor sudah ada subtitle Indonesia. Cek info subtitle di halaman detail film masing-masing." },
      { q: "Bisa sewa studio untuk event privat?", a: "Bisa banget. Ulang tahun anak, anniversary, gathering kantor, screening rilis perdana — cek menu 'Studio' di header. Studio jadi milik Anda, dari layar sampai snack." },
    ],
  },
  {
    title: "📱 Akun & E-Ticket",
    items: [
      { q: "Harus daftar akun dulu?", a: "Tidak. Cukup masukkan nomor HP saat booking — sistem otomatis buat profile member untuk Anda. Tidak ada formulir berlembar-lembar, tidak ada password yang harus diingat." },
      { q: "Cara akses booking history?", a: "Klik tombol Sign In di header, masukkan nomor HP yang dipakai booking. Anda akan lihat semua booking (aktif & past), saldo poin, dan promo yang tersedia." },
      { q: "Tidak terima WhatsApp e-tiket?", a: "Cek folder spam atau pastikan nomor WhatsApp aktif. Atau buka halaman 'Akun' Anda — semua e-tiket bisa di-download manual dari sana. Kalau masih tidak ada, chat CS kami." },
      { q: "Bisa transfer tiket ke orang lain?", a: "Bisa. Tiket tidak diatasnamakan — siapapun yang bawa QR codenya bisa masuk. Forward saja QR-nya ke teman. Tapi jaga baik-baik, sekali QR di-scan, tiket terpakai." },
    ],
  },
];

function FAQPage({ brandPrimary, customFaqGroups, heroOverride }) {
  const [openKey, setOpenKey] = useState("0-0");  // group 0 item 0 default open
  // Resolve: tenant custom FAQ kalau ada (>=1 grup dgn >=1 item), fallback default
  const groups = (Array.isArray(customFaqGroups) && customFaqGroups.length > 0)
    ? customFaqGroups
    : FAQ_GROUPS;
  return (
    <div style={{ paddingBottom: 60 }}>
      <PageHero
        tag={heroOverride?.tag || "FAQ · Bantuan"}
        title={heroOverride?.title || "Tanya Apa Saja"}
        subtitle={heroOverride?.subtitle || "Dari klasifikasi usia film sampai cara redeem poin — semua jawaban yang Anda butuhkan, dalam satu halaman."}
        accent={heroOverride?.accent || "❓"}
        brandPrimary={brandPrimary}
      />
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
      {/* RATING GUIDE — selalu di paling atas FAQ */}
      <div id="rating-guide" style={{ marginBottom: 32, scrollMarginTop: 100 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0, marginBottom: 6, letterSpacing: -0.3 }}>🎞️ Klasifikasi Usia Film</h2>
        <p style={{ fontSize: 13.5, color: C.sub, margin: 0, marginBottom: 16, lineHeight: 1.6 }}>
          Kami mengikuti standar resmi <strong style={{ color: "#fff" }}>Lembaga Sensor Film (LSF) Indonesia</strong>. Pastikan Anda dan rombongan sesuai dengan klasifikasi film yang dipilih — staf kami berhak meminta identitas di pintu masuk untuk verifikasi usia.
        </p>
        <RatingGuideSection brandPrimary={brandPrimary} />
        <div style={{
          marginTop: 14, padding: "12px 16px",
          background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)",
          borderRadius: 10, fontSize: 12.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.6,
        }}>
          <strong style={{ color: "#fbbf24" }}>💡 Tips:</strong> Bawa KTP, SIM, atau Kartu Pelajar untuk film 13+, 17+, dan D21. Tanpa identitas resmi, staf berhak menolak masuk demi keamanan & kepatuhan regulasi.
        </div>
      </div>
      {groups.map((group, gi) => (
        <div key={gi} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0, marginBottom: 12, letterSpacing: -0.3 }}>{group.title}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {group.items.map((it, ii) => {
              const key = `${gi}-${ii}`;
              const open = openKey === key;
              return (
                <div key={key} style={{
                  background: C.card, border: `1px solid ${open ? brandPrimary + "55" : C.border}`, borderRadius: 12,
                  overflow: "hidden", transition: "border-color 0.15s",
                }}>
                  <button onClick={() => setOpenKey(open ? null : key)} style={{
                    width: "100%", textAlign: "left", padding: "14px 16px",
                    background: "transparent", border: "none", cursor: "pointer", color: "#fff",
                    fontFamily: "inherit", fontSize: 13.5, fontWeight: 700,
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                  }}>
                    <span>{it.q}</span>
                    <span style={{
                      fontSize: 18, color: open ? brandPrimary : C.dim, transition: "transform 0.2s",
                      transform: open ? "rotate(45deg)" : "rotate(0)", lineHeight: 1, flexShrink: 0,
                    }}>+</span>
                  </button>
                  {open && (
                    <div style={{
                      padding: "0 16px 16px", fontSize: 13, color: C.sub, lineHeight: 1.7,
                      borderTop: `1px solid ${C.border}`, paddingTop: 14, marginTop: -1,
                    }}>{it.a}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{
        marginTop: 30, padding: 24, background: `linear-gradient(135deg, ${brandPrimary}15, rgba(0,0,0,0.2))`,
        border: `1px solid ${brandPrimary}44`, borderRadius: 14, textAlign: "center",
      }}>
        <div style={{ fontSize: 20, marginBottom: 8 }}>💬</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Masih ada pertanyaan?</div>
        <p style={{ fontSize: 12.5, color: C.sub, margin: 0, marginBottom: 14 }}>Tim customer service kami siap bantu 24/7.</p>
        <a href="https://wa.me/6285190062368" target="_blank" rel="noopener noreferrer" style={{
          display: "inline-block", padding: "10px 22px", background: brandPrimary, color: "#fff", textDecoration: "none",
          borderRadius: 10, fontSize: 13, fontWeight: 800, boxShadow: `0 6px 18px ${brandPrimary}55`,
        }}>💬 Chat WhatsApp CS</a>
      </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ABOUT PAGE — company history & info
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// CUSTOM PAGE — admin-defined page dgn hero + body
// ════════════════════════════════════════════════════════════════════
function CustomPage({ page, brandPrimary }) {
  const h = page.hero || {};
  // body: plain text dgn newline support, atau HTML kalau diawali "<"
  const body = page.body || "";
  const isHtml = body.trim().startsWith("<");
  return (
    <div style={{ paddingBottom: 60 }}>
      <PageHero
        tag={h.tag || page.slug.toUpperCase()}
        title={h.title || page.slug}
        subtitle={h.subtitle || ""}
        accent={h.accent || "📄"}
        brandPrimary={brandPrimary}
      />
      {body && (
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 4px" }}>
          {isHtml ? (
            <div style={{ color: C.text, fontSize: 14, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: body }} />
          ) : (
            <div style={{ color: C.text, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{body}</div>
          )}
        </div>
      )}
    </div>
  );
}

function AboutPage({ brand, brandPrimary, onBack, heroOverride }) {
  const name = brand?.brand_short || brand?.name || "KaryaOS";
  return (
    <div style={{ paddingBottom: 60 }}>
      <PageHero
        tag={heroOverride?.tag || "About Us"}
        title={heroOverride?.title || name}
        subtitle={heroOverride?.subtitle || "Bioskop tanpa antri loket. Pilih film dari sofa, pilih kursi favorit, sambil order popcorn — semuanya dalam satu scan QR."}
        accent={heroOverride?.accent || "🎬"}
        brandPrimary={brandPrimary}
      />
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Story */}
      <Section title="📖 Tentang Kami">
        <p style={{ margin: 0, marginBottom: 12 }}>
          <strong style={{ color: "#fff" }}>{name}</strong> adalah platform booking tiket bioskop online yang dirancang untuk memberi pengalaman pemesanan yang mulus tanpa antri loket. Customer bisa pilih film, kursi favorit, snack F&B, dan ambil tiket di counter dengan satu scan QR.
        </p>
        <p style={{ margin: 0, marginBottom: 12 }}>
          Dibangun dengan teknologi modern di atas platform <span style={{ color: brandPrimary, fontWeight: 700 }}>karyaOS</span>, kami mendukung 5 outlet di kota besar Indonesia: Jakarta, Bandung, Bali, Medan, dan Surabaya — dengan jadwal real-time, F&B bundles, dan loyalty member otomatis.
        </p>
      </Section>

      {/* Mission */}
      <Section title="🎯 Misi Kami">
        <ul style={{ margin: 0, paddingLeft: 18, color: C.sub, lineHeight: 1.8 }}>
          <li>Memberikan pengalaman bioskop yang efisien & menyenangkan</li>
          <li>Mengurangi waktu antri loket dengan teknologi self-service</li>
          <li>Mendukung budaya nonton film di Indonesia dengan loyalty rewards</li>
          <li>Mengintegrasikan F&B + tiket dalam satu transaksi mulus</li>
        </ul>
      </Section>

      {/* Features */}
      <Section title="✨ Apa yang Kami Tawarkan">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 14 }}>
          <FeatureCard icon="🎬" title="5 Lokasi Cinema" desc="Jakarta, Bandung, Bali, Medan, Surabaya" />
          <FeatureCard icon="💺" title="Pilih Kursi Sendiri" desc="Real-time seat map per studio" />
          <FeatureCard icon="🍿" title="F&B Bundles" desc="Popcorn, drinks, snack combo" />
          <FeatureCard icon="⭐" title="Auto-Member Loyalty" desc="Setiap booking dapet poin (Rp 5k = 1pt)" />
          <FeatureCard icon="🎟️" title="Promo Code" desc="Diskon promo + voucher" />
          <FeatureCard icon="📱" title="WA E-Tiket" desc="Auto-kirim e-tiket via WhatsApp" />
        </div>
      </Section>

      {/* Contact */}
      <Section title="📞 Kontak">
        <div style={{ display: "grid", gap: 10 }}>
          {brand?.contact_phone && <ContactRow icon="📞" label="Telepon" value={brand.contact_phone} />}
          {brand?.contact_email && <ContactRow icon="✉️" label="Email" value={brand.contact_email} link={`mailto:${brand.contact_email}`} />}
          {brand?.address && <ContactRow icon="📍" label="Alamat" value={brand.address} />}
          {brand?.website && <ContactRow icon="🌐" label="Website" value={brand.website} link={brand.website} />}
          {!brand?.contact_phone && !brand?.contact_email && (
            <div style={{ fontSize: 13, color: C.dim }}>Hubungi kami via counter cinema di outlet terdekat.</div>
          )}
        </div>
      </Section>

      <div style={{ textAlign: "center", marginTop: 30 }}>
        <button onClick={onBack} style={{
          padding: "12px 28px", background: brandPrimary, color: "#fff",
          border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
          boxShadow: `0 6px 18px ${brandPrimary}55`,
        }}>🎬 Mulai Booking</button>
      </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0, marginBottom: 14, letterSpacing: -0.3 }}>{title}</h2>
      <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

function ContactRow({ icon, label, value, link }) {
  const inner = (
    <>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, color: C.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, marginBottom: 2 }}>{label.toUpperCase()}</div>
        <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{value}</div>
      </div>
    </>
  );
  if (link) return (
    <a href={link} target="_blank" rel="noopener noreferrer" style={{ display: "flex", gap: 10, padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.03)", textDecoration: "none", border: `1px solid ${C.border}` }}>
      {inner}
    </a>
  );
  return <div style={{ display: "flex", gap: 10, padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>{inner}</div>;
}

// ════════════════════════════════════════════════════════════════════
// FOOTER
// ════════════════════════════════════════════════════════════════════
// Default footer config — dipakai kalau tenant belum kustomisasi
const DEFAULT_FOOTER_CONFIG = {
  description: "Premium cinema experience at your fingertips. Book tickets online, pick seats, watch instantly.",
  social: [
    { name: "WA", icon: "💬", url: "https://wa.me/6285190062368" },
    { name: "IG", icon: "📷", url: "https://instagram.com" },
    { name: "TT", icon: "🎵", url: "https://tiktok.com" },
    { name: "YT", icon: "▶", url: "https://youtube.com" },
  ],
  nav: [
    { label: "Home", target: "outlet" },
    { label: "Movies", target: "movies" },
    { label: "Promo", target: "promo" },
    { label: "Private Event", target: "studio" },
    { label: "Locations", target: "locations" },
    { label: "About", target: "about" },
  ],
  help: [
    { label: "FAQ", target: "faq" },
    { label: "Cara Pesan Tiket", target: "faq" },
    { label: "Kebijakan Refund", target: "faq" },
    { label: "Loyalty Program", target: "faq" },
    { label: "Customer Service", url: "https://wa.me/6285190062368" },
  ],
  company: [
    { label: "About Us", target: "about" },
    { label: "Careers", target: "about" },
    { label: "Partnership", target: "about" },
  ],
  legal: [
    { label: "Terms & Conditions", target: "faq" },
    { label: "Privacy Policy", target: "faq" },
  ],
};

function Footer({ brand, brandPrimary, onAbout, onNav, footerConfig }) {
  const brandName = brand?.brand_short || brand?.name || "karyaOS";
  const year = new Date().getFullYear();
  // Merge tenant config (per-section fallback supaya partial config tetap aman)
  const cfg = footerConfig || {};
  const fc = {
    description: cfg.description || DEFAULT_FOOTER_CONFIG.description,
    social:  Array.isArray(cfg.social)  && cfg.social.length  ? cfg.social  : DEFAULT_FOOTER_CONFIG.social,
    nav:     Array.isArray(cfg.nav)     && cfg.nav.length     ? cfg.nav     : DEFAULT_FOOTER_CONFIG.nav,
    help:    Array.isArray(cfg.help)    && cfg.help.length    ? cfg.help    : DEFAULT_FOOTER_CONFIG.help,
    company: Array.isArray(cfg.company) && cfg.company.length ? cfg.company : DEFAULT_FOOTER_CONFIG.company,
    legal:   Array.isArray(cfg.legal)   && cfg.legal.length   ? cfg.legal   : DEFAULT_FOOTER_CONFIG.legal,
  };
  const FooterLink = ({ children, onClick, href }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer" style={footerLinkStyle}>{children}</a>
    : <button onClick={onClick} style={{ ...footerLinkStyle, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>{children}</button>;
  const renderLinks = (list) => list.map((l, i) => (
    l.url
      ? <FooterLink key={`${l.label}-${i}`} href={l.url}>{l.label}</FooterLink>
      : <FooterLink key={`${l.label}-${i}`} onClick={() => onNav?.(l.target)}>{l.label}</FooterLink>
  ));
  return (
    <footer style={{
      marginTop: 100, padding: "56px 24px 28px",
      borderTop: `1px solid ${C.border}`,
      background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.5))",
      position: "relative",
    }}>
      {/* Top edge glow */}
      <div style={{
        position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)",
        width: "50%", height: 2,
        background: `linear-gradient(90deg, transparent, ${brandPrimary}, transparent)`,
        opacity: 0.5,
      }} />
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: S[10], marginBottom: S[10] }}>
          {/* Column 1: Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: S[3], marginBottom: S[4] }}>
              {brand?.logo_url && <img src={brand.logo_url} alt="" style={{ height: 32, objectFit: "contain" }} />}
              <div>
                <div style={{ ...TY.title, fontSize: 18, color: C.text }}>{brandName}</div>
                <div style={{ ...TY.eyebrow, color: C.dim, marginTop: 4 }}>Cinema Booking</div>
              </div>
            </div>
            <p style={{ ...TY.bodySm, color: C.sub, lineHeight: 1.7, margin: 0, marginBottom: S[5] }}>
              {fc.description}
            </p>
            {/* Social icons */}
            <div style={{ display: "flex", gap: S[2] }}>
              {fc.social.map(s => (
                <a key={s.name || s.url} href={s.url} target="_blank" rel="noopener noreferrer" title={s.name} style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: C.card, border: `1px solid ${C.borderSubtle}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  textDecoration: "none", fontSize: T.base, transition: "all 0.15s ease",
                  color: C.sub,
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${brandPrimary}1a`; e.currentTarget.style.borderColor = `${brandPrimary}55`; e.currentTarget.style.color = C.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = C.card; e.currentTarget.style.borderColor = C.borderSubtle; e.currentTarget.style.color = C.sub; }}>{s.icon}</a>
              ))}
            </div>
          </div>

          {/* Column 2: Navigation */}
          <div>
            <FooterHeading>Navigation</FooterHeading>
            {renderLinks(fc.nav)}
          </div>

          {/* Column 3: Help */}
          <div>
            <FooterHeading>Help</FooterHeading>
            {renderLinks(fc.help)}
          </div>

          {/* Column 4: Company + Legal */}
          <div>
            <FooterHeading>Company</FooterHeading>
            {renderLinks(fc.company)}
            {fc.legal.length > 0 && (
              <>
                <div style={{ height: 14 }} />
                <FooterHeading>Legal</FooterHeading>
                {renderLinks(fc.legal)}
              </>
            )}
          </div>
        </div>

        {/* Payment partners row */}
        <PaymentPartners />

        {/* Bottom bar */}
        <div style={{
          paddingTop: S[6], borderTop: `1px solid ${C.borderSubtle}`,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: S[4], flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[4], flexWrap: "wrap" }}>
            <span style={{ ...TY.caption, color: C.dim }}>© {year} {brandName}. All rights reserved.</span>
            <span style={{ ...TY.eyebrow, display: "inline-flex", alignItems: "center", gap: S[2], color: C.sub }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
              Cinema Operational Intelligence
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: S[4], flexWrap: "wrap" }}>
            <LocaleSwitcher compact />
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ ...TY.caption, color: C.dim }}>Powered by</span>
              <span style={{ ...TY.eyebrow, color: brandPrimary }}>karya<span style={{ color: C.amber }}>OS</span></span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterHeading({ children }) {
  return <div style={{ ...TY.eyebrow, color: C.text, marginBottom: S[4] }}>{children}</div>;
}

// Payment partners — Midtrans, Xendit (gateway), GoPay (e-wallet), QRIS (universal QR).
// Cuma 4 brand utama, biar bersih. Logo dari /img/payments/{slug}.png|.svg —
// kalau gak ada, fallback ke text pill brand-colored.
const PAYMENT_METHODS = [
  { slug: "midtrans", label: "Midtrans", bg: "#005a9c", fg: "#fff" },  // navy blue
  { slug: "xendit",   label: "Xendit",   bg: "#4573d2", fg: "#fff" },  // royal blue
  { slug: "gopay",    label: "GoPay",    bg: "#00aed6", fg: "#fff" },  // gojek cyan
  { slug: "qris",     label: "QRIS",     bg: "#ed1c24", fg: "#fff" },  // red official
];

// Logo dgn fallback chain: local PNG → local SVG → text wordmark pill
function PaymentLogo({ method }) {
  const [stage, setStage] = useState(0);
  const sources = [`/img/payments/${method.slug}.png`, `/img/payments/${method.slug}.svg`];
  if (stage < sources.length) {
    return (
      <img
        src={sources[stage]}
        alt={method.label}
        title={method.label}
        loading="lazy"
        onError={() => setStage(s => s + 1)}
        style={{
          height: 36, width: "auto", maxWidth: 110,
          objectFit: "contain",
          background: "#fff", padding: `${S[1]}px ${S[3]}px`,
          borderRadius: 6, border: `1px solid ${C.borderSubtle}`,
          transition: "all 0.15s ease",
        }}
      />
    );
  }
  // Text wordmark fallback (brand-colored)
  return (
    <span title={method.label} style={{
      minWidth: 80, height: 36,
      padding: `0 ${S[4]}px`,
      background: method.bg, color: method.fg,
      border: `1px solid rgba(255,255,255,0.08)`,
      borderRadius: 6,
      fontSize: T.sm, fontFamily: T.sans,
      fontWeight: T.bold, letterSpacing: T.tracking_wide,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      userSelect: "none",
      boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
    }}>{method.label}</span>
  );
}

function PaymentPartners() {
  return (
    <div style={{
      paddingTop: S[5], paddingBottom: S[5],
      marginBottom: S[5],
      borderTop: `1px solid ${C.borderSubtle}`,
      borderBottom: `1px solid ${C.borderSubtle}`,
      display: "flex", flexDirection: "column", gap: S[3],
    }}>
      <div style={{
        fontSize: T.xs, color: C.meta, fontFamily: T.mono,
        letterSpacing: T.tracking_wider, textTransform: "uppercase",
        fontWeight: T.medium,
        display: "flex", alignItems: "center", gap: S[2],
      }}>
        <span style={{ fontSize: T.sm }}>🔒</span>
        Secure Payment Supported by
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: S[3], alignItems: "center" }}>
        {PAYMENT_METHODS.map(m => <PaymentLogo key={m.slug} method={m} />)}
      </div>
    </div>
  );
}

const footerLinkStyle = {
  display: "block", padding: `${S[1]}px 0`, fontSize: T.sm, color: C.sub,
  textDecoration: "none", transition: "color 0.15s ease", fontFamily: T.sans,
  fontWeight: T.regular, lineHeight: T.normal, letterSpacing: T.tracking_normal,
};

// ════════════════════════════════════════════════════════════════════
// HEADER
// ════════════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { key: "outlet",    label: "Home" },
  { key: "movies",    label: "Movies" },
  { key: "promo",     label: "Promo" },
  { key: "studio",    label: "Private Event" },
  { key: "locations", label: "Locations" },
  { key: "about",     label: "About" },
];

function Header({ outlet, step, onResetOutlet, onBack, onHome, brand, brandPrimary, session, onSignInClick, onSignOut, onNav, onPickFilm, navItems }) {
  const items = navItems || NAV_ITEMS;
  const brandName = brand?.brand_short || brand?.name || "karyaOS";
  const showBack = !["outlet", "success", "movies", "promo", "studio", "locations", "about", "history"].includes(step);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Netflix-style: transparent saat di top, solid setelah scroll >60px
  // Only applies di page yg punya hero (outlet/films). Page lain selalu solid.
  const hasHero = ["outlet", "films", "movies"].includes(step);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!hasHero) { setScrolled(true); return; }
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasHero]);

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: scrolled ? "rgba(20,20,20,0.92)" : "linear-gradient(180deg, rgba(20,20,20,0.85), transparent)",
      backdropFilter: scrolled ? "blur(20px) saturate(180%)" : "none",
      WebkitBackdropFilter: scrolled ? "blur(20px) saturate(180%)" : "none",
      borderBottom: scrolled ? `1px solid ${C.border}` : "1px solid transparent",
      padding: "12px 20px",
      transition: "background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
        {showBack && (
          <button onClick={onBack} title="Kembali" style={{
            background: "transparent", border: `1px solid ${C.border}`, color: C.text,
            borderRadius: 8, width: 34, height: 34, fontSize: 15, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
          }}>←</button>
        )}
        <button onClick={onHome} title="Home" style={{
          display: "flex", alignItems: "center", gap: S[3], background: "transparent", border: "none",
          color: C.text, cursor: "pointer", fontFamily: "inherit", padding: 0, textAlign: "left", flexShrink: 0,
        }}>
          {brand?.logo_url && <img src={brand.logo_url} alt="" style={{ height: 32, objectFit: "contain" }} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: T.md, fontWeight: T.bold, letterSpacing: T.tracking_tight, lineHeight: T.tight }}>{brandName}</div>
            <div style={{ fontSize: T.xs, color: C.dim, fontFamily: T.mono, letterSpacing: T.tracking_wider, fontWeight: T.medium, lineHeight: 1 }}>CINEMA · ONLINE BOOKING</div>
          </div>
        </button>

        {/* Desktop nav */}
        <nav className="cw-nav-desktop" style={{ display: "flex", gap: 4, marginLeft: 16, flex: 1 }}>
          {items.map(item => {
            const active = step === item.key || (item.key === "outlet" && ["outlet", "films", "filmDetail", "showtime", "seats", "bundles", "checkout"].includes(step));
            return (
              <button key={item.key} onClick={() => onNav?.(item.key)} style={{
                background: active ? `${brandPrimary}22` : "transparent",
                border: "none", color: active ? brandPrimary : C.sub,
                borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.15s",
              }}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = C.text; } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.sub; } }}>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Mobile menu toggle */}
        <button className="cw-nav-mobile-toggle" onClick={() => setMenuOpen(o => !o)} style={{
          display: "none", background: "transparent", border: `1px solid ${C.border}`, color: C.text,
          borderRadius: 8, width: 34, height: 34, fontSize: 16, cursor: "pointer", fontFamily: "inherit",
        }}>☰</button>

        {/* Outlet pill */}
        {outlet && step !== "outlet" && (
          <button onClick={onResetOutlet} className="cw-outlet-pill" title="Ganti lokasi" style={{
            background: `${brandPrimary}22`, border: `1px solid ${brandPrimary}55`, color: brandPrimary,
            borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
          }}>
            <span>📍</span>
            <span>{outlet.name?.replace("Karya Cinema ", "") || outlet.code}</span>
          </button>
        )}

        {/* Search button */}
        <button onClick={() => setSearchOpen(true)} title="Cari film" style={{
          background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
          color: C.text, borderRadius: 8, width: 34, height: 34, fontSize: 14, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>🔍</button>

        {/* Sign in / Profile */}
        {session ? (
          <div style={{ position: "relative" }}>
            <button onClick={() => setProfileOpen(o => !o)} style={{
              display: "flex", alignItems: "center", gap: 8, background: `${brandPrimary}22`,
              border: `1px solid ${brandPrimary}55`, color: brandPrimary,
              borderRadius: 999, padding: "6px 6px 6px 12px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            }}>
              <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.name || "Member"}</span>
              <span style={{ background: brandPrimary, color: "#fff", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{(session.name || "U")[0].toUpperCase()}</span>
            </button>
            {profileOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 220, zIndex: 100,
                background: "#111", border: `1px solid ${C.border}`, borderRadius: 12, padding: 8,
                boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
              }}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{session.name}</div>
                  <div style={{ fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{session.phone}</div>
                  <div style={{ fontSize: 11, color: brandPrimary, marginTop: 4, fontWeight: 700 }}>⭐ {session.points || 0} poin</div>
                </div>
                <button onClick={() => { setProfileOpen(false); onNav?.("history"); }} style={menuBtnStyle}>📋 History Pembelian</button>
                <button onClick={() => { setProfileOpen(false); onSignOut(); }} style={{ ...menuBtnStyle, color: "#fca5a5" }}>↪ Sign Out</button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={onSignInClick} style={{
            background: brandPrimary, border: "none", color: "#fff",
            borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            boxShadow: `0 4px 14px ${brandPrimary}55`,
          }}>Sign In</button>
        )}
      </div>

      {/* Mobile menu drawer */}
      {menuOpen && (
        <div className="cw-nav-mobile-menu" style={{
          display: "none", marginTop: 10, padding: "10px 0",
          borderTop: `1px solid ${C.border}`,
        }}>
          {items.map(item => (
            <button key={item.key} onClick={() => { setMenuOpen(false); onNav?.(item.key); }} style={{
              width: "100%", textAlign: "left", padding: "10px 16px",
              background: "transparent", border: "none", color: C.text,
              fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>{item.label}</button>
          ))}
        </div>
      )}

      {/* Search modal */}
      {searchOpen && (
        <SearchModal onClose={() => setSearchOpen(false)} onPickFilm={(f) => { setSearchOpen(false); onPickFilm?.(f); }} brandPrimary={brandPrimary} />
      )}
    </header>
  );
}

// ════════════════════════════════════════════════════════════════════
// SEARCH MODAL — quick film search
// ════════════════════════════════════════════════════════════════════
function SearchModal({ onClose, onPickFilm, brandPrimary }) {
  const [query, setQuery] = useState("");
  const [films, setFilms] = useState([]);
  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/films`).then(r => r.json()).then(d => setFilms(d.films || [])).catch(() => {});
  }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return films.slice(0, 8);
    return films.filter(f =>
      (f.title || "").toLowerCase().includes(q) ||
      (f.genre || "").toLowerCase().includes(q)
    ).slice(0, 12);
  }, [query, films]);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 20px 20px",
      animation: "cwFadeIn 0.2s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 600, background: "#0d0d11",
        border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden",
        animation: "cwFadeUp 0.3s ease", boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <input value={query} onChange={e => setQuery(e.target.value)} autoFocus
            placeholder="Cari film by title atau genre…"
            style={{
              flex: 1, background: "transparent", border: "none", color: "#fff",
              fontSize: 15, outline: "none", fontFamily: "inherit",
            }} />
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.dim, fontSize: 20, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.dim, fontSize: 13 }}>
              {query ? `Tidak ada film cocok "${query}"` : "Belum ada film tersedia"}
            </div>
          ) : (
            filtered.map(f => (
              <button key={f.id} onClick={() => onPickFilm(f)} style={{
                width: "100%", display: "flex", gap: 12, padding: "10px 18px",
                background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                color: C.text, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                transition: "background 0.15s",
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                {f.poster_url ? (
                  <img src={f.poster_url} alt="" style={{ width: 44, aspectRatio: "2/3", objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 44, aspectRatio: "2/3", background: "#1a1a22", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎬</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>{f.genre || "—"} · {f.duration_min || 0}mnt</div>
                  <div style={{ display: "inline-block", fontSize: 9, fontWeight: 800, color: f.status === "coming_soon" ? brandPrimary : "#10b981", fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1 }}>{f.status === "coming_soon" ? "COMING SOON" : "NOW SHOWING"}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const menuBtnStyle = {
  width: "100%", textAlign: "left", padding: "8px 12px",
  background: "transparent", border: "none", color: "#e6edf3",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  borderRadius: 6,
};

// ════════════════════════════════════════════════════════════════════
// CINEMA HERO — full-bleed slideshow, "berasa di dalam area cinema"
// Poster film auto-rotate setiap 5 detik, dark gradient overlay, sinematik feel
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// NETFLIX BILLBOARD HERO — featured film, CTA Pesan/Detail, left-aligned
// ════════════════════════════════════════════════════════════════════
function CinemaHero({ films, brandPrimary, onPickFilm }) {
  const slides = useMemo(() => (films || []).filter(f => f.poster_url && f.status !== "archived").slice(0, 5), [films]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const iv = setInterval(() => setIdx(i => (i + 1) % slides.length), 12000);
    return () => clearInterval(iv);
  }, [slides.length]);

  const current = slides[idx];

  // ═══ Trailer autoplay (Netflix-style: after 3s, fade ke trailer muted) ═══
  const [trailerPlaying, setTrailerPlaying] = useState(false);
  const [muted, setMuted] = useState(loadMuted);
  useEffect(() => { saveMuted(muted); }, [muted]);
  const trailerEmbed = current ? ytEmbedUrl(current.trailer_url) : null;
  const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const heroRef = useRef(null);
  const inView = useInView(heroRef, 0.25);  // pause trailer kalau <25% hero visible

  useEffect(() => {
    setTrailerPlaying(false);
    if (!trailerEmbed || isTouch || !inView) return;
    const t = setTimeout(() => setTrailerPlaying(true), 3000);
    return () => clearTimeout(t);
  }, [trailerEmbed, isTouch, idx, inView]);

  if (!current) {
    // Fallback ringan saat film belum loaded — bg gradient brand subtle
    return (
      <section style={{
        position: "relative", width: "100vw", minHeight: "85vh",
        marginLeft: "calc(-50vw + 50%)", marginRight: "calc(-50vw + 50%)",
        background: `linear-gradient(135deg, ${brandPrimary}11, #141414 60%)`,
      }} />
    );
  }

  return (
    <section ref={heroRef} className="cw-hero-billboard" style={{
      position: "relative", width: "100vw", minHeight: "85vh",
      overflow: "hidden",
      marginLeft: "calc(-50vw + 50%)", marginRight: "calc(-50vw + 50%)",
      background: "#141414",
    }}>
      {/* Crossfade poster bg */}
      {slides.map((f, i) => (
        <div key={f.id} aria-hidden={i !== idx} style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${f.poster_url})`,
          backgroundSize: "cover", backgroundPosition: "center 15%",
          opacity: i === idx ? (trailerPlaying ? 0 : 1) : 0,
          transition: "opacity 1.4s ease-in-out",
        }} />
      ))}

      {/* Trailer autoplay overlay (muted, Netflix-style) */}
      {trailerPlaying && trailerEmbed && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <iframe
            src={`${trailerEmbed}&autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${trailerEmbed.split("/embed/")[1]?.split("?")[0]}&playsinline=1&modestbranding=1&showinfo=0&rel=0`}
            title="Trailer"
            allow="autoplay; encrypted-media"
            style={{
              position: "absolute", top: "50%", left: "50%",
              width: "min(177.77vh, 100vw)", height: "min(56.25vw, 100vh)",
              minWidth: "100%", minHeight: "100%",
              transform: "translate(-50%, -50%) scale(1.1)",
              border: 0, opacity: 0,
              animation: "cwFadeIn 1.2s ease 0.2s forwards",
              pointerEvents: "none",
            }}
          />
        </div>
      )}

      {/* Mute toggle — bottom-right kiri dari dots */}
      {trailerPlaying && trailerEmbed && (
        <button onClick={() => setMuted(m => !m)} aria-label={muted ? "Unmute" : "Mute"} style={{
          position: "absolute", bottom: 60, right: slides.length > 1 ? 200 : 60,
          zIndex: 11,
          width: 42, height: 42, borderRadius: "50%",
          background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.4)",
          color: "#fff", fontSize: 18, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(8px)", transition: "all 0.2s",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.85)"; e.currentTarget.style.transform = "scale(1.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.6)"; e.currentTarget.style.transform = "scale(1)"; }}>
          {muted ? "🔇" : "🔊"}
        </button>
      )}

      {/* Netflix dual gradient mask: dark dari kiri (text legibility) + bottom (fade ke row carousel) */}
      <div style={{ position: "absolute", inset: 0,
        background: "linear-gradient(90deg, rgba(10,10,15,0.96) 0%, rgba(10,10,15,0.78) 30%, rgba(10,10,15,0.42) 60%, transparent 100%)",
      }} />
      <div style={{ position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(10,10,15,0.5) 0%, transparent 30%, transparent 55%, #0a0a0f 100%)",
      }} />
      {/* CINEMA VIGNETTE — radial dark corners (premium movie-theater feel) */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 110% 90% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)",
      }} />
      {/* CINEMA SPOTLIGHT — subtle warm glow dari kiri-atas (key light) */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "55%", height: "65%", pointerEvents: "none",
        background: `radial-gradient(ellipse 80% 90% at 25% 40%, ${C.gold}0a 0%, transparent 65%)`,
      }} />

      {/* Content — left-aligned Netflix style */}
      <div style={{
        position: "relative", zIndex: 10,
        maxWidth: 1280, margin: "0 auto",
        padding: "100px 60px 140px",
        minHeight: "85vh",
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
        <div style={{ maxWidth: 620 }}>
          {/* Badge "NOW SHOWING" */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 20,
            padding: "6px 14px", borderRadius: 4,
            background: `${brandPrimary}cc`,
            fontSize: 11, fontWeight: 800, letterSpacing: 2.5, color: "#fff",
            fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", animation: "cwPulse 2s ease infinite" }} />
            {current.status === "coming_soon" ? "Segera Tayang" : "Sedang Tayang"}
          </div>

          {/* Release date countdown (only utk coming_soon film yg punya release_date) */}
          {current.status === "coming_soon" && current.release_date && (() => {
            const days = daysUntil(current.release_date);
            return (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 18,
                padding: "8px 14px", borderRadius: 4,
                background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
                border: `1px solid ${brandPrimary}55`,
                fontSize: 12, color: "#fff", fontWeight: 600,
                fontFamily: "'JetBrains Mono',monospace",
              }}>
                <span style={{ fontSize: 14 }}>📅</span>
                <span>Tayang {fmtFullDate(current.release_date)}</span>
                {days > 0 && <span style={{ color: brandPrimary, fontWeight: 800 }}>· {days} hari lagi</span>}
                {days === 0 && <span style={{ color: "#fbbf24", fontWeight: 800 }}>· Hari ini!</span>}
              </div>
            );
          })()}

          {/* Title — CINEMA drama: heavy 900 weight, super-tight tracking, large shadow */}
          {/* (Cinema brand feel — Netflix/AMC style, NOT Stripe/SaaS restraint) */}
          <h1 style={{
            fontSize: "clamp(40px, 7vw, 82px)", fontWeight: 900,
            letterSpacing: -2.5, lineHeight: 0.95,
            margin: 0, marginBottom: S[5], color: C.text, fontFamily: T.sans,
            textShadow: "0 4px 30px rgba(0,0,0,0.85)",
          }}>
            {current.title}
          </h1>

          {/* Meta row — uniform sm size, regular weight, monospace utk rating badge + numerik */}
          <div style={{ display: "flex", alignItems: "center", gap: S[4], flexWrap: "wrap", marginBottom: S[5], fontSize: T.base, color: "rgba(255,255,255,0.95)", fontFamily: T.sans, fontWeight: T.regular }}>
            {current.rating && (
              <span style={{
                padding: `${S[1]}px ${S[3]}px`, borderRadius: 4,
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.3)",
                fontSize: T.xs, fontWeight: T.semibold, fontFamily: T.mono, letterSpacing: T.tracking_wide,
              }}>{current.rating}</span>
            )}
            {current.duration_min > 0 && <span style={{ fontFamily: T.mono, fontSize: T.sm }}>{Math.floor(current.duration_min / 60)}j {current.duration_min % 60}m</span>}
            {current.genre && <><span style={{ opacity: 0.4 }}>·</span><span>{current.genre}</span></>}
            {current.ratings_count > 0 && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: S[2] }}>
                  <Stars value={current.avg_rating || 0} size={13} color={brandPrimary} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sm, fontWeight: T.medium }}>{Number(current.avg_rating || 0).toFixed(1)}</span>
                </span>
              </>
            )}
          </div>

          {/* Synopsis preview */}
          {current.synopsis && (
            <p style={{
              fontSize: "clamp(13px, 1.3vw, 16px)", color: "rgba(255,255,255,0.88)",
              lineHeight: T.relaxed, margin: 0, marginBottom: S[8],
              fontWeight: T.regular, fontFamily: T.sans,
              maxWidth: 540,
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
              textShadow: "0 2px 8px rgba(0,0,0,0.7)",
            }}>{current.synopsis}</p>
          )}

          {/* CTAs Netflix style: Play + Info — cinema drama dgn glow */}
          <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" }}>
            <button className="cw-hero-cta" onClick={() => onPickFilm?.(current)} style={{
              display: "inline-flex", alignItems: "center", gap: S[3],
              padding: `${S[4]}px ${S[8]}px`,
              background: "#fff", color: C.midnight,
              border: "none", borderRadius: 6,
              fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.25s cubic-bezier(.2,.8,.2,1)",
              boxShadow: "0 8px 24px rgba(255,255,255,0.15), 0 0 0 1px rgba(255,255,255,0.1) inset",
              letterSpacing: 0.2,
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = C.gold;
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 12px 32px ${C.gold}55, 0 0 0 1px rgba(0,0,0,0.1) inset`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#fff";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 8px 24px rgba(255,255,255,0.15), 0 0 0 1px rgba(255,255,255,0.1) inset";
              }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>▶</span>
              Pesan Tiket
            </button>
            <button className="cw-hero-cta" onClick={() => onPickFilm?.(current)} style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "12px 24px",
              background: "rgba(109,109,110,0.7)", color: "#fff",
              border: "none", borderRadius: 4,
              fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.2s",
              backdropFilter: "blur(8px)",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(109,109,110,0.5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(109,109,110,0.7)"; }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>ⓘ</span>
              Info Lengkap
            </button>
          </div>
        </div>

        {/* Slideshow dots — bottom right Netflix style */}
        {slides.length > 1 && (
          <div className="cw-hero-dots" style={{
            position: "absolute", bottom: 60, right: 60,
            display: "flex", gap: 8, alignItems: "center",
          }}>
            {slides.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`} style={{
                width: i === idx ? 28 : 6, height: 4, borderRadius: 2, border: "none",
                background: i === idx ? "#fff" : "rgba(255,255,255,0.4)",
                cursor: "pointer", transition: "all 0.3s ease", padding: 0,
              }} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
// STEP 1: OUTLET PICKER
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// CONTINUE BOOKING ROW — show kalau draft booking belum checkout
// ════════════════════════════════════════════════════════════════════
const STEP_LABEL = {
  filmDetail: "Lihat detail film",
  showtime:   "Pilih jadwal",
  seats:      "Pilih kursi",
  bundles:    "Pilih snack & bundle",
  checkout:   "Konfirmasi & checkout",
};
const STEP_PROGRESS = {
  filmDetail: 20,
  showtime:   40,
  seats:      60,
  bundles:    80,
  checkout:   90,
};

function ContinueBookingRow({ brandPrimary, onRestore, onDismiss }) {
  const [draft, setDraft] = useState(() => loadDraft());

  // Re-check draft saat component mount + setiap 30s (in case dari tab lain)
  useEffect(() => {
    const tick = () => setDraft(loadDraft());
    const iv = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(iv); window.removeEventListener("focus", tick); };
  }, []);

  if (!draft || !draft.film) return null;

  const f = draft.film;
  const st = draft.showtime;
  const seatLabel = (draft.seats || []).length;
  const bundleQty = Object.values(draft.bundlesCart || {}).reduce((s, q) => s + q, 0);
  const progress = STEP_PROGRESS[draft.lastStep] || 20;
  const stepLabel = STEP_LABEL[draft.lastStep] || "Lanjutkan booking";
  const showtimeLabel = st ? `${st.show_date} · ${st.start_time}${st.studio_name ? " · " + st.studio_name : ""}` : null;

  const handleDismiss = (e) => {
    e.stopPropagation();
    onDismiss?.();
    setDraft(null);
  };

  return (
    <div onClick={() => onRestore?.(draft)} style={{
      position: "relative", maxWidth: 1280, margin: "0 auto 32px",
      background: `linear-gradient(90deg, rgba(20,20,20,0.9), rgba(20,20,20,0.7) 60%, transparent), ${f.poster_url ? `url(${f.poster_url}) center/cover` : "#1c1c22"}`,
      borderRadius: 12, overflow: "hidden",
      cursor: "pointer",
      border: `1px solid ${brandPrimary}44`,
      boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px ${brandPrimary}22`,
      transition: "transform 0.2s, box-shadow 0.2s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 14px 36px rgba(0,0,0,0.5), 0 0 0 1px ${brandPrimary}66`; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px ${brandPrimary}22`; }}>
      <div style={{ display: "flex", alignItems: "stretch", minHeight: 140 }}>
        {/* Poster mini di kiri */}
        {f.poster_url && (
          <div style={{
            width: 100, aspectRatio: "2/3", flexShrink: 0,
            background: `url(${f.poster_url}) center/cover`,
            margin: 16, borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
          }} />
        )}
        {/* Info */}
        <div style={{ flex: 1, padding: "16px 12px 16px 4px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
          <div style={{
            display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 6,
            padding: "3px 10px", borderRadius: 4,
            background: brandPrimary, color: "#fff",
            fontSize: 9, fontWeight: 800, letterSpacing: 2,
            fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase",
            marginBottom: 8,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", animation: "cwPulse 2s infinite" }} />
            Lanjutkan Booking
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 2px 8px rgba(0,0,0,0.7)" }}>
            {f.title}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginBottom: 10, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
            {[
              draft.outlet?.name?.replace("Karya Cinema ", "") || draft.outlet?.area || draft.outlet?.code,
              showtimeLabel,
              seatLabel > 0 ? `${seatLabel} kursi` : null,
              bundleQty > 0 ? `${bundleQty} bundle` : null,
            ].filter(Boolean).join(" · ")}
          </div>
          {/* Progress bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.12)", borderRadius: 2, overflow: "hidden", maxWidth: 240 }}>
              <div style={{ width: `${progress}%`, height: "100%", background: brandPrimary, transition: "width 0.4s" }} />
            </div>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.85)", fontFamily: "'JetBrains Mono',monospace" }}>{stepLabel} →</span>
          </div>
        </div>
        {/* Dismiss */}
        <button onClick={handleDismiss} aria-label="Tutup" title="Hapus draft" style={{
          alignSelf: "flex-start", margin: 12,
          width: 30, height: 30, borderRadius: "50%",
          background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.3)",
          color: "#fff", fontSize: 16, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "inherit", padding: 0, flexShrink: 0,
          backdropFilter: "blur(8px)",
        }}>×</button>
      </div>
    </div>
  );
}

function OutletPicker({ onPick, onPickFeaturedFilm, pendingFilm, brandPrimary, onRestoreDraft, onDismissDraft }) {
  const [outlets, setOutlets] = useState(null);
  const [films, setFilms] = useState(null);
  const [error, setError] = useState(null);
  const [cityFilter, setCityFilter] = useState("all");

  const [comingOutlets, setComingOutlets] = useState([]);
  const [comingFilms, setComingFilms] = useState([]);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      fetch(`${API_HOST}/api/outlet-master`).then(r => { if (!r.ok) throw new Error(`outlets ${r.status}`); return r.json(); }),
      fetch(`${API_HOST}/api/cinema/films`).then(r => r.ok ? r.json() : { films: [] }).catch(() => ({ films: [] })),
    ]).then(([d, fd]) => {
      const list = Array.isArray(d) ? d : (d.outlets || d.data || []);
      const cinemaOnly = list.filter(o => o.primary_vertical === "cinema" || o.vertical === "cinema");
      const nowSec = Math.floor(Date.now() / 1000);
      // Active: status active + opening_date passed (or null)
      const active = cinemaOnly.filter(o =>
        (o.status === "active" || o.status === undefined) &&
        (!o.opening_date || o.opening_date <= nowSec)
      );
      // Coming soon: status='coming_soon' OR opening_date in future
      const coming = cinemaOnly.filter(o =>
        o.status === "coming_soon" ||
        (o.opening_date && o.opening_date > nowSec)
      );
      setOutlets(active);
      setComingOutlets(coming);
      const allFilms = fd.films || [];
      setFilms(allFilms.filter(f => f.poster_url && (f.status === "now_showing" || !f.status)).slice(0, 8));
      setComingFilms(allFilms.filter(f => f.status === "coming_soon").slice(0, 8));
    }).catch(e => setError(e));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Compute unique cities for filter chips
  const uniqueCities = useMemo(() => {
    if (!outlets) return [];
    const map = new Map();
    for (const o of outlets) {
      const city = (o.area || o.name?.replace("Karya Cinema ", "") || o.code).split(",")[0].trim();
      const key = city.toLowerCase();
      if (!map.has(key)) map.set(key, { key, label: city, count: 0 });
      map.get(key).count += 1;
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [outlets]);

  const filteredOutlets = useMemo(() => {
    if (!outlets || cityFilter === "all") return outlets || [];
    return outlets.filter(o => {
      const city = (o.area || o.name?.replace("Karya Cinema ", "") || o.code).split(",")[0].trim().toLowerCase();
      return city === cityFilter;
    });
  }, [outlets, cityFilter]);

  if (error) return <ErrorInline error={error} label="Gagal memuat lokasi" onRetry={load} />;
  if (!outlets) return (
    <div style={{ padding: "30px 20px" }}>
      <div className="cw-skeleton" style={{ height: 360, borderRadius: 18, marginBottom: 32 }} />
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <Skeleton h={30} w={260} style={{ margin: "0 auto 8px" }} />
        <Skeleton h={14} w={180} style={{ margin: "0 auto" }} />
      </div>
      <GridSkeleton count={6} height={240} />
    </div>
  );

  return (
    <div className="cw-section-pad" style={{ padding: 0 }}>
      {/* IMMERSIVE CINEMA HERO — film poster slideshow + dark gradient + spotlight feel */}
      <CinemaHero films={films || []} brandPrimary={brandPrimary} onPickFilm={onPickFeaturedFilm} />
      <div style={{ height: 32 }} />

      {/* CONTINUE BOOKING — appear kalau ada draft (booking belum checkout) */}
      <div style={{ padding: "0 20px" }}>
        <ContinueBookingRow brandPrimary={brandPrimary} onRestore={onRestoreDraft} onDismiss={onDismissDraft} />
      </div>

      {/* Now Showing carousel removed — now part of CinemaHero slideshow above */}

      {/* Content sections — padded back in (hero is full-bleed) */}
      <div style={{ padding: "0 0 20px" }} />

      {/* Pending film banner — kalau user klik NOW SHOWING tapi belum pilih outlet */}
      {pendingFilm && (
        <div style={{
          maxWidth: 700, margin: "0 auto 20px",
          background: `linear-gradient(135deg, ${brandPrimary}22, ${brandPrimary}08)`,
          border: `1px solid ${brandPrimary}66`,
          borderRadius: 14, padding: "14px 18px",
          display: "flex", alignItems: "center", gap: 14, animation: "cwFadeUp 0.4s ease",
        }}>
          {pendingFilm.poster_url && (
            <img src={pendingFilm.poster_url} alt="" style={{ width: 48, aspectRatio: "2/3", objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: brandPrimary, fontWeight: 800, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", marginBottom: 2, textTransform: "uppercase" }}>FILM TERPILIH</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{pendingFilm.title}</div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>👇 Pilih lokasi cinema untuk lanjut</div>
          </div>
        </div>
      )}

      {/* Outlet picker section */}
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, margin: 0, marginBottom: 6 }}>
          {pendingFilm ? "Pilih Lokasi" : "Mau Nonton Di Mana?"}
        </h2>
        <p style={{ fontSize: 13, color: C.sub, margin: 0 }}>
          {outlets.length} kota · pilih lokasi favorit Anda
        </p>
      </div>

      {/* City filter chips — quick filter for power users */}
      {outlets.length > 3 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", justifyContent: "center" }}>
          {[{ key: "all", label: "Semua", count: outlets.length }, ...uniqueCities].map(c => {
            const active = cityFilter === c.key;
            return (
              <button key={c.key} onClick={() => setCityFilter(c.key)} style={{
                padding: "8px 14px", borderRadius: 999,
                background: active ? brandPrimary : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? brandPrimary : "rgba(255,255,255,0.1)"}`,
                color: active ? "#fff" : C.sub,
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.15s",
                boxShadow: active ? `0 4px 14px ${brandPrimary}55` : "none",
              }}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = C.text; } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = C.sub; } }}>
                {c.label} <span style={{ opacity: 0.6, fontFamily: "'Geist Mono',monospace", fontSize: 10 }}>({c.count})</span>
              </button>
            );
          })}
        </div>
      )}
      {filteredOutlets.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.dim }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <div>{outlets.length === 0 ? "Belum ada lokasi bioskop aktif" : "Tidak ada outlet untuk filter ini"}</div>
        </div>
      ) : (
        <div className="cw-outlets-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 18 }}>
          {filteredOutlets.map((o, i) => {
            const visual = getCityVisual(o);
            const cityName = o.area || o.name?.replace("Karya Cinema ", "") || o.code;
            return (
              <button key={o.code} onClick={() => onPick(o)} className="cw-outlet-card" style={{
                position: "relative",
                background: visual.url ? `linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.95) 100%), url(${visual.url}) center/cover, ${DEFAULT_CITY_GRADIENT}` : DEFAULT_CITY_GRADIENT,
                border: `1px solid ${C.border}`, borderRadius: 18,
                padding: 0, textAlign: "left", color: "#fff", cursor: "pointer",
                fontFamily: "inherit", overflow: "hidden",
                minHeight: 240, display: "flex", flexDirection: "column", justifyContent: "flex-end",
                transition: "all 0.3s cubic-bezier(.2,.8,.2,1)",
                animation: `cwFadeUp 0.5s ease ${0.08 * i}s both`,
                boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              }}>
                {/* Top-right city emoji bubble */}
                <div style={{
                  position: "absolute", top: 14, right: 14,
                  background: "rgba(0,0,0,0.5)", backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 999, padding: "6px 12px",
                  fontSize: 16,
                }}>{visual.emoji}</div>

                {/* Top-left code badge */}
                <div style={{
                  position: "absolute", top: 14, left: 14,
                  background: "rgba(0,0,0,0.5)", backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 6, padding: "3px 8px",
                  fontSize: 10, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5,
                  color: "rgba(255,255,255,0.9)",
                }}>{o.code}</div>

                {/* Bottom info overlay */}
                <div style={{ position: "relative", padding: "18px 20px 20px" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, marginBottom: 4, textShadow: "0 2px 12px rgba(0,0,0,0.8)", lineHeight: 1 }}>{cityName}</div>
                  {o.name && o.name !== cityName && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: 600, marginBottom: 8, textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}>{o.name.replace("Karya Cinema ", "Karya ")}</div>
                  )}
                  {o.address && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", lineHeight: 1.4, marginBottom: 10, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>📍 {o.address}</div>}
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", background: brandPrimary, color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 800, letterSpacing: 0.5, boxShadow: `0 4px 14px ${brandPrimary}66` }}>
                    LIHAT JADWAL <span style={{ fontSize: 14 }}>→</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* COMING SOON LOCATIONS — teaser for upcoming outlets */}
      {comingOutlets.length > 0 && (
        <div style={{ marginTop: 50 }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ display: "inline-block", padding: "4px 12px", background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: "#fbbf24", fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase" }}>🔜 Opening Soon</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, margin: "10px 0 4px", color: "#fff" }}>Cinema Baru Akan Buka</h3>
            <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Tunggu pembukaan {comingOutlets.length} lokasi baru</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 14 }}>
            {comingOutlets.map(o => {
              const visual = getCityVisual(o);
              const city = o.area || o.name?.replace("Karya Cinema ", "") || o.code;
              const openDate = o.opening_date ? new Date(o.opening_date * 1000).toLocaleDateString("id-ID", { month: "long", year: "numeric" }) : "Segera";
              return (
                <div key={o.code} style={{
                  position: "relative", minHeight: 200,
                  background: visual.url ? `linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.95)), url(${visual.url}) center/cover, ${DEFAULT_CITY_GRADIENT}` : DEFAULT_CITY_GRADIENT,
                  border: "1px solid rgba(251,191,36,0.4)", borderRadius: 16,
                  display: "flex", flexDirection: "column", justifyContent: "flex-end",
                  overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                }}>
                  <div style={{ position: "absolute", top: 14, right: 14, padding: "5px 10px", background: "rgba(251,191,36,0.95)", borderRadius: 6, fontSize: 9, fontWeight: 800, color: "#1a1205", letterSpacing: 1.5, fontFamily: "'JetBrains Mono',monospace" }}>OPENING SOON</div>
                  <div style={{ padding: "16px 20px 18px" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 4, textShadow: "0 2px 12px rgba(0,0,0,0.85)" }}>{visual.emoji} {city}</div>
                    {o.name && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginBottom: 8 }}>{o.name}</div>}
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "rgba(251,191,36,0.18)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 6, fontSize: 11, fontWeight: 700, color: "#fbbf24", fontFamily: "'JetBrains Mono',monospace" }}>📅 {openDate}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* COMING SOON FILMS — teaser carousel */}
      {comingFilms.length > 0 && (
        <div style={{ marginTop: 50 }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ display: "inline-block", padding: "4px 12px", background: `${brandPrimary}22`, border: `1px solid ${brandPrimary}66`, borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: brandPrimary, fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase" }}>🔜 Coming Soon</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, margin: "10px 0 4px", color: "#fff" }}>Film yang Akan Tayang</h3>
            <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Stay tuned · {comingFilms.length} film</p>
          </div>
          <div style={{ overflowX: "auto", paddingBottom: 12, margin: "0 -20px" }}>
            <div style={{ display: "flex", gap: 14, padding: "8px 20px", minWidth: "fit-content" }}>
              {comingFilms.map((f, i) => (
                <div key={f.id} className="cw-film-poster" style={{
                  flexShrink: 0, width: 170, aspectRatio: "2/3", borderRadius: 14,
                  background: `linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.95) 100%), url(${f.poster_url}) center/cover, #1a1a22`,
                  border: `1px solid ${brandPrimary}33`, position: "relative",
                  display: "flex", flexDirection: "column", justifyContent: "flex-end",
                  overflow: "hidden",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  animation: `cwFadeUp 0.5s ease ${i * 0.05}s both`,
                }}>
                  <div style={{ position: "absolute", top: 10, right: 10, padding: "3px 8px", background: `${brandPrimary}dd`, borderRadius: 4, fontSize: 8, fontWeight: 800, color: "#fff", letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace" }}>SOON</div>
                  <div style={{ padding: "12px 12px" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", lineHeight: 1.2, marginBottom: 3, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>{f.title}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.85)", fontFamily: "'JetBrains Mono',monospace", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>{f.duration_min || 0} mnt · {f.genre || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// STEP 2: FILMS GRID
// ════════════════════════════════════════════════════════════════════
const RATING_COLOR = { "SU": "#10b981", "13+": "#22d3ee", "17+": "#fbbf24", "D21": "#ef4444", "21+": "#ef4444" };

// ════════════════════════════════════════════════════════════════════
// KLASIFIKASI USIA — Lembaga Sensor Film Indonesia (LSF)
// ════════════════════════════════════════════════════════════════════
const RATING_GUIDE = [
  {
    code: "SU",
    label: "Semua Umur",
    color: "#10b981",
    icon: "👨‍👩‍👧",
    age: "Tanpa batasan usia",
    desc: "Bisa diajak nonton bareng anak, ponakan, sampai oma-opa. Bebas adegan kekerasan, konten dewasa, dan bahasa kasar — dari awal sampai credit roll.",
    examples: "Animasi anak, film keluarga, dokumenter edukasi, petualangan ringan",
    policy: "Bebas masuk untuk semua usia. Tidak ada pengecekan identitas di pintu.",
  },
  {
    code: "13+",
    label: "Remaja 13 Tahun ke Atas",
    color: "#22d3ee",
    icon: "🧒",
    age: "Minimal 13 tahun",
    desc: "Cocok untuk remaja yang sudah bisa membedakan fiksi dan realita. Mungkin ada perkelahian ringan, tema percintaan remaja, atau adegan menegangkan yang butuh kedewasaan menonton.",
    examples: "Action ringan, fantasi remaja, horror PG, drama keluarga dewasa, sci-fi",
    policy: "Anak di bawah 13 tahun wajib didampingi orang tua. KTP/identitas bisa diminta jika usia diragukan.",
  },
  {
    code: "17+",
    label: "Remaja 17 Tahun ke Atas",
    color: "#fbbf24",
    icon: "🧑",
    age: "Minimal 17 tahun",
    desc: "Konten cukup intens — kekerasan eksplisit, adegan menegangkan, bahasa kasar, atau tema yang berat. Hanya untuk yang sudah cukup matang secara emosional.",
    examples: "Action intens, horror, thriller, drama berat, war movie",
    policy: "Wajib KTP/SIM/identitas resmi. Penonton di bawah 17 tahun tidak diizinkan masuk — bahkan jika didampingi orang tua.",
  },
  {
    code: "D21",
    label: "Dewasa 21 Tahun ke Atas",
    color: "#ef4444",
    icon: "🔞",
    age: "Minimal 21 tahun",
    desc: "Khusus penonton dewasa. Mengandung kekerasan ekstrem, konten seksual eksplisit, atau tema sensitif berat yang butuh kedewasaan psikologis penuh.",
    examples: "Thriller dewasa, drama kontroversial, dokumenter sensitif",
    policy: "Wajib bawa KTP/identitas resmi. Penonton di bawah 21 tahun TIDAK BOLEH masuk — tanpa pengecualian.",
  },
];

const RATING_GUIDE_MAP = Object.fromEntries(RATING_GUIDE.map(r => [r.code, r]));

function RatingGuideSection({ brandPrimary, compact = false }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: compact ? "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" : "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
      {RATING_GUIDE.map(r => (
        <div key={r.code} style={{
          background: C.card, border: `1px solid ${r.color}33`, borderRadius: 12,
          padding: 16, position: "relative",
          borderTop: `3px solid ${r.color}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{
              fontSize: 14, fontWeight: 900, color: r.color,
              padding: "4px 10px", borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
              background: `${r.color}1a`, border: `1px solid ${r.color}55`,
              letterSpacing: 1, minWidth: 46, textAlign: "center",
            }}>{r.code}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{r.label}</div>
              <div style={{ fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase", letterSpacing: 1 }}>{r.age}</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: C.sub, lineHeight: 1.55, margin: "10px 0 8px" }}>{r.desc}</p>
          {!compact && (
            <>
              <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "'JetBrains Mono',monospace", marginTop: 12 }}>Contoh Genre</div>
              <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 8 }}>{r.examples}</div>
              <div style={{ fontSize: 10, color: r.color, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "'JetBrains Mono',monospace", marginTop: 10 }}>Kebijakan Outlet</div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.78)", lineHeight: 1.55 }}>{r.policy}</div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// Popover modal untuk satu rating spesifik (dipanggil saat user klik badge)
function RatingInfoModal({ ratingCode, onClose, onSeeAll }) {
  const r = RATING_GUIDE_MAP[ratingCode] || RATING_GUIDE_MAP[String(ratingCode).toUpperCase()];
  if (!r) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#1a1a22", border: `1px solid ${r.color}66`, borderTop: `3px solid ${r.color}`,
        borderRadius: 14, padding: 24, maxWidth: 420, width: "100%",
        boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              fontSize: 18, fontWeight: 900, color: r.color,
              padding: "6px 14px", borderRadius: 8, fontFamily: "'JetBrains Mono',monospace",
              background: `${r.color}1a`, border: `1px solid ${r.color}55`, letterSpacing: 1,
            }}>{r.code}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{r.label}</div>
              <div style={{ fontSize: 11, color: r.color, fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase", letterSpacing: 1.5 }}>{r.age}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, margin: "0 0 14px" }}>{r.desc}</p>
        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: r.color, fontWeight: 800, letterSpacing: 1.5, fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>KEBIJAKAN OUTLET</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.9)", lineHeight: 1.55 }}>{r.policy}</div>
        </div>
        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: 800, letterSpacing: 1.5, fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>CONTOH GENRE</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{r.examples}</div>
        </div>
        {onSeeAll && (
          <button onClick={onSeeAll} style={{
            width: "100%", padding: 12, background: "rgba(255,255,255,0.06)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}>📖 Lihat Semua Klasifikasi</button>
        )}
      </div>
    </div>
  );
}

function FilmsGrid({ outlet, onPickFilm, brandPrimary }) {
  const [films, setFilms] = useState(null);
  const [showtimes, setShowtimes] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      fetch(`${API_HOST}/api/cinema/films`).then(r => { if (!r.ok) throw new Error(`films ${r.status}`); return r.json(); }),
      fetch(`${API_HOST}/api/cinema/showtimes?outlet=${encodeURIComponent(outlet.code)}`).then(r => { if (!r.ok) throw new Error(`showtimes ${r.status}`); return r.json(); }),
    ])
      .then(([f, s]) => {
        setFilms(f.films || []);
        setShowtimes(s.showtimes || []);
      })
      .catch(e => setError(e));
  }, [outlet.code]);
  useEffect(() => { load(); }, [load]);

  // Filter to films that have AT LEAST ONE upcoming showtime at this outlet
  const filmsWithShowtimes = useMemo(() => {
    if (!films || !showtimes) return [];
    const filmIdsWithShow = new Set(showtimes.map(s => s.film_id));
    return films.filter(f => filmIdsWithShow.has(f.id));
  }, [films, showtimes]);

  if (error) return <ErrorInline error={error} label="Gagal memuat film & jadwal" onRetry={load} />;
  if (!films) return <LoadingState label="Memuat film…" />;

  return (
    <div style={{ padding: "30px 0" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ ...TY.eyebrow, color: brandPrimary, marginBottom: 8 }}>● Now Showing</div>
        <h1 style={{ ...TY.headline, margin: 0, marginBottom: 8, color: C.text }}>
          Sedang Tayang
        </h1>
        <p style={{ ...TY.bodySm, color: C.sub, margin: 0 }}>
          <span style={{ fontFamily: T.mono, color: C.text, fontWeight: 600 }}>{filmsWithShowtimes.length}</span> film
          {" · "}
          <span style={{ fontFamily: T.mono, color: C.text, fontWeight: 600 }}>{showtimes.length}</span> jadwal di {outlet.name?.replace("Karya Cinema ", "") || outlet.code}
        </p>
      </div>
      {filmsWithShowtimes.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.dim }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <div style={{ ...TY.subtitle, color: C.text, marginBottom: 4 }}>Tidak ada film tayang hari ini</div>
          <div style={{ ...TY.caption, color: C.sub }}>Cek lokasi lain atau besok</div>
        </div>
      ) : (
        <div className="cw-films-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))", gap: 16 }}>
          {filmsWithShowtimes.map(f => {
            const showCount = showtimes.filter(s => s.film_id === f.id).length;
            return (
              <button key={f.id} onClick={() => onPickFilm(f)} style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
                padding: 0, textAlign: "left", color: C.text, cursor: "pointer",
                fontFamily: "inherit", overflow: "hidden", transition: "all 0.15s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${brandPrimary}66`; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "translateY(0)"; }}>
                <div style={{
                  aspectRatio: "2/3", background: f.poster_url ? `url(${f.poster_url}) center/cover` : "#1a1a22",
                  position: "relative", display: "flex", alignItems: "flex-end",
                }}>
                  {!f.poster_url && (
                    <div style={{ width: "100%", textAlign: "center", fontSize: 48, opacity: 0.3 }}>🎬</div>
                  )}
                  {f.age_rating && (
                    <div style={{
                      ...TY.eyebrow,
                      position: "absolute", top: 8, right: 8,
                      background: (RATING_COLOR[f.age_rating] || "#9ca3af") + "ee",
                      color: "#fff", padding: "4px 8px", borderRadius: 6,
                      letterSpacing: "0.08em",
                    }}>{f.age_rating}</div>
                  )}
                </div>
                <div style={{ padding: "14px 14px 16px" }}>
                  <div style={{ ...TY.subtitle, fontSize: 14, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>{f.title}</div>
                  <div style={{ ...TY.caption, color: C.dim }}>{f.genre || "—"} · {f.duration_min || 0} mnt</div>
                  {f.ratings_count > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <Stars value={f.avg_rating || 0} size={11} color={brandPrimary} />
                      <span style={{ ...TY.caption, color: C.dim, fontFamily: T.mono, fontVariantNumeric: "tabular-nums" }}>{Number(f.avg_rating || 0).toFixed(1)} ({f.ratings_count})</span>
                    </div>
                  )}
                  <div style={{ ...TY.eyebrow, marginTop: 10, color: brandPrimary }}>{showCount} jadwal hari ini →</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// STEP 2.5: FILM DETAIL (synopsis + trailer + info lengkap)
// ════════════════════════════════════════════════════════════════════
function ytEmbedUrl(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^?&]+)/);
  return m ? `https://www.youtube.com/embed/${m[1]}?rel=0&modestbranding=1` : null;
}

// Mute-state shared antara CinemaHero & FilmDetail trailer
const MUTE_KEY = "cw_trailer_muted";
function loadMuted() {
  try { return sessionStorage.getItem(MUTE_KEY) !== "0"; } catch { return true; }
}
function saveMuted(m) {
  try { sessionStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch {}
}

// useInView — IntersectionObserver hook utk auto-pause trailer saat scroll
function useInView(ref, threshold = 0.2) {
  const [inView, setInView] = useState(true);  // assume visible, observer corrects
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || !window.IntersectionObserver) return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return inView;
}

function FilmDetail({ outlet, film, onPickShowtime, brandPrimary, session, onSignInClick }) {
  const [showtimeCount, setShowtimeCount] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/showtimes?outlet=${encodeURIComponent(outlet.code)}`)
      .then(r => r.json()).then(d => {
        const count = (d.showtimes || []).filter(s => s.film_id === film.id && s.derived_status !== "closed" && s.derived_status !== "cancelled").length;
        setShowtimeCount(count);
      }).catch(() => setShowtimeCount(0));
  }, [outlet.code, film.id]);

  const trailerEmbed = ytEmbedUrl(film.trailer_url);
  const formats = (film.available_formats || "2D").split(",").map(s => s.trim()).filter(Boolean);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);

  // Trailer autoplay (Netflix-style, sama dgn CinemaHero)
  const [trailerPlaying, setTrailerPlaying] = useState(false);
  const [muted, setMuted] = useState(loadMuted);
  useEffect(() => { saveMuted(muted); }, [muted]);
  const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const heroRef = useRef(null);
  const heroInView = useInView(heroRef, 0.25);
  useEffect(() => {
    setTrailerPlaying(false);
    if (!trailerEmbed || isTouch || !heroInView) return;
    const t = setTimeout(() => setTrailerPlaying(true), 3000);
    return () => clearTimeout(t);
  }, [trailerEmbed, isTouch, film.id, heroInView]);
  const trailerVideoId = trailerEmbed ? trailerEmbed.split("/embed/")[1]?.split("?")[0] : null;

  // My List toggle
  const [inList, setInList] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  useEffect(() => {
    if (!session?.phone) { setInList(false); return; }
    fetch(`${API_HOST}/api/cinema/watchlist?phone=${encodeURIComponent(session.phone)}`)
      .then(r => r.json()).then(d => setInList((d.items || []).some(x => x.film_id === film.id)))
      .catch(() => setInList(false));
  }, [session?.phone, film.id]);
  const toggleList = async () => {
    if (!session?.phone) { onSignInClick?.(); return; }
    setListBusy(true);
    try {
      if (inList) {
        await fetch(`${API_HOST}/api/cinema/watchlist/${film.id}?phone=${encodeURIComponent(session.phone)}`, { method: "DELETE" });
        setInList(false);
      } else {
        await fetch(`${API_HOST}/api/cinema/watchlist`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_phone: session.phone, film_id: film.id }),
        });
        setInList(true);
      }
    } catch {}
    finally { setListBusy(false); }
  };

  return (
    <div style={{ padding: "20px 0 60px" }}>
      {/* Hero with poster backdrop + trailer autoplay overlay */}
      <div ref={heroRef} style={{
        position: "relative", borderRadius: 18, overflow: "hidden",
        marginBottom: 24, minHeight: 360,
        background: film.poster_url ? `linear-gradient(180deg, rgba(10,10,15,0.4) 0%, rgba(10,10,15,0.95) 100%), url(${film.poster_url}) center/cover, #1a1a22` : DEFAULT_CITY_GRADIENT,
      }}>
        {/* Trailer iframe — appear after 3s (desktop only), poster bg fade out */}
        {trailerPlaying && trailerEmbed && trailerVideoId && (
          <>
            <div style={{ position: "absolute", inset: 0, background: "#000", animation: "cwFadeIn 0.8s ease forwards" }}>
              <iframe
                src={`${trailerEmbed}&autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${trailerVideoId}&playsinline=1&modestbranding=1&showinfo=0&rel=0`}
                title={`${film.title} trailer`}
                allow="autoplay; encrypted-media"
                style={{
                  position: "absolute", top: "50%", left: "50%",
                  width: "min(177.77vh, 100%)", height: "min(56.25vw, 100%)",
                  minWidth: "100%", minHeight: "100%",
                  transform: "translate(-50%, -50%) scale(1.05)",
                  border: 0, pointerEvents: "none",
                }}
              />
            </div>
            {/* Gradient overlay supaya teks tetap legible di atas trailer */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, rgba(10,10,15,0.45) 0%, rgba(10,10,15,0.9) 100%)",
              animation: "cwFadeIn 1.2s ease 0.4s both",
            }} />
            {/* Mute toggle */}
            <button onClick={() => setMuted(m => !m)} aria-label={muted ? "Unmute" : "Mute"} style={{
              position: "absolute", top: 16, right: 16, zIndex: 5,
              width: 38, height: 38, borderRadius: "50%",
              background: "rgba(0,0,0,0.6)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.4)",
              fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(8px)", transition: "all 0.2s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.85)"; e.currentTarget.style.transform = "scale(1.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.6)"; e.currentTarget.style.transform = "scale(1)"; }}>
              {muted ? "🔇" : "🔊"}
            </button>
          </>
        )}
        <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 20, padding: "32px 24px 28px", alignItems: "flex-end", minHeight: 360, flexWrap: "wrap" }}>
          {film.poster_url && (
            <img src={film.poster_url} alt={film.title} style={{
              width: 160, aspectRatio: "2/3", objectFit: "cover", borderRadius: 12,
              boxShadow: "0 12px 36px rgba(0,0,0,0.6)", flexShrink: 0,
            }} />
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ ...TY.headline, margin: 0, marginBottom: 10, color: "#fff", textShadow: "0 2px 16px rgba(0,0,0,0.9)" }}>{film.title}</h1>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
              {film.rating && (
                <button onClick={() => setRatingModalOpen(true)} title={`Apa arti ${film.rating}?`} style={{
                  ...TY.eyebrow,
                  padding: "4px 10px", borderRadius: 6,
                  background: (RATING_COLOR[film.rating] || "#9ca3af") + "33",
                  color: RATING_COLOR[film.rating] || "#9ca3af",
                  border: `1px solid ${RATING_COLOR[film.rating] || "#9ca3af"}66`,
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                  letterSpacing: "0.06em", textTransform: "none",
                }}>{film.rating} <span style={{ fontSize: 9, opacity: 0.7 }}>ⓘ</span></button>
              )}
              <span style={{ ...TY.bodySm, color: "rgba(255,255,255,0.85)" }}>{film.duration_min || 0} menit</span>
              <span style={{ ...TY.bodySm, color: "rgba(255,255,255,0.45)" }}>·</span>
              <span style={{ ...TY.bodySm, color: "rgba(255,255,255,0.85)" }}>{film.genre || "—"}</span>
              {film.language && <>
                <span style={{ ...TY.bodySm, color: "rgba(255,255,255,0.45)" }}>·</span>
                <span style={{ ...TY.bodySm, color: "rgba(255,255,255,0.85)" }}>🌐 {film.language}</span>
              </>}
              {film.ratings_count > 0 && <>
                <span style={{ ...TY.bodySm, color: "rgba(255,255,255,0.45)" }}>·</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Stars value={film.avg_rating || 0} size={13} color={brandPrimary} />
                  <span style={{ ...TY.bodySm, color: "rgba(255,255,255,0.85)", fontFamily: T.mono, fontVariantNumeric: "tabular-nums" }}>{Number(film.avg_rating || 0).toFixed(1)} ({film.ratings_count})</span>
                </span>
              </>}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
              {formats.map(f => (
                <span key={f} style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 800,
                  background: (FORMAT_COLOR[f] || "#3b82f6") + "33",
                  color: FORMAT_COLOR[f] || "#3b82f6",
                  border: `1px solid ${FORMAT_COLOR[f] || "#3b82f6"}66`,
                  fontFamily: "'Geist Mono',monospace",
                }}>{f}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {film.status === "coming_soon" ? (
                // Coming Soon — Phase 2: kalau showtimes > 0, allow PRE-ORDER (refundable H-1)
                // Kalau belum ada showtime, tampil disabled countdown
                showtimeCount > 0 ? (
                  <button onClick={onPickShowtime} style={{
                    ...TY.button,
                    fontSize: 15,
                    background: brandPrimary, color: "#fff",
                    border: "none", borderRadius: 12,
                    padding: "14px 28px", cursor: "pointer",
                    boxShadow: `0 8px 24px ${brandPrimary}66`,
                    transition: "transform 0.15s",
                    display: "inline-flex", alignItems: "center", gap: 10,
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
                    onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}>
                    <span style={{ fontSize: 18 }}>🎟️</span>
                    Pre-Order Sekarang
                    {film.release_date && daysUntil(film.release_date) > 0 && (
                      <span style={{ fontSize: 11, opacity: 0.85, marginLeft: 4, padding: "2px 8px", background: "rgba(0,0,0,0.25)", borderRadius: 12 }}>
                        H-{daysUntil(film.release_date)}
                      </span>
                    )}
                  </button>
                ) : (
                  <button disabled style={{
                    background: `${brandPrimary}22`, color: brandPrimary,
                    border: `1.5px solid ${brandPrimary}66`, borderRadius: 12,
                    padding: "14px 28px", fontSize: 15, fontWeight: 800,
                    cursor: "not-allowed", fontFamily: "inherit",
                    display: "inline-flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 18 }}>📅</span>
                    {film.release_date
                      ? (daysUntil(film.release_date) > 0
                          ? `Tayang ${fmtFullDate(film.release_date)} (${daysUntil(film.release_date)} hari lagi)`
                          : `Tayang ${fmtFullDate(film.release_date)}`)
                      : "Coming Soon"}
                  </button>
                )
              ) : (
                <button onClick={onPickShowtime} disabled={showtimeCount === 0} style={{
                  ...TY.button,
                  fontSize: 15,
                  background: showtimeCount === 0 ? "rgba(255,255,255,0.1)" : brandPrimary,
                  color: "#fff", border: "none", borderRadius: 12,
                  padding: "14px 28px", cursor: showtimeCount === 0 ? "not-allowed" : "pointer",
                  boxShadow: showtimeCount === 0 ? "none" : `0 8px 24px ${brandPrimary}66`,
                  transition: "transform 0.15s",
                }}
                  onMouseEnter={(e) => { if (showtimeCount !== 0) e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}>
                  {showtimeCount === null ? "⏳ Cek jadwal…"
                    : showtimeCount === 0 ? "❌ Tidak ada jadwal"
                    : `🎟️ Lihat ${showtimeCount} Jadwal →`}
                </button>
              )}
              <button onClick={toggleList} disabled={listBusy} title={session ? (inList ? "Hapus dari My List" : "Tambah ke My List") : "Sign in dulu utk simpan ke My List"} style={{
                ...TY.button,
                background: inList ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.5)",
                color: "#fff", border: `1.5px solid ${inList ? brandPrimary : "rgba(255,255,255,0.4)"}`,
                borderRadius: 12,
                padding: "14px 22px",
                cursor: listBusy ? "wait" : "pointer",
                backdropFilter: "blur(8px)", transition: "all 0.2s",
                display: "inline-flex", alignItems: "center", gap: 8,
                opacity: listBusy ? 0.6 : 1,
              }}>
                <span style={{ fontSize: 16 }}>{inList ? "✓" : "+"}</span>
                {inList ? "Tersimpan" : "My List"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Synopsis */}
      {film.synopsis && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ ...TY.eyebrow, color: brandPrimary, marginBottom: 12 }}>📖 Sinopsis</div>
          <p style={{ ...TY.body, fontSize: 15, lineHeight: 1.7, color: C.text, margin: 0, whiteSpace: "pre-wrap" }}>{film.synopsis}</p>
        </div>
      )}

      {/* Meta info card */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 11, color: brandPrimary, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 14, textTransform: "uppercase" }}>ℹ️ Info Film</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12 }}>
          <MetaItem label="Durasi" value={`${film.duration_min || 0} menit`} />
          <MetaItem label="Genre" value={film.genre || "—"} />
          <MetaItem label="Rating" value={film.rating || "—"} />
          <MetaItem label="Bahasa" value={film.language || "Indonesia"} />
          {film.subtitle && <MetaItem label="Subtitle" value={film.subtitle} />}
          <MetaItem label="Format" value={formats.join(" · ")} />
          {film.release_date && (
            <MetaItem
              label={film.status === "coming_soon" ? "Tanggal Rilis" : "Tayang Sejak"}
              value={fmtFullDate(film.release_date)}
            />
          )}
        </div>
      </div>

      {/* Reviews from penonton */}
      <ReviewsSection filmId={film.id} brandPrimary={brandPrimary} />

      {/* Modal info rating ketika user klik badge */}
      {ratingModalOpen && (
        <RatingInfoModal
          ratingCode={film.rating}
          onClose={() => setRatingModalOpen(false)}
          onSeeAll={() => { setRatingModalOpen(false); window.location.href = "/?movies=1#rating-guide"; }}
        />
      )}
    </div>
  );
}

// Reviews list + distribusi bintang, fetch per-film
function ReviewsSection({ filmId, brandPrimary }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    setData(null); setError(null);
    fetch(`${API_HOST}/api/cinema/films/${filmId}/ratings`)
      .then(r => { if (!r.ok) throw new Error(`ratings ${r.status}`); return r.json(); })
      .then(setData).catch(setError);
  }, [filmId]);

  if (error) return null;
  if (!data) return (
    <div style={{ marginTop: 20 }}>
      <Skeleton h={16} w={200} style={{ marginBottom: 12 }} />
      <Skeleton h={80} style={{ borderRadius: 14 }} />
    </div>
  );
  if (!data.total) return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginTop: 20 }}>
      <div style={{ fontSize: 11, color: brandPrimary, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 8, textTransform: "uppercase" }}>⭐ Ulasan Penonton</div>
      <div style={{ fontSize: 13, color: C.dim }}>Belum ada review. Jadi yang pertama setelah nonton!</div>
    </div>
  );

  const max = Math.max(1, ...Object.values(data.distribution || {}));
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginTop: 20 }}>
      <div style={{ fontSize: 11, color: brandPrimary, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 14, textTransform: "uppercase" }}>⭐ Ulasan Penonton ({data.total})</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, marginBottom: 18, alignItems: "center" }}>
        <div style={{ textAlign: "center", padding: "0 14px", borderRight: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 42, fontWeight: 900, color: "#fff", lineHeight: 1, fontFamily: "'Geist Mono',monospace" }}>{Number(data.avg || 0).toFixed(1)}</div>
          <div style={{ marginTop: 6 }}><Stars value={data.avg || 0} size={14} color={brandPrimary} /></div>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{data.total} review</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[5, 4, 3, 2, 1].map(n => {
            const count = data.distribution?.[n] || 0;
            const pct = (count / max) * 100;
            return (
              <div key={n} style={{ display: "grid", gridTemplateColumns: "20px 1fr 32px", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{n}★</span>
                <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: brandPrimary, borderRadius: 4, transition: "width 0.3s" }} />
                </div>
                <span style={{ fontSize: 10, color: C.dim, fontFamily: "'Geist Mono',monospace", textAlign: "right" }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto" }}>
        {data.ratings.slice(0, 12).map(r => (
          <div key={r.id} style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Stars value={r.rating} size={12} color={brandPrimary} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{r.customer_name || "Penonton"}</span>
              </div>
              <span style={{ fontSize: 10, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>
                {r.created_at ? new Date(r.created_at * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : ""}
              </span>
            </div>
            {r.comment && <div style={{ fontSize: 12, color: C.text, lineHeight: 1.55 }}>{r.comment}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// STEP 3: SHOWTIMES LIST (grouped by date)
// ════════════════════════════════════════════════════════════════════
const FORMAT_COLOR = { "2D": "#3b82f6", "3D": "#a855f7", IMAX: "#fbbf24", "4DX": "#ec4899" };

// Curated Unsplash cinema-interior photos (free use, no API key).
// Theme: actual movie theater shots (seats, screens, projection) — NOT city skylines.
// Stable URLs verified — each outlet maps ke 1 cinematic photo per city karakter.
// Fallback: gradient + 🎬 (no random picsum — too unprofessional).
const CITY_IMAGES = {
  "jakarta":    { url: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1200&q=80&auto=format&fit=crop", emoji: "🏙️" },  // red velvet seats — metropolitan classic
  "bandung":    { url: "https://images.unsplash.com/photo-1574267432553-4b4628081c31?w=1200&q=80&auto=format&fit=crop", emoji: "🌋" },  // cinema marquee neon — creative city vibe
  "bali":       { url: "https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?w=1200&q=80&auto=format&fit=crop", emoji: "🏝️" },  // premium reclining — resort luxury feel
  "medan":      { url: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1200&q=80&auto=format&fit=crop", emoji: "🌴" },  // duplicate Surabaya — verified cinema interior (replaced blur 1604079628040)
  "surabaya":   { url: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1200&q=80&auto=format&fit=crop", emoji: "🌉" },  // modern cinema interior lights
  "yogyakarta": { url: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1200&q=80&auto=format&fit=crop", emoji: "🏛️" },  // classic seats — heritage city
  "semarang":   { url: "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&q=80&auto=format&fit=crop", emoji: "⛩️" },  // film projection beams
  "makassar":   { url: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1200&q=80&auto=format&fit=crop", emoji: "⛵" },
  "denpasar":   { url: "https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?w=1200&q=80&auto=format&fit=crop", emoji: "🏝️" },
};

// Generic cinema fallback pool — stable hash-based pick (consistent per outlet code).
const GENERIC_CINEMA_PHOTOS = [
  "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?w=1200&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1574267432553-4b4628081c31?w=1200&q=80&auto=format&fit=crop",
];

// Premium cinema-themed dark gradient (no more bright purple/red). Used when no image.
const DEFAULT_CITY_GRADIENT = "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #2a1810 100%)";

function getCityVisual(outlet) {
  // 1. Admin-uploaded photo (future DB field) → highest priority
  if (outlet.image_url || outlet.cover_url) {
    return { url: outlet.image_url || outlet.cover_url, fallback: null, emoji: "🎬" };
  }
  // 2. City-specific: try LOCAL file first (kapten upload ke public/img/cities/{slug}.jpg),
  //    fallback ke Unsplash stock photo via onError handler di <img>.
  const key = (outlet.area || outlet.name || "").toLowerCase();
  for (const city of Object.keys(CITY_IMAGES)) {
    if (key.includes(city)) {
      return {
        url: `/img/cities/${city}.jpg`,           // local file (kalau ada)
        fallback: CITY_IMAGES[city].url,           // Unsplash stock backup
        emoji: CITY_IMAGES[city].emoji,
      };
    }
  }
  // 3. Generic cinema photo (stable per outlet — hash code → index)
  const seed = outlet.code || outlet.name || "x";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % GENERIC_CINEMA_PHOTOS.length;
  return { url: GENERIC_CINEMA_PHOTOS[idx], fallback: null, emoji: "🎬" };
}

function fmtDate(yyyymmdd) {
  if (!yyyymmdd) return "";
  const d = new Date(yyyymmdd + "T00:00:00");
  return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
}

// Format full date dgn tahun. Pakai utk release_date display ("12 Juni 2026").
function fmtFullDate(yyyymmdd) {
  if (!yyyymmdd) return "";
  const d = new Date(yyyymmdd + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

// Days until target date (negative if past). Pakai utk countdown coming soon.
function daysUntil(yyyymmdd) {
  if (!yyyymmdd) return 0;
  const target = new Date(yyyymmdd + "T00:00:00").getTime();
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((target - today.getTime()) / 86400000);
}

function ShowtimesList({ outlet, film, onPickShowtime, brandPrimary }) {
  const [showtimes, setShowtimes] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`${API_HOST}/api/cinema/showtimes?outlet=${encodeURIComponent(outlet.code)}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        const filmShowtimes = (d.showtimes || [])
          .filter(s => s.film_id === film.id)
          .filter(s => s.derived_status !== "closed" && s.derived_status !== "cancelled")
          .sort((a, b) => (a.show_date + a.start_time).localeCompare(b.show_date + b.start_time));
        setShowtimes(filmShowtimes);
      })
      .catch(e => setError(e));
  }, [outlet.code, film.id]);
  useEffect(() => { load(); }, [load]);

  const byDate = useMemo(() => {
    if (!showtimes) return {};
    return showtimes.reduce((acc, s) => {
      (acc[s.show_date] = acc[s.show_date] || []).push(s);
      return acc;
    }, {});
  }, [showtimes]);

  if (error) return <ErrorInline error={error} label="Gagal memuat jadwal" onRetry={load} />;
  if (!showtimes) return <LoadingState label="Memuat jadwal…" />;

  return (
    <div style={{ padding: "30px 0" }}>
      {/* Film hero */}
      <div style={{ display: "flex", gap: 18, marginBottom: 30, padding: 20, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
        {film.poster_url && (
          <img src={film.poster_url} alt="" style={{ width: 90, aspectRatio: "2/3", objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ ...TY.title, margin: 0, marginBottom: 6, color: C.text }}>{film.title}</h1>
          <div style={{ ...TY.caption, color: C.sub, marginBottom: 10 }}>{film.genre || "—"} · {film.duration_min || 0} mnt</div>
          {film.age_rating && (
            <span style={{ ...TY.eyebrow, display: "inline-block", padding: "4px 9px", borderRadius: 6, background: (RATING_COLOR[film.age_rating] || "#9ca3af") + "33", color: RATING_COLOR[film.age_rating] || "#9ca3af", letterSpacing: "0.08em" }}>{film.age_rating}</span>
          )}
        </div>
      </div>

      <div style={{ ...TY.eyebrow, color: brandPrimary, marginBottom: 8 }}>📅 Step 3 of 5</div>
      <h2 style={{ ...TY.headline, fontSize: 28, marginBottom: 8, color: C.text }}>Pilih Jadwal</h2>
      <p style={{ ...TY.bodySm, color: C.dim, margin: "0 0 22px" }}>
        <span style={{ fontFamily: T.mono, color: C.text, fontWeight: 600 }}>{showtimes.length}</span> jadwal tersedia · klik untuk pilih kursi
      </p>

      {showtimes.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.dim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
          <div style={{ ...TY.subtitle, color: C.text, marginBottom: 4 }}>Tidak ada jadwal tersedia</div>
          <div style={{ ...TY.caption, color: C.sub }}>Coba pilih film lain atau cek lokasi berbeda</div>
        </div>
      ) : (
        Object.entries(byDate).map(([date, list]) => (
          <div key={date} style={{ marginBottom: 24, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ ...TY.subtitle, color: C.text }}>{fmtDate(date)}</div>
              <div style={{ ...TY.eyebrow, color: C.dim }}>{list.length} jadwal</div>
            </div>
            <div className="cw-showtimes-grid" style={{ display: "grid", gridTemplateColumns: list.length === 1 ? "1fr" : "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
              {list.map(s => {
                const remaining = (s.capacity || 0) - (s.sold_count || 0);
                const criticalSeats = remaining > 0 && remaining <= 5;      // 🔴 pulse animation
                const lowSeats = remaining > 5 && remaining <= 15;          // 🟠 amber warning
                const fillingFast = remaining > 15 && s.capacity > 0 && (s.sold_count || 0) / s.capacity >= 0.65;  // 🟡 momentum hint
                const soldOut = remaining <= 0 || s.derived_status === "sold_out";
                const pctSold = s.capacity > 0 ? Math.round((s.sold_count || 0) / s.capacity * 100) : 0;
                return (
                  <button key={s.id} onClick={() => !soldOut && onPickShowtime(s)} disabled={soldOut} style={{
                    background: soldOut ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${soldOut ? "rgba(239,68,68,0.25)" : criticalSeats ? `${C.crimson}55` : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 10, padding: "10px 11px", textAlign: "left",
                    color: soldOut ? C.dim : C.text, cursor: soldOut ? "not-allowed" : "pointer",
                    fontFamily: "inherit", transition: "all 0.2s cubic-bezier(.2,.8,.2,1)",
                    position: "relative", overflow: "hidden",
                    animation: criticalSeats ? "cwPulse 2s ease infinite" : undefined,
                  }}
                    onMouseEnter={(e) => { if (!soldOut) { e.currentTarget.style.borderColor = brandPrimary; e.currentTarget.style.background = `${brandPrimary}1a`; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 22px ${brandPrimary}44`; } }}
                    onMouseLeave={(e) => { if (!soldOut) { e.currentTarget.style.borderColor = criticalSeats ? `${C.crimson}55` : "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; } }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ ...TY.number, fontSize: 18, fontWeight: 800, letterSpacing: -0.4 }}>{s.start_time}</span>
                      <span style={{ ...TY.eyebrow, color: FORMAT_COLOR[s.format] || C.dim, background: (FORMAT_COLOR[s.format] || "#9ca3af") + "22", padding: "2px 6px", borderRadius: 3, fontSize: 9 }}>{s.format || "2D"}</span>
                    </div>
                    <div style={{ ...TY.caption, color: C.sub, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.studio_name}</div>
                    <div style={{ ...TY.eyebrow, color: brandPrimary, fontSize: 12, letterSpacing: "0.06em", textTransform: "none" }}>{rp(s.price)}</div>
                    {soldOut ? (
                      <div style={{ marginTop: 6, fontSize: 9, color: C.crimson, fontWeight: 900, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace" }}>● SOLD OUT</div>
                    ) : criticalSeats ? (
                      <div style={{ marginTop: 6, fontSize: 9.5, color: C.crimson, fontWeight: 900, letterSpacing: 0.6, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>
                        🔥 Last {remaining} {remaining === 1 ? "seat" : "seats"}!
                      </div>
                    ) : lowSeats ? (
                      <div style={{ marginTop: 6, fontSize: 9.5, color: C.gold, fontWeight: 800, letterSpacing: 0.4, fontFamily: "'Geist Mono',monospace" }}>
                        ⚠ {remaining} seats left
                      </div>
                    ) : fillingFast ? (
                      <div style={{ marginTop: 6, fontSize: 9.5, color: C.ember, fontWeight: 800, letterSpacing: 0.4, fontFamily: "'Geist Mono',monospace" }}>
                        ⚡ Filling fast · {remaining} left
                      </div>
                    ) : (
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pctSold}%`, background: pctSold > 70 ? C.gold : C.green, transition: "width 0.3s" }} />
                        </div>
                        <span style={{ fontSize: 9, color: C.dim, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{remaining}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// STEP 4: SEAT PICKER
// ════════════════════════════════════════════════════════════════════
function SeatPicker({ showtime, film, initialSeats, onConfirm, brandPrimary }) {
  const [seatData, setSeatData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set(initialSeats || []));
  const [justTapped, setJustTapped] = useState(null);  // seat label utk bounce animation

  const load = useCallback(() => {
    setError(null);
    fetch(`${API_HOST}/api/cinema/showtimes/${showtime.id}/seats`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setSeatData)
      .catch(e => setError(e));
  }, [showtime.id]);
  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv); }, [load]);

  const toggle = (seat) => {
    if (!seatData) return;
    if (seatData.sold.includes(seat)) return;
    if (seatData.held_by_others?.includes(seat)) return;
    const next = new Set(selected);
    if (next.has(seat)) next.delete(seat);
    else next.add(seat);
    setSelected(next);
    // Trigger tap animation + light haptic on mobile
    setJustTapped(seat); setTimeout(() => setJustTapped(null), 280);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(10); } catch {}
    }
  };

  if (error) return <ErrorInline error={error} label="Gagal memuat peta kursi" onRetry={load} />;
  if (!seatData) return <LoadingState label="Memuat peta kursi…" />;

  const rows = seatData.rows || 0;
  const cols = seatData.cols || 0;
  const total = selected.size * (showtime.price || 0);
  const totalSold = (seatData.sold || []).length;
  const totalCapacity = rows * cols;
  const seatsLeft = Math.max(0, totalCapacity - totalSold - (seatData.held_by_others?.length || 0));

  // Generate seat IDs (row letter + col number)
  const rowLetters = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i));
  // Aisle position — middle column (cinema convention: aisle setelah ~40% kolom)
  const aisleAfterCol = Math.floor(cols / 2);

  return (
    <div style={{ padding: "30px 0 140px" }}>
      {/* CINEMA SCREEN HEADER — film title + showtime context */}
      <div style={{ marginBottom: S[5], textAlign: "center" }}>
        <div style={{
          fontSize: T.xs, color: C.gold, fontFamily: T.mono, fontWeight: T.semibold,
          letterSpacing: T.tracking_wider, textTransform: "uppercase", marginBottom: S[2],
        }}>🎬 Now Seating</div>
        <h2 style={{
          fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 900,
          letterSpacing: -0.8, lineHeight: 1.1, margin: 0, marginBottom: S[2], color: C.text,
        }}>{film?.title || showtime.film_title || "Pilih Kursi"}</h2>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: S[3], fontSize: T.sm, color: C.sub,
          fontFamily: T.mono, letterSpacing: 0.4,
        }}>
          <span>{showtime.studio_name}</span>
          <span style={{ color: C.dim }}>·</span>
          <span style={{ color: C.gold, fontWeight: T.semibold }}>{showtime.start_time}</span>
          <span style={{ color: C.dim }}>·</span>
          <span style={{ color: FORMAT_COLOR[showtime.format] || C.text, fontWeight: T.semibold }}>{showtime.format || "2D"}</span>
        </div>
        {/* Realtime seats left counter */}
        <div style={{ marginTop: S[3], fontSize: T.xs, color: seatsLeft <= 10 ? C.crimson : seatsLeft <= 30 ? C.gold : C.dim, fontFamily: T.mono, fontWeight: T.semibold, letterSpacing: 0.6 }}>
          {seatsLeft <= 10 ? "🔥 " : seatsLeft <= 30 ? "⚡ " : ""}
          {seatsLeft} of {totalCapacity} seats available
        </div>
      </div>

      {/* CINEMA SCREEN VISUAL — curved arc + glow downward */}
      <div style={{ textAlign: "center", marginBottom: S[10], position: "relative" }}>
        <div style={{
          height: 10, maxWidth: 560, margin: "0 auto",
          background: `linear-gradient(90deg, transparent, ${C.gold}cc 20%, ${C.text} 50%, ${C.gold}cc 80%, transparent)`,
          borderRadius: "50%",
          boxShadow: `0 0 24px ${C.gold}55, 0 0 60px ${C.gold}22`,
          transform: "perspective(400px) rotateX(35deg)",
          transformOrigin: "center bottom",
        }} />
        {/* Light cone downward */}
        <div style={{
          position: "absolute", left: "50%", top: 10, transform: "translateX(-50%)",
          width: "80%", maxWidth: 600, height: 60,
          background: `linear-gradient(180deg, ${C.gold}1a 0%, transparent 100%)`,
          clipPath: "polygon(15% 0, 85% 0, 100% 100%, 0 100%)",
          pointerEvents: "none",
        }} />
        <div style={{
          ...TY.eyebrow, color: C.meta, marginTop: S[8], letterSpacing: "0.5em",
        }}>S C R E E N</div>
      </div>

      {/* Seat grid */}
      <div style={{ overflowX: "auto", paddingBottom: S[3] }}>
        <div style={{ display: "inline-block", margin: "0 auto", minWidth: "100%" }}>
          {rowLetters.map(row => (
            <div key={row} className="cw-seat-row" style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, justifyContent: "center" }}>
              {/* Row label kiri */}
              <div style={{ width: 22, fontSize: 11, color: C.meta, fontFamily: T.mono, fontWeight: T.semibold, textAlign: "right", letterSpacing: 0.5 }}>{row}</div>
              {Array.from({ length: cols }, (_, i) => i + 1).map(col => {
                const seat = `${row}${col}`;
                const isSold = seatData.sold.includes(seat);
                const isHeldOther = seatData.held_by_others?.includes(seat);
                const isMine = selected.has(seat);
                const isJustTapped = justTapped === seat;
                // Aisle gap after middle col
                const showAisleGap = col === aisleAfterCol;
                return (
                  <Fragment key={seat}>
                    <button onClick={() => toggle(seat)}
                      disabled={isSold || isHeldOther}
                      title={isSold ? `${seat} · Terjual` : isHeldOther ? `${seat} · Ditahan user lain` : `${seat} · ${rp(showtime.price || 0)}`}
                      className={`cw-seat${isJustTapped ? " cw-seat-tapped" : ""}`}
                      style={{
                        width: 30, height: 28, borderRadius: 8,
                        // Cinema seat shape: top rounded (backrest), bottom flatter
                        background: isSold ? "rgba(220,38,38,0.18)"
                                  : isHeldOther ? "rgba(156,163,175,0.18)"
                                  : isMine ? `linear-gradient(180deg, ${C.gold}, ${C.ember})`
                                  : "rgba(255,255,255,0.05)",
                        border: `1.5px solid ${isMine ? C.gold : isSold ? "rgba(220,38,38,0.5)" : isHeldOther ? "rgba(156,163,175,0.4)" : "rgba(255,255,255,0.12)"}`,
                        color: isMine ? C.midnight : isSold || isHeldOther ? C.dim : C.sub,
                        fontSize: 9, fontWeight: T.bold, fontFamily: T.mono,
                        cursor: isSold || isHeldOther ? "not-allowed" : "pointer", padding: 0,
                        flexShrink: 0,
                        transition: "all 0.18s cubic-bezier(.2,.8,.2,1)",
                        boxShadow: isMine ? `0 4px 12px ${C.gold}55, inset 0 1px 0 rgba(255,255,255,0.4)`
                                          : isSold ? "none"
                                          : "inset 0 1px 0 rgba(255,255,255,0.06)",
                        position: "relative",
                      }}>{col}</button>
                    {showAisleGap && <div style={{ width: 16, flexShrink: 0 }} aria-hidden="true" />}
                  </Fragment>
                );
              })}
              {/* Row label kanan (mirror) */}
              <div style={{ width: 22, fontSize: 11, color: C.meta, fontFamily: T.mono, fontWeight: T.semibold, textAlign: "left", letterSpacing: 0.5 }}>{row}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend — premium with seat icon */}
      <div style={{ display: "flex", justifyContent: "center", gap: S[6], marginTop: S[6], flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ width: 18, height: 16, borderRadius: 5, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.12)" }} />
          <span style={{ ...TY.caption, color: C.sub, textTransform: "uppercase", letterSpacing: "0.1em" }}>Tersedia</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ width: 18, height: 16, borderRadius: 5, background: `linear-gradient(180deg, ${C.gold}, ${C.ember})`, boxShadow: `0 2px 8px ${C.gold}55` }} />
          <span style={{ ...TY.caption, color: C.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Pilihan Saya</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ width: 18, height: 16, borderRadius: 5, background: "rgba(220,38,38,0.18)", border: "1.5px solid rgba(220,38,38,0.5)" }} />
          <span style={{ ...TY.caption, color: C.sub, textTransform: "uppercase", letterSpacing: "0.1em" }}>Terjual</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ width: 18, height: 16, borderRadius: 5, background: "rgba(156,163,175,0.18)", border: "1.5px solid rgba(156,163,175,0.4)" }} />
          <span style={{ ...TY.caption, color: C.sub, textTransform: "uppercase", letterSpacing: "0.1em" }}>Sedang Dipilih</span>
        </div>
      </div>

      {/* Bottom action bar (sticky) — premium glass effect dgn gold CTA */}
      {selected.size > 0 && (
        <div className="cw-seat-actionbar" style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: "rgba(10,10,15,0.92)", backdropFilter: "blur(24px)",
          borderTop: `1px solid ${C.gold}33`, padding: `${S[4]}px ${S[5]}px`,
          boxShadow: `0 -8px 32px rgba(0,0,0,0.6), 0 -1px 0 ${C.gold}1a`,
        }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: S[4] }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...TY.eyebrow, color: C.gold }}>
                {selected.size} Kursi · {Array.from(selected).sort().join(", ")}
              </div>
              <div style={{ ...TY.number, fontSize: 26, fontWeight: 900, color: C.text, marginTop: 4 }}>{rp(total)}</div>
            </div>
            <button onClick={() => onConfirm(Array.from(selected))} style={{
              background: `linear-gradient(135deg, ${C.gold}, ${C.ember})`,
              border: "none", color: C.midnight,
              padding: `${S[4]}px ${S[6]}px`, borderRadius: 10,
              fontSize: 15, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
              letterSpacing: 0.3,
              boxShadow: `0 8px 24px ${C.gold}66, inset 0 1px 0 rgba(255,255,255,0.3)`,
              transition: "all 0.18s cubic-bezier(.2,.8,.2,1)",
              display: "inline-flex", alignItems: "center", gap: S[2],
            }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 12px 32px ${C.gold}99, inset 0 1px 0 rgba(255,255,255,0.4)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 8px 24px ${C.gold}66, inset 0 1px 0 rgba(255,255,255,0.3)`; }}>
              <span>Lanjut</span>
              <span style={{ fontSize: 18 }}>→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// STEP 4.5: F&B BUNDLES (optional add-on)
// ════════════════════════════════════════════════════════════════════
function BundlesStep({ outlet, cart, onChange, onContinue, brandPrimary }) {
  const [bundles, setBundles] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`${API_HOST}/api/cinema/bundles?outlet=${encodeURIComponent(outlet.code)}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setBundles((d.bundles || []).filter(b => b.is_active !== 0)))
      .catch(e => setError(e));
  }, [outlet.code]);
  useEffect(() => { load(); }, [load]);

  // Auto-skip if outlet has no bundles
  useEffect(() => {
    if (bundles && bundles.length === 0) onContinue();
  }, [bundles, onContinue]);

  const setQty = (bid, qty) => {
    const next = { ...cart };
    if (qty <= 0) delete next[bid];
    else next[bid] = qty;
    onChange(next);
  };

  const totalQty = Object.values(cart).reduce((s, q) => s + q, 0);
  const totalPrice = bundles ? Object.entries(cart).reduce((s, [bid, q]) => {
    const b = bundles.find(x => String(x.id) === String(bid));
    return s + (b ? b.price * q : 0);
  }, 0) : 0;

  if (error) return <ErrorInline error={error} label="Gagal memuat menu F&B" onRetry={load} />;
  if (!bundles) return <LoadingState label="Memuat menu snack & minuman…" />;
  if (bundles.length === 0) return <LoadingState label="Melanjutkan…" />;

  return (
    <div style={{ padding: "30px 0 120px" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ ...TY.eyebrow, color: brandPrimary, marginBottom: 8 }}>🍿 Step 4 · F&B Combo</div>
        <h2 style={{ ...TY.headline, fontSize: 28, margin: 0, marginBottom: 8, color: C.text }}>
          Tambah Snack & Minuman?
        </h2>
        <p style={{ ...TY.bodySm, color: C.sub, margin: 0 }}>
          Pesan sekalian di sini, ambil di counter saat scan tiket. Bisa di-skip kalau gak perlu.
        </p>
      </div>

      <div className="cw-bundles-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 14 }}>
        {bundles.map(b => {
          const qty = cart[b.id] || 0;
          return (
            <div key={b.id} style={{
              background: C.card, border: `1px solid ${qty > 0 ? brandPrimary + "66" : C.border}`,
              borderRadius: 14, overflow: "hidden",
              transition: "border-color 0.15s",
            }}>
              <div style={{
                aspectRatio: "16/10", background: b.image_url ? `url(${b.image_url}) center/cover` : "rgba(255,255,255,0.04)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, color: C.dim,
              }}>{!b.image_url && "🍿"}</div>
              <div style={{ padding: "14px 16px 16px" }}>
                <div style={{ ...TY.subtitle, fontSize: 14, marginBottom: 4, color: C.text }}>{b.name}</div>
                {b.description && <div style={{ ...TY.caption, color: C.sub, lineHeight: 1.45, marginBottom: 12, minHeight: 28 }}>{b.description}</div>}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ ...TY.eyebrow, color: brandPrimary, fontSize: 13, letterSpacing: "0.06em", textTransform: "none" }}>{rp(b.price)}</div>
                  {qty === 0 ? (
                    <button onClick={() => setQty(b.id, 1)} style={{
                      ...TY.button,
                      background: `${brandPrimary}22`, border: `1px solid ${brandPrimary}55`, color: brandPrimary,
                      borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer",
                    }}>+ Tambah</button>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: brandPrimary, borderRadius: 8, padding: "2px 4px" }}>
                      <button onClick={() => setQty(b.id, qty - 1)} style={{
                        width: 28, height: 28, background: "transparent", border: "none", color: "#fff",
                        fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                      }}>−</button>
                      <span style={{ ...TY.number, fontSize: 14, minWidth: 16, textAlign: "center", color: "#fff" }}>{qty}</span>
                      <button onClick={() => setQty(b.id, qty + 1)} style={{
                        width: 28, height: 28, background: "transparent", border: "none", color: "#fff",
                        fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                      }}>+</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky bottom action */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(10,10,15,0.95)", backdropFilter: "blur(20px)",
        borderTop: `1px solid ${C.border}`, padding: "14px 20px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {totalQty > 0 ? (
              <>
                <div style={{ ...TY.eyebrow, color: C.dim }}>
                  {totalQty} Item Snack
                </div>
                <div style={{ ...TY.number, fontSize: 22, color: brandPrimary, marginTop: 2 }}>+ {rp(totalPrice)}</div>
              </>
            ) : (
              <div style={{ ...TY.bodySm, color: C.sub }}>Tanpa snack juga OK — bisa beli di counter</div>
            )}
          </div>
          <button onClick={onContinue} style={{
            ...TY.button,
            background: brandPrimary, border: "none", color: "#fff",
            padding: "14px 24px", borderRadius: 10, fontSize: 14, cursor: "pointer",
            boxShadow: `0 8px 20px ${brandPrimary}55`,
          }}>{totalQty > 0 ? "Lanjut →" : "Skip →"}</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// STEP 5: CHECKOUT (customer info + booking submit)
// ════════════════════════════════════════════════════════════════════
function Checkout({ outlet, film, showtime, seats, bundlesCart, onBooked, onEdit, brandPrimary }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [bundlesMeta, setBundlesMeta] = useState(null);
  // Loyalty lookup state
  const [loyaltyData, setLoyaltyData] = useState(null);  // { found, customer, config } | null
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [lookupBusy, setLookupBusy] = useState(false);
  // Promo code state
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(null);  // { promo, discount } | null
  const [promoError, setPromoError] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);

  // Load bundle metadata for display (need names + prices in summary)
  useEffect(() => {
    if (!bundlesCart || Object.keys(bundlesCart).length === 0) return;
    fetch(`${API_HOST}/api/cinema/bundles?outlet=${encodeURIComponent(outlet.code)}`)
      .then(r => r.json()).then(d => setBundlesMeta(d.bundles || [])).catch(() => {});
  }, [outlet.code, bundlesCart]);

  // Auto-lookup loyalty when phone is valid (debounced 600ms)
  useEffect(() => {
    const phone = form.phone.replace(/[^\d]/g, "");
    if (phone.length < 8) { setLoyaltyData(null); setPointsToRedeem(0); return; }
    setLookupBusy(true);
    const t = setTimeout(() => {
      fetch(`${API_HOST}/api/cinema/loyalty-points?phone=${encodeURIComponent(phone)}`)
        .then(r => r.json()).then(d => setLoyaltyData(d.ok ? d : null))
        .catch(() => setLoyaltyData(null))
        .finally(() => setLookupBusy(false));
    }, 600);
    return () => clearTimeout(t);
  }, [form.phone]);

  const seatTotal = seats.length * (showtime.price || 0);
  const bundleTotal = bundlesMeta ? Object.entries(bundlesCart || {}).reduce((s, [bid, q]) => {
    const b = bundlesMeta.find(x => String(x.id) === String(bid));
    return s + (b ? b.price * q : 0);
  }, 0) : 0;
  const grossTotal = seatTotal + bundleTotal;
  const promoDiscount = promoApplied?.discount || 0;
  const afterPromo = Math.max(0, grossTotal - promoDiscount);
  // Compute points discount (1 poin = config.point_value_idr IDR)
  const pointValueIDR = loyaltyData?.config?.point_value_idr || 10;
  const maxRedeem = loyaltyData?.found ? Math.min(
    loyaltyData.customer.points,
    Math.floor(afterPromo / pointValueIDR),
  ) : 0;
  const safePointsToRedeem = Math.min(pointsToRedeem, maxRedeem);
  const pointsDiscount = safePointsToRedeem * pointValueIDR;
  const total = Math.max(0, afterPromo - pointsDiscount);

  const applyPromo = async () => {
    const code = promoCode.trim();
    if (!code) return;
    setPromoBusy(true); setPromoError(""); setPromoApplied(null);
    try {
      const r = await fetch(`${API_HOST}/api/cinema/promotions/apply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal: grossTotal, film_id: film.id }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setPromoError(d.error || "Promo gagal"); }
      else { setPromoApplied({ promo: d.promo, discount: d.discount }); }
    } catch (e) {
      setPromoError(e.message);
    } finally { setPromoBusy(false); }
  };
  const removePromo = () => { setPromoApplied(null); setPromoError(""); setPromoCode(""); };
  const valid = form.name.trim() && form.phone.trim().match(/^[0-9+\-\s]{8,}$/);

  // Simple kiosk-style flow: create ticket as paid immediately, no Snap popup.
  // Toggle via ?snap=1 URL param if want online payment flow (Phase 2 — see
  // git history fa6d6eb for Snap implementation; backend endpoint preserved at
  // /api/payment/cinema-snap, frontend integration commented for easy revival).
  const useSnap = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("snap");

  const submit = async () => {
    if (!valid || submitting) return;

    // ANTI cross-outlet contamination: pre-flight check
    if (showtime.outlet && showtime.outlet !== outlet.code) {
      setError(new Error(`Outlet mismatch: showtime di ${showtime.outlet}, Anda pilih ${outlet.code}. Refresh & ulangi.`));
      return;
    }

    setSubmitting(true); setError(null);

    try {
      const bundlesArr = Object.entries(bundlesCart || {}).map(([bid, qty]) => ({ bundle_id: Number(bid), qty }));
      const bookBody = {
        showtime_id: showtime.id,
        outlet_code: outlet.code,
        seats,
        bundles: bundlesArr,
        buyer: form.name.trim(),
        buyer_phone: form.phone.replace(/[^\d]/g, ""),
        buyer_email: form.email.trim() || undefined,
        payment_method: "counter", // pay-at-counter, like kiosk default
        points_redeem: safePointsToRedeem > 0 ? safePointsToRedeem : undefined,
        discount_code: promoApplied ? promoApplied.promo.code : undefined,
        discount_type: promoApplied ? "promo" : undefined,
      };
      const bookRes = await fetch(`${API_HOST}/api/cinema/tickets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookBody),
      });
      const bookData = await bookRes.json();
      if (!bookRes.ok || !bookData.ok) {
        throw new Error(bookData.error || `Booking gagal (HTTP ${bookRes.status})`);
      }
      if (bookData.outlet && bookData.outlet !== outlet.code) {
        throw new Error(`⚠ Ticket dibuat di outlet ${bookData.outlet} bukan ${outlet.code}. Hubungi staff.`);
      }
      onBooked({ ...bookData, _client_outlet: outlet, _payment_status: "counter" });
    } catch (e) {
      setError(e); setSubmitting(false);
    }
  };

  const submitLabel = submitting ? "Memproses…" : "Booking Sekarang";

  return (
    <div className="cw-checkout" style={{ padding: "30px 0", display: "grid", gridTemplateColumns: "1fr 360px", gap: 24 }}>
      {/* Left: Customer form */}
      <div>
        {/* Pre-sale notice — film masih coming_soon, refundable H-1 */}
        {film?.status === "coming_soon" && (
          <div style={{
            marginBottom: 18, padding: "14px 16px", borderRadius: 12,
            background: `linear-gradient(135deg, ${brandPrimary}1a, ${brandPrimary}08)`,
            border: `1px solid ${brandPrimary}55`,
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>🎬</span>
            <div>
              <div style={{ ...TY.eyebrow, color: brandPrimary, marginBottom: 6 }}>
                Pre-Sale Ticket
              </div>
              <div style={{ ...TY.bodySm, color: C.text, lineHeight: 1.6 }}>
                Film ini <b>Coming Soon</b>{film.release_date ? <> · tayang <b>{fmtFullDate(film.release_date)}</b></> : ""}. Tiket bisa di-refund <b>100%</b> sampai H-1 tanggal showtime. Setelah itu, kebijakan refund reguler berlaku.
              </div>
            </div>
          </div>
        )}
        <div style={{ ...TY.eyebrow, color: brandPrimary, marginBottom: 8 }}>👤 Step 5 · Checkout</div>
        <h2 style={{ ...TY.headline, fontSize: 28, margin: 0, marginBottom: 18, color: C.text }}>Data Pemesan</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Nama Lengkap *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Nama sesuai identitas" />
          <Field label="No. WhatsApp *" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="08xxxxxxxxxx" type="tel" />
          <Field label="Email (opsional)" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="email@domain.com" type="email" />
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
            ⚡ E-tiket akan dikirim via WhatsApp + Email setelah pembayaran.
          </div>

          {/* Promo code input */}
          <div style={{ marginTop: 14, padding: 14, borderRadius: 12,
            background: promoApplied ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${promoApplied ? "rgba(16,185,129,0.4)" : C.border}`,
          }}>
            <div style={{ fontSize: 11, color: promoApplied ? "#10b981" : C.dim, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 8 }}>🎟 KODE PROMO {promoApplied ? "✓ DITERAPKAN" : "(opsional)"}</div>
            {promoApplied ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{promoApplied.promo.code}</div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{promoApplied.promo.name || "Diskon promo"}</div>
                  <div style={{ fontSize: 12, color: "#10b981", fontFamily: "'Geist Mono',monospace", marginTop: 2 }}>− {rp(promoApplied.discount)}</div>
                </div>
                <button onClick={removePromo} style={{
                  background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: C.sub,
                  borderRadius: 6, padding: "6px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                }}>✕ Hapus</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={promoCode} onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(""); }}
                    placeholder="KODE-PROMO"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } }}
                    style={{
                      flex: 1, background: C.card, border: `1px solid ${C.border}`, color: C.text,
                      borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "'Geist Mono',monospace", outline: "none",
                      letterSpacing: 1,
                    }} />
                  <button onClick={applyPromo} disabled={!promoCode.trim() || promoBusy} style={{
                    padding: "9px 16px", background: promoCode.trim() && !promoBusy ? brandPrimary : "rgba(255,255,255,0.1)",
                    color: "#fff", border: "none", borderRadius: 8,
                    fontSize: 12, fontWeight: 700, cursor: promoCode.trim() && !promoBusy ? "pointer" : "not-allowed", fontFamily: "inherit",
                  }}>{promoBusy ? "⏳" : "PAKAI"}</button>
                </div>
                {promoError && <div style={{ marginTop: 6, fontSize: 11, color: "#fca5a5" }}>⚠ {promoError}</div>}
              </>
            )}
          </div>

          {/* Loyalty lookup result */}
          {form.phone.replace(/[^\d]/g, "").length >= 8 && (
            <div style={{ marginTop: 14, padding: 14, borderRadius: 12,
              background: loyaltyData?.found ? "linear-gradient(135deg, rgba(168,85,247,0.12), rgba(251,191,36,0.06))" : "rgba(255,255,255,0.03)",
              border: `1px solid ${loyaltyData?.found ? "rgba(168,85,247,0.4)" : C.border}`,
            }}>
              {lookupBusy ? (
                <div style={{ fontSize: 12, color: C.dim }}>🔍 Cek saldo poin…</div>
              ) : loyaltyData?.found ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#c084fc", letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>⭐ HALO MEMBER</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 2 }}>{loyaltyData.customer.name || form.name || "Sobat"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Geist Mono',monospace", color: "#c084fc" }}>{loyaltyData.customer.points} pt</div>
                      <div style={{ fontSize: 10, color: C.dim }}>≈ Rp {(loyaltyData.config.max_idr_redeemable).toLocaleString("id-ID")}</div>
                    </div>
                  </div>
                  {maxRedeem > 0 ? (
                    <>
                      <div style={{ fontSize: 11, color: C.sub, marginBottom: 8 }}>
                        Pakai poin untuk potong harga (max {maxRedeem} pt = Rp {(maxRedeem * pointValueIDR).toLocaleString("id-ID")}):
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="range" min={0} max={maxRedeem} step={Math.max(1, Math.floor(maxRedeem / 50))} value={safePointsToRedeem}
                          onChange={(e) => setPointsToRedeem(Number(e.target.value))}
                          style={{ flex: 1, accentColor: brandPrimary }} />
                        <input type="number" min={0} max={maxRedeem} value={safePointsToRedeem}
                          onChange={(e) => setPointsToRedeem(Math.max(0, Math.min(maxRedeem, Number(e.target.value) || 0)))}
                          style={{ width: 70, padding: "6px 8px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, fontFamily: "'Geist Mono',monospace", textAlign: "center" }} />
                        <button onClick={() => setPointsToRedeem(maxRedeem)} style={{
                          padding: "6px 10px", background: "transparent", border: `1px solid ${brandPrimary}66`, color: brandPrimary,
                          borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                        }}>MAX</button>
                      </div>
                      {safePointsToRedeem > 0 && (
                        <div style={{ marginTop: 8, fontSize: 12, color: "#10b981", fontWeight: 700 }}>
                          💰 Potongan: − Rp {pointsDiscount.toLocaleString("id-ID")}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: C.dim }}>Belum bisa redeem — minimal Rp {pointValueIDR.toLocaleString("id-ID")} per poin.</div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.dim }}>
                  💡 Nomor ini belum terdaftar. Anda akan otomatis jadi member setelah booking ini.
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 18 }}>
            <ErrorInline error={error} label="Gagal membuat booking" onRetry={() => setError(null)} />
          </div>
        )}

        <button onClick={submit} disabled={!valid || submitting} style={{
          marginTop: S[6], width: "100%", padding: `${S[5]}px ${S[6]}px`,
          background: valid && !submitting ? `linear-gradient(135deg, ${C.gold}, ${C.ember})` : "rgba(255,255,255,0.1)",
          border: "none", color: valid && !submitting ? C.midnight : C.dim, borderRadius: 12,
          fontSize: 16, fontWeight: 900, cursor: valid && !submitting ? "pointer" : "not-allowed", fontFamily: "inherit",
          letterSpacing: 0.3,
          boxShadow: valid && !submitting ? `0 10px 28px ${C.gold}55, inset 0 1px 0 rgba(255,255,255,0.3)` : "none",
          transition: "all 0.2s cubic-bezier(.2,.8,.2,1)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: S[3],
        }}
          onMouseEnter={(e) => { if (valid && !submitting) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 14px 36px ${C.gold}88, inset 0 1px 0 rgba(255,255,255,0.4)`; } }}
          onMouseLeave={(e) => { if (valid && !submitting) { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 10px 28px ${C.gold}55, inset 0 1px 0 rgba(255,255,255,0.3)`; } }}>
          {submitting && <span style={{ display: "inline-block", animation: "cwPulse 1.4s ease infinite" }}>⏳</span>}
          {!submitting && <span style={{ fontSize: 18 }}>🎟️</span>}
          {submitLabel}
        </button>
        <div style={{ marginTop: 10, fontSize: 11, color: C.dim, textAlign: "center" }}>
          💵 Bayar di counter saat pengambilan tiket
        </div>
      </div>

      {/* Right: Order summary */}
      <aside>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, position: "sticky", top: 80 }}>
          <h3 style={{ ...TY.eyebrow, color: C.dim, margin: 0, marginBottom: 16 }}>📋 Ringkasan Booking</h3>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
            {film.poster_url && <img src={film.poster_url} alt="" style={{ width: 52, aspectRatio: "2/3", objectFit: "cover", borderRadius: 6 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...TY.subtitle, fontSize: 14, marginBottom: 4, color: C.text }}>{film.title}</div>
              <div style={{ ...TY.caption, color: C.sub }}>{film.duration_min}mnt · {film.genre || "—"}</div>
            </div>
          </div>
          <Row label="📍 Lokasi" value={outlet.name?.replace("Karya Cinema ", "") || outlet.code} />
          <RowEdit label="📅 Jadwal" value={`${fmtDate(showtime.show_date)} · ${showtime.start_time}`} onEdit={() => onEdit?.("showtime")} brandPrimary={brandPrimary} />
          <Row label="🎬 Studio" value={`${showtime.studio_name} · ${showtime.format || "2D"}`} />
          <RowEdit label="💺 Kursi" value={`${seats.length} kursi · ${seats.sort().join(", ")}`} onEdit={() => onEdit?.("seats")} brandPrimary={brandPrimary} />
          {bundlesMeta && Object.entries(bundlesCart || {}).length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>🍿 SNACK</span>
                <button onClick={() => onEdit?.("bundles")} style={{ background: "transparent", border: "none", color: brandPrimary, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>✏️ Edit</button>
              </div>
              {Object.entries(bundlesCart).map(([bid, q]) => {
                const b = bundlesMeta.find(x => String(x.id) === String(bid));
                return b ? (
                  <div key={bid} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11.5, gap: 8 }}>
                    <span style={{ color: C.text }}>{q}× {b.name}</span>
                    <span style={{ color: C.sub, fontFamily: "'Geist Mono',monospace" }}>{rp(b.price * q)}</span>
                  </div>
                ) : null;
              })}
            </div>
          )}
          {Object.keys(bundlesCart || {}).length === 0 && (
            <div style={{ marginTop: 8, padding: "8px 0", borderTop: `1px dashed ${C.border}` }}>
              <button onClick={() => onEdit?.("bundles")} style={{
                width: "100%", padding: "6px 10px", background: "transparent", border: `1px dashed ${C.border}`, color: brandPrimary,
                borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>🍿 + Tambah Snack</button>
            </div>
          )}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.dim, marginBottom: 6 }}>
              <span>Tiket ({seats.length})</span>
              <span style={{ fontFamily: "'Geist Mono',monospace" }}>{rp(seatTotal)}</span>
            </div>
            {bundleTotal > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.dim, marginBottom: 6 }}>
                <span>Snack & minuman</span>
                <span style={{ fontFamily: "'Geist Mono',monospace" }}>{rp(bundleTotal)}</span>
              </div>
            )}
            {promoApplied && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#10b981", marginBottom: 6, fontWeight: 700 }}>
                <span>🎟 Promo {promoApplied.promo.code}</span>
                <span style={{ fontFamily: "'Geist Mono',monospace" }}>− {rp(promoDiscount)}</span>
              </div>
            )}
            {safePointsToRedeem > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#10b981", marginBottom: 6, fontWeight: 700 }}>
                <span>⭐ Tukar {safePointsToRedeem} poin</span>
                <span style={{ fontFamily: "'Geist Mono',monospace" }}>− {rp(pointsDiscount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <span style={{ ...TY.eyebrow, color: C.sub }}>Total Bayar</span>
              <span style={{ ...TY.number, fontSize: 26, color: brandPrimary }}>{rp(total)}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ ...TY.eyebrow, color: C.dim, letterSpacing: "0.08em" }}>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{
          background: C.card, border: `1px solid ${C.border}`, color: C.text,
          borderRadius: 10, padding: "11px 13px", fontSize: 14, fontFamily: "inherit", outline: "none",
        }}
        onFocus={(e) => e.currentTarget.style.borderColor = "rgba(168,85,247,0.6)"}
        onBlur={(e) => e.currentTarget.style.borderColor = C.border}
      />
    </label>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, gap: 12 }}>
      <span style={{ color: C.dim, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.text, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function RowEdit({ label, value, onEdit, brandPrimary }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, gap: 12, alignItems: "center" }}>
      <span style={{ color: C.dim, flexShrink: 0 }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: C.text, textAlign: "right" }}>{value}</span>
        <button onClick={onEdit} title="Edit" style={{
          background: "transparent", border: "none", color: brandPrimary, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "0 4px",
          fontFamily: "inherit",
        }}>✏️</button>
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// STEP 6: SUCCESS
// ════════════════════════════════════════════════════════════════════
function SuccessPage({ booking, film, showtime, seats, bundlesCart, onNewBooking, brandPrimary }) {
  // Server returns tickets[] array (one per seat) — use first ticket code as primary QR target.
  // STRICT: only accept codes starting with "CT-" or "CP-" (ticket code or purchase id);
  // otherwise fallback to purchase_id. Never let outlet code slip through.
  const tickets = Array.isArray(booking?.tickets) ? booking.tickets : [];
  const isTicketCode = (s) => typeof s === "string" && /^(CT-|CP-)/.test(s);
  const primaryCode = (
    (isTicketCode(tickets[0]?.code) && tickets[0].code) ||
    (isTicketCode(booking?.ticket_code) && booking.ticket_code) ||
    (isTicketCode(booking?.purchase_id) && booking.purchase_id) ||
    null
  );
  const allTicketCodes = tickets.map(t => t.code).filter(isTicketCode);
  const total = booking?.total || (seats.length * (showtime.price || 0));
  const hasBundles = bundlesCart && Object.keys(bundlesCart).length > 0;
  const paymentStatus = booking?._payment_status || "unknown";
  const isPaid = paymentStatus === "paid";
  const isCounter = paymentStatus === "counter";

  const [showCelebration, setShowCelebration] = useState(true);
  const [qrSrc, setQrSrc] = useState(null);

  // Generate QR code for the ticket URL (link to digital ticket page).
  // Prefer purchase_id URL so single scan di counter → muncul semua tiket
  // → kasir bisa "Print Semua" sejumlah tiket yang dibeli (multi-seat).
  // Fallback ke single ticket URL kalau purchase_id tidak ada.
  useEffect(() => {
    if (!primaryCode) { setQrSrc(null); return; }
    const pid = (booking?.purchase_id && /^CP-/.test(booking.purchase_id)) ? booking.purchase_id : null;
    const url = pid
      ? `${window.location.origin}/?purchase=${pid}`
      : `${window.location.origin}/?ticket=${primaryCode}`;
    QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: "#000", light: "#fff" } })
      .then(setQrSrc).catch(() => setQrSrc(null));
  }, [primaryCode, booking?.purchase_id]);

  const customerName = booking?.buyer || "Sobat Bioskop";
  // Prefer purchase URL so single scan/click → semua tiket muncul + tombol Print Semua
  const purchaseId = (booking?.purchase_id && /^CP-/.test(booking.purchase_id)) ? booking.purchase_id : null;
  const eTicketUrl = purchaseId
    ? `${window.location.origin}/?purchase=${purchaseId}`
    : `${window.location.origin}/?ticket=${primaryCode}`;
  const waText = encodeURIComponent(`🎬 Tiket bioskop ku: ${film.title}\n📅 ${fmtDate(showtime.show_date)} ${showtime.start_time}\n💺 ${seats.sort().join(", ")}\n🎫 Kode: ${primaryCode}\n\n${eTicketUrl}`);

  return (
    <>
      {/* Celebration overlay — leaderboard + Sultan title, dismiss to see QR */}
      {showCelebration && (
        <CinemaCelebration
          order={{ customerName, total, filmTitle: film.title }}
          apiBase={API_HOST}
          onDone={() => setShowCelebration(false)}
        />
      )}

      <div style={{ padding: "30px 0 60px", maxWidth: 540, margin: "0 auto", textAlign: "center" }}>
        {/* Hero status — dramatic gold/green check dgn spring entrance */}
        <div style={{
          width: 96, height: 96, margin: "0 auto 20px",
          borderRadius: "50%",
          background: isPaid
            ? `radial-gradient(circle, rgba(16,185,129,0.25) 30%, rgba(16,185,129,0.08) 70%, transparent)`
            : isCounter
              ? `radial-gradient(circle, ${C.gold}3a 30%, ${C.gold}10 70%, transparent)`
              : `radial-gradient(circle, rgba(251,191,36,0.25) 30%, rgba(251,191,36,0.08) 70%, transparent)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 52,
          animation: "cwFadeUp 0.6s cubic-bezier(.34,1.56,.64,1) both",
          filter: isPaid ? "drop-shadow(0 0 20px rgba(16,185,129,0.5))" : `drop-shadow(0 0 20px ${C.gold}55)`,
        }}>{isPaid ? "✅" : isCounter ? "🎫" : "⏳"}</div>

        {/* Eyebrow mono */}
        <div style={{ ...TY.eyebrow, color: C.gold, marginBottom: S[2] }}>🎬 Booking Confirmed</div>

        <h1 style={{ ...TY.display, fontSize: "clamp(34px, 5vw, 52px)", margin: 0, marginBottom: S[2],
          color: isPaid ? "#10b981" : isCounter ? C.gold : "#fbbf24",
          textShadow: isPaid ? "0 0 24px rgba(16,185,129,0.3)" : `0 0 24px ${C.gold}33`,
        }}>
          {isPaid ? "Pembayaran Sukses!" : isCounter ? "Booking Berhasil!" : "Pembayaran Diverifikasi"}
        </h1>

        {/* Film + showtime mini-card */}
        <div style={{
          margin: `${S[3]}px auto ${S[5]}px`, maxWidth: 380,
          padding: `${S[4]}px ${S[5]}px`,
          background: "rgba(255,255,255,0.04)", border: `1px solid ${C.borderSubtle}`,
          borderRadius: 12,
        }}>
          <div style={{ ...TY.subtitle, fontSize: 16, marginBottom: 6, color: C.text }}>{film?.title || "Tiket Bioskop"}</div>
          <div style={{ ...TY.caption, color: C.sub, fontFamily: T.mono, letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>
            {fmtDate(showtime.show_date)} · <span style={{ color: C.gold, fontWeight: 700 }}>{showtime.start_time}</span> · {seats.sort().join(", ")}
          </div>
        </div>

        <p style={{ ...TY.body, color: C.sub, margin: 0, marginBottom: S[6] }}>
          {isCounter
            ? "Tunjukkan QR ini di counter saat ambil tiket"
            : "Scan QR ini di pintu studio untuk masuk"}
        </p>

        {/* QR CODE — gold frame premium */}
        {primaryCode ? (
          <>
            <div style={{
              background: "#fff",
              padding: 18, borderRadius: 18, marginBottom: 14,
              boxShadow: `0 12px 40px ${C.gold}33, 0 0 0 3px ${C.gold}55, 0 0 0 1px rgba(0,0,0,0.2)`,
              display: "inline-block",
              position: "relative",
            }}>
              {/* Corner brackets — cinema-ticket vibe */}
              {["topLeft", "topRight", "bottomLeft", "bottomRight"].map(corner => {
                const pos = {
                  topLeft:     { top: -2, left: -2, borderTop: `3px solid ${C.gold}`, borderLeft: `3px solid ${C.gold}` },
                  topRight:    { top: -2, right: -2, borderTop: `3px solid ${C.gold}`, borderRight: `3px solid ${C.gold}` },
                  bottomLeft:  { bottom: -2, left: -2, borderBottom: `3px solid ${C.gold}`, borderLeft: `3px solid ${C.gold}` },
                  bottomRight: { bottom: -2, right: -2, borderBottom: `3px solid ${C.gold}`, borderRight: `3px solid ${C.gold}` },
                }[corner];
                return <span key={corner} style={{ position: "absolute", width: 14, height: 14, ...pos, borderRadius: 3 }} aria-hidden />;
              })}
              {qrSrc ? (
                <img src={qrSrc} alt={`QR ${primaryCode}`} style={{ width: 220, height: 220, display: "block" }} />
              ) : (
                <div style={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 12 }}>
                  Generating QR…
                </div>
              )}
            </div>
            <div style={{ ...TY.eyebrow, color: C.meta, marginBottom: 6 }}>Kode Tiket</div>
            <div style={{ ...TY.number, fontSize: 24, color: C.gold, marginBottom: S[2], letterSpacing: "0.06em" }}>{primaryCode}</div>
            {allTicketCodes.length > 1 && (
              <div style={{ ...TY.caption, color: C.dim, marginBottom: 22 }}>
                {allTicketCodes.length} tiket — kode lain: {allTicketCodes.slice(1).join(", ")}
              </div>
            )}
            {allTicketCodes.length <= 1 && <div style={{ marginBottom: 22 }} />}
          </>
        ) : (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 16, marginBottom: 22, fontSize: 12, color: "#fca5a5" }}>
            ⚠ Kode tiket tidak ter-generate. Hubungi staff atau cek di halaman tracking.
          </div>
        )}

        {/* Booking details */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 16, textAlign: "left" }}>
          {/* Outlet prominently — anti cross-outlet contamination */}
          {booking?._client_outlet && (
            <div style={{
              background: `${brandPrimary}14`, border: `1px solid ${brandPrimary}44`,
              borderRadius: 10, padding: "10px 12px", marginBottom: 14,
            }}>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", marginBottom: 2 }}>📍 AMBIL TIKET DI</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{booking._client_outlet.name}</div>
              <div style={{ fontSize: 11, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>{booking._client_outlet.code}</div>
              {booking._client_outlet.address && <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>{booking._client_outlet.address}</div>}
            </div>
          )}
          <Row label="🎬 Film" value={film.title} />
          <Row label="📅 Jadwal" value={`${fmtDate(showtime.show_date)} · ${showtime.start_time}`} />
          <Row label="🎬 Studio" value={`${showtime.studio_name} · ${showtime.format || "2D"}`} />
          <Row label="💺 Kursi" value={seats.sort().join(", ")} />
          {hasBundles && <Row label="🍿 Snack" value={`${Object.values(bundlesCart).reduce((s, q) => s + q, 0)} item`} />}
          <Row label="💰 Total" value={rp(total)} />
        </div>

        <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 12, padding: "11px 14px", marginBottom: 18, fontSize: 12, color: "#fbbf24", textAlign: "left" }}>
          ⏰ <strong>Datang min. 15 menit sebelum jadwal.</strong> {isCounter ? `Bayar ${rp(total)} di counter saat ambil tiket.` : "Tunjukkan QR untuk akses studio."}
        </div>

        {/* Loyalty / Points apresiasi — kalau backend return loyalty data */}
        {booking?.loyalty && (
          <div style={{
            background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(251,191,36,0.08))",
            border: "1px solid rgba(168,85,247,0.4)",
            borderRadius: 14, padding: 14, marginBottom: 18, textAlign: "left",
          }}>
            <div style={{ fontSize: 11, color: "#c084fc", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 8 }}>⭐ POIN ANDA</div>
            {booking.loyalty.new_member && (
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", marginBottom: 6 }}>🎉 Selamat! Anda jadi member otomatis!</div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: C.sub }}>+ {booking.loyalty.earned} poin dari booking ini</span>
              <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Geist Mono',monospace", color: "#c084fc" }}>{booking.loyalty.balance} pt</span>
            </div>
            <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.4 }}>
              💰 Saldo Anda ≈ Rp {(booking.loyalty.balance * 10).toLocaleString('id-ID')} · 100 poin = Rp 1.000 diskon di booking berikutnya
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer" style={{
            padding: "12px", background: "#25D366", border: "none", color: "#fff",
            borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: "inherit",
            textDecoration: "none", textAlign: "center",
          }}>📱 Share WA</a>
          {primaryCode && (
            <a href={eTicketUrl} target="_blank" rel="noopener noreferrer" style={{
              padding: "12px", background: brandPrimary, border: "none", color: "#fff",
              borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              textDecoration: "none", textAlign: "center",
              boxShadow: `0 6px 16px ${brandPrimary}55`,
            }}>🎫 Buka E-Tiket</a>
          )}
        </div>
        <button onClick={onNewBooking} style={{
          width: "100%", padding: "11px",
          background: "transparent", border: `1px solid ${C.border}`, color: C.sub,
          borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>+ Booking Tiket Lagi</button>

        <div style={{ marginTop: 18, fontSize: 11, color: C.dim, fontStyle: "italic" }}>
          📸 Screenshot QR di atas untuk akses lebih cepat di pintu studio.
        </div>
      </div>
    </>
  );
}
