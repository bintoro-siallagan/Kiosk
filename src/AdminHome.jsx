// src/AdminHome.jsx
// Dashboard Baru — home. Status operasional · KPI (period + tren +
// target) · performa outlet · live sales · monitoring · penjualan.

import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
// Right-panel views are lazy-loaded so the AdminHome shell stays light.
// They are only fetched once the operator opens the matching panel.
const CommandCenter = lazy(() => import("./CommandCenter.jsx"));
const AdminTools    = lazy(() => import("./AdminTools.jsx"));
const Admin         = lazy(() => import("./Admin.jsx"));
const Report        = lazy(() => import("./Report.jsx"));
const ESBSync       = lazy(() => import("./ESBSync.jsx"));
const ESBNotif      = lazy(() => import("./ESBNotif.jsx"));
const MemberList    = lazy(() => import("./MemberList.jsx"));
const PromoManager  = lazy(() => import("./PromoManager.jsx"));
const ShiftManager  = lazy(() => import("./ShiftManager.jsx"));
import { TABS, GROUPS } from "./adminModules.js";
import { CommandPalette } from "./components/uiKit.jsx";
import IncidentAlertBanner from "./components/IncidentAlertBanner.jsx";

function PanelLoading() {
  return (
    <div className="karyaos-module-loading" style={{
      padding: 40, color: "#5b6470", textAlign: "center",
      fontFamily: "'Geist Mono','Inter',monospace", fontSize: 13,
      letterSpacing: 1, textTransform: "uppercase",
    }}>
      <span className="karyaos-spinner" aria-hidden="true">⏳</span>
      <span style={{ marginLeft: 10 }}>Memuat panel…</span>
    </div>
  );
}

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

// Recursive rail menu node — supports nested groups (Tools → category → module).
const ADMIN_ROLES = [
  { id: "super-admin", label: "👑 Super Admin" }, { id: "owner", label: "💼 Owner / Director" },
  { id: "area-manager", label: "🗺️ Area Manager" }, { id: "outlet-manager", label: "🏪 Outlet Manager" },
  { id: "finance", label: "💰 Finance Staff" }, { id: "warehouse", label: "📦 Warehouse Staff" },
  { id: "marketing", label: "🎯 Marketing Team" }, { id: "hr", label: "👥 HR Staff" },
  { id: "cashier", label: "🧑‍💼 Cashier / Crew" }, { id: "auditor", label: "🔍 Auditor" },
];

// ═══ STOCK-TERMINAL primitives ═══════════════════════════════════════════
// Sparkline — tiny inline SVG line+area chart. Renders even on 2 points.
function Sparkline({ data, color = "#10b981", width = 110, height = 28, fill = true }) {
  if (!data || data.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, height - 2 - ((v - min) / range) * (height - 4)]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];
  const gradId = `sg-${color.replace("#", "")}`;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gradId})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  );
}

// Circular refresh ring — countdown to next data poll (Bloomberg-style).
function RefreshRing({ pct, secs, size = 36 }) {
  const r = (size - 4) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1f2027" strokeWidth="2.5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .8s linear", filter: "drop-shadow(0 0 4px #22d3ee88)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#22d3ee" }}>{secs}</div>
    </div>
  );
}

// Animated number — flashes green/red on value change, like a stock price tick.
function TickValue({ value, fmt = (v) => v, color = "#e6edf3", className = "" }) {
  const prevRef = useRef(value);
  const [flash, setFlash] = useState(null); // "up" | "down" | null
  useEffect(() => {
    if (prevRef.current !== value) {
      const dir = value > prevRef.current ? "up" : value < prevRef.current ? "down" : null;
      if (dir) {
        setFlash(dir);
        const t = setTimeout(() => setFlash(null), 900);
        return () => clearTimeout(t);
      }
    }
    prevRef.current = value;
  }, [value]);
  const flashColor = flash === "up" ? "#10b981" : flash === "down" ? "#ef4444" : null;
  return (
    <span className={`ah-tick ${flash ? `ah-tick-${flash}` : ""} ${className}`}
      style={{ color: flashColor || color, transition: "color .9s ease-out", textShadow: flashColor ? `0 0 18px ${flashColor}80` : undefined }}>
      {fmt(value)}
    </span>
  );
}

