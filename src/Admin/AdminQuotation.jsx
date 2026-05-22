// src/Admin/AdminQuotation.jsx
// Quotation — penawaran harga B2B sebelum jadi Sales Order.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#6366f1";
const STAT = { draft: { c: "#f59e0b", l: "DRAFT" }, sent: { c: "#3b82f6", l: "TERKIRIM" }, accepted: { c: "#10b981", l: "DITERIMA" }, rejected: { c: "#ef4444", l: "DITOLAK" } };
const NEXT = { draft: ["sent", "Kirim"], sent: ["accepted", "Tandai Diterima"] };

export default function AdminQuotation({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/quotation`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const setStatus = (q, status) => {
    fetch(`${apiBase}/api/quotation/${q.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${q.quote_no} → ${status}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Quotation…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        💬 <b style={{ color: "#a5b4fc" }}>QUOTATION</b> — penawaran harga B2B sebelum jadi Sales Order.
        Draft → kirim → diterima/ditolak. Quotation diterima = siap di-convert ke SO.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Quotation" v={String(s.total)} c={AC} />
        <Kpi label="Masih Terbuka" v={String(s.open)} c="#f59e0b" />
        <Kpi label="Win Rate" v={s.win_rate + "%"} c="#10b981" />
        <Kpi label="Total Nilai" v={fmtRp(s.value)} c="#818cf8" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>💬 DAFTAR QUOTATION — {d.quotations.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.quotations.map(q => {
            const st = STAT[q.status] || STAT.draft, nx = NEXT[q.status];
            return (
              <div key={q.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{q.quote_no} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {q.customer_name}</span></div>
                  <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{q.customer_type} · {q.items.length} item{q.expired ? " · ⚠ EXPIRED" : ""}</div>
                </div>
                <span style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#818cf8", width: 120, textAlign: "right" }}>{fmtRp(q.total)}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "2px 8px", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                {nx && <button onClick={() => setStatus(q, nx[0])} style={S.act}>{nx[1]}</button>}
                {q.status === "sent" && <button onClick={() => setStatus(q, "rejected")} style={S.actX}>Tolak</button>}
              </div>
            );
          })}
        </div>
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
  act: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  actX: { background: "#ef444420", border: "1px solid #ef444455", color: "#f87171", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
