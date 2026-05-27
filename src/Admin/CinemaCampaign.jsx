// karyaOS — Cinema Campaign Engine
// Public campaigns: Premiere Night / Midnight Sale / Family Package / Student Day.
// Quick template button untuk 4 jenis standar, plus custom campaign.
import { useState, useEffect, useCallback } from "react";
import { fmtMoney } from "../lib/currency.js";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => n ? fmtMoney(n) : "—";
const TYPE = {
  premiere: { label: "🎬 Premiere Night",   color: "#a855f7" },
  midnight: { label: "🌙 Midnight Sale",    color: "#22d3ee" },
  family:   { label: "👨‍👩‍👧 Family Package", color: "#10b981" },
  student:  { label: "🎓 Student Day",      color: "#f59e0b" },
  special:  { label: "✨ Special",          color: "#ec4899" },
};
const TIME_BANDS = [["", "—"], ["morning", "Pagi"], ["matinee", "Matinee"], ["prime", "Prime"], ["late", "Late"]];
const empty = {
  name: "", campaign_type: "special", film_id: "", start_date: "", end_date: "",
  applicable_days: "", start_time_band: "", end_time_band: "",
  special_price: "", discount_pct: 0, min_attendees: 0, description: "", is_active: 1,
};

export default function CinemaCampaign({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [rows, setRows] = useState([]);
  const [films, setFilms] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toast, setToast] = useState(null);
  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2400); };

  const load = useCallback(async () => {
    const r = await fetch(`${base}/campaigns`); const d = await r.json();
    setRows(d.campaigns || []);
  }, [base]);
  useEffect(() => {
    load();
    fetch(`${base}/films`).then(r => r.json()).then(d => setFilms(d.films || [])).catch(() => {});
  }, [load, base]);

  const startNew = () => { setEditing("new"); setForm(empty); };
  const startEdit = (r) => { setEditing(r.id); setForm({ ...empty, ...r }); };
  const cancel = () => { setEditing(null); setForm(empty); };

  async function save() {
    if (!form.name?.trim()) { showToast("Nama wajib", "err"); return; }
    const url = editing === "new" ? `${base}/campaigns` : `${base}/campaigns/${editing}`;
    const method = editing === "new" ? "POST" : "PATCH";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast(editing === "new" ? "Campaign dibuat" : "Campaign diperbarui");
    cancel(); load();
  }
  async function seedTemplate(type) {
    if (!window.confirm(`Tambah template "${TYPE[type]?.label}" sebagai campaign baru?`)) return;
    const r = await fetch(`${base}/campaigns/template/${type}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast(`Template "${TYPE[type]?.label}" dibuat`); load();
  }
  const remove = async (r) => {
    if (!window.confirm(`Hapus campaign "${r.name}"?`)) return;
    await fetch(`${base}/campaigns/${r.id}`, { method: "DELETE" });
    showToast("Campaign dihapus"); load();
  };
  const toggleActive = async (r) => {
    await fetch(`${base}/campaigns/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !r.is_active }) });
    load();
  };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎉 Cinema Campaign Engine</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Premiere · Midnight · Family · Student Day. Quick template for launch cepat.</div>
        </div>
        {!editing && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => seedTemplate("premiere")} style={tplBtn("#a855f7")}>+ Premiere</button>
            <button onClick={() => seedTemplate("midnight")} style={tplBtn("#22d3ee")}>+ Midnight</button>
            <button onClick={() => seedTemplate("family")}   style={tplBtn("#10b981")}>+ Family</button>
            <button onClick={() => seedTemplate("student")}  style={tplBtn("#f59e0b")}>+ Student</button>
            <button onClick={startNew} style={B.add}>＋ Custom</button>
          </div>
        )}
      </div>

      {editing && (
        <div style={{ background: C.card, border: "1px solid #ec489966", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ec4899", marginBottom: 10 }}>{editing === "new" ? "Campaign baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Nama campaign"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Premiere Night Avengers" style={inp} /></Field>
            <Field label="Tipe">
              <select value={form.campaign_type} onChange={e => setForm({ ...form, campaign_type: e.target.value })} style={inp}>
                {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Film (opsional)">
              <select value={form.film_id || ""} onChange={e => setForm({ ...form, film_id: e.target.value })} style={inp}>
                <option value="">— Semua film —</option>
                {films.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
              </select>
            </Field>
            <Field label="Start"><input type="date" value={form.start_date || ""} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inp} /></Field>
            <Field label="Sampai"><input type="date" value={form.end_date || ""} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inp} /></Field>
            <Field label="Hari berlaku (CSV)"><input value={form.applicable_days || ""} onChange={e => setForm({ ...form, applicable_days: e.target.value })} placeholder="monday,tuesday / weekend" style={inp} /></Field>
            <Field label="Time band mulai">
              <select value={form.start_time_band || ""} onChange={e => setForm({ ...form, start_time_band: e.target.value })} style={inp}>
                {TIME_BANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Time band sampai">
              <select value={form.end_time_band || ""} onChange={e => setForm({ ...form, end_time_band: e.target.value })} style={inp}>
                {TIME_BANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Min tamu"><input type="number" value={form.min_attendees || 0} onChange={e => setForm({ ...form, min_attendees: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Price khusus (Rp)"><input type="number" value={form.special_price || ""} onChange={e => setForm({ ...form, special_price: e.target.value })} placeholder="kosong = pakai diskon %" style={inp} /></Field>
            <Field label="Discount %"><input type="number" step="0.01" value={form.discount_pct || 0} onChange={e => setForm({ ...form, discount_pct: parseFloat(e.target.value) || 0 })} style={inp} /></Field>
            <Field label="Status">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Aktif
              </label>
            </Field>
            <Field label="Description" wide><input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} style={inp} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Create" : "Save"}</button>
            <button onClick={cancel} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>
          No campaign. Pakai tombol quick-template di atas.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 12 }}>
          {rows.map(r => {
            const ty = TYPE[r.campaign_type] || TYPE.special;
            return (
              <div key={r.id} style={{ background: C.card, border: `2px solid ${ty.color}66`, borderRadius: 14, padding: 14, opacity: r.is_active ? 1 : 0.55 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: ty.color, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{ty.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{r.name}</div>
                    {r.film_title && <div style={{ fontSize: 11.5, color: C.sub }}>🎬 {r.film_title}</div>}
                  </div>
                  <span style={{ background: r.is_active ? "#10b98122" : "#6b728022", color: r.is_active ? "#10b981" : "#9ca3af", padding: "3px 9px", borderRadius: 7, fontSize: 11, fontWeight: 700 }}>{r.is_active ? "AKTIF" : "OFF"}</span>
                </div>
                {r.description && <div style={{ fontSize: 12, color: C.sub, marginBottom: 8, lineHeight: 1.45 }}>{r.description}</div>}
                <div style={{ background: "#0a0e16", borderRadius: 9, padding: "8px 11px", marginBottom: 8, fontSize: 12 }}>
                  {(r.start_date || r.end_date) && <div><span style={{ color: C.dim }}>Periode</span> {r.start_date || "∞"} → {r.end_date || "∞"}</div>}
                  {r.applicable_days && <div><span style={{ color: C.dim }}>Hari</span> {r.applicable_days}</div>}
                  {(r.start_time_band || r.end_time_band) && <div><span style={{ color: C.dim }}>Time-band</span> {r.start_time_band || "*"} → {r.end_time_band || "*"}</div>}
                  {r.min_attendees > 0 && <div><span style={{ color: C.dim }}>Min tamu</span> {r.min_attendees}</div>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
                  <span>{r.special_price ? <>Price <b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(r.special_price)}</b></> : null}</span>
                  <span>{r.discount_pct > 0 ? <>Discount <b style={{ color: "#fbbf24", fontFamily: "'Geist Mono',monospace" }}>{r.discount_pct}%</b></> : null}</span>
                </div>
                <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                  <button onClick={() => toggleActive(r)} style={Ba(r.is_active ? "#6b7280" : "#10b981")}>{r.is_active ? "Off" : "On"}</button>
                  <button onClick={() => startEdit(r)} style={Ba("#a855f7")}>Edit</button>
                  <button onClick={() => remove(r)} style={Ba("#ef4444")}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.kind === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.kind === "err" ? "#ef4444" : "#22c55e"}`,
          color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>
      )}
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
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const tplBtn = (color) => ({ background: color + "1f", border: `1px solid ${color}55`, color, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
const B = {
  add:    { background: "#ec489922", border: "1px solid #ec489966", color: "#f9a8d4", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save:   { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "5px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