function RailNode({ node, depth, open, onToggle }) {
  const [q, setQ] = useState("");
  const k = node._k || node.label;
  const hasSub = !!(node.sub || node.getSub);
  const isOpen = open.has(k);
  const children = !hasSub ? [] : (node.getSub ? node.getSub(q) : node.sub);
  return (
    <div>
      <button className="tile" style={{ ...S.rowTile, paddingLeft: 12 + depth * 14 }}
        onClick={() => hasSub ? onToggle(k) : (node.on && node.on())}>
        {depth === 0 && node.icon ? (
          <div style={{ ...S.chip, width: 30, height: 30, fontSize: 14, background: `${node.c}1a`, color: node.c, border: `1px solid ${node.c}33` }}>{node.icon}</div>
        ) : null}
        <span style={{ fontSize: depth === 0 ? 12.5 : 11.5, fontWeight: depth === 0 ? 700 : 600, color: depth === 0 ? "#e6edf3" : "#c3c4c9", flex: 1, textAlign: "left" }}>{node.label}</span>
        <span style={{ color: "#5b6470", fontSize: 12 }}>{hasSub ? (isOpen ? "▾" : "▸") : "→"}</span>
      </button>
      {hasSub && isOpen ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
          {node.searchable ? (
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Cari modul…"
              style={{ background: "#0a0e16", border: "1px solid #26272b", borderRadius: 8, padding: "7px 10px", color: "#fff", fontSize: 11.5, fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginLeft: 14 }} />
          ) : null}
          {children.map(c => <RailNode key={c._k || c.label} node={c} depth={depth + 1} open={open} onToggle={onToggle} />)}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminHome({ adminSession, onLogout, onExit, initialView }) {
  const [now, setNow] = useState(new Date());
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [period, setPeriod] = useState("today");
  const [health, setHealth] = useState(null);
  const [openNodes, setOpenNodes] = useState(() => new Set());
  const toggleNode = (k) => setOpenNodes(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const [rightView, setRightView] = useState(initialView || "home");
  const [rightArg, setRightArg] = useState(null);
  const [railOpen, setRailOpen] = useState(false);
  // Stock-terminal mode — hide left nav rail, dashboard goes full-width
  const [navHidden, setNavHidden] = useState(() => {
    try { return localStorage.getItem("ah-nav-hidden") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("ah-nav-hidden", navHidden ? "1" : "0"); } catch {}
  }, [navHidden]);
  // Keyboard shortcut: Esc toggles nav, "f" enters terminal mode
  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") setNavHidden(h => !h);
      else if (e.key === "f" || e.key === "F") setNavHidden(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [viewRole, setViewRole] = useState("super-admin");
  const [rbacMap, setRbacMap] = useState(null);
  const openRight = (kind, arg) => { setRightView(kind); setRightArg(arg || null); setRailOpen(false); window.scrollTo(0, 0); };
  const closeRight = () => { setRightView("home"); setRightArg(null); };

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Render the admin dashboard at natural scale, full width — opt out of the
  // global auto-zoom (auto-zoom.css) and the 1126px #root cap so it auto-sizes.
  useEffect(() => {
    const html = document.documentElement;
    const root = document.getElementById("root");
    const pz = html.style.zoom, pw = root && root.style.width, pm = root && root.style.maxWidth;
    html.style.zoom = "1";
    if (root) { root.style.width = "100%"; root.style.maxWidth = "none"; }
    return () => {
      html.style.zoom = pz;
      if (root) { root.style.width = pw || ""; root.style.maxWidth = pm || ""; }
    };
  }, []);

  const REFRESH_MS = 15000;
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  useEffect(() => {
    const loadOrders = () => fetch(`${API}/api/orders`).then(r => r.json()).then(o => {
      const arr = Array.isArray(o) ? o : [];
      setAllOrders(arr);
      setOrders(arr.filter(x => !["completed", "cancelled", "refunded", "partial_refund"].includes(x.status)));
      setLastRefresh(Date.now());
    }).catch(() => {});
    loadOrders();
    const iv = setInterval(loadOrders, REFRESH_MS);
    const loadNotif = () => fetch(`${API}/api/notification-center`).then(r => r.json()).then(d => setNotifs(d.notifications || [])).catch(() => {});
    loadNotif();
    const ivN = setInterval(loadNotif, 20000);
    fetch(`${API}/api/self-audit`).then(r => r.json()).then(d => setHealth(d.health_score)).catch(() => {});
    fetch(`${API}/api/outlet-master`).then(r => r.json()).then(d => setOutlets(d.outlets || [])).catch(() => {});
    return () => { clearInterval(iv); clearInterval(ivN); };
  }, []);

  // Countdown for refresh ring
  const refreshElapsed = now.getTime() - lastRefresh;
  const refreshPct = Math.min(1, refreshElapsed / REFRESH_MS);
  const refreshSecs = Math.max(0, Math.ceil((REFRESH_MS - refreshElapsed) / 1000));

  const hour = now.getHours();
  const greet = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 19 ? "Selamat sore" : "Selamat malam";
  const openTab = (q) => { window.open(window.location.pathname + q, "_blank"); setRailOpen(false); };

  // FlowOS Stage 1 — role-customizable view: rail Tools modules filter by RBAC role.
  useEffect(() => {
    fetch(`${API}/api/rbac`).then(r => r.json()).then(j => {
      const m = {};
      for (const p of (j.permissions || [])) { (m[p.role_id] = m[p.role_id] || {})[p.module_id] = p.level; }
      setRbacMap(m);
    }).catch(() => {});
  }, []);
  const moduleOf = (id) => { const g = GROUPS.find(x => x.ids.includes(id)); return g ? g.module : "pos"; };
  const canSee = (mod) => !rbacMap || !rbacMap[viewRole] || (rbacMap[viewRole][mod] && rbacMap[viewRole][mod] !== "none");

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

  // ── intraday hourly buckets (today) — for line chart + sparklines ──
  const hourly = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ h, rev: 0, orders: 0 }));
    const dayStart = t0.getTime();
    allOrders.forEach(o => {
      if (o.status !== "completed" || !o.time || o.time < dayStart || o.time >= dayStart + DAY) return;
      const h = new Date(o.time).getHours();
      buckets[h].rev += o.total || 0;
      buckets[h].orders += 1;
    });
    return buckets;
  }, [allOrders, t0.getTime()]);
  const intradayLast = hour;
  const intradayWindow = hourly.slice(Math.max(0, intradayLast - 11), intradayLast + 1);
  // For sparklines: cumulative-revenue today, order-count today, alerts (last 12 buckets), health flat
  const sparkRev = useMemo(() => {
    let cum = 0;
    return hourly.slice(0, intradayLast + 1).map(b => (cum += b.rev));
  }, [hourly, intradayLast]);
  const sparkOrd = hourly.slice(0, intradayLast + 1).map(b => b.orders);

  const kpis = [
    { label: `Penjualan ${periodLabel}`, val: fmtRp(curRev), valNum: curRev, c: "#10b981", icon: "💰", delta: revDelta, progress: targetPct, sub: `target ${fmtK(target)}`, spark: sparkRev },
    { label: `Order ${periodLabel}`, val: String(curOrders.length), valNum: curOrders.length, c: "#3b82f6", icon: "🧾", delta: ordDelta, sub: `${orders.length} aktif sekarang`, spark: sparkOrd },
    { label: "Alert Aktif", val: String(notifs.length), valNum: notifs.length, c: crit > 0 ? "#ef4444" : "#f59e0b", icon: "🔔", sub: crit ? `${crit} perlu tindakan` : "semua aman", spark: null },
    { label: "System Health", val: health == null ? "…" : health + " / 100", valNum: health || 0, c: health >= 75 ? "#10b981" : health >= 50 ? "#f59e0b" : "#ef4444", icon: "🔎", sub: "self-audit score", spark: null },
  ];

  // ── Ticker tape items — NYSE-style scrolling marquee with per-outlet rev + delta ──
  const tickerItems = useMemo(() => {
    const items = [];
    // Headline: total rev + delta
    items.push({ k: "TOTAL", v: fmtRp(curRev), d: revDelta, c: revDelta >= 0 ? "#10b981" : "#ef4444" });
    items.push({ k: "ORDERS", v: String(curOrders.length), d: ordDelta, c: ordDelta >= 0 ? "#10b981" : "#ef4444" });
    items.push({ k: "TARGET", v: targetPct + "%", c: targetPct >= 100 ? "#10b981" : targetPct >= 60 ? "#f59e0b" : "#ef4444" });
    // Per-outlet
    outlets.slice(0, 12).forEach(o => {
      items.push({ k: (o.code || o.name || "OUT").toUpperCase().slice(0, 6), v: fmtK(o.revenue_today || 0), d: o.trend_pct, c: (o.trend_pct ?? 0) >= 0 ? "#10b981" : "#ef4444" });
    });
    // Alerts + health
    items.push({ k: "ALERT", v: String(notifs.length), c: crit > 0 ? "#ef4444" : "#10b981" });
    items.push({ k: "HEALTH", v: (health ?? "—") + "/100", c: health >= 75 ? "#10b981" : health >= 50 ? "#f59e0b" : "#ef4444" });
    return items;
  }, [curRev, revDelta, curOrders.length, ordDelta, targetPct, outlets, notifs.length, crit, health]);
  const moduleNode = (id) => {
    const t = TABS.find(x => x.id === id);
    return { _k: "m:" + id, label: t ? t.label : id, on: () => openRight("tools", id) };
  };

  // ⌘K Command Palette — universal search across all modules + actions
  const commandItems = useMemo(() => {
    const tabItems = TABS.map(t => {
      const g = GROUPS.find(gr => gr.ids.includes(t.id));
      return {
        id: "tab:" + t.id,
        title: t.label,
        subtitle: g ? `${g.icon || ""} ${g.name}` : "",
        icon: t.label.split(" ")[0]?.match(/\p{Emoji}/u) ? t.label.split(" ")[0] : "▸",
        keywords: t.id + " " + (g?.name || ""),
        onSelect: () => openRight("tools", t.id),
      };
    });
    const surfaceItems = [
      { id: "surf:pos",         title: "POS Kasir",            subtitle: "Buka POS terminal di tab baru",        icon: "🧾", kbd: "Open", onSelect: () => openTab("?pos=1&fresh=1") },
      { id: "surf:pos-cinema",  title: "POS Cinema (Kasir)",   subtitle: "Jual tiket cinema di counter",         icon: "🎟️", kbd: "Open", onSelect: () => openTab("?pos-cinema&fresh=1") },
      { id: "surf:kds",         title: "KDS Dapur",            subtitle: "Kitchen display untuk staff dapur",    icon: "👨‍🍳", kbd: "Open", onSelect: () => openTab("?kds=1") },
      { id: "surf:cds",         title: "CDS Customer Display", subtitle: "Layar besar untuk customer",           icon: "📺", kbd: "Open", onSelect: () => openTab("?cds=1") },
      { id: "surf:kiosk",       title: "Kiosk F&B (Customer)", subtitle: "Customer self-order",                  icon: "🖥️", kbd: "Open", onSelect: () => openTab("?kiosk=1") },
      { id: "surf:flow",        title: "FlowApp QR-Order",     subtitle: "Customer order via QR meja",           icon: "📱", kbd: "Open", onSelect: () => openTab("?flow") },
      { id: "surf:cinema",      title: "Cinema Kiosk",         subtitle: "Customer beli tiket cinema",           icon: "🎬", kbd: "Open", onSelect: () => openTab("?cinema") },
      { id: "surf:cinema-kds",   title: "Cinema KDS (F&B)",     subtitle: "Kitchen display untuk concession + in-studio", icon: "👨‍🍳", kbd: "Open", onSelect: () => openTab("?cinema-kds") },
      { id: "surf:cinema-cds",   title: "Cinema CDS (Second Display)", subtitle: "Customer-facing display POS Cinema",        icon: "📺", kbd: "Open", onSelect: () => openTab("?cinema-cds") },
      { id: "surf:cinema-snack", title: "In-Studio Order",     subtitle: "QR snack order mid-movie",             icon: "🍿", kbd: "Open", onSelect: () => openTab("?cinema-snack") },
      { id: "surf:cinema-board", title: "Cinema Lobby Board",  subtitle: "TV signage di lobby",                  icon: "📺", kbd: "Open", onSelect: () => openTab("?cinema-board") },
      { id: "surf:track",       title: "Order Tracking",       subtitle: "Customer cek status pesanan",          icon: "📍", kbd: "Open", onSelect: () => openTab("?track=1") },
    ];
    const actionItems = [
      { id: "act:owner",     title: "Owner Dashboard",   subtitle: "Real-time KPI + alerts",            icon: "📊", onSelect: () => openRight("tools", "dashboard") },
      { id: "act:command",   title: "Command Center",    subtitle: "Real-time operations monitoring",  icon: "🛰️", onSelect: () => openRight("command") },
      { id: "act:orders",    title: "Pesanan / Transaksi",subtitle:"Order list outlet",                 icon: "🧾", onSelect: () => openRight("admin", "orders") },
      { id: "act:menu",      title: "Menu & Stok",       subtitle: "Master menu + availability",       icon: "🍔", onSelect: () => openRight("admin", "menu") },
      { id: "act:qrgen",     title: "QR Meja",           subtitle: "Generate QR per meja",             icon: "🪑", onSelect: () => openRight("admin", "qrgen") },
      { id: "act:settings",  title: "Pengaturan",        subtitle: "Outlet + payment config",          icon: "⚙️", onSelect: () => openRight("admin", "settings") },
      { id: "act:members",   title: "Member & Customer", subtitle: "CRM + loyalty",                    icon: "👥", onSelect: () => openRight("members") },
      { id: "act:promo",     title: "Promo Code",        subtitle: "Voucher + diskon",                 icon: "🏷️", onSelect: () => openRight("promo") },
      { id: "act:shift",     title: "Operasional / Shift", subtitle: "Buka/tutup shift kasir",         icon: "📋", onSelect: () => openRight("shift") },
      { id: "act:report",    title: "Laporan",           subtitle: "Z-report + sales analytics",       icon: "📊", onSelect: () => openRight("report") },
      { id: "act:logout",    title: "Logout",            subtitle: "Keluar dari sesi admin",           icon: "🚪", onSelect: () => onLogout?.() },
    ];
    return [...surfaceItems, ...actionItems, ...tabItems];
  }, []);
  const toolsSub = GROUPS.filter(g => canSee(g.module)).map(g => {
    // 3-level nesting: kalau group punya `categories`, render category sub-bucket
    if (g.categories?.length) {
      return {
        _k: "g:" + g.name, label: `${g.icon} ${g.name}`,
        sub: g.categories.map(cat => ({
          _k: `g:${g.name}:${cat.name}`, label: cat.name,
          sub: cat.ids.map(moduleNode),
        })),
      };
    }
    return {
      _k: "g:" + g.name, label: `${g.icon} ${g.name}`,
      sub: g.ids.map(moduleNode),
    };
  });
  // Cinema sub-menu (nested) — mirror dari group.categories di adminModules
  const cinemaGroup = GROUPS.find(g => g.name === "Cinema");
  const cinemaToolsSub = cinemaGroup?.categories?.map(cat => ({
    _k: `cinema-cat:${cat.name}`, label: cat.name,
    sub: cat.ids.map(moduleNode),
  })) || [];

  // F&B Enhanced sub-menu (nested) — mirror dari group.categories di adminModules
  const fnbEnhGroup = GROUPS.find(g => g.name === "F&B Enhanced");
  const fnbEnhToolsSub = fnbEnhGroup?.categories?.map(cat => ({
    _k: `fnb-enh-cat:${cat.name}`, label: cat.name,
    sub: cat.ids.map(moduleNode),
  })) || [];

  const columns = [
    { title: "📊 Dashboard", accent: "#f59e0b", items: [
      { label: "Owner Dashboard", icon: "📊", c: "#f59e0b", on: () => openRight("tools", "dashboard") },
    ] },
    { title: "🏪 Outlet", accent: "#22d3ee", items: [
      { label: "Pesanan / Transaksi", icon: "🧾", c: "#10b981", on: () => openRight("admin", "orders") },
      { label: "Menu & Stok", icon: "🍔", c: "#f59e0b", on: () => openRight("admin", "menu") },
      { label: "QR Meja", icon: "🪑", c: "#a855f7", on: () => openRight("admin", "qrgen") },
      { label: "Pengaturan", icon: "⚙️", c: "#7d8590", on: () => openRight("admin", "settings") },
    ] },
    { title: "🛰️ Surface Operasional F&B", accent: "#10b981", items: [
      { label: "POS Kasir", icon: "🧾", c: "#10b981", on: () => openTab("?pos=1&fresh=1") },
      { label: "KDS Dapur", icon: "👨‍🍳", c: "#f97316", on: () => openTab("?kds=1") },
      { label: "CDS Display", icon: "📺", c: "#a855f7", on: () => openTab("?cds=1") },
      { label: "Kiosk", icon: "🖥️", c: "#06b6d4", on: () => openTab("?kiosk=1") },
      { label: "Tracking", icon: "📍", c: "#f59e0b", on: () => openTab("?track=1") },
    ] },
    // 🍽️ F&B Enhanced — dedicated column (mirror Cinema struktur)
    { title: "🍽️ F&B Enhanced", accent: "#ec4899", items: [
      { label: "Reservation",       icon: "📅", c: "#22d3ee", on: () => openRight("tools", "fnb_reservation") },
      { label: "Bill Split",        icon: "🧾", c: "#10b981", on: () => openRight("tools", "fnb_bill_split") },
      { label: "Order Transfer",    icon: "🔄", c: "#3b82f6", on: () => openRight("tools", "fnb_order_transfer") },
      { label: "KDS Routing",       icon: "👨‍🍳", c: "#f97316", on: () => openRight("tools", "fnb_kds_routing") },
      { label: "Delivery",          icon: "🚴", c: "#a855f7", on: () => openRight("tools", "fnb_delivery") },
      { label: "Driver Tracking",   icon: "📍", c: "#06b6d4", on: () => openRight("tools", "fnb_driver_tracking") },
      { label: "Recipe BOM",        icon: "🍱", c: "#10b981", on: () => openRight("tools", "fnb_recipe") },
      { label: "Happy Hour",        icon: "🍻", c: "#fbbf24", on: () => openRight("tools", "fnb_happy_hour") },
      { label: "Membership Tier",   icon: "👑", c: "#f59e0b", on: () => openRight("tools", "fnb_membership_tier") },
      { label: "Payment Methods",   icon: "💳", c: "#ec4899", on: () => openRight("tools", "fnb_payment_methods") },
      { label: "F&B Modules",       icon: "🛠️", c: "#ec4899", searchable: true,
        getSub: (q) => {
          if (!q.trim()) return fnbEnhToolsSub;
          const filter = q.trim().toLowerCase();
          const allFnb = fnbEnhGroup?.ids || [];
          return allFnb.map(id => TABS.find(x => x.id === id)).filter(Boolean)
            .filter(t => t.label.toLowerCase().includes(filter))
            .map(t => ({ _k: "m:" + t.id, label: t.label, on: () => openRight("tools", t.id) }));
        } },
    ] },
    // 🎬 Cinema — dedicated column terpisah dari F&B
    { title: "🎬 Cinema Vertical", accent: "#a855f7", items: [
      { label: "POS Cinema (Kasir)",      icon: "🎟️", c: "#fbbf24", on: () => openTab("?pos-cinema&fresh=1") },
      { label: "Cinema Kiosk (Customer)", icon: "🎬", c: "#a855f7", on: () => openTab("?cinema") },
      { label: "Cinema KDS (F&B Staff)",  icon: "👨‍🍳", c: "#10b981", on: () => openTab("?cinema-kds") },
      { label: "Cinema CDS (Second Display)", icon: "📺", c: "#22d3ee", on: () => openTab("?cinema-cds") },
      { label: "In-Studio QR Order",      icon: "🍿", c: "#f59e0b", on: () => openTab("?cinema-snack") },
      { label: "Lobby Board (TV)",        icon: "📺", c: "#22d3ee", on: () => openTab("?cinema-board") },
      { label: "📊 Dashboard Reporting",  icon: "📊", c: "#a855f7", on: () => openRight("tools", "cinema_dashboard") },
      { label: "🚨 Emergency Ops",         icon: "🚨", c: "#ef4444", on: () => openRight("tools", "cinema_emergency") },
      { label: "🧾 Daily Closing Report",  icon: "🧾", c: "#fbbf24", on: () => openRight("tools", "cinema_closing") },
      { label: "👤 Cashier KPI Rating",    icon: "👤", c: "#22d3ee", on: () => openRight("tools", "cinema_cashier_kpi") },
      { label: "Command Center",          icon: "🎬", c: "#a855f7", on: () => openRight("tools", "cinema_command_center") },
      { label: "Box Office",              icon: "🎬", c: "#10b981", on: () => openRight("tools", "cinema_box_office") },
      { label: "Ticketing",               icon: "🎟️", c: "#10b981", on: () => openRight("tools", "cinema_ticketing") },
      { label: "Validasi Tiket",          icon: "🎟️", c: "#a855f7", on: () => openRight("tools", "cinema_validate") },
      { label: "Cinema Modules",          icon: "🛠️", c: "#ec4899", searchable: true,
        getSub: (q) => {
          if (!q.trim()) return cinemaToolsSub;
          const filter = q.trim().toLowerCase();
          const allCinema = cinemaGroup?.ids || [];
          return allCinema.map(id => TABS.find(x => x.id === id)).filter(Boolean)
            .filter(t => t.label.toLowerCase().includes(filter))
            .map(t => ({ _k: "m:" + t.id, label: t.label, on: () => openRight("tools", t.id) }));
        } },
    ] },
    // 🛰️ KROC — cross-vertical remote outlet command
    { title: "🛰️ Remote Outlet Command (KROC)", accent: "#a855f7", items: [
      { label: "🛰️ Command Center",        icon: "🛰️", c: "#a855f7", on: () => openRight("tools", "remote_ops_command") },
      { label: "📋 Submit Daily Audit",    icon: "📋", c: "#10b981", on: () => openTab("?audit") },
      { label: "📍 Visit Check-in (Mobile)", icon: "📍", c: "#22d3ee", on: () => openTab("?visit") },
    ] },
    { title: "💼 Manajemen & Data", accent: "#3b82f6", items: [
      { label: "Member & Customer", icon: "👥", c: "#3b82f6", on: () => openRight("members") },
      { label: "Promo Code", icon: "🏷️", c: "#ec4899", on: () => openRight("promo") },
      { label: "Operasional / Shift", icon: "📋", c: "#f59e0b", on: () => openRight("shift") },
      { label: "Laporan", icon: "📊", c: "#10b981", on: () => openRight("report") },
      { label: "ESB Sync", icon: "🔗", c: "#22d3ee", on: () => openRight("esb-sync") },
      { label: "Push Notif", icon: "🔔", c: "#a855f7", on: () => openRight("esb-notif") },
      { label: "Tools", icon: "🛠️", c: "#f59e0b", searchable: true,
        getSub: (q) => q.trim()
          ? TABS.filter(t => t.label.toLowerCase().includes(q.trim().toLowerCase()) && canSee(moduleOf(t.id)))
              .map(t => ({ _k: "m:" + t.id, label: t.label, on: () => openRight("tools", t.id) }))
          : toolsSub },
      { label: "Management", icon: "📊", c: "#3b82f6", on: () => openRight("command") },
    ] },
  ];

  const Section = ({ label, accent = "#f59e0b", right, mt, pill = false }) => (
    <div style={{ ...S.sectionHead, marginTop: mt == null ? 16 : mt }}>
      {pill ? (
        <span style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: 1.4, fontFamily: "'Geist Mono',monospace",
          padding: "4px 10px 4px 9px", borderRadius: 6,
          background: `linear-gradient(135deg, ${accent}28, ${accent}10)`,
          color: accent, border: `1px solid ${accent}55`,
          textTransform: "uppercase",
          boxShadow: `0 0 12px ${accent}33, inset 0 1px 0 0 ${accent}22`,
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, boxShadow: `0 0 6px ${accent}` }} />
          {label}
        </span>
      ) : (
        <>
          <span style={{ width: 3, height: 13, background: accent, borderRadius: 2 }} />
          <span style={{ ...S.sectionLabel, color: accent }}>{label}</span>
        </>
      )}
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
  const Delta = ({ v }) => v == null ? null : (
    <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace", color: v >= 0 ? "#10b981" : "#ef4444" }}>
      {v >= 0 ? "▲" : "▼"} {Math.abs(v)}%
    </span>
  );

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* Global incident alert — listen WS + toast + persistent badge */}
      <IncidentAlertBanner onOpenPanel={(toolId) => openRight("tools", toolId)} />

      {/* Topbar — polished with glow + brand pop */}
      <div style={S.topbar} className="no-print ah-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <button className="ah-hamburger" onClick={() => setRailOpen(o => !o)} title="Menu" aria-label="Menu"
            style={{ background: "#161619", border: "1px solid #2a2b30", borderRadius: 8, color: "#e6edf3", fontSize: 17, lineHeight: 1, padding: "6px 11px", cursor: "pointer", fontFamily: "inherit" }}>☰</button>
          {/* Desktop nav toggle — hide rail → terminal/saham mode */}
          <button onClick={() => setNavHidden(h => !h)} title={navHidden ? "Tampilkan nav (Esc)" : "Mode Saham — sembunyikan nav"} aria-label="Toggle nav"
            className="ah-nav-toggle"
            style={{ background: navHidden ? "#22d3ee15" : "#161619", border: `1px solid ${navHidden ? "#22d3ee55" : "#2a2b30"}`, borderRadius: 8, color: navHidden ? "#22d3ee" : "#9da7b3", fontSize: 11, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5, padding: "7px 11px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, boxShadow: navHidden ? "0 0 12px #22d3ee33" : "none", transition: "all .15s" }}>
            <span style={{ fontSize: 13 }}>{navHidden ? "▶" : "◀"}</span>
            <span>{navHidden ? "SHOW NAV" : "TERMINAL"}</span>
          </button>
          {/* ⌘K hint chip — clicking simulates the shortcut */}
          <button
            onClick={() => {
              // Trigger CommandPalette's Cmd+K handler via synthetic event
              const ev = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: true, bubbles: true });
              document.dispatchEvent(ev);
            }}
            title="Buka command palette (⌘K / Ctrl+K)"
            aria-label="Open command palette"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: "#9ca3af",
              fontSize: 11, fontWeight: 700,
              fontFamily: "'Geist Mono',monospace", letterSpacing: 0.4,
              padding: "7px 12px", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
              transition: "all .15s",
            }}>
            <span style={{ fontSize: 13 }}>🔍</span>
            <span>Cari…</span>
            <span style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 4, padding: "1px 6px",
              fontSize: 9.5, color: "rgba(255,255,255,0.55)", letterSpacing: 0.6,
            }}>⌘K</span>
          </button>
          <div style={{ position: "relative" }}>
            <img src="/logo.png" alt="KaryaOS" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 0 12px rgba(245,158,11,0.35))" }} />
          </div>
          <div>
            <div style={S.brand}>karya<span style={{ background: "linear-gradient(135deg,#f59e0b,#fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>OS</span></div>
            <div style={S.brandSub}>ENTERPRISE OPERATING SYSTEM · F&B + CINEMA</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={S.clock}>{now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
          <div style={S.greetLine}>{greet}, <b style={{ color: "#cdd5df" }}>{adminSession?.name || "Admin"}</b>
            <span style={S.role}>{adminSession?.role || "—"}</span></div>
        </div>
      </div>

      {/* Status operasional strip (hanya tampil di mobile saat hero hidden) */}
      <div style={{ ...S.opStrip, display: rightView === "home" ? "none" : "flex" }} className="no-print">
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

      {/* Body — 2 bagian (nav rail hideable for terminal/saham mode) */}
      <div style={{ ...S.body, gridTemplateColumns: navHidden ? "1fr" : "264px 1fr" }} className={`ah-body${navHidden ? " ah-nav-hidden" : ""}`}>

        {/* KIRI: panel modul */}
        <div className="ah-backdrop no-print" data-open={railOpen} onClick={() => setRailOpen(false)} />
        <aside style={{ ...S.left, display: navHidden ? "none" : undefined }} className={`ah-rail no-print${railOpen ? " ah-rail-open" : ""}`}>
          <select value={viewRole} onChange={e => setViewRole(e.target.value)} title="Tampilkan modul sesuai role"
            style={{ width: "100%", background: "#0e0e11", border: "1px solid #2a2b30", borderRadius: 8, padding: "8px 10px", color: "#c9a8ff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10, outline: "none", cursor: "pointer" }}>
            {ADMIN_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          {columns.map((col, ci) => (
            <div key={col.title}>
              <Section pill label={col.title.toUpperCase()} accent={col.accent} mt={ci === 0 ? 0 : 14} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {col.items.map(t => (
                  <RailNode key={t._k || t.label} node={t} depth={0} open={openNodes} onToggle={toggleNode} />
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
                <Suspense fallback={<PanelLoading />}>
                {rightView === "tools" && <AdminTools key={rightArg} initialTab={rightArg || "dashboard"} />}
                {rightView === "admin" && <Admin key={rightArg} initialTab={rightArg || "orders"} adminSession={adminSession} onLogout={onLogout} onExit={closeRight} onReport={() => openRight("report")} onESBSync={() => openRight("esb-sync")} onESBNotif={() => openRight("esb-notif")} onMembers={() => openRight("members")} onPromo={() => openRight("promo")} onShift={() => openRight("shift")} onTools={(t) => openRight(t === "command" ? "command" : "tools", t)} />}
                {rightView === "command" && <CommandCenter />}
                {rightView === "report" && <Report onBack={closeRight} />}
                {rightView === "members" && <MemberList onBack={closeRight} />}
                {rightView === "promo" && <PromoManager onBack={closeRight} />}
                {rightView === "shift" && <ShiftManager onBack={closeRight} />}
                {rightView === "esb-sync" && <ESBSync onBack={closeRight} />}
                {rightView === "esb-notif" && <ESBNotif onBack={closeRight} />}
                </Suspense>
              </div>
            </div>
          ) : (<>
          {/* ═══ HERO BANNER (animated, gradient mesh, big number) ═══ */}
          <div style={S.hero} className="ah-hero">
            <div style={S.heroMesh} />
            <div style={S.heroContent}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 280 }}>
                  <div style={S.heroGreet}>
                    <span>{hour < 11 ? "☀️" : hour < 15 ? "🌤️" : hour < 19 ? "🌅" : "🌙"}</span>
                    <span>{greet}, <b style={{ color: "#fff" }}>{adminSession?.name || "Admin"}</b></span>
                  </div>
                  <div style={S.heroKicker}>
                    <span className="livedot" style={{ width: 7, height: 7, borderRadius: "50%", background: isOpen ? "#10b981" : "#ef4444", display: "inline-block", boxShadow: `0 0 8px ${isOpen ? "#10b981" : "#ef4444"}` }} />
                    {isOpen ? "OUTLET BEROPERASI" : "DI LUAR JAM"} · SHIFT {shift.n.toUpperCase()} · {now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
                    <div style={S.heroBigNumber}>{fmtRp(curRev)}</div>
                    {revDelta !== 0 && (
                      <div style={{ ...S.heroDelta, color: revDelta >= 0 ? "#10b981" : "#ef4444", background: revDelta >= 0 ? "#10b98115" : "#ef444415", border: `1px solid ${revDelta >= 0 ? "#10b98144" : "#ef444444"}` }}>
                        {revDelta >= 0 ? "▲" : "▼"} {Math.abs(revDelta)}% vs sebelumnya
                      </div>
                    )}
                  </div>
                  <div style={S.heroSubLine}>
                    💰 Penjualan {periodLabel.toLowerCase()} · <b style={{ color: "#fbbf24" }}>{curOrders.length}</b> order · target <b style={{ color: targetPct >= 100 ? "#10b981" : "#fbbf24" }}>{fmtK(target)}</b>
                  </div>
                  {/* Target progress bar */}
                  <div style={S.heroProgress}>
                    <div style={{ ...S.heroProgressFill, width: `${Math.min(100, targetPct)}%`, background: targetPct >= 100 ? "linear-gradient(90deg,#10b981,#22d3ee)" : targetPct >= 60 ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : "linear-gradient(90deg,#ef4444,#f97316)" }} />
                    <span style={S.heroProgressLbl}>{targetPct}%</span>
                  </div>
                </div>
                {/* Right side — circular progress ring + period selector */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
                  <div style={S.segWrap}>
                    {PERIODS.map(p => (
                      <button key={p.k} onClick={() => setPeriod(p.k)}
                        style={{ ...S.seg, ...(period === p.k ? S.segOn : {}) }}>{p.l}</button>
                    ))}
                  </div>
                  <div style={S.heroClock}>{now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                  <div style={S.heroQuickStats}>
                    <span title="Outlet aktif">🏪 <b style={{ color: "#22d3ee" }}>{activeOutlets}/{outlets.length || 6}</b></span>
                    <span title="Order berjalan">🧾 <b style={{ color: "#f59e0b" }}>{orders.length}</b></span>
                    <span title="Alert"><span style={{ color: crit > 0 ? "#ef4444" : "#10b981" }}>🔔 <b>{notifs.length}</b></span></span>
                    <span title="System health">🩺 <b style={{ color: health >= 75 ? "#10b981" : health >= 50 ? "#f59e0b" : "#ef4444" }}>{health ?? "…"}</b></span>
                  </div>
                  {/* Refresh ring + last update */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <RefreshRing pct={refreshPct} secs={refreshSecs} />
                    <div style={{ fontSize: 9.5, color: "#62636b", fontFamily: "'Geist Mono',monospace", lineHeight: 1.3 }}>
                      <div>NEXT TICK</div>
                      <div style={{ color: "#9da7b3" }}>upd {ago(lastRefresh)} lalu</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ TICKER TAPE — NYSE-style scrolling marquee ═══ */}
          <div style={S.tickerTape} className="ah-ticker">
            <div style={S.tickerBadge}>● LIVE</div>
            <div style={S.tickerScroller}>
              <div className="ah-ticker-track">
                {[...tickerItems, ...tickerItems].map((it, i) => (
                  <span key={i} style={S.tickerItem}>
                    <span style={S.tickerSym}>{it.k}</span>
                    <span style={{ ...S.tickerVal, color: it.c }}>{it.v}</span>
                    {it.d != null && (
                      <span style={{ ...S.tickerDelta, color: it.d >= 0 ? "#10b981" : "#ef4444" }}>
                        {it.d >= 0 ? "▲" : "▼"} {Math.abs(it.d)}%
                      </span>
                    )}
                    <span style={S.tickerSep}>·</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={S.kpiRow} className="ah-kpi-row">
            {kpis.map((x, i) => (
              <div key={x.label} className="card ah-kpi-card" style={{ ...S.kpi, animationDelay: `${i * 60}ms`, borderTop: `2px solid ${x.c}` }}>
                <div style={{ ...S.kpiGlow, background: `radial-gradient(circle at 100% 0%, ${x.c}1a, transparent 60%)` }} />
                <div style={{ display: "flex", alignItems: "center", gap: 9, position: "relative" }}>
                  <div style={{ ...S.chip, background: `${x.c}1a`, color: x.c, border: `1px solid ${x.c}33`, boxShadow: `0 0 12px ${x.c}22` }}>{x.icon}</div>
                  <div style={{ ...S.kpiLabel, flex: 1 }}>{x.label}</div>
                  <Delta v={x.delta} />
                </div>
                <div style={{ ...S.kpiVal, color: x.c, textShadow: `0 0 24px ${x.c}40`, position: "relative" }}>
                  <TickValue value={x.valNum} fmt={() => x.val} color={x.c} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 6, position: "relative", marginTop: 2 }}>
                  <div style={{ ...S.kpiSub, position: "relative" }}>{x.sub}</div>
                  {x.spark && x.spark.length >= 2 && (
                    <div style={{ flexShrink: 0 }}><Sparkline data={x.spark} color={x.c} width={86} height={26} /></div>
                  )}
                </div>
                {x.progress != null && (
                  <div style={{ height: 4, background: "#1a1b1e", borderRadius: 2, marginTop: 6, position: "relative" }}>
                    <div style={{ height: "100%", width: Math.min(100, x.progress) + "%", background: x.progress >= 100 ? "linear-gradient(90deg,#10b981,#22d3ee)" : x.progress >= 60 ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : "linear-gradient(90deg,#ef4444,#f97316)", borderRadius: 2, boxShadow: `0 0 8px ${x.c}66` }} />
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
                  <span style={{ width: 18, fontSize: 11, fontWeight: 800, color: i === 0 ? "#f59e0b" : "#5b6470", fontFamily: "'Geist Mono',monospace" }}>#{i + 1}</span>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: o.status === "active" ? "#10b981" : "#5b6470", flexShrink: 0 }} />
                  <div style={{ width: 130 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#e6edf3" }}>{o.name}</div>
                    <div style={{ fontSize: 9.5, color: "#5b6470" }}>{o.area}</div>
                  </div>
                  <div style={{ flex: 1, height: 9, background: "#0a0e16", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: ((o.revenue_today || 0) / maxOutRev * 100) + "%", background: i === 0 ? "#f59e0b" : "#22d3ee" }} />
                  </div>
                  <span style={{ width: 70, textAlign: "right", fontSize: 12, fontWeight: 700, fontFamily: "'Geist Mono',monospace", color: "#cdd5df" }}>{fmtK(o.revenue_today)}</span>
                  <span style={{ width: 56, textAlign: "right", fontSize: 10.5, color: "#5b6470" }}>{o.orders_today} order</span>
                  <span style={{ width: 48, textAlign: "right" }}><Delta v={o.trend_pct} /></span>
                </div>
              ))}
          </div>

          {/* ═══ INTRADAY CHART — line + area, hourly bars below ═══ */}
          <Section label="INTRADAY · PER JAM HARI INI" accent="#22d3ee" mt={14}
            right={<span style={{ fontSize: 10.5, color: "#5b6470", fontFamily: "'Geist Mono',monospace", display: "flex", alignItems: "center", gap: 8 }}>
              <span className="livedot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#22d3ee", display: "inline-block", boxShadow: "0 0 6px #22d3ee" }} />
              {intradayWindow.reduce((s,b) => s + b.orders, 0)} tx · OHLC {String(intradayWindow[0]?.h ?? 0).padStart(2,"0")}:00–{String((intradayWindow[intradayWindow.length-1]?.h ?? 0)).padStart(2,"0")}:59</span>} />
          <div className="card" style={{ ...S.bigCard, padding: "16px 18px" }}>
            {(() => {
              const w = 100, h = 100;
              const data = intradayWindow.map(b => b.rev);
              const maxV = Math.max(1, ...data);
              if (data.length < 2) return <div style={{ fontSize: 11, color: "#5b6470" }}>Belum ada transaksi hari ini</div>;
              const stepX = w / (data.length - 1);
              const pts = data.map((v, i) => [i * stepX, h - 2 - (v / maxV) * (h - 8)]);
              const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
              const area = `${line} L${w},${h} L0,${h} Z`;
              const last = pts[pts.length - 1];
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 14, alignItems: "stretch" }} className="ah-intraday">
                  <div style={{ position: "relative", height: 180 }}>
                    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="100%" style={{ display: "block" }}>
                      <defs>
                        <linearGradient id="intra-grad" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {/* gridlines */}
                      {[0.25, 0.5, 0.75].map(g => (
                        <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} stroke="#1a1b1e" strokeWidth="0.3" strokeDasharray="0.6 0.6" />
                      ))}
                      <path d={area} fill="url(#intra-grad)" />
                      <path d={line} fill="none" stroke="#22d3ee" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 4px #22d3ee99)" }} />
                      <circle cx={last[0]} cy={last[1]} r="1.4" fill="#22d3ee" style={{ filter: "drop-shadow(0 0 4px #22d3ee)" }}>
                        <animate attributeName="r" values="1.4;2.4;1.4" dur="1.6s" repeatCount="indefinite" />
                      </circle>
                      {/* hour labels — non-scaled overlay drawn via foreignObject would be heavy, use bar row below */}
                    </svg>
                    {/* hour labels */}
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: -4, display: "flex", justifyContent: "space-between", fontSize: 9, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>
                      {intradayWindow.map((b, i) => (
                        i === 0 || i === intradayWindow.length - 1 || i === Math.floor(intradayWindow.length / 2)
                          ? <span key={i}>{String(b.h).padStart(2, "0")}:00</span>
                          : <span key={i} style={{ opacity: 0.3 }}>·</span>
                      ))}
                    </div>
                  </div>
                  {/* OHLC-style stats panel */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: "'Geist Mono',monospace", fontSize: 11 }}>
                    {(() => {
                      const total = data.reduce((s, v) => s + v, 0);
                      const peakH = intradayWindow[data.indexOf(maxV)]?.h ?? 0;
                      const lastH = intradayWindow[intradayWindow.length - 1];
                      const prevH = intradayWindow[intradayWindow.length - 2];
                      const tick = lastH && prevH ? lastH.rev - prevH.rev : 0;
                      return (
                        <>
                          <div style={S.ohlcRow}><span style={S.ohlcLbl}>LAST</span><span style={{ color: "#10b981", fontWeight: 700 }}>{fmtK(lastH?.rev || 0)}</span></div>
                          <div style={S.ohlcRow}><span style={S.ohlcLbl}>TICK</span><span style={{ color: tick >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>{tick >= 0 ? "▲" : "▼"} {fmtK(Math.abs(tick))}</span></div>
                          <div style={S.ohlcRow}><span style={S.ohlcLbl}>HIGH</span><span style={{ color: "#fbbf24" }}>{fmtK(maxV)}</span></div>
                          <div style={S.ohlcRow}><span style={S.ohlcLbl}>PEAK</span><span style={{ color: "#9da7b3" }}>{String(peakH).padStart(2,"0")}:00</span></div>
                          <div style={S.ohlcRow}><span style={S.ohlcLbl}>VOL</span><span style={{ color: "#22d3ee" }}>{intradayWindow.reduce((s,b)=>s+b.orders,0)} tx</span></div>
                          <div style={S.ohlcRow}><span style={S.ohlcLbl}>SUM</span><span style={{ color: "#e6edf3", fontWeight: 700 }}>{fmtK(total)}</span></div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ═══ TRADE TAPE — Bloomberg-style scrolling order log ═══ */}
          <Section label="TRADE TAPE — LIVE ORDER LOG" accent="#10b981" mt={14}
            right={<span style={{ fontSize: 10.5, color: "#5b6470", fontFamily: "'Geist Mono',monospace", display: "flex", alignItems: "center", gap: 6 }}>
              <span className="livedot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block", boxShadow: "0 0 6px #10b981" }} />
              LIVE · {curOrders.length} tx {periodLabel.toLowerCase()}</span>} />
          <div className="card" style={{ ...S.bigCard, padding: 0, overflow: "hidden" }}>
            {recentSales.length === 0 ? <div style={{ fontSize: 11, color: "#5b6470", padding: "14px 16px" }}>Belum ada transaksi</div>
              : (<>
                <div style={S.tapeHead}>
                  <span style={{ width: 70 }}>TIME</span>
                  <span style={{ width: 60 }}>ID</span>
                  <span style={{ width: 38 }}>TYPE</span>
                  <span style={{ flex: 1 }}>STATUS</span>
                  <span style={{ width: 100, textAlign: "right" }}>QTY×PRICE</span>
                  <span style={{ width: 110, textAlign: "right" }}>VALUE</span>
                </div>
                <div style={S.tapeBody}>
                  {recentSales.map((o, idx) => {
                    const st = o.status === "completed" ? "#10b981" : o.status === "cancelled" ? "#ef4444" : "#f59e0b";
                    const stLbl = o.status === "completed" ? "FILLED" : o.status === "cancelled" ? "CANX" : (o.status || "OPEN").toUpperCase();
                    const qty = (o.items || []).reduce((s, x) => s + (x.q || 0), 0);
                    const avg = qty > 0 ? Math.round((o.total || 0) / qty) : (o.total || 0);
                    const time = o.time ? new Date(o.time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
                    return (
                      <div key={o.id} className="ah-tape-row" style={{ ...S.tapeRow, borderLeft: `3px solid ${st}`, animationDelay: `${idx * 25}ms` }}>
                        <span style={{ width: 70, color: "#5b6470" }}>{time}</span>
                        <span style={{ width: 60, color: "#9da7b3", fontWeight: 700 }}>#{o.id}</span>
                        <span style={{ width: 38, fontSize: 14 }}>{o.type === "dine" ? "🪑" : "🛍️"}</span>
                        <span style={{ flex: 1, color: st, fontWeight: 700 }}>{stLbl}</span>
                        <span style={{ width: 100, textAlign: "right", color: "#7a7b82" }}>{qty}×{fmtK(avg)}</span>
                        <span style={{ width: 110, textAlign: "right", color: "#10b981", fontWeight: 800 }}>{fmtRp(o.total)}</span>
                      </div>
                    );
                  })}
                </div>
              </>)}
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
                        <span style={{ fontSize: 14, fontWeight: 800, color: q.c, fontFamily: "'Geist Mono',monospace" }}>{list.length}</span>
                      </div>
                      {list.length === 0 ? <div style={{ fontSize: 10.5, color: "#5b6470", padding: "4px 0" }}>Tidak ada order</div>
                        : <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {list.slice(0, 4).map(o => (
                              <div key={o.id} style={S.orderChip}>
                                <span style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#e6edf3" }}>#{o.id}</span>
                                <span style={{ flex: 1, textAlign: "right", color: "#9da7b3", fontFamily: "'Geist Mono',monospace" }}>{fmtK(o.total)}</span>
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
                right={<span style={{ fontSize: 12.5, fontWeight: 800, color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{fmtRp(dayRev.reduce((s, x) => s + x.rev, 0))}</span>} />
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
            right={<span style={{ fontSize: 10.5, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{notifs.length} alert · {crit} mendesak</span>} />
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
                        <span style={{ fontSize: 9.5, color: "#5b6470", fontFamily: "'Geist Mono',monospace", flexShrink: 0 }}>{x.source}</span>
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
                      <span style={{ fontSize: 11, fontWeight: 800, color: i === 0 ? "#f59e0b" : "#5b6470", fontFamily: "'Geist Mono',monospace", width: 18 }}>#{i + 1}</span>
                      <span style={{ fontSize: 15 }}>{d.e}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#cdd5df", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n}</div>
                        <div style={{ height: 3, background: "#161b22", borderRadius: 2, marginTop: 3 }}>
                          <div style={{ height: "100%", width: (d.qty / maxQty * 100) + "%", background: "#f59e0b", borderRadius: 2 }} />
                        </div>
                      </div>
                      <span style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#f59e0b", fontSize: 12 }}>{d.qty}×</span>
                    </div>
                  ))}
                </div>}
          </div>
          </>)}
        </main>
      </div>

      <div style={S.footer} className="no-print">
        {onLogout && <button className="tile" style={{ ...S.footBtn, color: "#f87171", borderColor: "#f8717133" }} onClick={onLogout}>Logout</button>}
        <span style={{ flex: 1 }} />
        <span style={S.footNote}>karyaOS · 145+ modul · 🎬 Cinema · 🍽️ F&B · 🛡️ Enterprise · v5 · <kbd style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "1px 5px", fontSize: 9.5, color: "rgba(255,255,255,0.6)", fontFamily: "'Geist Mono',monospace" }}>⌘K</kbd> untuk cari</span>
      </div>

      {/* ⌘K Universal Command Palette */}
      <CommandPalette items={commandItems} placeholder="Cari modul, surface, atau action…" />
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

/* ═══ DASHBOARD HERO — animated entry, glow, dramatic ═══ */
@keyframes ah-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ah-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes ah-mesh-rotate { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes ah-glow-pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes ah-number-pop { 0% { opacity: 0; transform: scale(.85); letter-spacing: -2px; } 60% { transform: scale(1.04); } 100% { opacity: 1; transform: scale(1); letter-spacing: -1.2px; } }
@keyframes ah-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

.ah-hero { animation: ah-fade-up .55s cubic-bezier(.2,.85,.25,1) both; }
.ah-hero .ah-hero-mesh { animation: ah-mesh-rotate 60s linear infinite; }
.ah-hero h1, .ah-hero .ah-big-num { animation: ah-number-pop .8s cubic-bezier(.18,1.05,.4,1) both .15s; }

.ah-kpi-row .ah-kpi-card { animation: ah-fade-up .45s cubic-bezier(.2,.85,.25,1) both; position: relative; overflow: hidden; transition: transform .18s, border-color .18s, box-shadow .18s; }
.ah-kpi-row .ah-kpi-card:hover { transform: translateY(-3px); border-color: #2a2b30 !important; box-shadow: 0 12px 32px rgba(0,0,0,.5); }

.ah-section-card { animation: ah-fade-up .45s cubic-bezier(.2,.85,.25,1) both; }

/* ═══ STOCK-TERMINAL primitives — ticker, tape, tick-flash ═══ */
@keyframes ah-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
@keyframes ah-tape-in { from { opacity: 0; transform: translateX(-8px); background: rgba(16,185,129,.18); } to { opacity: 1; transform: translateX(0); background: transparent; } }
@keyframes ah-tick-flash-up { 0% { background: rgba(16,185,129,.22); } 100% { background: transparent; } }
@keyframes ah-tick-flash-down { 0% { background: rgba(239,68,68,.22); } 100% { background: transparent; } }

.ah-ticker .ah-ticker-track { display: inline-flex; white-space: nowrap; animation: ah-marquee 60s linear infinite; will-change: transform; }
.ah-ticker:hover .ah-ticker-track { animation-play-state: paused; }

.ah-tape-row { animation: ah-tape-in .5s cubic-bezier(.2,.85,.25,1) both; transition: background .15s; }
.ah-tape-row:hover { background: #14151a !important; }

.ah-tick.ah-tick-up { animation: ah-tick-flash-up 1s ease-out; padding: 0 4px; border-radius: 4px; }
.ah-tick.ah-tick-down { animation: ah-tick-flash-down 1s ease-out; padding: 0 4px; border-radius: 4px; }

/* ═══ Terminal mode (nav hidden = full-width "lihat saham") ═══ */
.ah-body { transition: grid-template-columns .25s ease; }
.ah-nav-toggle:hover { background: #22d3ee15 !important; border-color: #22d3ee55 !important; color: #22d3ee !important; }
@media (max-width: 768px) {
  .ah-nav-toggle { display: none !important; }
}

@media (max-width: 768px) {
  .ah-intraday { grid-template-columns: 1fr !important; }
}

.ah-hamburger { display: none; }
.ah-backdrop { display: none; }
@media (max-width: 768px) {
  .ah-hamburger { display: inline-flex !important; align-items: center; }
  .ah-body { grid-template-columns: 1fr !important; }
  .ah-rail {
    position: fixed !important; left: 0; top: 0; bottom: 0;
    width: 264px; z-index: 10001; background: #08090a;
    padding: 14px 14px 24px; overflow-y: auto;
    transform: translateX(-100%); transition: transform .22s ease;
    box-shadow: 2px 0 28px rgba(0,0,0,.7);
  }
  .ah-rail.ah-rail-open { transform: translateX(0); }
  .ah-backdrop[data-open="true"] {
    display: block !important; position: fixed; inset: 0;
    background: rgba(0,0,0,.55); z-index: 10000;
  }
}
@media print { .ah-hamburger, .ah-backdrop { display: none !important; } }
`;

// Premium dark — Linear/Vercel: flat near-black, hairline borders,
// calm neutrals, depth via subtle inset highlight (di CSS .card).
const S = {
  root: { minHeight: "100vh", background: "#08090a", color: "#c3c4c9", fontFamily: "'Geist','Inter',system-ui,sans-serif", padding: "16px 28px 24px", boxSizing: "border-box" },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottom: "1px solid #1a1b1e" },
  logo: { width: 38, height: 38, borderRadius: 10, background: "linear-gradient(160deg,#f5a623,#d97706)", color: "#1a1205", fontWeight: 900, fontSize: 21, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  brand: { fontSize: 21, fontWeight: 750, color: "#f0f0f2", letterSpacing: -0.4, lineHeight: 1 },
  brandSub: { fontSize: 9, color: "#55565d", fontFamily: "'Geist Mono',monospace", letterSpacing: 2, marginTop: 4 },
  clock: { fontSize: 20, fontWeight: 700, color: "#f0f0f2", fontFamily: "'Geist Mono',monospace", lineHeight: 1 },
  greetLine: { fontSize: 11.5, color: "#62636b", marginTop: 5 },
  role: { fontSize: 9, fontWeight: 700, color: "#f5a623", background: "#f5a6231a", border: "1px solid #f5a62338", borderRadius: 4, padding: "1px 6px", marginLeft: 8, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" },
  opStrip: { display: "flex", alignItems: "center", gap: 11, fontSize: 11.5, color: "#9a9ba1", background: "#0e0e11", border: "1px solid #1e1f23", borderRadius: 10, padding: "9px 14px", margin: "13px 0 2px" },
  opDot: { width: 3, height: 3, borderRadius: "50%", background: "#3a3b40" },
  body: { display: "grid", gridTemplateColumns: "264px 1fr", gap: 20, alignItems: "start", marginTop: 12 },
  left: { display: "flex", flexDirection: "column" },
  right: { display: "flex", flexDirection: "column", minWidth: 0 },
  // ═══ HERO BANNER STYLES ═══
  hero: { position: "relative", background: "linear-gradient(135deg, #0d0e13 0%, #14151c 50%, #0d0e13 100%)", border: "1px solid #26272d", borderRadius: 18, padding: "22px 26px 26px", marginBottom: 14, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.4), inset 0 1px 0 0 #ffffff0a" },
  heroMesh: { position: "absolute", inset: "-50%", background: "radial-gradient(circle at 30% 50%, #f59e0b1a, transparent 50%), radial-gradient(circle at 70% 30%, #3b82f615, transparent 50%), radial-gradient(circle at 50% 80%, #10b98112, transparent 50%)", pointerEvents: "none", opacity: 0.75 },
  heroContent: { position: "relative", zIndex: 1 },
  heroGreet: { fontSize: 14, color: "#9da7b3", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
  heroKicker: { fontSize: 10.5, color: "#62636b", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 7 },
  heroBigNumber: { fontSize: 44, fontWeight: 800, color: "#f0f0f2", fontFamily: "'Geist Mono',monospace", letterSpacing: -1.2, lineHeight: 1, textShadow: "0 0 40px rgba(245,158,11,0.2)" },
  heroDelta: { fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 7, fontFamily: "'Geist Mono',monospace" },
  heroSubLine: { fontSize: 12.5, color: "#7a7b82", marginTop: 6 },
  heroProgress: { position: "relative", height: 10, background: "#0a0b0e", border: "1px solid #1e1f23", borderRadius: 6, marginTop: 12, overflow: "hidden", maxWidth: 460 },
  heroProgressFill: { height: "100%", borderRadius: 5, transition: "width .5s ease-out", boxShadow: "0 0 16px currentColor" },
  heroProgressLbl: { position: "absolute", right: 8, top: -2, fontSize: 10, color: "#9da7b3", fontFamily: "'Geist Mono',monospace", fontWeight: 700 },
  heroClock: { fontSize: 22, fontWeight: 700, color: "#f0f0f2", fontFamily: "'Geist Mono',monospace", lineHeight: 1, letterSpacing: 0.5 },
  heroQuickStats: { display: "flex", gap: 14, fontSize: 11.5, color: "#9da7b3", fontFamily: "'Geist Mono',monospace" },
  kpiGlow: { position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.85 },
  segWrap: { display: "flex", gap: 2, background: "#0e0e11", border: "1px solid #1e1f23", borderRadius: 9, padding: 3 },
  seg: { background: "transparent", border: "none", color: "#7a7b82", fontSize: 11, fontWeight: 600, padding: "5px 13px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" },
  segOn: { background: "#26272b", color: "#f0f0f2" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 13 },
  kpi: { background: "#0e0e11", border: "1px solid #1e1f23", borderRadius: 13, padding: "13px 15px" },
  chip: { width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 },
  kpiLabel: { fontSize: 9.5, color: "#7a7b82", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5, textTransform: "uppercase" },
  kpiVal: { fontSize: 21, fontWeight: 750, fontFamily: "'Geist Mono',monospace", margin: "9px 0 2px", letterSpacing: -0.3 },
  kpiSub: { fontSize: 10.5, color: "#62636b" },
  sectionHead: { display: "flex", alignItems: "center", gap: 8, margin: "18px 2px 10px" },
  sectionLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: 1.6, color: "#86878e", fontFamily: "'Geist Mono',monospace" },
  linkBtn: { background: "transparent", border: "none", color: "#6b7280", fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: "'Geist Mono',monospace" },
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
  barVal: { fontSize: 9, color: "#10b981", fontFamily: "'Geist Mono',monospace" },
  barLbl: { fontSize: 9.5, color: "#62636b", fontFamily: "'Geist Mono',monospace" },
  ticker: { display: "flex", gap: 9, overflowX: "auto", paddingBottom: 4 },
  saleCard: { minWidth: 124, flexShrink: 0, background: "#121214", border: "1px solid #1c1d20", borderRadius: 10, padding: "9px 11px" },
  // ═══ Stock-terminal: ticker tape + trade tape + OHLC stats ═══
  tickerTape: { display: "flex", alignItems: "center", gap: 10, background: "linear-gradient(90deg,#0a0b0e 0%, #0e0e11 100%)", border: "1px solid #1e1f23", borderRadius: 10, padding: "8px 0 8px 12px", margin: "10px 0 14px", overflow: "hidden", boxShadow: "inset 0 1px 0 0 #ffffff08" },
  tickerBadge: { fontSize: 9, fontWeight: 800, color: "#ef4444", fontFamily: "'Geist Mono',monospace", letterSpacing: 1, background: "#ef444415", border: "1px solid #ef444444", borderRadius: 4, padding: "3px 7px", flexShrink: 0, animation: "lp 1.6s infinite" },
  tickerScroller: { flex: 1, overflow: "hidden", maskImage: "linear-gradient(90deg, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)", WebkitMaskImage: "linear-gradient(90deg, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)" },
  tickerItem: { display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "'Geist Mono',monospace", fontSize: 11.5, padding: "0 4px" },
  tickerSym: { color: "#7a7b82", fontWeight: 700, letterSpacing: 0.6 },
  tickerVal: { fontWeight: 800 },
  tickerDelta: { fontSize: 10, fontWeight: 700 },
  tickerSep: { color: "#3a3b40", margin: "0 10px" },
  tapeHead: { display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", fontSize: 9, fontWeight: 800, color: "#62636b", fontFamily: "'Geist Mono',monospace", letterSpacing: 1, borderBottom: "1px solid #1e1f23", background: "#0a0b0e" },
  tapeBody: { display: "flex", flexDirection: "column", maxHeight: 264, overflowY: "auto" },
  tapeRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", fontSize: 11.5, fontFamily: "'Geist Mono',monospace", borderBottom: "1px solid #14151a" },
  ohlcRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#121214", border: "1px solid #1c1d20", borderRadius: 6, padding: "5px 10px" },
  ohlcLbl: { fontSize: 9, color: "#5b6470", letterSpacing: 1.2, fontWeight: 700 },
  feed: { display: "flex", flexDirection: "column", gap: 5, maxHeight: 232, overflowY: "auto" },
  feedRow: { display: "flex", alignItems: "center", gap: 9, background: "#121214", border: "1px solid #1c1d20", borderRadius: 8, padding: "6px 10px" },
  prioBadge: { fontSize: 8.5, fontWeight: 800, borderRadius: 4, padding: "2px 6px", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5, flexShrink: 0, width: 44, textAlign: "center" },
  topGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 30px", marginTop: 2 },
  rowTile: { display: "flex", alignItems: "center", gap: 10, background: "#0e0e11", border: "1px solid #1e1f23", borderRadius: 10, padding: "8px 12px", fontFamily: "inherit", width: "100%" },
  footer: { display: "flex", alignItems: "center", gap: 10, marginTop: 18, paddingTop: 14, borderTop: "1px solid #1a1b1e" },
  footBtn: { background: "#0e0e11", border: "1px solid #26272b", borderRadius: 8, padding: "7px 15px", color: "#9a9ba1", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  footNote: { fontSize: 10, color: "#3c3d42", fontFamily: "'Geist Mono',monospace" },
};
