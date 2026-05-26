// karyaOS — Cinema Cashier KPI Leaderboard
// HR/Owner tool: rank kasir by customer rating, spot top performers + low ones.
// Data source: cinema_cashier_ratings (filled by customers via mobile feedback page)
import { useEffect, useMemo, useState } from "react";

const PURPLE = "#a855f7";
const CYAN   = "#22d3ee";
const AMBER  = "#fbbf24";
const RED    = "#ef4444";
const GREEN  = "#10b981";
const CARD_BG = "rgba(255,255,255,0.04)";
const BORDER  = "1px solid rgba(255,255,255,0.08)";

export default function CinemaCashierKPI({ apiBase = "" }) {
  const API = apiBase || (typeof window !== "undefined" && window.location.origin) || "";
  const [period, setPeriod] = useState("week");
  const [outlet, setOutlet] = useState("");
  const [loading, setLoading] = useState(false);
  const [leaders, setLeaders] = useState([]);
  const [selected, setSelected] = useState(null); // cashier name → drill-down ratings
  const [detail, setDetail] = useState([]);
  const [outlets, setOutlets] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ period });
      if (outlet) qs.set("outlet", outlet);
      const r = await fetch(`${API}/api/cinema/cashier-rating/leaderboard?${qs}`);
      const j = await r.json();
      setLeaders(Array.isArray(j?.data) ? j.data : (Array.isArray(j) ? j : []));
    } catch (e) { console.error(e); setLeaders([]); }
    setLoading(false);
  };

  const loadDetail = async (name) => {
    setSelected(name);
    try {
      const r = await fetch(`${API}/api/cinema/cashier-rating?cashier=${encodeURIComponent(name)}`);
      const j = await r.json();
      setDetail(Array.isArray(j?.data) ? j.data : (Array.isArray(j) ? j : []));
    } catch { setDetail([]); }
  };

  const loadOutlets = async () => {
    try {
      const r = await fetch(`${API}/api/outlets`);
      const j = await r.json();
      setOutlets(Array.isArray(j?.outlets) ? j.outlets : (Array.isArray(j?.data) ? j.data : []));
    } catch { setOutlets([]); }
  };

  useEffect(() => { loadOutlets(); }, []);
  useEffect(() => { load(); }, [period, outlet]);

  const summary = useMemo(() => {
    if (!leaders.length) return null;
    const totalRatings = leaders.reduce((s, x) => s + (x.total_ratings || 0), 0);
    const weightedAvg = totalRatings
      ? leaders.reduce((s, x) => s + (x.avg_rating || 0) * (x.total_ratings || 0), 0) / totalRatings
      : 0;
    const top = leaders[0];
    const lowAlerts = leaders.filter(x => (x.avg_rating || 0) < 3.5 && (x.total_ratings || 0) >= 3);
    return { totalRatings, weightedAvg, top, lowAlerts, count: leaders.length };
  }, [leaders]);

  return (
    <div style={{ padding: 20, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / CINEMA / KPI</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5 }}>👤 Cashier KPI Leaderboard</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Customer rating dari mobile feedback page (post-transaksi)</div>
      </header>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, padding: 4, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
          {[["today", "Hari Ini"], ["week", "7 Hari"], ["month", "30 Hari"], ["all", "Semua"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setPeriod(k)} style={pillBtn(period === k)}>{lbl}</button>
          ))}
        </div>
        <select value={outlet} onChange={e => setOutlet(e.target.value)} style={selStyle}>
          <option value="">All Outlets</option>
          {outlets.map(o => <option key={o.code || o.id} value={o.code || o.name}>{o.name || o.code}</option>)}
        </select>
        <button onClick={load} style={pillBtn(false)}>{loading ? "⏳" : "↻"} Refresh</button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 18 }}>
          <KPICard icon="⭐" label="AVG RATING" value={summary.weightedAvg.toFixed(2)} sub={`dari ${summary.totalRatings} review`} color={AMBER} />
          <KPICard icon="👥" label="KASIR AKTIF" value={summary.count} sub="periode ini" color={CYAN} />
          <KPICard icon="🏆" label="TOP PERFORMER" value={summary.top?.cashier_name || "—"} sub={summary.top ? `${(summary.top.avg_rating || 0).toFixed(2)}★ • ${summary.top.total_ratings}×` : "—"} color={GREEN} />
          <KPICard icon="⚠️" label="LOW PERFORMER" value={summary.lowAlerts.length} sub="butuh training" color={summary.lowAlerts.length ? RED : "#475569"} />
        </div>
      )}

      {/* Low alert banner */}
      {summary?.lowAlerts.length > 0 && (
        <div style={{ padding: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 12, marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: RED, fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>⚠ TRAINING ALERT</div>
          <div style={{ fontSize: 13, color: "#fca5a5", lineHeight: 1.5 }}>
            {summary.lowAlerts.map(x => x.cashier_name).join(", ")} di bawah <b>3.5★</b> dengan ≥3 review — review feedback + coaching diperlukan.
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div style={{ background: CARD_BG, border: BORDER, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: BORDER, fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, display: "grid", gridTemplateColumns: "40px 1fr 90px 90px 70px 70px 70px", gap: 8, alignItems: "center" }}>
          <div>#</div>
          <div>KASIR</div>
          <div style={{ textAlign: "right" }}>RATING</div>
          <div style={{ textAlign: "right" }}>TOTAL</div>
          <div style={{ textAlign: "right" }}>5★</div>
          <div style={{ textAlign: "right" }}>≤2★</div>
          <div style={{ textAlign: "right" }}>DETAIL</div>
        </div>
        {loading && <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>⏳ Loading…</div>}
        {!loading && leaders.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 13 }}>No rating untuk periode ini</div>
          </div>
        )}
        {!loading && leaders.map((c, i) => (
          <div key={c.cashier_name + i} style={{
            padding: "14px 16px",
            borderBottom: i === leaders.length - 1 ? "none" : "1px solid rgba(255,255,255,0.04)",
            display: "grid", gridTemplateColumns: "40px 1fr 90px 90px 70px 70px 70px", gap: 8, alignItems: "center",
            background: i === 0 ? "linear-gradient(90deg,rgba(16,185,129,0.08),transparent)" : "transparent",
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? GREEN : i === 1 ? "#cbd5e1" : i === 2 ? "#d97706" : "#64748b" }}>
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{c.cashier_name}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{c.last_outlet || "—"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: ratingColor(c.avg_rating) }}>
                {(c.avg_rating || 0).toFixed(2)}<span style={{ fontSize: 12, opacity: 0.7 }}> ★</span>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 14, color: "#cbd5e1", fontVariantNumeric: "tabular-nums" }}>{c.total_ratings}</div>
            <div style={{ textAlign: "right", fontSize: 14, color: GREEN, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{c.five_star || 0}</div>
            <div style={{ textAlign: "right", fontSize: 14, color: (c.low_star || 0) > 0 ? RED : "#475569", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{c.low_star || 0}</div>
            <div style={{ textAlign: "right" }}>
              <button onClick={() => loadDetail(c.cashier_name)} style={{ padding: "6px 10px", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 6, color: PURPLE, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>VIEW</button>
            </div>
          </div>
        ))}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", justifyContent: "flex-end", zIndex: 9999 }} onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "min(520px, 92vw)", height: "100%", background: "#0a0f1c", borderLeft: "1px solid rgba(255,255,255,0.1)", padding: 20, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: CYAN, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>CASHIER DETAIL</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{selected}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ width: 36, height: 36, borderRadius: 8, border: BORDER, background: "transparent", color: "#fff", fontSize: 20, cursor: "pointer" }}>×</button>
            </div>
            {detail.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#64748b" }}>No review</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {detail.map((r, i) => (
                  <div key={i} style={{ padding: 14, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 18, color: ratingColor(r.rating), fontWeight: 900 }}>{"★".repeat(r.rating)}<span style={{ opacity: 0.2 }}>{"★".repeat(5 - r.rating)}</span></div>
                      <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Geist Mono',monospace" }}>{new Date((r.created_at || 0) * 1000).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</div>
                    </div>
                    {r.comment && <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.5, marginTop: 6, fontStyle: "italic" }}>"{r.comment}"</div>}
                    <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 11, color: "#64748b" }}>
                      {r.purchase_id && <span>📋 {r.purchase_id}</span>}
                      {r.outlet && <span>📍 {r.outlet}</span>}
                      {r.customer_name && <span>👤 {r.customer_name}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({ icon, label, value, sub, color }) {
  return (
    <div style={{ padding: 14, background: CARD_BG, border: BORDER, borderRadius: 12 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{icon} {label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, marginTop: 6, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function pillBtn(active) {
  return {
    padding: "8px 14px",
    background: active ? PURPLE : "transparent",
    border: "none", borderRadius: 8,
    color: active ? "#fff" : "#94a3b8",
    fontSize: 12, fontWeight: 700, fontFamily: "inherit",
    cursor: "pointer", letterSpacing: 0.5,
  };
}

const selStyle = {
  padding: "8px 12px", background: CARD_BG, border: BORDER, borderRadius: 8,
  color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer",
};

function ratingColor(r) {
  if (r >= 4.5) return GREEN;
  if (r >= 4.0) return AMBER;
  if (r >= 3.5) return "#f97316";
  return RED;
}
