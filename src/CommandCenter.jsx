/**
 * CommandCenter.jsx — Bites & Co. Enterprise Dashboard
 * Route: ?command=1
 * 
 * Connects to:
 *   - WebSocket ws://localhost:3001 (existing pos:* events)
 *   - GET /api/audit/dashboard      → KPIs + P&L
 *   - GET /api/audit/top-menu       → top items + category perf
 *   - GET /api/audit/anomalies      → detected anomalies
 *   - GET /api/audit/warehouse      → stock levels + PPIC
 *   - GET /api/audit/promo          → promo performance + emp discount
 *   - GET /api/audit/outlets        → per-outlet performance
 *   - GET /api/reports/z            → Z-Report data (existing)
 * 
 * Fallback: mock data jika endpoint belum ready
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";

// ═══ CONFIG ══════════════════════════════════════════════════════════════════
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";  // relative — same origin
const POLL_INTERVAL = 15000;  // refresh data tiap 15 detik
const WS_EVENTS = [
  "pos:order_complete","pos:cart_update","pos:phone_lookup",
  "pos:customer_recognized","pos:cash_received","pos:payment_method",
  "pos:promo_applied","pos:points_redeemed","pos:transaction_breakdown",
  "pos:void","order:new","order:updated","shift:close",
];

// ═══ ANOMALY RULES (audit module Phase 4B) ═══════════════════════════════════
const RULES = {
  VOID_BOM:       { l:"Void / Bom Berlebihan", i:"💣", cl:"#EF4444", d:"≥4 void/shift atau loop void→re-order" },
  PHANTOM_CUP:    { l:"Cup Tanpa Produk",      i:"🥤", cl:"#F97316", d:"Kitchen ready tapi order void" },
  PROMO_ABUSE:    { l:"Promo Abuse",            i:"🏷️", cl:"#EAB308", d:"Stacking / >5x/hari / expired lolos" },
  POIN_DRAIN:     { l:"Poin Drain",             i:"⭐", cl:"#8B5CF6", d:"Member baru redeem besar" },
  CASH_GAP:       { l:"Selisih Kas",            i:"💵", cl:"#DC2626", d:"Gap >50K atau minus beruntun" },
  DISC_NOAUTH:    { l:"Diskon No-Auth",         i:"✂️", cl:"#EC4899", d:"Tanpa PIN manager" },
  ODD_HOUR:       { l:"Jam Tidak Wajar",        i:"🌙", cl:"#6366F1", d:"Aktivitas di luar jam operasi" },
  REFUND_LOOP:    { l:"Refund Loop",            i:"🔄", cl:"#14B8A6", d:"Same SKU refund ≥2x/24h" },
  CANCEL_PROD:    { l:"Cancel Post-Prod",       i:"🚫", cl:"#F43F5E", d:"Void setelah kitchen preparing" },
  EMP_DISC:       { l:"Diskon Karyawan",        i:"👤", cl:"#D946EF", d:">2x/shift atau ke non-karyawan" },
  WASTE_SPIKE:    { l:"Waste Spike",            i:"🗑️", cl:"#78716C", d:"Waste naik >150% vs avg" },
  STOCK_GHOST:    { l:"Stok Ghost",             i:"👻", cl:"#84CC16", d:"Selisih sistem vs fisik" },
};

const SV = {
  critical: { l:"CRIT", bg:"#450a0a", bd:"#dc2626", tx:"#fca5a5", w:4 },
  high:     { l:"HIGH", bg:"#451a03", bd:"#ea580c", tx:"#fdba74", w:3 },
  medium:   { l:"MED",  bg:"#422006", bd:"#ca8a04", tx:"#fde047", w:2 },
  low:      { l:"LOW",  bg:"#052e16", bd:"#16a34a", tx:"#86efac", w:1 },
};

// ═══ UTILS ═══════════════════════════════════════════════════════════════════
const fR = n => (n < 0 ? "−" : "") + "Rp " + Math.abs(n).toLocaleString("id-ID");
const fK = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "jt" : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(n);
const fP = n => n.toFixed(1) + "%";
const clk = () => {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(v => String(v).padStart(2, "0")).join(":");
};
const ago = ts => {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 6e4);
  return m < 1 ? "now" : m < 60 ? m + "m" : Math.floor(m / 60) + "h";
};

// ═══ DATA FETCHER ════════════════════════════════════════════════════════════
async function fetchAudit(endpoint) {
  try {
    const res = await fetch(`${API_BASE}/api/audit/${endpoint}`);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn(`[CC] /api/audit/${endpoint} unavailable:`, e.message);
    return null;
  }
}

async function fetchZReport() {
  try {
    const res = await fetch(`${API_BASE}/api/reports/z`);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("[CC] Z-Report unavailable:", e.message);
    return null;
  }
}

// ═══ UI ATOMS ════════════════════════════════════════════════════════════════
const F = "var(--f)";

const SvB = ({ s }) => {
  const v = SV[s];
  return v ? (
    <span style={{
      background: v.bg, border: `1px solid ${v.bd}`, color: v.tx,
      padding: "1px 5px", borderRadius: 3, fontSize: 7,
      fontWeight: 700, letterSpacing: .8, fontFamily: F
    }}>{v.l}</span>
  ) : null;
};

const Box = ({ children, style: sx, ...rest }) => (
  <div style={{
    background: "#0c0c10", border: "1px solid #18181f",
    borderRadius: 10, padding: "10px 10px", ...sx
  }} {...rest}>{children}</div>
);

const Hd = ({ children }) => (
  <div style={{
    fontSize: 8, color: "#3e3e4a", fontFamily: F,
    textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6
  }}>{children}</div>
);

const Bar = ({ pct, color, h = 4 }) => (
  <div style={{
    height: h, background: "#18181f", borderRadius: h,
    overflow: "hidden", flex: 1
  }}>
    <div style={{
      width: `${Math.min(Math.max(pct, 1), 100)}%`,
      height: "100%", background: color, borderRadius: h,
      transition: "width .5s cubic-bezier(.4,0,.2,1)"
    }} />
  </div>
);

const Num = ({ v, c, sz = 20 }) => (
  <span style={{
    fontSize: sz, fontWeight: 700, color: c,
    fontFamily: F, lineHeight: 1
  }}>{v}</span>
);

const Row = ({ l, r, rc = "#888" }) => (
  <div style={{
    display: "flex", justifyContent: "space-between",
    padding: "3px 0", borderBottom: "1px solid #12121a"
  }}>
    <span style={{ fontSize: 10, color: "#aaa" }}>{l}</span>
    <span style={{ fontSize: 10, fontWeight: 600, fontFamily: F, color: rc }}>{r}</span>
  </div>
);

// ═══ MAIN COMPONENT ══════════════════════════════════════════════════════════
export default function CommandCenter() {
  const [tab, setTab] = useState("live");
  const [now, setNow] = useState(clk());
  const [feed, setFeed] = useState([]);
  const [exp, setExp] = useState(null);
  const [aF, setAF] = useState(null);

  // ── DATA STATE ──
  const [dashboard, setDashboard] = useState(null);
  const [topMenu, setTopMenu] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [warehouse, setWarehouse] = useState(null);
  const [promoData, setPromoData] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [zReport, setZReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const wsRef = useRef(null);

  // ── CLOCK ──
  useEffect(() => {
    const t = setInterval(() => setNow(clk()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── WEBSOCKET ──
  useEffect(() => {
    let ws;
    let reconnectTimer;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname;
      ws = new WebSocket(`${API_BASE.replace("http","ws")}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[CC] WebSocket connected");
        setFeed(prev => [{
          t: clk(), x: "🟢 WebSocket connected", k: "sys"
        }, ...prev].slice(0, 80));
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          const eventType = data.type || data.event || "unknown";
          const detail = formatWsEvent(data);

          setFeed(prev => [{
            t: clk(),
            x: `${eventType} → ${detail}`,
            k: isAnomalyEvent(eventType, data) ? "err" : "ok",
            data,
          }, ...prev].slice(0, 80));

          // Auto-refresh on key events
          if (["pos:order_complete", "pos:void", "shift:close"].includes(eventType)) {
            refreshData();
          }

          // Detect anomalies in real-time from WS events
          const detected = detectAnomaly(eventType, data);
          if (detected) {
            setAnomalies(prev => [detected, ...prev]);
          }
        } catch (e) {
          // non-JSON message
          setFeed(prev => [{
            t: clk(), x: String(evt.data).slice(0, 80), k: "ws"
          }, ...prev].slice(0, 80));
        }
      };

      ws.onclose = () => {
        console.log("[CC] WebSocket disconnected, reconnecting...");
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // ── DATA POLLING ──
  const refreshData = useCallback(async () => {
    const [dash, menu, anom, wh, promo, outs, zr] = await Promise.all([
      fetchAudit("dashboard"),
      fetchAudit("top-menu"),
      fetchAudit("anomalies"),
      fetchAudit("warehouse"),
      fetchAudit("promo"),
      fetchAudit("outlets"),
      fetchZReport(),
    ]);

    if (dash) setDashboard(dash);
    if (menu) setTopMenu(menu);
    if (anom?.items) setAnomalies(prev => mergeAnomalies(prev, anom.items));
    if (wh) setWarehouse(wh);
    if (promo) setPromoData(promo);
    if (outs?.items) setOutlets(outs.items);
    if (zr) setZReport(zr);
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshData();
    const t = setInterval(refreshData, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [refreshData]);

  // ── HELPERS ──
  function formatWsEvent(data) {
    const parts = [];
    if (data.cashier || data.cashierName) parts.push(data.cashier || data.cashierName);
    if (data.item || data.itemName) parts.push(data.item || data.itemName);
    if (data.amount || data.total) parts.push(fR(data.amount || data.total));
    if (data.outlet || data.outletName) parts.push(data.outlet || data.outletName);
    return parts.join(" • ") || JSON.stringify(data).slice(0, 60);
  }

  function isAnomalyEvent(type, data) {
    if (type === "pos:void") return true;
    if (type === "pos:promo_applied" && data.stackCount > 1) return true;
    if (type === "pos:points_redeemed" && data.points > 2000) return true;
    return false;
  }

  function detectAnomaly(type, data) {
    const now = new Date().toISOString();
    const id = `AN-${Date.now().toString(36)}`;
    const base = { id, ts: now, nw: true, res: false };

    // Void spike detection
    if (type === "pos:void") {
      return {
        ...base, type: "VOID_BOM", sev: "high",
        amt: data.amount || data.total || 0,
        det: `Void ${data.orderId || ""} oleh ${data.cashier || "?"} — ${data.reason || "no reason"}.`,
        cs: data.cashier || "?", ol: data.outlet || "?",
      };
    }

    // Large point redemption
    if (type === "pos:points_redeemed" && (data.points || 0) > 2000) {
      return {
        ...base, type: "POIN_DRAIN", sev: "critical",
        amt: (data.points || 0) * 100,
        det: `Redeem ${data.points} poin (${fR(data.points * 100)}). Member: ${data.phone || "?"}.`,
        cs: data.cashier || "?", ol: data.outlet || "?",
      };
    }

    return null;
  }

  function mergeAnomalies(existing, incoming) {
    const ids = new Set(existing.map(a => a.id));
    const newOnes = incoming.filter(a => !ids.has(a.id));
    return [...newOnes, ...existing];
  }

  const resolve = useCallback(async (id) => {
    setAnomalies(prev => prev.map(a => a.id === id ? { ...a, res: true } : a));
    // POST to backend
    try {
      await fetch(`${API_BASE}/api/audit/anomalies/${id}/resolve`, { method: "POST" });
    } catch (e) {
      console.warn("[CC] Resolve API unavailable:", e.message);
    }
  }, []);

  // ── COMPUTED ──
  const d = dashboard || {};
  const z = zReport || {};
  const zSum = z.summary || {};

  const unr = useMemo(() => anomalies.filter(a => !a.res), [anomalies]);
  const critN = unr.filter(a => a.sev === "critical").length;
  const aLoss = unr.reduce((s, a) => s + (a.amt || 0), 0);
  const aByT = useMemo(() => {
    const m = {};
    Object.keys(RULES).forEach(k => { m[k] = 0; });
    unr.forEach(a => { if (m[a.type] !== undefined) m[a.type]++; });
    return m;
  }, [unr]);
  const fltA = useMemo(() => unr.filter(a => !aF || a.type === aF), [unr, aF]);

  const whAlerts = warehouse?.items?.filter(w => w.stock <= w.minStock) || [];

  const TABS = [
    { id: "live",   lb: "Live",    ic: "⚡", ac: "#10b981" },
    { id: "menu",   lb: "Menu",    ic: "📊", ac: "#3b82f6" },
    { id: "fin",    lb: "Finance", ic: "📒", ac: "#a78bfa" },
    { id: "wh",     lb: "WH/PPIC", ic: "📦", ac: "#f59e0b", bg: whAlerts.length },
    { id: "promo",  lb: "Promo",   ic: "🏷️", ac: "#ec4899" },
    { id: "anom",   lb: "Alert",   ic: "🚨", ac: "#ef4444", bg: unr.length },
    { id: "outlet", lb: "Outlet",  ic: "🏪", ac: "#06b6d4" },
  ];

  // ── RENDER ──
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#08080b", display: "flex",
        alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12,
      }}>
        <div style={{
          width: 32, height: 32, border: "3px solid #18181f",
          borderTop: "3px solid #10b981", borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }} />
        <div style={{ color: "#4a4a55", fontSize: 12, fontFamily: "monospace" }}>
          Connecting to Bites-Kiosk...
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#08080b", color: "#d4d4d8",
      "--f": "'Geist Mono', ui-monospace, 'SF Mono', monospace",
      "--s": "'Geist', 'Segoe UI', system-ui, sans-serif",
      fontFamily: "var(--s)",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&display=swap');
        @font-face{font-family:'Geist';src:url('https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/fonts/geist-sans/Geist-Regular.woff2') format('woff2');font-weight:400}
        @font-face{font-family:'Geist';src:url('https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/fonts/geist-sans/Geist-Medium.woff2') format('woff2');font-weight:500}
        @font-face{font-family:'Geist';src:url('https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/fonts/geist-sans/Geist-SemiBold.woff2') format('woff2');font-weight:600}
        @font-face{font-family:'Geist';src:url('https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/fonts/geist-sans/Geist-Bold.woff2') format('woff2');font-weight:700}
        *{box-sizing:border-box;margin:0;padding:0}
        #root,body{zoom:1.6}
        ::-webkit-scrollbar{width:2px}::-webkit-scrollbar-thumb{background:#2a2a35;border-radius:1px}
        @keyframes pp{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes si{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes gl{0%,100%{box-shadow:0 0 4px #ef444433}50%{box-shadow:0 0 12px #ef444488}}
      `}</style>

      {/* ═══ HEADER ═══ */}
      <div style={{ padding: "10px 12px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#10b981", boxShadow: "0 0 8px #10b981",
            animation: "pp 2s infinite",
          }} />
          <div>
            <h1 style={{ fontSize: 14, fontWeight: 700, letterSpacing: -.8, color: "#fafafa" }}>
              Bites & Co.
            </h1>
            <p style={{ fontSize: 7, color: "#333", fontFamily: F, letterSpacing: .8 }}>
              COMMAND CENTER • REALTIME
            </p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: F, color: "#555", letterSpacing: 2 }}>{now}</div>
          {critN > 0 && (
            <div style={{
              fontSize: 7, fontFamily: F, animation: "gl 2s infinite",
              display: "inline-block", padding: "1px 5px", borderRadius: 3,
              background: "#450a0a", border: "1px solid #dc262644", color: "#fca5a5",
            }}>{critN} CRITICAL</div>
          )}
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div style={{
        display: "flex", padding: "8px 6px 0",
        borderBottom: "1px solid #111118", overflowX: "auto",
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, minWidth: 0, padding: "5px 2px", fontSize: 9,
            fontWeight: tab === t.id ? 700 : 400,
            color: tab === t.id ? t.ac : "#4a4a55",
            background: "transparent", border: "none",
            borderBottom: tab === t.id ? `2px solid ${t.ac}` : "2px solid transparent",
            cursor: "pointer", fontFamily: "var(--s)", position: "relative",
            textAlign: "center", whiteSpace: "nowrap",
          }}>
            {t.ic} {t.lb}
            {(t.bg || 0) > 0 && (
              <span style={{
                position: "absolute", top: 1, right: 1,
                background: t.ac, color: "#fff", fontSize: 6, fontWeight: 700,
                borderRadius: 6, padding: "0 3px", minWidth: 12, lineHeight: "12px",
              }}>{t.bg > 99 ? "99+" : t.bg}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: "10px 12px 16px" }}>

        {/* ═══ LIVE SALES ═══ */}
        {tab === "live" && (
          <div style={{ animation: "si .25s ease-out" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
              <Box style={{ borderLeft: "3px solid #10b981" }}>
                <div style={{ fontSize: 7, color: "#4a4a55", fontFamily: F, letterSpacing: 1 }}>REVENUE</div>
                <Num v={fK(zSum.grossRevenue || d.revenue || 0)} c="#10b981" sz={22} />
                <div style={{ fontSize: 8, color: "#2a2a35", fontFamily: F }}>
                  {zSum.totalOrders || d.orderCount || 0} orders
                </div>
              </Box>
              <Box style={{ borderLeft: "3px solid #3b82f6" }}>
                <div style={{ fontSize: 7, color: "#4a4a55", fontFamily: F, letterSpacing: 1 }}>TRANSAKSI</div>
                <Num v={zSum.totalOrders || d.orderCount || 0} c="#3b82f6" sz={22} />
                <div style={{ fontSize: 8, color: "#2a2a35", fontFamily: F }}>
                  avg {fR(zSum.avgTicket || d.avgTicket || 0)}
                </div>
              </Box>
            </div>

            {/* Payment breakdown from Z-Report */}
            {z.payments && (
              <Box style={{ marginBottom: 8 }}>
                <Hd>PEMBAYARAN</Hd>
                {Object.entries(z.payments).map(([method, data]) => {
                  const pct = (zSum.totalOrders || 1) > 0
                    ? Math.round((data.count || 0) / (zSum.totalOrders || 1) * 100) : 0;
                  const color = method.toUpperCase() === "CASH" ? "#10b981" : "#3b82f6";
                  return (
                    <div key={method} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 13 }}>{method.toUpperCase() === "CASH" ? "💵" : "📱"}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color }}>{method}</span>
                          <span style={{ fontSize: 9, fontFamily: F, color: "#666" }}>
                            {data.count}× ({pct}%)
                          </span>
                        </div>
                        <Bar pct={pct} color={color} />
                        <div style={{ fontSize: 8, color: "#333", fontFamily: F, marginTop: 1 }}>
                          {fR(data.total || 0)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Box>
            )}

            {/* WS Feed */}
            <Box style={{ maxHeight: 200, overflowY: "auto", padding: 6 }}>
              <Hd>WEBSOCKET LIVE FEED</Hd>
              {feed.length === 0 && (
                <div style={{ color: "#2a2a35", fontSize: 9, fontFamily: F, padding: 8, textAlign: "center" }}>
                  Waiting for events...
                </div>
              )}
              {feed.slice(0, 20).map((e, i) => (
                <div key={i} style={{
                  fontSize: 8, fontFamily: F, padding: "1px 0",
                  color: e.k === "err" ? "#f87171" : e.k === "ok" ? "#34d399" : e.k === "sys" ? "#60a5fa" : "#3a3a44",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  <span style={{ color: "#2a2a35" }}>{e.t} </span>{e.x}
                </div>
              ))}
            </Box>
          </div>
        )}

        {/* ═══ TOP MENU ═══ */}
        {tab === "menu" && (
          <div style={{ animation: "si .25s ease-out" }}>
            {z.topItems && z.topItems.length > 0 ? (
              <Box>
                <Hd>TOP MENU — FROM Z-REPORT</Hd>
                {z.topItems.slice(0, 10).map((it, i) => {
                  const maxQ = z.topItems[0]?.qty || 1;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "5px 0",
                      borderBottom: i < 9 ? "1px solid #12121a" : "none",
                      animation: `si .2s ease-out ${i * .03}s both`,
                    }}>
                      <span style={{
                        width: 16, fontSize: 10, fontWeight: 700, textAlign: "center", fontFamily: F,
                        color: i < 3 ? ["#fbbf24", "#94a3b8", "#d97706"][i] : "#444",
                      }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 500, color: "#ccc",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{it.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: F, color: "#c084fc" }}>
                            {it.qty}×
                          </span>
                        </div>
                        <Bar pct={it.qty / maxQ * 100} color="#c084fc" h={3} />
                        <div style={{ fontSize: 7, color: "#444", fontFamily: F, marginTop: 1 }}>
                          {fR(it.revenue || 0)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Box>
            ) : (
              <Box>
                <div style={{ textAlign: "center", padding: 20, color: "#333", fontFamily: F, fontSize: 10 }}>
                  Waiting for Z-Report data...
                </div>
              </Box>
            )}
          </div>
        )}

        {/* ═══ FINANCE ═══ */}
        {tab === "fin" && (
          <div style={{ animation: "si .25s ease-out" }}>
            <Box style={{ marginBottom: 8 }}>
              <Hd>📊 P&L HARI INI</Hd>
              <Row l="Gross Revenue" r={fR(zSum.grossRevenue || 0)} rc="#10b981" />
              <Row l="Net Revenue" r={fR(zSum.netRevenue || 0)} rc="#3b82f6" />
              <Row l="PPN 11%" r={fR(-(zSum.totalTax || 0))} rc="#f59e0b" />
              {z.promoUsage && Object.entries(z.promoUsage).map(([code, data]) => (
                <Row key={code} l={`Promo: ${code}`} r={fR(-(data.totalDiscount || 0))} rc="#ec4899" />
              ))}
              {z.cashReconciliation && (
                <>
                  <Row l="Cash Sales" r={fR(z.cashReconciliation.cashSales || 0)} rc="#10b981" />
                  <Row l="Cash Received" r={fR(z.cashReconciliation.cashReceived || 0)} rc="#3b82f6" />
                  <Row l="Change Given" r={fR(-(z.cashReconciliation.cashChange || 0))} rc="#f59e0b" />
                </>
              )}
            </Box>

            <Box>
              <Hd>💵 REKONSILIASI KAS</Hd>
              {z.cashReconciliation ? (
                <>
                  <Row l="Cash Transactions" r={`${z.cashReconciliation.transactionCount}×`} rc="#10b981" />
                  <Row l="Total Cash Sales" r={fR(z.cashReconciliation.cashSales)} rc="#10b981" />
                  <Row l="Cash Received" r={fR(z.cashReconciliation.cashReceived)} rc="#3b82f6" />
                  <Row l="Change Given" r={fR(z.cashReconciliation.cashChange)} rc="#f59e0b" />
                </>
              ) : (
                <div style={{ textAlign: "center", padding: 12, color: "#333", fontFamily: F, fontSize: 9 }}>
                  Shift belum ditutup — data tersedia saat close shift
                </div>
              )}
            </Box>
          </div>
        )}

        {/* ═══ WAREHOUSE / PPIC ═══ */}
        {tab === "wh" && (
          <div style={{ animation: "si .25s ease-out" }}>
            {warehouse?.items ? (
              <>
                {/* Critical alerts */}
                {whAlerts.length > 0 && (
                  <Box style={{ marginBottom: 8, borderLeft: "3px solid #ef4444", background: "#120a0a" }}>
                    <Hd>⚠ STOK KRITIS</Hd>
                    {whAlerts.map((w, i) => {
                      const dl = w.dailyUse > 0 ? Math.floor(w.stock / w.dailyUse) : 999;
                      return (
                        <div key={w.id || i} style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "4px 0",
                          borderBottom: i < whAlerts.length - 1 ? "1px solid #1a1114" : "none",
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: "#fca5a5" }}>{w.name}</div>
                            <div style={{ fontSize: 7, color: "#555", fontFamily: F }}>
                              {w.id} • use {w.dailyUse}/{w.unit}/day
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: F, color: "#ef4444" }}>
                              {w.stock}
                            </span>
                            <span style={{ fontSize: 8, color: "#666" }}> {w.unit}</span>
                            <div style={{ fontSize: 8, fontFamily: F, color: dl <= 2 ? "#ef4444" : "#f59e0b" }}>
                              {dl}d left
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </Box>
                )}

                {/* Full inventory */}
                <Box>
                  <Hd>📦 INVENTORY</Hd>
                  {warehouse.items.map((w, i) => {
                    const pct = w.maxStock > 0 ? w.stock / w.maxStock * 100 : 0;
                    const low = w.stock <= w.minStock;
                    const dl = w.dailyUse > 0 ? Math.floor(w.stock / w.dailyUse) : 999;
                    return (
                      <div key={w.id || i} style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "3px 0",
                        borderBottom: "1px solid #12121a",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 9, fontWeight: 500,
                            color: low ? "#fca5a5" : "#bbb",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{w.name}</div>
                          <Bar pct={pct} color={low ? "#ef4444" : pct > 60 ? "#10b981" : "#eab308"} h={3} />
                        </div>
                        <span style={{
                          fontSize: 9, fontWeight: 700, fontFamily: F,
                          color: low ? "#ef4444" : "#bbb", minWidth: 35, textAlign: "right",
                        }}>{w.stock}</span>
                        <span style={{
                          fontSize: 7, fontFamily: F, minWidth: 22, textAlign: "right",
                          color: dl <= 3 ? "#ef4444" : dl <= 7 ? "#f59e0b" : "#444",
                        }}>{dl}d</span>
                      </div>
                    );
                  })}
                </Box>
              </>
            ) : (
              <Box>
                <div style={{ textAlign: "center", padding: 20, color: "#333", fontFamily: F, fontSize: 10 }}>
                  Warehouse API belum aktif — tambahkan /api/audit/warehouse endpoint
                </div>
              </Box>
            )}
          </div>
        )}

        {/* ═══ PROMO ═══ */}
        {tab === "promo" && (
          <div style={{ animation: "si .25s ease-out" }}>
            {z.promoUsage ? (
              <Box style={{ marginBottom: 8 }}>
                <Hd>PROMO USAGE — FROM Z-REPORT</Hd>
                {Object.entries(z.promoUsage).map(([code, data], i) => (
                  <div key={code} style={{
                    padding: "5px 0",
                    borderBottom: i < Object.keys(z.promoUsage).length - 1 ? "1px solid #12121a" : "none",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: F, color: "#ec4899" }}>{code}</span>
                      <span style={{ fontSize: 9, fontFamily: F, color: "#666" }}>{data.count}× used</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, fontFamily: F }}>
                      <span style={{ color: "#ec4899" }}>Burn: {fR(data.totalDiscount || 0)}</span>
                    </div>
                  </div>
                ))}
              </Box>
            ) : null}

            <Box>
              <Hd>👤 EMPLOYEE DISCOUNT AUDIT</Hd>
              <div style={{ fontSize: 9, color: "#666", marginBottom: 6 }}>
                Audit diskon karyawan dari event pos:promo_applied (target=employee).
                Anomali terdeteksi otomatis via WebSocket.
              </div>
              {unr.filter(a => a.type === "EMP_DISC").length > 0 ? (
                unr.filter(a => a.type === "EMP_DISC").map((a, i) => (
                  <div key={a.id} style={{
                    padding: "4px 0", borderBottom: "1px solid #12121a", fontSize: 9,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#d946ef", fontWeight: 600 }}>{a.cs}</span>
                      <span style={{ fontFamily: F, color: "#ef4444", fontWeight: 600 }}>{fR(a.amt)}</span>
                    </div>
                    <div style={{ fontSize: 8, color: "#555" }}>{a.det}</div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: "center", padding: 10, color: "#333", fontFamily: F, fontSize: 9 }}>
                  Tidak ada anomali diskon karyawan terdeteksi
                </div>
              )}
            </Box>
          </div>
        )}

        {/* ═══ ANOMALY ═══ */}
        {tab === "anom" && (
          <div style={{ animation: "si .25s ease-out" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, marginBottom: 8 }}>
              <Box><div style={{ fontSize: 7, color: "#4a4a55", fontFamily: F }}>OPEN</div><Num v={unr.length} c="#ef4444" sz={18} /></Box>
              <Box><div style={{ fontSize: 7, color: "#4a4a55", fontFamily: F }}>LOSS</div><Num v={fK(aLoss)} c="#f59e0b" sz={14} /></Box>
              <Box><div style={{ fontSize: 7, color: "#4a4a55", fontFamily: F }}>CRIT</div><Num v={critN} c="#dc2626" sz={18} /></Box>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 6 }}>
              <button onClick={() => setAF(null)} style={{
                padding: "3px 7px", borderRadius: 4, fontSize: 8, fontWeight: !aF ? 700 : 400,
                background: !aF ? "#18181f" : "#0c0c10",
                border: `1px solid ${!aF ? "#444" : "#18181f"}`,
                color: !aF ? "#eee" : "#555", cursor: "pointer", fontFamily: F,
              }}>ALL</button>
              {Object.entries(RULES).map(([k, r]) => (
                <button key={k} onClick={() => setAF(aF === k ? null : k)} style={{
                  padding: "3px 6px", borderRadius: 4, fontSize: 8,
                  fontWeight: aF === k ? 700 : 400,
                  background: aF === k ? r.cl + "15" : "#0c0c10",
                  border: `1px solid ${aF === k ? r.cl + "55" : "#18181f"}`,
                  color: aF === k ? r.cl : "#555", cursor: "pointer", fontFamily: F,
                }}>{r.i}{aByT[k] || 0}</button>
              ))}
            </div>

            {/* List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {fltA.length === 0 && (
                <div style={{ textAlign: "center", padding: 16, color: "#2a2a35", fontFamily: F, fontSize: 9 }}>
                  Clear — tidak ada anomali
                </div>
              )}
              {fltA.slice(0, 20).map((a, idx) => {
                const r = RULES[a.type];
                if (!r) return null;
                const isO = exp === a.id;
                return (
                  <div key={a.id} onClick={() => setExp(isO ? null : a.id)} style={{
                    background: a.nw ? "#ef444406" : "#0c0c10",
                    border: `1px solid ${isO ? r.cl + "44" : "#18181f"}`,
                    borderRadius: 8, padding: "6px 8px", cursor: "pointer",
                    borderLeft: `3px solid ${r.cl}`,
                    animation: a.nw && idx === 0 ? "si .3s ease-out" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                      <span style={{ fontSize: 11 }}>{r.i}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: r.cl, flex: 1 }}>{r.l}</span>
                      <SvB s={a.sev} />
                    </div>
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      fontSize: 7, color: "#3e3e4a", fontFamily: F,
                    }}>
                      <span>{a.id} • {a.cs} • {a.ol}</span>
                      <span>{ago(a.ts)}</span>
                    </div>
                    {a.amt > 0 && (
                      <div style={{ fontSize: 12, fontWeight: 700, fontFamily: F, color: "#f59e0b", marginTop: 1 }}>
                        {fR(a.amt)}
                      </div>
                    )}
                    {isO && (
                      <div style={{
                        marginTop: 4, background: "#08080b", borderRadius: 5,
                        border: "1px solid #12121a", padding: 6, animation: "si .15s ease-out",
                      }}>
                        <p style={{ fontSize: 9, color: "#999", lineHeight: 1.5, marginBottom: 4 }}>{a.det}</p>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button onClick={e => { e.stopPropagation(); resolve(a.id); }} style={{
                            padding: "3px 7px", borderRadius: 4, border: "1px solid #16a34a",
                            background: "#16a34a12", color: "#10b981", fontSize: 8,
                            cursor: "pointer", fontWeight: 600, fontFamily: F,
                          }}>✓ Resolve</button>
                          <button onClick={e => e.stopPropagation()} style={{
                            padding: "3px 7px", borderRadius: 4, border: "1px solid #dc2626",
                            background: "#dc262612", color: "#fca5a5", fontSize: 8,
                            cursor: "pointer", fontFamily: F,
                          }}>🚨 Eskalasi</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ OUTLETS ═══ */}
        {tab === "outlet" && (
          <div style={{ animation: "si .25s ease-out" }}>
            <Hd>PERFORMA OUTLET — AREA MANAGER</Hd>
            {outlets.length > 0 ? outlets.map((o, i) => (
              <Box key={o.id} style={{
                marginBottom: 6,
                borderLeft: `3px solid ${i === 0 ? "#fbbf24" : i < 3 ? "#3b82f6" : "#2a2a35"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#eee" }}>{o.name}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, fontFamily: F,
                    color: i === 0 ? "#fbbf24" : "#555",
                  }}>#{i + 1}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                  <div>
                    <div style={{ fontSize: 6, color: "#444", fontFamily: F }}>REV</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981", fontFamily: F }}>
                      {fK(o.revenue || 0)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 6, color: "#444", fontFamily: F }}>TRX</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", fontFamily: F }}>
                      {o.orderCount || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 6, color: "#444", fontFamily: F }}>ALERT</div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, fontFamily: F,
                      color: (o.anomalies || 0) > 0 ? "#ef4444" : "#10b981",
                    }}>{o.anomalies || 0}</div>
                  </div>
                </div>
              </Box>
            )) : (
              <Box>
                <div style={{ textAlign: "center", padding: 20, color: "#333", fontFamily: F, fontSize: 10 }}>
                  Multi-outlet API belum aktif — data tersedia saat /api/audit/outlets ready
                </div>
              </Box>
            )}
          </div>
        )}

      </div>

      <div style={{
        padding: "6px 12px 12px", borderTop: "1px solid #111118",
        textAlign: "center", fontSize: 7, color: "#1a1a22",
        fontFamily: F, letterSpacing: .5,
      }}>
        BITES & CO. COMMAND CENTER v3 • 12 RULES • REALTIME
      </div>
    </div>
  );
}
