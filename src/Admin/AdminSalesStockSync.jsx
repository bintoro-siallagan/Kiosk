// src/Admin/AdminSalesStockSync.jsx
// Sales → Stock live hook — integrasi penjualan ke gudang.

import { useState, useEffect, useCallback } from "react";

const AC = "#14b8a6";
const ago = (ts) => {
  if (!ts) return "—";
  const m = Math.floor((Date.now() / 1000 - ts) / 60);
  if (m < 1) return "baru saja";
  if (m < 60) return m + " mnt lalu";
  const h = Math.floor(m / 60);
  return h < 24 ? h + " hr lalu" : Math.floor(h / 24) + " day lalu";
};

export default function AdminSalesStockSync({ apiBase = "" }) {
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/sales-stock-sync`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // auto-refresh — feed live
    return () => clearInterval(t);
  }, [load]);

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Sales → Stock Sync…</div>;
  const s = d.summary;
  const maxIng = Math.max(1, ...d.top_ingredients.map(i => i.total));

  return (
    <div>
      <div style={S.intro}>
        🔗 <b style={{ color: "#2dd4bf" }}>SALES → STOCK SYNC</b> — integrasi live. Tiap order POS / Kiosk
        baru, bahan baku resep <b>otomatis dikonsumsi</b> dari gudang. Inventory selalu real-time sama penjualan.
      </div>

      <div style={{ ...S.card, marginBottom: 14, borderColor: "#14b8a644", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
        <span style={{ fontSize: 13, color: "#9da7b3" }}>
          <b style={{ color: "#34d399" }}>HOOK AKTIF</b> — terpasang di order pipeline. Coverage resep <b style={{ color: "#2dd4bf" }}>{s.recipe_coverage}</b> menu ({s.coverage_pct}%).
        </span>
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Order Ter-sync" v={String(s.orders_synced)} c={AC} />
        <Kpi label="Baris Konsumsi" v={String(s.consumption_lines)} c="#3b82f6" />
        <Kpi label="Coverage Resep" v={s.recipe_coverage} c="#10b981" />
        <Kpi label="Coverage %" v={s.coverage_pct + "%"} c="#a855f7" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        <div style={S.card}>
          <div style={S.kicker}>🥣 BAHAN PALING BANYAK DIKONSUMSI</div>
          {d.top_ingredients.length === 0 ? (
            <div style={{ fontSize: 12, color: "#5b6470", padding: "10px 0" }}>No konsumsi. Hook menunggu transaksi baru.</div>
          ) : d.top_ingredients.map(i => (
            <div key={i.sku} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0" }}>
              <span style={{ width: 110, fontSize: 12, color: "#cdd5df" }}>{i.name}</span>
              <div style={{ flex: 1, height: 10, background: "#0a0e16", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.round(i.total / maxIng * 100) + "%", background: AC }} />
              </div>
              <span style={{ width: 70, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#2dd4bf" }}>{i.total} {i.unit}</span>
            </div>
          ))}
        </div>

        <div style={S.card}>
          <div style={S.kicker}>📜 LOG KONSUMSI STOK — 40 terbaru</div>
          {d.log.length === 0 ? (
            <div style={{ fontSize: 12, color: "#5b6470", padding: "10px 0", lineHeight: 1.6 }}>
              No konsumsi tercatat. Begitu ada order POS/Kiosk baru pakai menu ber-resep,
              konsumsi bahan baku langsung muncul di sini & stok gudang berkurang otomatis.
            </div>
          ) : d.log.map(l => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
              <span style={{ fontFamily: "'Geist Mono',monospace", color: "#5b6470", width: 70 }}>#{l.order_ref}</span>
              <span style={{ flex: 1, color: "#e6edf3" }}>{l.item_name} <span style={{ color: "#5b6470", fontSize: 10 }}>{l.sku}</span></span>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#f87171" }}>−{l.qty_consumed} {l.unit}</span>
              <span style={{ color: "#5b6470", fontSize: 10, width: 76, textAlign: "right" }}>{ago(l.at)}</span>
            </div>
          ))}
        </div>
      </div>
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
