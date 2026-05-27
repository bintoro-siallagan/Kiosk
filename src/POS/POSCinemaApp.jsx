// karyaOS — POS Cinema (cashier sells tickets at front desk)
// MacBook-premium enterprise aesthetic. Same shift gate as POS F&B.
//
// Flow: pick showtime → seat map → bundles (optional) → checkout → success
//
// Endpoints:
//   GET /api/cinema/showtimes (today/upcoming)
//   GET /api/cinema/showtimes/:id/seats
//   GET /api/cinema/bundles
//   POST /api/cinema/tickets { showtime_id, seats[], bundles[], buyer, payment }

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import POSKasirLogin from "./POSKasirLogin.jsx";
import ShiftGate from "../ShiftGate.jsx";
import POSChecklist from "./POSChecklist.jsx";
import { LoadingState } from "../components/uiKit.jsx";
import { ErrorInline } from "../components/ConnectionError.jsx";
import QRCode from "qrcode";
import { HelpButton } from "../components/HelpModal.jsx";
import TouchNumpad, { showNumpad } from "../components/TouchNumpad.jsx";
import UpsellTicker from "../components/UpsellTicker.jsx";
import API_HOST from "../apiBase.js";


// Track CDS window reference across re-renders
let cinemaCdsWindowRef = null;

async function openCinemaCDSOnSecondScreen() {
  if (cinemaCdsWindowRef && !cinemaCdsWindowRef.closed) {
    cinemaCdsWindowRef.focus();
    return cinemaCdsWindowRef;
  }
  const base = window.location.origin + window.location.pathname.replace(/\/?$/, "/");
  const cdsUrl = `${base}?cinema-cds`;

  let position = "";
  try {
    if ("getScreenDetails" in window) {
      const screenDetails = await window.getScreenDetails();
      const secondary = screenDetails.screens.find(s => !s.isPrimary);
      if (secondary) {
        position = `left=${secondary.availLeft},top=${secondary.availTop},width=${secondary.availWidth},height=${secondary.availHeight}`;
      }
    }
  } catch {}
  if (!position) position = `left=${window.screen.width},top=0,width=1920,height=1080`;

  const features = `${position},toolbar=no,menubar=no,location=no,status=no,scrollbars=yes`;
  cinemaCdsWindowRef = window.open(cdsUrl, "KaryaOSCinemaCDS", features);
  if (!cinemaCdsWindowRef) {
    alert(`Popup diblok! Allow popup untuk ${window.location.hostname} di browser settings, lalu coba lagi.`);
    return null;
  }
  cinemaCdsWindowRef.focus();
  return cinemaCdsWindowRef;
}

// Module-level — expose posLogout helper imediately on import (no component mount needed)
// Call from DevTools console anywhere: posLogout()
if (typeof window !== "undefined") {
  window.posLogout = () => {
    ["posCashier", "posCinemaCashier", "cashier", "currentUser", "user"].forEach(k => {
      try { sessionStorage.removeItem(k); } catch {}
      try { localStorage.removeItem(k); } catch {}
    });
    window.location.replace(window.location.pathname + "?pos-cinema&fresh=1");
  };
}

// ═══════════════════════════════════════════════════════════════════
// THEME — MacBook-premium cinema palette
// ═══════════════════════════════════════════════════════════════════
const TH = {
  bg: "linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)",
  mesh: "radial-gradient(900px 700px at 20% 5%, rgba(168,85,247,0.07), transparent 60%), radial-gradient(700px 500px at 85% 80%, color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent), transparent 60%)",
  panel: "linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.005))",
  panelGlass: "rgba(13,17,23,0.72)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderHover: "1px solid rgba(255,255,255,0.12)",
  borderActive: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent)",
  amber: "#f59e0b",
  amberLight: "#fbbf24",
  purple: "#a855f7",
  cyan: "#22d3ee",
  green: "#10b981",
  red: "#ef4444",
  text: "#e6edf3",
  sub: "#9ca3af",
  dim: "#5b6470",
  // Shadows
  shadowCard: "0 4px 12px rgba(0,0,0,0.4), 0 12px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05)",
  shadowHover: "0 8px 24px rgba(0,0,0,0.5), 0 16px 56px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
  shadowSelected: "0 0 0 1px color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 18%, transparent)",
  shadowCTA: "0 6px 20px color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent), inset 0 1px 0 rgba(255,255,255,0.2)",
};

import { fmtMoney as rp } from "../lib/currency.js";
const fmtK = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "jt" : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(Math.round(n) || 0);

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function POSCinemaApp() {
  // Force-login support — clear ALL auth keys kalau ?fresh=1 atau ?login=1
  // Plus expose window.posLogout() emergency helper
  const [cashier, setCashier] = useState(() => {
    try {
      const url = new URL(window.location.href);
      const force = url.searchParams.get("fresh") === "1" || url.searchParams.get("login") === "1";
      if (force) {
        // Nuclear clear — kasir-related keys di session DAN localStorage
        ["posCashier", "posCinemaCashier", "cashier", "currentUser", "user"].forEach(k => {
          try { sessionStorage.removeItem(k); } catch {}
          try { localStorage.removeItem(k); } catch {}
        });
        url.searchParams.delete("fresh");
        url.searchParams.delete("login");
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
        console.log("[POSCinema] Force-login: cleared all cashier keys");
        return null;
      }
      const raw = sessionStorage.getItem("posCashier");
      const parsed = raw ? JSON.parse(raw) : null;
      // Validate — kalau bukan object dengan name, treat as invalid
      if (parsed && typeof parsed === "object" && parsed.name) return parsed;
      return null;
    } catch (e) {
      console.warn("[POSCinema] cashier init err:", e);
      return null;
    }
  });

  // Emergency global helper — bisa dipanggil dari DevTools console: window.posLogout()
  useEffect(() => {
    window.posLogout = () => {
      ["posCashier", "posCinemaCashier", "cashier", "currentUser", "user"].forEach(k => {
        try { sessionStorage.removeItem(k); } catch {}
        try { localStorage.removeItem(k); } catch {}
      });
      window.location.replace(window.location.pathname + "?pos-cinema&fresh=1");
    };
    return () => { delete window.posLogout; };
  }, []);
  const [stage, setStage] = useState("home"); // home | sell | pay | success
  const [picked, setPicked] = useState(null); // showtime obj
  const [seats, setSeats] = useState([]);     // selected seats
  const [bundles, setBundles] = useState([]); // selected bundles [{id, qty, ...}]
  const [seatData, setSeatData] = useState(null); // {rows, cols, seat_map, sold, held_by_others}
  const [liveTotals, setLiveTotals] = useState(null); // {ticketSubtotal, bundleSubtotal, total} dari Sell stage
  const [liveDiscount, setLiveDiscount] = useState(null); // {amount, type, code} dari Pay stage — broadcast ke CDS
  const [checklist, setChecklist] = useState(null);   // null=loading, {opening,closing}=loaded
  const [closingChecklist, setClosingChecklist] = useState(false);

  // Reload checklist status whenever cashier logged in
  const reloadChecklist = useCallback(() => {
    fetch(`${API_HOST}/api/checklist/status`).then(r => r.json()).then(setChecklist).catch(() => setChecklist({ opening: { done: true }, closing: { done: true } }));
  }, []);
  useEffect(() => { if (cashier) reloadChecklist(); }, [cashier, reloadChecklist]);
  const [buyer, setBuyer] = useState({ name: "", phone: "", email: "" });
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [saleData, setSaleData] = useState(null); // intermediate buat payment stage
  const [lastSale, setLastSale] = useState(null);

  // Full-screen — escape global zoom + root cap
  useEffect(() => {
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.width = "100%"; root.style.padding = "0"; }
    document.documentElement.style.zoom = "1";
    return () => { if (root) { root.style.maxWidth = ""; root.style.width = ""; root.style.padding = ""; } };
  }, []);

  const handleLogin = (kasir) => {
    sessionStorage.setItem("posCashier", JSON.stringify(kasir));
    setCashier(kasir);
  };
  const handleLogout = () => {
    // Closing checklist wajib kalau opening sudah done tapi closing belum
    if (checklist && checklist.opening?.done && !checklist.closing?.done) {
      setClosingChecklist(true);
      return;
    }
    sessionStorage.removeItem("posCashier"); setCashier(null); setStage("home");
  };
  const forceLogout = () => { sessionStorage.removeItem("posCashier"); setCashier(null); setStage("home"); };

  const resetSale = () => {
    setPicked(null); setSeats([]); setBundles([]);
    setBuyer({ name: "", phone: "", email: "" });
    setPaymentMethod("cash"); setSaleData(null);
    setStage("home");
  };

  // Sell stage submit → save totals, move to pay stage (no submit yet)
  const proceedToPay = (totals) => { setSaleData(totals); setStage("pay"); };
  const onSold = (ticketResult) => { setLastSale(ticketResult); setStage("success"); };

  // ── CDS broadcast — kirim state ke /?cinema-cds setiap perubahan ──
  const broadcastCds = useCallback((extra = {}) => {
    let payload = { stage: "idle", outlet: (new URLSearchParams(window.location.search).get("outlet") || ""), ...extra };
    if (picked && (stage === "sell" || stage === "pay" || stage === "success")) {
      payload = {
        ...payload,
        // pay stage HARUS broadcast 'pay' even kalau qrUrl belum siap — CDS show waiting card
        stage: stage === "pay" ? "pay" : stage === "success" ? "done" : "selling",
        film_title: picked.film_title,
        film_id: picked.film_id,
        poster_url: picked.poster_url,
        genre: picked.genre,
        duration_min: picked.duration_min,
        rating: picked.film_rating || picked.rating,
        studio_name: picked.studio_name,
        show_date: picked.show_date,
        start_time: picked.start_time,
        format: picked.format,
        paymentMethod: paymentMethod, // user-selected method (broadcast langsung)
        cashier_name: cashier?.name || null, // untuk feedback QR rate kasir
        seats: [...(seats || [])],
        bundles: (bundles || []).map(b => ({ name: b.name, qty: b.qty, price: b.price })),
        purchase_id: lastSale?.purchase_id,
        // Saat sell stage pakai liveTotals (running total), saat pay+success pakai saleData
        seats_total: saleData?.ticketSubtotal ?? liveTotals?.ticketSubtotal ?? 0,
        bundles_total: saleData?.bundleSubtotal ?? liveTotals?.bundleSubtotal ?? 0,
        gross_total: saleData?.total ?? liveTotals?.total ?? 0,
        discount: liveDiscount,
        // Final total = gross - discount.amount
        total: Math.max(0, (saleData?.total ?? liveTotals?.total ?? 0) - (liveDiscount?.amount || 0)),
        // Seat map info — biar CDS bisa render seat grid yang sama
        seat_data: seatData ? {
          rows: seatData.rows,
          cols: seatData.cols,
          seat_map: seatData.seat_map,
          sold: seatData.sold || [],
          held_by_others: seatData.held_by_others || [],
        } : null,
        ...extra,
      };
    }
    fetch(`${API_HOST}/api/cinema/cds/state`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, [picked, stage, seats, bundles, saleData, seatData, liveTotals, liveDiscount, paymentMethod, lastSale]);

  // Broadcast saat stage / picked / seats / bundles berubah
  useEffect(() => { broadcastCds(); }, [broadcastCds]);

  // Reset CDS state saat keluar dari sale (resetSale di-call)
  useEffect(() => {
    if (stage === "home") {
      fetch(`${API_HOST}/api/cinema/cds/state`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "idle", outlet: (new URLSearchParams(window.location.search).get("outlet") || "") }),
      }).catch(() => {});
    }
  }, [stage]);

  if (!cashier) return <POSKasirLogin apiBase={API_HOST} onSelectKasir={handleLogin} />;

  // GATE: opening checklist WAJIB kelar sebelum kasir bisa transaksi
  if (checklist && !checklist.opening?.done) {
    return <POSChecklist type="opening" apiBase={API_HOST} cashier={cashier} onDone={reloadChecklist} />;
  }

  return (
    <ShiftGate cashier={cashier} onSwitchCashier={handleLogout}>
      <TouchNumpad />
      <div style={S.root}>
        <style>{CSS}</style>
        <div style={S.mesh} aria-hidden />
        <TopBar cashier={cashier} stage={stage} onLogout={handleLogout} onHome={resetSale} />
        <UpsellTicker vertical="cinema" />

        {stage === "home" && (
          <>
            <Home onPick={(st) => { setPicked(st); setStage("sell"); }} />
            {/* Floating button: buka Customer Display di layar kedua */}
            <button
              onClick={openCinemaCDSOnSecondScreen}
              title="Open Customer Display on second screen (TV)"
              onMouseEnter={(e) => { e.currentTarget.style.background = "#a855f7"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.transform = "translateX(-50%) translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(168,85,247,0.1)"; e.currentTarget.style.color = "#c084fc"; e.currentTarget.style.transform = "translateX(-50%) translateY(0)"; }}
              style={{
                position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
                zIndex: 1000, padding: "14px 28px",
                background: "rgba(168,85,247,0.1)", color: "#c084fc",
                border: "2px solid #a855f7", borderRadius: 100,
                fontWeight: 800, fontSize: 14, letterSpacing: 0.5, fontFamily: "inherit",
                cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.4), 0 0 0 4px rgba(168,85,247,0.1)",
                display: "flex", alignItems: "center", gap: 10,
                backdropFilter: "blur(8px)", transition: "all 0.2s ease", whiteSpace: "nowrap",
              }}
            >
              <span style={{ fontSize: 18 }}>📺</span> Buka Layar Pelanggan
            </button>
            <HelpButton helpKey="pos-cinema" position="bottom-right" />
          </>
        )}
        {stage === "sell" && picked && (
          <Sell
            picked={picked}
            seats={seats} setSeats={setSeats}
            bundles={bundles} setBundles={setBundles}
            buyer={buyer} setBuyer={setBuyer}
            paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
            cashier={cashier}
            onCancel={resetSale}
            onProceed={proceedToPay}
            onSeatData={setSeatData}
            onLiveTotals={setLiveTotals}
          />
        )}
        {stage === "pay" && picked && saleData && (
          <Pay
            picked={picked}
            saleData={saleData}
            paymentMethod={paymentMethod}
            buyer={buyer}
            setBuyer={setBuyer}
            cashier={cashier}
            onBack={() => setStage("sell")}
            onPaid={onSold}
            onDiscountChange={setLiveDiscount}
          />
        )}
        {stage === "success" && lastSale && (
          <Success sale={lastSale} onAnother={resetSale} />
        )}
      </div>
      {closingChecklist && (
        <POSChecklist
          type="closing"
          apiBase={API_HOST}
          cashier={cashier}
          onDone={() => { setClosingChecklist(false); reloadChecklist(); forceLogout(); }}
        />
      )}
    </ShiftGate>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TOP BAR
