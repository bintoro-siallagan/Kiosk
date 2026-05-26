// src/PromoBroadcastBanner.jsx
// Banner promo broadcast — nempel di POS / Kiosk / QR Order / digital signage.
// Polling /api/broadcast/active tiap 20 detik; muncul kalau admin lagi push promo.

import { useState, useEffect } from "react";
import API_HOST from "./apiBase.js";

const API = API_HOST;

export default function PromoBroadcastBanner() {
  const [promo, setPromo] = useState(null);

  useEffect(() => {
    let alive = true;
    const poll = () => fetch(`${API}/api/broadcast/active`)
      .then(r => r.json())
      .then(d => { if (alive) setPromo(d && d.active ? d.active : null); })
      .catch(() => {});
    poll();
    const t = setInterval(poll, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!promo) return null;
  const accent = promo.accent || "#f97316";

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999,
      background: `linear-gradient(90deg, ${accent}, ${accent}bb)`,
      color: "#fff", padding: "11px 20px", display: "flex", alignItems: "center",
      justifyContent: "center", gap: 14, flexWrap: "wrap",
      fontFamily: "system-ui,-apple-system,sans-serif",
      boxShadow: "0 4px 22px rgba(0,0,0,0.45)", animation: "promoSlide .4s ease-out",
    }}>
      <span style={{ fontSize: 22, animation: "promoPulse 1.4s infinite", display: "inline-block" }}>📣</span>
      <div style={{ textAlign: "center" }}>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.3 }}>{promo.title}</span>
        {promo.message && <span style={{ fontSize: 14, opacity: 0.95, marginLeft: 10 }}>{promo.message}</span>}
      </div>
      {promo.code && (
        <span style={{ background: "rgba(255,255,255,0.22)", borderRadius: 6, padding: "3px 12px", fontWeight: 800, fontSize: 14, letterSpacing: 1 }}>
          {promo.code}
        </span>
      )}
      <style>{`@keyframes promoSlide{from{transform:translateY(-100%)}to{transform:translateY(0)}}@keyframes promoPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.28)}}`}</style>
    </div>
  );
}
