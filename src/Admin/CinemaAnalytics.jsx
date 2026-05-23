// karyaOS — Cinema Analytics (Movie Performance + Occupancy + Attach Rate + AI Insights)
// 4 tabs untuk membaca performa film, jam ramai, attach rate F&B, dan insight AI-style.
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const TIME_BAND_LABEL = { morning: "🌅 Pagi <12h", matinee: "☀️ Matinee 12-17h", prime: "🌆 Prime 17-21h", late: "🌙 Late ≥21h" };
const TABS = [
  ["movies",   "🎬 Film Performance"],
  ["occupancy", "📊 Okupansi"],
  ["attach",    "🍿 Attach Rate"],
  ["insights",  "✨ AI Insights"],
];

export default function CinemaAnalytics({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [tab, setTab] = useState("movies");
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>📊 Cinema Analytics</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Movie performance · okupansi per jam &amp; hari · F&amp;B attach rate · AI insights.</div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ background: tab === id ? "#a855f72a" : "transparent", border: `1px solid ${tab === id ? "#a855f766" : C.border}`, borderRadius: 8, padding: "8px 14px", color: tab === id ? "#fff" : C.sub, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>
      {tab === "movies"    && <MoviesTab base={base} />}
      {tab === "occupancy" && <OccupancyTab base={base} />}
      {tab === "attach"    && <AttachRateTab base={base} />}
      {tab === "insights"  && <InsightsTab base={base} />}
    </div>
  );
}

