// client/src/Admin/AdminMasterItem.jsx
// Master Item tab — Categories, Menus, Extras, Groups, Units, BOM, COGS Report.
// Auto-deduct stock on sale uses BOM defined here.
import React, { useState, useEffect, useCallback } from 'react';
import { EmptyState } from '../components/uiKit.jsx';

const EmptyRow = ({ cols, icon, title, desc }) => (
  <tr><td colSpan={cols} style={{ padding: 0, background: 'transparent' }}>
    <EmptyState icon={icon} title={title} desc={desc} />
  </td></tr>
);

const API = '/api/master';

// ============================================================
// HELPERS
// ============================================================
const fmtIDR = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = (n) => `${(n || 0).toFixed(1)}%`;

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 207) return res.json();  // multi-status (consume-stock partial)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Best-effort fetch of warehouse SKU list for autocomplete
async function fetchWarehouseSKUs() {
  for (const url of ['/api/audit/warehouse', '/api/warehouse', '/api/inventory']) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data.items || []);
        if (arr.length && arr[0].sku) return arr;
      }
    } catch {}
  }
  return [];
}

// ============================================================
// MAIN
// ============================================================
export default function AdminMasterItem() {
  const [subTab, setSubTab] = useState('menus');
  const tabs = [
    { k: 'menus', l: 'Menus' },
    { k: 'extras', l: 'Extras' },
    { k: 'categories', l: 'Categories' },
    { k: 'groups', l: 'Extra Groups' },
    { k: 'units', l: 'Units' },
    { k: 'cogs', l: 'COGS Report' },
    { k: 'seed', l: 'Seed/Migrate' },
  ];

  return (
    <div className="master-item-tab" style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Master Item & BOM</h2>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.k} onClick={() => setSubTab(t.k)} style={{
            padding: '8px 14px', border: 'none', background: 'transparent',
            borderBottom: subTab === t.k ? '2px solid #3b82f6' : '2px solid transparent',
            color: subTab === t.k ? '#3b82f6' : '#374151',
            fontWeight: subTab === t.k ? 600 : 400, cursor: 'pointer'
          }}>{t.l}</button>
        ))}
      </div>
      {subTab === 'menus' && <Menus />}
      {subTab === 'extras' && <Extras />}
      {subTab === 'categories' && <Categories />}
      {subTab === 'groups' && <ExtraGroups />}
      {subTab === 'units' && <Units />}
      {subTab === 'cogs' && <COGSReport />}
      {subTab === 'seed' && <SeedTab />}
    </div>
  );
}

