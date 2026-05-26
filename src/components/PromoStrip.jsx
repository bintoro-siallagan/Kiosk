// src/components/PromoStrip.jsx
// Compact promo banner strip — tampil daftar promo F&B aktif sebagai pills.
// Customer (FlowApp) tap → copy kode ke clipboard. Kasir (POSHome) info only.
// Auto-refresh tiap 60s.

import { useEffect, useState } from "react";

export default function PromoStrip({
  apiBase = "",
  variant = "dark",        // dark | light
  maxItems = 6,
  onCopyToast,             // optional callback ke parent buat trigger toast
  compact = false,         // compact = single row, scroll horizontal
}) {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPromos = () => {
      fetch(`${apiBase}/api/promos`)
        .then(r => r.json())
        .then(d => {
          const list = Array.isArray(d) ? d : (d?.promos || []);
          // Filter active + sort: highest discount first
          const active = list
            .filter(p => p.active !== false && (!p.validUntil || p.validUntil > Date.now()))
            .sort((a, b) => (b.value || 0) - (a.value || 0))
            .slice(0, maxItems);
          setPromos(active);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    fetchPromos();
    const t = setInterval(fetchPromos, 60000);
    return () => clearInterval(t);
  }, [apiBase, maxItems]);

  if (loading || promos.length === 0) return null;

  const isDark = variant === "dark";
  const palette = isDark
    ? { bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.25)", label: "#fbbf24", text: "#fff", sub: "rgba(255,255,255,0.6)" }
    : { bg: "#fff7ed", border: "#fde68a", label: "#b45309", text: "#1f2937", sub: "#6b7280" };

  const copy = (code) => {
    try {
      navigator.clipboard?.writeText(code);
      if (typeof onCopyToast === "function") onCopyToast(`Kode "${code}" disalin`);
    } catch {}
  };

  return (
    <div style={{
      background: palette.bg, border: `1px solid ${palette.border}`,
      borderRadius: 14, padding: compact ? "10px 12px" : "12px 14px",
      animation: "promoStripFade 0.3s ease-out",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8, gap: 8,
      }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, fontWeight: 800, letterSpacing: 2, color: palette.label, textTransform: "uppercase" }}>
          🎁 PROMO AKTIF
        </div>
        <div style={{ fontSize: 10, color: palette.sub }}>tap untuk salin kode</div>
      </div>
      <div style={{
        display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4,
        scrollbarWidth: "thin",
      }}>
        {promos.map(p => {
          const valLabel = p.type === "percentage" ? `${p.value}% OFF`
                        : p.type === "fixed" ? `Rp ${(p.value || 0).toLocaleString("id-ID")} OFF`
                        : p.type === "bogo" ? "Beli 1 Gratis 1"
                        : `${p.value || ""}`;
          return (
            <button key={p.id || p.code}
              onClick={() => p.code && copy(p.code)}
              title={p.desc || p.code}
              style={{
                flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-start",
                padding: "9px 14px", background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
                border: `1px solid ${palette.border}`, borderRadius: 11,
                cursor: p.code ? "pointer" : "default", fontFamily: "inherit",
                transition: "transform 0.15s ease, border-color 0.15s ease, background 0.15s ease",
                gap: 2,
              }}
              onMouseEnter={e => { if (p.code) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.borderColor = palette.label; } }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = palette.border; }}>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, fontWeight: 800, color: palette.label, letterSpacing: 1.5 }}>
                {p.code || "PROMO"}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: palette.text }}>{valLabel}</span>
              {p.desc && <span style={{ fontSize: 10, color: palette.sub, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.desc}</span>}
            </button>
          );
        })}
      </div>
      <style>{`@keyframes promoStripFade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
