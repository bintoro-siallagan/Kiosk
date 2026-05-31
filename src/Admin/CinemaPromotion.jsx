// karyaOS — Cinema Promotion / Promo Codes
// Bisa: movie promo, combo promo, bank promo (BCA Friday 10%), member discount.
// Code → kiosk customer apply → discount applied to ticket purchase.
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
import { fmtMoney as rp } from "../lib/currency.js";
const PROMO_TYPES = [
  ["all",    "🎯 Semua"],
  ["movie",  "🎬 Per Film"],
  ["combo",  "🍿 F&B Combo"],
  ["bank",   "🏦 Bank Promo"],
  ["member", "👥 Member"],
];
const TRIGGER_TYPES = [
  ["code",                "🔑 Kode manual (customer ketik)"],
  ["auto_daily_tickets",  "🎫 Auto — capai N tiket day ini"],
  ["auto_daily_sales",    "💰 Auto — capai Rp omzet day ini"],
];
const empty = {
  code: "", name: "", description: "",
  promo_type: "all", discount_type: "percentage", discount_value: 10,
  min_purchase: 0, max_discount: null,
  applies_to_film_id: "", applies_to_bundle_id: "",
  bank_name: "", valid_from: "", valid_to: "",
  max_redemptions: null, is_active: 1,
  trigger_type: "code", trigger_threshold: 0, trigger_scope: "global",
};

