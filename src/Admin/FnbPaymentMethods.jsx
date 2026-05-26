// karyaOS — Payment Methods Master
// CRUD payment buttons + categories (Complimentary / FOC Mgmt / Diskon Karyawan).
// Push ke outlet (per-outlet scope) + bulk-push.
import { useState, useEffect, useCallback } from "react";
import { useUiKit, TooltipButton, BulkActionBar } from "../components/uiKit.jsx";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const emptyM = { code: "", name: "", category: "cash", icon: "💳", color: "#6b7280", requires_approval: 0, requires_reason: 0, reduces_revenue: 0, default_discount_pct: 0, mdr_pct: 0, max_amount: "", outlet_scope: "all", sort_order: 0, is_active: 1, notes: "" };
const emptyC = { code: "", name: "", icon: "💳", color: "#6b7280", sort_order: 0, description: "" };

export default function FnbPaymentMethods({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [tab, setTab] = useState("methods");
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>💳 Payment Methods Master</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Edit payment buttons · push to outlet · kategori (Cash/Card/Comp/FOC/Discount Employee/dst).</div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["methods", "💳 Methods"], ["categories", "📂 Categories"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ background: tab === id ? "#10b98122" : "transparent", border: `1px solid ${tab === id ? "#10b98166" : C.border}`, borderRadius: 8, padding: "8px 14px", color: tab === id ? "#fff" : C.sub, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
      {tab === "methods" && <MethodsTab base={base} showToast={showToast} />}
      {tab === "categories" && <CategoriesTab base={base} showToast={showToast} />}
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}
    </div>
  );
}

