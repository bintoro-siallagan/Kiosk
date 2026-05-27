// src/Admin/AdminRoleDashboard.jsx
// Role Dashboards — tiap role punya dashboard berbeda sesuai fokusnya.

import { useState, useEffect, useCallback } from "react";

import { fmtMoney as fmtRp } from "../lib/currency.js";
const fmtVal = (v, fmt) =>
  fmt === "rp" ? fmtRp(v) : fmt === "rating" ? "★ " + v : Number(v || 0).toLocaleString("id-ID");

export default function AdminRoleDashboard({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [sel, setSel] = useState("owner");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/role-dashboard`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Role Dashboards…</div>;
  const dash = d.dashboards.find(x => x.id === sel) || d.dashboards[0];

  return (
    <div>
      <div style={S.intro}>
        📊 <b style={{ color: "#818cf8" }}>ROLE DASHBOARDS</b> — tiap role punya dashboard berbeda sesuai
        fokus kerjanya. Owner lihat finance, Warehouse lihat inventory, Marketing lihat campaign — bukan satu layar buat semua.
      </div>

      {/* Role selector */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {d.dashboards.map(r => {
          const on = r.id === sel;
          return (
            <button key={r.id} onClick={() => setSel(r.id)}
              style={{ background: on ? r.accent : "#0d1117", border: `1px solid ${on ? r.accent : "#21262d"}`,
                color: on ? "#fff" : "#9da7b3", fontSize: 12, fontWeight: on ? 700 : 500, padding: "7px 12px",
                borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
              {r.icon} {r.id.replace(/-/g, " ")}
            </button>
          );
        })}
      </div>

      {/* Dashboard panel */}
      <div style={{ ...S.card, borderTop: `3px solid ${dash.accent}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 34 }}>{dash.icon}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#e6edf3" }}>{dash.title}</div>
            <div style={{ fontSize: 12, color: "#9da7b3" }}>{dash.focus}</div>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: dash.accent, background: dash.accent + "1f", border: `1px solid ${dash.accent}55`, borderRadius: 6, padding: "4px 10px", fontFamily: "'Geist Mono',monospace" }}>
            {dash.id.toUpperCase()}
          </span>
        </div>

        {dash.widgets.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "#5b6470" }}>
            <div style={{ fontSize: 36 }}>{dash.icon}</div>
            <div style={{ fontSize: 13, color: "#9da7b3", marginTop: 8 }}>Role ini diakses lewat <b style={{ color: dash.accent }}>Customer Portal</b> — bukan panel admin.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12 }}>
            {dash.widgets.map((w, i) => (
              <div key={i} style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 10, padding: "13px 15px" }}>
                <div style={{ fontSize: 22 }}>{w.icon}</div>
                <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace", margin: "6px 0 3px" }}>{w.label.toUpperCase()}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: dash.accent, fontFamily: "'Geist Mono',monospace" }}>{fmtVal(w.value, w.fmt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: "#5b6470", marginTop: 10 }}>
        💡 {d.dashboards.length} role · tiap login otomatis dapat dashboard sesuai role-nya — fokus, gak overwhelm.
      </div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
};
