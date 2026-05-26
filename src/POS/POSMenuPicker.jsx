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

export default function POSMenuPicker({ onCheckout, onExit, apiBase = '/api/master', cashier, behaviorBase = '' }) {
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

  // Log perilaku kasir — item dihapus sebelum bayar (deteksi "main-main tombol")
  const logBehavior = (action, detail) => {
    if (!behaviorBase) return;
    fetch(`${behaviorBase}/api/pos-behavior`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cashier: cashier?.name, action, detail }),
    }).catch(() => {});
  };

  const removeFromCart = (uid) => {
    const it = cart.find(c => c.uid === uid);
    setCart(prev => prev.filter(c => c.uid !== uid));
    if (it) logBehavior('remove_item', it.display_name);
  };

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
    <div style={styles.shell}>
      <style>{`
        .qs-card { box-shadow: 0 1px 2px rgba(0,0,0,0.3),0 4px 16px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.04); }
        .qs-card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.16) !important; box-shadow: 0 1px 2px rgba(0,0,0,0.3),0 12px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.08) !important; }
        .qs-card:active { transform: translateY(0) scale(0.985); }
        .qs-search:focus { border-color: rgba(245,158,11,0.4) !important; box-shadow: 0 0 0 3px rgba(245,158,11,0.12) !important; }
      `}</style>
      {/* Top header bar — match POSMenu Order Baru */}
      <header style={styles.header}>
        {onExit && (
          <button onClick={onExit} style={styles.iconBtn}>← Back</button>
        )}
        <div style={styles.summary}>
          <span style={styles.modeChip}>⚡ Quick Service</span>
          <span style={styles.dot}>·</span>
          <span style={styles.muted}>Order cepat tanpa pilih meja</span>
        </div>
        <div style={styles.kasir}>👤 {cashier?.name || "Kasir"}</div>
      </header>

      <div style={styles.root}>
      {/* LEFT — menu */}
      <div style={styles.left}>
        <div style={styles.searchBar}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Cari menu..." className="qs-search" style={styles.search} />
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
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:14 }}>
          <h3 style={{margin:0, color:'#fff', fontWeight:800, fontSize:18, letterSpacing:'-0.3px'}}>🛒 Pesanan</h3>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)', fontFamily:"'Geist Mono',monospace", letterSpacing:1 }}>{cart.length} ITEM</span>
        </div>
        <div style={styles.cartList}>
          {cart.length === 0 && <div style={styles.empty}>Keranjang kosong<br/><span style={{fontSize:12}}>Klik menu untuk menambahkan</span></div>}
          {cart.map(c => (
            <div key={c.uid} style={styles.cartItem}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700, color:'#fff', fontSize:13.5}}>{c.display_name}</div>
                {c.size_name && <div style={{fontSize:11, color:'rgba(255,255,255,0.45)'}}>Size: {c.size_name}</div>}
                {c.extras?.filter(e=>e.qty>0).map(e => (
                  <div key={e.extra_id} style={{fontSize:11, color:'rgba(255,255,255,0.45)'}}>+ {e.name} {e.qty>1 ? `×${e.qty}` : ''}</div>
                ))}
                <div style={{fontSize:13, color:'#F59E0B', marginTop:4, fontWeight:700, fontFamily:"'Geist Mono',monospace"}}>{fmtIDR(c.line_total)}</div>
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
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12}}>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)', letterSpacing:1.2, fontFamily:"'Geist Mono',monospace", fontWeight:700, textTransform:'uppercase' }}>Subtotal</span>
            <span style={{ fontSize:22, color:'#fff', fontWeight:800, fontFamily:"'Geist Mono',monospace", letterSpacing:'-0.4px' }}>{fmtIDR(subtotal)}</span>
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
    <button onClick={onClick} style={styles.card} className="qs-card">
      {/* Visual image-placeholder area — emoji big, like POSMenu Order Baru */}
      <div style={styles.cardImg}>
        <span style={{ fontSize: 44, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))" }}>{menu.emoji || '🍴'}</span>
        {menu.is_popular && <div style={styles.popularBadge}>⭐ Popular</div>}
        {hasSizes && <div style={styles.cardBadge}>{menu.size_variants.length} ukuran</div>}
      </div>
      <div style={styles.cardTitle}>{menu.name}</div>
      <div style={styles.cardPrice}>
        {isRange ? `mulai ${fmtIDR(minPrice)}` : fmtIDR(basePrice)}
      </div>
    </button>
  );
}

