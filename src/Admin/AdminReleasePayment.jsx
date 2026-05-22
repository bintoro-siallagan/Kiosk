// src/Admin/AdminReleasePayment.jsx
// Release Payment — pencairan pembayaran vendor.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#c2410c";
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminReleasePayment({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/release-payment`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const release = (p) => {
    if (busy) return;
    setBusy(p.id); setMsg("");
    fetch(`${apiBase}/api/release-payment/${p.id}/release`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ released_by: "Finance Director", payment_method: p.payment_method }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg(`✓ ${p.payee} — ${fmtRp(p.amount)} dicairkan`); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e))).finally(() => setBusy(null));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Release Payment…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        💸 <b style={{ color: "#fb923c" }}>RELEASE PAYMENT</b> — pencairan pembayaran ke vendor atas invoice
        yang sudah disetujui. Step terakhir Account Payable: approve → <b>release</b>.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Pending Release" v={String(s.pending_count)} c={AC} />
        <Kpi label="Total Harus Dibayar" v={fmtRp(s.pending_total)} c="#f59e0b" />
        <Kpi label="Jatuh Tempo Lewat" v={String(s.overdue)} c={s.overdue > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Dicairkan Bln Ini" v={fmtRp(s.released_month)} c="#10b981" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      {/* Pending */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>⏳ MENUNGGU PENCAIRAN — {d.pending.length}</div>
        {d.pending.length === 0 ? (
          <div style={{ fontSize: 12, color: "#10b981", padding: "10px 0" }}>✓ Tidak ada pembayaran tertunda.</div>
        ) : (
          <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
            {d.pending.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${p.overdue ? "#ef4444" : "#f59e0b"}`, borderRadius: 9, padding: "11px 14px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{p.payee}</div>
                  <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{p.release_no} · {p.invoice_ref} · {p.payment_method}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: p.overdue ? "#ef4444" : "#5b6470" }}>{p.overdue ? "⚠ TELAT — " : "tempo "}{fmtDate(p.due_date)}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#fb923c", fontFamily: "'Geist Mono',monospace", width: 140, textAlign: "right" }}>{fmtRp(p.amount)}</div>
                <button onClick={() => release(p)} disabled={busy === p.id} style={S.btn}>
                  {busy === p.id ? "Memproses…" : "💸 Release"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Released */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>✅ RIWAYAT PENCAIRAN — {d.released.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["NO", "PAYEE", "INVOICE", "JUMLAH", "METODE", "OLEH", "TGL CAIR"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.released.map(p => (
              <tr key={p.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#5b6470", fontSize: 10 }}>{p.release_no}</td>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{p.payee}</td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{p.invoice_ref}</td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#10b981" }}>{fmtRp(p.amount)}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{p.payment_method}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{p.released_by}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{fmtDate(p.released_at)}</td>
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
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "8px 8px" },
  btn: { background: "#c2410c", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
