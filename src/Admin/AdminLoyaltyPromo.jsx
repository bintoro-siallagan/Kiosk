// src/Admin/AdminLoyaltyPromo.jsx
// Loyalty + Promo + Campaign Analytics.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#f43f5e";
const rrColor = (r) => (r >= 70 ? "#ef4444" : r >= 35 ? "#f59e0b" : "#10b981");

export default function AdminLoyaltyPromo({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/loyalty-promo`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Loyalty & Promo Analytics…</div>;
  const p = d.promo, l = d.loyalty, ch = d.channel;
  const maxUse = Math.max(1, ...p.usage.map(x => x.orders));
  const chTotal = ch.cashier + ch.kiosk + ch.qr || 1;

  return (
    <div>
      <div style={S.intro}>
        🎁 <b style={{ color: AC }}>LOYALTY &amp; PROMO ANALYTICS</b> — promo paling efektif, redemption rate,
        ROI, alur poin loyalty, retensi member &amp; respons channel.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Members" v={String(l.members)} c={AC} sub={`${l.vip} VIP`} />
        <Kpi label="Poin Beredar" v={l.total_points.toLocaleString("id-ID")} c="#fbbf24" sub="outstanding" />
        <Kpi label="Promo Orders" v={String(p.summary.promo_orders)} c="#3b82f6" sub={`best: ${p.summary.best_promo}`} />
        <Kpi label="Total Discount" v={fmtRp(p.summary.total_discount)} c="#f59e0b" sub="diberikan" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* Promo performance */}
        <div style={S.card}>
          <div style={S.kicker}>🏷️ PROMO PERFORMANCE — dari order nyata</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
            <thead>
              <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
                {["PROMO", "ORDERS", "DISCOUNT", "REVENUE", "ROI"].map(h => <th key={h} style={{ padding: "5px 8px", fontWeight: 600 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {p.usage.map((x, i) => (
                <tr key={i} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                  <td style={{ ...S.td, fontWeight: 700, color: "#e6edf3", fontFamily: "'Space Mono',monospace" }}>{x.code}</td>
                  <td style={S.td}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 44, height: 6, background: "#0a0e16", borderRadius: 3, overflow: "hidden", display: "inline-block" }}>
                        <span style={{ display: "block", height: "100%", width: Math.round(x.orders / maxUse * 100) + "%", background: AC }} />
                      </span>
                      <b style={{ color: "#cdd5df" }}>{x.orders}</b>
                    </span>
                  </td>
                  <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", color: "#f59e0b" }}>{fmtRp(x.discount)}</td>
                  <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", color: "#9da7b3" }}>{fmtRp(x.revenue)}</td>
                  <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", fontWeight: 700, color: x.roi >= 5 ? "#10b981" : x.roi ? "#f59e0b" : "#5b6470" }}>{x.roi ? x.roi + "×" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Loyalty */}
        <div style={S.card}>
          <div style={S.kicker}>💚 LOYALTY ANALYTICS</div>
          <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
            <Stat label="Retensi Member" v={l.retention_rate + "%"} c={l.retention_rate >= 60 ? "#10b981" : "#f59e0b"} />
            <Stat label="Poin Earned (total)" v={l.point_earned.toLocaleString("id-ID")} c="#10b981" />
            <Stat label="Poin Redeemed" v={l.point_used.toLocaleString("id-ID")} c="#3b82f6" />
            <Stat label="Nilai Poin Ditukar" v={fmtRp(l.point_discount_value)} c="#fbbf24" />
            <Stat label="Member VIP" v={`${l.vip} / ${l.members}`} c={AC} />
          </div>
          <div style={{ fontSize: 11, color: "#5b6470", marginTop: 10, lineHeight: 1.5 }}>
            Poin terpakai {Math.round(l.point_used / (l.point_earned || 1) * 100)}% dari yang diterbitkan — engagement loyalty {l.point_used / (l.point_earned || 1) >= 0.5 ? "sehat" : "bisa didorong"}.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* Catalog redemption */}
        <div style={S.card}>
          <div style={S.kicker}>📋 PROMO CATALOG — REDEMPTION RATE</div>
          {p.catalog.slice(0, 8).map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ width: 110, fontSize: 11, color: "#e6edf3", fontFamily: "'Space Mono',monospace", flexShrink: 0 }}>{c.code}</span>
              <div style={{ flex: 1, height: 11, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: c.redemption_rate + "%", background: rrColor(c.redemption_rate) }} />
              </div>
              <span style={{ width: 110, textAlign: "right", fontSize: 11, color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>{c.used_count}/{c.usage_limit} · {c.redemption_rate}%</span>
            </div>
          ))}
        </div>
        {/* Channel */}
        <div style={S.card}>
          <div style={S.kicker}>📲 RESPONS CHANNEL</div>
          {[["Cashier", ch.cashier, "#3b82f6"], ["Kiosk", ch.kiosk, "#a855f7"], ["QR Order", ch.qr, "#10b981"]].map(([n, v, c]) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
              <span style={{ width: 80, fontSize: 12, color: "#9da7b3" }}>{n}</span>
              <div style={{ flex: 1, height: 13, background: "#0a0e16", borderRadius: 7, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(v / chTotal * 100) + "%", background: c }} />
              </div>
              <span style={{ width: 64, textAlign: "right", fontFamily: "'Space Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{v} · {Math.round(v / chTotal * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, v, c }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0e16", border: "1px solid #161b22", borderRadius: 8, padding: "9px 12px" }}>
      <span style={{ fontSize: 12, color: "#9da7b3" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace" }}>{v}</span>
    </div>
  );
}
function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "8px 8px" },
};
