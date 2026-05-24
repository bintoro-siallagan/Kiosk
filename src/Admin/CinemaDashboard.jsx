// karyaOS — Cinema Dashboard (HQ Reporting/Analytics)
// KPI cards + revenue per outlet + top films + occupancy + recent sales + bundle stats
// Period selector: today/week/month + optional outlet filter
import { useState, useEffect } from "react";
import { HelpButton } from "../components/HelpModal.jsx";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtK = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + "M" : n >= 1e6 ? (n / 1e6).toFixed(1) + "jt" : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(Math.round(n));
const fmtTime = (sec) => sec ? new Date(sec * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-";
const fmtDateTime = (sec) => sec ? new Date(sec * 1000).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";

const PERIODS = [
  { key: "today", label: "Hari Ini", icon: "📅" },
  { key: "week", label: "7 Hari", icon: "📆" },
  { key: "month", label: "30 Hari", icon: "🗓️" },
];

export default function CinemaDashboard({ apiBase }) {
  const [period, setPeriod] = useState("today");
  const [outletFilter, setOutletFilter] = useState("");
  const [outlets, setOutlets] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/api/outlet-master`).then(r => r.json())
      .then(d => setOutlets((d.outlets || d.data || []).filter(o => o.status === "active")))
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ period });
    if (outletFilter) qs.set("outlet", outletFilter);
    fetch(`${apiBase}/api/cinema/dashboard?${qs}`).then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [apiBase, period, outletFilter]);

  // Auto-refresh tiap 30 detik
  useEffect(() => {
    const id = setInterval(() => {
      const qs = new URLSearchParams({ period });
      if (outletFilter) qs.set("outlet", outletFilter);
      fetch(`${apiBase}/api/cinema/dashboard?${qs}`).then(r => r.json()).then(setData).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [apiBase, period, outletFilter]);

  if (loading && !data) return <div style={{ padding: 40, color: "#7d8590", textAlign: "center" }}>⏳ Loading dashboard...</div>;
  if (!data) return <div style={{ padding: 40, color: "#94a3b8", textAlign: "center" }}>Memuat data dashboard…</div>;

  const k = data.kpi || {};

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3", padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: "#a855f7", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>📊 CINEMA REPORTING</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, letterSpacing: -0.4 }}>Dashboard {outletFilter ? `· ${outletFilter}` : "All Outlets"}</div>
          <div style={{ fontSize: 12, color: "#7d8590", marginTop: 2 }}>Auto-refresh tiap 30 detik · last update: {new Date().toLocaleTimeString("id-ID")}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", padding: 4, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                style={{ background: period === p.key ? "rgba(168,85,247,0.2)" : "transparent", border: period === p.key ? "1px solid #a855f766" : "1px solid transparent", borderRadius: 7, padding: "7px 14px", color: period === p.key ? "#c084fc" : "#9ca3af", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {p.icon} {p.label}
              </button>
            ))}
          </div>
          <select value={outletFilter} onChange={e => setOutletFilter(e.target.value)}
            style={{ background: "#0a0e16", border: "1px solid #30363d", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontFamily: "inherit", outline: "none", minWidth: 180 }}>
            <option value="">🌐 All Outlets</option>
            {outlets.map(o => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 22 }}>
        <KpiCard label="REVENUE" value={rp(k.revenue)} sub={`${k.tickets} tiket`} color="#10b981" icon="💰" />
        <KpiCard label="TIKET TERJUAL" value={k.tickets || 0} sub={`${k.purchases} transaksi`} color="#fbbf24" icon="🎟️" />
        <KpiCard label="HARGA RATA-RATA" value={rp(k.avg_ticket_price)} sub="per tiket" color="#22d3ee" icon="📊" />
        <KpiCard label="SHOWTIME AKTIF" value={k.active_showtimes || 0} sub={period === "today" ? "hari ini" : `${period}`} color="#a855f7" icon="🗓️" />
      </div>

      {/* Two-column: by_outlet + top_films */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 22 }}>
        {/* Revenue by Outlet */}
        <Panel title="💼 Revenue per Outlet" color="#10b981">
          {data.by_outlet?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.by_outlet.map((o, i) => {
                const max = data.by_outlet[0].revenue;
                const pct = max > 0 ? (o.revenue / max) * 100 : 0;
                return (
                  <div key={o.outlet || i} style={{ background: "rgba(255,255,255,0.02)", padding: "10px 12px", borderRadius: 8, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "linear-gradient(90deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))" }} />
                    <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>{o.outlet || "—"}</div>
                        <div style={{ fontSize: 10.5, color: "#7d8590", fontFamily: "'Geist Mono',monospace" }}>{o.tickets} tiket</div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#10b981", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.3 }}>{rp(o.revenue)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Empty />}
        </Panel>

        {/* Top Films */}
        <Panel title="🎬 Top Films" color="#fbbf24">
          {data.top_films?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.top_films.slice(0, 6).map((f, i) => (
                <div key={f.id} style={{ display: "flex", gap: 10, padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? "#fbbf24" : i === 1 ? "#cbd5e1" : i === 2 ? "#d97706" : "#5b6470", fontFamily: "'Geist Mono',monospace", minWidth: 24, textAlign: "center" }}>#{i + 1}</div>
                  {f.poster_url ? (
                    <img src={f.poster_url} style={{ width: 30, height: 45, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 30, height: 45, background: "#1a1b1e", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>🎞️</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</div>
                    <div style={{ fontSize: 10.5, color: "#7d8590", fontFamily: "'Geist Mono',monospace", marginTop: 2 }}>{f.tickets} tiket · {f.avg_rating ? `★${f.avg_rating.toFixed(1)}` : "—"}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24", fontFamily: "'Geist Mono',monospace" }}>{rp(f.revenue)}</div>
                </div>
              ))}
            </div>
          ) : <Empty />}
        </Panel>
      </div>

      {/* Occupancy + payment method */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 22 }}>
        {/* Occupancy */}
        <Panel title="📊 Occupancy Showtime" color="#22d3ee">
          {data.occupancy?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {data.occupancy.map(o => {
                const c = o.occupancy_pct >= 80 ? "#ef4444" : o.occupancy_pct >= 50 ? "#fbbf24" : "#10b981";
                return (
                  <div key={o.id} style={{ display: "flex", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, alignItems: "center" }}>
                    <div style={{ minWidth: 90, fontSize: 11.5, fontFamily: "'Geist Mono',monospace", color: "#9ca3af" }}>
                      {o.show_date.slice(5)} {o.start_time}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.film_title || "—"}</div>
                      <div style={{ fontSize: 10, color: "#7d8590" }}>{o.outlet} · {o.studio_name}</div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ width: 140, position: "relative" }}>
                      <div style={{ background: "rgba(255,255,255,0.06)", height: 6, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ background: c, height: "100%", width: `${o.occupancy_pct}%`, transition: "width 0.3s" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#7d8590", marginTop: 3, fontFamily: "'Geist Mono',monospace" }}>
                        <span>{o.sold}/{o.capacity}</span>
                        <span style={{ color: c, fontWeight: 800 }}>{o.occupancy_pct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Empty />}
        </Panel>

        {/* Payment Method */}
        <Panel title="💳 Metode Bayar" color="#a855f7">
          {data.by_payment_method?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.by_payment_method.map(m => {
                const total = data.by_payment_method.reduce((s, x) => s + x.revenue, 0);
                const pct = total > 0 ? Math.round((m.revenue / total) * 100) : 0;
                const emoji = m.method === "cash" ? "💵" : m.method === "qris" ? "📲" : m.method === "debit" ? "💳" : m.method === "voucher" ? "🎟️" : "❓";
                return (
                  <div key={m.method} style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{emoji} {m.method.toUpperCase()}</span>
                      <span style={{ fontSize: 11.5, color: "#c084fc", fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{pct}%</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#7d8590", fontFamily: "'Geist Mono',monospace" }}>{m.count} tx · {rp(m.revenue)}</div>
                    <div style={{ marginTop: 4, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ background: "#a855f7", height: "100%", width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Empty />}
        </Panel>
      </div>

      {/* Bundles + Recent sales */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        {/* Bundles */}
        <Panel title="🍿 Top F&B Bundles" color="#ec4899">
          {data.bundles?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.bundles.map((b, i) => (
                <div key={b.bundle_name || i} style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ fontWeight: 700 }}>{b.bundle_name || "—"}</span>
                    <span style={{ color: "#ec4899", fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{b.sold}×</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#7d8590", marginTop: 2, fontFamily: "'Geist Mono',monospace" }}>{rp(b.revenue)}</div>
                </div>
              ))}
            </div>
          ) : <Empty />}
        </Panel>

        {/* Recent Sales */}
        <Panel title="📋 Recent Sales" color="#fbbf24">
          {data.recent_sales?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
              {data.recent_sales.map(t => (
                <div key={t.id} style={{ display: "flex", gap: 10, padding: "6px 10px", fontSize: 11.5, background: "rgba(255,255,255,0.02)", borderRadius: 6, alignItems: "center" }}>
                  <span style={{ minWidth: 60, color: "#7d8590", fontFamily: "'Geist Mono',monospace" }}>{fmtTime(t.sold_at)}</span>
                  <span style={{ minWidth: 50, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 800 }}>{t.seat}</span>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.film_title || "—"}</span>
                  <span style={{ minWidth: 60, color: "#7d8590", fontSize: 10 }}>{t.outlet}</span>
                  <span style={{ minWidth: 70, fontFamily: "'Geist Mono',monospace", color: "#10b981", fontWeight: 700, textAlign: "right" }}>{rp(t.price)}</span>
                </div>
              ))}
            </div>
          ) : <Empty />}
        </Panel>
      </div>

      <HelpButton helpKey="pos-cinema" position="bottom-right" />
    </div>
  );
}

function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${color}11, rgba(255,255,255,0.02))`, border: `1px solid ${color}33`, borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 8, right: 12, fontSize: 24, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 10, color, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5, lineHeight: 1, fontFamily: "'Geist Mono',monospace" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#7d8590", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Panel({ title, color, children }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color, marginBottom: 12, letterSpacing: -0.2 }}>{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <div style={{ padding: 30, textAlign: "center", color: "#5b6470", fontSize: 12 }}>Belum ada data di periode ini</div>;
}
