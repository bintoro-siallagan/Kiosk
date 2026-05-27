// src/components/PushPermissionPrompt.jsx
// Pre-prompt for Web Push permission. Industry best practice — show a friendly
// in-app card BEFORE triggering the browser's generic "Allow notifications?"
// dialog. Once the browser dialog is declined, you can never re-prompt, so
// the pre-prompt protects you from accidental "Block" choices.
//
// Renders only if browser supports push AND Notification.permission === 'default'.
// On Allow → calls subscribeToOrderPush() which triggers the real browser prompt.
// On "Not now" → dismiss + 24h cooldown via localStorage.

import { useEffect, useState } from "react";
import { isPushSupported, subscribeToOrderPush } from "../lib/push.js";

const STORAGE_KEY = "karyaos_push_prompt_dismissed";
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

function wasDismissed() {
  try {
    const ts = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    return ts && (Date.now() - ts) < COOLDOWN_MS;
  } catch { return false; }
}

export default function PushPermissionPrompt({ orderId, phone, brandName }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    if (Notification.permission !== "default") return; // already granted/denied
    if (wasDismissed()) return;
    // Small delay so the receipt animates in first
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  async function allow() {
    setBusy(true);
    try {
      const result = await subscribeToOrderPush({ orderId, phone });
      // Whatever the result (subscribed/denied/error), close the pre-prompt
      if (result === "subscribed") {
        // Optimistic — clear cooldown so they never see again
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
      } else {
        dismiss();
      }
    } finally {
      setBusy(false);
      setVisible(false);
    }
  }

  if (!visible) return null;

  return (
    <div style={S.card}>
      <style>{KEYFRAMES}</style>
      <div style={S.iconBox}>
        <div style={S.bell}>🔔</div>
        <div style={S.ring} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.title}>Aktifkan notifikasi</div>
        <div style={S.body}>
          Kami akan kasih tau saat pesanan kamu siap diambil — bahkan kalau tab ini ditutup.
        </div>
      </div>
      <div style={S.actions}>
        <button onClick={dismiss} disabled={busy} style={S.btnGhost} aria-label="Not now">Nanti</button>
        <button onClick={allow} disabled={busy} style={S.btnPrimary}>
          {busy ? "..." : "Aktifkan"}
        </button>
      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes pushPromptSlideIn { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
@keyframes pushPromptBellRing { 0%,15%,100% { transform: rotate(0) } 5% { transform: rotate(-12deg) } 10% { transform: rotate(10deg) } }
@keyframes pushPromptRing { 0% { transform: scale(0.6); opacity: 0.6 } 100% { transform: scale(1.6); opacity: 0 } }
`;

const S = {
  card: {
    margin: "14px 0", padding: "14px 16px", borderRadius: 16,
    background: "linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)",
    backdropFilter: "blur(24px) saturate(180%)",
    WebkitBackdropFilter: "blur(24px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.1)",
    display: "flex", alignItems: "center", gap: 12,
    fontFamily: "'Inter', sans-serif",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 12px 28px rgba(0,0,0,0.35)",
    animation: "pushPromptSlideIn 0.45s cubic-bezier(.2,.8,.2,1)",
  },
  iconBox: { position: "relative", width: 44, height: 44, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center" },
  bell: { fontSize: 28, display: "block", animation: "pushPromptBellRing 3s ease-in-out infinite",
    filter: "drop-shadow(0 2px 8px color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent))" },
  ring: { position: "absolute", inset: 0, borderRadius: "50%",
    border: "2px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent)",
    animation: "pushPromptRing 2.4s ease-out infinite", pointerEvents: "none" },
  title: { fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.2px", marginBottom: 2 },
  body: { fontSize: 12, color: "rgba(205,213,223,0.7)", letterSpacing: "-0.1px", lineHeight: 1.4 },
  actions: { display: "flex", gap: 6, alignItems: "center", flexShrink: 0 },
  btnGhost: {
    padding: "8px 12px", borderRadius: 9, fontSize: 12, fontWeight: 600,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(205,213,223,0.7)", cursor: "pointer", fontFamily: "inherit",
  },
  btnPrimary: {
    padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700,
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.2,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)",
  },
};
