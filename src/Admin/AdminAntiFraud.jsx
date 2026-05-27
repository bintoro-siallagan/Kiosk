// src/Admin/AdminAntiFraud.jsx
// Anti-Fraud Engine — deteksi pola mencurigakan reward & transaksi.

import { useState, useEffect, useCallback } from "react";
import { LoadingState } from "../components/uiKit.jsx";

const SEV = {
  critical: { c: "#ef4444", t: "CRITICAL" },
  warning: { c: "#f59e0b", t: "WARNING" },
  info: { c: "#3b82f6", t: "INFO" },
};

export default function AdminAntiFraud({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/anti-fraud`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (!d) return <LoadingState label="Memuat Anti-Fraud Engine…" sub="Scan otomatis berjalan tiap 30 detik" />;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🛡️ <b style={{ color: "#ef4444" }}>ANTI-FRAUD ENGINE</b> — scan otomatis tiap 30 detik: abuse reward,
        fake transaction (void cepat), refund tinggi, unusual employee discount. Jaga integritas sistem.
      </div>

      <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 26 }}>
        <div>
          <span style={{ fontSize: 34, fontWeight: 900, color: s.total ? "#ef4444" : "#10b981", fontFamily: "'Geist Mono',monospace" }}>{s.total}</span>
          <span style={{ fontSize: 13, color: "#9da7b3", marginLeft: 8 }}>indikasi terdeteksi</span>
        </div>
        {s.critical > 0 && <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 700 }}>● {s.critical} critical</span>}
        {s.warning > 0 && <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 700 }}>● {s.warning} warning</span>}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#5b6470" }}>
          scan: {d.scanned.orders} order · {d.scanned.redemptions_7d} redemption (7h)
        </span>
      </div>

      {d.healthy ? (
        <div style={{ ...S.card, marginTop: 14, textAlign: "center", padding: 36, color: "#10b981" }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>Gak ada indikasi fraud</div>
          <div style={{ fontSize: 12, color: "#5b6470", marginTop: 4 }}>Semua transaksi & reward dalam pola normal.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {d.alerts.map((a, i) => {
            const sv = SEV[a.severity] || SEV.info;
            return (
              <div key={i} style={{ background: "#0d1117", border: "1px solid #161b22", borderLeft: `4px solid ${sv.c}`, borderRadius: 10, padding: "13px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{a.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>{a.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sv.c, background: sv.c + "1f", border: `1px solid ${sv.c}55`, borderRadius: 5, padding: "2px 8px", fontFamily: "'Geist Mono',monospace" }}>{a.category}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: sv.c, fontFamily: "'Geist Mono',monospace" }}>{sv.t}</span>
                </div>
                <div style={{ fontSize: 12, color: "#9da7b3", marginTop: 6, lineHeight: 1.55, paddingLeft: 30 }}>{a.detail}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
};
