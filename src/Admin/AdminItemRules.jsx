// src/Admin/AdminItemRules.jsx
// Item Rules — kitchen routing, promo link, availability + combo.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#ea580c";
const STATION_C = { Bar: "#3b82f6", Kitchen: "#f59e0b", Dessert: "#ec4899", "Cinema Snack": "#a855f7" };
const COMBO_ICON = { cinema: "🎬", meal: "🍱", family: "👨‍👩‍👧" };

export default function AdminItemRules({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/item-rules`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const patch = (it, changes) => {
    const body = {
      kitchen_station: it.kitchen_station, promo_eligible: it.promo_eligible,
      loyalty_eligible: it.loyalty_eligible, cashback_eligible: it.cashback_eligible,
      availability_mode: it.availability_mode, auto_hide_soldout: it.auto_hide_soldout, ...changes,
    };
    fetch(`${apiBase}/api/item-rules/${it.item_code}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Item Rules…</div>;
  const s = d.summary;
  const cycle = (arr, cur) => arr[(arr.indexOf(cur) + 1) % arr.length];
  const maxSt = Math.max(1, ...d.station_dist.map(x => x.count));

  return (
    <div>
      <div style={S.intro}>
        🍽️ <b style={{ color: AC }}>ITEM RULES</b> — kitchen routing (KDS station), promo engine link,
        availability rule &amp; combo/bundle. Klik badge buat ubah.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Item" v={String(s.total)} c={AC} />
        <Kpi label="Promo Eligible" v={String(s.promo_eligible)} c="#10b981" />
        <Kpi label="Cashback Eligible" v={String(s.cashback_eligible)} c="#fbbf24" />
        <Kpi label="Combo / Bundle" v={String(s.combos)} c="#a855f7" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* Kitchen routing */}
        <div style={S.card}>
          <div style={S.kicker}>🍳 KITCHEN ROUTING (KDS)</div>
          {d.station_dist.map(x => (
            <div key={x.station} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
              <span style={{ width: 100, fontSize: 12, color: STATION_C[x.station] }}>{x.station}</span>
              <div style={{ flex: 1, height: 12, background: "#0a0e16", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(x.count / maxSt * 100) + "%", background: STATION_C[x.station] }} />
              </div>
              <span style={{ width: 26, textAlign: "right", fontFamily: "'Space Mono',monospace", fontSize: 12, color: "#cdd5df" }}>{x.count}</span>
            </div>
          ))}
        </div>
        {/* Combos */}
        <div style={S.card}>
          <div style={S.kicker}>🍱 COMBO & BUNDLE — {d.combos.length}</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {d.combos.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 11, background: "#0a0e16", border: "1px solid #161b22", borderRadius: 9, padding: "10px 12px" }}>
                <span style={{ fontSize: 20 }}>{COMBO_ICON[c.combo_type] || "🍱"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "#5b6470" }}>{c.items.join(" + ")}</div>
                </div>
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700, color: "#10b981" }}>{fmtRp(c.price)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-item rules */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📋 RULE PER ITEM — klik badge buat ubah</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["ITEM", "KDS STATION", "PROMO", "LOYALTY", "CASHBACK", "AVAILABILITY"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.items.map(it => (
              <tr key={it.item_code} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={S.td}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{it.name}</div>
                  <div style={{ color: "#5b6470", fontSize: 10 }}>{it.category}</div>
                </td>
                <td style={S.td}>
                  <button onClick={() => patch(it, { kitchen_station: cycle(d.catalog.stations, it.kitchen_station) })}
                    style={{ ...S.badge, color: STATION_C[it.kitchen_station] || "#9ca3af", borderColor: (STATION_C[it.kitchen_station] || "#9ca3af") + "66" }}>
                    {it.kitchen_station}
                  </button>
                </td>
                {["promo_eligible", "loyalty_eligible", "cashback_eligible"].map(f => (
                  <td key={f} style={S.td}>
                    <button onClick={() => patch(it, { [f]: !it[f] })} style={{ ...S.flag, color: it[f] ? "#10b981" : "#5b6470" }}>
                      {it[f] ? "✓ ya" : "○ no"}
                    </button>
                  </td>
                ))}
                <td style={S.td}>
                  <button onClick={() => patch(it, { availability_mode: cycle(d.catalog.availability_modes, it.availability_mode) })}
                    style={{ ...S.badge, color: it.availability_mode === "Always" ? "#10b981" : "#f59e0b", borderColor: (it.availability_mode === "Always" ? "#10b981" : "#f59e0b") + "66" }}>
                    {it.availability_mode}
                  </button>
                </td>
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
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 8px" },
  badge: { background: "#0a0e16", border: "1px solid", borderRadius: 6, padding: "4px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace" },
  flag: { background: "transparent", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace" },
};
