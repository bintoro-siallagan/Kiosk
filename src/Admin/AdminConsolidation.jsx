// src/Admin/AdminConsolidation.jsx
// Konsolidasi — laporan keuangan gabungan multi-PT / multi-outlet.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtJt = (n) => (n / 1e6).toFixed(1) + " jt";
const AC = "#1e40af";

export default function AdminConsolidation({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/consolidation`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Konsolidasi…</div>;
  const s = d.summary, c = d.consolidated;
  const maxNP = Math.max(1, ...d.entities.map(e => e.net_profit));

  const Line = ({ label, v, bold, color, indent }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", paddingLeft: indent ? 16 : 0, borderTop: bold ? "1px solid #21262d" : "none" }}>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 700 : 400, color: bold ? "#e6edf3" : "#9da7b3" }}>{label}</span>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 800 : 600, color: color || (bold ? "#e6edf3" : "#cdd5df"), fontFamily: "'Space Mono',monospace" }}>{fmtRp(v)}</span>
    </div>
  );

  return (
    <div>
      <div style={S.intro}>
        🏛️ <b style={{ color: "#60a5fa" }}>KONSOLIDASI MULTI-ENTITAS</b> — laporan keuangan gabungan
        seluruh PT &amp; outlet. Consolidated P&amp;L + eliminasi transaksi antar-entitas (intercompany) · {d.period}.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Entitas (PT)" v={String(s.entities)} c={AC} />
        <Kpi label="Revenue Konsolidasi" v={fmtJt(s.consolidated_revenue)} c="#10b981" />
        <Kpi label="Net Profit Konsolidasi" v={fmtJt(s.consolidated_net_profit)} c="#3b82f6" />
        <Kpi label="Eliminasi Intercompany" v={fmtJt(s.elimination)} c="#f59e0b" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* Per-entity */}
        <div style={S.card}>
          <div style={S.kicker}>🏢 KONTRIBUSI PER ENTITAS</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
            <thead>
              <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
                {["ENTITAS", "REVENUE", "GROSS PROFIT", "NET PROFIT", "MARGIN"].map(h => <th key={h} style={{ padding: "6px 6px", fontWeight: 600 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {d.entities.map(e => (
                <tr key={e.code} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                  <td style={{ ...S.td }}>
                    <div style={{ color: "#e6edf3", fontWeight: 600 }}>{e.name}</div>
                    <div style={{ fontSize: 10, color: "#5b6470" }}>{e.outlets}</div>
                  </td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{fmtRp(e.revenue)}</td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{fmtRp(e.gross_profit)}</td>
                  <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#10b981" }}>{fmtRp(e.net_profit)}</td>
                  <td style={{ ...S.td, ...S.mono, color: e.margin_pct >= 20 ? "#10b981" : "#f59e0b" }}>{e.margin_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}>
            {d.entities.map(e => (
              <div key={e.code} style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 0" }}>
                <span style={{ width: 150, fontSize: 11, color: "#cdd5df" }}>{e.name.replace("PT Sour Sally ", "")}</span>
                <div style={{ flex: 1, height: 10, background: "#0a0e16", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: Math.round(e.net_profit / maxNP * 100) + "%", background: AC }} />
                </div>
                <span style={{ width: 60, textAlign: "right", fontSize: 11, fontFamily: "'Space Mono',monospace", color: "#60a5fa" }}>{fmtJt(e.net_profit)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Consolidated P&L */}
        <div style={S.card}>
          <div style={S.kicker}>📊 CONSOLIDATED P&L</div>
          <div style={{ marginTop: 10 }}>
            <Line label="Revenue Bruto (semua entitas)" v={c.revenue_gross} />
            <Line label="(−) Eliminasi Intercompany" v={-c.intercompany_elimination} color="#f59e0b" indent />
            <Line label="Revenue Konsolidasi" v={c.revenue_net} bold />
            <Line label="(−) HPP Konsolidasi" v={-c.cogs} color="#f87171" />
            <Line label="Gross Profit" v={c.gross_profit} bold color="#10b981" />
            <Line label="(−) Beban Operasional" v={-c.opex} color="#f87171" />
            <Line label="NET PROFIT KONSOLIDASI" v={c.net_profit} bold color="#10b981" />
          </div>
          <div style={{ marginTop: 10, textAlign: "center", background: "#0a0e16", border: "1px solid #161b22", borderRadius: 8, padding: "8px" }}>
            <span style={{ fontSize: 11, color: "#5b6470" }}>Net Margin Konsolidasi </span>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#10b981", fontFamily: "'Space Mono',monospace" }}>{c.margin_pct}%</span>
          </div>
        </div>
      </div>

      {/* Intercompany */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🔗 TRANSAKSI INTERCOMPANY — DIELIMINASI {d.intercompany.length}</div>
        {d.intercompany.map((x, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
            <span style={{ color: "#e6edf3", fontWeight: 600 }}>{x.from_name}</span>
            <span style={{ color: "#f59e0b" }}>→</span>
            <span style={{ color: "#e6edf3", fontWeight: 600 }}>{x.to_name}</span>
            <span style={{ flex: 1, color: "#5b6470", fontSize: 11 }}>{x.description}</span>
            <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, color: "#f59e0b" }}>−{fmtRp(x.amount)}</span>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "#5b6470", marginTop: 8, lineHeight: 1.5 }}>
          Penjualan antar-entitas (revenue penjual = HPP pembeli) dieliminasi dari konsolidasi —
          grup tidak menghitung penjualan internal sebagai pendapatan eksternal.
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 6px" },
  mono: { fontFamily: "'Space Mono',monospace" },
};