function PackageCard({ pkg, onClick }) {
  return (
    <button onClick={onClick} className="qs-card" style={{
      ...styles.card,
      borderColor:'rgba(168,85,247,0.35)',
      background:'linear-gradient(180deg, rgba(168,85,247,0.08) 0%, #15171c 60%, #0d0f14 100%)',
    }}>
      <div style={{ ...styles.cardImg, background:'linear-gradient(180deg, rgba(168,85,247,0.15), rgba(168,85,247,0.04))' }}>
        <span style={{ fontSize: 44, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))" }}>{pkg.emoji || '🎁'}</span>
        <div style={{...styles.popularBadge, background:'linear-gradient(135deg,#a855f7,#c084fc)', color:'#fff'}}>Package</div>
      </div>
      <div style={styles.cardTitle}>{pkg.name}</div>
      <div style={styles.cardPrice}>{fmtIDR(pkg.package_price)}</div>
    </button>
  );
}

// ============================================================
// MENU PICKER MODAL — ToppingPicker template (panel + tabs + grid +
// chips + 3-part footer). Match POSMenu Order Baru visually.
// ============================================================
function MenuPickerModal({ menu, extras, onAdd, onClose }) {
  const hasSizes = menu.size_variants?.length > 0;
  const defaultSizeId = (menu.size_variants?.find(v => v.is_default) || menu.size_variants?.[0])?.size_id || null;
  const [sizeId, setSizeId] = useState(defaultSizeId);
  const [activeGroup, setActiveGroup] = useState('all');

  const [allowedExtras, setAllowedExtras] = useState(null);
  useEffect(() => {
    fetch(`${API_HOST}/api/master/menus/${menu.id}`).then(r => r.json()).then(d => {
      if (d.allowed_extras?.length > 0) setAllowedExtras(new Set(d.allowed_extras));
      else setAllowedExtras(null);
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
      size_id: sizeId, size_name: sizeName,
      extras: Object.entries(extraQtys).map(([eid, qty]) => {
        const e = extras.find(x => x.id === eid);
        return { extra_id: eid, name: e?.name, qty, extra_price: e?.extra_price || 0 };
      }),
      display_name: menu.name, display_price: displayPrice,
      line_total: lineTotal, is_package: false,
    });
  };

  const tabs = [{ key: 'all', label: 'Semua' }];
  if (hasSizes) tabs.push({ key: 'size', label: 'Ukuran' });
  if (availableExtras.length > 0) tabs.push({ key: 'extras', label: 'Extras' });
  const showSize = (activeGroup === 'all' || activeGroup === 'size') && hasSizes;
  const showExtras = (activeGroup === 'all' || activeGroup === 'extras') && availableExtras.length > 0;

  return (
    <div style={MP.overlay} onClick={onClose}>
      <div style={MP.panel} onClick={e=>e.stopPropagation()}>
        {/* HEADER */}
        <div style={MP.header}>
          <div style={MP.headerLeft}>
            <span style={MP.itemEmoji}>{menu.emoji || '🍴'}</span>
            <div>
              <div style={MP.itemName}>{menu.name}</div>
              {menu.description && <div style={MP.itemDesc}>{menu.description}</div>}
            </div>
          </div>
          <div style={MP.basePrice}>{fmtIDR(menu.price)}</div>
        </div>

        {/* PROGRESS — show kalau ada free_extras */}
        {freeExtras > 0 && (
          <div style={MP.progressSection}>
            <div style={MP.progressLabel}>
              <span>{Math.min(totalExtraQty, freeExtras)}/{freeExtras} extras gratis dipilih</span>
              {totalExtraQty > freeExtras && (
                <span style={MP.extraBadge}>+{totalExtraQty - freeExtras} berbayar</span>
              )}
            </div>
            <div style={MP.progressTrack}>
              <div style={{ ...MP.progressFill,
                width: `${Math.min(100, (totalExtraQty / Math.max(freeExtras,1)) * 100)}%`,
                background: totalExtraQty > freeExtras ? '#F59E0B' : '#FF6B35' }} />
            </div>
          </div>
        )}

        {/* TABS */}
        {tabs.length > 1 && (
          <div style={MP.tabs}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setActiveGroup(t.key)}
                style={{ ...MP.tab, ...(activeGroup === t.key ? MP.tabActive : {}) }}>{t.label}</button>
            ))}
          </div>
        )}

        {/* GRID — sizes + extras as unified cards */}
        <div style={MP.grid}>
          {showSize && menu.size_variants.map(v => {
            const p = menu.price + (v.price_adjustment || 0);
            const sel = sizeId === v.size_id;
            return (
              <button key={'sz-' + v.size_id} onClick={() => setSizeId(v.size_id)}
                style={{ ...MP.optBtn, ...(sel ? MP.optSelected : {}), borderColor: sel ? '#FF6B35' : 'rgba(255,255,255,0.08)' }}>
                <div style={MP.optName}>📏 {v.size_name}</div>
                <div style={MP.optMeta}>
                  <span style={p !== menu.price ? MP.premiumTag : MP.freeTag}>
                    {p !== menu.price ? (p > menu.price ? '+' : '') + fmtIDR(p - menu.price) : fmtIDR(p)}
                  </span>
                  {v.is_default && <span style={MP.defaultTag}>DEFAULT</span>}
                </div>
                {sel && <div style={MP.checkCircle}>✓</div>}
              </button>
            );
          })}
          {showExtras && availableExtras.map(e => {
            const qty = extraQtys[e.id] || 0;
            const sel = qty > 0;
            return (
              <button key={'ex-' + e.id} onClick={() => updateExtra(e.id, sel ? -qty : 1)}
                style={{ ...MP.optBtn, ...(sel ? MP.optSelected : {}), borderColor: sel ? '#FF6B35' : 'rgba(255,255,255,0.08)' }}>
                <div style={MP.optName}>{e.emoji || ''} {e.name}</div>
                <div style={MP.optMeta}>
                  {e.extra_price > 0
                    ? <span style={MP.premiumTag}>+{fmtIDR(e.extra_price)}</span>
                    : <span style={MP.freeTag}>GRATIS</span>}
                </div>
                {sel && (
                  <>
                    <div style={MP.checkCircle}>{qty > 1 ? qty : '✓'}</div>
                    <div style={MP.qtyBlock}>
                      <span onClick={(ev) => { ev.stopPropagation(); updateExtra(e.id, -1); }} style={MP.qtyMini}>−</span>
                      <span onClick={(ev) => { ev.stopPropagation(); updateExtra(e.id, 1); }} style={MP.qtyMini}>+</span>
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* SELECTED CHIPS */}
        {(sizeName || Object.keys(extraQtys).length > 0) && (
          <div style={MP.selectedBar}>
            {sizeName && (
              <span style={{ ...MP.selectedChip, background: 'rgba(255,107,53,0.15)', borderColor: '#FF6B35' }}>
                📏 {sizeName}
              </span>
            )}
            {Object.entries(extraQtys).map(([eid, qty]) => {
              const e = extras.find(x => x.id === eid);
              if (!e) return null;
              return (
                <span key={eid} onClick={() => updateExtra(eid, -qty)}
                  style={{ ...MP.selectedChip, background: 'rgba(245,158,11,0.15)', borderColor: '#F59E0B' }}>
                  {e.name}{qty > 1 ? ` ×${qty}` : ''} ✕
                </span>
              );
            })}
          </div>
        )}

        {/* FOOTER — Cancel | Breakdown | Confirm (match ToppingPicker) */}
        <div style={MP.footer}>
          <button style={MP.cancelBtn} onClick={onClose}>← Batal</button>
          <div style={MP.priceBreakdown}>
            {extrasTotal > 0 && <div style={MP.addonLine}>Extras +{fmtIDR(extrasTotal)}</div>}
            <div style={MP.totalLine}>{fmtIDR(lineTotal)}</div>
          </div>
          <button style={MP.confirmBtn} onClick={submit}>Tambah ke Pesanan</button>
        </div>
      </div>
    </div>
  );
}

// Inline styles untuk MenuPickerModal — mirror ToppingPicker.S
const MP = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel: { width: '100%', maxWidth: 720, maxHeight: '95vh', background: '#111', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden', color: '#fff', fontFamily: "'Inter',sans-serif", boxShadow: '0 24px 64px rgba(0,0,0,0.7)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  itemEmoji: { fontSize: 40 },
  itemName: { fontSize: 18, fontWeight: 700, color: '#fff' },
  itemDesc: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  basePrice: { fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontFamily: "'Geist Mono',monospace" },
  progressSection: { padding: '12px 24px 8px' },
  progressLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 },
  extraBadge: { color: '#F59E0B', fontWeight: 600 },
  progressTrack: { height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, transition: 'width 0.2s, background 0.2s' },
  tabs: { display: 'flex', gap: 6, padding: '8px 24px 4px', overflowX: 'auto' },
  tab: { padding: '6px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  tabActive: { background: '#FF6B35', color: '#fff', borderColor: '#FF6B35', fontWeight: 600 },
  grid: { flex: 1, overflowY: 'auto', padding: '12px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, alignContent: 'start' },
  optBtn: { position: 'relative', padding: '14px 12px', borderRadius: 12, border: '2px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', color: '#fff', cursor: 'pointer', textAlign: 'left', minHeight: 70, fontFamily: 'inherit' },
  optSelected: { background: 'rgba(255,107,53,0.08)' },
  optName: { fontSize: 13, fontWeight: 600, marginBottom: 4 },
  optMeta: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  premiumTag: { fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontWeight: 600, fontFamily: "'Geist Mono',monospace" },
  freeTag: { fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,197,94,0.15)', color: '#22C55E', fontWeight: 700, fontFamily: "'Geist Mono',monospace" },
  defaultTag: { fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)', fontWeight: 700, letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" },
  checkCircle: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, background: '#FF6B35', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qtyBlock: { position: 'absolute', bottom: 6, right: 6, display: 'flex', gap: 4 },
  qtyMini: { width: 22, height: 22, borderRadius: 6, background: 'rgba(255,107,53,0.2)', color: '#FF6B35', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none' },
  selectedBar: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 24px', borderTop: '1px solid rgba(255,255,255,0.06)' },
  selectedChip: { padding: '4px 10px', borderRadius: 999, border: '1px solid', fontSize: 11, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', gap: 12 },
  cancelBtn: { padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap', fontFamily: 'inherit' },
  priceBreakdown: { textAlign: 'center', flex: 1 },
  addonLine: { fontSize: 11, color: '#F59E0B', fontFamily: "'Geist Mono',monospace" },
  totalLine: { fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: "'Geist Mono',monospace", letterSpacing: '-0.5px' },
  confirmBtn: { padding: '14px 28px', borderRadius: 12, border: 'none', background: '#FF6B35', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: 0.5, fontFamily: 'inherit' },
};

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
        {pkg.description && <p style={{color:'rgba(255,255,255,0.55)', marginTop:8, fontSize:13}}>{pkg.description}</p>}

        <h4 style={{marginTop:16, marginBottom:8, color:'#fff', fontWeight:700, fontSize:14}}>Isi Package</h4>
        <div style={{
          background:'rgba(255,255,255,0.025)',
          border:'1px solid rgba(255,255,255,0.06)',
          borderRadius:9, padding:'10px 14px',
        }}>
          {detail.items?.map((it, i) => (
            <div key={i} style={{padding:'7px 0', display:'flex', justifyContent:'space-between', color:'#fff', borderBottom: i < detail.items.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none'}}>
              <div>
                <b>{it.menu_emoji} {it.menu_name}</b>
                {it.size_name && <span style={{color:'rgba(255,255,255,0.45)', marginLeft:8, fontSize:12}}>({it.size_name})</span>}
              </div>
              <div style={{fontFamily:"'Geist Mono',monospace", color:'#fbbf24', fontWeight:700}}>× {it.qty}</div>
            </div>
          ))}
        </div>

        {detail.savings > 0 && (
          <div style={{
            marginTop:12, padding:'10px 14px',
            background:'rgba(16,185,129,0.1)',
            border:'1px solid rgba(16,185,129,0.3)',
            borderRadius:8, color:'#34d399', fontSize:13, fontWeight:600,
          }}>
            🎉 Hemat <b style={{fontFamily:"'Geist Mono',monospace"}}>{fmtIDR(detail.savings)}</b> ({detail.savings_pct?.toFixed(0)}%) dibanding beli individual!
          </div>
        )}

        <div style={styles.modalFooter}>
          <div style={{flex:1}}>
            <div style={{fontSize:12, color:'rgba(255,255,255,0.35)', textDecoration: detail.savings > 0 ? 'line-through' : 'none', fontFamily:"'Geist Mono',monospace"}}>
              {detail.savings > 0 && fmtIDR(detail.individual_total)}
            </div>
            <div style={{fontSize:24, fontWeight:800, color:'#fff', fontFamily:"'Geist Mono',monospace", letterSpacing:'-0.5px'}}>{fmtIDR(pkg.package_price)}</div>
          </div>
          <button onClick={submit} style={styles.addBtn}>+ Tambah ke Pesanan</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STYLES — Dark MacBook-premium (match POSMenu Order Baru layout)
// ============================================================
const styles = {
  // Outer shell with top header bar + body
  shell: {
    minHeight: "100vh", boxSizing: "border-box",
    background: "linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)",
    color: "#fff",
    fontFamily: "'Inter','SF Pro Display',system-ui,-apple-system,sans-serif",
    display: "flex", flexDirection: "column",
  },
  // Top header bar — match POSMenu Order Baru
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(13,17,23,0.78)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    position: "sticky", top: 0, zIndex: 10,
  },
  iconBtn: {
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.65)", padding: "7px 14px", borderRadius: 8,
    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3,
  },
  summary: { display: "flex", gap: 8, alignItems: "center", flex: 1, marginLeft: 14, color: "rgba(255,255,255,0.65)", fontSize: 12.5 },
  modeChip: {
    background: "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.08))",
    border: "1px solid rgba(245,158,11,0.4)",
    color: "#fbbf24", padding: "4px 10px", borderRadius: 7,
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
  },
  dot: { color: "#3a3b40", fontSize: 11 },
  muted: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontStyle: "italic" },
  kasir: {
    fontSize: 12.5, color: "rgba(255,255,255,0.7)", fontWeight: 600,
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
    padding: "6px 12px", borderRadius: 8,
  },
  // Body grid — menu side + cart side
  root: {
    display:'flex', gap:14, padding:14, flex: 1, boxSizing:'border-box', minHeight: 0,
    color:'#fff',
  },
  left: {
    flex:1.5,
    background:'linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.005))',
    border:'1px solid rgba(255,255,255,0.06)',
    borderRadius:14, padding:14, display:'flex', flexDirection:'column', overflow:'hidden',
    boxShadow:'0 1px 2px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  right: {
    flex:1, minWidth:340, maxWidth:420,
    background:'rgba(13,17,23,0.7)',
    backdropFilter:'blur(12px)',
    WebkitBackdropFilter:'blur(12px)',
    border:'1px solid rgba(255,255,255,0.06)',
    borderRadius:14, padding:14, display:'flex', flexDirection:'column',
    color:'#fff',
    boxShadow:'0 1px 2px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  searchBar: { marginBottom:12 },
  search: {
    width:'100%', padding:'10px 14px', borderRadius:9,
    background:'rgba(255,255,255,0.03)',
    border:'1px solid rgba(255,255,255,0.08)',
    color:'#fff', fontSize:13, boxSizing:'border-box', outline:'none', fontFamily:'inherit',
    transition:'border-color 0.15s, box-shadow 0.15s',
  },
  cats: { display:'flex', gap:6, marginBottom:14, overflowX:'auto', paddingBottom:4 },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(170px, 1fr))', gap:12, overflow:'auto', flex:1, padding:2 },
  card: {
    background:'linear-gradient(180deg,#15171c 0%,#0d0f14 100%)',
    border:'1px solid rgba(255,255,255,0.08)',
    borderRadius:14, padding:0, textAlign:'left',
    cursor:'pointer', position:'relative', display:'flex', flexDirection:'column',
    color:'#fff', overflow: 'hidden',
    boxShadow:'0 1px 2px rgba(0,0,0,0.3),0 4px 16px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.04)',
    transition:'all 0.2s cubic-bezier(0.4,0,0.2,1)',
    fontFamily: 'inherit',
  },
  // Visual image-placeholder area at top — emoji centered, gradient bg
  cardImg: {
    width: '100%', height: 110,
    background: 'linear-gradient(180deg, rgba(255,107,53,0.08) 0%, rgba(255,255,255,0.02) 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  cardTitle: { fontSize:13.5, fontWeight:700, color:'#fff', letterSpacing:'-0.2px', padding: '10px 12px 4px', lineHeight: 1.3, minHeight: 38 },
  cardPrice: { fontSize:15, fontWeight:800, color:'#F59E0B', fontFamily:"'Geist Mono',monospace", letterSpacing:'-0.3px', padding: '0 12px 12px' },
  cardBadge: {
    position:'absolute', bottom:6, right:6, fontSize:9, fontWeight:700,
    background:'rgba(13,17,23,0.85)', color:'#60a5fa',
    padding:'3px 7px', borderRadius:5,
    border:'1px solid rgba(59,130,246,0.35)',
    fontFamily:"'Geist Mono',monospace", letterSpacing:0.5,
    backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
  },
  popularBadge: {
    position:'absolute', top:6, left:6, fontSize:9, fontWeight:800,
    background:'linear-gradient(135deg,#fbbf24,#f59e0b)', color:'#1a1205',
    padding:'3px 8px', borderRadius:5, textTransform:'uppercase', letterSpacing:0.6,
    boxShadow:'0 2px 8px rgba(245,158,11,0.4)',
  },
  cartList: { flex:1, overflow:'auto', marginBottom:12, paddingRight:2 },
  empty: {
    padding:40, textAlign:'center', color:'rgba(255,255,255,0.35)',
    fontFamily:"'Geist Mono',monospace", letterSpacing:0.5, fontSize:12,
  },
  cartItem: {
    display:'flex', padding:'10px 12px',
    background:'rgba(255,255,255,0.025)',
    border:'1px solid rgba(255,255,255,0.06)',
    borderRadius:10, marginBottom:8, alignItems:'center', gap:6,
    color:'#fff',
  },
  qtyBtn: {
    width:28, height:28, borderRadius:6,
    background:'rgba(255,255,255,0.05)',
    border:'1px solid rgba(255,255,255,0.08)',
    color:'#fff', cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:'inherit',
    display:'inline-flex', alignItems:'center', justifyContent:'center',
    transition:'all 0.15s',
  },
  removeBtn: {
    width:28, height:28, borderRadius:6,
    background:'rgba(239,68,68,0.12)', color:'#ef4444',
    border:'1px solid rgba(239,68,68,0.25)',
    cursor:'pointer', fontSize:16, marginLeft:4, fontFamily:'inherit',
    display:'inline-flex', alignItems:'center', justifyContent:'center',
    transition:'all 0.15s',
  },
  cartFooter: {
    borderTop:'1px solid rgba(255,255,255,0.08)',
    paddingTop:12,
  },
  checkout: {
    width:'100%', padding:'14px 20px',
    background:'linear-gradient(135deg,#F59E0B,#fbbf24)',
    color:'#1a1205', border:'none', borderRadius:11,
    fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:'inherit', letterSpacing:0.3,
    boxShadow:'0 6px 18px rgba(245,158,11,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
    transition:'all 0.2s',
  },
  checkoutDisabled: {
    width:'100%', padding:'14px 20px',
    background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.3)',
    border:'1px solid rgba(255,255,255,0.06)',
    borderRadius:11, fontSize:15, fontWeight:700, cursor:'not-allowed', fontFamily:'inherit',
  },
  modalOverlay: {
    position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
    backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)',
    display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
  },
  modalBox: {
    background:'linear-gradient(180deg,#15171c 0%,#0d0f14 100%)',
    border:'1px solid rgba(255,255,255,0.08)',
    color:'#fff',
    borderRadius:14, padding:24, maxWidth:600, width:'95vw', maxHeight:'90vh', overflow:'auto',
    boxShadow:'0 24px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  closeBtn: {
    width:36, height:36, borderRadius:8,
    background:'rgba(255,255,255,0.06)',
    border:'1px solid rgba(255,255,255,0.08)',
    color:'#fff', fontSize:22, cursor:'pointer', fontFamily:'inherit',
    display:'inline-flex', alignItems:'center', justifyContent:'center',
  },
  sizeBtn: {
    padding:'12px 20px',
    border:'1px solid rgba(255,255,255,0.08)',
    background:'rgba(255,255,255,0.03)',
    color:'#fff', borderRadius:10,
    cursor:'pointer', textAlign:'center', minWidth:90, fontFamily:'inherit',
    transition:'all 0.15s',
  },
  extraRow: {
    display:'flex', alignItems:'center', gap:6, padding:'7px 10px',
    background:'rgba(255,255,255,0.025)',
    border:'1px solid rgba(255,255,255,0.06)',
    borderRadius:8, color:'#fff',
  },
  modalFooter: {
    display:'flex', alignItems:'center', gap:12, marginTop:20, paddingTop:16,
    borderTop:'1px solid rgba(255,255,255,0.08)',
  },
  addBtn: {
    padding:'12px 24px',
    background:'linear-gradient(135deg,#F59E0B,#fbbf24)',
    color:'#1a1205', border:'none', borderRadius:9,
    fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:'inherit', letterSpacing:0.3,
    boxShadow:'0 4px 14px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
  },
};
const catBtn = (active) => ({
  padding:'8px 14px', borderRadius:20,
  border: active ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.08)',
  background: active ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.025)',
  color: active ? '#fbbf24' : 'rgba(255,255,255,0.55)',
  fontWeight: active ? 700 : 500, cursor:'pointer', whiteSpace:'nowrap',
  fontSize:12.5, fontFamily:'inherit',
  boxShadow: active ? '0 0 16px rgba(245,158,11,0.15)' : 'none',
  transition:'all 0.15s',
});
