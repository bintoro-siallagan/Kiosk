// src/POS/FirstOrderCelebration.jsx
//
// Special celebration modal saat transaksi pertama kasir hari ini.
// Bikin pagi pertama buka shift terasa ritual — bukan rutin.
// Trigger: dari POSMenu setelah checkout pertama (cek localStorage flag).

import { useEffect } from "react";

export default function FirstOrderCelebration({ cashierName, orderId, onClose }) {
  // Auto-dismiss after 6 seconds — non-blocking
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  const h = new Date().getHours();
  const greet = h >= 5 && h < 11 ? "Selamat Pagi"
              : h >= 11 && h < 15 ? "Selamat Siang"
              : h >= 15 && h < 18 ? "Selamat Sore"
              : "Selamat Malam";

  return (
    <div onClick={onClose} style={S.backdrop}>
      <style>{KEYFRAMES}</style>
      <div onClick={e => e.stopPropagation()} style={S.modal}>
        {/* Confetti emoji float */}
        {[...Array(8)].map((_, i) => (
          <span key={i} style={{
            position: "absolute", top: 20, left: `${10 + i * 11}%`,
            fontSize: 22, animation: `firstOrderConfetti 1.6s ease-out ${i * 0.08}s infinite`,
          }}>{["🎉", "✨", "💛", "🌟", "🎊", "⭐", "💫", "🥳"][i]}</span>
        ))}
        <div style={S.iconHero}>🌟</div>
        <div style={S.eyebrow}>✦ TRANSAKSI PERTAMA HARI INI ✦</div>
        <div style={S.title}>{greet}{cashierName ? `, ${cashierName}` : ""}</div>
        <div style={S.body}>
          Hari Anda baru saja dimulai dengan baik.
          <br/>
          <b>Order #{orderId}</b> tercatat — semoga semuanya lancar.
        </div>
        <div style={S.cta} onClick={onClose}>
          Lanjut Layani →
        </div>
      </div>
    </div>
  );
}

const KEYFRAMES = `
  @keyframes firstOrderPop { 0% { opacity: 0; transform: scale(0.85) translateY(8px) } 60% { transform: scale(1.04) } 100% { opacity: 1; transform: scale(1) translateY(0) } }
  @keyframes firstOrderConfetti { 0% { transform: translateY(0) rotate(0deg); opacity: 1 } 100% { transform: translateY(40px) rotate(180deg); opacity: 0 } }
`;

const S = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)",
    backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 10000, padding: 20, cursor: "pointer",
    fontFamily: "'Inter',sans-serif",
  },
  modal: {
    position: "relative",
    background: "linear-gradient(180deg, rgba(251,191,36,0.18) 0%, rgba(245,158,11,0.05) 40%, rgba(0,0,0,0.6) 100%)",
    border: "1px solid rgba(251,191,36,0.40)",
    borderRadius: 24, padding: "44px 36px 32px",
    width: "min(420px, 92vw)", textAlign: "center",
    boxShadow: "0 24px 80px rgba(0,0,0,0.65), 0 0 60px rgba(251,191,36,0.25), inset 0 1px 0 rgba(255,255,255,0.10)",
    animation: "firstOrderPop 0.6s cubic-bezier(.34,1.56,.64,1)",
    overflow: "hidden",
  },
  iconHero: {
    fontSize: 84, lineHeight: 1, margin: "0 auto 12px",
    filter: "drop-shadow(0 0 32px rgba(251,191,36,0.6))",
    position: "relative", zIndex: 1,
  },
  eyebrow: {
    fontSize: 10, color: "#fbbf24", letterSpacing: 3,
    fontFamily: "'Geist Mono',monospace", fontWeight: 800,
    marginBottom: 10, textShadow: "0 0 16px rgba(251,191,36,0.45)",
  },
  title: {
    fontSize: 28, fontWeight: 900, color: "#fff",
    lineHeight: 1.2, letterSpacing: -0.6, marginBottom: 14,
    textShadow: "0 2px 16px rgba(0,0,0,0.5)",
  },
  body: {
    fontSize: 14, color: "rgba(255,255,255,0.78)",
    lineHeight: 1.6, marginBottom: 22, fontStyle: "italic",
  },
  cta: {
    display: "inline-block", padding: "12px 28px",
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    color: "#1a1205", borderRadius: 12, cursor: "pointer",
    fontSize: 14, fontWeight: 800, letterSpacing: 0.3,
    boxShadow: "0 8px 24px rgba(251,191,36,0.4)",
  },
};
