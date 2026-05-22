// src/Admin/AdminSelfAudit.jsx
// Self-Audit Center — sistem mengaudit dirinya sendiri.

import { useState, useEffect, useCallback } from "react";

const AC = "#16a34a";
const ST = { ok: { c: "#10b981", l: "OK" }, warning: { c: "#f59e0b", l: "WARNING" }, critical: { c: "#ef4444", l: "KRITIS" } };

export default function AdminSelfAudit({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/self-audit`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Menjalankan self-audit…</div>;
  const sc = d.health_score;
  const scoreColor = sc >= 90 ? "#10b981" : sc >= 75 ? "#3b82f6" : sc >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div>
      <div style={S.intro}>
        🔎 <b style={{ color: "#4ade80" }}>SELF-AUDIT CENTER</b> — sistem menjalankan health-check otomatis
        lintas domain &amp; mengaudit dirinya sendiri. Health score, KPI per domain &amp; daftar isu.
      </div>

      {/* Health score + KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 2.4fr", gap: 12 }}>
        <div style={{ ...S.card, textAlign: "center", borderTop: `2px solid ${scoreColor}` }}>
          <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>HEALTH SCORE</div>
          <div style={{ fontSize: 52, fontWeight: 800, color: scoreColor, fontFamily: "'Geist Mono',monospace", lineHeight: 1.1, margin: "6px 0" }}>{sc}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: scoreColor }}>{d.grade}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          <Kpi label="Total Cek" v={String(d.summary.total_checks)} c={AC} />
          <Kpi label="Lolos" v={String(d.summary.passed)} c="#10b981" />
          <Kpi label="Warning" v={String(d.summary.warning)} c="#f59e0b" />
          <Kpi label="Kritis" v={String(d.summary.critical)} c={d.summary.critical > 0 ? "#ef4444" : "#10b981"} />
          <Kpi label="Domain Diaudit" v={String(d.domains.length)} c="#a855f7" />
          <Kpi label="Isu Ditemukan" v={String(d.issues.length)} c={d.issues.length > 0 ? "#f59e0b" : "#10b981"} />
        </div>
      </div>

      {/* Domains */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🗂️ HEALTH CHECK PER DOMAIN</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 12, marginTop: 10 }}>
          {d.domains.map(dom => {
            const st = ST[dom.status] || ST.ok;
            return (
              <div key={dom.domain} style={{ background: "#0a0e16", border: "1px solid #161b22", borderTop: `2px solid ${st.c}`, borderRadius: 10, padding: "11px 13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{dom.icon} {dom.domain}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: st.c, fontFamily: "'Geist Mono',monospace" }}>{dom.score}</span>
                </div>
                {dom.checks.map((ch, i) => {
                  const cs = ST[ch.status] || ST.ok;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11.5 }}>
                      <span style={{ color: cs.c }}>{ch.status === "ok" ? "✓" : ch.status === "warning" ? "⚠" : "✕"}</span>
                      <span style={{ flex: 1, color: "#cdd5df" }}>{ch.name}</span>
                      <span style={{ color: "#5b6470", fontSize: 10 }}>{ch.detail}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Issues */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🚩 ISU DITEMUKAN — {d.issues.length}</div>
        {d.issues.length === 0 ? (
          <div style={{ fontSize: 13, color: "#10b981", padding: "14px 0", textAlign: "center" }}>✓ Semua cek lolos. Sistem sehat sempurna.</div>
        ) : d.issues.map((x, i) => {
          const st = ST[x.status] || ST.warning;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "3px 8px", width: 60, textAlign: "center", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
              <span style={{ width: 150, color: "#5b6470", fontSize: 11 }}>{x.domain}</span>
              <span style={{ flex: 1, color: "#e6edf3", fontWeight: 600 }}>{x.name}</span>
              <span style={{ color: "#9da7b3", fontSize: 11 }}>{x.detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 3 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
};
