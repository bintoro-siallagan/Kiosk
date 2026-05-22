// src/Admin/AdminCustomerIntel.jsx
// Customer Intelligence — RFM analysis, segmentasi & visit frequency.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const VISIT = {
  "first-time": { c: "#22d3ee", t: "First-time" },
  repeat: { c: "#3b82f6", t: "Repeat" },
  loyal: { c: "#10b981", t: "Loyal" },
  dormant: { c: "#ef4444", t: "Dormant" },
};
const scoreColor = (n) => (n >= 4 ? "#10b981" : n >= 3 ? "#f59e0b" : "#ef4444");

export default function AdminCustomerIntel({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/customer-intel`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Customer Intelligence…</div>;
  const s = d.summary;
  const vf = d.visit_frequency;
  const maxVf = Math.max(1, ...Object.values(vf));

  return (
    <div>
      <div style={S.intro}>
        🎯 <b style={{ color: "#d946ef" }}>CUSTOMER INTELLIGENCE</b> — RFM analysis (Recency · Frequency ·
        Monetary), segmentasi &amp; visit frequency. Fondasi marketing: kenali champion, at-risk &amp; dormant.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Customer" v={String(s.total)} c="#d946ef" sub="punya histori kunjungan" />
        <Kpi label="Champions" v={String(s.champions)} c="#fbbf24" sub="pelanggan terbaik" />
        <Kpi label="At Risk" v={String(s.at_risk)} c="#f59e0b" sub="perlu win-back" />
        <Kpi label="Dormant" v={String(s.dormant)} c={s.dormant > 0 ? "#ef4444" : "#10b981"} sub="perlu comeback" />
      </div>

      {/* RFM segments */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🧩 SEGMENTASI RFM — {d.segments.length} segmen</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10, marginTop: 10 }}>
          {d.segments.map(g => (
            <div key={g.name} style={{ background: "#0a0e16", border: "1px solid #161b22", borderTop: `2px solid ${g.color}`, borderRadius: 9, padding: "11px 13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: g.color }}>{g.icon} {g.name}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#e6edf3", fontFamily: "'Geist Mono',monospace" }}>{g.count}</span>
              </div>
              <div style={{ fontSize: 11, color: "#9da7b3", marginTop: 4, lineHeight: 1.5 }}>{g.action}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Visit frequency */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🔁 VISIT FREQUENCY</div>
        {Object.entries(vf).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
            <span style={{ width: 100, fontSize: 12, color: (VISIT[k] || {}).c }}>{(VISIT[k] || {}).t || k}</span>
            <div style={{ flex: 1, height: 12, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: Math.round(v / maxVf * 100) + "%", background: (VISIT[k] || {}).c }} />
            </div>
            <span style={{ width: 40, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Customer list */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>👤 CUSTOMER — RFM SCORE ({d.customers.length})</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["CUSTOMER", "R", "F", "M", "SEGMEN", "RECENCY", "VISITS", "SPENDING"].map(h => (
                <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.customers.map((c, i) => (
              <tr key={i} style={{ borderTop: "1px solid #161b22", fontSize: 13 }}>
                <td style={S.td}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{c.name}</div>
                  <div style={{ color: "#5b6470", fontSize: 11, fontFamily: "'Geist Mono',monospace" }}>{c.phone}</div>
                </td>
                {[c.r, c.f, c.m].map((sc, j) => (
                  <td key={j} style={S.td}>
                    <span style={{ display: "inline-block", width: 20, height: 20, lineHeight: "20px", textAlign: "center", borderRadius: 5, fontSize: 11, fontWeight: 700, color: "#0a0e16", background: scoreColor(sc), fontFamily: "'Geist Mono',monospace" }}>{sc}</span>
                  </td>
                ))}
                <td style={S.td}><span style={{ fontSize: 11, fontWeight: 700, color: (d.segments.find(g => g.name === c.segment) || {}).color || "#9ca3af" }}>{c.segment}</span></td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{c.recency_days} hari lalu</td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{c.frequency}×</td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#d946ef" }}>{fmtRp(c.monetary)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "9px 8px" },
};
