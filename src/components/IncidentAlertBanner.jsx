// karyaOS — Global Incident Alert Banner
// Listen WS event 'cinema:incident' → toast notification + persistent badge.
// Owner / HQ admin tau setiap operational issue realtime, gak nunggu refresh manual.
import { useState, useEffect } from "react";
import API_HOST from "../apiBase.js";


const SEVERITY = {
  critical: { color: "#ef4444", label: "CRITICAL", emoji: "🔴" },
  high:     { color: "#f97316", label: "HIGH",     emoji: "🟠" },
  medium:   { color: "#fbbf24", label: "MEDIUM",   emoji: "🟡" },
  low:      { color: "#10b981", label: "LOW",      emoji: "🟢" },
};
const TYPE_EMOJI = {
  emergency_close: "🚨",
  studio_relocate: "🏛️",
  seat_swap: "🔄",
};
const TYPE_LABEL = {
  emergency_close: "Emergency Close",
  studio_relocate: "Studio Relocate",
  seat_swap: "Seat Swap",
};

// Web Audio API beep — no file needed. Anti 404 alert-bell.mp3.
// Generate 2-tone alert (880Hz → 660Hz, 200ms total). Need user gesture first
// untuk AudioContext start; gracefully fail kalau browser block.
function playIncidentBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") ctx.resume();
    const playTone = (freq, startSec, durSec, gain = 0.25) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gainNode.gain.setValueAtTime(0, ctx.currentTime + startSec);
      gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + startSec + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + startSec + durSec);
      osc.connect(gainNode); gainNode.connect(ctx.destination);
      osc.start(ctx.currentTime + startSec);
      osc.stop(ctx.currentTime + startSec + durSec);
    };
    playTone(880, 0, 0.12);    // tinggi
    playTone(660, 0.13, 0.12); // rendah
    setTimeout(() => { try { ctx.close(); } catch {} }, 500);
  } catch {}
}

