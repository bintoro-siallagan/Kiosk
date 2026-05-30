import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import ToppingPicker from "./ToppingPicker.jsx";
import API_HOST from "./apiBase.js";
import { LoadingState } from "./components/uiKit.jsx";

const MyKpiPanel = lazy(() => import("./POS/MyKpiPanel.jsx"));
const MorningRecognition = lazy(() => import("./POS/MorningRecognition.jsx"));
const WelcomeRitual = lazy(() => import("./POS/WelcomeRitual.jsx"));
const KasirNudge = lazy(() => import("./POS/KasirNudge.jsx"));

const API_BASE = API_HOST;

// Cart key helper: same item + same toppings = same cart row
function makeCartKey(item, addons) {
  const tIds = (addons?.toppings || []).map(t => t.id).sort().join("_");
  return tIds ? `${item.id}-${tIds}` : `${item.id}`;
}

export default function POSMenu({ order, cashier, onBack, onCancel, onCheckout }) {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [cart, setCart] = useState([]);
  const [toppingItem, setToppingItem] = useState(null);
  const [showKpi, setShowKpi] = useState(false);
  // Morning Recognition — auto-trigger sekali per hari per kasir.
  // Pakai localStorage key kombinasi tanggal + nama kasir supaya gak repeat.
  const [showMorning, setShowMorning] = useState(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const key = `morningRecog:${cashier?.name || 'unknown'}:${today}`;
      // Skip kalau hari pertama (mereka udah dapat WelcomeRitual — gak perlu double sambutan)
      if (localStorage.getItem('karyaos:isFirstLogin')) return false;
      return !localStorage.getItem(key);
    } catch { return false; }
  });
  // Fase 5 — Welcome ritual untuk kasir baru. Diset dari POSKasirLogin
  // saat backend kasih needs_welcome=true. Setelah selesai, localStorage
  // dibersihkan + backend dipanggil utk set onboarded_at.
  const [showWelcome, setShowWelcome] = useState(() => {
    try { return !!localStorage.getItem('karyaos:needsWelcome'); } catch { return false; }
  });

  useEffect(() => {
    fetch(`${API_BASE}/api/menu`)
      .then(r => r.json())
      .then(d => {
        setMenu(Array.isArray(d) ? d : (d?.items || []));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = new Set();
    menu.forEach(m => cats.add(m.category || m.cat || "Other"));
    return ["All", ...Array.from(cats).sort()];
  }, [menu]);

  const filtered = useMemo(() => menu.filter(m => {
    const cat = m.category || m.cat || "Other";
    if (activeCat !== "All" && cat !== activeCat) return false;
    if (search && !(m.name || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (m.avail === false || m.available === false || m.active === false) return false;
    return true;
  }), [menu, activeCat, search]);

  // Add item to cart (with or without toppings)
  const addItem = (item, addons, addonTotal) => {
    setCart(c => {
      const fullAddons = addons || {};
      const cartKey = makeCartKey(item, fullAddons);
      const existing = c.find(ci => ci.cartKey === cartKey);
      if (existing) {
        return c.map(ci => ci.cartKey === cartKey ? {...ci, qty: ci.qty + 1} : ci);
      }
      return [...c, {
        ...item,
        cartKey,
        qty: 1,
        addons: fullAddons,
        addonTotal: addonTotal || 0
      }];
    });
  };

  // Click item handler: open topping picker if item has freeToppings
  const handleItemClick = (item) => {
    if (item.freeToppings > 0) {
      setToppingItem(item);
    } else {
      addItem(item, {}, 0);
    }
  };

  // ToppingPicker confirm callback
  // ToppingPicker signature: onConfirm(item, selectedToppings[], addonCost)
  const handleToppingConfirm = (item, selectedToppings, addonCost) => {
    const toppings = Array.isArray(selectedToppings) ? selectedToppings : [];
    const addons = { toppings };
    addItem(item, addons, addonCost || 0);
    setToppingItem(null);
  };

  const updateQty = (cartKey, delta) => {
    setCart(c => c.map(ci => ci.cartKey === cartKey ? {...ci, qty: ci.qty + delta} : ci).filter(ci => ci.qty > 0));
  };

  const removeItem = (cartKey) => setCart(c => c.filter(ci => ci.cartKey !== cartKey));

  const subtotal = useMemo(() => {
    return cart.reduce((s, ci) => s + ((ci.price || 0) + (ci.addonTotal || 0)) * ci.qty, 0);
  }, [cart]);
  const cartCount = cart.reduce((s, ci) => s + ci.qty, 0);
  const fmt = (n) => (n || 0).toLocaleString("id-ID");


  // Broadcast cart updates to CDS (Step 7B)
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`${API_BASE}/api/pos/broadcast`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          event: "pos:cart_update",
          data: { cart, subtotal, order }
        })
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [cart, subtotal]);

  const handleAction = (action) => {
    if (cart.length === 0) { alert("Cart kosong! Tambah item dulu."); return; }
    // Increment transaction counter — buat KasirNudge milestone celebration
    // (parent handle real order success/fail, ini optimistic count)
    try {
      const today = new Date().toISOString().slice(0, 10);
      const key = `txCount:${cashier?.name || 'x'}:${today}`;
      const cur = parseInt(localStorage.getItem(key) || '0', 10);
      localStorage.setItem(key, String(cur + 1));
    } catch {}
    onCheckout({ action, cart, subtotal });
  };

  return (
    <div style={S.root}>
      <style>{`
        /* POS premium product tile hover — brand glow + image zoom (speed feel + bikin lapar) */
        button[data-pos-tile]{will-change:transform}
        button[data-pos-tile]:hover{transform:translateY(-4px) scale(1.015);border-color:color-mix(in srgb,var(--brand-primary,#FF6B35) 45%,transparent)!important;box-shadow:0 4px 12px rgba(0,0,0,0.4),0 16px 40px rgba(0,0,0,0.5),0 0 24px color-mix(in srgb,var(--brand-primary,#FF6B35) 25%,transparent)}
        button[data-pos-tile]:hover img{transform:scale(1.08)}
        button[data-pos-tile]:active{transform:translateY(-1px) scale(0.99);transition:transform 0.08s}
        /* Add-to-cart bounce (optimistic feedback) */
        @keyframes posAddBump{0%,100%{transform:scale(1)}40%{transform:scale(1.06)}}
        .pos-add-bump{animation:posAddBump 0.32s cubic-bezier(.34,1.56,.64,1)}
        /* Cart item slide-in */
        @keyframes posCartSlide{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        div[data-pos-cart-item]{animation:posCartSlide 0.28s cubic-bezier(.2,.8,.2,1)}
        /* Cat tab hover lift */
        button[data-pos-cat]:hover{background:rgba(255,255,255,0.06)!important;color:#fff!important}
      `}</style>
      <header style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>← Back</button>
        <div style={S.summary}>
          <span>{order.type === "dine-in" ? "🍽️ Dine-in" : "🛍️ Take-away"}</span>
          {order.table && <><span style={S.dot}>·</span><span>{order.table.name}</span></>}
          {order.customerName && <><span style={S.dot}>·</span><span>{order.customerName}</span></>}
        </div>
        <PosShiftPill apiBase={API_BASE} />
        <PosAlertPill apiBase={API_BASE} />
        <PosStockPill apiBase={API_BASE} />
        <button
          onClick={() => setShowKpi(true)}
          style={S.kpiBtn}
          title="Cermin jujur — KPI saya hari ini"
        >📊</button>
        <div style={S.kasir}>👤 {cashier.name}</div>
        <button onClick={onCancel} style={S.iconBtn}>✕</button>
      </header>

      {showKpi && (
        <Suspense fallback={null}>
          <MyKpiPanel apiBase={API_BASE} onClose={() => setShowKpi(false)} />
        </Suspense>
      )}

      {showWelcome && (
        <Suspense fallback={null}>
          <WelcomeRitual
            cashierName={cashier?.name || 'Sahabat'}
            apiBase={API_BASE}
            onDone={() => {
              setShowWelcome(false);
              try {
                localStorage.removeItem('karyaos:needsWelcome');
                localStorage.removeItem('karyaos:isFirstLogin');
                // Mark today's homecoming as "sudah disambut" — gak perlu double modal
                const today = new Date().toISOString().slice(0, 10);
                const key = `morningRecog:${cashier?.name || 'unknown'}:${today}`;
                localStorage.setItem(key, '1');
              } catch {}
              setShowMorning(false);
            }}
          />
        </Suspense>
      )}

      {/* KasirNudge — encouragement bubble saat idle / milestone */}
      {!showWelcome && !showMorning && !showKpi && (
        <Suspense fallback={null}>
          <KasirNudge
            cartActivity={cart.length}
            txCount={(() => {
              try {
                const today = new Date().toISOString().slice(0, 10);
                return parseInt(localStorage.getItem(`txCount:${cashier?.name || 'x'}:${today}`) || '0', 10);
              } catch { return 0; }
            })()}
            cashierName={cashier?.name || null}
          />
        </Suspense>
      )}

      {!showWelcome && showMorning && (
        <Suspense fallback={null}>
          <MorningRecognition
            apiBase={API_BASE}
            onDone={() => {
              setShowMorning(false);
              try {
                const today = new Date().toISOString().slice(0, 10);
                const key = `morningRecog:${cashier?.name || 'unknown'}:${today}`;
                localStorage.setItem(key, '1');
              } catch {}
            }}
          />
        </Suspense>
      )}

      <div style={S.body}>
        <div style={S.menuSide}>
          <div style={S.toolbar}>
            <input
              placeholder="🔍 Cari item..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={S.search}
            />
          </div>
          <div style={S.cats}>
            {categories.map(c => (
              <button key={c} data-pos-cat onClick={() => setActiveCat(c)}
                style={{...S.catBtn, ...(activeCat === c ? S.catActive : {})}}>
                {c}
              </button>
            ))}
          </div>

          {loading && <LoadingState label="Memuat menu..." />}

          <div style={S.grid}>
            {filtered.map(item => (
              <button key={item.id} data-pos-tile onClick={() => handleItemClick(item)} style={S.itemCard}>
                {(item.image_url || item.image) ? (
                  <img src={item.image_url || item.image} alt="" style={S.itemImg} onError={e => { e.target.style.display = "none"; e.target.nextSibling && (e.target.nextSibling.style.display = "flex"); }}/>
                ) : null}
                {!(item.image_url || item.image) && (
                  <div style={S.itemImgPlaceholder}>{item.emoji || "🍴"}</div>
                )}
                <div style={S.itemName}>{item.name}</div>
                <div style={S.itemPrice}>Rp {fmt(item.price)}</div>
                {item.freeToppings > 0 && (
                  <div style={S.toppingTag}>+ {item.freeToppings} topping</div>
                )}
              </button>
            ))}
          </div>

          {!loading && filtered.length === 0 && (
            <div style={S.emptyState}>Gak ada item match.</div>
          )}
        </div>

        <div style={S.cartSide}>
          <div style={S.cartHeader}>
            <span>🛒 Cart</span>
            {cartCount > 0 && <span style={S.cartBadge}>{cartCount}</span>}
          </div>

          {cart.length === 0 ? (
            <div style={S.cartEmpty}>
              <div style={{fontSize:56, opacity:0.4, marginBottom:8}}>🛒</div>
              <p style={{margin:"4px 0"}}>Cart kosong</p>
              <p style={{fontSize:11, color:"#555", margin:0}}>Click item untuk add</p>
            </div>
          ) : (
            <>
              <div style={S.cartItems}>
                {cart.map(ci => {
                  const toppings = ci.addons?.toppings || [];
                  const linePrice = ((ci.price || 0) + (ci.addonTotal || 0)) * ci.qty;
                  return (
                    <div key={ci.cartKey} data-pos-cart-item style={S.cartItem}>
                      <div style={S.cartItemTop}>
                        <div style={{flex:1}}>
                          <div style={S.cartItemName}>{ci.name}</div>
                          {toppings.length > 0 && (
                            <div style={S.toppingList}>
                              {toppings.map((t, i) => (
                                <div key={i} style={S.toppingRow}>
                                  + {t.name}{t.price > 0 && ` (Rp ${fmt(t.price)})`}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button onClick={() => removeItem(ci.cartKey)} style={S.removeBtn}>✕</button>
                      </div>
                      <div style={S.cartItemBot}>
                        <div style={S.qtyControls}>
                          <button onClick={() => updateQty(ci.cartKey, -1)} style={S.qtyBtn}>−</button>
                          <span style={S.qty}>{ci.qty}</span>
                          <button onClick={() => updateQty(ci.cartKey, 1)} style={S.qtyBtn}>+</button>
                        </div>
                        <div style={S.itemSub}>Rp {fmt(linePrice)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── POS COMBO UPSELL — 'Tambah lagi yuk!' strip (revenue lever) ── */}
              {(() => {
                const cartCatSet = new Set(cart.map(ci => ci.category));
                const cartIds = new Set(cart.map(ci => ci.id));
                const PAIRING = {
                  "🍦 Frozen Yogurt": ["🥤 Smoothies", "📦 Take Home", "✨ Special"],
                  "🥤 Smoothies":     ["🍦 Frozen Yogurt", "🍨 Yogulato"],
                  "🍨 Yogulato":      ["🥤 Smoothies", "📦 Take Home"],
                  "📦 Take Home":     ["✨ Special"],
                  "✨ Special":       ["🥤 Smoothies", "🍦 Frozen Yogurt"],
                };
                const suggCats = new Set();
                cartCatSet.forEach(c => (PAIRING[c] || []).forEach(s => suggCats.add(s)));
                const sugg = menu
                  .filter(m => suggCats.has(m.category) && !cartIds.has(m.id))
                  .slice(0, 3);
                if (sugg.length === 0) return null;
                return (
                  <div style={{
                    padding: "12px 16px 14px",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    background: "linear-gradient(180deg,color-mix(in srgb,var(--brand-primary,#FF6B35) 6%,transparent),transparent)",
                  }}>
                    <div style={{
                      fontSize: 10, color: "color-mix(in srgb,var(--brand-primary,#FF6B35) 90%,#fff)",
                      fontFamily: "'Geist Mono',monospace", fontWeight: 700, letterSpacing: 1.6,
                      textTransform: "uppercase", marginBottom: 8,
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span>🎯</span> TAMBAH LAGI YUK?
                    </div>
                    <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                      {sugg.map(item => (
                        <button key={item.id} onClick={() => handleItemClick(item)} style={{
                          flexShrink: 0, display: "flex", alignItems: "center", gap: 7,
                          padding: "6px 10px 6px 6px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 10, cursor: "pointer", color: "#fff", fontFamily: "inherit",
                          transition: "all 0.15s",
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb,var(--brand-primary,#FF6B35) 14%,transparent)"; e.currentTarget.style.borderColor = "color-mix(in srgb,var(--brand-primary,#FF6B35) 50%,transparent)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}>
                          {(item.image_url || item.image) ? (
                            <img src={item.image_url || item.image} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{item.emoji || "🍴"}</div>
                          )}
                          <div style={{ textAlign: "left", minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 }}>{item.name}</div>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "color-mix(in srgb,var(--brand-primary,#FF6B35) 95%,#fff)", fontFamily: "'Geist Mono',monospace", marginTop: 1 }}>+Rp {fmt(item.price)}</div>
                          </div>
                          <span style={{
                            width: 20, height: 20, borderRadius: "50%",
                            background: "linear-gradient(135deg,var(--brand-primary,#FF6B35),var(--brand-secondary,#E55A2B))",
                            color: "#fff", fontSize: 13, fontWeight: 800, lineHeight: 1,
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>+</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div style={S.cartTotal}>
                <div style={S.totalRow}>
                  <span>Subtotal</span>
                  <span style={S.totalAmount}>Rp {fmt(subtotal)}</span>
                </div>
                <div style={S.taxNote}>PPN 10% included</div>
              </div>

              <div style={S.actions}>
                <button onClick={() => handleAction("pay")} style={S.payBtn}>
                  💸 Bayar Sekarang
                </button>
                <button onClick={() => handleAction("openTab")} style={S.tabBtn}>
                  📋 Open Tab
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Topping Picker Modal */}
      {toppingItem && (
        <ToppingPicker
          item={toppingItem}
          onClose={() => setToppingItem(null)}
          onConfirm={handleToppingConfirm}
        />
      )}
    </div>
  );
}

const S = {
  root: { minHeight:"100vh", background:"radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)", backgroundAttachment:"fixed", color:"#fff", fontFamily:"'Inter',sans-serif",
    display:"flex", flexDirection:"column" },
  header: { display:"flex", alignItems:"center", gap:12,
    padding:"12px 20px", borderBottom:"1px solid #222", background:"rgba(13,17,23,0.6)", backdropFilter:"blur(20px) saturate(180%)", WebkitBackdropFilter:"blur(20px) saturate(180%)",
    position:"sticky", top:0, zIndex:10 },
  iconBtn: { background:"transparent", border:"1px solid #333", color:"#aaa",
    padding:"8px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" },
  summary: { flex:1, fontSize:14, color:"#F59E0B", fontWeight:600, display:"flex", gap:6, alignItems:"center" },
  dot: { color:"#444" },
  kasir: { fontSize:13, color:"#888" },
  kpiBtn: { background:"rgba(245,158,11,0.10)", border:"1px solid rgba(245,158,11,0.30)", color:"#F59E0B",
    width:36, height:36, borderRadius:10, fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit" },
  body: { flex:1, display:"flex", overflow:"hidden" },
  menuSide: { flex:1, padding:"16px 20px", overflowY:"auto", maxHeight:"calc(100vh - 60px)" },
  toolbar: { marginBottom:12 },
  search: { width:"100%", padding:"12px 16px", borderRadius:10,
    background: "rgba(255,255,255,0.025)", border:"1px solid #2a2a2a", color:"#fff",
    fontFamily:"inherit", fontSize:14, boxSizing:"border-box" },
  cats: { display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" },
  catBtn: { background: "rgba(255,255,255,0.025)", border:"1px solid #2a2a2a", color:"#aaa",
    padding:"8px 14px", borderRadius:100, fontSize:13, cursor:"pointer",
    fontFamily:"inherit", whiteSpace:"nowrap" },
  catActive: { background:"radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 55%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))", color:"#fff", borderColor:"rgba(255,255,255,0.16)", fontWeight:600, textShadow:"0 1px 2px rgba(0,0,0,0.45)" },
  loading: { textAlign:"center", color:"#666", padding:40 },
  // PREMIUM POS PRODUCT TILE — bigger image, sharper hierarchy, hover lift
  grid: { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(170px, 1fr))", gap:14 },
  itemCard: { background:"linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16,
    padding:0, color:"#fff", fontFamily:"inherit", cursor:"pointer",
    transition:"transform 0.18s cubic-bezier(.2,.8,.2,1),border-color 0.18s,box-shadow 0.18s", textAlign:"left",
    display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" },
  itemImg: { width:"100%", height:140, objectFit:"cover", background:"#0d0f14", display:"block",
    transition:"transform 0.4s cubic-bezier(.2,.8,.2,1)" },
  itemImgPlaceholder: { width:"100%", height:140, background:"radial-gradient(ellipse 80% 60% at 50% 35%,color-mix(in srgb,var(--brand-primary,#FF6B35) 18%,transparent),#0d0f14)",
    display:"flex", alignItems:"center", justifyContent:"center", fontSize:64 },
  itemName: { fontSize:15, fontWeight:700, lineHeight:1.25, padding:"12px 14px 0", color:"#fff",
    overflow:"hidden", textOverflow:"ellipsis", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", minHeight:38 },
  itemPrice: { fontSize:17, fontWeight:800, color:"var(--brand-primary,#FF6B35)", padding:"6px 14px 14px",
    fontFamily:"'Geist Mono',monospace", letterSpacing:"-0.3px", fontVariantNumeric:"tabular-nums",
    textShadow:"0 0 12px color-mix(in srgb,var(--brand-primary,#FF6B35) 25%,transparent)" },
  toppingTag: { fontSize:10, color:"#10B981", fontWeight:700, letterSpacing:0.5,
    background:"rgba(16,185,129,0.12)", padding:"3px 8px", borderRadius:4,
    position:"absolute", top:8, right:8, border:"1px solid rgba(16,185,129,0.3)" },
  emptyState: { textAlign:"center", color:"#555", padding:40 },
  // CART HERO — bigger panel, premium dark, brand-tinted header
  cartSide: { width:380, background:"linear-gradient(180deg,rgba(13,17,23,0.85),rgba(8,9,15,0.92))", backdropFilter:"blur(24px) saturate(180%)", WebkitBackdropFilter:"blur(24px) saturate(180%)", borderLeft:"1px solid rgba(255,255,255,0.08)",
    display:"flex", flexDirection:"column", maxHeight:"calc(100vh - 60px)", position:"sticky", top:60 },
  cartHeader: { padding:"20px 22px 18px", borderBottom:"1px solid rgba(255,255,255,0.08)",
    display:"flex", alignItems:"center", gap:10, fontSize:20, fontWeight:800, letterSpacing:-0.5,
    background:"linear-gradient(180deg,color-mix(in srgb,var(--brand-primary,#FF6B35) 6%,transparent),transparent)" },
  cartBadge: { background:"linear-gradient(135deg,var(--brand-primary,#FF6B35),var(--brand-secondary,#E55A2B))", color:"#fff", padding:"3px 12px", borderRadius:100,
    fontSize:12, fontWeight:800, fontFamily:"'Geist Mono',monospace", letterSpacing:0.5,
    boxShadow:"0 4px 14px color-mix(in srgb,var(--brand-primary,#FF6B35) 40%,transparent)" },
  cartEmpty: { flex:1, display:"flex", flexDirection:"column", alignItems:"center",
    justifyContent:"center", color:"#666", padding:20, textAlign:"center" },
  cartItems: { flex:1, overflowY:"auto", padding:"8px 16px" },
  cartItem: { padding:"12px 0", borderBottom:"1px solid #222" },
  cartItemTop: { display:"flex", justifyContent:"space-between", marginBottom:8, gap:8 },
  cartItemName: { fontSize:13, fontWeight:600 },
  toppingList: { marginTop:4, marginLeft:2 },
  toppingRow: { fontSize:11, color:"#10B981", padding:"1px 0" },
  removeBtn: { background:"transparent", border:"none", color:"#666", fontSize:14,
    cursor:"pointer", padding:"0 4px", fontFamily:"inherit" },
  cartItemBot: { display:"flex", justifyContent:"space-between", alignItems:"center" },
  qtyControls: { display:"flex", alignItems:"center", gap:8,
    background: "rgba(255,255,255,0.025)", border:"1px solid #2a2a2a", borderRadius:8, padding:"2px" },
  qtyBtn: { background:"transparent", border:"none", color:"#fff", fontSize:16,
    width:24, height:24, cursor:"pointer", fontFamily:"inherit", borderRadius:6 },
  qty: { fontSize:13, fontWeight:700, minWidth:20, textAlign:"center" },
  itemSub: { fontSize:13, fontWeight:700, color:"#F59E0B" },
  cartTotal: { padding:"16px 20px", borderTop:"1px solid rgba(255,255,255,0.06)", background:"rgba(13,17,23,0.7)", backdropFilter:"blur(20px) saturate(180%)", WebkitBackdropFilter:"blur(20px) saturate(180%)" },
  totalRow: { display:"flex", justifyContent:"space-between", alignItems:"center",
    fontSize:15, fontWeight:600 },
  totalAmount: { fontSize:20, fontWeight:800, color:"#F59E0B", fontFamily:"'Inter',sans-serif", letterSpacing:1 },
  taxNote: { fontSize:10, color:"#555", marginTop:2 },
  actions: { padding:"12px 16px 20px", display:"flex", flexDirection:"column", gap:8 },
  payBtn: { background:"radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))", color:"#fff", textShadow:"0 1px 3px rgba(0,0,0,0.45)", border:"1px solid rgba(255,255,255,0.16)", borderRadius:12,
    padding:"14px", fontFamily:"inherit", fontSize:14, fontWeight:800,
    letterSpacing:1, cursor:"pointer" },
  tabBtn: { background:"transparent", color:"#aaa", border:"1px solid #444", borderRadius:12,
    padding:"12px", fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer" }
};

// ─── POS ALERT PILL — Operational Intelligence indicator di top bar ───
// Auto-poll /api/audit/anomalies tiap 30 detik. Pulse merah kalau ada critical alerts.
// Click → modal panel showing recent anomalies dgn severity color.
function PosAlertPill({ apiBase = "" }) {
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancel = false;
    const fetchAlerts = () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
      fetch(`${apiBase}/api/audit/anomalies?limit=20&resolved=false`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.ok ? r.json() : { items: [] })
        .then(d => { if (!cancel && Array.isArray(d?.items)) setAlerts(d.items); })
        .catch(() => {});
    };
    fetchAlerts();
    const t = setInterval(fetchAlerts, 30_000);
    return () => { cancel = true; clearInterval(t); };
  }, [apiBase]);

  const criticalN = alerts.filter(a => (a.severity || a.sev) === "critical").length;
  const warnN     = alerts.filter(a => ["warning","warn","high"].includes((a.severity || a.sev || "").toLowerCase())).length;
  const total     = alerts.length;
  const tier      = criticalN > 0 ? "critical" : warnN > 0 ? "warning" : "normal";
  const tierColor = { critical: "#ef4444", warning: "#fbbf24", normal: "#10b981" }[tier];
  const tierLabel = { critical: "ALERT", warning: "WATCH", normal: "OK" }[tier];

  return (
    <>
      <style>{`
        @keyframes posAlertPulse{0%,100%{opacity:1}50%{opacity:0.35}}
        @keyframes posAlertGlow{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.45)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}
        .pos-alert-critical{animation:posAlertGlow 1.6s ease infinite}
      `}</style>
      <button
        onClick={() => setOpen(true)}
        title={total > 0 ? `${total} anomali aktif (${criticalN} critical, ${warnN} warning)` : "Semua sistem normal"}
        className={tier === "critical" ? "pos-alert-critical" : ""}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 12px",
          background: `${tierColor}1a`,
          border: `1px solid ${tierColor}55`,
          borderRadius: 999,
          color: tierColor, fontFamily: "'Geist Mono',monospace",
          fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: "pointer",
          transition: "all 0.2s",
        }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: tierColor, boxShadow: `0 0 6px ${tierColor}`,
          animation: "posAlertPulse 1.6s ease infinite",
        }} />
        <span>● {tierLabel}</span>
        {total > 0 && <span style={{ fontSize: 10, opacity: 0.8 }}>· {total}</span>}
      </button>
      {open && <PosAlertModal alerts={alerts} apiBase={apiBase} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── POS STOCK PILL — Realtime inventory alerts ───
// Poll /api/audit/warehouse setiap 60s. Hitung items low (<7 hari) + critical (<=min).
// Click → modal showing low/critical stock items.
function PosStockPill({ apiBase = "" }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancel = false;
    const load = () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
      fetch(`${apiBase}/api/audit/warehouse`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.ok ? r.json() : { items: [] })
        .then(d => { if (!cancel && Array.isArray(d?.items)) setItems(d.items); })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { cancel = true; clearInterval(t); };
  }, [apiBase]);

  const critical = items.filter(w => (w.stock || 0) <= 0 || (w.stock || 0) <= (w.minStock || 0));
  const low      = items.filter(w => w.dailyUse > 0 && w.stock / w.dailyUse <= 7 && (w.stock || 0) > (w.minStock || 0));
  const total    = critical.length + low.length;
  const tier     = critical.length > 0 ? "critical" : low.length > 0 ? "warning" : "normal";
  const color    = { critical: "#ef4444", warning: "#fbbf24", normal: "#10b981" }[tier];
  const label    = { critical: "STOCK", warning: "STOCK", normal: "STOCK" }[tier];

  return (
    <>
      <button onClick={() => setOpen(true)} title={total > 0 ? `${critical.length} critical · ${low.length} low stock` : "Inventory aman"} style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 11px",
        background: `${color}1a`, border: `1px solid ${color}55`, borderRadius: 999,
        color, fontFamily: "'Geist Mono',monospace",
        fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: "pointer",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
        <span>📦 {label}</span>
        {total > 0 && <span style={{ fontSize: 10, opacity: 0.85 }}>· {total}</span>}
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "min(560px, 100%)", maxHeight: "80vh",
            background: "linear-gradient(180deg,#0d1117,#080a0f)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: "#fbbf24", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>📦 INVENTORY ALERTS</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 4 }}>{critical.length} critical · {low.length} low stock</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", borderRadius: 8, padding: "6px 12px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
              {[...critical, ...low].length === 0 ? (
                <div style={{ padding: "60px 20px", textAlign: "center", color: "#5b6470" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <div style={{ fontWeight: 700, color: "#10b981" }}>Inventory aman</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Semua stok di atas threshold</div>
                </div>
              ) : [...critical, ...low].map((w, i) => {
                const isCrit = (w.stock || 0) <= 0 || (w.stock || 0) <= (w.minStock || 0);
                const c = isCrit ? "#ef4444" : "#fbbf24";
                const daysLeft = w.dailyUse > 0 ? Math.floor((w.stock || 0) / w.dailyUse) : null;
                return (
                  <div key={i} style={{
                    padding: "10px 14px", marginBottom: 8, borderRadius: 10,
                    background: `${c}0d`, border: `1px solid ${c}44`,
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 900, color: c, background: `${c}22`, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.8 }}>
                          {isCrit ? "CRITICAL" : "LOW"}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{w.name || w.sku || "—"}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontFamily: "'Geist Mono',monospace" }}>
                        Stock: <b style={{ color: c }}>{w.stock} {w.unit || ""}</b> · Min: {w.minStock || 0} {w.unit || ""}
                        {daysLeft !== null && <> · ~{daysLeft} hari lagi</>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── POS SHIFT PILL — Live shift status di top bar (operational visibility) ───
// Polls /api/shifts/active → /api/pos/shifts/{id}/summary. Shows duration · revenue · orders.
function PosShiftPill({ apiBase = "" }) {
  const [shift, setShift] = useState(null);
  const [sum, setSum] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const s = await fetch(`${apiBase}/api/shifts/active`).then(r => r.json()).catch(() => null);
        if (cancel) return;
        if (s?.id) {
          setShift(s);
          const sm = await fetch(`${apiBase}/api/pos/shifts/${s.id}/summary`).then(r => r.json()).catch(() => null);
          if (!cancel && sm) setSum(sm);
        } else {
          setShift(null); setSum(null);
        }
      } catch {}
    };
    load();
    const t1 = setInterval(load, 20_000);
    const t2 = setInterval(() => setNow(Date.now()), 30_000);  // tick utk duration
    return () => { cancel = true; clearInterval(t1); clearInterval(t2); };
  }, [apiBase]);

  if (!shift) return null;
  const elapsedMin = Math.floor((now / 1000 - shift.opened_at) / 60);
  const dur = elapsedMin >= 60 ? `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m` : `${elapsedMin}m`;
  const revenue = sum?.revenue || 0;
  const orders = sum?.orders || 0;

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "5px 12px",
      background: "rgba(16,185,129,0.1)",
      border: "1px solid rgba(16,185,129,0.35)",
      borderRadius: 999, fontFamily: "'Geist Mono',monospace",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
      <span style={{ fontSize: 10, color: "#10b981", fontWeight: 800, letterSpacing: 1 }}>SHIFT</span>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>{dur}</span>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>·</span>
      <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 800 }}>
        {revenue > 0 ? `Rp ${Math.round(revenue/1000)}k` : "—"}
      </span>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>·</span>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>{orders}×</span>
    </div>
  );
}

function PosAlertModal({ alerts, apiBase, onClose }) {
  const [items, setItems] = useState(alerts);
  const resolve = async (id) => {
    setItems(prev => prev.filter(a => a.id !== id));
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
      await fetch(`${apiBase}/api/audit/anomalies/${id}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ resolvedBy: localStorage.getItem("kasir_name") || "kasir" }),
      });
    } catch {}
  };
  const sevColor = (s) => ({ critical: "#ef4444", warning: "#fbbf24", high: "#fb923c", info: "#22d3ee" }[(s || "info").toLowerCase()] || "#9ca3af");
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(560px, 100%)", maxHeight: "80vh",
        background: "linear-gradient(180deg,#0d1117,#080a0f)",
        border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}>
        <div style={{
          padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(180deg,rgba(239,68,68,0.08),transparent)",
        }}>
          <div>
            <div style={{ fontSize: 10, color: "#ef4444", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>● OPERATIONAL INTELLIGENCE</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 4 }}>System Alerts ({items.length})</div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)",
            borderRadius: 8, padding: "6px 12px", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
          }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {items.length === 0 ? (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "#5b6470", fontSize: 14 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, color: "#10b981", marginBottom: 4 }}>Semua sistem normal</div>
              <div style={{ fontSize: 12 }}>Tidak ada anomali yg perlu attention</div>
            </div>
          ) : items.map(a => {
            const sev = a.severity || a.sev || "info";
            const color = sevColor(sev);
            return (
              <div key={a.id} style={{
                padding: "12px 14px", marginBottom: 8, borderRadius: 10,
                background: `${color}0d`, border: `1px solid ${color}44`,
                display: "flex", alignItems: "flex-start", gap: 12,
              }}>
                <span style={{
                  flexShrink: 0, padding: "3px 8px", borderRadius: 4,
                  fontSize: 9, fontWeight: 900, color, background: `${color}22`,
                  fontFamily: "'Geist Mono',monospace", letterSpacing: 0.8, textTransform: "uppercase",
                }}>{sev}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{a.type || a.event_type || "Anomaly"}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.65)", marginTop: 3, lineHeight: 1.45 }}>
                    {a.description || a.message || a.details || JSON.stringify(a.payload || {}).slice(0, 100)}
                  </div>
                  {(a.amount || a.amt) && <div style={{ fontSize: 11, color, fontFamily: "'Geist Mono',monospace", marginTop: 4, fontWeight: 700 }}>Rp {(a.amount || a.amt).toLocaleString("id-ID")}</div>}
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, fontFamily: "'Geist Mono',monospace" }}>
                    {a.created_at ? new Date(a.created_at).toLocaleString("id-ID", { hour12: false }) : ""}
                  </div>
                </div>
                <button onClick={() => resolve(a.id)} style={{
                  flexShrink: 0, padding: "5px 12px", borderRadius: 6,
                  background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)",
                  color: "#10b981", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>✓ Resolve</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
