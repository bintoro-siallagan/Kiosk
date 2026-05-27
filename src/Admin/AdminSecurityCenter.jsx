// src/Admin/AdminSecurityCenter.jsx
// Audit Trail + Smart Security Layer.

import { useState, useEffect, useCallback } from "react";
import { LoadingState } from "../components/uiKit.jsx";

const AC = "#e11d48";
const SEV = { critical: "#ef4444", warning: "#f59e0b", info: "#3b82f6" };
const TYPE_C = { login: "#3b82f6", approval: "#a855f7", refund: "#f59e0b", void: "#ef4444", payroll: "#10b981" };
const ago = (ts) => {
  if (!ts) return "—";
  const m = Math.floor((Date.now() / 1000 - ts) / 60);
  if (m < 1) return "baru saja";
  if (m < 60) return m + "m lalu";
  const h = Math.floor(m / 60);
  return h < 24 ? h + "j lalu" : Math.floor(h / 24) + "h lalu";
};

export default function AdminSecurityCenter({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/security-center`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (!d) return <LoadingState label="Memuat Security Center…" />;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🛡️ <b style={{ color: AC }}>SECURITY CENTER</b> — audit trail semua aktivitas (login, approval,
        refund, void, payroll) + smart security layer deteksi anomali. Scan tiap 30 detik.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Audit Events" v={String(s.audit_events)} c="#3b82f6" />
        <Kpi label="Active Threats" v={String(s.threats)} c={s.threats > 0 ? AC : "#10b981"} />
        <Kpi label="Critical" v={String(s.critical)} c={s.critical > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Status" v={s.secure ? "AMAN" : "WASPADA"} c={s.secure ? "#10b981" : "#f59e0b"} />
      </div>

      {/* Smart Security */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ ...S.kicker, color: AC }}>🚨 SMART SECURITY LAYER — {d.threats.length} anomali</div>
        {d.threats.length === 0 ? (
          <div style={{ fontSize: 13, color: "#10b981", padding: "14px 0", textAlign: "center" }}>✓ Gak ada ancaman terdeteksi — sistem aman.</div>
        ) : (
          <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
            {d.threats.map((t, i) => {
              const c = SEV[t.severity] || SEV.info;
              return (
                <div key={i} style={{ display: "flex", gap: 11, background: "#0a0e16", border: "1px solid #161b22", borderLeft: `4px solid ${c}`, borderRadius: 9, padding: "11px 14px" }}>
                  <span style={{ fontSize: 20 }}>{t.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{t.title}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: c, background: c + "1f", border: `1px solid ${c}55`, borderRadius: 5, padding: "2px 7px", fontFamily: "'Geist Mono',monospace" }}>{t.category}</span>
                      <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, color: c, fontFamily: "'Geist Mono',monospace" }}>{t.severity.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#9da7b3", marginTop: 4, lineHeight: 1.5 }}>{t.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Audit trail */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📜 AUDIT TRAIL — {d.audit_trail.length} aktivitas terbaru</div>
        <div style={{ marginTop: 10 }}>
          {d.audit_trail.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
              <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{e.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: TYPE_C[e.type] || "#9da7b3", width: 62, fontFamily: "'Geist Mono',monospace" }}>{e.type.toUpperCase()}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#e6edf3", width: 110, flexShrink: 0 }}>{e.actor}</span>
              <span style={{ fontSize: 12, color: "#9da7b3", flex: 1 }}>{e.detail}</span>
              <span style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{ago(e.time)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
};
