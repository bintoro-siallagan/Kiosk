// karyaOS — Professional Connection Error Screen
// Reusable error screen with auto-retry, plain-language messaging,
// and graceful degradation. Used wherever API fetch fails.
import { useEffect, useState } from "react";

const COLORS = {
  bg: "#050810",
  surface: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  text: "#e6edf3",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  warn: "#f59e0b",
  err: "#ef4444",
  accent: "#a855f7",
};

/**
 * Classify raw error message into user-friendly category + action.
 * Returns { kind, title, hint, retryable }
 */
export function classifyError(rawMsg) {
  const msg = String(rawMsg || "").toLowerCase();
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("err_internet") || msg.includes("err_network")) {
    return {
      kind: "network",
      title: "Sambungan sedang dipulihkan",
      hint: "Please wait sebentar — kami akan terhubung kembali secara otomatis.",
      retryable: true,
    };
  }
  if (msg.includes("timeout") || msg.includes("etimedout") || msg.includes("aborted")) {
    return {
      kind: "timeout",
      title: "Sedang memproses permintaan Anda",
      hint: "Proses memerlukan waktu lebih lama dari biasanya. Mohon menunggu sebentar.",
      retryable: true,
    };
  }
  if (msg.match(/\b5\d{2}\b/) || msg.includes("internal server")) {
    return {
      kind: "server",
      title: "Layanan sedang dipersiapkan",
      hint: "Mohon menunggu sebentar — kami akan kembali melayani Anda segera.",
      retryable: true,
    };
  }
  if (msg.match(/\b401\b/) || msg.includes("unauthorized")) {
    return {
      kind: "auth",
      title: "Sesi Anda telah berakhir",
      hint: "Silakan masuk kembali untuk melanjutkan.",
      retryable: false,
    };
  }
  if (msg.match(/\b403\b/) || msg.includes("forbidden")) {
    return {
      kind: "forbidden",
      title: "Akses tidak tersedia",
      hint: "Modul ini tidak termasuk dalam paket akses Anda.",
      retryable: false,
    };
  }
  if (msg.match(/\b404\b/) || msg.includes("not found")) {
    return {
      kind: "notfound",
      title: "Data belum tersedia",
      hint: "Konten yang Anda minta sedang dipersiapkan.",
      retryable: false,
    };
  }
  return {
    kind: "generic",
    title: "Mohon menunggu sebentar",
    hint: "Kami sedang menyempurnakan pengalaman Anda.",
    retryable: true,
  };
}

/**
 * Compact inline error — for use inside drawers, cards, panels.
 * Props: { error, onRetry, label?, compact? }
 */
