// src/Admin/AdminItemMaster.jsx
// Item Master — registry terpadu: item core, kategori, tipe.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#0891b2";
const TYPE_C = {
  "Finished Goods": "#10b981", "Raw Material": "#f59e0b", "Semi Finished": "#a855f7",
  "Modifier": "#3b82f6", "Packaging": "#84cc16", "Service Item": "#06b6d4", "Promo Item": "#ec4899",
};

export default function AdminItemMaster({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState("all");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/item-master`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Item Master…</div>;
  const s = d.summary;
  const items = filter === "all" ? d.items : d.items.filter(i => i.item_type === filter);
  const maxCat = Math.max(1, ...d.categories.map(c => c.count));

  return (
    <div>
      <div style={S.intro}>
        📦 <b style={{ color: AC }}>ITEM MASTER</b> — registry terpadu semua item: finished goods, raw
        material, packaging, modifier. Item core (code/SKU/barcode), kategori &amp; tipe — jantung ecosystem.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Item" v={String(s.total)} c={AC} />
        <Kpi label="Finished Goods" v={String(s.finished_goods)} c="#10b981" sub="item jual" />
        <Kpi label="Raw Material" v={String(s.raw_material)} c="#f59e0b" sub="bahan baku" />
        <Kpi label="Item Aktif" v={String(s.active)} c="#3b82f6" />
      </div>

      {/* Type distribution */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🏷️ ITEM TYPE — klik buat filter</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginTop: 10 }}>
          <TypeCard t={{ type: "all", icon: "📋" }} count={s.total} c={AC} on={filter === "all"} onClick={() => setFilter("all")} label="Semua" />
          {d.types.map(t => (
            <TypeCard key={t.type} t={t} count={t.count} c={TYPE_C[t.type] || "#9ca3af"} on={filter === t.type} onClick={() => setFilter(t.type)} />
          ))}
        </div>
      </div>

      {/* Category breakdown */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📂 KATEGORI</div>
        {d.categories.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
            <span style={{ width: 130, fontSize: 12, color: "#9da7b3" }}>{c.category}</span>
            <div style={{ flex: 1, height: 11, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: Math.round(c.count / maxCat * 100) + "%", background: AC }} />
            </div>
            <span style={{ width: 30, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{c.count}</span>
          </div>
        ))}
      </div>

      {/* Item table */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📋 ITEM REGISTRY — {items.length}{filter !== "all" ? ` · ${filter}` : ""}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["ITEM CODE", "NAMA", "KATEGORI", "TIPE", "HARGA/COST", "UOM"].map(h => (
                <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#5b6470" }}>{it.item_code}</td>
                <td style={S.td}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{it.name}</div>
                  <div style={{ color: "#5b6470", fontSize: 10, fontFamily: "'Geist Mono',monospace" }}>{it.barcode}</div>
                </td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{it.category}{it.subcategory ? ` · ${it.subcategory}` : ""}</td>
                <td style={S.td}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_C[it.item_type] || "#9ca3af",
                    background: (TYPE_C[it.item_type] || "#9ca3af") + "1f", border: `1px solid ${(TYPE_C[it.item_type] || "#9ca3af")}55`,
                    borderRadius: 5, padding: "2px 8px", fontFamily: "'Geist Mono',monospace" }}>{it.item_type}</span>
                </td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#cdd5df" }}>{fmtRp(it.base_price)}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{it.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TypeCard({ t, count, c, on, onClick, label }) {
  return (
    <button onClick={onClick} style={{ background: on ? c + "22" : "#0a0e16", border: `1px solid ${on ? c : "#161b22"}`,
      borderRadius: 9, padding: "10px 12px", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
      <div style={{ fontSize: 18 }}>{t.icon}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: on ? c : "#e6edf3", marginTop: 3 }}>{label || t.type}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace" }}>{count}</div>
    </button>
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
  td: { padding: "8px 8px" },
};