function MoviesTab({ base }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => fetch(`${base}/analytics/movies`).then(r => r.json()).then(setData).catch(() => {}), [base]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <Empty>Memuat…</Empty>;
  const max = Math.max(1, ...(data.rows || []).map(r => r.revenue));
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, fontFamily: "'Geist Mono',monospace" }}>{data.from} → {data.to}</div>
      {data.rows.map((r, i) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: i < data.rows.length - 1 ? `1px solid ${C.border}` : "none", flexWrap: "wrap" }}>
          <span style={{ width: 26, fontFamily: "'Geist Mono',monospace", fontSize: 12, color: C.dim }}>#{i + 1}</span>
          <span style={{ width: 200, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span>
          <span style={{ width: 90, fontSize: 11, color: C.sub }}>{r.genre || "—"}</span>
          <div style={{ flex: 1, minWidth: 100, height: 8, background: "#161b22", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max(2, (r.revenue || 0) / max * 100)}%`, background: "#a855f7", borderRadius: 4 }} />
          </div>
          <span style={{ width: 60, fontFamily: "'Geist Mono',monospace", textAlign: "right", fontSize: 12 }}>{r.tickets}</span>
          {r.avg_rating ? <span style={{ width: 70, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontSize: 12 }}>★ {r.avg_rating}</span> : <span style={{ width: 70 }} />}
          <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", textAlign: "right", color: "#10b981", fontWeight: 700, fontSize: 12.5 }}>{rp(r.revenue)}</span>
        </div>
      ))}
    </div>
  );
}

function OccupancyTab({ base }) {
  const [data, setData] = useState(null);
  useEffect(() => { fetch(`${base}/analytics/occupancy`).then(r => r.json()).then(setData).catch(() => {}); }, [base]);
  if (!data) return <Empty>Memuat…</Empty>;
  const maxBand = Math.max(1, ...(data.by_time_band || []).map(r => r.tickets));
  const maxDow  = Math.max(1, ...(data.by_day_of_week || []).map(r => r.tickets));
  return (
    <>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>PER TIME-BAND (30 hari)</div>
        {data.by_time_band.map(r => {
          const occ = r.capacity ? Math.round(r.tickets * 100 / r.capacity) : 0;
          return (
            <div key={r.time_band} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid #1f2937` }}>
              <span style={{ width: 180, fontSize: 13 }}>{TIME_BAND_LABEL[r.time_band] || r.time_band}</span>
              <div style={{ flex: 1, minWidth: 100, height: 8, background: "#161b22", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.max(2, r.tickets / maxBand * 100)}%`, background: occ >= 70 ? "#10b981" : occ >= 40 ? "#fbbf24" : "#ef4444", borderRadius: 4 }} />
              </div>
              <span style={{ width: 80, fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>{r.tickets} tkt</span>
              <span style={{ width: 60, fontFamily: "'Geist Mono',monospace", fontSize: 12, color: C.sub }}>{occ}%</span>
              <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", textAlign: "right", fontSize: 12, color: "#10b981" }}>{rp(r.revenue)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>PER HARI (30 hari)</div>
        {data.by_day_of_week.map(r => (
          <div key={r.dow} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid #1f2937` }}>
            <span style={{ width: 100, fontSize: 13, fontWeight: 700 }}>{DAY_NAMES[r.dow] || r.dow}</span>
            <div style={{ flex: 1, minWidth: 100, height: 8, background: "#161b22", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(2, r.tickets / maxDow * 100)}%`, background: "#22d3ee", borderRadius: 4 }} />
            </div>
            <span style={{ width: 80, fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>{r.tickets} tkt</span>
            <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", textAlign: "right", fontSize: 12, color: "#10b981" }}>{rp(r.revenue)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function AttachRateTab({ base }) {
  const [data, setData] = useState(null);
  useEffect(() => { fetch(`${base}/analytics/attach-rate`).then(r => r.json()).then(setData).catch(() => {}); }, [base]);
  if (!data) return <Empty>Memuat…</Empty>;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
        <Stat label="Attach rate" value={`${data.attach_rate}%`} color={data.attach_rate >= 50 ? "#10b981" : data.attach_rate >= 30 ? "#fbbf24" : "#ef4444"} big />
        <Stat label="Total pembelian" value={data.total_purchases} color="#22d3ee" big />
        <Stat label="Dengan F&B" value={data.with_bundles} color="#f59e0b" big />
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>ATTACH RATE PER GENRE</div>
        {data.by_genre.map(r => (
          <div key={r.genre} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0", borderBottom: `1px solid #1f2937` }}>
            <span style={{ width: 180, fontSize: 13 }}>{r.genre}</span>
            <div style={{ flex: 1, height: 6, background: "#161b22", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(2, r.attach_rate)}%`, background: r.attach_rate >= 50 ? "#10b981" : r.attach_rate >= 30 ? "#fbbf24" : "#ef4444", borderRadius: 3 }} />
            </div>
            <span style={{ width: 80, fontFamily: "'Geist Mono',monospace", fontSize: 12, textAlign: "right" }}>{r.attach_rate}%</span>
            <span style={{ width: 90, fontFamily: "'Geist Mono',monospace", fontSize: 11, color: C.sub, textAlign: "right" }}>{r.with_bundle}/{r.purchases}</span>
          </div>
        ))}
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>TOP 10 COMBO TERLARIS</div>
        {data.top_combos.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0", borderBottom: i < data.top_combos.length - 1 ? `1px solid #1f2937` : "none" }}>
            <span style={{ width: 26, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>#{i + 1}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{r.bundle_name}</span>
            <span style={{ width: 80, fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>{r.times_ordered}× </span>
            <span style={{ width: 90, fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>{r.total_qty} qty</span>
            <span style={{ width: 110, textAlign: "right", color: "#10b981", fontFamily: "'Geist Mono',monospace", fontSize: 12.5, fontWeight: 700 }}>{rp(r.revenue)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function InsightsTab({ base }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    fetch(`${base}/analytics/insights`).then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [base]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <Empty>Memuat insight…</Empty>;
  if (!data?.insights?.length) return <Empty>Tidak ada insight signifikan saat ini.</Empty>;
  const COLOR = { good: "#10b981", warn: "#f59e0b", info: "#22d3ee", bad: "#ef4444" };
  const ICON  = { trending_up: "📈", trending_down: "📉", low_occupancy: "⚠️", top_combo: "🏆", peak_band: "🎯" };
  return (
    <>
      <div style={{ marginBottom: 12, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>
        ⚡ {data.insights.length} insight · {new Date(data.generated_at * 1000).toLocaleString("id-ID")}
        <button onClick={load} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.sub, padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginLeft: 10 }}>↻ Refresh</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 10 }}>
        {data.insights.map((ins, i) => {
          const col = COLOR[ins.severity] || "#22d3ee";
          return (
            <div key={i} style={{ background: C.card, border: `1px solid ${col}55`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{ICON[ins.type] || "💡"}</div>
              {ins.title && <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{ins.title}</div>}
              <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.5 }}>{ins.message}</div>
              <div style={{ fontSize: 10, color: C.dim, marginTop: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>{ins.type.toUpperCase()}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Stat({ label, value, color, big }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: big ? 14 : 10, textAlign: "center" }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: big ? 22 : 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}
function Empty({ children }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "30px 14px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
