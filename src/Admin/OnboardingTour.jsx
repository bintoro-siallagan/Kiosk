// src/Admin/OnboardingTour.jsx
//
// First-time admin guided tour — 5 slide welcome ke karyaOS.
// Auto-show kalau localStorage 'karyaos:tour-completed' belum set.
// Manual replay via button di footer admin.

import { useState, useEffect } from "react";

const SLIDES = [
  {
    icon: "🏠",
    eyebrow: "SELAMAT DATANG DI KARYAOS",
    title: "Bukan platform — rumah",
    body: "Setiap titik sentuh customer, kasir, dapur, owner — punya presence yang hangat. karyaOS lahir dari satu prinsip: membantu orang yang dimulai dari 0.",
    accent: "#fbbf24",
  },
  {
    icon: "✨",
    eyebrow: "STEP 1 · BUKA OUTLET",
    title: "Setup outlet dalam 7 langkah",
    body: "Klik tombol ✨ Setup Outlet di topbar — wizard akan tuntun dari outlet master sampai signage. Resumable, smoke test otomatis. 5 menit, outlet siap jualan.",
    accent: "#a855f7",
  },
  {
    icon: "❤️",
    eyebrow: "STEP 2 · OWNER COCKPIT",
    title: "Tahu nadi outlet realtime",
    body: "Buka home admin — lihat: ⚠️ alert kalau ada bad rating, ❤️ nadi sekarang, 🎯 target hari, ✦ cerita per-row, 💛 surat kemarin. Owner = mission control.",
    accent: "#10b981",
  },
  {
    icon: "💛",
    eyebrow: "STEP 3 · DENGAR CUSTOMER",
    title: "Suara customer = cermin jujur",
    body: "Tiap struk punya QR rating. Customer scan → kasih bintang + komentar. Owner lihat di 💛 Suara Customer (filter outlet, per-channel, per-kasir). Bad rating = peluang tumbuh.",
    accent: "#f59e0b",
  },
  {
    icon: "🌱",
    eyebrow: "STEP 4 · MULAI",
    title: "Karya yang abadi dimulai sekarang",
    body: "Setup outlet pertama, undang kasir, terima order pertama hari ini. Setiap transaksi adalah cerita. Sistem ini akan menemani Anda — seperti ibu, seperti sahabat.",
    accent: "#ec4899",
    cta: "Mulai Pakai",
  },
];

export default function OnboardingTour({ onClose }) {
  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx];

  const next = () => setIdx(i => Math.min(SLIDES.length - 1, i + 1));
  const prev = () => setIdx(i => Math.max(0, i - 1));
  const finish = () => {
    try { localStorage.setItem("karyaos:tour-completed", String(Date.now())); } catch {}
    onClose?.();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === " ") next();
      else if (e.key === "ArrowLeft") prev();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [idx]);

  const isLast = idx === SLIDES.length - 1;

  return (
    <div style={S.backdrop} onClick={finish}>
      <style>{KEYFRAMES}</style>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <button onClick={finish} style={S.skipBtn}>Lewati</button>

        {/* Sparkle background */}
        <div style={S.sparkleField}>
          {[...Array(10)].map((_, i) => (
            <span key={i} style={{
              position: "absolute", top: `${5 + (i * 9) % 90}%`, left: `${(i * 11) % 95}%`,
              fontSize: 10 + (i % 3) * 4, opacity: 0.25,
              animation: `tourTwinkle 3s ease-in-out ${i * 0.2}s infinite`,
            }}>{["✨", "⭐", "💫"][i % 3]}</span>
          ))}
        </div>

        {/* Hero */}
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <div key={idx} style={{ ...S.icon, filter: `drop-shadow(0 0 32px ${slide.accent}66)` }}>
            {slide.icon}
          </div>
          <div style={{ ...S.eyebrow, color: slide.accent }}>{slide.eyebrow}</div>
          <h2 style={S.title}>{slide.title}</h2>
          <p style={S.body}>{slide.body}</p>
        </div>

        {/* Dots */}
        <div style={S.dotsRow}>
          {SLIDES.map((_, i) => (
            <span key={i} onClick={() => setIdx(i)} style={{
              ...S.dot,
              background: i === idx ? slide.accent : "rgba(255,255,255,0.15)",
              width: i === idx ? 24 : 8,
              cursor: "pointer",
            }} />
          ))}
        </div>

        {/* Nav buttons */}
        <div style={S.navRow}>
          <button onClick={prev} disabled={idx === 0} style={{ ...S.navBtn, opacity: idx === 0 ? 0.3 : 1, cursor: idx === 0 ? "not-allowed" : "pointer" }}>
            ← Sebelumnya
          </button>
          <button onClick={isLast ? finish : next} style={{ ...S.navBtn, ...S.navBtnPrimary, background: `linear-gradient(135deg, ${slide.accent}, ${slide.accent}cc)` }}>
            {isLast ? (slide.cta || "Selesai") + " 🌱" : "Lanjut →"}
          </button>
        </div>

        <div style={S.kbHint}>← → keyboard · Esc skip</div>
      </div>
    </div>
  );
}

