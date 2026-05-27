// src/CinemaWeb/CinemaWebApp.jsx
// karyaOS — Cinema Web Booking (customer-facing, mobile + desktop)
// Route: /?movies=1
// Flow: outlet pick → films grid → showtime → seats → checkout → success
//
// Reuses backend /api/cinema/* (films, showtimes, seats, tickets).
// Premium dark theme, brand-aware via /api/companies/branding.

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import API_HOST from "../apiBase.js";
import { fmtMoney as rp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";
import { ErrorInline } from "../components/ConnectionError.jsx";

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
  bg: "#0a0a0f",
  bgGrad: "radial-gradient(1200px 800px at 20% 0%, rgba(168,85,247,0.08), transparent 60%), radial-gradient(800px 600px at 80% 100%, rgba(251,191,36,0.06), transparent 60%), #0a0a0f",
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

const STEPS = ["outlet", "films", "showtime", "seats", "bundles", "checkout", "success"];

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

  // Brand theming (auto-load tenant brand for color hint)
  const [brand, setBrand] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/companies/branding`).then(r => r.json()).then(setBrand).catch(() => {});
  }, []);
  const brandPrimary = brand?.brand_color || "#a855f7";

  const pickOutlet = (o) => {
    setOutlet(o);
    try { localStorage.setItem("cinema_web_outlet", JSON.stringify(o)); } catch {}
    setStep("films");
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

  return (
    <div style={{ minHeight: "100vh", background: C.bgGrad, color: C.text, fontFamily: "'Inter','-apple-system',sans-serif", paddingBottom: 80 }}>
      <style>{`
        /* Mobile responsive overrides */
        @media (max-width: 768px) {
          .cw-checkout { grid-template-columns: 1fr !important; gap: 16px !important; }
          .cw-checkout aside > div { position: static !important; }
          .cw-header h1 { font-size: 14px !important; }
          .cw-outlet-pill { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .cw-page-title { font-size: 24px !important; }
          .cw-films-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .cw-bundles-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          .cw-seat { width: 22px !important; height: 22px !important; font-size: 7px !important; }
          .cw-seat-row { gap: 4px !important; margin-bottom: 4px !important; }
          .cw-section-pad { padding: 20px 0 !important; }
        }
        @media (max-width: 420px) {
          .cw-films-grid { grid-template-columns: 1fr !important; }
          .cw-bundles-grid { grid-template-columns: 1fr !important; }
          .cw-seat { width: 18px !important; height: 18px !important; }
        }
      `}</style>
      <Header outlet={outlet} step={step} onResetOutlet={resetOutlet} onBack={goBack} brand={brand} brandPrimary={brandPrimary} />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px" }}>
        {step === "outlet" && <OutletPicker onPick={pickOutlet} brandPrimary={brandPrimary} />}
        {step === "films" && outlet && (
          <FilmsGrid outlet={outlet} onPickFilm={(f) => { setFilm(f); goTo("showtime"); }} brandPrimary={brandPrimary} />
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
            brandPrimary={brandPrimary} />
        )}
        {step === "success" && booking && (
          <SuccessPage booking={booking} film={film} showtime={showtime} seats={seats}
            bundlesCart={bundlesCart}
            onNewBooking={() => { setFilm(null); setShowtime(null); setSeats([]); setBundlesCart({}); setBooking(null); goTo("films"); }}
            brandPrimary={brandPrimary} />
        )}
      </main>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// HEADER
// ════════════════════════════════════════════════════════════════════
function Header({ outlet, step, onResetOutlet, onBack, brand, brandPrimary }) {
  const brandName = brand?.brand_short || brand?.name || "karyaOS";
  const showBack = step !== "outlet" && step !== "success";
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(10,10,15,0.85)", backdropFilter: "blur(20px) saturate(180%)",
      borderBottom: `1px solid ${C.border}`,
      padding: "14px 20px",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
        {showBack && (
          <button onClick={onBack} style={{
            background: "transparent", border: `1px solid ${C.border}`, color: C.text,
            borderRadius: 8, width: 36, height: 36, fontSize: 16, cursor: "pointer", fontFamily: "inherit",
          }}>←</button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          {brand?.logo_url && <img src={brand.logo_url} alt="" style={{ height: 28, objectFit: "contain" }} />}
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.3 }}>{brandName}</div>
            <div style={{ fontSize: 10, color: C.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>CINEMA · ONLINE BOOKING</div>
          </div>
        </div>
        {outlet && step !== "outlet" && (
          <button onClick={onResetOutlet} className="cw-outlet-pill" style={{
            background: `${brandPrimary}22`, border: `1px solid ${brandPrimary}55`, color: brandPrimary,
            borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span>📍</span>
            <span>{outlet.name?.replace("Karya Cinema ", "") || outlet.code}</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
          </button>
        )}
      </div>
    </header>
  );
}

// ════════════════════════════════════════════════════════════════════
// STEP 1: OUTLET PICKER
// ════════════════════════════════════════════════════════════════════
function OutletPicker({ onPick, brandPrimary }) {
  const [outlets, setOutlets] = useState(null);
  const [films, setFilms] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([
      fetch(`${API_HOST}/api/outlet-master`).then(r => { if (!r.ok) throw new Error(`outlets ${r.status}`); return r.json(); }),
      fetch(`${API_HOST}/api/cinema/films`).then(r => r.ok ? r.json() : { films: [] }).catch(() => ({ films: [] })),
    ]).then(([d, fd]) => {
      const list = Array.isArray(d) ? d : (d.outlets || d.data || []);
      const cinemaOutlets = list.filter(o =>
        (o.primary_vertical === "cinema" || o.vertical === "cinema") &&
        (o.status !== "inactive")
      );
      setOutlets(cinemaOutlets);
      setFilms((fd.films || []).filter(f => f.poster_url).slice(0, 8));
    }).catch(e => setError(e));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorInline error={error} label="Gagal memuat lokasi" onRetry={load} />;
  if (!outlets) return <LoadingState label="Memuat lokasi bioskop…" />;

  return (
    <div className="cw-section-pad" style={{ padding: "50px 0 40px" }}>
      {/* HERO */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{
          display: "inline-block", padding: "5px 14px", borderRadius: 999,
          background: `${brandPrimary}1a`, border: `1px solid ${brandPrimary}55`,
          color: brandPrimary, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
          fontFamily: "'Geist Mono',monospace", marginBottom: 16, textTransform: "uppercase",
        }}>🎬 Online Booking · Skip Antrian</div>
        <h1 className="cw-page-title" style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1.5, margin: 0, marginBottom: 12, lineHeight: 1.1, background: `linear-gradient(135deg, #fff 0%, ${brandPrimary} 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
          Pesan Tiket. Pilih Kursi.<br/>Langsung Nonton.
        </h1>
        <p style={{ fontSize: 15, color: C.sub, maxWidth: 520, margin: "0 auto", lineHeight: 1.5 }}>
          Tiket bioskop online tanpa antri loket. Pilih lokasi, pick film, pesan kursi favorit, ambil di counter.
        </p>
      </div>

      {/* Now showing carousel (if available) */}
      {films && films.length > 0 && (
        <div style={{ marginBottom: 50 }}>
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", marginBottom: 14, textAlign: "center", textTransform: "uppercase" }}>
            ✨ Now Showing
          </div>
          <div style={{ overflowX: "auto", paddingBottom: 12, margin: "0 -20px" }}>
            <div style={{ display: "flex", gap: 12, padding: "0 20px", minWidth: "fit-content" }}>
              {films.map(f => (
                <div key={f.id} style={{
                  flexShrink: 0, width: 140, aspectRatio: "2/3", borderRadius: 12,
                  background: `url(${f.poster_url}) center/cover`,
                  border: `1px solid ${C.border}`, position: "relative",
                  display: "flex", flexDirection: "column", justifyContent: "flex-end",
                  overflow: "hidden",
                }}>
                  <div style={{
                    background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 100%)",
                    padding: "30px 10px 10px",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", fontFamily: "'Geist Mono',monospace" }}>{f.duration_min || 0} mnt</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Outlet picker section */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, margin: 0, marginBottom: 6 }}>
          Pilih Lokasi Bioskop
        </h2>
        <p style={{ fontSize: 13, color: C.sub, margin: 0 }}>
          {outlets.length} kota · klik untuk lihat jadwal hari ini
        </p>
      </div>
      {outlets.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: C.dim }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
          <div>Belum ada lokasi bioskop aktif</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 14 }}>
          {outlets.map(o => (
            <button key={o.code} onClick={() => onPick(o)} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
              padding: "20px 18px", textAlign: "left", color: C.text, cursor: "pointer",
              fontFamily: "inherit", transition: "all 0.15s",
              display: "flex", flexDirection: "column", gap: 8,
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.cardHover; e.currentTarget.style.borderColor = `${brandPrimary}66`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.card; e.currentTarget.style.borderColor = C.border; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>🎬</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{o.name?.replace("Karya Cinema ", "") || o.code}</div>
                  <div style={{ fontSize: 10, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{o.code}</div>
                </div>
              </div>
              {o.area && <div style={{ fontSize: 12, color: C.sub }}>{o.area}</div>}
              {o.address && <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.4 }}>{o.address}</div>}
              <div style={{ marginTop: "auto", paddingTop: 10, fontSize: 11, color: brandPrimary, fontWeight: 700, letterSpacing: 0.5 }}>
                LIHAT JADWAL →
              </div>
            </button>
          ))}
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
// STEP 3: SHOWTIMES LIST (grouped by date)
// ════════════════════════════════════════════════════════════════════
const FORMAT_COLOR = { "2D": "#3b82f6", "3D": "#a855f7", IMAX: "#fbbf24", "4DX": "#ec4899" };

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

      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, letterSpacing: -0.3 }}>Pilih Jadwal</h2>
      {showtimes.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: C.dim }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📅</div>
          <div>Tidak ada jadwal tersedia untuk film ini</div>
        </div>
      ) : (
        Object.entries(byDate).map(([date, list]) => (
          <div key={date} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.dim, fontFamily: "'Geist Mono',monospace", marginBottom: 10, textTransform: "uppercase" }}>{fmtDate(date)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 170px), 1fr))", gap: 10 }}>
              {list.map(s => {
                const remaining = (s.capacity || 0) - (s.sold_count || 0);
                const lowSeats = remaining <= 10 && remaining > 0;
                const soldOut = remaining <= 0 || s.derived_status === "sold_out";
                return (
                  <button key={s.id} onClick={() => !soldOut && onPickShowtime(s)} disabled={soldOut} style={{
                    background: soldOut ? "rgba(239,68,68,0.08)" : C.card,
                    border: `1px solid ${soldOut ? "rgba(239,68,68,0.3)" : C.border}`,
                    borderRadius: 12, padding: "12px 14px", textAlign: "left",
                    color: soldOut ? C.dim : C.text, cursor: soldOut ? "not-allowed" : "pointer",
                    fontFamily: "inherit", transition: "all 0.15s",
                  }}
                    onMouseEnter={(e) => { if (!soldOut) { e.currentTarget.style.borderColor = `${brandPrimary}66`; e.currentTarget.style.background = C.cardHover; } }}
                    onMouseLeave={(e) => { if (!soldOut) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.card; } }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Geist Mono',monospace" }}>{s.start_time}</span>
                      <span style={{ fontSize: 10, color: FORMAT_COLOR[s.format] || C.dim, fontWeight: 800, fontFamily: "'Geist Mono',monospace" }}>{s.format || "2D"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>{s.studio_name} · {s.studio_type || "Regular"}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: brandPrimary, fontFamily: "'Geist Mono',monospace" }}>{rp(s.price)}</div>
                    {soldOut ? (
                      <div style={{ marginTop: 4, fontSize: 10, color: "#ef4444", fontWeight: 700 }}>SOLD OUT</div>
                    ) : lowSeats ? (
                      <div style={{ marginTop: 4, fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>Sisa {remaining} kursi</div>
                    ) : (
                      <div style={{ marginTop: 4, fontSize: 10, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{remaining}/{s.capacity}</div>
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
function Checkout({ outlet, film, showtime, seats, bundlesCart, onBooked, brandPrimary }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [bundlesMeta, setBundlesMeta] = useState(null);

  // Load bundle metadata for display (need names + prices in summary)
  useEffect(() => {
    if (!bundlesCart || Object.keys(bundlesCart).length === 0) return;
    fetch(`${API_HOST}/api/cinema/bundles?outlet=${encodeURIComponent(outlet.code)}`)
      .then(r => r.json()).then(d => setBundlesMeta(d.bundles || [])).catch(() => {});
  }, [outlet.code, bundlesCart]);

  const seatTotal = seats.length * (showtime.price || 0);
  const bundleTotal = bundlesMeta ? Object.entries(bundlesCart || {}).reduce((s, [bid, q]) => {
    const b = bundlesMeta.find(x => String(x.id) === String(bid));
    return s + (b ? b.price * q : 0);
  }, 0) : 0;
  const total = seatTotal + bundleTotal;
  const valid = form.name.trim() && form.phone.trim().match(/^[0-9+\-\s]{8,}$/);

  // Stage: 'idle' | 'booking' | 'paying' | 'polling'
  const [stage, setStage] = useState("idle");

  // Flow with Midtrans Snap + defense layers:
  // 1. POST /tickets → create ticket(s) in pending_payment state (seats locked)
  // 2. POST /payment/cinema-snap → get snap_token
  // 3. Open snap.pay() popup
  // 4. On snap callback (success/pending/close) → poll status endpoint
  // 5. Only show success page after backend confirms paid (defense vs
  //    "Midtrans success but webhook lost → no ticket update")
  const submit = async () => {
    if (!valid || submitting) return;

    // ANTI cross-outlet contamination: pre-flight check
    if (showtime.outlet && showtime.outlet !== outlet.code) {
      setError(new Error(`Outlet mismatch: showtime di ${showtime.outlet}, Anda pilih ${outlet.code}. Refresh & ulangi.`));
      return;
    }

    setSubmitting(true); setError(null); setStage("booking");

    try {
      // Step 1: create booking (server validates seats + creates pending tickets)
      const bundlesArr = Object.entries(bundlesCart || {}).map(([bid, qty]) => ({ bundle_id: Number(bid), qty }));
      const bookBody = {
        showtime_id: showtime.id,
        outlet_code: outlet.code,
        seats,
        bundles: bundlesArr,
        buyer: form.name.trim(),
        buyer_phone: form.phone.replace(/[^\d]/g, ""),
        buyer_email: form.email.trim() || undefined,
        payment_method: "snap_pending",
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
      const purchaseId = bookData.purchase_id;
      if (!purchaseId) throw new Error("Booking response tidak include purchase_id");

      // Step 2: load Snap.js + request snap_token
      setStage("paying");
      const snap = await loadSnapScript();
      if (!snap) throw new Error("Snap.js gagal load — coba refresh halaman");

      const snapRes = await fetch(`${API_HOST}/api/payment/cinema-snap`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_id: purchaseId }),
      });
      const snapData = await snapRes.json();
      if (!snapRes.ok || !snapData.snap_token) {
        throw new Error(snapData.error || "Gagal membuat link pembayaran");
      }

      // Step 3 + 4: open Snap popup, poll status on any close
      const finalizeBooking = async (resultLabel) => {
        setStage("polling");
        // Poll up to 30 seconds — Midtrans webhook may take a few seconds
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const sr = await fetch(`${API_HOST}/api/cinema/purchase/${purchaseId}/status`);
            const sd = await sr.json();
            if (sd.paid) {
              // Defense complete — backend confirmed payment, tickets settled
              onBooked({ ...bookData, _client_outlet: outlet, _payment_status: "paid", _snap_result: resultLabel });
              return;
            }
            if (sd.payment_status === "failed") {
              throw new Error("Pembayaran gagal / dibatalkan");
            }
          } catch (e) { /* keep polling */ }
        }
        // Timeout fallback: show success page with pending status
        // User has ticket code → counter can manually verify with Midtrans dashboard
        onBooked({ ...bookData, _client_outlet: outlet, _payment_status: "pending_verification", _snap_result: resultLabel });
      };

      snap.pay(snapData.snap_token, {
        onSuccess: () => finalizeBooking("success"),
        onPending: () => finalizeBooking("pending"),
        onError: (err) => {
          setStage("idle"); setSubmitting(false);
          setError(new Error("Pembayaran error: " + (err?.status_message || JSON.stringify(err))));
        },
        onClose: () => {
          // User closed popup — booking is still in pending_payment state
          // (seats remain held until backend expires them).
          // Poll a few times in case payment did go through.
          finalizeBooking("closed");
        },
      });
    } catch (e) {
      setError(e); setStage("idle"); setSubmitting(false);
    }
  };

  // UI label per stage
  const submitLabel = stage === "booking" ? "Membuat booking…"
                    : stage === "paying"  ? "Membuka pembayaran…"
                    : stage === "polling" ? "Mengonfirmasi pembayaran…"
                    : "Bayar Sekarang";

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
        {stage === "polling" && (
          <div style={{ marginTop: 12, fontSize: 11, color: C.dim, textAlign: "center" }}>
            ⏳ Verifikasi backend (max 30 detik) — defense layer anti "paid tapi tiket tidak keluar".
          </div>
        )}
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
          <Row label="📅 Jadwal" value={`${fmtDate(showtime.show_date)} · ${showtime.start_time}`} />
          <Row label="🎬 Studio" value={`${showtime.studio_name} · ${showtime.format || "2D"}`} />
          <Row label="💺 Kursi" value={`${seats.length} kursi · ${seats.sort().join(", ")}`} />
          {bundlesMeta && Object.entries(bundlesCart || {}).map(([bid, q]) => {
            const b = bundlesMeta.find(x => String(x.id) === String(bid));
            return b ? <Row key={bid} label={`🍿 ${b.name}`} value={`${q}× · ${rp(b.price * q)}`} /> : null;
          })}
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

// ════════════════════════════════════════════════════════════════════
// STEP 6: SUCCESS
// ════════════════════════════════════════════════════════════════════
function SuccessPage({ booking, film, showtime, seats, bundlesCart, onNewBooking, brandPrimary }) {
  const ticketCode = booking?.ticket_code || booking?.code || booking?.order_id || booking?.id;
  // booking response may include bundles_total — prefer server-computed total
  const total = booking?.total || (seats.length * (showtime.price || 0));
  const hasBundles = bundlesCart && Object.keys(bundlesCart).length > 0;
  const paymentStatus = booking?._payment_status || "unknown";  // 'paid' | 'pending_verification'
  const isPaid = paymentStatus === "paid";

  return (
    <div style={{ padding: "40px 0 60px", maxWidth: 540, margin: "0 auto", textAlign: "center" }}>
      <div style={{
        width: 80, height: 80, margin: "0 auto 20px",
        borderRadius: "50%", background: isPaid ? "rgba(16,185,129,0.15)" : "rgba(251,191,36,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 40,
      }}>{isPaid ? "✓" : "⏳"}</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, margin: 0, marginBottom: 8, color: isPaid ? "#10b981" : "#fbbf24" }}>
        {isPaid ? "Pembayaran Sukses!" : "Pembayaran Sedang Diverifikasi"}
      </h1>
      <p style={{ fontSize: 13, color: C.sub, margin: 0, marginBottom: 24 }}>
        {isPaid
          ? "Tiket sudah dibooking + dibayar. Tunjukkan kode tiket di counter atau scan QR di pintu studio."
          : "Pembayaran Anda belum tercatat sistem dalam 30 detik. Kalau Anda sudah bayar, tiket TETAP TERSIMPAN — staff counter bisa verifikasi pembayaran via Midtrans dashboard pakai kode tiket di bawah."}
      </p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 20, textAlign: "left" }}>
        <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>KODE TIKET</div>
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Geist Mono',monospace", color: brandPrimary, marginBottom: 16 }}>{ticketCode}</div>

        {/* Outlet ditampilkan prominent — anti cross-outlet contamination */}
        {booking?._client_outlet && (
          <div style={{
            background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.3)",
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

      <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 20, fontSize: 12, color: "#fbbf24", textAlign: "left" }}>
        ⏰ <strong>Penting:</strong> Datang minimal 15 menit sebelum jadwal. Pembayaran dilakukan di counter — tunjukkan kode tiket di atas.
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onNewBooking} style={{
          flex: 1, padding: "12px",
          background: "transparent", border: `1px solid ${C.border}`, color: C.text,
          borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>+ Booking Lagi</button>
        {ticketCode && (
          <a href={`/?ticket=${ticketCode}`} target="_blank" rel="noopener noreferrer" style={{
            flex: 1, padding: "12px",
            background: brandPrimary, border: "none", color: "#fff",
            borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            textDecoration: "none", textAlign: "center",
            boxShadow: `0 6px 16px ${brandPrimary}55`,
          }}>🎫 Lihat E-Tiket</a>
        )}
      </div>
    </div>
  );
}
