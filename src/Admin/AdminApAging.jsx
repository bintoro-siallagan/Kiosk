// src/Admin/AdminApAging.jsx
// AP Aging — Hutang Usaha (Accounts Payable) aging.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtJt = (n) => (n / 1e6).toFixed(1) + " jt";
const AC = "#dc2626";
const BUCKET_C = { "Belum Jatuh Tempo": "#10b981", "1-30 Hari": "#f59e0b", "31-60 Hari": "#fb7185", ">60 Hari": "#ef4444" };

export default function AdminApAging({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/ap-aging`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const pay = (p) => {
    fetch(`${apiBase}/api/ap-aging/${p.id}/pay`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: p.outstanding }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${p.invoice_no} dibayar — ${j.status}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat AP Aging…</div>;
  const s = d.summary;
  const maxB = Math.max(1, ...d.buckets.map(b => b.total));

  return (
    <div>
      <div style={S.intro}>
        📑 <b style={{ color: "#f87171" }}>AP AGING — HUTANG USAHA</b> — aging report hutang ke vendor
        per bucket umur. Counterpart dari AR, kunci buat cash management.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Hutang" v={fmtRp(s.total_outstanding)} c={AC} />
        <Kpi label="Lewat Jatuh Tempo" v={fmtRp(s.overdue_total)} c={s.overdue_total > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Invoice Telat" v={String(s.overdue_count)} c={s.overdue_count > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Jumlah Vendor" v={String(s.vendor_count)} c="#3b82f6" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📊 AGING BUCKET</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.buckets.map(b => (
            <div key={b.bucket} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 150, fontSize: 11.5, color: BUCKET_C[b.bucket], fontWeight: 600 }}>{b.bucket}</span>
              <div style={{ flex: 1, height: 16, background: "#0a0e16", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.max(b.total / maxB * 100, b.total > 0 ? 3 : 0) + "%", background: BUCKET_C[b.bucket] }} />
              </div>
              <span style={{ width: 110, textAlign: "right", fontSize: 12, fontFamily: "'Geist Mono',monospace", color: "#cdd5df" }}>{fmtJt(b.total)}</span>
              <span style={{ width: 30, textAlign: "right", fontSize: 10, color: "#5b6470" }}>{b.count}×</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🧾 HUTANG VENDOR — {d.payables.length}</div>
        {msg ? <div style={{ fontSize: 12, margin: "8px 0", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["VENDOR", "INVOICE", "OUTSTANDING", "JATUH TEMPO", "BUCKET", ""].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.payables.map(p => (
              <tr key={p.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{p.vendor}</td>
                <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{p.invoice_no}</td>
                <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#cdd5df" }}>{fmtRp(p.outstanding)}</td>
                <td style={{ ...S.td, ...S.mono, color: p.overdue ? "#ef4444" : "#9da7b3" }}>{p.overdue ? `telat ${-p.days_to_due} hr` : `${p.days_to_due} hr lagi`}</td>
                <td style={S.td}><span style={{ fontSize: 9, fontWeight: 700, color: BUCKET_C[p.bucket], fontFamily: "'Geist Mono',monospace" }}>{p.bucket}</span></td>
                <td style={S.td}><button onClick={() => pay(p)} style={S.btn}>Bayar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
  btn: { background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
