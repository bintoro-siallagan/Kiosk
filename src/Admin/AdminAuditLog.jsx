// src/Admin/AdminAuditLog.jsx
// White-label P2D UI — per-tenant audit log viewer.

import { useEffect, useState, useCallback } from "react";

const ACTIONS = ["", "branding.update", "branding.logo_upload", "integration.update", "integration.wipe"];

export default function AdminAuditLog({ onBack }) {
  const [events, setEvents] = useState([]);
  const [action, setAction] = useState("");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    params.set("limit", limit);
    fetch(`/api/audit?${params}`)
      .then(r => r.ok ? r.json() : { events: [], error: "auth required" })
      .then(d => { setEvents(d.events || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [action, limit]);
  useEffect(load, [load]);

  return (
    <div style={S.root}>
      <header style={S.header}>
        {onBack && <button onClick={onBack} style={S.backBtn}>← Back</button>}
        <h2 style={S.title}>Audit Log</h2>
      </header>

      <div style={S.intro}>
        📋 <b style={{ color: "#fff" }}>Per-tenant audit trail</b> — who changed what, when. Critical for compliance + investigation. Sensitive payload values (passwords, keys) never logged in plaintext.
      </div>

      <div style={S.controls}>
        <label style={S.controlLabel}>Action:</label>
        <select value={action} onChange={e => setAction(e.target.value)} style={S.select}>
          <option value="">All actions</option>
          {ACTIONS.filter(a => a).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <label style={S.controlLabel}>Limit:</label>
        <select value={limit} onChange={e => setLimit(parseInt(e.target.value))} style={S.select}>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={500}>500</option>
        </select>
        <button onClick={load} style={S.refreshBtn}>↻ Refresh</button>
      </div>

      {loading && <div style={S.empty}>Loading…</div>}
      {!loading && events.length === 0 && <div style={S.empty}>No audit events yet for this tenant.</div>}

      {events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map(e => (
            <div key={e.id} style={S.row}>
              <div style={S.rowHead}>
                <span style={S.action}>{e.action}</span>
                <span style={S.actor}>by {e.actor}</span>
                <span style={S.ts}>{new Date(e.ts_iso).toLocaleString()}</span>
              </div>
              {e.entity && (
                <div style={S.rowSub}>
                  Entity: <code style={S.code}>{e.entity}{e.entity_id ? `#${e.entity_id}` : ""}</code>
                  {e.ip && <span style={{ marginLeft: 8 }}>· IP {e.ip}</span>}
                </div>
              )}
              {e.payload && Object.keys(e.payload).length > 0 && (
                <details style={S.payload}>
                  <summary style={{ cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Payload</summary>
                  <pre style={S.payloadCode}>{JSON.stringify(e.payload, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  root: { padding: "20px 24px", maxWidth: 880, margin: "0 auto", color: "#fff", fontFamily: "'Inter',sans-serif" },
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 18 },
  backBtn: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  title: { margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.5px", color: "rgba(255,255,255,0.95)" },
  intro: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 18px", fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 16 },
  controls: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  controlLabel: { fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 500 },
  select: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", borderRadius: 10, padding: "7px 12px", fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none", minWidth: 160 },
  refreshBtn: { padding: "7px 14px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "'Inter',sans-serif" },
  empty: { textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40, fontSize: 13 },
  row: {
    background: "linear-gradient(180deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.015) 60%,rgba(255,255,255,0.005) 100%)",
    border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12,
    padding: "12px 16px",
  },
  rowHead: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  action: { fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 600, color: "var(--brand-primary,#FF6B35)", background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 12%, transparent)", padding: "3px 10px", borderRadius: 999 },
  actor: { fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 },
  ts: { fontSize: 11, color: "rgba(255,255,255,0.45)", marginLeft: "auto", fontVariantNumeric: "tabular-nums" },
  rowSub: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6 },
  code: { background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 5, fontFamily: "ui-monospace, monospace", color: "rgba(255,255,255,0.8)" },
  payload: { marginTop: 8 },
  payloadCode: { background: "rgba(0,0,0,0.3)", padding: 10, borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.7)", overflow: "auto", fontFamily: "ui-monospace, monospace", margin: "6px 0 0" },
};
