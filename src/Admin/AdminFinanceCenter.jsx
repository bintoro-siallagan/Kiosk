// src/Admin/AdminFinanceCenter.jsx
// Finance Command Center — semua angka finance dalam 1 layar hero:
// revenue, laba, cashflow, AP/AR, settlement, invoice, outlet.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "jt" : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(n || 0));

export default function AdminFinanceCenter({ apiBase = "" }) {
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/finance-center?days=${days}`)
      .then(r => r.json()).then(j => j && j.kpi ? setD(j) : setErr("data tidak tersedia"))
      .catch(e => setErr(String(e)));
  }, [apiBase, days]);
  useEffect(() => { setD(null); setErr(""); load(); }, [load]);

  if (err) return <div style={{ padding: 30, color: "#f87171" }}>Gagal memuat: {err}</div>;
  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Finance Center…</div>;
  const k = d.kpi;
  const maxRev = Math.max(1, ...d.outlets.map(o => o.revenue_today));

  return (
    <div>
      <div style={S.intro}>
        💹 <b style={{ color: "#10b981" }}>FINANCE COMMAND CENTER</b> — semua angka finance dalam 1 layar:
        revenue, laba, cashflow, AP/AR, settlement, invoice, outlet. Live &amp; nyambung ke POS · procurement · operation.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[7, 30, 90].map(x => (
          <button key={x} onClick={() => setDays(x)} style={days === x ? S.pillOn : S.pill}>{x} Hari</button>
        ))}
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Revenue" v={fmtRp(k.revenue)} c="#3b82f6" />
        <Kpi label="Laba Bersih" v={fmtRp(k.laba_bersih)} c={k.laba_bersih >= 0 ? "#10b981" : "#f87171"} sub={`margin ${k.margin_pct}%`} />
        <Kpi label="Total Beban" v={fmtRp(k.expense)} c="#f59e0b" />
        <Kpi label="Cashflow Bersih" v={fmtRp(k.cash_net)} c={k.cash_net >= 0 ? "#10b981" : "#f87171"} sub={`in ${fmtK(k.cash_in)} · out ${fmtK(k.cash_out)}`} />
        <Kpi label="Hutang — AP" v={fmtRp(k.ap_total)} c={k.ap_total > 0 ? "#ef4444" : "#10b981"} sub={`${k.ap_count} invoice`} />
        <Kpi label="Piutang — AR" v={fmtRp(k.ar_total)} c={k.ar_total > 0 ? "#3b82f6" : "#10b981"} sub="outstanding" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div style={S.card}>
          <div style={S.kicker}>🧮 SETTLEMENT</div>
          <Row k="Total transaksi (bruto)" v={fmtRp(d.settlement.total_gross)} />
          <Row k="Cash di laci — settle langsung" v={fmtRp(d.settlement.cash_in_hand)} c="#10b981" />
          <Row k="Pending settlement — nunggu payout" v={fmtRp(d.settlement.pending_settlement)} c="#f59e0b" />
        </div>
        <div style={S.card}>
          <div style={S.kicker}>🧾 INVOICE / ACCOUNTS PAYABLE</div>
          <Row k="Pending approval" v={String(d.invoices.pending)} />
          <Row k="Approved — Manager Purchase" v={String(d.invoices.approved)} />
          <Row k="Authorized — CFO / Direksi" v={String(d.invoices.authorized)} />
          <Row k="Lunas" v={String(d.invoices.paid)} c="#10b981" />
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🏢 REVENUE PER OUTLET — HARI INI</div>
        <div style={{ marginTop: 10 }}>
          {d.outlets.map((o, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
              <span style={{ width: 180, fontSize: 13, color: "#e6edf3", flexShrink: 0 }}>
                {o.name} <span style={{ color: "#5b6470", fontSize: 11 }}>· {o.area}</span>
              </span>
              <div style={{ flex: 1, height: 12, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(o.revenue_today / maxRev * 100) + "%", background: o.health_score >= 80 ? "#10b981" : o.health_score >= 60 ? "#f59e0b" : "#ef4444" }} />
              </div>
              <span style={{ width: 100, textAlign: "right", fontFamily: "'Space Mono',monospace", fontSize: 12, color: "#cdd5df", flexShrink: 0 }}>{fmtRp(o.revenue_today)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}
function Row({ k, v, c }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #161b22", fontSize: 13 }}>
      <span style={{ color: "#9da7b3" }}>{k}</span>
      <b style={{ color: c || "#e6edf3", fontFamily: "'Space Mono',monospace" }}>{v}</b>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 10 },
  pill: { background: "#0d1117", border: "1px solid #21262d", color: "#9da7b3", fontSize: 12, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" },
  pillOn: { background: "#10b981", border: "1px solid #10b981", color: "#04130d", fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" },
};
