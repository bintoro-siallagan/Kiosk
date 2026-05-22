import { useState, useEffect, useRef, useMemo } from "react";
import { useMenu } from "./MenuContext.jsx";
import PromoBroadcastBanner from "./PromoBroadcastBanner.jsx";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";
const WS_URL = API_BASE.replace(/^http/, "ws");

const STAGES = [
  { key: "waiting",   label: "Diterima",     emoji: "📝", color: "#94A3B8" },
  { key: "preparing", label: "Disiapkan",    emoji: "👨‍🍳", color: "#FF6B35" },
  { key: "ready",     label: "Siap Diambil", emoji: "🔔", color: "#10B981" },
  { key: "completed", label: "Selesai",      emoji: "✅", color: "#22C55E" },
];

const fmt = (n) => "Rp " + (n || 0).toLocaleString("id-ID");

export default function POSCDS() {
  const [mode, setMode] = useState("idle"); // idle | welcoming | cart | qris | success | track-qr
  const [state, setState] = useState({});
  const [pubConfig, setPubConfig] = useState({ trackingBaseUrl: null });
  const [connStatus, setConnStatus] = useState("connecting");
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/config/public`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPubConfig(d); })
      .catch(() => {});
  }, []);

  // The CDS is a full-screen customer display already sized for a large
  // monitor — opt it out of the global auto-zoom (auto-zoom.css zooms html
  // up to 1.4x on wide screens, which would double-scale this screen).
  useEffect(() => {
    const prev = document.documentElement.style.zoom;
    document.documentElement.style.zoom = "1";
    return () => { document.documentElement.style.zoom = prev; };
  }, []);

  useEffect(() => {
    let mounted = true;

    const connect = () => {
      if (!mounted) return;
      setConnStatus("connecting");
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mounted) return;
          setConnStatus("connected");
          console.log("[CDS] WebSocket connected");
        };

        ws.onmessage = (msg) => {
          if (!mounted) return;
          try {
            const parsed = JSON.parse(msg.data);
            const event = parsed.event || parsed.type;
            const data = parsed.data || parsed.payload || {};
            handleEvent(event, data);
          } catch (e) {
            console.warn("[CDS] parse fail:", e);
          }
        };

        ws.onerror = (err) => console.warn("[CDS] WS error:", err);

        ws.onclose = () => {
          if (!mounted) return;
          setConnStatus("disconnected");
          reconnectTimerRef.current = setTimeout(connect, 3000);
        };
      } catch (e) {
        if (!mounted) return;
        reconnectTimerRef.current = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  // Auto-reset to idle after 30s in track-qr mode (next customer)
  useEffect(() => {
    if (mode !== "track-qr") return;
    const timer = setTimeout(() => {
      setMode("idle");
      setState({});
    }, 30000);
    return () => clearTimeout(timer);
  }, [mode]);

  const handleEvent = (event, data) => {
    switch (event) {
      case "pos:cart_update":
        setState(prev => ({...prev, ...data}));
        if (data.cart && data.cart.length > 0) setMode("cart");
        else if (mode !== "idle") setMode("idle");
        break;
      case "pos:payment_method":
        setState(prev => ({...prev, paymentMethod: data.method}));
        break;
      case "pos:payment_qris":
        setState(prev => ({...prev, qris: data}));
        setMode("qris");
        break;
      case "pos:order_complete":
        setState(prev => ({...prev, completedOrder: data.order || data}));
        setMode("success");
        setTimeout(() => setMode("track-qr"), 3500);
        break;

      // ── Customer recognition (Step 1) ──
      case "pos:phone_lookup":
        setState(prev => ({ ...prev, phoneLookup: data, recognizedCustomer: null }));
        if (mode === "idle" || mode === "welcoming") setMode("welcoming");
        break;

      case "pos:customer_recognized":
        setState(prev => ({ ...prev, recognizedCustomer: data, phoneLookup: null }));
        setMode("welcoming");
        break;

      case "pos:customer_cleared":
        setState(prev => ({ ...prev, recognizedCustomer: null, phoneLookup: null }));
        if (mode === "welcoming") setMode("idle");
        break;

      // ── Transaction breakdown (Step 3) ──
      case "pos:promo_applied":
        setState(prev => ({ ...prev, promo: data }));
        break;

      case "pos:promo_removed":
        setState(prev => ({ ...prev, promo: null }));
        break;

      case "pos:points_redeemed":
        setState(prev => ({
          ...prev,
          pointsUsed: data.pointsUsed || 0,
          pointsValue: data.pointsValue || 0,
          pointsRemaining: data.newBalance ?? prev.pointsRemaining
        }));
        break;

      case "pos:transaction_breakdown":
        setState(prev => ({ ...prev, breakdown: data }));
        break;

      case "pos:cash_received":
        setState(prev => ({
          ...prev,
          cashReceived: data.received || 0,
          cashChange: data.change || 0,
          cashSufficient: data.sufficient
        }));
        break;

      case "pos:idle":
      case "pos:reset":
        setState({});
        setMode("idle");
        break;
    }
  };

  return (
    <>
      <PromoBroadcastBanner />
      <style>{`
        @keyframes ssFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div style={S.root}>
      <ConnIndicator status={connStatus} />
      {mode === "idle" && <CDSIdle />}
      {mode === "welcoming" && <CDSWelcoming state={state} />}
      {mode === "cart" && <CDSCart state={state} />}
      {mode === "qris" && <CDSQR state={state} />}
      {mode === "success" && <CDSSuccess state={state} />}
      {mode === "track-qr" && <CDSTrackQR state={state} pubConfig={pubConfig} />}
      </div>
    </>
  );
}

