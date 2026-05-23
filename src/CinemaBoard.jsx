// karyaOS — Cinema Lobby TV Signage Board
// Full-screen rotating display for lobby televisions.
// Routes: ?cinema-board (full screen, auto-rotate 15s between panels)
// Panels: Now Showing · Today's Schedule · Coming Soon · Active Campaigns
import { useState, useEffect, useCallback } from "react";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const BG = "#040611";
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

  if (!data) return <div style={{ position: "fixed", inset: 0, background: BG, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif" }}>Memuat…</div>;

  const panels = [
    { id: "now",      label: "🎬 NOW SHOWING",    render: () => <NowShowing data={data} /> },
    { id: "today",    label: "🗓️ JADWAL HARI INI", render: () => <TodaySchedule data={data} /> },
    { id: "soon",     label: "📅 COMING SOON",    render: () => <ComingSoon data={data} /> },
    { id: "campaign", label: "🎉 SPECIAL OFFERS", render: () => <Campaigns data={data} /> },
  ];
  const cur = panels[panelIdx];

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, color: "#fff", fontFamily: "'Inter',sans-serif", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 38px", borderBottom: "1px solid #161b22", flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 32, fontWeight: 800, letterSpacing: 2 }}>🎬 karya<span style={{ color: "#a855f7" }}>OS</span> Cinema</div>
          <div style={{ fontSize: 14, color: "#7d8590", letterSpacing: 1, marginTop: 2 }}>{data.today} · {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {panels.map((p, i) => (
            <div key={p.id} style={{
              width: i === panelIdx ? 38 : 10, height: 6,
              background: i === panelIdx ? "#a855f7" : "#2a2b30",
              borderRadius: 3, transition: "width 0.3s",
            }} />
          ))}
        </div>
      </div>

      {/* Panel label */}
      <div style={{ padding: "16px 38px", borderBottom: "1px solid #161b22" }}>
        <div style={{ fontSize: 16, color: "#a855f7", letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{cur.label}</div>
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, padding: "24px 38px", overflow: "hidden", position: "relative" }}>
        <div key={panelIdx} style={{ animation: "karyaBoardFadeIn 0.6s ease-out", height: "100%" }}>
          {cur.render()}
        </div>
        <style>{`@keyframes karyaBoardFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 38px", borderTop: "1px solid #161b22", display: "flex", justifyContent: "space-between", fontSize: 13, color: "#5b6470", flexShrink: 0 }}>
        <div>Scan QR di kursi untuk pesan F&amp;B mid-movie</div>
        <div style={{ fontFamily: "'Geist Mono',monospace" }}>🍿 Antrian F&amp;B: {(data.queue.pending || 0) + (data.queue.preparing || 0)} order</div>
      </div>
    </div>
  );
}

function NowShowing({ data }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 18, alignContent: "start", height: "100%", overflowY: "auto" }}>
      {data.now_showing.map(f => (
        <div key={f.id} style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 16, overflow: "hidden" }}>
          {f.poster_url ? (
            <img src={f.poster_url} alt={f.title} style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block", background: "#0a0e16" }} />
          ) : (
            <div style={{ width: "100%", aspectRatio: "2/3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 90, background: "linear-gradient(135deg,#1e1b4b,#0d1117)" }}>🎞️</div>
          )}
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{f.title}</div>
            <div style={{ fontSize: 12, color: "#7d8590" }}>{f.genre || "—"} · {f.duration_min || 0} mnt</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: RATING_COLOR[f.rating] || "#a78bfa", background: (RATING_COLOR[f.rating] || "#a78bfa") + "22", borderRadius: 6, padding: "3px 10px", letterSpacing: 0.5 }}>{f.rating}</span>
              {f.avg_rating ? <span style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>★ {f.avg_rating}</span> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TodaySchedule({ data }) {
  const grouped = {};
  for (const s of data.showtimes_today) {
    (grouped[s.film_title] = grouped[s.film_title] || []).push(s);
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(420px,1fr))", gap: 14, alignContent: "start", height: "100%", overflowY: "auto" }}>
      {Object.entries(grouped).map(([title, shows]) => (
        <div key={title} style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{title || "—"}</div>
            <span style={{ fontSize: 11, fontWeight: 800, color: RATING_COLOR[shows[0].film_rating] || "#a78bfa", background: (RATING_COLOR[shows[0].film_rating] || "#a78bfa") + "22", borderRadius: 6, padding: "3px 10px" }}>{shows[0].film_rating}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {shows.map(s => {
              const occ = s.capacity ? Math.round(s.sold * 100 / s.capacity) : 0;
              const full = occ >= 95;
              return (
                <div key={s.id} style={{
                  background: full ? "#ef444415" : "#0a0e16",
                  border: `1px solid ${full ? "#ef444466" : "#2a2b30"}`,
                  borderRadius: 10, padding: "8px 12px", minWidth: 100,
                }}>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 18, fontWeight: 800 }}>{s.start_time}</div>
                  <div style={{ fontSize: 10.5, color: "#7d8590", letterSpacing: 0.5 }}>{s.studio_name} · {s.format || "2D"}</div>
                  <div style={{ fontSize: 10, color: full ? "#ef4444" : "#5b6470", marginTop: 3, fontFamily: "'Geist Mono',monospace" }}>{full ? "SOLD OUT" : `${s.sold}/${s.capacity}`}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {Object.keys(grouped).length === 0 && (
        <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 0", color: "#5b6470", fontSize: 18 }}>Tidak ada jadwal hari ini.</div>
      )}
    </div>
  );
}

function ComingSoon({ data }) {
  if (!data.coming_soon?.length) return <div style={{ textAlign: "center", padding: "120px 0", color: "#5b6470", fontSize: 22 }}>Belum ada film coming soon.</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 18, alignContent: "start", height: "100%", overflowY: "auto" }}>
      {data.coming_soon.map(f => (
        <div key={f.id} style={{ background: "#0d1117", border: "1px solid #f59e0b44", borderRadius: 16, overflow: "hidden", position: "relative" }}>
          <span style={{ position: "absolute", top: 12, right: 12, fontSize: 10, color: "#fbbf24", background: "#f59e0b22", border: "1px solid #f59e0b66", borderRadius: 6, padding: "4px 10px", fontWeight: 800, letterSpacing: 1.5, zIndex: 2 }}>SEGERA</span>
          {f.poster_url ? (
            <img src={f.poster_url} alt={f.title} style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block", filter: "grayscale(0.15)" }} />
          ) : (
            <div style={{ width: "100%", aspectRatio: "2/3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 90, background: "linear-gradient(135deg,#7c2d12,#0d1117)" }}>🎞️</div>
          )}
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{f.title}</div>
            <div style={{ fontSize: 12, color: "#7d8590", marginTop: 3 }}>{f.genre || "—"} · {f.duration_min || 0} mnt · {f.rating}</div>
            {f.license_start && <div style={{ fontSize: 13, color: "#fbbf24", marginTop: 8, fontWeight: 700 }}>📅 Mulai {f.license_start}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Campaigns({ data }) {
  if (!data.campaigns?.length) return <div style={{ textAlign: "center", padding: "120px 0", color: "#5b6470", fontSize: 22 }}>Belum ada promo aktif.</div>;
  const COLOR = { premiere: "#a855f7", midnight: "#22d3ee", family: "#10b981", student: "#f59e0b", special: "#ec4899" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(420px,1fr))", gap: 18, alignContent: "start", height: "100%", overflowY: "auto" }}>
      {data.campaigns.map(c => {
        const col = COLOR[c.campaign_type] || "#ec4899";
        return (
          <div key={c.id} style={{ background: `linear-gradient(135deg,${col}22 0%,#0d1117 100%)`, border: `2px solid ${col}66`, borderRadius: 16, padding: 22 }}>
            <div style={{ fontSize: 11, color: col, letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 6 }}>
              {c.campaign_type.toUpperCase()}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>{c.name}</div>
            {c.film_title && <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 8 }}>🎬 {c.film_title}</div>}
            {c.description && <div style={{ fontSize: 13.5, color: "#cbd5e1", lineHeight: 1.55, marginBottom: 10 }}>{c.description}</div>}
            <div style={{ display: "flex", gap: 14, marginTop: 10, fontFamily: "'Geist Mono',monospace", fontSize: 17 }}>
              {c.special_price && <div><span style={{ color: "#5b6470", fontSize: 12 }}>Harga </span><b style={{ color: "#10b981" }}>{rp(c.special_price)}</b></div>}
              {c.discount_pct > 0 && <div><span style={{ color: "#5b6470", fontSize: 12 }}>Diskon </span><b style={{ color: "#fbbf24" }}>{c.discount_pct}%</b></div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
