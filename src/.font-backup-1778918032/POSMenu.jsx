import { useState, useEffect, useMemo } from "react";
import ToppingPicker from "./ToppingPicker.jsx";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";

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
    onCheckout({ action, cart, subtotal });
  };

  return (
    <div style={S.root}>
      <header style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>← Back</button>
        <div style={S.summary}>
          <span>{order.type === "dine-in" ? "🍽️ Dine-in" : "🛍️ Take-away"}</span>
          {order.table && <><span style={S.dot}>·</span><span>{order.table.name}</span></>}
          {order.customerName && <><span style={S.dot}>·</span><span>{order.customerName}</span></>}
        </div>
        <div style={S.kasir}>👤 {cashier.name}</div>
        <button onClick={onCancel} style={S.iconBtn}>✕</button>
      </header>

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
              <button key={c} onClick={() => setActiveCat(c)}
                style={{...S.catBtn, ...(activeCat === c ? S.catActive : {})}}>
                {c}
              </button>
            ))}
          </div>

          {loading && <div style={S.loading}>Memuat menu...</div>}

          <div style={S.grid}>
            {filtered.map(item => (
              <button key={item.id} onClick={() => handleItemClick(item)} style={S.itemCard}>
                {item.image ? (
                  <img src={item.image} alt="" style={S.itemImg} onError={e => e.target.style.display = "none"}/>
                ) : (
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
                    <div key={ci.cartKey} style={S.cartItem}>
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
  root: { minHeight:"100vh", background:"#111", color:"#fff", fontFamily:"'DM Sans',sans-serif",
    display:"flex", flexDirection:"column" },
  header: { display:"flex", alignItems:"center", gap:12,
    padding:"12px 20px", borderBottom:"1px solid #222", background:"#0a0a0a",
    position:"sticky", top:0, zIndex:10 },
  iconBtn: { background:"transparent", border:"1px solid #333", color:"#aaa",
    padding:"8px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" },
  summary: { flex:1, fontSize:14, color:"#F59E0B", fontWeight:600, display:"flex", gap:6, alignItems:"center" },
  dot: { color:"#444" },
  kasir: { fontSize:13, color:"#888" },
  body: { flex:1, display:"flex", overflow:"hidden" },
  menuSide: { flex:1, padding:"16px 20px", overflowY:"auto", maxHeight:"calc(100vh - 60px)" },
  toolbar: { marginBottom:12 },
  search: { width:"100%", padding:"12px 16px", borderRadius:10,
    background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#fff",
    fontFamily:"inherit", fontSize:14, boxSizing:"border-box" },
  cats: { display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" },
  catBtn: { background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#aaa",
    padding:"8px 14px", borderRadius:100, fontSize:13, cursor:"pointer",
    fontFamily:"inherit", whiteSpace:"nowrap" },
  catActive: { background:"#F59E0B", color:"#111", borderColor:"#F59E0B", fontWeight:700 },
  loading: { textAlign:"center", color:"#666", padding:40 },
  grid: { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:12 },
  itemCard: { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:14,
    padding:12, color:"#fff", fontFamily:"inherit", cursor:"pointer",
    transition:"all 0.15s", textAlign:"left",
    display:"flex", flexDirection:"column", gap:8, position:"relative" },
  itemImg: { width:"100%", height:100, objectFit:"cover", borderRadius:8, background:"#222" },
  itemImgPlaceholder: { width:"100%", height:100, borderRadius:8, background:"#222",
    display:"flex", alignItems:"center", justifyContent:"center", fontSize:56 },
  itemName: { fontSize:13, fontWeight:600, lineHeight:1.3 },
  itemPrice: { fontSize:13, color:"#F59E0B", fontWeight:700 },
  toppingTag: { fontSize:10, color:"#10B981", fontWeight:600, letterSpacing:0.5,
    background:"rgba(16,185,129,0.1)", padding:"2px 6px", borderRadius:4,
    alignSelf:"flex-start" },
  emptyState: { textAlign:"center", color:"#555", padding:40 },
  cartSide: { width:340, background:"#0a0a0a", borderLeft:"1px solid #222",
    display:"flex", flexDirection:"column", maxHeight:"calc(100vh - 60px)", position:"sticky", top:60 },
  cartHeader: { padding:"16px 20px", borderBottom:"1px solid #222",
    display:"flex", alignItems:"center", gap:8, fontSize:15, fontWeight:700 },
  cartBadge: { background:"#F59E0B", color:"#111", padding:"2px 10px", borderRadius:100,
    fontSize:11, fontWeight:700 },
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
    background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:8, padding:"2px" },
  qtyBtn: { background:"transparent", border:"none", color:"#fff", fontSize:16,
    width:24, height:24, cursor:"pointer", fontFamily:"inherit", borderRadius:6 },
  qty: { fontSize:13, fontWeight:700, minWidth:20, textAlign:"center" },
  itemSub: { fontSize:13, fontWeight:700, color:"#F59E0B" },
  cartTotal: { padding:"16px 20px", borderTop:"1px solid #222", background:"#111" },
  totalRow: { display:"flex", justifyContent:"space-between", alignItems:"center",
    fontSize:15, fontWeight:600 },
  totalAmount: { fontSize:20, fontWeight:800, color:"#F59E0B", fontFamily:"'Bebas Neue',cursive", letterSpacing:1 },
  taxNote: { fontSize:10, color:"#555", marginTop:2 },
  actions: { padding:"12px 16px 20px", display:"flex", flexDirection:"column", gap:8 },
  payBtn: { background:"#F59E0B", color:"#111", border:"none", borderRadius:12,
    padding:"14px", fontFamily:"inherit", fontSize:14, fontWeight:800,
    letterSpacing:1, cursor:"pointer" },
  tabBtn: { background:"transparent", color:"#aaa", border:"1px solid #444", borderRadius:12,
    padding:"12px", fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer" }
};
