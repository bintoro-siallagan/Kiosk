// src/Admin/AdminMarketingBehavior.jsx
// Customer Behavior + Product Analytics — jam/hari favorit, channel,
// best-seller, slow-moving, upselling.

import { useState, useEffect, useCallback } from "react";

import { fmtMoney as fmtRp } from "../lib/currency.js";
const AC = "#22d3ee";

export default function AdminMarketingBehavior({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/marketing-behavior`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Behavior Analytics…</div>;
  const s = d.summary;
  const maxHour = Math.max(1, ...d.by_hour);
  const maxDay = Math.max(1, ...d.by_day.map(x => x.count));
  const ch = d.by_channel, ty = d.by_type;
  const chTotal = ch.cashier + ch.kiosk + ch.qr || 1;
  const tyTotal = ty.dinein + ty.takeaway || 1;
  const maxSell = Math.max(1, ...d.best_seller.map(m => m.qty));

  return (
    <div>
      <div style={S.intro}>
        📊 <b style={{ color: AC }}>CUSTOMER BEHAVIOR &amp; PRODUCT</b> — jam &amp; hari favorit, channel
        (cashier/kiosk/QR), dine-in vs takeaway, best-seller, slow-moving &amp; upselling. 🔥 ini GOLD buat marketing.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Order" v={s.total_orders.toLocaleString("id-ID")} c={AC} />
        <Kpi label="Avg Spending" v={fmtRp(s.avg_spending)} c="#fbbf24" />
        <Kpi label="Upsell Rate" v={s.upsell_rate + "%"} c="#10b981" sub="order pakai add-on" />
        <Kpi label="Peak" v={`${String(s.peak_hour).padStart(2, "0")}:00`} c="#f59e0b" sub={`day ${s.peak_day}`} />
      </div>

      {/* Jam favorit */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🕐 JAM DATANG FAVORIT</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 110, marginTop: 12 }}>
          {d.by_hour.map((v, h) => (
            <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{ width: "100%", height: Math.round(v / maxHour * 80) + 4, background: h === s.peak_hour ? "#f59e0b" : AC + "99", borderRadius: 3 }} title={`${h}:00 — ${v} order`} />
              <span style={{ fontSize: 8, color: h === s.peak_hour ? "#f59e0b" : "#5b6470" }}>{h}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hari favorit */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📅 HARI FAVORIT</div>
        {d.by_day.map((x, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
            <span style={{ width: 70, fontSize: 12, color: "#9da7b3" }}>{x.day}</span>
            <div style={{ flex: 1, height: 12, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: Math.round(x.count / maxDay * 100) + "%", background: x.day === s.peak_day ? "#f59e0b" : AC }} />
            </div>
            <span style={{ width: 36, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{x.count}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div style={S.card}>
          <div style={S.kicker}>📲 CHANNEL ORDER</div>
          {[["Cashier", ch.cashier, "#3b82f6"], ["Kiosk", ch.kiosk, "#a855f7"], ["QR Order", ch.qr, "#10b981"]].map(([n, v, c]) => (
            <Row key={n} label={n} v={v} pct={Math.round(v / chTotal * 100)} c={c} />
          ))}
        </div>
        <div style={S.card}>
          <div style={S.kicker}>🍽️ DINE-IN vs TAKEAWAY</div>
          {[["Dine-in", ty.dinein, "#fbbf24"], ["Takeaway", ty.takeaway, "#22d3ee"]].map(([n, v, c]) => (
            <Row key={n} label={n} v={v} pct={Math.round(v / tyTotal * 100)} c={c} />
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        <div style={S.card}>
          <div style={S.kicker}>🏆 BEST SELLER</div>
          {d.best_seller.map((m, i) => (
            <div key={i} style={{ padding: "7px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: "#e6edf3", fontWeight: 600 }}>{i + 1}. {m.name}</span>
                <span style={{ color: "#9da7b3", fontFamily: "'Geist Mono',monospace" }}>{m.qty}× · {fmtRp(m.revenue)}</span>
              </div>
              <div style={{ height: 6, background: "#0a0e16", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(m.qty / maxSell * 100) + "%", background: AC }} />
              </div>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <div style={{ ...S.kicker, color: "#f59e0b" }}>🐢 SLOW MOVING</div>
          {d.slow_moving.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "7px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
              <span style={{ color: "#9da7b3" }}>{m.name}</span>
              <span style={{ color: "#f59e0b", fontFamily: "'Geist Mono',monospace" }}>{m.qty}×</span>
            </div>
          ))}
          <div style={{ fontSize: 10, color: "#5b6470", marginTop: 8 }}>Kandidat promo bundling / evaluasi menu.</div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, v, pct, c }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
      <span style={{ width: 90, fontSize: 12, color: "#9da7b3" }}>{label}</span>
      <div style={{ flex: 1, height: 14, background: "#0a0e16", borderRadius: 7, overflow: "hidden" }}>
        <div style={{ height: "100%", width: pct + "%", background: c }} />
      </div>
      <span style={{ width: 78, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{v} · {pct}%</span>
    </div>
  );
}
function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
};
