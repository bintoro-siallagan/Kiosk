// karyaOS — Upselling Ticker untuk POS kasir (NOT di CDS customer-facing)
// Tulisan berjalan reminder buat kasir agar selalu upsell concession / promo.
// Fetch active promos + bundle hits + custom reminders.
import { useState, useEffect } from "react";
import API_HOST from "../apiBase.js";


// Default upsell scripts per vertical — kasir reminder yg gak butuh data
const FNB_SCRIPTS = [
  "🍔 Tawarkan COMBO — sandwich + minuman + dessert hemat",
  "🥤 Ajak upgrade size minuman ke LARGE +Rp 5rb",
  "🍰 Tambah dessert / cake setelah meal",
  "🥗 Tawarkan salad add-on untuk meal sehat",
  "☕ Coffee refill 50%-off untuk dine-in",
  "🎟️ Tanyakan: ada VOUCHER atau MEMBER card?",
  "📱 Tawarkan e-receipt via WA — customer gampang track order",
  "👨‍👩‍👧 Family pack hemat untuk grup 4+ orang",
];
const CINEMA_SCRIPTS = [
  "🍿 Tawarkan COMBO POPCORN — margin tinggi, customer happy",
  "🥤 Ajak upgrade ke COKE LARGE +Rp 5rb",
  "🍫 Tambah cokelat / snack bareng tiket",
  "💑 Couple seat tersedia? Tawarkan ke pasangan untuk experience romantic",
  "👑 PREMIUM kursi recliner — nyaman buat film panjang",
  "🎟️ Tanyakan: ada VOUCHER atau MEMBER card?",
  "📱 Tawarkan e-tiket via WA — customer gampang share + reminder",
  "🍿 In-Studio QR Order: customer bisa pesan F&B dari kursi mid-movie",
  "🎬 NEXT SHOW promo? Sebut sebelum customer pergi",
];

export default function UpsellTicker({ vertical = "cinema" }) {
  const STATIC = vertical === "fnb" ? FNB_SCRIPTS
               : vertical === "hybrid" ? [...FNB_SCRIPTS, ...CINEMA_SCRIPTS]
               : CINEMA_SCRIPTS;
  const [scripts, setScripts] = useState(STATIC);

  useEffect(() => {
    // Fetch promos per vertical
    if (vertical === "fnb") {
      // F&B: fetch promo + happy hour
      Promise.all([
        fetch(`${API_HOST}/api/promo-codes/active`).then(r => r.json()).catch(() => ({})),
        fetch(`${API_HOST}/api/fnb/happy-hour/current`).then(r => r.json()).catch(() => ({})),
      ]).then(([promos, hh]) => {
        const dynamic = [];
        (promos.data || promos.promos || []).slice(0, 3).forEach(p => {
          dynamic.push(`🎁 PROMO ${p.code || p.name}: ${p.description || "diskon aktif"} — tawarkan ke customer`);
        });
        if (hh?.active) dynamic.push(`⏰ HAPPY HOUR sekarang! ${hh.discount_pct || 20}% off — sebut ke customer`);
        setScripts([...STATIC, ...dynamic]);
      });
    } else {
      // Cinema: original logic
      Promise.all([
        fetch(`${API_HOST}/api/cinema/promotions/active`).then(r => r.json()).catch(() => ({})),
        fetch(`${API_HOST}/api/cinema/bundles`).then(r => r.json()).catch(() => ({})),
      ]).then(([promos, bundles]) => {
        const dynamic = [];
        (promos.promotions || []).forEach(p => {
          const disc = p.discount_type === "percentage" ? `${p.discount_value}%` : `Rp ${Math.round(p.discount_value/1000)}rb`;
          dynamic.push(`🎁 PROMO AKTIF: ${p.name} (${p.code}) − ${disc}${p.min_purchase ? ` min ${Math.round(p.min_purchase/1000)}rb` : ""}`);
        });
        (bundles.bundles || []).slice(0, 3).forEach(b => {
          dynamic.push(`🍿 ${b.name} Rp ${Math.round(b.price/1000)}rb — sebut ke customer!`);
        });
        setScripts([...STATIC, ...dynamic]);
      });
    }
  }, [vertical]);

  // Combine all into one long string for marquee (loop seamlessly)
  const text = scripts.join("  ·  ");

  return (
    <div style={{
      background: "linear-gradient(90deg, rgba(168,85,247,0.12), rgba(245,158,11,0.08), rgba(168,85,247,0.12))",
      borderTop: "1px solid rgba(168,85,247,0.25)",
      borderBottom: "1px solid rgba(245,158,11,0.25)",
      padding: "8px 0",
      overflow: "hidden",
      position: "relative",
      fontFamily: "'Inter',sans-serif",
    }}>
      <style>{`
        @keyframes upsellMarquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .upsell-ticker-track {
          display: inline-block;
          white-space: nowrap;
          animation: upsellMarquee 60s linear infinite;
          padding-left: 100%;
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{
          flexShrink: 0, padding: "0 14px",
          fontSize: 11, fontWeight: 800, letterSpacing: 1.5,
          fontFamily: "'Geist Mono',monospace", color: "#c084fc",
          background: "rgba(168,85,247,0.15)",
          borderRight: "1px solid rgba(168,85,247,0.3)",
          height: "100%", display: "flex", alignItems: "center",
        }}>📢 UPSELL TIPS</div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div className="upsell-ticker-track" style={{
            fontSize: 13, color: "#fbbf24", fontWeight: 600, letterSpacing: 0.3,
          }}>
            {text}  ·  {text}  ·  {/* duplicate untuk seamless loop */}
          </div>
        </div>
      </div>
    </div>
  );
}
