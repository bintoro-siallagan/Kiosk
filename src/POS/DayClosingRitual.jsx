// src/POS/DayClosingRitual.jsx
//
// Ceremonial pop saat shift / day closed — bukan sekedar "log out".
// Filosofi karyaOS: penutup hari adalah momen apresiasi atas kerja
// keras hari ini. Kasir/manager harus merasa dipeluk sebelum pulang.

import { useEffect } from "react";

export default function DayClosingRitual({ closedBy, summary, onDone }) {
  // Auto-dismiss after 7 seconds — biar bisa logout otomatis tapi gak rushed
  useEffect(() => {
    const t = setTimeout(onDone, 7000);
    return () => clearTimeout(t);
  }, [onDone]);

  const h = new Date().getHours();
  const farewell = h >= 18 || h < 5 ? "Selamat beristirahat"
                 : h >= 15 ? "Selamat menjalani sisa hari"
                 : "Selamat menjalankan sore";

  const stats = summary?.summary || summary || {};
  const txCount = stats.transactionCount || 0;
  const revenue = stats.grossRevenue || stats.netRevenue || 0;

  return (
    <div onClick={onDone} style={S.backdrop}>
      <style>{KEYFRAMES}</style>
      <div onClick={e => e.stopPropagation()} style={S.modal}>
        <div style={S.starField}>
          {[...Array(12)].map((_, i) => (
            <span key={i} style={{
              position: "absolute", top: `${10 + (i * 7) % 80}%`, left: `${(i * 13) % 90}%`,
              fontSize: 12 + (i % 3) * 4, opacity: 0.4,
              animation: `closingTwinkle 3s ease-in-out ${i * 0.2}s infinite`,
            }}>{["✨", "⭐", "💫"][i % 3]}</span>
          ))}
        </div>

        <div style={S.iconHero}>🌙</div>
        <div style={S.eyebrow}>✦ HARI INI SUDAH SELESAI ✦</div>
        <div style={S.title}>Terima Kasih{closedBy ? `, ${closedBy}` : ""}</div>
        <div style={S.body}>
          Hari ini sudah ditutup dengan baik.
          <br/>
          Kerja keras kapten tercatat — semoga besok lebih baik lagi.
        </div>

        {(txCount > 0 || revenue > 0) && (
          <div style={S.summaryRow}>
            {txCount > 0 && (
              <div style={S.statBox}>
                <div style={S.statValue}>{txCount}</div>
                <div style={S.statLabel}>TRANSAKSI</div>
              </div>
            )}
            {revenue > 0 && (
              <div style={S.statBox}>
                <div style={S.statValue}>Rp {Math.round(revenue / 1000)}K</div>
                <div style={S.statLabel}>OMZET</div>
              </div>
            )}
          </div>
        )}

        <div style={S.farewell}>{farewell}.</div>
        <div style={S.cta} onClick={onDone}>
          Sampai Jumpa →
        </div>
      </div>
    </div>
  );
}

const KEYFRAMES = `
  @keyframes closingPop { 0% { opacity: 0; transform: scale(0.85) translateY(8px) } 60% { transform: scale(1.04) } 100% { opacity: 1; transform: scale(1) translateY(0) } }
  @keyframes closingTwinkle { 0%, 100% { opacity: 0.3; transform: scale(1) } 50% { opacity: 0.8; transform: scale(1.2) } }
`;

const S = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
    backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 10000, padding: 20, cursor: "pointer",
    fontFamily: "'Inter',sans-serif",
  },
  modal: {
    position: "relative",
    background: "linear-gradient(180deg, rgba(99,102,241,0.20) 0%, rgba(67,56,202,0.08) 40%, rgba(0,0,0,0.7) 100%)",
    border: "1px solid rgba(99,102,241,0.40)",
    borderRadius: 28, padding: "48px 36px 36px",
    width: "min(440px, 92vw)", textAlign: "center",
    boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 80px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.10)",
    animation: "closingPop 0.7s cubic-bezier(.34,1.56,.64,1)",
    overflow: "hidden",
  },
  starField: { position: "absolute", inset: 0, pointerEvents: "none" },
  iconHero: {
    fontSize: 90, lineHeight: 1, margin: "0 auto 14px",
    filter: "drop-shadow(0 0 36px rgba(199,210,254,0.55))",
    position: "relative", zIndex: 1,
  },
  eyebrow: {
    fontSize: 10, color: "#a5b4fc", letterSpacing: 3,
    fontFamily: "'Geist Mono',monospace", fontWeight: 800,
    marginBottom: 12, textShadow: "0 0 14px rgba(165,180,252,0.45)",
    position: "relative", zIndex: 1,
  },
  title: {
    fontSize: 30, fontWeight: 900, color: "#fff",
    lineHeight: 1.2, letterSpacing: -0.6, marginBottom: 14,
    textShadow: "0 2px 16px rgba(0,0,0,0.5)",
    position: "relative", zIndex: 1,
  },
  body: {
    fontSize: 14, color: "rgba(255,255,255,0.78)",
    lineHeight: 1.6, marginBottom: 22, fontStyle: "italic",
    position: "relative", zIndex: 1,
  },
  summaryRow: {
    display: "flex", gap: 14, justifyContent: "center",
    marginBottom: 20, position: "relative", zIndex: 1,
  },
  statBox: {
    flex: 1, maxWidth: 140, padding: "12px 14px",
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 14, textAlign: "center",
  },
  statValue: {
    fontSize: 24, fontWeight: 900, color: "#fff", lineHeight: 1,
    fontFamily: "'Geist Mono',monospace", marginBottom: 6,
    textShadow: "0 0 12px rgba(199,210,254,0.40)",
  },
  statLabel: {
    fontSize: 9, color: "#a5b4fc", letterSpacing: 1.5,
    fontFamily: "'Geist Mono',monospace", fontWeight: 700,
  },
  farewell: {
    fontSize: 14, color: "#c7d2fe", marginBottom: 18,
    fontWeight: 600, letterSpacing: -0.2,
    position: "relative", zIndex: 1,
  },
  cta: {
    display: "inline-block", padding: "14px 30px",
    background: "linear-gradient(135deg, #6366f1, #4338ca)",
    color: "#fff", borderRadius: 14, cursor: "pointer",
    fontSize: 14, fontWeight: 800, letterSpacing: 0.3,
    boxShadow: "0 8px 24px rgba(99,102,241,0.40)",
    position: "relative", zIndex: 1,
  },
};
