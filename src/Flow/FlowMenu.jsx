import React, { useState, useEffect, useMemo, useCallback } from "react";
import API_HOST from "../apiBase.js";
import { fmtMoney } from "../lib/currency.js";
import { cinemaAudio } from "../lib/cinemaAudio.js";
import { ThoughtBubble, PulseTicker, buildFnbPulseMessages } from "../components/SoulOverlay.jsx";

const BRAND = "var(--brand-primary,#FF6B35)";
const BG = "#0A0A0A";
const CARD = "#1A1A1A";
const BORDER = "#2A2A2A";
const TEXT = "#FAFAFA";
const SUB = "#A1A1AA";

const API = API_HOST;

const FALLBACK_TOPPINGS = [
  { id: "f01", name: "Strawberry", group: "Fruits", price: 0 },
  { id: "f02", name: "Kiwi", group: "Fruits", price: 0 },
  { id: "f03", name: "Peach", group: "Fruits", price: 0 },
  { id: "f04", name: "Mangga", group: "Fruits", price: 0 },
  { id: "f05", name: "Longan", group: "Fruits", price: 0 },
  { id: "f06", name: "Nanas", group: "Fruits", price: 0 },
  { id: "f07", name: "Aloe Vera", group: "Fruits", price: 0 },
  { id: "c01", name: "Mochi Mix", group: "Crunchies", price: 0 },
  { id: "c02", name: "Oreo Crumble", group: "Crunchies", price: 0 },
  { id: "c03", name: "Granola", group: "Crunchies", price: 0 },
  { id: "c04", name: "Rainbow Cubes", group: "Crunchies", price: 0 },
  { id: "c05", name: "Roasted Almond", group: "Crunchies", price: 0 },
  { id: "c06", name: "Honey Granola", group: "Crunchies", price: 0 },
  { id: "c07", name: "Chia Seed", group: "Crunchies", price: 0 },
  { id: "s01", name: "Blueberry Sauce", group: "Sauces", price: 0 },
  { id: "s02", name: "Mango Sauce", group: "Sauces", price: 0 },
  { id: "s03", name: "Taro Latte", group: "Sauces", price: 0 },
  { id: "s04", name: "Chocolate Sauce", group: "Sauces", price: 0 },
  { id: "p01", name: "Cookie Dough", group: "Premium", price: 4000 },
  { id: "p02", name: "Choco Waferino", group: "Premium", price: 4000 },
  { id: "p03", name: "Goji Berry", group: "Premium", price: 4000 },
  { id: "p04", name: "Caviar Jelly", group: "Premium", price: 4000 },
];

const FALLBACK_EXTRA = 8000;
const GROUP_ORDER = ["Fruits", "Crunchies", "Sauces", "Premium"];
const GROUP_EMOJI = { Fruits: "🍓", Crunchies: "🥣", Sauces: "🍯", Premium: "⭐" };

function rupiah(n) {
  return fmtMoney(n);
}

// F&B hero photo pool — food/cafe themed Unsplash (warm appetite-friendly)
const FNB_HERO_PHOTOS = [
  "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&q=85&auto=format&fit=crop", // cafe interior wood
  "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&q=85&auto=format&fit=crop", // coffee shop counter
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=85&auto=format&fit=crop", // restaurant warm
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&q=85&auto=format&fit=crop", // food plate
];

function getFnbHero(outlet) {
  if (!outlet) return { url: FNB_HERO_PHOTOS[0], emoji: "🏪" };
  if (outlet.image_url || outlet.cover_url) return { url: outlet.image_url || outlet.cover_url, emoji: "🏪" };
  // Stable hash by code → consistent same outlet always gets same photo
  const code = (outlet.code || outlet.name || "OTL");
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return { url: FNB_HERO_PHOTOS[h % FNB_HERO_PHOTOS.length], emoji: "🏪" };
}

function calcAddonTotal(selected, freeQuota, extraPrice) {
  if (!selected || selected.length === 0) return 0;
  const premiumCost = selected.reduce((s, t) => s + (t.price || 0), 0);
  const overQuota = Math.max(0, selected.length - freeQuota);
  const extraCost = overQuota * extraPrice;
  return premiumCost + extraCost;
}

