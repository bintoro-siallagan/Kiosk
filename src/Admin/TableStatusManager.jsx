// src/Admin/TableStatusManager.jsx
// Manage table status — view available/occupied/reserved + manual release.
// Auto-release sudah ada di backend saat order completed/cancelled,
// tapi UI ini buat kasir/manager kalau perlu force release atau cek status.

import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

const ST = {
  available: { c: "#10b981", label: "TERSEDIA", emoji: "🟢" },
  occupied:  { c: "#ef4444", label: "TERPAKAI", emoji: "🔴" },
  reserved:  { c: "#f59e0b", label: "RESERVED",  emoji: "🟡" },
  cleaning:  { c: "#a855f7", label: "DIBERSIHKAN", emoji: "🟣" },
};

export default function TableStatusManager() {
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([
        fetch(`${API}/api/tables`).then(r => r.json()),
        fetch(`${API}/api/orders`).then(r => r.json()),
      ]);
      setTables(Array.isArray(t) ? t : []);
      setOrders(Array.isArray(o) ? o : []);
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); const iv = setInterval(load, 10_000); return () => clearInterval(iv); }, [load]);

  const setStatus = async (table, status) => {
    setMsg("");
    try {
      const r = await fetch(`${API}/api/tables/${table.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (r.ok) {
        setMsg(`✓ ${table.name} → ${ST[status]?.label || status}`);
        await load();
      } else {
        setMsg(`✗ Gagal update ${table.name}`);
      }
    } catch { setMsg("✗ Network error"); }
  };

  const ordersByTable = {};
  for (const o of orders) {
    if (o.type === "dine" && !["completed", "cancelled", "refunded"].includes(o.status)) {
      const key = o.table;
      if (!ordersByTable[key]) ordersByTable[key] = [];
      ordersByTable[key].push(o);
    }
  }

  const counts = tables.reduce((acc, t) => {
    const s = t.status || "available";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  // Group by zone
  const zones = {};
  for (const t of tables) {
    const z = t.zone || "Other";
    if (!zones[z]) zones[z] = [];
    zones[z].push(t);
  }

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div>
          <div style={S.title}>🪑 Status Meja</div>
          <div style={S.sub}>
            Auto-release saat order completed · Manual release untuk koreksi
          </div>
        </div>
        <div style={S.statsRow}>
          {Object.entries(ST).map(([k, meta]) => (
            <div key={k} style={{ ...S.statChip, borderColor: meta.c + "55", color: meta.c }}>
              {meta.emoji} {counts[k] || 0} {meta.label}
            </div>
          ))}
          <button onClick={load} style={S.refreshBtn}>↻ Refresh</button>
        </div>
      </div>

      {msg && (
        <div style={{ ...S.msg, background: msg.startsWith("✓") ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", borderColor: msg.startsWith("✓") ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)", color: msg.startsWith("✓") ? "#34d399" : "#fca5a5" }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#5b6470" }}>Memuat meja…</div>
      ) : tables.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#5b6470" }}>
          Belum ada meja terdaftar. Tambah meja di tab QR Meja.
        </div>
      ) : (
        Object.keys(zones).sort().map(z => (
          <div key={z} style={{ marginBottom: 18 }}>
            <div style={S.zoneTitle}>ZONE {z}</div>
            <div style={S.grid}>
              {zones[z].map(t => {
                const status = t.status || "available";
                const meta = ST[status] || ST.available;
                const tableOrders = ordersByTable[t.id] || ordersByTable[t.name] || [];
                const isOccupied = status === "occupied";
                return (
                  <div key={t.id} style={{ ...S.card, borderColor: meta.c + "55" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={S.tableName}>{t.name || t.id}</div>
                        <div style={S.tableMeta}>{t.capacity || 4} pax · {t.id}</div>
                      </div>
                      <div style={{ ...S.statusBadge, color: meta.c, background: meta.c + "1a", borderColor: meta.c + "44" }}>
                        {meta.emoji} {meta.label}
                      </div>
                    </div>

                    {tableOrders.length > 0 && (
                      <div style={S.orderList}>
                        {tableOrders.map(o => (
                          <div key={o.id} style={S.orderRow}>
                            <span style={{ fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 700 }}>#{o.id}</span>
                            <span style={{ flex: 1, color: "#9ca3af", fontSize: 11, marginLeft: 6 }}>
                              {o.customerName || "—"} · {o.status}
                            </span>
                            <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "'Geist Mono',monospace" }}>
                              Rp {(o.total || 0).toLocaleString("id-ID")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={S.btnRow}>
                      {status !== "available" && (
                        <button
                          onClick={() => {
                            if (isOccupied && tableOrders.length > 0) {
                              if (!confirm(`Ada ${tableOrders.length} order aktif di ${t.name}. Yakin release manual? Order harus di-complete dulu di POS biar terhitung revenue.`)) return;
                            }
                            setStatus(t, "available");
                          }}
                          style={{ ...S.btn, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399" }}>
                          ✓ Release
                        </button>
                      )}
                      {status === "available" && (
                        <button onClick={() => setStatus(t, "reserved")}
                          style={{ ...S.btn, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}>
                          🟡 Reserve
                        </button>
                      )}
                      {status !== "cleaning" && (
                        <button onClick={() => setStatus(t, "cleaning")}
                          style={{ ...S.btn, background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", color: "#c084fc" }}>
                          🧹 Cleaning
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <div style={S.helpBox}>
        💡 <b>Tips:</b> Auto-release jalan otomatis saat order completed/cancelled.
        Manual release untuk koreksi (mis. customer ninggalin meja tanpa close bill di POS).
        Status <b>cleaning</b> untuk meja yang baru ditinggalkan dan perlu dibersihkan dulu
        sebelum customer berikutnya.
      </div>
    </div>
  );
}

const S = {
  root: { padding: "16px 4px", color: "#fff", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 14 },
  title: { fontSize: 22, fontWeight: 800, letterSpacing: -0.4 },
  sub: { fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 },
  statsRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  statChip: { padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 700, border: "1px solid", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5 },
  refreshBtn: { padding: "6px 14px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)", color: "#9ca3af", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  msg: { marginBottom: 14, padding: "9px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: "1px solid" },
  zoneTitle: { fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 1.4, fontWeight: 700, marginBottom: 10, fontFamily: "'Geist Mono',monospace" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 },
  card: { background: "linear-gradient(180deg,#15171c 0%,#0d0f14 100%)", border: "1px solid", borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.3),0 6px 20px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.04)", transition: "all 0.2s" },
  tableName: { fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: -0.3 },
  tableMeta: { fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "'Geist Mono',monospace", marginTop: 2 },
  statusBadge: { fontSize: 10, padding: "3px 9px", borderRadius: 6, fontWeight: 800, letterSpacing: 0.7, border: "1px solid", fontFamily: "'Geist Mono',monospace" },
  orderList: { marginTop: 12, padding: "8px 10px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 },
  orderRow: { display: "flex", alignItems: "center", padding: "2px 0", fontSize: 12 },
  btnRow: { display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" },
  btn: { flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap" },
  helpBox: { marginTop: 18, padding: "12px 16px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 },
};
