// src/Screensaver.jsx — kiosk attract-loop / idle screensaver.
//
// Modes (admin picks via /api/admin/screensaver-config; default "auto"):
//   - images : rotates uploaded images (legacy behavior)
//   - menu   : rotates live menu cards from /api/menu
//   - auto   : combo — alternates brand-hero → menu grid → uploaded images
//
// Always renders something (no more silent fail on empty images). Brand-aware:
// uses --brand-primary / --brand-secondary CSS vars set by parent Kiosk.

import { useState, useEffect } from "react";
import * as audio from "./audio.js";
import API_HOST from "./apiBase.js";
import { fmtMoney } from "./lib/currency.js";

const API_URL = API_HOST;

const DEFAULT_CONFIG = {
  enabled: true,
  mode: "auto",
  intervalSec: 8,
  fadeMs: 900,
  tagline: "SENTUH UNTUK MEMESAN",
};

const PREMIUM_BG = `
  radial-gradient(ellipse 60% 50% at 30% 20%, color-mix(in srgb, var(--brand-primary, #FF6B35) 28%, transparent) 0%, transparent 55%),
  radial-gradient(ellipse 55% 45% at 75% 80%, color-mix(in srgb, var(--brand-secondary, #E55A2B) 22%, transparent) 0%, transparent 55%),
  linear-gradient(160deg, #12141c 0%, #181b25 50%, #22253a 100%)
`;

