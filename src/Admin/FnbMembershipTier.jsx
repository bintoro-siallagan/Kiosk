// karyaOS — F&B Membership Tier (Bronze / Silver / Gold / Platinum)
import { useState, useEffect, useCallback } from "react";
import { useUiKit, EmptyState, TooltipButton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const empty = { name: "", min_lifetime_spend: 0, min_visits: 0, points_multiplier: 1, birthday_bonus_pct: 0, free_delivery: 0, priority_queue: 0, perks_description: "", color: "#6b7280", sort_order: 0, is_active: 1 };

export default function FnbMembershipTier({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => { const d = await fetch(`${base}/membership-tiers?all=1`).then(r => r.json()); setRows(d.tiers || []); }, [base]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form.name) { showToast("Nama wajib", "err"); return; }
    const url = editing === "new" ? `${base}/membership-tiers` : `${base}/membership-tiers/${editing}`;
    const r = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Tier disimpan"); setEditing(null); setForm(empty); load();
  };
  const { confirm } = useUiKit();
  const remove = async (r) => { if (!(await confirm({ title: `Hapus tier "${r.name}"?`, message: "Member yang sudah di tier ini tetap aktif sampai dipindah manual.", danger: true, okLabel: "Hapus" }))) return; await fetch(`${base}/membership-tiers/${r.id}`, { method: "DELETE" }); load(); };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🏅 Membership Tier</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Bronze · Silver · Gold · Platinum — auto-promote based on lifetime spend / visit count.</div>
        </div>
        {!editing && <button onClick={() => { setEditing("new"); setForm(empty); }} style={B.add}>＋ Tier baru</button>}
      </div>
      {editing && (
        <div style={{ background: C.card, border: `1px solid ${form.color}66`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: form.color, marginBottom: 10 }}>{editing === "new" ? "Tier baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Nama tier"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Gold" style={inp} /></Field>
            <Field label="Warna"><input type="color" value={form.color || "#6b7280"} onChange={e => setForm({ ...form, color: e.target.value })} style={{ ...inp, padding: 3, height: 36 }} /></Field>
            <Field label="Urutan"><input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Min lifetime spend (Rp)"><input type="number" value={form.min_lifetime_spend} onChange={e => setForm({ ...form, min_lifetime_spend: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Min visit count"><input type="number" value={form.min_visits} onChange={e => setForm({ ...form, min_visits: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Point multiplier"><input type="number" step="0.1" value={form.points_multiplier} onChange={e => setForm({ ...form, points_multiplier: parseFloat(e.target.value) || 1 })} style={inp} /></Field>
            <Field label="Birthday bonus %"><input type="number" step="0.1" value={form.birthday_bonus_pct} onChange={e => setForm({ ...form, birthday_bonus_pct: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label="Free delivery"><label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center" }}><input type="checkbox" checked={!!form.free_delivery} onChange={e => setForm({ ...form, free_delivery: e.target.checked ? 1 : 0 })} /> Gratis ongkir</label></Field>
            <Field label="Priority queue"><label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center" }}><input type="checkbox" checked={!!form.priority_queue} onChange={e => setForm({ ...form, priority_queue: e.target.checked ? 1 : 0 })} /> Antrian prioritas</label></Field>
            <Field label="Perks" wide><textarea value={form.perks_description || ""} onChange={e => setForm({ ...form, perks_description: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat" : "Simpan"}</button>
            <button onClick={() => { setEditing(null); setForm(empty); }} style={B.cancel}>Batal</button>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        {rows.map(r => (
          <div key={r.id} style={{ background: C.card, border: `2px solid ${r.color}66`, borderRadius: 14, padding: 16, opacity: r.is_active ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: r.color, letterSpacing: 1 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>#{r.sort_order}</div>
              </div>
              <span style={{ background: r.is_active ? "#10b98122" : "#6b728022", color: r.is_active ? "#10b981" : "#9ca3af", padding: "3px 9px", borderRadius: 7, fontSize: 11, fontWeight: 700 }}>{r.is_active ? "AKTIF" : "OFF"}</span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              <div>💰 Min spend: <b>{rp(r.min_lifetime_spend)}</b></div>
              <div>🛒 Min visit: <b>{r.min_visits}×</b></div>
              <div>⭐ Point: <b>{r.points_multiplier}×</b></div>
              <div>🎂 Birthday: <b>{r.birthday_bonus_pct}%</b></div>
              {r.free_delivery ? <div>🚴 Free delivery</div> : null}
              {r.priority_queue ? <div>⚡ Priority queue</div> : null}
            </div>
            {r.perks_description && <div style={{ fontSize: 12, color: C.sub, marginTop: 8, lineHeight: 1.4 }}>{r.perks_description}</div>}
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
function Field({ label, children, wide }) { return <div style={{ gridColumn: wide ? "span 2" : "auto" }}><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = { add: { background: "#fbbf2422", border: "1px solid #fbbf2466", color: "#fbbf24", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, save: { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "5px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: 1 });
