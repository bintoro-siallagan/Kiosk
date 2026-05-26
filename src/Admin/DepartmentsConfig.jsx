// karyaOS — Departments Master Config
// CRUD departments. Admin bisa tambah/edit/hapus department dinamis.
import { useCallback, useEffect, useState } from "react";
import { ErrorInline } from "../components/ConnectionError.jsx";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444", CYAN = "#22d3ee";
const CARD_BG = "rgba(255,255,255,0.04)";
const BORDER  = "1px solid rgba(255,255,255,0.08)";

const APPLIES_OPTIONS = [
  { value: "all", label: "Semua module" },
  { value: "launch", label: "Launch Readiness (KOLR)" },
  { value: "service", label: "Service Visit (KFS)" },
  { value: "audit", label: "Daily Audit (KROC)" },
];

const EMOJI_PRESETS = ["🏗️", "💻", "👥", "⚙️", "📦", "📢", "💰", "⚖️", "🔍", "🔧", "🚚", "🏢", "🧾", "🤝", "👔", "🎯", "🛠️", "📋", "✨", "🚀"];
const COLOR_PRESETS = ["#f59e0b", "#22d3ee", "#a855f7", "#10b981", "#3b82f6", "#ec4899", "#06b6d4", "#84cc16", "#f43f5e", "#0ea5e9", "#14b8a6", "#64748b", "#fbbf24", "#fb923c", "#e879f9"];

export default function DepartmentsConfig({ apiBase = "" }) {
  const API = apiBase || (typeof window !== "undefined" && window.location.origin) || "";
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    fetch(`${API}/api/departments/all`).then(r => r.json())
      .then(j => setDepts(j?.data || []))
      .catch(setErr).finally(() => setLoading(false));
  }, [API]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (dept) => {
    if (dept.active) {
      if (!confirm(`Nonaktifkan "${dept.label}"? Soft-delete — referensi history tetap aman.`)) return;
      await fetch(`${API}/api/departments/${dept.code}`, { method: "DELETE" });
    } else {
      await fetch(`${API}/api/departments/${dept.code}/restore`, { method: "POST" });
    }
    load();
  };

  const visible = depts.filter(d => showInactive || d.active);

  return (
    <div style={{ padding: 20, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / MASTER / DEPARTMENTS</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5 }}>🏢 Departments Master</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>CRUD departemen. Dipakai oleh KOLR Launch, Service Visit, dan KPI per dept.</div>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#cbd5e1", cursor: "pointer" }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={() => setEditing({})} style={{ padding: "8px 14px", background: `linear-gradient(135deg,${PURPLE},#7c3aed)`, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>
          + Tambah Department
        </button>
      </div>

      {err && <ErrorInline error={err} onRetry={load} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%, 240px),1fr))", gap: 10 }}>
        {visible.map(d => (
          <div key={d.code} style={{
            padding: 14, background: CARD_BG, border: BORDER, borderRadius: 12,
            borderLeft: `4px solid ${d.color || "#94a3b8"}`,
            opacity: d.active ? 1 : 0.5,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 28 }}>{d.icon || "·"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{d.label}</div>
                <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'Geist Mono',monospace" }}>{d.code}</div>
              </div>
            </div>
            {d.description && <div style={{ marginTop: 6, fontSize: 11, color: "#cbd5e1", lineHeight: 1.4 }}>{d.description}</div>}
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={chip(d.color || "#94a3b8")}>{d.applies_to || "all"}</span>
              {!d.active && <span style={chip("#64748b")}>NONAKTIF</span>}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
              <button onClick={() => setEditing(d)} style={{ flex: 1, padding: "6px", background: "rgba(168,85,247,0.15)", border: `1px solid ${PURPLE}55`, borderRadius: 6, color: PURPLE, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✏️ Edit</button>
              <button onClick={() => toggleActive(d)} style={{ flex: 1, padding: "6px", background: d.active ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", border: `1px solid ${(d.active ? RED : GREEN)}55`, borderRadius: 6, color: d.active ? RED : GREEN, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{d.active ? "✕ Deactivate" : "✓ Activate"}</button>
            </div>
          </div>
        ))}
      </div>

      {editing && <DeptEditModal dept={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} API={API} />}
    </div>
  );
}

function DeptEditModal({ dept, onClose, onSaved, API }) {
  const [form, setForm] = useState({
    code: dept.code || "", label: dept.label || "", icon: dept.icon || "🎯",
    color: dept.color || PURPLE, description: dept.description || "",
    applies_to: dept.applies_to || "all",
    display_order: dept.display_order || 999,
    active: dept.active !== 0,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isNew = !dept.code;

  const submit = async () => {
    setErr("");
    if (!form.label) { setErr("Label wajib"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/departments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(520px, 100%)", maxHeight: "92vh", overflowY: "auto", background: "#0a0f1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{isNew ? "NEW" : "EDIT"} DEPARTMENT</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 4, marginBottom: 14 }}>{form.icon} {form.label || "Department Baru"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10 }}>
          <Field label="ICON">
            <input value={form.icon} onChange={e => setForm({...form, icon: e.target.value})} placeholder="🎯" style={{...inp, fontSize: 22, textAlign: "center"}} />
          </Field>
          <Field label="LABEL *">
            <input value={form.label} onChange={e => setForm({...form, label: e.target.value})} placeholder="cth: Marketing & Promo" style={inp} />
          </Field>
        </div>

        <Field label="🎨 ICON PRESET">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {EMOJI_PRESETS.map(e => (
              <button key={e} onClick={() => setForm({...form, icon: e})} style={{
                width: 36, height: 36, fontSize: 18, border: form.icon === e ? `2px solid ${PURPLE}` : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, background: form.icon === e ? PURPLE + "33" : "rgba(0,0,0,0.3)", cursor: "pointer",
              }}>{e}</button>
            ))}
          </div>
        </Field>

        <Field label="🎨 WARNA">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {COLOR_PRESETS.map(c => (
              <button key={c} onClick={() => setForm({...form, color: c})} style={{
                width: 36, height: 36, background: c, border: form.color === c ? "3px solid #fff" : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, cursor: "pointer",
              }} />
            ))}
          </div>
        </Field>

        {isNew && (
          <Field label="CODE (auto kalau kosong)">
            <input value={form.code} onChange={e => setForm({...form, code: e.target.value.toLowerCase().replace(/\s+/g,"_")})} placeholder={form.label ? form.label.toLowerCase().replace(/\s+/g,"_") : "auto_generated"} style={{...inp, fontFamily: "'Geist Mono',monospace"}} />
          </Field>
        )}

        <Field label="📄 DESKRIPSI">
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} style={{...inp, fontFamily: "inherit", resize: "vertical"}} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10 }}>
          <Field label="🎯 BERLAKU UNTUK">
            <select value={form.applies_to} onChange={e => setForm({...form, applies_to: e.target.value})} style={inp}>
              {APPLIES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="ORDER">
            <input type="number" value={form.display_order} onChange={e => setForm({...form, display_order: parseInt(e.target.value, 10) || 999})} style={inp} />
          </Field>
        </div>

        {err && <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ flex: 2, padding: 12, background: `linear-gradient(135deg,${PURPLE},#7c3aed)`, border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{busy ? "⏳" : "💾 Simpan"}</button>
        </div>
      </div>
    </div>
  );
}

function chip(color) {
  return { padding: "3px 8px", background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 6, fontSize: 10, color, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.3, display: "inline-block" };
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 0.5, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
const inp = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, padding: "10px 12px", color: "#fff",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};
