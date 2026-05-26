// karyaOS — F&B Combo / Set Meal Builder
import { useState, useEffect, useCallback } from "react";
import { useUiKit, EmptyState, TooltipButton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const empty = { name: "", description: "", combo_price: 0, category: "", image_url: "", available_from: "", available_to: "", applicable_days: "", is_active: 1, items: [] };

export default function FnbCombo({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const { confirm, toast: showToast, undoToast } = useUiKit();
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [itemDraft, setItemDraft] = useState({ menu_item_id: "", menu_item_name: "", qty: 1, category: "main" });
  const load = useCallback(async () => { const d = await fetch(`${base}/combos?all=1`).then(r => r.json()); setRows(d.combos || []); }, [base]);
  useEffect(() => { load(); }, [load]);
  const addItem = () => {
    if (!itemDraft.menu_item_name) return;
    setForm({ ...form, items: [...(form.items || []), { ...itemDraft }] });
    setItemDraft({ menu_item_id: "", menu_item_name: "", qty: 1, category: "main" });
  };
  const removeItem = (i) => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
  const save = async () => {
    if (!form.name) { showToast("Nama wajib", "err"); return; }
    if (!form.items?.length) { showToast("Minimal 1 item", "err"); return; }
    const url = editing === "new" ? `${base}/combos` : `${base}/combos/${editing}`;
    const r = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Combo disimpan"); setEditing(null); setForm(empty); load();
  };
  const remove = async (r) => {
    if (!(await confirm({ title: `Hapus combo "${r.name}"?`, message: "Combo akan dihapus permanen. Tidak bisa di-undo.", danger: true, okLabel: "Delete" }))) return;
    await fetch(`${base}/combos/${r.id}`, { method: "DELETE" }); load();
    undoToast(`Combo "${r.name}" dihapus`, async () => {
      await fetch(`${base}/combos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
      load();
    });
  };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🍔 F&B Combo / Set Meal</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Bundle item: main + side + drink with harga combo. Optional swappable.</div>
        </div>
        {!editing && <button onClick={() => { setEditing("new"); setForm(empty); }} style={B.add}>＋ Combo baru</button>}
      </div>
      {editing && (
        <div style={{ background: C.card, border: "1px solid #f59e0b66", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", marginBottom: 10 }}>{editing === "new" ? "Combo baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Nama combo"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Paket Hemat Nasi Goreng" style={inp} /></Field>
            <Field label="Kategori"><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Lunch / Promo" style={inp} /></Field>
            <Field label="Harga combo (Rp)"><input type="number" value={form.combo_price} onChange={e => setForm({ ...form, combo_price: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Tersedia dari"><input type="time" value={form.available_from} onChange={e => setForm({ ...form, available_from: e.target.value })} style={inp} /></Field>
            <Field label="Sampai"><input type="time" value={form.available_to} onChange={e => setForm({ ...form, available_to: e.target.value })} style={inp} /></Field>
            <Field label="Hari berlaku"><input value={form.applicable_days} onChange={e => setForm({ ...form, applicable_days: e.target.value })} placeholder="kosong = semua" style={inp} /></Field>
            <Field label="Image URL" wide><input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} style={inp} /></Field>
            <Field label="Description" wide><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
            <Field label="Status"><label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center" }}><input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Active</label></Field>
          </div>
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>ITEMS DALAM COMBO</div>
            {(form.items || []).map((it, i) => (
              <div key={i} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid #1f2937`, alignItems: "center", gap: 8 }}>
                <span style={{ width: 80, fontFamily: "'Geist Mono',monospace", color: "#22d3ee", fontSize: 11.5 }}>{it.category}</span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{it.menu_item_name}</span>
                <span style={{ width: 60, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 700 }}>{it.qty}×</span>
                <button onClick={() => removeItem(i)} style={Ba("#ef4444")}>×</button>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 70px auto", gap: 6, marginTop: 8 }}>
              <input type="number" value={itemDraft.menu_item_id} onChange={e => setItemDraft({ ...itemDraft, menu_item_id: e.target.value })} placeholder="ID" style={inp} />
              <input value={itemDraft.menu_item_name} onChange={e => setItemDraft({ ...itemDraft, menu_item_name: e.target.value })} placeholder="Nama item" style={inp} />
              <select value={itemDraft.category} onChange={e => setItemDraft({ ...itemDraft, category: e.target.value })} style={inp}>
                <option value="main">Main</option><option value="side">Side</option><option value="drink">Drink</option><option value="dessert">Dessert</option><option value="extra">Extra</option>
              </select>
              <input type="number" value={itemDraft.qty} onChange={e => setItemDraft({ ...itemDraft, qty: parseInt(e.target.value, 10) || 1 })} style={inp} />
              <button onClick={addItem} style={B.save}>+ Item</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat Combo" : "Save"}</button>
            <button onClick={() => { setEditing(null); setForm(empty); }} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState icon="🍔" title="No combo" desc="Buat combo (set meal) for menggabungkan beberapa item jadi 1 harga bundle. Mis: Paket Nasi Goreng = main + drink + dessert."
          action={!editing ? { label: "＋ Buat combo pertama", onClick: () => { setEditing("new"); setForm(empty); }, color: "#f59e0b" } : null} />
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
        {rows.map(r => (
          <div key={r.id} style={{ background: C.card, border: `2px solid ${r.is_active ? "#f59e0b66" : C.border}`, borderRadius: 14, padding: 14, opacity: r.is_active ? 1 : 0.55 }}>
            {r.image_url && <img src={r.image_url} alt={r.name} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 10, marginBottom: 8 }} />}
            <div style={{ fontSize: 16, fontWeight: 800 }}>{r.name}</div>
            {r.category && <div style={{ fontSize: 11, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{r.category.toUpperCase()}</div>}
            {r.description && <div style={{ fontSize: 12, color: C.sub, marginTop: 4, lineHeight: 1.4 }}>{r.description}</div>}
            <div style={{ background: "#0a0e16", borderRadius: 9, padding: "8px 11px", marginTop: 10 }}>
              {(r.items || []).map(it => <div key={it.id} style={{ fontSize: 12, padding: "2px 0" }}>{it.qty}× <b>{it.menu_item_name}</b> <span style={{ color: C.dim }}>{it.category}</span></div>)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 14, fontWeight: 800, color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(r.combo_price)}</div>
            <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
              <TooltipButton tip="Edit combo ini" onClick={() => { setEditing(r.id); setForm({ ...empty, ...r }); }} style={Ba("#a855f7")}>Edit</TooltipButton>
              <TooltipButton tip="Hapus combo" onClick={() => remove(r)} style={Ba("#ef4444")}>×</TooltipButton>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
function Field({ label, children, wide }) { return <div style={{ gridColumn: wide ? "span 2" : "auto" }}><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = { add: { background: "#f59e0b22", border: "1px solid #f59e0b66", color: "#fbbf24", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, save: { background: "#10b981", border: "none", color: "#04130c", padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
