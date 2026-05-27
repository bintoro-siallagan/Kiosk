import { useState, useEffect, useRef } from "react";
import { api } from "./api.js";
import POSSatisfaction from "./POS/POSSatisfaction.jsx";
import POSCelebration from "./POS/POSCelebration.jsx";
import LeaderboardModal from "./LeaderboardModal.jsx";
import PushPermissionPrompt from "./components/PushPermissionPrompt.jsx";
import API_HOST from "./apiBase.js";


const STAGES = [
  { key: "waiting",   label: "Diterima",     emoji: "📝", color: "#94A3B8" },
  { key: "preparing", label: "Preparing",    emoji: "👨‍🍳", color: "#F59E0B" },
  { key: "ready",     label: "Siap Diambil", emoji: "🔔", color: "#10B981" },
  { key: "completed", label: "Done",      emoji: "✅", color: "#22C55E" },
];

import { fmtMoney as fIDR } from "./lib/currency.js";

export default function CustomerTrackingPage({ orderId }) {
  const [order, setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [loyalty, setLoyalty] = useState(null);

  // Full-screen page — escape the 1126px #root width cap (index.css).
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const pw = root.style.width, pm = root.style.maxWidth;
    root.style.width = "100%"; root.style.maxWidth = "none";
    return () => { root.style.width = pw; root.style.maxWidth = pm; };
  }, []);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const intervalRef = useRef(null);

  const fetchOrder = async () => {
    try {
      const data = await api.getOrder(orderId);
      if (data?.customerId) {
        api.getCustomerLoyalty(data.customerId).then(setLoyalty).catch(()=>{});
      }
      if (data?.error) { setError(data.error); }
      else { setOrder(data); setError(null); }
    } catch (e) {
      setError("Koneksi gagal — coba refresh halaman");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orderId) { setLoading(false); setError("Order ID tidak ditemukan"); return; }
    fetchOrder();
    intervalRef.current = setInterval(fetchOrder, 5000);
    return () => clearInterval(intervalRef.current);
  }, [orderId]);

  useEffect(() => {
    if (order && ["completed","cancelled"].includes(order.status)) {
      clearInterval(intervalRef.current);
    }
  }, [order?.status]);

  // Tracking selesai → minta feedback kepuasan (sekali per order)
  useEffect(() => {
    if (order?.status === "completed" && !localStorage.getItem(`fb_done_${orderId}`)) {
      const t = setTimeout(() => setShowFeedback(true), 2500);
      return () => clearTimeout(t);
    }
  }, [order?.status, orderId]);

  if (loading) return (
    <div style={S.root}>
      <div style={S.spinner}/>
      <div style={S.muted}>Memuat pesanan…</div>
    </div>
  );

  if (error || !order) return (
    <div style={S.root}>
      <div style={{fontSize:64,textAlign:"center",marginTop:40}}>⚠️</div>
      <div style={S.h2}>Tidak Ditemukan</div>
      <div style={S.muted}>{error || "Order tidak ditemukan"}</div>
    </div>
  );

  const cancelled = order.status === "cancelled";
  const currentIdx = STAGES.findIndex(s => s.key === order.status);

  return (
    <div style={S.root}>
      <div style={S.brand}>KaryaOS</div>
      <div style={S.muted}>SELF ORDER KIOSK</div>

      <PushPermissionPrompt orderId={order.id} phone={order.customer_phone} />

      <button onClick={() => setShowLeaderboard(true)}
        style={{ display: "block", margin: "12px auto 4px", padding: "11px 22px", background: "linear-gradient(135deg,#fbbf24,#f97316)", color: "#1a1006", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(249,115,22,0.35)" }}>
        🏆 Lihat Leaderboard Sultan
      </button>

      <div style={S.card}>
        <div style={S.orderNo}>#{order.id}</div>
        <div style={S.orderType}>
          {order.type === "dine" ? `🪑 Dine In • Meja ${order.table}` : "🛍️ Bawa Pulang"}
        </div>
        {order.customerName && <div style={S.customer}>{order.customerName}</div>}
        {loyalty && (
          <div style={{margin:"16px auto",maxWidth:360,padding:"14px 18px",background:"linear-gradient(135deg,rgba(251,146,60,0.12),rgba(245,158,11,0.06))",border:"1px solid rgba(251,146,60,0.3)",borderRadius:12,textAlign:"center"}}>
            <div style={{fontSize:10,letterSpacing:1.5,color:"#FB923C",marginBottom:4}}>🎁 SALDO POIN KAMU</div>
            <div style={{fontSize:28,fontWeight:800,color:"#FB923C",fontFamily:"'Geist Mono',monospace"}}>{loyalty.points.toLocaleString("id-ID")} pt</div>
            {order.pointsEarned > 0 && (
              <div style={{fontSize:11,color:"#34D399",marginTop:6}}>+ {order.pointsEarned} dari pesanan ini</div>
            )}
            {order.pointsRedeemed > 0 && (
              <div style={{fontSize:11,color:"#888",marginTop:2}}>Pakai {order.pointsRedeemed} pt untuk hemat Rp {(order.pointsDiscount||0).toLocaleString("id-ID")}</div>
            )}
            <div style={{fontSize:9,color:"#666",marginTop:8,letterSpacing:0.5}}>
              {loyalty.redeemRate} poin = Rp 1.000 diskon · min {loyalty.minRedeemPoints} poin
            </div>
          </div>
        )}
      </div>

      {cancelled ? (
        <div style={{...S.card, background:"#3F1212", textAlign:"center"}}>
          <div style={{fontSize:48}}>❌</div>
          <div style={{fontSize:18,fontWeight:700,color:"#FCA5A5",marginTop:8}}>Pesanan Dibatalkan</div>
        </div>
      ) : (
        <div style={S.timeline}>
          {STAGES.map((stage, i) => {
            const isPast = i < currentIdx, isCurrent = i === currentIdx;
            return (
              <div key={stage.key} style={S.stage}>
                <div style={{
                  ...S.stageBubble,
                  background: isPast || isCurrent ? stage.color : "#1F2937",
                  color: isPast || isCurrent ? "#fff" : "#475569",
                  animation: isCurrent ? "tpulse 1.6s ease-in-out infinite" : "none",
                  transform: isCurrent ? "scale(1.1)" : "scale(1)",
                }}>{stage.emoji}</div>
                <div style={{
                  ...S.stageLabel,
                  color: isPast || isCurrent ? "#E2E8F0" : "#64748B",
                  fontWeight: isCurrent ? 700 : 400,
                }}>{stage.label}</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardTitle}>PESANAN ANDA</div>
        {(order.items||[]).map((it,i) => {
          const toppings = it.addons?.toppings || [];
          const explicitTotal = toppings.reduce((s,t)=>s+(t.price||0),0);
          const extraCharge = Math.max(0, (it.addonTotal||0) - explicitTotal);
          return (
            <div key={i} style={{padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <span style={{fontWeight:600,flex:1}}>{it.q}× {it.e} {it.n}</span>
                <span style={{fontWeight:600,minWidth:80,textAlign:"right"}}>{fIDR(it.p * it.q)}</span>
              </div>
              {toppings.map((t,j) => {
                const linePrice = (t.price||0) * (it.q||1);
                return (
                  <div key={j} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#94A3B8",marginLeft:14,marginTop:3,lineHeight:1.4}}>
                    <span>+ {t.name}</span>
                    <span style={{color: linePrice>0 ? "#94A3B8" : "#34D399"}}>
                      {linePrice>0 ? fIDR(linePrice) : "gratis"}
                    </span>
                  </div>
                );
              })}
              {extraCharge > 0 && (
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#94A3B8",marginLeft:14,marginTop:3,lineHeight:1.4}}>
                  <span>+ Topping ekstra</span>
                  <span>{fIDR(extraCharge * (it.q||1))}</span>
                </div>
              )}
            </div>
          );
        })}
        {/* BOGO free items */}
        {(order.promoFreeItems||[]).map((fi,i) => (
          <div key={`free-${i}`} style={{padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <span style={{fontWeight:700,flex:1,color:"#34D399"}}>🎁 {fi.qty}× {fi.name}</span>
              <span style={{fontWeight:700,minWidth:80,textAlign:"right",color:"#34D399"}}>GRATIS</span>
            </div>
          </div>
        ))}
        <div style={S.divider}/>
        <div style={S.totalRow}>
          <span>TOTAL</span>
          <span style={{color:"#F59E0B"}}>{fIDR(order.total)}</span>
        </div>
      </div>

      <div style={S.footer}>🔄 Status auto-update tiap 5 detik</div>

      <style>{`
        @keyframes tpulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.6); }
          50%     { box-shadow: 0 0 0 14px rgba(245,158,11,0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        html, body { background: #050810; margin: 0; padding: 0; width: 100%; }
        * { box-sizing: border-box; }
        @media (max-width: 500px) {
          /* Ensure phone fills naturally */
        }
      `}</style>

      {showFeedback && (
        <POSSatisfaction
          order={{ ref: order.id, cashier: order.cashier || order.kasir }}
          apiBase={API_HOST}
          source="qr"
          onDone={() => { localStorage.setItem(`fb_done_${orderId}`, "1"); setShowFeedback(false); setShowCelebration(true); }}
        />
      )}
      {showCelebration && (
        <POSCelebration
          order={{ ref: order.id, total: order.total || order.subtotal, customer: order.customer_name || order.customerName }}
          apiBase={API_HOST}
          onDone={() => setShowCelebration(false)}
        />
      )}
      {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} />}
    </div>
  );
}

const S = {
  root: {
    minHeight: "100vh",
    background: "#050810",
    padding: "clamp(12px, 3vw, 24px) clamp(12px, 4vw, 32px) clamp(20px, 5vw, 40px)",
    width: "100%",
    maxWidth: "min(96vw, 720px)",
    margin: "0 auto",
    boxSizing: "border-box",
    color: "#F1F5F9",
    fontFamily: "'Inter',-apple-system,sans-serif",
    display: "flex",
    flexDirection: "column",
    gap: "clamp(8px, 2vw, 16px)",
  },
  brand: {
    fontSize: "clamp(20px, 6vw, 32px)",
    fontWeight: 800,
    letterSpacing: "clamp(2px, 1vw, 6px)",
    textAlign: "center",
    background: "linear-gradient(90deg,#F59E0B,#F97316)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    marginTop: 4,
  },
  muted: {
    fontSize: "clamp(9px, 2.5vw, 12px)",
    color: "#64748B",
    textAlign: "center",
    letterSpacing: 2,
  },
  card: {
    background: "#0F172A",
    border: "1px solid #1F2937",
    borderRadius: "clamp(10px, 2vw, 16px)",
    padding: "clamp(12px, 3vw, 20px)",
  },
  orderNo: {
    fontSize: "clamp(26px, 8vw, 44px)",
    fontWeight: 800,
    color: "#F59E0B",
    textAlign: "center",
    fontFamily: "'Geist Mono',monospace",
    lineHeight: 1,
  },
  orderType: {
    fontSize: "clamp(11px, 3vw, 14px)",
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 6,
  },
  customer: {
    fontSize: "clamp(12px, 3vw, 15px)",
    color: "#E2E8F0",
    textAlign: "center",
    marginTop: 6,
  },
  timeline: {
    background: "#0F172A",
    border: "1px solid #1F2937",
    borderRadius: "clamp(10px, 2vw, 16px)",
    padding: "clamp(14px, 3vw, 22px) clamp(8px, 2vw, 14px)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  stage: { flex: 1, textAlign: "center", minWidth: 0 },
  stageBubble: {
    width: "clamp(40px, 10vw, 56px)",
    height: "clamp(40px, 10vw, 56px)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "clamp(18px, 5vw, 26px)",
    margin: "0 auto 6px",
    transition: "all 0.3s",
  },
  stageLabel: {
    fontSize: "clamp(9px, 2.5vw, 12px)",
    transition: "all 0.3s",
    lineHeight: 1.2,
  },
  cardTitle: {
    fontSize: "clamp(9px, 2.5vw, 12px)",
    color: "#64748B",
    letterSpacing: 2,
    marginBottom: 10,
  },
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "clamp(8px, 2vw, 12px) 0",
    borderBottom: "1px solid #1F2937",
    fontSize: "clamp(12px, 3vw, 15px)",
  },
  divider: { height: 1, background: "#1F2937", margin: "clamp(8px, 2vw, 14px) 0" },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "clamp(15px, 4vw, 20px)",
    fontWeight: 700,
    paddingTop: 2,
  },
  footer: {
    fontSize: "clamp(9px, 2.5vw, 12px)",
    color: "#475569",
    textAlign: "center",
    marginTop: 6,
  },
  spinner: {
    width: 30, height: 30,
    border: "3px solid #1F2937",
    borderTop: "3px solid #F59E0B",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "40px auto 14px",
  },
  h2: {
    fontSize: "clamp(16px, 5vw, 22px)",
    fontWeight: 700,
    textAlign: "center",
    marginTop: 8,
  },
};
