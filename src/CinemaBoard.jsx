// karyaOS — Cinema Lobby TV Signage Board
// Full-screen rotating display for lobby televisions.
// Routes: ?cinema-board (full screen, auto-rotate 15s between panels)
// Panels: Now Showing · Today's Schedule · Coming Soon · Active Campaigns
import { useState, useEffect, useCallback } from "react";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const BG = "#040611";
const BG_GRADIENT = "linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)";
const BG_MESH = "radial-gradient(1200px 800px at 20% 10%, rgba(168,85,247,0.07), transparent 70%), radial-gradient(900px 600px at 80% 90%, rgba(245,158,11,0.05), transparent 70%), radial-gradient(700px 500px at 50% 50%, rgba(34,211,238,0.025), transparent 70%)";
const RATING_COLOR = { "SU": "#10b981", "13+": "#22d3ee", "17+": "#f59e0b", "D21": "#ef4444" };

export default function CinemaBoard({ apiBase }) {
  const base = `${apiBase || ""}/api/cinema`;
  const [data, setData] = useState(null);
  const [panelIdx, setPanelIdx] = useState(0);

  const load = useCallback(() => {
    fetch(`${base}/signage/board`).then(r => r.json()).then(setData).catch(() => {});
  }, [base]);
  useEffect(() => {
    load();
    const iv = setInterval(load, 30000); // refresh data 30s
    return () => clearInterval(iv);
  }, [load]);

  // Rotate panels every 15s
  useEffect(() => {
    const iv = setInterval(() => setPanelIdx(i => (i + 1) % 4), 15000);
    return () => clearInterval(iv);
  }, []);

  if (!data) return <div style={{ position: "fixed", inset: 0, background: BG_GRADIENT, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif" }}>Memuat…</div>;

  const panels = [
    { id: "now",      label: "🎬 NOW SHOWING",    render: () => <NowShowing data={data} /> },
    { id: "today",    label: "🗓️ JADWAL HARI INI", render: () => <TodaySchedule data={data} /> },
    { id: "soon",     label: "📅 COMING SOON",    render: () => <ComingSoon data={data} /> },
    { id: "campaign", label: "🎉 SPECIAL OFFERS", render: () => <Campaigns data={data} /> },
  ];
  const cur = panels[panelIdx];

  return (
    <div style={{ position: "fixed", inset: 0, background: BG_GRADIENT, color: "#fff", fontFamily: "'Inter',sans-serif", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Radial mesh overlay — cinematic depth */}
      <div aria-hidden style={{ position: "fixed", inset: 0, background: BG_MESH, pointerEvents: "none", zIndex: 0 }} />
      {/* Header — glass top bar */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "26px 42px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,9,15,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 34, fontWeight: 900, letterSpacing: -0.8 }}>🎬 karya<span style={{ color: "#a855f7", textShadow: "0 0 28px rgba(168,85,247,0.45)" }}>OS</span> Cinema</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginTop: 4, fontFamily: "'Geist Mono',monospace" }}>{data.today} · {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {panels.map((p, i) => (
            <div key={p.id} style={{
              width: i === panelIdx ? 42 : 10, height: 6,
              background: i === panelIdx ? "linear-gradient(90deg,#a855f7,#c084fc)" : "rgba(255,255,255,0.12)",
              borderRadius: 3, transition: "width 0.4s cubic-bezier(.2,.7,.3,1), background 0.3s ease",
              boxShadow: i === panelIdx ? "0 0 16px rgba(168,85,247,0.6)" : "none",
            }} />
          ))}
        </div>
      </div>

      {/* Panel label */}
      <div style={{ position: "relative", zIndex: 1, padding: "18px 42px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,9,15,0.4)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
        <div style={{ fontSize: 14, color: "#a855f7", letterSpacing: 4, textTransform: "uppercase", fontFamily: "'Geist Mono',monospace", fontWeight: 800, textShadow: "0 0 24px rgba(168,85,247,0.4)" }}>{cur.label}</div>
      </div>

      {/* Panel content */}
      <div style={{ position: "relative", zIndex: 1, flex: 1, padding: "26px 42px", overflow: "hidden" }}>
        <div key={panelIdx} style={{ animation: "karyaBoardFadeIn 0.7s cubic-bezier(.2,.7,.3,1)", height: "100%" }}>
          {cur.render()}
        </div>
        <style>{`@keyframes karyaBoardFadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>

      {/* Footer */}
      <div style={{ position: "relative", zIndex: 1, padding: "14px 42px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,9,15,0.78)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>
        <div>Scan QR di kursi untuk pesan F&amp;B mid-movie</div>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>🍿 Queue F&amp;B: <span style={{ color: "#fbbf24" }}>{(data.queue.pending || 0) + (data.queue.preparing || 0)}</span> order</div>
      </div>
    </div>
  );
}

function NowShowing({ data }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 20, alignContent: "start", height: "100%", overflowY: "auto" }}>
      {data.now_showing.map(f => {
        const ratingColor = RATING_COLOR[f.rating] || "#a78bfa";
        return (
          <div key={f.id} style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.6), 0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
            <div style={{ position: "relative" }}>
              {f.poster_url ? (
                <img src={f.poster_url} alt={f.title} style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block", background: "#0a0e16" }} />
              ) : (
                <div style={{ width: "100%", aspectRatio: "2/3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 90, background: "linear-gradient(135deg,#1e1b4b,#0d1117)" }}>🎞️</div>
              )}
              {/* Glass rating badge with colored glow */}
              <span style={{ position: "absolute", top: 12, left: 12, fontSize: 11, fontWeight: 800, color: ratingColor, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: `1px solid ${ratingColor}55`, borderRadius: 8, padding: "4px 10px", letterSpacing: 0.5, boxShadow: `0 0 16px ${ratingColor}33` }}>{f.rating}</span>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 4, letterSpacing: -0.4 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{f.genre || "—"} · {f.duration_min || 0} mnt</div>
              {f.avg_rating ? <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginTop: 6 }}>★ {f.avg_rating}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TodaySchedule({ data }) {
  const grouped = {};
  for (const s of data.showtimes_today) {
    (grouped[s.film_title] = grouped[s.film_title] || []).push(s);
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(420px,1fr))", gap: 16, alignContent: "start", height: "100%", overflowY: "auto" }}>
      {Object.entries(grouped).map(([title, shows]) => {
        const ratingColor = RATING_COLOR[shows[0].film_rating] || "#a78bfa";
        return (
          <div key={title} style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.4 }}>{title || "—"}</div>
              <span style={{ fontSize: 11, fontWeight: 800, color: ratingColor, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: `1px solid ${ratingColor}55`, borderRadius: 8, padding: "3px 10px", boxShadow: `0 0 12px ${ratingColor}33` }}>{shows[0].film_rating}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {shows.map(s => {
                const occ = s.capacity ? Math.round(s.sold * 100 / s.capacity) : 0;
                const full = occ >= 95;
                return (
                  <div key={s.id} style={{
                    background: full ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${full ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 10, padding: "10px 14px", minWidth: 110,
                    boxShadow: full ? "0 0 16px rgba(239,68,68,0.2)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}>
                    <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>{s.start_time}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", letterSpacing: 0.5, marginTop: 2 }}>{s.studio_name} · {s.format || "2D"}</div>
                    <div style={{ fontSize: 10, color: full ? "#ef4444" : "rgba(255,255,255,0.4)", marginTop: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 700, letterSpacing: 1 }}>{full ? "SOLD OUT" : `${s.sold}/${s.capacity}`}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {Object.keys(grouped).length === 0 && (
        <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.4)", fontSize: 18 }}>Tidak ada jadwal today.</div>
      )}
    </div>
  );
}

function ComingSoon({ data }) {
  if (!data.coming_soon?.length) return <div style={{ textAlign: "center", padding: "120px 0", color: "rgba(255,255,255,0.4)", fontSize: 22 }}>Belum ada film coming soon.</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 20, alignContent: "start", height: "100%", overflowY: "auto" }}>
      {data.coming_soon.map(f => (
        <div key={f.id} style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.005))", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 18, overflow: "hidden", position: "relative", boxShadow: "0 4px 12px rgba(0,0,0,0.6), 0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
          <span style={{ position: "absolute", top: 12, right: 12, fontSize: 10, color: "#fbbf24", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 8, padding: "4px 10px", fontWeight: 800, letterSpacing: 1.5, zIndex: 2, boxShadow: "0 0 16px rgba(245,158,11,0.25)" }}>SEGERA</span>
          {f.poster_url ? (
            <img src={f.poster_url} alt={f.title} style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block", filter: "brightness(0.85) saturate(1.1)" }} />
          ) : (
            <div style={{ width: "100%", aspectRatio: "2/3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 90, background: "linear-gradient(135deg,#7c2d12,#0d1117)" }}>🎞️</div>
          )}
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.4 }}>{f.title}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{f.genre || "—"} · {f.duration_min || 0} mnt · {f.rating}</div>
            {f.license_start && <div style={{ fontSize: 13, color: "#fbbf24", marginTop: 8, fontWeight: 700 }}>📅 Mulai {f.license_start}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Campaigns({ data }) {
  if (!data.campaigns?.length) return <div style={{ textAlign: "center", padding: "120px 0", color: "rgba(255,255,255,0.4)", fontSize: 22 }}>Belum ada promo aktif.</div>;
  const COLOR = { premiere: "#a855f7", midnight: "#22d3ee", family: "#10b981", student: "#f59e0b", special: "#ec4899" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(420px,1fr))", gap: 20, alignContent: "start", height: "100%", overflowY: "auto" }}>
      {data.campaigns.map(c => {
        const col = COLOR[c.campaign_type] || "#ec4899";
        return (
          <div key={c.id} style={{
            background: `linear-gradient(135deg, ${col}1f 0%, rgba(13,17,23,0.6) 60%, rgba(13,17,23,0.85) 100%)`,
            border: `1px solid ${col}55`, borderRadius: 18, padding: 24,
            boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 48px ${col}1a, inset 0 1px 0 rgba(255,255,255,0.06)`,
            position: "relative", overflow: "hidden",
          }}>
            <div aria-hidden style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, background: `radial-gradient(circle, ${col}33, transparent 70%)`, pointerEvents: "none" }} />
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 11, color: col, letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 8, textTransform: "uppercase", textShadow: `0 0 16px ${col}66` }}>
                {c.campaign_type.toUpperCase()}
              </div>
              <div style={{ fontSize: 25, fontWeight: 900, marginBottom: 6, letterSpacing: -0.6 }}>{c.name}</div>
              {c.film_title && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>🎬 {c.film_title}</div>}
              {c.description && <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.55, marginBottom: 10 }}>{c.description}</div>}
              <div style={{ display: "flex", gap: 18, marginTop: 12, fontFamily: "'Geist Mono',monospace", fontSize: 18, alignItems: "baseline" }}>
                {c.special_price && <div><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>Price </span><b style={{ color: "#10b981", letterSpacing: -0.5 }}>{rp(c.special_price)}</b></div>}
                {c.discount_pct > 0 && <div><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>Discount </span><b style={{ color: "#fbbf24", letterSpacing: -0.5 }}>{c.discount_pct}%</b></div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
