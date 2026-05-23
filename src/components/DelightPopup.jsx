// karyaOS — Delight Popup (gimick reusable)
// Usage:
//   <DelightPopup show={!!success} emoji="🎉" title="Yay!" sub="Tiket siap" confetti onClose={()=>setSuccess(false)} />
// Auto-dismisses after `duration` ms (default 3500). Pure CSS confetti, no deps.
import { useEffect } from "react";

export default function DelightPopup({
  show, emoji = "🎉", title = "Yay!", sub = "",
  confetti = true, duration = 3500, onClose,
  accent = "#a855f7",
}) {
  useEffect(() => {
    if (!show || !duration) return;
    const t = setTimeout(() => onClose?.(), duration);
    return () => clearTimeout(t);
  }, [show, duration, onClose]);
  if (!show) return null;
  return (
    <>
      <style>{`
        @keyframes karyaDelightPop { 0% { transform: scale(.6) translateY(20px); opacity: 0; } 60% { transform: scale(1.08) translateY(0); opacity: 1; } 100% { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes karyaDelightFall { 0% { transform: translateY(-30px) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0.3; } }
        @keyframes karyaDelightShake { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-8deg); } 75% { transform: rotate(8deg); } }
      `}</style>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(5,8,16,0.72)",
        zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", backdropFilter: "blur(2px)",
      }}>
        {confetti && (
          <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
            {Array.from({ length: 26 }).map((_, i) => {
              const colors = ["#a855f7", "#f59e0b", "#10b981", "#22d3ee", "#ef4444", "#fbbf24"];
              const c = colors[i % colors.length];
              const left = (i * 3.85) + Math.random() * 5;
              const delay = (i % 6) * 0.08 + Math.random() * 0.4;
              const dur = 1.6 + Math.random() * 1.6;
              const w = 6 + Math.floor(Math.random() * 8);
              const h = 8 + Math.floor(Math.random() * 10);
              return (
                <span key={i} style={{
                  position: "absolute", top: -20, left: left + "%",
                  width: w, height: h, background: c, borderRadius: 2,
                  animation: `karyaDelightFall ${dur}s ${delay}s linear forwards`,
                }} />
              );
            })}
          </div>
        )}
        <div style={{
          background: "linear-gradient(180deg,#0d1117 0%,#161b22 100%)",
          border: `2px solid ${accent}`, boxShadow: `0 0 60px ${accent}55, 0 0 120px ${accent}33`,
          borderRadius: 22, padding: "30px 40px", color: "#fff", textAlign: "center",
          maxWidth: 420, animation: "karyaDelightPop 0.45s cubic-bezier(0.18,1.2,0.4,1) forwards",
          fontFamily: "'Inter',sans-serif",
        }}>
          <div style={{ fontSize: 70, lineHeight: 1, display: "inline-block", animation: "karyaDelightShake 0.6s 0.4s ease-in-out" }}>{emoji}</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 10, letterSpacing: 0.5 }}>{title}</div>
          {sub && <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 6, lineHeight: 1.5 }}>{sub}</div>}
          <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", marginTop: 14 }}>TAP UNTUK TUTUP</div>
        </div>
      </div>
    </>
  );
}
