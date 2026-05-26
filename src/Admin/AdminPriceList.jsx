// src/Admin/AdminPriceList.jsx
// Price List — kelola harga resmi vendor yang di-LOCK.
// PR/PO/Quick-Reorder ambil harga dari sini → purchasing transparan.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";
const toDateInput = (ts) => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : "";
const fromDateInput = (s) => s ? Math.floor(new Date(s + "T00:00:00").getTime() / 1000) : null;
const EMPTY = { id: null, item_name: "", sku: "", supplier: "", unit: "", price: "", valid_until: "" };

export default function AdminPriceList({ apiBase = "" }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/price-list`).then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : [])).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const save = () => {
    if (!form.item_name.trim() || !(Number(form.price) > 0)) { setMsg("⚠ Item & harga required"); return; }
    const body = { ...form, price: Number(form.price), valid_until: fromDateInput(form.valid_until), updated_by: "Manager" };
    const url = form.id ? `${apiBase}/api/price-list/${form.id}` : `${apiBase}/api/price-list`;
    fetch(url, { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(r => r.json())
      .then(j => {
        if (j.ok || j.id) { setMsg(form.id ? "✓ Harga diperbarui" : "✓ Harga ditambah ke price list"); setForm(EMPTY); load(); }
        else setMsg(j.error || "gagal menyimpan");
      })
      .catch(e => setMsg(String(e)));
  };
  const edit = (r) => { setMsg(""); setForm({ id: r.id, item_name: r.item_name, sku: r.sku || "", supplier: r.supplier || "", unit: r.unit || "", price: r.price, valid_until: toDateInput(r.valid_until) }); };
  const del = (id) => { if (!window.confirm("Hapus harga ini dari price list?")) return; fetch(`${apiBase}/api/price-list/${id}`, { method: "DELETE" }).then(() => load()); };

  const I = (k, ph, type = "text") => (
    <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
      placeholder={ph} type={type} style={S.input} />
  );

  return (
    <div>
      <div style={S.intro}>
        💲 <b style={{ color: "#10b981" }}>PRICE LIST</b> — harga resmi vendor yang di-<b>lock</b>.
        PR / PO / Quick-Reorder ngambil harga dari sini, gak bisa diketik manual →
        purchasing transparan, gak main harga sama supplier.
      </div>

      <div style={S.card}>
        <div style={S.kicker}>{form.id ? "✏ EDIT HARGA" : "➕ TAMBAH HARGA"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.6fr 0.8fr 1.2fr 1.3fr", gap: 8, marginTop: 10 }}>
          {I("item_name", "Nama item *")}
          {I("sku", "SKU")}
          {I("supplier", "Supplier")}
          {I("unit", "Unit (kg/pcs)")}
          {I("price", "Harga *", "number")}
          {I("valid_until", "", "date")}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <button onClick={save} style={S.btnPrimary}>{form.id ? "Simpan Perubahan" : "+ Tambah ke Price List"}</button>
          {form.id ? <button onClick={() => { setForm(EMPTY); setMsg(""); }} style={S.btnGhost}>Cancel</button> : null}
          {msg ? <span style={{ fontSize: 12, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</span> : null}
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📋 DAFTAR HARGA RESMI — {rows.length} ITEM</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["ITEM", "SKU", "SUPPLIER", "UNIT", "HARGA (LOCKED)", "BERLAKU S/D", "STATUS", ""].map(h => (
                <th key={h} style={{ padding: "6px 8px", fontWeight: 600, letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: "1px solid #161b22", fontSize: 13 }}>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{r.item_name}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{r.sku || "—"}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{r.supplier || "—"}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{r.unit || "—"}</td>
                <td style={{ ...S.td, color: "#10b981", fontWeight: 700 }}>🔒 {fmtRp(r.price)}</td>
                <td style={{ ...S.td, color: r.expired ? "#f87171" : "#9da7b3" }}>{fmtDate(r.valid_until)}</td>
                <td style={S.td}>
                  {r.expired
                    ? <span style={{ color: "#f87171", fontWeight: 700 }}>⚠ Expired</span>
                    : !r.is_active
                      ? <span style={{ color: "#5b6470" }}>Nonaktif</span>
                      : <span style={{ color: "#10b981" }}>🔒 Locked</span>}
                </td>
                <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                  <button onClick={() => edit(r)} style={S.iconBtn}>✏</button>
                  <button onClick={() => del(r.id)} style={{ ...S.iconBtn, color: "#f87171" }}>🗑</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={8} style={{ ...S.td, color: "#5b6470", textAlign: "center", padding: 20 }}>No harga</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
  btnPrimary: { background: "#10b981", color: "#04130d", border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "transparent", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "9px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  td: { padding: "9px 8px" },
  iconBtn: { background: "#161b22", border: "1px solid #21262d", borderRadius: 6, padding: "4px 9px", fontSize: 12, cursor: "pointer", marginRight: 5, color: "#9da7b3" },
};
