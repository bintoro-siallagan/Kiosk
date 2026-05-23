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

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import POSKasirLogin from "./POSKasirLogin.jsx";
import ShiftGate from "../ShiftGate.jsx";

const API_HOST = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ═══════════════════════════════════════════════════════════════════
// THEME — MacBook-premium cinema palette
// ═══════════════════════════════════════════════════════════════════
const TH = {
  bg: "linear-gradient(160deg,#050810 0%,#0c0f1a 50%,#08090f 100%)",
  mesh: "radial-gradient(900px 700px at 20% 5%, rgba(168,85,247,0.07), transparent 60%), radial-gradient(700px 500px at 85% 80%, rgba(245,158,11,0.05), transparent 60%)",
  panel: "linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.005))",
  panelGlass: "rgba(13,17,23,0.72)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderHover: "1px solid rgba(255,255,255,0.12)",
  borderActive: "1px solid rgba(245,158,11,0.4)",
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
  shadowSelected: "0 0 0 1px rgba(245,158,11,0.4), 0 8px 24px rgba(245,158,11,0.18)",
  shadowCTA: "0 6px 20px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
};

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtK = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "jt" : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(Math.round(n) || 0);

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function POSCinemaApp() {
  const [cashier, setCashier] = useState(() => {
    try { const raw = sessionStorage.getItem("posCashier"); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [stage, setStage] = useState("home"); // home | sell | pay | success
  const [picked, setPicked] = useState(null); // showtime obj
  const [seats, setSeats] = useState([]);     // selected seats
  const [bundles, setBundles] = useState([]); // selected bundles [{id, qty, ...}]
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
  const handleLogout = () => { sessionStorage.removeItem("posCashier"); setCashier(null); setStage("home"); };

  const resetSale = () => {
    setPicked(null); setSeats([]); setBundles([]);
    setBuyer({ name: "", phone: "", email: "" });
    setPaymentMethod("cash"); setSaleData(null);
    setStage("home");
  };

  // Sell stage submit → save totals, move to pay stage (no submit yet)
  const proceedToPay = (totals) => { setSaleData(totals); setStage("pay"); };
  const onSold = (ticketResult) => { setLastSale(ticketResult); setStage("success"); };

  if (!cashier) return <POSKasirLogin apiBase={API_HOST} onSelectKasir={handleLogin} />;

  return (
    <ShiftGate cashier={cashier}>
      <div style={S.root}>
        <style>{CSS}</style>
        <div style={S.mesh} aria-hidden />
        <TopBar cashier={cashier} stage={stage} onLogout={handleLogout} onHome={resetSale} />

        {stage === "home" && (
          <Home onPick={(st) => { setPicked(st); setStage("sell"); }} />
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
          />
        )}
        {stage === "pay" && picked && saleData && (
          <Pay
            picked={picked}
            saleData={saleData}
            paymentMethod={paymentMethod}
            buyer={buyer}
            cashier={cashier}
            onBack={() => setStage("sell")}
            onPaid={onSold}
          />
        )}
        {stage === "success" && lastSale && (
          <Success sale={lastSale} onAnother={resetSale} />
        )}
      </div>
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
        <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, filter: "drop-shadow(0 0 12px rgba(245,158,11,0.4))" }}>🎬</div>
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
          <div style={{ fontSize: 11.5, color: TH.sub }}>Kasir</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff" }}>{cashier?.name || "—"}</div>
        </div>
        <button onClick={onLogout} className="ghost-btn" style={S.ghostBtn}>Logout</button>
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
        <div style={S.sectionSub}>Pilih jadwal untuk mulai jual tiket</div>
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
        <div style={{ padding: 60, textAlign: "center", color: TH.sub }}>⏳ Memuat jadwal…</div>
      ) : list.length === 0 ? (
        <div style={{ ...S.emptyCard }}>
          <div style={{ fontSize: 38, marginBottom: 8 }}>🎬</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TH.text }}>Tidak ada jadwal</div>
          <div style={{ fontSize: 12, color: TH.sub, marginTop: 4 }}>Belum ada jadwal tayang untuk filter ini.</div>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: statusMeta.c, fontWeight: 700, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>{statusMeta.l}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginTop: 6, letterSpacing: -0.4, lineHeight: 1.2 }}>{st.film_title || "—"}</div>
            <div style={{ fontSize: 12, color: TH.sub, marginTop: 6 }}>{st.studio_name || "—"} · {st.show_date} · {st.start_time}</div>
          </div>
          {st.rating && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: ratingColor(st.rating), padding: "4px 9px",
              background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
              border: `1px solid ${ratingColor(st.rating)}66`, borderRadius: 6, flexShrink: 0,
            }}>{st.rating}</span>
          )}
        </div>

        {/* Capacity bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TH.sub, marginBottom: 5 }}>
            <span>Okupansi <b style={{ color: "#fff" }}>{pct}%</b></span>
            <span style={{ color: isFull ? TH.red : sellable ? TH.green : TH.dim, fontWeight: 700 }}>
              {isFull ? "Sold out" : `${remaining} kursi`}
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
function Sell({ picked, seats, setSeats, bundles, setBundles, buyer, setBuyer, paymentMethod, setPaymentMethod, cashier, onCancel, onProceed }) {
  const [seatData, setSeatData] = useState(null);
  const [bundleList, setBundleList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const loadSeats = useCallback(() => {
    fetch(`${API_HOST}/api/cinema/showtimes/${picked.id}/seats`).then(r => r.json()).then(setSeatData).catch(() => {});
  }, [picked.id]);
  useEffect(() => { loadSeats(); const iv = setInterval(loadSeats, 10000); return () => clearInterval(iv); }, [loadSeats]);

  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/bundles`).then(r => r.json()).then(d => setBundleList(d.bundles || [])).catch(() => {});
  }, []);

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

  const ticketSubtotal = seats.length * (picked.price || 0);
  const bundleSubtotal = bundles.reduce((s, b) => s + (b.price || 0) * (b.qty || 0), 0);
  const total = ticketSubtotal + bundleSubtotal;

  const submit = () => {
    if (!seats.length) { setMsg("⚠ Pilih minimal 1 kursi"); return; }
    // Lanjut ke pay stage — submit ticket POST happens at Pay stage setelah
    // user konfirmasi pembayaran. Bawa snapshot seats+bundles biar Pay stage
    // bisa POST tanpa dependency parent state.
    onProceed({ ticketSubtotal, bundleSubtotal, total, seats: [...seats], bundles: bundles.map(b => ({ ...b })) });
  };

  if (!seatData) return <div style={{ padding: 60, textAlign: "center", color: TH.sub }}>⏳ Memuat peta kursi…</div>;

  return (
    <div style={S.sellLayout}>
      {/* LEFT — seat map + bundles */}
      <div style={S.sellLeft}>
        {/* Header */}
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

        {/* Seat map */}
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
                          border: sold ? "1px solid rgba(239,68,68,0.3)" : sel ? "1px solid rgba(245,158,11,0.6)" : "1px solid rgba(255,255,255,0.08)",
                          color: sold ? "#ef4444" : sel ? "#1a1205" : TH.sub,
                          fontSize: 10, fontWeight: 800, fontFamily: "'Geist Mono',monospace",
                          cursor: sold ? "not-allowed" : "pointer",
                          boxShadow: sel ? "0 4px 12px rgba(245,158,11,0.35)" : "none",
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
            <Legend color="linear-gradient(135deg,#f59e0b,#fbbf24)" border="rgba(245,158,11,0.6)" label="Dipilih" />
            <Legend color="rgba(239,68,68,0.15)" border="rgba(239,68,68,0.3)" label="Terjual" />
          </div>
        </div>

        {/* Bundles */}
        {bundleList.length > 0 && (
          <div style={S.bundlePanel}>
            <div style={S.subSectionTitle}>🍿 F&B BUNDLES (OPSIONAL)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10, marginTop: 12 }}>
              {bundleList.map(b => {
                const sel = bundles.find(x => x.id === b.id);
                return (
                  <div key={b.id} className="bundle-card" style={{
                    ...S.card, padding: "12px 14px",
                    border: sel ? TH.borderActive : TH.border,
                    boxShadow: sel ? TH.shadowSelected : TH.shadowCard,
                  }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "#fff" }}>{b.name}</div>
                    <div style={{ fontSize: 11.5, color: TH.sub, marginTop: 3, minHeight: 30 }}>{b.description || ""}</div>
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
                background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: TH.amberLight,
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
          <div style={S.itemLabel}>Metode Pembayaran</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              ["cash", "💵 Tunai"], ["debit", "💳 Debit"],
              ["qris", "📲 QRIS"], ["voucher", "🎟️ Voucher"],
            ].map(([k, l]) => (
              <button key={k} onClick={() => setPaymentMethod(k)}
                style={{
                  background: paymentMethod === k ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.02)",
                  border: paymentMethod === k ? "1px solid rgba(245,158,11,0.4)" : TH.border,
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
function Pay({ picked, saleData, paymentMethod, buyer, cashier, onBack, onPaid }) {
  const total = saleData.total;
  const [received, setReceived] = useState(0);
  const [refNo, setRefNo] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [qrisStarted, setQrisStarted] = useState(false);

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
          email: buyer.email || null,
          payment_method: paymentMethod,
          payment_ref: paymentRef.ref || null,
          cash_received: paymentRef.cashReceived || null,
          cash_change: paymentRef.cashChange || null,
          cashier_name: cashier?.name,
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
    else if (paymentMethod === "qris") submitTickets({ ref: "QRIS-" + Date.now() });
    else if (paymentMethod === "debit") submitTickets({ ref: refNo.trim() });
    else if (paymentMethod === "voucher") submitTickets({ ref: voucherCode.trim() });
  };

  const meta = {
    cash:    { emoji: "💵", label: "Tunai",       color: "#10b981" },
    debit:   { emoji: "💳", label: "Debit/Kredit", color: "#3b82f6" },
    qris:    { emoji: "📲", label: "QRIS",        color: "#22d3ee" },
    voucher: { emoji: "🎟️", label: "Voucher",     color: "#fbbf24" },
  }[paymentMethod] || {};

  return (
    <div style={S.content}>
      <div style={{ maxWidth: 720, margin: "10px auto 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <button onClick={onBack} className="ghost-btn" style={S.ghostBtn} disabled={busy}>← Batal / Ubah</button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: TH.dim, letterSpacing: 1.4, fontFamily: "'Geist Mono',monospace", fontWeight: 700, textTransform: "uppercase" }}>Pembayaran</span>
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
          boxShadow: "0 8px 32px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>TOTAL TAGIHAN</div>
          <div style={{ fontSize: 48, fontWeight: 800, marginTop: 4, letterSpacing: -1, fontFamily: "'Geist Mono',monospace" }}>{rp(total)}</div>
          <div style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>
            🎬 {picked.film_title} · {picked.show_date} {picked.start_time} · {saleData.seats?.length || 0} kursi
          </div>
        </div>

        {/* Per-method input */}
        {paymentMethod === "cash" && (
          <div style={{ ...S.cardLarge, padding: 22, marginBottom: 14 }}>
            <div style={S.subSectionTitle}>💵 INPUT TUNAI DITERIMA</div>
            <div style={{
              fontSize: 42, fontWeight: 800, color: cashEnough ? TH.green : "#fff",
              fontFamily: "'Geist Mono',monospace", letterSpacing: -0.6,
              textAlign: "center", margin: "14px 0",
            }}>{rp(received)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
              {[50000, 100000, 200000, 500000].map(n => (
                <button key={n} onClick={() => setReceived(r => r + n)} className="ghost-btn"
                  style={{ ...S.ghostBtn, padding: "12px", justifyContent: "center", fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>
                  + {fmtK(n)}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setReceived(total)} style={{ ...S.ghostBtn, flex: 1, padding: "10px", color: TH.amber, borderColor: "rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.1)", fontWeight: 700, justifyContent: "center" }}>UANG PAS</button>
              <button onClick={() => setReceived(0)} style={{ ...S.ghostBtn, flex: 1, padding: "10px", color: TH.red, borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", fontWeight: 700, justifyContent: "center" }}>RESET</button>
            </div>
            {cashEnough && (
              <div style={{
                marginTop: 16, padding: "12px 16px",
                background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 10,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: 14, color: TH.green, fontWeight: 700 }}>💰 Kembalian</span>
                <span style={{ fontSize: 22, color: TH.green, fontWeight: 800, fontFamily: "'Geist Mono',monospace" }}>{rp(change)}</span>
              </div>
            )}
          </div>
        )}

        {paymentMethod === "qris" && (
          <div style={{ ...S.cardLarge, padding: 30, marginBottom: 14, textAlign: "center" }}>
            <div style={S.subSectionTitle}>📲 QRIS</div>
            {!qrisStarted ? (
              <>
                <div style={{ fontSize: 64, margin: "20px 0", filter: "drop-shadow(0 0 24px rgba(34,211,238,0.4))" }}>📲</div>
                <div style={{ fontSize: 14, color: TH.sub, marginBottom: 18 }}>
                  Klik "Generate QR" untuk mulai pembayaran QRIS.<br/>
                  Customer scan QR di handphone → bayar → klik "Pembayaran Diterima" setelah konfirmasi.
                </div>
                <button onClick={() => setQrisStarted(true)} className="primary-btn"
                  style={{ ...S.primaryBtn, background: "linear-gradient(135deg,#22d3ee,#06b6d4)", color: "#04303a" }}>
                  📲 Generate QRIS
                </button>
              </>
            ) : (
              <>
                <div style={{
                  width: 220, height: 220, margin: "20px auto", borderRadius: 16,
                  background: "linear-gradient(135deg, #fff, #f5f5f5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 100, color: "#000",
                  border: "2px dashed rgba(34,211,238,0.5)",
                }}>📲</div>
                <div style={{ fontSize: 13, color: TH.sub, marginBottom: 14 }}>
                  ⚠ Demo mode — integrasi Midtrans/Xendit perlu key production.<br/>
                  Klik tombol bawah setelah customer konfirmasi bayar.
                </div>
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

        {/* Confirm */}
        <button onClick={confirm} disabled={!canConfirm} className="primary-btn"
          style={{ ...S.primaryBtn, width: "100%", padding: "16px", fontSize: 15, opacity: canConfirm ? 1 : 0.5, cursor: canConfirm ? "pointer" : "not-allowed" }}>
          {busy ? "⏳ Memproses…" : `✓ KONFIRMASI ${meta.label?.toUpperCase()} · ${rp(total)}`}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUCCESS
// ═══════════════════════════════════════════════════════════════════
function Success({ sale, onAnother }) {
  const codes = sale.tickets?.map(t => t.code) || sale.codes || [];
  return (
    <div style={S.content}>
      <div className="success-card" style={{ ...S.cardLarge, padding: 32, textAlign: "center", maxWidth: 540, margin: "60px auto" }}>
        <div style={{ fontSize: 64, marginBottom: 12, filter: "drop-shadow(0 0 24px rgba(16,185,129,0.4))" }}>🎬</div>
        <div style={{ fontSize: 12, color: TH.green, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, textTransform: "uppercase" }}>TIKET BERHASIL TERJUAL</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", marginTop: 8, letterSpacing: -0.5 }}>{sale.picked?.film_title}</div>
        <div style={{ fontSize: 13, color: TH.sub, marginTop: 6 }}>
          {sale.picked?.studio_name} · {sale.picked?.show_date} · {sale.picked?.start_time}
        </div>

        {/* Tickets summary */}
        <div style={{ marginTop: 22, padding: "16px 18px", background: "rgba(255,255,255,0.02)", border: TH.border, borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: TH.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.2 }}>
            <span>KURSI</span><span>{sale.seats?.length} tiket</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, justifyContent: "center" }}>
            {sale.seats?.sort().map(s => (
              <span key={s} style={{
                fontSize: 13, fontWeight: 800, padding: "5px 11px", borderRadius: 7, fontFamily: "'Geist Mono',monospace",
                background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#1a1205",
              }}>{s}</span>
            ))}
          </div>
          {codes.length > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: TH.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.2, marginTop: 16 }}>
                <span>KODE TIKET</span><span>{codes.length}</span>
              </div>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: TH.sub, marginTop: 6, lineHeight: 1.7 }}>
                {codes.map(c => <div key={c}>· {c}</div>)}
              </div>
            </>
          )}
        </div>

        <div style={{ fontSize: 12, color: TH.dim, marginTop: 14, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>TOTAL DIBAYAR</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.8, marginTop: 2 }}>{rp(sale.total)}</div>
        <div style={{ fontSize: 11.5, color: TH.sub, marginTop: 4 }}>via {sale.paymentMethod}</div>

        <div style={{ display: "flex", gap: 8, marginTop: 26, justifyContent: "center" }}>
          <button onClick={() => window.print()} className="ghost-btn" style={S.ghostBtn}>🖨️ Cetak</button>
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
    padding: "14px 30px", borderBottom: TH.border,
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
    background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", color: TH.amberLight,
    boxShadow: "0 0 16px rgba(245,158,11,0.15)",
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
  .primary-btn:hover { transform: translateY(-1px); filter: brightness(1.06); box-shadow: 0 10px 28px rgba(245,158,11,0.5), inset 0 1px 0 rgba(255,255,255,0.25) !important; }
  .primary-btn:active { transform: translateY(0); }
  .pill-btn:hover { background: rgba(255,255,255,0.04) !important; border-color: rgba(255,255,255,0.12) !important; color: #fff !important; }
  .premium-input:focus { border-color: rgba(245,158,11,0.4) !important; box-shadow: 0 0 0 3px rgba(245,158,11,0.12) !important; }
  .showtime-card:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 24px rgba(245,158,11,0.08), inset 0 1px 0 rgba(255,255,255,0.08) !important; border-color: rgba(255,255,255,0.12) !important; }
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
