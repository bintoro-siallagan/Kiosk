// src/CommandExecutive.jsx
// Executive Dashboard (Level 1) — Command Center landing page.
// Outlet Health Score + business summary + realtime incident timeline.
// "Owner buka 10 detik langsung ngerti."

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const MONO = "var(--m)";

const COL = { good: "#10b981", warn: "#f59e0b", bad: "#ef4444", info: "#3b82f6" };
const HEALTH = {
  healthy:   { col: "#10b981", emoji: "🟢", label: "HEALTHY" },
  attention: { col: "#f59e0b", emoji: "🟡", label: "NEED ATTENTION" },
  critical:  { col: "#ef4444", emoji: "🔴", label: "CRITICAL" },
};
const STATUS_ICON = { good: "✓", warn: "⚠", bad: "✕" };

// anomaly type → icon (mirror CommandCenter RULES)
const ICON = {
  cancel_event: "❌", refund_event: "↩️", no_manager_pin: "🔓", large_amount: "💸",
  high_rate: "📈", late_refund: "⏰", self_approval: "🪞", weak_reason: "📝",
  VOID_BOM: "💣", PHANTOM_CUP: "🥤", PROMO_ABUSE: "🏷️", POIN_DRAIN: "⭐",
  CASH_GAP: "💵", DISC_NOAUTH: "✂️", ODD_HOUR: "🌙", REFUND_LOOP: "🔄",
  CANCEL_PROD: "🚫", EMP_DISC: "👤", WASTE_SPIKE: "🗑️", STOCK_GHOST: "👻",
};
const SEV_COL = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#16a34a", info: "#3b82f6" };

const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "jt"
  : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(n || 0));

