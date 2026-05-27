// karyaOS — Cinema Inventory (popcorn / syrup / cup / sausage)
// 3 tab: Items (stock + restock) · Recipes (mapping bundle → items + qty)
// · Movements (audit log auto-deduct).
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
import { fmtMoney as rp } from "../lib/currency.js";
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID", { hour12: false }) : "—";
const fmtNum = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString("id-ID");
const TABS = [
  ["items",     "📦 Stock Items"],
  ["recipes",   "🧪 Bundle Recipes"],
  ["movements", "📜 Movements"],
];

export default function CinemaInventory({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [tab, setTab] = useState("items");
  const [toast, setToast] = useState(null);
  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2400); };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🍿 Cinema Inventory</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Popcorn / syrup / cup / sausage · auto-deduct saat combo terjual via recipe.</div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ background: tab === id ? "#a855f72a" : "transparent", border: `1px solid ${tab === id ? "#a855f766" : C.border}`, borderRadius: 8, padding: "8px 14px", color: tab === id ? "#fff" : C.sub, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>
      {tab === "items"     && <ItemsTab base={base} showToast={showToast} />}
      {tab === "recipes"   && <RecipesTab base={base} showToast={showToast} />}
      {tab === "movements" && <MovementsTab base={base} />}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.kind === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.kind === "err" ? "#ef4444" : "#22c55e"}`,
          color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>
      )}
    </div>
  );
}

function ItemsTab({ base, showToast }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", unit: "", current_stock: 0, low_stock_threshold: 0, cost_per_unit: 0, is_active: 1 });
  const [restocking, setRestocking] = useState(null);
  const [restockQty, setRestockQty] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(`${base}/inventory/items?all=1`); const d = await r.json();
    setRows(d.items || []);
  }, [base]);
  useEffect(() => { load(); }, [load]);
  const startNew = () => { setEditing("new"); setForm({ name: "", unit: "", current_stock: 0, low_stock_threshold: 0, cost_per_unit: 0, is_active: 1 }); };
  const startEdit = (r) => { setEditing(r.id); setForm({ ...r }); };
  const cancel = () => { setEditing(null); };
  const save = async () => {
    if (!form.name?.trim()) { showToast("Nama wajib", "err"); return; }
    const url = editing === "new" ? `${base}/inventory/items` : `${base}/inventory/items/${editing}`;
    const method = editing === "new" ? "POST" : "PATCH";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast(editing === "new" ? "Item ditambahkan" : "Item diperbarui");
    cancel(); load();
  };
  const remove = async (r) => {
    if (!window.confirm(`Hapus ${r.name}?`)) return;
    await fetch(`${base}/inventory/items/${r.id}`, { method: "DELETE" });
    showToast("Item dihapus"); load();
  };
  const doRestock = async () => {
    const qty = parseFloat(restockQty);
    if (!qty || qty <= 0) { showToast("Qty harus positif", "err"); return; }
    const r = await fetch(`${base}/inventory/items/${restocking.id}/restock`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qty }),
    });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast(`+${qty} ${restocking.unit || ""} ditambahkan to ${restocking.name}`);
    setRestocking(null); setRestockQty(""); load();
  };

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        {!editing && !restocking && <button onClick={startNew} style={B.add}>＋ Item baru</button>}
      </div>
      {editing && (
        <div style={{ background: C.card, border: "1px solid #a855f766", borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#d8b4fe", marginBottom: 10 }}>{editing === "new" ? "Item baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Nama"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Popcorn Kernel" style={inp} /></Field>
            <Field label="Unit"><input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="kg / liter / pcs" style={inp} /></Field>
            <Field label="Cost / unit (Rp)"><input type="number" value={form.cost_per_unit} onChange={e => setForm({ ...form, cost_per_unit: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Stock saat ini"><input type="number" step="0.01" value={form.current_stock} onChange={e => setForm({ ...form, current_stock: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label="Low-stock threshold"><input type="number" step="0.01" value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label="Status">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Aktif
              </label>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Create" : "Save"}</button>
            <button onClick={cancel} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}
      {restocking && (
        <div style={{ background: C.card, border: "1px solid #10b98166", borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981", marginBottom: 10 }}>+ Restock {restocking.name}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <Field label={`Tambah qty (${restocking.unit || ""})`}>
              <input type="number" step="0.01" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="mis: 10" style={inp} autoFocus />
            </Field>
            <button onClick={doRestock} style={B.save}>+ Restock</button>
            <button onClick={() => { setRestocking(null); setRestockQty(""); }} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <Header cols={["NAMA", "UNIT", "STOCK", "MIN", "COST/UNIT", "VALUE", "STATUS", "AKSI"]} widths={[200, 70, 110, 90, 110, 130, 70, 170]} />
        {rows.length === 0 ? <Empty>No item.</Empty> :
          rows.map(r => {
            const low = r.current_stock <= r.low_stock_threshold;
            const value = (r.current_stock || 0) * (r.cost_per_unit || 0);
            return (
              <div key={r.id} style={rowS}>
                <span style={{ width: 200, fontWeight: 700, fontSize: 13 }}>{r.name}</span>
                <span style={{ width: 70, fontSize: 12, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>{r.unit || "—"}</span>
                <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: low ? "#ef4444" : "#10b981" }}>{fmtNum(r.current_stock)}{low && " ⚠️"}</span>
                <span style={{ width: 90, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{fmtNum(r.low_stock_threshold)}</span>
                <span style={{ width: 110, fontSize: 11.5, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>{rp(r.cost_per_unit)}</span>
                <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 700 }}>{rp(value)}</span>
                <span style={{ width: 70 }}>{r.is_active ? <span style={pillG}>aktif</span> : <span style={pillX}>off</span>}</span>
                <span style={{ width: 170, display: "flex", gap: 5, justifyContent: "flex-end" }}>
                  <button onClick={() => setRestocking(r)} style={B.small("#10b981")}>+ Restock</button>
                  <button onClick={() => startEdit(r)} style={B.small("#a855f7")}>Edit</button>
                  <button onClick={() => remove(r)} style={B.small("#ef4444")}>×</button>
                </span>
              </div>
            );
          })
        }
      </div>
    </>
  );
}

function RecipesTab({ base, showToast }) {
  const [bundles, setBundles] = useState([]);
  const [items, setItems] = useState([]);
  const [picked, setPicked] = useState(null);
  const [recipe, setRecipe] = useState([]);
  const [draft, setDraft] = useState({ inventory_item_id: "", qty: "" });
  useEffect(() => {
    fetch(`${base}/bundles?all=1`).then(r => r.json()).then(d => {
      setBundles(d.bundles || []);
      if (!picked && d.bundles?.length) setPicked(d.bundles[0].id);
    }).catch(() => {});
    fetch(`${base}/inventory/items`).then(r => r.json()).then(d => setItems(d.items || [])).catch(() => {});
  }, [base, picked]);
  const loadRecipe = useCallback(async () => {
    if (!picked) return;
    const r = await fetch(`${base}/bundles/${picked}/recipe`); const d = await r.json();
    setRecipe(d.recipe || []);
  }, [base, picked]);
  useEffect(() => { loadRecipe(); }, [loadRecipe]);

  const add = () => {
    if (!draft.inventory_item_id || !draft.qty) return;
    const it = items.find(x => x.id === parseInt(draft.inventory_item_id, 10));
    setRecipe(prev => [...prev.filter(r => r.inventory_item_id !== it.id), { inventory_item_id: it.id, item_name: it.name, unit: it.unit, qty: parseFloat(draft.qty) }]);
    setDraft({ inventory_item_id: "", qty: "" });
  };
  const rm = (id) => setRecipe(prev => prev.filter(r => r.inventory_item_id !== id));
  const save = async () => {
    const body = { items: recipe.map(r => ({ inventory_item_id: r.inventory_item_id, qty: r.qty })) };
    const r = await fetch(`${base}/bundles/${picked}/recipe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast(`Recipe disimpan (${d.count} item)`);
  };
  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, color: C.dim, letterSpacing: 1 }}>BUNDLE</label>
        <select value={picked || ""} onChange={e => setPicked(parseInt(e.target.value, 10))} style={{ ...inp, width: 320 }}>
          {bundles.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button onClick={save} style={B.save}>💾 Simpan Recipe</button>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
        <Header cols={["INGREDIENT", "QTY", "UNIT", "CURRENT STOCK", "AKSI"]} widths={[280, 110, 80, 150, 70]} />
        {recipe.length === 0 ? <Empty>No ingredient. Tambah di bawah.</Empty> :
          recipe.map(r => (
            <div key={r.inventory_item_id} style={rowS}>
              <span style={{ width: 280, fontWeight: 700 }}>{r.item_name}</span>
              <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 700 }}>{fmtNum(r.qty)}</span>
              <span style={{ width: 80, fontSize: 11.5, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>{r.unit || "—"}</span>
              <span style={{ width: 150, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{r.current_stock != null ? fmtNum(r.current_stock) : "—"}</span>
              <span style={{ width: 70, textAlign: "right" }}>
                <button onClick={() => rm(r.inventory_item_id)} style={B.small("#ef4444")}>×</button>
              </span>
            </div>
          ))
        }
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: "flex", gap: 10, alignItems: "flex-end" }}>
        <Field label="Tambah item">
          <select value={draft.inventory_item_id} onChange={e => setDraft({ ...draft, inventory_item_id: e.target.value })} style={{ ...inp, width: 280 }}>
            <option value="">— Pilih ingredient —</option>
            {items.filter(it => !recipe.find(r => r.inventory_item_id === it.id)).map(it => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
          </select>
        </Field>
        <Field label="Qty per combo">
          <input type="number" step="0.01" value={draft.qty} onChange={e => setDraft({ ...draft, qty: e.target.value })} placeholder="mis: 0.08" style={{ ...inp, width: 130 }} />
        </Field>
        <button onClick={add} style={B.save}>+ Tambah</button>
      </div>
    </>
  );
}

function MovementsTab({ base }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    fetch(`${base}/inventory/movements`).then(r => r.json()).then(d => setRows(d.movements || [])).catch(() => {});
  }, [base]);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <Header cols={["WAKTU", "ITEM", "PERUBAHAN", "SOURCE", "CATATAN"]} widths={[150, 220, 100, 140, "auto"]} />
      {rows.length === 0 ? <Empty>No pergerakan stok.</Empty> :
        rows.map(r => (
          <div key={r.id} style={rowS}>
            <span style={{ width: 150, fontSize: 11.5, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>{fmtTs(r.created_at)}</span>
            <span style={{ width: 220, fontSize: 13, fontWeight: 700 }}>{r.item_name}</span>
            <span style={{ width: 100, fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: r.qty_change >= 0 ? "#10b981" : "#ef4444" }}>{r.qty_change >= 0 ? "+" : ""}{fmtNum(r.qty_change)} {r.unit || ""}</span>
            <span style={{ width: 140, fontSize: 11.5, color: C.sub }}>{r.source}</span>
            <span style={{ flex: 1, fontSize: 11.5, color: C.dim }}>{r.notes || ""}</span>
          </div>
        ))
      }
    </div>
  );
}

function Field({ label, children, wide }) {
  return (
    <div style={{ gridColumn: wide ? "span 2" : "auto" }}>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
function Header({ cols, widths }) {
  return (
    <div style={{ ...rowS, color: C.dim, fontSize: 11, letterSpacing: 1, padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
      {cols.map((c, i) => <span key={i} style={{ width: widths[i] === "auto" ? "auto" : widths[i], flex: widths[i] === "auto" ? 1 : "none" }}>{c}</span>)}
    </div>
  );
}
function Empty({ children }) { return <div style={{ padding: "22px 14px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
const rowS = { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" };
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const pillG = { background: "#10b98122", color: "#10b981", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 };
const pillX = { background: "#6b728022", color: "#9ca3af", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 };
const B = {
  add:    { background: "#a855f72a", border: "1px solid #a855f766", color: "#d8b4fe", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save:   { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  small: (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 9px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }),
};
