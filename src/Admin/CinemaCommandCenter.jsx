// karyaOS — Cinema Command Center (NASA-style mission control)
// HERO realtime dashboard — studio occupancy heatmap, revenue ticker,
// live event feed, top film leaderboard. Auto-poll 5s.
import { useState, useEffect, useCallback, useRef } from "react";
import { fmtMoney as rp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";

// NASA-style palette — dark mission control, glowing data, status accents
const C = {
  bg:       "#06080d",
  panel:    "#0b1018",
  panelHi:  "#10161f",
  border:   "#1f2937",
  borderHi: "#2d3b50",
  text:     "#e6edf3",
  sub:      "#94a3b8",
  dim:      "#5b6470",
  meta:     "#7a8699",
  gold:     "#fbbf24",
  green:    "#10b981",
  cyan:     "#22d3ee",
  red:      "#ef4444",
  purple:   "#a855f7",
  amber:    "#f59e0b",
  pink:     "#ec4899",
};
const FONT_MONO = "'Geist Mono','SF Mono',ui-monospace,monospace";
const FONT_SANS = "'Inter','SF Pro Text',system-ui,sans-serif";

const DS_LABEL = { scheduled: "Scheduled", running: "Running", closed: "Closed", sold_out: "Sold Out", cancelled: "Cancel" };
const DS_COLOR = { scheduled: C.green, running: C.amber, closed: C.dim, sold_out: C.red, cancelled: "#dc2626" };
const MAINT_LABEL = { operational: "OK", cleaning: "Cleaning", maintenance: "Maint.", closed: "Closed" };
const MAINT_COLOR = { operational: C.green, cleaning: C.cyan, maintenance: C.amber, closed: C.red };

const fmtTs = (s) => s ? new Date(s * 1000).toLocaleTimeString("id-ID", { hour12: false }) : "—";
const fmtClock = (ts) => new Date(ts).toLocaleTimeString("id-ID", { hour12: false }) + "." + String(ts % 1000).padStart(3, "0");

export default function CinemaCommandCenter({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [data, setData] = useState(null);
  const [prevTotal, setPrevTotal] = useState(0);
  const [updated, setUpdated] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [eventFeed, setEventFeed] = useState([]);
  const prevTicketsRef = useRef(0);

  // Live clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${base}/command-center`);
      const d = await r.json();
      // Track new tickets between polls → push to event feed
      const currentTicketCount = d.revenue?.tickets_count || 0;
      const ticketDelta = currentTicketCount - prevTicketsRef.current;
      if (prevTicketsRef.current > 0 && ticketDelta > 0) {
        setEventFeed(prev => [
          { ts: Date.now(), type: "ticket", text: `+${ticketDelta} tiket terjual`, value: ticketDelta },
          ...prev,
        ].slice(0, 50));
      }
      prevTicketsRef.current = currentTicketCount;
      setPrevTotal(data?.revenue?.total || 0);
      setData(d);
      setUpdated(Date.now());
    } catch {}
  }, [base, data]);
  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [load]);

  if (!data) return <LoadingState label="Connecting to mission control…" />;

  const t = data.revenue || {};
  const showtimes = data.showtimes_today || [];
  const running   = showtimes.filter(s => s.derived_status === "running");
  const upcoming  = showtimes.filter(s => s.derived_status === "scheduled");
  const completed = showtimes.filter(s => s.derived_status === "closed" || s.derived_status === "sold_out");

  // Compute revenue delta + trend
  const revDelta = (t.total || 0) - prevTotal;
  const revPct = prevTotal > 0 ? ((revDelta / prevTotal) * 100).toFixed(1) : null;

  // Studio occupancy aggregate (avg across running+upcoming today)
  const allOpenShows = [...running, ...upcoming];
  const overallOcc = allOpenShows.length === 0 ? 0 : Math.round(
    allOpenShows.reduce((a, s) => a + (s.capacity ? (s.sold || 0) / s.capacity : 0), 0) / allOpenShows.length * 100
  );

  // Top films today (sort by sold)
  const filmAgg = {};
  showtimes.forEach(s => {
    const k = s.film_title || "—";
    filmAgg[k] = (filmAgg[k] || 0) + (s.sold || 0);
  });
  const topFilms = Object.entries(filmAgg).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topFilmMax = topFilms[0]?.[1] || 1;

  // Studio occupancy heatmap data
  const studioHeatmap = (data.studios || []).map(st => {
    const studShowtimes = showtimes.filter(s => s.studio_id === st.id);
    const occ = studShowtimes.length === 0 ? 0 : Math.round(
      studShowtimes.reduce((a, s) => a + (s.capacity ? (s.sold || 0) / s.capacity : 0), 0) / studShowtimes.length * 100
    );
    return { ...st, occ, showtimeCount: studShowtimes.length };
  });

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: FONT_SANS, padding: 16, minHeight: "100vh" }}>
      <style>{`
        @keyframes ccPulse { 0%,100% { opacity:1 } 50% { opacity:0.35 } }
        @keyframes ccGlow { 0%,100% { box-shadow: 0 0 12px var(--glow-color, ${C.green})55 } 50% { box-shadow: 0 0 24px var(--glow-color, ${C.green})aa } }
        @keyframes ccTickerSlide { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes ccCountFlash { 0% { color:${C.gold} } 100% { color: inherit } }
        .cc-glow-pulse { animation: ccPulse 1.6s ease infinite }
        .cc-event-fade { animation: ccCountFlash 1.2s ease 1 }
      `}</style>

      {/* NASA MISSION CONTROL HEADER */}
      <div style={{
        background: `linear-gradient(180deg, ${C.panelHi}, ${C.panel})`,
        border: `1px solid ${C.borderHi}`, borderRadius: 12,
        padding: "16px 20px", marginBottom: 16,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14,
        boxShadow: `0 0 0 1px ${C.green}1a, 0 8px 32px rgba(0,0,0,0.6)`,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span className="cc-glow-pulse" style={{
              width: 10, height: 10, borderRadius: "50%", background: C.green,
              boxShadow: `0 0 10px ${C.green}, 0 0 20px ${C.green}88`,
            }} />
            <span style={{ fontSize: 10, color: C.green, fontFamily: FONT_MONO, fontWeight: 700, letterSpacing: 2 }}>● LIVE · POLL 5s</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: C.text, letterSpacing: 0.5, fontFamily: FONT_MONO }}>
            🛰 CINEMA COMMAND CENTER
          </div>
          <div style={{ fontSize: 11, color: C.sub, marginTop: 2, fontFamily: FONT_MONO, letterSpacing: 0.4 }}>
            Mission Control · {data.today} · Last sync: <span style={{ color: C.cyan }}>{fmtClock(updated)}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 36, fontWeight: 800, fontFamily: FONT_MONO, color: C.gold, letterSpacing: 1 }}>
            {new Date(now).toLocaleTimeString("id-ID", { hour12: false })}
          </div>
          <div style={{ fontSize: 11, color: C.dim, fontFamily: FONT_MONO, letterSpacing: 1 }}>
            {new Date(now).toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* SYSTEM ALERTS — kalau ada issue */}
      {(data.studio_issues?.length > 0 || data.void_count_24h > 5) && (
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {data.studio_issues?.length > 0 && (
            <AlertChip color={C.red} icon="⚠">{data.studio_issues.length} STUDIO NON-OPERATIONAL</AlertChip>
          )}
          {data.void_count_24h > 5 && (
            <AlertChip color={C.amber} icon="⚡">{data.void_count_24h} VOID/REFUND 24H — REVIEW</AlertChip>
          )}
        </div>
      )}

      {/* KPI STRIP — 6 big stats dgn animated counters */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
        <Stat label="REVENUE TODAY" value={rp(t.total)} sub={revPct ? `${revDelta >= 0 ? "↑" : "↓"} ${Math.abs(revPct)}% vs poll` : "—"} subColor={revDelta >= 0 ? C.green : C.red} color={C.gold} big animate />
        <Stat label="TICKETS"        value={t.tickets_count || 0} sub={rp(t.tickets)} color={C.cyan} />
        <Stat label="F&B BUNDLES"    value={rp(t.bundles)} sub={`${(data.queue?.delivered || 0)} delivered`} color={C.amber} />
        <Stat label="IN-STUDIO"      value={rp(t.in_studio)} sub={`${data.queue?.pending || 0} pending`} color={C.purple} />
        <Stat label="OCCUPANCY"      value={`${overallOcc}%`} sub={`${allOpenShows.length} shows live`} color={overallOcc > 70 ? C.gold : C.green} big />
        <Stat label="VOID 24H"       value={data.void_count_24h || 0} color={data.void_count_24h ? C.red : C.dim} />
      </div>

      {/* MAIN GRID — 3 columns: studio heatmap + showtimes + event feed */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 14 }} className="cc-main-grid">
        {/* COL 1: Studio Heatmap + Top Films + Queue */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Section title="◉ STUDIO OCCUPANCY" subtitle={`${studioHeatmap.length} studios`}>
            <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 }}>
              {studioHeatmap.length === 0 && <Empty>No studio data</Empty>}
              {studioHeatmap.map(s => {
                const tier = s.occ >= 80 ? "hot" : s.occ >= 50 ? "warm" : s.occ > 0 ? "cool" : "idle";
                const tierColor = { hot: C.red, warm: C.amber, cool: C.green, idle: C.dim }[tier];
                return (
                  <div key={s.id} title={`${s.name} · ${s.showtimeCount} shows`} style={{
                    background: `linear-gradient(135deg, ${tierColor}22, ${tierColor}08)`,
                    border: `1px solid ${tierColor}55`,
                    borderRadius: 8, padding: "8px 6px", textAlign: "center",
                    boxShadow: tier === "hot" ? `0 0 16px ${tierColor}44` : "none",
                    animation: tier === "hot" ? "ccGlow 2s ease infinite" : undefined,
                    "--glow-color": tierColor,
                  }}>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 18, fontWeight: 900, color: tierColor, letterSpacing: -0.5 }}>{s.occ}%</div>
                    <div style={{ fontSize: 9.5, color: C.sub, marginTop: 2, fontFamily: FONT_MONO, fontWeight: 700, letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                    <div style={{ fontSize: 8, color: C.dim, marginTop: 1, fontFamily: FONT_MONO }}>{s.showtimeCount} shows</div>
                  </div>
                );
              })}
            </div>
            {/* Heatmap legend */}
            <div style={{ display: "flex", justifyContent: "center", gap: 12, padding: "0 14px 12px", fontSize: 9, color: C.sub, fontFamily: FONT_MONO, letterSpacing: 0.5 }}>
              <Legend dot={C.red} label="HOT 80%+" />
              <Legend dot={C.amber} label="WARM 50%+" />
              <Legend dot={C.green} label="COOL" />
              <Legend dot={C.dim} label="IDLE" />
            </div>
          </Section>

          <Section title="🏆 TOP FILMS TODAY" subtitle={`${topFilms.length} films`}>
            {topFilms.length === 0 ? <Empty>No data</Empty> : (
              <div style={{ padding: 10 }}>
                {topFilms.map(([title, count], i) => (
                  <div key={title} style={{ marginBottom: i === topFilms.length - 1 ? 0 : 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: C.text, fontWeight: 700, fontFamily: FONT_SANS }}>
                        <span style={{ color: i === 0 ? C.gold : C.dim, fontFamily: FONT_MONO, marginRight: 6 }}>#{i + 1}</span>
                        {title}
                      </span>
                      <span style={{ fontSize: 12, fontFamily: FONT_MONO, color: C.gold, fontWeight: 800 }}>{count} tix</span>
                    </div>
                    <div style={{ height: 4, background: C.panel, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(count / topFilmMax) * 100}%`, background: i === 0 ? `linear-gradient(90deg, ${C.gold}, ${C.amber})` : C.cyan, borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="🍿 IN-STUDIO QUEUE">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, padding: 12 }}>
              <QueueStat label="New"       value={data.queue?.pending || 0}    color={C.red} pulse={(data.queue?.pending || 0) > 3} />
              <QueueStat label="Preparing" value={data.queue?.preparing || 0}  color={C.amber} />
              <QueueStat label="Delivered" value={data.queue?.delivered || 0}  color={C.green} />
              <QueueStat label="Cancel"    value={data.queue?.cancelled || 0}  color={C.dim} />
            </div>
          </Section>
        </div>

        {/* COL 2: Showtimes Live + Upcoming */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Section title={`▶ RUNNING NOW`} subtitle={`${running.length} live`} accent={C.amber}>
            {running.length === 0 ? <Empty>No shows currently running</Empty> : running.map(s => <ShowRow key={s.id} s={s} />)}
          </Section>
          <Section title="⏰ UPCOMING" subtitle={`${upcoming.length} scheduled`}>
            {upcoming.length === 0 ? <Empty>No upcoming shows today</Empty> : upcoming.slice(0, 8).map(s => <ShowRow key={s.id} s={s} />)}
          </Section>
          {completed.length > 0 && (
            <Section title={`✓ COMPLETED`} subtitle={`${completed.length} closed`}>
              <div style={{ padding: "12px 14px", color: C.sub, fontSize: 12, fontFamily: FONT_MONO }}>
                Total revenue from closed shows: <span style={{ color: C.green, fontWeight: 800 }}>{rp(completed.reduce((a, s) => a + (s.sold * (s.price || 0)), 0))}</span>
              </div>
            </Section>
          )}
        </div>

        {/* COL 3: Live Event Feed + Studio Status + Feedback */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Section title="📡 LIVE EVENT FEED" subtitle={`${eventFeed.length} recent`} accent={C.cyan}>
            <div style={{ maxHeight: 180, overflowY: "auto", padding: "4px 0" }}>
              {eventFeed.length === 0 ? (
                <Empty>Waiting for events…</Empty>
              ) : (
                eventFeed.slice(0, 12).map((e, i) => (
                  <div key={e.ts + "-" + i} className={i === 0 ? "cc-event-fade" : ""} style={{
                    padding: "7px 14px", fontSize: 11, fontFamily: FONT_MONO,
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ color: C.text, fontWeight: 600 }}>{e.text}</span>
                    <span style={{ color: C.dim, fontSize: 10 }}>{new Date(e.ts).toLocaleTimeString("id-ID", { hour12: false })}</span>
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="🏛 STUDIO STATUS">
            {(data.studios || []).slice(0, 6).map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 2, fontFamily: FONT_MONO }}>
                    {s.last_cleaned_at ? `Cleaned ${fmtTs(s.last_cleaned_at)}` : "—"}
                  </div>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 800, fontFamily: FONT_MONO, letterSpacing: 0.8,
                  color: MAINT_COLOR[s.maintenance_status] || C.dim,
                  background: (MAINT_COLOR[s.maintenance_status] || C.dim) + "22",
                  borderRadius: 4, padding: "3px 8px",
                  border: `1px solid ${(MAINT_COLOR[s.maintenance_status] || C.dim)}44`,
                }}>
                  ● {MAINT_LABEL[s.maintenance_status] || "—"}
                </span>
              </div>
            ))}
          </Section>

          <Section title="⭐ RECENT FEEDBACK" subtitle={`${data.feedback?.length || 0} today`}>
            {(data.feedback || []).length === 0 ? <Empty>No feedback today</Empty> :
              (data.feedback || []).slice(0, 3).map(f => (
                <div key={f.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
                  <div style={{ fontWeight: 700, marginBottom: 3, color: C.text }}>{f.film_title || "—"}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontFamily: FONT_MONO, color: C.gold, fontSize: 10 }}>
                    {f.rating_movie ? <span>🎬{f.rating_movie}</span> : null}
                    {f.rating_audio ? <span>🔊{f.rating_audio}</span> : null}
                    {f.rating_cleanliness ? <span>✨{f.rating_cleanliness}</span> : null}
                    {f.rating_comfort ? <span>💺{f.rating_comfort}</span> : null}
                  </div>
                  {f.comment && <div style={{ color: C.sub, lineHeight: 1.45, marginTop: 4, fontStyle: "italic" }}>"{f.comment.slice(0, 80)}{f.comment.length > 80 ? "…" : ""}"</div>}
                </div>
              ))
            }
          </Section>
        </div>
      </div>

      {/* Footer — system signature */}
      <div style={{ marginTop: 20, padding: "12px 16px", textAlign: "center", fontSize: 10, color: C.dim, fontFamily: FONT_MONO, letterSpacing: 1.5, borderTop: `1px solid ${C.border}` }}>
        karyaOS Cinema Command Center · v1 · MISSION CONTROL · {data.today}
      </div>
    </div>
  );
}

// ── COMPONENTS ─────────────────────────────────────────

function ShowRow({ s }) {
  const ds = s.derived_status || "scheduled";
  const occ = s.capacity ? Math.round((s.sold || 0) / s.capacity * 100) : 0;
  const hot = occ >= 80;
  return (
    <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.border}`, transition: "background 0.2s", position: "relative" }}>
      {hot && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: C.red, boxShadow: `0 0 8px ${C.red}` }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.film_title || "—"}</div>
          <div style={{ fontSize: 10.5, color: C.sub, fontFamily: FONT_MONO, marginTop: 2, letterSpacing: 0.4 }}>
            {s.studio_name} · <span style={{ color: C.gold }}>{s.start_time}</span> · {s.format || "2D"}{s.film_rating ? ` · ${s.film_rating}` : ""}
          </div>
        </div>
        <span style={{ fontSize: 9, fontWeight: 800, color: DS_COLOR[ds], background: DS_COLOR[ds] + "22", borderRadius: 4, padding: "3px 7px", letterSpacing: 0.8, whiteSpace: "nowrap", fontFamily: FONT_MONO, border: `1px solid ${DS_COLOR[ds]}44` }}>
          {DS_LABEL[ds]}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <div style={{ flex: 1, height: 5, background: C.panelHi, borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${Math.max(2, occ)}%`,
            background: hot ? `linear-gradient(90deg, ${C.red}, ${C.amber})` : occ >= 50 ? C.amber : C.green,
            borderRadius: 3, transition: "width 0.5s ease",
            boxShadow: hot ? `0 0 8px ${C.red}66` : "none",
          }} />
        </div>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.text, fontWeight: 800, minWidth: 56, textAlign: "right" }}>
          {s.sold}/{s.capacity}
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: hot ? C.red : C.sub, width: 36, textAlign: "right", fontWeight: 700 }}>
          {occ}%
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, subColor, color, big, animate }) {
  return (
    <div style={{
      background: `linear-gradient(180deg, ${C.panelHi}, ${C.panel})`,
      border: `1px solid ${C.border}`, borderRadius: 10,
      padding: big ? "14px 16px" : "12px 14px",
      position: "relative", overflow: "hidden",
    }}>
      {animate && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.6 }} />}
      <div style={{ fontFamily: FONT_MONO, fontSize: big ? 26 : 20, fontWeight: 900, color, letterSpacing: -0.5, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9, color: C.meta, letterSpacing: 1.2, marginTop: 4, fontFamily: FONT_MONO, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: subColor || C.sub, marginTop: 4, fontFamily: FONT_MONO, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

function QueueStat({ label, value, color, pulse }) {
  return (
    <div className={pulse ? "cc-glow-pulse" : ""} style={{
      background: C.bg, border: `1px solid ${color}55`, borderRadius: 8,
      padding: "10px 12px", textAlign: "center",
      boxShadow: pulse ? `0 0 18px ${color}33` : "none",
    }}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 22, fontWeight: 900, color, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 9, color: C.meta, marginTop: 3, fontFamily: FONT_MONO, fontWeight: 600, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function Section({ title, subtitle, children, accent = C.cyan }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, padding: "0 2px" }}>
        <div style={{ fontSize: 10.5, color: accent, letterSpacing: 1.5, fontFamily: FONT_MONO, fontWeight: 800 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 9, color: C.dim, fontFamily: FONT_MONO, letterSpacing: 0.6 }}>{subtitle}</div>}
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ padding: "18px 14px", textAlign: "center", color: C.dim, fontSize: 11, fontFamily: FONT_MONO, letterSpacing: 0.5 }}>{children}</div>;
}

function Legend({ dot, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, boxShadow: `0 0 6px ${dot}88` }} />
      <span style={{ color: C.sub }}>{label}</span>
    </span>
  );
}

function AlertChip({ color, icon, children }) {
  return (
    <div className="cc-glow-pulse" style={{
      background: `${color}1a`, border: `1px solid ${color}66`, borderRadius: 8,
      padding: "8px 14px",
      display: "inline-flex", alignItems: "center", gap: 8,
      fontSize: 11, fontWeight: 800, color, fontFamily: FONT_MONO, letterSpacing: 1,
      boxShadow: `0 0 14px ${color}33`,
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      {children}
    </div>
  );
}
