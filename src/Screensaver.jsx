// src/Screensaver.jsx — kiosk attract-loop / idle screensaver.
//
// Modes (admin picks via /api/admin/screensaver-config; default "auto"):
//   - images : rotates uploaded images (legacy behavior)
//   - menu   : rotates live menu cards from /api/menu
//   - auto   : combo — alternates brand-hero → menu grid → uploaded images
//
// Always renders something (no more silent fail on empty images). Brand-aware:
// uses --brand-primary / --brand-secondary CSS vars set by parent Kiosk.

import { useState, useEffect, useMemo } from "react";
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
  // QUICK WIN #1+#2: outlet identity + live community stats
  const [outletInfo, setOutletInfo] = useState(null);
  const [stats, setStats] = useState({ rating: 0, ratingCount: 0 });
  // Community pulse — social proof live ("32 orang sudah pesan hari ini")
  const [pulse, setPulse] = useState(null);

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

    // QUICK WIN #1: outlet identity — detect dari URL ?outlet=X atau localStorage
    const outletCode = (() => {
      try {
        const q = new URLSearchParams(window.location.search);
        return (q.get("outlet") || localStorage.getItem("posOutlet") || localStorage.getItem("posOutletDevice") || "").toUpperCase() || null;
      } catch { return null; }
    })();
    if (outletCode) {
      fetch(`${API_URL}/api/outlet-master`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const list = d?.outlets || (Array.isArray(d) ? d : []);
          const o = list.find(x => (x.code || "").toUpperCase() === outletCode);
          if (o) setOutletInfo(o);
        })
        .catch(() => {});
    }

    // QUICK WIN #2: live rating stat — 30 hari terakhir, biar nominal segar
    const from30 = Math.floor(Date.now() / 1000) - 30 * 86400;
    fetch(`${API_URL}/api/feedback/stats?from=${from30}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.count > 0) setStats({ rating: d.avg_rating || 0, ratingCount: d.count || 0 });
      })
      .catch(() => {});

    // Community pulse — fetch + poll per 60s biar nomor real-time fresh
    const loadPulse = () => {
      const qs = outletCode ? `?outlet=${encodeURIComponent(outletCode)}` : "";
      fetch(`${API_URL}/api/public/kiosk-pulse${qs}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setPulse(d); })
        .catch(() => {});
    };
    loadPulse();
    const pulsePoll = setInterval(loadPulse, 60000);
    return () => clearInterval(pulsePoll);
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
        {kind === "hero" && <HeroSlide brandName={brandName} brandLogo={brandLogo} outletInfo={outletInfo} stats={stats} menu={menu} menuCount={menu.length} promoCount={promos.length} pulse={pulse} now={now} />}
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

      {/* Bottom tap-CTA — conversational + bigger */}
      <div style={S.bottomCta}>
        <div style={S.ctaQuestion}>Mau pesan apa {timeGreeting(now).greet.split(" ")[1].toLowerCase()} ini?</div>
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

// Time-of-day greeting — karyaOS hangat seperti tuan rumah
function timeGreeting(now) {
  const h = (now || new Date()).getHours();
  if (h >= 5 && h < 11) return { greet: "Selamat Pagi", emoji: "☀️" };
  if (h >= 11 && h < 15) return { greet: "Selamat Siang", emoji: "🌤️" };
  if (h >= 15 && h < 18) return { greet: "Selamat Sore", emoji: "🌅" };
  return { greet: "Selamat Malam", emoji: "✨" };
}

