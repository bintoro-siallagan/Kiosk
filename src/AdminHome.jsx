// src/AdminHome.jsx
// Dashboard Baru — home / landing utama. KPI ringkas + akses cepat ke
// Tools, Management (Command Center) & semua surface operasional.

import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtShort = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + " jt" : n >= 1e3 ? Math.round(n / 1e3) + " rb" : String(n || 0);

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
  const secondary = [
    { label: "POS Kasir", icon: "🧾", c: "#10b981", on: () => openTab("?pos=1") },
    { label: "KDS Dapur", icon: "👨‍🍳", c: "#f97316", on: () => openTab("?kds=1") },
    { label: "CDS Display", icon: "📺", c: "#a855f7", on: () => openTab("?cds=1") },
    { label: "Dashboard Outlet", icon: "🏪", c: "#22d3ee", on: () => onNav("admin") },
  ];

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.brand}>karya<span style={{ color: "#f59e0b" }}>OS</span></div>
          <div style={S.brandSub}>ENTERPRISE F&B OPERATING SYSTEM</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={S.clock}>{now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
          <div style={S.date}>{now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
      </div>

      {/* Greeting */}
      <div style={S.greet}>
        {greet}, <b style={{ color: "#e6edf3" }}>{adminSession?.name || "Admin"}</b>
        <span style={S.role}>{adminSession?.role || "—"}</span>
      </div>

      {/* KPI */}
      <div style={S.kpiRow}>
        {kpis.map(x => (
          <div key={x.label} style={{ ...S.kpi, borderTop: `2px solid ${x.c}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={S.kpiLabel}>{x.label}</div>
              <span style={{ fontSize: 18 }}>{x.icon}</span>
            </div>
            <div style={{ ...S.kpiVal, color: x.c }}>{x.val}</div>
            <div style={S.kpiSub}>{x.sub || " "}</div>
          </div>
        ))}
      </div>

      {/* Primary access */}
      <div style={S.sectionLabel}>AKSES UTAMA</div>
      <div style={S.primaryRow}>
        {primary.map(t => (
          <button key={t.label} className="tile" style={{ ...S.primaryTile, borderColor: `${t.c}33` }} onClick={t.on}>
            <div style={{ ...S.tileIcon, background: `${t.c}1f`, fontSize: 30 }}>{t.icon}</div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: "#e6edf3" }}>{t.label}</div>
              <div style={{ fontSize: 12, color: "#7d8590", marginTop: 3 }}>{t.desc}</div>
            </div>
            <span style={{ color: t.c, fontSize: 22 }}>→</span>
          </button>
        ))}
      </div>

      {/* Secondary access */}
      <div style={S.sectionLabel}>SURFACE OPERASIONAL</div>
      <div style={S.secondaryRow}>
        {secondary.map(t => (
          <button key={t.label} className="tile" style={{ ...S.secondaryTile, borderColor: `${t.c}33` }} onClick={t.on}>
            <div style={{ ...S.tileIcon, background: `${t.c}1f`, fontSize: 22 }}>{t.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{t.label}</div>
          </button>
        ))}
      </div>

      {/* Footer */}
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
  root: { minHeight: "100vh", background: "#080a0f", color: "#cdd5df", fontFamily: "'Geist','Plus Jakarta Sans',system-ui,sans-serif", padding: "26px 32px", boxSizing: "border-box" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 },
  brand: { fontSize: 26, fontWeight: 800, color: "#e6edf3", letterSpacing: -0.5 },
  brandSub: { fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace", letterSpacing: 2, marginTop: 2 },
  clock: { fontSize: 22, fontWeight: 700, color: "#e6edf3", fontFamily: "'Space Mono',monospace" },
  date: { fontSize: 12, color: "#5b6470", marginTop: 2 },
  greet: { fontSize: 15, color: "#7d8590", marginBottom: 18 },
  role: { fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "#f59e0b1f", border: "1px solid #f59e0b44", borderRadius: 5, padding: "2px 8px", marginLeft: 10, fontFamily: "'Space Mono',monospace", textTransform: "uppercase" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 },
  kpi: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: "14px 16px" },
  kpiLabel: { fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace", letterSpacing: 0.5, textTransform: "uppercase" },
  kpiVal: { fontSize: 24, fontWeight: 800, fontFamily: "'Space Mono',monospace", margin: "8px 0 2px" },
  kpiSub: { fontSize: 11, color: "#5b6470" },
  sectionLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#5b6470", fontFamily: "'Space Mono',monospace", margin: "4px 2px 10px" },
  primaryRow: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginBottom: 24 },
  primaryTile: { display: "flex", alignItems: "center", gap: 16, background: "#0d1117", border: "1px solid #161b22", borderRadius: 14, padding: "20px 22px", fontFamily: "inherit" },
  secondaryRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 },
  secondaryTile: { display: "flex", flexDirection: "column", alignItems: "center", gap: 9, background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: "20px 14px", fontFamily: "inherit" },
  tileIcon: { width: 52, height: 52, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  footer: { display: "flex", alignItems: "center", gap: 10, marginTop: 30, paddingTop: 16, borderTop: "1px solid #161b22" },
  footBtn: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 8, padding: "8px 16px", color: "#9da7b3", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  footNote: { fontSize: 10, color: "#3a4150", fontFamily: "'Space Mono',monospace" },
};
