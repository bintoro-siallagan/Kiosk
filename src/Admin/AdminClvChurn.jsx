// src/Admin/AdminClvChurn.jsx
// Customer Lifetime Value + Churn Detection.

import { useState, useEffect, useCallback } from "react";

import { fmtMoney as fmtRp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";
const AC = "#10b981";
const TIER_C = { Platinum: "#e5e7eb", Gold: "#fbbf24", Silver: "#9ca3af", Bronze: "#cd7f32" };
const STAGE_C = { New: "#22d3ee", Active: "#10b981", Cooling: "#f59e0b", "At Risk": "#f97316", Churned: "#ef4444" };

export default function AdminClvChurn({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/clv-churn`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <LoadingState label="Memuat CLV & Churn…" />;
  const cl = d.clv, ch = d.churn;
  const maxTier = Math.max(1, ...Object.values(cl.tier_dist));
  const maxStage = Math.max(1, ...Object.values(ch.stage_dist));
  const maxClv = Math.max(1, ...cl.top.map(c => c.clv));

  return (
    <div>
      <div style={S.intro}>
        📉 <b style={{ color: AC }}>CLV &amp; CHURN DETECTION</b> — nilai customer seumur hidup +
        deteksi siapa mulai jarang datang → target <b>auto comeback promo</b>. 🔥
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total CLV" v={fmtRp(cl.summary.total_clv)} c={AC} sub="realized value" />
        <Kpi label="Avg CLV / Customer" v={fmtRp(cl.summary.avg_clv)} c="#3b82f6" />
        <Kpi label="Churn Risk" v={ch.summary.churn_rate + "%"} c={ch.summary.churn_rate > 20 ? "#ef4444" : "#f59e0b"} sub={`${ch.summary.at_risk + ch.summary.churned} customer`} />
        <Kpi label="Active Customer" v={String(ch.summary.active)} c="#10b981" sub="rutin datang" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        {/* CLV tier */}
        <div style={S.card}>
          <div style={S.kicker}>💎 CLV TIER DISTRIBUTION</div>
          {["Platinum", "Gold", "Silver", "Bronze"].map(t => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ width: 70, fontSize: 12, color: TIER_C[t] }}>{t}</span>
              <div style={{ flex: 1, height: 13, background: "#0a0e16", borderRadius: 7, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(cl.tier_dist[t] / maxTier * 100) + "%", background: TIER_C[t] }} />
              </div>
              <span style={{ width: 30, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{cl.tier_dist[t]}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#5b6470", marginTop: 8 }}>Proyeksi 12 month: <b style={{ color: AC }}>{fmtRp(cl.summary.projected_total)}</b> kalau pace dipertahankan.</div>
        </div>
        {/* Churn stage */}
        <div style={S.card}>
          <div style={S.kicker}>🌡️ CHURN STAGE</div>
          {["New", "Active", "Cooling", "At Risk", "Churned"].map(st => (
            <div key={st} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ width: 70, fontSize: 12, color: STAGE_C[st] }}>{st}</span>
              <div style={{ flex: 1, height: 13, background: "#0a0e16", borderRadius: 7, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(ch.stage_dist[st] / maxStage * 100) + "%", background: STAGE_C[st] }} />
              </div>
              <span style={{ width: 30, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{ch.stage_dist[st]}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#5b6470", marginTop: 8 }}>Stage dihitung from recency vs gap kunjungan normal tiap customer.</div>
        </div>
      </div>

      {/* Top CLV */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🏆 TOP CUSTOMER by CLV</div>
        {cl.top.map((c, i) => (
          <div key={i} style={{ padding: "8px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: "#e6edf3", fontWeight: 600 }}>
                {i + 1}. {c.name} <span style={{ color: TIER_C[c.tier], fontSize: 10, fontWeight: 700 }}>{c.tier}</span>
              </span>
              <span style={{ color: "#9da7b3", fontFamily: "'Geist Mono',monospace" }}>
                {fmtRp(c.clv)} · {c.visits}× · proyeksi {fmtRp(c.projected_12mo)}
              </span>
            </div>
            <div style={{ height: 6, background: "#0a0e16", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: Math.round(c.clv / maxClv * 100) + "%", background: AC }} />
            </div>
          </div>
        ))}
      </div>

      {/* Comeback targets */}
      <div style={{ ...S.card, marginTop: 14, borderColor: "#f9731633" }}>
        <div style={{ ...S.kicker, color: "#f97316" }}>🎁 TARGET AUTO COMEBACK PROMO — {ch.comeback_targets.length}</div>
        {ch.comeback_targets.length === 0 ? (
          <div style={{ fontSize: 12, color: "#10b981", padding: "10px 0" }}>✓ Gak ada customer churning. 👍</div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {ch.comeback_targets.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0a0e16", borderLeft: `3px solid ${STAGE_C[t.stage]}`, borderRadius: 8, padding: "10px 13px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                    {t.name} <span style={{ fontSize: 10, fontWeight: 700, color: STAGE_C[t.stage], marginLeft: 4 }}>{t.stage.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#5b6470" }}>
                    {t.recency_days} hari gak datang (normal tiap {t.typical_gap} hari) · CLV {fmtRp(t.clv)}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#f97316", background: "#f973161f", border: "1px solid #f9731655", borderRadius: 6, padding: "5px 10px" }}>
                  🎁 {t.suggested_promo}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
};
