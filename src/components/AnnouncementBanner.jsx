// src/components/AnnouncementBanner.jsx
// White-label P4D — top-of-app banner shown to all admin users until dismissed.
// Loads active announcements, picks the highest-severity unread banner,
// renders pill at top of admin shell with "Got it" dismiss.

import { useEffect, useState } from "react";
import API_HOST from "../apiBase.js";

const SEV_ORDER = { critical: 0, warning: 1, success: 2, info: 3 };

function headers() {
  const tok = localStorage.getItem("adminToken");
  return { ...(tok && { Authorization: "Bearer " + tok }) };
}

export default function AnnouncementBanner() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const r = await fetch(`${API_HOST}/api/announcements/active`, { headers: headers() }).then(r => r.json());
      const banners = (r.data || []).filter(x => x.kind === "banner" && !x.read);
      banners.sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
      setItems(banners);
    } catch {}
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000); // poll every 1 min
    return () => clearInterval(t);
  }, []);

  async function dismiss(id) {
    setBusy(true);
    try {
      await fetch(`${API_HOST}/api/announcements/${id}/read`, { method: "POST", headers: headers() });
      setItems(arr => arr.filter(x => x.id !== id));
    } finally { setBusy(false); }
  }

  if (items.length === 0) return null;
  const top = items[0];
  const palette = {
    info:     { bg: "rgba(59,130,246,0.12)",  bd: "rgba(59,130,246,0.3)",  fg: "#93c5fd", ic: "ℹ️" },
    success:  { bg: "rgba(34,197,94,0.12)",   bd: "rgba(34,197,94,0.3)",   fg: "#86efac", ic: "✓" },
    warning:  { bg: "rgba(251,191,36,0.12)",  bd: "rgba(251,191,36,0.3)",  fg: "#fcd34d", ic: "⚠" },
    critical: { bg: "rgba(239,68,68,0.14)",   bd: "rgba(239,68,68,0.35)",  fg: "#fca5a5", ic: "🔴" },
  }[top.severity] || { bg: "rgba(59,130,246,0.12)", bd: "rgba(59,130,246,0.3)", fg: "#93c5fd", ic: "ℹ️" };

  return (
    <div style={{ ...S.bar, background: palette.bg, borderColor: palette.bd, color: palette.fg }}>
      <div style={S.icon}>{palette.ic}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.title}>{top.title}</div>
        {top.body && <div style={S.body}>{top.body}</div>}
      </div>
      {top.link_url && (
        <a href={top.link_url} target="_blank" rel="noreferrer" style={{ ...S.link, color: palette.fg }}>
          {top.link_label || "Lihat detail"} →
        </a>
      )}
      <button onClick={() => dismiss(top.id)} disabled={busy} style={S.close} aria-label="Dismiss">✕</button>
      {items.length > 1 && <div style={S.counter}>+{items.length - 1} more</div>}
    </div>
  );
}

const S = {
  bar: { display: "flex", alignItems: "center", gap: 12, padding: "8px 14px",
    borderBottom: "1px solid", fontFamily: "'Inter',sans-serif", fontSize: 13,
    backdropFilter: "blur(12px)", position: "relative", zIndex: 100 },
  icon: { fontSize: 16, flexShrink: 0 },
  title: { fontWeight: 600, letterSpacing: "-0.1px" },
  body: { fontSize: 12, opacity: 0.85, marginTop: 1 },
  link: { fontSize: 12, fontWeight: 600, textDecoration: "underline", whiteSpace: "nowrap" },
  close: { width: 24, height: 24, padding: 0, background: "transparent", border: "none",
    color: "currentColor", opacity: 0.6, cursor: "pointer", fontSize: 14, lineHeight: 1, flexShrink: 0 },
  counter: { fontSize: 11, padding: "2px 8px", borderRadius: 999,
    background: "rgba(0,0,0,0.25)", whiteSpace: "nowrap" },
};
