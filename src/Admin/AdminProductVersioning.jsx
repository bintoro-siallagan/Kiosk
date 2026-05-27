// src/Admin/AdminProductVersioning.jsx
// Product Versioning — timeline riwayat perubahan produk.

import { useState, useEffect, useCallback } from "react";
import { LoadingState } from "../components/uiKit.jsx";

const AC = "#7c3aed";
const TYPE_C = { price: "#10b981", recipe: "#f97316", modifier: "#3b82f6", promo: "#fbbf24", status: "#ef4444" };
const ago = (ts) => {
  if (!ts) return "—";
  const h = Math.floor((Date.now() / 1000 - ts) / 3600);
  if (h < 1) return "baru saja";
  if (h < 24) return h + " hr lalu";
  return Math.floor(h / 24) + " day lalu";
};

export default function AdminProductVersioning({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState("all");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/product-versioning`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <LoadingState label="Memuat Product Versioning…" />;
  const s = d.summary;
  const versions = filter === "all" ? d.versions : d.versions.filter(v => v.change_type === filter);

  return (
    <div>
      <div style={S.intro}>
        📜 <b style={{ color: "#a78bfa" }}>PRODUCT VERSIONING</b> — track riwayat perubahan produk: harga,
        recipe, modifier, promo &amp; status. Audit trail produk — enterprise.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Perubahan" v={String(s.total)} c="#a78bfa" />
        <Kpi label="Perubahan Price" v={String(s.price_changes)} c="#10b981" />
        <Kpi label="Perubahan Recipe" v={String(s.recipe_changes)} c="#f97316" />
        <Kpi label="This Week" v={String(s.this_week)} c="#3b82f6" />
      </div>

      {/* Type filter */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🔀 JENIS PERUBAHAN — klik buat filter</div>
        <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
          <FilterChip label={`Semua (${s.total})`} on={filter === "all"} c="#a78bfa" onClick={() => setFilter("all")} />
          {d.type_dist.map(t => (
            <FilterChip key={t.type} label={`${t.icon} ${t.label} (${t.count})`} on={filter === t.type} c={TYPE_C[t.type]} onClick={() => setFilter(t.type)} />
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🕓 TIMELINE PERUBAHAN — {versions.length}</div>
        <div style={{ marginTop: 10 }}>
          {versions.map((v, i) => (
            <div key={v.id} style={{ display: "flex", gap: 12, padding: "11px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
              <span style={{ fontSize: 20, width: 24, textAlign: "center" }}>{v.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{v.item_name}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: TYPE_C[v.change_type], background: TYPE_C[v.change_type] + "1f", border: `1px solid ${TYPE_C[v.change_type]}55`, borderRadius: 4, padding: "2px 7px", fontFamily: "'Geist Mono',monospace" }}>{(v.label || v.change_type).toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 12, color: "#9da7b3", margin: "3px 0" }}>{v.summary}</div>
                <div style={{ fontSize: 11, fontFamily: "'Geist Mono',monospace" }}>
                  <span style={{ color: "#f87171" }}>{v.old_value}</span>
                  <span style={{ color: "#5b6470" }}> → </span>
                  <span style={{ color: "#34d399" }}>{v.new_value}</span>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: "#9da7b3" }}>{v.changed_by}</div>
                <div style={{ fontSize: 10, color: "#5b6470" }}>{ago(v.changed_at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, on, c, onClick }) {
  return (
    <button onClick={onClick} style={{ background: on ? c : "#0a0e16", border: `1px solid ${on ? c : "#21262d"}`, color: on ? "#0a0e16" : "#9da7b3", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
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