function ConnIndicator({ status }) {
  const color = status === "connected" ? "#10B981" : status === "connecting" ? "#FF6B35" : "#FF6B35";
  return (
    <div style={{...S.conn, color, borderColor: color}}>
      <span style={{...S.connDot, background: color}}/> {status}
    </div>
  );
}

function CDSIdle() {
  const [slides, setSlides] = useState([
    { type: "welcome" }
  ]);
  const [idx, setIdx] = useState(0);

  // Fetch popular items + active promos
  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch(`${API_BASE}/api/menu`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_BASE}/api/promos`).then(r => r.ok ? r.json() : []).catch(() => [])
    ]).then(([menu, promos]) => {
      if (!mounted) return;
      const popular = (Array.isArray(menu) ? menu : []).filter(m => m.popular && m.avail !== false).slice(0, 5);
      const now = Date.now();
      const activePromos = (Array.isArray(promos) ? promos : [])
        .filter(p => p.active !== false)
        .filter(p => {
          if (!p.validUntil) return true;
          const until = typeof p.validUntil === 'string' ? new Date(p.validUntil).getTime() : p.validUntil;
          return until > now;
        })
        .slice(0, 4);

      const slideList = [{ type: "welcome" }];
      activePromos.forEach((promo, i) => {
        slideList.push({ type: "promo", data: promo });
        if (popular[i]) slideList.push({ type: "item", data: popular[i] });
      });
      popular.slice(activePromos.length).forEach(item => {
        slideList.push({ type: "item", data: item });
      });
      slideList.push({ type: "member" });
      slideList.push({ type: "thanks" });
      setSlides(slideList);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setTimeout(() => {
      setIdx(i => (i + 1) % slides.length);
    }, 6000);
    return () => clearTimeout(timer);
  }, [idx, slides.length]);

  const slide = slides[idx] || { type: "welcome" };

  return (
    <div style={S.ssRoot}>
      <div key={idx} style={S.ssSlide}>
        {slide.type === "welcome" && <SlideWelcome />}
        {slide.type === "item" && <SlideItem item={slide.data} />}
        {slide.type === "promo" && <SlidePromo promo={slide.data} />}
        {slide.type === "member" && <SlideMember />}
        {slide.type === "thanks" && <SlideThanks />}
      </div>

      {slides.length > 1 && (
        <div style={S.ssDots}>
          {slides.map((_, i) => (
            <div key={i} style={{
              ...S.ssDot,
              background: i === idx ? "#FF6B35" : "rgba(245,158,11,0.25)",
              width: i === idx ? 28 : 8
            }}/>
          ))}
        </div>
      )}
    </div>
  );
}

function SlideWelcome() {
  return (
    <div style={S.ssCenter}>
      <div style={S.ssLogo}>☕</div>
      <div style={S.ssBrand}>KaryaOS</div>
      <div style={S.ssTagline}>Selamat datang!</div>
      <div style={S.ssHint}>Tap kasir untuk mulai order</div>
    </div>
  );
}

function SlideItem({ item }) {
  if (!item) return null;
  return (
    <div style={{...S.ssCenter, background:"radial-gradient(ellipse 70% 50% at 50% 50%, rgba(255,255,255,0.03) 0%, transparent 70%)"}}>
      <div style={S.ssBadge}>⭐ POPULAR</div>
      <div style={S.ssItemEmoji}>{item.emoji || "🍴"}</div>
      <div style={S.ssItemName}>{item.name}</div>
      {item.desc && <div style={S.ssItemDesc}>{item.desc}</div>}
      <div style={S.ssItemPrice}>{fmt(item.price)}</div>
      {item.freeToppings > 0 && (
        <div style={S.ssItemExtra}>+ {item.freeToppings} topping GRATIS</div>
      )}
    </div>
  );
}

function SlidePromo({ promo }) {
  if (!promo) return null;

  let bigTitle = "";
  let emoji = "🎁";
  let badgeColor = "#FF6B35";

  if (promo.type === "percent") {
    bigTitle = `DISKON ${promo.value}%`;
    emoji = "💯";
  } else if (promo.type === "fixed") {
    bigTitle = `HEMAT RP ${(promo.value || 0).toLocaleString("id-ID")}`;
    emoji = "💰";
  } else if (promo.type === "bogo") {
    const cfg = promo.bogoConfig || {};
    if (cfg.mode === "cross") {
      bigTitle = "BUY 1 GET 1";
      emoji = "🎁";
    } else if (cfg.mode === "category") {
      bigTitle = `BUY ${cfg.buyQty} GET ${cfg.getQty} FREE`;
      emoji = "🥤";
    } else if (cfg.mode === "same") {
      bigTitle = `BUY ${cfg.buyQty} GET ${cfg.getQty} FREE`;
      emoji = "🎁";
    } else {
      bigTitle = "BUY GET FREE";
      emoji = "🎁";
    }
  } else {
    bigTitle = promo.name || "SPECIAL OFFER";
  }

  const desc = (promo.desc || promo.description || "").replace(/^[🎁🔥💯💰🥤🎉]+\s*/, "");
  const memberBadge = promo.forMember;
  const payHint = promo.requiredPaymentHint;

  return (
    <div style={{...S.ssCenter, background:"radial-gradient(ellipse 80% 70% at 50% 50%, rgba(255,107,53,0.12) 0%, transparent 70%)", maxWidth:"none", width:"100%", padding:"60px 80px"}}>
      <div style={{...S.ssBadge, background:`rgba(255,107,53,0.2)`, color:badgeColor, fontSize:20, padding:"10px 32px", letterSpacing:4}}>
        🔥 PROMO
      </div>
      <div style={S.ssPromoEmoji}>{emoji}</div>
      <div style={S.ssPromoBigTitle}>{bigTitle}</div>
      {desc && <div style={S.ssItemDesc}>{desc}</div>}

      <div style={{display:"flex", gap:12, marginTop:16, flexWrap:"wrap", justifyContent:"center"}}>
        {memberBadge && (
          <div style={S.ssPromoTag}>💎 MEMBER ONLY</div>
        )}
        {payHint && (
          <div style={S.ssPromoTagPay}>🏦 {payHint}</div>
        )}
        {promo.minOrder > 0 && (
          <div style={S.ssPromoTagMin}>Min. Rp {promo.minOrder.toLocaleString("id-ID")}</div>
        )}
      </div>

      {promo.code && (
        <div style={S.ssPromoCode}>
          <span style={S.ssPromoCodeLabel}>KODE</span>
          <span style={S.ssPromoCodeValue}>{promo.code}</span>
        </div>
      )}
    </div>
  );
}

function SlideMember() {
  return (
    <div style={S.ssCenter}>
      <div style={{...S.ssBadge, background:"rgba(59,130,246,0.15)", color:"#3B82F6"}}>💎 MEMBER</div>
      <div style={S.ssMemberIcon}>🎁</div>
      <div style={S.ssItemName}>Jadi Member Bintoro</div>
      <div style={S.ssItemDesc}>
        Dapat <strong style={{color:"#FF6B35"}}>1 poin tiap Rp 1.000</strong> belanja<br/>
        Tukar <strong style={{color:"#FF6B35"}}>100 poin = Rp 1.000</strong> diskon
      </div>
      <div style={{...S.ssHint, fontSize:28, color:"#aaa", letterSpacing:2}}>Daftar gratis di kasir 👋</div>
    </div>
  );
}

function SlideThanks() {
  return (
    <div style={S.ssCenter}>
      <div style={S.ssThanksIcon}>☕</div>
      <div style={{...S.ssItemName, fontSize:"min(96px,10vh,9vw)", color:"#FF6B35", textShadow:"0 0 60px rgba(255,107,53,0.4)"}}>Terima Kasih</div>
      <div style={S.ssItemDesc}>Sudah mampir ke Bintoro!</div>
      <div style={S.ssSocial}>📷 @bintorocafe</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CDSWelcoming — Customer recognition screen (NEW, Step 1)
// ═══════════════════════════════════════════════════════════
function CDSWelcoming({ state }) {
  const customer = state.recognizedCustomer;
  const phoneLookup = state.phoneLookup;

  // State 1: Customer ke-recognize
  if (customer) {
    const isNew = customer.isNew;
    const accent = isNew ? "#3B82F6" : "#10B981";
    const accentBg = isNew ? "rgba(59,130,246,0.10)" : "rgba(16,185,129,0.10)";

    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", boxSizing: "border-box",
        alignItems: "center", justifyContent: "center", maxWidth: "100%",
        padding: "60px 40px", gap: 24,
        animation: "ssFadeIn 0.5s ease-out"
      }}>
        <div style={{ fontSize: "min(120px,13vh)", lineHeight: 1 }}>
          {isNew ? "✨" : "👋"}
        </div>

        <div style={{
          fontSize: 18, color: accent, letterSpacing: 4,
          fontWeight: 700, textTransform: "uppercase",
          padding: "8px 24px", borderRadius: 999,
          background: accentBg, border: `1px solid ${accent}`
        }}>
          {isNew ? "Member Baru" : "Selamat Datang Kembali"}
        </div>

        <div style={{
          fontSize: "min(72px,8vh,7vw)", fontWeight: 800,
          fontFamily: "'Inter', sans-serif",
          color: "#fff", textAlign: "center",
          letterSpacing: 1, lineHeight: 1.1,
          maxWidth: 900, wordBreak: "break-word"
        }}>
          {isNew ? "Halo!" : `Halo, ${customer.name}`}
        </div>

        {!isNew && customer.points > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            padding: "20px 36px", borderRadius: 16,
            background: "rgba(245,158,11,0.10)",
            border: "1px solid rgba(245,158,11,0.40)"
          }}>
            <span style={{ fontSize: 32 }}>⭐</span>
            <div>
              <div style={{ fontSize: 14, color: "#FCD34D", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>
                Saldo Poin
              </div>
              <div style={{ fontSize: 36, color: "#F59E0B", fontWeight: 800, fontFamily: "'Inter', sans-serif" }}>
                {customer.points.toLocaleString("id-ID")}
              </div>
            </div>
          </div>
        )}

        {isNew && (
          <div style={{
            fontSize: 22, color: "#888", textAlign: "center",
            maxWidth: 600, lineHeight: 1.5
          }}>
            Mulai dari sekarang, setiap transaksi kasih poin yang bisa dipakai diskon di kemudian hari.
          </div>
        )}

        <div style={{
          marginTop: 16, fontSize: 18, color: "#666",
          letterSpacing: 2, textTransform: "uppercase"
        }}>
          Kasir sedang menyiapkan pesanan...
        </div>
      </div>
    );
  }

  // State 2: HP lagi diketik
  if (phoneLookup) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", boxSizing: "border-box",
        alignItems: "center", justifyContent: "center", maxWidth: "100%",
        padding: "60px 40px", gap: 32
      }}>
        <div style={{ fontSize: "min(100px,12vh)", lineHeight: 1 }}>📱</div>

        <div style={{
          fontSize: 18, color: "#FF6B35", letterSpacing: 4,
          fontWeight: 700, textTransform: "uppercase"
        }}>
          Verifikasi Member
        </div>

        <div style={{
          fontSize: "min(48px,5vh,6vw)", fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          color: "#fff", letterSpacing: 4,
          padding: "16px 32px",
          background: "rgba(255,255,255,0.05)",
          borderRadius: 12, border: "1px dashed rgba(245,158,11,0.4)"
        }}>
          {phoneLookup.masked || "08xxxxxxxx"}
        </div>

        <div style={{ fontSize: 20, color: "#888", textAlign: "center" }}>
          Kasir sedang input nomor HP Anda
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, display: "flex",
      alignItems: "center", justifyContent: "center",
      color: "#666", fontSize: 18
    }}>
      Memuat...
    </div>
  );
}

function CDSCart({ state }) {
  const menu = useMenu();
  const extraToppingPrice = menu?.extraToppingPrice || 0;
  const tMap = useMemo(() => {
    const m = {};
    (menu?.toppings || []).forEach(t => { m[t.id] = t; });
    return m;
  }, [menu]);
  const cart = state.cart || [];
  const subtotal = state.subtotal ?? cart.reduce(
    (s, c) => s + ((c.price || 0) + (c.addonTotal || 0)) * c.qty, 0
  );
  const customerName = state.order?.customerName;
  const orderType = state.order?.type;
  const itemCount = cart.reduce((s, c) => s + c.qty, 0);

  // ── Computed breakdown ── (Step 3)
  const promoDisc = state.promo?.discount || 0;
  const pointsVal = state.pointsValue || 0;
  const pointsUsed = state.pointsUsed || 0;
  const finalTotal = state.breakdown?.finalTotal
    ?? Math.max(0, subtotal - promoDisc - pointsVal);
  const hasDeduction = promoDisc > 0 || pointsVal > 0;

  return (
    <>
      <header style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.logoSmall}>☕</span>
          <span style={S.brandSmall}>KaryaOS</span>
        </div>
        <div>
          {orderType && <span style={S.tag}>{orderType === "dine-in" ? "🍽️ Dine-in" : "🛍️ Take-away"}</span>}
        </div>
      </header>

      <main style={S.cartMain}>
        <div style={S.cartTitleRow}>
          <div style={S.cartTitle}>
            Pesanan Anda
            {customerName && <span style={S.customerName}>· {customerName}</span>}
          </div>
          <div style={S.itemCountTag}>{itemCount} item</div>
        </div>

        <div style={S.cartList}>
          {cart.map(item => {
            const lineTotal = ((item.price || 0) + (item.addonTotal || 0)) * item.qty;
            const toppings = item.addons?.toppings || [];
            const freeCount = item.freeToppings || 0;
            const extraCount = Math.max(0, toppings.length - freeCount);
            const perExtra = extraCount > 0 ? Math.round((item.addonTotal || 0) / extraCount) : 0;
            return (
              <div key={item.cartKey || item.id} style={S.cartItem}>
                <div style={S.itemEmoji}>{item.emoji || "🍴"}</div>
                <div style={S.itemBody}>
                  <div style={S.itemNameRow}>
                    <span style={S.itemName}>{item.name}</span>
                    <span style={S.itemBasePrice}>Rp {(item.price || 0).toLocaleString("id-ID")}</span>
                  </div>
                  {toppings.length > 0 && (
                    <div style={S.toppingList}>
                      {toppings.map((t, i) => {
                        const isFree = i < freeCount;
                        return (
                          <div key={i} style={S.toppingRow}>
                            <span style={S.toppingName}>+ {t.name}</span>
                            <span style={isFree ? S.toppingFree : S.toppingPaid}>
                              {isFree ? "gratis" : `Rp ${perExtra.toLocaleString("id-ID", {maximumFractionDigits: 0})}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div style={S.itemQty}>{item.qty}x</div>
                <div style={S.itemPrice}>{fmt(lineTotal)}</div>
              </div>
            );
          })}
        </div>

        {/* ═══════ Summary with breakdown (Step 3) ═══════ */}
        <div style={S.summaryInline}>
          <div style={S.summaryRow}>
            <span style={S.summaryLabel}>Subtotal</span>
            <span style={S.summaryValue}>{fmt(subtotal)}</span>
          </div>
          <div style={S.summaryRow}>
            <span style={S.summaryLabelMuted}>PPN 10%</span>
            <span style={S.summaryLabelMuted}>included</span>
          </div>

          {/* Promo deduction */}
          {state.promo && state.promo.discount > 0 && (
            <div style={S.deductionRow}>
              <span style={S.deductionLabel}>
                🎁 Promo {state.promo.code}
              </span>
              <span style={S.deductionValue}>-{fmt(state.promo.discount)}</span>
            </div>
          )}

          {/* Points deduction */}
          {pointsVal > 0 && (
            <div style={S.deductionRow}>
              <span style={S.deductionLabel}>
                ⭐ Bayar dgn {pointsUsed.toLocaleString("id-ID")} poin
              </span>
              <span style={S.deductionValue}>-{fmt(pointsVal)}</span>
            </div>
          )}

          <div style={S.summaryDivider}/>

          <div style={S.summaryRow}>
            <span style={S.totalLabel}>
              {hasDeduction ? "TOTAL BAYAR" : "TOTAL"}
            </span>
            <span style={S.totalValue}>{fmt(finalTotal)}</span>
          </div>

          {hasDeduction && finalTotal === 0 && (
            <div style={S.coveredBanner}>
              🎉 Tertutup poin / promo — gak perlu bayar tambahan
            </div>
          )}

          {hasDeduction && (state.pointsRemaining ?? null) !== null && pointsUsed > 0 && (
            <div style={S.pointsAfterRow}>
              Sisa poin Anda: <strong style={{color: "#F59E0B"}}>{state.pointsRemaining.toLocaleString("id-ID")}</strong>
            </div>
          )}
        </div>

        {state.paymentMethod && (
          <div style={state.paymentMethod === "QRIS" ? S.payBannerQris : S.payBannerCash}>
            <div style={S.payIcon}>{state.paymentMethod === "QRIS" ? "💳" : "💵"}</div>
            <div style={S.payContent}>
              <div style={S.payLabel}>KASIR PILIH PEMBAYARAN</div>
              <div style={S.payMethodBig}>{state.paymentMethod}
              {state.paymentBreakdown && state.paymentMethod === "SPLIT" && (
                <div style={{
                  fontSize: 18, marginTop: 12, color: "#fff",
                  background: "rgba(255,255,255,0.1)",
                  padding: "12px 20px", borderRadius: 12,
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                }}>
                  📊 {state.paymentBreakdown}
                </div>
              )}</div>
            </div>
          </div>
        )}

        {/* Cash transparency — kembalian visible ke customer (Step 4A) */}
        {state.paymentMethod === "CASH" && state.cashReceived > 0 && (
          <div style={S.cashTransparencyBox}>
            <div style={S.cashTransparencyHeader}>💵 PEMBAYARAN TUNAI</div>
            <div style={S.cashTransparencyRow}>
              <span style={S.cashTrLabel}>Uang Anda berikan</span>
              <span style={S.cashTrValue}>{fmt(state.cashReceived)}</span>
            </div>
            {state.cashChange > 0 && (
              <div style={S.cashTransparencyChange}>
                <span style={S.cashTrChangeLabel}>Kembalian Anda</span>
                <span style={S.cashTrChangeValue}>{fmt(state.cashChange)}</span>
              </div>
            )}
            {!state.cashSufficient && state.cashReceived > 0 && (
              <div style={S.cashTransparencyShort}>
                ⏳ Menunggu pembayaran lengkap...
              </div>
            )}
          </div>
        )}

        <div style={S.verifyNotice}>
          <div style={S.verifyIcon}>ℹ️</div>
          <div style={S.verifyText}>
            Pastikan <strong style={S.verifyEmphasis}>Menu</strong> dan <strong style={S.verifyEmphasis}>Pembayaran</strong> sama dengan
            {customerName ? <span style={S.verifyName}> {customerName} </span> : " "}
            yang Anda terima, dan <strong style={S.verifyEmphasis}>struk</strong> diberikan oleh kasir kami.
          </div>
        </div>

        <div style={S.cartHint}>
          Menunggu kasir menyelesaikan pesanan...
        </div>
      </main>
    </>
  );
}

