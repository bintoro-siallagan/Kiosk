// src/Admin/AdminGeoEngagement.jsx
// Geo & Outlet + Engagement + Customer Journey Analytics.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#6366f1";

export default function AdminGeoEngagement({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/geo-engagement`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Geo & Engagement…</div>;
  const g = d.geo, e = d.engagement, s = d.summary;
  const maxOutlet = Math.max(1, ...g.outlets.map(o => o.revenue));
  const maxArea = Math.max(1, ...g.by_area.map(a => a.revenue));
  const chT = e.channel.cashier + e.channel.kiosk + e.channel.qr || 1;
  const maxJ = Math.max(1, ...d.journey.map(j => j.count));

  return (
    <div>
      <div style={S.intro}>
        🗺️ <b style={{ color: AC }}>GEO &amp; ENGAGEMENT</b> — outlet traffic, area performance,
        engagement channel &amp; customer journey funnel (scan → order → member → loyalty → loyal).
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Outlet" v={String(s.outlets)} c={AC} sub={`${s.areas} area`} />
        <Kpi label="Self-Service Rate" v={e.self_service_rate + "%"} c="#a855f7" sub="kiosk + QR" />
        <Kpi label="Loyalty Participation" v={e.loyalty_participation + "%"} c="#fbbf24" sub="customer aktif poin" />
        <Kpi label="Member Conversion" v={s.member_conversion + "%"} c="#10b981" sub="order → member" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* Outlet traffic */}
        <div style={S.card}>
          <div style={S.kicker}>🏢 OUTLET TRAFFIC — peak: {g.peak_outlet}</div>
          {g.outlets.map((o, i) => (
            <div key={i} style={{ padding: "7px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: "#e6edf3", fontWeight: 600 }}>{o.name} <span style={{ color: "#5b6470", fontWeight: 400 }}>· {o.area}</span></span>
                <span style={{ color: "#9da7b3", fontFamily: "'Space Mono',monospace" }}>{fmtRp(o.revenue)} · ♥{o.health}</span>
              </div>
              <div style={{ height: 7, background: "#0a0e16", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(o.revenue / maxOutlet * 100) + "%", background: AC }} />
              </div>
            </div>
          ))}
        </div>
        {/* Area performance */}
        <div style={S.card}>
          <div style={S.kicker}>📍 AREA PERFORMANCE — peak: {g.peak_area}</div>
          {g.by_area.map((a, i) => (
            <div key={i} style={{ padding: "8px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: "#e6edf3", fontWeight: 600 }}>{a.area}</span>
                <span style={{ color: "#9da7b3", fontFamily: "'Space Mono',monospace" }}>{a.outlets} outlet · ♥{a.avg_health}</span>
              </div>
              <div style={{ height: 9, background: "#0a0e16", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(a.revenue / maxArea * 100) + "%", background: "#10b981" }} />
              </div>
              <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Space Mono',monospace", marginTop: 2 }}>{fmtRp(a.revenue)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Engagement */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📲 ENGAGEMENT ANALYTICS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginTop: 10 }}>
          <div>
            {[["Cashier", e.channel.cashier, "#3b82f6"], ["Kiosk", e.channel.kiosk, "#a855f7"], ["QR Order", e.channel.qr, "#10b981"]].map(([n, v, c]) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                <span style={{ width: 80, fontSize: 12, color: "#9da7b3" }}>{n}</span>
                <div style={{ flex: 1, height: 12, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: Math.round(v / chT * 100) + "%", background: c }} />
                </div>
                <span style={{ width: 64, textAlign: "right", fontFamily: "'Space Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{v} · {Math.round(v / chT * 100)}%</span>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 7, alignContent: "start" }}>
            <Stat label="Self-Service" v={e.self_service_rate + "%"} c="#a855f7" />
            <Stat label="QR Engagement" v={e.qr_rate + "%"} c="#10b981" />
            <Stat label="Feedback Diterima" v={String(e.feedback_count)} c="#eab308" />
            <Stat label="Member Aktif" v={String(e.members)} c="#3b82f6" />
          </div>
        </div>
      </div>

      {/* Journey */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🛤️ CUSTOMER JOURNEY — lifecycle funnel</div>
        <div style={{ marginTop: 10 }}>
          {d.journey.map((j, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ width: 130, fontSize: 12, color: "#e6edf3" }}>{j.icon} {j.stage}</span>
              <div style={{ flex: 1, height: 16, background: "#0a0e16", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(j.count / maxJ * 100) + "%", background: AC, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>
                  <span style={{ fontSize: 10, color: "#fff", fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{j.count}</span>
                </div>
              </div>
              <span style={{ width: 44, textAlign: "right", fontFamily: "'Space Mono',monospace", fontSize: 12, color: "#9da7b3" }}>{j.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, v, c }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0e16", border: "1px solid #161b22", borderRadius: 8, padding: "9px 12px" }}>
      <span style={{ fontSize: 12, color: "#9da7b3" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace" }}>{v}</span>
    </div>
  );
}
function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
};
