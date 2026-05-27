// src/Admin/AdminReward.jsx
// Staff Reward Engine — XP, point, level, achievement, leaderboard.
// Appreciation & gamification — bukan surveillance.

import { useState, useEffect, useCallback } from "react";
import { LoadingState } from "../components/uiKit.jsx";

const RANK = ["🥇", "🥈", "🥉"];

export default function AdminReward({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/rewards`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <LoadingState label="Memuat Reward Engine…" />;
  const s = d.summary;
  const tiers = d.catalog.levels;
  const maxTier = Math.max(1, ...Object.values(s.tier));

  return (
    <div>
      <div style={S.intro}>
        🎮 <b style={{ color: "#a855f7" }}>STAFF REWARD ENGINE</b> — XP, point, level &amp; achievement buat crew.
        Fokus <b>appreciation &amp; motivasi</b> — bukan surveillance. Crew naik level dari Bronze sampai Elite. 🔥
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Crew" v={String(s.total_crew)} c="#a855f7" sub="aktif" />
        <Kpi label="Elite + Gold" v={String(s.tier.elite + s.tier.gold)} c="#22d3ee" sub="crew top tier" />
        <Kpi label="Total XP" v={s.total_xp.toLocaleString("id-ID")} c="#fbbf24" sub="terdistribusi" />
        <Kpi label="Achievement" v={String(s.achievements_unlocked)} c="#10b981" sub="ke-unlock" />
      </div>

      {/* Level distribution */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📊 DISTRIBUSI LEVEL</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 10 }}>
          {tiers.map(t => (
            <div key={t.tier} style={{ background: "#0a0e16", border: "1px solid #161b22", borderTop: `2px solid ${t.color}`, borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.color }}>{t.icon} {t.name}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#e6edf3", fontFamily: "'Geist Mono',monospace", margin: "3px 0" }}>{s.tier[t.tier] || 0}</div>
              <div style={{ height: 6, background: "#161b22", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round((s.tier[t.tier] || 0) / maxTier * 100) + "%", background: t.color }} />
              </div>
              <div style={{ fontSize: 10, color: "#5b6470", marginTop: 4 }}>mulai {t.min.toLocaleString("id-ID")} XP</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* Leaderboard */}
        <div style={S.card}>
          <div style={S.kicker}>🏆 TOP CREW THIS WEEK</div>
          {d.leaderboard.map(r => (
            <div key={r.rank} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: r.rank > 1 ? "1px solid #161b22" : "none" }}>
              <span style={{ width: 26, textAlign: "center", fontSize: r.rank <= 3 ? 16 : 12, fontWeight: 700, color: "#5b6470" }}>
                {RANK[r.rank - 1] || "#" + r.rank}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>{r.staff_name}</div>
                <div style={{ fontSize: 11, color: "#5b6470" }}>{r.outlet} · {r.role}</div>
              </div>
              <span style={{ fontSize: 11, color: r.level.color, fontWeight: 700 }}>{r.level.icon}</span>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>{r.xp.toLocaleString("id-ID")} XP</span>
            </div>
          ))}
        </div>

        {/* Crew cards */}
        <div style={S.card}>
          <div style={S.kicker}>👥 CREW — LEVEL & ACHIEVEMENT</div>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {d.crew.map(c => (
              <div key={c.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${c.level.color}`, borderRadius: 9, padding: "11px 13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>{c.staff_name}</span>
                    <span style={{ fontSize: 11, color: "#5b6470", marginLeft: 8 }}>{c.outlet} · {c.role}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.level.color, background: c.level.color + "1f", border: `1px solid ${c.level.color}55`, borderRadius: 6, padding: "3px 9px" }}>
                    {c.level.icon} {c.level.name}
                  </span>
                </div>
                <div style={{ height: 9, background: "#161b22", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: c.progress_pct + "%", background: c.level.color }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, fontFamily: "'Geist Mono',monospace" }}>
                  <span style={{ color: "#fbbf24" }}>{c.xp.toLocaleString("id-ID")} XP</span>
                  <span style={{ color: "#5b6470" }}>{c.next ? `${c.xp_to_next.toLocaleString("id-ID")} XP lagi → ${c.next.name}` : "Level MAX 💎"}</span>
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 7, fontSize: 12, color: "#9da7b3" }}>
                  <span>⭐ {c.points} poin</span>
                  <span>🔥 {c.streak_days} hari streak</span>
                  <span style={{ marginLeft: "auto" }}>
                    {c.achievements.length ? c.achievements.map((a, i) => <span key={i} title={a.name + " — " + a.desc}>{a.icon}</span>) : <span style={{ color: "#5b6470" }}>belum ada achievement</span>}
                    {c.achievement_count ? <b style={{ color: "#10b981", marginLeft: 4 }}>{c.achievement_count}</b> : null}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
};
