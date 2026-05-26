// src/Admin/AdminFranchise.jsx
// Franchise Finance Layer — view HQ: royalty, franchise fee,
// consolidated reporting, perbandingan outlet.

import { useState, useEffect, useCallback } from "react";
import ReportActions from "./ReportActions.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export default function AdminFranchise({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/franchise`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Franchise Finance…</div>;
  const s = d.summary;
  const pct = Math.round(d.royalty_rate * 100);

  return (
    <div>
      <div style={S.intro}>
        🏛️ <b style={{ color: "#fbbf24" }}>FRANCHISE FINANCE LAYER</b> — view HQ: royalty <b>{pct}%</b> dari
        revenue outlet franchise, nilai franchise fee, consolidated reporting. Outlet flagship = HQ-owned (gak bayar royalty).
      </div>

      <ReportActions title="Franchise Finance" subtitle="Royalty & franchise fee per outlet"
        columns={["Outlet", "Area", "Tipe", "Revenue", "Royalty", "Franchise Fee", "Income to HQ"]}
        rows={d.outlets.map(o => [o.name, o.area, o.type, o.revenue, o.royalty, o.franchise_fee, o.hq_income])} />

      <div style={S.kpiRow}>
        <Kpi label="Network Revenue" v={fmtRp(s.network_revenue)} c="#3b82f6" sub={`${s.total_outlet} outlet`} />
        <Kpi label="Royalty Income — HQ" v={fmtRp(s.royalty_income)} c="#10b981" sub={`${pct}% revenue franchise`} />
        <Kpi label="Nilai Franchise Fee" v={fmtRp(s.franchise_fee_value)} c="#fbbf24" sub={`${s.franchise_count} kontrak`} />
        <Kpi label="Receipttur Outlet" v={`${s.hq_owned} / ${s.franchise_count}`} c="#a78bfa" sub="HQ-owned / franchise" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🏢 PER OUTLET — ROYALTY & FRANCHISE FEE</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["OUTLET", "TIPE", "REVENUE", `ROYALTY ${pct}%`, "FRANCHISE FEE", "→ INCOME KE HQ"].map(h => (
                <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.outlets.map((o, i) => {
              const hq = o.type === "HQ-Owned";
              return (
                <tr key={i} style={{ borderTop: "1px solid #161b22", fontSize: 13 }}>
                  <td style={S.td}>
                    <div style={{ color: "#e6edf3", fontWeight: 600 }}>{o.name}</div>
                    <div style={{ color: "#5b6470", fontSize: 11 }}>{o.area}</div>
                  </td>
                  <td style={S.td}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, fontFamily: "'Geist Mono',monospace",
                      background: hq ? "#2a2114" : "#14202a", color: hq ? "#fbbf24" : "#7cc4ff" }}>{o.type}</span>
                  </td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{fmtRp(o.revenue)}</td>
                  <td style={{ ...S.td, ...S.mono, color: o.royalty > 0 ? "#10b981" : "#5b6470" }}>{o.royalty > 0 ? fmtRp(o.royalty) : "—"}</td>
                  <td style={{ ...S.td, ...S.mono, color: o.franchise_fee > 0 ? "#fbbf24" : "#5b6470" }}>{o.franchise_fee > 0 ? fmtRp(o.franchise_fee) : "—"}</td>
                  <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: o.hq_income > 0 ? "#10b981" : "#5b6470" }}>{o.hq_income > 0 ? fmtRp(o.hq_income) : "milik HQ"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #21262d", fontSize: 13 }}>
              <td style={{ ...S.td, fontWeight: 700, color: "#e6edf3" }} colSpan={2}>TOTAL NETWORK</td>
              <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#3b82f6" }}>{fmtRp(s.network_revenue)}</td>
              <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#10b981" }}>{fmtRp(s.royalty_income)}</td>
              <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#fbbf24" }}>{fmtRp(s.franchise_fee_value)}</td>
              <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#10b981" }}>{fmtRp(s.royalty_income)}</td>
            </tr>
          </tfoot>
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
  mono: { fontFamily: "'Geist Mono',monospace" },
};
