// src/CommandAnalytics.jsx
// Command Center — Analytics + AI Insight (Level 4).
// Tren 14 hari, pola hari & jam, insight otomatis (rule-based).

import { useState, useEffect, useCallback } from "react";
import { ErrorInline } from "./components/ConnectionError.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const MONO = "var(--m)";
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "jt" : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(n || 0));
const TONE = { good: "#10b981", bad: "#ef4444", info: "#22d3ee" };

export default function CommandAnalytics() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`${API}/api/analytics`).then(r => r.json()).then(j => j && !j.error ? setD(j) : setErr((j && j.error) || "data tidak tersedia")).catch(e => setErr(String(e)));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  if (err) return <div style={{ padding: 20 }}><ErrorInline error={err} onRetry={load} /></div>;
  if (!d) return <div style={S.msg}>Memuat Analytics…</div>;
  const s = d.summary;
  const maxRev = Math.max(1, ...d.series.map(x => x.revenue));
  const maxDow = Math.max(1, ...d.dow.map(x => x.avg_revenue));
  const maxHour = Math.max(1, ...d.hourly.map(x => x.revenue));

  return (
    <div style={S.wrap}>
      <div style={S.kpiRow}>
        <Kpi label="Minggu Ini" value={"Rp " + fmtK(s.this_week)} accent="#10b981" sub="7 hari terakhir" />
        <Kpi label="vs Minggu Lalu"
          value={s.wow_pct == null ? "—" : (s.wow_pct >= 0 ? "+" : "") + s.wow_pct + "%"}
          accent={(s.wow_pct || 0) >= 0 ? "#10b981" : "#ef4444"}
          sub={s.wow_pct == null ? "no data" : "week-over-week"} />
        <Kpi label="Rata-rata Harian" value={"Rp " + fmtK(s.avg_daily)} accent="#3b82f6" sub="basis 14 hari" />
        <Kpi label="Proyeksi Besok" value={"Rp " + fmtK(s.forecast_tomorrow)} accent="#a78bfa" sub="dari pola historis" />
      </div>

      <div style={{ ...S.card, borderColor: "#a78bfa44" }}>
        <div style={S.kicker}>🤖 AI INSIGHT — POLA &amp; REKOMENDASI OTOMATIS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 10 }}>
          {d.insights.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 10, background: "#080a0f", border: "1px solid #21262d", borderLeft: `3px solid ${TONE[it.tone] || "#22d3ee"}`, borderRadius: 8, padding: "10px 12px" }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{it.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#e4e4e7" }}>{it.title}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, lineHeight: 1.45 }}>{it.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.kicker}>📈 TREN PENJUALAN — 14 HARI</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 160 }}>
          {d.series.map((x, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 9, color: "#666", fontFamily: MONO }}>{x.revenue > 0 ? fmtK(x.revenue) : ""}</div>
              <div title={`${x.label}: Rp ${x.revenue.toLocaleString("id-ID")}`}
                style={{ width: "100%", height: Math.max(2, Math.round(x.revenue / maxRev * 118)), background: i === d.series.length - 1 ? "#fbbf24" : "#3b82f6", borderRadius: "3px 3px 0 0" }} />
              <div style={{ fontSize: 9, color: "#777", fontFamily: MONO }}>{x.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={S.card}>
          <div style={S.kicker}>📅 POLA HARI — RATA-RATA PENJUALAN</div>
          {d.dow.map(x => (
            <div key={x.dow} style={S.barRow}>
              <span style={{ width: 56, fontSize: 12, color: "#aaa", flexShrink: 0 }}>{x.label}</span>
              <div style={{ flex: 1, height: 14, background: "#161b22", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(x.avg_revenue / maxDow * 100) + "%", background: "#34d399" }} />
              </div>
              <span style={{ width: 56, textAlign: "right", fontSize: 11, fontFamily: MONO, color: "#ddd", flexShrink: 0 }}>{fmtK(x.avg_revenue)}</span>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <div style={S.kicker}>🕐 POLA JAM — PENJUALAN PER JAM</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 150 }}>
            {d.hourly.map(x => (
              <div key={x.hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div title={`${x.hour}.00: Rp ${x.revenue.toLocaleString("id-ID")}`}
                  style={{ width: "100%", height: Math.max(2, Math.round(x.revenue / maxHour * 108)), background: "#f59e0b", borderRadius: "2px 2px 0 0" }} />
                <div style={{ fontSize: 8, color: "#777", fontFamily: MONO }}>{x.hour}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, sub }) {
  return (
    <div style={{ ...S.kpi, borderTop: `2px solid ${accent}` }}>
      <div style={{ fontSize: 10, color: "#666", letterSpacing: 1, textTransform: "uppercase", fontFamily: MONO }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent, fontFamily: MONO, margin: "5px 0 2px" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#777" }}>{sub}</div>
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  msg: { padding: 40, textAlign: "center", color: "#666", fontSize: 14 },
  card: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 14, padding: 18 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#888", fontFamily: MONO, marginBottom: 14 },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  kpi: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: "12px 14px" },
  barRow: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0" },
};
