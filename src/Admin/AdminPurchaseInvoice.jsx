// src/Admin/AdminPurchaseInvoice.jsx
// Purchase Invoice — finance tarik GD jadi invoice, indikator jatuh
// tempo, alur approval: Manager Purchase → CFO/Direksi → Finance bayar.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";
const ME = (typeof localStorage !== "undefined" && localStorage.getItem("adminName")) || "Manager";

const DUE = {
  lunas: { c: "#10b981", t: "✓ LUNAS" },
  aman: { c: "#10b981", t: "🟢 AMAN" },
  jatuh_tempo: { c: "#f59e0b", t: "🟡 JATUH TEMPO" },
  overdue: { c: "#ef4444", t: "🔴 OVERDUE" },
};

// langkah approval: from-status → {label, role}
const CHAIN = [
  { step: "approve", role: "Manager Purchase", byField: "approved_by", atField: "approved_at", reached: ["approved", "authorized", "paid"] },
  { step: "authorize", role: "CFO / Direksi", byField: "authorized_by", atField: "authorized_at", reached: ["authorized", "paid"] },
  { step: "pay", role: "Finance — Bayar", byField: "paid_by", atField: "paid_at", reached: ["paid"] },
];
const ACTIVE = { pending: "approve", approved: "authorize", authorized: "pay" };

export default function AdminPurchaseInvoice({ apiBase = "" }) {
  const [invoices, setInvoices] = useState([]);
  const [sources, setSources] = useState([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({});

  const load = useCallback(() => {
    fetch(`${apiBase}/api/purchase-invoice`).then(r => r.json()).then(d => setInvoices(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`${apiBase}/api/purchase-invoice/sources`).then(r => r.json()).then(d => setSources(Array.isArray(d) ? d : [])).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const setF = (gid, k, v) => setForm(s => ({ ...s, [gid]: { ...(s[gid] || {}), [k]: v } }));

  const createInv = (gd) => {
    const f = form[gd.id] || {};
    fetch(`${apiBase}/api/purchase-invoice`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gd_id: gd.id, supplier: f.supplier || gd.to_outlet, supplier_invoice_no: f.inv_no || "", due_days: Number(f.due_days) || 14 }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Invoice dibuat dari " + gd.gd_number); load(); } else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const act = (inv, step) => {
    fetch(`${apiBase}/api/purchase-invoice/${inv.id}/${step}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ by: ME }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ " + inv.invoice_number + " — " + step + " OK"); load(); } else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  return (
    <div>
      <div style={S.intro}>
        🧾 <b style={{ color: "#a78bfa" }}>PURCHASE INVOICE</b> — finance tarik Good Delivery jadi invoice
        (harga dari price list). Indikator jatuh tempo + alur approval:
        <b> Manager Purchase</b> approve → <b>CFO/Direksi</b> otorisasi → <b>Finance</b> bayar.
      </div>
      {msg ? <div style={{ ...S.card, marginBottom: 12, fontSize: 13, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      {/* SOURCES */}
      <div style={S.card}>
        <div style={S.kicker}>📥 TARIK GR → INVOICE — {sources.length} GD BELUM DI-INVOICE</div>
        {sources.length === 0 ? (
          <div style={{ color: "#5b6470", fontSize: 13, padding: "10px 0" }}>Semua GD sudah di-invoice.</div>
        ) : sources.map(gd => (
          <div key={gd.id} style={{ border: "1px solid #21262d", borderRadius: 8, padding: 11, marginTop: 9 }}>
            <div style={{ color: "#e6edf3", fontWeight: 700, fontSize: 13 }}>{gd.gd_number} → {gd.to_outlet} <span style={{ color: "#5b6470", fontWeight: 400 }}>· {gd.items.length} item</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.4fr 1fr auto", gap: 7, marginTop: 8 }}>
              <input placeholder="Supplier" value={(form[gd.id] || {}).supplier || ""} onChange={e => setF(gd.id, "supplier", e.target.value)} style={S.input} />
              <input placeholder="No. invoice vendor" value={(form[gd.id] || {}).inv_no || ""} onChange={e => setF(gd.id, "inv_no", e.target.value)} style={S.input} />
              <input placeholder="Tempo (hari)" type="number" value={(form[gd.id] || {}).due_days || ""} onChange={e => setF(gd.id, "due_days", e.target.value)} style={S.input} />
              <button onClick={() => createInv(gd)} style={S.btnPrimary}>Buat Invoice</button>
            </div>
          </div>
        ))}
      </div>

      {/* INVOICES */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🧾 DAFTAR INVOICE — {invoices.length}</div>
        {invoices.length === 0 ? (
          <div style={{ color: "#5b6470", fontSize: 13, padding: "10px 0" }}>Belum ada invoice.</div>
        ) : invoices.map(inv => {
          const due = DUE[inv.due_status] || DUE.aman;
          const activeStep = ACTIVE[inv.status];
          return (
            <div key={inv.id} style={{ border: "1px solid #21262d", borderRadius: 8, padding: 13, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#e6edf3", fontWeight: 700, fontSize: 14 }}>{inv.invoice_number}
                  <span style={{ color: "#9da7b3", fontWeight: 400, fontSize: 12 }}> · {inv.supplier}</span></span>
                <span style={{ color: due.c, fontSize: 11, fontWeight: 700 }}>{due.t}</span>
              </div>
              <div style={{ fontSize: 11, color: "#5b6470", marginTop: 2 }}>
                {inv.gd_number} · vendor inv: {inv.supplier_invoice_no || "—"} · jatuh tempo {fmtDate(inv.due_date)}
                {inv.status !== "paid" && inv.days_to_due != null
                  ? <span style={{ color: due.c }}> ({inv.days_to_due < 0 ? `telat ${-inv.days_to_due} hari` : `${inv.days_to_due} hari lagi`})</span>
                  : null}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 7, fontSize: 13 }}>
                <span style={{ color: "#9da7b3" }}>Subtotal {fmtRp(inv.subtotal)}</span>
                <span style={{ color: "#9da7b3" }}>PPN {fmtRp(inv.tax)}</span>
                <span style={{ color: "#a78bfa", fontWeight: 700 }}>TOTAL {fmtRp(inv.total)}</span>
              </div>

              {/* approval chain */}
              <div style={{ display: "flex", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
                {CHAIN.map((c, i) => {
                  const done = c.reached.includes(inv.status);
                  const isActive = activeStep === c.step;
                  return (
                    <div key={c.step} style={{ flex: "1 1 180px", background: "#0a0e16", border: `1px solid ${done ? "#10b98155" : isActive ? "#a78bfa55" : "#21262d"}`, borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>{i + 1}. {c.role.toUpperCase()}</div>
                      {done ? (
                        <div style={{ fontSize: 12, color: "#10b981", marginTop: 3 }}>✓ {inv[c.byField] || "OK"} · {fmtDate(inv[c.atField])}</div>
                      ) : isActive ? (
                        <button onClick={() => act(inv, c.step)} style={{ ...S.btnStep, marginTop: 4 }}>
                          {c.step === "pay" ? "💰 Bayar Sekarang" : c.step === "authorize" ? "✍ Otorisasi" : "✓ Approve"}
                        </button>
                      ) : (
                        <div style={{ fontSize: 11, color: "#5b6470", marginTop: 4 }}>menunggu…</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
  btnPrimary: { background: "#a78bfa", color: "#140a2e", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnStep: { background: "#a78bfa", color: "#140a2e", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" },
};
