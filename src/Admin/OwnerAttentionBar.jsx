// src/Admin/OwnerAttentionBar.jsx
//
// Prominent banner saat ada hal yg perlu attention owner hari ini.
// Currently track: bad ratings (≤2). Bisa extend nanti dgn late
// orders, low stock, anomalies.
//
// Filosofi: bad feedback bukan hidden — sampai ke owner FAST, jelas.
// Bukan punishment ke kasir, tapi peluang tumbuh. Tone: hangat tegas.

import { useState, useEffect } from "react";
import API_HOST from "../apiBase.js";

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - ts * 1000) / 1000);
  if (sec < 60) return "baru saja";
  if (sec < 3600) return `${Math.floor(sec / 60)}m lalu`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}j lalu`;
  return `${Math.floor(sec / 86400)}h lalu`;
}

export default function OwnerAttentionBar({ onOpenFeedback }) {
  const [badReviews, setBadReviews] = useState([]);
  const [dismissedAt, setDismissedAt] = useState(() => {
    try { return parseInt(localStorage.getItem("ownerAttentionDismissed") || "0", 10); } catch { return 0; }
  });

  useEffect(() => {
    const load = () => {
      const todaySec = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      const token = (() => { try { return localStorage.getItem("adminToken") || ""; } catch { return ""; } })();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      fetch(`${API_HOST}/api/feedback?limit=50`, { headers })
        .then(r => r.ok ? r.json() : [])
        .then(arr => {
          const list = Array.isArray(arr) ? arr : [];
          // Filter: bad rating (≤2) today, not dismissed
          const bad = list
            .filter(f => f.rating <= 2 && f.created_at >= todaySec)
            .filter(f => f.created_at * 1000 > dismissedAt);
          setBadReviews(bad.slice(0, 3));
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [dismissedAt]);

  const dismiss = () => {
    const now = Date.now();
    try { localStorage.setItem("ownerAttentionDismissed", String(now)); } catch {}
    setDismissedAt(now);
  };

  if (badReviews.length === 0) return null;

  return (
    <div style={S.bar}>
      <style>{`@keyframes attentionGlow { 0%,100% { box-shadow: 0 0 0 1px rgba(239,68,68,0.30), 0 8px 24px rgba(239,68,68,0.10) } 50% { box-shadow: 0 0 0 1px rgba(239,68,68,0.50), 0 12px 32px rgba(239,68,68,0.20) } }`}</style>
      <div style={S.head}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={S.icon}>⚠️</span>
          <div>
            <div style={S.eyebrow}>BUTUH PERHATIAN HARI INI</div>
            <div style={S.title}>
              {badReviews.length === 1
                ? "1 ulasan kurang puas tercatat hari ini"
                : `${badReviews.length} ulasan kurang puas tercatat hari ini`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onOpenFeedback && (
            <button onClick={onOpenFeedback} style={S.cta}>
              💛 Dengarkan
            </button>
          )}
          <button onClick={dismiss} style={S.dismissBtn} title="Tutup sampai ada baru">✕</button>
        </div>
      </div>

      <div style={S.list}>
        {badReviews.map((r, i) => (
          <div key={r.id || i} style={S.row}>
            <span style={{ fontSize: 14, color: "#fb923c" }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#fecaca", lineHeight: 1.4 }}>
              {r.comment ? `"${r.comment.slice(0, 80)}"` : "(tanpa komentar)"}
              {r.cashier && <span style={{ color: "#fbbf24", fontWeight: 600, marginLeft: 6 }}>· {r.cashier}</span>}
            </span>
            <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'Geist Mono',monospace", flexShrink: 0 }}>
              {timeAgo(r.created_at)}
            </span>
          </div>
        ))}
      </div>

      <div style={S.tone}>
        Bad rating bukan hukuman — peluang tumbuh. Dengarkan, follow-up, perbaiki bersama tim.
      </div>
    </div>
  );
}

const S = {
  bar: {
    background: "linear-gradient(180deg, rgba(239,68,68,0.10) 0%, rgba(251,146,60,0.05) 100%)",
    border: "1px solid rgba(239,68,68,0.30)",
    borderRadius: 14, padding: "14px 18px", marginBottom: 14,
    fontFamily: "'Inter',sans-serif",
    animation: "attentionGlow 3s ease-in-out infinite",
  },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 },
  icon: { fontSize: 24, lineHeight: 1 },
  eyebrow: {
    fontSize: 10, color: "#fb923c", letterSpacing: 2,
    fontFamily: "'Geist Mono',monospace", fontWeight: 800,
  },
  title: { fontSize: 15, fontWeight: 700, color: "#fff", marginTop: 2, letterSpacing: -0.2 },
  cta: {
    padding: "8px 16px",
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    color: "#1a1205", border: "none", borderRadius: 9,
    fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
    letterSpacing: 0.3, boxShadow: "0 4px 16px rgba(251,191,36,0.30)",
  },
  dismissBtn: {
    width: 30, height: 30, padding: 0,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.55)", borderRadius: 999, cursor: "pointer", fontSize: 13,
  },
  list: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 },
  row: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px", borderRadius: 8,
    background: "rgba(0,0,0,0.20)", border: "1px solid rgba(255,255,255,0.05)",
  },
  tone: {
    fontSize: 11, color: "#fecaca", fontStyle: "italic",
    padding: "8px 12px", background: "rgba(0,0,0,0.15)", borderRadius: 8,
    letterSpacing: 0.2, lineHeight: 1.5,
  },
};
