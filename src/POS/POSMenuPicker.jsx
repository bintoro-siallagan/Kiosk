// client/src/POS/POSMenuPicker.jsx
// Customer-facing menu browser. Handles:
//   - Category navigation
//   - Menu cards (with default size if variants exist)
//   - Size selector modal (with price preview)
//   - Extras/toppings (with allowed_extras restriction)
//   - Package items (auto-expand display)
//   - Cart (local state + checkout handoff)
//
// Props:
//   onCheckout({ items, subtotal })  — items shape: [{menu_id, qty, size_id?, extras:[{extra_id, qty}], display_name, display_price, line_total}]
//   apiBase (default '/api/master')
import React, { useState, useEffect, useMemo, useCallback } from 'react';

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));
const API_HOST = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function POSMenuPicker({ onCheckout, apiBase = '/api/master' }) {
  const [data, setData] = useState({ menus: [], packages: [] });
  const [categories, setCategories] = useState([]);
  const [extras, setExtras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState('all');
  const [picking, setPicking] = useState(null); // { menu, isPackage }
  const [cart, setCart] = useState([]); // [{ uid, menu_id, qty, size_id, size_name, extras:[{extra_id, name, qty, extra_price}], display_name, display_price, line_total, is_package }]
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`${apiBase}/menu-full`).then(r=>r.json()),
      fetch(`${apiBase}/categories`).then(r=>r.json()),
      fetch(`${apiBase}/extras`).then(r=>r.json()),
    ]).then(([menuFull, cats, exs]) => {
      setData(menuFull); setCategories(cats); setExtras(exs); setLoading(false);
    }).catch(e => { console.error(e); setLoading(false); });
  }, [apiBase]);

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.line_total, 0), [cart]);

  const addToCart = useCallback((item) => {
    setCart(prev => [...prev, { ...item, uid: Math.random().toString(36).slice(2, 9) }]);
    setPicking(null);
  }, []);

  const updateQty = (uid, delta) => {
    setCart(prev => prev.map(c => {
      if (c.uid !== uid) return c;
      const nextQty = c.qty + delta;
      if (nextQty <= 0) return null;
      const newLine = (c.display_price + (c.extras?.reduce((s, e) => s + e.extra_price * e.qty, 0) || 0)) * nextQty;
      return { ...c, qty: nextQty, line_total: newLine };
    }).filter(Boolean));
  };

  const removeFromCart = (uid) => setCart(prev => prev.filter(c => c.uid !== uid));

  const checkout = () => {
    if (cart.length === 0) return;
    const items = cart.map(c => ({
      menu_id: c.menu_id, qty: c.qty,
      size_id: c.size_id || null,
      extras: c.extras?.filter(e => e.qty > 0).map(e => ({ extra_id: e.extra_id, qty: e.qty })) || [],
      display_name: c.display_name, display_price: c.display_price, line_total: c.line_total,
      is_package: c.is_package
    }));
    onCheckout?.({ items, subtotal });
  };

  // Filter
  const visibleMenus = useMemo(() => {
    let m = data.menus || [];
    if (activeCat !== 'all') m = m.filter(x => x.category_id === activeCat);
    if (search) m = m.filter(x => x.name.toLowerCase().includes(search.toLowerCase()));
    return m;
  }, [data.menus, activeCat, search]);

  const visiblePackages = useMemo(() => {
    if (activeCat !== 'all' && activeCat !== 'package') return [];
    let p = data.packages || [];
    if (search) p = p.filter(x => x.name.toLowerCase().includes(search.toLowerCase()));
    return p;
  }, [data.packages, activeCat, search]);

  if (loading) return <div style={{padding:40, textAlign:'center'}}>Loading menu...</div>;

  return (
    <div style={styles.root}>
      {/* LEFT — menu */}
      <div style={styles.left}>
        <div style={styles.searchBar}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari menu..." style={styles.search} />
        </div>

        <div style={styles.cats}>
          <button onClick={()=>setActiveCat('all')} style={catBtn(activeCat==='all')}>🍽️ Semua</button>
          {categories.map(c => (
            <button key={c.id} onClick={()=>setActiveCat(c.id)} style={catBtn(activeCat===c.id)}>
              {c.emoji} {c.name}
            </button>
          ))}
          {visiblePackages.length > 0 && (
            <button onClick={()=>setActiveCat('package')} style={catBtn(activeCat==='package')}>🎁 Package</button>
          )}
        </div>

        <div style={styles.grid}>
          {visiblePackages.map(p => (
            <PackageCard key={p.id} pkg={p} onClick={()=>setPicking({pkg:p, isPackage:true})} />
          ))}
          {visibleMenus.map(m => (
            <MenuCard key={m.id} menu={m} onClick={()=>setPicking({menu:m})} />
          ))}
        </div>

        {visibleMenus.length === 0 && visiblePackages.length === 0 && (
          <div style={{padding:40, textAlign:'center', color:'#9ca3af'}}>Tidak ada menu</div>
        )}
      </div>

      {/* RIGHT — cart */}
      <div style={styles.right}>
        <h3 style={{marginTop:0}}>🛒 Pesanan ({cart.length})</h3>
        <div style={styles.cartList}>
          {cart.length === 0 && <div style={styles.empty}>Keranjang kosong<br/><span style={{fontSize:12}}>Klik menu untuk menambahkan</span></div>}
          {cart.map(c => (
            <div key={c.uid} style={styles.cartItem}>
              <div style={{flex:1}}>
                <div style={{fontWeight:600}}>{c.display_name}</div>
                {c.size_name && <div style={{fontSize:11, color:'#6b7280'}}>Size: {c.size_name}</div>}
                {c.extras?.filter(e=>e.qty>0).map(e => (
                  <div key={e.extra_id} style={{fontSize:11, color:'#6b7280'}}>+ {e.name} {e.qty>1 ? `×${e.qty}` : ''}</div>
                ))}
                <div style={{fontSize:13, color:'#1f2937', marginTop:4, fontWeight:600}}>{fmtIDR(c.line_total)}</div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:4}}>
                <button onClick={()=>updateQty(c.uid, -1)} style={styles.qtyBtn}>−</button>
                <div style={{minWidth:30, textAlign:'center', fontWeight:600}}>{c.qty}</div>
                <button onClick={()=>updateQty(c.uid, 1)} style={styles.qtyBtn}>+</button>
                <button onClick={()=>removeFromCart(c.uid)} style={styles.removeBtn}>×</button>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.cartFooter}>
          <div style={{display:'flex', justifyContent:'space-between', fontSize:18, marginBottom:12}}>
            <b>Subtotal</b>
            <b>{fmtIDR(subtotal)}</b>
          </div>
          <button onClick={checkout} disabled={cart.length===0} style={cart.length===0 ? styles.checkoutDisabled : styles.checkout}>
            Lanjut ke Pembayaran →
          </button>
        </div>
      </div>

      {picking?.menu && (
        <MenuPickerModal menu={picking.menu} extras={extras} onAdd={addToCart} onClose={()=>setPicking(null)} />
      )}
      {picking?.isPackage && (
        <PackagePickerModal pkg={picking.pkg} onAdd={addToCart} onClose={()=>setPicking(null)} />
      )}
    </div>
  );
}

