// src/AdminHome.jsx
// Dashboard Baru — home. Status operasional · KPI (period + tren +
// target) · performa outlet · live sales · monitoring · penjualan.

import { useState, useEffect, useCallback } from "react";
import CommandCenter from "./CommandCenter.jsx";
import AdminTools from "./AdminTools.jsx";
import Admin from "./Admin.jsx";
import Report from "./Report.jsx";
import ESBSync from "./ESBSync.jsx";
import ESBNotif from "./ESBNotif.jsx";
import MemberList from "./MemberList.jsx";
import PromoManager from "./PromoManager.jsx";
import ShiftManager from "./ShiftManager.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtK = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "jt" : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(Math.round(n) || 0);
const ago = (t) => { const s = Math.floor((Date.now() - t) / 60000); return s < 1 ? "baru" : s < 60 ? s + "m" : Math.floor(s / 60) + "j"; };
const DAY = 864e5;

const QUEUE = [
  { key: "waiting", label: "Menunggu", c: "#f59e0b" },
  { key: "preparing", label: "Diproses", c: "#3b82f6" },
  { key: "ready", label: "Siap Ambil", c: "#10b981" },
];
const PERIODS = [{ k: "today", l: "Hari Ini", d: 1 }, { k: "7d", l: "7 Hari", d: 7 }, { k: "30d", l: "30 Hari", d: 30 }];

