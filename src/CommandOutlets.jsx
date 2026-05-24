// src/CommandOutlets.jsx
// Command Center — Multi-Outlet Overview.
// Owner multi-cabang lihat semua outlet sekaligus, dikelompokin per Area.

import { useState, useEffect, useCallback } from "react";
import CommandOutletDetail from "./CommandOutletDetail.jsx";
import { ErrorInline } from "./components/ConnectionError.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const MONO = "var(--m)";

const STATUS = {
  healthy:   { col: "#10b981", dot: "🟢" },
  attention: { col: "#f59e0b", dot: "🟡" },
  critical:  { col: "#ef4444", dot: "🔴" },
};
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "jt"
  : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(n || 0));

export default function CommandOutlets() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(() => {
    fetch(`${API}/api/outlets`).then(r => r.json()).then(j => j && !j.error ? setD(j) : setErr((j && j.error) || "data tidak tersedia")).catch(e => setErr(String(e)));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (selectedId) return <CommandOutletDetail outletId={selectedId} onBack={() => setSelectedId(null)} />;
  if (err) return <div style={{ padding: 20 }}><ErrorInline error={err} onRetry={load} /></div>;
  if (!d) return <div style={S.msg}>Memuat overview cabang…</div>;
  const s = d.summary;

  return (
    <div style={S.wrap}>
      <div style={S.kpiRow}>
        <Kpi label="Total Outlet" value={String(s.total)} accent="#3b82f6" sub={`tersebar di ${s.areas} area`} />
        <Kpi label="Revenue Hari Ini" value={"Rp " + fmtK(s.total_revenue)} accent="#10b981" sub="gabungan semua cabang" />
        <Kpi label="Outlet Sehat" value={`${s.healthy}/${s.total}`} accent="#10b981" sub="health score ≥ 80" />
        <Kpi label="Perlu Perhatian" value={String(s.attention + s.critical)}
          accent={s.critical > 0 ? "#ef4444" : "#f59e0b"}
          sub={s.critical > 0 ? `${s.critical} kritis 🔴` : "perlu dipantau"} />
      </div>

      {d.areas.map(a => (
        <div key={a.area} style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={S.kicker}>📍 AREA {a.area.toUpperCase()}</div>
            <div style={{ fontSize: 12, color: "#888", fontFamily: MONO }}>{a.outlets.length} outlet · Rp {fmtK(a.revenue)}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(266px,1fr))", gap: 12 }}>
            {a.outlets.map(o => {
              const st = STATUS[o.status] || STATUS.attention;
              return (
                <div key={o.id} onClick={() => setSelectedId(o.id)}
                  style={{ ...S.outlet, borderLeft: `3px solid ${st.col}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>{st.dot}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#e4e4e7", flex: 1 }}>{o.name}</span>
                    {o.is_flagship ? <span style={{ fontSize: 9, color: "#fbbf24", fontFamily: MONO, letterSpacing: 0.5 }}>★ FLAGSHIP</span> : null}
                  </div>
                  <div style={{ fontSize: 11, color: "#777", marginBottom: 10 }}>👤 {o.manager}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Metric label="Revenue" value={"Rp " + fmtK(o.revenue_today)}
                      extra={<span style={{ color: o.growth_pct >= 0 ? "#10b981" : "#ef4444" }}>{o.growth_pct >= 0 ? "+" : ""}{o.growth_pct}%</span>} />
                    <Metric label="Health" value={String(o.health_score)} valColor={st.col} />
                    <Metric label="Issue Open" value={String(o.open_issues)}
                      valColor={o.open_issues >= 8 ? "#ef4444" : o.open_issues >= 4 ? "#f59e0b" : "#10b981"} />
                    <Metric label="Staff" value={String(o.staff_count)} />
                  </div>
                  <div style={{ textAlign: "right", fontSize: 10, color: "#71717a", fontFamily: MONO, marginTop: 9 }}>lihat detail →</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, valColor, extra }) {
  return (
    <div style={{ background: "#080a0f", border: "1px solid #21262d", borderRadius: 8, padding: "7px 9px" }}>
      <div style={{ fontSize: 9, color: "#666", fontFamily: MONO, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: valColor || "#e4e4e7" }}>{value} {extra}</div>
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
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#888", fontFamily: MONO },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  kpi: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: "12px 14px" },
  outlet: { background: "#080a0f", border: "1px solid #21262d", borderRadius: 12, padding: "12px 14px" },
};
