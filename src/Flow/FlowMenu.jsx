import React, { useState, useEffect, useMemo } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3011";
const fIDR = n => "Rp " + (n || 0).toLocaleString("id-ID");

const CAT_LABELS = {
  all: "Semua",
  froyo: "🍦 Froyo",
  smoothies: "🥤 Smoothie",
  yogulato: "🍨 Gelato",
  takehome: "📦 Take Home",
  collab: "🎮 Collab",
};

export default function FlowMenu({ session, tableContext, cart, cartTotal, cartCount, onBack, onAddToCart, onUpdateQty, onRemove, onClear, onCheckout }) {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [query, setQuery] = useState("");
  const [detailItem, setDetailItem] = useState(null);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/menu`)
      .then(r => r.ok ? r.json() : Promise.reject("Menu load failed"))
      .then(data => setMenu(Array.isArray(data) ? data : (data.menu || data.data || [])))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = [...new Set(menu.map(m => m.cat))];
    return ["all", ...cats];
  }, [menu]);

  const filteredMenu = useMemo(() => {
    return menu.filter(m => {
      if (activeCat !== "all" && m.cat !== activeCat) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!m.name.toLowerCase().includes(q) && !m.desc?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [menu, activeCat, query]);

  return (
    <div style={S.container}>
      <header style={S.header}>
        <button onClick={onBack} style={S.backBtn}>← Back</button>
        <div style={S.headTitle}>Menu BINTORO</div>
        <button onClick={() => setShowCart(true)} style={S.cartIconBtn}>
          🛒{cartCount > 0 && <span style={S.cartBadge}>{cartCount}</span>}
        </button>
      </header>

      <div style={S.searchBox}>
        <input
          type="text"
          placeholder="🔍 Cari menu..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={S.searchInput}
        />
      </div>

      <div style={S.catTabs}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            style={{
              ...S.catTab,
              ...(activeCat === cat ? S.catTabActive : {}),
            }}
          >
            {CAT_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      {loading && <div style={S.loading}>Loading menu...</div>}
      {error && <div style={S.error}>⚠️ {error}</div>}

      {!loading && (
        <div style={S.itemGrid}>
          {filteredMenu.map(item => (
            <button
              key={item.id}
              onClick={() => item.avail && setDetailItem(item)}
              disabled={!item.avail}
              style={{ ...S.itemCard, ...(item.avail ? {} : S.itemUnavail) }}
            >
              {item.popular && <div style={S.popularBadge}>⭐ POPULAR</div>}
              {!item.avail && <div style={S.outBadge}>Habis</div>}
              <div style={S.itemEmoji}>{item.emoji}</div>
              <div style={S.itemName}>{item.name}</div>
              <div style={S.itemDesc}>{item.desc}</div>
              {item.freeToppings > 0 && (
                <div style={S.freeTopping}>+ {item.freeToppings} topping gratis</div>
              )}
              <div style={S.itemPrice}>{fIDR(item.price)}</div>
            </button>
          ))}
          {filteredMenu.length === 0 && !loading && (
            <div style={S.emptyState}>Tidak ada menu match search.</div>
          )}
        </div>
      )}

      {cartCount > 0 && (
        <button onClick={() => setShowCart(true)} style={S.cartBar}>
          <div style={S.cartBarLeft}>
            <span style={S.cartBarBadge}>{cartCount}</span>
            <span>Lihat Cart</span>
          </div>
          <span style={S.cartBarTotal}>{fIDR(cartTotal)} →</span>
        </button>
      )}

      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onAdd={(qty) => {
            onAddToCart(detailItem, qty);
            setDetailItem(null);
          }}
        />
      )}

      {showCart && (
        <CartModal
          cart={cart}
          cartTotal={cartTotal}
          onClose={() => setShowCart(false)}
          onUpdateQty={onUpdateQty}
          onRemove={onRemove}
          onClear={onClear}
          onCheckout={() => {
            setShowCart(false);
            onCheckout();
          }}
        />
      )}
    </div>
  );
}

function ItemDetailModal({ item, onClose, onAdd }) {
  const [qty, setQty] = useState(1);

  return (
    <div style={M.overlay} onClick={onClose}>
      <div style={M.modal} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={M.closeBtn}>✕</button>

        <div style={M.hero}>
          <div style={M.heroEmoji}>{item.emoji}</div>
        </div>

        <div style={M.body}>
          <div style={M.name}>{item.name}</div>
          <div style={M.desc}>{item.desc}</div>

          {item.freeToppings > 0 && (
            <div style={M.toppingHint}>
              🎁 Termasuk <strong>{item.freeToppings} topping gratis</strong> · pilih di kasir/staff
            </div>
          )}

          <div style={M.priceRow}>
            <span style={M.priceLabel}>Harga</span>
            <span style={M.priceValue}>{fIDR(item.price)}</span>
          </div>

          <div style={M.qtyRow}>
            <span style={M.qtyLabel}>Jumlah</span>
            <div style={M.qtyControls}>
              <button onClick={() => setQty(Math.max(1, qty - 1))} style={M.qtyBtn}>−</button>
              <span style={M.qtyValue}>{qty}</span>
              <button onClick={() => setQty(qty + 1)} style={M.qtyBtn}>+</button>
            </div>
          </div>

          <button onClick={() => onAdd(qty)} style={M.addBtn}>
            Tambah ke Cart · {fIDR(item.price * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}

function CartModal({ cart, cartTotal, onClose, onUpdateQty, onRemove, onClear, onCheckout }) {
  return (
    <div style={M.overlay} onClick={onClose}>
      <div style={M.cartModal} onClick={e => e.stopPropagation()}>
        <div style={M.cartHeader}>
          <div>
            <div style={M.cartTitle}>Keranjang</div>
            <div style={M.cartSub}>{cart.length} item</div>
          </div>
          <button onClick={onClose} style={M.closeBtn}>✕</button>
        </div>

        <div style={M.cartItems}>
          {cart.length === 0 && (
            <div style={M.emptyCart}>
              🛒
              <div style={{marginTop: 8}}>Keranjang masih kosong</div>
            </div>
          )}

          {cart.map((item, idx) => (
            <div key={idx} style={M.cartItem}>
              <div style={M.cartItemEmoji}>{item.emoji}</div>
              <div style={M.cartItemBody}>
                <div style={M.cartItemName}>{item.name}</div>
                <div style={M.cartItemPrice}>{fIDR(item.price)}</div>
              </div>
              <div style={M.cartItemQty}>
                <button onClick={() => onUpdateQty(idx, item.qty - 1)} style={M.qtyBtnSmall}>−</button>
                <span style={M.qtyValueSmall}>{item.qty}</span>
                <button onClick={() => onUpdateQty(idx, item.qty + 1)} style={M.qtyBtnSmall}>+</button>
              </div>
            </div>
          ))}
        </div>

        {cart.length > 0 && (
          <>
            <div style={M.cartFooterTotal}>
              <span>Total</span>
              <span style={M.cartFooterAmount}>{fIDR(cartTotal)}</span>
            </div>

            <div style={M.cartFooterBtns}>
              <button onClick={onClear} style={M.clearBtn}>Kosongin</button>
              <button onClick={onCheckout} style={M.checkoutBtn}>
                Checkout →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const S = {
  container: { width: "min(440px, 100%)", minHeight: "100vh", padding: "16px 14px 100px", display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 4 },
  backBtn: { padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a2a", color: "white", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  headTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#F59E0B", letterSpacing: 1 },
  cartIconBtn: { position: "relative", width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a2a", color: "white", fontSize: 18, cursor: "pointer", fontFamily: "inherit" },
  cartBadge: { position: "absolute", top: -4, right: -4, background: "#F59E0B", color: "#111", borderRadius: 10, padding: "2px 6px", fontSize: 10, fontWeight: 800, minWidth: 18 },
  searchBox: { padding: 0 },
  searchInput: { width: "100%", padding: "12px 14px", borderRadius: 12, background: "#0d0d0d", border: "1px solid #2a2a2a", color: "white", fontSize: 14, fontFamily: "inherit", outline: "none" },
  catTabs: { display: "flex", gap: 6, overflowX: "auto", padding: "4px 0", scrollbarWidth: "none" },
  catTab: { padding: "8px 14px", borderRadius: 20, background: "transparent", border: "1px solid #2a2a2a", color: "#9CA3AF", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  catTabActive: { background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)", color: "#F59E0B" },
  loading: { padding: 40, textAlign: "center", color: "#9CA3AF" },
  error: { padding: 12, borderRadius: 8, background: "rgba(248,113,113,0.10)", color: "#F87171", fontSize: 12 },
  itemGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  itemCard: { position: "relative", padding: "14px 12px", borderRadius: 14, background: "linear-gradient(180deg, #161616 0%, #0d0d0d 100%)", border: "1px solid #2a2a2a", color: "white", cursor: "pointer", fontFamily: "inherit", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, animation: "fadeUp 0.3s ease" },
  itemUnavail: { opacity: 0.4, cursor: "not-allowed" },
  itemEmoji: { fontSize: 38, marginBottom: 4 },
  itemName: { fontSize: 13, fontWeight: 700, lineHeight: 1.3 },
  itemDesc: { fontSize: 10, color: "#9CA3AF", lineHeight: 1.4, minHeight: 28 },
  freeTopping: { fontSize: 9, color: "#10B981", fontWeight: 600 },
  itemPrice: { marginTop: 4, fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "#F59E0B", letterSpacing: 1 },
  popularBadge: { position: "absolute", top: 8, left: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(245,158,11,0.15)", color: "#F59E0B", fontSize: 8, fontWeight: 800, letterSpacing: 0.5 },
  outBadge: { position: "absolute", top: 8, right: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(248,113,113,0.15)", color: "#F87171", fontSize: 8, fontWeight: 800 },
  emptyState: { gridColumn: "span 2", padding: 30, textAlign: "center", color: "#6B7280", fontSize: 13 },
  cartBar: {
    position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
    width: "min(420px, calc(100% - 32px))", padding: "14px 18px", borderRadius: 14,
    background: "linear-gradient(135deg, #F59E0B, #D97706)", border: "none", color: "#111",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
    boxShadow: "0 12px 28px rgba(245,158,11,0.3)", zIndex: 100,
  },
  cartBarLeft: { display: "flex", alignItems: "center", gap: 10 },
  cartBarBadge: { background: "#111", color: "#F59E0B", width: 24, height: 24, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 },
  cartBarTotal: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1 },
};

const M = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200, padding: 0 },
  modal: { width: "min(440px, 100%)", maxHeight: "85vh", background: "linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)", borderRadius: "20px 20px 0 0", border: "1px solid #2a2a2a", overflow: "hidden", display: "flex", flexDirection: "column", animation: "slideUp 0.3s ease" },
  closeBtn: { position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: 10, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", color: "white", fontSize: 16, cursor: "pointer", zIndex: 1 },
  hero: { padding: "32px 20px", background: "linear-gradient(180deg, rgba(245,158,11,0.10), transparent)", display: "flex", justifyContent: "center", alignItems: "center" },
  heroEmoji: { fontSize: 80 },
  body: { padding: "20px 24px 28px", display: "flex", flexDirection: "column", gap: 14 },
  name: { fontSize: 20, fontWeight: 800 },
  desc: { fontSize: 13, color: "#9CA3AF", lineHeight: 1.5 },
  toppingHint: { padding: "10px 12px", borderRadius: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#10B981", fontSize: 11, lineHeight: 1.5 },
  priceRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "1px solid #2a2a2a" },
  priceLabel: { fontSize: 12, color: "#9CA3AF" },
  priceValue: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#F59E0B", letterSpacing: 1 },
  qtyRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  qtyLabel: { fontSize: 12, color: "#9CA3AF" },
  qtyControls: { display: "flex", alignItems: "center", gap: 12 },
  qtyBtn: { width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a2a", color: "white", fontSize: 18, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  qtyValue: { fontSize: 18, fontWeight: 700, minWidth: 24, textAlign: "center" },
  addBtn: { marginTop: 8, width: "100%", padding: "14px", borderRadius: 12, background: "linear-gradient(135deg, #F59E0B, #D97706)", border: "none", color: "#111", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },

  cartModal: { width: "min(440px, 100%)", maxHeight: "85vh", background: "linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)", borderRadius: "20px 20px 0 0", border: "1px solid #2a2a2a", overflow: "hidden", display: "flex", flexDirection: "column", animation: "slideUp 0.3s ease" },
  cartHeader: { padding: "18px 20px", borderBottom: "1px solid #2a2a2a", display: "flex", justifyContent: "space-between", alignItems: "center" },
  cartTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: "#F59E0B", letterSpacing: 1 },
  cartSub: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  cartItems: { flex: 1, overflowY: "auto", padding: "8px 16px" },
  emptyCart: { padding: 60, textAlign: "center", color: "#6B7280", fontSize: 32 },
  cartItem: { display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid #1a1a1a" },
  cartItemEmoji: { fontSize: 28, width: 44 },
  cartItemBody: { flex: 1 },
  cartItemName: { fontSize: 13, fontWeight: 700 },
  cartItemPrice: { fontSize: 12, color: "#F59E0B", marginTop: 2, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 },
  cartItemQty: { display: "flex", alignItems: "center", gap: 6 },
  qtyBtnSmall: { width: 26, height: 26, borderRadius: 6, background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a2a", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  qtyValueSmall: { fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: "center" },
  cartFooterTotal: { padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #2a2a2a" },
  cartFooterAmount: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: "#F59E0B", letterSpacing: 1 },
  cartFooterBtns: { padding: "0 20px 20px", display: "flex", gap: 10 },
  clearBtn: { padding: "12px 16px", borderRadius: 10, background: "transparent", border: "1px solid #2a2a2a", color: "#F87171", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  checkoutBtn: { flex: 1, padding: "12px", borderRadius: 10, background: "linear-gradient(135deg, #10B981, #059669)", border: "none", color: "white", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
};
