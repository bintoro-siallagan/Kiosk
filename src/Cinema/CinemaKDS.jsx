// karyaOS — Kitchen Display untuk Cinema (Concession Counter + In-Studio QR Order)
// Route: /?cinema-kds[&studio_id=X]
// Staff dapur/F&B liat antrian dari 2 sumber:
//   1. Concession (kiri): bundle yang dibeli sama tiket — diambil di counter
//   2. In-Studio (kanan): order via QR di kursi — diantar oleh runner ke seat
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { HelpButton } from "../components/HelpModal.jsx";
import API_HOST from "../apiBase.js";


import { fmtMoney as rp } from "../lib/currency.js";
const fmtTime = (sec) => sec ? new Date(sec * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "-";
const minsAgo = (sec) => {
  if (!sec) return 0;
  return Math.floor((Date.now() / 1000 - sec) / 60);
};

// 4-tier escalation — fresh / warming / urgent / critical (pulse alarm)
const ageColor = (mins) => {
  if (mins < 3) return "#10b981";
  if (mins < 8) return "#fbbf24";
  if (mins < 15) return "#f97316";
  return "#ef4444";
};
const ageTier = (mins) => mins < 3 ? "fresh" : mins < 8 ? "warming" : mins < 15 ? "urgent" : "critical";

// Web Audio cues — KDS sound alerts (no asset files needed)
let _audioCtx = null;
const getCtx = () => {
  if (typeof window === "undefined") return null;
  if (!_audioCtx) { try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  return _audioCtx;
};
const playTone = (freq = 880, dur = 0.18, type = "sine", vol = 0.18) => {
  const ctx = getCtx(); if (!ctx) return;
  try {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch {}
};
const playNewOrder = () => { playTone(880, 0.12, "sine"); setTimeout(() => playTone(1320, 0.18, "sine"), 130); };
const playUrgent   = () => { playTone(440, 0.08, "square", 0.12); setTimeout(() => playTone(440, 0.08, "square", 0.12), 120); setTimeout(() => playTone(440, 0.08, "square", 0.12), 240); };

export default function CinemaKDS() {
  const [data, setData] = useState({ concession: [], in_studio: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [studioFilter, setStudioFilter] = useState(() => {
    const s = new URLSearchParams(window.location.search).get("studio_id");
    return s ? parseInt(s, 10) : null;
  });
  const [studios, setStudios] = useState([]);
  const [tick, setTick] = useState(0); // force re-render tiap detik untuk age count
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("cinemaKdsSoundOn") !== "0");
  const seenIdsRef = useRef(new Set());
  const lastUrgentRef = useRef(0);
  const [needFullscreen, setNeedFullscreen] = useState(() => {
    if (typeof document === "undefined") return false;
    return !document.fullscreenElement && !window.matchMedia?.("(display-mode: standalone)").matches;
  });

  const goFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      setNeedFullscreen(false);
    } catch (e) { console.warn("[CinemaKDS] fullscreen denied:", e?.message); setNeedFullscreen(false); }
  }, []);

  useEffect(() => {
    const onFs = () => { if (document.fullscreenElement) setNeedFullscreen(false); };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const url = studioFilter
        ? `${API_HOST}/api/cinema/kds/queue?studio_id=${studioFilter}`
        : `${API_HOST}/api/cinema/kds/queue`;
      const r = await fetch(url);
      const d = await r.json();
      // Sound: new order detection (concession + in-studio)
      if (soundOn && !loading) {
        const currentIds = new Set();
        let foundNew = false;
        for (const c of (d.concession || [])) { currentIds.add(`c-${c.id}`); if (!seenIdsRef.current.has(`c-${c.id}`) && seenIdsRef.current.size > 0) foundNew = true; }
        for (const o of (d.in_studio || [])) { currentIds.add(`i-${o.id}`); if (!seenIdsRef.current.has(`i-${o.id}`) && seenIdsRef.current.size > 0) foundNew = true; }
        if (foundNew) playNewOrder();
        seenIdsRef.current = currentIds;
      } else {
        // Seed seen set di first load tanpa bunyi
        const initial = new Set();
        for (const c of (d.concession || [])) initial.add(`c-${c.id}`);
        for (const o of (d.in_studio || [])) initial.add(`i-${o.id}`);
        seenIdsRef.current = initial;
      }
      setData(d);
    } catch {}
    setLoading(false);
  }, [studioFilter, soundOn, loading]);

  useEffect(() => {
    loadQueue();
    const id = setInterval(loadQueue, 5000); // poll 5s
    return () => clearInterval(id);
  }, [loadQueue]);

  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/studios`).then(r => r.json()).then(d => setStudios(d.studios || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30 * 1000); // age tick 30s
    return () => clearInterval(id);
  }, []);

  // Full-screen layout — escape root cap
  useEffect(() => {
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.width = "100%"; root.style.padding = "0"; }
    document.documentElement.style.zoom = "1";
    return () => { if (root) { root.style.maxWidth = ""; root.style.width = ""; root.style.padding = ""; } };
  }, []);

  // Actions
  async function redeemConcession(id) {
    try {
      await fetch(`${API_HOST}/api/cinema/purchase-bundles/${id}/redeem`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redeemed_by: "Counter staff" }),
      });
      loadQueue();
    } catch {}
  }
  async function updateInStudio(id, status) {
    try {
      await fetch(`${API_HOST}/api/cinema/in-studio/orders/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, delivered_by: status === "delivered" ? "Runner" : undefined }),
      });
      loadQueue();
    } catch {}
  }

  // Analytics — avg age + critical count untuk topbar strip
  const analytics = useMemo(() => {
    const all = [...(data.concession || []), ...(data.in_studio || [])];
    if (all.length === 0) return { avgMins: 0, criticalCount: 0, total: 0 };
    let sum = 0, crit = 0;
    for (const x of all) {
      const m = minsAgo(x.created_at);
      sum += m;
      if (m >= 15) crit++;
    }
    return { avgMins: Math.round(sum / all.length), criticalCount: crit, total: all.length };
    // tick dep ensures re-compute every 30s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.concession, data.in_studio, tick]);

  // Sound alarm — fire urgent ping ketika ada item baru masuk critical tier (max 1× per minute)
  useEffect(() => {
    if (!soundOn) return;
    if (analytics.criticalCount > 0 && Date.now() - lastUrgentRef.current > 60_000) {
      playUrgent();
      lastUrgentRef.current = Date.now();
    }
  }, [analytics.criticalCount, soundOn]);

  // Group concession by purchase_id (one purchase can have multiple bundles)
  const concessionGrouped = useMemo(() => {
    const groups = {};
    for (const c of data.concession || []) {
      const k = c.purchase_id || `id-${c.id}`;
      if (!groups[k]) groups[k] = { purchase_id: c.purchase_id, items: [], film_title: c.film_title, studio_name: c.studio_name, seat: c.seat, show_date: c.show_date, start_time: c.start_time, buyer: c.buyer, created_at: c.created_at };
      groups[k].items.push(c);
      // earliest created_at wins for age tracking
      if (c.created_at < groups[k].created_at) groups[k].created_at = c.created_at;
    }
    return Object.values(groups).sort((a, b) => a.created_at - b.created_at);
  }, [data.concession, tick]);

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Fullscreen prompt overlay — TV/second-screen friendly */}
      {needFullscreen && (
        <div onClick={goFullscreen} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.94)", zIndex: 99999,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          color: "#fff", cursor: "pointer", padding: 20, backdropFilter: "blur(20px)",
        }}>
          <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 22 }}>🎬</div>
          <div style={{ fontSize: 11, color: "#fbbf24", letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800, textTransform: "uppercase", marginBottom: 12 }}>● CINEMA KITCHEN DISPLAY</div>
          <div style={{ fontSize: "clamp(28px,4vw,42px)", fontWeight: 900, letterSpacing: -0.8, marginBottom: 14, textAlign: "center", textShadow: "0 0 24px rgba(251,191,36,0.4)" }}>Tap to Enter Fullscreen</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 28, textAlign: "center", maxWidth: 480, lineHeight: 1.55 }}>
            Concession + In-Studio queue. Header browser akan hidden.<br />
            Tekan <kbd style={{ padding: "2px 8px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, fontFamily: "monospace", fontSize: 13 }}>ESC</kbd> untuk exit.
          </div>
          <button onClick={(e) => { e.stopPropagation(); goFullscreen(); }} style={{ padding: "16px 36px", background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#1a1205", border: "none", borderRadius: 14, fontSize: 16, fontWeight: 900, cursor: "pointer", letterSpacing: 0.4, boxShadow: "0 10px 30px rgba(251,191,36,0.45)" }}>🎬 Aktifkan Fullscreen →</button>
          <button onClick={(e) => { e.stopPropagation(); setNeedFullscreen(false); }} style={{ marginTop: 16, padding: "8px 16px", background: "transparent", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Skip</button>
        </div>
      )}

      {/* Topbar — cinema gold palette */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 26px", borderBottom: "1px solid rgba(251,191,36,0.18)", background: "linear-gradient(180deg, rgba(15,8,2,0.95), rgba(8,9,15,0.85))", backdropFilter: "blur(12px)", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: "linear-gradient(135deg,#fbbf24,#dc2626)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, filter: "drop-shadow(0 0 16px rgba(251,191,36,0.5))" }}>🎬</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.3, color: "#fff" }}>Cinema Kitchen Display</div>
            <div style={{ fontSize: 10, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>karyaOS · CONCESSION + IN-STUDIO</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <select value={studioFilter || ""} onChange={(e) => setStudioFilter(e.target.value ? parseInt(e.target.value, 10) : null)}
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(251,191,36,0.2)", color: "#e6edf3", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }}>
            <option value="">All Studios</option>
            {studios.map(s => <option key={s.id} value={s.id} style={{ background: "#0d1117" }}>{s.name}</option>)}
          </select>
          <button onClick={() => { const next = !soundOn; setSoundOn(next); localStorage.setItem("cinemaKdsSoundOn", next ? "1" : "0"); if (next) playNewOrder(); }}
            title={soundOn ? "Mute sound alerts" : "Enable sound alerts"}
            style={{ background: soundOn ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.08)", border: `1px solid ${soundOn ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.3)"}`, color: soundOn ? "#34d399" : "#fca5a5", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", cursor: "pointer", fontWeight: 700 }}>
            {soundOn ? "🔔 SOUND ON" : "🔕 MUTED"}
          </button>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "#10b981", fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "#10b981", animation: "kdsPulse 1.4s ease-in-out infinite" }} />
            LIVE · 5s
          </div>
          <button onClick={loadQueue} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e6edf3", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", fontWeight: 700 }}>↻ Refresh</button>
        </div>
      </div>
      <style>{`
        @keyframes kdsPulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
        @keyframes kdsAlarm { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5), 0 2px 8px rgba(0,0,0,0.3) } 50% { box-shadow: 0 0 0 6px rgba(239,68,68,0), 0 2px 12px rgba(239,68,68,0.4) } }
        @keyframes kdsBlinkBorder { 0%,100% { border-color: rgba(239,68,68,0.5) } 50% { border-color: rgba(239,68,68,1) } }
      `}</style>

      {/* Stat strip — analytics + counts */}
      <div style={{ display: "flex", gap: 8, padding: "10px 26px", background: "rgba(255,255,255,0.015)", borderBottom: "1px solid rgba(255,255,255,0.04)", overflowX: "auto" }}>
        <Stat label="CONCESSION QUEUE" value={data.counts?.concession_pending || 0} color="#fbbf24" />
        <Stat label="IN-STUDIO PENDING" value={data.counts?.in_studio_pending || 0} color="#c084fc" />
        <Stat label="DISIAPKAN" value={data.counts?.in_studio_preparing || 0} color="#22d3ee" />
        <Stat label="AVG AGE" value={`${analytics.avgMins}m`} color={analytics.avgMins >= 15 ? "#ef4444" : analytics.avgMins >= 8 ? "#f97316" : "#10b981"} />
        <Stat label="CRITICAL (>15m)" value={analytics.criticalCount} color={analytics.criticalCount > 0 ? "#ef4444" : "#5b6470"} alarm={analytics.criticalCount > 0} />
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, flex: 1, minHeight: 0 }}>
        {/* LEFT: Concession Counter (F&B pickup) */}
        <div style={{ borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(245,158,11,0.08), transparent)" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24", letterSpacing: -0.2 }}>🍿 Concession Counter</div>
            <div style={{ fontSize: 11, color: "#7d8590", marginTop: 2 }}>Bundle dari tiket — customer ambil di counter sebelum film</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {loading ? <Empty msg="⏳ Memuat..." /> :
             concessionGrouped.length === 0 ? <Empty msg="✓ Counter clear" /> :
             concessionGrouped.map((g, i) => <ConcessionCard key={g.purchase_id || i} group={g} onRedeem={redeemConcession} />)
            }
          </div>
        </div>

        {/* RIGHT: In-Studio QR Order (Runner delivery) */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(168,85,247,0.08), transparent)" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#c084fc", letterSpacing: -0.2 }}>🎬 In-Studio QR Order</div>
            <div style={{ fontSize: 11, color: "#7d8590", marginTop: 2 }}>Customer scan QR di kursi — runner antar ke seat</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {loading ? <Empty msg="⏳ Memuat..." /> :
             (data.in_studio || []).length === 0 ? <Empty msg="✓ Tidak ada order" /> :
             (data.in_studio || []).map(o => <InStudioCard key={o.id} order={o} onUpdate={updateInStudio} />)
            }
          </div>
        </div>
      </div>
      <HelpButton helpKey="cinema-kds" position="bottom-right" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function Stat({ label, value, color, alarm }) {
  return (
    <div style={{
      flex: 1, minWidth: 140, padding: "10px 14px",
      background: alarm ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${alarm ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.06)"}`,
      borderRadius: 10,
      animation: alarm ? "kdsAlarm 1.6s ease-in-out infinite" : "none",
    }}>
      <div style={{ fontSize: 10, color: alarm ? "#fca5a5" : "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{ padding: 40, textAlign: "center", color: "#5b6470", fontSize: 13 }}>{msg}</div>;
}

function ConcessionCard({ group, onRedeem }) {
  const mins = minsAgo(group.created_at);
  const tier = ageTier(mins);
  const c = ageColor(mins);
  const isCritical = tier === "critical";
  return (
    <div style={{
      background: isCritical ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.025)",
      border: `1px solid ${c}55`, borderLeft: `4px solid ${c}`, borderRadius: 10,
      padding: 14, marginBottom: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      animation: isCritical ? "kdsBlinkBorder 1.2s ease-in-out infinite" : "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: -0.2 }}>{group.film_title || "—"}</div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, fontFamily: "'Geist Mono',monospace" }}>
            {group.studio_name || "—"} · {group.show_date} {group.start_time}
          </div>
          {group.seat && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>SEAT</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5, lineHeight: 1 }}>{group.seat}</span>
          </div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{fmtTime(group.created_at)}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 1, letterSpacing: -0.8, lineHeight: 1 }}>{mins}m</div>
          {isCritical && <div style={{ fontSize: 9, color: "#fca5a5", fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 800, marginTop: 2 }}>⚠ LATE</div>}
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
        {group.items.map(it => (
          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 13, gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: "#fbbf24", fontWeight: 800, fontFamily: "'Geist Mono',monospace", marginRight: 8 }}>{it.qty}×</span>
              <span style={{ color: "#fff" }}>{it.bundle_name}</span>
            </div>
            <button onClick={() => onRedeem(it.id)} style={btnRedeem}>✓ AMBIL</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InStudioCard({ order, onUpdate }) {
  const mins = minsAgo(order.created_at);
  const tier = ageTier(mins);
  const c = order.status === "preparing" ? "#22d3ee" : ageColor(mins);
  const isCritical = tier === "critical" && order.status !== "preparing";
  return (
    <div style={{
      background: isCritical ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.025)",
      border: `1px solid ${c}55`, borderLeft: `4px solid ${c}`, borderRadius: 10,
      padding: 14, marginBottom: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      animation: isCritical ? "kdsBlinkBorder 1.2s ease-in-out infinite" : "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 4, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, background: c + "22", color: c, border: `1px solid ${c}55` }}>{(order.status || "pending").toUpperCase()}</span>
            <span style={{ fontSize: 11, color: "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{order.order_code}</span>
          </div>
          {/* SEAT — HUGE so runner can spot at a glance */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, fontWeight: 700 }}>SEAT</span>
            <span style={{ fontSize: 38, fontWeight: 900, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", letterSpacing: -1.5, lineHeight: 1, textShadow: "0 0 16px rgba(251,191,36,0.35)" }}>{order.seat}</span>
            {order.studio_name && <span style={{ color: "#c084fc", fontSize: 12, fontFamily: "'Geist Mono',monospace", fontWeight: 700, letterSpacing: 0.5 }}>· {order.studio_name}</span>}
          </div>
          {order.buyer_name && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>👤 {order.buyer_name}{order.buyer_phone ? ` · ${order.buyer_phone}` : ""}</div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "#7d8590", fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{fmtTime(order.created_at)}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 2, letterSpacing: -1, lineHeight: 1 }}>{mins}m</div>
          {isCritical && <div style={{ fontSize: 9, color: "#fca5a5", fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 800, marginTop: 2 }}>⚠ LATE</div>}
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
        {(order.items || []).map(it => (
          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
            <span><span style={{ color: "#fbbf24", fontWeight: 800, fontFamily: "'Geist Mono',monospace", marginRight: 8 }}>{it.qty}×</span><span style={{ color: "#fff" }}>{it.bundle_name}</span></span>
          </div>
        ))}
      </div>
      {order.notes && <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, fontSize: 11.5, color: "#fbbf24" }}>📝 {order.notes}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {order.status === "pending" && (
          <button onClick={() => onUpdate(order.id, "preparing")} style={btnPrep}>🍳 Mulai Siapkan</button>
        )}
        {order.status === "preparing" && (
          <button onClick={() => onUpdate(order.id, "delivered")} style={btnDelivered}>🚶 Sudah Delivered</button>
        )}
        <button onClick={() => onUpdate(order.id, "cancelled")} style={btnCancel}>✕</button>
      </div>
    </div>
  );
}

const BG = "linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)";
const btnRedeem = {
  padding: "6px 14px", background: "linear-gradient(135deg,#10b981,#34d399)", border: "none", borderRadius: 7,
  color: "#062418", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5,
  boxShadow: "0 2px 6px rgba(16,185,129,0.3)",
};
const btnPrep = {
  flex: 1, padding: "9px 12px", background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.4)", borderRadius: 8,
  color: "#22d3ee", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};
const btnDelivered = {
  flex: 1, padding: "9px 12px", background: "linear-gradient(135deg,#10b981,#34d399)", border: "none", borderRadius: 8,
  color: "#062418", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
  boxShadow: "0 2px 6px rgba(16,185,129,0.3)",
};
const btnCancel = {
  padding: "9px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8,
  color: "#fca5a5", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
