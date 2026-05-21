// src/AdminHome.jsx
// Dashboard Baru — home / landing utama. KPI ringkas + akses ke semua
// fitur dalam 3 kolom (Outlet · Surface · Manajemen) — muat 1 layar.

import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export default function AdminHome({ adminSession, onLogout, onExit, onNav }) {
  const [now, setNow] = useState(new Date());
  const [k, setK] = useState({ revenue: null, orders: null, active: null, alerts: null, crit: 0, health: null });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const start = t0.getTime();
    fetch(`${API}/api/orders`).then(r => r.json()).then(o => {
      const arr = Array.isArray(o) ? o : [];
      const today = arr.filter(x => (x.time || 0) >= start);
      const done = today.filter(x => x.status === "completed");
      const active = arr.filter(x => !["completed", "cancelled", "refunded", "partial_refund"].includes(x.status));
      setK(p => ({ ...p, revenue: done.reduce((s, x) => s + (x.total || 0), 0), orders: today.length, active: active.length }));
    }).catch(() => {});
    fetch(`${API}/api/notification-center`).then(r => r.json()).then(d => {
      const n = d.notifications || [];
      setK(p => ({ ...p, alerts: n.length, crit: n.filter(x => x.priority === "high" || x.priority === "critical").length }));
    }).catch(() => {});
    fetch(`${API}/api/self-audit`).then(r => r.json()).then(d => {
      setK(p => ({ ...p, health: d.health_score }));
    }).catch(() => {});
  }, []);

  const hour = now.getHours();
  const greet = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 19 ? "Selamat sore" : "Selamat malam";
  const v = (x, f) => x == null ? "…" : (f ? f(x) : x);
  const openTab = (q) => window.open(window.location.pathname + q, "_blank");

  const kpis = [
    { label: "Penjualan Hari Ini", val: v(k.revenue, fmtRp), c: "#10b981", icon: "💰" },
    { label: "Order Hari Ini", val: v(k.orders), sub: k.active != null ? `${k.active} aktif` : "", c: "#3b82f6", icon: "🧾" },
    { label: "Alert Aktif", val: v(k.alerts), sub: k.crit ? `${k.crit} mendesak` : "aman", c: k.crit > 0 ? "#ef4444" : "#f59e0b", icon: "🔔" },
    { label: "System Health", val: k.health == null ? "…" : k.health + "/100", c: k.health >= 75 ? "#10b981" : k.health >= 50 ? "#f59e0b" : "#ef4444", icon: "🔎" },
  ];
  const primary = [
    { label: "Tools", desc: "Admin Tools — 107 modul operasi, produk, finance, HR", icon: "🛠️", c: "#f59e0b", on: () => onNav("tools") },
    { label: "Management", desc: "Command Center — 13 dashboard realtime monitoring", icon: "📊", c: "#3b82f6", on: () => openTab("?command=1") },
  ];
  const columns = [
    { title: "OUTLET", items: [
      { label: "Dashboard Outlet", icon: "🏪", c: "#22d3ee", on: () => onNav("admin", "overview") },
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

      {/* 3 kolom — semua kelihatan tanpa scroll */}
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
  root: { minHeight: "100vh", background: "#080a0f", color: "#cdd5df", fontFamily: "'Geist','Plus Jakarta Sans',system-ui,sans-serif", padding: "12px 26px", boxSizing: "border-box" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  brand: { fontSize: 24, fontWeight: 800, color: "#e6edf3", letterSpacing: -0.5 },
  brandSub: { fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace", letterSpacing: 2, marginTop: 2 },
  clock: { fontSize: 20, fontWeight: 700, color: "#e6edf3", fontFamily: "'Space Mono',monospace" },
  date: { fontSize: 11.5, color: "#5b6470", marginTop: 3 },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 4 },
  kpi: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: "9px 13px" },
  kpiLabel: { fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace", letterSpacing: 0.5, textTransform: "uppercase" },
  kpiVal: { fontSize: 21, fontWeight: 800, fontFamily: "'Space Mono',monospace", margin: "3px 0 0" },
  kpiSub: { fontSize: 11, color: "#5b6470" },
  sectionLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#5b6470", fontFamily: "'Space Mono',monospace", margin: "10px 2px 6px" },
  primaryRow: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 },
  primaryTile: { display: "flex", alignItems: "center", gap: 13, background: "#0d1117", border: "1px solid #161b22", borderRadius: 13, padding: "10px 16px", fontFamily: "inherit" },
  cols: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, alignItems: "start" },
  rowTile: { display: "flex", alignItems: "center", gap: 11, background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "6px 11px", fontFamily: "inherit", width: "100%" },
  tileIcon: { borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  footer: { display: "flex", alignItems: "center", gap: 10, marginTop: 11, paddingTop: 9, borderTop: "1px solid #161b22" },
  footBtn: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 8, padding: "7px 15px", color: "#9da7b3", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  footNote: { fontSize: 10, color: "#3a4150", fontFamily: "'Space Mono',monospace" },
};
