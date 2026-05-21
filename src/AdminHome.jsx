// src/AdminHome.jsx
// Dashboard Baru — home. KPI + dashboard outlet (antrian order live)
// tampil langsung, plus akses ke Tools / Management / fitur lain.

import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtK = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "jt" : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(n || 0);
const ago = (t) => { const s = Math.floor((Date.now() - t) / 60000); return s < 1 ? "baru" : s < 60 ? s + "m" : Math.floor(s / 60) + "j"; };

const QUEUE = [
  { key: "waiting", label: "Menunggu", c: "#f59e0b" },
  { key: "preparing", label: "Diproses", c: "#3b82f6" },
  { key: "ready", label: "Siap Ambil", c: "#10b981" },
];

export default function AdminHome({ adminSession, onLogout, onExit, onNav }) {
  const [now, setNow] = useState(new Date());
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [k, setK] = useState({ revenue: null, orders: null, active: null, alerts: null, crit: 0, health: null });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const start = t0.getTime();
    const loadOrders = () => fetch(`${API}/api/orders`).then(r => r.json()).then(o => {
      const arr = Array.isArray(o) ? o : [];
      const today = arr.filter(x => (x.time || 0) >= start);
      const done = today.filter(x => x.status === "completed");
      const active = arr.filter(x => !["completed", "cancelled", "refunded", "partial_refund"].includes(x.status));
      setOrders(active); setAllOrders(arr);
      setK(p => ({ ...p, revenue: done.reduce((s, x) => s + (x.total || 0), 0), orders: today.length, active: active.length }));
    }).catch(() => {});
    loadOrders();
    const iv = setInterval(loadOrders, 15000);
    fetch(`${API}/api/notification-center`).then(r => r.json()).then(d => {
      const n = d.notifications || [];
      setK(p => ({ ...p, alerts: n.length, crit: n.filter(x => x.priority === "high" || x.priority === "critical").length }));
    }).catch(() => {});
    fetch(`${API}/api/self-audit`).then(r => r.json()).then(d => {
      setK(p => ({ ...p, health: d.health_score }));
    }).catch(() => {});
    return () => clearInterval(iv);
  }, []);

  const hour = now.getHours();
  const greet = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 19 ? "Selamat sore" : "Selamat malam";
  const vv = (x, f) => x == null ? "…" : (f ? f(x) : x);
  const openTab = (q) => window.open(window.location.pathname + q, "_blank");

  // ── data penjualan ──
  const dayRev = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const s0 = d.getTime();
    dayRev.push({ d: d.toLocaleDateString("id-ID", { weekday: "short" }),
      rev: allOrders.filter(o => o.status === "completed" && o.time >= s0 && o.time < s0 + 864e5).reduce((a, o) => a + (o.total || 0), 0) });
  }
  const maxRev = Math.max(1, ...dayRev.map(x => x.rev));
  const itemMap = {};
  allOrders.filter(o => o.status !== "cancelled").forEach(o => (o.items || []).forEach(it => {
    const n = it.n || "?"; (itemMap[n] = itemMap[n] || { qty: 0, e: it.e || "🍽️" }).qty += (it.q || 0);
  }));
  const topItems = Object.entries(itemMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
  const weekRev = dayRev.reduce((s, x) => s + x.rev, 0);

  const kpis = [
    { label: "Penjualan Hari Ini", val: vv(k.revenue, fmtRp), c: "#10b981", icon: "💰" },
    { label: "Order Hari Ini", val: vv(k.orders), sub: k.active != null ? `${k.active} aktif` : "", c: "#3b82f6", icon: "🧾" },
    { label: "Alert Aktif", val: vv(k.alerts), sub: k.crit ? `${k.crit} mendesak` : "aman", c: k.crit > 0 ? "#ef4444" : "#f59e0b", icon: "🔔" },
    { label: "System Health", val: k.health == null ? "…" : k.health + "/100", c: k.health >= 75 ? "#10b981" : k.health >= 50 ? "#f59e0b" : "#ef4444", icon: "🔎" },
  ];
  const primary = [
    { label: "Tools", desc: "Admin Tools — 107 modul operasi, produk, finance, HR", icon: "🛠️", c: "#f59e0b", on: () => onNav("tools") },
    { label: "Management", desc: "Command Center — 13 dashboard realtime monitoring", icon: "📊", c: "#3b82f6", on: () => openTab("?command=1") },
  ];
  const columns = [
    { title: "OUTLET", items: [
      { label: "Transaksi Outlet", icon: "🧾", c: "#10b981", on: () => onNav("admin", "orders") },
      { label: "Menu & Stok", icon: "🍔", c: "#f59e0b", on: () => onNav("admin", "menu") },
      { label: "QR Meja", icon: "🪑", c: "#a855f7", on: () => onNav("admin", "qrgen") },
      { label: "Pengaturan", icon: "⚙️", c: "#7d8590", on: () => onNav("admin", "settings") },
    ] },
    { title: "SURFACE OPERASIONAL", items: [
      { label: "POS Kasir", icon: "🧾", c: "#10b981", on: () => openTab("?pos=1") },
      { label: "KDS Dapur", icon: "👨‍🍳", c: "#f97316", on: () => openTab("?kds=1") },
      { label: "CDS Display", icon: "📺", c: "#a855f7", on: () => openTab("?cds=1") },
    ] },
    { title: "MANAJEMEN & DATA", items: [
      { label: "Member & Customer", icon: "👥", c: "#3b82f6", on: () => onNav("members") },
      { label: "Promo Code", icon: "🏷️", c: "#ec4899", on: () => onNav("promo") },
      { label: "Operasional / Shift", icon: "📋", c: "#f59e0b", on: () => onNav("shift") },
      { label: "Laporan", icon: "📊", c: "#10b981", on: () => onNav("report") },
      { label: "ESB Sync", icon: "🔗", c: "#22d3ee", on: () => onNav("esb-sync") },
      { label: "Push Notif", icon: "🔔", c: "#a855f7", on: () => onNav("esb-notif") },
    ] },
  ];

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      <div style={S.header}>
        <div>
          <div style={S.brand}>karya<span style={{ color: "#f59e0b" }}>OS</span></div>
          <div style={S.brandSub}>ENTERPRISE F&B OPERATING SYSTEM</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={S.clock}>{now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
          <div style={S.date}>
            {greet}, <b style={{ color: "#9da7b3" }}>{adminSession?.name || "Admin"}</b> · {now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      </div>

      {/* KPI */}
      <div style={S.kpiRow}>
        {kpis.map(x => (
          <div key={x.label} style={{ ...S.kpi, borderTop: `2px solid ${x.c}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={S.kpiLabel}>{x.label}</div>
              <span style={{ fontSize: 17 }}>{x.icon}</span>
            </div>
            <div style={{ ...S.kpiVal, color: x.c }}>{x.val}</div>
            <div style={S.kpiSub}>{x.sub || " "}</div>
          </div>
        ))}
      </div>

      {/* Dashboard Outlet — antrian order live, tampil langsung */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={S.sectionLabel}>DASHBOARD OUTLET — ANTRIAN ORDER</div>
        <button onClick={() => onNav("admin", "overview")} style={S.linkBtn}>buka penuh →</button>
      </div>
      <div style={S.queueRow}>
        {QUEUE.map(q => {
          const list = orders.filter(o => o.status === q.key);
          return (
            <div key={q.key} style={{ ...S.queueCol, borderTop: `2px solid ${q.c}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: q.c }}>● {q.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: q.c, fontFamily: "'Space Mono',monospace" }}>{list.length}</span>
              </div>
              {list.length === 0
                ? <div style={{ fontSize: 11, color: "#5b6470", padding: "6px 0" }}>Tidak ada order</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {list.slice(0, 4).map(o => (
                      <div key={o.id} style={S.orderChip}>
                        <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, color: "#e6edf3" }}>#{o.id}</span>
                        <span style={{ color: "#7d8590" }}>{o.type === "dine" ? `🪑${o.table}` : "🛍️"}</span>
                        <span style={{ flex: 1, textAlign: "right", color: "#9da7b3", fontFamily: "'Space Mono',monospace" }}>{fmtK(o.total)}</span>
                        <span style={{ color: "#5b6470", fontSize: 10 }}>{ago(o.time)}</span>
                      </div>
                    ))}
                    {list.length > 4 && <div style={{ fontSize: 10, color: "#5b6470" }}>+{list.length - 4} lagi…</div>}
                  </div>}
            </div>
          );
        })}
      </div>

      {/* Data penjualan — revenue 7 hari + menu terlaris */}
      <div style={S.sectionLabel}>DATA PENJUALAN</div>
      <div style={S.salesRow}>
        <div style={S.salesCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={S.cardKick}>📈 REVENUE 7 HARI</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#10b981", fontFamily: "'Space Mono',monospace" }}>{fmtRp(weekRev)}</span>
          </div>
          <div style={S.barRow}>
            {dayRev.map((x, i) => (
              <div key={i} style={S.barCol}>
                <div style={S.barVal}>{x.rev > 0 ? fmtK(x.rev) : ""}</div>
                <div style={{ width: "100%", borderRadius: "4px 4px 0 0", height: Math.max(3, (x.rev / maxRev) * 78), background: i === 6 ? "#10b981" : "#10b98155" }} />
                <div style={S.barLbl}>{x.d}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={S.salesCard}>
          <div style={S.cardKick}>🏆 MENU TERLARIS</div>
          <div style={{ marginTop: 8 }}>
            {topItems.length === 0
              ? <div style={{ fontSize: 11, color: "#5b6470" }}>Belum ada data penjualan</div>
              : topItems.map(([n, d], i) => (
                  <div key={n} style={S.topRow}>
                    <span style={{ width: 16, color: "#5b6470", fontFamily: "'Space Mono',monospace", fontSize: 10 }}>#{i + 1}</span>
                    <span style={{ fontSize: 14 }}>{d.e}</span>
                    <span style={{ flex: 1, fontSize: 12, color: "#cdd5df", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n}</span>
                    <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, color: "#10b981", fontSize: 12 }}>{d.qty}×</span>
                  </div>
                ))}
          </div>
        </div>
      </div>

      {/* Akses utama */}
      <div style={S.sectionLabel}>AKSES UTAMA</div>
      <div style={S.primaryRow}>
        {primary.map(t => (
          <button key={t.label} className="tile" style={{ ...S.primaryTile, borderColor: `${t.c}33` }} onClick={t.on}>
            <div style={{ ...S.tileIcon, background: `${t.c}1f`, width: 44, height: 44, fontSize: 26 }}>{t.icon}</div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#e6edf3" }}>{t.label}</div>
              <div style={{ fontSize: 11.5, color: "#7d8590", marginTop: 2 }}>{t.desc}</div>
            </div>
            <span style={{ color: t.c, fontSize: 20 }}>→</span>
          </button>
        ))}
      </div>

      {/* 3 kolom akses */}
      <div style={S.cols}>
        {columns.map(col => (
          <div key={col.title}>
            <div style={S.sectionLabel}>{col.title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {col.items.map(t => (
                <button key={t.label} className="tile" style={{ ...S.rowTile, borderColor: `${t.c}33` }} onClick={t.on}>
                  <div style={{ ...S.tileIcon, background: `${t.c}1f`, width: 34, height: 34, fontSize: 16 }}>{t.icon}</div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3", flex: 1, textAlign: "left" }}>{t.label}</span>
                  <span style={{ color: t.c, fontSize: 15 }}>→</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={S.footer}>
        <button style={S.footBtn} onClick={onExit}>← Kiosk</button>
        {onLogout && <button style={{ ...S.footBtn, color: "#f87171", borderColor: "#f8717133" }} onClick={onLogout}>Logout</button>}
        <span style={{ flex: 1 }} />
        <span style={S.footNote}>karyaOS · 107 modul backend · v4</span>
      </div>
    </div>
  );
}

const CSS = `
.tile { cursor:pointer; transition: border-color .15s, transform .1s, background .15s; }
.tile:hover { transform: translateY(-2px); background:#11161d !important; }
.tile:active { transform: translateY(0); }
`;

const S = {
  root: { minHeight: "100vh", background: "#080a0f", color: "#cdd5df", fontFamily: "'Geist','Plus Jakarta Sans',system-ui,sans-serif", padding: "14px 26px", boxSizing: "border-box" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  brand: { fontSize: 24, fontWeight: 800, color: "#e6edf3", letterSpacing: -0.5 },
  brandSub: { fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace", letterSpacing: 2, marginTop: 2 },
  clock: { fontSize: 20, fontWeight: 700, color: "#e6edf3", fontFamily: "'Space Mono',monospace" },
  date: { fontSize: 11.5, color: "#5b6470", marginTop: 3 },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 4 },
  kpi: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: "10px 13px" },
  kpiLabel: { fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace", letterSpacing: 0.5, textTransform: "uppercase" },
  kpiVal: { fontSize: 21, fontWeight: 800, fontFamily: "'Space Mono',monospace", margin: "3px 0 0" },
  kpiSub: { fontSize: 11, color: "#5b6470" },
  sectionLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#5b6470", fontFamily: "'Space Mono',monospace", margin: "12px 2px 7px" },
  linkBtn: { background: "transparent", border: "none", color: "#3b82f6", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace" },
  queueRow: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 },
  queueCol: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 11, padding: "10px 13px", minHeight: 96 },
  orderChip: { display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, background: "#0a0e16", border: "1px solid #161b22", borderRadius: 7, padding: "5px 9px" },
  salesRow: { display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12 },
  salesCard: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 11, padding: "11px 14px" },
  cardKick: { fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  barRow: { display: "flex", alignItems: "flex-end", gap: 8, height: 104, marginTop: 6 },
  barCol: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  barVal: { fontSize: 9, color: "#10b981", fontFamily: "'Space Mono',monospace" },
  barLbl: { fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  topRow: { display: "flex", alignItems: "center", gap: 9, padding: "4px 0" },
  primaryRow: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 },
  primaryTile: { display: "flex", alignItems: "center", gap: 13, background: "#0d1117", border: "1px solid #161b22", borderRadius: 13, padding: "11px 18px", fontFamily: "inherit" },
  cols: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, alignItems: "start" },
  rowTile: { display: "flex", alignItems: "center", gap: 11, background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "7px 12px", fontFamily: "inherit", width: "100%" },
  tileIcon: { borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  footer: { display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 11, borderTop: "1px solid #161b22" },
  footBtn: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 8, padding: "7px 15px", color: "#9da7b3", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  footNote: { fontSize: 10, color: "#3a4150", fontFamily: "'Space Mono',monospace" },
};
