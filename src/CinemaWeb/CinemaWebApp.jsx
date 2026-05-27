// src/CinemaWeb/CinemaWebApp.jsx
// karyaOS — Cinema Web Booking (customer-facing, mobile + desktop)
// Route: /?movies=1
// Flow: outlet pick → films grid → showtime → seats → checkout → success
//
// Reuses backend /api/cinema/* (films, showtimes, seats, tickets).
// Premium dark theme, brand-aware via /api/companies/branding.

import { useState, useEffect, useMemo, useCallback } from "react";
import API_HOST from "../apiBase.js";
import { fmtMoney as rp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";
import { ErrorInline } from "../components/ConnectionError.jsx";

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

const STEPS = ["outlet", "films", "showtime", "seats", "checkout", "success"];

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
            onConfirm={(picked) => { setSeats(picked); goTo("checkout"); }}
            brandPrimary={brandPrimary} />
        )}
        {step === "checkout" && (
          <Checkout outlet={outlet} film={film} showtime={showtime} seats={seats}
            onBooked={(b) => { setBooking(b); goTo("success"); }}
            brandPrimary={brandPrimary} />
        )}
        {step === "success" && booking && (
          <SuccessPage booking={booking} film={film} showtime={showtime} seats={seats}
            onNewBooking={() => { setFilm(null); setShowtime(null); setSeats([]); setBooking(null); goTo("films"); }}
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
          <button onClick={onResetOutlet} style={{
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
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`${API_HOST}/api/outlet-master`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        const list = Array.isArray(d) ? d : (d.outlets || d.data || []);
        const cinemaOutlets = list.filter(o =>
          (o.primary_vertical === "cinema" || o.vertical === "cinema") &&
          (o.status !== "inactive")
        );
        setOutlets(cinemaOutlets);
      })
      .catch(e => setError(e));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorInline error={error} label="Gagal memuat lokasi" onRetry={load} />;
  if (!outlets) return <LoadingState label="Memuat lokasi bioskop…" />;

  return (
    <div style={{ padding: "60px 0 40px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, margin: 0, marginBottom: 10 }}>
          Pilih Lokasi Bioskop
        </h1>
        <p style={{ fontSize: 14, color: C.sub, maxWidth: 480, margin: "0 auto" }}>
          Tiket online untuk lokasi {outlets.length} kota. Pilih bioskop untuk lihat film & jadwal hari ini.
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))", gap: 16 }}>
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
// STEP 3: SHOWTIMES (placeholder — implemented next)
// ════════════════════════════════════════════════════════════════════
function ShowtimesList({ outlet, film, onPickShowtime, brandPrimary }) {
  return (
    <div style={{ padding: 40, textAlign: "center", color: C.dim }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎟️</div>
      <div>Showtimes list — coming next iteration</div>
      <div style={{ marginTop: 12, fontSize: 12 }}>Film: {film?.title} @ {outlet?.code}</div>
    </div>
  );
}

function SeatPicker({ showtime, film, initialSeats, onConfirm, brandPrimary }) {
  return <div style={{ padding: 40, textAlign: "center", color: C.dim }}>Seat picker — TBD</div>;
}

function Checkout({ outlet, film, showtime, seats, onBooked, brandPrimary }) {
  return <div style={{ padding: 40, textAlign: "center", color: C.dim }}>Checkout — TBD</div>;
}

function SuccessPage({ booking, film, showtime, seats, onNewBooking, brandPrimary }) {
  return <div style={{ padding: 40, textAlign: "center", color: C.dim }}>Success — TBD</div>;
}
