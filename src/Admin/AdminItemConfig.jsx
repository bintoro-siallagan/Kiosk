// src/Admin/AdminItemConfig.jsx
// Item Config — Inventory Config + Modifier System.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#0d9488";

export default function AdminItemConfig({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState("all");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/item-config`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const patch = (it, changes) => {
    const body = {
      inventory_type: it.inventory_type, min_stock: it.min_stock, reorder_point: it.reorder_point,
      expiry_tracking: it.expiry_tracking, batch_tracking: it.batch_tracking, ...changes,
    };
    fetch(`${apiBase}/api/item-config/inventory/${it.item_code}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Item Config…</div>;
  const s = d.summary;
  const inv = filter === "all" ? d.inventory : d.inventory.filter(i => i.inventory_type === filter);

  return (
    <div>
      <div style={S.intro}>
        🔧 <b style={{ color: AC }}>ITEM CONFIG</b> — Inventory Config (stock/non-stock, min stock, reorder
        point, expiry &amp; batch tracking) + Modifier System (size/sugar/ice/topping/add-on).
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Stock Item" v={String(s.stock_items)} c={AC} sub="dilacak stoknya" />
        <Kpi label="Non-Stock" v={String(s.non_stock)} c="#5b6470" sub="made to order" />
        <Kpi label="Expiry Tracked" v={String(s.expiry_tracked)} c="#f59e0b" />
        <Kpi label="Modifier Group" v={String(s.modifier_groups)} c="#a855f7" />
      </div>

      {/* Modifier system */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ MODIFIER SYSTEM</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10, marginTop: 10 }}>
          {d.modifiers.map(g => (
            <div key={g.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 9, padding: "11px 13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{g.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#a855f7", fontFamily: "'Space Mono',monospace" }}>{g.mod_type.toUpperCase()}</span>
              </div>
              {g.options.map((o, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0", color: "#9da7b3" }}>
                  <span>{o.name}</span>
                  <span style={{ color: o.price > 0 ? "#10b981" : "#5b6470", fontFamily: "'Space Mono',monospace" }}>{o.price > 0 ? "+" + fmtRp(o.price) : "gratis"}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Inventory config */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={S.kicker}>📦 INVENTORY CONFIG</span>
          <div style={{ display: "flex", gap: 5, marginLeft: "auto" }}>
            {["all", "stock", "non-stock"].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ background: filter === f ? AC : "#0a0e16", border: `1px solid ${filter === f ? AC : "#21262d"}`, color: filter === f ? "#fff" : "#9da7b3", fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>{f}</button>
            ))}
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["ITEM", "TIPE", "MIN STOCK", "REORDER", "EXPIRY", "BATCH"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {inv.map(it => (
              <tr key={it.item_code} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={S.td}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{it.name}</div>
                  <div style={{ color: "#5b6470", fontSize: 10 }}>{it.item_type}{it.current_stock != null ? ` · stok ${Math.round(it.current_stock * 10) / 10} ${it.uom}` : ""}</div>
                </td>
                <td style={S.td}>
                  <button onClick={() => patch(it, { inventory_type: it.inventory_type === "stock" ? "non-stock" : "stock" })}
                    style={{ ...S.toggle, color: it.inventory_type === "stock" ? AC : "#5b6470", borderColor: it.inventory_type === "stock" ? AC + "55" : "#21262d" }}>
                    {it.inventory_type === "stock" ? "● STOCK" : "○ NON-STOCK"}
                  </button>
                </td>
                <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", color: "#9da7b3" }}>{it.inventory_type === "stock" ? it.min_stock : "—"}</td>
                <td style={{ ...S.td, fontFamily: "'Space Mono',monospace", color: "#9da7b3" }}>{it.inventory_type === "stock" ? it.reorder_point : "—"}</td>
                <td style={S.td}>
                  <button onClick={() => patch(it, { expiry_tracking: !it.expiry_tracking })} style={{ ...S.flag, color: it.expiry_tracking ? "#f59e0b" : "#5b6470" }}>{it.expiry_tracking ? "✓ ya" : "—"}</button>
                </td>
                <td style={S.td}>
                  <button onClick={() => patch(it, { batch_tracking: !it.batch_tracking })} style={{ ...S.flag, color: it.batch_tracking ? "#3b82f6" : "#5b6470" }}>{it.batch_tracking ? "✓ ya" : "—"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: "#5b6470", marginTop: 8 }}>💡 {d.bom_note}</div>
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
  toggle: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 6, padding: "4px 9px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace" },
  flag: { background: "transparent", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