function CDSQR({ state }) {
  const qris = state.qris || {};
  const amount = qris.amount || state.subtotal || 0;
  const qrUrl = qris.qrCode || qris.qrUrl;

  return (
    <>
      <header style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.logoSmall}>☕</span>
          <span style={S.brandSmall}>KaryaOS</span>
        </div>
        <div style={S.tag}>💳 QRIS Payment</div>
      </header>

      <main style={S.qrMain}>
        <div style={S.qrTitle}>Scan QR untuk Bayar</div>

        <div style={S.qrFrame}>
          {qrUrl ? (
            <img src={qrUrl} alt="QR Code" style={S.qrImage} />
          ) : (
            <div style={S.qrLoading}>
              <div style={S.loader}>⏳</div>
              <div>Generating QR...</div>
            </div>
          )}
        </div>

        <div style={S.qrHint}>
          Buka aplikasi e-wallet atau mobile banking<br/>
          (GoPay, OVO, DANA, ShopeePay, dst)
        </div>

        <div style={S.qrAmountBox}>
          <span style={S.subLabel}>TOTAL BAYAR</span>
          <span style={S.qrAmount}>{fmt(amount)}</span>
        </div>
      </main>
    </>
  );
}

function CDSSuccess({ state }) {
  const order = state.completedOrder || {};
  return (
    <div style={S.center}>
      <div style={S.successCheck}>✅</div>
      <div style={S.successTitle}>Pembayaran Berhasil!</div>
      <div style={S.successOrderId}>Order #{order.id || ""}</div>
      <div style={S.successAmount}>{fmt(order.total || 0)}</div>
      <div style={S.successThanks}>Terima kasih 🙏</div>
      <div style={S.idleHint}>Menampilkan QR tracking...</div>
    </div>
  );
}

