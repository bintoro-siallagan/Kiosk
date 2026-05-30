// src/components/SoulOverlay.jsx
//
// Reusable "soul" components untuk attract surfaces (kiosk, qr, web, cinema).
// Filosofi karyaOS — bukan iklan keras, tapi tuan rumah hangat yg ngomong
// sendiri. Customer lewat → nyantol → "ah, harus coba".
//
// Komponen:
//   - <TimeGreeting now /> — sambutan time-aware (pagi/siang/sore/malam)
//   - <ThoughtBubble pool /> — gumam rotating
//   - <PulseTicker messages /> — social proof live
//
// Variant: F&B (Kiosk/QR) atau Cinema. Pool quotes berbeda per vertical.

import { useState, useEffect, useMemo } from "react";

// ─────────────────────────────────────────────────────────
// Time greeting helper
// ─────────────────────────────────────────────────────────
export function timeOfDay(now) {
  const h = (now || new Date()).getHours();
  if (h >= 5 && h < 11) return { key: "morning", greet: "Selamat Pagi", emoji: "☀️", word: "pagi" };
  if (h >= 11 && h < 15) return { key: "noon", greet: "Selamat Siang", emoji: "🌤️", word: "siang" };
  if (h >= 15 && h < 18) return { key: "afternoon", greet: "Selamat Sore", emoji: "🌅", word: "sore" };
  return { key: "evening", greet: "Selamat Malam", emoji: "✨", word: "malam" };
}

// ─────────────────────────────────────────────────────────
// Thought bubble pools — F&B vs Cinema
// ─────────────────────────────────────────────────────────
const FNB_POOL = {
  morning: [
    "Pagi-pagi gini, secangkir kopi panas pas banget...",
    "Mau mulai hari dengan sarapan hangat?",
    "Belum sempet sarapan? Ini perfect timing.",
    "Bayangin: nasi, telur ceplok, teh manis.",
  ],
  noon: [
    "Jam makan siang nih... perut udah lapar belum?",
    "Yang tadi pesan rice bowl bilang enak banget loh.",
    "Cepet aja, 5 menit beres — bisa balik kerja lagi.",
    "Mau yang ringan atau yang kenyang?",
  ],
  afternoon: [
    "Sore-sore, snack manis pas banget ya...",
    "Capek kerja? Hadiah kecil buat diri sendiri yuk.",
    "Lapar pre-dinner? Sini, saya cariin yg pas.",
    "Cuma istirahat sebentar? Saya siapin yg cepet.",
  ],
  evening: [
    "Selamat malam... mau nutup hari dengan apa?",
    "Pulang kerja, capek, lapar. Tenang, saya bantu.",
    "Mau makan tenang sambil nge-charge HP?",
    "Yang lagi rame malam ini ada kok di menu.",
  ],
};

const CINEMA_POOL = {
  morning: [
    "Pagi-pagi nonton? Theater lebih sepi, vibe enak banget.",
    "Studio masih dingin... pelukan bioskop pagi.",
    "Pilihannya hari ini menarik loh — mau action atau drama?",
    "Sarapan dulu yuk, baru masuk studio?",
  ],
  noon: [
    "Siang ini ada matinee — biasanya kursi tengah masih bebas.",
    "Habis makan siang... waktu yg pas buat film 2 jam-an.",
    "Coba lihat yg sedang tayang — ada yg baru loh.",
    "Studio Premium lagi cozy banget jam segini.",
  ],
  afternoon: [
    "Sore-sore, popcorn + film + AC dingin... ideal.",
    "Banyak yg pulang kerja langsung nge-bioskop loh.",
    "Mau menghindar dari macet? Studio aman.",
    "Movie marathon? Kita siap kok.",
  ],
  evening: [
    "Malam yang pas buat film favorit.",
    "Studio prime time — kursi cepet penuh.",
    "Date night? Pilih yg romantic atau yg seru?",
    "Habis kerja, cooldown 2 jam di studio. Worth it.",
  ],
};

export function pickThoughts({ vertical = "fnb", now, outletInfo, extras = {} }) {
  const t = timeOfDay(now);
  const pool = vertical === "cinema" ? CINEMA_POOL : FNB_POOL;
  let list = [...(pool[t.key] || [])];

  // Vertical-specific data-aware enrichment
  if (vertical === "fnb") {
    if (extras.promoCount > 0) list.push(`Btw ada ${extras.promoCount} promo aktif loh hari ini...`);
    if (extras.popular?.name) {
      list.push(
        `Hari ini "${extras.popular.name}" lagi rajin di-pesan...`,
        `Tadi ada yg bilang "${extras.popular.name}" nyess banget.`,
      );
    }
  } else if (vertical === "cinema") {
    if (extras.upcomingShows > 0) {
      list.push(`Ada ${extras.upcomingShows} jadwal nanti — mungkin ada yg pas buat sekarang.`);
    }
    if (extras.topFilm?.title) {
      list.push(
        `"${extras.topFilm.title}" lagi paling rame hari ini.`,
        `Belum nonton "${extras.topFilm.title}"? Coba pertimbangkan.`,
      );
    }
  }
  if (outletInfo?.name) {
    list.push(`Selamat datang di ${outletInfo.name} — saya yg akan menemani.`);
  }
  return list;
}

