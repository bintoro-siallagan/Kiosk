// src/Admin/AdminHRCommand.jsx
// Command Center HR — workforce health, top performer, burnout risk,
// low engagement, outlet morale, attendance. Dukung tim, bukan monitor.

import { useState, useEffect, useCallback } from "react";

const moraleColor = (m) => (m >= 70 ? "#10b981" : m >= 45 ? "#f59e0b" : "#ef4444");
const healthColor = (s) => (s >= 80 ? "#10b981" : s >= 60 ? "#f59e0b" : "#ef4444");
const TIER = { bronze: "#cd7f32", silver: "#9ca3af", gold: "#fbbf24", elite: "#22d3ee" };

export default function AdminHRCommand({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/hr-command`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat HR Command Center…</div>;
  const w = d.workforce_health, a = d.attendance, rd = d.reward_distribution;
  const hc = healthColor(w.score);

  return (
    <div>
      <div style={S.intro}>
        🏥 <b style={{ color: "#14b8a6" }}>COMMAND CENTER HR</b> — workforce health, top performer,
        burnout risk &amp; outlet morale dalam satu layar. Tujuannya <b>dukung tim</b> — bukan surveillance.
      </div>

      {/* Hero — workforce health */}
      <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 24, marginBottom: 14 }}>
        <div style={{ textAlign: "center", minWidth: 150 }}>
          <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace", letterSpacing: 1 }}>WORKFORCE HEALTH</div>
          <div style={{ fontSize: 52, fontWeight: 900, color: hc, fontFamily: "'Space Mono',monospace", lineHeight: 1.1 }}>{w.score}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: hc }}>{w.label}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 14, background: "#0a0e16", borderRadius: 7, overflow: "hidden" }}>
            <div style={{ height: "100%", width: w.score + "%", background: hc }} />
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 12, color: "#9da7b3" }}>
            <span>💚 Engagement rata-rata <b style={{ color: "#e6edf3" }}>{w.engagement_avg}</b></span>
            <span>👥 Crew aktif <b style={{ color: "#e6edf3" }}>{d.crew_count}</b></span>
            <span>⏱️ On-time <b style={{ color: "#e6edf3" }}>{a.ontime_rate}%</b></span>
          </div>
        </div>
      </div>

      <div style={S.kpiRow}>
        <Kpi label="On-time Rate" v={a.ontime_rate + "%"} c={a.ontime_rate >= 85 ? "#10b981" : "#f59e0b"} sub={`${a.late_count} kali telat`} />
        <Kpi label="Avg Produktivitas" v={String(a.avg_productivity)} c="#3b82f6" sub={`${a.total_shift} shift`} />
        <Kpi label="Crew Top Tier" v={String(rd.tier.gold + rd.tier.elite)} c="#fbbf24" sub="gold + elite" />
        <Kpi label="Reward Redeemed" v={String(rd.redemptions)} c="#ec4899" sub="benefit ditukar" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>⭐ TOP PERFORMER</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10, marginTop: 10 }}>
          {d.top_performers.map((p, i) => (
            <div key={i} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${TIER[p.tier]}`, borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : ""}{p.staff_name}</div>
              <div style={{ fontSize: 11, color: "#5b6470", margin: "2px 0 5px" }}>{p.outlet} · {p.role}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "'Space Mono',monospace" }}>
                <span style={{ color: "#fbbf24" }}>{p.xp.toLocaleString("id-ID")} XP</span>
                <span style={{ color: "#10b981" }}>🏆 {p.achievements}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        <div style={{ ...S.card, borderColor: "#f59e0b33" }}>
          <div style={{ ...S.kicker, color: "#f59e0b" }}>🌙 BURNOUT RISK — {d.burnout_risk.length}</div>
          {d.burnout_risk.length === 0 ? <Empty t="Gak ada crew over-worked. 👍" /> :
            d.burnout_risk.map((c, i) => (
              <div key={i} style={{ padding: "9px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>{c.staff_name} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {c.outlet}</span></div>
                <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2, lineHeight: 1.5 }}>{c.note}</div>
              </div>
            ))}
        </div>
        <div style={{ ...S.card, borderColor: "#3b82f633" }}>
          <div style={{ ...S.kicker, color: "#3b82f6" }}>🤝 LOW ENGAGEMENT — {d.low_engagement.length}</div>
          {d.low_engagement.length === 0 ? <Empty t="Semua crew engaged. 👍" /> :
            d.low_engagement.map((c, i) => (
              <div key={i} style={{ padding: "9px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>{c.staff_name} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {c.outlet}</span></div>
                <div style={{ fontSize: 11, color: "#7cc4ff", marginTop: 2, lineHeight: 1.5 }}>{c.note}</div>
              </div>
            ))}
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🏢 OUTLET MORALE</div>
        {d.outlet_morale.map((o, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
            <span style={{ width: 110, fontSize: 12, color: "#e6edf3", flexShrink: 0 }}>{o.outlet}</span>
            <div style={{ flex: 1, height: 11, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: o.morale + "%", background: moraleColor(o.morale) }} />
            </div>
            <span style={{ width: 60, textAlign: "right", fontFamily: "'Space Mono',monospace", fontSize: 12, color: moraleColor(o.morale), fontWeight: 700 }}>{o.morale}</span>
            <span style={{ width: 110, textAlign: "right", fontSize: 11, color: "#5b6470" }}>{o.label} · {o.crew} crew</span>
          </div>
        ))}
      </div>
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
function Empty({ t }) { return <div style={{ fontSize: 12, color: "#10b981", padding: "10px 0" }}>✓ {t}</div>; }

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
};
