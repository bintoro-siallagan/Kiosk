// src/Admin/AdminItemIntel.jsx
// Item Intelligence — Health Monitor, AI tag, loyalty, supplier,
// central kitchen & approval rule.

import { useState, useEffect, useCallback } from "react";

const AC = "#16a34a";
const HEALTH_C = { Healthy: "#10b981", "Slow Moving": "#f59e0b", "Low Margin": "#fb923c", "High Waste": "#ef4444" };
const TAG_C = { "Best Seller": "#fbbf24", "High Margin": "#10b981", Seasonal: "#a855f7", "Upsell Target": "#3b82f6", "Slow Moving": "#f59e0b", "2x Point": "#ec4899" };

export default function AdminItemIntel({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/item-intel`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Item Intelligence…</div>;
  const s = d.summary;
  const maxH = Math.max(1, ...d.health_dist.map(h => h.count));

  return (
    <div>
      <div style={S.intro}>
        🩺 <b style={{ color: AC }}>ITEM INTELLIGENCE</b> — health monitor (margin/waste/velocity), AI tag,
        loyalty rule, supplier link, central kitchen flow &amp; approval rule. Item master = jantung ecosystem.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Item Healthy" v={String(s.healthy)} c="#10b981" />
        <Kpi label="Perlu Perhatian" v={String(s.attention)} c="#f59e0b" />
        <Kpi label="Avg Margin" v={s.avg_margin + "%"} c={AC} />
        <Kpi label="Loyalty Boosted" v={String(s.loyalty_boosted)} c="#ec4899" sub="2x point" />
      </div>

      {/* Health distribution */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🩺 ITEM HEALTH MONITOR</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 10 }}>
          {d.health_dist.map(h => (
            <div key={h.status} style={{ background: "#0a0e16", border: "1px solid #161b22", borderTop: `2px solid ${HEALTH_C[h.status]}`, borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: HEALTH_C[h.status] }}>{h.status}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#e6edf3", fontFamily: "'Space Mono',monospace", margin: "3px 0" }}>{h.count}</div>
              <div style={{ height: 5, background: "#161b22", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(h.count / maxH * 100) + "%", background: HEALTH_C[h.status] }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Item table */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📋 ITEM — HEALTH & AI TAG</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["ITEM", "MARGIN", "WASTE", "SOLD/BLN", "HEALTH", "AI TAG"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.items.map(it => (
              <tr key={it.item_code} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{it.name}</td>
                <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", color: it.margin_pct >= 60 ? "#10b981" : "#f59e0b" }}>{it.margin_pct}%</td>
                <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", color: it.waste_pct > 8 ? "#ef4444" : "#9da7b3" }}>{it.waste_pct}%</td>
                <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", color: "#9da7b3" }}>{it.monthly_sold}</td>
                <td style={S.td}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: it.health_color, background: it.health_color + "1f", border: `1px solid ${it.health_color}55`, borderRadius: 5, padding: "2px 8px", fontFamily: "'Space Mono',monospace" }}>{it.health}</span>
                </td>
                <td style={S.td}>
                  {it.tags.map((t, i) => (
                    <span key={i} style={{ fontSize: 9, fontWeight: 700, color: TAG_C[t] || "#9ca3af", background: (TAG_C[t] || "#9ca3af") + "1f", borderRadius: 4, padding: "2px 6px", marginRight: 3, fontFamily: "'Space Mono',monospace" }}>{t}</span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Approval / Supplier / Central Kitchen */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        <div style={S.card}>
          <div style={S.kicker}>✅ APPROVAL RULE</div>
          {d.approval_rules.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "7px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
              <span style={{ color: "#9da7b3" }}>{r.icon} {r.change}</span>
              <span style={{ color: "#f59e0b", fontWeight: 600 }}>{r.approver}</span>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <div style={S.kicker}>🚚 SUPPLIER LINK</div>
          {d.suppliers.map((sp, i) => (
            <div key={i} style={{ padding: "7px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e6edf3" }}>{sp.name}</div>
              <div style={{ fontSize: 10, color: "#5b6470" }}>{sp.supplies} · lead {sp.lead_time} · MOQ {sp.moq}</div>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <div style={S.kicker}>🏭 CENTRAL KITCHEN</div>
          <div style={{ fontSize: 10, color: "#5b6470", margin: "6px 0 8px" }}>Semi-finished — diproduksi terpusat:</div>
          {d.central_kitchen.map((c, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
              <span style={{ color: "#e6edf3" }}>🧪 {c.name}</span>
              <span style={{ color: "#5b6470", fontSize: 10 }}>{c.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 8px" },
};