export default function IncidentAlertBanner({ onOpenPanel }) {
  const [openIncidents, setOpenIncidents] = useState([]);
  const [toastQueue, setToastQueue] = useState([]); // recent toasts (max 3)
  const [expanded, setExpanded] = useState(false);

  // Initial fetch + poll every 30s as safety net
  useEffect(() => {
    const load = () => fetch(`${API_HOST}/api/cinema/incidents?open=1`).then(r => r.json())
      .then(d => setOpenIncidents(d.incidents || []))
      .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  // WS listener — push toast + reload list
  useEffect(() => {
    const wsUrl = window.location.protocol === "https:" ? `wss://${window.location.host}/ws` : `ws://${window.location.hostname}:3011`;
    let ws;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.event === "cinema:incident") {
            const inc = m.data;
            // Push toast
            setToastQueue(q => [...q.slice(-2), { ...inc, _toastId: Date.now() }]);
            // Reload list
            fetch(`${API_HOST}/api/cinema/incidents?open=1`).then(r => r.json()).then(d => setOpenIncidents(d.incidents || []));
            // Play sound — Web Audio API beep, no file required (anti 404)
            try { playIncidentBeep(); } catch {}
            // Browser notification (kalau user grant)
            try {
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(`🚨 ${TYPE_LABEL[inc.type] || inc.type} @ ${inc.outlet || "—"}`, {
                  body: `${SEVERITY[inc.severity]?.label || inc.severity} · ${inc.reason}`,
                  tag: `incident-${inc.id}`,
                });
              } else if ("Notification" in window && Notification.permission !== "denied") {
                Notification.requestPermission();
              }
            } catch {}
          }
        } catch {}
      };
    } catch {}
    return () => { if (ws) ws.close(); };
  }, []);

  // Auto-dismiss toast setelah 12 detik
  useEffect(() => {
    if (toastQueue.length === 0) return;
    const id = setTimeout(() => setToastQueue(q => q.slice(1)), 12000);
    return () => clearTimeout(id);
  }, [toastQueue]);

  const dismissToast = (toastId) => setToastQueue(q => q.filter(t => t._toastId !== toastId));
  const ackIncident = async (id) => {
    await fetch(`${API_HOST}/api/cinema/incidents/${id}/acknowledge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ by: "Owner" }) });
    setOpenIncidents(prev => prev.map(i => i.id === id ? { ...i, acknowledged_at: Math.floor(Date.now()/1000) } : i));
  };

  const criticalCount = openIncidents.filter(i => i.severity === "critical").length;
  const totalCount = openIncidents.length;

  return (
    <>
      {/* Audio cue — Web Audio API generated, no file asset required */}

      {/* Persistent badge — kalau ada open incident */}
      {totalCount > 0 && (
        <button onClick={() => setExpanded(!expanded)} style={{
          position: "fixed", top: 16, right: 16, zIndex: 9998,
          background: criticalCount > 0 ? "linear-gradient(135deg,#ef4444,#dc2626)" : "linear-gradient(135deg,#f97316,#ea580c)",
          border: "none", borderRadius: 999,
          padding: "8px 16px", color: "#fff",
          fontSize: 12, fontWeight: 900, fontFamily: "'Inter',sans-serif",
          cursor: "pointer", letterSpacing: 0.5,
          boxShadow: criticalCount > 0 ? "0 4px 16px rgba(239,68,68,0.5), 0 0 0 4px rgba(239,68,68,0.15)" : "0 4px 16px rgba(249,115,22,0.4)",
          animation: criticalCount > 0 ? "incidentPulse 1.5s ease-in-out infinite" : "none",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          🚨 {totalCount} {totalCount === 1 ? "INCIDENT" : "INCIDENTS"}
          {criticalCount > 0 && <span style={{ background: "rgba(255,255,255,0.25)", padding: "1px 8px", borderRadius: 999, fontSize: 10 }}>{criticalCount} CRITICAL</span>}
        </button>
      )}
      <style>{`@keyframes incidentPulse { 0%,100% { box-shadow: 0 4px 16px rgba(239,68,68,0.5), 0 0 0 4px rgba(239,68,68,0.15) } 50% { box-shadow: 0 4px 24px rgba(239,68,68,0.8), 0 0 0 8px rgba(239,68,68,0.2) } }`}</style>

      {/* Expanded panel — list incidents */}
      {expanded && totalCount > 0 && (
        <div style={{
          position: "fixed", top: 60, right: 16, zIndex: 9997,
          width: 400, maxHeight: "70vh", overflowY: "auto",
          background: "linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)",
          border: "1px solid rgba(239,68,68,0.4)", borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 32px rgba(239,68,68,0.2)",
          color: "#e6edf3", fontFamily: "'Inter',sans-serif",
        }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: "#ef4444", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>🚨 OPEN INCIDENTS</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{totalCount} require attention</div>
            </div>
            <button onClick={() => setExpanded(false)} style={{ background: "transparent", border: "none", color: "#9ca3af", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {openIncidents.map(i => {
              const sev = SEVERITY[i.severity] || SEVERITY.medium;
              return (
                <div key={i.id} style={{ padding: 12, background: "rgba(255,255,255,0.02)", border: `1px solid ${sev.color}55`, borderLeft: `3px solid ${sev.color}`, borderRadius: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: sev.color }}>{sev.emoji} {sev.label}</span>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>· {TYPE_EMOJI[i.type] || ""} {TYPE_LABEL[i.type] || i.type}</span>
                    {i.outlet && <span style={{ fontSize: 10, color: "#c084fc", marginLeft: "auto", fontFamily: "'Geist Mono',monospace" }}>{i.outlet}</span>}
                  </div>
                  {i.film_title && <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 4 }}>🎬 {i.film_title} · {i.studio_name} · {i.start_time}</div>}
                  <div style={{ fontSize: 11.5, color: "#9ca3af", marginBottom: 8, lineHeight: 1.5 }}>"{i.reason}"</div>
                  <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>
                    by {i.reported_by} · {new Date(i.created_at * 1000).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {!i.acknowledged_at && <button onClick={() => ackIncident(i.id)} style={{ background: "#fbbf2422", border: "1px solid #fbbf24", color: "#fbbf24", borderRadius: 6, padding: "4px 10px", fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>👁 Ack</button>}
                    <button onClick={() => { onOpenPanel?.("cinema_emergency"); setExpanded(false); }} style={{ background: "#a855f722", border: "1px solid #a855f7", color: "#c084fc", borderRadius: 6, padding: "4px 10px", fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🚨 Open Panel</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toast queue — slide-in dari kanan */}
      <div style={{ position: "fixed", top: criticalCount > 0 || totalCount > 0 ? 60 : 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none" }}>
        {toastQueue.map((t, i) => {
          const sev = SEVERITY[t.severity] || SEVERITY.medium;
          return (
            <div key={t._toastId} style={{
              background: "linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)",
              border: `1px solid ${sev.color}`, borderLeft: `4px solid ${sev.color}`,
              borderRadius: 12, padding: "14px 18px",
              minWidth: 320, maxWidth: 380,
              boxShadow: `0 12px 32px rgba(0,0,0,0.6), 0 0 24px ${sev.color}33`,
              color: "#e6edf3", fontFamily: "'Inter',sans-serif",
              animation: "toastSlide 0.3s ease-out",
              pointerEvents: "auto", cursor: "pointer",
            }} onClick={() => dismissToast(t._toastId)}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ fontSize: 24 }}>{TYPE_EMOJI[t.type] || sev.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: sev.color, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace" }}>{sev.label}</span>
                    <span style={{ fontSize: 10, color: "#9ca3af" }}>NEW</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{TYPE_LABEL[t.type] || t.type}</div>
                  {t.outlet && <div style={{ fontSize: 11, color: "#c084fc", marginTop: 2 }}>📍 {t.outlet}</div>}
                  <div style={{ fontSize: 11.5, color: "#cbd5e1", marginTop: 4, lineHeight: 1.5 }}>{t.reason}</div>
                  <div style={{ fontSize: 10, color: "#5b6470", marginTop: 4, fontFamily: "'Geist Mono',monospace" }}>{t.tickets_affected} tiket · by {t.reported_by}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes toastSlide { from { transform: translateX(110%); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
    </>
  );
}
