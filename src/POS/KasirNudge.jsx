// src/POS/KasirNudge.jsx
//
// Floating encouragement bubble untuk kasir saat sepi atau setelah milestone.
// Filosofi karyaOS: kasir kerja shift panjang, kalau sepi terasa lambat. Sistem
// hadir sebagai sahabat — kasih small nudge biar tetap semangat, bukan kosong.
//
// Trigger:
//   - Idle > 12 menit (no cart activity) → encouragement saat sepi
//   - Setiap 5/10/25/50 transaksi → micro celebration
//   - Optional: time-of-day specific
//
// UX: bottom-right floating bubble, fade in/out, auto-dismiss 8 detik,
// dismissible via tap. Non-intrusive — bisa di-ignore tanpa modal.

import { useState, useEffect, useRef } from "react";

const IDLE_MIN = 12 * 60 * 1000; // 12 menit
const AUTO_DISMISS_MS = 9000;

// Pool encouragement berdasar konteks
function pickIdleMessage(now) {
  const h = (now || new Date()).getHours();
  const morning = [
    "Pagi yg cerah. Tamu pertama segera datang...",
    "Sambil sepi, kopi dulu yuk biar fresh.",
    "Saat tenang gini cocok rapi-rapi counter.",
  ];
  const noon = [
    "Sebentar lagi rame jam makan siang.",
    "Coba cek menu — siapa tau ada yg perlu di-update.",
    "Tetap senyum, tamu siap datang.",
  ];
  const afternoon = [
    "Sore ngantuk? Tarik napas, lanjut lagi.",
    "Sebentar lagi crowd pulang kerja datang.",
    "Tetap semangat, hampir selesai shift.",
  ];
  const evening = [
    "Malam yang tenang. Tamu malam beda flow.",
    "Sebentar lagi waktunya nutup. Tetap fokus ya.",
    "Hampir sampai garis akhir hari, semangat.",
  ];
  const pool = h < 11 ? morning : h < 15 ? noon : h < 18 ? afternoon : evening;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickMilestoneMessage(count) {
  if (count === 5)  return { icon: "🌱", text: "5 transaksi sudah! Awal yang baik." };
  if (count === 10) return { icon: "✨", text: "10 transaksi! Performa solid hari ini." };
  if (count === 25) return { icon: "🔥", text: "25 transaksi — kerja kerasnya kelihatan." };
  if (count === 50) return { icon: "👑", text: "50 transaksi! Kasir sultan hari ini." };
  if (count === 100) return { icon: "🏆", text: "100 transaksi! Hari yg luar biasa." };
  if (count > 0 && count % 25 === 0) return { icon: "💎", text: `${count} transaksi! Konsisten, hebat.` };
  return null;
}

export default function KasirNudge({ cartActivity, txCount = 0, cashierName }) {
  const [nudge, setNudge] = useState(null); // { icon, text, kind }
  const idleTimerRef = useRef(null);
  const dismissTimerRef = useRef(null);
  const lastTxCountRef = useRef(txCount);

  // Track milestone — show celebration kalau txCount naik ke milestone
  useEffect(() => {
    if (txCount > lastTxCountRef.current) {
      const m = pickMilestoneMessage(txCount);
      if (m) {
        setNudge({ ...m, kind: "milestone" });
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = setTimeout(() => setNudge(null), AUTO_DISMISS_MS);
      }
      lastTxCountRef.current = txCount;
    }
  }, [txCount]);

  // Track idle — reset timer saat cart activity
  useEffect(() => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      // Jangan override milestone celebration
      setNudge(prev => {
        if (prev?.kind === "milestone") return prev;
        return { icon: "💛", text: pickIdleMessage(new Date()), kind: "idle" };
      });
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => setNudge(null), AUTO_DISMISS_MS);
    }, IDLE_MIN);
    return () => clearTimeout(idleTimerRef.current);
  }, [cartActivity]);

  useEffect(() => () => {
    clearTimeout(idleTimerRef.current);
    clearTimeout(dismissTimerRef.current);
  }, []);

  if (!nudge) return null;
  const isMilestone = nudge.kind === "milestone";
  const accent = isMilestone ? "rgba(251,191,36,0.45)" : "rgba(16,185,129,0.45)";
  const accentBg = isMilestone ? "rgba(251,191,36,0.10)" : "rgba(16,185,129,0.08)";
  const accentText = isMilestone ? "#fbbf24" : "#86efac";

  return (
    <div style={{ ...S.bubble, borderColor: accent, background: accentBg }}>
      <style>{KEYFRAMES}</style>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{nudge.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: accentText, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 4 }}>
            {isMilestone ? "✦ MILESTONE" : "✦ SAHABAT KASIR"}
          </div>
          <div style={{ fontSize: 13, color: "#fff", lineHeight: 1.45, fontWeight: 500 }}>
            {cashierName && isMilestone && `${cashierName}, `}{nudge.text}
          </div>
        </div>
        <button onClick={() => setNudge(null)} style={S.dismiss} aria-label="Tutup">✕</button>
      </div>
    </div>
  );
}

const KEYFRAMES = `
  @keyframes kasirNudgeIn { 0% { opacity: 0; transform: translateX(20px) translateY(8px) } 100% { opacity: 1; transform: translateX(0) translateY(0) } }
`;

const S = {
  bubble: {
    position: "fixed", bottom: 80, right: 18, zIndex: 9500,
    minWidth: 260, maxWidth: 360, padding: "12px 14px",
    border: "1px solid", borderRadius: 14,
    backdropFilter: "blur(14px) saturate(180%)",
    WebkitBackdropFilter: "blur(14px) saturate(180%)",
    boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
    fontFamily: "'Inter',sans-serif",
    animation: "kasirNudgeIn 0.4s cubic-bezier(.2,.8,.2,1)",
  },
  dismiss: {
    width: 24, height: 24, padding: 0,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.5)", borderRadius: "50%", cursor: "pointer", fontSize: 11,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
};
