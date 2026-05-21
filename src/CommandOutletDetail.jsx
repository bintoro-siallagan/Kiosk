// src/CommandOutletDetail.jsx
// Command Center — Outlet Detail drill-down (Level 3).
// Detail operasional satu cabang: health breakdown, sales, workforce,
// stock, issue.

import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const MONO = "var(--m)";
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "jt"
  : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(n || 0));
const STATUS = {
  healthy:   { col: "#10b981", dot: "🟢", label: "SEHAT" },
  attention: { col: "#f59e0b", dot: "🟡", label: "PERLU ATENSI" },
  critical:  { col: "#ef4444", dot: "🔴", label: "KRITIS" },
};
const SEV = { critical: "#ef4444", warning: "#f59e0b", info: "#3b82f6" };
const scoreCol = (s) => (s >= 80 ? "#10b981" : s >= 60 ? "#f59e0b" : "#ef4444");

export default function CommandOutletDetail({ outletId, onBack }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setD(null); setErr("");
    fetch(`${API}/api/outlets/${outletId}`).then(r => r.json())
      .then(j => j.error ? setErr(j.error) : setD(j))
      .catch(e => setErr(String(e)));
  }, [outletId]);

  if (err) return <div style={S.msg}>Gagal memuat detail: {err} <button onClick={onBack} style={S.back}>← Kembali</button></div>;
  if (!d) return <div style={S.msg}>Memuat detail outlet…</div>;
  const o = d.outlet;
  const st = STATUS[o.status] || STATUS.attention;

  return (
    <div style={S.wrap}>
      <button onClick={onBack} style={S.back}>← Semua Outlet</button>

      <div style={{ ...S.card, borderColor: st.col + "55" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: "#888", fontFamily: MONO, letterSpacing: 1 }}>📍 AREA {o.area.toUpperCase()}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 2 }}>
              {o.name}{" "}
              {o.is_flagship ? <span style={{ fontSize: 11, color: "#fbbf24", fontFamily: MONO }}>★ FLAGSHIP</span> : null}
            </div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>👤 Manager: {o.manager}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 46, fontWeight: 900, color: st.col, fontFamily: MONO, lineHeight: 1 }}>{o.health_score}</div>
            <div style={{ fontSize: 10, color: "#888", letterSpacing: 1 }}>HEALTH SCORE</div>
            <div style={{ fontSize: 11, color: st.col, fontWeight: 700, marginTop: 3 }}>{st.dot} {st.label}</div>
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.kicker}>💚 HEALTH BREAKDOWN — 6 KOMPONEN</div>
        {d.health_components.map(c => (
          <div key={c.key} style={S.barRow}>
            <span style={{ width: 160, fontSize: 12, color: "#ccc", flexShrink: 0 }}>{c.key}</span>
            <div style={{ flex: 1, height: 14, background: "#15151e", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: c.score + "%", background: scoreCol(c.score) }} />
            </div>
            <span style={{ width: 38, textAlign: "right", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: scoreCol(c.score), flexShrink: 0 }}>{c.score}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div style={S.card}>
          <div style={S.kicker}>💰 SALES HARI INI</div>
          <Big v={"Rp " + fmtK(d.sales.revenue)} c="#10b981" />
          <Row k="Growth vs kemarin" v={(d.sales.growth_pct >= 0 ? "+" : "") + d.sales.growth_pct + "%"} c={d.sales.growth_pct >= 0 ? "#10b981" : "#ef4444"} />
          <Row k="Capaian target" v={d.sales.target_pct + "%"} />
          <Row k="Transaksi" v={String(d.sales.transactions)} />
          <Row k="Avg bill" v={"Rp " + fmtK(d.sales.avg_bill)} />
        </div>
        <div style={S.card}>
          <div style={S.kicker}>👥 WORKFORCE</div>
          <Big v={d.workforce.on_duty + " / " + d.workforce.staff_count} c="#3b82f6" />
          <Row k="Total staff" v={String(d.workforce.staff_count)} />
          <Row k="On duty" v={String(d.workforce.on_duty)} />
          <Row k="Kehadiran" v={d.workforce.attendance_pct + "%"} c={d.workforce.attendance_pct >= 85 ? "#10b981" : "#f59e0b"} />
        </div>
        <div style={S.card}>
          <div style={S.kicker}>📦 STOCK & SUPPLY</div>
          <Big v={d.stock.total + " SKU"} c="#a78bfa" />
          <Row k="Aman" v={String(d.stock.ok)} c="#10b981" />
          <Row k="Menipis" v={String(d.stock.low)} c="#f59e0b" />
          <Row k="Kritis / habis" v={String(d.stock.critical)} c="#ef4444" />
        </div>
      </div>

      <div style={S.card}>
        <div style={S.kicker}>⚠️ ISSUE & RISK — {d.issues.open} OPEN · {d.issues.critical} KRITIS</div>
        {d.issues.recent.length === 0 ? (
          <div style={{ color: "#10b981", fontSize: 13 }}>✓ Tidak ada issue — outlet bersih</div>
        ) : d.issues.recent.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderBottom: "1px solid #15151e" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV[it.severity], flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "#ddd" }}>{it.text}</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: SEV[it.severity], fontFamily: MONO, textTransform: "uppercase" }}>{it.severity}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Big({ v, c }) {
  return <div style={{ fontSize: 24, fontWeight: 800, color: c, fontFamily: MONO, margin: "4px 0 8px" }}>{v}</div>;
}
function Row({ k, v, c }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #15151e", fontSize: 12 }}>
      <span style={{ color: "#888" }}>{k}</span>
      <b style={{ color: c || "#e4e4e7", fontFamily: MONO }}>{v}</b>
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  msg: { padding: 40, textAlign: "center", color: "#666", fontSize: 14 },
  card: { background: "#0e0e13", border: "1px solid #1c1c25", borderRadius: 14, padding: 18 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#888", fontFamily: MONO, marginBottom: 12 },
  barRow: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0" },
  back: { background: "#15151e", border: "1px solid #2a2a35", color: "#cbd5e1", fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 8, cursor: "pointer", alignSelf: "flex-start", fontFamily: MONO },
};
