// src/Admin/AdminFeedbackSegment.jsx
// Customer Feedback + Behavioral Segmentation.

import { useState, useEffect, useCallback } from "react";

const AC = "#eab308";
const ratingColor = (r) => (r >= 4.3 ? "#10b981" : r >= 3.5 ? "#f59e0b" : "#ef4444");

export default function AdminFeedbackSegment({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/feedback-segment`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Feedback Analytics…</div>;
  const f = d.feedback, s = d.summary;
  const maxDist = Math.max(1, ...Object.values(f.distribution));
  const maxTrend = Math.max(1, ...f.trend.map(t => t.count));

  return (
    <div>
      <div style={S.intro}>
        💬 <b style={{ color: AC }}>CUSTOMER FEEDBACK &amp; SEGMENTATION</b> — satisfaction trend, rating,
        komplain, perbandingan channel/kasir + persona marketing customer.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Avg Rating" v={"★ " + s.avg_rating} c={ratingColor(s.avg_rating)} sub={s.satisfaction_label} />
        <Kpi label="Total Feedback" v={String(f.total)} c={AC} />
        <Kpi label="Komplain" v={String(s.complaint_count)} c={s.complaint_count > 0 ? "#ef4444" : "#10b981"} sub="rating ≤ 2★" />
        <Kpi label="Customer Tersegmentasi" v={String(s.total_customers)} c="#d946ef" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 14, marginTop: 14 }}>
        {/* Rating distribution */}
        <div style={S.card}>
          <div style={S.kicker}>⭐ DISTRIBUSI RATING</div>
          {[5, 4, 3, 2, 1].map(r => (
            <div key={r} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0" }}>
              <span style={{ width: 34, fontSize: 12, color: "#9da7b3" }}>{r}★</span>
              <div style={{ flex: 1, height: 13, background: "#0a0e16", borderRadius: 7, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(f.distribution[r] / maxDist * 100) + "%", background: r >= 4 ? "#10b981" : r === 3 ? "#f59e0b" : "#ef4444" }} />
              </div>
              <span style={{ width: 32, textAlign: "right", fontFamily: "'Space Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{f.distribution[r]}</span>
            </div>
          ))}
        </div>
        {/* Satisfaction trend */}
        <div style={S.card}>
          <div style={S.kicker}>📈 SATISFACTION TREND</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginTop: 12 }}>
            {f.trend.map((t, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, color: ratingColor(t.avg), fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{t.avg}</span>
                <div style={{ width: "100%", height: Math.round(t.avg / 5 * 80) + 4, background: ratingColor(t.avg), borderRadius: 3 }} title={`${t.count} feedback`} />
                <span style={{ fontSize: 9, color: "#5b6470" }}>{t.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        <div style={S.card}>
          <div style={S.kicker}>📲 RATING per CHANNEL</div>
          {f.by_source.map((x, i) => <Bar key={i} label={x.name} avg={x.avg} count={x.count} />)}
        </div>
        <div style={S.card}>
          <div style={S.kicker}>👤 RATING per KASIR</div>
          {f.by_cashier.slice(0, 6).map((x, i) => <Bar key={i} label={x.name} avg={x.avg} count={x.count} />)}
        </div>
      </div>

      {f.complaints.length > 0 && (
        <div style={{ ...S.card, marginTop: 14, borderColor: "#ef444433" }}>
          <div style={{ ...S.kicker, color: "#ef4444" }}>⚠️ KOMPLAIN — perlu ditindaklanjuti</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {f.complaints.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 10, background: "#0a0e16", borderLeft: "3px solid #ef4444", borderRadius: 7, padding: "9px 12px" }}>
                <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 700 }}>{c.rating}★</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#cdd5df" }}>"{c.comment}"</div>
                  <div style={{ fontSize: 10, color: "#5b6470", marginTop: 2 }}>{c.source} · {c.cashier}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🧬 SEGMENTASI BEHAVIORAL — {d.segments.length} persona</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10, marginTop: 10 }}>
          {d.segments.map(g => (
            <div key={g.name} style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 9, padding: "11px 13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{g.icon} {g.name}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: AC, fontFamily: "'Space Mono',monospace" }}>{g.count}</span>
              </div>
              <div style={{ fontSize: 11, color: "#9da7b3", marginTop: 4, lineHeight: 1.5 }}>{g.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bar({ label, avg, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span style={{ width: 90, fontSize: 12, color: "#9da7b3", textTransform: "capitalize" }}>{label}</span>
      <div style={{ flex: 1, height: 12, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: Math.round(avg / 5 * 100) + "%", background: avg >= 4.3 ? "#10b981" : avg >= 3.5 ? "#f59e0b" : "#ef4444" }} />
      </div>
      <span style={{ width: 70, textAlign: "right", fontFamily: "'Space Mono',monospace", fontSize: 12, color: "#cdd5df" }}>★{avg} · {count}</span>
    </div>
  );
}
function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
};
