// src/CinemaWeb/CinemaWebApp.jsx
// karyaOS — Cinema Web Booking (customer-facing, mobile + desktop)
// Route: /?movies=1
// Flow: outlet pick → films grid → showtime → seats → checkout → success
//
// Reuses backend /api/cinema/* (films, showtimes, seats, tickets).
// Premium dark theme, brand-aware via /api/companies/branding.

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import QRCode from "qrcode";
import API_HOST from "../apiBase.js";
import { fmtMoney as rp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";
import { ErrorInline } from "../components/ConnectionError.jsx";
import CinemaCelebration from "../CinemaCelebration.jsx";

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

const C = {
  bg: "#18181b",
  bgGrad: "radial-gradient(1200px 800px at 20% 0%, rgba(168,85,247,0.08), transparent 60%), radial-gradient(800px 600px at 80% 100%, rgba(251,191,36,0.05), transparent 60%), #18181b",
  card: "rgba(255,255,255,0.04)",
  cardHover: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.1)",
  text: "#fafafa",
  sub: "rgba(250,250,250,0.7)",
  dim: "rgba(250,250,250,0.45)",
  brand: "#a855f7",
  amber: "#fbbf24",
  green: "#10b981",
  red: "#ef4444",
};

const STEPS = ["outlet", "films", "filmDetail", "showtime", "seats", "bundles", "checkout", "success", "about", "history", "movies", "promo", "studio", "locations", "faq"];

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

  return (
    <div style={{ minHeight: "100vh", background: C.bgGrad, color: C.text, fontFamily: "'Inter','-apple-system',sans-serif", paddingBottom: 80 }}>
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

        /* Premium card hover treatment */
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
        .cw-section-pad > * { animation: cwFadeUp 0.4s ease both; }
        .cw-section-pad > *:nth-child(2) { animation-delay: 0.08s; }
        .cw-section-pad > *:nth-child(3) { animation-delay: 0.16s; }

        /* Hide scrollbar on carousel for clean look */
        .cw-section-pad > div::-webkit-scrollbar { display: none; }

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
          />
        )}
        {step === "films" && outlet && (
          <FilmsGrid outlet={outlet} onPickFilm={(f) => { setFilm(f); goTo("filmDetail"); }} brandPrimary={brandPrimary} />
        )}
        {step === "filmDetail" && film && (
          <FilmDetail outlet={outlet} film={film} onPickShowtime={() => goTo("showtime")} brandPrimary={brandPrimary} />
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
          <AboutPage brand={brand} brandPrimary={brandPrimary} onBack={goHome} />
        )}
        {step === "history" && (
          <HistoryPage session={session} brandPrimary={brandPrimary} onSignInClick={() => setSignInOpen(true)} />
        )}
        {step === "movies" && (
          <MoviesPage brandPrimary={brandPrimary} onPick={(f) => { setFilm(f); goTo(outlet ? "filmDetail" : "outlet"); }} />
        )}
        {step === "promo" && (
          <PromoPage brandPrimary={brandPrimary} />
        )}
        {step === "studio" && (
          <StudioPage brandPrimary={brandPrimary} />
        )}
        {step === "locations" && (
          <LocationsPage brandPrimary={brandPrimary} onPick={pickOutlet} />
        )}
        {step === "faq" && (
          <FAQPage brandPrimary={brandPrimary} />
        )}
      </main>
      <Footer brand={brand} brandPrimary={brandPrimary} onAbout={() => goTo("about")} onNav={(t) => goTo(t)} />
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState("phone"); // 'phone' | 'newuser'
  const [foundData, setFoundData] = useState(null);

  const submit = async () => {
    const cleaned = phone.replace(/[^\d]/g, "");
    if (cleaned.length < 8) { setError("Nomor HP minimal 8 digit"); return; }
    setBusy(true); setError("");
    try {
      const r = await fetch(`${API_HOST}/api/cinema/loyalty-points?phone=${encodeURIComponent(cleaned)}`);
      const d = await r.json();
      if (d.found) {
        // Existing member — sign in directly
        onSignIn({
          phone: d.customer.phone, name: d.customer.name, points: d.customer.points,
          tier: d.customer.tier, lifetime_spend: d.customer.lifetime_spend,
          total_visits: d.customer.total_visits, signed_in_at: Date.now(),
        });
      } else {
        // New user — ask name then create later (akan auto-create di booking pertama)
        setFoundData(d);
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
            <div style={{ fontSize: 11, color: brandPrimary, fontWeight: 800, letterSpacing: 2, fontFamily: "'Geist Mono',monospace" }}>🔐 SIGN IN</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0, marginTop: 4 }}>
              {step === "phone" ? "Masuk Akun" : "Daftar Member"}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.dim, fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {step === "phone" ? (
          <>
            <p style={{ fontSize: 13, color: C.sub, margin: 0, marginBottom: 18, lineHeight: 1.5 }}>
              Cukup nomor HP saja. Kalau Anda pernah booking sebelumnya, otomatis kami detect saldo poin Anda.
            </p>
            <label style={{ display: "block", marginBottom: 8, fontSize: 11, color: C.dim, fontWeight: 600 }}>No. WhatsApp</label>
            <input value={phone} onChange={e => { setPhone(e.target.value); setError(""); }} type="tel"
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              placeholder="08xxxxxxxxxx" autoFocus
              style={{
                width: "100%", background: C.card, border: `1px solid ${C.border}`,
                color: C.text, borderRadius: 10, padding: "12px 14px", fontSize: 15,
                fontFamily: "'Geist Mono',monospace", outline: "none", boxSizing: "border-box",
                letterSpacing: 1,
              }} />
            {error && <div style={{ marginTop: 10, fontSize: 12, color: "#fca5a5" }}>⚠ {error}</div>}
            <button onClick={submit} disabled={busy || phone.replace(/\D/g, "").length < 8} style={{
              width: "100%", marginTop: 18, padding: 14,
              background: phone.replace(/\D/g, "").length >= 8 && !busy ? brandPrimary : "rgba(255,255,255,0.1)",
              border: "none", color: "#fff", borderRadius: 12,
              fontSize: 14, fontWeight: 800, cursor: phone.replace(/\D/g, "").length >= 8 && !busy ? "pointer" : "not-allowed",
              fontFamily: "inherit", boxShadow: phone.replace(/\D/g, "").length >= 8 && !busy ? `0 6px 20px ${brandPrimary}55` : "none",
            }}>{busy ? "🔍 Cek member…" : "Masuk →"}</button>
            <div style={{ marginTop: 12, fontSize: 11, color: C.dim, textAlign: "center" }}>
              Belum punya akun? Otomatis daftar saat input HP baru.
            </div>
          </>
        ) : (
          <>
            <div style={{ background: `${brandPrimary}11`, border: `1px solid ${brandPrimary}44`, borderRadius: 10, padding: 12, marginBottom: 18, fontSize: 12, color: brandPrimary }}>
              ✨ Selamat datang! HP <strong>{phone}</strong> belum terdaftar. Isi nama untuk daftar member baru.
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

function MoviesPage({ brandPrimary, onPick }) {
  const [films, setFilms] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/films`).then(r => r.json()).then(d => setFilms(d.films || [])).catch(() => setFilms([]));
  }, []);
  if (!films) return (
    <div style={{ padding: "30px 0 60px" }}>
      <Skeleton h={28} w={180} style={{ marginBottom: 8 }} />
      <Skeleton h={14} w={260} style={{ marginBottom: 30 }} />
      <FilmGridSkeleton count={6} />
    </div>
  );
  const nowShowing = films.filter(f => f.status === "now_showing" || !f.status);
  const comingSoon = films.filter(f => f.status === "coming_soon");
  return (
    <div style={{ padding: "30px 0 60px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, margin: 0, marginBottom: 6 }}>🎬 Movies</h1>
      <p style={{ fontSize: 13, color: C.sub, margin: 0, marginBottom: 24 }}>{films.length} film · {nowShowing.length} now showing · {comingSoon.length} coming soon</p>
      <FilmGroup title="🎥 Now Showing" films={nowShowing} onPick={onPick} brandPrimary={brandPrimary} />
      {comingSoon.length > 0 && <FilmGroup title="🔜 Coming Soon" films={comingSoon} onPick={onPick} brandPrimary={brandPrimary} />}
    </div>
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

function PromoPage({ brandPrimary }) {
  const [promos, setPromos] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/promotions/active`).then(r => r.json()).then(d => setPromos(d.promotions || d || []))
      .catch(() => setPromos([]));
  }, []);
  if (!promos) return <LoadingState label="Memuat promo…" />;
  return (
    <div style={{ padding: "30px 0 60px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, margin: 0, marginBottom: 6 }}>🎟 Promo & Event</h1>
      <p style={{ fontSize: 13, color: C.sub, margin: 0, marginBottom: 24 }}>{promos.length} promo aktif · pakai kode saat checkout</p>
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

function StudioPage({ brandPrimary }) {
  const [packages, setPackages] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/party-packages`).then(r => r.ok ? r.json() : { packages: [] })
      .then(d => setPackages(d.packages || d || []))
      .catch(() => setPackages([]));
  }, []);
  if (!packages) return <LoadingState label="Memuat paket studio…" />;
  return (
    <div style={{ padding: "30px 0 60px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, margin: 0, marginBottom: 6 }}>🎉 Booking Studio</h1>
      <p style={{ fontSize: 13, color: C.sub, margin: 0, marginBottom: 24 }}>Sewa studio cinema untuk private event, ulang tahun, gathering — Anda nonton, kami fasilitasi.</p>
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

function LocationsPage({ brandPrimary, onPick }) {
  const [outlets, setOutlets] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/outlet-master`).then(r => r.json()).then(d => {
      const list = Array.isArray(d) ? d : (d.outlets || d.data || []);
      setOutlets(list.filter(o => (o.primary_vertical === "cinema" || o.vertical === "cinema") && o.status !== "inactive"));
    }).catch(() => setOutlets([]));
  }, []);
  if (!outlets) return <LoadingState label="Memuat lokasi…" />;
  return (
    <div style={{ padding: "30px 0 60px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, margin: 0, marginBottom: 6 }}>📍 Lokasi Cinema</h1>
      <p style={{ fontSize: 13, color: C.sub, margin: 0, marginBottom: 24 }}>{outlets.length} outlet di seluruh Indonesia</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14 }}>
        {outlets.map(o => {
          const visual = getCityVisual(o);
          const city = o.area || o.name?.replace("Karya Cinema ", "") || o.code;
          const mapsUrl = o.address ? `https://maps.google.com/?q=${encodeURIComponent(o.address)}` : null;
          return (
            <div key={o.code} style={{
              background: visual.url ? `linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.95)), url(${visual.url}) center/cover` : DEFAULT_CITY_GRADIENT,
              border: `1px solid ${C.border}`, borderRadius: 16, padding: 0, overflow: "hidden",
              minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "flex-end",
            }}>
              <div style={{ padding: "16px 18px" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>{visual.emoji} {city}</div>
                {o.name && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>{o.name}</div>}
                {o.address && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginBottom: 10 }}>📍 {o.address}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onPick(o)} style={{
                    flex: 1, padding: "8px 12px", background: brandPrimary, color: "#fff", border: "none",
                    borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  }}>Lihat Jadwal</button>
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{
                      padding: "8px 12px", background: "rgba(0,0,0,0.5)", color: "#fff", border: `1px solid rgba(255,255,255,0.2)`,
                      borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: "none", fontFamily: "inherit",
                    }}>🗺️ Maps</a>
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
      { q: "Bagaimana cara pesan tiket online?", a: "Pilih lokasi cinema → pilih film → pilih jadwal → pilih kursi → tambah F&B (opsional) → checkout & bayar. Tiket akan dikirim via WhatsApp dalam bentuk QR code." },
      { q: "Bayar di mana saja?", a: "Bayar di counter cinema saat pengambilan tiket (cash/QRIS/kartu) atau via Midtrans online (QRIS, e-wallet, virtual account). Pilih metode saat checkout." },
      { q: "Bisa pilih kursi sendiri?", a: "Ya, peta kursi real-time tersedia. Kursi yang sudah dibeli orang lain akan terblok otomatis sehingga tidak ada double-booking." },
      { q: "Apakah harus print tiket?", a: "Tidak perlu. Cukup tunjukkan QR code di counter atau pintu masuk studio. Staff akan scan dan print tiket fisik untuk Anda." },
      { q: "Berapa lama sebelum showtime saya bisa booking?", a: "Booking dibuka sampai 15 menit sebelum showtime dimulai. Kami sarankan booking lebih awal untuk dapat kursi terbaik." },
    ],
  },
  {
    title: "💳 Pembayaran & Refund",
    items: [
      { q: "Metode pembayaran apa saja?", a: "QRIS, kartu kredit/debit, e-wallet (GoPay, OVO, Dana, ShopeePay), Virtual Account (BCA, BNI, Mandiri, BRI, Permata), Alfamart/Indomaret." },
      { q: "Apakah ada biaya admin?", a: "Tidak ada biaya tambahan. Harga yang Anda lihat sudah termasuk PPN 11%." },
      { q: "Bisakah refund tiket?", a: "Tiket yang sudah dibeli tidak bisa di-refund dalam bentuk uang. Namun bisa reschedule ke jadwal lain di hari yang sama (subject to availability) dengan menghubungi customer service min. 2 jam sebelum showtime." },
      { q: "Apa yang terjadi kalau film dibatalkan?", a: "Jika film dibatalkan dari pihak kami, Anda akan dihubungi langsung dan mendapatkan full refund atau pilihan reschedule." },
    ],
  },
  {
    title: "🎁 Promo & Loyalty",
    items: [
      { q: "Bagaimana cara pakai kode promo?", a: "Di halaman checkout, masukkan kode promo di kolom yang tersedia, lalu klik Apply. Diskon akan otomatis dihitung." },
      { q: "Bagaimana cara dapat poin loyalty?", a: "Setiap booking otomatis dapat poin: Rp 5.000 = 1 poin. Tidak perlu daftar terpisah, cukup masukkan nomor HP yang sama setiap booking." },
      { q: "Bagaimana cara tukar poin?", a: "100 poin = Rp 1.000 diskon. Saat checkout, pilih jumlah poin yang ingin di-redeem (kelipatan 100). Diskon akan langsung diterapkan." },
      { q: "Apakah poin bisa kadaluarsa?", a: "Poin berlaku 12 bulan sejak transaksi terakhir. Tetap aktif booking untuk perpanjang masa berlaku." },
    ],
  },
  {
    title: "🎬 Film & Studio",
    items: [
      { q: "Format film apa saja yang tersedia?", a: "2D, 3D, IMAX, dan 4DX (tergantung outlet). Format tersedia per jadwal akan ditampilkan saat pilih showtime." },
      { q: "Apa arti rating film (SU, 13+, 17+, D21)?", a: "SU = Semua Umur, 13+ = remaja 13 tahun ke atas, 17+ = remaja 17 tahun ke atas, D21 = dewasa 21 tahun ke atas. Mohon bawa identitas valid jika diminta." },
      { q: "Apakah ada subtitle Indonesia?", a: "Sebagian besar film impor disediakan subtitle Indonesia. Info subtitle ada di halaman detail film." },
      { q: "Bisakah booking studio untuk event privat?", a: "Ya, kami menyediakan booking studio penuh untuk event privat (corporate, ulang tahun, wedding). Cek menu Studio untuk request." },
    ],
  },
  {
    title: "📱 Akun & E-Ticket",
    items: [
      { q: "Apakah harus daftar akun dulu?", a: "Tidak perlu daftar terpisah. Cukup masukkan nomor HP saat booking; sistem otomatis buat profile member untuk Anda." },
      { q: "Bagaimana akses booking history?", a: "Klik tombol Sign In di header → masukkan nomor HP yang digunakan saat booking. Anda akan lihat semua booking aktif & past, poin loyalty, dan promo." },
      { q: "Tidak terima WhatsApp e-tiket?", a: "Cek folder spam atau pastikan nomor WA aktif. Jika tetap tidak terima, hubungi customer service via WA atau cek di halaman akun Anda untuk download manual." },
      { q: "Bisakah transfer tiket ke orang lain?", a: "Tiket tidak diatasnamakan, jadi bisa dipakai siapa saja yang membawa QR code-nya. Pastikan jaga QR code dengan baik." },
    ],
  },
];

function FAQPage({ brandPrimary }) {
  const [openKey, setOpenKey] = useState("0-0");  // group 0 item 0 default open
  return (
    <div style={{ padding: "40px 0 60px", maxWidth: 820, margin: "0 auto" }}>
      <div style={{
        textAlign: "center", marginBottom: 36, padding: "32px 20px",
        background: `linear-gradient(135deg, ${brandPrimary}15, rgba(168,85,247,0.05))`,
        border: `1px solid ${brandPrimary}33`, borderRadius: 18,
      }}>
        <div style={{ fontSize: 11, color: brandPrimary, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 8, textTransform: "uppercase" }}>FAQ · BANTUAN</div>
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1, margin: 0, marginBottom: 8, color: "#fff" }}>Pertanyaan Umum</h1>
        <p style={{ fontSize: 13.5, color: C.sub, margin: 0, lineHeight: 1.6 }}>
          Jawaban cepat untuk pertanyaan paling sering. Tidak menemukan jawaban? <a href="https://wa.me/6285190062368" target="_blank" rel="noopener noreferrer" style={{ color: brandPrimary, fontWeight: 700 }}>Hubungi CS via WhatsApp</a>.
        </p>
      </div>
      {FAQ_GROUPS.map((group, gi) => (
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
  );
}

// ════════════════════════════════════════════════════════════════════
// ABOUT PAGE — company history & info
// ════════════════════════════════════════════════════════════════════
function AboutPage({ brand, brandPrimary, onBack }) {
  const name = brand?.brand_short || brand?.name || "KaryaOS";
  return (
    <div style={{ padding: "40px 0 60px", maxWidth: 800, margin: "0 auto" }}>
      {/* Hero */}
      <div style={{
        textAlign: "center", marginBottom: 40,
        padding: "40px 24px",
        background: `linear-gradient(135deg, ${brandPrimary}15, rgba(168,85,247,0.05))`,
        border: `1px solid ${brandPrimary}33`, borderRadius: 18,
      }}>
        {brand?.logo_url && <img src={brand.logo_url} alt="" style={{ height: 56, marginBottom: 16, objectFit: "contain" }} />}
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, margin: 0, marginBottom: 8, color: "#fff" }}>{name}</h1>
        <p style={{ fontSize: 14, color: C.sub, margin: 0, lineHeight: 1.6 }}>
          Pengalaman cinema digital untuk Indonesia
        </p>
      </div>

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
function Footer({ brand, brandPrimary, onAbout, onNav }) {
  const brandName = brand?.brand_short || brand?.name || "karyaOS";
  const year = new Date().getFullYear();
  const FooterLink = ({ children, onClick, href }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer" style={footerLinkStyle}>{children}</a>
    : <button onClick={onClick} style={{ ...footerLinkStyle, background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>{children}</button>;
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 36, marginBottom: 40 }}>
          {/* Column 1: Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              {brand?.logo_url && <img src={brand.logo_url} alt="" style={{ height: 32, objectFit: "contain" }} />}
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", letterSpacing: -0.3 }}>{brandName}</div>
                <div style={{ fontSize: 9, color: C.dim, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1.5, textTransform: "uppercase" }}>Cinema Booking</div>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.7, margin: 0, marginBottom: 16 }}>
              Pengalaman cinema premium di ujung jari Anda. Pesan tiket online, pilih kursi, langsung nonton.
            </p>
            {/* Social icons */}
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { name: "WA", icon: "💬", url: "https://wa.me/6285190062368" },
                { name: "IG", icon: "📷", url: "https://instagram.com" },
                { name: "TT", icon: "🎵", url: "https://tiktok.com" },
                { name: "YT", icon: "▶", url: "https://youtube.com" },
              ].map(s => (
                <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" title={s.name} style={{
                  width: 34, height: 34, borderRadius: 8,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  textDecoration: "none", fontSize: 14, transition: "all 0.15s",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${brandPrimary}22`; e.currentTarget.style.borderColor = `${brandPrimary}66`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = C.border; }}>{s.icon}</a>
              ))}
            </div>
          </div>

          {/* Column 2: Navigation */}
          <div>
            <FooterHeading>Navigasi</FooterHeading>
            <FooterLink onClick={() => onNav?.("outlet")}>Beranda</FooterLink>
            <FooterLink onClick={() => onNav?.("movies")}>Movies</FooterLink>
            <FooterLink onClick={() => onNav?.("promo")}>Promo & Event</FooterLink>
            <FooterLink onClick={() => onNav?.("studio")}>Booking Studio</FooterLink>
            <FooterLink onClick={() => onNav?.("locations")}>Lokasi</FooterLink>
          </div>

          {/* Column 3: Help */}
          <div>
            <FooterHeading>Bantuan</FooterHeading>
            <FooterLink onClick={() => onNav?.("faq")}>FAQ</FooterLink>
            <FooterLink onClick={() => onNav?.("faq")}>Cara Pesan Tiket</FooterLink>
            <FooterLink onClick={() => onNav?.("faq")}>Kebijakan Refund</FooterLink>
            <FooterLink onClick={() => onNav?.("faq")}>Loyalty Program</FooterLink>
            <FooterLink href="https://wa.me/6285190062368">Customer Service</FooterLink>
          </div>

          {/* Column 4: Company + Legal */}
          <div>
            <FooterHeading>Perusahaan</FooterHeading>
            <FooterLink onClick={onAbout}>Tentang {brandName}</FooterLink>
            <FooterLink>Karier</FooterLink>
            <FooterLink>Partnership</FooterLink>
            <div style={{ height: 14 }} />
            <FooterHeading>Legal</FooterHeading>
            <FooterLink>Syarat & Ketentuan</FooterLink>
            <FooterLink>Kebijakan Privasi</FooterLink>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          paddingTop: 22, borderTop: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap",
          fontSize: 11, color: C.dim,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span>© {year} {brandName}. All rights reserved.</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.sub }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
              System operational
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.85 }}>
              <span style={{ fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1 }}>SECURE PAYMENT</span>
              <span style={{ fontSize: 14 }}>🔒</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: C.dim }}>Powered by</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", color: brandPrimary, fontWeight: 700, fontSize: 11 }}>karya<span style={{ color: "#fbbf24" }}>OS</span></span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterHeading({ children }) {
  return <div style={{ fontSize: 10, color: "#fff", letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace", marginBottom: 14, textTransform: "uppercase", fontWeight: 800 }}>{children}</div>;
}

const footerLinkStyle = {
  display: "block", padding: "4px 0", fontSize: 12.5, color: "rgba(156,163,175,0.85)",
  textDecoration: "none", transition: "color 0.15s", fontFamily: "inherit",
};

// ════════════════════════════════════════════════════════════════════
// HEADER
// ════════════════════════════════════════════════════════════════════
const NAV_ITEMS = [
  { key: "outlet",    label: "Beranda" },
  { key: "movies",    label: "Movies" },
  { key: "promo",     label: "Promo" },
  { key: "studio",    label: "Studio" },
  { key: "locations", label: "Lokasi" },
  { key: "about",     label: "About" },
];

function Header({ outlet, step, onResetOutlet, onBack, onHome, brand, brandPrimary, session, onSignInClick, onSignOut, onNav, onPickFilm }) {
  const brandName = brand?.brand_short || brand?.name || "karyaOS";
  const showBack = !["outlet", "success", "movies", "promo", "studio", "locations", "about", "history"].includes(step);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(10,10,15,0.85)", backdropFilter: "blur(20px) saturate(180%)",
      borderBottom: `1px solid ${C.border}`,
      padding: "12px 20px",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
        {showBack && (
          <button onClick={onBack} title="Kembali" style={{
            background: "transparent", border: `1px solid ${C.border}`, color: C.text,
            borderRadius: 8, width: 34, height: 34, fontSize: 15, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
          }}>←</button>
        )}
        <button onClick={onHome} title="Beranda" style={{
          display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none",
          color: C.text, cursor: "pointer", fontFamily: "inherit", padding: 0, textAlign: "left", flexShrink: 0,
        }}>
          {brand?.logo_url && <img src={brand.logo_url} alt="" style={{ height: 28, objectFit: "contain" }} />}
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.3 }}>{brandName}</div>
            <div style={{ fontSize: 10, color: C.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>CINEMA · ONLINE BOOKING</div>
          </div>
        </button>

        {/* Desktop nav */}
        <nav className="cw-nav-desktop" style={{ display: "flex", gap: 4, marginLeft: 16, flex: 1 }}>
          {NAV_ITEMS.map(item => {
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
          {NAV_ITEMS.map(item => (
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
function CinemaHero({ films, brandPrimary, onPickFilm }) {
  const slides = useMemo(() => (films || []).filter(f => f.poster_url).slice(0, 6), [films]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const iv = setInterval(() => setIdx(i => (i + 1) % slides.length), 6000);
    return () => clearInterval(iv);
  }, [slides.length]);

  const current = slides[idx];
  const handleBadgeClick = () => { if (current && onPickFilm) onPickFilm(current); };

  return (
    <section style={{
      position: "relative", width: "100%", minHeight: "min(70vh, 600px)",
      overflow: "hidden", marginLeft: "calc(-50vw + 50%)", marginRight: "calc(-50vw + 50%)",
      width: "100vw",
    }}>
      {/* Crossfade slides */}
      {slides.map((f, i) => (
        <div key={f.id} aria-hidden={i !== idx} style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${f.poster_url})`,
          backgroundSize: "cover", backgroundPosition: "center 20%",
          opacity: i === idx ? 1 : 0,
          transition: "opacity 1.2s ease-in-out",
          filter: "blur(0.5px)",
        }} />
      ))}

      {/* Cinematic overlay layers */}
      {/* 1. Vertical dark gradient (bottom heavier) */}
      <div style={{ position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(10,10,15,0.5) 0%, rgba(10,10,15,0.7) 50%, rgba(10,10,15,0.98) 100%)",
      }} />
      {/* 2. Spotlight (radial vignette from center, dim edges) */}
      <div style={{ position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 70% 60% at 50% 40%, transparent 0%, rgba(10,10,15,0.7) 100%)",
      }} />
      {/* 3. Top side darkening (theater curtain effect) */}
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "20%",
        background: "linear-gradient(90deg, rgba(10,10,15,0.95), transparent)", pointerEvents: "none",
      }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "20%",
        background: "linear-gradient(-90deg, rgba(10,10,15,0.95), transparent)", pointerEvents: "none",
      }} />
      {/* 4. Brand color glow accent */}
      <div style={{ position: "absolute", inset: 0,
        background: `radial-gradient(circle 600px at 50% 30%, ${brandPrimary}11, transparent 60%)`,
      }} />
      {/* 5. Subtle film grain noise via repeating gradient */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.08, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, transparent 1px, transparent 2px)",
      }} />

      {/* Hero content */}
      <div style={{
        position: "relative", zIndex: 10, padding: "80px 24px 90px",
        maxWidth: 900, margin: "0 auto", textAlign: "center",
        minHeight: "min(70vh, 600px)", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        {/* "NOW SHOWING" badge — clickable → jump to film detail (lock outlet first) */}
        {current && (
          <button onClick={handleBadgeClick} title={`Lihat detail ${current.title}`} style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 22,
            padding: "8px 18px", borderRadius: 999,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(20px)",
            border: `1px solid ${brandPrimary}55`,
            fontSize: 11, fontWeight: 800, letterSpacing: 2, color: brandPrimary,
            fontFamily: "'Geist Mono',monospace", textTransform: "uppercase",
            animation: "cwFadeIn 1s ease both",
            cursor: "pointer", transition: "all 0.2s ease",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${brandPrimary}33`; e.currentTarget.style.borderColor = brandPrimary; e.currentTarget.style.transform = "scale(1.05)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.55)"; e.currentTarget.style.borderColor = `${brandPrimary}55`; e.currentTarget.style.transform = "scale(1)"; }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: brandPrimary, boxShadow: `0 0 12px ${brandPrimary}`, animation: "cwPulse 2s ease infinite" }} />
            NOW SHOWING · {current.title}
            <span style={{ fontSize: 13, opacity: 0.7, marginLeft: 4 }}>→</span>
          </button>
        )}

        <h1 className="cw-page-title" style={{
          fontSize: "clamp(36px, 6vw, 60px)", fontWeight: 900, letterSpacing: -1.8,
          margin: 0, marginBottom: 18, lineHeight: 1.05, color: "#fff",
          textShadow: "0 4px 24px rgba(0,0,0,0.8)",
        }}>
          Lebih Dari Sekadar<br />
          <span style={{ color: brandPrimary, textShadow: `0 0 32px ${brandPrimary}99` }}>Sebuah Film.</span>
        </h1>
        <p style={{
          fontSize: "clamp(14px, 1.5vw, 17px)", color: "rgba(255,255,255,0.85)",
          maxWidth: 560, margin: "0 auto 32px", lineHeight: 1.6,
          textShadow: "0 2px 8px rgba(0,0,0,0.6)",
        }}>
          Pesan tiket bioskop online, pilih kursi favorit, langsung nonton tanpa antri. Pengalaman cinema premium di ujung jari Anda.
        </p>

        {/* CTA scroll-down indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, animation: "cwPulse 2.5s ease infinite" }}>
          <span>PILIH LOKASI DI BAWAH</span>
          <span style={{ fontSize: 16 }}>↓</span>
        </div>

        {/* Slideshow dots indicator */}
        {slides.length > 1 && (
          <div style={{ display: "flex", gap: 8, marginTop: 28 }}>
            {slides.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`} style={{
                width: i === idx ? 24 : 8, height: 8, borderRadius: 999, border: "none",
                background: i === idx ? brandPrimary : "rgba(255,255,255,0.3)",
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
function OutletPicker({ onPick, onPickFeaturedFilm, pendingFilm, brandPrimary }) {
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
      <div style={{ height: 40 }} />

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
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, margin: 0, marginBottom: 6 }}>
          Sedang Tayang
        </h1>
        <p style={{ fontSize: 13, color: C.sub, margin: 0 }}>
          {filmsWithShowtimes.length} film · {showtimes.length} showtime di {outlet.name?.replace("Karya Cinema ", "") || outlet.code}
        </p>
      </div>
      {filmsWithShowtimes.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.dim }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <div style={{ fontSize: 15, marginBottom: 4 }}>Tidak ada film tayang hari ini</div>
          <div style={{ fontSize: 12 }}>Cek lokasi lain atau besok</div>
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
                      position: "absolute", top: 8, right: 8,
                      background: (RATING_COLOR[f.age_rating] || "#9ca3af") + "ee",
                      color: "#fff", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 800,
                      fontFamily: "'Geist Mono',monospace",
                    }}>{f.age_rating}</div>
                  )}
                </div>
                <div style={{ padding: "12px 12px 14px" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{f.genre || "—"} · {f.duration_min || 0} mnt</div>
                  {f.ratings_count > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                      <Stars value={f.avg_rating || 0} size={11} color={brandPrimary} />
                      <span style={{ fontSize: 10, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{Number(f.avg_rating || 0).toFixed(1)} ({f.ratings_count})</span>
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 11, color: brandPrimary, fontWeight: 700 }}>{showCount} jadwal hari ini →</div>
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

function FilmDetail({ outlet, film, onPickShowtime, brandPrimary }) {
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

  return (
    <div style={{ padding: "20px 0 60px" }}>
      {/* Hero with poster backdrop */}
      <div style={{
        position: "relative", borderRadius: 18, overflow: "hidden",
        marginBottom: 24, minHeight: 320,
        background: film.poster_url ? `linear-gradient(180deg, rgba(10,10,15,0.4) 0%, rgba(10,10,15,0.95) 100%), url(${film.poster_url}) center/cover, #1a1a22` : DEFAULT_CITY_GRADIENT,
      }}>
        <div style={{ display: "flex", gap: 20, padding: "32px 24px 28px", alignItems: "flex-end", minHeight: 320, flexWrap: "wrap" }}>
          {film.poster_url && (
            <img src={film.poster_url} alt={film.title} style={{
              width: 160, aspectRatio: "2/3", objectFit: "cover", borderRadius: 12,
              boxShadow: "0 12px 36px rgba(0,0,0,0.6)", flexShrink: 0,
            }} />
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, margin: 0, marginBottom: 8, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>{film.title}</h1>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
              {film.rating && (
                <span style={{
                  padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800,
                  background: (RATING_COLOR[film.rating] || "#9ca3af") + "33",
                  color: RATING_COLOR[film.rating] || "#9ca3af",
                  border: `1px solid ${RATING_COLOR[film.rating] || "#9ca3af"}66`,
                  fontFamily: "'Geist Mono',monospace",
                }}>{film.rating}</span>
              )}
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{film.duration_min || 0} menit</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>·</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{film.genre || "—"}</span>
              {film.language && <>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>·</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>🌐 {film.language}</span>
              </>}
              {film.ratings_count > 0 && <>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>·</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Stars value={film.avg_rating || 0} size={13} color={brandPrimary} />
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontFamily: "'Geist Mono',monospace" }}>{Number(film.avg_rating || 0).toFixed(1)} ({film.ratings_count})</span>
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
            <button onClick={onPickShowtime} disabled={showtimeCount === 0} style={{
              background: showtimeCount === 0 ? "rgba(255,255,255,0.1)" : brandPrimary,
              color: "#fff", border: "none", borderRadius: 12,
              padding: "14px 28px", fontSize: 15, fontWeight: 800, cursor: showtimeCount === 0 ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              boxShadow: showtimeCount === 0 ? "none" : `0 8px 24px ${brandPrimary}66`,
              transition: "transform 0.15s",
            }}
              onMouseEnter={(e) => { if (showtimeCount !== 0) e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}>
              {showtimeCount === null ? "⏳ Cek jadwal…"
                : showtimeCount === 0 ? "❌ Tidak ada jadwal"
                : `🎟️ Lihat ${showtimeCount} Jadwal →`}
            </button>
          </div>
        </div>
      </div>

      {/* Trailer */}
      {trailerEmbed && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: brandPrimary, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 10, textTransform: "uppercase" }}>▶ Trailer</div>
          <div style={{ position: "relative", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "#000", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
            <iframe
              src={trailerEmbed}
              title={`${film.title} trailer`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            />
          </div>
        </div>
      )}

      {/* Synopsis */}
      {film.synopsis && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: brandPrimary, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 10, textTransform: "uppercase" }}>📖 Sinopsis</div>
          <p style={{ fontSize: 14, color: C.text, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{film.synopsis}</p>
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
        </div>
      </div>

      {/* Reviews from penonton */}
      <ReviewsSection filmId={film.id} brandPrimary={brandPrimary} />
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

// Curated Unsplash CDN photos per Indonesian city (free use, no API key).
// Falls back to gradient + emoji if outlet's city isn't mapped or image fails to load.
const CITY_IMAGES = {
  "jakarta":  { url: "https://images.unsplash.com/photo-1555899434-94d1368aa7af?w=800&q=80&auto=format&fit=crop", emoji: "🏙️" },
  "bandung":  { url: "https://images.unsplash.com/photo-1612547038879-69bc0a18d2d2?w=800&q=80&auto=format&fit=crop", emoji: "🌋" },
  "bali":     { url: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80&auto=format&fit=crop", emoji: "🏝️" },
  "medan":    { url: "https://images.unsplash.com/photo-1601121535582-d96c1283f9cb?w=800&q=80&auto=format&fit=crop", emoji: "🌴" },
  "surabaya": { url: "https://images.unsplash.com/photo-1596402184320-417e7178b2cd?w=800&q=80&auto=format&fit=crop", emoji: "🌉" },
  "yogyakarta": { url: "https://images.unsplash.com/photo-1596402184320-417e7178b2cd?w=800&q=80&auto=format&fit=crop", emoji: "🏛️" },
  "semarang":   { url: "https://images.unsplash.com/photo-1601121535582-d96c1283f9cb?w=800&q=80&auto=format&fit=crop", emoji: "⛩️" },
};
const DEFAULT_CITY_GRADIENT = "linear-gradient(135deg, #1e293b 0%, #312e81 50%, #831843 100%)";

function getCityVisual(outlet) {
  const key = (outlet.area || outlet.name || "").toLowerCase();
  for (const city of Object.keys(CITY_IMAGES)) {
    if (key.includes(city)) return CITY_IMAGES[city];
  }
  // Generic — use outlet name as seed for stable picsum
  return { url: `https://picsum.photos/seed/${encodeURIComponent(outlet.code || outlet.name || 'x')}/800/600`, emoji: "🎬" };
}

function fmtDate(yyyymmdd) {
  if (!yyyymmdd) return "";
  const d = new Date(yyyymmdd + "T00:00:00");
  return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
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
      <div style={{ display: "flex", gap: 18, marginBottom: 30, padding: 18, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
        {film.poster_url && (
          <img src={film.poster_url} alt="" style={{ width: 90, aspectRatio: "2/3", objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, margin: 0, marginBottom: 6 }}>{film.title}</h1>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>{film.genre || "—"} · {film.duration_min || 0} mnt</div>
          {film.age_rating && (
            <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 800, fontFamily: "'Geist Mono',monospace", background: (RATING_COLOR[film.age_rating] || "#9ca3af") + "33", color: RATING_COLOR[film.age_rating] || "#9ca3af" }}>{film.age_rating}</span>
          )}
        </div>
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, letterSpacing: -0.4 }}>Pilih Jadwal</h2>
      <p style={{ fontSize: 12, color: C.dim, margin: "0 0 18px" }}>{showtimes.length} jadwal tersedia · klik untuk pilih kursi</p>

      {showtimes.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.dim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 15, marginBottom: 4 }}>Tidak ada jadwal tersedia</div>
          <div style={{ fontSize: 12 }}>Coba pilih film lain atau cek lokasi berbeda</div>
        </div>
      ) : (
        Object.entries(byDate).map(([date, list]) => (
          <div key={date} style={{ marginBottom: 24, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: -0.2 }}>{fmtDate(date)}</div>
              <div style={{ fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{list.length} jadwal</div>
            </div>
            <div className="cw-showtimes-grid" style={{ display: "grid", gridTemplateColumns: list.length === 1 ? "1fr" : "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
              {list.map(s => {
                const remaining = (s.capacity || 0) - (s.sold_count || 0);
                const lowSeats = remaining <= 10 && remaining > 0;
                const soldOut = remaining <= 0 || s.derived_status === "sold_out";
                const pctSold = s.capacity > 0 ? Math.round((s.sold_count || 0) / s.capacity * 100) : 0;
                return (
                  <button key={s.id} onClick={() => !soldOut && onPickShowtime(s)} disabled={soldOut} style={{
                    background: soldOut ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${soldOut ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 10, padding: "10px 11px", textAlign: "left",
                    color: soldOut ? C.dim : C.text, cursor: soldOut ? "not-allowed" : "pointer",
                    fontFamily: "inherit", transition: "all 0.18s ease",
                    position: "relative", overflow: "hidden",
                  }}
                    onMouseEnter={(e) => { if (!soldOut) { e.currentTarget.style.borderColor = brandPrimary; e.currentTarget.style.background = `${brandPrimary}1a`; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 6px 16px ${brandPrimary}33`; } }}
                    onMouseLeave={(e) => { if (!soldOut) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; } }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 17, fontWeight: 800, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.3 }}>{s.start_time}</span>
                      <span style={{ fontSize: 9, color: FORMAT_COLOR[s.format] || C.dim, fontWeight: 800, fontFamily: "'Geist Mono',monospace", background: (FORMAT_COLOR[s.format] || "#9ca3af") + "22", padding: "1px 6px", borderRadius: 3, letterSpacing: 0.3 }}>{s.format || "2D"}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.sub, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.studio_name}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: brandPrimary, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.2 }}>{rp(s.price)}</div>
                    {soldOut ? (
                      <div style={{ marginTop: 6, fontSize: 9, color: "#ef4444", fontWeight: 800, letterSpacing: 1, fontFamily: "'Geist Mono',monospace" }}>SOLD OUT</div>
                    ) : lowSeats ? (
                      <div style={{ marginTop: 6, fontSize: 9, color: "#fbbf24", fontWeight: 700 }}>⚠ Sisa {remaining}</div>
                    ) : (
                      <div style={{ marginTop: 6, height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pctSold}%`, background: pctSold > 70 ? "#fbbf24" : "#10b981", transition: "width 0.3s" }} />
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
  };

  if (error) return <ErrorInline error={error} label="Gagal memuat peta kursi" onRetry={load} />;
  if (!seatData) return <LoadingState label="Memuat peta kursi…" />;

  const rows = seatData.rows || 0;
  const cols = seatData.cols || 0;
  const total = selected.size * (showtime.price || 0);

  // Generate seat IDs (row letter + col number, e.g. A1, B5)
  const rowLetters = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i));

  return (
    <div style={{ padding: "30px 0 120px" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, margin: 0, marginBottom: 4 }}>Pilih Kursi</h2>
        <div style={{ fontSize: 12, color: C.sub }}>
          {showtime.studio_name} · {showtime.start_time} · {showtime.format || "2D"}
        </div>
      </div>

      {/* Screen */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{
          height: 8, maxWidth: 480, margin: "0 auto",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
          borderRadius: "50%", filter: "blur(2px)",
        }} />
        <div style={{ fontSize: 10, color: C.dim, marginTop: 6, letterSpacing: 2, fontFamily: "'Geist Mono',monospace" }}>LAYAR</div>
      </div>

      {/* Seat grid */}
      <div style={{ overflowX: "auto", paddingBottom: 10 }}>
        <div style={{ display: "inline-block", margin: "0 auto", minWidth: "100%" }}>
          {rowLetters.map(row => (
            <div key={row} className="cw-seat-row" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, justifyContent: "center" }}>
              <div style={{ width: 18, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace", textAlign: "right" }}>{row}</div>
              {Array.from({ length: cols }, (_, i) => i + 1).map(col => {
                const seat = `${row}${col}`;
                const isSold = seatData.sold.includes(seat);
                const isHeldOther = seatData.held_by_others?.includes(seat);
                const isMine = selected.has(seat);
                const bg = isSold ? "rgba(239,68,68,0.4)" : isHeldOther ? "rgba(156,163,175,0.4)" : isMine ? brandPrimary : "rgba(255,255,255,0.06)";
                const border = isMine ? brandPrimary : isSold ? "rgba(239,68,68,0.6)" : isHeldOther ? "rgba(156,163,175,0.4)" : "rgba(255,255,255,0.15)";
                return (
                  <button key={seat} onClick={() => toggle(seat)}
                    disabled={isSold || isHeldOther}
                    title={isSold ? `${seat} (sold)` : isHeldOther ? `${seat} (held)` : seat}
                    className="cw-seat"
                    style={{
                      width: 26, height: 26, borderRadius: 6,
                      background: bg, border: `1px solid ${border}`,
                      color: isMine ? "#fff" : isSold || isHeldOther ? C.dim : C.text,
                      fontSize: 8, fontWeight: 700, fontFamily: "'Geist Mono',monospace",
                      cursor: isSold || isHeldOther ? "not-allowed" : "pointer", padding: 0,
                      flexShrink: 0,
                    }}>{col}</button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 18, fontSize: 11, color: C.sub, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)" }} />
          <span>Tersedia</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: brandPrimary }} />
          <span>Dipilih</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: "rgba(239,68,68,0.4)", border: "1px solid rgba(239,68,68,0.6)" }} />
          <span>Terjual</span>
        </div>
      </div>

      {/* Bottom action bar (sticky) */}
      {selected.size > 0 && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
          background: "rgba(10,10,15,0.95)", backdropFilter: "blur(20px)",
          borderTop: `1px solid ${C.border}`, padding: "14px 20px",
        }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>
                {selected.size} KURSI · {Array.from(selected).sort().join(", ")}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Geist Mono',monospace", color: brandPrimary }}>{rp(total)}</div>
            </div>
            <button onClick={() => onConfirm(Array.from(selected))} style={{
              background: brandPrimary, border: "none", color: "#fff",
              padding: "12px 22px", borderRadius: 10,
              fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              boxShadow: `0 8px 20px ${brandPrimary}55`,
            }}>Lanjut →</button>
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
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, margin: 0, marginBottom: 6 }}>
          🍿 Tambah Snack?
        </h2>
        <p style={{ fontSize: 13, color: C.sub, margin: 0 }}>
          Pesan sekalian di sini, ambil di counter saat scan tiket. Bisa di-skip.
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
              <div style={{ padding: "12px 14px 14px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{b.name}</div>
                {b.description && <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.4, marginBottom: 10, minHeight: 28 }}>{b.description}</div>}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Geist Mono',monospace", color: brandPrimary }}>{rp(b.price)}</div>
                  {qty === 0 ? (
                    <button onClick={() => setQty(b.id, 1)} style={{
                      background: `${brandPrimary}22`, border: `1px solid ${brandPrimary}55`, color: brandPrimary,
                      borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}>+ Tambah</button>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: brandPrimary, borderRadius: 8, padding: "2px 4px" }}>
                      <button onClick={() => setQty(b.id, qty - 1)} style={{
                        width: 28, height: 28, background: "transparent", border: "none", color: "#fff",
                        fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                      }}>−</button>
                      <span style={{ minWidth: 16, textAlign: "center", color: "#fff", fontWeight: 800, fontFamily: "'Geist Mono',monospace" }}>{qty}</span>
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
                <div style={{ fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>
                  {totalQty} ITEM SNACK
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Geist Mono',monospace", color: brandPrimary }}>+ {rp(totalPrice)}</div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.sub }}>Tanpa snack juga OK — bisa beli di counter</div>
            )}
          </div>
          <button onClick={onContinue} style={{
            background: brandPrimary, border: "none", color: "#fff",
            padding: "12px 22px", borderRadius: 10,
            fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
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
        <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, margin: 0, marginBottom: 16 }}>Data Pemesan</h2>
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
          marginTop: 24, width: "100%", padding: "14px",
          background: valid && !submitting ? brandPrimary : "rgba(255,255,255,0.1)",
          border: "none", color: "#fff", borderRadius: 10,
          fontSize: 14, fontWeight: 800, cursor: valid && !submitting ? "pointer" : "not-allowed", fontFamily: "inherit",
          boxShadow: valid && !submitting ? `0 8px 20px ${brandPrimary}55` : "none",
        }}>{submitLabel}</button>
        <div style={{ marginTop: 10, fontSize: 11, color: C.dim, textAlign: "center" }}>
          💵 Bayar di counter saat pengambilan tiket
        </div>
      </div>

      {/* Right: Order summary */}
      <aside>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, position: "sticky", top: 80 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, color: C.dim, fontFamily: "'Geist Mono',monospace", margin: 0, marginBottom: 14, textTransform: "uppercase" }}>Ringkasan</h3>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
            {film.poster_url && <img src={film.poster_url} alt="" style={{ width: 50, aspectRatio: "2/3", objectFit: "cover", borderRadius: 6 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>{film.title}</div>
              <div style={{ fontSize: 11, color: C.sub }}>{film.duration_min}mnt · {film.genre || "—"}</div>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
              <span style={{ fontSize: 13, color: C.sub }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Geist Mono',monospace", color: brandPrimary }}>{rp(total)}</span>
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
      <span style={{ fontSize: 11, color: C.dim, fontWeight: 600, letterSpacing: 0.5 }}>{label}</span>
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
        {/* Hero status */}
        <div style={{
          width: 70, height: 70, margin: "0 auto 16px",
          borderRadius: "50%",
          background: isPaid ? "rgba(16,185,129,0.15)" : isCounter ? `${brandPrimary}26` : "rgba(251,191,36,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36,
        }}>{isPaid ? "✓" : isCounter ? "🎫" : "⏳"}</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, margin: 0, marginBottom: 6,
          color: isPaid ? "#10b981" : isCounter ? brandPrimary : "#fbbf24" }}>
          {isPaid ? "Pembayaran Sukses!" : isCounter ? "Booking Berhasil!" : "Pembayaran Diverifikasi"}
        </h1>
        <p style={{ fontSize: 13, color: C.sub, margin: 0, marginBottom: 22 }}>
          {isCounter
            ? "Tunjukkan QR ini di counter saat ambil tiket"
            : "Scan QR ini di pintu studio untuk masuk"}
        </p>

        {/* QR CODE — main attraction (only render kalau primaryCode valid) */}
        {primaryCode ? (
          <>
            <div style={{
              background: "#fff", padding: 16, borderRadius: 16, marginBottom: 14,
              boxShadow: `0 12px 36px ${brandPrimary}22, 0 0 0 1px ${C.border}`,
              display: "inline-block",
            }}>
              {qrSrc ? (
                <img src={qrSrc} alt={`QR ${primaryCode}`} style={{ width: 220, height: 220, display: "block" }} />
              ) : (
                <div style={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 12 }}>
                  Generating QR…
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", marginBottom: 4, textTransform: "uppercase" }}>Kode Tiket</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Geist Mono',monospace", color: brandPrimary, marginBottom: 8, letterSpacing: 0.5 }}>{primaryCode}</div>
            {allTicketCodes.length > 1 && (
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 22 }}>
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