export function ErrorInline({ error, onRetry, label, compact = false }) {
  const info = classifyError(error?.message || error);
  return (
    <div style={{
      padding: compact ? "10px 14px" : "16px 18px",
      background: "rgba(239,68,68,0.06)",
      border: "1px solid rgba(239,68,68,0.2)",
      borderRadius: 10,
      color: COLORS.text,
      fontSize: compact ? 12 : 13,
      fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ fontSize: compact ? 16 : 18, marginTop: 1 }}>⚠</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "#fca5a5", marginBottom: 2 }}>{label || info.title}</div>
          <div style={{ color: COLORS.textMuted, lineHeight: 1.45 }}>{info.hint}</div>
          {info.retryable && onRetry && (
            <button onClick={onRetry} style={{
              marginTop: 8, padding: "5px 12px",
              background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.35)",
              borderRadius: 6, color: COLORS.accent, fontSize: 11, fontWeight: 700,
              fontFamily: "inherit", cursor: "pointer", letterSpacing: 0.3,
            }}>↻ Coba lagi</button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Full-screen connection error with auto-retry countdown + manual retry.
 * Use for app-shell-level failures (kiosk, POS, admin home).
 *
 * Props: { error, onRetry, autoRetryMs?, title?, subtitle? }
 */
export default function ConnectionError({ error, onRetry, autoRetryMs = 8000, title, subtitle }) {
  const info = classifyError(error?.message || error);
  const [countdown, setCountdown] = useState(Math.round(autoRetryMs / 1000));
  const [attempt, setAttempt] = useState(1);

  useEffect(() => {
    if (!info.retryable || !onRetry) return;
    setCountdown(Math.round(autoRetryMs / 1000));
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((autoRetryMs - (Date.now() - startedAt)) / 1000));
      setCountdown(left);
      if (left <= 0) {
        clearInterval(tick);
        setAttempt(a => a + 1);
        try { onRetry(); } catch {}
      }
    }, 250);
    return () => clearInterval(tick);
  }, [attempt, info.retryable, autoRetryMs, onRetry]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: `radial-gradient(900px 600px at 50% 30%, rgba(168,85,247,0.06), transparent 60%), ${COLORS.bg}`,
      color: COLORS.text, fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 99999,
    }}>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        {/* Iconography */}
        <div style={{
          width: 86, height: 86, margin: "0 auto 22px",
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.04) 60%, transparent 70%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}>
          <div style={{
            fontSize: 38,
            filter: "drop-shadow(0 0 12px rgba(239,68,68,0.4))",
          }}>{info.kind === "network" ? "📡" : info.kind === "timeout" ? "⏱️" : info.kind === "server" ? "🛠️" : info.kind === "auth" ? "🔒" : info.kind === "forbidden" ? "🚫" : "⚠️"}</div>
          {info.retryable && onRetry && (
            <PulseRing />
          )}
        </div>

        {/* Title */}
        <div style={{ fontSize: 11, color: COLORS.accent, letterSpacing: 3, fontFamily: "'Geist Mono','SF Mono',monospace", fontWeight: 800, marginBottom: 6 }}>
          karyaOS · STATUS
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text, marginBottom: 10, letterSpacing: -0.3, lineHeight: 1.3 }}>
          {title || info.title}
        </div>
        <div style={{ fontSize: 14, color: COLORS.textMuted, lineHeight: 1.55, marginBottom: 28 }}>
          {subtitle || info.hint}
        </div>

        {/* Auto-retry indicator */}
        {info.retryable && onRetry && (
          <div style={{
            padding: "14px 18px", background: COLORS.surface,
            border: `1px solid ${COLORS.border}`, borderRadius: 12,
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: COLORS.textMuted }}>
              <span>Mencoba kembali otomatis…</span>
              <span style={{ color: COLORS.text, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: "'Geist Mono',monospace" }}>
                {countdown}s
              </span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
              <div style={{
                width: `${((autoRetryMs/1000 - countdown) / (autoRetryMs/1000)) * 100}%`,
                height: "100%", background: COLORS.accent,
                transition: "width 0.25s linear",
              }} />
            </div>
            <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 8, fontFamily: "'Geist Mono',monospace" }}>
              ATTEMPT #{attempt}
            </div>
          </div>
        )}

        {/* Manual actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {info.retryable && onRetry && (
            <button onClick={() => { setAttempt(a => a + 1); try { onRetry(); } catch {} }} style={{
              padding: "11px 22px",
              background: `linear-gradient(135deg, ${COLORS.accent}, #7c3aed)`,
              border: "none", borderRadius: 10, color: "#fff",
              fontSize: 13, fontWeight: 800, fontFamily: "inherit", letterSpacing: 0.5,
              cursor: "pointer", boxShadow: "0 8px 22px rgba(168,85,247,0.35)",
            }}>↻ Coba Sekarang</button>
          )}
          <button onClick={() => window.location.reload()} style={{
            padding: "11px 22px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, color: COLORS.text,
            fontSize: 13, fontWeight: 700, fontFamily: "inherit",
            cursor: "pointer",
          }}>Muat Ulang Halaman</button>
        </div>

        {/* Technical detail collapsible — opt-in for staff/admin */}
        {(error?.message || (typeof error === "string" && error)) && (
          <details style={{ marginTop: 22, textAlign: "left" }}>
            <summary style={{ fontSize: 11, color: COLORS.textDim, cursor: "pointer", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace", textAlign: "center" }}>
              Untuk Petugas Outlet
            </summary>
            <pre style={{
              marginTop: 10, padding: 12,
              background: "rgba(0,0,0,0.35)", border: `1px solid ${COLORS.border}`,
              borderRadius: 8, fontSize: 10, color: COLORS.textMuted,
              fontFamily: "'Geist Mono',monospace", overflow: "auto",
              maxHeight: 120, whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{String(error?.message || error)}</pre>
          </details>
        )}

        {/* Footer */}
        <div style={{ marginTop: 26, fontSize: 10, color: COLORS.textDim, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace" }}>
          karyaOS · {new Date().toLocaleTimeString("id-ID")}
        </div>
      </div>
    </div>
  );
}

function PulseRing() {
  return (
    <>
      <style>{`
        @keyframes karyaPulseRing {
          0%   { transform: scale(0.6); opacity: 0.7; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
      <div aria-hidden style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        border: "2px solid rgba(168,85,247,0.5)",
        animation: "karyaPulseRing 1.6s ease-out infinite",
      }} />
    </>
  );
}

/**
 * Full-screen loading shell — graceful while initial fetch in-flight.
 * Use as the "Loading menu…" replacement.
 */
export function LoadingScreen({ label = "Memuat sistem", sub = "Tunggu sebentar…" }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: COLORS.bg,
      color: COLORS.text, fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
      display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18,
    }}>
      <style>{`
        @keyframes karyaSpin { to { transform: rotate(360deg); } }
        @keyframes karyaShimmer { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
      `}</style>
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        border: "2.5px solid rgba(168,85,247,0.15)",
        borderTopColor: COLORS.accent,
        animation: "karyaSpin 0.9s linear infinite",
      }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: COLORS.accent, fontWeight: 800, fontFamily: "'Geist Mono',monospace", marginBottom: 6 }}>karyaOS</div>
        <div style={{ fontSize: 14, color: COLORS.text, fontWeight: 600, animation: "karyaShimmer 1.6s ease-in-out infinite" }}>{label}</div>
        <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>{sub}</div>
      </div>
    </div>
  );
}
