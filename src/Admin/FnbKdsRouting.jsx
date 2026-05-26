// karyaOS — KDS Multi-Station Routing (kategori menu → station)
import { useState, useEffect, useCallback } from "react";
import { useUiKit, TooltipButton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const empty = { name: "", icon: "🍳", category_keywords: "", printer_name: "", sort_order: 0, is_active: 1 };
export default function FnbKdsRouting({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [testCat, setTestCat] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => { const d = await fetch(`${base}/kds-stations?all=1`).then(r => r.json()); setRows(d.stations || []); }, [base]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form.name) { showToast("Nama wajib", "err"); return; }
    const url = editing === "new" ? `${base}/kds-stations` : `${base}/kds-stations/${editing}`;
    const r = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Station disimpan"); setEditing(null); setForm(empty); load();
  };
  const { confirm } = useUiKit();
  const remove = async (r) => { if (!(await confirm({ title: `Hapus station "${r.name}"?`, message: "Order yang to station ini akan kembali to routing default.", danger: true, okLabel: "Delete" }))) return; await fetch(`${base}/kds-stations/${r.id}`, { method: "DELETE" }); load(); };
  const testRoute = async () => {
    const r = await fetch(`${base}/kds-route?category=${encodeURIComponent(testCat)}`).then(r => r.json());
    setTestResult(r);
  };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🍳 KDS Multi-Station Routing</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Hot Kitchen / Cold / Beverage / Dessert · auto-route item to station sesuai kategori menu.</div>
        </div>
        {!editing && <button onClick={() => { setEditing("new"); setForm(empty); }} style={B.add}>＋ Station baru</button>}
      </div>
      <div style={{ background: "#0a0e16", border: `1px dashed ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "#22d3ee", letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 }}>🧮 TEST ROUTE</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
          <input value={testCat} onChange={e => setTestCat(e.target.value)} placeholder="Coba kategori menu (mis: pasta, juice, salad)" style={inp} />
          <button onClick={testRoute} style={B.save}>Test →</button>
          {testResult && (
            <span style={{ alignSelf: "center", fontSize: 13, color: "#10b981", fontWeight: 700 }}>
              → {testResult.station ? `${testResult.station.icon} ${testResult.station.name}` : "(no match)"}
            </span>
          )}
        </div>
      </div>
      {editing && (
        <div style={{ background: C.card, border: "1px solid #f97316aa", borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fb923c", marginBottom: 10 }}>{editing === "new" ? "Station baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 1fr 1fr 80px", gap: 8 }}>
            <Field label="Nama"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Hot Kitchen" style={inp} /></Field>
            <Field label="Icon"><input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} style={inp} /></Field>
            <Field label="Category keywords (CSV)"><input value={form.category_keywords} onChange={e => setForm({ ...form, category_keywords: e.target.value })} placeholder="pasta,grill,fried" style={inp} /></Field>
            <Field label="Printer"><input value={form.printer_name} onChange={e => setForm({ ...form, printer_name: e.target.value })} placeholder="printer-kitchen-1" style={inp} /></Field>
            <Field label="Urut"><input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat" : "Save"}</button>
            <button onClick={() => { setEditing(null); setForm(empty); }} style={B.cancel}>Cancel</button>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 13 }}>
              <input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Aktif
            </label>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {rows.map(r => (
          <div key={r.id} style={{ background: C.card, border: `1px solid ${r.is_active ? "#f97316aa" : C.border}`, borderRadius: 12, padding: 14, opacity: r.is_active ? 1 : 0.55 }}>
            <div style={{ fontSize: 36 }}>{r.icon}</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}><b style={{ color: C.dim }}>Categories:</b> {r.category_keywords || "—"}</div>
            <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>🖨 {r.printer_name || "—"}</div>
            <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
              <button onClick={() => { setEditing(r.id); setForm({ ...empty, ...r }); }} style={Ba("#a855f7")}>Edit</button>
              <button onClick={() => remove(r)} style={Ba("#ef4444")}>×</button>
            </div>
          </div>
        ))}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}
    </div>
  );
}
function Field({ label, children }) { return <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = { add: { background: "#f9731622", border: "1px solid #f9731666", color: "#fb923c", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, save: { background: "#10b981", border: "none", color: "#04130c", padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: 1 });
