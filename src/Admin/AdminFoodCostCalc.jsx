// src/Admin/AdminFoodCostCalc.jsx
// Food Cost Calculator — rakit resep, hitung biaya & margin.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#ea580c";

export default function AdminFoodCostCalc({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [rows, setRows] = useState([]);
  const [price, setPrice] = useState("");
  const [pick, setPick] = useState("");
  const [qty, setQty] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/food-cost-calc`).then(r => r.json()).then(j => {
      setD(j); setPick(p => p || (j.ingredients[0] && j.ingredients[0].sku) || "");
    }).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const addRow = () => {
    const ing = d.ingredients.find(x => x.sku === pick);
    if (!ing || !(Number(qty) > 0)) { setMsg("⚠ Pilih bahan & isi qty"); return; }
    setRows([...rows, { sku: ing.sku, name: ing.name, unit: ing.unit, unit_cost: ing.cost_per_unit, qty: Number(qty) }]);
    setQty(""); setMsg("");
  };
  const totalCost = rows.reduce((s, r) => s + r.unit_cost * r.qty, 0);
  const sp = Number(price) || 0;
  const margin = sp > 0 ? Math.round((sp - totalCost) / sp * 100) : 0;
  const foodCostPct = sp > 0 ? Math.round(totalCost / sp * 100) : 0;
  const suggest = (target) => totalCost > 0 ? Math.round(totalCost / (1 - target / 100) / 500) * 500 : 0;

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/food-cost-calc/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: editing.product_name,
        total_cost: Number(editing.total_cost) || 0,
        selling_price: Number(editing.selling_price) || 0,
      }),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({
      title: `Hapus "${item.product_name}"?`,
      message: "Kalkulasi food cost akan dihapus permanen. Tidak bisa dibatalkan.",
      danger: true, okLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/food-cost-calc/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  const save = () => {
    if (!name.trim() || !rows.length) { setMsg("⚠ Nama produk & minimal 1 bahan wajib"); return; }
    fetch(`${apiBase}/api/food-cost-calc`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_name: name, ingredients: rows, selling_price: sp }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg(`✓ Kalkulasi "${name}" disimpan — cost ${fmtRp(j.total_cost)}`); setName(""); setRows([]); setPrice(""); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Food Cost Calculator…</div>;

  return (
    <div>
      <div style={S.intro}>
        🧮 <b style={{ color: "#fb923c" }}>FOOD COST CALCULATOR</b> — rakit resep dari bahan baku, hitung
        food cost, margin &amp; harga jual ideal. Tool what-if buat rancang menu baru sebelum dibikin.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
        {/* Calculator */}
        <div style={S.card}>
          <div style={S.kicker}>🧮 KALKULATOR RESEP</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama produk / menu" style={{ ...S.input, width: "100%", marginTop: 10 }} />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 0.9fr auto", gap: 8, marginTop: 8 }}>
            <select value={pick} onChange={e => setPick(e.target.value)} style={S.input}>
              {d.ingredients.map(i => <option key={i.sku} value={i.sku}>{i.name} ({fmtRp(i.cost_per_unit)}/{i.unit})</option>)}
            </select>
            <input value={qty} onChange={e => setQty(e.target.value)} placeholder="Qty" type="number" style={S.input} />
            <button onClick={addRow} style={S.btnGhost}>+ Bahan</button>
          </div>
          <div style={{ marginTop: 10 }}>
            {rows.length === 0 ? <div style={{ fontSize: 12, color: "#5b6470" }}>No bahan.</div> : rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0", borderTop: "1px solid #161b22" }}>
                <span style={{ flex: 1, color: "#e6edf3" }}>{r.name} <span style={{ color: "#5b6470" }}>· {r.qty} {r.unit}</span></span>
                <span style={{ fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{fmtRp(r.unit_cost * r.qty)}</span>
                <button onClick={() => setRows(rows.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 13 }}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #21262d", marginTop: 8, paddingTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>TOTAL FOOD COST</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#fb923c", fontFamily: "'Geist Mono',monospace" }}>{fmtRp(totalCost)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <input value={price} onChange={e => setPrice(e.target.value)} placeholder="Harga jual (Rp)" type="number" style={{ ...S.input, flex: 1 }} />
            <button onClick={save} style={S.btn}>💾 Simpan</button>
          </div>
          {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
        </div>

        {/* Result */}
        <div style={S.card}>
          <div style={S.kicker}>📊 HASIL ANALISA</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <Stat label="Food Cost %" v={sp > 0 ? foodCostPct + "%" : "—"} c={foodCostPct > 35 ? "#ef4444" : "#10b981"} />
            <Stat label="Margin Kotor" v={sp > 0 ? margin + "%" : "—"} c={margin >= 60 ? "#10b981" : margin >= 40 ? "#f59e0b" : "#ef4444"} />
            <Stat label="Profit / unit" v={sp > 0 ? fmtRp(sp - totalCost) : "—"} c="#3b82f6" />
          </div>
          <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace", margin: "12px 0 6px" }}>💡 SARAN HARGA JUAL</div>
          {[60, 65, 70].map(t => (
            <div key={t} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
              <span style={{ color: "#9da7b3" }}>Margin {t}%</span>
              <span style={{ fontFamily: "'Geist Mono',monospace", color: "#fb923c" }}>{fmtRp(suggest(t))}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>💾 KALKULASI TERSIMPAN — {d.calculations.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["PRODUK", "BAHAN", "FOOD COST", "HARGA JUAL", "FC %", "MARGIN", "AKSI"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.calculations.map(c => (
              <tr key={c.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{c.product_name}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{c.ingredients.length} bahan</td>
                <td style={{ ...S.td, ...S.mono, color: "#fb923c" }}>{fmtRp(c.total_cost)}</td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{fmtRp(c.selling_price)}</td>
                <td style={{ ...S.td, ...S.mono, color: c.food_cost_pct > 35 ? "#ef4444" : "#10b981" }}>{c.food_cost_pct}%</td>
                <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: c.margin_pct >= 60 ? "#10b981" : "#f59e0b" }}>{c.margin_pct}%</td>
                <td style={S.td}>
                  <button onClick={() => setEditing({ ...c })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                  <button onClick={() => remove(c)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, marginLeft: 4 }}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 22, width: 460, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#e6edf3", marginBottom: 12 }}>Edit Kalkulasi — #{editing.id}</div>
            <div style={{ display: "grid", gap: 9 }}>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>NAMA PRODUK
                <input value={editing.product_name || ""} onChange={e => setEditing({ ...editing, product_name: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>TOTAL FOOD COST (Rp)
                <input value={editing.total_cost || ""} onChange={e => setEditing({ ...editing, total_cost: e.target.value })} type="number" style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>HARGA JUAL (Rp)
                <input value={editing.selling_price || ""} onChange={e => setEditing({ ...editing, selling_price: e.target.value })} type="number" style={modalInp} />
              </label>
              <div style={{ fontSize: 11, color: "#5b6470", padding: "6px 0" }}>Bahan: {editing.ingredients ? (Array.isArray(editing.ingredients) ? editing.ingredients.length : 0) : 0} item · margin akan dihitung ulang otomatis</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)} style={{ background: "transparent", border: "1px solid #21262d", color: "#9da7b3", padding: "8px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={saveEdit} style={{ background: AC, border: "none", color: "#fff", padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, v, c }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", background: "#0a0e16", border: "1px solid #161b22", borderRadius: 8, padding: "9px 12px" }}>
      <span style={{ fontSize: 12, color: "#9da7b3" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace" }}>{v}</span>
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  td: { padding: "7px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#ea580c", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnGhost: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