// ═══════════════════════════════════════════════════════════════════
function TopBar({ cashier, stage, onLogout, onHome }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <div style={S.topbar} className="topbar-glass">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, filter: "drop-shadow(0 0 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent))" }}>🎬</div>
        <div>
          <div style={{ fontSize: 19, fontWeight: 750, color: "#fff", letterSpacing: -0.4 }}>POS Cinema</div>
          <div style={{ fontSize: 9.5, color: TH.dim, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>karyaOS · Ticketing Counter</div>
        </div>
        {stage !== "home" && (
          <button onClick={onHome} className="ghost-btn" style={S.ghostBtn}>← Home</button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.3 }}>
            {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div style={{ fontSize: 11, color: TH.sub, marginTop: 2 }}>
            {now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" })}
          </div>
        </div>
        <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.08)" }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11.5, color: TH.sub }}>Cashier</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff" }}>{cashier?.name || "—"}</div>
        </div>
        <button onClick={async () => {
          if (!window.confirm("TUTUP HARI?\n\nShift aktif ikut ditutup. Customer tidak bisa beli tiket sampai Manager 'Open Day' lagi. Pastikan semua transaksi cinema today sudah ditutup.")) return;
          try {
            const r = await fetch('/api/day/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ by: cashier?.name || 'Manager Cinema' }) });
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error || 'Gagal tutup hari');
            alert('✅ Hari berhasil ditutup.\nCinema sekarang offline sampai Manager buka hari berikutnya.');
            if (onLogout) onLogout();
          } catch (e) { alert('⚠ ' + e.message); }
        }} className="ghost-btn" style={{
          ...S.ghostBtn,
          background: "rgba(168,85,247,0.10)",
          border: "1px solid rgba(168,85,247,0.35)",
          color: "#c084fc",
          fontWeight: 700,
          padding: "9px 14px",
        }}>🌙 Close Day</button>
        <button onClick={onLogout} className="ghost-btn" style={{
          ...S.ghostBtn,
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.35)",
          color: "#fca5a5",
          fontWeight: 700,
          padding: "9px 16px",
        }}>↻ Logout</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// HOME — showtime grid (today)
// ═══════════════════════════════════════════════════════════════════
function Home({ onPick }) {
  const [showtimes, setShowtimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("today"); // today | upcoming | all
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`${API_HOST}/api/cinema/showtimes`).then(r => r.json())
      .then(d => setShowtimes(d.showtimes || []))
      .catch(() => setShowtimes([]))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const list = useMemo(() => {
    let arr = showtimes;
    if (filter === "today") arr = arr.filter(s => s.show_date === today);
    else if (filter === "upcoming") arr = arr.filter(s => s.show_date >= today);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(s => (s.film_title || "").toLowerCase().includes(q) || (s.studio_name || "").toLowerCase().includes(q));
    }
    return arr.sort((a, b) => (a.show_date + a.start_time).localeCompare(b.show_date + b.start_time));
  }, [showtimes, filter, search, today]);

  return (
    <div style={S.content}>
      <div style={S.section}>
        <div style={S.sectionTitle}>JADWAL TAYANG</div>
        <div style={S.sectionSub}>Pick a showtime to start selling tickets</div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
          {[["today", "Hari Ini"], ["upcoming", "Mendatang"], ["all", "Semua"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className="pill-btn"
              style={{ ...S.pill, ...(filter === k ? S.pillActive : {}) }}>{l}</button>
          ))}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Cari film / studio…"
            className="premium-input"
            style={{ ...S.input, width: 280, marginLeft: "auto" }}
          />
        </div>
      </div>

      {loading ? (
        <LoadingState label="Memuat jadwal…" />
      ) : list.length === 0 ? (
        <div style={{ ...S.emptyCard }}>
          <div style={{ fontSize: 38, marginBottom: 8 }}>🎬</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TH.text }}>No showtimes</div>
          <div style={{ fontSize: 12, color: TH.sub, marginTop: 4 }}>No showtimes available for this filter.</div>
        </div>
      ) : (
        <div style={S.grid}>
          {list.map(st => <ShowtimeCard key={st.id} st={st} onPick={() => onPick(st)} />)}
        </div>
      )}
    </div>
  );
}