// ─────────────────────────────────────────────────────────
// ThoughtBubble — rotating gumam
// ─────────────────────────────────────────────────────────
export function ThoughtBubble({ vertical, now, outletInfo, extras, accentColor = "#FF6B35", intervalMs = 6500, style = {} }) {
  const [idx, setIdx] = useState(0);
  const thoughts = useMemo(
    () => pickThoughts({ vertical, now, outletInfo, extras }),
    [vertical, now?.getHours?.(), outletInfo, JSON.stringify(extras || {})]
  );

  useEffect(() => {
    if (thoughts.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % thoughts.length), intervalMs);
    return () => clearInterval(t);
  }, [thoughts.length, intervalMs]);

  if (!thoughts.length) return null;
  const text = thoughts[idx];

  return (
    <div key={idx} style={{ ...defaultStyles.bubble, ...style }}>
      <style>{KEYFRAMES}</style>
      <span style={{ ...defaultStyles.quote, color: accentColor }}>“</span>
      <span style={defaultStyles.bubbleText}>{text}</span>
      <span style={{ ...defaultStyles.quoteEnd, color: accentColor }}>”</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// PulseTicker — social proof rotating
// ─────────────────────────────────────────────────────────
export function PulseTicker({ messages, intervalMs = 5500, style = {} }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!messages || messages.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % messages.length), intervalMs);
    return () => clearInterval(t);
  }, [messages?.length, intervalMs]);

  if (!messages || !messages.length) return null;
  const m = messages[idx % messages.length];

  return (
    <div key={idx} style={{ ...defaultStyles.ticker, ...style }}>
      <style>{KEYFRAMES}</style>
      <span style={defaultStyles.pulseDot} />
      <span style={defaultStyles.pulseIcon}>{m.icon}</span>
      <span style={defaultStyles.pulseText}>{m.text}</span>
    </div>
  );
}

// Helper: build F&B pulse messages dari endpoint /api/public/kiosk-pulse
export function buildFnbPulseMessages(pulse, threshold = 2) {
  if (!pulse) return [];
  const msgs = [];
  if (pulse.orders_today >= threshold) {
    msgs.push({ icon: "💛", text: `${pulse.orders_today} orang sudah pesan hari ini` });
  }
  const lastHour = Math.min(pulse.orders_last_hour || 0, pulse.orders_today || 0);
  if (lastHour >= threshold) {
    msgs.push({ icon: "✨", text: `${lastHour} pesanan baru dalam 1 jam terakhir` });
  }
  if (pulse.most_loved_today?.name && pulse.most_loved_today.count >= 2) {
    msgs.push({ icon: "🔥", text: `${pulse.most_loved_today.name} paling laris hari ini (${pulse.most_loved_today.count}x)` });
  }
  return msgs;
}

// Helper: build Cinema pulse messages dari endpoint /api/public/cinema-pulse
export function buildCinemaPulseMessages(pulse, threshold = 2) {
  if (!pulse) return [];
  const msgs = [];
  if (pulse.tickets_today >= threshold) {
    msgs.push({ icon: "🎬", text: `${pulse.tickets_today} tiket terjual hari ini` });
  }
  const lastHour = Math.min(pulse.tickets_last_hour || 0, pulse.tickets_today || 0);
  if (lastHour >= threshold) {
    msgs.push({ icon: "✨", text: `${lastHour} tiket terjual dalam 1 jam terakhir` });
  }
  if (pulse.top_film_today?.title && pulse.top_film_today.count >= 2) {
    msgs.push({ icon: "🔥", text: `"${pulse.top_film_today.title}" paling laris hari ini (${pulse.top_film_today.count}x)` });
  }
  if (pulse.upcoming_shows > 0) {
    msgs.push({ icon: "🎟️", text: `${pulse.upcoming_shows} jadwal tayang menunggu nanti` });
  }
  return msgs;
}

// ─────────────────────────────────────────────────────────
// Styles + keyframes
// ─────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes soulFadeIn { 0% { opacity: 0; transform: translateY(8px) } 100% { opacity: 1; transform: translateY(0) } }
  @keyframes soulPulseDot { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.5; transform: scale(0.85) } }
`;

const defaultStyles = {
  bubble: {
    padding: "14px 22px", borderRadius: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
    border: "1px solid rgba(255,255,255,0.10)",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    maxWidth: 580, fontFamily: "'Inter',sans-serif",
    display: "inline-flex", alignItems: "flex-start", gap: 4,
    animation: "soulFadeIn 0.6s cubic-bezier(.2,.8,.2,1)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  },
  quote: { fontSize: 30, lineHeight: 1, fontFamily: "Georgia, serif", fontWeight: 700, opacity: 0.65, marginTop: -2 },
  quoteEnd: { fontSize: 30, lineHeight: 1, fontFamily: "Georgia, serif", fontWeight: 700, opacity: 0.65, alignSelf: "flex-end", marginBottom: -6 },
  bubbleText: { fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.85)", letterSpacing: -0.2, lineHeight: 1.5, fontStyle: "italic", padding: "0 8px" },
  ticker: {
    padding: "9px 16px", borderRadius: 999,
    display: "inline-flex", alignItems: "center", gap: 9,
    background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.28)",
    fontFamily: "'Inter',sans-serif",
    animation: "soulFadeIn 0.5s cubic-bezier(.2,.8,.2,1)",
    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  },
  pulseDot: { width: 7, height: 7, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 10px #10b981", animation: "soulPulseDot 1.6s ease-in-out infinite" },
  pulseIcon: { fontSize: 14, lineHeight: 1 },
  pulseText: { fontSize: 13, fontWeight: 600, color: "#86efac", letterSpacing: -0.2, lineHeight: 1 },
};
