// src/Admin/AdminMotivation.jsx
// Smart Motivation — encouragement, streak reward, achievement wall.
// Selalu positif — apresiasi, bukan punishment.

import { useState, useEffect, useCallback } from "react";

export default function AdminMotivation({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/motivation`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Smart Motivation…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🧠 <b style={{ color: "#22c55e" }}>SMART MOTIVATION</b> — sistem kasih <b>encouragement</b>,
        rayakan <b>achievement</b> &amp; <b>streak reward</b> ke crew. Murni apresiasi &amp; semangat —
        <b> bukan punishment, bukan surveillance.</b> 💚
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Crew Termotivasi" v={String(s.crew_count)} c="#22c55e" />
        <Kpi label="Encouragement" v={String(s.encouragement_count)} c="#3b82f6" />
        <Kpi label="Streak Reward" v={String(s.streak_rewards_count)} c="#f59e0b" />
        <Kpi label="Achievement Dirayakan" v={String(s.achievements_celebrated)} c="#fbbf24" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🎁 STREAK REWARD — crew yang konsisten</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10, marginTop: 10 }}>
          {d.streak_rewards.map((r, i) => (
            <div key={i} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: "3px solid #f59e0b", borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{r.icon} {r.staff_name}</div>
              <div style={{ fontSize: 11, color: "#5b6470", margin: "2px 0 6px" }}>{r.outlet}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>🔥 {r.streak_days} hari streak</span>
                <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>→ {r.reward}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* Encouragement feed */}
        <div style={S.card}>
          <div style={S.kicker}>💬 ENCOURAGEMENT — pesan buat tiap crew</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {d.encouragements.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 11, background: "#0a0e16", border: "1px solid #161b22", borderLeft: "3px solid #22c55e", borderRadius: 9, padding: "10px 12px" }}>
                <span style={{ fontSize: 20 }}>{e.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3" }}>
                    {e.staff_name} <span style={{ color: "#5b6470", fontWeight: 400 }}>· {e.level.icon} {e.outlet}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#9da7b3", marginTop: 2, lineHeight: 1.5 }}>{e.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievement wall */}
        <div style={S.card}>
          <div style={S.kicker}>🏆 ACHIEVEMENT WALL — {d.achievement_unlocks.length}</div>
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {d.achievement_unlocks.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, padding: "6px 9px", background: "#0a0e16", borderRadius: 7 }}>
                <span style={{ fontSize: 15 }}>{a.icon}</span>
                <span style={{ color: "#e6edf3", fontWeight: 600 }}>{a.staff_name}</span>
                <span style={{ color: "#5b6470" }}>unlock</span>
                <span style={{ color: "#fbbf24", fontWeight: 600, marginLeft: "auto" }}>{a.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
};
