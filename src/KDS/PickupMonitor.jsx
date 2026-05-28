// karyaOS — Pickup Monitor (Expeditor Screen) — Kitchen OS #9
// Wall-mounted/TV display utk customer pickup area.
// Customer scan order # mereka di layar besar, status realtime: PREPARING / READY.
// Route: /?pickup or /?expeditor
//
// Layout:
//   - Header: brand + clock + live indicator pulse
//   - 2-column split: ⏳ PREPARING (orange) | ✅ READY TO PICKUP (green pulse)
//   - Order # HUGE (clamp 80-160px mono)
//   - Auto-poll /api/kds/tickets every 4s
//   - Chime when ticket transitions to READY
//   - Empty state: "Menunggu pesanan…"
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import API_HOST from "../apiBase.js";

const fmtClock = (d) => d.toLocaleTimeString("id-ID", { hour12: false });

export default function PickupMonitor() {
  const [tickets, setTickets] = useState([]);
  const [now, setNow] = useState(Date.now());
  const audioCtx = useRef(null);
  const prevReadyIdsRef = useRef(new Set());

  // Escape #root width cap — fullscreen wall display
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const pw = root.style.width, pm = root.style.maxWidth, pp = root.style.padding;
    root.style.width = "100%"; root.style.maxWidth = "none"; root.style.padding = "0";
    return () => { root.style.width = pw; root.style.maxWidth = pm; root.style.padding = pp; };
  }, []);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Sound chime — ascending 3-tone "DING-DONG-DING"
  const playChime = useCallback(() => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const tones = [659, 880, 988];  // E5, A5, B5
      tones.forEach((freq, i) => {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = freq;
          osc.type = "sine";
          gain.gain.setValueAtTime(0.18, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.4);
        }, i * 180);
      });
    } catch {}
  }, []);

  // Load tickets
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_HOST}/api/kds/tickets`);
      const data = await r.json();
      const list = Array.isArray(data) ? data : [];
      setTickets(list);
      // Detect transitions to READY → chime
      const currentReadyIds = new Set(list.filter(t => t.status === "ready").map(t => t.id));
      const newlyReady = [...currentReadyIds].filter(id => !prevReadyIdsRef.current.has(id));
      if (prevReadyIdsRef.current.size > 0 && newlyReady.length > 0) {
        playChime();
      }
      prevReadyIdsRef.current = currentReadyIds;
    } catch {}
  }, [playChime]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [load]);

  const { preparing, ready } = useMemo(() => {
    const p = tickets.filter(t => t.status === "queued" || t.status === "preparing");
    const r = tickets.filter(t => t.status === "ready").sort((a, b) => (b.ready_at || 0) - (a.ready_at || 0));
    return { preparing: p, ready: r };
  }, [tickets]);

  return (
    <div style={S.root}>
      <style>{`
        @keyframes pmPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(1.04); } }
        @keyframes pmGlowReady { 0%,100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.45), 0 16px 40px rgba(0,0,0,0.5); } 50% { box-shadow: 0 0 0 14px rgba(74,222,128,0), 0 16px 40px rgba(0,0,0,0.5); } }
        @keyframes pmSlideIn { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes pmDotPulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
        .pm-ready-tile { animation: pmSlideIn 0.5s cubic-bezier(.34,1.56,.64,1), pmGlowReady 2.4s ease infinite; }
        .pm-preparing-tile { animation: pmSlideIn 0.4s cubic-bezier(.2,.8,.2,1); }
        .pm-dot { animation: pmDotPulse 1.4s ease infinite; }
      `}</style>

      {/* HEADER */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span className="pm-dot" style={{
            width: 14, height: 14, borderRadius: "50%", background: "#10b981",
            boxShadow: "0 0 14px #10b981, 0 0 28px rgba(16,185,129,0.5)",
          }} />
          <div>
            <div style={{
              fontSize: 12, color: "#fbbf24", fontFamily: "'Geist Mono',monospace",
              fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4,
            }}>● LIVE · Auto-refresh 4s</div>
            <h1 style={{
              fontSize: 38, fontWeight: 900, color: "#fff", margin: 0, letterSpacing: -1,
              fontFamily: "'Inter',sans-serif",
            }}>
              <img src="/logo.png" alt="" style={{ height: 32, verticalAlign: "middle", marginRight: 10 }} />
              PICKUP STATUS
            </h1>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: 54, fontWeight: 900, color: "#fbbf24", letterSpacing: 1,
            fontFamily: "'Geist Mono',monospace", lineHeight: 1,
          }}>{fmtClock(new Date(now))}</div>
          <div style={{
            fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "'Geist Mono',monospace",
            letterSpacing: 1, marginTop: 6,
          }}>{new Date(now).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}</div>
        </div>
      </header>

      {/* 2-COLUMN SPLIT */}
      <main style={S.main}>
        {/* PREPARING column */}
        <section style={S.column}>
          <div style={{ ...S.columnHeader, color: "#fb923c", borderColor: "rgba(251,146,60,0.3)" }}>
            <span style={{ fontSize: 28 }}>⏳</span>
            <span>SEDANG DISIAPKAN</span>
            <span style={{
              marginLeft: "auto", fontSize: 22, fontFamily: "'Geist Mono',monospace",
              background: "rgba(251,146,60,0.15)", padding: "4px 14px", borderRadius: 8,
              color: "#fb923c", fontWeight: 900, border: "1px solid rgba(251,146,60,0.35)",
            }}>{preparing.length}</span>
          </div>
          <div style={S.tileGrid}>
            {preparing.length === 0 && <Empty>Belum ada antrian</Empty>}
            {preparing.map(t => (
              <div key={t.id} className="pm-preparing-tile" style={{
                background: "linear-gradient(180deg, rgba(251,146,60,0.10), rgba(251,146,60,0.04))",
                border: "2px solid rgba(251,146,60,0.35)",
                borderRadius: 14, padding: "20px 16px",
                textAlign: "center",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}>
                <div style={{
                  fontSize: 11, color: "#fbbf24", fontFamily: "'Geist Mono',monospace",
                  fontWeight: 700, letterSpacing: 1.5, marginBottom: 6, textTransform: "uppercase",
                }}>{t.status === "queued" ? "DALAM ANTRIAN" : "DISIAPKAN"}</div>
                <div style={{
                  fontSize: "clamp(60px, 8vw, 110px)", fontWeight: 900, color: "#fff",
                  fontFamily: "'Geist Mono',monospace", letterSpacing: -3, lineHeight: 1,
                  textShadow: "0 4px 16px rgba(251,146,60,0.4)",
                }}>#{t.doc_no || t.order_ref?.slice(-3) || "—"}</div>
              </div>
            ))}
          </div>
        </section>

        {/* READY column */}
        <section style={S.column}>
          <div style={{ ...S.columnHeader, color: "#4ade80", borderColor: "rgba(74,222,128,0.35)" }}>
            <span style={{ fontSize: 28 }}>✅</span>
            <span>SILAKAN AMBIL</span>
            <span style={{
              marginLeft: "auto", fontSize: 22, fontFamily: "'Geist Mono',monospace",
              background: "rgba(74,222,128,0.15)", padding: "4px 14px", borderRadius: 8,
              color: "#4ade80", fontWeight: 900, border: "1px solid rgba(74,222,128,0.4)",
            }}>{ready.length}</span>
          </div>
          <div style={S.tileGrid}>
            {ready.length === 0 && <Empty>Belum ada yang siap</Empty>}
            {ready.map(t => (
              <div key={t.id} className="pm-ready-tile" style={{
                background: "linear-gradient(180deg, rgba(74,222,128,0.18), rgba(74,222,128,0.06))",
                border: "2.5px solid rgba(74,222,128,0.55)",
                borderRadius: 14, padding: "22px 16px",
                textAlign: "center",
              }}>
                <div style={{
                  fontSize: 11, color: "#4ade80", fontFamily: "'Geist Mono',monospace",
                  fontWeight: 800, letterSpacing: 1.8, marginBottom: 6, textTransform: "uppercase",
                }}>✓ READY</div>
                <div style={{
                  fontSize: "clamp(72px, 10vw, 140px)", fontWeight: 900, color: "#fff",
                  fontFamily: "'Geist Mono',monospace", letterSpacing: -4, lineHeight: 1,
                  textShadow: "0 4px 24px rgba(74,222,128,0.6)",
                }}>#{t.doc_no || t.order_ref?.slice(-3) || "—"}</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer style={S.footer}>
        <div>🔔 Saat nomor Anda muncul di <b style={{ color: "#4ade80" }}>SILAKAN AMBIL</b>, segera ke counter untuk mengambil pesanan</div>
        <div style={{ color: "rgba(255,255,255,0.4)" }}>karyaOS Kitchen OS · v1</div>
      </footer>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{
      gridColumn: "1 / -1", padding: "60px 20px", textAlign: "center",
      color: "rgba(255,255,255,0.35)", fontSize: 16, fontFamily: "'Geist Mono',monospace",
      letterSpacing: 1, fontWeight: 600,
    }}>{children}</div>
  );
}

const S = {
  root: {
    minHeight: "100vh", background: "#06080d", color: "#fff",
    fontFamily: "'Inter','SF Pro Text',system-ui,sans-serif",
    display: "flex", flexDirection: "column", overflow: "hidden",
  },
  header: {
    padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "linear-gradient(180deg, #0b1018, #06080d)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  main: {
    flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, padding: 24,
    overflow: "hidden",
  },
  column: {
    display: "flex", flexDirection: "column", minHeight: 0,
  },
  columnHeader: {
    fontSize: 22, fontWeight: 900, padding: "12px 18px", marginBottom: 14,
    borderBottom: "2px solid", letterSpacing: 1.2,
    display: "flex", alignItems: "center", gap: 12, fontFamily: "'Inter',sans-serif",
    textTransform: "uppercase",
  },
  tileGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 14, padding: "0 4px", flex: 1, overflowY: "auto", alignContent: "start",
  },
  footer: {
    padding: "12px 32px",
    background: "#0b1018",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "'Geist Mono',monospace",
    letterSpacing: 0.5, flexShrink: 0,
  },
};
