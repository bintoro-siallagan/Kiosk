import { useState, useEffect } from "react";

// FlowOS Stage 4 (Escalation) — SLA-based escalation matrix.
// Maps incident severity → SLA tier → target response time → on-track/breached.
const TIERS = [
  { id: "critical", label: "Critical", target: 5 * 60,    channel: "WhatsApp + Telepon", color: "#ef4444", note: "Respons segera" },
  { id: "high",     label: "High",     target: 30 * 60,   channel: "WhatsApp",           color: "#f97316", note: "Respons < 30 menit" },
  { id: "medium",   label: "Medium",   target: 4 * 3600,  channel: "Email",              color: "#eab308", note: "Respons < 4 jam" },
  { id: "low",      label: "Low",      target: 24 * 3600, channel: "Email / Dashboard",  color: "#3b82f6", note: "Hari kerja berikutnya" },
];
const tierOf = (sev) => TIERS.find(t => t.id === sev) || TIERS[2];

function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} dtk`;
  if (sec < 3600) return `${Math.floor(sec / 60)} mnt`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} jam ${Math.floor((sec % 3600) / 60)} mnt`;
  return `${Math.floor(sec / 86400)} hari ${Math.floor((sec % 86400) / 3600)} jam`;
}

export default function EscalationMatrix({ apiBase }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const load = () => fetch(`${apiBase}/api/incidents`).then(r => r.json())
      .then(d => { setIncidents(Array.isArray(d.incidents) ? d.incidents : []); setLoading(false); })
      .catch(() => setLoading(false));
    load();
    const iv = setInterval(load, 30000);
    const tk = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(iv); clearInterval(tk); };
  }, [apiBase]);

  const isClosed = (i) => i.resolved_at || i.status === "resolved" || i.status === "closed";

  const active = incidents.filter(i => !isClosed(i)).map(i => {
    const tier = tierOf(i.severity);
    const elapsed = now / 1000 - i.created_at;
    return { ...i, tier, elapsed, breached: elapsed > tier.target };
  }).sort((a, b) => {
    const ti = TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier);
    return ti !== 0 ? ti : b.elapsed - a.elapsed;
  });

  const breached = active.filter(a => a.breached).length;
  // SLA compliance — resolved incidents closed within their tier target.
  const resolved = incidents.filter(i => i.resolved_at && i.created_at);
  const onTimeResolved = resolved.filter(i => (i.resolved_at - i.created_at) <= tierOf(i.severity).target).length;
  const compliance = resolved.length ? Math.round((onTimeResolved / resolved.length) * 100) : null;

  const C = { card: "#0d1117", border: "#1b212c", sub: "#7d8590", dim: "#5b6470" };

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", color: "#e6edf3" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🚨 Escalation Matrix</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>FlowOS Tahap 4 — Escalation · respons berbasis SLA</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Stat label="Eskalasi aktif" value={active.length} color="#22d3ee" />
          <Stat label="Lewat SLA" value={breached} color={breached ? "#ef4444" : "#10b981"} />
          <Stat label="SLA compliance" value={compliance == null ? "—" : compliance + "%"}
            color={compliance == null ? C.dim : compliance >= 95 ? "#10b981" : compliance >= 80 ? "#eab308" : "#ef4444"} />
        </div>
      </div>

      {/* SLA tier matrix */}
      <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Space Mono',monospace", marginBottom: 8 }}>MATRIKS SLA</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 22 }}>
        {TIERS.map(t => {
          const count = active.filter(a => a.tier.id === t.id).length;
          return (
            <div key={t.id} style={{ background: C.card, border: `1px solid ${t.color}44`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.color }}>{t.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: count ? "#fff" : C.dim, background: count ? t.color + "33" : "transparent", borderRadius: 6, padding: "2px 8px" }}>{count} aktif</span>
              </div>
              <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 20, fontWeight: 700, margin: "8px 0 2px" }}>≤ {fmtDur(t.target)}</div>
              <div style={{ fontSize: 11.5, color: C.sub }}>{t.note}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>📨 {t.channel}</div>
            </div>
          );
        })}
      </div>

      {/* Active escalations */}
      <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Space Mono',monospace", marginBottom: 8 }}>ESKALASI AKTIF ({active.length})</div>
      {loading ? (
        <div style={{ color: C.dim, fontSize: 13, padding: "24px 0" }}>Memuat…</div>
      ) : active.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "26px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>
          ✅ Tidak ada eskalasi aktif — semua insiden tertangani.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {active.map(a => (
            <div key={a.id} style={{ background: C.card, border: `1px solid ${a.breached ? "#ef444455" : C.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ width: 84, flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: a.tier.color, background: a.tier.color + "22", borderRadius: 6, padding: "3px 8px", textAlign: "center" }}>{a.tier.label}</div>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{a.title}</div>
                <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>
                  <span style={{ fontFamily: "'Space Mono',monospace" }}>{a.incident_no}</span> · 🏪 {a.outlet || "—"} · 👤 {a.reported_by || "—"}
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 130 }}>
                <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700 }}>{fmtDur(a.elapsed)}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: a.breached ? "#ef4444" : "#10b981", marginTop: 2 }}>
                  {a.breached ? `⚠ LEWAT SLA (≤ ${fmtDur(a.tier.target)})` : `✓ Dalam SLA (≤ ${fmtDur(a.tier.target)})`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 92 }}>
      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 19, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5, marginTop: 1 }}>{label}</div>
    </div>
  );
}