// ============================================================
// MENUS
// ============================================================
function Menus() {
  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    const q = filter ? `?category_id=${filter}` : '';
    api(`/menus${q}`).then(setList).catch(console.error);
  }, [filter]);
  useEffect(() => {
    api('/categories').then(setCategories);
    load();
  }, [load]);

  const handleSave = async (data) => {
    try {
      if (editing?.id && !editing.isNew) {
        await api(`/menus/${editing.id}`, { method: 'PUT', body: data });
      } else {
        await api('/menus', { method: 'POST', body: data });
      }
      setShowForm(false); setEditing(null); load();
    } catch (e) { alert(e.message); }
  };

  const toggleAvailable = async (id, current) => {
    await api(`/menus/${id}`, { method: 'PUT', body: { is_available: !current } });
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, display: 'inline-block', marginRight: 12 }}>Menus ({list.length})</h3>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Semua kategori</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <BulkImport categories={categories} onDone={load} />
          <button onClick={() => { setEditing({ isNew: true }); setShowForm(true); }} style={btnPrimary}>+ Add Menu</button>
        </div>
      </div>

      {showForm && <MenuForm initial={editing} categories={categories} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th>ID</th><th>Item</th><th>Kategori</th><th>Price</th>
            <th>Free Extras</th><th>Popular</th><th>Avail</th><th></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && <EmptyRow cols={8} icon="🍽️" title="Belum ada menu" desc="Klik '+ Add Menu' untuk tambah item pertama, atau Bulk Import dari CSV." />}
          {list.map(m => (
            <tr key={m.id}>
              <td style={{ fontSize: 11, color: '#6b7280' }}>{m.id}</td>
              <td><b>{m.emoji} {m.name}</b><br/><span style={{fontSize:11,color:'#6b7280'}}>{m.description}</span></td>
              <td>{m.category_name}</td>
              <td>{fmtIDR(m.price)}</td>
              <td>{m.free_extras}</td>
              <td>{m.is_popular ? '⭐' : '-'}</td>
              <td>
                <button onClick={() => toggleAvailable(m.id, m.is_available)} style={{
                  ...btnSmall, background: m.is_available ? '#dcfce7' : '#fee2e2',
                  color: m.is_available ? '#166534' : '#991b1b'
                }}>{m.is_available ? '✓ Ready' : '✗ Sold Out'}</button>
              </td>
              <td><button onClick={() => { setEditing(m); setShowForm(true); }} style={btnSmall}>Edit / BOM</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Bulk CSV import ─────────────────────────────────────────────
function BulkImport({ categories, onDone }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = React.useRef(null);

  async function handleUpload(file) {
    setUploading(true); setResult(null);
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await fetch(`${API}/menus/bulk-csv`, { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'upload failed');
      setResult(j);
      onDone?.();
    } catch (e) { setResult({ error: e.message }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  return (
    <>
      <a href={`${API}/menus/bulk-template`} download
        style={{ ...btnSmall, background: '#f3f4f6', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        📥 Download template
      </a>
      <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...btnSmall, background: '#e0e7ff', color: '#3730a3' }}>
        {uploading ? '⏳ Uploading…' : '📤 Bulk upload CSV'}
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />

      {result && (
        <div style={{
          marginTop: 8, padding: 12, borderRadius: 10, fontSize: 13,
          background: result.error ? '#fef2f2' : '#ecfdf5',
          border: `1px solid ${result.error ? '#fecaca' : '#a7f3d0'}`,
          color: result.error ? '#991b1b' : '#065f46',
          maxWidth: 480, position: 'absolute', zIndex: 100, marginLeft: -200, marginTop: 38,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          {result.error ? (
            <><b>Upload failed:</b> {result.error}</>
          ) : (
            <>
              <b>✓ Done.</b> Imported <b>{result.imported}</b>, skipped <b>{result.skipped}</b>
              {result.errors?.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: 'pointer' }}>Show {result.errors.length} errors</summary>
                  <ul style={{ marginTop: 4, paddingLeft: 20, fontSize: 12 }}>
                    {result.errors.slice(0, 10).map((e, i) => <li key={i}>Row {e.row}: {e.error}</li>)}
                    {result.errors.length > 10 && <li>… and {result.errors.length - 10} more</li>}
                  </ul>
                </details>
              )}
              <div style={{ marginTop: 6, fontSize: 11 }}>
                <button onClick={() => setResult(null)} style={{ background: 'none', border: 'none', color: '#065f46', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Dismiss</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

const DAYPART_OPTIONS = [
  { id: 'breakfast', emoji: '🥞', label: 'Sarapan', hint: '05-10' },
  { id: 'lunch',     emoji: '🍽️', label: 'Siang',   hint: '10-15' },
  { id: 'snack',     emoji: '☕', label: 'Sore',    hint: '15-18' },
  { id: 'dinner',    emoji: '🍝', label: 'Malam',   hint: '18-22' },
  { id: 'late',      emoji: '🌙', label: 'Larut',   hint: '22-05' },
];

function MenuForm({ initial, categories, onSave, onCancel }) {
  const [f, setF] = useState({
    id: '', emoji: '', name: '', description: '', price: 0,
    category_id: categories[0]?.id || '', free_extras: 0,
    is_popular: false, is_available: true, image_url: '',
    dayparts: [],
    ...initial
  });
  const isNew = initial?.isNew;
  const [detail, setDetail] = useState(null);
  const [extras, setExtras] = useState([]);
  const [selectedExtras, setSelectedExtras] = useState(new Set());
  const [bom, setBom] = useState([]);
  const [warehouseSkus, setWarehouseSkus] = useState([]);
  const [units, setUnits] = useState([]);

  useEffect(() => {
    api('/extras').then(setExtras);
    api('/units').then(setUnits);
    fetchWarehouseSKUs().then(setWarehouseSkus);
    if (!isNew && initial?.id) {
      api(`/menus/${initial.id}`).then(d => {
        setDetail(d);
        // Parse dayparts JSON kalau ada
        let dpArr = [];
        if (d.dayparts) {
          try { dpArr = JSON.parse(d.dayparts); if (!Array.isArray(dpArr)) dpArr = []; } catch { dpArr = []; }
        }
        setF(prev => ({
          ...prev, ...d,
          is_popular: d.is_popular === 1,
          is_available: d.is_available === 1,
          dayparts: dpArr,
        }));
        setSelectedExtras(new Set(d.allowed_extras || []));
        setBom(d.bom || []);
      });
    }
  }, [initial?.id, isNew]);

  const update = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF({ ...f, [k]: v });
  };

  const submit = async () => {
    try {
      const body = {
        ...f,
        price: parseFloat(f.price) || 0,
        free_extras: parseInt(f.free_extras, 10) || 0,
        allowed_extras: selectedExtras.size > 0 ? Array.from(selectedExtras) : undefined,
        dayparts: Array.isArray(f.dayparts) && f.dayparts.length ? f.dayparts : null,
      };
      await onSave(body);
      if (!isNew) {
        await api(`/bom/menu/${f.id}`, { method: 'PUT', body: { rows: bom } });
      }
    } catch (e) { alert(e.message); }
  };

  const cogsTotal = detail?.cogs_total || 0;
  const margin = (parseFloat(f.price) || 0) - cogsTotal;
  const marginPct = f.price ? (margin / f.price * 100) : 0;

  return (
    <div style={modalOverlay} onClick={onCancel}>
      <div style={modalBox} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <h3>{isNew ? 'Add Menu' : `Edit ${f.name}`}</h3>
          <button onClick={onCancel} style={btnSmall}>×</button>
        </div>

        <div style={formGrid}>
          <label>ID* <input value={f.id} onChange={update('id')} disabled={!isNew} placeholder="e.g. froyo-original" /></label>
          <label>Kategori* <select value={f.category_id} onChange={update('category_id')}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select></label>
          <label>Emoji <input value={f.emoji} onChange={update('emoji')} style={{width:60}} /></label>
          <label>Nama* <input value={f.name} onChange={update('name')} /></label>
          <label>Price* <input type="number" value={f.price} onChange={update('price')} /></label>
          <label>Free Extras <input type="number" value={f.free_extras} onChange={update('free_extras')} /></label>
          <label style={{gridColumn:'1/-1'}}>Description <textarea value={f.description} onChange={update('description')} rows={2} /></label>
          <label style={{gridColumn:'1/-1'}}>
            <div style={{ marginBottom: 6 }}>Menu Image</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {f.image_url ? (
                <img src={f.image_url.startsWith('http') ? f.image_url : (typeof window !== 'undefined' ? window.location.origin : '') + f.image_url}
                  alt={f.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #2a2b30', background: '#0a0e16' }} />
              ) : (
                <div style={{ width: 80, height: 80, borderRadius: 8, border: '1px dashed #2a2b30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#444', background: '#0a0e16' }}>📷</div>
              )}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input value={f.image_url || ''} onChange={update('image_url')} placeholder="Or paste image URL" />
                <label style={{ padding: '6px 12px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#22d3ee', fontWeight: 700, textAlign: 'center' }}>
                  📤 Upload Image
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      if (!f.id) { alert('Save menu first before uploading image'); return; }
                      const formData = new FormData();
                      formData.append('image', file);
                      try {
                        const r = await fetch(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/master/menus/${f.id}/image`, { method: 'POST', body: formData });
                        const j = await r.json();
                        if (!r.ok) throw new Error(j?.error || 'Upload failed');
                        update('image_url')({ target: { value: j.image_url } });
                      } catch (err) { alert('Upload failed: ' + err.message); }
                    }} />
                </label>
                {f.image_url && (
                  <button type="button" onClick={() => update('image_url')({ target: { value: '' } })}
                    style={{ padding: '4px 8px', background: 'transparent', border: '1px solid #ef444455', borderRadius: 6, color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>
                    🗑️ Remove image
                  </button>
                )}
              </div>
            </div>
          </label>
          <label style={{display:'flex', alignItems:'center', gap:6}}>
            <input type="checkbox" checked={f.is_popular} onChange={update('is_popular')} /> Popular ⭐
          </label>
          <label style={{display:'flex', alignItems:'center', gap:6}}>
            <input type="checkbox" checked={f.is_available} onChange={update('is_available')} /> Available
          </label>
        </div>

        {/* Dayparting — kapan item ini muncul (kalau kosong = sepanjang hari) */}
        <div style={{ marginTop: 12, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
            🕒 Tersedia Saat (Daypart)
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
            Pilih jam tayang. <b>Kosongkan = sepanjang hari</b> (default).
            Item akan otomatis sembunyi di signage kalau di luar jam.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DAYPART_OPTIONS.map(opt => {
              const checked = (f.dayparts || []).includes(opt.id);
              return (
                <label key={opt.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 999,
                  background: checked ? '#fef3c7' : '#fff',
                  border: `1px solid ${checked ? '#f59e0b' : '#e5e7eb'}`,
                  fontSize: 12, cursor: 'pointer', userSelect: 'none',
                }}>
                  <input
                    type="checkbox" checked={checked}
                    onChange={(e) => {
                      const next = new Set(f.dayparts || []);
                      if (e.target.checked) next.add(opt.id); else next.delete(opt.id);
                      setF({ ...f, dayparts: Array.from(next) });
                    }}
                    style={{ margin: 0 }}
                  />
                  <span>{opt.emoji} {opt.label}</span>
                  <span style={{ fontSize: 9, color: '#9ca3af', fontFamily: "'Geist Mono',monospace" }}>{opt.hint}</span>
                </label>
              );
            })}
            {(f.dayparts || []).length > 0 && (
              <button type="button" onClick={() => setF({ ...f, dayparts: [] })}
                style={{ padding: '6px 10px', background: 'transparent', border: '1px solid #9ca3af', borderRadius: 6, fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>
                ↺ Reset (all-day)
              </button>
            )}
          </div>
        </div>

        {!isNew && (
          <>
            <details style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
              <summary style={{cursor:'pointer', fontWeight:600}}>
                Allowed Extras ({selectedExtras.size === 0 ? 'semua' : selectedExtras.size + ' dipilih'})
              </summary>
              <p style={{ fontSize: 12, color: '#6b7280' }}>Kosongkan = SEMUA extras boleh. Pilih spesifik = hanya itu. Untuk takehome (no toppings): set free_extras=0 + pilih 0 extras (workaround: assign 1 dummy "no-extras").</p>
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:4, maxHeight:200, overflow:'auto'}}>
                {extras.map(e => (
                  <label key={e.id} style={{display:'flex', alignItems:'center', gap:4, fontSize:12}}>
                    <input type="checkbox" checked={selectedExtras.has(e.id)} onChange={(ev) => {
                      const s = new Set(selectedExtras);
                      if (ev.target.checked) s.add(e.id); else s.delete(e.id);
                      setSelectedExtras(s);
                    }} />
                    {e.emoji} {e.name} ({fmtIDR(e.extra_price)})
                  </label>
                ))}
              </div>
            </details>

            <BOMEditor parentType="menu" parentId={f.id} bom={bom} setBom={setBom}
              warehouseSkus={warehouseSkus} units={units} />

            <div style={{ marginTop: 12, padding: 12, background: margin < 0 ? '#fee2e2' : '#f0fdf4', borderRadius: 8, border: `1px solid ${margin < 0 ? '#fca5a5' : '#86efac'}` }}>
              <b>Margin Analysis:</b> {fmtIDR(f.price)} − {fmtIDR(cogsTotal)} COGS = <b>{fmtIDR(margin)}</b> ({fmtPct(marginPct)})
            </div>
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <button onClick={submit} style={btnPrimary}>Save</button>{' '}
          <button onClick={onCancel} style={btnSecondary}>Cancel</button>
          {!isNew && (
            <button onClick={async () => {
              if (!confirm(`Hapus menu ${f.name}?`)) return;
              await api(`/menus/${f.id}`, { method: 'DELETE' });
              onCancel();
            }} style={{...btnSmallDanger, marginLeft: 'auto', float: 'right'}}>Delete Menu</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// BOM EDITOR
// ============================================================
function BOMEditor({ parentType, parentId, bom, setBom, warehouseSkus, units }) {
  const updateRow = (idx, k, v) => {
    const next = [...bom]; next[idx] = { ...next[idx], [k]: v }; setBom(next);
  };
  const addRow = () => setBom([...bom, { sku: '', qty: 0, unit: 'gr', notes: '' }]);
  const removeRow = (idx) => setBom(bom.filter((_, i) => i !== idx));

  return (
    <details open style={{ marginTop: 12, padding: 12, background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
      <summary style={{cursor:'pointer', fontWeight:600, color: '#1e40af'}}>
        Bill of Material — Recipe ({bom.length} bahan)
      </summary>
      <p style={{ fontSize: 12, color: '#1e40af', marginTop: 8 }}>
        ⚠️ Tiap kali {parentType === 'menu' ? 'menu' : 'extra'} ini terjual, stok bahan-bahan ini otomatis dipotong dari warehouse.
      </p>
      <datalist id={`sku-list-${parentType}-${parentId}`}>
        {warehouseSkus.map(s => <option key={s.sku} value={s.sku}>{s.name || s.sku}</option>)}
      </datalist>
      <table style={tableStyle}>
        <thead>
          <tr><th>SKU (warehouse)</th><th>Qty</th><th>Unit</th><th>Notes</th><th></th></tr>
        </thead>
        <tbody>
          {bom.map((row, idx) => (
            <tr key={idx}>
              <td>
                <input value={row.sku} onChange={e => updateRow(idx, 'sku', e.target.value)}
                  list={`sku-list-${parentType}-${parentId}`}
                  placeholder="FROYO-BASE-PLAIN" style={{width: 200}} />
              </td>
              <td>
                <input type="number" step="0.001" value={row.qty}
                  onChange={e => updateRow(idx, 'qty', parseFloat(e.target.value) || 0)} style={{width: 100}} />
              </td>
              <td>
                <select value={row.unit} onChange={e => updateRow(idx, 'unit', e.target.value)}>
                  {units.map(u => <option key={u.code} value={u.code}>{u.code}</option>)}
                </select>
              </td>
              <td>
                <input value={row.notes || ''} onChange={e => updateRow(idx, 'notes', e.target.value)} style={{width: 150}} />
              </td>
              <td><button onClick={() => removeRow(idx)} style={btnSmallDanger}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} style={btnSmall}>+ Add Material</button>
      <p style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
        Tip: ketik di kolom SKU untuk lihat saran dari warehouse. Unit conversion otomatis (gr↔kg, ml↔l).
      </p>
    </details>
  );
}

// ============================================================
// EXTRAS
// ============================================================
function Extras() {
  const [list, setList] = useState([]);
  const [groups, setGroups] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [bulkPrice, setBulkPrice] = useState('');

  const load = useCallback(() => api('/extras').then(setList).catch(console.error), []);
  useEffect(() => { api('/extra-groups').then(setGroups); load(); }, [load]);

  const bulkSetPrice = async () => {
    const price = parseFloat(bulkPrice);
    if (!price || !confirm(`Set semua ${list.length} extras to ${fmtIDR(price)}?`)) return;
    await api('/extras/set-price', { method: 'POST', body: { price } });
    setBulkPrice('');
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap:'wrap', gap:8 }}>
        <h3 style={{ margin: 0 }}>Extras / Toppings ({list.length})</h3>
        <div>
          <input type="number" placeholder="Set all to..." value={bulkPrice} onChange={e=>setBulkPrice(e.target.value)} style={{width:120}} />{' '}
          <button onClick={bulkSetPrice} style={btnSmall}>Bulk Set Price</button>{' '}
          <button onClick={() => { setEditing({ isNew: true }); setShowForm(true); }} style={btnPrimary}>+ Extra</button>
        </div>
      </div>
      {showForm && <ExtraForm initial={editing} groups={groups} onClose={() => { setShowForm(false); setEditing(null); load(); }} />}
      <table style={tableStyle}>
        <thead><tr><th>ID</th><th>Nama</th><th>Grup</th><th>Price</th><th>Avail</th><th></th></tr></thead>
        <tbody>
          {list.map(e => (
            <tr key={e.id}>
              <td style={{ fontSize: 11, color: '#6b7280' }}>{e.id}</td>
              <td><b>{e.emoji} {e.name}</b></td>
              <td>{e.group_name || '-'}</td>
              <td>{fmtIDR(e.extra_price)}</td>
              <td>{e.is_available ? '✓' : '✗'}</td>
              <td><button onClick={() => { setEditing(e); setShowForm(true); }} style={btnSmall}>Edit / BOM</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExtraForm({ initial, groups, onClose }) {
  const isNew = initial?.isNew;
  const [f, setF] = useState({ id: '', name: '', emoji: '', group_id: groups[0]?.id || '',
    extra_price: 8000, is_available: true, ...initial });
  const [bom, setBom] = useState([]);
  const [warehouseSkus, setWarehouseSkus] = useState([]);
  const [units, setUnits] = useState([]);
  const [cogs, setCogs] = useState(null);

  useEffect(() => {
    api('/units').then(setUnits);
    fetchWarehouseSKUs().then(setWarehouseSkus);
    if (!isNew && initial?.id) {
      api(`/extras/${initial.id}`).then(d => {
        setF(prev => ({ ...prev, ...d, is_available: d.is_available === 1 }));
        setBom(d.bom || []);
        setCogs(d.cogs_total);
      });
    }
  }, []);

  const update = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async () => {
    try {
      const body = { ...f, extra_price: parseFloat(f.extra_price) || 0 };
      if (isNew) await api('/extras', { method: 'POST', body });
      else await api(`/extras/${f.id}`, { method: 'PUT', body });
      if (!isNew) await api(`/bom/extra/${f.id}`, { method: 'PUT', body: { rows: bom } });
      onClose();
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <h3>{isNew ? 'Tambah Extra' : `Edit ${f.name}`}</h3>
          <button onClick={onClose} style={btnSmall}>×</button>
        </div>
        <div style={formGrid}>
          <label>ID* <input value={f.id} onChange={update('id')} disabled={!isNew} /></label>
          <label>Nama* <input value={f.name} onChange={update('name')} /></label>
          <label>Emoji <input value={f.emoji || ''} onChange={update('emoji')} style={{width:60}} /></label>
          <label>Group <select value={f.group_id || ''} onChange={update('group_id')}>
            <option value="">- tanpa group -</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
          </select></label>
          <label>Price Extra <input type="number" value={f.extra_price} onChange={update('extra_price')} /></label>
          <label style={{display:'flex', alignItems:'center', gap:6}}>
            <input type="checkbox" checked={f.is_available} onChange={update('is_available')} /> Available
          </label>
        </div>
        {!isNew && (
          <>
            <BOMEditor parentType="extra" parentId={f.id} bom={bom} setBom={setBom}
              warehouseSkus={warehouseSkus} units={units} />
            {cogs !== null && (
              <div style={{ marginTop: 12, padding: 8, background: '#f0fdf4', borderRadius: 4, fontSize: 13 }}>
                <b>COGS:</b> {fmtIDR(cogs)} • <b>Margin:</b> {fmtIDR((parseFloat(f.extra_price)||0) - cogs)}
              </div>
            )}
          </>
        )}
        <div style={{ marginTop: 16 }}>
          <button onClick={submit} style={btnPrimary}>Save</button>{' '}
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CATEGORIES
// ============================================================
function Categories() {
  const [list, setList] = useState([]);
  const load = useCallback(() => api('/categories').then(setList), []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const id = prompt('Category ID (e.g. drinks)?');
    const name = prompt('Display name?');
    if (!id || !name) return;
    try { await api('/categories', { method: 'POST', body: { id, name, emoji: '🍽️' } }); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
        <h3 style={{margin:0}}>Categories ({list.length})</h3>
        <button onClick={add} style={btnPrimary}>+ Category</button>
      </div>
      <table style={tableStyle}>
        <thead><tr><th>ID</th><th>Nama</th><th>Emoji</th><th>Order</th><th>Status</th></tr></thead>
        <tbody>
          {list.map(c => (
            <tr key={c.id}>
              <td>{c.id}</td><td><b>{c.name}</b></td><td>{c.emoji}</td><td>{c.display_order}</td><td>{c.is_active ? '✓' : '✗'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// EXTRA GROUPS
// ============================================================
function ExtraGroups() {
  const [list, setList] = useState([]);
  useEffect(() => { api('/extra-groups').then(setList); }, []);
  return (
    <div>
      <h3>Extra Groups ({list.length})</h3>
      <table style={tableStyle}>
        <thead><tr><th>ID</th><th>Nama</th><th>Emoji</th><th>Order</th></tr></thead>
        <tbody>
          {list.map(g => (
            <tr key={g.id}><td>{g.id}</td><td><b>{g.name}</b></td><td>{g.emoji}</td><td>{g.display_order}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// UNITS
// ============================================================
function Units() {
  const [list, setList] = useState([]);
  useEffect(() => { api('/units').then(setList); }, []);
  return (
    <div>
      <h3>Units of Measurement</h3>
      <p style={{fontSize:12, color:'#6b7280'}}>Unit conversion otomatis antar yang base_unit-nya sama (gr↔kg, ml↔l, pcs↔btl↔cup).</p>
      <table style={tableStyle}>
        <thead><tr><th>Code</th><th>Name</th><th>Base Unit</th><th>To Base Factor</th></tr></thead>
        <tbody>
          {list.map(u => (
            <tr key={u.code}><td><b>{u.code}</b></td><td>{u.name}</td><td>{u.base_unit}</td><td>×{u.to_base_factor}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// COGS REPORT
// ============================================================
function COGSReport() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/cogs-report').then(setRows); }, []);

  const avgMargin = rows.length ? rows.reduce((s,r)=>s+r.margin_pct, 0) / rows.length : 0;
  const incompleteCount = rows.filter(r => !r.bom_complete).length;

  return (
    <div>
      <h3>COGS Report & Margin Analysis</h3>
      <div style={{display:'flex', gap:12, marginBottom:12, flexWrap:'wrap'}}>
        <div style={statCard}>Avg Margin <b>{fmtPct(avgMargin)}</b></div>
        <div style={statCard}>Total Menus <b>{rows.length}</b></div>
        <div style={{...statCard, background: incompleteCount > 0 ? '#fef3c7' : '#f0fdf4'}}>
          BOM Incomplete <b>{incompleteCount}</b>
        </div>
      </div>
      <table style={tableStyle}>
        <thead><tr><th>Menu</th><th>Price</th><th>COGS</th><th>Margin</th><th>Margin %</th><th>BOM</th></tr></thead>
        <tbody>
          {[...rows].sort((a,b) => a.margin_pct - b.margin_pct).map(r => (
            <tr key={r.id} style={{background: r.margin_pct < 50 ? '#fef3c7' : 'transparent'}}>
              <td><b>{r.name}</b></td>
              <td>{fmtIDR(r.price)}</td>
              <td>{fmtIDR(r.cogs)}</td>
              <td>{fmtIDR(r.margin)}</td>
              <td style={{color: r.margin_pct < 50 ? '#dc2626' : r.margin_pct < 70 ? '#f59e0b' : '#10b981', fontWeight: 600}}>
                {fmtPct(r.margin_pct)}
              </td>
              <td>{r.bom_complete ? '✓' : '⚠️ incomplete'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// SEED / MIGRATION
// ============================================================
function SeedTab() {
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState(null);

  const seedDefault = async () => {
    if (!confirm('Seed with default 21 menu + 17 extras + sample BOM?')) return;
    try {
      const r = await api('/seed', { method: 'POST', body: {} });
      setResult(r);
    } catch (e) { setResult({ error: e.message }); }
  };

  const seedFromLegacy = async () => {
    let menu;
    try { menu = JSON.parse(pasted); }
    catch { return alert('JSON tidak valid'); }
    if (!Array.isArray(menu)) return alert('Harus array');
    if (!confirm(`Seed ${menu.length} items from legacy menu? Existing data dihapus.`)) return;
    try {
      const r = await api('/seed', { method: 'POST', body: { menu, force: true } });
      setResult(r);
    } catch (e) { setResult({ error: e.message }); }
  };

  return (
    <div>
      <h3>Seed / Migrate from Hardcoded Menu</h3>
      <p>Jalankan sekali for populate database. Setelah itu update via UI di atas.</p>
      <div style={{marginBottom:16, padding:12, background:'#eff6ff', borderRadius:8}}>
        <h4 style={{marginTop:0}}>Opsi 1: Seed default (21 items)</h4>
        <button onClick={seedDefault} style={btnPrimary}>Seed Default Menu</button>
      </div>
      <div style={{marginBottom:16, padding:12, background:'#fef3c7', borderRadius:8}}>
        <h4 style={{marginTop:0}}>Opsi 2: Import from legacy <code>let menu = [...]</code></h4>
        <p style={{fontSize:12}}>Paste isi array menu from index.js (shape: <code>{`{id, cat, emoji, name, desc, price, freeToppings, popular, avail}`}</code>):</p>
        <textarea value={pasted} onChange={e=>setPasted(e.target.value)} rows={10} style={{width:'100%', fontFamily:'monospace', fontSize:12}}
          placeholder='[{"id":"froyo-original","cat":"froyo","emoji":"🍦","name":"Original",...},...]' />
        <button onClick={seedFromLegacy} style={btnPrimary}>Import Legacy Menu</button>
        <p style={{fontSize:11, color:'#92400e'}}>⚠️ BOM none di legacy data — harus diisi manual per menu setelah import.</p>
      </div>
      {result && (
        <pre style={{background:'#1f2937', color:'#f9fafb', padding:12, borderRadius:8, fontSize:12, overflow:'auto'}}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const tableStyle = { width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: 13 };
const btnPrimary = { padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 };
const btnSecondary = { padding: '6px 14px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 4, cursor: 'pointer' };
const btnSmall = { padding: '4px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const btnSmallDanger = { padding: '4px 10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const formGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox = { background: '#fff', borderRadius: 8, padding: 20, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', minWidth: 700 };
const statCard = { background: '#fff', padding: 10, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#6b7280', minWidth: 140 };

if (typeof document !== 'undefined' && !document.getElementById('master-item-styles')) {
  const style = document.createElement('style');
  style.id = 'master-item-styles';
  style.textContent = `
    .master-item-tab table th { background: #f3f4f6; padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 11px; text-transform: uppercase; color: #6b7280; }
    .master-item-tab table td { padding: 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .master-item-tab input, .master-item-tab select, .master-item-tab textarea {
      padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; width: 100%; box-sizing: border-box;
    }
    .master-item-tab label { display: block; font-size: 12px; color: #374151; font-weight: 500; margin-bottom: 4px; }
  `;
  document.head.appendChild(style);
}
