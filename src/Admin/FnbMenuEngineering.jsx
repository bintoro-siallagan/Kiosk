// karyaOS — Menu Engineering Matrix (Star / Plowhorse / Puzzle / Dog)
import { useState, useEffect, useCallback } from "react";
import { EmptyState, LoadingSkeleton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
import { fmtMoney as rp } from "../lib/currency.js";
const Q = {
  star:      { label: "⭐ Star",      color: "#10b981", desc: "High popularity + High margin — promosikan, ini bintang menu." },
  plowhorse: { label: "🐎 Plowhorse", color: "#f59e0b", desc: "High popularity + Low margin — naikkan harga or turunkan food cost." },
  puzzle:    { label: "🧩 Puzzle",    color: "#22d3ee", desc: "Low popularity + High margin — promo, pindah posisi menu, rebranding." },
  sleeper:   { label: "💤 Sleeper",   color: "#94a3b8", desc: "Low popularity + Low margin — review: tingkatkan promo or pertimbangkan retire." },
};

export default function FnbMenuEngineering({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState("30d");
  const load = useCallback(async () => {
    const now = new Date(); now.setHours(0,0,0,0);
    const days = period === "7d" ? 7 : period === "ytd" ? Math.ceil((now - new Date(now.getFullYear(),0,1))/86400000) : 30;
    const from = new Date(now.getTime() - (days-1)*86400000).toISOString().slice(0,10);
    const to = now.toISOString().slice(0,10);
    const d = await fetch(`${base}/analytics/menu-engineering?from=${from}&to=${to}`).then(r => r.json());
    setData(d);
  }, [base, period]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div style={{ padding: 16 }}><LoadingSkeleton rows={5} height={48} /></div>;
  const t = data.summary || {};
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>📊 Menu Engineering Matrix</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Classify menu items: popularity × margin → strategic action.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["7d", "7 day"], ["30d", "30 day"], ["ytd", "YTD"]].map(([v, l]) => (
            <button key={v} onClick={() => setPeriod(v)} style={{ background: period === v ? "#a855f72a" : "transparent", border: `1px solid ${period === v ? "#a855f766" : C.border}`, borderRadius: 8, padding: "7px 14px", color: period === v ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
        {Object.entries(Q).map(([k, v]) => (
          <div key={k} style={{ background: C.card, border: `2px solid ${v.color}55`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, color: v.color, fontWeight: 700, letterSpacing: 1, fontFamily: "'Geist Mono',monospace" }}>{v.label}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: v.color, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{t[k] || 0}</div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 6, lineHeight: 1.45 }}>{v.desc}</div>
          </div>
        ))}
      </div>
      {(!data.rows || data.rows.length === 0) ? (
        <EmptyState icon="📊" title="Data analisa belum tersedia"
          desc="Pastikan menu_items + order_items table sudah ada with field food_cost & price, and ada penjualan di periode pilihan." />
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", color: C.dim, fontSize: 11, letterSpacing: 1, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, gap: 10 }}>
            <span style={{ flex: 1.4 }}>MENU ITEM</span>
            <span style={{ width: 110 }}>QUADRANT</span>
            <span style={{ width: 80, textAlign: "right" }}>QTY</span>
            <span style={{ width: 100, textAlign: "right" }}>POP RATIO</span>
            <span style={{ width: 90, textAlign: "right" }}>MARGIN%</span>
            <span style={{ width: 120, textAlign: "right" }}>REVENUE</span>
          </div>
          {data.rows.map(r => {
            const q = Q[r.quadrant] || Q.sleeper;
            return (
              <div key={r.menu_item_id} style={{ display: "flex", padding: "9px 14px", borderBottom: `1px solid ${C.border}`, gap: 10, alignItems: "center" }}>
                <span style={{ flex: 1.4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{r.category} · {rp(r.price)} (food cost {rp(r.food_cost)})</div>
                </span>
                <span style={{ width: 110 }}><span style={{ background: q.color + "22", color: q.color, padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{q.label}</span></span>
                <span style={{ width: 80, textAlign: "right", fontFamily: "'Geist Mono',monospace" }}>{r.qty_sold}</span>
                <span style={{ width: 100, textAlign: "right", fontFamily: "'Geist Mono',monospace", color: r.popularity_ratio >= 1 ? "#10b981" : "#ef4444" }}>{r.popularity_ratio}×</span>
                <span style={{ width: 90, textAlign: "right", fontFamily: "'Geist Mono',monospace", color: r.margin_pct >= 65 ? "#10b981" : "#ef4444" }}>{r.margin_pct}%</span>
                <span style={{ width: 120, textAlign: "right", fontFamily: "'Geist Mono',monospace", color: "#a855f7", fontWeight: 700 }}>{rp(r.revenue)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