export default function CommandExecutive() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`${API}/api/executive`)
      .then(r => r.json())
      .then(setD)
      .catch(e => setErr(String(e)));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (err) return <div style={S.msg}>Gagal memuat executive dashboard: {err}</div>;
  if (!d) return <div style={S.msg}>Memuat executive dashboard…</div>;

  const { health, summary, timeline } = d;
  const h = HEALTH[health.status] || HEALTH.attention;
  const R = 60, C = 2 * Math.PI * R;

  return (
    <div style={S.wrap}>
      {/* ── OUTLET HEALTH SCORE ── */}
      <div style={{ ...S.card, borderColor: h.col + "55" }}>
        <div style={S.kicker}>🏆 OUTLET HEALTH SCORE</div>
        <div style={S.healthRow}>
          <div style={{ position: "relative", width: 150, height: 150, flexShrink: 0 }}>
            <svg width="150" height="150">
              <circle cx="75" cy="75" r={R} stroke="#15151e" strokeWidth="13" fill="none" />
              <circle cx="75" cy="75" r={R} stroke={h.col} strokeWidth="13" fill="none"
                strokeDasharray={C} strokeDashoffset={C * (1 - health.score / 100)}
                strokeLinecap="round" transform="rotate(-90 75 75)"
                style={{ transition: "stroke-dashoffset .6s ease" }} />
            </svg>
            <div style={S.gaugeCtr}>
              <div style={{ fontSize: 40, fontWeight: 800, color: h.col, fontFamily: MONO, lineHeight: 1 }}>{health.score}</div>
              <div style={{ fontSize: 11, color: "#666" }}>/ 100</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: h.col }}>{h.emoji} {h.label}</div>
            <div style={{ fontSize: 12, color: "#777", marginBottom: 12 }}>
              Skor gabungan SOP · Sales · Feedback · Stock · Issue · Staff
            </div>
            <div style={S.compGrid}>
              {health.components.map(c => (
                <div key={c.key} style={{ ...S.comp, borderColor: COL[c.status] + "44" }}>
                  <span style={{ color: COL[c.status], fontSize: 14, fontWeight: 700 }}>{STATUS_ICON[c.status]}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#ccc" }}>{c.label}</span>
                  <b style={{ fontFamily: MONO, color: COL[c.status], fontSize: 13 }}>{c.score}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── BUSINESS SUMMARY ── */}
      <div style={S.kpiRow}>
        <Kpi label="Total Sales Hari Ini" value={"Rp " + fmtK(summary.revenue)} accent="#10b981"
          sub={summary.channels
            ? `POS ${fmtK(summary.channels.pos)} + Aggregator ${fmtK(summary.channels.aggregator)}`
            : `${summary.transactions} transaksi`} />
        <Kpi label="Growth vs Kemarin"
          value={summary.growth_pct == null ? "—" : (summary.growth_pct >= 0 ? "+" : "") + summary.growth_pct + "%"}
          accent={(summary.growth_pct || 0) >= 0 ? "#10b981" : "#ef4444"}
          sub={summary.growth_pct == null ? "no data" : summary.growth_pct >= 0 ? "naik" : "turun"} />
        <Kpi label="Target Hari Ini"
          value={summary.target_pct == null ? "—" : summary.target_pct + "%"}
          accent={(summary.target_pct || 0) >= 80 ? "#10b981" : (summary.target_pct || 0) >= 50 ? "#f59e0b" : "#ef4444"}
          sub={summary.target ? fmtK(summary.target) + " target" : "blm diset"} />
        <Kpi label="Avg Transaksi" value={fmtK(summary.avg_trx)} accent="#3b82f6"
          sub={`online ${summary.online_pct}% · offline ${summary.offline_pct}%`} />
        <Kpi label="Issue Open" value={String(summary.open_issues)}
          accent={summary.critical_issues > 0 ? "#ef4444" : summary.open_issues > 0 ? "#f59e0b" : "#10b981"}
          sub={summary.critical_issues > 0 ? `${summary.critical_issues} critical 🔴` : "aman"} />
      </div>

      {/* ── INCIDENT TIMELINE ── */}
      <div style={S.card}>
        <div style={S.kicker}>🕐 REALTIME INCIDENT TIMELINE</div>
        {timeline.length === 0 ? (
          <div style={{ color: "#555", fontSize: 13, padding: 10 }}>Belum ada incident hari ini</div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {timeline.map((e, i) => {
              const col = SEV_COL[e.severity] || COL.info;
              return (
                <div key={i} style={S.tlRow}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: "#888", width: 46, flexShrink: 0 }}>{e.time}</span>
                  <span style={{ width: 9, height: 9, borderRadius: 9, background: col, flexShrink: 0 }} />
                  <span style={{ flexShrink: 0, fontSize: 14 }}>{e.kind === "checklist" ? "✅" : (ICON[e.anomaly_type] || "⚠️")}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#d4d4d4" }}>{e.text}</span>
                  {e.severity && e.severity !== "info" && (
                    <span style={{ fontFamily: MONO, fontSize: 10, color: col, textTransform: "uppercase", letterSpacing: 1 }}>{e.severity}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, sub }) {
  return (
    <div style={{ ...S.kpi, borderTop: `2px solid ${accent}` }}>
      <div style={{ fontSize: 10, color: "#666", letterSpacing: 1, textTransform: "uppercase", fontFamily: MONO }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, fontFamily: MONO, margin: "5px 0 2px" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#777" }}>{sub}</div>
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  msg: { padding: 40, textAlign: "center", color: "#666", fontSize: 14 },
  card: { background: "#0e0e13", border: "1px solid #1c1c25", borderRadius: 14, padding: 18 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#888", fontFamily: MONO, marginBottom: 12 },
  healthRow: { display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" },
  gaugeCtr: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  compGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 },
  comp: { display: "flex", alignItems: "center", gap: 7, background: "#08080b", border: "1px solid #1c1c25", borderRadius: 8, padding: "7px 10px" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 12 },
  kpi: { background: "#0e0e13", border: "1px solid #1c1c25", borderRadius: 12, padding: "12px 14px" },
  tlRow: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #15151e" },
};