// 💭 ThoughtBubble — kiosk "ngomong sendiri" di depan customer.
// Filosofi: bukan iklan promosi keras, tapi gumam ramah yg bikin orang yg lewat
// nyantol — "ih kayaknya enak nih, coba ah". karyaOS sebagai tuan rumah yg
// hangat, bukan sales yg agresif.
function pickThoughts(now, outletInfo, menu, promoCount) {
  const h = (now || new Date()).getHours();
  const outletName = outletInfo?.name || "kami";

  const morning = [
    "Pagi-pagi gini, secangkir kopi panas pas banget...",
    "Mau mulai hari dengan sarapan hangat? Saya bantu siapkan.",
    "Bayangin: nasi, telur ceplok, teh manis. Apa kabarnya?",
    "Belum sempet sarapan? Ini perfect timing.",
  ];
  const noon = [
    "Jam makan siang nih... perut udah lapar belum?",
    "Yang tadi pesan rice bowl bilang enak banget loh.",
    "Cepet aja, 5 menit beres — bisa balik kerja lagi.",
    "Mau yang ringan atau yang kenyang? Dua-duanya ada.",
  ];
  const afternoon = [
    "Sore-sore, snack manis pas banget ya...",
    "Cuma istirahat sebentar? Saya siapin yg cepet.",
    "Capek kerja? Hadiah kecil buat diri sendiri yuk.",
    "Lapar pre-dinner? Sini, saya cariin yg pas.",
  ];
  const evening = [
    "Selamat malam... mau nutup hari dengan apa?",
    "Pulang kerja, capek, lapar. Tenang, saya bantu.",
    "Yang lagi rame malam ini: pasta kepiting, katanya juara.",
    "Mau makan tenang sambil nge-charge HP? Boleh.",
  ];

  let pool = h < 11 ? morning : h < 15 ? noon : h < 18 ? afternoon : evening;

  // Tambah variants berbasis data — kalau ada promo aktif / menu popular
  if (promoCount > 0) {
    pool = [...pool,
      `Btw ada ${promoCount} promo aktif loh hari ini...`,
      "Diam-diam ada diskon tersembunyi — coba lihat menunya?",
    ];
  }
  if (menu?.length > 0) {
    const popular = menu.find(m => m.is_popular || (m.tag || "").toLowerCase().includes("popular"));
    if (popular?.name) {
      pool = [...pool,
        `Hari ini ${popular.name} lagi rajin di-pesan...`,
        `Tadi ada yang bilang "${popular.name}" nyess banget.`,
      ];
    }
  }
  if (outletInfo) {
    pool = [...pool,
      `Selamat datang di ${outletName} — saya yang akan menemani.`,
    ];
  }
  return pool;
}

function ThoughtBubble({ now, outletInfo, menu, promoCount }) {
  const [idx, setIdx] = useState(0);
  const thoughts = useMemo(() => pickThoughts(now, outletInfo, menu, promoCount), [now?.getHours?.(), outletInfo, menu, promoCount]);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % thoughts.length), 6500);
    return () => clearInterval(t);
  }, [thoughts.length]);

  if (!thoughts.length) return null;
  const text = thoughts[idx];

  return (
    <div key={idx} style={S.thoughtBubble}>
      <span style={S.thoughtQuote}>“</span>
      <span style={S.thoughtText}>{text}</span>
      <span style={S.thoughtQuoteEnd}>”</span>
    </div>
  );
}

// 🔥 PulseTicker — community pulse rotating ("32 orang sudah pesan hari ini",
// "Pasta Crab paling laris", "5 orang baru pesan tadi"). Social proof yg
// bikin layar kerasa "rame", customer mikir "ih ramai juga, ikutan ah".
function PulseTicker({ pulse }) {
  const [idx, setIdx] = useState(0);
  const messages = useMemo(() => {
    if (!pulse) return [];
    const msgs = [];
    // Threshold: minimal 3 orders biar pulse meaningful (gak awkward saat masih sepi)
    if (pulse.orders_today >= 3) {
      msgs.push({ icon: "💛", text: `${pulse.orders_today} orang sudah pesan hari ini` });
    }
    // Cap last_hour ke orders_today (avoid "12 dalam 1 jam" padahal today cuma 1)
    const lastHour = Math.min(pulse.orders_last_hour || 0, pulse.orders_today || 0);
    if (lastHour >= 3) {
      msgs.push({ icon: "✨", text: `${lastHour} pesanan baru dalam 1 jam terakhir` });
    }
    // Only show top item kalau ordered >= 2x (signal real, bukan random satu order)
    if (pulse.most_loved_today?.name && pulse.most_loved_today.count >= 2) {
      msgs.push({ icon: "🔥", text: `${pulse.most_loved_today.name} paling laris hari ini (${pulse.most_loved_today.count}x)` });
    }
    return msgs;
  }, [pulse]);

  useEffect(() => {
    if (messages.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % messages.length), 5500);
    return () => clearInterval(t);
  }, [messages.length]);

  if (!messages.length) return null;
  const m = messages[idx % messages.length];

  return (
    <div key={idx} style={S.pulseTicker}>
      <span style={S.pulseDot} />
      <span style={S.pulseIcon}>{m.icon}</span>
      <span style={S.pulseText}>{m.text}</span>
    </div>
  );
}

