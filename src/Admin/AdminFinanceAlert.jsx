// src/Admin/AdminFinanceAlert.jsx
// Finance Alert Engine — risk monitoring finance: cash variance,
// invoice overdue, expense spike, margin drop, refund abnormal.

import { useState, useEffect, useCallback } from "react";
import { ErrorInline } from "../components/ConnectionError.jsx";
import { LoadingState } from "../components/uiKit.jsx";

const SEV = {
  critical: { c: "#ef4444", bg: "#2a1416", label: "CRITICAL" },
  warning:  { c: "#f59e0b", bg: "#2a2114", label: "WARNING" },
  info:     { c: "#3b82f6", bg: "#14202a", label: "INFO" },
};

export default function AdminFinanceAlert({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/finance-alerts`).then(r => r.json())
      .then(j => j && j.summary ? setD(j) : setErr("data tidak tersedia"))
      .catch(e => setErr(String(e)));
  }, [apiBase]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (err) return <div style={{ padding: 20 }}><ErrorInline error={err} /></div>;
  if (!d) return <LoadingState label="Memuat finance alert…" />;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🚨 <b style={{ color: "#ef4444" }}>FINANCE ALERT ENGINE</b> — scan otomatis tiap 30 detik:
        cash variance, invoice overdue, expense spike, margin drop, refund/cancel abnormal. Risk monitoring finance.
      </div>

      <div style={{ ...S.card, marginBottom: 14, display: "flex", gap: 28, alignItems: "center" }}>
        <div>
          <span style={{ fontSize: 32, fontWeight: 800, color: s.total ? "#f59e0b" : "#10b981", fontFamily: "'Geist Mono',monospace" }}>{s.total}</span>
          <span style={{ color: "#9da7b3", fontSize: 13, marginLeft: 8 }}>alert aktif</span>
        </div>
        <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>● {s.critical} critical</div>
        <div style={{ color: "#f59e0b", fontSize: 13, fontWeight: 600 }}>● {s.warning} warning</div>
        {s.info > 0 ? <div style={{ color: "#3b82f6", fontSize: 13, fontWeight: 600 }}>● {s.info} info</div> : null}
      </div>

      {d.healthy ? (
        <div style={{ ...S.card, textAlign: "center", padding: 44, color: "#10b981", fontSize: 14 }}>
          ✓ Semua sehat — tidak ada alert finance.
        </div>
      ) : d.alerts.map((a, i) => {
        const sv = SEV[a.severity] || SEV.info;
        return (
          <div key={i} style={{ ...S.card, marginBottom: 10, borderLeft: `4px solid ${sv.c}`, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{a.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>{a.title}</span>
                <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 5, background: sv.bg, color: sv.c, fontFamily: "'Geist Mono',monospace" }}>{a.category}</span>
              </div>
              <div style={{ fontSize: 13, color: "#9da7b3", marginTop: 4 }}>{a.detail}</div>
            </div>
            <span style={{ fontSize: 10, color: sv.c, fontWeight: 700, fontFamily: "'Geist Mono',monospace", flexShrink: 0 }}>{sv.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
};
