// src/Admin/AdminStockList.jsx
// Stock List — daftar lengkap stok gudang + valuasi inventory.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#155e75";

export default function AdminStockList({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/stock-list`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Stock List…</div>;
  const s = d.summary;
  const items = d.items.filter(i =>
    (cat === "all" || i.category === cat) &&
    (!q.trim() || (i.name + i.sku).toLowerCase().includes(q.toLowerCase())));

  return (
    <div>
      <div style={S.intro}>
        📃 <b style={{ color: "#22d3ee" }}>STOCK LIST</b> — daftar lengkap stok gudang + valuasi inventory,
        status per item &amp; breakdown per kategori. Snapshot real-time semua bahan baku &amp; kemasan.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Items" v={String(s.total_items)} c={AC} />
        <Kpi label="Nilai Inventory" v={fmtRp(s.total_value)} c="#10b981" />
        <Kpi label="Stock Menipis" v={String(s.low)} c={s.low > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Stock Habis" v={String(s.out)} c={s.out > 0 ? "#ef4444" : "#10b981"} />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🗂️ NILAI PER KATEGORI</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Chip label={`Semua (${s.total_items})`} on={cat === "all"} onClick={() => setCat("all")} />
          {d.categories.map(c => (
            <Chip key={c.category} label={`${c.category} · ${fmtRp(c.value)}`} on={cat === c.category} onClick={() => setCat(c.category)} />
          ))}
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={S.kicker}>📦 DAFTAR STOK — {items.length}</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search items / SKU…" style={S.search} />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["SKU", "ITEM", "KATEGORI", "STOK", "REORDER PT", "HARGA/UNIT", "NILAI STOK", "STATUS"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.sku} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{it.sku}</td>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{it.name}</td>
                <td style={{ ...S.td, color: "#9da7b3", fontSize: 11 }}>{it.category}</td>
                <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: it.color }}>{it.stock} {it.unit}</td>
                <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{it.reorder_point ?? "—"}</td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{fmtRp(it.cost_per_unit)}</td>
                <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#cdd5df" }}>{fmtRp(it.stock_value)}</td>
                <td style={S.td}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: it.color, background: it.color + "1f", border: `1px solid ${it.color}55`, borderRadius: 5, padding: "2px 7px", fontFamily: "'Geist Mono',monospace" }}>{it.label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chip({ label, on, onClick }) {
  return (
    <button onClick={onClick} style={{ background: on ? "#155e75" : "#0a0e16", border: `1px solid ${on ? "#155e75" : "#21262d"}`, color: on ? "#fff" : "#9da7b3", fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
  );
}
function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
  search: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "6px 10px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", width: 200 },
};
