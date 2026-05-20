/**
 * AdminCashierKPI.jsx — KPI Kasir: performa transaksi + rating customer.
 * Tab di AdminTools. Endpoint: /api/cashier-kpi
 *
 * Props: apiBase — HOST backend.
 */
import { useState, useEffect, useCallback } from "react";

const fR = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const DAY = 86400;

const S = {
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 14, padding: 18, marginBottom: 14 },
  label: { fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, fontFamily: "'Space Mono',monospace" },
  btn: (active, color = "#34D399") => ({
    background: active ? color + "22" : "transparent",
    border: `1px solid ${active ? color + "66" : "#21262d"}`,
    borderRadius: 8, padding: "8px 16px", color: active ? color : "#888",
    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  }),
  grid4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 },
};

const scoreColor = (s) => s == null ? "#6b7280" : s >= 80 ? "#34D399" : s >= 60 ? "#FBBF24" : "#F87171";

function Stars({ value }) {
  return (
    <span style={{ letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ color: n <= Math.round(value || 0) ? "#F59E0B" : "#30363d" }}>★</span>
      ))}
    </span>
  );
}

export default function AdminCashierKPI({ apiBase = "" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("today");

  const load = useCallback(async () => {
    setLoading(true);
    const now = Math.floor(Date.now() / 1000);
    const from = range === "today" ? Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
      : range === "7d" ? now - 7 * DAY : now - 30 * DAY;
    try {
      const r = await fetch(`${apiBase}/api/cashier-kpi?from=${from}&to=${now}`);
      setData(await r.json());
    } catch { setData(null); }
    setLoading(false);
  }, [apiBase, range]);

  useEffect(() => { load(); }, [load]);

  const cashiers = data?.cashiers || [];
  const sum = data?.summary || {};

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["today", "Hari Ini"], ["7d", "7 Hari"], ["30d", "30 Hari"]].map(([k, l]) => (
          <button key={k} onClick={() => setRange(k)} style={S.btn(range === k)}>{l}</button>
        ))}
        <button onClick={load} style={{ ...S.btn(false), marginLeft: "auto" }}>🔄 Refresh</button>
      </div>

      {/* Summary */}
      <div style={S.grid4}>
        <div style={{ ...S.card, marginBottom: 0, borderLeft: "4px solid #3B82F6" }}>
          <div style={S.label}>Kasir Aktif</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{sum.total_cashiers || 0}</div>
        </div>
        <div style={{ ...S.card, marginBottom: 0, borderLeft: "4px solid #34D399" }}>
          <div style={S.label}>Avg KPI</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: scoreColor(sum.avg_kpi), fontFamily: "'Space Mono',monospace" }}>
            {sum.avg_kpi != null ? sum.avg_kpi : "—"}
          </div>
        </div>
        <div style={{ ...S.card, marginBottom: 0, borderLeft: "4px solid #FBBF24" }}>
          <div style={S.label}>Sudah Dinilai</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{sum.rated_cashiers || 0}</div>
        </div>
        <div style={{ ...S.card, marginBottom: 0, borderLeft: "4px solid #F87171" }}>
          <div style={S.label}>Review Jelek</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: sum.total_bad_reviews > 0 ? "#F87171" : "#fff", fontFamily: "'Space Mono',monospace" }}>
            {sum.total_bad_reviews || 0}
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div style={S.card}>
        <div style={S.label}>🏆 Peringkat Kasir — KPI digerakin rating customer</div>
        {loading ? <div style={{ color: "#555", padding: 12 }}>Loading...</div> :
          cashiers.length === 0 ? <div style={{ color: "#555", padding: 12 }}>Belum ada data kasir di periode ini</div> :
            cashiers.map((c, i) => (
              <div key={c.cashier} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: "1px solid #0f1629" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#555", width: 30, fontFamily: "'Space Mono',monospace" }}>#{i + 1}</div>
                <div style={{
                  width: 58, height: 58, borderRadius: "50%", flexShrink: 0,
                  border: `3px solid ${scoreColor(c.kpi_score)}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: scoreColor(c.kpi_score), fontFamily: "'Space Mono',monospace", lineHeight: 1 }}>
                    {c.kpi_score != null ? c.kpi_score : "—"}
                  </div>
                  <div style={{ fontSize: 7, color: "#555", letterSpacing: 1.5 }}>KPI</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{c.cashier}</div>
                  <div style={{ fontSize: 12, marginTop: 3 }}>
                    <Stars value={c.avg_rating} />
                    <span style={{ color: "#888", marginLeft: 6 }}>
                      {c.feedback_count > 0 ? `${c.avg_rating} · ${c.feedback_count} review` : "belum dinilai"}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#34D399", fontFamily: "'Space Mono',monospace" }}>{fR(c.total_sales)}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{c.transactions} transaksi</div>
                </div>
                <div style={{ textAlign: "right", minWidth: 78 }}>
                  {c.bad_count > 0 && <div style={{ fontSize: 11, color: "#F87171" }}>👎 {c.bad_count} jelek</div>}
                  {c.good_count > 0 && <div style={{ fontSize: 11, color: "#34D399" }}>👍 {c.good_count} bagus</div>}
                  {c.voided > 0 && <div style={{ fontSize: 11, color: "#FBBF24" }}>✖ {c.voided} void</div>}
                </div>
              </div>
            ))
        }
      </div>
    </div>
  );
}
