// src/Admin/AdminSalesInvoice.jsx
// Sales Invoice — faktur penjualan B2B + pencatatan pembayaran.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#4338ca";
const STAT = { unpaid: { c: "#ef4444", l: "BELUM BAYAR" }, partial: { c: "#f59e0b", l: "SEBAGIAN" }, paid: { c: "#10b981", l: "LUNAS" } };

export default function AdminSalesInvoice({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/sales-invoice`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const pay = (inv) => {
    const a = window.prompt(`Catat pembayaran — ${inv.invoice_no}\nTotal ${fmtRp(inv.total)} · sisa ${fmtRp(inv.outstanding)}\n\nJumlah bayar:`, String(inv.outstanding));
    if (a == null || !(Number(a) > 0)) return;
    fetch(`${apiBase}/api/sales-invoice/${inv.id}/pay`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(a) }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${inv.invoice_no} — ${j.status} · sisa ${fmtRp(j.outstanding)}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Sales Invoice…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🧾 <b style={{ color: "#818cf8" }}>SALES INVOICE</b> — faktur penjualan B2B. Posting ke COA,
        pencatatan pembayaran (B2B Payment) → lunasin Piutang Usaha (AR).
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Invoice" v={String(s.total)} c={AC} />
        <Kpi label="Belum Lunas" v={String(s.unpaid)} c={s.unpaid > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="AR Outstanding" v={fmtRp(s.ar_outstanding)} c="#ef4444" />
        <Kpi label="Jatuh Tempo Lewat" v={String(s.overdue)} c={s.overdue > 0 ? "#ef4444" : "#10b981"} />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🧾 DAFTAR INVOICE — {d.invoices.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.invoices.map(inv => {
            const st = STAT[inv.status] || STAT.unpaid;
            return (
              <div key={inv.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "11px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{inv.invoice_no} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {inv.customer_name}</span></div>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>
                      {inv.so_ref} · {inv.payment_terms}{inv.overdue ? " · ⚠ TELAT" : ""} · sisa {fmtRp(inv.outstanding)}
                    </div>
                  </div>
                  <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, color: "#818cf8", width: 120, textAlign: "right" }}>{fmtRp(inv.total)}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "2px 8px", fontFamily: "'Space Mono',monospace" }}>{st.l}</span>
                  {inv.status !== "paid" && <button onClick={() => pay(inv)} style={S.act}>💵 Catat Bayar</button>}
                  <button onClick={() => setOpen(open === inv.id ? null : inv.id)} style={S.btnGhost}>{open === inv.id ? "▲" : "▼ COA"}</button>
                </div>
                {open === inv.id && (
                  <div style={{ marginTop: 9, background: "#0d1117", border: "1px solid #161b22", borderRadius: 7, padding: "9px 11px" }}>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace", marginBottom: 5 }}>POSTING JURNAL → CHART OF ACCOUNTS</div>
                    {inv.coa_posting.map((l, i) => (
                      <div key={i} style={{ display: "flex", fontSize: 11, padding: "2px 0", fontFamily: "'Space Mono',monospace" }}>
                        <span style={{ width: 60, color: "#60a5fa" }}>{l.code}</span>
                        <span style={{ flex: 1, color: "#cdd5df", paddingLeft: l.credit > 0 ? 20 : 0 }}>{l.account}</span>
                        <span style={{ width: 110, textAlign: "right", color: "#10b981" }}>{l.debit > 0 ? fmtRp(l.debit) : ""}</span>
                        <span style={{ width: 110, textAlign: "right", color: "#f59e0b" }}>{l.credit > 0 ? fmtRp(l.credit) : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
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
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  act: { background: "#4338ca", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnGhost: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "6px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
