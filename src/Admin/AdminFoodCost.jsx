// src/Admin/AdminFoodCost.jsx
// Real-time Food Cost — food cost & margin per menu, dihitung dari
// resep × harga bahan live. Klik menu → lihat rincian resep.

import { useState, useEffect, useCallback } from "react";
import ReportActions from "./ReportActions.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fcColor = (p) => (p > 40 ? "#ef4444" : p >= 35 ? "#f59e0b" : "#10b981");
const CAT = { froyo: "Froyo", smoothies: "Smoothie", takehome: "Tato Home", yogulato: "Yogulato", collab: "Collab" };

export default function AdminFoodCost({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/food-cost`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Food Cost…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🍳 <b style={{ color: "#f97316" }}>REAL-TIME FOOD COST</b> — tiap menu punya resep (bahan + qty).
        Food cost dihitung <b>live</b> dari harga bahan di warehouse — harga bahan naik, food cost &amp; margin langsung ikut update.
      </div>

      <ReportActions title="Food Cost" subtitle="Food cost & margin per menu"
        columns={["Menu", "Kategori", "Price Jual", "Food Cost", "Food Cost %", "Margin %"]}
        rows={d.items.map(i => [i.name, i.category, i.price, i.food_cost, i.food_cost_pct + "%", i.margin_pct + "%"])} />

      <div style={S.kpiRow}>
        <Kpi label="Total Menu" v={String(s.total_menu)} c="#3b82f6" sub="punya resep" />
        <Kpi label="Avg Food Cost" v={s.avg_food_cost_pct + "%"} c={fcColor(s.avg_food_cost_pct)} sub="target F&B < 35%" />
        <Kpi label="Food Cost Tinggi" v={String(s.high_count)} c={s.high_count > 0 ? "#ef4444" : "#10b981"} sub="> 40% — perlu dicek" />
        <Kpi label="Termurah Dibuat" v={s.best} c="#10b981" sub="food cost terendah" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🍳 FOOD COST PER MENU — klik baris buat lihat resep</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["MENU", "KATEGORI", "HARGA JUAL", "FOOD COST", "FOOD COST %", "MARGIN"].map(h => (
                <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.items.map(it => {
              const fc = fcColor(it.food_cost_pct);
              const isOpen = open === it.menu_id;
              return [
                  <tr key={it.menu_id} onClick={() => setOpen(isOpen ? null : it.menu_id)}
                    style={{ borderTop: "1px solid #161b22", fontSize: 13, cursor: "pointer", background: isOpen ? "#0a0e16" : "transparent" }}>
                    <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{isOpen ? "▾ " : "▸ "}{it.name}</td>
                    <td style={{ ...S.td, color: "#9da7b3", fontSize: 12 }}>{CAT[it.category] || it.category}</td>
                    <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{fmtRp(it.price)}</td>
                    <td style={{ ...S.td, ...S.mono, color: "#cdd5df" }}>{fmtRp(it.food_cost)}</td>
                    <td style={S.td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 60, height: 8, background: "#161b22", borderRadius: 4, overflow: "hidden" }}>
                          <span style={{ display: "block", height: "100%", width: Math.min(100, it.food_cost_pct) + "%", background: fc }} />
                        </span>
                        <b style={{ color: fc, fontFamily: "'Geist Mono',monospace" }}>{it.food_cost_pct}%</b>
                      </span>
                    </td>
                    <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#10b981" }}>{it.margin_pct}%</td>
                  </tr>,
                  isOpen ? (
                    <tr key={it.menu_id + "-r"} style={{ background: "#0a0e16" }}>
                      <td colSpan={6} style={{ padding: "4px 18px 12px" }}>
                        <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace", margin: "4px 0 6px" }}>RESEP — {it.recipe.length} BAHAN</div>
                        {it.recipe.map((r, j) => (
                          <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "#9da7b3" }}>
                            <span>{r.name} <span style={{ color: "#5b6470" }}>· {r.qty} {r.unit}</span></span>
                            <span style={{ fontFamily: "'Geist Mono',monospace" }}>{fmtRp(r.cost)}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "9px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
};
