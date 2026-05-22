// src/Admin/AdminDemandForecast.jsx
// Demand Forecast — proyeksi permintaan penjualan.

import { useState, useEffect, useCallback } from "react";

const AC = "#0284c7";
const CAT_C = { "Frozen Yogurt": "#ec4899", Beverage: "#3b82f6", Topping: "#f59e0b", Signature: "#a855f7" };

export default function AdminDemandForecast({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/demand-forecast`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const regen = () => {
    fetch(`${apiBase}/api/demand-forecast/regenerate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ Forecast di-regenerate"); load(); } }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Demand Forecast…</div>;
  const s = d.summary;
  const maxF = Math.max(1, ...d.forecasts.map(f => f.forecast_7d));

  return (
    <div>
      <div style={S.intro}>
        📈 <b style={{ color: "#38bdf8" }}>DEMAND FORECAST</b> — proyeksi permintaan penjualan 7 hari ke
        depan. Dasar perencanaan procurement &amp; produksi biar stok pas — gak over, gak kehabisan.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Forecast Demand 7 Hari" v={s.total_demand_7d.toLocaleString("id-ID") + " unit"} c={AC} />
        <Kpi label="Produk Naik" v={String(s.growing)} c="#10b981" />
        <Kpi label="Produk Turun" v={String(s.declining)} c="#ef4444" />
        <Kpi label="Avg Confidence" v={s.avg_confidence + "%"} c="#a855f7" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: "#10b981" }}>{msg}</div> : null}

      {s.top_growth && (
        <div style={{ ...S.card, marginTop: 14, borderColor: "#10b98144" }}>
          <div style={{ fontSize: 13, color: "#9da7b3" }}>
            🚀 <b style={{ color: "#34d399" }}>Pertumbuhan tertinggi:</b> {s.top_growth.product_name} —
            tren <b style={{ color: "#34d399" }}>+{s.top_growth.trend_pct}%</b>, forecast {s.top_growth.forecast_7d} unit/minggu.
            Rekomendasi: tingkatkan produksi & amankan stok bahan baku.
          </div>
        </div>
      )}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={S.kicker}>📊 FORECAST PER PRODUK</span>
          <button onClick={regen} style={S.btn}>🔄 Regenerate</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["PRODUK", "KATEGORI", "AVG/HARI", "TREN", "FORECAST 7HR", "CONF.", "REKOMENDASI"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.forecasts.map(f => (
              <tr key={f.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{f.product_name}</td>
                <td style={S.td}><span style={{ fontSize: 10, fontWeight: 700, color: CAT_C[f.category] || "#9ca3af" }}>{f.category}</span></td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{f.avg_daily}</td>
                <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: f.trend_pct >= 0 ? "#34d399" : "#f87171" }}>
                  {f.trend_pct >= 0 ? "▲ +" : "▼ "}{f.trend_pct}%
                </td>
                <td style={S.td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 70, height: 6, background: "#161b22", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: Math.round(f.forecast_7d / maxF * 100) + "%", background: AC }} />
                    </div>
                    <span style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#38bdf8" }}>{f.forecast_7d}</span>
                  </div>
                </td>
                <td style={{ ...S.td, ...S.mono, color: f.confidence >= 85 ? "#34d399" : "#f59e0b" }}>{f.confidence}%</td>
                <td style={{ ...S.td, fontSize: 11, color: "#9da7b3" }}>{f.recommended_action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "8px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
  btn: { background: "#0284c720", border: "1px solid #0284c755", color: "#38bdf8", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
