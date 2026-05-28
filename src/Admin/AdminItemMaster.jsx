// src/Admin/AdminItemMaster.jsx
// Item Master — registry terpadu: item core, kategori, tipe.

import { useState, useEffect, useCallback, useRef } from "react";

import { fmtMoney as fmtRp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";
const AC = "#0891b2";
const TYPE_C = {
  "Finished Goods": "#10b981", "Raw Material": "#f59e0b", "Semi Finished": "#a855f7",
  "Modifier": "#3b82f6", "Packaging": "#84cc16", "Service Item": "#06b6d4", "Promo Item": "#ec4899",
};

export default function AdminItemMaster({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState("all");
  const [editItem, setEditItem] = useState(null);  // item being edited via modal

  const load = useCallback(() => {
    fetch(`${apiBase}/api/item-master`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <LoadingState label="Memuat Item Master…" />;
  const s = d.summary;
  const items = filter === "all" ? d.items : d.items.filter(i => i.item_type === filter);
  const maxCat = Math.max(1, ...d.categories.map(c => c.count));

  return (
    <div>
      <div style={{...S.intro, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap"}}>
        <div style={{flex:1, minWidth:200}}>
          📦 <b style={{ color: AC }}>ITEM MASTER</b> — registry terpadu semua item: finished goods, raw
          material, packaging, modifier. Item core (code/SKU/barcode), kategori &amp; tipe — jantung ecosystem.
        </div>
        <BulkActions onDone={load}/>
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Items" v={String(s.total)} c={AC} />
        <Kpi label="Finished Goods" v={String(s.finished_goods)} c="#10b981" sub="item jual" />
        <Kpi label="Raw Material" v={String(s.raw_material)} c="#f59e0b" sub="bahan baku" />
        <Kpi label="Item Active" v={String(s.active)} c="#3b82f6" />
      </div>

      {/* Type distribution */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🏷️ ITEM TYPE — klik buat filter</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginTop: 10 }}>
          <TypeCard t={{ type: "all", icon: "📋" }} count={s.total} c={AC} on={filter === "all"} onClick={() => setFilter("all")} label="Semua" />
          {d.types.map(t => (
            <TypeCard key={t.type} t={t} count={t.count} c={TYPE_C[t.type] || "#9ca3af"} on={filter === t.type} onClick={() => setFilter(t.type)} />
          ))}
        </div>
      </div>

      {/* Category breakdown */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📂 KATEGORI</div>
        {d.categories.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
            <span style={{ width: 130, fontSize: 12, color: "#9da7b3" }}>{c.category}</span>
            <div style={{ flex: 1, height: 11, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: Math.round(c.count / maxCat * 100) + "%", background: AC }} />
            </div>
            <span style={{ width: 30, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{c.count}</span>
          </div>
        ))}
      </div>

      {/* Item table */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📋 ITEM REGISTRY — {items.length}{filter !== "all" ? ` · ${filter}` : ""}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["IMG", "ITEM CODE", "NAMA / DESKRIPSI", "KATEGORI", "TIPE", "HARGA/COST", "UOM", ""].map(h => (
                <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={S.td}><ImageCell item={it} onChange={load}/></td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#5b6470" }}>{it.item_code}</td>
                <td style={S.td}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{it.name}</div>
                  {it.description && <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 3, lineHeight: 1.4, maxWidth: 320 }}>{it.description}</div>}
                  {it.barcode && <div style={{ color: "#5b6470", fontSize: 10, fontFamily: "'Geist Mono',monospace", marginTop: 2 }}>📦 {it.barcode}</div>}
                </td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{it.category}{it.subcategory ? ` · ${it.subcategory}` : ""}</td>
                <td style={S.td}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_C[it.item_type] || "#9ca3af",
                    background: (TYPE_C[it.item_type] || "#9ca3af") + "1f", border: `1px solid ${(TYPE_C[it.item_type] || "#9ca3af")}55`,
                    borderRadius: 5, padding: "2px 8px", fontFamily: "'Geist Mono',monospace" }}>{it.item_type}</span>
                </td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#cdd5df" }}>{fmtRp(it.base_price)}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{it.uom}</td>
                <td style={S.td}>
                  <button onClick={() => setEditItem(it)} title="Edit nama, deskripsi, item code, harga"
                    style={{ padding: "4px 10px", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", borderRadius: 6, color: "#c084fc", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    ✏️ Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editItem && (
        <EditItemModal item={editItem} apiBase={apiBase} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); load(); }} />
      )}
    </div>
  );
}

// ── Per-row image upload/replace ──
function ImageCell({ item, onChange }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append('image', file);
    try {
      const r = await fetch(`/api/item-master/${encodeURIComponent(item.item_code)}/image`, { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'upload failed');
      onChange?.();
    } catch (e) { alert('✗ ' + e.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function handleRemove(e) {
    e.stopPropagation();
    if (!confirm(`Remove image for "${item.name}"?`)) return;
    try {
      const r = await fetch(`/api/item-master/${encodeURIComponent(item.item_code)}/image`, { method: 'DELETE' });
      if (!r.ok) throw new Error('failed');
      onChange?.();
    } catch (e) { alert('✗ ' + e.message); }
  }

  const url = item.image_url;
  return (
    <div style={{ position: 'relative', width: 44, height: 44 }}>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        title={url ? 'Replace image' : 'Upload image'}
        style={{
          width: 44, height: 44, borderRadius: 8, padding: 0, border: '1px solid #1f2937',
          background: url ? '#0a0e16' : '#0d1117', cursor: 'pointer', overflow: 'hidden', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
        {busy ? (
          <span style={{ color: '#5b6470', fontSize: 14 }}>⏳</span>
        ) : url ? (
          <img src={url.startsWith('http') ? url : url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        ) : (
          <span style={{ fontSize: 14, color: '#5b6470' }}>📷</span>
        )}
      </button>
      {url && (
        <button onClick={handleRemove} title="Remove image"
          style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%',
            background: '#dc2626', color: '#fff', border: '1px solid #7f1d1d', fontSize: 9, lineHeight: 1,
            cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      )}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}/>
    </div>
  );
}

// ── Bulk CSV import — uploads to pos_menus, auto-syncs to item_master ──
function BulkActions({ onDone }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function handleUpload(file) {
    setUploading(true);
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch('/api/master/menus/bulk-csv', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'upload failed');
      // Force item_master sync from pos_menus
      await fetch('/api/item-master/sync', { method: 'POST' }).catch(()=>{});
      alert(`✓ Imported ${j.imported}${j.skipped?`, skipped ${j.skipped}`:''}` + (j.errors?.length?`\n\n${j.errors.length} errors:\n${j.errors.slice(0,5).map(e=>`  Row ${e.row}: ${e.error}`).join('\n')}`:''));
      onDone?.();
    } catch (e) { alert('✗ ' + e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const btn = (bg, color) => ({ padding:"8px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", border:"1px solid #1f2937", background:bg, color, textDecoration:"none", whiteSpace:"nowrap" });

  return (
    <div style={{display:"flex", gap:8}}>
      <a href="/api/master/menus/bulk-template" download style={btn("#0d1117", "#cdd5df")}>📥 Template CSV</a>
      <button onClick={()=>fileRef.current?.click()} disabled={uploading}
        style={btn("#0891b2", "#fff")}>
        {uploading ? "⏳ Uploading…" : "📤 Bulk Upload"}
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" style={{display:"none"}}
        onChange={(e)=>{ const f=e.target.files?.[0]; if (f) handleUpload(f); }}/>
    </div>
  );
}

function TypeCard({ t, count, c, on, onClick, label }) {
  return (
    <button onClick={onClick} style={{ background: on ? c + "22" : "#0a0e16", border: `1px solid ${on ? c : "#161b22"}`,
      borderRadius: 9, padding: "10px 12px", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
      <div style={{ fontSize: 18 }}>{t.icon}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: on ? c : "#e6edf3", marginTop: 3 }}>{label || t.type}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace" }}>{count}</div>
    </button>
  );
}
function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "8px 8px" },
};

// ─── EDIT ITEM MODAL ───
// Edit nama, item_code, deskripsi, kategori, harga + image upload (sesuai ESB schema)
function EditItemModal({ item, apiBase, onClose, onSaved }) {
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    item_code:   item.item_code || "",
    name:        item.name || "",
    description: item.description || "",
    category:    item.category || "",
    subcategory: item.subcategory || "",
    base_price:  item.base_price || 0,
    uom:         item.uom || "pcs",
    barcode:     item.barcode || "",
    status:      item.status || "active",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [imgUploading, setImgUploading] = useState(false);
  const [imgUrl, setImgUrl] = useState(item.image_url || "");

  const save = async () => {
    if (!form.name.trim()) { setErr("Nama wajib diisi"); return; }
    if (!form.item_code.trim()) { setErr("Item Code wajib diisi"); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${apiBase}/api/item-master/${encodeURIComponent(item.item_code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, base_price: Number(form.base_price) || 0 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const uploadImage = async (file) => {
    if (!file) return;
    setImgUploading(true); setErr("");
    try {
      const fd = new FormData(); fd.append("image", file);
      const r = await fetch(`${apiBase}/api/item-master/${encodeURIComponent(item.item_code)}/image`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "upload failed");
      setImgUrl(j.image_url);
    } catch (e) { setErr(e.message); }
    setImgUploading(false);
  };

  const inp = {
    width: "100%", padding: "10px 12px", background: "rgba(0,0,0,0.4)", border: "1px solid #30363d",
    borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none",
  };
  const label = { fontSize: 10, color: "#9ca3af", fontFamily: "'Geist Mono',monospace", fontWeight: 700, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase", display: "block" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(8px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "linear-gradient(180deg, #0d1117, #06080d)", border: "1px solid rgba(168,85,247,0.4)", borderRadius: 16, padding: 24 }}>
        <div style={{ fontSize: 10, color: "#c084fc", letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>📦 EDIT ITEM (ESB Schema)</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 6, marginBottom: 16 }}>{item.name}</div>

        {/* Image upload */}
        <div style={{ marginBottom: 18, display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 100, height: 100, borderRadius: 10, background: "rgba(0,0,0,0.4)", border: "1px solid #30363d", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {imgUrl ? <img src={imgUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 32, opacity: 0.4 }}>🖼</span>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={label}>GAMBAR MENU</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => uploadImage(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} disabled={imgUploading} style={{ padding: "8px 16px", background: imgUploading ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: imgUploading ? "wait" : "pointer", fontFamily: "inherit" }}>
              {imgUploading ? "⏳ Uploading…" : "📤 Upload / Replace"}
            </button>
            <div style={{ fontSize: 10, color: "#5b6470", marginTop: 6, lineHeight: 1.5 }}>
              JPG/PNG, max 5MB. URL: <code style={{ color: "#22d3ee" }}>{imgUrl || "(no image)"}</code>
            </div>
          </div>
        </div>

        {/* Form fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={label}>ITEM CODE *</div>
            <input value={form.item_code} onChange={e => setForm({ ...form, item_code: e.target.value })} placeholder="MENU001" style={{ ...inp, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }} />
          </div>
          <div>
            <div style={label}>NAMA MENU *</div>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Black Sakura Regular" style={inp} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={label}>DESKRIPSI</div>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Yogurt premium dengan topping berry…" rows={3} style={{ ...inp, resize: "vertical" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={label}>KATEGORI</div>
            <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="froyo / smoothies / dll" style={inp} />
          </div>
          <div>
            <div style={label}>HARGA (RP)</div>
            <input type="number" value={form.base_price} onChange={e => setForm({ ...form, base_price: e.target.value })} placeholder="54000" style={{ ...inp, fontFamily: "'Geist Mono',monospace" }} />
          </div>
          <div>
            <div style={label}>UOM</div>
            <input value={form.uom} onChange={e => setForm({ ...form, uom: e.target.value })} placeholder="pcs" style={inp} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={label}>BARCODE / SKU</div>
            <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="optional" style={{ ...inp, fontFamily: "'Geist Mono',monospace" }} />
          </div>
          <div>
            <div style={label}>STATUS</div>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inp}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {err && <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Batal</button>
          <button onClick={save} disabled={busy} style={{ flex: 2, padding: 12, background: "linear-gradient(135deg, #a855f7, #7c3aed)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {busy ? "⏳ Saving…" : "💾 Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