function HeroSlide({ brandName, brandLogo, outletInfo, stats, menu, menuCount, promoCount, pulse, now }) {
  const { greet, emoji } = timeGreeting(now);
  const outletDisplay = outletInfo?.name || brandName || "karyaOS";
  const outletLoc = outletInfo ? [outletInfo.area, outletInfo.city].filter(Boolean).join(" · ") : null;

  return (
    <div style={S.heroCenter}>
      <img src={brandLogo || "/logo.png"} alt="" style={S.heroLogo}
        onError={(e) => { e.currentTarget.style.display = "none"; }}/>

      {/* Greeting hangat — time-aware */}
      <div style={S.heroGreet}>
        <span style={S.heroGreetIcon}>{emoji}</span>
        <span>{greet}</span>
      </div>

      {/* Outlet name primary — bukan brand platform */}
      <div style={S.heroName}>{outletDisplay}</div>

      {/* Location pill — kalau ada outlet binding */}
      {outletLoc && (
        <div style={S.heroLoc}>📍 {outletLoc}</div>
      )}

      {/* Live community badges — replace static teknis dengan numbers */}
      <div style={S.heroBadges}>
        {menuCount > 0 && (
          <span style={S.badge}>👨‍🍳 {menuCount} menu siap</span>
        )}
        {promoCount > 0 && (
          <span style={{ ...S.badge, ...S.badgeAccent }}>🔥 {promoCount} promo aktif</span>
        )}
        {stats?.ratingCount > 0 && (
          <span style={S.badge}>⭐ {stats.rating.toFixed(1)} dari {stats.ratingCount} ulasan</span>
        )}
        {/* Fallback kalau belum ada data live */}
        {menuCount === 0 && promoCount === 0 && stats?.ratingCount === 0 && (
          <>
            <span style={S.badge}>⚡ 30 detik</span>
            <span style={S.badge}>🎁 Earn Points</span>
            <span style={S.badge}>📱 Track Order</span>
          </>
        )}
      </div>

      {/* 💭 Kiosk "ngomong sendiri" — gumam ramah yg bikin orang nyantol */}
      <ThoughtBubble now={now} outletInfo={outletInfo} menu={menu} promoCount={promoCount} />

      {/* 🔥 Community pulse — social proof live, "rame" feel */}
      <PulseTicker pulse={pulse} />
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
@keyframes thoughtFadeIn { 0% { opacity: 0; transform: translateY(8px) } 100% { opacity: 1; transform: translateY(0) } }
@keyframes pulseTickerIn { 0% { opacity: 0; transform: scale(0.92) } 100% { opacity: 1; transform: scale(1) } }
@keyframes pulseDot { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.5; transform: scale(0.85) } }
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
  heroCenter: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14 },
  heroLogo: { width: 160, height: 160, objectFit: "contain", margin: 0,
    filter: "drop-shadow(0 0 28px var(--brand-primary, #FF6B35)) drop-shadow(0 0 60px color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent))",
    animation: "screensaverFloat 4s ease-in-out infinite" },
  // QUICK WIN #1: time-aware greeting hangat
  heroGreet: {
    display: "inline-flex", alignItems: "center", gap: 10, marginTop: 4,
    padding: "8px 18px", borderRadius: 999,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
    fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.92)",
    letterSpacing: -0.3, lineHeight: 1, backdropFilter: "blur(8px)",
  },
  heroGreetIcon: { fontSize: 20, lineHeight: 1 },
  heroName: { fontSize: 78, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-2px", margin: 0,
    textShadow: "0 0 40px color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent)" },
  // Outlet location pill — anchor "di mana"
  heroLoc: {
    fontSize: 14, color: "#fbbf24", letterSpacing: 1.5,
    fontFamily: "'Geist Mono',monospace", fontWeight: 700,
    padding: "5px 14px", borderRadius: 999,
    background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
    lineHeight: 1, marginTop: 2,
  },
  heroBadges: { display: "flex", gap: 12, justifyContent: "center", marginTop: 18, flexWrap: "wrap" },
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
    position: "absolute", bottom: 50, left: 0, right: 0, textAlign: "center",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    animation: "screensaverPulse 2.5s ease-in-out infinite", pointerEvents: "none",
  },
  ctaQuestion: {
    fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.92)",
    letterSpacing: -0.4, lineHeight: 1.3, margin: 0, marginBottom: 6,
    textShadow: "0 2px 16px rgba(0,0,0,0.4)",
  },
  fingerEmoji: { fontSize: 44, lineHeight: 1, margin: 0 },
  tapText: { fontSize: 18, letterSpacing: 5, fontWeight: 700, color: "rgba(255,255,255,0.85)",
    margin: 0, fontFamily: "'Geist Mono',monospace",
    textShadow: "0 0 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent)" },
  // Accent badge — pakai warna brand utk highlight (mis. promo)
  badgeAccent: {
    background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 16%, transparent)",
    border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent)",
    color: "color-mix(in srgb, var(--brand-primary,#FF6B35) 95%, #fff)",
  },
  // 💭 ThoughtBubble — gumam kiosk yg fade in-out tiap 6.5s
  thoughtBubble: {
    marginTop: 36, padding: "16px 26px", borderRadius: 22,
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
    border: "1px solid rgba(255,255,255,0.10)",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    maxWidth: 640, fontFamily: "'Inter',sans-serif",
    display: "inline-flex", alignItems: "flex-start", gap: 4,
    animation: "thoughtFadeIn 0.8s cubic-bezier(.2,.8,.2,1)",
    boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
  },
  thoughtQuote: {
    fontSize: 36, lineHeight: 1, color: "color-mix(in srgb, var(--brand-primary,#FF6B35) 75%, #fff)",
    fontFamily: "Georgia, serif", fontWeight: 700, opacity: 0.7, marginTop: -2,
  },
  thoughtQuoteEnd: {
    fontSize: 36, lineHeight: 1, color: "color-mix(in srgb, var(--brand-primary,#FF6B35) 75%, #fff)",
    fontFamily: "Georgia, serif", fontWeight: 700, opacity: 0.7, alignSelf: "flex-end", marginBottom: -8,
  },
  thoughtText: {
    fontSize: 20, fontWeight: 500, color: "rgba(255,255,255,0.85)",
    letterSpacing: -0.3, lineHeight: 1.5, fontStyle: "italic",
    padding: "0 8px",
  },
  // 🔥 PulseTicker — small live indicator: "32 orang sudah pesan hari ini"
  pulseTicker: {
    marginTop: 16, padding: "10px 18px", borderRadius: 999,
    display: "inline-flex", alignItems: "center", gap: 10,
    background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.28)",
    fontFamily: "'Inter',sans-serif",
    animation: "pulseTickerIn 0.6s cubic-bezier(.2,.8,.2,1)",
    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  },
  pulseDot: {
    width: 8, height: 8, borderRadius: "50%", background: "#10b981",
    boxShadow: "0 0 12px #10b981",
    animation: "pulseDot 1.6s ease-in-out infinite",
  },
  pulseIcon: { fontSize: 16, lineHeight: 1 },
  pulseText: {
    fontSize: 14, fontWeight: 600, color: "#86efac",
    letterSpacing: -0.2, lineHeight: 1,
  },
};
