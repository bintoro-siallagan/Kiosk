// karyaOS — F&B Recipe BOM (ingredient + qty per menu item, auto-deduct on sale)
import { useState, useEffect, useCallback } from "react";
import { useUiKit, EmptyState, TooltipButton, LoadingSkeleton, Help } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const fmtNum = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString("id-ID");
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID", { hour12: false }) : "—";

export default function FnbRecipe({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [tab, setTab] = useState("recipes");
  const [rows, setRows] = useState([]);
  const [movements, setMovements] = useState([]);
  const [form, setForm] = useState({ menu_item_id: "", menu_item_name: "", ingredient_name: "", qty: "", unit: "", notes: "" });
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => {
    const d = await fetch(`${base}/recipes`).then(r => r.json()); setRows(d.recipes || []);
    const m = await fetch(`${base}/ingredient-movements`).then(r => r.json()); setMovements(m.movements || []);
  }, [base]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!form.menu_item_id || !form.ingredient_name || !form.qty) { showToast("Wajib", "err"); return; }
    const r = await fetch(`${base}/recipes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Recipe ditambahkan"); setForm({ menu_item_id: form.menu_item_id, menu_item_name: form.menu_item_name, ingredient_name: "", qty: "", unit: "", notes: "" }); load();
  };
  const { confirm, undoToast } = useUiKit();
  const saveEdit = async () => {
    const r = await fetch(`${base}/recipes/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    const d = await r.json(); if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast("Recipe diupdate"); setEditing(null); load();
  };
  const remove = async (r) => {
    if (!(await confirm({ title: `Hapus ingredient "${r.ingredient_name}"?`, message: `from recipe "${r.menu_item_name}"`, danger: true, okLabel: "Delete" }))) return;
    await fetch(`${base}/recipes/${r.id}`, { method: "DELETE" }); load();
    undoToast(`Ingredient "${r.ingredient_name}" dihapus`, async () => {
      await fetch(`${base}/recipes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
      load();
    });
  };
  // Group by menu item
  const grouped = {};
  for (const r of rows) {
    const k = r.menu_item_id;
    (grouped[k] = grouped[k] || { id: k, name: r.menu_item_name, items: [] }).items.push(r);
  }
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🍱 F&B Recipe BOM</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Ingredient + qty per menu item · saat menu terjual → POS panggil /recipes/deduct → auto-log to ingredient_movements.</div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["recipes", "🧪 Recipes"], ["movements", "📜 Movements"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ background: tab === id ? "#10b98122" : "transparent", border: `1px solid ${tab === id ? "#10b98166" : C.border}`, borderRadius: 8, padding: "8px 14px", color: tab === id ? "#fff" : C.sub, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
      {tab === "recipes" && (
        <>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>+ TAMBAH INGREDIENT</div>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 110px 80px 1fr auto", gap: 6, alignItems: "flex-end" }}>
              <Field label="Menu ID"><input type="number" value={form.menu_item_id} onChange={e => setForm({ ...form, menu_item_id: e.target.value })} style={inp} /></Field>
              <Field label="Nama menu"><input value={form.menu_item_name} onChange={e => setForm({ ...form, menu_item_name: e.target.value })} placeholder="Nasi Goreng" style={inp} /></Field>
              <Field label="Ingredient"><input value={form.ingredient_name} onChange={e => setForm({ ...form, ingredient_name: e.target.value })} placeholder="Beras" style={inp} /></Field>
              <Field label="Qty / porsi"><input type="number" step="0.001" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} style={inp} /></Field>
              <Field label="Unit"><input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="kg" style={inp} /></Field>
              <Field label="Notes"><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inp} /></Field>
              <button onClick={add} style={B.save}>+</button>
            </div>
          </div>
          {Object.values(grouped).length === 0 ? <Empty>No recipe.</Empty> :
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(380px,1fr))", gap: 12 }}>
              {Object.values(grouped).map(g => (
                <div key={g.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{g.name || "—"}</div>
                      <div style={{ fontSize: 11, color: C.dim }}>Menu #{g.id} · {g.items.length} ingredient</div>
                    </div>
                  </div>
                  {g.items.map(it => (
                    <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: `1px solid #1f2937`, fontSize: 12.5 }}>
                      <span>{it.ingredient_name}{it.notes ? <span style={{ color: C.dim, fontSize: 11 }}> · {it.notes}</span> : null}</span>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 700 }}>{fmtNum(it.qty)} {it.unit}</span>
                        <button onClick={() => setEditing({ ...it })} style={Ba("#f59e0b")} title="Edit">✏️</button>
                        <button onClick={() => remove(it)} style={Ba("#ef4444")} title="Delete">×</button>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          }
        </>
      )}
      {tab === "movements" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 11, letterSpacing: 1 }}>
            <span style={{ width: 150 }}>WAKTU</span>
            <span style={{ flex: 1 }}>INGREDIENT</span>
            <span style={{ width: 120 }}>PERUBAHAN</span>
            <span style={{ width: 130 }}>SOURCE</span>
            <span style={{ flex: 1 }}>CATATAN</span>
          </div>
          {movements.length === 0 ? <Empty>No pergerakan.</Empty> : movements.map(m => (
            <div key={m.id} style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
              <span style={{ width: 150, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{fmtTs(m.created_at)}</span>
              <span style={{ flex: 1, fontWeight: 700 }}>{m.ingredient_name}</span>
              <span style={{ width: 120, fontFamily: "'Geist Mono',monospace", color: m.qty_change >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>{m.qty_change >= 0 ? "+" : ""}{fmtNum(m.qty_change)}</span>
              <span style={{ width: 130, fontSize: 11.5, color: C.sub }}>{m.source}</span>
              <span style={{ flex: 1, fontSize: 11.5, color: C.dim }}>{m.notes || ""}</span>
            </div>
          ))}
        </div>
      )}
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 480, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit Ingredient — {editing.ingredient_name}</div>
            <Field label="Ingredient"><input value={editing.ingredient_name} onChange={e => setEditing({ ...editing, ingredient_name: e.target.value })} style={inp} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <Field label="Qty / porsi"><input type="number" step="0.001" value={editing.qty} onChange={e => setEditing({ ...editing, qty: e.target.value })} style={inp} /></Field>
              <Field label="Unit"><input value={editing.unit || ""} onChange={e => setEditing({ ...editing, unit: e.target.value })} style={inp} /></Field>
            </div>
            <div style={{ marginTop: 8 }}>
              <Field label="Notes"><input value={editing.notes || ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} style={inp} /></Field>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveEdit} style={B.save}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Field({ label, children }) { return <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
function Empty({ children }) { return <div style={{ padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
const inp = { width: "100%", padding: "7px 9px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 7, color: "#fff", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" };
const B = { save: { background: "#10b981", border: "none", color: "#04130c", padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
