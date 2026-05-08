import { useState, useEffect } from "react";

const formatIDR = (amount) => "Rp " + Math.round(amount).toLocaleString("id-ID");

// ─── ADD-ONS per category ─────────────────────────────────────────────────────
const addonsByCategory = {
  "🍔 Burgers": [
    { id: "a1", group: "Tingkat Kepedasan", type: "single", options: [
      { id: "sp0", label: "Tidak Pedas", price: 0 },
      { id: "sp1", label: "Pedas Sedang 🌶️", price: 0 },
      { id: "sp2", label: "Pedas Banget 🔥", price: 0 },
    ]},
    { id: "a2", group: "Tambahan Topping", type: "multi", options: [
      { id: "tp1", label: "Ekstra Keju", price: 8000 },
      { id: "tp2", label: "Ekstra Bacon", price: 12000 },
      { id: "tp3", label: "Telur Mata Sapi", price: 8000 },
      { id: "tp4", label: "Alpukat", price: 10000 },
      { id: "tp5", label: "Jamur Tumis", price: 7000 },
    ]},
    { id: "a3", group: "Saus Pilihan", type: "multi", options: [
      { id: "sc1", label: "BBQ Sauce", price: 3000 },
      { id: "sc2", label: "Sriracha Mayo", price: 3000 },
      { id: "sc3", label: "Garlic Aioli", price: 3000 },
      { id: "sc4", label: "Thousand Island", price: 3000 },
    ]},
  ],
  "🍕 Pizza": [
    { id: "b1", group: "Ukuran Pizza", type: "single", options: [
      { id: "sz1", label: 'Personal (20cm)', price: 0 },
      { id: "sz2", label: 'Medium (30cm)', price: 25000 },
      { id: "sz3", label: 'Large (40cm)', price: 45000 },
    ]},
    { id: "b2", group: "Ekstra Topping", type: "multi", options: [
      { id: "pt1", label: "Mozzarella Ekstra", price: 12000 },
      { id: "pt2", label: "Pepperoni", price: 15000 },
      { id: "pt3", label: "Olive Hitam", price: 8000 },
      { id: "pt4", label: "Capsicum Merah", price: 7000 },
      { id: "pt5", label: "Truffle Oil", price: 18000 },
    ]},
    { id: "b3", group: "Pinggiran (Crust)", type: "single", options: [
      { id: "cr1", label: "Tipis & Renyah", price: 0 },
      { id: "cr2", label: "Thick Crust", price: 5000 },
      { id: "cr3", label: "Cheese Stuffed Crust 🧀", price: 15000 },
    ]},
  ],
  "🥗 Salads": [
    { id: "c1", group: "Pilihan Protein", type: "single", options: [
      { id: "pr1", label: "Tanpa Protein", price: 0 },
      { id: "pr2", label: "Ayam Panggang", price: 15000 },
      { id: "pr3", label: "Udang Goreng", price: 20000 },
      { id: "pr4", label: "Tuna", price: 18000 },
    ]},
    { id: "c2", group: "Dressing Pilihan", type: "single", options: [
      { id: "dr1", label: "Caesar", price: 0 },
      { id: "dr2", label: "Balsamic Vinaigrette", price: 0 },
      { id: "dr3", label: "Honey Mustard", price: 0 },
      { id: "dr4", label: "Tanpa Dressing", price: 0 },
    ]},
    { id: "c3", group: "Ekstra Topping", type: "multi", options: [
      { id: "st1", label: "Crouton Ekstra", price: 5000 },
      { id: "st2", label: "Keju Parmesan", price: 8000 },
      { id: "st3", label: "Kacang Panggang", price: 7000 },
      { id: "st4", label: "Alpukat Slice", price: 10000 },
    ]},
  ],
  "🍟 Sides": [
    { id: "d1", group: "Ukuran Porsi", type: "single", options: [
      { id: "ps1", label: "Regular", price: 0 },
      { id: "ps2", label: "Large (+50%)", price: 10000 },
    ]},
    { id: "d2", group: "Saus Celup", type: "multi", options: [
      { id: "dp1", label: "Ketchup", price: 2000 },
      { id: "dp2", label: "Mayo", price: 2000 },
      { id: "dp3", label: "Cheese Sauce", price: 5000 },
      { id: "dp4", label: "Chipotle", price: 3000 },
      { id: "dp5", label: "Sweet Chili", price: 2000 },
    ]},
    { id: "d3", group: "Ekstra", type: "multi", options: [
      { id: "ex1", label: "Ekstra Parmesan", price: 5000 },
      { id: "ex2", label: "Truffle Oil", price: 8000 },
      { id: "ex3", label: "Chili Flakes", price: 2000 },
    ]},
  ],
  "🥤 Drinks": [
    { id: "e1", group: "Ukuran", type: "single", options: [
      { id: "dk1", label: "Regular (350ml)", price: 0 },
      { id: "dk2", label: "Large (500ml)", price: 8000 },
    ]},
    { id: "e2", group: "Level Es", type: "single", options: [
      { id: "ic1", label: "Tanpa Es", price: 0 },
      { id: "ic2", label: "Es Sedikit", price: 0 },
      { id: "ic3", label: "Es Normal", price: 0 },
      { id: "ic4", label: "Es Penuh", price: 0 },
    ]},
    { id: "e3", group: "Tambahan", type: "multi", options: [
      { id: "da1", label: "Whipped Cream", price: 5000 },
      { id: "da2", label: "Boba Pearl", price: 7000 },
      { id: "da3", label: "Jelly Cincau", price: 5000 },
      { id: "da4", label: "Oat Milk (ganti)", price: 5000 },
    ]},
  ],
  "🍰 Desserts": [
    { id: "f1", group: "Pilihan Topping", type: "multi", options: [
      { id: "dt1", label: "Ice Cream Scoop 🍨", price: 12000 },
      { id: "dt2", label: "Whipped Cream", price: 5000 },
      { id: "dt3", label: "Berry Compote", price: 8000 },
      { id: "dt4", label: "Caramel Drizzle", price: 5000 },
      { id: "dt5", label: "Chocolate Sauce", price: 5000 },
    ]},
    { id: "f2", group: "Temperatur Sajian", type: "single", options: [
      { id: "tm1", label: "Hangat", price: 0 },
      { id: "tm2", label: "Dingin", price: 0 },
    ]},
  ],
};

