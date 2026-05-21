// src/CommandEngagement.jsx
// Command Center — Sales & Engagement (Core Indicator #4).
// Channel mix, self-service adoption, promo & loyalty engagement.

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const MONO = "var(--m)";
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "jt"
  : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(n || 0));

export default function CommandEngagement() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`${API}/api/engagement`).then(r => r.json()).then(setD).catch(e => setErr(String(e)));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (err) return <div style={S.msg}>Gagal memuat Sales & Engagement: {err}</div>;
  if (!d) return <div style={S.msg}>Memuat Sales & Engagement…</div>;
  const s = d.summary;
  const maxOrders = Math.max(1, ...d.channels.map(c => c.orders));

  return (
    <div style={S.wrap}>
      <div style={S.kpiRow}>
        <Kpi label="Total Order" value={String(s.total_orders)} accent="#3b82f6" sub="semua channel" />
        <Kpi label="Self-Service" value={s.self_service_pct + "%"}
          accent={s.self_service_pct >= 40 ? "#10b981" : "#f59e0b"} sub="order tanpa kasir" />
        <Kpi label="Promo Redemption" value={String(s.promo_redemptions)} accent="#ec4899" sub="kali promo dipakai" />
        <Kpi label="Loyalty Member" value={String(s.loyalty_members)} accent="#a78bfa" sub="member terdaftar" />
      </div>

      <div style={S.card}>
        <div style={S.kicker}>📊 CHANNEL MIX — ORDER PER KANAL</div>
        {d.channels.map(c => (
          <div key={c.source} style={S.chRow}>
            <span style={{ fontSize: 16, width: 24, flexShrink: 0 }}>{c.icon}</span>
            <span style={{ width: 160, fontSize: 13, color: "#e4e4e7", fontWeight: 600, flexShrink: 0 }}>
              {c.label}
              {c.self_service && <span style={{ fontSize: 9, color: "#10b981", marginLeft: 6, fontFamily: MONO }}>SELF</span>}
            </span>
            <div style={{ flex: 1, height: 10, background: "#15151e", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: Math.round(c.orders / maxOrders * 100) + "%", background: c.self_service ? "#10b981" : "#3b82f6" }} />
            </div>
            <span style={{ width: 56, textAlign: "right", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{c.orders}</span>
            <span style={{ width: 40, textAlign: "right", fontFamily: MONO, fontSize: 11, color: "#888", flexShrink: 0 }}>{c.pct}%</span>
            <span style={{ width: 84, textAlign: "right", fontFamily: MONO, fontSize: 12, color: "#34d399", flexShrink: 0 }}>Rp {fmtK(c.revenue)}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ ...S.card, borderColor: "#10b98155" }}>
          <div style={S.kicker}>🤖 SELF-SERVICE ADOPTION</div>
          <div style={{ fontSize: 44, fontWeight: 800, color: "#10b981", fontFamily: MONO, lineHeight: 1.1 }}>{s.self_service_pct}%</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, lineHeight: 1.5 }}>
            customer pesan mandiri lewat Kiosk &amp; QR Order — tanpa kasir. Makin tinggi = makin efisien, hemat tenaga, antrian pendek.
          </div>
        </div>
        <div style={S.card}>
          <div style={S.kicker}>🎁 PROMO &amp; LOYALTY ENGAGEMENT</div>
          <Row k="Promo aktif" v={`${d.promo.active} / ${d.promo.total}`} />
          <Row k="Total redemption promo" v={String(d.promo.redemptions)} />
          <Row k="Loyalty member" v={String(d.loyalty.members)} />
          <Row k="Repeat customer" v={`${d.loyalty.repeat} (${d.loyalty.repeat_pct}%)`} />
          <Row k="Poin beredar" v={`${fmtK(d.loyalty.points_outstanding)} pt`} />
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #15151e", fontSize: 13 }}>
      <span style={{ color: "#888" }}>{k}</span>
      <b style={{ color: "#e4e4e7", fontFamily: MONO }}>{v}</b>
    </div>
  );
}

function Kpi({ label, value, accent, sub }) {
  return (
    <div style={{ ...S.kpi, borderTop: `2px solid ${accent}` }}>
      <div style={{ fontSize: 10, color: "#666", letterSpacing: 1, textTransform: "uppercase", fontFamily: MONO }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, fontFamily: MONO, margin: "5px 0 2px" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#777" }}>{sub}</div>
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  msg: { padding: 40, textAlign: "center", color: "#666", fontSize: 14 },
  card: { background: "#0e0e13", border: "1px solid #1c1c25", borderRadius: 14, padding: 18 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#888", fontFamily: MONO, marginBottom: 12 },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  kpi: { background: "#0e0e13", border: "1px solid #1c1c25", borderRadius: 12, padding: "12px 14px" },
  chRow: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #15151e" },
};
