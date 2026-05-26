// karyaOS — Cinema Owner Dashboard
// Vertical-specific dashboard untuk company dengan primary_vertical='cinema'.
// Widgets: KPI tiket sold/revenue, top films, occupancy showtime, recent sales,
// auto-promo progress, Sultan jam ini.
// Data sumber: /api/cinema/dashboard (company-scoped via middleware).

import { useEffect, useState } from "react";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const PALETTE = {
  bg: "#08090f", card: "rgba(255,255,255,0.025)", border: "rgba(255,255,255,0.06)",
  amber: "#fbbf24", purple: "#a855f7", cyan: "#22d3ee", green: "#10b981", red: "#ef4444",
  text: "#e6edf3", sub: "rgba(255,255,255,0.55)", dim: "rgba(255,255,255,0.35)",
};

const PERIODS = [
  { v: "today", l: "Today" },
  { v: "week",  l: "7 Days" },
  { v: "month", l: "30 Days" },
];

export default function CinemaOwnerDashboard({ apiBase = "", onNavigate }) {
  const [data, setData] = useState(null);
  const [autoPromos, setAutoPromos] = useState([]);
  const [sultan, setSultan] = useState(null);
  const [period, setPeriod] = useState("today");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    Promise.all([
      fetch(`${apiBase}/api/cinema/dashboard?period=${period}`).then(r => r.json()).catch(() => null),
      fetch(`${apiBase}/api/cinema/auto-promos`).then(r => r.json()).catch(() => ({ promos: [] })),
      fetch(`${apiBase}/api/leaderboard?limit=5`).then(r => r.json()).catch(() => null),
    ]).then(([d, p, s]) => {
      setData(d || null); setAutoPromos(p?.promos || []); setSultan(s || null);
      if (!d) setErr("Failed to load data cinema");
    }).finally(() => setLoading(false));
  }, [apiBase, period]);

  return (
    <div style={{ color: PALETTE.text, fontFamily: "'Inter',sans-serif", padding: "8px 4px 24px", minHeight: 600 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>🎬 Cinema Owner Dashboard</div>
            <span style={{ padding: "3px 10px", background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 999, fontSize: 11, color: PALETTE.purple, fontWeight: 800, letterSpacing: 1 }}>CINEMA VERTICAL</span>
          </div>
          <div style={{ fontSize: 12, color: PALETTE.sub, marginTop: 4 }}>Real-time tiket · occupancy · revenue · top films — strictly per-company.</div>
        </div>
        <div style={{ display: "inline-flex", gap: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: 3 }}>
          {PERIODS.map(p => (
            <button key={p.v} onClick={() => setPeriod(p.v)}
              style={{
                padding: "8px 16px", background: period === p.v ? "rgba(168,85,247,0.18)" : "transparent",
                color: period === p.v ? PALETTE.purple : PALETTE.sub,
                border: "none", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit", letterSpacing: 0.3,
              }}>{p.l}</button>
          ))}
        </div>
      </div>

      {loading && <div style={{ padding: 30, textAlign: "center", color: PALETTE.dim }}>Loading data cinema…</div>}
      {err && !loading && <div style={{ padding: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#fca5a5", fontSize: 13 }}>{err}</div>}

      {data && !loading && (
        <>
          {/* KPI Cards dengan sparkline + WoW delta */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 20 }}>
            <KPI label="🎟️ Tiket Terjual" value={data.kpi?.tickets || 0}
                 color={PALETTE.amber}
                 spark={(data.sparkline || []).map(s => s.tickets)}
                 wow={data.wow?.tickets} />
            <KPI label="💰 Revenue" value={rp(data.kpi?.revenue)}
                 color={PALETTE.green}
                 spark={(data.sparkline || []).map(s => s.revenue)}
                 wow={data.wow?.revenue} />
            <KPI label="🛒 Purchase" value={data.kpi?.purchases || 0} color={PALETTE.cyan} sub="transaksi" />
            <KPI label="🎬 Showtime Active" value={data.kpi?.active_showtimes || 0} color={PALETTE.purple} />
          </div>

          {/* Auto-promo unlock progress */}
          {autoPromos.length > 0 && (
            <Section title="🎁 AUTO-PROMO STATUS">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 10 }}>
                {autoPromos.map(p => {
                  const pct = p.progress?.percent || 0;
                  const unlocked = p.progress?.unlocked;
                  const label = p.discount_type === "percentage" ? `${p.discount_value}% OFF` : `${rp(p.discount_value)} OFF`;
                  return (
                    <div key={p.id} style={{
                      background: PALETTE.card, border: `1px solid ${unlocked ? "rgba(245,158,11,0.45)" : PALETTE.border}`,
                      borderRadius: 12, padding: "12px 14px",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: PALETTE.sub, marginTop: 2 }}>{label} · {p.trigger_type === "auto_daily_sales" ? "Rp omzet" : "tiket"} threshold</div>
                        </div>
                        {unlocked ? (
                          <span style={{ fontSize: 10, fontWeight: 800, color: PALETTE.amber, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", padding: "3px 9px", borderRadius: 999, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>🎉 AKTIF</span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 800, color: PALETTE.purple, background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", padding: "3px 9px", borderRadius: 999, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{pct}%</span>
                        )}
                      </div>
                      <div style={{ position: "relative", height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 999, overflow: "hidden", marginTop: 10 }}>
                        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: unlocked ? `linear-gradient(90deg,${PALETTE.amber},#fbbf24)` : `linear-gradient(90deg,${PALETTE.purple},#c084fc)`, transition: "width 0.4s ease" }} />
                      </div>
                      <div style={{ fontSize: 10.5, color: PALETTE.sub, marginTop: 5, fontFamily: "'Geist Mono',monospace" }}>
                        {p.progress?.current?.toLocaleString("id-ID")} / {p.progress?.target?.toLocaleString("id-ID")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Top Films + Recent Sales */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
            <Section title="🎬 TOP FILMS">
              {(data.top_films || []).length === 0 ? (
                <div style={{ color: PALETTE.dim, fontSize: 12, padding: 14 }}>No penjualan.</div>
              ) : (data.top_films || []).map((f, i) => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${PALETTE.border}` }}>
                  <span style={{ width: 24, fontSize: 11, color: PALETTE.dim, fontFamily: "'Geist Mono',monospace" }}>#{i + 1}</span>
                  {f.poster_url ? <img src={f.poster_url} style={{ width: 32, height: 48, borderRadius: 4, objectFit: "cover" }} /> : <span style={{ width: 32, height: 48, background: "rgba(255,255,255,0.03)", borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎞️</span>}
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{f.title}</span>
                  <span style={{ fontSize: 12, fontFamily: "'Geist Mono',monospace", color: PALETTE.amber }}>{f.tickets}× · {rp(f.revenue)}</span>
                </div>
              ))}
            </Section>

            <Section title="📊 RECENT SALES">
              {(data.recent_sales || []).slice(0, 8).map(t => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${PALETTE.border}` }}>
                  <span style={{ fontSize: 10, color: PALETTE.dim, fontFamily: "'Geist Mono',monospace", width: 64 }}>{new Date(t.sold_at * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span style={{ flex: 1, fontSize: 12 }}>{t.film_title || "—"} <span style={{ color: PALETTE.sub }}>{t.studio_name}</span></span>
                  <span style={{ fontSize: 11, color: PALETTE.cyan, fontFamily: "'Geist Mono',monospace" }}>{t.seat}</span>
                  <span style={{ fontSize: 12, fontFamily: "'Geist Mono',monospace", color: PALETTE.green, width: 80, textAlign: "right" }}>{rp(t.price)}</span>
                </div>
              ))}
              {(data.recent_sales || []).length === 0 && <div style={{ color: PALETTE.dim, fontSize: 12, padding: 14 }}>No penjualan.</div>}
            </Section>
          </div>

          {/* Occupancy + Sultan */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
            <Section title="🏛️ SHOWTIME OCCUPANCY">
              {(data.occupancy || []).slice(0, 8).map(o => {
                const pct = o.capacity > 0 ? Math.round(o.sold / o.capacity * 100) : 0;
                const c = pct >= 80 ? PALETTE.red : pct >= 50 ? PALETTE.amber : PALETTE.green;
                return (
                  <div key={o.id} style={{ padding: "8px 0", borderBottom: `1px solid ${PALETTE.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span><b>{o.film_title}</b> <span style={{ color: PALETTE.sub }}>· {o.start_time} · {o.studio_name}</span></span>
                      <span style={{ color: c, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{o.sold}/{o.capacity} ({pct}%)</span>
                    </div>
                    <div style={{ height: 4, background: "rgba(255,255,255,0.04)", borderRadius: 999, marginTop: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: c, transition: "width 0.3s ease" }} />
                    </div>
                  </div>
                );
              })}
              {(data.occupancy || []).length === 0 && <div style={{ color: PALETTE.dim, fontSize: 12, padding: 14 }}>No jadwal.</div>}
            </Section>

            <Section title="👑 SULTAN JAM INI">
              <div style={{ fontSize: 10, color: PALETTE.amber, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, marginBottom: 6 }}>{sultan?.window || "—"}</div>
              {(sultan?.top || []).slice(0, 5).map(r => (
                <div key={r.rank} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${PALETTE.border}` }}>
                  <span style={{ width: 24, fontSize: 12 }}>{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : `#${r.rank}`}</span>
                  <span style={{ fontSize: 16 }}>{r.emoji}</span>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{r.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: r.color, fontFamily: "'Geist Mono',monospace" }}>{r.title}</span>
                  <span style={{ fontSize: 12, fontFamily: "'Geist Mono',monospace", color: PALETTE.amber, width: 96, textAlign: "right" }}>{rp(r.amount)}</span>
                </div>
              ))}
              {(!sultan?.top || sultan.top.length === 0) && <div style={{ color: PALETTE.dim, fontSize: 12, padding: 14 }}>No transaksi hr ini.</div>}
            </Section>
          </div>

          {/* Quick navigation chips */}
          {typeof onNavigate === "function" && (
            <div style={{ display: "flex", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
              {[
                { key: "cinema_command_center", label: "🛰️ Command Center" },
                { key: "cinema_ops", label: "🎬 Operations" },
                { key: "cinema_ticketing", label: "🎟️ Box Office" },
                { key: "cinema_promotion", label: "🎁 Promotions" },
                { key: "cinema_analytics", label: "📊 Analytics" },
                { key: "cinema_inventory", label: "🍿 F&B Inventory" },
              ].map(c => (
                <button key={c.key} onClick={() => onNavigate(c.key)}
                  style={{
                    padding: "9px 14px", background: "rgba(168,85,247,0.08)",
                    border: "1px solid rgba(168,85,247,0.25)", borderRadius: 10,
                    color: PALETTE.purple, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    fontFamily: "inherit", letterSpacing: 0.3,
                  }}>{c.label}</button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KPI({ label, value, color, sub, spark, wow }) {
  const hasSpark = Array.isArray(spark) && spark.length > 1;
  const hasWow = wow && typeof wow.pct === "number";
  return (
    <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: PALETTE.sub, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5 }}>{value}</div>
          {hasWow && (
            <div style={{ fontSize: 10, marginTop: 4, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5,
              color: wow.pct > 0 ? PALETTE.green : wow.pct < 0 ? PALETTE.red : PALETTE.dim }}>
              {wow.pct > 0 ? "▲" : wow.pct < 0 ? "▼" : "·"} {Math.abs(wow.pct)}% vs minggu lalu
            </div>
          )}
          {sub && !hasWow && <div style={{ fontSize: 10, color: PALETTE.dim, marginTop: 2 }}>{sub}</div>}
        </div>
        {hasSpark && <Sparkline data={spark} color={color} />}
      </div>
    </div>
  );
}

function Sparkline({ data, color, width = 70, height = 28 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ flexShrink: 0, marginTop: 14 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={height - ((data[data.length - 1] - min) / range) * height} r="2.5" fill={color} />
    </svg>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: PALETTE.amber, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