export default function AdminHome({ adminSession, onLogout, onExit, onNav }) {
  const [now, setNow] = useState(new Date());
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [period, setPeriod] = useState("today");
  const [health, setHealth] = useState(null);
  const [openSub, setOpenSub] = useState(null);
  const [rightView, setRightView] = useState("home");
  const [rightArg, setRightArg] = useState(null);
  const openRight = (kind, arg) => { setRightView(kind); setRightArg(arg || null); };
  const closeRight = () => { setRightView("home"); setRightArg(null); };

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const loadOrders = () => fetch(`${API}/api/orders`).then(r => r.json()).then(o => {
      const arr = Array.isArray(o) ? o : [];
      setAllOrders(arr);
      setOrders(arr.filter(x => !["completed", "cancelled", "refunded", "partial_refund"].includes(x.status)));
    }).catch(() => {});
    loadOrders();
    const iv = setInterval(loadOrders, 15000);
    const loadNotif = () => fetch(`${API}/api/notification-center`).then(r => r.json()).then(d => setNotifs(d.notifications || [])).catch(() => {});
    loadNotif();
    const ivN = setInterval(loadNotif, 20000);
    fetch(`${API}/api/self-audit`).then(r => r.json()).then(d => setHealth(d.health_score)).catch(() => {});
    fetch(`${API}/api/outlet-master`).then(r => r.json()).then(d => setOutlets(d.outlets || [])).catch(() => {});
    return () => { clearInterval(iv); clearInterval(ivN); };
  }, []);

  const hour = now.getHours();
  const greet = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 19 ? "Selamat sore" : "Selamat malam";
  const openTab = (q) => window.open(window.location.pathname + q, "_blank");

  // ── period KPI + tren ──
  const winDays = PERIODS.find(p => p.k === period).d;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const startCur = t0.getTime() - (winDays - 1) * DAY;
  const rev = (arr) => arr.filter(o => o.status === "completed").reduce((s, o) => s + (o.total || 0), 0);
  const curOrders = allOrders.filter(o => (o.time || 0) >= startCur);
  const prevOrders = allOrders.filter(o => (o.time || 0) >= startCur - winDays * DAY && (o.time || 0) < startCur);
  const curRev = rev(curOrders), prevRev = rev(prevOrders);
  const revDelta = prevRev > 0 ? Math.round((curRev - prevRev) / prevRev * 100) : (curRev > 0 ? 100 : 0);
  const ordDelta = prevOrders.length > 0 ? Math.round((curOrders.length - prevOrders.length) / prevOrders.length * 100) : (curOrders.length > 0 ? 100 : 0);
  const target = winDays * 3000000;
  const targetPct = Math.round(curRev / target * 100);
  const periodLabel = PERIODS.find(p => p.k === period).l;

  // ── revenue 7 hari + menu ──
  const dayRev = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const s0 = d.getTime();
    dayRev.push({ d: d.toLocaleDateString("id-ID", { weekday: "short" }),
      rev: allOrders.filter(o => o.status === "completed" && o.time >= s0 && o.time < s0 + DAY).reduce((a, o) => a + (o.total || 0), 0) });
  }
  const maxRev = Math.max(1, ...dayRev.map(x => x.rev));
  const itemMap = {};
  allOrders.filter(o => o.status !== "cancelled").forEach(o => (o.items || []).forEach(it => {
    const n = it.n || "?"; (itemMap[n] = itemMap[n] || { qty: 0, e: it.e || "🍽️" }).qty += (it.q || 0);
  }));
  const topItems = Object.entries(itemMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
  const maxQty = Math.max(1, ...topItems.map(([, d]) => d.qty));
  const recentSales = [...allOrders].sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 14);

  // ── outlet performa ──
  const outletRank = [...outlets].sort((a, b) => (b.revenue_today || 0) - (a.revenue_today || 0));
  const maxOutRev = Math.max(1, ...outletRank.map(o => o.revenue_today || 0));
  const activeOutlets = outlets.filter(o => o.status === "active").length;

  // ── status operasional ──
  const isOpen = hour >= 8 && hour < 22;
  const shift = hour < 14 ? { n: "Pagi", t: "08:00–14:00", c: "#f59e0b" } : hour < 22 ? { n: "Siang", t: "14:00–22:00", c: "#3b82f6" } : { n: "Malam", t: "22:00–08:00", c: "#a855f7" };

  const crit = notifs.filter(x => x.priority === "high" || x.priority === "critical").length;
  const PRIO = { critical: { o: 0, c: "#dc2626", l: "KRITIS" }, high: { o: 1, c: "#ef4444", l: "TINGGI" }, medium: { o: 2, c: "#f59e0b", l: "SEDANG" }, low: { o: 3, c: "#5b6470", l: "RENDAH" } };
  const feed = [...notifs].sort((a, b) => (PRIO[a.priority]?.o ?? 9) - (PRIO[b.priority]?.o ?? 9));

  const kpis = [
    { label: `Penjualan ${periodLabel}`, val: fmtRp(curRev), c: "#10b981", icon: "💰", delta: revDelta, progress: targetPct, sub: `target ${fmtK(target)}` },
    { label: `Order ${periodLabel}`, val: String(curOrders.length), c: "#3b82f6", icon: "🧾", delta: ordDelta, sub: `${orders.length} aktif sekarang` },
    { label: "Alert Aktif", val: String(notifs.length), c: crit > 0 ? "#ef4444" : "#f59e0b", icon: "🔔", sub: crit ? `${crit} perlu tindakan` : "semua aman" },
    { label: "System Health", val: health == null ? "…" : health + " / 100", c: health >= 75 ? "#10b981" : health >= 50 ? "#f59e0b" : "#ef4444", icon: "🔎", sub: "self-audit score" },
  ];
  const columns = [
    { title: "Outlet", accent: "#22d3ee", items: [
      { label: "Dashboard Outlet", icon: "🏪", c: "#22d3ee", on: () => openRight("tools", "dashboard") },
      { label: "Pesanan / Transaksi", icon: "🧾", c: "#10b981", on: () => openRight("admin", "orders") },
      { label: "Menu & Stok", icon: "🍔", c: "#f59e0b", on: () => openRight("admin", "menu") },
      { label: "QR Meja", icon: "🪑", c: "#a855f7", on: () => openRight("admin", "qrgen") },
      { label: "Pengaturan", icon: "⚙️", c: "#7d8590", on: () => openRight("admin", "settings") },
    ] },
    { title: "Surface Operasional", accent: "#10b981", items: [
      { label: "POS Kasir", icon: "🧾", c: "#10b981", on: () => openTab("?pos=1") },
      { label: "KDS Dapur", icon: "👨‍🍳", c: "#f97316", on: () => openTab("?kds=1") },
      { label: "CDS Display", icon: "📺", c: "#a855f7", on: () => openTab("?cds=1") },
    ] },
    { title: "Manajemen & Data", accent: "#3b82f6", items: [
      { label: "Member & Customer", icon: "👥", c: "#3b82f6", on: () => openRight("members") },
      { label: "Promo Code", icon: "🏷️", c: "#ec4899", on: () => openRight("promo") },
      { label: "Operasional / Shift", icon: "📋", c: "#f59e0b", on: () => openRight("shift") },
      { label: "Laporan", icon: "📊", c: "#10b981", on: () => openRight("report") },
      { label: "ESB Sync", icon: "🔗", c: "#22d3ee", on: () => openRight("esb-sync") },
      { label: "Push Notif", icon: "🔔", c: "#a855f7", on: () => openRight("esb-notif") },
      { label: "Tools", icon: "🛠️", c: "#f59e0b", sub: [
        { label: "📊 Dashboard", on: () => openRight("tools", "dashboard") },
        { label: "🛰️ Operasi & Outlet", on: () => openRight("tools", "outlet_master") },
        { label: "📦 Product", on: () => openRight("tools", "master_category") },
        { label: "🚚 Inventory & Procurement", on: () => openRight("tools", "stock_list") },
        { label: "🛒 Commerce", on: () => openRight("tools", "master") },
        { label: "💰 Finance", on: () => openRight("tools", "coa") },
        { label: "👥 HRIS & Reward", on: () => openRight("tools", "hris") },
        { label: "🎯 Customer & Marketing", on: () => openRight("tools", "customer_intel") },
        { label: "🔐 Security & Admin", on: () => openRight("tools", "rbac") },
      ] },
      { label: "Management", icon: "📊", c: "#3b82f6", on: () => openRight("command") },
    ] },
  ];

  const Section = ({ label, accent = "#f59e0b", right, mt }) => (
    <div style={{ ...S.sectionHead, marginTop: mt == null ? 16 : mt }}>
      <span style={{ width: 3, height: 13, background: accent, borderRadius: 2 }} />
      <span style={S.sectionLabel}>{label}</span>
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
  const Delta = ({ v }) => v == null ? null : (
    <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: v >= 0 ? "#10b981" : "#ef4444" }}>
      {v >= 0 ? "▲" : "▼"} {Math.abs(v)}%
    </span>
  );

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* Topbar */}
      <div style={S.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={S.logo}>k</div>
          <div>
            <div style={S.brand}>karya<span style={{ color: "#f59e0b" }}>OS</span></div>
            <div style={S.brandSub}>ENTERPRISE F&B OPERATING SYSTEM</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={S.clock}>{now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
          <div style={S.greetLine}>{greet}, <b style={{ color: "#cdd5df" }}>{adminSession?.name || "Admin"}</b>
            <span style={S.role}>{adminSession?.role || "—"}</span></div>
        </div>
      </div>

      {/* Status operasional strip */}
      <div style={S.opStrip}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span className="livedot" style={{ width: 8, height: 8, borderRadius: "50%", background: isOpen ? "#10b981" : "#ef4444", display: "inline-block", boxShadow: `0 0 7px ${isOpen ? "#10b981" : "#ef4444"}` }} />
          <b style={{ color: isOpen ? "#10b981" : "#ef4444" }}>{isOpen ? "OUTLET BEROPERASI" : "DI LUAR JAM OPERASIONAL"}</b>
        </span>
        <span style={S.opDot} />
        <span>Shift <b style={{ color: shift.c }}>{shift.n}</b> <span style={{ color: "#5b6470" }}>{shift.t}</span></span>
        <span style={S.opDot} />
        <span>🏪 <b style={{ color: "#22d3ee" }}>{activeOutlets}/{outlets.length || 6}</b> outlet aktif</span>
        <span style={S.opDot} />
        <span>🧾 <b style={{ color: "#f59e0b" }}>{orders.length}</b> order berjalan</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: "#5b6470" }}>{now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
      </div>

      {/* Body — 2 bagian */}
      <div style={S.body}>

        {/* KIRI: panel modul */}
        <aside style={S.left}>
          {columns.map((col, ci) => (
            <div key={col.title}>
              <Section label={col.title.toUpperCase()} accent={col.accent} mt={ci === 0 ? 0 : 14} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {col.items.map(t => t.sub ? (
                  <div key={t.label}>
                    <button className="tile" style={S.rowTile} onClick={() => setOpenSub(openSub === t.label ? null : t.label)}>
                      <div style={{ ...S.chip, width: 30, height: 30, fontSize: 14, background: `${t.c}1a`, color: t.c, border: `1px solid ${t.c}33` }}>{t.icon}</div>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#e6edf3", flex: 1, textAlign: "left" }}>{t.label}</span>
                      <span style={{ color: "#5b6470", fontSize: 11 }}>{openSub === t.label ? "▾" : "▸"}</span>
                    </button>
                    {openSub === t.label && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "4px 0 2px 14px", borderLeft: `1px solid ${t.c}33`, paddingLeft: 8 }}>
                        {t.sub.map(s => (
                          <button key={s.label} className="tile" style={{ ...S.rowTile, padding: "6px 10px" }} onClick={s.on}>
                            <span style={{ fontSize: 11.5, fontWeight: 600, color: "#cdd5df", flex: 1, textAlign: "left" }}>{s.label}</span>
                            <span style={{ color: "#5b6470", fontSize: 12 }}>→</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button key={t.label} className="tile" style={S.rowTile} onClick={t.on}>
                    <div style={{ ...S.chip, width: 30, height: 30, fontSize: 14, background: `${t.c}1a`, color: t.c, border: `1px solid ${t.c}33` }}>{t.icon}</div>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "#e6edf3", flex: 1, textAlign: "left" }}>{t.label}</span>
                    <span style={{ color: "#5b6470", fontSize: 13 }}>→</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        {/* KANAN: konten */}
        <main style={S.right}>
          {rightView !== "home" ? (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button onClick={closeRight} title="Tutup panel"
                  style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3", fontSize: 12, fontWeight: 700, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit" }}>✕ Tutup</button>
              </div>
              <div style={{ position: "relative", transform: "translateZ(0)", height: "calc(100vh - 150px)", overflow: "hidden", borderRadius: 14, border: "1px solid #1e1f23" }}>
                {rightView === "tools" && <AdminTools initialTab={rightArg || "dashboard"} onBack={closeRight} />}
                {rightView === "admin" && <Admin initialTab={rightArg || "orders"} adminSession={adminSession} onLogout={onLogout} onExit={closeRight} onReport={() => openRight("report")} onESBSync={() => openRight("esb-sync")} onESBNotif={() => openRight("esb-notif")} onMembers={() => openRight("members")} onPromo={() => openRight("promo")} onShift={() => openRight("shift")} onTools={(t) => openRight(t === "command" ? "command" : "tools", t)} />}
                {rightView === "command" && <CommandCenter />}
                {rightView === "report" && <Report onBack={closeRight} />}
                {rightView === "members" && <MemberList onBack={closeRight} />}
                {rightView === "promo" && <PromoManager onBack={closeRight} />}
                {rightView === "shift" && <ShiftManager onBack={closeRight} />}
                {rightView === "esb-sync" && <ESBSync onBack={closeRight} />}
                {rightView === "esb-notif" && <ESBNotif onBack={closeRight} />}
              </div>
            </div>
          ) : (<>
          {/* Period selector + KPI */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <div style={S.segWrap}>
              {PERIODS.map(p => (
                <button key={p.k} onClick={() => setPeriod(p.k)}
                  style={{ ...S.seg, ...(period === p.k ? S.segOn : {}) }}>{p.l}</button>
              ))}
            </div>
          </div>
          <div style={S.kpiRow}>
            {kpis.map(x => (
              <div key={x.label} className="card" style={S.kpi}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ ...S.chip, background: `${x.c}1a`, color: x.c, border: `1px solid ${x.c}33` }}>{x.icon}</div>
                  <div style={{ ...S.kpiLabel, flex: 1 }}>{x.label}</div>
                  <Delta v={x.delta} />
                </div>
                <div style={{ ...S.kpiVal, color: x.c }}>{x.val}</div>
                <div style={S.kpiSub}>{x.sub}</div>
                {x.progress != null && (
                  <div style={{ height: 4, background: "#1a1b1e", borderRadius: 2, marginTop: 6 }}>
                    <div style={{ height: "100%", width: Math.min(100, x.progress) + "%", background: x.progress >= 100 ? "#10b981" : x.progress >= 60 ? "#f59e0b" : "#ef4444", borderRadius: 2 }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Performa outlet */}
          <Section label="PERFORMA OUTLET — HARI INI" accent="#22d3ee" mt={14}
            right={<button onClick={() => openRight("tools", "outlet_master")} style={S.linkBtn}>kelola outlet →</button>} />
          <div className="card" style={{ ...S.bigCard, padding: "10px 14px 12px" }}>
            {outletRank.length === 0 ? <div style={{ fontSize: 11, color: "#5b6470" }}>Memuat data outlet…</div>
              : outletRank.map((o, i) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "7px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
                  <span style={{ width: 18, fontSize: 11, fontWeight: 800, color: i === 0 ? "#f59e0b" : "#5b6470", fontFamily: "'Space Mono',monospace" }}>#{i + 1}</span>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: o.status === "active" ? "#10b981" : "#5b6470", flexShrink: 0 }} />
                  <div style={{ width: 130 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#e6edf3" }}>{o.name}</div>
                    <div style={{ fontSize: 9.5, color: "#5b6470" }}>{o.area}</div>
                  </div>
                  <div style={{ flex: 1, height: 9, background: "#0a0e16", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: ((o.revenue_today || 0) / maxOutRev * 100) + "%", background: i === 0 ? "#f59e0b" : "#22d3ee" }} />
                  </div>
                  <span style={{ width: 70, textAlign: "right", fontSize: 12, fontWeight: 700, fontFamily: "'Space Mono',monospace", color: "#cdd5df" }}>{fmtK(o.revenue_today)}</span>
                  <span style={{ width: 56, textAlign: "right", fontSize: 10.5, color: "#5b6470" }}>{o.orders_today} order</span>
                  <span style={{ width: 48, textAlign: "right" }}><Delta v={o.trend_pct} /></span>
                </div>
              ))}
          </div>

          {/* Live sales */}
          <Section label="LIVE SALES" accent="#10b981" mt={14}
            right={<span style={{ fontSize: 10.5, color: "#5b6470", fontFamily: "'Space Mono',monospace", display: "flex", alignItems: "center", gap: 6 }}>
              <span className="livedot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block", boxShadow: "0 0 6px #10b981" }} />
              LIVE · {curOrders.length} transaksi {periodLabel.toLowerCase()}</span>} />
          <div className="card" style={{ ...S.bigCard, padding: "12px 14px" }}>
            {recentSales.length === 0 ? <div style={{ fontSize: 11, color: "#5b6470" }}>Belum ada transaksi</div>
              : <div style={S.ticker}>
                  {recentSales.map(o => {
                    const st = o.status === "completed" ? "#10b981" : o.status === "cancelled" ? "#ef4444" : "#f59e0b";
                    return (
                      <div key={o.id} style={S.saleCard}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 11, color: "#9da7b3" }}>#{o.id}</span>
                          <span style={{ fontSize: 12 }}>{o.type === "dine" ? "🪑" : "🛍️"}</span>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#10b981", fontFamily: "'Space Mono',monospace", margin: "5px 0 3px" }}>{fmtRp(o.total)}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#5b6470" }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: st }} />{ago(o.time)} lalu
                        </div>
                      </div>
                    );
                  })}
                </div>}
          </div>

          {/* Antrian + revenue */}
          <div style={S.dataGrid}>
            <div className="card" style={S.bigCard}>
              <Section label="ANTRIAN ORDER LIVE" accent="#3b82f6" mt={6}
                right={<button onClick={() => openRight("tools", "dashboard")} style={S.linkBtn}>dashboard outlet →</button>} />
              <div style={S.queueRow}>
                {QUEUE.map(q => {
                  const list = orders.filter(o => o.status === q.key);
                  return (
                    <div key={q.key} style={{ ...S.queueCol, borderTop: `2px solid ${q.c}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: q.c }}>● {q.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: q.c, fontFamily: "'Space Mono',monospace" }}>{list.length}</span>
                      </div>
                      {list.length === 0 ? <div style={{ fontSize: 10.5, color: "#5b6470", padding: "4px 0" }}>Tidak ada order</div>
                        : <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {list.slice(0, 4).map(o => (
                              <div key={o.id} style={S.orderChip}>
                                <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, color: "#e6edf3" }}>#{o.id}</span>
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
            </div>
            <div className="card" style={S.bigCard}>
              <Section label="REVENUE 7 HARI" accent="#10b981" mt={6}
                right={<span style={{ fontSize: 12.5, fontWeight: 800, color: "#10b981", fontFamily: "'Space Mono',monospace" }}>{fmtRp(dayRev.reduce((s, x) => s + x.rev, 0))}</span>} />
              <div style={S.barRow}>
                {dayRev.map((x, i) => (
                  <div key={i} style={S.barCol}>
                    <div style={S.barVal}>{x.rev > 0 ? fmtK(x.rev) : ""}</div>
                    <div style={{ width: "100%", borderRadius: "4px 4px 0 0", height: Math.max(3, (x.rev / maxRev) * 66),
                      background: i === 6 ? "linear-gradient(180deg,#10b981,#10b98155)" : "#10b98140" }} />
                    <div style={S.barLbl}>{x.d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monitoring realtime */}
          <Section label="MONITORING REALTIME" accent="#ef4444" mt={14}
            right={<span style={{ fontSize: 10.5, color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>{notifs.length} alert · {crit} mendesak</span>} />
          <div className="card" style={{ ...S.bigCard, padding: "12px 14px" }}>
            {feed.length === 0 ? <div style={{ fontSize: 11, color: "#10b981" }}>✓ Tidak ada alert — semua aman</div>
              : <div style={S.feed}>
                  {feed.map((x, i) => {
                    const pr = PRIO[x.priority] || PRIO.low;
                    return (
                      <div key={i} style={{ ...S.feedRow, borderLeft: `3px solid ${pr.c}` }}>
                        <span style={{ ...S.prioBadge, color: pr.c, background: `${pr.c}1a`, border: `1px solid ${pr.c}44` }}>{pr.l}</span>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{x.icon || "🔔"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: "#e6edf3", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.title}</div>
                          <div style={{ fontSize: 10.5, color: "#5b6470", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.detail}</div>
                        </div>
                        <span style={{ fontSize: 9.5, color: "#5b6470", fontFamily: "'Space Mono',monospace", flexShrink: 0 }}>{x.source}</span>
                      </div>
                    );
                  })}
                </div>}
          </div>

          {/* Menu terlaris */}
          <Section label="MENU TERLARIS" mt={14} />
          <div className="card" style={{ ...S.bigCard, padding: "12px 16px" }}>
            {topItems.length === 0 ? <div style={{ fontSize: 11, color: "#5b6470" }}>Belum ada data penjualan</div>
              : <div style={S.topGrid}>
                  {topItems.map(([n, d], i) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: i === 0 ? "#f59e0b" : "#5b6470", fontFamily: "'Space Mono',monospace", width: 18 }}>#{i + 1}</span>
                      <span style={{ fontSize: 15 }}>{d.e}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#cdd5df", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n}</div>
                        <div style={{ height: 3, background: "#161b22", borderRadius: 2, marginTop: 3 }}>
                          <div style={{ height: "100%", width: (d.qty / maxQty * 100) + "%", background: "#f59e0b", borderRadius: 2 }} />
                        </div>
                      </div>
                      <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, color: "#f59e0b", fontSize: 12 }}>{d.qty}×</span>
                    </div>
                  ))}
                </div>}
          </div>
          </>)}
        </main>
      </div>

      <div style={S.footer}>
        <button className="tile" style={S.footBtn} onClick={onExit}>← Kiosk</button>
        {onLogout && <button className="tile" style={{ ...S.footBtn, color: "#f87171", borderColor: "#f8717133" }} onClick={onLogout}>Logout</button>}
        <span style={{ flex: 1 }} />
        <span style={S.footNote}>karyaOS · 115 modul backend · v4</span>
      </div>
    </div>
  );
}

const CSS = `
.card { box-shadow: inset 0 1px 0 0 #ffffff09; }
.tile { cursor:pointer; transition: background .13s, border-color .13s, transform .1s; box-shadow: inset 0 1px 0 0 #ffffff09; }
.tile:hover { transform: translateY(-1px); background:#161619 !important; border-color:#33343a !important; }
.tile:active { transform: translateY(0); }
::-webkit-scrollbar { width:7px; height:7px }
::-webkit-scrollbar-thumb { background:#26272b; border-radius:4px }
::-webkit-scrollbar-track { background:transparent }
@keyframes lp { 0%,100%{opacity:1} 50%{opacity:.3} }
.livedot { animation: lp 1.6s infinite; }
`;

// Premium dark — Linear/Vercel: flat near-black, hairline borders,
// calm neutrals, depth via subtle inset highlight (di CSS .card).
const S = {
  root: { minHeight: "100vh", background: "#08090a", color: "#c3c4c9", fontFamily: "'Geist','Plus Jakarta Sans',system-ui,sans-serif", padding: "16px 28px 24px", boxSizing: "border-box" },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottom: "1px solid #1a1b1e" },
  logo: { width: 38, height: 38, borderRadius: 10, background: "linear-gradient(160deg,#f5a623,#d97706)", color: "#1a1205", fontWeight: 900, fontSize: 21, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  brand: { fontSize: 21, fontWeight: 750, color: "#f0f0f2", letterSpacing: -0.4, lineHeight: 1 },
  brandSub: { fontSize: 9, color: "#55565d", fontFamily: "'Space Mono',monospace", letterSpacing: 2, marginTop: 4 },
  clock: { fontSize: 20, fontWeight: 700, color: "#f0f0f2", fontFamily: "'Space Mono',monospace", lineHeight: 1 },
  greetLine: { fontSize: 11.5, color: "#62636b", marginTop: 5 },
  role: { fontSize: 9, fontWeight: 700, color: "#f5a623", background: "#f5a6231a", border: "1px solid #f5a62338", borderRadius: 4, padding: "1px 6px", marginLeft: 8, fontFamily: "'Space Mono',monospace", textTransform: "uppercase" },
  opStrip: { display: "flex", alignItems: "center", gap: 11, fontSize: 11.5, color: "#9a9ba1", background: "#0e0e11", border: "1px solid #1e1f23", borderRadius: 10, padding: "9px 14px", margin: "13px 0 2px" },
  opDot: { width: 3, height: 3, borderRadius: "50%", background: "#3a3b40" },
  body: { display: "grid", gridTemplateColumns: "264px 1fr", gap: 20, alignItems: "start", marginTop: 12 },
  left: { display: "flex", flexDirection: "column" },
  right: { display: "flex", flexDirection: "column", minWidth: 0 },
  segWrap: { display: "flex", gap: 2, background: "#0e0e11", border: "1px solid #1e1f23", borderRadius: 9, padding: 3 },
  seg: { background: "transparent", border: "none", color: "#7a7b82", fontSize: 11, fontWeight: 600, padding: "5px 13px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" },
  segOn: { background: "#26272b", color: "#f0f0f2" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 13 },
  kpi: { background: "#0e0e11", border: "1px solid #1e1f23", borderRadius: 13, padding: "13px 15px" },
  chip: { width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 },
  kpiLabel: { fontSize: 9.5, color: "#7a7b82", fontFamily: "'Space Mono',monospace", letterSpacing: 0.5, textTransform: "uppercase" },
  kpiVal: { fontSize: 21, fontWeight: 750, fontFamily: "'Space Mono',monospace", margin: "9px 0 2px", letterSpacing: -0.3 },
  kpiSub: { fontSize: 10.5, color: "#62636b" },
  sectionHead: { display: "flex", alignItems: "center", gap: 8, margin: "18px 2px 10px" },
  sectionLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: 1.6, color: "#86878e", fontFamily: "'Space Mono',monospace" },
  linkBtn: { background: "transparent", border: "none", color: "#6b7280", fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Mono',monospace" },
  primaryRow: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 13 },
  primaryTile: { display: "flex", alignItems: "center", gap: 13, background: "#0e0e11", border: "1px solid #1e1f23", borderRadius: 13, padding: "13px 17px", fontFamily: "inherit" },
  arrow: { width: 29, height: 29, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 },
  dataGrid: { display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 13 },
  bigCard: { background: "#0e0e11", border: "1px solid #1e1f23", borderRadius: 13, padding: "0 16px 14px", minWidth: 0 },
  queueRow: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 },
  queueCol: { background: "#121214", border: "1px solid #1c1d20", borderRadius: 10, padding: "9px 11px", minHeight: 90 },
  orderChip: { display: "flex", alignItems: "center", gap: 7, fontSize: 11, background: "#0e0e11", border: "1px solid #1e1f23", borderRadius: 7, padding: "5px 9px" },
  barRow: { display: "flex", alignItems: "flex-end", gap: 7, height: 92, marginTop: 8 },
  barCol: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  barVal: { fontSize: 9, color: "#10b981", fontFamily: "'Space Mono',monospace" },
  barLbl: { fontSize: 9.5, color: "#62636b", fontFamily: "'Space Mono',monospace" },
  ticker: { display: "flex", gap: 9, overflowX: "auto", paddingBottom: 4 },
  saleCard: { minWidth: 124, flexShrink: 0, background: "#121214", border: "1px solid #1c1d20", borderRadius: 10, padding: "9px 11px" },
  feed: { display: "flex", flexDirection: "column", gap: 5, maxHeight: 232, overflowY: "auto" },
  feedRow: { display: "flex", alignItems: "center", gap: 9, background: "#121214", border: "1px solid #1c1d20", borderRadius: 8, padding: "6px 10px" },
  prioBadge: { fontSize: 8.5, fontWeight: 800, borderRadius: 4, padding: "2px 6px", fontFamily: "'Space Mono',monospace", letterSpacing: 0.5, flexShrink: 0, width: 44, textAlign: "center" },
  topGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 30px", marginTop: 2 },
  rowTile: { display: "flex", alignItems: "center", gap: 10, background: "#0e0e11", border: "1px solid #1e1f23", borderRadius: 10, padding: "8px 12px", fontFamily: "inherit", width: "100%" },
  footer: { display: "flex", alignItems: "center", gap: 10, marginTop: 18, paddingTop: 14, borderTop: "1px solid #1a1b1e" },
  footBtn: { background: "#0e0e11", border: "1px solid #26272b", borderRadius: 8, padding: "7px 15px", color: "#9a9ba1", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  footNote: { fontSize: 10, color: "#3c3d42", fontFamily: "'Space Mono',monospace" },
};