function MethodsTab({ base, showToast }) {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyM);
  const [filterCat, setFilterCat] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [pushOutlets, setPushOutlets] = useState("all");
  const load = useCallback(async () => {
    const d = await fetch(`${base}/payment-methods?all=1`).then(r => r.json()); setRows(d.methods || []);
    const c = await fetch(`${base}/payment-categories`).then(r => r.json()); setCats(c.categories || []);
  }, [base]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form.code || !form.name) { showToast("Code + name wajib", "err"); return; }
    const url = editing === "new" ? `${base}/payment-methods` : `${base}/payment-methods/${editing}`;
    const r = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast(editing === "new" ? "Method dibuat" : "Method diperbarui"); setEditing(null); setForm(emptyM); load();
  };
  const { confirm } = useUiKit();
  const remove = async (r) => { if (!(await confirm({ title: `Hapus method "${r.name}"?`, message: "Method ini akan hilang from semua outlet.", danger: true, okLabel: "Delete" }))) return; await fetch(`${base}/payment-methods/${r.id}`, { method: "DELETE" }); load(); };
  const toggleSelect = (id) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pushSelected = async () => {
    if (!selected.size) { showToast("Pilih method dulu", "err"); return; }
    const outlets = pushOutlets === "all" ? [] : pushOutlets.split(",").map(s => s.trim()).filter(Boolean);
    const r = await fetch(`${base}/payment-methods/bulk-push`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selected], outlets }) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast(`${d.count} method di-push to ${pushOutlets}`); setSelected(new Set()); load();
  };
  const filtered = filterCat ? rows.filter(r => r.category === filterCat) : rows;
  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Filter kategori">
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...inp, width: 200 }}>
            <option value="">— Semua —</option>
            {cats.map(c => <option key={c.code} value={c.code}>{c.icon} {c.name}</option>)}
          </select>
        </Field>
        <div style={{ flex: 1 }} />
        {selected.size > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Field label="Push to (outlet CSV, kosong = all)">
              <input value={pushOutlets} onChange={e => setPushOutlets(e.target.value)} placeholder="all / paskal,trans-studio" style={{ ...inp, width: 240 }} />
            </Field>
            <button onClick={pushSelected} style={B.push}>📤 Push {selected.size} method</button>
          </div>
        )}
        {!editing && <button onClick={() => { setEditing("new"); setForm(emptyM); }} style={B.add}>＋ Method baru</button>}
      </div>
      {editing && (
        <div style={{ background: C.card, border: `1px solid ${form.color}66`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: form.color, marginBottom: 10 }}>{editing === "new" ? "Method baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 1fr 80px", gap: 8 }}>
            <Field label="Code (slug)"><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="staff_discount" style={{ ...inp, fontFamily: "'Geist Mono',monospace" }} /></Field>
            <Field label="Nama tampilan"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Discount Employee" style={inp} /></Field>
            <Field label="Kategori">
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inp}>
                {cats.map(c => <option key={c.code} value={c.code}>{c.icon} {c.name}</option>)}
              </select>
            </Field>
            <Field label="Icon (emoji)"><input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} style={inp} /></Field>
            <Field label="Warna"><input type="color" value={form.color || "#6b7280"} onChange={e => setForm({ ...form, color: e.target.value })} style={{ ...inp, padding: 2, height: 34 }} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
            <Field label="MDR % (bank fee)"><input type="number" step="0.01" value={form.mdr_pct} onChange={e => setForm({ ...form, mdr_pct: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label="Default discount %"><input type="number" step="0.01" value={form.default_discount_pct} onChange={e => setForm({ ...form, default_discount_pct: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label="Max amount (Rp, opsional)"><input type="number" value={form.max_amount} onChange={e => setForm({ ...form, max_amount: e.target.value })} placeholder="kosong = no cap" style={inp} /></Field>
            <Field label="Outlet scope"><input value={form.outlet_scope} onChange={e => setForm({ ...form, outlet_scope: e.target.value })} placeholder="all / paskal,sayati" style={inp} /></Field>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><input type="checkbox" checked={!!form.requires_approval} onChange={e => setForm({ ...form, requires_approval: e.target.checked ? 1 : 0 })} /> 🔐 Butuh approval manager (PIN)</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><input type="checkbox" checked={!!form.requires_reason} onChange={e => setForm({ ...form, requires_reason: e.target.checked ? 1 : 0 })} /> 📝 Wajib isi alasan</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><input type="checkbox" checked={!!form.reduces_revenue} onChange={e => setForm({ ...form, reduces_revenue: e.target.checked ? 1 : 0 })} /> 💸 Kurangi revenue (comp/discount, gak hitung pendapatan)</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Active</label>
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="Notes"><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inp} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat" : "Save"}</button>
            <button onClick={() => { setEditing(null); setForm(emptyM); }} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, color: C.dim, fontSize: 11, letterSpacing: 1, gap: 10, alignItems: "center" }}>
          <span style={{ width: 22 }}><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={e => setSelected(e.target.checked ? new Set(filtered.map(r => r.id)) : new Set())} /></span>
          <span style={{ width: 36 }}></span>
          <span style={{ flex: 1.5 }}>NAME</span>
          <span style={{ width: 110 }}>KATEGORI</span>
          <span style={{ width: 70, textAlign: "right" }}>MDR%</span>
          <span style={{ width: 70, textAlign: "right" }}>DISC%</span>
          <span style={{ width: 90 }}>OUTLET</span>
          <span style={{ width: 90 }}>FLAGS</span>
          <span style={{ width: 60 }}>STATUS</span>
          <span style={{ width: 100, textAlign: "right" }}>ACTIONS</span>
        </div>
        {filtered.length === 0 ? <Empty>None payment method.</Empty> : filtered.map(r => {
          const cat = cats.find(c => c.code === r.category);
          return (
            <div key={r.id} style={{ display: "flex", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, alignItems: "center" }}>
              <span style={{ width: 22 }}><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} /></span>
              <span style={{ width: 36, fontSize: 22 }}>{r.icon}</span>
              <span style={{ flex: 1.5 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: r.color }}>{r.name}</div>
                <div style={{ fontSize: 10.5, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{r.code}</div>
              </span>
              <span style={{ width: 110, fontSize: 11.5, color: C.sub }}>{cat ? `${cat.icon} ${cat.name}` : r.category}</span>
              <span style={{ width: 70, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>{r.mdr_pct ? r.mdr_pct + "%" : "—"}</span>
              <span style={{ width: 70, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: r.default_discount_pct > 0 ? "#f59e0b" : C.dim }}>{r.default_discount_pct ? r.default_discount_pct + "%" : "—"}</span>
              <span style={{ width: 90, fontSize: 11, color: r.outlet_scope === "all" ? "#10b981" : "#fbbf24" }}>{r.outlet_scope}</span>
              <span style={{ width: 90, fontSize: 11, color: C.sub }}>{r.requires_approval ? "🔐" : ""}{r.requires_reason ? "📝" : ""}{r.reduces_revenue ? "💸" : ""}</span>
              <span style={{ width: 60 }}>{r.is_active ? <span style={{ background: "#10b98122", color: "#10b981", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>aktif</span> : <span style={{ background: "#6b728022", color: "#9ca3af", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>off</span>}</span>
              <span style={{ width: 100, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button onClick={() => { setEditing(r.id); setForm({ ...emptyM, ...r, max_amount: r.max_amount || "" }); }} style={Ba("#a855f7")}>Edit</button>
                <button onClick={() => remove(r)} style={Ba("#ef4444")}>×</button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function CategoriesTab({ base, showToast }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyC);
  const load = useCallback(async () => { const d = await fetch(`${base}/payment-categories`).then(r => r.json()); setRows(d.categories || []); }, [base]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form.code || !form.name) { showToast("Wajib", "err"); return; }
    const url = editing === "new" ? `${base}/payment-categories` : `${base}/payment-categories/${editing}`;
    const r = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Kategori disimpan"); setEditing(null); setForm(emptyC); load();
  };
  const { confirm } = useUiKit();
  const remove = async (r) => { if (!(await confirm({ title: `Hapus kategori "${r.name}"?`, message: "Method yang pakai kategori ini akan jadi 'Lainnya'.", danger: true, okLabel: "Delete" }))) return; await fetch(`${base}/payment-categories/${r.id}`, { method: "DELETE" }); load(); };
  return (
    <>
      <div style={{ marginBottom: 12 }}>{!editing && <button onClick={() => { setEditing("new"); setForm(emptyC); }} style={B.add}>＋ Kategori baru</button>}</div>
      {editing && (
        <div style={{ background: C.card, border: `1px solid ${form.color}66`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 80px 80px 80px", gap: 8 }}>
            <Field label="Code"><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} style={{ ...inp, fontFamily: "'Geist Mono',monospace" }} /></Field>
            <Field label="Nama"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} /></Field>
            <Field label="Icon"><input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} style={inp} /></Field>
            <Field label="Warna"><input type="color" value={form.color || "#6b7280"} onChange={e => setForm({ ...form, color: e.target.value })} style={{ ...inp, padding: 2, height: 34 }} /></Field>
            <Field label="Urut"><input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
          </div>
          <div style={{ marginTop: 8 }}>
            <Field label="Description"><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inp} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat" : "Save"}</button>
            <button onClick={() => { setEditing(null); setForm(emptyC); }} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {rows.map(r => (
          <div key={r.id} style={{ background: C.card, border: `2px solid ${r.color}55`, borderRadius: 14, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 30 }}>{r.icon}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: r.color }}>{r.name}</div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{r.code}</div>
              </div>
            </div>
            {r.description && <div style={{ fontSize: 12, color: C.sub, marginTop: 8, lineHeight: 1.45 }}>{r.description}</div>}
            <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
              <button onClick={() => { setEditing(r.id); setForm({ ...emptyC, ...r }); }} style={Ba("#a855f7")}>Edit</button>
              <button onClick={() => remove(r)} style={Ba("#ef4444")}>×</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Field({ label, children }) { return <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
function Empty({ children }) { return <div style={{ padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = {
  add:    { background: "#10b98122", border: "1px solid #10b98166", color: "#10b981", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save:   { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  push:   { background: "#22d3ee", border: "none", color: "#04130c", padding: "9px 18px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
