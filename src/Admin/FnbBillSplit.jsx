// karyaOS — Bill Split & Merge tool
import { useState, useEffect, useCallback } from "react";
import { useUiKit, TooltipButton, EmptyState } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export default function FnbBillSplit({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [orderId, setOrderId] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [splits, setSplits] = useState([{ label: "Person 1", subtotal: 0, items: [], payment_method: "cash" }]);
  const [existing, setExisting] = useState([]);
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const loadExisting = useCallback(async () => {
    if (!orderId) { setExisting([]); return; }
    const d = await fetch(`${base}/bill-splits/${orderId}`).then(r => r.json()); setExisting(d.splits || []);
  }, [base, orderId]);
  useEffect(() => { loadExisting(); }, [loadExisting]);
  const addSplit = () => setSplits([...splits, { label: `Person ${splits.length + 1}`, subtotal: 0, items: [], payment_method: "cash" }]);
  const removeSplit = (i) => setSplits(splits.filter((_, idx) => idx !== i));
  const updateSplit = (i, k, v) => setSplits(splits.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  const addItem = (i) => {
    const item = { name: "", qty: 1, price: 0 };
    setSplits(splits.map((s, idx) => idx === i ? { ...s, items: [...(s.items || []), item] } : s));
  };
  const updateItem = (si, ii, k, v) => {
    const next = [...splits];
    next[si].items[ii] = { ...next[si].items[ii], [k]: v };
    next[si].subtotal = next[si].items.reduce((a, it) => a + (parseInt(it.qty,10)||0) * (parseInt(it.price,10)||0), 0);
    setSplits(next);
  };
  const removeItem = (si, ii) => {
    const next = [...splits]; next[si].items.splice(ii, 1);
    next[si].subtotal = next[si].items.reduce((a, it) => a + (parseInt(it.qty,10)||0) * (parseInt(it.price,10)||0), 0);
    setSplits(next);
  };
  const save = async () => {
    if (!orderId) { showToast("Order ID wajib", "err"); return; }
    const r = await fetch(`${base}/bill-splits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent_order_id: parseInt(orderId, 10), parent_order_ref: orderRef, splits }) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast(`${d.count} split tersimpan`); loadExisting();
  };
  const markPaid = async (id) => { await fetch(`${base}/bill-splits/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_status: "paid", paid_by: "kasir" }) }); loadExisting(); };
  const remove = async (id) => { await fetch(`${base}/bill-splits/${id}`, { method: "DELETE" }); loadExisting(); };
  const total = splits.reduce((a, s) => a + (s.subtotal || 0), 0);
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🧾 Bill Split &amp; Merge</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Bagi 1 order to beberapa pembayaran (per-person / per-payment-method).</div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 14, display: "grid", gridTemplateColumns: "150px 1fr auto auto", gap: 8, alignItems: "flex-end" }}>
        <Field label="Order ID"><input type="number" value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="123" style={inp} /></Field>
        <Field label="Order ref (opsional)"><input value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="ORD-XXX" style={inp} /></Field>
        <button onClick={addSplit} style={Ba("#a855f7")}>+ Split</button>
        <button onClick={save} disabled={!orderId} style={{ ...B.save, opacity: orderId ? 1 : 0.5 }}>💾 Simpan {splits.length} split ({rp(total)})</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 12, marginBottom: 16 }}>
        {splits.map((s, si) => (
          <div key={si} style={{ background: C.card, border: "1px solid #a855f766", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input value={s.label} onChange={e => updateSplit(si, "label", e.target.value)} placeholder="Person 1" style={{ ...inp, flex: 1, fontWeight: 700 }} />
              <select value={s.payment_method} onChange={e => updateSplit(si, "payment_method", e.target.value)} style={{ ...inp, width: 110 }}>
                <option value="cash">Cash</option><option value="card">Card</option><option value="qris">QRIS</option><option value="ewallet">E-wallet</option>
              </select>
              <button onClick={() => removeSplit(si)} style={Ba("#ef4444")}>×</button>
            </div>
            {(s.items || []).map((it, ii) => (
              <div key={ii} style={{ display: "grid", gridTemplateColumns: "1fr 60px 100px auto", gap: 4, marginBottom: 4 }}>
                <input value={it.name} onChange={e => updateItem(si, ii, "name", e.target.value)} placeholder="Item" style={{ ...inp, fontSize: 12 }} />
                <input type="number" value={it.qty} onChange={e => updateItem(si, ii, "qty", parseInt(e.target.value, 10) || 0)} style={{ ...inp, fontSize: 12 }} />
                <input type="number" value={it.price} onChange={e => updateItem(si, ii, "price", parseInt(e.target.value, 10) || 0)} placeholder="Harga" style={{ ...inp, fontSize: 12 }} />
                <button onClick={() => removeItem(si, ii)} style={Ba("#ef4444")}>×</button>
              </div>
            ))}
            <button onClick={() => addItem(si)} style={{ ...Ba("#22d3ee"), width: "100%", marginTop: 4 }}>+ Item</button>
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>Subtotal</span>
              <span style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(s.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>
      {existing.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>SPLITS TERSIMPAN UNTUK ORDER #{orderId}</div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {existing.map(s => (
              <div key={s.id} style={{ display: "flex", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, fontWeight: 700 }}>{s.split_label}</span>
                <span style={{ width: 110, fontSize: 12, color: C.sub }}>{s.payment_method}</span>
                <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#10b981", fontWeight: 700 }}>{rp(s.subtotal)}</span>
                <span style={{ width: 130, fontSize: 12 }}>{s.payment_status === "paid" ? <span style={{ color: "#10b981" }}>✓ Paid</span> : <span style={{ color: "#f59e0b" }}>⏳ Pending</span>}</span>
                <span style={{ width: 130, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  {s.payment_status !== "paid" && <button onClick={() => markPaid(s.id)} style={Ba("#10b981")}>Pay</button>}
                  <button onClick={() => remove(s.id)} style={Ba("#ef4444")}>×</button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}
    </div>
  );
}
function Field({ label, children }) { return <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
const inp = { padding: "7px 10px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 7, color: "#fff", fontSize: 12.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
const B = { save: { background: "#10b981", border: "none", color: "#04130c", padding: "9px 18px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "5px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
