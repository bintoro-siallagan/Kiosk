// karyaOS — Live Camera Capture (anti-fraud)
// Pakai MediaDevices.getUserMedia() → live stream → snapshot via canvas.
// TIDAK PAKAI <input type="file"> sehingga galeri tidak bisa diakses.
// Hanya foto real-time dari kamera yang diizinkan.
//
// Usage:
//   <CameraCapture facingMode="environment" onCapture={(dataUrl)=>...} />
//   <CameraCapture facingMode="user" label="Selfie Arrival" />
import { useCallback, useEffect, useRef, useState } from "react";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444";

export default function CameraCapture({
  facingMode = "environment",        // 'environment' (rear) | 'user' (front)
  onCapture,                          // (dataUrl) => void
  label = "Ambil Foto",
  maxDim = 1280,
  quality = 0.78,
  required = true,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = useCallback(async () => {
    setError(""); setBusy(true);
    try {
      // Check support
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Perangkat ini belum mendukung kamera web. Mohon gunakan HP atau browser modern.");
      }
      const constraints = {
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(()=>{});
      }
    } catch (e) {
      const msg = e?.name === "NotAllowedError" ? "Akses kamera ditolak. Mohon aktifkan izin kamera di pengaturan browser."
                 : e?.name === "NotFoundError"  ? "Kamera tidak terdeteksi pada perangkat ini."
                 : e?.name === "NotReadableError" ? "Kamera sedang digunakan oleh aplikasi lain."
                 : e?.message || "Kamera tidak dapat diaktifkan.";
      setError(msg);
    }
    setBusy(false);
  }, [facingMode]);

  // Open camera modal
  const openCam = async () => {
    setPreview(null);
    setOpen(true);
    // wait next frame for video element
    setTimeout(startStream, 100);
  };

  const closeCam = () => { stopStream(); setOpen(false); setError(""); };

  // Snapshot from video → canvas → dataURL
  const snap = () => {
    if (!videoRef.current || !streamRef.current) return;
    const v = videoRef.current;
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) { setError("Video belum siap, mohon tunggu sebentar lalu coba lagi."); return; }
    const scale = Math.min(1, maxDim / Math.max(vw, vh));
    const w = Math.round(vw * scale), h = Math.round(vh * scale);
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    // Mirror front camera so preview matches what user sees
    if (facingMode === "user") {
      ctx.translate(w, 0); ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    setPreview(dataUrl);
    stopStream();
  };

  const accept = () => {
    if (!preview) return;
    onCapture?.(preview);
    setOpen(false);
    setPreview(null);
  };

  const retake = async () => { setPreview(null); await startStream(); };

  useEffect(() => () => stopStream(), [stopStream]);

  return (
    <>
      <button onClick={openCam} type="button" style={{
        width: "100%", display: "block", padding: 24,
        border: "2px dashed rgba(255,255,255,0.2)", borderRadius: 12,
        background: "rgba(0,0,0,0.2)", color: "#94a3b8",
        textAlign: "center", cursor: "pointer", fontFamily: "inherit",
      }}>
        <div style={{ fontSize: 40 }}>{facingMode === "user" ? "🤳" : "📸"}</div>
        <div style={{ fontSize: 13, marginTop: 6, fontWeight: 700, color: "#cbd5e1" }}>{label}</div>
        <div style={{ fontSize: 10, marginTop: 4, color: "#64748b" }}>Hanya kamera langsung — galeri tidak diizinkan</div>
      </button>

      {open && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)",
          zIndex: 99999, display: "flex", flexDirection: "column",
          fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
          color: "#fff",
        }}>
          {/* Header */}
          <div style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS · KAMERA LIVE</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{label}</div>
            </div>
            <button onClick={closeCam} style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.08)", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
          </div>

          {/* Video / Preview / Error area */}
          <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#000" }}>
            {error ? (
              <div style={{ padding: 30, textAlign: "center", maxWidth: 380 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Kamera belum dapat diaktifkan</div>
                <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.55, marginBottom: 20 }}>{error}</div>
                <button onClick={startStream} disabled={busy} style={primaryBtn(!busy)}>{busy ? "⏳ Mencoba…" : "↻ Coba Lagi"}</button>
              </div>
            ) : preview ? (
              <img src={preview} alt="" style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }} />
            ) : (
              <video ref={videoRef} playsInline muted autoPlay
                style={{
                  maxWidth: "100%", maxHeight: "100%", display: "block",
                  transform: facingMode === "user" ? "scaleX(-1)" : "none",
                }} />
            )}

            {/* Live indicator */}
            {!error && !preview && (
              <div style={{ position: "absolute", top: 16, left: 16, padding: "6px 12px", background: "rgba(239,68,68,0.85)", color: "#fff", borderRadius: 20, fontSize: 11, fontWeight: 800, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", display: "flex", alignItems: "center", gap: 6 }}>
                <PulseDot /> LIVE
              </div>
            )}

            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>

          {/* Bottom action bar */}
          <div style={{ padding: 20, borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.4)" }}>
            {preview ? (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={retake} style={secondaryBtn}>↻ Ambil Ulang</button>
                <button onClick={accept} style={primaryBtn(true)}>✓ Pakai Foto Ini</button>
              </div>
            ) : (
              <button onClick={snap} disabled={!!error || busy} style={{
                width: "100%", padding: "16px 20px",
                background: !error && !busy ? "#fff" : "rgba(255,255,255,0.1)",
                color: !error && !busy ? "#000" : "#64748b",
                border: "none", borderRadius: 14, fontSize: 16, fontWeight: 900,
                fontFamily: "inherit", letterSpacing: 0.5,
                cursor: !error && !busy ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, background: "#ef4444", border: "3px solid #000" }} />
                AMBIL FOTO
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PulseDot() {
  return (
    <>
      <style>{`@keyframes karyaLivePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: "#fff", animation: "karyaLivePulse 1.2s ease-in-out infinite" }} />
    </>
  );
}

const primaryBtn = (enabled) => ({
  flex: 1, padding: "14px 20px",
  background: enabled ? `linear-gradient(135deg,${GREEN},#059669)` : "rgba(255,255,255,0.06)",
  border: "none", borderRadius: 12, color: enabled ? "#fff" : "rgba(255,255,255,0.4)",
  fontSize: 14, fontWeight: 800, fontFamily: "inherit", letterSpacing: 0.5,
  cursor: enabled ? "pointer" : "not-allowed",
});

const secondaryBtn = {
  flex: 1, padding: "14px 20px",
  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 700,
  fontFamily: "inherit", cursor: "pointer",
};
