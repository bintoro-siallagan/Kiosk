import React, { useState, useEffect } from "react";
import FlowWelcome from "./FlowWelcome.jsx";
import FlowHome from "./FlowHome.jsx";
import FlowMenu from "./FlowMenu.jsx";
import FlowCheckout from "./FlowCheckout.jsx";
import FlowSuccess from "./FlowSuccess.jsx";
import FlowHistory from "./FlowHistory";
import FlowPromos from "./FlowPromos";
import FlowRedeem from "./FlowRedeem";

const SESSION_KEY = "flowos_session";
const CART_KEY = "flowos_cart";

export default function FlowApp() {
  const [activePromo, setActivePromo] = useState(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.phone && s.expires > Date.now()) return s;
      }
    } catch {}
    return null;
  });

  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  const [screen, setScreen] = useState(session ? "home" : "welcome");
  const [lastOrder, setLastOrder] = useState(null);

  const [tableContext] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return q.get("table") || null;
  });

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  }, [cart]);

  function handleAuth(customer) {
    const newSession = {
      phone: customer.phone,
      name: customer.name,
      customerId: customer.id || null,
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(newSession)); } catch {}
    setSession(newSession);
    setScreen("home");
  }

  function handleLogout() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(CART_KEY);
    } catch {}
    setSession(null);
    setCart([]);
    setScreen("welcome");
  }

  function addToCart(item, qty = 1) {
    const hasAddons = item.addons?.toppings?.length > 0;
    const addonsHash = hasAddons
      ? JSON.stringify(item.addons.toppings.map(t => t.id).sort())
      : null;
    setCart(prev => {
      const existing = prev.find(c =>
        c.id === item.id && ((c._addonsHash || null) === addonsHash)
      );
      if (existing) {
        return prev.map(c =>
          c.id === item.id && ((c._addonsHash || null) === addonsHash)
            ? { ...c, qty: c.qty + qty } : c
        );
      }
      return [...prev, {
        id: item.id,
        name: item.name || item.n,
        emoji: item.emoji || item.e,
        price: item.price ?? item.p,
        cat: item.cat,
        qty,
        addonTotal: item.addonTotal || 0,
        addons: item.addons || {},
        _addonsHash: addonsHash,
        freeToppings: item.freeToppings,
      }];
    });
  }

  function updateCartQty(idx, newQty) {
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, qty: newQty } : c).filter(c => c.qty > 0));
  }

  function removeFromCart(idx) {
    setCart(prev => prev.filter((_, i) => i !== idx));
  }

  function clearCart() {
    setCart([]);
  }

  function handleOrderPlaced(order) {
    setLastOrder(order);
    setCart([]);
    setScreen("success");
  }

  const cartTotal = cart.reduce((s, c) => s + (c.price + c.addonTotal) * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        body { background: #000; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes successPop { 0% { transform: scale(0); } 60% { transform: scale(1.1); } 100% { transform: scale(1); } }
      `}</style>

      {screen === "welcome" && (
        <FlowWelcome onAuth={handleAuth} tableContext={tableContext} />
      )}

      {screen === "home" && session && (
        <FlowHome
          session={session} tableContext={tableContext}
          cartCount={cartCount} cartTotal={cartTotal}
          onLogout={handleLogout} onNavigate={setScreen}
        />
      )}

      {screen === "menu" && session && (
        <FlowMenu
          session={session} tableContext={tableContext}
          cart={cart} cartTotal={cartTotal} cartCount={cartCount}
          onBack={() => setScreen("home")}
          onAddToCart={addToCart} onUpdateQty={updateCartQty}
          onRemove={removeFromCart} onClear={clearCart}
          onCheckout={() => setScreen("checkout")}
        />
      )}

                        {screen === "redeem" && session && (
        <FlowRedeem
          session={session}
          setPointsToRedeem={setPointsToRedeem}
          setScreen={setScreen}
        />
      )}

      {screen === "promos" && session && (
        <FlowPromos
          customer={session}
          setActivePromo={setActivePromo}
          setScreen={setScreen}
        />
      )}

      {screen === "history" && (
        <FlowHistory
          session={session}
          addToCart={addToCart}
          setScreen={setScreen}
        />
      )}

      {screen === "checkout" && session && (
        <FlowCheckout
          session={session} tableContext={tableContext}
          cart={cart} cartTotal={cartTotal}
          onBack={() => setScreen("menu")}
          onPlaced={handleOrderPlaced}
          activePromo={activePromo}
          setActivePromo={setActivePromo}
          pointsToRedeem={pointsToRedeem}
          setPointsToRedeem={setPointsToRedeem}
        />
      )}

      {screen === "success" && lastOrder && (
        <FlowSuccess
          order={lastOrder}
          session={session}
          onHome={() => { setLastOrder(null); setScreen("home"); }}
          onOrderMore={() => { setLastOrder(null); setScreen("menu"); }}
        />
      )}
    </div>
  );
}

const S = {
  app: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #0a0a0a 0%, #000 100%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    color: "white",
    display: "flex", flexDirection: "column", alignItems: "center",
  },
};