const menuData = {
  categories: ["All", "🍔 Burgers", "🍕 Pizza", "🥗 Salads", "🍟 Sides", "🥤 Drinks", "🍰 Desserts"],
  items: [
    { id: 1,  name: "Classic Smash Burger",    category: "🍔 Burgers",   price: 55000, desc: "Double smash patty, American cheese, pickles, special sauce",       cal: 680, tag: "BESTSELLER",  emoji: "🍔" },
    { id: 2,  name: "BBQ Bacon Beast",          category: "🍔 Burgers",   price: 75000, desc: "Triple patty, crispy bacon, BBQ sauce, caramelized onions",          cal: 920, tag: "NEW",         emoji: "🥩" },
    { id: 3,  name: "Mushroom Swiss",           category: "🍔 Burgers",   price: 62000, desc: "Sautéed mushrooms, Swiss cheese, garlic aioli, brioche bun",         cal: 610, tag: null,          emoji: "🍄" },
    { id: 4,  name: "Spicy Crispy Chicken",     category: "🍔 Burgers",   price: 65000, desc: "Fried chicken thigh, sriracha slaw, pickled jalapeños",              cal: 740, tag: "HOT 🔥",      emoji: "🌶️" },
    { id: 5,  name: "Margherita",               category: "🍕 Pizza",     price: 78000, desc: "San Marzano tomato, fresh mozzarella, basil, EVOO",                  cal: 820, tag: null,          emoji: "🍕" },
    { id: 6,  name: "Truffle Funghi",           category: "🍕 Pizza",     price: 98000, desc: "Truffle cream, wild mushrooms, fontina, fresh thyme",                cal: 910, tag: "CHEF'S PICK", emoji: "🫧" },
    { id: 7,  name: "Diavola",                  category: "🍕 Pizza",     price: 88000, desc: "Spicy salami, roasted peppers, chilli oil, mozzarella",              cal: 870, tag: "HOT 🔥",      emoji: "🔥" },
    { id: 8,  name: "Caesar Royale",            category: "🥗 Salads",    price: 52000, desc: "Romaine, parmesan crisp, sourdough croutons, anchovy dressing",      cal: 340, tag: null,          emoji: "🥬" },
    { id: 9,  name: "Watermelon Feta",          category: "🥗 Salads",    price: 55000, desc: "Watermelon, feta, cucumber, mint, balsamic glaze",                   cal: 280, tag: "FRESH",       emoji: "🍉" },
    { id: 10, name: "Truffle Fries",            category: "🍟 Sides",     price: 38000, desc: "Crispy shoestring fries, truffle oil, parmesan, herbs",              cal: 420, tag: "BESTSELLER",  emoji: "🍟" },
    { id: 11, name: "Onion Rings",              category: "🍟 Sides",     price: 28000, desc: "Beer-battered rings, chipotle dipping sauce",                        cal: 380, tag: null,          emoji: "🧅" },
    { id: 12, name: "Mac & Cheese Bites",       category: "🍟 Sides",     price: 35000, desc: "Crispy fried mac bites, sriracha ranch",                             cal: 460, tag: "NEW",         emoji: "🧀" },
    { id: 13, name: "Craft Lemonade",           category: "🥤 Drinks",    price: 22000, desc: "Freshly squeezed, mint, honey, sparkling water",                     cal: 120, tag: null,          emoji: "🍋" },
    { id: 14, name: "Salted Caramel Shake",     category: "🥤 Drinks",    price: 32000, desc: "Thick shake, sea salt caramel, whipped cream",                       cal: 580, tag: "BESTSELLER",  emoji: "🥛" },
    { id: 15, name: "Matcha Cooler",            category: "🥤 Drinks",    price: 25000, desc: "Ceremonial matcha, oat milk, light ice",                             cal: 140, tag: "HEALTHY",     emoji: "🍵" },
    { id: 16, name: "Burnt Basque Cheesecake",  category: "🍰 Desserts",  price: 42000, desc: "Creamy Basque-style, caramelized crust, berry compote",              cal: 520, tag: "CHEF'S PICK", emoji: "🍮" },
    { id: 17, name: "Choco Lava Cake",          category: "🍰 Desserts",  price: 45000, desc: "Warm dark chocolate, vanilla bean ice cream",                        cal: 610, tag: "NEW",         emoji: "🍫" },
  ],
};