function ShowtimeCard({ st, onPick }) {
  const pct = st.capacity ? Math.round(((st.sold || 0) / st.capacity) * 100) : 0;
  const remaining = (st.capacity || 0) - (st.sold || 0);
  const isFull = remaining <= 0;
  const status = st.derived_status || "scheduled";
  const statusMeta = {
    scheduled: { c: TH.green, l: "TERSEDIA" },
    running: { c: TH.amber, l: "BERLANGSUNG" },
    closed: { c: TH.dim, l: "TUTUP" },
    sold_out: { c: TH.red, l: "SOLD OUT" },
    cancelled: { c: TH.red, l: "DIBATALKAN" },
  }[status] || { c: TH.dim, l: "—" };

  // Bisa jual saat 'scheduled' (belum mulai) ATAU 'running' (sedang tayang,
  // late entry). Tidak bisa jual saat 'closed' / 'sold_out' / 'cancelled'.
  const sellable = (status === "scheduled" || status === "running") && !isFull;

  return (
    <button onClick={sellable ? onPick : null} disabled={!sellable}
      className="showtime-card"
      style={{
        ...S.card,
        cursor: sellable ? "pointer" : "not-allowed",
        opacity: sellable ? 1 : 0.55,
        textAlign: "left",
        padding: 0,
        overflow: "hidden",
        position: "relative",
      }}>
      {/* Accent gradient strip */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${statusMeta.c}, transparent)`, opacity: 0.7 }} />
      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* Poster thumbnail — biar kasir gak salah klik */}
          {st.poster_url ? (
            <img src={st.poster_url} alt="" style={{ width: 70, height: 105, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: `1px solid ${statusMeta.c}33`, boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }} />
          ) : (
            <div style={{ width: 70, height: 105, background: "linear-gradient(135deg,#1e1b4b,#0a0e16)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0 }}>🎞️</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: statusMeta.c, fontWeight: 700, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>{statusMeta.l}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginTop: 6, letterSpacing: -0.4, lineHeight: 1.2 }}>{st.film_title || "—"}</div>
                <div style={{ fontSize: 12, color: TH.sub, marginTop: 6 }}>{st.studio_name || "—"} · {st.show_date}</div>
                <div style={{ fontSize: 18, color: TH.amber, marginTop: 4, fontFamily: "'Geist Mono',monospace", fontWeight: 800, letterSpacing: -0.4 }}>🕐 {st.start_time}</div>
              </div>
              {st.rating && (
                <span style={{
                  fontSize: 10, fontWeight: 800, color: ratingColor(st.rating), padding: "4px 9px",
                  background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
                  border: `1px solid ${ratingColor(st.rating)}66`, borderRadius: 6, flexShrink: 0,
                }}>{st.rating}</span>
              )}
            </div>
          </div>
        </div>

        {/* Capacity bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TH.sub, marginBottom: 5 }}>
            <span>Okupansi <b style={{ color: "#fff" }}>{pct}%</b></span>
            <span style={{ color: isFull ? TH.red : sellable ? TH.green : TH.dim, fontWeight: 700 }}>
              {isFull ? "Sold out" : `${remaining} seats`}
            </span>
          </div>
          <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`,
              background: pct >= 80 ? "linear-gradient(90deg,#ef4444,#f97316)" : pct >= 50 ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : "linear-gradient(90deg,#10b981,#22d3ee)",
              borderRadius: 3, transition: "width 0.4s ease",
            }} />
          </div>
        </div>

        {/* Price + CTA */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: TH.dim, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace" }}>HARGA</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: "'Geist Mono',monospace", marginTop: 2, letterSpacing: -0.3 }}>{rp(st.price)}</div>
          </div>
          {sellable && (
            <div style={{ fontSize: 11, color: TH.amber, fontWeight: 700, letterSpacing: 0.5 }}>JUAL TIKET →</div>
          )}
        </div>
      </div>
    </button>
  );
}

const ratingColor = (r) => ({ SU: TH.green, "13+": TH.cyan, "17+": TH.amber, D21: TH.red, "21+": TH.red }[r] || TH.dim);

