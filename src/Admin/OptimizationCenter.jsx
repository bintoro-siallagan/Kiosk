import { useState, useEffect } from "react";

// KaryaOS Stage 5 (Optimization) — pattern/anomaly detection + benchmark tracking.
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const C = { card: "#0d1117", border: "#1b212c", sub: "#7d8590", dim: "#5b6470" };

export default function OptimizationCenter({ apiBase }) {
  const [trend, setTrend] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${apiBase}/api/finance/revenue-trend`).then(r => r.json()).catch(() => null),
      fetch(`${apiBase}/api/outlet-master`).then(r => r.json()).catch(() => null),
    ]).then(([t, o]) => {
      setTrend(t && Array.isArray(t.points) ? t.points : []);
      setOutlets(o && Array.isArray(o.outlets) ? o.outlets : []);
      setLoading(false);
    });
  }, [apiBase]);

  // ── Anomaly detection — flag days beyond ±2σ from the 30-day mean ──
  const series = (trend || []).map(p => p.revenue || 0);
  const mean = series.length ? series.reduce((a, b) => a + b, 0) / series.length : 0;
  const sd = series.length ? Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length) : 0;
  const anomalies = (trend || [])
    .map(p => ({ ...p, dev: sd ? (p.revenue - mean) / sd : 0 }))
    .filter(p => sd > 0 && Math.abs(p.dev) >= 2)
    .sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));

  // ── Benchmark — outlets vs internal average ──
  const oRev = outlets.map(o => o.revenue_today || 0);
  const avg = oRev.length ? oRev.reduce((a, b) => a + b, 0) / oRev.length : 0;
  const best = Math.max(1, ...oRev);
  const ranked = [...outlets]
    .map(o => ({ ...o, gap: avg ? ((o.revenue_today || 0) - avg) / avg * 100 : 0 }))
    .sort((a, b) => (b.revenue_today || 0) - (a.revenue_today || 0));
  const opportunities = ranked.filter(o => o.gap <= -20);

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>📈 Optimization Center</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>KaryaOS Tahap 5 — Optimization · deteksi pola &amp; benchmark</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Stat label="Anomali terdeteksi" value={anomalies.length} color={anomalies.length ? "#eab308" : "#10b981"} />
          <Stat label="Rata-rata harian" value={rp(mean)} color="#22d3ee" />
          <Stat label="Peluang optimasi" value={opportunities.length} color={opportunities.length ? "#f97316" : "#10b981"} />
        </div>
      </div>

      {loading ? <div style={{ color: C.dim, fontSize: 13, padding: "24px 0" }}>Memuat…</div> : (
        <>
          {/* Anomaly detection */}
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>
            DETEKSI ANOMALI — REVENUE ±2σ <span style={{ color: C.dim }}>· {(trend || []).length} hari · σ {rp(sd)}</span>
          </div>
          {anomalies.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "22px 18px", textAlign: "center", color: C.sub, fontSize: 13, marginBottom: 22 }}>
              ✅ None anomali — semua hari dalam rentang normal (±2σ).
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
              {anomalies.map(a => {
                const spike = a.dev > 0;
                return (
                  <div key={a.date} style={{ background: C.card, border: `1px solid ${spike ? "#10b98144" : "#ef444444"}`, borderRadius: 12, padding: "11px 14px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 20 }}>{spike ? "📈" : "📉"}</div>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{spike ? "Lonjakan" : "Penurunan"} revenue</div>
                      <div style={{ fontSize: 11.5, color: C.sub, fontFamily: "'Geist Mono',monospace", marginTop: 2 }}>{a.date} · {a.orders || 0} order</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 700 }}>{rp(a.revenue)}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: spike ? "#10b981" : "#ef4444", marginTop: 2 }}>
                        {a.dev > 0 ? "+" : ""}{a.dev.toFixed(1)}σ dari rata-rata
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Benchmark */}
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>
            BENCHMARK OUTLET <span style={{ color: C.dim }}>· rata-rata {rp(avg)}</span>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "6px 14px" }}>
            {ranked.length === 0 ? <div style={{ color: C.sub, fontSize: 13, padding: "16px 0" }}>No data yet outlet.</div> : ranked.map((o, i) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < ranked.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ width: 22, fontFamily: "'Geist Mono',monospace", fontSize: 12, color: C.dim }}>#{i + 1}</div>
                <div style={{ width: 130, flexShrink: 0, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</div>
                <div style={{ flex: 1, minWidth: 80, height: 8, background: "#161b22", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.max(2, (o.revenue_today || 0) / best * 100)}%`, background: o.gap <= -20 ? "#f97316" : o.gap >= 0 ? "#10b981" : "#22d3ee", borderRadius: 4 }} />
                </div>
                <div style={{ width: 96, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12 }}>{rp(o.revenue_today)}</div>
                <div style={{ width: 80, textAlign: "right", fontSize: 11, fontWeight: 700, color: o.gap >= 0 ? "#10b981" : o.gap <= -20 ? "#f97316" : C.sub }}>
                  {o.gap >= 0 ? "+" : ""}{o.gap.toFixed(0)}% {o.gap <= -20 ? "⚠" : ""}
                </div>
              </div>
            ))}
          </div>
          {opportunities.length > 0 && (
            <div style={{ marginTop: 12, background: "#f9731612", border: "1px solid #f9731633", borderRadius: 12, padding: "12px 14px", fontSize: 12.5, color: "#fdba74" }}>
              💡 <b>{opportunities.length} outlet</b> di bawah −20% benchmark — peluang optimasi: {opportunities.map(o => o.name).join(", ")}.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 92 }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 17, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5, marginTop: 1 }}>{label}</div>
    </div>
  );
}
