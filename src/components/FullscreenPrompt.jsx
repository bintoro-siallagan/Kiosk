// karyaOS — Reusable auto-fullscreen prompt
// Tampil sekali saat surface dibuka kalau browser belum fullscreen (dan bukan PWA standalone).
// Tap → masuk fullscreen (browser bar hidden). ESC untuk exit.
// Dismissible via Skip kalau user gak mau.
//
// Usage:
//   <FullscreenPrompt
//     icon="🖥️"
//     label="POS CASHIER"
//     title="Tap to Enter Fullscreen"
//     description="Header browser hidden untuk fokus penuh saat melayani customer."
//     kioskHint="chrome --kiosk https://app.karyaos.tech/?pos"
//   />
import { useState, useEffect, useCallback } from "react";

export default function FullscreenPrompt({
  icon = "🖥️",
  label = "DISPLAY",
  title = "Tap to Enter Fullscreen",
  description = "Browser bar akan hidden untuk pengalaman full-screen.",
  kioskHint = null,
  storageKey = null,           // optional — kalau di-set, dismissal disimpan di localStorage
  brandColor = "#fbbf24",      // gold default — overridable per surface (cinema gold, cyan kitchen, dll)
}) {
  const [needFullscreen, setNeedFullscreen] = useState(() => {
    if (typeof document === "undefined") return false;
    if (document.fullscreenElement || document.webkitFullscreenElement) return false;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return false;
    // Skip jika user pernah dismiss surface ini di window ini (sessionStorage = per-window/tab,
    // bukan localStorage — penting untuk multi-monitor POS biar tiap window masih bisa prompt sendiri)
    if (storageKey && typeof sessionStorage !== "undefined") {
      if (sessionStorage.getItem(`fsPromptDismissed:${storageKey}`) === "1") return false;
    }
    return true;
  });

  const goFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      setNeedFullscreen(false);
    } catch (e) {
      console.warn("[FS] fullscreen denied:", e?.message);
      setNeedFullscreen(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    setNeedFullscreen(false);
    if (storageKey && typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(`fsPromptDismissed:${storageKey}`, "1");
    }
  }, [storageKey]);

  useEffect(() => {
    const onFs = () => {
      if (document.fullscreenElement || document.webkitFullscreenElement) setNeedFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  if (!needFullscreen) return null;

  return (
    <div onClick={goFullscreen} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.94)", zIndex: 99997,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      color: "#fff", cursor: "pointer", padding: 20, backdropFilter: "blur(20px)",
      fontFamily: "'Inter','SF Pro Text',system-ui,sans-serif",
    }}>
      <div style={{ fontSize: 80, marginBottom: 24, filter: `drop-shadow(0 0 28px ${brandColor}55)` }}>{icon}</div>
      <div style={{
        fontSize: 11, color: brandColor, letterSpacing: 3, fontFamily: "'Geist Mono',monospace",
        fontWeight: 800, textTransform: "uppercase", marginBottom: 12,
      }}>● {label}</div>
      <div style={{
        fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 900, color: "#fff",
        letterSpacing: -0.8, marginBottom: 14, textAlign: "center",
        textShadow: `0 0 24px ${brandColor}66`,
      }}>{title}</div>
      <div style={{
        fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 28,
        textAlign: "center", maxWidth: 480, lineHeight: 1.55,
      }}>
        {description}<br />
        Tekan <kbd style={{
          padding: "2px 8px", background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4,
          fontFamily: "monospace", fontSize: 13,
        }}>ESC</kbd> kapan saja untuk keluar fullscreen.
      </div>
      <button onClick={(e) => { e.stopPropagation(); goFullscreen(); }} style={{
        padding: "16px 36px",
        background: `linear-gradient(135deg, ${brandColor}, ${shade(brandColor, -20)})`,
        color: contrastInk(brandColor), border: "none", borderRadius: 14,
        fontSize: 16, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
        letterSpacing: 0.4, boxShadow: `0 10px 30px ${brandColor}77`,
      }}>{icon} Aktifkan Fullscreen →</button>
      <button onClick={(e) => { e.stopPropagation(); dismiss(); }} style={{
        marginTop: 16, padding: "8px 16px", background: "transparent",
        color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
      }}>{storageKey ? "Skip (jangan tampilkan lagi)" : "Skip (tetap dgn browser bar)"}</button>
      {kioskHint && (
        <div style={{
          marginTop: 32, fontSize: 11, color: "rgba(255,255,255,0.4)",
          fontFamily: "'Geist Mono',monospace", letterSpacing: 1,
          textAlign: "center", lineHeight: 1.6,
        }}>
          💡 TIP: Untuk auto-fullscreen permanent, jalankan Chrome dengan flag<br />
          <code style={{ color: "#22d3ee" }}>{kioskHint}</code>
        </div>
      )}
    </div>
  );
}

// helpers — color shading + contrast ink
function shade(hex, percent) {
  try {
    const f = parseInt(hex.slice(1), 16);
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent) / 100;
    const R = f >> 16, G = (f >> 8) & 0xff, B = f & 0xff;
    const r = Math.round((t - R) * p) + R;
    const g = Math.round((t - G) * p) + G;
    const b = Math.round((t - B) * p) + B;
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  } catch { return hex; }
}
function contrastInk(hex) {
  try {
    const f = parseInt(hex.slice(1), 16);
    const R = f >> 16, G = (f >> 8) & 0xff, B = f & 0xff;
    const yiq = (R * 299 + G * 587 + B * 114) / 1000;
    return yiq >= 128 ? "#1a1205" : "#fff";
  } catch { return "#fff"; }
}
