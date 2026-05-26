// src/Admin/AdminSimplePurchase.jsx
// Simple Purchase — pembelian cepat / petty cash.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#65a30d";
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";
const PAY_C = { Cash: "#10b981", "Petty Cash": "#f59e0b", Transfer: "#3b82f6" };
const EMPTY = { item_name: "", qty: "", unit: "pcs", unit_price: "", vendor: "", payment_method: "Cash", outlet: "Paskal" };

export default function AdminSimplePurchase({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/simple-purchase`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/simple-purchase/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.purchase_no || item.item_name || '#'+item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/simple-purchase/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  const save = () => {
    if (!form.item_name.trim() || !(Number(form.qty) > 0) || !(Number(form.unit_price) > 0)) {
      setMsg("⚠ Item, qty & harga required"); return;
    }
    fetch(`${apiBase}/api/simple-purchase`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, qty: Number(form.qty), unit_price: Number(form.unit_price), purchased_by: "Admin" }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg(`✓ Purchases dicatat — ${fmtRp(j.total)}`); setForm(EMPTY); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Simple Purchase…</div>;
  const s = d.summary;
  const total = (Number(form.qty) || 0) * (Number(form.unit_price) || 0);

  return (
    <div>
      <div style={S.intro}>
        🛒 <b style={{ color: "#a3e635" }}>SIMPLE PURCHASE</b> — pembelian cepat / petty cash buat barang
        kecil &amp; urgent. Tanpa ribet rantai PR→PO→GD→GR — catat sekali, selesai.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Purchases" v={String(s.total_purchases)} c={AC} />
        <Kpi label="Belanja Bulan Ini" v={fmtRp(s.month_spend)} c="#f59e0b" />
        <Kpi label="Total Belanja" v={fmtRp(s.total_spend)} c="#3b82f6" />
        <Kpi label="Via Petty Cash" v={fmtRp((s.by_payment.find(p => p.method === "Petty Cash") || {}).total)} c="#fb923c" />
      </div>

      {/* Quick form */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ CATAT PEMBELIAN CEPAT</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 1fr 1.4fr 1.1fr 1fr auto", gap: 8, marginTop: 10, alignItems: "center" }}>
          <input value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} placeholder="Nama item *" style={S.input} />
          <input value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="Qty *" type="number" style={S.input} />
          <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="Unit" style={S.input} />
          <input value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} placeholder="Price *" type="number" style={S.input} />
          <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor / toko" style={S.input} />
          <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} style={S.input}>
            {d.payment_methods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} placeholder="Outlet" style={S.input} />
          <button onClick={save} style={S.btn}>+ Catat</button>
        </div>
        <div style={{ fontSize: 12, marginTop: 8, color: msg ? (msg.startsWith("✓") ? "#10b981" : "#f87171") : "#5b6470" }}>
          {msg || (total > 0 ? `Total: ${fmtRp(total)}` : "Total otomatis dihitung from qty × harga")}
        </div>
      </div>

      {/* List */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📋 RIWAYAT PEMBELIAN — {d.purchases.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["NO", "ITEM", "QTY", "TOTAL", "VENDOR", "BAYAR", "OUTLET", "TGL", ""].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.purchases.map(p => (
              <tr key={p.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#5b6470", fontSize: 10 }}>{p.purchase_no}</td>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{p.item_name}</td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{p.qty} {p.unit}</td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#a3e635" }}>{fmtRp(p.total)}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{p.vendor}</td>
                <td style={S.td}><span style={{ fontSize: 11, fontWeight: 700, color: PAY_C[p.payment_method] || "#9ca3af" }}>{p.payment_method}</span></td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{p.outlet}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{fmtDate(p.created_at)}</td>
                <td style={S.td}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button onClick={() => setEditing({ ...p })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                    <button onClick={() => remove(p)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.purchase_no || '#'+editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>ITEM</div><input value={editing.item_name || ""} onChange={e => setEditing({ ...editing, item_name: e.target.value })} style={modalInp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>QTY</div><input type="number" value={editing.qty || 0} onChange={e => setEditing({ ...editing, qty: Number(e.target.value) })} style={modalInp} /></div>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>UNIT</div><input value={editing.unit || ""} onChange={e => setEditing({ ...editing, unit: e.target.value })} style={modalInp} /></div>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>HARGA</div><input type="number" value={editing.unit_price || 0} onChange={e => setEditing({ ...editing, unit_price: Number(e.target.value) })} style={modalInp} /></div>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>VENDOR</div><input value={editing.vendor || ""} onChange={e => setEditing({ ...editing, vendor: e.target.value })} style={modalInp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>BAYAR</div>
                  <select value={editing.payment_method || "Cash"} onChange={e => setEditing({ ...editing, payment_method: e.target.value })} style={modalInp}>
                    <option value="Cash">Cash</option>
                    <option value="Petty Cash">Petty Cash</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                </div>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>OUTLET</div><input value={editing.outlet || ""} onChange={e => setEditing({ ...editing, outlet: e.target.value })} style={modalInp} /></div>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>CATATAN</div><input value={editing.notes || ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} style={modalInp} /></div>
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
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
  btn: { background: "#65a30d", color: "#0a1404", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
