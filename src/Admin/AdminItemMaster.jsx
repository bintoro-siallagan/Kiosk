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
              {["IMG", "ITEM CODE", "NAMA", "KATEGORI", "TIPE", "HARGA/COST", "UOM"].map(h => (
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
                  <div style={{ color: "#5b6470", fontSize: 10, fontFamily: "'Geist Mono',monospace" }}>{it.barcode}</div>
                </td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{it.category}{it.subcategory ? ` · ${it.subcategory}` : ""}</td>
                <td style={S.td}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_C[it.item_type] || "#9ca3af",
                    background: (TYPE_C[it.item_type] || "#9ca3af") + "1f", border: `1px solid ${(TYPE_C[it.item_type] || "#9ca3af")}55`,
                    borderRadius: 5, padding: "2px 8px", fontFamily: "'Geist Mono',monospace" }}>{it.item_type}</span>
                </td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#cdd5df" }}>{fmtRp(it.base_price)}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{it.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
