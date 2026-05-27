// src/Admin/AdminAR.jsx
// Accounts Receivable (Piutang) — invoice customer korporat/event/
// partner, aging, tracking pembayaran masuk.

import { useState, useEffect, useCallback } from "react";
import ReportActions from "./ReportActions.jsx";
import { useUiKit, LoadingState } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" }) : "—";
const AGING = {
  current: { c: "#10b981", label: "Belum jatuh tempo" },
  d30: { c: "#f59e0b", label: "1–30 day" },
  d60: { c: "#f97316", label: "31–60 day" },
  d60p: { c: "#ef4444", label: "60+ day" },
  lunas: { c: "#5b6470", label: "Lunas" },
};
const TYPE = { corporate: "Korporat", event: "Event", partner: "Partner" };
const ST = { unpaid: { c: "#f59e0b", t: "Belum bayar" }, partial: { c: "#3b82f6", t: "Sebagian" }, paid: { c: "#10b981", t: "Lunas" } };
const EMPTY = { customer: "", customer_type: "corporate", description: "", amount: "", due_days: "30" };

export default function AdminAR({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/ar`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const save = () => {
    if (!form.customer.trim() || !(Number(form.amount) > 0)) { setMsg("⚠ Customer & jumlah required"); return; }
    fetch(`${apiBase}/api/ar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount), due_days: Number(form.due_days) || 30 }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Invoice piutang dibuat"); setForm(EMPTY); load(); } else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/ar/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.invoice_number || item.customer || '#'+item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/ar/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };
  const pay = (inv) => {
    const a = window.prompt(`Catat pembayaran — ${inv.customer}\nOutstanding: ${fmtRp(inv.outstanding)}\n\nQuantity bayar:`, String(inv.outstanding));
    if (a == null) return;
    fetch(`${apiBase}/api/ar/${inv.id}/pay`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: Number(a) }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Payment dicatat"); load(); } else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  if (!d) return <LoadingState label="Memuat Accounts Receivable…" sub="Menarik data invoice & aging" />;
  const s = d.summary;
  const maxAge = Math.max(1, ...Object.values(s.aging));

  return (
    <div>
      <div style={S.intro}>
        📥 <b style={{ color: "#3b82f6" }}>ACCOUNTS RECEIVABLE</b> — piutang dari customer korporat,
        event booking &amp; partner. Aging + tracking pembayaran masuk.
      </div>

      <ReportActions title="Accounts Receivable" subtitle="List piutang customer + aging"
        columns={["Invoice", "Customer", "Tipe", "Quantity", "Paid", "Outstanding", "Jatuh Tempo", "Status"]}
        rows={d.invoices.map(v => [v.invoice_number, v.customer, v.customer_type, v.amount, v.paid_amount, v.outstanding, fmtDate(v.due_date), v.status])} />

      <div style={S.kpiRow}>
        <Kpi label="Total Piutang" v={fmtRp(s.total_outstanding)} c="#3b82f6" sub="outstanding" />
        <Kpi label="Overdue" v={fmtRp(s.overdue)} c={s.overdue > 0 ? "#ef4444" : "#10b981"} sub="lewat jatuh tempo" />
        <Kpi label="Quantity Invoice" v={String(s.total)} c="#a78bfa" sub={`${s.paid_count} lunas`} />
        <Kpi label="Not Due Yet" v={fmtRp(s.aging.current)} c="#10b981" sub="masih aman" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📊 AGING PIUTANG</div>
        {[["current", "Belum jatuh tempo"], ["d30", "1–30 day overdue"], ["d60", "31–60 day overdue"], ["d60p", "60+ day overdue"]].map(([k, lbl]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
            <span style={{ width: 160, fontSize: 12, color: "#9da7b3", flexShrink: 0 }}>{lbl}</span>
            <div style={{ flex: 1, height: 12, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: Math.round(s.aging[k] / maxAge * 100) + "%", background: AGING[k].c }} />
            </div>
            <span style={{ width: 110, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#cdd5df", flexShrink: 0 }}>{fmtRp(s.aging[k])}</span>
          </div>
        ))}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ BUAT INVOICE PIUTANG</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.1fr 2fr 1.2fr 1fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} placeholder="Nama customer *" style={S.input} />
          <select value={form.customer_type} onChange={e => setForm({ ...form, customer_type: e.target.value })} style={S.input}>
            {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" style={S.input} />
          <input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="Quantity *" type="number" style={S.input} />
          <input value={form.due_days} onChange={e => setForm({ ...form, due_days: e.target.value })} placeholder="Tempo (day)" type="number" style={S.input} />
          <button onClick={save} style={S.btnPrimary}>+ Buat</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🧾 DAFTAR PIUTANG — {d.invoices.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["INVOICE", "CUSTOMER", "JUMLAH", "OUTSTANDING", "JATUH TEMPO", "AGING", "STATUS", ""].map(h => (
                <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.invoices.map(inv => {
              const ag = AGING[inv.aging] || AGING.lunas, st = ST[inv.status] || ST.unpaid;
              return (
                <tr key={inv.id} style={{ borderTop: "1px solid #161b22", fontSize: 13 }}>
                  <td style={{ ...S.td, color: "#5b6470", fontFamily: "'Geist Mono',monospace", fontSize: 11 }}>{inv.invoice_number}</td>
                  <td style={S.td}>
                    <div style={{ color: "#e6edf3", fontWeight: 600 }}>{inv.customer}</div>
                    <div style={{ color: "#5b6470", fontSize: 11 }}>{TYPE[inv.customer_type] || inv.customer_type} · {inv.description || "—"}</div>
                  </td>
                  <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{fmtRp(inv.amount)}</td>
                  <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: inv.outstanding > 0 ? "#f59e0b" : "#10b981" }}>{fmtRp(inv.outstanding)}</td>
                  <td style={{ ...S.td, color: "#9da7b3" }}>{fmtDate(inv.due_date)}</td>
                  <td style={S.td}><span style={{ color: ag.c, fontSize: 11, fontWeight: 600 }}>{ag.label}</span></td>
                  <td style={S.td}><span style={{ color: st.c, fontSize: 11, fontWeight: 700 }}>{st.t}</span></td>
                  <td style={S.td}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
                      {inv.status !== "paid"
                        ? <button onClick={() => pay(inv)} style={S.btnPay}>+ Catat Pay</button>
                        : <span style={{ color: "#10b981" }}>✓</span>}
                      <button onClick={() => setEditing({ ...inv })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                      <button onClick={() => remove(inv)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.invoice_number || '#'+editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>NO INVOICE</div><input value={editing.invoice_number || ""} onChange={e => setEditing({ ...editing, invoice_number: e.target.value })} style={modalInp} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>CUSTOMER</div><input value={editing.customer || ""} onChange={e => setEditing({ ...editing, customer: e.target.value })} style={modalInp} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>TIPE</div>
                <select value={editing.customer_type || "corporate"} onChange={e => setEditing({ ...editing, customer_type: e.target.value })} style={modalInp}>
                  {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>DESKRIPSI</div><input value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} style={modalInp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>JUMLAH</div><input type="number" value={editing.amount || 0} onChange={e => setEditing({ ...editing, amount: Number(e.target.value) })} style={modalInp} /></div>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>DIBAYAR</div><input type="number" value={editing.paid_amount || 0} onChange={e => setEditing({ ...editing, paid_amount: Number(e.target.value) })} style={modalInp} /></div>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>STATUS</div>
                <select value={editing.status || "unpaid"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="unpaid">unpaid</option>
                  <option value="partial">partial</option>
                  <option value="paid">paid</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveEdit} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

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
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
  btnPrimary: { background: "#3b82f6", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnPay: { background: "#3b82f61f", border: "1px solid #3b82f655", color: "#7cc4ff", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "'Geist Mono',monospace", whiteSpace: "nowrap" },
};
