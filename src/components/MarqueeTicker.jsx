// src/components/MarqueeTicker.jsx
// Reusable scrolling marquee — text jalan untuk Cinema kiosk, POSCDS, POSHome, FlowApp.
// Auto-fetch /api/marquee?surface=... atau accept items via prop.
// Refresh tiap 60s. CSS animation-based (anti-jank, GPU-accelerated).

import { useState, useEffect } from "react";

const VARIANT = {
  // Dark surfaces (cinema kiosk, POSCDS, POSHome dengan dark theme)
  dark: {
    bg: "rgba(8,9,15,0.85)",
    border: "rgba(255,255,255,0.08)",
    label: "#fbbf24",
    text: "#e6edf3",
    shadow: "0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
  },
  // Light surface (FlowApp light theme if any)
  light: {
    bg: "#fff7ed",
    border: "#fde68a",
    label: "#b45309",
    text: "#0f172a",
    shadow: "0 4px 16px rgba(245,158,11,0.15), inset 0 1px 0 rgba(255,255,255,0.4)",
  },
};

export default function MarqueeTicker({
  surface = "kiosk",
  apiBase = "",
  items: itemsProp,            // optional: kalau diisi, skip fetch
  speed = 60,                  // detik untuk full loop
  variant = "dark",
  height = 40,
  refreshSec = 60,
  label = "LIVE",
  hideIfEmpty = true,
}) {
  const [items, setItems] = useState(itemsProp || []);

  useEffect(() => {
    if (itemsProp) { setItems(itemsProp); return; }
    let cancel = false;
    const fetchItems = () => {
      fetch(`${apiBase}/api/marquee?surface=${encodeURIComponent(surface)}`)
        .then(r => r.json())
        .then(d => { if (!cancel && Array.isArray(d?.items)) setItems(d.items); })
        .catch(() => {});
    };
    fetchItems();
    const t = setInterval(fetchItems, refreshSec * 1000);
    return () => { cancel = true; clearInterval(t); };
  }, [surface, apiBase, itemsProp, refreshSec]);

  if (hideIfEmpty && !items.length) return null;
  const v = VARIANT[variant] || VARIANT.dark;
  // Duplicate items biar loop seamless (CSS marquee classic trick)
  const stream = [...items, ...items];

  return (
    <div style={{
      position: "relative", width: "100%", height,
      background: v.bg, borderTop: `1px solid ${v.border}`, borderBottom: `1px solid ${v.border}`,
      overflow: "hidden", boxShadow: v.shadow, display: "flex", alignItems: "center",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    }}>
      {/* Label fixed kiri */}
      <div style={{
        flexShrink: 0, padding: "0 14px", height: "100%",
        display: "flex", alignItems: "center", gap: 8,
        background: `linear-gradient(90deg, ${v.bg}, transparent)`,
        position: "relative", zIndex: 2,
        fontFamily: "'Geist Mono',monospace", fontSize: 10, fontWeight: 800,
        letterSpacing: 2, color: v.label, textTransform: "uppercase",
      }}>
        <span style={{
          display: "inline-block", width: 7, height: 7, borderRadius: 999,
          background: v.label, animation: "marqueePulse 1.4s ease-in-out infinite",
        }} />
        {label}
      </div>

      {/* Scrolling content */}
      <div style={{
        flex: 1, overflow: "hidden", height: "100%", display: "flex", alignItems: "center",
      }}>
        <div style={{
          display: "inline-flex", whiteSpace: "nowrap", gap: 0,
          animation: `marqueeScroll ${speed}s linear infinite`,
        }}>
          {stream.map((it, i) => (
            <span key={`${it.id}-${i}`} style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "0 24px", fontSize: 13, fontWeight: 600, letterSpacing: 0.2,
              color: v.text, lineHeight: 1,
            }}>
              <span style={{ fontSize: 14, opacity: 0.95 }}>{it.icon}</span>
              <span style={{ color: it.color || v.text }}>{it.text}</span>
              <span style={{ opacity: 0.25, padding: "0 8px" }}>•</span>
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes marqueeScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes marqueePulse { 0%,100% { opacity: 0.4; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.05); } }
      `}</style>
    </div>
  );
}
