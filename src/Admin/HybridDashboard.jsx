// karyaOS — Hybrid Dashboard
// Untuk company dengan primary_vertical='hybrid' (jalankan F&B + Cinema sekaligus).
// Tab selector: [Combined | F&B | Cinema] — combined view = unified KPI gabungan.
//
// Reuse OwnerDashboard (F&B) + CinemaOwnerDashboard (Cinema) as sub-views.

import { lazy, Suspense, useEffect, useState } from "react";

const OwnerDashboard       = lazy(() => import("./OwnerDashboard.jsx"));
const CinemaOwnerDashboard = lazy(() => import("./CinemaOwnerDashboard.jsx"));

import { fmtMoney as rp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";
const PALETTE = {
  card: "rgba(255,255,255,0.025)", border: "rgba(255,255,255,0.06)",
  amber: "#fbbf24", purple: "#a855f7", cyan: "#22d3ee", green: "#10b981",
  orange: "#f97316", text: "#e6edf3", sub: "rgba(255,255,255,0.55)", dim: "rgba(255,255,255,0.35)",
};

export default function HybridDashboard({ apiBase = "", onNavigate }) {
  const [tab, setTab] = useState("combined"); // combined | fnb | cinema
  const [combined, setCombined] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load combined KPI dari platform endpoint (super-admin gak butuh, tapi
  // untuk hybrid company kita pakai per-company filter via headers auto)
  useEffect(() => {
    if (tab !== "combined") return;
    setLoading(true);
    // Pakai dashboard cinema endpoint untuk cinema KPI
    Promise.all([
      fetch(`${apiBase}/api/orders`).then(r => r.json()).catch(() => []),
      fetch(`${apiBase}/api/cinema/dashboard?period=month`).then(r => r.json()).catch(() => null),
    ]).then(([orders, cinema]) => {
      // Hitung today vs month
      const now = Date.now();
      const dayAgo = now - 86400 * 1000;
      const monthAgo = now - 30 * 86400 * 1000;
      const fnbList = Array.isArray(orders) ? orders : [];
      const fnbToday = fnbList.filter(o => o.time > dayAgo);
      const fnbMonth = fnbList.filter(o => o.time > monthAgo);
      const sum = (arr, k) => arr.reduce((s, o) => s + (o[k] || 0), 0);
      setCombined({
        fnb: {
          today: { count: fnbToday.length, revenue: sum(fnbToday, "total") },
          month: { count: fnbMonth.length, revenue: sum(fnbMonth, "total") },
        },
        cinema: {
          today: { count: 0, revenue: 0 }, // dashboard period=today gak tersedia disini, simplify
          month: { count: cinema?.kpi?.tickets || 0, revenue: cinema?.kpi?.revenue || 0 },
        },
      });
    }).finally(() => setLoading(false));
  }, [apiBase, tab]);

  return (
    <div style={{ color: PALETTE.text, fontFamily: "'Inter',sans-serif" }}>
      {/* Header + Tab selector */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>🔀 Hybrid Dashboard</div>
          <span style={{ padding: "3px 10px", background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 999, fontSize: 11, color: PALETTE.cyan, fontWeight: 800, letterSpacing: 1 }}>F&B + CINEMA</span>
        </div>
        <div style={{ fontSize: 12, color: PALETTE.sub, marginBottom: 14 }}>Company with dual vertical — switch view or lihat combined.</div>
        <div style={{ display: "inline-flex", gap: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: 3 }}>
          {[
            { v: "combined", l: "📊 Combined", c: PALETTE.cyan },
            { v: "fnb",      l: "🍔 F&B",      c: PALETTE.orange },
            { v: "cinema",   l: "🎬 Cinema",   c: PALETTE.purple },
          ].map(t => (
            <button key={t.v} onClick={() => setTab(t.v)}
              style={{
                padding: "9px 18px", background: tab === t.v ? `${t.c}22` : "transparent",
                color: tab === t.v ? t.c : PALETTE.sub,
                border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit", letterSpacing: 0.3,
              }}>{t.l}</button>
          ))}
        </div>
      </div>

      {tab === "fnb" && (
        <Suspense fallback={<Loading />}>
          <OwnerDashboard apiBase={apiBase} onNavigate={onNavigate} />
        </Suspense>
      )}
      {tab === "cinema" && (
        <Suspense fallback={<Loading />}>
          <CinemaOwnerDashboard apiBase={apiBase} onNavigate={onNavigate} />
        </Suspense>
      )}
      {tab === "combined" && (
        <CombinedView loading={loading} data={combined} />
      )}
    </div>
  );
}

function CombinedView({ loading, data }) {
  if (loading) return <Loading />;
  if (!data) return <div style={{ color: PALETTE.dim, padding: 30, textAlign: "center" }}>Failed to load data combined.</div>;

  const totalRevToday = (data.fnb.today.revenue || 0) + (data.cinema.today.revenue || 0);
  const totalRevMonth = (data.fnb.month.revenue || 0) + (data.cinema.month.revenue || 0);
  const totalTxToday  = (data.fnb.today.count || 0) + (data.cinema.today.count || 0);
  const fnbPct  = totalRevMonth > 0 ? Math.round(data.fnb.month.revenue / totalRevMonth * 100) : 0;
  const cinemaPct = totalRevMonth > 0 ? Math.round(data.cinema.month.revenue / totalRevMonth * 100) : 0;

  return (
    <>
      {/* Top-line KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 20 }}>
        <KPI label="💰 Revenue Today" value={rp(totalRevToday)} color={PALETTE.green} sub="F&B + Cinema" />
        <KPI label="📈 Revenue 30 Days" value={rp(totalRevMonth)} color={PALETTE.cyan} sub="combined" />
        <KPI label="🛒 Transaction Today" value={totalTxToday} color={PALETTE.purple} sub="F&B + Cinema" />
        <KPI label="🍔 vs 🎬" value={`${fnbPct}% / ${cinemaPct}%`} color={PALETTE.amber} sub="F&B vs Cinema split" />
      </div>

      {/* Side-by-side breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <VerticalCard
          title="🍔 F&B" color={PALETTE.orange}
          today={data.fnb.today} month={data.fnb.month}
          unitLabel="orders"
        />
        <VerticalCard
          title="🎬 Cinema" color={PALETTE.purple}
          today={data.cinema.today} month={data.cinema.month}
          unitLabel="tickets"
        />
      </div>

      {/* Revenue split bar */}
      <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: PALETTE.amber, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", marginBottom: 10 }}>📊 30-DAY REVENUE SPLIT</div>
        <div style={{ display: "flex", height: 32, borderRadius: 8, overflow: "hidden", border: `1px solid ${PALETTE.border}` }}>
          <div style={{
            width: `${fnbPct}%`, background: `linear-gradient(90deg, ${PALETTE.orange}, #fdba74)`,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
            fontFamily: "'Geist Mono',monospace", fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
          }}>{fnbPct > 8 ? `F&B ${fnbPct}%` : ""}</div>
          <div style={{
            width: `${cinemaPct}%`, background: `linear-gradient(90deg, ${PALETTE.purple}, #c084fc)`,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
            fontFamily: "'Geist Mono',monospace", fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
          }}>{cinemaPct > 8 ? `Cinema ${cinemaPct}%` : ""}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: PALETTE.sub, fontFamily: "'Geist Mono',monospace" }}>
          <span>F&B {rp(data.fnb.month.revenue)} · {data.fnb.month.count} orders</span>
          <span>Cinema {rp(data.cinema.month.revenue)} · {data.cinema.month.count} tickets</span>
        </div>
      </div>
    </>
  );
}

function KPI({ label, value, color, sub }) {
  return (
    <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: PALETTE.sub, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: PALETTE.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function VerticalCard({ title, color, today, month, unitLabel }) {
  return (
    <div style={{ background: PALETTE.card, border: `1px solid ${color}33`, borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color, marginBottom: 12, letterSpacing: -0.3 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 9.5, color: PALETTE.sub, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 4 }}>HARI INI</div>
          <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5 }}>{rp(today?.revenue)}</div>
          <div style={{ fontSize: 11, color: PALETTE.dim, marginTop: 2 }}>{today?.count || 0} {unitLabel}</div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, color: PALETTE.sub, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 4 }}>30 HARI</div>
          <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5 }}>{rp(month?.revenue)}</div>
          <div style={{ fontSize: 11, color: PALETTE.dim, marginTop: 2 }}>{month?.count || 0} {unitLabel}</div>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return <LoadingState label="Memuat…" />;
}
