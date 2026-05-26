// karyaOS — F&B Happy Hour Pricing
import { useState, useEffect, useCallback } from "react";
import { useUiKit, TooltipButton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const empty = { name: "", outlet: "", category: "", start_time: "15:00", end_time: "18:00", applicable_days: "", discount_pct: 25, special_price: "", start_date: "", end_date: "", is_active: 1, description: "" };

export default function FnbHappyHour({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [rows, setRows] = useState([]);
  const [active, setActive] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => {
    const d = await fetch(`${base}/happy-hours?all=1`).then(r => r.json()); setRows(d.happy_hours || []);
    const a = await fetch(`${base}/happy-hours/active-now`).then(r => r.json()); setActive(a.active || []);
  }, [base]);
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);
  const save = async () => {
    if (!form.name) { showToast("Nama wajib", "err"); return; }
    const url = editing === "new" ? `${base}/happy-hours` : `${base}/happy-hours/${editing}`;
    const r = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Happy hour disimpan"); setEditing(null); setForm(empty); load();
  };
  const { confirm } = useUiKit();
  const remove = async (r) => { if (!(await confirm({ title: `Hapus happy hour "${r.name}"?`, danger: true, okLabel: "Delete" }))) return; await fetch(`${base}/happy-hours/${r.id}`, { method: "DELETE" }); load(); };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🕐 Happy Hour Pricing</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Discount time-based · auto-active per hr &amp; day berlaku.</div>
        </div>
        {!editing && <button onClick={() => { setEditing("new"); setForm(empty); }} style={B.add}>＋ Happy Hour</button>}
      </div>
      {active.length > 0 && (
        <div style={{ background: "linear-gradient(135deg,#f59e0b22 0%,#ec489922 100%)", border: "1px solid #f59e0b66", borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "#fbbf24", letterSpacing: 1.5, fontWeight: 700 }}>🔥 SEDANG AKTIF SEKARANG ({active.length})</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {active.map(r => (
              <div key={r.id} style={{ background: "#0d1117", border: "1px solid #f59e0b66", borderRadius: 8, padding: "6px 12px", fontSize: 12.5 }}>
                <b>{r.name}</b> · {r.start_time}–{r.end_time} · {r.special_price ? rp(r.special_price) : `${r.discount_pct}% off`}
              </div>
            ))}
          </div>
        </div>
      )}
      {editing && (
        <div style={{ background: C.card, border: "1px solid #f59e0b66", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", marginBottom: 10 }}>{editing === "new" ? "Happy Hour baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Nama"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Tea Time 25%" style={inp} /></Field>
            <Field label="Outlet (kosong = semua)"><input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} style={inp} /></Field>
            <Field label="Kategori"><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Minuman / Snack" style={inp} /></Field>
            <Field label="Jam mulai"><input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} style={inp} /></Field>
            <Field label="Jam selesai"><input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} style={inp} /></Field>
            <Field label="Hari berlaku"><input value={form.applicable_days} onChange={e => setForm({ ...form, applicable_days: e.target.value })} placeholder="monday,tuesday / weekend" style={inp} /></Field>
            <Field label="Discount %"><input type="number" step="0.1" value={form.discount_pct} onChange={e => setForm({ ...form, discount_pct: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label="Price khusus (Rp)"><input type="number" value={form.special_price} onChange={e => setForm({ ...form, special_price: e.target.value })} placeholder="kosong = pakai %" style={inp} /></Field>
            <Field label="Status"><label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center" }}><input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Active</label></Field>
            <Field label="Start berlaku"><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inp} /></Field>
            <Field label="Sampai"><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inp} /></Field>
            <Field label="Description" wide><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inp} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat" : "Save"}</button>
            <button onClick={() => { setEditing(null); setForm(empty); }} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", color: C.dim, fontSize: 11, letterSpacing: 1, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, gap: 10 }}>
          <span style={{ flex: 1.4 }}>NAME</span>
          <span style={{ width: 110 }}>JAM</span>
          <span style={{ width: 130 }}>HARI</span>
          <span style={{ width: 110, textAlign: "right" }}>DISCOUNT</span>
          <span style={{ width: 130 }}>PERIODE</span>
          <span style={{ width: 70 }}>STATUS</span>
          <span style={{ width: 110, textAlign: "right" }}>ACTIONS</span>
        </div>
        {rows.length === 0 ? <Empty>No happy hour.</Empty> : rows.map(r => (
          <div key={r.id} style={{ display: "flex", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, alignItems: "center" }}>
            <span style={{ flex: 1.4 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
              {r.outlet && <div style={{ fontSize: 11, color: C.sub }}>🏪 {r.outlet}</div>}
            </span>
            <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>{r.start_time}–{r.end_time}</span>
            <span style={{ width: 130, fontSize: 11.5, color: C.sub }}>{r.applicable_days || "semua day"}</span>
            <span style={{ width: 110, textAlign: "right", fontFamily: "'Geist Mono',monospace", color: "#10b981", fontWeight: 700 }}>
              {r.special_price ? rp(r.special_price) : `${r.discount_pct}%`}
            </span>
            <span style={{ width: 130, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{r.start_date || "∞"} → {r.end_date || "∞"}</span>
            <span style={{ width: 70 }}>{r.is_active ? <span style={{ background: "#10b98122", color: "#10b981", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>aktif</span> : <span style={{ background: "#6b728022", color: "#9ca3af", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>off</span>}</span>
            <span style={{ width: 110, display: "flex", gap: 4, justifyContent: "flex-end" }}>
              <button onClick={() => { setEditing(r.id); setForm({ ...empty, ...r }); }} style={Ba("#a855f7")}>Edit</button>
              <button onClick={() => remove(r)} style={Ba("#ef4444")}>×</button>
            </span>
          </div>
        ))}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}
    </div>
  );
}
function Field({ label, children, wide }) { return <div style={{ gridColumn: wide ? "span 2" : "auto" }}><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
function Empty({ children }) { return <div style={{ padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = { add: { background: "#f59e0b22", border: "1px solid #f59e0b66", color: "#fbbf24", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, save: { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
