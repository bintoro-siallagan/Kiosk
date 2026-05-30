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

  // iOS path: visual step-by-step (Safari gak support install programmatic)
  if (showIos) {
    return (
      <div style={S.iosCard}>
        <style>{KEYFRAMES}</style>
        <button onClick={dismiss} style={S.iosDismiss} aria-label="Tutup">✕</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>📲</div>
          <div style={S.iosTitle}>Pasang {brandName} ke Home Screen</div>
          <div style={S.iosSub}>Akses cepat seperti app, full-screen tanpa browser bar</div>
        </div>
        <div style={S.iosSteps}>
          <div style={S.iosStep}>
            <div style={S.iosStepNum}>1</div>
            <div style={{ flex: 1 }}>
              <div style={S.iosStepText}>Tap tombol <b>Share</b> di bawah Safari</div>
              <div style={S.iosStepHint}>
                <span style={S.iosShareIcon}>
                  <svg width="18" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </span>
                <span>ikon kotak dengan panah ke atas</span>
              </div>
            </div>
          </div>
          <div style={S.iosStep}>
            <div style={S.iosStepNum}>2</div>
            <div style={{ flex: 1 }}>
              <div style={S.iosStepText}>Scroll, pilih <b>"Add to Home Screen"</b></div>
              <div style={S.iosStepHint}>
                <span style={{ fontSize: 16 }}>➕</span>
                <span>Tambah ke Home Screen</span>
              </div>
            </div>
          </div>
          <div style={S.iosStep}>
            <div style={S.iosStepNum}>3</div>
            <div style={{ flex: 1 }}>
              <div style={S.iosStepText}>Tap <b>"Add"</b> kanan atas</div>
              <div style={S.iosStepHint}>Icon karyaOS langsung tampil di home screen</div>
            </div>
          </div>
        </div>
        {/* Arrow animated pointing to Safari share button (bottom-center on iOS) */}
        <div style={S.iosArrow}>
          <div style={{ fontSize: 32, animation: "bounce-down 1.5s ease-in-out infinite" }}>↓</div>
          <div style={S.iosArrowText}>Tap Share di bawah</div>
        </div>
      </div>
    );
  }

  // Android / desktop Chrome — native install prompt
  return (
    <div style={S.banner}>
      <style>{KEYFRAMES}</style>
      <div style={S.icon}>📲</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.title}>Pasang {brandName} sebagai app</div>
        <div style={S.subtitle}>Akses cepat, full-screen, lebih ringan</div>
      </div>
      <div style={S.actions}>
        <button onClick={install} style={S.installBtn}>Pasang</button>
        <button onClick={dismiss} style={S.dismissBtn} aria-label="Tutup">✕</button>
      </div>
    </div>
  );
}

const KEYFRAMES = `
  @keyframes pwa-slide-up { from { transform: translateY(120%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
  @keyframes bounce-down { 0%, 100% { transform: translateY(0); opacity: 0.85 } 50% { transform: translateY(8px); opacity: 1 } }
`;

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
  // iOS step-by-step card (Safari gak support beforeinstallprompt — wajib manual)
  iosCard: {
    position: "fixed", bottom: 16, left: 16, right: 16,
    maxWidth: 420, margin: "0 auto",
    background: "linear-gradient(180deg,#0d1117 0%,#161b22 100%)",
    border: "1px solid rgba(96,165,250,0.30)",
    borderRadius: 20, padding: 20,
    zIndex: 9100, boxShadow: "0 20px 60px rgba(0,0,0,0.65)",
    animation: "pwa-slide-up 0.5s cubic-bezier(.2,.8,.2,1)",
    fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
  },
  iosDismiss: {
    position: "absolute", top: 12, right: 12, width: 30, height: 30, padding: 0,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.6)", borderRadius: "50%", cursor: "pointer", fontSize: 14,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  iosTitle: { fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: -0.3, marginTop: 4 },
  iosSub: { fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4, lineHeight: 1.5 },
  iosSteps: { display: "flex", flexDirection: "column", gap: 12, marginTop: 16 },
  iosStep: {
    display: "flex", gap: 12, padding: "10px 12px", background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, alignItems: "flex-start",
  },
  iosStepNum: {
    width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#60a5fa,#a855f7)",
    color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  iosStepText: { fontSize: 13, color: "#e6edf3", lineHeight: 1.4 },
  iosStepHint: { fontSize: 11, color: "#9da7b3", marginTop: 4, display: "inline-flex", alignItems: "center", gap: 6 },
  iosShareIcon: { display: "inline-flex", padding: 3, background: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.30)", borderRadius: 5 },
  iosArrow: { textAlign: "center", marginTop: 14, color: "#60a5fa" },
  iosArrowText: { fontSize: 10, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", opacity: 0.7 },
};
