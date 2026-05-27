// src/components/PWAInstallPrompt.jsx
// White-label P3C — PWA install hint banner.
// Listens for `beforeinstallprompt`, shows subtle bottom-banner offering install.
// iOS gets fallback "Tap Share → Add to Home Screen" instructions.
// Dismissible + persisted via localStorage (7-day cooldown).

import { useEffect, useState } from "react";

const STORAGE_KEY = "karyaos_pwa_install_dismissed";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function wasDismissed() {
  try {
    const ts = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    return ts && (Date.now() - ts) < COOLDOWN_MS;
  } catch { return false; }
}

export default function PWAInstallPrompt({ brandName = "karyaos" }) {
  const [deferred, setDeferred] = useState(null);
  const [showIos, setShowIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;

    // Android / Chrome / Edge — captures the native install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS fallback — no beforeinstallprompt, show manual instructions after 5s
    if (isIOS()) {
      const t = setTimeout(() => {
        if (!isStandalone() && !wasDismissed()) {
          setShowIos(true);
          setVisible(true);
        }
      }, 5000);
      return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", handler); };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") dismiss();
    setDeferred(null);
  }

  if (!visible) return null;

  return (
    <div style={S.banner}>
      <style>{KEYFRAMES}</style>
      <div style={S.icon}>📲</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.title}>Install {brandName} as app</div>
        <div style={S.subtitle}>
          {showIos
            ? "Tap the Share icon, then \"Add to Home Screen\""
            : "Quick access, full-screen, faster load"}
        </div>
      </div>
      <div style={S.actions}>
        {!showIos && (
          <button onClick={install} style={S.installBtn}>Install</button>
        )}
        <button onClick={dismiss} style={S.dismissBtn} aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}

const KEYFRAMES = `@keyframes pwa-slide-up { from { transform: translateY(120%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`;

const S = {
  banner: {
    position: "fixed", bottom: 16, left: 16, right: 16,
    maxWidth: 540, margin: "0 auto",
    background: "linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.025) 60%,rgba(255,255,255,0.012) 100%)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 18,
    padding: "14px 18px",
    display: "flex", alignItems: "center", gap: 14,
    zIndex: 9000,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 12px 32px rgba(0,0,0,0.45)",
    animation: "pwa-slide-up 0.4s cubic-bezier(.2,.8,.2,1)",
    fontFamily: "'Inter',sans-serif",
  },
  icon: { fontSize: 28, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))" },
  title: { fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.2px" },
  subtitle: { fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2, letterSpacing: "-0.1px" },
  actions: { display: "flex", alignItems: "center", gap: 6 },
  installBtn: {
    padding: "9px 18px", border: "1px solid rgba(255,255,255,0.16)",
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 600,
    fontFamily: "'Inter',sans-serif", letterSpacing: "-0.1px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)",
  },
  dismissBtn: {
    width: 28, height: 28, padding: 0,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.6)", borderRadius: "50%", cursor: "pointer", fontSize: 14, lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
};