export default function Screensaver({ onDismiss, brandName, brandLogo }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [images, setImages] = useState([]);
  const [menu, setMenu] = useState([]);
  const [bestsellers, setBestsellers] = useState([]);  // items dgn BESTSELLER/HOT tag
  const [promos, setPromos] = useState([]);            // active promo list
  const [phase, setPhase] = useState(0);
  const [now, setNow] = useState(() => new Date());

  // Load config + content
  useEffect(() => {
    fetch(`${API_URL}/api/admin/screensaver-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setConfig({ ...DEFAULT_CONFIG, ...(data.config || {}) });
          setImages((data.images || []).map(img => `${API_URL}/screensaver/${img.name}`));
        }
      })
      .catch(() => {});
    fetch(`${API_URL}/api/menu`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const items = (data?.items || data || [])
          .filter(m => m && (m.image_url || m.image) && m.is_available !== 0 && m.is_available !== false);
        setMenu(items.slice(0, 8));
        // Extract bestsellers: items dgn tag BESTSELLER/HOT/CHEF'S PICK
        const hot = items.filter(m => {
          const t = (m.tag || "").toUpperCase();
          return ["BESTSELLER", "BEST SELLER", "HOT TODAY", "HOT 🔥", "CHEF'S PICK"].includes(t);
        }).slice(0, 4);
        setBestsellers(hot.length > 0 ? hot : items.slice(0, 4));
      })
      .catch(() => {});
    // Load active promos (path: /api/promo singular, bukan /api/promotions)
    fetch(`${API_URL}/api/promo`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.items || data?.promos || []);
        setPromos(list.filter(p => p.active !== false).slice(0, 3));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const sec = Math.max(3, config.intervalSec || 8);
    const t = setInterval(() => setPhase(p => p + 1), sec * 1000);
    return () => clearInterval(t);
  }, [config.intervalSec]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const dismiss = () => {
    try { audio.playTap?.(); } catch {}
    onDismiss?.();
  };

  if (config.enabled === false) return null;

  const effectiveMode = config.mode || "auto";
  const slideKinds = [];
  if (effectiveMode === "images" && images.length > 0) slideKinds.push("image");
  else if (effectiveMode === "menu" && menu.length > 0) slideKinds.push("menu");
  else {
    // Auto mode — cinematic billboard rotation
    slideKinds.push("hero");
    if (bestsellers.length > 0) slideKinds.push("bestseller");  // 🔥 HOT TODAY drama
    if (menu.length > 0) slideKinds.push("menu");
    if (promos.length > 0) slideKinds.push("combo");            // 🎁 promo card
    if (images.length > 0) slideKinds.push("image");
  }
  if (slideKinds.length === 0) slideKinds.push("hero");
  const kind = slideKinds[phase % slideKinds.length];

  return (
    <div onClick={dismiss} onTouchStart={dismiss}
      style={{
        position: "fixed", inset: 0, background: PREMIUM_BG, color: "#fff",
        zIndex: 99999, cursor: "pointer", overflow: "hidden", userSelect: "none",
        fontFamily: "'Inter', sans-serif",
      }}>
      <style>{KEYFRAMES}</style>

      {/* Floating brand glow orbs */}
      <div style={S.orb1} />
      <div style={S.orb2} />

      {/* Top: brand mark + clock */}
      <div style={S.topBar}>
        <div style={S.brandRow}>
          <img src={brandLogo || "/logo.png"} alt="" style={S.brandLogo}
            onError={(e) => { e.currentTarget.style.display = "none"; }}/>
          <div style={S.brandName}>{brandName || (<>karya<span style={{ fontWeight: 300, opacity: 0.6 }}>os</span></>)}</div>
        </div>
        <div style={S.clock}>{now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>

      {/* Slide stage */}
      <div style={S.stage} key={phase /* re-mount for fade-in */}>
        {kind === "hero" && <HeroSlide brandName={brandName} brandLogo={brandLogo} />}
        {kind === "menu" && <MenuSlide items={menu} phase={phase} />}
        {kind === "bestseller" && <BestsellerSlide items={bestsellers} phase={phase} />}
        {kind === "combo" && <ComboSlide promos={promos} phase={phase} />}
        {kind === "image" && (
          <img src={images[phase % images.length]} alt="" draggable={false}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", animation: `screensaverFade ${config.fadeMs}ms ease-out`,
            }} />
        )}
      </div>

      {/* Bottom tap-CTA */}
      <div style={S.bottomCta}>
        <div style={S.fingerEmoji}>👆</div>
        <div style={S.tapText}>{config.tagline || "SENTUH UNTUK MEMESAN"}</div>
      </div>
    </div>
  );
}

// 🔥 BESTSELLER slide — dramatic "HOT TODAY" + single big food card
function BestsellerSlide({ items, phase }) {
  if (!items.length) return null;
  const item = items[phase % items.length];
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "60px",
      animation: "screensaverFade 0.9s ease-out",
    }}>
      <div style={{
        fontSize: "clamp(20px, 2.6vw, 32px)", fontWeight: 900,
        color: "#fbbf24", letterSpacing: 3, fontFamily: "'Geist Mono',monospace",
        textTransform: "uppercase", marginBottom: 14,
        textShadow: "0 0 24px rgba(251,191,36,0.55)",
        animation: "screensaverFade 0.6s ease",
      }}>🔥 BESTSELLER · HOT TODAY</div>
      {(item.image_url || item.image) ? (
        <img src={item.image_url || item.image} alt={item.name}
          style={{
            width: "min(440px, 50vw)", aspectRatio: "1/1", objectFit: "cover",
            borderRadius: 28, marginBottom: 28,
            boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 80px color-mix(in srgb,var(--brand-primary,#FF6B35) 30%,transparent), 0 0 0 4px rgba(251,191,36,0.4)",
            animation: "screensaverFade 1.2s ease",
          }}
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : (
        <div style={{ fontSize: 120, marginBottom: 28 }}>{item.emoji || "🍴"}</div>
      )}
      <div style={{
        fontSize: "clamp(36px, 5vw, 68px)", fontWeight: 900, color: "#fff",
        letterSpacing: -1.5, marginBottom: 12, textAlign: "center", lineHeight: 1,
        textShadow: "0 4px 20px rgba(0,0,0,0.6)",
      }}>{item.name}</div>
      <div style={{
        fontSize: "clamp(20px, 2.5vw, 32px)", fontWeight: 800,
        color: "color-mix(in srgb,var(--brand-primary,#FF6B35) 90%,#fff)",
        fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5,
        textShadow: "0 0 20px color-mix(in srgb,var(--brand-primary,#FF6B35) 50%,transparent)",
      }}>{fmtMoney(item.price || 0)}</div>
    </div>
  );
}

// 🎁 COMBO PROMO slide — dramatic active-promo card
function ComboSlide({ promos, phase }) {
  if (!promos.length) return null;
  const p = promos[phase % promos.length];
  const valLabel = p.type === "percentage" ? `${p.value}% OFF`
                 : p.type === "fixed" ? `Rp ${(p.value || 0).toLocaleString("id-ID")} OFF`
                 : p.type === "bogo" ? "BELI 1 GRATIS 1"
                 : p.value;
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "60px",
      animation: "screensaverFade 0.9s ease-out",
    }}>
      <div style={{
        fontSize: "clamp(20px, 2.6vw, 32px)", fontWeight: 900,
        color: "#fbbf24", letterSpacing: 3, fontFamily: "'Geist Mono',monospace",
        textTransform: "uppercase", marginBottom: 18,
        textShadow: "0 0 24px rgba(251,191,36,0.55)",
      }}>🎁 PROMO HARI INI</div>

      {/* Big discount value */}
      <div style={{
        fontSize: "clamp(80px, 12vw, 160px)", fontWeight: 900,
        background: "linear-gradient(180deg, #fbbf24, #f59e0b)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        letterSpacing: -5, lineHeight: 0.9, marginBottom: 14,
        textAlign: "center", fontFamily: "'Inter',sans-serif",
        filter: "drop-shadow(0 4px 30px rgba(251,191,36,0.5))",
      }}>{valLabel}</div>

      {/* Promo name */}
      <div style={{
        fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 800, color: "#fff",
        letterSpacing: -0.6, marginBottom: 10, textAlign: "center",
        textShadow: "0 2px 14px rgba(0,0,0,0.6)",
      }}>{p.name || p.desc || "Promo Spesial"}</div>

      {/* Promo code */}
      <div style={{
        padding: "10px 26px", borderRadius: 999,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
        border: "2px dashed color-mix(in srgb,var(--brand-primary,#FF6B35) 60%,transparent)",
        fontSize: "clamp(16px, 2vw, 22px)", fontWeight: 800,
        color: "color-mix(in srgb,var(--brand-primary,#FF6B35) 95%,#fff)",
        fontFamily: "'Geist Mono',monospace", letterSpacing: 2,
        marginTop: 8,
      }}>KODE: {p.code}</div>

      {p.desc && p.desc !== p.name && (
        <div style={{
          fontSize: 16, color: "rgba(255,255,255,0.7)", marginTop: 16,
          textAlign: "center", maxWidth: 600, lineHeight: 1.4,
        }}>{p.desc}</div>
      )}
    </div>
  );
}

function HeroSlide({ brandName, brandLogo }) {
  return (
    <div style={S.heroCenter}>
      <img src={brandLogo || "/logo.png"} alt="" style={S.heroLogo}
        onError={(e) => { e.currentTarget.style.display = "none"; }}/>
      <div style={S.heroName}>
        {brandName || (<>karya<span style={{ fontWeight: 300, opacity: 0.5 }}>os</span></>)}
      </div>
      <div style={S.heroTag}>Self-Order Kiosk · Cepat, Tanpa Antri</div>
      <div style={S.heroBadges}>
        <span style={S.badge}>⚡ 30 detik</span>
        <span style={S.badge}>🎁 Earn Points</span>
        <span style={S.badge}>📱 Track Order</span>
      </div>
    </div>
  );
}

function MenuSlide({ items, phase }) {
  const offset = (phase * 2) % Math.max(1, items.length);
  const picks = [];
  for (let i = 0; i < Math.min(4, items.length); i++) {
    picks.push(items[(offset + i) % items.length]);
  }
  return (
    <div style={S.menuGrid}>
      <div style={S.menuTitle}>Menu Pilihan</div>
      <div style={S.menuCards}>
        {picks.map((m, i) => (
          <div key={(m.id || i) + "-" + phase} style={{ ...S.menuCard, animationDelay: `${i * 100}ms` }}>
            <img src={m.image_url || m.image} alt="" style={S.menuImg}
              onError={(e) => { e.currentTarget.style.display = "none"; }}/>
            <div style={S.menuMeta}>
              <div style={S.menuLabel}>{m.name}</div>
              <div style={S.menuPrice}>{fmtMoney(m.price)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes screensaverFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes screensaverFloat { 0%,100% { transform: translateY(0) scale(1) } 50% { transform: translateY(-8px) scale(1.02) } }
@keyframes screensaverPulse { 0%,100% { opacity: 0.95; transform: translateY(0) } 50% { opacity: 0.6; transform: translateY(-6px) } }
@keyframes screensaverSlideIn { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
@keyframes screensaverGlow { 0%,100% { opacity: 0.4 } 50% { opacity: 0.7 } }
`;

const S = {
  orb1: {
    position: "absolute", top: "8%", left: "12%", width: 380, height: 380, borderRadius: "50%",
    background: "radial-gradient(circle, color-mix(in srgb, var(--brand-primary, #FF6B35) 18%, transparent) 0%, transparent 70%)",
    filter: "blur(40px)", animation: "screensaverGlow 6s ease-in-out infinite", pointerEvents: "none",
  },
  orb2: {
    position: "absolute", bottom: "12%", right: "15%", width: 420, height: 420, borderRadius: "50%",
    background: "radial-gradient(circle, color-mix(in srgb, var(--brand-secondary, #E55A2B) 16%, transparent) 0%, transparent 70%)",
    filter: "blur(50px)", animation: "screensaverGlow 8s ease-in-out infinite 2s", pointerEvents: "none",
  },
  topBar: {
    position: "absolute", top: 40, left: 50, right: 50,
    display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10,
  },
  brandRow: { display: "flex", alignItems: "center", gap: 14 },
  brandLogo: { width: 38, height: 38, objectFit: "contain",
    filter: "drop-shadow(0 0 12px var(--brand-primary, #FF6B35))" },
  brandName: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px",
    textShadow: "0 0 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent)" },
  clock: { fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,0.65)",
    fontFamily: "'Geist Mono', monospace", letterSpacing: 2 },
  stage: {
    position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
    padding: "100px 60px", animation: "screensaverFade 0.5s ease-out",
  },
  heroCenter: { textAlign: "center" },
  heroLogo: { width: 180, height: 180, objectFit: "contain", marginBottom: 32,
    filter: "drop-shadow(0 0 28px var(--brand-primary, #FF6B35)) drop-shadow(0 0 60px color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent))",
    animation: "screensaverFloat 4s ease-in-out infinite" },
  heroName: { fontSize: 88, fontWeight: 800, letterSpacing: "-2px", marginBottom: 14,
    textShadow: "0 0 40px color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent)" },
  heroTag: { fontSize: 24, fontWeight: 500, color: "rgba(255,255,255,0.6)", letterSpacing: "-0.2px" },
  heroBadges: { display: "flex", gap: 14, justifyContent: "center", marginTop: 36, flexWrap: "wrap" },
  badge: { padding: "10px 18px", borderRadius: 999, fontSize: 14, fontWeight: 600,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px)" },
  menuGrid: { width: "100%" },
  menuTitle: { fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 28,
    letterSpacing: "-0.3px", color: "rgba(255,255,255,0.85)" },
  menuCards: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, maxWidth: 1200, margin: "0 auto" },
  menuCard: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 100%)",
    backdropFilter: "blur(24px) saturate(180%)", borderRadius: 22, overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.08)",
    animation: "screensaverSlideIn 0.6s ease-out backwards",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 12px 32px rgba(0,0,0,0.3)",
  },
  menuImg: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" },
  menuMeta: { padding: "14px 16px 18px" },
  menuLabel: { fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 6,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.2px" },
  menuPrice: { fontSize: 13, fontWeight: 700, color: "var(--brand-primary, #FF6B35)", letterSpacing: 0.3 },
  bottomCta: {
    position: "absolute", bottom: 70, left: 0, right: 0, textAlign: "center",
    animation: "screensaverPulse 2.5s ease-in-out infinite", pointerEvents: "none",
  },
  fingerEmoji: { fontSize: 44, marginBottom: 8 },
  tapText: { fontSize: 22, letterSpacing: 6, fontWeight: 600, color: "rgba(255,255,255,0.85)",
    textShadow: "0 0 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent)" },
};