export default function FlowMenu({ cart, addToCart, updateCartQty, removeFromCart, clearCart, setScreen, customer, session }) {
  const isGuest = session?.guest === true;
  const [menu, setMenu] = useState([]);
  const [toppings, setToppings] = useState(FALLBACK_TOPPINGS);
  const [extraPrice, setExtraPrice] = useState(FALLBACK_EXTRA);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [detail, setDetail] = useState(null);
  const [selectedToppings, setSelectedToppings] = useState([]);
  const [detailQty, setDetailQty] = useState(1);
  const [showCart, setShowCart] = useState(false);
  // QUICK WINS #1+#2: outlet identity + day status + soul (pulse)
  const [outletInfo, setOutletInfo] = useState(null);
  const [dayClosed, setDayClosed] = useState(false);
  const [pulse, setPulse] = useState(null);
  const [nowTick, setNowTick] = useState(() => new Date());

  // Resolve outlet code: ?outlet=X URL param OR table session
  const outletCode = useMemo(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      return (q.get("outlet") || "").toUpperCase() || null;
    } catch { return null; }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/menu`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/api/toppings`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([m, t]) => {
      setMenu(Array.isArray(m) ? m : []);
      if (t && Array.isArray(t.toppings)) {
        setToppings(t.toppings);
        if (typeof t.extraPrice === "number") setExtraPrice(t.extraPrice);
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    // Fetch outlet identity (kalau ada code di URL) — buat hero card
    if (outletCode) {
      fetch(`${API}/api/outlet-master`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const list = d?.outlets || (Array.isArray(d) ? d : []);
          const o = list.find(x => (x.code || "").toUpperCase() === outletCode);
          if (o) setOutletInfo(o);
        })
        .catch(() => {});
    }

    // Day status — buat status pill "Buka"/"Tutup"
    const loadDay = () => {
      fetch(`${API}/api/day/status?vertical=fnb`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setDayClosed(!!d?.closed))
        .catch(() => {});
    };
    loadDay();
    const dayPoll = setInterval(loadDay, 60000); // refresh per menit

    // Soul pulse — community stats
    const loadPulse = () => {
      const qs = outletCode ? `?outlet=${encodeURIComponent(outletCode)}` : "";
      fetch(`${API}/api/public/kiosk-pulse${qs}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setPulse(d); })
        .catch(() => {});
    };
    loadPulse();
    const pulsePoll = setInterval(loadPulse, 60000);

    // Clock untuk time-aware greeting refresh
    const clock = setInterval(() => setNowTick(new Date()), 60000);

    return () => { clearInterval(dayPoll); clearInterval(pulsePoll); clearInterval(clock); };
  }, [outletCode]);

  const categories = useMemo(() => {
    const set = new Set(menu.map(m => m.cat));
    return ["all", ...Array.from(set)];
  }, [menu]);

  const catLabels = {
    all: "Semua",
    froyo: "🍦 Froyo",
    smoothies: "🥤 Smoothies",
    yogulato: "🍨 Yogulato",
    takehome: "📦 Take Home",
    collab: "✨ Special",
  };

  const filtered = useMemo(() => {
    let list = menu.filter(m => m.avail !== false);
    if (activeCat !== "all") list = list.filter(m => m.cat === activeCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q) || (m.desc || "").toLowerCase().includes(q));
    }
    return list;
  }, [menu, activeCat, search]);

  // QUICK WIN #3: count items per category
  const categoryCounts = useMemo(() => {
    const counts = { all: menu.filter(m => m.avail !== false).length };
    menu.forEach(m => {
      if (m.avail === false) return;
      counts[m.cat] = (counts[m.cat] || 0) + 1;
    });
    return counts;
  }, [menu]);

  const heroVisual = useMemo(() => getFnbHero(outletInfo), [outletInfo]);

  const groupedToppings = useMemo(() => {
    const groups = {};
    toppings.forEach(t => {
      if (!groups[t.group]) groups[t.group] = [];
      groups[t.group].push(t);
    });
    return groups;
  }, [toppings]);

  // QUICK WIN #4: detect kalau item butuh detail modal (ada addon config) atau bisa quick-add
  function itemNeedsDetail(item) {
    // Punya free toppings quota (yogulato) → wajib pilih topping → buka modal
    if ((item.freeToppings || 0) > 0) return true;
    // Punya allowed_extras list (pizza/sandwich pakai add-on) → buka modal
    if (Array.isArray(item.allowed_extras) && item.allowed_extras.length > 0) return true;
    // Default: simple item (food/drink fixed) → bisa quick-add
    return false;
  }

  function openDetail(item) {
    setDetail(item);
    setSelectedToppings([]);
    setDetailQty(1);
  }

  // Quick-add: tambah 1 item langsung ke cart tanpa modal
  function quickAdd(item) {
    addToCart({
      id: item.id, baseId: item.id, e: item.emoji, n: item.name,
      p: item.price, freeToppings: 0, addons: {}, addonTotal: 0,
    });
    try { cinemaAudio.seatPick(); } catch {}
  }

  function handleItemClick(item) {
    if (itemNeedsDetail(item)) openDetail(item);
    else quickAdd(item);
  }
  function closeDetail() {
    setDetail(null);
    setSelectedToppings([]);
    setDetailQty(1);
  }

  function toggleTopping(t) {
    setSelectedToppings(prev => {
      const exists = prev.find(x => x.id === t.id);
      if (exists) return prev.filter(x => x.id !== t.id);
      return [...prev, t];
    });
  }

  function handleAdd() {
    if (!detail) return;
    const freeQuota = detail.freeToppings || 0;
    const addonTotal = calcAddonTotal(selectedToppings, freeQuota, extraPrice);
    const hasAddons = selectedToppings.length > 0;
    const item = {
      id: hasAddons ? `${detail.id}-${Date.now()}` : detail.id,
      baseId: detail.id,
      e: detail.emoji,
      n: detail.name,
      p: detail.price,
      freeToppings: detail.freeToppings || 0,
      addons: { toppings: selectedToppings },
      addonTotal,
    };
    for (let i = 0; i < detailQty; i++) addToCart(item);
    try { cinemaAudio.seatPick(); } catch {}
    closeDetail();
  }

  const cartTotal = useMemo(() => {
    return cart.reduce((s, it) => {
      const q = it.q || 1;
      return s + (it.p || 0) * q + (it.addonTotal || 0) * q;
    }, 0);
  }, [cart]);

  const cartCount = useMemo(() => cart.reduce((s, it) => s + (it.q || 1), 0), [cart]);

  const detailAddonTotal = useMemo(() => {
    if (!detail) return 0;
    return calcAddonTotal(selectedToppings, detail.freeToppings || 0, extraPrice);
  }, [selectedToppings, detail, extraPrice]);

  const detailLineTotal = useMemo(() => {
    if (!detail) return 0;
    return (detail.price + detailAddonTotal) * detailQty;
  }, [detail, detailAddonTotal, detailQty]);

  return (
    <div style={{ height: "100vh", width: "100%", maxWidth: 480, margin: "0 auto", background: BG, color: TEXT, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      <style>{`
        .cat-scroll::-webkit-scrollbar { display: none }
        .cat-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes flowSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      {/* ── Header dengan Hero Outlet ── */}
      <div style={{ background: BG, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        {/* QUICK WIN #1: Hero outlet identity — photo + nama outlet + status */}
        {outletInfo && (
          <div style={{ position: "relative", height: 140, overflow: "hidden" }}>
            <img src={heroVisual.url} alt={outletInfo.name}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.85) 100%)" }} />
            <div style={{ position: "absolute", inset: 0, padding: "12px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              {/* Top row: back + status badge */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {!isGuest ? (
                  <button onClick={() => setScreen("home")}
                    style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)", color: TEXT, width: 36, height: 36, borderRadius: 999, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
                ) : <span />}
                {/* QUICK WIN #2: Status operasional */}
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", background: dayClosed ? "rgba(239,68,68,0.20)" : "rgba(16,185,129,0.20)", border: `1px solid ${dayClosed ? "rgba(239,68,68,0.50)" : "rgba(16,185,129,0.50)"}`, borderRadius: 999, backdropFilter: "blur(8px)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: dayClosed ? "#ef4444" : "#10b981", boxShadow: dayClosed ? "none" : "0 0 8px #10b981" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: dayClosed ? "#fca5a5" : "#86efac", letterSpacing: 0.5 }}>
                    {dayClosed ? "TUTUP" : "BUKA"}
                  </span>
                </div>
              </div>
              {/* Bottom: outlet name */}
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.65)", fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 4 }}>
                  📍 {outletInfo.area || outletInfo.code}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: -0.5, lineHeight: 1.15, textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>
                  {outletInfo.name}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fallback header kalau gak ada outlet info (legacy/no ?outlet=) */}
        {!outletInfo && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px 0" }}>
            {!isGuest ? (
              <button onClick={() => setScreen("home")} style={{ background: "transparent", border: "none", color: TEXT, fontSize: 24, cursor: "pointer", padding: 0, width: 32 }}>←</button>
            ) : <span style={{ width: 32 }} />}
            <h1 style={{ margin: 0, fontFamily: "'Inter', sans-serif", fontSize: 26, color: BRAND, letterSpacing: 1 }}>MENU</h1>
            <div style={{ flex: 1 }} />
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: dayClosed ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)", border: `1px solid ${dayClosed ? "rgba(239,68,68,0.40)" : "rgba(16,185,129,0.40)"}`, borderRadius: 999 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: dayClosed ? "#ef4444" : "#10b981" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: dayClosed ? "#fca5a5" : "#86efac" }}>
                {dayClosed ? "TUTUP" : "BUKA"}
              </span>
            </div>
          </div>
        )}

        {/* 💭 Soul strip — gumam kiosk + community pulse (sebelum search) */}
        {(outletInfo || pulse) && (
          <div style={{ padding: "10px 20px 0", display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
            <ThoughtBubble
              vertical="fnb" now={nowTick} outletInfo={outletInfo}
              extras={{ promoCount: 0, popular: menu.find(m => m.popular || m.is_popular) }}
              accentColor={BRAND} intervalMs={7000}
              style={{ alignSelf: "flex-start", maxWidth: "100%", padding: "10px 14px", fontSize: 14 }}
            />
            {pulse && (
              <PulseTicker
                messages={buildFnbPulseMessages(pulse)}
                style={{ alignSelf: "flex-start" }}
              />
            )}
          </div>
        )}

        {/* Search + Category tabs */}
        <div style={{ padding: "12px 20px 14px" }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari menu..."
            style={{ width: "100%", padding: "10px 14px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 14, outline: "none", boxSizing: "border-box" }} />

          {/* Category tabs — QUICK WIN #3: tampil count per category */}
          <div style={{ position: "relative", marginTop: 10 }}>
            <div className="cat-scroll" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
              {categories.map(c => {
                const count = categoryCounts[c] || 0;
                const isActive = activeCat === c;
                return (
                  <button key={c} onClick={() => setActiveCat(c)} style={{
                    padding: "7px 12px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0,
                    border: `1px solid ${isActive ? BRAND : BORDER}`,
                    background: isActive ? BRAND : "transparent",
                    color: isActive ? "#000" : TEXT,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}>
                    <span>{catLabels[c] || c}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                      background: isActive ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.06)",
                      color: isActive ? "#000" : SUB,
                      fontFamily: "'Geist Mono',monospace",
                    }}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div style={{
              position: "absolute", right: 0, top: 0, bottom: 4, width: 40, pointerEvents: "none",
              background: `linear-gradient(to right, transparent, ${BG})`
            }} />
          </div>
        </div>
      </div>

      {/* ── Menu items (scrollable) ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {loading && <div style={{ textAlign: "center", padding: 40, color: SUB }}>⏳ Sedang menyiapkan menu untuk Anda…</div>}
        {!loading && filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: SUB }}>Hmm, belum ketemu menu yang cocok 🤔</div>}
        <style>{`
          button[data-flow-tile]{transition:transform 0.2s cubic-bezier(.2,.8,.2,1),box-shadow 0.2s,border-color 0.2s}
          button[data-flow-tile]:active{transform:scale(0.97)}
          button[data-flow-tile] img{transition:transform 0.3s ease}
          button[data-flow-tile]:active img{transform:scale(1.05)}
        `}</style>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {filtered.map(item => (
            <button key={item.id} data-flow-tile onClick={() => handleItemClick(item)} style={{
              background: "linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))",
              border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 18,
              padding: 0, textAlign: "left", cursor: "pointer", position: "relative", overflow: "hidden", color: TEXT,
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            }}>
              {/* Popular badge — gradient brand drama */}
              {item.popular && (
                <span style={{
                  position: "absolute", top: 10, right: 10, zIndex: 2,
                  background: `linear-gradient(135deg, ${BRAND}, color-mix(in srgb, ${BRAND} 60%, #f59e0b))`,
                  color: "#1a0e00", fontSize: 9, fontWeight: 900, padding: "3px 8px", borderRadius: 4,
                  letterSpacing: 0.8, fontFamily: "'Geist Mono',monospace",
                  boxShadow: `0 2px 8px ${BRAND}55`,
                }}>🏆 POPULAR</span>
              )}
              {(item.image_url || item.image) ? (
                <div style={{ width: "100%", aspectRatio: "1/1", overflow: "hidden", background: "#0a0e16" }}>
                  <img src={item.image_url || item.image} alt={item.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    onError={e => { e.target.style.display = "none"; }}/>
                </div>
              ) : (
                <div style={{
                  width: "100%", aspectRatio: "1/1",
                  background: "radial-gradient(ellipse 90% 70% at 50% 35%,color-mix(in srgb,var(--brand-primary,#FF6B35) 18%,transparent),#0a0e16)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64,
                }}>{item.emoji || "🍴"}</div>
              )}
              <div style={{ padding: "12px 14px 14px" }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, lineHeight: 1.25, color: TEXT, letterSpacing: -0.2,
                  overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", minHeight: 36 }}>{item.name}</div>
                {item.desc && <div style={{ fontSize: 11, color: SUB, marginBottom: 8, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.desc}</div>}
                {item.freeToppings > 0 && <div style={{ fontSize: 9.5, color: "#10B981", marginBottom: 6, fontWeight: 700, letterSpacing: 0.4, fontFamily: "'Geist Mono',monospace" }}>+ {item.freeToppings} TOPPING GRATIS</div>}
                <div style={{ fontSize: 17, fontWeight: 900, color: BRAND, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.3,
                  textShadow: `0 0 12px color-mix(in srgb,${BRAND} 25%,transparent)` }}>{rupiah(item.price)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom cart bar ── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${BORDER}`, background: "#111", padding: "12px 16px" }}>
        {cart.length > 0 ? (
          <button onClick={() => setShowCart(true)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, padding: "13px 18px", borderRadius: 14,
            background: `radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))`,
            border: "1px solid rgba(255,255,255,0.16)",
            color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.45)",
            cursor: "pointer", boxSizing: "border-box",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)"
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13, letterSpacing: "-0.2px" }}>
              <span style={{ background: "rgba(0,0,0,0.4)", color: "#fff", borderRadius: 999, padding: "2px 9px", fontSize: 12, fontWeight: 600 }}>{cartCount}</span>
              Lihat Pesanan
            </span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, letterSpacing: 0.5 }}>{rupiah(cartTotal)} →</span>
          </button>
        ) : (
          <div style={{ textAlign: "center", color: SUB, fontSize: 13, padding: "9px 0" }}>🛒 Keranjang kosong — ketuk menu untuk memesan</div>
        )}
      </div>

      {/* ── Cart sheet (tap bottom bar) ── */}
      {showCart && (
        <div onClick={() => setShowCart(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 95,
          display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center"
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: BG, borderRadius: "20px 20px 0 0", maxHeight: "88vh",
            width: "100%", maxWidth: 480,
            display: "flex", flexDirection: "column", animation: "flowSheetUp 0.22s ease"
          }}>
            <div style={{ width: 40, height: 4, background: BORDER, borderRadius: 2, margin: "12px auto 4px" }} />
            <div style={{ padding: "8px 20px 12px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontFamily: "'Inter', sans-serif", fontSize: 26, color: BRAND }}>
                PESANAN{cartCount > 0 ? ` (${cartCount})` : ""}
              </h2>
              {cart.length > 0 && (
                <button onClick={clearCart} style={{ background: "transparent", border: "none", color: "#EF4444", fontSize: 12, cursor: "pointer" }}>🗑 Kosongin</button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 12px" }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 24px", color: SUB }}>
                  <div style={{ fontSize: 52, opacity: 0.3, marginBottom: 8 }}>🛒</div>
                  <div style={{ fontSize: 14 }}>Belum ada pesanan</div>
                </div>
              ) : (
                cart.map((it, i) => {
                  const q = it.q || 1;
                  const lineTotal = (it.p + (it.addonTotal || 0)) * q;
                  return (
                    <div key={it.id + "-" + i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12, marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700 }}><span style={{ marginRight: 6 }}>{it.e}</span>{it.n}</div>
                          <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{rupiah(it.p)}</div>
                        </div>
                        <button onClick={() => removeFromCart(it.id)} style={{ background: "transparent", border: "none", color: "#EF4444", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>✕</button>
                      </div>
                      {it.addons?.toppings?.length > 0 && (
                        <div style={{ fontSize: 11, color: SUB, marginBottom: 8, lineHeight: 1.4 }}>
                          + {it.addons.toppings.map(t => t.name).join(", ")}
                          {it.addonTotal > 0 && <span style={{ color: BRAND }}> ({rupiah(it.addonTotal)})</span>}
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <button onClick={() => updateCartQty(it.id, Math.max(1, q - 1))} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${BORDER}`, background: BG, color: TEXT, fontSize: 14, cursor: "pointer" }}>−</button>
                          <div style={{ width: 32, textAlign: "center", fontSize: 13, fontWeight: 700 }}>{q}</div>
                          <button onClick={() => updateCartQty(it.id, q + 1)} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${BORDER}`, background: BG, color: TEXT, fontSize: 14, cursor: "pointer" }}>+</button>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{rupiah(lineTotal)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ padding: "14px 20px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
              {cart.length > 0 ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, letterSpacing: 1 }}>TOTAL</span>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, color: BRAND }}>{rupiah(cartTotal)}</span>
                  </div>
                  <button onClick={() => setScreen("checkout")} style={{ width: "100%", padding: "14px", borderRadius: 14, background: `radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))`, border: "1px solid rgba(255,255,255,0.16)", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.45)", fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, letterSpacing: "-0.3px", cursor: "pointer", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)" }}>Checkout →</button>
                  <button onClick={() => setShowCart(false)} style={{ width: "100%", padding: "10px", marginTop: 8, borderRadius: 10, background: "transparent", border: "none", color: SUB, fontSize: 13, cursor: "pointer" }}>← Lanjut pilih menu</button>
                </>
              ) : (
                <button onClick={() => setShowCart(false)} style={{ width: "100%", padding: "13px", borderRadius: 12, background: CARD, border: `1px solid ${BORDER}`, color: TEXT, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Pilih menu</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOPPING PICKER MODAL */}
      {detail && (
        <div onClick={closeDetail} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: BG, width: "100%", maxWidth: 440, borderRadius: "20px 20px 0 0", maxHeight: "92vh", overflowY: "auto", paddingBottom: 110 }}>
            <div style={{ width: 40, height: 4, background: BORDER, borderRadius: 2, margin: "12px auto" }} />
            <div style={{ padding: "0 20px 16px" }}>
              {(detail.image_url || detail.image) ? (
                <div style={{ width: 160, height: 160, margin: "0 auto 12px", borderRadius: 16, overflow: "hidden", background: "#0a0e16" }}>
                  <img src={detail.image_url || detail.image} alt={detail.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    onError={e => { e.target.style.display = "none"; }}/>
                </div>
              ) : (
                <div style={{ fontSize: 56, textAlign: "center", marginBottom: 8 }}>{detail.emoji}</div>
              )}
              <div style={{ fontSize: 20, fontWeight: 800, textAlign: "center" }}>{detail.name}</div>
              <div style={{ fontSize: 13, color: SUB, textAlign: "center", marginTop: 6, lineHeight: 1.4 }}>{detail.desc}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: BRAND, textAlign: "center", marginTop: 10 }}>{rupiah(detail.price)}</div>
            </div>
            {detail.freeToppings > 0 && (
              <div style={{ padding: "0 20px 16px" }}>
                <ToppingCounter selected={selectedToppings} freeQuota={detail.freeToppings} extraPrice={extraPrice} addonTotal={detailAddonTotal} />
                {GROUP_ORDER.map(group => {
                  const list = groupedToppings[group];
                  if (!list || list.length === 0) return null;
                  const isPremium = group === "Premium";
                  return (
                    <div key={group} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: isPremium ? BRAND : SUB, marginBottom: 8, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{GROUP_EMOJI[group]}</span>
                        <span style={{ textTransform: "uppercase" }}>{group}</span>
                        {isPremium && <span style={{ fontSize: 10, color: BRAND }}>· {rupiah(list[0].price)} per item</span>}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {list.map(t => {
                          const sel = !!selectedToppings.find(x => x.id === t.id);
                          return (
                            <button key={t.id} onClick={() => toggleTopping(t)} style={{
                              padding: "8px 12px", borderRadius: 999,
                              border: `1px solid ${sel ? BRAND : BORDER}`,
                              background: sel ? BRAND : "transparent",
                              color: sel ? "#000" : TEXT,
                              fontSize: 12, fontWeight: 600, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 4
                            }}>
                              {sel && <span>✓</span>}
                              <span>{t.name}</span>
                              {t.price > 0 && <span style={{ fontSize: 10, opacity: 0.8, color: sel ? "#000" : BRAND }}>+{t.price/1000}k</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ position: "sticky", bottom: 0, background: BG, borderTop: `1px solid ${BORDER}`, padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                  <button onClick={() => setDetailQty(Math.max(1, detailQty - 1))} style={{ width: 36, height: 36, borderRadius: "50%", border: `1px solid ${BORDER}`, background: CARD, color: TEXT, fontSize: 18, cursor: "pointer" }}>−</button>
                  <div style={{ width: 44, textAlign: "center", fontSize: 16, fontWeight: 700 }}>{detailQty}</div>
                  <button onClick={() => setDetailQty(detailQty + 1)} style={{ width: 36, height: 36, borderRadius: "50%", border: `1px solid ${BORDER}`, background: CARD, color: TEXT, fontSize: 18, cursor: "pointer" }}>+</button>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: SUB }}>TOTAL</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: BRAND }}>{rupiah(detailLineTotal)}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={closeDetail} style={{ flex: 1, padding: "12px", borderRadius: 10, background: "transparent", border: `1px solid ${BORDER}`, color: TEXT, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Batal</button>
                <button onClick={handleAdd} style={{ flex: 2, padding: "13px", borderRadius: 12, background: `radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))`, border: "1px solid rgba(255,255,255,0.16)", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.45)", fontSize: 14, fontWeight: 600, letterSpacing: "-0.2px", cursor: "pointer", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 14px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)" }}>+ Tambah ke Pesanan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToppingCounter({ selected, freeQuota, extraPrice, addonTotal }) {
  const used = selected.length;
  const remaining = Math.max(0, freeQuota - used);
  const over = Math.max(0, used - freeQuota);
  const isOver = over > 0;
  return (
    <div style={{
      background: isOver ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)",
      border: `1px solid ${isOver ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.3)"}`,
      borderRadius: 10, padding: 12, marginBottom: 16,
      display: "flex", justifyContent: "space-between", alignItems: "center"
    }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: isOver ? "var(--brand-primary,#FF6B35)" : "#10B981" }}>
          {used} / {freeQuota} topping {isOver ? `(+${over} extra)` : `(${remaining} sisa free)`}
        </div>
        <div style={{ fontSize: 10, color: "#A1A1AA", marginTop: 3 }}>
          {isOver ? `Extra Rp ${extraPrice/1000}rb per topping` : "Pilih sampai habis, gratis!"}
        </div>
      </div>
      {addonTotal > 0 && (
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--brand-primary,#FF6B35)" }}>
          +Rp {addonTotal.toLocaleString("id-ID")}
        </div>
      )}
    </div>
  );
}
