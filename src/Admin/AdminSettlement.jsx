// src/Admin/AdminSettlement.jsx
// Settlement Report — semua transaksi POS & platform online ditarik
// buat rekonsiliasi finance. Per channel: bruto, fee/komisi, neto,
// status settlement.

import { useState, useEffect, useCallback } from "react";
import ReportActions from "./ReportActions.jsx";
import PeriodPicker from "./PeriodPicker.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export default function AdminSettlement({ apiBase = "" }) {
  const [range, setRange] = useState(() => {
    const t = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    return { from: t, to: Math.floor(Date.now() / 1000) };
  });
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    if (!range) return;
    setD(null); setErr("");
    fetch(`${apiBase}/api/settlement?from=${range.from}&to=${range.to}`)
      .then(r => r.json()).then(j => j && j.summary ? setD(j) : setErr("data tidak tersedia"))
      .catch(e => setErr(String(e)));
  }, [apiBase, range]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div style={{ padding: 30, color: "#f87171" }}>Gagal memuat: {err}</div>;
  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat settlement…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🧮 <b style={{ color: "#10b981" }}>SETTLEMENT</b> — semua transaksi ditarik buat rekonsiliasi:
        POS (tunai/QRIS/gateway) + platform online (GoFood/GrabFood/dll). <b>Neto</b> = revenue bersih
        yang masuk ke <b>Finance P&amp;L</b> (setelah MDR &amp; komisi platform).
      </div>

      <PeriodPicker onChange={setRange} defaultPreset="today" />

      <ReportActions title="Settlement" subtitle="Laporan settlement transaksi — POS & platform"
        columns={["Channel", "Grup", "Transaksi", "Bruto", "Fee/Komisi", "Neto", "Settlement"]}
        rows={d.channels.map(c => [c.channel, c.group, c.count, c.gross, c.fee, c.net, c.settle])} />

      <div style={S.kpiRow}>
        <Kpi label="Total Bruto" v={fmtRp(s.total_gross)} c="#3b82f6" sub={`${s.txn_count} transaksi`} />
        <Kpi label="Fee / Komisi" v={"− " + fmtRp(s.total_fee)} c="#ef4444" sub="MDR + komisi platform" />
        <Kpi label="Total Neto" v={fmtRp(s.total_net)} c="#10b981" sub="→ Finance P&L" />
        <Kpi label="Cash di Laci" v={fmtRp(s.cash_in_hand)} c="#22d3ee" sub="settle langsung" />
        <Kpi label="Pending Settlement" v={fmtRp(s.pending_settlement)} c="#f59e0b" sub="nunggu payout" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📋 RINCIAN PER CHANNEL</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["CHANNEL", "GRUP", "TRX", "BRUTO", "FEE / KOMISI", "NETO", "SETTLEMENT"].map(h => (
                <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.channels.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#5b6470" }}>Tidak ada transaksi di periode ini</td></tr>
            ) : d.channels.map((c, i) => (
              <tr key={i} style={{ borderTop: "1px solid #161b22", fontSize: 13 }}>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{c.channel}</td>
                <td style={S.td}>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, fontFamily: "'Space Mono',monospace",
                    background: c.group === "POS" ? "#1e3a5f" : "#3a2a1e", color: c.group === "POS" ? "#7cc4ff" : "#f0b86e" }}>{c.group}</span>
                </td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{c.count}</td>
                <td style={{ ...S.td, color: "#9da7b3", fontFamily: "'Space Mono',monospace" }}>{fmtRp(c.gross)}</td>
                <td style={{ ...S.td, color: c.fee > 0 ? "#f87171" : "#5b6470", fontFamily: "'Space Mono',monospace" }}>
                  {c.fee > 0 ? "− " + fmtRp(c.fee) : "—"} {c.fee > 0 ? <span style={{ color: "#5b6470", fontSize: 10 }}>({c.fee_pct}%)</span> : null}
                </td>
                <td style={{ ...S.td, color: "#10b981", fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{fmtRp(c.net)}</td>
                <td style={{ ...S.td, fontSize: 11, color: c.settled ? "#10b981" : "#f59e0b" }}>
                  {c.settled ? "✓ " : "⏳ "}{c.settle}
                </td>
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
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10 },
  td: { padding: "9px 8px" },
  pill: { background: "#0d1117", border: "1px solid #21262d", color: "#9da7b3", fontSize: 12, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" },
  pillOn: { background: "#10b981", border: "1px solid #10b981", color: "#04130d", fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" },
};