const TAX_RATE = 0.11;

const tagColors = {
  "BESTSELLER":  { bg: "#FF6B35", text: "#fff" },
  "NEW":         { bg: "#00C896", text: "#fff" },
  "HOT 🔥":     { bg: "#FF3B30", text: "#fff" },
  "CHEF'S PICK": { bg: "#FFB800", text: "#1a1a1a" },
  "FRESH":       { bg: "#4CD964", text: "#fff" },
  "HEALTHY":     { bg: "#5AC8FA", text: "#fff" },
};

// ─── ADDON MODAL ──────────────────────────────────────────────────────────────
function AddonModal({ item, onClose, onConfirm }) {
  const groups = addonsByCategory[item.category] || [];
  const [selected, setSelected] = useState(() => {
    const init = {};
    groups.forEach(g => {
      if (g.type === "single") init[g.id] = g.options[0].id;
      else init[g.id] = [];
    });
    return init;
  });
  const [note, setNote] = useState("");

  const toggleMulti = (groupId, optId) => {
    setSelected(s => {
      const arr = s[groupId];
      return { ...s, [groupId]: arr.includes(optId) ? arr.filter(x => x !== optId) : [...arr, optId] };
    });
  };

  const addonTotal = groups.reduce((sum, g) => {
    if (g.type === "single") {
      const opt = g.options.find(o => o.id === selected[g.id]);
      return sum + (opt?.price || 0);
    } else {
      return sum + (selected[g.id] || []).reduce((s2, id) => {
        const opt = g.options.find(o => o.id === id);
        return s2 + (opt?.price || 0);
      }, 0);
    }
  }, 0);

  const totalPrice = item.price + addonTotal;

  return (
    <div style={M.overlay} onClick={onClose}>
      <div style={M.modal} onClick={e => e.stopPropagation()}>
        <div style={M.modalHeader}>
          <div style={M.modalEmoji}>{item.emoji}</div>
          <div style={M.modalTitleArea}>
            <div style={M.modalName}>{item.name}</div>
            <div style={M.modalBasePrice}>Harga dasar: {formatIDR(item.price)}</div>
          </div>
          <button style={M.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={M.modalBody}>
          {groups.map(group => (
            <div key={group.id} style={M.groupBlock}>
              <div style={M.groupLabel}>
                {group.group}
                <span style={M.groupType}>{group.type === "single" ? "Pilih 1" : "Pilih beberapa"}</span>
              </div>
              <div style={M.optionList}>
                {group.options.map(opt => {
                  const isSelected = group.type === "single"
                    ? selected[group.id] === opt.id
                    : (selected[group.id] || []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      style={{ ...M.optBtn, ...(isSelected ? M.optBtnActive : {}) }}
                      onClick={() => {
                        if (group.type === "single") setSelected(s => ({ ...s, [group.id]: opt.id }));
                        else toggleMulti(group.id, opt.id);
                      }}
                    >
                      <span style={M.optLabel}>{opt.label}</span>
                      {opt.price > 0
                        ? <span style={M.optPrice}>+{formatIDR(opt.price)}</span>
                        : <span style={{ ...M.optPrice, color: "#555" }}>Gratis</span>
                      }
                      {isSelected && <span style={M.checkMark}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={M.groupBlock}>
            <div style={M.groupLabel}>Catatan Khusus <span style={M.groupType}>Opsional</span></div>
            <textarea
              style={M.noteInput}
              placeholder="Contoh: Tidak pakai bawang, saus terpisah..."
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <div style={M.modalFooter}>
          {addonTotal > 0 && (
            <div style={M.addonSummary}>Tambahan: +{formatIDR(addonTotal)}</div>
          )}
          <button style={M.confirmBtn} onClick={() => onConfirm(item, selected, note, addonTotal)}>
            TAMBAH KE KERANJANG • {formatIDR(totalPrice)}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slideUp { from{transform:translateY(60px);opacity:0} to{transform:translateY(0);opacity:1} }
        textarea { resize: none; outline: none; }
        textarea::placeholder { color: #555; }
      `}</style>
    </div>
  );
}

const M = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  modal: { background: "#1a1a1a", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 600, maxHeight: "88vh", display: "flex", flexDirection: "column", animation: "slideUp 0.3s ease", border: "1px solid #2a2a2a", borderBottom: "none" },
  modalHeader: { display: "flex", alignItems: "center", gap: 14, padding: "20px 20px 14px", borderBottom: "1px solid #222" },
  modalEmoji: { fontSize: 44, lineHeight: 1 },
  modalTitleArea: { flex: 1 },
  modalName: { fontSize: 18, fontWeight: 700, lineHeight: 1.2 },
  modalBasePrice: { fontSize: 12, color: "#888", marginTop: 3 },
  closeBtn: { background: "#2a2a2a", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#aaa", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" },
  modalBody: { overflowY: "auto", padding: "16px 20px", flex: 1 },
  groupBlock: { marginBottom: 22 },
  groupLabel: { fontSize: 13, fontWeight: 700, letterSpacing: 1, color: "#ccc", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", textTransform: "uppercase" },
  groupType: { fontSize: 10, color: "#555", fontWeight: 400, letterSpacing: 0.5, textTransform: "none" },
  optionList: { display: "flex", flexDirection: "column", gap: 8 },
  optBtn: { display: "flex", alignItems: "center", gap: 10, background: "#222", border: "1px solid #2e2e2e", borderRadius: 12, padding: "10px 14px", cursor: "pointer", color: "#bbb", textAlign: "left", transition: "all 0.15s", position: "relative" },
  optBtnActive: { background: "#2a1a0d", border: "1px solid #FF6B35", color: "#fff" },
  optLabel: { flex: 1, fontSize: 14 },
  optPrice: { fontSize: 12, color: "#FF6B35", fontWeight: 600 },
  checkMark: { position: "absolute", right: 14, fontSize: 14, color: "#FF6B35", fontWeight: 700 },
  noteInput: { width: "100%", background: "#222", border: "1px solid #2e2e2e", borderRadius: 12, padding: "10px 14px", color: "#ccc", fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing: "border-box" },
  modalFooter: { padding: "14px 20px 24px", borderTop: "1px solid #222", background: "#161616" },
  addonSummary: { fontSize: 12, color: "#888", marginBottom: 8, textAlign: "center" },
  confirmBtn: { width: "100%", background: "linear-gradient(90deg,#FF6B35,#FF3B30)", border: "none", borderRadius: 14, padding: "16px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 1, fontFamily: "'Bebas Neue',cursive" },
};

// ─── MAIN KIOSK ───────────────────────────────────────────────────────────────
export default function Kiosk() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [cart, setCart] = useState([]); // array of {item, addons, note, addonTotal}
  const [screen, setScreen] = useState("menu");
  const [orderType, setOrderType] = useState(null);
  const [time, setTime] = useState(new Date());
  const [addonTarget, setAddonTarget] = useState(null); // item being customized

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const filteredItems = activeCategory === "All"
    ? menuData.items
    : menuData.items.filter(i => i.category === activeCategory);

  const cartCount = cart.reduce((a, e) => a + e.qty, 0);
  const cartSubtotal = cart.reduce((s, e) => s + (e.item.price + e.addonTotal) * e.qty, 0);
  const cartTax = Math.round(cartSubtotal * TAX_RATE);
  const cartTotal = cartSubtotal + cartTax;

  const handleConfirmAddon = (item, addons, note, addonTotal) => {
    setCart(c => {
      // Add as new entry (different addons = different entry)
      return [...c, { item, addons, note, addonTotal, qty: 1, uid: Date.now() }];
    });
    setAddonTarget(null);
  };

  const changeQty = (uid, delta) => {
    setCart(c => {
      return c.map(e => e.uid === uid ? { ...e, qty: e.qty + delta } : e).filter(e => e.qty > 0);
    });
  };

  // Build addon label for cart display
  const getAddonLabels = (addons, category) => {
    const groups = addonsByCategory[category] || [];
    const labels = [];
    groups.forEach(g => {
      if (g.type === "single") {
        const opt = g.options.find(o => o.id === addons[g.id]);
        if (opt && opt.price === 0 && g.options[0].id === addons[g.id]) return; // skip default
        if (opt) labels.push(opt.label);
      } else {
        (addons[g.id] || []).forEach(id => {
          const opt = g.options.find(o => o.id === id);
          if (opt) labels.push(opt.label);
        });
      }
    });
    return labels;
  };

  const S = styles;

  if (!orderType) {
    return (
      <div style={S.welcome}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');`}</style>
        <div style={S.welcomeInner}>
          <div style={S.logoArea}>
            <div style={S.logoCircle}>🍽️</div>
            <h1 style={S.brandName}>BITES & CO.</h1>
            <p style={S.tagline}>Crafted with love. Ordered with ease.</p>
          </div>
          <p style={S.timeDisplay}>{time.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>
          <p style={S.welcomeTitle}>BAGAIMANA ANDA INGIN MEMESAN?</p>
          <div style={S.orderTypeRow}>
            <button style={S.orderTypeBtn} onClick={() => setOrderType("dine")}>
              <span style={S.orderTypeIcon}>🪑</span>
              <span style={S.orderTypeName}>Makan di Sini</span>
              <span style={S.orderTypeDesc}>Nikmati di meja Anda</span>
            </button>
            <button style={{ ...S.orderTypeBtn, background: "linear-gradient(135deg,#FF6B35,#FF3B30)" }} onClick={() => setOrderType("takeaway")}>
              <span style={S.orderTypeIcon}>🛍️</span>
              <span style={S.orderTypeName}>Bawa Pulang</span>
              <span style={S.orderTypeDesc}>Dibawa pergi</span>
            </button>
          </div>
          <p style={S.tapPrompt}>KETUK UNTUK MULAI</p>
        </div>
      </div>
    );
  }

  if (screen === "success") {
    return (
      <div style={S.successScreen}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');`}</style>
        <div style={S.successInner}>
          <div style={S.successIcon}>✅</div>
          <h2 style={S.successTitle}>PESANAN MASUK!</h2>
          <p style={S.successSub}>Pesanan #{Math.floor(Math.random() * 900 + 100)} sedang diproses</p>
          <div style={S.successBadge}>{orderType === "dine" ? "🪑 Makan di Sini" : "🛍️ Bawa Pulang"}</div>
          <p style={S.successEta}>Estimasi waktu: <strong>12–18 menit</strong></p>
          <button style={S.successBtn} onClick={() => { setCart([]); setScreen("menu"); setOrderType(null); }}>
            PESANAN BARU
          </button>
        </div>
      </div>
    );
  }

  if (screen === "cart") {
    return (
      <div style={S.root}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap'); *{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#FF6B35;border-radius:2px}`}</style>
        <div style={S.cartHeader}>
          <button style={S.backBtn} onClick={() => setScreen("menu")}>← KEMBALI</button>
          <h2 style={S.cartTitle}>PESANAN ANDA</h2>
          <div style={S.orderTypePill}>{orderType === "dine" ? "🪑 Di Sini" : "🛍️ Bawa Pulang"}</div>
        </div>
        <div style={S.cartBody}>
          {cart.length === 0 && <p style={S.emptyCart}>Keranjang Anda kosong</p>}
          {cart.map(entry => {
            const addonLabels = getAddonLabels(entry.addons, entry.item.category);
            return (
              <div key={entry.uid} style={S.cartRow}>
                <div style={S.cartEmoji}>{entry.item.emoji}</div>
                <div style={S.cartInfo}>
                  <div style={S.cartItemName}>{entry.item.name}</div>
                  {addonLabels.length > 0 && (
                    <div style={S.cartAddons}>{addonLabels.join(" · ")}</div>
                  )}
                  {entry.note ? <div style={S.cartNote}>📝 {entry.note}</div> : null}
                  <div style={S.cartItemPrice}>{formatIDR((entry.item.price + entry.addonTotal) * entry.qty)}</div>
                </div>
                <div style={S.qtyControls}>
                  <button style={S.qtyBtn} onClick={() => changeQty(entry.uid, -1)}>−</button>
                  <span style={S.qtyNum}>{entry.qty}</span>
                  <button style={S.qtyBtn} onClick={() => changeQty(entry.uid, 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={S.cartFooter}>
          <div style={S.summaryRow}><span>Subtotal</span><span>{formatIDR(cartSubtotal)}</span></div>
          <div style={S.summaryRow}><span>PPN 11%</span><span>{formatIDR(cartTax)}</span></div>
          <div style={{ ...S.summaryRow, ...S.totalRow }}><span>TOTAL</span><span>{formatIDR(cartTotal)}</span></div>
          <button
            style={{ ...S.placeOrderBtn, opacity: cart.length === 0 ? 0.4 : 1 }}
            disabled={cart.length === 0}
            onClick={() => setScreen("success")}
          >
            PESAN SEKARANG • {formatIDR(cartTotal)}
          </button>
        </div>
      </div>
    );
  }

  // ── MENU SCREEN ──
  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#1a1a1a}
        ::-webkit-scrollbar-thumb{background:#FF6B35;border-radius:2px}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .mi{animation:fadeIn 0.3s ease forwards}
        .ab:active{transform:scale(0.93)}
      `}</style>

      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.headerLogo}>🍽️</span>
          <div>
            <div style={S.headerBrand}>BITES & CO.</div>
            <div style={S.headerSub}>{orderType === "dine" ? "🪑 Makan di Sini" : "🛍️ Bawa Pulang"}</div>
          </div>
        </div>
        <div style={S.headerRight}>
          <div style={S.headerTime}>{time.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
          <button style={S.cartBtn} onClick={() => setScreen("cart")}>
            🛒 {cartCount > 0 && <span style={S.cartBadge}>{cartCount}</span>}
            <span style={S.cartAmount}>{formatIDR(cartSubtotal)}</span>
          </button>
        </div>
      </div>

      <div style={S.catBar}>
        {menuData.categories.map(cat => (
          <button key={cat} style={{ ...S.catBtn, ...(activeCategory === cat ? S.catBtnActive : {}) }} onClick={() => setActiveCategory(cat)}>
            {cat}
          </button>
        ))}
      </div>

      <div style={S.menuGrid}>
        {filteredItems.map((item, i) => {
          const inCart = cart.filter(e => e.item.id === item.id).reduce((a, e) => a + e.qty, 0);
          return (
            <div key={item.id} className="mi" style={{ ...S.card, animationDelay: `${i * 0.04}s` }}>
              {item.tag && (
                <div style={{ ...S.tag, background: tagColors[item.tag]?.bg || "#FF6B35", color: tagColors[item.tag]?.text || "#fff" }}>
                  {item.tag}
                </div>
              )}
              <div style={S.cardEmoji}>{item.emoji}</div>
              <div style={S.cardContent}>
                <div style={S.cardName}>{item.name}</div>
                <div style={S.cardDesc}>{item.desc}</div>
                <div style={S.cardMeta}>
                  <span style={S.cardCal}>{item.cal} kal</span>
                  <span style={S.addonBadge}>✦ Ada pilihan tambahan</span>
                </div>
              </div>
              <div style={S.cardFooter}>
                <span style={S.cardPrice}>{formatIDR(item.price)}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {inCart > 0 && <span style={S.cartCountBubble}>{inCart}</span>}
                  <button className="ab" style={S.addBtn} onClick={() => setAddonTarget(item)}>
                    + TAMBAH
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {cartCount > 0 && (
        <div style={S.stickyCart}>
          <button style={S.stickyCartBtn} onClick={() => setScreen("cart")}>
            <span style={S.stickyCartLeft}>🛒 {cartCount} item</span>
            <span>LIHAT PESANAN →</span>
            <span style={S.stickyCartRight}>{formatIDR(cartSubtotal)}</span>
          </button>
        </div>
      )}

      {addonTarget && (
        <AddonModal
          item={addonTarget}
          onClose={() => setAddonTarget(null)}
          onConfirm={handleConfirmAddon}
        />
      )}
    </div>
  );
}

const styles = {
  root: { fontFamily: "'DM Sans',sans-serif", background: "#111", color: "#fff", minHeight: "100vh", display: "flex", flexDirection: "column", overflowX: "hidden" },
  welcome: { fontFamily: "'DM Sans',sans-serif", background: "linear-gradient(160deg,#0f0f0f 0%,#1a0a00 50%,#0f0f0f 100%)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" },
  welcomeInner: { textAlign: "center", padding: "40px 20px", maxWidth: 600, width: "100%" },
  logoArea: { marginBottom: 30 },
  logoCircle: { fontSize: 64, marginBottom: 12 },
  brandName: { fontFamily: "'Bebas Neue',cursive", fontSize: 64, letterSpacing: 8, color: "#FF6B35", lineHeight: 1 },
  tagline: { fontSize: 16, color: "#888", marginTop: 8, letterSpacing: 2 },
  timeDisplay: { fontSize: 14, color: "#555", marginBottom: 40, letterSpacing: 3 },
  welcomeTitle: { fontSize: 13, letterSpacing: 4, color: "#666", marginBottom: 24 },
  orderTypeRow: { display: "flex", gap: 16, justifyContent: "center", marginBottom: 40 },
  orderTypeBtn: { background: "linear-gradient(135deg,#1e1e1e,#2a2a2a)", border: "1px solid #333", borderRadius: 20, padding: "28px 36px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1, maxWidth: 200, color: "#fff" },
  orderTypeIcon: { fontSize: 40 },
  orderTypeName: { fontFamily: "'Bebas Neue',cursive", fontSize: 22, letterSpacing: 2, color: "#fff" },
  orderTypeDesc: { fontSize: 12, color: "#999" },
  tapPrompt: { fontSize: 11, letterSpacing: 4, color: "#333" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "#0d0d0d", borderBottom: "1px solid #222", position: "sticky", top: 0, zIndex: 100 },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerLogo: { fontSize: 28 },
  headerBrand: { fontFamily: "'Bebas Neue',cursive", fontSize: 24, letterSpacing: 3, color: "#FF6B35" },
  headerSub: { fontSize: 11, color: "#666", letterSpacing: 1 },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  headerTime: { fontSize: 12, color: "#555", letterSpacing: 1 },
  cartBtn: { background: "#FF6B35", border: "none", borderRadius: 12, padding: "10px 14px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 },
  cartBadge: { background: "#fff", color: "#FF6B35", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 },
  cartAmount: { fontSize: 11, fontWeight: 600 },
  catBar: { display: "flex", gap: 8, padding: "12px 16px", overflowX: "auto", background: "#111", borderBottom: "1px solid #1e1e1e" },
  catBtn: { background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 30, padding: "8px 16px", color: "#999", cursor: "pointer", fontSize: 13, whiteSpace: "nowrap", fontFamily: "'DM Sans',sans-serif" },
  catBtnActive: { background: "#FF6B35", border: "1px solid #FF6B35", color: "#fff" },
  menuGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16, padding: "20px 16px 100px", flex: 1 },
  card: { background: "#1a1a1a", borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", border: "1px solid #222" },
  tag: { position: "absolute", top: 10, left: 10, fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "3px 8px", borderRadius: 20 },
  cardEmoji: { fontSize: 52, textAlign: "center", padding: "24px 16px 8px", background: "linear-gradient(180deg,#222 0%,#1a1a1a 100%)" },
  cardContent: { padding: "10px 14px", flex: 1 },
  cardName: { fontSize: 15, fontWeight: 600, lineHeight: 1.2, marginBottom: 6 },
  cardDesc: { fontSize: 11, color: "#666", lineHeight: 1.5, marginBottom: 8 },
  cardMeta: { display: "flex", gap: 6, flexWrap: "wrap" },
  cardCal: { fontSize: 10, color: "#555", background: "#222", padding: "2px 8px", borderRadius: 20 },
  addonBadge: { fontSize: 10, color: "#FF6B35", background: "#2a1a0d", padding: "2px 8px", borderRadius: 20, border: "1px solid #3a2515" },
  cardFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: "1px solid #222" },
  cardPrice: { fontSize: 14, fontWeight: 700, color: "#FF6B35", fontFamily: "'Bebas Neue',cursive", letterSpacing: 0.5 },
  addBtn: { background: "#FF6B35", border: "none", borderRadius: 20, padding: "8px 12px", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 1 },
  cartCountBubble: { background: "#FF6B35", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 },
  stickyCart: { position: "fixed", bottom: 0, left: 0, right: 0, padding: "30px 16px 12px", background: "linear-gradient(transparent,#111 30%)" },
  stickyCartBtn: { width: "100%", background: "linear-gradient(90deg,#FF6B35,#FF3B30)", border: "none", borderRadius: 16, padding: "16px 20px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between" },
  stickyCartLeft: { fontSize: 12 },
  stickyCartRight: { fontSize: 13, fontFamily: "'Bebas Neue',cursive", letterSpacing: 1 },
  cartHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "#0d0d0d", borderBottom: "1px solid #222", position: "sticky", top: 0 },
  backBtn: { background: "transparent", border: "1px solid #333", borderRadius: 10, padding: "8px 14px", color: "#999", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif", letterSpacing: 1 },
  cartTitle: { fontFamily: "'Bebas Neue',cursive", fontSize: 24, letterSpacing: 3, color: "#FF6B35" },
  orderTypePill: { background: "#1e1e1e", border: "1px solid #333", borderRadius: 20, padding: "4px 12px", fontSize: 11, color: "#aaa" },
  cartBody: { flex: 1, overflowY: "auto", padding: "16px" },
  emptyCart: { textAlign: "center", color: "#555", padding: 40, fontSize: 16 },
  cartRow: { display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 0", borderBottom: "1px solid #1e1e1e" },
  cartEmoji: { fontSize: 32, width: 44, textAlign: "center", paddingTop: 2 },
  cartInfo: { flex: 1 },
  cartItemName: { fontSize: 15, fontWeight: 600, marginBottom: 4 },
  cartAddons: { fontSize: 11, color: "#FF6B35", marginBottom: 3, lineHeight: 1.5 },
  cartNote: { fontSize: 11, color: "#666", marginBottom: 4, fontStyle: "italic" },
  cartItemPrice: { fontSize: 13, color: "#aaa", fontWeight: 600 },
  qtyControls: { display: "flex", alignItems: "center", gap: 8, paddingTop: 2 },
  qtyBtn: { background: "#2a2a2a", border: "1px solid #333", borderRadius: "50%", width: 28, height: 28, color: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" },
  qtyNum: { fontSize: 15, fontWeight: 700, minWidth: 18, textAlign: "center" },
  cartFooter: { padding: "20px 16px", background: "#0d0d0d", borderTop: "1px solid #222" },
  summaryRow: { display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14, color: "#999", borderBottom: "1px solid #1a1a1a" },
  totalRow: { fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'Bebas Neue',cursive", letterSpacing: 2, border: "none", paddingTop: 12 },
  placeOrderBtn: { width: "100%", marginTop: 16, background: "linear-gradient(90deg,#FF6B35,#FF3B30)", border: "none", borderRadius: 16, padding: "18px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 1, fontFamily: "'Bebas Neue',cursive" },
  successScreen: { fontFamily: "'DM Sans',sans-serif", background: "#0d0d0d", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" },
  successInner: { textAlign: "center", padding: 40, maxWidth: 400 },
  successIcon: { fontSize: 72, marginBottom: 20 },
  successTitle: { fontFamily: "'Bebas Neue',cursive", fontSize: 52, letterSpacing: 6, color: "#00C896", marginBottom: 8 },
  successSub: { fontSize: 16, color: "#888", marginBottom: 24 },
  successBadge: { background: "#1a1a1a", border: "1px solid #333", borderRadius: 30, padding: "8px 20px", display: "inline-block", fontSize: 14, color: "#aaa", marginBottom: 20 },
  successEta: { fontSize: 16, color: "#bbb", marginBottom: 40 },
  successBtn: { background: "#FF6B35", border: "none", borderRadius: 16, padding: "16px 48px", color: "#fff", fontSize: 16, cursor: "pointer", fontWeight: 700, letterSpacing: 2, fontFamily: "'Bebas Neue',cursive" },
};