export default function CinemaPromotion({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [rows, setRows] = useState([]);
  const [films, setFilms] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toast, setToast] = useState(null);
  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2400); };

  const load = useCallback(async () => {
    const r = await fetch(`${base}/promotions?all=1`); const d = await r.json();
    setRows(d.promotions || []);
  }, [base]);
  useEffect(() => {
    load();
    fetch(`${base}/films`).then(r => r.json()).then(d => setFilms(d.films || [])).catch(() => {});
    fetch(`${base}/bundles?all=1`).then(r => r.json()).then(d => setBundles(d.bundles || [])).catch(() => {});
  }, [load, base]);

  const startNew = () => { setEditing("new"); setForm(empty); };
  const startEdit = (r) => { setEditing(r.id); setForm({ ...empty, ...r }); };
  const cancel = () => { setEditing(null); setForm(empty); };

  async function save() {
    if (!form.name?.trim()) { showToast("Nama wajib", "err"); return; }
    if (!form.discount_value) { showToast("Discount value wajib", "err"); return; }
    const url = editing === "new" ? `${base}/promotions` : `${base}/promotions/${editing}`;
    const method = editing === "new" ? "POST" : "PATCH";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast(editing === "new" ? "Promo dibuat" : "Promo diperbarui");
    cancel(); load();
  }
  const remove = async (r) => {
    if (!window.confirm(`Hapus promo "${r.name}"?`)) return;
    await fetch(`${base}/promotions/${r.id}`, { method: "DELETE" });
    showToast("Promo dihapus"); load();
  };
  const toggleActive = async (r) => {
    await fetch(`${base}/promotions/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !r.is_active }) });
    load();
  };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎁 Mesin Promo Cinema</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Kode promo: film / combo / bank / diskon member · auto-validasi di kasir &amp; kiosk.</div>
        </div>
        {!editing && <button onClick={startNew} style={B.add}>＋ Promo baru</button>}
      </div>

      {editing && (
        <div style={{ background: C.card, border: "1px solid #f59e0b66", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", marginBottom: 10 }}>{editing === "new" ? "Promo baru" : `Edit #${editing}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Nama promo"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="BCA Weekend 20%" style={inp} /></Field>
            <Field label="Kode (opsional)"><input value={form.code || ""} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="BCA20" style={{ ...inp, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5 }} /></Field>
            <Field label="Tipe">
              <select value={form.promo_type} onChange={e => setForm({ ...form, promo_type: e.target.value })} style={inp}>
                {PROMO_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Tipe Diskon">
              <select value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value })} style={inp}>
                <option value="percentage">Persentase (%)</option>
                <option value="fixed">Nominal (Rp)</option>
              </select>
            </Field>
            <Field label={form.discount_type === "percentage" ? "Diskon %" : "Diskon Rp"}>
              <input type="number" step={form.discount_type === "percentage" ? "0.01" : "1000"} value={form.discount_value} onChange={e => setForm({ ...form, discount_value: parseFloat(e.target.value) || 0 })} style={inp} />
            </Field>
            <Field label="Maks Diskon (Rp)"><input type="number" value={form.max_discount ?? ""} onChange={e => setForm({ ...form, max_discount: e.target.value ? parseInt(e.target.value, 10) : null })} style={inp} /></Field>
            <Field label="Min pembelian (Rp)"><input type="number" value={form.min_purchase} onChange={e => setForm({ ...form, min_purchase: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            {form.promo_type === "movie" && (
              <Field label="Film">
                <select value={form.applies_to_film_id || ""} onChange={e => setForm({ ...form, applies_to_film_id: e.target.value })} style={inp}>
                  <option value="">— Pilih film —</option>
                  {films.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
              </Field>
            )}
            {form.promo_type === "combo" && (
              <Field label="Combo">
                <select value={form.applies_to_bundle_id || ""} onChange={e => setForm({ ...form, applies_to_bundle_id: e.target.value })} style={inp}>
                  <option value="">— Semua combo —</option>
                  {bundles.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            )}
            {form.promo_type === "bank" && (
              <Field label="Nama bank"><input value={form.bank_name || ""} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="BCA / Mandiri / BNI" style={inp} /></Field>
            )}
            <Field label="Berlaku dari"><input type="date" value={form.valid_from || ""} onChange={e => setForm({ ...form, valid_from: e.target.value })} style={inp} /></Field>
            <Field label="Sampai"><input type="date" value={form.valid_to || ""} onChange={e => setForm({ ...form, valid_to: e.target.value })} style={inp} /></Field>
            <Field label="Max redemption"><input type="number" value={form.max_redemptions ?? ""} onChange={e => setForm({ ...form, max_redemptions: e.target.value ? parseInt(e.target.value, 10) : null })} placeholder="kosong = unlimited" style={inp} /></Field>
            <Field label="Description" wide><input value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} style={inp} /></Field>
            {/* Auto-trigger fields — milestone-based promo (unlock saat omzet/tiket harian capai threshold) */}
            <Field label="Trigger" wide>
              <select value={form.trigger_type || "code"} onChange={e => setForm({ ...form, trigger_type: e.target.value })} style={inp}>
                {TRIGGER_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            {form.trigger_type && form.trigger_type !== "code" && (
              <>
                <Field label={form.trigger_type === "auto_daily_sales" ? "Threshold (Rp omzet)" : "Threshold (jumlah tiket)"}>
                  <input type="number" min="0" value={form.trigger_threshold ?? 0}
                    onChange={e => setForm({ ...form, trigger_threshold: parseInt(e.target.value, 10) || 0 })}
                    placeholder={form.trigger_type === "auto_daily_sales" ? "5000000" : "50"} style={inp} />
                </Field>
                <Field label="Scope (outlet)">
                  <input value={form.trigger_scope || "global"}
                    onChange={e => setForm({ ...form, trigger_scope: e.target.value || "global" })}
                    placeholder="global or JKT01" style={inp} />
                </Field>
                <div style={{ gridColumn: "span 3", padding: "8px 12px", background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.18)", borderRadius: 8, fontSize: 12, color: "#c084fc" }}>
                  💡 Promo ini <b>otomatis aktif</b> di kiosk tanpa customer ketik kode — begitu {form.trigger_type === "auto_daily_sales" ? "omzet" : "jumlah tiket"} harian capai threshold. Banner muncul + auto-apply di checkout.
                </div>
              </>
            )}
            <Field label="Status">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Aktif
              </label>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat promo" : "Save"}</button>
            <button onClick={cancel} style={B.cancel}>Batal</button>
          </div>
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", color: C.dim, fontSize: 11, letterSpacing: 1, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, alignItems: "center" }}>
          <span style={{ width: 110 }}>KODE</span>
          <span style={{ flex: 1.4 }}>NAME</span>
          <span style={{ width: 100 }}>TIPE</span>
          <span style={{ width: 120, textAlign: "right" }}>DISCOUNT</span>
          <span style={{ width: 140 }}>PERIODE</span>
          <span style={{ width: 110 }}>REDEMPTION</span>
          <span style={{ width: 60 }}>STATUS</span>
          <span style={{ width: 130, textAlign: "right" }}>ACTIONS</span>
        </div>
        {rows.length === 0 ? <div style={{ padding: 22, textAlign: "center", color: C.sub, fontSize: 13 }}>Belum ada promo · saatnya bikin yang pertama 🎁</div> :
          rows.map(r => (
            <div key={r.id} style={{ display: "flex", padding: "11px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, alignItems: "center" }}>
              <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", letterSpacing: 1.5, fontSize: 12, fontWeight: 700 }}>
                {r.trigger_type && r.trigger_type !== "code"
                  ? <span title="Auto-trigger promo (tidak butuh kode)" style={{ color: "#c084fc" }}>🎯 AUTO</span>
                  : (r.code || "—")}
              </span>
              <span style={{ flex: 1.4, fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>{r.name}</div>
                {r.description && <div style={{ fontSize: 11, color: C.sub }}>{r.description}</div>}
                {r.bank_name && <div style={{ fontSize: 11, color: "#22d3ee" }}>🏦 {r.bank_name}</div>}
                {r.trigger_type === "auto_daily_tickets" && (
                  <div style={{ fontSize: 11, color: "#c084fc", marginTop: 2 }}>🎫 Unlock setelah {r.trigger_threshold} tiket hari ini ({r.trigger_scope || "global"})</div>
                )}
                {r.trigger_type === "auto_daily_sales" && (
                  <div style={{ fontSize: 11, color: "#c084fc", marginTop: 2 }}>💰 Unlock setelah {rp(r.trigger_threshold)} omzet hari ini ({r.trigger_scope || "global"})</div>
                )}
              </span>
              <span style={{ width: 100, fontSize: 11.5, color: C.sub }}>{PROMO_TYPES.find(([v]) => v === r.promo_type)?.[1] || r.promo_type}</span>
              <span style={{ width: 120, textAlign: "right", fontFamily: "'Geist Mono',monospace", color: "#10b981", fontWeight: 700 }}>
                {r.discount_type === "percentage" ? `${r.discount_value}%` : rp(r.discount_value)}
              </span>
              <span style={{ width: 140, fontSize: 11, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>
                {r.valid_from || "∞"} → {r.valid_to || "∞"}
              </span>
              <span style={{ width: 110, fontSize: 11.5, fontFamily: "'Geist Mono',monospace", color: C.sub }}>
                {r.redemption_count || 0}{r.max_redemptions ? `/${r.max_redemptions}` : ""}
              </span>
              <span style={{ width: 60 }}>{r.is_active ? <span style={pillG}>aktif</span> : <span style={pillX}>off</span>}</span>
              <span style={{ width: 130, display: "flex", gap: 5, justifyContent: "flex-end" }}>
                <button onClick={() => toggleActive(r)} style={B.small(r.is_active ? "#6b7280" : "#10b981")}>{r.is_active ? "Off" : "On"}</button>
                <button onClick={() => startEdit(r)} style={B.small("#a855f7")}>Edit</button>
                <button onClick={() => remove(r)} style={B.small("#ef4444")}>×</button>
              </span>
            </div>
          ))
        }
      </div>

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
const pillG = { background: "#10b98122", color: "#10b981", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 };
const pillX = { background: "#6b728022", color: "#9ca3af", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 };
const B = {
  add:    { background: "#f59e0b22", border: "1px solid #f59e0b66", color: "#fbbf24", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save:   { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  small:  (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 9px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }),
};
