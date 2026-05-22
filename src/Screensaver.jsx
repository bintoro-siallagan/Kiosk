import { useState, useEffect } from "react";
import * as audio from "./audio.js";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

export default function Screensaver({ onDismiss }) {
  const [config, setConfig] = useState({ enabled: true, intervalSec: 5, fadeMs: 800, tagline: "SENTUH UNTUK MEMESAN" });
  const [images, setImages] = useState([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    fetch(`${API_URL}/api/admin/screensaver-config`)
      .then(r => r.json())
      .then(data => {
        setConfig({ ...config, ...(data.config || {}) });
        setImages((data.images || []).map(img => `${API_URL}/screensaver/${img.name}`));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (images.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % images.length), (config.intervalSec || 5) * 1000);
    return () => clearInterval(t);
  }, [images.length, config.intervalSec]);

  const handleDismiss = () => {
    audio.playTap?.();
    onDismiss?.();
  };

  if (!config.enabled || images.length === 0) return null;

  return (
    <div onClick={handleDismiss} onTouchStart={handleDismiss}
      style={{ position:"fixed", inset:0, background:"#000", zIndex:99999, cursor:"pointer", overflow:"hidden", userSelect:"none" }}>
      {images.map((url, i) => (
        <img key={url} src={url} alt="" draggable={false}
          style={{
            position:"absolute", inset:0, width:"100%", height:"100%",
            objectFit:"cover",
            opacity: i === idx ? 1 : 0,
            transition: `opacity ${config.fadeMs}ms ease-in-out`,
          }}/>
      ))}
      {/* Bottom tagline */}
      <div style={{
        position:"absolute", bottom:60, left:0, right:0, textAlign:"center",
        color:"#fff", fontSize:24, letterSpacing:6, fontFamily:"'Inter', cursive",
        textShadow:"0 2px 12px rgba(0,0,0,0.8), 0 0 30px rgba(0,0,0,0.5)",
        animation:"screensaverPulse 2.5s ease-in-out infinite", pointerEvents:"none",
      }}>
        👆 {config.tagline}
      </div>
      <style>{`@keyframes screensaverPulse { 0%,100% { opacity:1; transform:translateY(0); } 50% { opacity:0.6; transform:translateY(-4px); } }`}</style>
    </div>
  );
}