// ============================================================
// MENU CARD
// ============================================================
function MenuCard({ menu, onClick }) {
  const hasSizes = menu.size_variants?.length > 0;
  const defaultSize = menu.size_variants?.find(v => v.is_default) || menu.size_variants?.[0];
  const basePrice = menu.price + (defaultSize?.price_adjustment || 0);
  const minPrice = hasSizes ? Math.min(...menu.size_variants.map(v => menu.price + v.price_adjustment)) : menu.price;
  const isRange = hasSizes && new Set(menu.size_variants.map(v => menu.price + v.price_adjustment)).size > 1;

  return (
    <button onClick={onClick} style={styles.card}>
      <div style={{fontSize:32}}>{menu.emoji || '🍴'}</div>
      <div style={styles.cardTitle}>{menu.name}</div>
      {menu.is_popular ? <div style={styles.popularBadge}>⭐ Popular</div> : null}
      <div style={styles.cardDesc}>{menu.description || ''}</div>
      <div style={styles.cardPrice}>
        {isRange ? `mulai ${fmtIDR(minPrice)}` : fmtIDR(basePrice)}
      </div>
      {hasSizes && <div style={styles.cardBadge}>{menu.size_variants.length} ukuran</div>}
    </button>
  );
}

function PackageCard({ pkg, onClick }) {
  return (
    <button onClick={onClick} style={{...styles.card, borderColor:'#a78bfa', background:'linear-gradient(135deg, #f5f3ff 0%, #fff 100%)'}}>
      <div style={{fontSize:32}}>{pkg.emoji || '🎁'}</div>
      <div style={styles.cardTitle}>{pkg.name}</div>
      <div style={{...styles.popularBadge, background:'#a78bfa'}}>Package</div>
      <div style={styles.cardDesc}>{pkg.description || ''}</div>
      <div style={styles.cardPrice}>{fmtIDR(pkg.package_price)}</div>
    </button>
  );
}

