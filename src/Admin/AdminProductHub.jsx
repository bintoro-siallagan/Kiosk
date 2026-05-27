// src/Admin/AdminProductHub.jsx
// Product Hub — dashboard + product list + Quick View 360° (semua
// info produk dalam 1 layar).

import { useState, useEffect, useCallback } from "react";

import { fmtMoney as fmtRp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";
const AC = "#8b5cf6";
const TAG_C = { "Best Seller": "#fbbf24", "High Margin": "#10b981", Seasonal: "#a855f7", "Slow Moving": "#f59e0b", "2x Point": "#ec4899" };

export default function AdminProductHub({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [sel, setSel] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/product-hub`).then(r => r.json()).then(j => {
      setD(j); setSel(s => s || (j.products[0] && j.products[0].item_code));
    }).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <LoadingState label="Memuat Product Hub…" />;
  const s = d.summary;
  const p = d.products.find(x => x.item_code === sel) || d.products[0];

  return (
    <div>
      <div style={S.intro}>
        🛍️ <b style={{ color: AC }}>PRODUCT HUB</b> — dashboard produk + Quick View 360°. Klik produk →
        lihat harga, channel, margin, sales, health, promo &amp; tag dalam <b>satu layar</b>.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Produk" v={String(s.total)} c={AC} />
        <Kpi label="Healthy" v={`${s.healthy}/${s.total}`} c="#10b981" />
        <Kpi label="Avg Margin" v={s.avg_margin + "%"} c="#16a34a" />
        <Kpi label="Terjual / Bulan" v={s.total_sold.toLocaleString("id-ID")} c="#3b82f6" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* Product list */}
        <div style={S.card}>
          <div style={S.kicker}>📋 PRODUCT LIST — {d.products.length}</div>
          <div style={{ marginTop: 8, maxHeight: 520, overflowY: "auto" }}>
            {d.products.map(x => {
              const on = x.item_code === sel;
              return (
                <div key={x.item_code} onClick={() => setSel(x.item_code)}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 7, cursor: "pointer", marginBottom: 3, background: on ? AC + "22" : "transparent", border: `1px solid ${on ? AC : "transparent"}` }}>
                  <span style={{ fontSize: 18 }}>{x.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#e6edf3" }}>{x.name}</div>
                    <div style={{ fontSize: 10, color: "#5b6470" }}>{x.category}</div>
                  </div>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: x.health_color }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick View */}
        <div style={S.card}>
          {!p ? <div style={{ color: "#5b6470" }}>Pilih produk.</div> : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <span style={{ fontSize: 46 }}>{p.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: "#e6edf3" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{p.item_code} · {p.category}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: p.health_color, background: p.health_color + "1f", border: `1px solid ${p.health_color}55`, borderRadius: 7, padding: "5px 12px" }}>
                  ● {p.health}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
                <Stat label="Dine-in" v={fmtRp(p.price_dinein)} c="#e6edf3" />
                <Stat label="Online" v={fmtRp(p.price_online)} c="#e6edf3" />
                <Stat label="Margin" v={p.margin_pct + "%"} c={p.margin_pct >= 60 ? "#10b981" : "#f59e0b"} />
                <Stat label="Waste" v={p.waste_pct + "%"} c={p.waste_pct > 8 ? "#ef4444" : "#9da7b3"} />
                <Stat label="Terjual/bln" v={String(p.monthly_sold)} c="#3b82f6" />
                <Stat label="Loyalty" v={p.point_multiplier + "x point"} c="#ec4899" />
              </div>

              <Row label="📲 Channel Visibility">
                {p.channels.map((c, i) => <Chip key={i} t={c} c="#10b981" />)}
              </Row>
              {p.tags.length > 0 && (
                <Row label="🏷️ AI Tag">
                  {p.tags.map((t, i) => <Chip key={i} t={t} c={TAG_C[t] || "#9ca3af"} />)}
                </Row>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                <Info label="Kitchen Station" v={p.kitchen_station} />
                <Info label="Availability" v={p.availability_mode} />
                <Info label="Promo" v={p.promo_eligible ? "✓ Eligible" : "— Excluded"} c={p.promo_eligible ? "#10b981" : "#5b6470"} />
                <Info label="Inventory" v={p.inventory_type} />
                <Info label="Loyalty" v={p.loyalty_eligible ? "✓ Eligible" : "—"} c={p.loyalty_eligible ? "#10b981" : "#5b6470"} />
                <Info label="Tax" v={p.tax_type} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, v, c }) {
  return (
    <div style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 8, padding: "8px 11px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 2 }}>{v}</div>
    </div>
  );
}
function Row({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}
function Chip({ t, c }) {
  return <span style={{ fontSize: 11, fontWeight: 600, color: c, background: c + "1f", border: `1px solid ${c}44`, borderRadius: 5, padding: "3px 8px" }}>{t}</span>;
}
function Info({ label, v, c }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", background: "#0a0e16", border: "1px solid #161b22", borderRadius: 7, padding: "7px 10px" }}>
      <span style={{ fontSize: 11, color: "#5b6470" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: c || "#cdd5df" }}>{v}</span>
    </div>
  );
}
function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
};
