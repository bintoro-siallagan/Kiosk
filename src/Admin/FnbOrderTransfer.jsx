// karyaOS — Order Transfer Between Tables
import { useState, useEffect, useCallback } from "react";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID", { hour12: false }) : "—";
export default function FnbOrderTransfer({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ order_id: "", order_ref: "", from_table: "", to_table: "", transferred_by: "", reason: "", notes: "" });
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => { const d = await fetch(`${base}/order-transfers`).then(r => r.json()); setRows(d.transfers || []); }, [base]);
  useEffect(() => { load(); }, [load]);
  const submit = async () => {
    if (!form.order_id || !form.to_table) { showToast("order_id + to_table wajib", "err"); return; }
    const r = await fetch(`${base}/order-transfers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Transfer dicatat"); setForm({ order_id: "", order_ref: "", from_table: "", to_table: "", transferred_by: "", reason: "", notes: "" }); load();
  };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🔄 Order Transfer Between Tables</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Pindah order dari satu meja ke meja lain (customer pindah / table swap).</div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>+ TRANSFER ORDER</div>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 90px 90px 1fr 1fr auto", gap: 6, alignItems: "flex-end" }}>
          <Field label="Order ID"><input type="number" value={form.order_id} onChange={e => setForm({ ...form, order_id: e.target.value })} style={inp} /></Field>
          <Field label="Order ref"><input value={form.order_ref} onChange={e => setForm({ ...form, order_ref: e.target.value })} style={inp} /></Field>
          <Field label="Dari meja"><input value={form.from_table} onChange={e => setForm({ ...form, from_table: e.target.value })} placeholder="T5" style={inp} /></Field>
          <Field label="Ke meja"><input value={form.to_table} onChange={e => setForm({ ...form, to_table: e.target.value })} placeholder="T8" style={inp} /></Field>
          <Field label="Alasan"><input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="customer pindah" style={inp} /></Field>
          <Field label="Oleh"><input value={form.transferred_by} onChange={e => setForm({ ...form, transferred_by: e.target.value })} placeholder="kasir 1" style={inp} /></Field>
          <button onClick={submit} style={B.save}>Transfer →</button>
        </div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 11, letterSpacing: 1, gap: 10 }}>
          <span style={{ width: 140 }}>WAKTU</span><span style={{ width: 100 }}>ORDER</span><span style={{ width: 100 }}>DARI</span><span style={{ width: 100 }}>KE</span><span style={{ flex: 1 }}>ALASAN</span><span style={{ width: 120 }}>OLEH</span>
        </div>
        {rows.length === 0 ? <div style={{ padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>Belum ada transfer.</div> : rows.map(r => (
          <div key={r.id} style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, fontSize: 12, alignItems: "center" }}>
            <span style={{ width: 140, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{fmtTs(r.created_at)}</span>
            <span style={{ width: 100, fontFamily: "'Geist Mono',monospace", color: "#fbbf24" }}>#{r.order_id} {r.order_ref}</span>
            <span style={{ width: 100, color: "#ef4444", fontWeight: 700 }}>{r.from_table || "—"}</span>
            <span style={{ width: 100, color: "#10b981", fontWeight: 700 }}>→ {r.to_table}</span>
            <span style={{ flex: 1, color: C.sub }}>{r.reason || "—"}</span>
            <span style={{ width: 120, color: C.dim }}>{r.transferred_by || "—"}</span>
          </div>
        ))}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}
    </div>
  );
}
function Field({ label, children }) { return <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
const inp = { width: "100%", padding: "7px 10px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 7, color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
const B = { save: { background: "#10b981", border: "none", color: "#04130c", padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } };
