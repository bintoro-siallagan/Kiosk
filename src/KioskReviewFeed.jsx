// src/KioskReviewFeed.jsx
// Feed review customer di layar kiosk — social proof.
// Nampilin rating bagus (≥4★) + komentar terbaru, rotasi otomatis.
import { useState, useEffect } from "react";
import API_HOST from "./apiBase.js";

const CHANNEL = { pos: "Cashier", kiosk: "Kiosk", qr: "QR Order" };

export default function KioskReviewFeed() {
  const [reviews, setReviews] = useState([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    const fetchR = () => {
      fetch(`${API_HOST}/api/feedback?limit=30`)
        .then(r => r.json())
        .then(rows => {
          if (!alive) return;
          // social proof — cuma review bagus + ada komentar
          setReviews((Array.isArray(rows) ? rows : []).filter(r => r.rating >= 4 && r.comment));
        }).catch(() => {});
    };
    fetchR();
    const t = setInterval(fetchR, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (reviews.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % reviews.length), 4500);
    return () => clearInterval(t);
  }, [reviews.length]);

  if (reviews.length === 0) return null;
  const r = reviews[idx % reviews.length];

  return (
    <div style={S.wrap}>
      <div style={S.kicker}>★ KATA CUSTOMER KAMI</div>
      <div style={S.stars}>
        {"★".repeat(r.rating)}<span style={{ color: "#3a3a44" }}>{"★".repeat(5 - r.rating)}</span>
      </div>
      <div style={S.comment}>"{r.comment}"</div>
      <div style={S.meta}>via {CHANNEL[r.source] || r.source || "POS"}{r.cashier ? ` · ${r.cashier}` : ""}</div>
      {reviews.length > 1 && (
        <div style={S.dots}>
          {reviews.slice(0, 8).map((_, i) => (
            <span key={i} style={{ ...S.dot, background: i === (idx % Math.min(reviews.length, 8)) ? "#F59E0B" : "#3a3a44" }} />
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: {
    maxWidth: 520, margin: "0 auto", padding: "16px 22px",
    background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.22)",
    borderRadius: 16, textAlign: "center",
  },
  kicker: { fontSize: 11, letterSpacing: 2, color: "#F59E0B", fontWeight: 700 },
  stars: { fontSize: 20, color: "#F59E0B", margin: "6px 0 4px", letterSpacing: 2 },
  comment: { fontSize: 15, color: "#E2E8F0", fontStyle: "italic", lineHeight: 1.5, minHeight: 44 },
  meta: { fontSize: 11, color: "#64748B", marginTop: 6, letterSpacing: 0.5 },
  dots: { display: "flex", gap: 5, justifyContent: "center", marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: "50%", transition: "background 0.3s" },
};
