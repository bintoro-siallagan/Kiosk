// karyaOS — F&B Birthday Campaign automation
import { useState, useEffect, useCallback } from "react";
import { useUiKit, TooltipButton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const empty = { name: "", campaign_type: "discount", discount_pct: 10, voucher_code: "", freebie_item_name: "", valid_days_before: 7, valid_days_after: 7, min_purchase: 0, applies_to_tier: "", description: "", is_active: 1 };
const TYPES = { discount: "💸 Discount %", voucher: "🎟️ Voucher code", freebie: "🎁 Freebie item" };

export default function FnbBirthdayPromo({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [rows, setRows] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => {
    const d = await fetch(`${base}/birthday-campaigns`).then(r => r.json()); setRows(d.campaigns || []);
    fetch(`${base}/membership-tiers`).then(r => r.json()).then(d => setTiers(d.tiers || []));
  }, [base]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form.name) { showToast("Nama wajib", "err"); return; }
    const url = editing === "new" ? `${base}/birthday-campaigns` : `${base}/birthday-campaigns/${editing}`;
    const r = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast("Campaign disimpan"); setEditing(null); setForm(empty); load();
  };
  const { confirm } = useUiKit();
  const remove = async (r) => { if (!(await confirm({ title: `Hapus campaign "${r.name}"?`, danger: true, okLabel: "Delete" }))) return; await fetch(`${base}/birthday-campaigns/${r.id}`, { method: "DELETE" }); load(); };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎂 Birthday Promo Automation</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Auto-trigger discount / voucher / freebie pas customer ulang year (window N day before/after).</div>
        </div>
        {!editing && <button onClick={() => { setEditing("new"); setForm(empty); }} style={B.add}>＋ Campaign baru</button>}
      </div>
      {editing && (
        <div style={{ background: C.card, border: "1px solid #ec489966", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ec4899", marginBottom: 10 }}>{editing === "new" ? "Campaign baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Nama"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Birthday 15% off" style={inp} /></Field>
            <Field label="Tipe"><select value={form.campaign_type} onChange={e => setForm({ ...form, campaign_type: e.target.value })} style={inp}>{Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Tier (kosong = semua)"><select value={form.applies_to_tier} onChange={e => setForm({ ...form, applies_to_tier: e.target.value })} style={inp}><option value="">Semua tier</option>{tiers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select></Field>
            {form.campaign_type === "discount" && <Field label="Discount %"><input type="number" step="0.01" value={form.discount_pct} onChange={e => setForm({ ...form, discount_pct: parseFloat(e.target.value) || 0 })} style={inp} /></Field>}
            {form.campaign_type === "voucher"  && <Field label="Voucher code"><input value={form.voucher_code} onChange={e => setForm({ ...form, voucher_code: e.target.value.toUpperCase() })} placeholder="HBD2026" style={{ ...inp, fontFamily: "'Geist Mono',monospace", letterSpacing: 2 }} /></Field>}
            {form.campaign_type === "freebie"  && <Field label="Item gratis"><input value={form.freebie_item_name} onChange={e => setForm({ ...form, freebie_item_name: e.target.value })} placeholder="Brownies Mini" style={inp} /></Field>}
            <Field label="Valid N day sebelum"><input type="number" value={form.valid_days_before} onChange={e => setForm({ ...form, valid_days_before: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Valid N day sesudah"><input type="number" value={form.valid_days_after} onChange={e => setForm({ ...form, valid_days_after: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Min pembelian (Rp)"><input type="number" value={form.min_purchase} onChange={e => setForm({ ...form, min_purchase: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Description" wide><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} /></Field>
            <Field label="Status"><label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center" }}><input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Active</label></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat" : "Save"}</button>
            <button onClick={() => { setEditing(null); setForm(empty); }} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
        {rows.map(r => (
          <div key={r.id} style={{ background: C.card, border: `2px solid ${r.is_active ? "#ec489966" : "#1b212c"}`, borderRadius: 14, padding: 14, opacity: r.is_active ? 1 : 0.55 }}>
            <div style={{ fontSize: 11, color: "#ec4899", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{TYPES[r.campaign_type] || r.campaign_type}</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{r.name}</div>
            {r.description && <div style={{ fontSize: 12, color: C.sub, marginTop: 4, lineHeight: 1.45 }}>{r.description}</div>}
            <div style={{ background: "#0a0e16", borderRadius: 9, padding: "8px 11px", marginTop: 10, fontSize: 12.5, lineHeight: 1.5 }}>
              {r.campaign_type === "discount" && <div><span style={{ color: C.dim }}>Discount</span> <b style={{ color: "#10b981" }}>{r.discount_pct}%</b></div>}
              {r.campaign_type === "voucher"  && <div><span style={{ color: C.dim }}>Voucher</span> <b style={{ fontFamily: "'Geist Mono',monospace", color: "#fbbf24" }}>{r.voucher_code}</b></div>}
              {r.campaign_type === "freebie"  && <div><span style={{ color: C.dim }}>Freebie</span> <b>{r.freebie_item_name}</b></div>}
              <div><span style={{ color: C.dim }}>Window</span> {r.valid_days_before}d before → {r.valid_days_after}d after</div>
              {r.min_purchase > 0 && <div><span style={{ color: C.dim }}>Min</span> Rp {(r.min_purchase || 0).toLocaleString("id-ID")}</div>}
              {r.applies_to_tier && <div><span style={{ color: C.dim }}>Tier</span> {r.applies_to_tier}+</div>}
            </div>
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
const B = { add: { background: "#ec489922", border: "1px solid #ec489966", color: "#f9a8d4", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, save: { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "5px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: 1 });
