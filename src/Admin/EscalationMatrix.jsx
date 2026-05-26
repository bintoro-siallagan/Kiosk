import { useState, useEffect } from "react";

// KaryaOS Stage 4 (Escalation) — SLA-based escalation matrix with response chains.
// Each tier: target response time, delivery channel, and an escalation chain
// (responder advances as the incident ages past each step's threshold).
const TIERS = [
  { id: "critical", label: "Critical", target: 5 * 60, color: "#ef4444", note: "Respons segera",
    channel: "WhatsApp + Telepon",
    chain: [{ role: "Outlet Manager", at: 0 }, { role: "Area Manager", at: 5 * 60 }, { role: "GM / Director", at: 15 * 60 }] },
  { id: "high", label: "High", target: 30 * 60, color: "#f97316", note: "Respons < 30 min",
    channel: "WhatsApp",
    chain: [{ role: "Outlet Manager", at: 0 }, { role: "Area Manager", at: 30 * 60 }, { role: "GM / Director", at: 2 * 3600 }] },
  { id: "medium", label: "Medium", target: 4 * 3600, color: "#eab308", note: "Respons < 4 hr",
    channel: "Email",
    chain: [{ role: "Shift Lead", at: 0 }, { role: "Outlet Manager", at: 4 * 3600 }, { role: "Area Manager", at: 24 * 3600 }] },
  { id: "low", label: "Low", target: 24 * 3600, color: "#3b82f6", note: "Hari kerja berikutnya",
    channel: "Email / Dashboard",
    chain: [{ role: "Shift Lead", at: 0 }, { role: "Outlet Manager", at: 24 * 3600 }] },
];
const tierOf = (sev) => TIERS.find(t => t.id === sev) || TIERS[2];
const C = { card: "#0d1117", border: "#1b212c", sub: "#7d8590", dim: "#5b6470" };

function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} dtk`;
  if (sec < 3600) return `${Math.floor(sec / 60)} mnt`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ${Math.floor((sec % 3600) / 60)} mnt`;
  return `${Math.floor(sec / 86400)} day ${Math.floor((sec % 86400) / 3600)} hr`;
}
// current responder = last chain step whose threshold the elapsed time has passed
const levelOf = (chain, elapsed) => {
  let lv = 0;
  for (let i = 0; i < chain.length; i++) if (elapsed >= chain[i].at) lv = i;
  return lv;
};

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
    const level = levelOf(tier.chain, elapsed);
    return { ...i, tier, elapsed, level, breached: elapsed > tier.target };
  }).sort((a, b) => {
    const ti = TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier);
    return ti !== 0 ? ti : b.elapsed - a.elapsed;
  });

  const breached = active.filter(a => a.breached).length;
  const escalated = active.filter(a => a.level >= 1).length;
  const resolved = incidents.filter(i => i.resolved_at && i.created_at);
  const onTimeResolved = resolved.filter(i => (i.resolved_at - i.created_at) <= tierOf(i.severity).target).length;
  const compliance = resolved.length ? Math.round((onTimeResolved / resolved.length) * 100) : null;

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🚨 Escalation Matrix</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>KaryaOS Tahap 4 — Escalation · SLA, rantai eskalasi &amp; routing channel</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Stat label="Eskalasi aktif" value={active.length} color="#22d3ee" />
          <Stat label="Lewat SLA" value={breached} color={breached ? "#ef4444" : "#10b981"} />
          <Stat label="Naik level" value={escalated} color={escalated ? "#f97316" : "#10b981"} />
          <Stat label="SLA compliance" value={compliance == null ? "—" : compliance + "%"}
            color={compliance == null ? C.dim : compliance >= 95 ? "#10b981" : compliance >= 80 ? "#eab308" : "#ef4444"} />
        </div>
      </div>

      {/* SLA tier matrix */}
      <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>MATRIKS SLA &amp; RANTAI ESKALASI</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 22 }}>
        {TIERS.map(t => {
          const count = active.filter(a => a.tier.id === t.id).length;
          return (
            <div key={t.id} style={{ background: C.card, border: `1px solid ${t.color}44`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.color }}>{t.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: count ? "#fff" : C.dim, background: count ? t.color + "33" : "transparent", borderRadius: 6, padding: "2px 8px" }}>{count} aktif</span>
              </div>
              <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 20, fontWeight: 700, margin: "8px 0 2px" }}>≤ {fmtDur(t.target)}</div>
              <div style={{ fontSize: 11.5, color: C.sub }}>{t.note}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>📨 {t.channel}</div>
              <div style={{ fontSize: 10.5, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>
                🔼 {t.chain.map(s => s.role).join(" › ")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active escalations */}
      <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>ESKALASI AKTIF ({active.length})</div>
      {loading ? (
        <div style={{ color: C.dim, fontSize: 13, padding: "24px 0" }}>Memuat…</div>
      ) : active.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "26px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>
          ✅ None eskalasi aktif — semua insiden tertangani.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {active.map(a => (
            <div key={a.id} style={{ background: C.card, border: `1px solid ${a.breached ? "#ef444455" : C.border}`, borderRadius: 12, padding: "12px 14px" }}>
              {/* line 1 — incident */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: a.tier.color, background: a.tier.color + "22", borderRadius: 6, padding: "3px 8px", width: 64, textAlign: "center", flexShrink: 0 }}>{a.tier.label}</div>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{a.title}</div>
                  <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>
                    <span style={{ fontFamily: "'Geist Mono',monospace" }}>{a.incident_no}</span> · 🏪 {a.outlet || "—"} · 👤 {a.reported_by || "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 124 }}>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 700 }}>{fmtDur(a.elapsed)}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: a.breached ? "#ef4444" : "#10b981", marginTop: 2 }}>
                    {a.breached ? `⚠ LEWAT SLA (≤ ${fmtDur(a.tier.target)})` : `✓ Dalam SLA (≤ ${fmtDur(a.tier.target)})`}
                  </div>
                </div>
              </div>
              {/* line 2 — escalation chain + channel routing */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 9, paddingTop: 9, borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 10.5, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>RANTAI</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", flex: 1 }}>
                  {a.tier.chain.map((s, i) => (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {i > 0 && <span style={{ color: C.dim, fontSize: 11 }}>›</span>}
                      <span style={{
                        fontSize: 11, fontWeight: i === a.level ? 700 : 500,
                        color: i === a.level ? "#fff" : i < a.level ? C.dim : C.sub,
                        background: i === a.level ? a.tier.color + "33" : "transparent",
                        borderRadius: 6, padding: i === a.level ? "2px 8px" : "2px 0",
                        textDecoration: i < a.level ? "line-through" : "none",
                      }}>{i === a.level ? "▶ " : ""}{s.role}</span>
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 11, color: "#67e8f9", background: "#22d3ee18", border: "1px solid #22d3ee33", borderRadius: 6, padding: "2px 9px", whiteSpace: "nowrap" }}>
                  📨 {a.tier.channel}
                </span>
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
    <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 88 }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5, marginTop: 1 }}>{label}</div>
    </div>
  );
}