const KEYFRAMES = `
  @keyframes tourSlideIn { 0% { opacity: 0; transform: scale(0.9) translateY(16px) } 100% { opacity: 1; transform: scale(1) translateY(0) } }
  @keyframes tourTwinkle { 0%, 100% { opacity: 0.2; transform: scale(1) } 50% { opacity: 0.6; transform: scale(1.3) } }
  @keyframes tourIconPop { 0% { transform: scale(0.6) rotate(-12deg); opacity: 0 } 60% { transform: scale(1.1) rotate(5deg) } 100% { transform: scale(1) rotate(0); opacity: 1 } }
`;

const S = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.86)",
    backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 10000, padding: 20, fontFamily: "'Inter',sans-serif",
  },
  modal: {
    position: "relative",
    background: "linear-gradient(180deg, #1a1d29 0%, #0d1117 100%)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 24, padding: "48px 36px 32px",
    width: "min(480px, 92vw)",
    boxShadow: "0 32px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)",
    animation: "tourSlideIn 0.5s cubic-bezier(.34,1.56,.64,1)",
    overflow: "hidden",
  },
  sparkleField: { position: "absolute", inset: 0, pointerEvents: "none" },
  skipBtn: {
    position: "absolute", top: 14, right: 14,
    padding: "6px 12px", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8,
    color: "rgba(255,255,255,0.55)", fontSize: 11, cursor: "pointer",
    fontFamily: "inherit", fontWeight: 600, zIndex: 2,
  },
  icon: {
    fontSize: 88, lineHeight: 1, marginBottom: 16,
    animation: "tourIconPop 0.7s cubic-bezier(.34,1.56,.64,1)",
  },
  eyebrow: {
    fontSize: 11, letterSpacing: 3, fontFamily: "'Geist Mono',monospace",
    fontWeight: 800, marginBottom: 10, textTransform: "uppercase",
  },
  title: {
    fontSize: 26, fontWeight: 900, color: "#fff", margin: 0, marginBottom: 14,
    letterSpacing: -0.6, lineHeight: 1.2,
    textShadow: "0 2px 16px rgba(0,0,0,0.5)",
  },
  body: {
    fontSize: 14, color: "rgba(255,255,255,0.78)", margin: 0,
    lineHeight: 1.6, maxWidth: 380, marginLeft: "auto", marginRight: "auto",
  },
  dotsRow: {
    display: "flex", justifyContent: "center", gap: 6,
    marginTop: 28, marginBottom: 20, position: "relative", zIndex: 1,
  },
  dot: {
    height: 8, borderRadius: 999,
    transition: "all 0.3s cubic-bezier(.2,.8,.2,1)",
  },
  navRow: {
    display: "flex", gap: 10, justifyContent: "space-between",
    position: "relative", zIndex: 1,
  },
  navBtn: {
    padding: "11px 18px", background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10,
    color: "#cbd5e1", fontSize: 13, fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: 0.3,
  },
  navBtnPrimary: {
    flex: 1, marginLeft: 10, color: "#0d1117", border: "none",
    fontWeight: 900, boxShadow: "0 6px 20px rgba(0,0,0,0.30)",
  },
  kbHint: {
    fontSize: 10, color: "rgba(255,255,255,0.30)",
    textAlign: "center", marginTop: 16, letterSpacing: 1,
    fontFamily: "'Geist Mono',monospace",
  },
};