function CDSTrackQR({ state, pubConfig }) {
  const order = state.completedOrder || {};
  const orderId = order.id || "";

  const base = pubConfig.trackingBaseUrl
    || `${window.location.protocol}//${window.location.host}${window.location.pathname.replace(/\/$/, "")}`;
  const trackingUrl = `${base}/?trackorder=${orderId}`;

  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(trackingUrl)}&bgcolor=ffffff&color=000000&qzone=2&margin=10`;

  const isLocal = base.includes("localhost") || base.includes("127.0.0.1");

  return (
    <>
      <header style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.logoSmall}>☕</span>
          <span style={S.brandSmall}>KaryaOS</span>
        </div>
        <div style={S.tag}>Order #{orderId}</div>
      </header>

      <main style={S.trackQrMain}>
        <div style={S.trackQrTitle}>Scan untuk Tracking</div>
        <div style={S.trackQrSubtitle}>
          {order.customerName ? `Terima kasih, ${order.customerName}!` : "Terima kasih!"}
        </div>

        <div style={S.trackQrFrame}>
          <img src={qrImg} alt="Tracking QR" style={S.trackQrImage}
            onError={(e) => { e.target.style.display = "none"; }}/>
        </div>

        <div style={S.trackQrHint}>
          Buka kamera HP Anda → Scan QR di atas<br/>
          Cek status pesanan kapan saja
        </div>

        {isLocal && (
          <div style={S.warnBox}>
            ⚠️ CDS dibuka via <code>localhost</code> — phone tidak bisa scan.<br/>
            Buka CDS via LAN IP atau setup <code>TRACKING_BASE_URL</code> di .env.
          </div>
        )}

        <div style={S.totalRow}>
          <span style={S.totalLabel}>TOTAL DIBAYAR</span>
          <span style={S.totalBig}>{fmt(order.total || 0)}</span>
        </div>
      </main>
    </>
  );
}

const S = {
  root: { height:"100vh", width:"100vw", background:"#0a0a0a", color:"#fff",
    fontFamily:"'Inter','-apple-system',sans-serif", position:"fixed", top:0, left:0,
    display:"flex", flexDirection:"column" },
  conn: { position:"fixed", top:12, right:12, fontSize:10, padding:"3px 10px",
    border:"1px solid", borderRadius:100, background:"#0a0a0a",
    display:"flex", alignItems:"center", gap:6, zIndex:100 },
  connDot: { width:6, height:6, borderRadius:"50%" },

  center: { flex:1, display:"flex", flexDirection:"column", alignItems:"center",
    justifyContent:"center", gap:16, padding:40, textAlign:"center" },
  logo: { fontSize:120, marginBottom:8 },
  logoSmall: { fontSize:32 },
  brand: { fontSize:96, fontFamily:"'Inter',sans-serif", color:"#FF6B35",
    letterSpacing:4, marginBottom:24, fontWeight:800 },
  brandSmall: { fontSize:36, fontFamily:"'Inter',sans-serif", color:"#FF6B35",
    letterSpacing:4 },

  idleTagline: { fontSize:32, color:"#fff", marginBottom:12, fontWeight:300 },
  idleHint: { fontSize:18, color:"#888" },
  idleBlinker: { marginTop:80, fontSize:24, color:"#FF6B35", letterSpacing:8 },

  /* Screensaver styles */
  ssRoot: { flex:1, position:"relative", display:"flex", flexDirection:"column", minHeight:"100vh",
    alignItems:"center", justifyContent:"center", overflow:"hidden" },
  ssSlide: { width:"100%", minHeight:"100vh", display:"flex", alignItems:"center",
    justifyContent:"center", animation:"ssFadeIn 0.8s ease-out" },
  ssCenter: { display:"flex", flexDirection:"column", alignItems:"center", boxSizing:"border-box",
    textAlign:"center", padding:"60px 80px", maxWidth:"none", width:"100%", gap:20, justifyContent:"space-evenly", minHeight:"100vh" },

  ssLogo: { fontSize:"min(240px,22vh)", lineHeight:1, marginBottom:12 },
  ssBrand: { fontSize:"min(150px,13vh,11vw)", fontFamily:"'Inter',sans-serif", color:"#FF6B35", letterSpacing:4, marginBottom:8, fontWeight:900, lineHeight:1, textShadow:"0 0 80px rgba(255,107,53,0.5)" },
  ssTagline: { fontSize:"min(56px,6vh)", color:"#fff", marginBottom:12, fontWeight:700, letterSpacing:1 },
  ssHint: { fontSize:24, color:"#666", marginTop:8, letterSpacing:4 },

  ssBadge: { padding:"8px 24px", background:"rgba(245,158,11,0.15)",
    color:"#FF6B35", borderRadius:100, fontSize:"min(48px,5vh)", fontWeight:800,
    letterSpacing:2, marginBottom:0 },

  ssItemEmoji: { fontSize:"min(260px,26vh)", lineHeight:1, marginBottom:8, filter:"drop-shadow(0 16px 40px rgba(0,0,0,0.6))" },
  ssItemName: { fontSize:"min(80px,9vh,8vw)", fontWeight:800, marginBottom:8, lineHeight:1.1, color:"#fff" },
  ssItemDesc: { fontSize:30, color:"#ccc", marginBottom:24, lineHeight:1.5, fontWeight:500,
    maxWidth:600 },
  ssItemPrice: { fontSize:"min(90px,9vh)", fontWeight:900, color:"#FF6B35", fontFamily:"'Inter',sans-serif", letterSpacing:1, marginBottom:4 },
  ssItemExtra: { fontSize:22, color:"#34D399", fontWeight:700, padding:"8px 20px", background:"rgba(52,211,153,0.1)", borderRadius:100, letterSpacing:1 },

  ssPromoEmoji: { fontSize:"min(100px,12vh)", lineHeight:1, marginBottom:4 },
  ssPromoBigTitle: { fontSize:"min(148px,13vh,11vw)", fontWeight:900, color:"#FF6B35",
    fontFamily:"'Inter',sans-serif", letterSpacing:2, marginBottom:8,
    lineHeight:1, textShadow:"0 0 60px rgba(255,107,53,0.5), 0 0 120px rgba(255,107,53,0.2)" },
  ssPromoTag: { padding:"10px 24px", background:"rgba(59,130,246,0.2)",
    color:"#60A5FA", borderRadius:100, fontSize:18, fontWeight:800,
    letterSpacing:2 },
  ssPromoTagPay: { padding:"10px 24px", background:"rgba(16,185,129,0.2)",
    color:"#34D399", borderRadius:100, fontSize:18, fontWeight:800,
    letterSpacing:2 },
  ssPromoTagMin: { padding:"10px 24px", background:"rgba(255,107,53,0.15)",
    color:"#FF6B35", borderRadius:100, fontSize:18, fontWeight:800,
    letterSpacing:2 },
  ssPromoCode: { display:"flex", flexDirection:"column", alignItems:"center",
    marginTop:28, padding:"24px 64px",
    background:"rgba(255,107,53,0.08)", border:"2px dashed #FF6B35",
    borderRadius:20, boxShadow:"0 0 40px rgba(255,107,53,0.15)" },
  ssPromoCodeLabel: { fontSize:16, color:"#FF6B35", letterSpacing:6, fontWeight:700 },
  ssPromoCodeValue: { fontSize:48, fontFamily:"'Inter',sans-serif",
    color:"#FF6B35", letterSpacing:8, marginTop:8, fontSize:56 },

  ssMemberIcon: { fontSize:200, lineHeight:1, marginBottom:24 },

  ssThanksIcon: { fontSize:280, lineHeight:1, marginBottom:8 },
  ssSocial: { marginTop:24, fontSize:28, color:"#FF6B35",
    fontWeight:700, letterSpacing:1 },

  ssDots: { position:"absolute", bottom:32, left:"50%",
    transform:"translateX(-50%)", display:"flex", gap:8 },
  ssDot: { height:8, borderRadius:100, transition:"all 0.3s ease" },

  header: { display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"24px 40px", borderBottom:"1px solid #222" },
  headerLeft: { display:"flex", alignItems:"center", gap:16 },
  tag: { fontSize:18, padding:"8px 18px", borderRadius:100,
    background:"rgba(245,158,11,0.15)", color:"#FF6B35", fontWeight:600 },

  cartMain: { flex:1, padding:"32px 60px", overflowY:"auto",
    display:"flex", flexDirection:"column" },
  cartTitleRow: { display:"flex", justifyContent:"space-between",
    alignItems:"baseline", marginBottom:24 },
  cartTitle: { fontSize:56, fontFamily:"'Inter',sans-serif", color:"#FF6B35",
    letterSpacing:4 },
  customerName: { fontSize:24, color:"#888", marginLeft:12, fontFamily:"'Inter',sans-serif" },
  itemCountTag: { fontSize:13, padding:"6px 14px", borderRadius:100,
    background:"rgba(245,158,11,0.1)", color:"#FF6B35", fontWeight:700, letterSpacing:1 },
  cartList: { display:"flex", flexDirection:"column", gap:14, marginBottom:32 },
  cartItem: { display:"flex", alignItems:"flex-start", gap:20, padding:"18px 22px",
    background:"#111", borderRadius:14, border:"1px solid #1a1a1a" },
  itemEmoji: { fontSize:44, width:60, textAlign:"center", paddingTop:4 },
  itemBody: { flex:1 },
  itemNameRow: { display:"flex", justifyContent:"space-between", alignItems:"baseline",
    marginBottom:8, gap:12 },
  itemName: { fontSize:20, fontWeight:700 },
  itemBasePrice: { fontSize:13, color:"#888", fontWeight:600 },
  toppingList: { display:"flex", flexDirection:"column", gap:6, marginTop:4 },
  toppingRow: { display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"3px 0" },
  toppingName: { fontSize:14, color:"#fff", fontWeight:500 },
  toppingFree: { fontSize:12, color:"#10B981", fontWeight:700, letterSpacing:0.5,
    background:"rgba(16,185,129,0.1)", padding:"2px 10px", borderRadius:100 },
  toppingPaid: { fontSize:12, color:"#FF6B35", fontWeight:700,
    background:"rgba(245,158,11,0.1)", padding:"2px 10px", borderRadius:100 },
  itemAddons: { display:"flex", flexWrap:"wrap", gap:6, marginTop:6 },
  addonTag: { fontSize:12, color:"#10B981", background:"rgba(16,185,129,0.1)",
    padding:"3px 10px", borderRadius:100 },
  itemQty: { fontSize:20, fontWeight:800, color:"#888", width:50, textAlign:"center",
    paddingTop:4 },
  itemPrice: { fontSize:32, color:"#FF6B35", minWidth:140, textAlign:"right",
    fontFamily:"'Inter',sans-serif", letterSpacing:2, paddingTop:4 },

  summaryInline: { background:"#0a0a0a", border:"1px solid #222",
    borderRadius:18, padding:"20px 28px", marginTop:8 },
  summaryRow: { display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"6px 0" },
  summaryLabel: { fontSize:18, color:"#fff", fontWeight:600 },
  summaryValue: { fontSize:22, color:"#fff", fontWeight:700 },
  summaryLabelMuted: { fontSize:13, color:"#666" },
  summaryDivider: { height:1, background:"#222", margin:"12px 0" },
  totalLabel: { fontSize:18, color:"#fff", fontWeight:800, letterSpacing:1 },
  totalValue: { fontSize:64, fontFamily:"'Inter',sans-serif", color:"#FF6B35",
    letterSpacing:3, fontWeight:600 },
  cartHint: { textAlign:"center", color:"#555", fontSize:13, marginTop:24,
    padding:"12px", letterSpacing:1 },

  // ── Transaction breakdown styles (Step 3) ──
  deductionRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 0", color: "#10B981"
  },
  deductionLabel: { fontSize: 17, fontWeight: 600 },
  deductionValue: { fontSize: 20, fontWeight: 800, color: "#34D399",
    fontFamily:"'Inter',sans-serif", letterSpacing: 1 },
  coveredBanner: {
    marginTop: 18, padding: "16px 22px",
    background: "rgba(16,185,129,0.12)",
    border: "1px solid #10B981", borderRadius: 14,
    textAlign: "center", color: "#34D399",
    fontSize: 16, fontWeight: 800, letterSpacing: 1
  },
  pointsAfterRow: {
    marginTop: 12, padding: "10px 16px",
    background: "rgba(245,158,11,0.06)",
    borderRadius: 8, textAlign: "center",
    fontSize: 14, color: "#FCD34D"
  },

  payBannerCash: { display:"flex", alignItems:"center", gap:20, marginTop:20,
    padding:"24px 32px", background:"rgba(16,185,129,0.08)",
    border:"2px solid #10B981", borderRadius:18 },
  payBannerQris: { display:"flex", alignItems:"center", gap:20, marginTop:20,
    padding:"24px 32px", background:"rgba(59,130,246,0.08)",
    border:"2px solid #3B82F6", borderRadius:18 },
  payIcon: { fontSize:56 },
  payContent: { flex:1 },
  payLabel: { fontSize:13, color:"#888", letterSpacing:2, fontWeight:700,
    marginBottom:4 },
  payMethodBig: { fontSize:42, fontWeight:900, color:"#fff", letterSpacing:2 },

  // Cash transparency (Step 4A — kembalian visible to customer)
  cashTransparencyBox: {
    background: "rgba(16,185,129,0.06)",
    border: "2px solid #10B981",
    borderRadius: 18, padding: "20px 28px",
    marginTop: 20
  },
  cashTransparencyHeader: {
    fontSize: 13, color: "#10B981", letterSpacing: 3,
    fontWeight: 800, marginBottom: 12
  },
  cashTransparencyRow: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", padding: "6px 0"
  },
  cashTrLabel: { fontSize: 18, color: "#fff", fontWeight: 500 },
  cashTrValue: {
    fontSize: 22, color: "#fff", fontWeight: 700,
    fontFamily: "'Inter',sans-serif", letterSpacing: 1
  },
  cashTransparencyChange: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", padding: "12px 0 0",
    marginTop: 8, borderTop: "1px dashed rgba(16,185,129,0.3)"
  },
  cashTrChangeLabel: {
    fontSize: 18, color: "#34D399", fontWeight: 700
  },
  cashTrChangeValue: {
    fontSize: 48, color: "#34D399", fontWeight: 900,
    fontFamily: "'Inter',sans-serif", letterSpacing: 2
  },
  cashTransparencyShort: {
    marginTop: 12, padding: "10px 16px",
    background: "rgba(252,211,77,0.1)",
    color: "#FCD34D", fontSize: 14,
    borderRadius: 8, textAlign: "center"
  },

  verifyNotice: { display:"flex", alignItems:"flex-start", gap:16, marginTop:20,
    padding:"20px 28px", background:"rgba(245,158,11,0.06)",
    border:"1px solid rgba(245,158,11,0.3)", borderRadius:14 },
  verifyIcon: { fontSize:28, lineHeight:1 },
  verifyText: { flex:1, fontSize:15, color:"#fff", lineHeight:1.6, fontWeight:500 },
  verifyEmphasis: { color:"#FF6B35", fontWeight:700 },
  verifyName: { display:"inline-block", padding:"3px 14px", margin:"0 4px",
    background:"rgba(245,158,11,0.18)", color:"#FF6B35", borderRadius:8,
    fontWeight:800, letterSpacing:0.5,
    border:"1px solid rgba(245,158,11,0.4)" },

  qrMain: { flex:1, display:"flex", flexDirection:"column", alignItems:"center",
    justifyContent:"center", gap:16, padding:40, textAlign:"center" },
  qrTitle: { fontSize:56, fontFamily:"'Inter',sans-serif", color:"#FF6B35",
    letterSpacing:4, marginBottom:80 },
  qrFrame: { padding:24, background:"#fff", borderRadius:24,
    boxShadow:"0 0 60px rgba(245,158,11,0.3)" },
  qrImage: { width:360, height:360, objectFit:"contain", display:"block" },
  qrLoading: { width:360, height:360, display:"flex", flexDirection:"column",
    alignItems:"center", justifyContent:"center", color:"#666" },
  loader: { fontSize:64, marginBottom:12 },
  qrHint: { fontSize:18, color:"#aaa", marginTop:24, lineHeight:1.6 },
  qrAmountBox: { marginTop:32, padding:"20px 40px",
    background:"#111", border:"2px solid #F59E0B", borderRadius:16,
    display:"flex", flexDirection:"column", alignItems:"center" },
  subLabel: { fontSize:14, color:"#888", letterSpacing:2, fontWeight:600 },
  qrAmount: { fontSize:72, fontFamily:"'Inter',sans-serif", color:"#FF6B35",
    letterSpacing:4, marginTop:4 },

  successCheck: { fontSize:72, lineHeight:1, marginBottom:8 },
  successTitle: { fontSize:48, fontFamily:"'Inter',sans-serif", color:"#10B981",
    letterSpacing:5, marginBottom:16 },
  successOrderId: { fontSize:24, color:"#888", marginBottom:8 },
  successAmount: { fontSize:60, fontFamily:"'Inter',sans-serif", color:"#FF6B35",
    letterSpacing:5, marginBottom:24 },
  successThanks: { fontSize:28, color:"#fff", marginBottom:40 },

  trackQrMain: { flex:1, padding:"32px 60px", display:"flex", flexDirection:"column",
    alignItems:"center", textAlign:"center", overflowY:"auto" },
  trackQrTitle: { fontSize:64, fontFamily:"'Inter',sans-serif", color:"#FF6B35",
    letterSpacing:4, marginBottom:80 },
  trackQrSubtitle: { fontSize:20, color:"#fff", marginBottom:32 },
  trackQrFrame: { padding:20, background:"#fff", borderRadius:24,
    boxShadow:"0 0 80px rgba(245,158,11,0.25)", marginBottom:24 },
  trackQrImage: { width:420, height:420, objectFit:"contain", display:"block" },
  trackQrHint: { fontSize:18, color:"#aaa", lineHeight:1.6, marginBottom:24,
    maxWidth:480 },
  warnBox: { padding:"14px 20px", background:"rgba(255,107,53,0.1)",
    border:"1px solid #FF6B35", borderRadius:12, fontSize:13, color:"#FF6B35",
    maxWidth:540, marginBottom:16, lineHeight:1.5 },
  urlBox: { fontSize:13, color:"#666", padding:"8px 16px",
    background:"#0a0a0a", border:"1px solid #222", borderRadius:8,
    fontFamily:"monospace", marginBottom:24, wordBreak:"break-all", maxWidth:540 },
  totalRow: { display:"flex", flexDirection:"column", alignItems:"center",
    marginTop:8 },
  totalBig: { fontSize:64, fontFamily:"'Inter',sans-serif", color:"#FF6B35",
    letterSpacing:4, marginTop:4 }
};
