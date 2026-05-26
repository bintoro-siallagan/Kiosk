// karyaOS — F&B Time-Based Menu Periods (Breakfast / Lunch / Tea / Dinner / Late)
import { useState, useEffect, useCallback } from "react";
import { useUiKit, TooltipButton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const empty = { name: "", icon: "🍽️", start_time: "11:00", end_time: "14:30", applicable_days: "", sort_order: 0, is_active: 1, notes: "" };

export default function FnbMenuPeriods({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [rows, setRows] = useState([]);
  const [current, setCurrent] = useState(null);
  const [time, setTime] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => { const d = await fetch(`${base}/menu-periods`).then(r => r.json()); setRows(d.periods || []); setCurrent(d.current_period); setTime(d.current_time); }, [base]);
  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);
  const save = async () => {
    if (!form.name || !form.start_time || !form.end_time) { showToast("Required", "err"); return; }
    const url = editing === "new" ? `${base}/menu-periods` : `${base}/menu-periods/${editing}`;
    const r = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Period disimpan"); setEditing(null); setForm(empty); load();
  };
  const { confirm } = useUiKit();
  const remove = async (r) => { if (!(await confirm({ title: `Hapus period "${r.name}"?`, danger: true, okLabel: "Delete" }))) return; await fetch(`${base}/menu-periods/${r.id}`, { method: "DELETE" }); load(); };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>⏰ Time-Based Menu Periods</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Breakfast / Lunch / Tea / Dinner / Late — auto-switch menu sesuai jam.</div>
        </div>
        {!editing && <button onClick={() => { setEditing("new"); setForm(empty); }} style={B.add}>＋ Period baru</button>}
      </div>
      {current && (
        <div style={{ background: "linear-gradient(135deg,#22d3ee22,#0d1117)", border: "1px solid #22d3ee66", borderRadius: 12, padding: 14, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 36 }}>{current.icon}</div>
          <div>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: "#22d3ee", letterSpacing: 2, fontWeight: 700 }}>SEDANG AKTIF · {time}</div>
            <div style={{ fontSize: 19, fontWeight: 800, marginTop: 2 }}>{current.name}</div>
            <div style={{ fontSize: 11.5, color: C.sub }}>{current.start_time} – {current.end_time}{current.notes ? ` · ${current.notes}` : ""}</div>
          </div>
        </div>
      )}
      {editing && (
        <div style={{ background: C.card, border: "1px solid #22d3ee66", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#22d3ee", marginBottom: 10 }}>{editing === "new" ? "Period baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr 1fr", gap: 10 }}>
            <Field label="Nama"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Lunch" style={inp} /></Field>
            <Field label="Icon"><input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="🍱" style={inp} /></Field>
            <Field label="Mulai"><input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} style={inp} /></Field>
            <Field label="Completed"><input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} style={inp} /></Field>
            <Field label="Hari berlaku"><input value={form.applicable_days} onChange={e => setForm({ ...form, applicable_days: e.target.value })} placeholder="kosong = semua hari" style={inp} /></Field>
            <Field label="Urutan"><input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Catatan"><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inp} /></Field>
            <Field label="Status"><label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center" }}><input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Aktif</label></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat" : "Save"}</button>
            <button onClick={() => { setEditing(null); setForm(empty); }} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
        {rows.map(r => {
          const isActive = current?.id === r.id;
          return (
            <div key={r.id} style={{ background: C.card, border: `2px solid ${isActive ? "#22d3ee" : C.border}`, borderRadius: 14, padding: 14, opacity: r.is_active ? 1 : 0.5 }}>
              <div style={{ fontSize: 30, marginBottom: 4 }}>{r.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{r.name}</div>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#22d3ee", marginTop: 4 }}>{r.start_time} – {r.end_time}</div>
              {r.applicable_days && <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>{r.applicable_days}</div>}
              {r.notes && <div style={{ fontSize: 11.5, color: C.dim, marginTop: 5 }}>{r.notes}</div>}
              {isActive && <div style={{ marginTop: 8, fontSize: 10, color: "#22d3ee", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>🟢 AKTIF</div>}
              <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
                <button onClick={() => { setEditing(r.id); setForm({ ...empty, ...r }); }} style={Ba("#a855f7")}>Edit</button>
                <button onClick={() => remove(r)} style={Ba("#ef4444")}>×</button>
              </div>
            </div>
          );
        })}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}
    </div>
  );
}
function Field({ label, children }) { return <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = { add: { background: "#22d3ee22", border: "1px solid #22d3ee66", color: "#67e8f9", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, save: { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: 1 });