// ============================================================
// MENU PICKER MODAL (size + extras)
// ============================================================
function MenuPickerModal({ menu, extras, onAdd, onClose }) {
  const hasSizes = menu.size_variants?.length > 0;
  const defaultSizeId = (menu.size_variants?.find(v => v.is_default) || menu.size_variants?.[0])?.size_id || null;
  const [sizeId, setSizeId] = useState(defaultSizeId);

  // Filter extras by allowed_extras (if defined) — fetch menu detail
  const [allowedExtras, setAllowedExtras] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/master/menus/${menu.id}`).then(r => r.json()).then(d => {
      if (d.allowed_extras?.length > 0) setAllowedExtras(new Set(d.allowed_extras));
      else setAllowedExtras(null); // null = all allowed
    }).catch(() => setAllowedExtras(null));
  }, [menu.id]);

  const [extraQtys, setExtraQtys] = useState({});

  const availableExtras = useMemo(() => {
    if (allowedExtras === null) return extras;
    return extras.filter(e => allowedExtras.has(e.id));
  }, [extras, allowedExtras]);

  const currentVariant = menu.size_variants?.find(v => v.size_id === sizeId);
  const displayPrice = menu.price + (currentVariant?.price_adjustment || 0);
  const sizeName = currentVariant?.size_name;
  const extrasTotal = Object.entries(extraQtys).reduce((s, [eid, qty]) => {
    const e = extras.find(x => x.id === eid);
    return s + (e?.extra_price || 0) * qty;
  }, 0);
  const freeExtras = menu.free_extras || 0;
  const totalExtraQty = Object.values(extraQtys).reduce((s, q) => s + q, 0);
  const chargedExtras = Math.max(0, extrasTotal - (freeExtras * (extras[0]?.extra_price || 0)));
  // Note: simplified free calc — assumes all extras same price. For real discount calc, more nuanced.

  const lineTotal = displayPrice + extrasTotal;

  const updateExtra = (id, delta) => {
    setExtraQtys(prev => {
      const next = { ...prev };
      const newQty = (next[id] || 0) + delta;
      if (newQty <= 0) delete next[id]; else next[id] = newQty;
      return next;
    });
  };

  const submit = () => {
    onAdd({
      menu_id: menu.id, qty: 1,
      size_id: sizeId,
      size_name: sizeName,
      extras: Object.entries(extraQtys).map(([eid, qty]) => {
        const e = extras.find(x => x.id === eid);
        return { extra_id: eid, name: e?.name, qty, extra_price: e?.extra_price || 0 };
      }),
      display_name: menu.name,
      display_price: displayPrice,
      line_total: lineTotal,
      is_package: false
    });
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <h2 style={{margin:0}}>{menu.emoji} {menu.name}</h2>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>
        {menu.description && <p style={{color:'#6b7280', marginTop:8}}>{menu.description}</p>}

        {hasSizes && (
          <div style={{marginTop:16}}>
            <h4 style={{marginBottom:8}}>Pilih Ukuran</h4>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              {menu.size_variants.map(v => {
                const p = menu.price + (v.price_adjustment || 0);
                const active = sizeId === v.size_id;
                return (
                  <button key={v.size_id} onClick={()=>setSizeId(v.size_id)} style={{
                    ...styles.sizeBtn,
                    background: active ? '#3b82f6' : '#fff',
                    color: active ? '#fff' : '#1f2937',
                    borderColor: active ? '#3b82f6' : '#e5e7eb'
                  }}>
                    <div style={{fontWeight:600}}>{v.size_name}</div>
                    <div style={{fontSize:12, marginTop:4}}>{fmtIDR(p)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {availableExtras.length > 0 && (
          <div style={{marginTop:16}}>
            <h4 style={{marginBottom:8}}>
              Extras {freeExtras > 0 && <span style={{fontSize:12, color:'#10b981', fontWeight:400}}>({freeExtras} gratis)</span>}
            </h4>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:6, maxHeight:200, overflow:'auto'}}>
              {availableExtras.map(e => {
                const qty = extraQtys[e.id] || 0;
                return (
                  <div key={e.id} style={styles.extraRow}>
                    <div style={{flex:1, fontSize:13}}>
                      {e.emoji} {e.name}<br/>
                      <span style={{fontSize:11, color:'#6b7280'}}>{fmtIDR(e.extra_price)}</span>
                    </div>
                    <button onClick={()=>updateExtra(e.id, -1)} disabled={qty===0} style={{...styles.qtyBtn, opacity: qty===0 ? 0.4 : 1}}>−</button>
                    <div style={{minWidth:20, textAlign:'center', fontWeight:600}}>{qty}</div>
                    <button onClick={()=>updateExtra(e.id, 1)} style={styles.qtyBtn}>+</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={styles.modalFooter}>
          <div style={{flex:1}}>
            <div style={{fontSize:12, color:'#6b7280'}}>Total</div>
            <div style={{fontSize:22, fontWeight:700}}>{fmtIDR(lineTotal)}</div>
          </div>
          <button onClick={submit} style={styles.addBtn}>+ Tambah ke Pesanan</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PACKAGE PICKER MODAL
// ============================================================
function PackagePickerModal({ pkg, onAdd, onClose }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/master/packages/${pkg.id}`).then(r => r.json()).then(setDetail);
  }, [pkg.id]);

  if (!detail) return <div style={styles.modalOverlay}><div style={styles.modalBox}>Loading...</div></div>;

  const submit = () => {
    onAdd({
      menu_id: pkg.id, qty: 1,
      display_name: pkg.name,
      display_price: pkg.package_price,
      line_total: pkg.package_price,
      is_package: true
    });
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <h2 style={{margin:0}}>{pkg.emoji} {pkg.name}</h2>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>
        {pkg.description && <p style={{color:'#6b7280', marginTop:8}}>{pkg.description}</p>}

        <h4 style={{marginTop:16, marginBottom:8}}>Isi Package</h4>
        <div style={{background:'#f9fafb', borderRadius:8, padding:12}}>
          {detail.items?.map((it, i) => (
            <div key={i} style={{padding:'6px 0', display:'flex', justifyContent:'space-between'}}>
              <div>
                <b>{it.menu_emoji} {it.menu_name}</b>
                {it.size_name && <span style={{color:'#6b7280', marginLeft:8}}>({it.size_name})</span>}
              </div>
              <div>× {it.qty}</div>
            </div>
          ))}
        </div>

        {detail.savings > 0 && (
          <div style={{marginTop:12, padding:10, background:'#f0fdf4', borderRadius:6, color:'#065f46', fontSize:13}}>
            🎉 Hemat <b>{fmtIDR(detail.savings)}</b> ({detail.savings_pct?.toFixed(0)}%) dibanding beli individual!
          </div>
        )}

        <div style={styles.modalFooter}>
          <div style={{flex:1}}>
            <div style={{fontSize:12, color:'#6b7280', textDecoration: detail.savings > 0 ? 'line-through' : 'none'}}>
              {detail.savings > 0 && fmtIDR(detail.individual_total)}
            </div>
            <div style={{fontSize:22, fontWeight:700}}>{fmtIDR(pkg.package_price)}</div>
          </div>
          <button onClick={submit} style={styles.addBtn}>+ Tambah ke Pesanan</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = {
  root: { display:'flex', gap:16, padding:16, height:'100vh', boxSizing:'border-box', background:'#f3f4f6', fontFamily:'system-ui,-apple-system,sans-serif' },
  left: { flex:1.5, background:'#fff', borderRadius:12, padding:16, display:'flex', flexDirection:'column', overflow:'hidden' },
  right: { flex:1, minWidth:340, maxWidth:420, background:'#fff', borderRadius:12, padding:16, display:'flex', flexDirection:'column' },
  searchBar: { marginBottom:12 },
  search: { width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid #d1d5db', fontSize:14, boxSizing:'border-box' },
  cats: { display:'flex', gap:6, marginBottom:16, overflowX:'auto', paddingBottom:4 },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(170px, 1fr))', gap:12, overflow:'auto', flex:1 },
  card: { background:'#fff', border:'2px solid #e5e7eb', borderRadius:10, padding:12, textAlign:'left', cursor:'pointer', transition:'all 0.15s', position:'relative', display:'flex', flexDirection:'column', gap:4 },
  cardTitle: { fontSize:14, fontWeight:600, marginTop:4 },
  cardDesc: { fontSize:11, color:'#6b7280', minHeight:30 },
  cardPrice: { fontSize:15, fontWeight:700, color:'#1f2937', marginTop:'auto' },
  cardBadge: { position:'absolute', top:6, right:6, fontSize:9, fontWeight:600, background:'#dbeafe', color:'#1e40af', padding:'2px 6px', borderRadius:4 },
  popularBadge: { position:'absolute', top:6, left:6, fontSize:9, fontWeight:700, background:'#fbbf24', color:'#78350f', padding:'2px 6px', borderRadius:4, textTransform:'uppercase' },
  cartList: { flex:1, overflow:'auto', marginBottom:12 },
  empty: { padding:40, textAlign:'center', color:'#9ca3af' },
  cartItem: { display:'flex', padding:10, background:'#f9fafb', borderRadius:8, marginBottom:8, alignItems:'center', gap:6 },
  qtyBtn: { width:30, height:30, borderRadius:4, background:'#fff', border:'1px solid #d1d5db', cursor:'pointer', fontSize:16, fontWeight:600 },
  removeBtn: { width:30, height:30, borderRadius:4, background:'#fee2e2', color:'#dc2626', border:'none', cursor:'pointer', fontSize:18, marginLeft:4 },
  cartFooter: { borderTop:'1px solid #e5e7eb', paddingTop:12 },
  checkout: { width:'100%', padding:'14px 20px', background:'#10b981', color:'#fff', border:'none', borderRadius:10, fontSize:16, fontWeight:700, cursor:'pointer' },
  checkoutDisabled: { width:'100%', padding:'14px 20px', background:'#d1d5db', color:'#9ca3af', border:'none', borderRadius:10, fontSize:16, fontWeight:700, cursor:'not-allowed' },
  modalOverlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  modalBox: { background:'#fff', borderRadius:12, padding:24, maxWidth:600, width:'95vw', maxHeight:'90vh', overflow:'auto' },
  closeBtn: { width:36, height:36, borderRadius:8, background:'#f3f4f6', border:'none', fontSize:22, cursor:'pointer' },
  sizeBtn: { padding:'12px 20px', border:'2px solid #e5e7eb', borderRadius:8, cursor:'pointer', textAlign:'center', minWidth:90 },
  extraRow: { display:'flex', alignItems:'center', gap:4, padding:6, background:'#f9fafb', borderRadius:6 },
  modalFooter: { display:'flex', alignItems:'center', gap:12, marginTop:20, paddingTop:16, borderTop:'1px solid #e5e7eb' },
  addBtn: { padding:'12px 24px', background:'#10b981', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer' }
};
const catBtn = (active) => ({
  padding:'8px 16px', borderRadius:20, border: active ? '2px solid #3b82f6' : '2px solid #e5e7eb',
  background: active ? '#3b82f6' : '#fff', color: active ? '#fff' : '#1f2937',
  fontWeight: active ? 600 : 400, cursor:'pointer', whiteSpace:'nowrap', fontSize:13
});
