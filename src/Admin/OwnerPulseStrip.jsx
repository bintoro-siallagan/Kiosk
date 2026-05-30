// src/Admin/OwnerPulseStrip.jsx
//
// Live pulse strip untuk owner — show "right now" activity dari outlet/system.
// Karya Hari Ini = recap kemarin. Ini = nadi yg jalan SEKARANG.
// Fetch kiosk-pulse + cinema-pulse + feedback-stats setiap 30s.

import { useState, useEffect } from "react";
import API_HOST from "../apiBase.js";

export default function OwnerPulseStrip() {
  const [pulse, setPulse] = useState({ fnb: null, cinema: null, fb: null });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const load = () => {
      const todaySec = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      Promise.all([
        fetch(`${API_HOST}/api/public/kiosk-pulse`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_HOST}/api/public/cinema-pulse`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_HOST}/api/feedback/stats?from=${todaySec}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]).then(([fnb, cinema, fb]) => setPulse({ fnb, cinema, fb }));
    };
    load();
    const t = setInterval(load, 30000);
    const clock = setInterval(() => setNow(new Date()), 60000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, []);

  const fnbOrders = pulse.fnb?.orders_today || 0;
  const cinemaTickets = pulse.cinema?.tickets_today || 0;
  const lastHourActivity = (pulse.fnb?.orders_last_hour || 0) + (pulse.cinema?.tickets_last_hour || 0);
  const ratingToday = pulse.fb?.avg_rating || 0;
  const ratingCount = pulse.fb?.count || 0;
  const topItem = pulse.fnb?.most_loved_today?.name;
  const topFilm = pulse.cinema?.top_film_today?.title;

  // Heart status — green if active, gray if quiet
  const isAlive = lastHourActivity > 0;
  const h = now.getHours();
  const timeWord = h < 11 ? "pagi" : h < 15 ? "siang" : h < 18 ? "sore" : "malam";

  return (
    <div style={S.strip}>
      <style>{KEYFRAMES}</style>
      <div style={S.head}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...S.heartDot, background: isAlive ? "#10b981" : "#5b6470", boxShadow: isAlive ? "0 0 12px #10b981" : "none" }} />
          <div>
            <div style={S.eyebrow}>● NADI HIDUP SEKARANG</div>
            <div style={S.title}>
              {isAlive
                ? `${lastHourActivity} aktivitas di 1 jam terakhir`
                : `Sedang tenang ${timeWord} ini`}
            </div>
          </div>
        </div>
        <div style={S.clock}>{now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>

      <div style={S.metricRow}>
        {fnbOrders > 0 && (
          <PulseMetric icon="🍔" label="F&B Today" value={fnbOrders} sub={topItem ? `${topItem} terlaris` : null} color="#f97316" />
        )}
        {cinemaTickets > 0 && (
          <PulseMetric icon="🎬" label="Tiket Today" value={cinemaTickets} sub={topFilm ? `"${topFilm}" rame` : null} color="#a855f7" />
        )}
        {ratingCount > 0 && (
          <PulseMetric icon="⭐" label="Rating Today" value={ratingToday.toFixed(1)} sub={`${ratingCount} ulasan baru`} color="#fbbf24" />
        )}
        {fnbOrders === 0 && cinemaTickets === 0 && ratingCount === 0 && (
          <div style={S.quietHint}>
            Hari masih awal. Sentuhan pertama menunggu.
          </div>
        )}
      </div>
    </div>
  );
}

function PulseMetric({ icon, label, value, sub, color }) {
  return (
    <div style={{ ...S.metric, borderColor: `${color}33`, background: `linear-gradient(135deg, ${color}10, transparent 60%)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>
            {label.toUpperCase()}
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color, fontFamily: "'Geist Mono',monospace", lineHeight: 1.1 }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontSize: 10.5, color: "#cbd5e1", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sub}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const KEYFRAMES = `
  @keyframes pulseHeartbeat { 0%, 100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.4; transform: scale(0.85) } }
`;

const S = {
  strip: {
    background: "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(168,85,247,0.04) 50%, rgba(249,115,22,0.06) 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14, padding: "14px 18px", marginBottom: 14,
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  heartDot: {
    width: 10, height: 10, borderRadius: "50%",
    animation: "pulseHeartbeat 1.6s ease-in-out infinite",
  },
  eyebrow: {
    fontSize: 10, color: "#10b981", letterSpacing: 1.5,
    fontFamily: "'Geist Mono',monospace", fontWeight: 800,
  },
  title: { fontSize: 15, fontWeight: 700, color: "#fff", marginTop: 2, letterSpacing: -0.2 },
  clock: {
    fontSize: 13, color: "#cbd5e1", fontFamily: "'Geist Mono',monospace",
    fontWeight: 700, letterSpacing: 0.3,
  },
  metricRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 },
  metric: {
    padding: "10px 12px", borderRadius: 10,
    border: "1px solid", fontFamily: "'Inter',sans-serif",
  },
  quietHint: {
    padding: "14px 16px", fontSize: 13, color: "#94a3b8",
    fontStyle: "italic", textAlign: "center", letterSpacing: 0.2,
  },
};
