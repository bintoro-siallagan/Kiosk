// src/Admin/AdminCoreTax.jsx
// Core Tax — PPN, PPh, faktur pajak & SPT Masa.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#b91c1c";
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";
const ST = { draft: "#f59e0b", reported: "#3b82f6", paid: "#10b981", siap: "#10b981", pending: "#f59e0b" };

export default function AdminCoreTax({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/core-tax`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const setStatus = (r, status) => {
    fetch(`${apiBase}/api/core-tax/${r.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).then(x => x.json()).then(j => { if (j.ok) { setMsg(`✓ ${r.label} → ${status}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Core Tax…</div>;
  const s = d.summary, ppn = d.ppn;

  return (
    <div>
      <div style={S.intro}>
        🧾 <b style={{ color: "#f87171" }}>CORE TAX</b> — modul perpajakan: PPN (keluaran/masukan), PPh
        (21 · 23 · 25 · final), faktur pajak &amp; SPT Masa. Kewajiban pajak · {d.period}.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Kewajiban Pajak" v={fmtRp(s.total_liability)} c={AC} />
        <Kpi label="PPN Kurang Bayar" v={fmtRp(s.ppn_payable)} c="#f59e0b" />
        <Kpi label="Total PPh" v={fmtRp(s.pph_total)} c="#3b82f6" />
        <Kpi label="Faktur Pajak Terbit" v={String(s.faktur_issued)} c="#10b981" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* PPN */}
        <div style={S.card}>
          <div style={S.kicker}>💎 PPN — PAJAK PERTAMBAHAN NILAI</div>
          <div style={{ marginTop: 10 }}>
            <Row label={`PPN Keluaran (DPP ${fmtRp(ppn.dpp_penjualan)})`} v={ppn.keluaran} c="#10b981" />
            <Row label="(−) PPN Masukan (kredit pajak)" v={-ppn.masukan} c="#f87171" />
            <Row label="PPN KURANG BAYAR" v={ppn.kurang_bayar} c="#f59e0b" bold />
          </div>
          <div style={{ fontSize: 11, color: "#5b6470", marginTop: 8 }}>
            Disetor ke negara via SPT Masa PPN. Tarif PPN 11%.
          </div>
        </div>
        {/* PPh */}
        <div style={S.card}>
          <div style={S.kicker}>📋 PPh — PAJAK PENGHASILAN</div>
          {d.pph.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
              <span style={{ flex: 1, color: "#e6edf3" }}>{p.label}</span>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#60a5fa" }}>{fmtRp(p.amount)}</span>
              <button onClick={() => setStatus(p, p.status === "paid" ? "draft" : "paid")}
                style={{ width: 76, fontSize: 9, fontWeight: 700, color: ST[p.status], background: ST[p.status] + "1f", border: `1px solid ${ST[p.status]}55`, borderRadius: 5, padding: "3px 6px", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
                {p.status.toUpperCase()}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* SPT */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📑 SPT MASA — pelaporan pajak bulanan</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10, marginTop: 10 }}>
          {d.spt.map((x, i) => (
            <div key={i} style={{ background: "#0a0e16", border: "1px solid #161b22", borderTop: `2px solid ${ST[x.status]}`, borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3" }}>{x.name}</div>
              <div style={{ fontSize: 10, color: "#5b6470" }}>{x.period} · jatuh tempo {fmtDate(x.due_date)}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: ST[x.status], fontFamily: "'Geist Mono',monospace", marginTop: 5 }}>
                {x.status === "siap" ? "● SIAP LAPOR" : "○ PERLU DILENGKAPI"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Records */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🗂️ RECORD PAJAK — {d.records.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["JENIS", "URAIAN", "DPP", "TARIF", "PAJAK", "STATUS"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.records.map(r => (
              <tr key={r.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, fontWeight: 700, color: "#f87171" }}>{r.tax_type}</td>
                <td style={{ ...S.td, color: "#e6edf3" }}>{r.label}</td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{r.dpp > 0 ? fmtRp(r.dpp) : "—"}</td>
                <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{r.rate > 0 ? r.rate + "%" : "—"}</td>
                <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#cdd5df" }}>{fmtRp(r.amount)}</td>
                <td style={S.td}><span style={{ fontSize: 9, fontWeight: 700, color: ST[r.status], fontFamily: "'Geist Mono',monospace" }}>{r.status.toUpperCase()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>
    </div>
  );
}

function Row({ label, v, c, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: bold ? "1px solid #21262d" : "none" }}>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 700 : 400, color: bold ? "#e6edf3" : "#9da7b3" }}>{label}</span>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace" }}>{fmtRp(v)}</span>
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
};
