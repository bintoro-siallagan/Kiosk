// src/Admin/RecentActivityFeed.jsx
//
// Live timeline activity untuk owner — Twitter-style feed dari hari ini.
// Combine orders + ratings, sorted desc, refresh tiap 30s.
// Filosofi: owner gak cuma lihat angka, tapi RASA hari ini — ada Sari
// yg baru pesan, ada Budi yg kasih bintang 5 dengan komen hangat.

import { useState, useEffect } from "react";
import API_HOST from "../apiBase.js";

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "baru saja";
  if (sec < 3600) return `${Math.floor(sec / 60)}m lalu`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}j lalu`;
  return `${Math.floor(sec / 86400)}h lalu`;
}

export default function RecentActivityFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch(`${API_HOST}/api/public/recent-activity?limit=10`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.items) setItems(d.items);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={S.wrap}>
      <style>{`@keyframes feedIn { 0% { opacity: 0; transform: translateX(-6px) } 100% { opacity: 1; transform: translateX(0) } }`}</style>
      <div style={S.head}>
        <div style={S.eyebrow}>✦ CERITA HARI INI</div>
        <div style={S.title}>Yang baru saja terjadi</div>
      </div>

      {loading && (
        <div style={{ padding: 20, color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
          ⏳ Sebentar...
        </div>
      )}

      {!loading && items.length === 0 && (
        <div style={S.empty}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🌱</div>
          <div style={{ fontSize: 13, color: "#cbd5e1", marginBottom: 4 }}>Belum ada cerita hari ini.</div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>Saat ada pesanan / rating, akan muncul di sini.</div>
        </div>
      )}

      <div style={S.list}>
        {items.map((it, i) => (
          <div key={`${it.kind}-${it.at}-${i}`} style={{ ...S.row, animationDelay: `${i * 30}ms` }}>
            <div style={S.icon}>{it.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#e6edf3", lineHeight: 1.4 }}>{it.text}</div>
              <div style={{ fontSize: 10, color: "#5b6470", marginTop: 2, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5 }}>
                {timeAgo(it.at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const S = {
  wrap: {
    background: "linear-gradient(180deg, rgba(168,85,247,0.06) 0%, rgba(168,85,247,0.01) 100%)",
    border: "1px solid rgba(168,85,247,0.18)",
    borderRadius: 14, padding: "14px 18px", marginBottom: 14,
    fontFamily: "'Inter',sans-serif",
  },
  head: { marginBottom: 12 },
  eyebrow: {
    fontSize: 10, color: "#c084fc", letterSpacing: 2,
    fontFamily: "'Geist Mono',monospace", fontWeight: 800,
  },
  title: { fontSize: 15, fontWeight: 700, color: "#fff", marginTop: 4, letterSpacing: -0.2 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: {
    display: "flex", alignItems: "flex-start", gap: 12,
    padding: "8px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
    animation: "feedIn 0.4s cubic-bezier(.2,.8,.2,1) both",
  },
  icon: { fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 2 },
  empty: {
    padding: 24, textAlign: "center",
    background: "rgba(255,255,255,0.02)", borderRadius: 10,
    border: "1px dashed rgba(255,255,255,0.08)",
  },
};