// ═══════════════════════════════════════════════════════════════════
// SELL — seat map + bundles + checkout
// ═══════════════════════════════════════════════════════════════════
function Sell({ picked, seats, setSeats, bundles, setBundles, buyer, setBuyer, paymentMethod, setPaymentMethod, cashier, onCancel, onProceed, onSeatData, onLiveTotals }) {
  const [seatData, setSeatData] = useState(null);
  const [bundleList, setBundleList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [seatsError, setSeatsError] = useState(null);

  const loadSeats = useCallback(() => {
    fetch(`${API_HOST}/api/cinema/showtimes/${picked.id}/seats`)
      .then(r => { if (!r.ok) throw new Error(`seats ${r.status}`); return r.json(); })
      .then(d => { setSeatData(d); setSeatsError(null); onSeatData && onSeatData(d); })
      .catch(e => setSeatsError(e));
  }, [picked.id]);
  useEffect(() => { loadSeats(); const iv = setInterval(loadSeats, 10000); return () => clearInterval(iv); }, [loadSeats]);

  useEffect(() => {
    const outlet = new URLSearchParams(window.location.search).get("outlet") || "";
    fetch(`${API_HOST}/api/cinema/bundles${outlet ? `?outlet=${encodeURIComponent(outlet)}` : ""}`).then(r => r.json()).then(d => setBundleList(d.bundles || [])).catch(() => {});
  }, []);

  // Sub-step within Sell: seats → concession → (proceed to pay)
  const [subStep, setSubStep] = useState("seats"); // 'seats' | 'concession'

  const toggle = (seat) => {
    if (!seatData) return;
    if (seatData.sold.includes(seat)) return;
    setSeats(p => p.includes(seat) ? p.filter(s => s !== seat) : [...p, seat]);
  };

  const setBundleQty = (b, qty) => {
    setBundles(p => {
      const idx = p.findIndex(x => x.id === b.id);
      if (qty <= 0) return p.filter(x => x.id !== b.id);
      if (idx >= 0) return p.map((x, i) => i === idx ? { ...x, qty } : x);
      return [...p, { id: b.id, name: b.name, price: b.price, qty }];
    });
  };

  // Per-seat-type pricing kalau seatData.seat_type_prices ada, else fallback flat showtime price
  const ticketSubtotal = useMemo(() => {
    if (!seatData) return seats.length * (picked.price || 0);
    const prices = seatData.seat_type_prices;
    if (!prices) return seats.length * (picked.price || 0);
    // Build seat→type map dari seat_map
    const typeMap = {};
    if (Array.isArray(seatData.seat_map)) {
      for (const row of seatData.seat_map) for (const cell of (row || [])) {
        if (cell && cell.label && cell.type && cell.type !== "void") typeMap[cell.label] = cell.type;
      }
    }
    return seats.reduce((sum, s) => {
      const t = typeMap[s] || "regular";
      return sum + (prices[t] != null ? prices[t] : (picked.price || 0));
    }, 0);
  }, [seats, seatData, picked.price]);
  const bundleSubtotal = bundles.reduce((s, b) => s + (b.price || 0) * (b.qty || 0), 0);
  const total = ticketSubtotal + bundleSubtotal;

  // Live broadcast totals ke parent → CDS receives running bill summary
  useEffect(() => {
    if (onLiveTotals) onLiveTotals({ ticketSubtotal, bundleSubtotal, total });
  }, [ticketSubtotal, bundleSubtotal, total, onLiveTotals]);

  const submit = () => {
    if (!seats.length) { setMsg("⚠ Pilih minimal 1 kursi"); return; }
    // Lanjut ke pay stage — submit ticket POST happens at Pay stage setelah
    // user konfirmasi pembayaran. Bawa snapshot seats+bundles biar Pay stage
    // bisa POST tanpa dependency parent state.
    onProceed({ ticketSubtotal, bundleSubtotal, total, seats: [...seats], bundles: bundles.map(b => ({ ...b })) });
  };

  if (seatsError) return <ErrorInline error={seatsError} label="Gagal memuat peta kursi" onRetry={loadSeats} />;
  if (!seatData) return <LoadingState label="Memuat peta kursi…" />;

  return (
    <div style={S.sellLayout}>
      {/* LEFT — staged content */}
      <div style={S.sellLeft}>
        {/* Header + stepper */}
        <div style={S.sellHeader}>
          <div>
            <div style={{ fontSize: 11, color: TH.dim, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>FILM</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.5, marginTop: 2 }}>{picked.film_title || "—"}</div>
            <div style={{ fontSize: 12.5, color: TH.sub, marginTop: 6 }}>
              {picked.studio_name} · {picked.show_date} · <b style={{ color: "#fff" }}>{picked.start_time}</b>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: TH.dim, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace" }}>HARGA TIKET</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: "'Geist Mono',monospace", marginTop: 2, letterSpacing: -0.3 }}>{rp(picked.price)}</div>
          </div>
        </div>

        {/* Sub-step indicator */}
        <div style={{ display: "flex", gap: 8, padding: "12px 4px", marginBottom: 4 }}>
          <button onClick={() => setSubStep("seats")} style={{
            flex: 1, padding: "10px 14px", borderRadius: 10,
            background: subStep === "seats" ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "rgba(255,255,255,0.03)",
            border: subStep === "seats" ? "none" : "1px solid rgba(255,255,255,0.08)",
            color: subStep === "seats" ? "#1a1205" : TH.sub,
            fontSize: 12.5, fontWeight: 800, letterSpacing: 0.3, fontFamily: "inherit", cursor: "pointer",
          }}>1. 🪑 PILIH KURSI {seats.length > 0 && <span style={{ opacity: 0.7 }}>· {seats.length}</span>}</button>
          <button onClick={() => seats.length > 0 && setSubStep("concession")} disabled={seats.length === 0} style={{
            flex: 1, padding: "10px 14px", borderRadius: 10,
            background: subStep === "concession" ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "rgba(255,255,255,0.03)",
            border: subStep === "concession" ? "none" : "1px solid rgba(255,255,255,0.08)",
            color: subStep === "concession" ? "#1a1205" : seats.length === 0 ? TH.dim : TH.sub,
            fontSize: 12.5, fontWeight: 800, letterSpacing: 0.3, fontFamily: "inherit",
            cursor: seats.length === 0 ? "not-allowed" : "pointer",
            opacity: seats.length === 0 ? 0.5 : 1,
          }}>2. 🍿 CONCESSION (OPSIONAL) {bundles.length > 0 && <span style={{ opacity: 0.7 }}>· {bundles.length}</span>}</button>
        </div>

        {/* Seat map — sub-step seats */}
        {subStep === "seats" && (
        <div style={S.seatPanel}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ height: 4, background: "linear-gradient(90deg,transparent 10%,#a855f7,transparent 90%)", borderRadius: 4 }} />
            <span style={{ fontSize: 10, color: TH.dim, letterSpacing: 4, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>L A Y A R</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "center" }}>
            {Array.from({ length: seatData.rows }).map((_, ri) => {
              const letter = String.fromCharCode(65 + ri);
              return (
                <div key={ri} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <span style={{ width: 18, fontSize: 11, color: TH.dim, fontFamily: "'Geist Mono',monospace" }}>{letter}</span>
                  {Array.from({ length: seatData.cols }).map((_, ci) => {
                    const seat = `${letter}${ci + 1}`;
                    const sold = seatData.sold.includes(seat);
                    const sel = seats.includes(seat);
                    return (
                      <button key={ci} onClick={() => toggle(seat)} disabled={sold} title={seat}
                        className="seat-btn"
                        style={{
                          width: 30, height: 30, borderRadius: 7,
                          background: sold ? "rgba(239,68,68,0.15)" : sel ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "rgba(255,255,255,0.04)",
                          border: sold ? "1px solid rgba(239,68,68,0.3)" : sel ? "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent)" : "1px solid rgba(255,255,255,0.08)",
                          color: sold ? "#ef4444" : sel ? "#1a1205" : TH.sub,
                          fontSize: 10, fontWeight: 800, fontFamily: "'Geist Mono',monospace",
                          cursor: sold ? "not-allowed" : "pointer",
                          boxShadow: sel ? "0 4px 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 35%, transparent)" : "none",
                          transition: "all 0.15s",
                        }}>{ci + 1}</button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 18, fontSize: 11, color: TH.sub, flexWrap: "wrap" }}>
            <Legend color="rgba(255,255,255,0.04)" border="rgba(255,255,255,0.08)" label="Tersedia" />
            <Legend color="linear-gradient(135deg,#f59e0b,#fbbf24)" border="color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent)" label="Selected" />
            <Legend color="rgba(239,68,68,0.15)" border="rgba(239,68,68,0.3)" label="Terjual" />
          </div>
          {/* CTA Lanjut */}
          {seats.length > 0 && bundleList.length > 0 && (
            <button onClick={() => setSubStep("concession")} style={{
              marginTop: 18, width: "100%", padding: "14px 22px",
              background: "linear-gradient(135deg,#a855f7,#c084fc)",
              border: "none", borderRadius: 12,
              color: "#fff", fontSize: 14, fontWeight: 900, letterSpacing: 0.5, cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 4px 16px rgba(168,85,247,0.3)",
            }}>🍿 LANJUT KE CONCESSION MENU →</button>
          )}
          {seats.length > 0 && bundleList.length === 0 && (
            <div style={{ marginTop: 12, padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: 12, color: TH.dim, textAlign: "center" }}>F&B menu kosong — lanjut langsung ke bayar via panel kanan.</div>
          )}
        </div>
        )}

        {/* Concession menu — sub-step concession */}
        {subStep === "concession" && bundleList.length > 0 && (
          <div style={S.bundlePanel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={S.subSectionTitle}>🍿 PILIH F&B CONCESSION</div>
              <button onClick={() => setSubStep("seats")} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: TH.sub, borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← Edit Kursi</button>
            </div>
            <div style={{ fontSize: 12, color: TH.sub, marginBottom: 14, padding: "8px 12px", background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: 8 }}>
              💡 Tambahkan popcorn/drink/snack ke pesanan customer. 1 bill mencakup tiket + F&B.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10, marginTop: 12 }}>
              {bundleList.map(b => {
                const sel = bundles.find(x => x.id === b.id);
                return (
                  <div key={b.id} className="bundle-card" style={{
                    ...S.card, padding: "12px 14px",
                    border: sel ? TH.borderActive : TH.border,
                    boxShadow: sel ? TH.shadowSelected : TH.shadowCard,
                  }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", lineHeight: 1.25, letterSpacing: -0.2 }}>{b.name}</div>
                    {b.description ? (
                      <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 5, lineHeight: 1.5, minHeight: 30 }}>{b.description}</div>
                    ) : (
                      <div style={{ minHeight: 30 }} />
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TH.amber, fontFamily: "'Geist Mono',monospace" }}>{rp(b.price)}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <button onClick={() => setBundleQty(b, (sel?.qty || 0) - 1)} disabled={!sel} className="qty-btn" style={{ ...S.qtyBtn, opacity: sel ? 1 : 0.4 }}>−</button>
                        <span style={{ minWidth: 22, textAlign: "center", fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#fff" }}>{sel?.qty || 0}</span>
                        <button onClick={() => setBundleQty(b, (sel?.qty || 0) + 1)} className="qty-btn" style={S.qtyBtn}>+</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT — checkout panel */}
      <div style={S.sellRight} className="checkout-glass">
        <div style={S.subSectionTitle}>RINGKASAN</div>

        {/* Selected seats */}
        <div style={{ marginTop: 14 }}>
          <div style={S.itemLabel}>Kursi ({seats.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, minHeight: 28 }}>
            {seats.length === 0 ? (
              <span style={{ fontSize: 11.5, color: TH.dim }}>belum ada kursi dipilih</span>
            ) : seats.sort().map(s => (
              <span key={s} style={{
                fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, fontFamily: "'Geist Mono',monospace",
                background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 30%, transparent)", color: TH.amberLight,
              }}>{s}</span>
            ))}
          </div>
        </div>

        {/* Bundle list */}
        {bundles.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={S.itemLabel}>Bundle</div>
            {bundles.map(b => (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginTop: 4 }}>
                <span style={{ color: TH.sub }}>{b.name} × {b.qty}</span>
                <span style={{ fontFamily: "'Geist Mono',monospace", color: "#fff" }}>{rp(b.price * b.qty)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Buyer info */}
        <div style={{ marginTop: 18 }}>
          <div style={S.itemLabel}>Pembeli (opsional)</div>
          <input value={buyer.name} onChange={e => setBuyer({ ...buyer, name: e.target.value })} placeholder="Nama" className="premium-input" style={{ ...S.input, marginBottom: 6 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <input value={buyer.phone} onChange={e => setBuyer({ ...buyer, phone: e.target.value })} placeholder="08xx" className="premium-input" style={S.input} />
            <input value={buyer.email} onChange={e => setBuyer({ ...buyer, email: e.target.value })} placeholder="email" className="premium-input" style={S.input} />
          </div>
        </div>

        {/* Payment method */}
        <div style={{ marginTop: 18 }}>
          <div style={S.itemLabel}>Payment Method</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              ["cash", "💵 Tunai"], ["debit", "💳 Debit"],
              ["qris", "📲 QRIS"], ["voucher", "🎟️ Voucher"],
            ].map(([k, l]) => (
              <button key={k} onClick={() => setPaymentMethod(k)}
                style={{
                  background: paymentMethod === k ? "color-mix(in srgb, var(--brand-primary,#FF6B35) 12%, transparent)" : "rgba(255,255,255,0.02)",
                  border: paymentMethod === k ? "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent)" : TH.border,
                  color: paymentMethod === k ? TH.amberLight : TH.sub,
                  padding: "9px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.15s",
                }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: TH.border }}>
          <Row label="Subtotal Tiket" value={rp(ticketSubtotal)} />
          {bundleSubtotal > 0 && <Row label="Subtotal F&B" value={rp(bundleSubtotal)} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <span style={{ fontSize: 12, color: TH.sub, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace" }}>TOTAL</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.6 }}>{rp(total)}</span>
          </div>
        </div>

        {msg && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: "#fca5a5", marginTop: 12 }}>{msg}</div>}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={onCancel} className="ghost-btn" style={{ ...S.ghostBtn, flex: 1, justifyContent: "center" }}>← Batal</button>
          <button onClick={submit} disabled={!seats.length || busy} className="primary-btn" style={{
            ...S.primaryBtn, flex: 2, opacity: seats.length && !busy ? 1 : 0.55, cursor: seats.length && !busy ? "pointer" : "not-allowed",
          }}>{busy ? "⏳ Memproses…" : "✓ KONFIRMASI & BAYAR"}</button>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, border, label }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: color, border: `1px solid ${border}` }} />
      <span>{label}</span>
    </span>
  );
}
function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: TH.sub, marginTop: 4 }}>
      <span>{label}</span>
      <span style={{ fontFamily: "'Geist Mono',monospace", color: "#fff", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAY — payment processing per method (cash/qris/debit/voucher)
// Submit tickets ke backend SETELAH payment confirmed.
// ═══════════════════════════════════════════════════════════════════
function Pay({ picked, saleData, paymentMethod, buyer, setBuyer, cashier, onBack, onPaid, onDiscountChange }) {
  const baseTotal = saleData.total;
  const [received, setReceived] = useState(0);
  const [refNo, setRefNo] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Apply discount — promo OR voucher dari backend
  const [discount, setDiscount] = useState({ amount: 0, type: null, code: null, info: null });
  const [discInput, setDiscInput] = useState("");
  const [discBusy, setDiscBusy] = useState(false);
  const total = Math.max(0, baseTotal - (discount.amount || 0));

  const applyCode = async () => {
    const code = String(discInput || "").trim().toUpperCase();
    if (!code) { setMsg("⚠ Masukkan kode promo / voucher"); return; }
    setDiscBusy(true); setMsg("");
    try {
      // 1) Coba voucher dulu
      const vRes = await fetch(`${API_HOST}/api/cinema/vouchers/lookup/${encodeURIComponent(code)}`);
      const vData = await vRes.json();
      if (vRes.ok && vData.ok) {
        const apply = Math.min(vData.value, baseTotal);
        setDiscount({ amount: apply, type: "voucher", code, info: vData.voucher });
        setMsg(`✓ Voucher applied · −Rp ${apply.toLocaleString("id-ID")}`);
        setDiscBusy(false); return;
      }
      // 2) Coba promo
      const pRes = await fetch(`${API_HOST}/api/cinema/promotions/active`);
      const pData = await pRes.json();
      const promo = (pData.promotions || []).find(p => (p.code || "").toUpperCase() === code);
      if (promo) {
        if (promo.min_purchase > 0 && baseTotal < promo.min_purchase) {
          setMsg(`⚠ Min purchase Rp ${promo.min_purchase.toLocaleString("id-ID")} belum tercapai`);
          setDiscBusy(false); return;
        }
        let disc = 0;
        if (promo.discount_type === "percentage") disc = Math.round(baseTotal * promo.discount_value / 100);
        else disc = Math.round(promo.discount_value);
        if (promo.max_discount && disc > promo.max_discount) disc = promo.max_discount;
        disc = Math.min(disc, baseTotal);
        setDiscount({ amount: disc, type: "promo", code, info: promo });
        setMsg(`✓ Promo "${promo.name}" applied · −Rp ${disc.toLocaleString("id-ID")}`);
        setDiscBusy(false); return;
      }
      setMsg(`⚠ Kode "${code}" tidak ditemukan (cek voucher/promo aktif)`);
    } catch (e) { setMsg("⚠ " + e.message); }
    setDiscBusy(false);
  };
  const clearDiscount = () => { setDiscount({ amount: 0, type: null, code: null, info: null }); setDiscInput(""); setMsg(""); };

  // Push discount changes to CDS (transparency)
  useEffect(() => {
    if (onDiscountChange) onDiscountChange(discount.amount > 0 ? { amount: discount.amount, type: discount.type, code: discount.code, name: discount.info?.name } : null);
  }, [discount, onDiscountChange]);

  // Active promos — quick-apply chips di Pay panel
  const [activePromos, setActivePromos] = useState([]);
  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/promotions/active`).then(r => r.json())
      .then(d => setActivePromos(d.promotions || [])).catch(() => {});
  }, []);
  const applyPromoChip = (p) => {
    if (p.min_purchase > 0 && baseTotal < p.min_purchase) {
      setMsg(`⚠ "${p.name}" butuh min Rp ${p.min_purchase.toLocaleString("id-ID")} (current ${rp(baseTotal)})`);
      return;
    }
    let disc = p.discount_type === "percentage" ? Math.round(baseTotal * p.discount_value / 100) : Math.round(p.discount_value);
    if (p.max_discount && disc > p.max_discount) disc = p.max_discount;
    disc = Math.min(disc, baseTotal);
    setDiscount({ amount: disc, type: "promo", code: p.code || p.name, info: p });
    setMsg(`✓ Promo "${p.name}" applied · −${rp(disc)}`);
  };
  const [qrisStarted, setQrisStarted] = useState(false);
  const [qrisData, setQrisData] = useState(null); // { qrUrl, qrString, midtransOrderId, deeplinkUrl }
  const [qrisLoading, setQrisLoading] = useState(false);
  const [qrisPaid, setQrisPaid] = useState(false);
  const qrisPollRef = useRef(null);

  // Auto-poll payment status saat QRIS generated
  useEffect(() => {
    if (!qrisData?.midtransOrderId || qrisPaid) return;
    const internalOrderId = qrisData.midtransOrderId.split("KaryaOS-")[1]?.split("-")[0];
    if (!internalOrderId) return;
    const refOrderId = qrisData.internalOrderId || `CINEMA-${Date.now()}`;
    qrisPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API_HOST}/api/payment/check/${refOrderId}`);
        const d = await r.json();
        if (d.paid) {
          setQrisPaid(true);
          clearInterval(qrisPollRef.current);
          submitTickets({ ref: refOrderId, qris_confirmed: true });
        }
      } catch {}
    }, 3000);
    return () => clearInterval(qrisPollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrisData, qrisPaid]);

  const generateQris = async () => {
    setQrisLoading(true);
    const internalOrderId = `CINEMA-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    try {
      const r = await fetch(`${API_HOST}/api/payment/qris`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: internalOrderId,
          amount: total,
          items: [{ n: `${picked?.film_title} × ${saleData?.seats?.length || 0} tiket`, p: total, q: 1, id: "cinema" }],
          customerName: buyer.name || "Counter sale",
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Gagal generate QRIS");
      const payload = { ...d, internalOrderId };
      setQrisData(payload);
      setQrisStarted(true);
      // Broadcast ke CDS dengan qrUrl
      try {
        fetch(`${API_HOST}/api/cinema/cds/state`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: "pay",
            film_title: picked?.film_title,
            poster_url: picked?.poster_url,
            studio_name: picked?.studio_name,
            show_date: picked?.show_date,
            start_time: picked?.start_time,
            seats: saleData?.seats || [],
            seats_total: saleData?.ticketSubtotal || 0,
            bundles_total: saleData?.bundleSubtotal || 0,
            total: total,
            qrUrl: d.qrUrl || d.qrString,
            outlet: (new URLSearchParams(window.location.search).get("outlet") || ""),
          }),
        });
      } catch {}
    } catch (e) {
      setMsg("⚠ " + e.message);
    }
    setQrisLoading(false);
  };

  const change = received - total;
  const cashEnough = received >= total;
  // Detect if payment ready to confirm
  const canConfirm = (() => {
    if (busy) return false;
    if (paymentMethod === "cash") return cashEnough;
    if (paymentMethod === "qris") return qrisStarted;
    if (paymentMethod === "debit" || paymentMethod === "voucher") return refNo.trim().length >= 4 || voucherCode.trim().length >= 4;
    return false;
  })();

  const submitTickets = async (paymentRef = {}) => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`${API_HOST}/api/cinema/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showtime_id: picked.id,
          // hack: take from saleData chain — but we passed sell-time arrays via state
          // simpler: pass through to backend, which infers from showtime+seats
          // saleData hanya berisi totals, so kita perlu retrieve sells dari parent.
          // → ambil dari parent via prop reference? No — passed via props.
          // Workaround: store seats/bundles in saleData too.
          seats: saleData.seats || [],
          bundles: (saleData.bundles || []).map(b => ({ id: b.id, qty: b.qty })),
          buyer: buyer.name ? `${buyer.name}${buyer.phone ? " · " + buyer.phone : ""}` : `Counter sale (${cashier?.name})`,
          buyer_phone: buyer.phone || null,
          buyer_email: buyer.email || null,
          email: buyer.email || null,
          payment_method: paymentMethod,
          payment_ref: paymentRef.ref || null,
          cash_received: paymentRef.cashReceived || null,
          cash_change: paymentRef.cashChange || null,
          cashier_name: cashier?.name,
          // Discount apply — voucher OR promo
          discount_code: discount?.code || null,
          discount_amount: discount?.amount || 0,
          discount_type: discount?.type || null,
          // Auto-member: kalau ada phone → backend create loyalty customer + earn points
          auto_member: !!buyer.phone,
        }),
      });
      const d = await res.json();
      if (d.error) { setMsg("⚠ " + d.error); setBusy(false); return; }
      onPaid({ ...d, picked, seats: saleData.seats, bundles: saleData.bundles, buyer, total, paymentMethod, paymentRef });
    } catch (e) {
      setMsg("⚠ " + e.message); setBusy(false);
    }
  };

  const confirm = () => {
    if (!canConfirm) return;
    if (paymentMethod === "cash") submitTickets({ cashReceived: received, cashChange: change });
    else if (paymentMethod === "qris") {
      if (qrisPaid) return; // auto-submit sudah handle via polling
      if (!qrisData) { setMsg("⚠ Generate QRIS dulu, customer scan, baru konfirmasi"); return; }
      submitTickets({ ref: qrisData.internalOrderId || ("QRIS-" + Date.now()), qris_manual_confirm: true });
    }
    else if (paymentMethod === "debit") submitTickets({ ref: refNo.trim() });
    else if (paymentMethod === "voucher") submitTickets({ ref: voucherCode.trim() });
  };

  const meta = {
    cash:    { emoji: "💵", label: "Cash",       color: "#10b981" },
    debit:   { emoji: "💳", label: "Debit/Kredit", color: "#3b82f6" },
    qris:    { emoji: "📲", label: "QRIS",        color: "#22d3ee" },
    voucher: { emoji: "🎟️", label: "Voucher",     color: "#fbbf24" },
  }[paymentMethod] || {};

  return (
    <div style={S.content}>
      <div style={{ maxWidth: 720, margin: "10px auto 100px", paddingBottom: 90 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <button onClick={onBack} className="ghost-btn" style={S.ghostBtn} disabled={busy}>← Batal / Ubah</button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: TH.dim, letterSpacing: 1.4, fontFamily: "'Geist Mono',monospace", fontWeight: 700, textTransform: "uppercase" }}>Payment</span>
            <span style={{
              padding: "5px 14px", borderRadius: 999,
              background: `${meta.color}1a`, border: `1px solid ${meta.color}55`, color: meta.color,
              fontSize: 12, fontWeight: 800, letterSpacing: 0.8, fontFamily: "'Geist Mono',monospace",
            }}>{meta.emoji} {meta.label.toUpperCase()}</span>
          </div>
        </div>

        {/* Total card — big */}
        <div style={{
          ...S.cardLarge, padding: "28px 30px", textAlign: "center",
          background: "linear-gradient(135deg, #F59E0B 0%, #fbbf24 50%, #F59E0B 100%)",
          color: "#1a1205",
          boxShadow: "0 8px 32px color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>TOTAL TAGIHAN</div>
          {discount.amount > 0 && (
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, opacity: 0.85, textDecoration: "line-through" }}>{rp(baseTotal)}</div>
          )}
          <div style={{ fontSize: 48, fontWeight: 800, marginTop: 2, letterSpacing: -1, fontFamily: "'Geist Mono',monospace" }}>{rp(total)}</div>
          {discount.amount > 0 && (
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>🎟️ {discount.type === "voucher" ? "VOUCHER" : "PROMO"} {discount.code} · −{rp(discount.amount)}</div>
          )}
          <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>
            🎬 {picked.film_title} · {picked.show_date} {picked.start_time} · {saleData.seats?.length || 0} kursi
          </div>
        </div>

        {/* Quick Promo Chips — list aktif yg langsung clickable */}
        {activePromos.length > 0 && !discount.code && (
          <div style={{ ...S.cardLarge, padding: 14, marginBottom: 10, background: "linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), color-mix(in srgb, var(--brand-primary,#FF6B35) 20%, transparent))", border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 30%, transparent)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#fbbf24", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>🎁 PROMO AKTIF — KLIK UNTUK APPLY</div>
              <div style={{ fontSize: 10, color: TH.dim, fontFamily: "'Geist Mono',monospace" }}>{activePromos.length} promo</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
              {activePromos.map(p => {
                const isPercent = p.discount_type === "percentage";
                const minOk = !p.min_purchase || baseTotal >= p.min_purchase;
                return (
                  <button key={p.id} onClick={() => applyPromoChip(p)} disabled={!minOk}
                    style={{
                      padding: "10px 14px", borderRadius: 10,
                      background: minOk ? "color-mix(in srgb, var(--brand-primary,#FF6B35) 10%, transparent)" : "rgba(255,255,255,0.03)",
                      border: minOk ? "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent)" : "1px solid rgba(255,255,255,0.05)",
                      color: minOk ? "#fff" : TH.dim,
                      cursor: minOk ? "pointer" : "not-allowed",
                      textAlign: "left", fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                        {p.code && <div style={{ fontSize: 10, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.8, fontWeight: 700 }}>{p.code}</div>}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: minOk ? "#fbbf24" : TH.dim, fontFamily: "'Geist Mono',monospace" }}>
                        −{isPercent ? `${p.discount_value}%` : `${Math.round(p.discount_value / 1000)}rb`}
                      </div>
                    </div>
                    {p.min_purchase > 0 && (
                      <div style={{ fontSize: 10, color: minOk ? TH.green : "#ef4444", marginTop: 4 }}>
                        {minOk ? "✓ " : "⚠ "} min Rp {Math.round(p.min_purchase / 1000)}rb
                      </div>
                    )}
                    {p.description && <div style={{ fontSize: 10, color: TH.sub, marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.description}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Apply Promo / Voucher + Auto-member Phone */}
        <div style={{ ...S.cardLarge, padding: 16, marginBottom: 14 }}>
          <div style={S.subSectionTitle}>🎁 INPUT KODE MANUAL (voucher) + 📱 AUTO-MEMBER</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            {/* Promo/Voucher apply */}
            <div>
              <div style={{ fontSize: 10, color: TH.dim, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", marginBottom: 5 }}>KODE PROMO / VOUCHER</div>
              {!discount.code ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={discInput} onChange={e => setDiscInput(e.target.value.toUpperCase())} placeholder="VCH-XXX atau MOVIE10"
                    onKeyDown={e => e.key === "Enter" && applyCode()}
                    style={{ ...S.input, flex: 1, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }} />
                  <button onClick={applyCode} disabled={discBusy || !discInput} style={{ background: "linear-gradient(135deg,#a855f7,#c084fc)", border: "none", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 800, cursor: discBusy ? "wait" : "pointer", fontFamily: "inherit" }}>{discBusy ? "..." : "Apply"}</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.4)", borderRadius: 8 }}>
                  <span style={{ fontSize: 18 }}>🎟️</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#c084fc", fontFamily: "'Geist Mono',monospace" }}>{discount.code}</div>
                    <div style={{ fontSize: 11, color: TH.green, fontWeight: 700 }}>−{rp(discount.amount)}</div>
                  </div>
                  <button onClick={clearDiscount} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", borderRadius: 6, padding: "5px 9px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                </div>
              )}
            </div>
            {/* Auto-member */}
            <div>
              <div style={{ fontSize: 10, color: TH.dim, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", marginBottom: 5 }}>📱 NOMOR WA (auto-member + earn points)</div>
              <input value={buyer.phone || ""}
                onChange={e => setBuyer && setBuyer({ ...buyer, phone: e.target.value })}
                onFocus={() => showNumpad({
                  value: buyer.phone || "",
                  onChange: (v) => setBuyer && setBuyer({ ...buyer, phone: v }),
                  label: "📱 NOMOR WA CUSTOMER",
                })}
                placeholder="Tap to input nomor"
                inputMode="tel"
                style={{ ...S.input, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700, cursor: "pointer" }} />
              <div style={{ fontSize: 10, color: buyer.phone ? TH.green : TH.dim, marginTop: 4, fontWeight: 700 }}>
                {buyer.phone ? `✓ Customer auto-register member + earn points` : "Opsional — kalau diisi, customer dapet points"}
              </div>
            </div>
          </div>
        </div>

        {/* Per-method input */}
        {paymentMethod === "cash" && (
          <div style={{ ...S.cardLarge, padding: 22, marginBottom: 14 }}>
            <div style={S.subSectionTitle}>💵 INPUT TUNAI DITERIMA</div>
            <button onClick={() => showNumpad({
              value: String(received || ""),
              onChange: (v) => setReceived(parseInt(v) || 0),
              label: "💵 TUNAI DITERIMA (Rp)",
            })} style={{
              width: "100%", border: "2px dashed color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent)", background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent)",
              borderRadius: 12, padding: "14px 0", margin: "14px 0", cursor: "pointer", fontFamily: "inherit",
              fontSize: 42, fontWeight: 800, color: cashEnough ? TH.green : "#fff",
              fontFamily: "'Geist Mono',monospace", letterSpacing: -0.6, textAlign: "center",
            }}>{rp(received) || "TAP UNTUK INPUT"}</button>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
              {[50000, 100000, 200000, 500000].map(n => (
                <button key={n} onClick={() => setReceived(r => r + n)} className="ghost-btn"
                  style={{ ...S.ghostBtn, padding: "12px", justifyContent: "center", fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>
                  + {fmtK(n)}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setReceived(total)} style={{ ...S.ghostBtn, flex: 1, padding: "10px", color: TH.amber, borderColor: "color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent)", background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 10%, transparent)", fontWeight: 700, justifyContent: "center" }}>UANG PAS</button>
              <button onClick={() => setReceived(0)} style={{ ...S.ghostBtn, flex: 1, padding: "10px", color: TH.red, borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", fontWeight: 700, justifyContent: "center" }}>RESET</button>
            </div>
            {cashEnough && (
              <div style={{
                marginTop: 16, padding: "12px 16px",
                background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 10,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: 14, color: TH.green, fontWeight: 700 }}>💰 Change</span>
                <span style={{ fontSize: 22, color: TH.green, fontWeight: 800, fontFamily: "'Geist Mono',monospace" }}>{rp(change)}</span>
              </div>
            )}
          </div>
        )}

        {paymentMethod === "qris" && (
          <div style={{ ...S.cardLarge, padding: 24, marginBottom: 14, textAlign: "center" }}>
            <div style={S.subSectionTitle}>📲 QRIS</div>
            {!qrisStarted ? (
              <>
                <div style={{ fontSize: 56, margin: "16px 0", filter: "drop-shadow(0 0 24px rgba(34,211,238,0.4))", lineHeight: 1 }}>📲</div>
                <div style={{ fontSize: 14, color: TH.sub, marginBottom: 18 }}>
                  Click "Generate QR" to start QRIS payment.<br/>
                  QR akan tampil di layar ini + Customer Display (CDS).
                </div>
                <button onClick={generateQris} disabled={qrisLoading} className="primary-btn"
                  style={{ ...S.primaryBtn, background: "linear-gradient(135deg,#22d3ee,#06b6d4)", color: "#04303a" }}>
                  {qrisLoading ? "⏳ Generating..." : "📲 Generate QRIS"}
                </button>
              </>
            ) : qrisPaid ? (
              <>
                <div style={{ fontSize: 64, margin: "14px 0", lineHeight: 1 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: TH.green, marginBottom: 6 }}>PEMBAYARAN DITERIMA</div>
                <div style={{ fontSize: 12, color: TH.sub }}>Memproses tiket...</div>
              </>
            ) : (
              <>
                {(qrisData?.qrUrl || qrisData?.qrString) ? (
                  <div style={{ display: "inline-block", background: "#fff", padding: 14, borderRadius: 14, margin: "14px 0", boxShadow: "0 8px 24px rgba(34,211,238,0.25)" }}>
                    <img src={qrisData.qrUrl || qrisData.qrString} alt="QRIS" style={{ width: 220, height: 220, display: "block" }} />
                  </div>
                ) : (
                  <div style={{ width: 220, height: 220, margin: "14px auto", borderRadius: 14, background: "#1a1b1e", border: "1px dashed rgba(34,211,238,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: TH.sub, fontSize: 12 }}>⏳ QR loading...</div>
                )}
                <div style={{ fontSize: 14, fontWeight: 700, color: TH.cyan, marginBottom: 6, fontFamily: "'Geist Mono',monospace" }}>{rp(total)}</div>
                <div style={{ fontSize: 12, color: TH.sub, marginBottom: 10 }}>
                  Customer scan QR ini di e-wallet (GoPay/OVO/DANA/ShopeePay).<br/>
                  <span style={{ color: TH.cyan }}>● Auto-detect pembayaran tiap 3 detik</span>
                </div>
                {qrisData?.deeplinkUrl && (
                  <a href={qrisData.deeplinkUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "8px 16px", background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 8, color: TH.cyan, textDecoration: "none", fontSize: 11, fontWeight: 700, marginRight: 6 }}>📱 Open in app</a>
                )}
                <button onClick={() => { setQrisData(null); setQrisStarted(false); }} style={{ ...S.ghostBtn, marginLeft: 6 }}>↺ Generate Ulang</button>
              </>
            )}
          </div>
        )}

        {(paymentMethod === "debit") && (
          <div style={{ ...S.cardLarge, padding: 22, marginBottom: 14 }}>
            <div style={S.subSectionTitle}>💳 INFO TRANSAKSI KARTU</div>
            <div style={{ fontSize: 13, color: TH.sub, marginTop: 8, marginBottom: 12 }}>
              Swipe kartu di EDC. Setelah approve, masukkan 4 digit terakhir kartu atau approval code.
            </div>
            <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="4 digit terakhir / Approval code"
              className="premium-input"
              style={{ ...S.input, fontSize: 18, letterSpacing: 2, textAlign: "center", fontFamily: "'Geist Mono',monospace", fontWeight: 700 }} />
          </div>
        )}

        {paymentMethod === "voucher" && (
          <div style={{ ...S.cardLarge, padding: 22, marginBottom: 14 }}>
            <div style={S.subSectionTitle}>🎟️ KODE VOUCHER</div>
            <div style={{ fontSize: 13, color: TH.sub, marginTop: 8, marginBottom: 12 }}>
              Masukkan kode voucher / e-voucher dari customer.
            </div>
            <input value={voucherCode} onChange={e => setVoucherCode(e.target.value.toUpperCase())} placeholder="VOUCHER-XXXX"
              className="premium-input"
              style={{ ...S.input, fontSize: 18, letterSpacing: 2, textAlign: "center", fontFamily: "'Geist Mono',monospace", fontWeight: 700 }} />
          </div>
        )}

        {msg && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fca5a5", marginBottom: 12 }}>{msg}</div>
        )}

      </div>
      {/* Fixed bottom action bar — confirm selalu visible */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        background: "rgba(8,9,15,0.92)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "14px 30px",
        boxShadow: "0 -12px 32px rgba(0,0,0,0.4)",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 10, color: TH.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.4, fontWeight: 700 }}>TOTAL TAGIHAN</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5, lineHeight: 1 }}>{rp(total)}</div>
          </div>
          <button onClick={confirm} disabled={!canConfirm} className="primary-btn"
            style={{ ...S.primaryBtn, padding: "14px 28px", fontSize: 14, opacity: canConfirm ? 1 : 0.5, cursor: canConfirm ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
            {busy ? "⏳ Memproses…" : `✓ KONFIRMASI ${meta.label?.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUCCESS
// ═══════════════════════════════════════════════════════════════════
function TicketQR({ code }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(code, { width: 220, margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" } })
      .then(setSrc).catch(() => setSrc(null));
  }, [code]);
  if (!src) return <div style={{ width: 120, height: 120, background: "#1a1b1e", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#5b6470", fontSize: 11 }}>⏳</div>;
  return <img src={src} alt={code} style={{ width: 120, height: 120, display: "block", borderRadius: 6, background: "#fff", padding: 4, boxSizing: "content-box" }} />;
}

function Success({ sale, onAnother }) {
  const tickets = sale.tickets || sale.codes?.map((c, i) => ({ code: c, seat: sale.seats?.[i] })) || [];
  // Fetch ticket branding config (per-outlet → fallback DEFAULT)
  const [ticketBrand, setTicketBrand] = useState("🎬 karyaOS CINEMA");
  const [ticketFooter, setTicketFooter] = useState("Tunjukkan QR ini di pintu masuk studio");
  useEffect(() => {
    const outlet = new URLSearchParams(window.location.search).get("outlet") || "";
    const brandKeys = outlet ? [`CINEMA_TICKET_BRAND:${outlet}`, "CINEMA_TICKET_BRAND_DEFAULT"] : ["CINEMA_TICKET_BRAND_DEFAULT"];
    const footerKeys = outlet ? [`CINEMA_TICKET_FOOTER:${outlet}`, "CINEMA_TICKET_FOOTER_DEFAULT"] : ["CINEMA_TICKET_FOOTER_DEFAULT"];
    const fetchFirst = async (keys) => {
      for (const k of keys) {
        try {
          const r = await fetch(`${API_HOST}/api/pos/config/${encodeURIComponent(k)}`);
          if (!r.ok) continue;
          const d = await r.json();
          let v = d.value;
          try { v = typeof v === "string" ? JSON.parse(v) : v; } catch {}
          if (v && typeof v === "string") return v;
        } catch {}
      }
      return null;
    };
    fetchFirst(brandKeys).then(v => v && setTicketBrand(v));
    fetchFirst(footerKeys).then(v => v && setTicketFooter(v));
  }, []);
  return (
    <div style={S.content}>
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body, html { background: #fff !important; color: #000 !important; }
          .no-print { display: none !important; }
          /* Tiap tiket: 1 page = mudah dipotong di printer thermal cinema (auto-cut),
             atau di home printer A4 manual gunting per halaman */
          .ticket-print {
            background: #fff !important; color: #000 !important;
            border: 2px dashed #555 !important;
            page-break-inside: avoid;
            page-break-after: always;     /* tiap tiket = halaman terpisah */
            break-after: page;
            margin: 0 auto !important;
            max-width: 480px !important;
            padding: 18px !important;
            box-shadow: none !important;
          }
          .ticket-print:last-child { page-break-after: auto; }
          .ticket-print * { color: #000 !important; }
          .ticket-seat-pill { background: #fbbf24 !important; color: #000 !important; border: 1px solid #b45309 !important; }
          .topbar-glass { display: none !important; }
          /* Header info film tetap muncul di halaman pertama saja */
          .success-card > div:first-child { page-break-after: avoid; }
          /* Visual cut indicator — scissors + dashed line di antara tiket
             (visible on screen too, signals 'cut here') */
          .ticket-cut-line {
            text-align: center;
            font-size: 10px; color: #555 !important;
            padding: 2px 0;
            background: repeating-linear-gradient(90deg, #777 0 4px, transparent 4px 8px) center / 100% 1px no-repeat;
          }
        }
        /* Screen view: subtle cut indicator di antara tiket */
        .ticket-cut-line {
          font-size: 10px; color: #5b6470;
          letter-spacing: 4px; text-align: center;
          padding: 4px 0; margin: 2px 0;
          font-family: 'Geist Mono', monospace;
        }
      `}</style>
      <div className="success-card" style={{ ...S.cardLarge, padding: 28, maxWidth: 880, margin: "30px auto" }}>
        {/* Header — flex vertical with gap, no marginTop stacking */}
        <div style={{ paddingBottom: 22, borderBottom: TH.border, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 48, lineHeight: 1, filter: "drop-shadow(0 0 24px rgba(16,185,129,0.4))" }}>🎬</div>
          <div style={{ fontSize: 12, color: TH.green, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, textTransform: "uppercase", lineHeight: 1 }}>TIKET BERHASIL TERJUAL</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: -0.5, lineHeight: 1.2, textAlign: "center", margin: 0 }}>{sale.picked?.film_title}</div>
          <div style={{ fontSize: 13, color: TH.sub, textAlign: "center", margin: 0 }}>
            {sale.picked?.studio_name} · {sale.picked?.show_date} · {sale.picked?.start_time}
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", width: "100%" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: TH.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.2, lineHeight: 1 }}>TOTAL DIBAYAR</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#10b981", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5, marginTop: 4, lineHeight: 1 }}>{rp(sale.total)}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: TH.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.2, lineHeight: 1 }}>METODE</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginTop: 4, lineHeight: 1 }}>{(sale.paymentMethod || "").toUpperCase()}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: TH.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.2, lineHeight: 1 }}>JUMLAH TIKET</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5, marginTop: 4, lineHeight: 1 }}>{tickets.length || sale.seats?.length || 0}</div>
            </div>
          </div>
        </div>

        {/* Per-ticket QR cards — masing-masing self-contained (film + studio + jam),
            page-break-after: always saat print → tiap tiket = 1 halaman = mudah dipotong */}
        <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 14 }}>
          {tickets.length > 0 ? tickets.map((t, i) => (
            <Fragment key={t.code || i}>
              <div className="ticket-print" style={{ background: "rgba(255,255,255,0.02)", border: TH.border, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Film header — self-contained per ticket (brand dari pos_config) */}
                <div style={{ paddingBottom: 8, borderBottom: "1px dashed rgba(255,255,255,0.1)" }}>
                  <div style={{ fontSize: 9, color: TH.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, fontWeight: 700 }}>{ticketBrand}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginTop: 3, lineHeight: 1.2 }}>{sale.picked?.film_title}</div>
                  <div style={{ fontSize: 10, color: TH.sub, marginTop: 2, fontFamily: "'Geist Mono',monospace" }}>
                    {sale.picked?.studio_name} · {sale.picked?.show_date} {sale.picked?.start_time} · {sale.picked?.format || "2D"}
                  </div>
                </div>
                {/* Body: QR + seat info */}
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <TicketQR code={t.code || ""} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: TH.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, fontWeight: 700 }}>KURSI</div>
                    <div className="ticket-seat-pill" style={{
                      display: "inline-block", fontSize: 22, fontWeight: 900, padding: "4px 14px", borderRadius: 8, marginTop: 4,
                      fontFamily: "'Geist Mono',monospace", background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#1a1205", letterSpacing: -0.4,
                    }}>{t.seat || sale.seats?.[i] || "—"}</div>
                    <div style={{ fontSize: 10, color: TH.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.2, marginTop: 10 }}>KODE TIKET</div>
                    <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#fbbf24", marginTop: 2, letterSpacing: 0.8, wordBreak: "break-all" }}>{t.code || "—"}</div>
                  </div>
                </div>
                {/* Footer instruction — custom dari pos_config */}
                <div style={{ fontSize: 10, color: TH.sub, lineHeight: 1.4, paddingTop: 6, borderTop: "1px dashed rgba(255,255,255,0.06)" }}>
                  📲 {ticketFooter} · Tiket #{i + 1} dari {tickets.length}.
                </div>
              </div>
              {/* Cut indicator antar tiket — visible on screen + print */}
              {i < tickets.length - 1 && <div className="ticket-cut-line">✂ — — — — — — — — — POTONG — — — — — — — — —</div>}
            </Fragment>
          )) : (
            <div style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center", color: TH.dim, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: TH.border }}>
              ⚠ Kode tiket belum diterima dari server. Coba refresh atau hubungi admin.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="no-print" style={{ display: "flex", gap: 10, marginTop: 26, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => window.print()} className="ghost-btn" style={S.ghostBtn} title="Print A4 standard (preview muncul kecuali Chrome --kiosk-printing flag)">🖨️ Cetak A4</button>
          <button onClick={async () => {
            // 1) Coba backend ESC/POS direct (silent print, no preview)
            const outlet = new URLSearchParams(window.location.search).get("outlet") || "";
            let escposOk = 0, escposFail = 0;
            for (const t of (tickets || [])) {
              try {
                const r = await fetch(`${API_HOST}/api/cinema/tickets/${t.id}/print-thermal${outlet ? `?outlet=${outlet}` : ""}`, { method: "POST" });
                const d = await r.json();
                if (d.ok) escposOk++; else escposFail++;
              } catch { escposFail++; }
            }
            // 2) Fallback: kalau ESC/POS semua gagal, pakai browser print thermal window
            if (escposOk === 0 && escposFail > 0) {
              alert("Direct printer offline. Pakai fallback browser print thermal (set Chrome --kiosk-printing biar silent)");
              tickets.forEach((t, i) => {
                setTimeout(() => {
                  window.open(`${window.location.origin}/?ticket=${encodeURIComponent(t.code)}&print=1&thermal=1`, `print_${t.code}`, "width=400,height=600");
                }, i * 600);
              });
            } else if (escposOk > 0) {
              alert(`✓ Print silent: ${escposOk}/${tickets.length} tiket OK ke thermal printer`);
            }
          }} style={{ ...S.ghostBtn, background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.4)", color: "#22d3ee" }} title="Silent print via ESC/POS direct ke Epson TM-T82 (LAN). Fallback ke browser print kalau printer offline.">🖨️ Print Thermal</button>
          <button onClick={() => {
            // Kirim digital ticket via WA (input phone customer)
            const phone = prompt("Nomor WA customer (e.g. 081234567890):");
            if (!phone) return;
            const wa = phone.replace(/^0/, "62").replace(/\D/g, "");
            // Build link per tiket + compose message
            const ticketLinks = tickets.map(t => `${window.location.origin}/?ticket=${encodeURIComponent(t.code)}`);
            const msg = `🎬 *Tiket ${sale.picked?.film_title}*\n\n📅 ${sale.picked?.show_date} ${sale.picked?.start_time}\n🏛️ ${sale.picked?.studio_name}\n\nLink tiket digital (klik untuk lihat QR):\n${ticketLinks.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n\nTunjukkan QR ke usher di pintu studio. Terima kasih 🎬`;
            window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
          }} style={{ ...S.ghostBtn, background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.4)", color: "#25D366" }} title="Kirim tiket digital ke HP customer via WA — fallback kalau printer rusak">📱 Kirim WA</button>
          <button onClick={onAnother} className="primary-btn" style={S.primaryBtn}>✓ Transaksi Baru</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES + CSS
// ═══════════════════════════════════════════════════════════════════
const S = {
  root: { minHeight: "100vh", background: TH.bg, color: TH.text, fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", position: "relative", overflow: "hidden auto" },
  mesh: { position: "fixed", inset: 0, background: TH.mesh, pointerEvents: "none", zIndex: 0 },
  topbar: {
    position: "sticky", top: 0, zIndex: 100,
    display: "flex", justifyContent: "space-between", alignItems: "center",
    flexWrap: "wrap", gap: 12,
    padding: "14px 30px", borderBottom: TH.border,
    background: "rgba(8,9,15,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
  },
  ghostBtn: {
    background: "rgba(255,255,255,0.02)", border: TH.border, color: TH.sub,
    padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", gap: 6, transition: "all 0.15s",
  },
  primaryBtn: {
    background: "linear-gradient(135deg,#f59e0b,#fbbf24)", border: "none", color: "#1a1205",
    padding: "11px 22px", borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
    boxShadow: TH.shadowCTA, transition: "all 0.2s", letterSpacing: 0.3,
  },
  content: { position: "relative", zIndex: 1, padding: "26px 30px 60px", maxWidth: 1400, margin: "0 auto" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: -0.6 },
  sectionSub: { fontSize: 13, color: TH.sub, marginTop: 4 },
  subSectionTitle: { fontSize: 11, color: TH.dim, letterSpacing: 1.8, fontFamily: "'Geist Mono',monospace", fontWeight: 700, textTransform: "uppercase" },
  itemLabel: { fontSize: 10, color: TH.dim, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, textTransform: "uppercase", marginBottom: 5 },
  pill: {
    background: "rgba(255,255,255,0.02)", border: TH.border, color: TH.sub,
    padding: "8px 16px", borderRadius: 18, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.15s",
  },
  pillActive: {
    background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent)", color: TH.amberLight,
    boxShadow: "0 0 16px color-mix(in srgb, var(--brand-primary,#FF6B35) 15%, transparent)",
  },
  input: {
    background: "rgba(255,255,255,0.03)", border: TH.border, color: TH.text,
    padding: "9px 12px", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%",
    transition: "border-color 0.15s, box-shadow 0.15s",
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 },
  card: { background: TH.panel, border: TH.border, borderRadius: 12, boxShadow: TH.shadowCard, transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)" },
  cardLarge: { background: TH.panel, border: TH.border, borderRadius: 16, boxShadow: TH.shadowCard },
  emptyCard: { padding: 60, textAlign: "center", background: TH.panel, border: TH.border, borderRadius: 14 },
  sellLayout: { position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, padding: "20px 30px 40px", maxWidth: 1500, margin: "0 auto" },
  sellLeft: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 },
  sellRight: {
    position: "sticky", top: 80, alignSelf: "flex-start",
    background: TH.panelGlass, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
    border: TH.border, borderRadius: 16, padding: 20, maxHeight: "calc(100vh - 100px)", overflowY: "auto",
    boxShadow: TH.shadowCard,
  },
  sellHeader: {
    background: TH.panel, border: TH.border, borderRadius: 14, padding: "16px 20px",
    display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14,
    boxShadow: TH.shadowCard,
  },
  seatPanel: { background: TH.panel, border: TH.border, borderRadius: 14, padding: "20px 16px", boxShadow: TH.shadowCard },
  bundlePanel: { background: TH.panel, border: TH.border, borderRadius: 14, padding: "16px 18px", boxShadow: TH.shadowCard },
  qtyBtn: {
    width: 24, height: 24, borderRadius: 6,
    background: "rgba(255,255,255,0.05)", border: TH.border, color: "#fff",
    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s",
  },
};

const CSS = `
  .topbar-glass {
    background: rgba(8,9,15,0.78);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  .checkout-glass {}
  .ghost-btn:hover { background: rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,0.12) !important; color: #fff !important; }
  .primary-btn:hover { transform: translateY(-1px); filter: brightness(1.06); box-shadow: 0 10px 28px color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent), inset 0 1px 0 rgba(255,255,255,0.25) !important; }
  .primary-btn:active { transform: translateY(0); }
  .pill-btn:hover { background: rgba(255,255,255,0.04) !important; border-color: rgba(255,255,255,0.12) !important; color: #fff !important; }
  .premium-input:focus { border-color: color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-primary,#FF6B35) 12%, transparent) !important; }
  .showtime-card:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 80%, transparent), inset 0 1px 0 rgba(255,255,255,0.08) !important; border-color: rgba(255,255,255,0.12) !important; }
  .bundle-card:hover { transform: translateY(-1px); }
  .seat-btn:not(:disabled):hover { transform: scale(1.08); }
  .qty-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1) !important; }
  .success-card { animation: posCinemaPop 0.5s cubic-bezier(0.18,1.05,0.4,1) both; }
  @keyframes posCinemaPop {
    0% { opacity: 0; transform: scale(0.94) translateY(12px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  @media (max-width: 1100px) {
    .pos-cinema-sell { grid-template-columns: 1fr !important; }
  }
  @media print {
    .topbar-glass, .ghost-btn, .primary-btn, button { display: none !important; }
  }
`;
