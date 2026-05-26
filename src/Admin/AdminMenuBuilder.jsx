// client/src/Admin/AdminMenuBuilder.jsx
// Menu Builder admin — Size Variants + Packages/Bundles.
// Pasangkan ke AdminMasterItem.jsx existing sebagai tab tambahan, atau standalone.
import React, { useState, useEffect, useCallback } from 'react';
import API_HOST from "../apiBase.js";

const API = API_HOST + '/api/master';
const fmtIDR = (n) => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 }).format(Math.round(n||0));

async function api(p, opts={}) {
  const res = await fetch(`${API}${p}`, { headers:{'Content-Type':'application/json'}, ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (!res.ok) { const err = await res.json().catch(()=>({error:res.statusText})); throw new Error(err.error || `HTTP ${res.status}`); }
  return res.json();
}

export default function AdminMenuBuilder() {
  const [tab, setTab] = useState('sizes');
  return (
    <div className="menu-builder" style={{padding:16, color:'#d4d4d8'}}>
      <h2 style={{marginTop:0, color:'#d4d4d8'}}>Menu Builder</h2>
      <div style={{display:'flex', gap:4, borderBottom:'1px solid #e5e7eb', marginBottom:16}}>
        {[{k:'sizes',l:'Size Variants'},{k:'packages',l:'Packages / Bundles'}].map(t => (
          <button key={t.k} onClick={()=>setTab(t.k)} style={tabBtn(tab===t.k)}>{t.l}</button>
        ))}
      </div>
      {tab==='sizes' && <SizesManager />}
      {tab==='packages' && <PackagesManager />}
    </div>
  );
}

// ============================================================
// SIZES — per-menu variant editor
// ============================================================
function SizesManager() {
  const [sizes, setSizes] = useState([]);
  const [menus, setMenus] = useState([]);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [variants, setVariants] = useState([]);

  useEffect(()=>{
    api('/menu-sizes').then(setSizes);
    api('/menus').then(setMenus);
  }, []);

  useEffect(()=>{
    if (selectedMenu) api(`/menus/${selectedMenu}/sizes`).then(setVariants);
    else setVariants([]);
  }, [selectedMenu]);

  const addMasterSize = async () => {
    const id = prompt('Size ID (e.g. xlarge)?');
    const name = prompt('Display name?');
    if (!id || !name) return;
    try { await api('/menu-sizes', {method:'POST', body:{id, name, display_order:10}}); api('/menu-sizes').then(setSizes); }
    catch (e) { alert(e.message); }
  };

  const updateVariant = (idx, k, v) => {
    const next = [...variants]; next[idx] = {...next[idx], [k]:v}; setVariants(next);
  };
  const addVariant = (sizeId) => {
    if (variants.find(v => v.size_id === sizeId)) return;
    setVariants([...variants, {size_id:sizeId, price_adjustment:0, bom_multiplier:1, is_default:0, is_available:1}]);
  };
  const removeVariant = (idx) => setVariants(variants.filter((_, i) => i !== idx));

  const saveVariants = async () => {
    try {
      await api(`/menus/${selectedMenu}/sizes`, {method:'PUT', body:{variants}});
      alert('Saved');
    } catch (e) { alert(e.message); }
  };

  const menuObj = menus.find(m => m.id === selectedMenu);

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
        <h3 style={{margin:0}}>Master Sizes ({sizes.length})</h3>
        <button onClick={addMasterSize} style={btnPrimary}>+ Size</button>
      </div>
      <table style={tableStyle}>
        <thead><tr><th>ID</th><th>Name</th><th>Order</th></tr></thead>
        <tbody>
          {sizes.map(s => <tr key={s.id}><td>{s.id}</td><td><b>{s.name}</b></td><td>{s.display_order}</td></tr>)}
        </tbody>
      </table>

      <h3 style={{marginTop:24}}>Per-Menu Size Variants</h3>
      <div style={{marginBottom:12}}>
        Select menu: <select value={selectedMenu || ''} onChange={e=>setSelectedMenu(e.target.value || null)}>
          <option value="">- pilih menu -</option>
          {menus.map(m => <option key={m.id} value={m.id}>{m.emoji} {m.name} ({fmtIDR(m.price)})</option>)}
        </select>
      </div>

      {selectedMenu && menuObj && (
        <div>
          <div style={{padding:12, background:'#15151e', borderRadius:8, marginBottom:12}}>
            <b>{menuObj.emoji} {menuObj.name}</b> — base price: {fmtIDR(menuObj.price)}
          </div>

          <table style={tableStyle}>
            <thead><tr>
              <th>Size</th><th>Price Adj</th><th>Final Price</th><th>BOM Mult</th><th>Default</th><th>Available</th><th></th>
            </tr></thead>
            <tbody>
              {variants.map((v, i) => {
                const sizeObj = sizes.find(s => s.id === v.size_id);
                const finalPrice = menuObj.price + Number(v.price_adjustment || 0);
                return (
                  <tr key={i}>
                    <td><b>{sizeObj?.name || v.size_id}</b></td>
                    <td><input type="number" value={v.price_adjustment} onChange={e=>updateVariant(i, 'price_adjustment', Number(e.target.value))} style={{width:100}} /></td>
                    <td><b>{fmtIDR(finalPrice)}</b></td>
                    <td><input type="number" step="0.1" value={v.bom_multiplier} onChange={e=>updateVariant(i, 'bom_multiplier', Number(e.target.value))} style={{width:80}} /></td>
                    <td><input type="checkbox" checked={!!v.is_default} onChange={e=>updateVariant(i, 'is_default', e.target.checked ? 1 : 0)} /></td>
                    <td><input type="checkbox" checked={!!v.is_available} onChange={e=>updateVariant(i, 'is_available', e.target.checked ? 1 : 0)} /></td>
                    <td><button onClick={()=>removeVariant(i)} style={btnDanger}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{marginTop:8, display:'flex', gap:4, flexWrap:'wrap'}}>
            {sizes.filter(s => !variants.find(v => v.size_id === s.id)).map(s => (
              <button key={s.id} onClick={()=>addVariant(s.id)} style={btn}>+ {s.name}</button>
            ))}
          </div>

          <button onClick={saveVariants} style={{...btnPrimary, marginTop:12}}>💾 Save Variants</button>

          <div style={{marginTop:16, padding:12, background:'#0a1422', borderRadius:8, fontSize:12, color:'#93c5fd'}}>
            <b>Cara kerja:</b> Pas customer pilih size <code>large</code>, harga = base + price_adjustment. BOM consumption = qty × bom_multiplier (mis. large = 1.4× artinya pakai 40% lebih banyak bahan). Set <code>is_default</code> di salah satu size supaya jadi default pilihan UI.
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PACKAGES — bundle CRUD with item editor
// ============================================================
function PackagesManager() {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(()=>api('/packages').then(setList), []);
  useEffect(()=>{ load(); }, [load]);

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', marginBottom:12}}>
        <h3 style={{margin:0}}>Packages / Bundles ({list.length})</h3>
        <button onClick={()=>{setEditing({isNew:true}); setShowForm(true);}} style={btnPrimary}>+ Package</button>
      </div>

      {showForm && <PackageForm initial={editing} onClose={()=>{setShowForm(false); setEditing(null); load();}} />}

      <table style={tableStyle}>
        <thead><tr><th>ID</th><th>Nama</th><th>Items</th><th>Price</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {list.map(p => (
            <tr key={p.id}>
              <td style={{fontSize:11, color:'#8b8b95'}}>{p.id}</td>
              <td><b>{p.emoji} {p.name}</b><br/><span style={{fontSize:11, color:'#8b8b95'}}>{p.description}</span></td>
              <td>{p.item_count}</td>
              <td>{fmtIDR(p.package_price)}</td>
              <td>{p.is_active ? '✓' : '✗'}</td>
              <td><button onClick={()=>{setEditing(p); setShowForm(true);}} style={btnSmall}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PackageForm({initial, onClose}) {
  const isNew = initial?.isNew;
  const [f, setF] = useState({
    id:'', name:'', emoji:'', description:'', package_price:0, is_active:true,
    items: [],
    ...initial
  });
  const [menus, setMenus] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [detail, setDetail] = useState(null);

  useEffect(()=>{
    api('/menus').then(setMenus);
    api('/menu-sizes').then(setSizes);
    if (!isNew && initial?.id) {
      api(`/packages/${initial.id}`).then(d => {
        setDetail(d);
        setF(prev => ({...prev, ...d, is_active: d.is_active===1, items: d.items || []}));
      });
    }
  }, []);

  const update = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF({...f, [k]:v});
  };

  const updateItem = (idx, k, v) => {
    const items = [...f.items]; items[idx] = {...items[idx], [k]:v}; setF({...f, items});
  };
  const addItem = () => setF({...f, items:[...f.items, {menu_id:'', size_id:'', qty:1, is_swappable:0}]});
  const removeItem = (idx) => setF({...f, items: f.items.filter((_, i) => i !== idx)});

  const individualTotal = f.items.reduce((s, it) => {
    const m = menus.find(mm => mm.id === it.menu_id);
    return s + (m?.price || 0) * (it.qty || 1);
  }, 0);
  const savings = individualTotal - Number(f.package_price || 0);
  const savingsPct = individualTotal > 0 ? (savings / individualTotal * 100) : 0;

  const submit = async () => {
    try {
      const body = {...f, package_price: Number(f.package_price), is_active: f.is_active ? 1 : 0};
      if (isNew) await api('/packages', {method:'POST', body});
      else await api(`/packages/${f.id}`, {method:'PUT', body});
      onClose();
    } catch (e) { alert(e.message); }
  };

  const remove = async () => {
    if (!confirm(`Hapus package ${f.name}?`)) return;
    await api(`/packages/${f.id}`, {method:'DELETE'});
    onClose();
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={e=>e.stopPropagation()}>
        <h3>{isNew ? 'Tambah Package' : `Edit ${f.name}`}</h3>

        <div style={formGrid}>
          <label>ID* <input value={f.id} onChange={update('id')} disabled={!isNew} placeholder="e.g. combo-couple" /></label>
          <label>Emoji <input value={f.emoji} onChange={update('emoji')} style={{width:60}} /></label>
          <label>Nama* <input value={f.name} onChange={update('name')} /></label>
          <label>Package Price* <input type="number" value={f.package_price} onChange={update('package_price')} /></label>
          <label style={{gridColumn:'1/-1'}}>Description <textarea value={f.description} onChange={update('description')} rows={2} /></label>
          <label style={{display:'flex', alignItems:'center', gap:6}}>
            <input type="checkbox" checked={f.is_active} onChange={update('is_active')} /> Active
          </label>
        </div>

        <h4 style={{marginTop:16, marginBottom:8}}>Items dalam Package</h4>
        <table style={tableStyle}>
          <thead><tr><th>Menu</th><th>Size</th><th>Qty</th><th>Swappable</th><th>Subtotal</th><th></th></tr></thead>
          <tbody>
            {f.items.map((it, idx) => {
              const m = menus.find(mm => mm.id === it.menu_id);
              const subtotal = (m?.price || 0) * (it.qty || 1);
              return (
                <tr key={idx}>
                  <td>
                    <select value={it.menu_id} onChange={e=>updateItem(idx, 'menu_id', e.target.value)} style={{width:200}}>
                      <option value="">- pilih menu -</option>
                      {menus.map(m => <option key={m.id} value={m.id}>{m.emoji} {m.name} ({fmtIDR(m.price)})</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={it.size_id || ''} onChange={e=>updateItem(idx, 'size_id', e.target.value || null)} style={{width:100}}>
                      <option value="">- (default) -</option>
                      {sizes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td><input type="number" value={it.qty} onChange={e=>updateItem(idx, 'qty', Number(e.target.value))} style={{width:60}} /></td>
                  <td><input type="checkbox" checked={!!it.is_swappable} onChange={e=>updateItem(idx, 'is_swappable', e.target.checked ? 1 : 0)} /></td>
                  <td>{fmtIDR(subtotal)}</td>
                  <td><button onClick={()=>removeItem(idx)} style={btnDanger}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button onClick={addItem} style={btn}>+ Item</button>

        <div style={{marginTop:12, padding:12, background: savings > 0 ? '#0f1f17' : '#2a1214', borderRadius:8, border:`1px solid ${savings > 0 ? '#14532d' : '#7f1d1d'}`}}>
          <b>Pricing Analysis:</b><br/>
          Individual total: {fmtIDR(individualTotal)} → Package price: {fmtIDR(f.package_price)} →{' '}
          <b style={{color: savings > 0 ? '#34d399' : '#f87171'}}>
            Savings {fmtIDR(savings)} ({savingsPct.toFixed(1)}%)
          </b>
          {savings < 0 && <div style={{color:'#f87171', fontSize:12, marginTop:4}}>⚠️ Package price LEBIH MAHAL from individual!</div>}
        </div>

        <div style={{marginTop:16}}>
          <button onClick={submit} style={btnPrimary}>Save</button>{' '}
          <button onClick={onClose} style={btn}>Cancel</button>
          {!isNew && <button onClick={remove} style={{...btnDanger, float:'right'}}>Delete</button>}
        </div>

        <div style={{marginTop:16, padding:12, background:'#0a1422', borderRadius:8, fontSize:12, color:'#93c5fd'}}>
          <b>Cara kerja:</b> Pas package terjual, sistem auto-expand → consume BOM from setiap menu items × qty. Stock di warehouse otomatis berkurang sesuai recipe gabungan. <code>is_swappable</code> reserved untuk fitur masa depan (customer ganti item dengan kategori sama).
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLES — dark theme (selaras Command Center)
// ============================================================
const tabBtn = (active) => ({padding:'8px 14px', border:'none', background:'transparent',
  borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
  color: active ? '#60a5fa' : '#8b8b95', fontWeight: active ? 600 : 400, cursor:'pointer'});
const tableStyle = {width:'100%', borderCollapse:'collapse', background:'#0e0e13', fontSize:13};
const btn = {padding:'6px 14px', background:'#1c1c25', color:'#d4d4d8', border:'1px solid #1c1c25', borderRadius:4, cursor:'pointer', fontSize:13};
const btnPrimary = {padding:'6px 14px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontWeight:600};
const btnDanger = {padding:'4px 10px', background:'#2a1214', color:'#f87171', border:'1px solid #7f1d1d', borderRadius:4, cursor:'pointer', fontSize:12};
const btnSmall = {padding:'4px 10px', background:'#1c1c25', color:'#d4d4d8', border:'1px solid #1c1c25', borderRadius:4, cursor:'pointer', fontSize:12};
const formGrid = {display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12};
const modalOverlay = {position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000};
const modalBox = {background:'#0e0e13', color:'#d4d4d8', border:'1px solid #1c1c25', borderRadius:8, padding:20, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto', minWidth:700};

if (typeof document !== 'undefined' && !document.getElementById('menu-builder-styles')) {
  const s = document.createElement('style');
  s.id = 'menu-builder-styles';
  s.textContent = `
    .menu-builder table th { background:#15151e; padding:8px; text-align:left; border-bottom:1px solid #1c1c25; font-size:11px; text-transform:uppercase; color:#8b8b95; }
    .menu-builder table td { padding:8px; border-bottom:1px solid #15151e; vertical-align:top; }
    .menu-builder input, .menu-builder select, .menu-builder textarea { padding:6px 8px; background:#08080b; color:#d4d4d8; border:1px solid #1c1c25; border-radius:4px; font-size:13px; box-sizing:border-box; }
    .menu-builder label { display:block; font-size:12px; color:#9ca3af; font-weight:500; margin-bottom:4px; }
    .menu-builder label input, .menu-builder label select, .menu-builder label textarea { width:100%; margin-top:4px; }
  `;
  document.head.appendChild(s);
}
