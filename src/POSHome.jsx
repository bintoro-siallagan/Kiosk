import { useState, useEffect } from "react";

import POSOrderHistory from "./POSOrderHistory.jsx";
import POSMergeTabsModal from "./POSMergeTabsModal.jsx";
import UpsellTicker from "./components/UpsellTicker.jsx";
import TouchNumpad from "./components/TouchNumpad.jsx";
import API_HOST from "./apiBase.js";
const API_BASE = API_HOST;

// Track CDS window reference across re-renders
let cdsWindowRef = null;

async function openCDSOnSecondScreen() {
  // If already open, just focus it
  if (cdsWindowRef && !cdsWindowRef.closed) {
    cdsWindowRef.focus();
    return cdsWindowRef;
  }

  const base = window.location.origin + window.location.pathname.replace(/\/?$/, "/");
  const cdsUrl = `${base}?cds=1`;

  // Detect LAN IP from current page if accessed via LAN (so CDS phone-scan works)
  let finalUrl = cdsUrl;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Try to get LAN IP from backend config
    try {
      const r = await fetch(`${API_BASE}/api/config/public`);
      const cfg = await r.json();
      if (cfg.lanHost) {
        finalUrl = `http://${cfg.lanHost}:${window.location.port || '5184'}${window.location.pathname}?cds=1`;
      }
    } catch (e) {}
  }

  let position = "";

  // Try Window Management API (Chrome 100+, requires user gesture + permission)
  try {
    if ('getScreenDetails' in window) {
      const screenDetails = await window.getScreenDetails();
      const secondary = screenDetails.screens.find(s => !s.isPrimary);
      if (secondary) {
        position = `left=${secondary.availLeft},top=${secondary.availTop},width=${secondary.availWidth},height=${secondary.availHeight}`;
        console.log('[CDS] Opening on secondary screen:', secondary);
      } else {
        console.log('[CDS] Only one screen detected');
      }
    }
  } catch (e) {
    console.log('[CDS] Window Management API:', e.message);
  }

  // Fallback: assume second screen is to the right at window.screen.width offset
  if (!position) {
    position = `left=${window.screen.width},top=0,width=1920,height=1080`;
  }

  const features = `${position},toolbar=no,menubar=no,location=no,status=no,scrollbars=yes`;
  cdsWindowRef = window.open(finalUrl, 'KaryaOSCDS', features);

  if (!cdsWindowRef) {
    alert("Popup diblok! Allow popup untuk KaryaOS di browser settings, lalu coba lagi.");
    return null;
  }

  cdsWindowRef.focus();
  return cdsWindowRef;
}

export default function POSHome({ cashier, onLogout, onNewOrder, onSettleTab, onResumeTab, onQuickOrder, onCloseShift }) {
  const [tabs, setTabs] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [mergeTab, setMergeTab] = useState(null);
  const [todayOrders, setTodayOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // POSHome mount → reset CDS to welcome screen
  useEffect(() => {
    fetch(`${API_BASE}/api/pos/broadcast`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ event: "pos:idle", data: {} })
    }).catch(() => {});
  }, []);

  const role = (cashier.role || "kasir").toLowerCase();

  const refresh = () => {
    fetch(`${API_BASE}/api/orders`)
      .then(r => r.json())
      .then(data => {
        const all = Array.isArray(data) ? data : (data?.orders || []);
        // Active tabs: status === "tab_open"
        const activeTabs = all.filter(o => o.status === "tab_open");
        setTabs(activeTabs);
        // Today's orders: created today (any status, by any kasir)
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const today = all.filter(o => o.time >= todayStart.getTime() && o.status !== "cancelled");
        setTodayOrders(today);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, []);

  const todayCount = todayOrders.length;
  const todayRevenue = todayOrders.filter(o => o.status !== "tab_open").reduce((s, o) => s + (o.total || 0), 0);
  const fmt = (n) => (n || 0).toLocaleString("id-ID");
  const fmtTime = (ms) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };

  async function handleCloseDay() {
    if (!window.confirm("TUTUP HARI?\n\nShift aktif ikut ditutup, dan TIDAK ADA yang bisa order sampai Manager 'Buka Hari'. Ringkasan transaksi hari ini akan dicetak" + " (& dikirim email bila email aktif).")) return;
    try {
      const r = await fetch(`${API_BASE}/api/day/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: cashier.name || "Manager" }),
      });
      const data = await r.json();
      if (data.reportHtml) {
        const w = window.open("", "_blank", "width=640,height=820");
        if (w) {
          w.document.write(`<html><head><title>Tutup Hari — KaryaOS</title></head><body style="margin:24px" onload="setTimeout(function(){window.print()},300)">${data.reportHtml}</body></html>`);
          w.document.close();
        }
      }
    } catch (e) {
      alert("Gagal tutup hari: " + e.message);
      return;
    }
    onLogout();
  }

  return (
    <div style={S.root}>
      {mergeTab && (
        <POSMergeTabsModal
          sourceTab={mergeTab}
          kasir={cashier?.name || "Manager"}
          onClose={() => setMergeTab(null)}
          onSuccess={(result) => {
            setMergeTab(null);
            // Reload tabs by re-mounting (rely on existing reload pattern)
            if (typeof window !== 'undefined') window.location.reload();
          }}
        />
      )}
      {showHistory && (
        <POSOrderHistory
          onClose={() => setShowHistory(false)}
          kasir={typeof kasir !== 'undefined' ? kasir : 'Manager'}
        />
      )}

      <button
        onClick={openCDSOnSecondScreen}
        title="Buka Customer Display di layar kedua"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#f97316";
          e.currentTarget.style.color = "#000";
          e.currentTarget.style.transform = "translateX(-50%) translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(249,115,22,0.08)";
          e.currentTarget.style.color = "#f97316";
          e.currentTarget.style.transform = "translateX(-50%) translateY(0)";
        }}
        style={{
          position:"fixed",
          bottom:28, left:"50%", transform:"translateX(-50%)",
          zIndex:1000,
          padding:"14px 28px",
          background:"rgba(249,115,22,0.08)",
          color:"#f97316",
          border:"2px solid #f97316",
          borderRadius:100,
          fontWeight:800, fontSize:14, letterSpacing:0.5,
          fontFamily:"system-ui,-apple-system,sans-serif",
          cursor:"pointer",
          boxShadow:"0 8px 24px rgba(0,0,0,0.4), 0 0 0 4px rgba(249,115,22,0.1)",
          display:"flex", alignItems:"center", gap:10,
          backdropFilter:"blur(8px)",
          transition:"all 0.2s ease",
          whiteSpace:"nowrap"
        }}
      >
        <span style={{fontSize:18}}>🖥️</span> Buka Layar Pelanggan
      </button>

      {/* Switch ke POS Cinema — single shared cashier session, bisa jual tiket */}
      <button
        onClick={() => {
          const outlet = new URLSearchParams(window.location.search).get("outlet") || "";
          window.location.href = `?pos-cinema${outlet ? `&outlet=${outlet}` : ""}`;
        }}
        title="Switch ke POS Cinema (jual tiket film) — session kasir tetap kebawa"
        style={{
          position: "fixed",
          bottom: 28, right: 28,
          zIndex: 1000,
          padding: "14px 22px",
          background: "rgba(168,85,247,0.1)",
          color: "#c084fc",
          border: "2px solid #a855f7",
          borderRadius: 100,
          fontWeight: 800, fontSize: 14, letterSpacing: 0.5,
          fontFamily: "system-ui,-apple-system,sans-serif",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4), 0 0 0 4px rgba(168,85,247,0.1)",
          display: "flex", alignItems: "center", gap: 10,
          backdropFilter: "blur(8px)",
          transition: "all 0.2s ease",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#a855f7"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.transform = "translateY(-2px)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(168,85,247,0.1)"; e.currentTarget.style.color = "#c084fc"; e.currentTarget.style.transform = "translateY(0)"; }}
      >
        <span style={{ fontSize: 18 }}>🎬</span> Switch ke POS Cinema
      </button>

      <TouchNumpad />
      <UpsellTicker />

      <header style={S.header}>
        <div style={S.brand}><img src="/logo.png" alt="" style={{ height: 26, verticalAlign: "middle", marginRight: 7 }} />KaryaOS POS</div>
        <div style={S.user}>
          <span style={S.userIcon}>👤</span>
          <span style={S.userName}>{cashier.name}</span>
          <span style={{...S.userRole, background: roleColors[role] || roleColors.kasir}}>
            {(cashier.role || "kasir").toUpperCase()}
          </span>
          {onCloseShift && (
            <button onClick={onCloseShift}
              style={{...S.logout, background: '#f9731622', border: '1px solid #f9731655', color: '#f97316'}}>
              🔒 Tutup Shift
            </button>
          )}
          {role === "manager" && (
            <button onClick={handleCloseDay}
              style={{...S.logout, background: '#7c3aed22', border: '1px solid #7c3aed66', color: '#a78bfa'}}>
              🌙 Tutup Hari
            </button>
          )}
          <button onClick={onLogout} style={S.logout}>Logout</button>
        </div>
      </header>

      <main style={S.main}>
        <div style={S.welcome}>
          <h2 style={S.welcomeTitle}>Halo, {cashier.name}! 👋</h2>
          <p style={S.welcomeSub}>Siap untuk shift hari ini.</p>
        </div>

        <button style={S.bigBtn} onClick={onNewOrder}>
          <div style={{fontSize: 44}}>🛒</div>
          <div>ORDER BARU</div>
          <div style={S.btnHint}>Mulai pesanan untuk customer</div>
        </button>

        {onQuickOrder && (
          <button style={S.bigBtn} onClick={onQuickOrder}>
            <div style={{fontSize: 44}}>⚡</div>
            <div>QUICK ORDER</div>
            <div style={S.btnHint}>Pesanan cepat — menu master + bayar</div>
          </button>
        )}

        {/* Cinema ticket sale dari POS F&B — concession counter bisa jual tiket */}
        <button style={{ ...S.bigBtn, borderColor: "rgba(168,85,247,0.4)", background: "linear-gradient(135deg, rgba(168,85,247,0.05), rgba(168,85,247,0.02))" }} onClick={() => {
          const outlet = new URLSearchParams(window.location.search).get("outlet") || "";
          window.location.href = `?pos-cinema${outlet ? `&outlet=${outlet}` : ""}`;
        }}>
          <div style={{ fontSize: 44 }}>🎬</div>
          <div style={{ color: "#c084fc" }}>JUAL TIKET CINEMA</div>
          <div style={S.btnHint}>Pilih jadwal → kursi → bayar (kasir login tetap)</div>
        </button>

        <div

          onClick={() => setShowHistory(true)}

          style={{

            margin: "56px 0 40px",

            padding: "18px 22px",

            borderRadius: 14,

            background: "linear-gradient(135deg, rgba(249,115,22,0.10), rgba(249,115,22,0.04))",

            border: "1px solid rgba(249,115,22,0.30)",

            cursor: "pointer",

            display: "flex",

            alignItems: "center",

            justifyContent: "space-between",

          }}

        >

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>

            <div style={{ fontSize: 30 }}>📋</div>

            <div>

              <div style={{ fontSize: 17, fontWeight: 700, color: "#f97316" }}>Riwayat Pesanan</div>

              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>Cancel, refund, atau cari order sebelumnya</div>

            </div>

          </div>

          <div style={{ fontSize: 22, color: "#f97316" }}>›</div>

        </div>


        <section style={S.section}>
          <h3 style={S.sectionTitle}>
            📋 Tab Aktif {tabs.length > 0 && <span style={S.badge}>{tabs.length}</span>}
          </h3>

          {loading && <div style={S.loadingState}>Loading...</div>}

          {!loading && tabs.length === 0 && (
            <div style={S.empty}>
              Belum ada tab aktif.<br/>
              <span style={{fontSize:11, color:"#555"}}>Tab dari Open Tab akan muncul di sini.</span>
            </div>
          )}

          {tabs.length > 0 && (
            <div style={S.tabList}>
              {tabs.map(tab => (
                <div key={tab.id} style={S.tabCard}>
                  <div style={S.tabHeaderRow}>
                    <div style={S.tabId}>#{tab.id}</div>
                    <div style={S.tabTotal}>Rp {fmt(tab.total)}</div>
                  </div>
                  <div style={S.tabMidRow}>
                    <span style={S.tabType}>
                      {tab.type === "dine" ? "🍽️ Dine-in" : "🛍️ Take-away"}
                    </span>
                    {tab.table && tab.table !== "-" && (
                      <span style={S.tabTable}>· Meja {tab.table}</span>
                    )}
                    {tab.customer_name && (
                      <span style={S.tabCustomer}>· {tab.customer_name}</span>
                    )}
                  </div>
                  <div style={S.tabFooterRow}>
                    <span style={S.tabTime}>{fmtTime(tab.time)}</span>
                    <span style={S.tabItems}>· {(tab.items || []).length} item</span>
                    <span style={S.tabKasir}>· 👤 {tab.kasir || "?"}</span>
                  </div>
                  <div style={S.tabActions}>
                    <button style={S.tabBtnAdd} onClick={() => onResumeTab && onResumeTab(tab)}>
                      ➕ Tambah
                    </button>
                    <button style={S.tabBtnMerge} onClick={() => setMergeTab(tab)}>
                      🔗 Merge
                    </button>
                    <button style={S.tabBtnPay} onClick={() => onSettleTab(tab)}>
                      💰 Bayar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={S.section}>
          <h3 style={S.sectionTitle}>📊 Hari Ini</h3>
          <div style={S.statsGrid}>
            <div style={S.statCard}>
              <div style={S.statValue}>{todayCount || "—"}</div>
              <div style={S.statLabel}>ORDERS</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statValue}>{todayRevenue > 0 ? `Rp ${fmt(todayRevenue)}` : "—"}</div>
              <div style={S.statLabel}>REVENUE</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const roleColors = {
  admin: "#EF4444", manager: "#A855F7",
  kasir: "#3B82F6", staff: "#10B981"
};

// v3 design language — matches POSKasirLogin (dark #0a0a0a + orange #f97316, system-ui)
const S = {
  // MacBook-premium dark theme — match POSMenuPicker, POSPayment, POS Cinema
  root: {
    minHeight: "100vh",
    background: "linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)",
    color: "#fff",
    fontFamily: "'Inter','SF Pro Display',system-ui,-apple-system,sans-serif",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 26px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(13,17,23,0.78)",
    backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    position: "sticky", top: 0, zIndex: 10,
  },
  brand: {
    fontSize: 20, fontWeight: 800, letterSpacing: -0.4,
    background: "linear-gradient(135deg,#F59E0B,#fbbf24)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
  },
  user: { display: "flex", alignItems: "center", gap: 12, fontSize: 14 },
  userIcon: { fontSize: 22, filter: "drop-shadow(0 0 8px rgba(245,158,11,0.3))" },
  userName: { fontWeight: 700, color: "#fff", letterSpacing: -0.2 },
  userRole: {
    color: "#fff", padding: "3px 10px", borderRadius: 6,
    fontSize: 10, fontWeight: 800, letterSpacing: 1.2,
    fontFamily: "'Geist Mono',monospace", textTransform: "uppercase",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  },
  logout: {
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.65)", padding: "8px 14px", borderRadius: 8,
    fontSize: 12, fontWeight: 600, cursor: "pointer", marginLeft: 8, fontFamily: "inherit",
    transition: "all 0.15s",
  },
  main: { maxWidth: 960, margin: "0 auto", padding: "32px 26px" },
  welcome: { textAlign: "center", marginBottom: 32 },
  welcomeTitle: {
    fontSize: 32, margin: "0 0 6px", fontWeight: 800, letterSpacing: -0.8, color: "#fff",
  },
  welcomeSub: {
    color: "rgba(255,255,255,0.45)", margin: 0, fontSize: 13,
    letterSpacing: 0.3,
  },
  // Big CTA — gradient amber with multi-layer shadow + glow
  bigBtn: {
    width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    background: "linear-gradient(135deg, #F59E0B 0%, #fbbf24 100%)",
    color: "#1a1205",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16, padding: "32px 22px",
    fontFamily: "inherit", fontSize: 22, fontWeight: 800, letterSpacing: -0.4,
    cursor: "pointer", marginBottom: 14,
    boxShadow: "0 1px 2px rgba(0,0,0,0.4),0 12px 32px rgba(245,158,11,0.35),inset 0 1px 0 rgba(255,255,255,0.25)",
    transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
  },
  btnHint: {
    fontSize: 12, fontWeight: 600, color: "rgba(26,18,5,0.7)",
    letterSpacing: 0.3,
  },
  section: { marginTop: 32 },
  sectionTitle: {
    fontSize: 13, color: "rgba(255,255,255,0.55)", margin: "0 0 14px",
    fontWeight: 700, letterSpacing: 1.4,
    fontFamily: "'Geist Mono',monospace", textTransform: "uppercase",
    display: "flex", alignItems: "center", gap: 10,
  },
  badge: {
    background: "linear-gradient(135deg,#F59E0B,#fbbf24)",
    color: "#1a1205", padding: "2px 10px", borderRadius: 12,
    fontSize: 11, fontWeight: 800, fontFamily: "'Geist Mono',monospace",
    boxShadow: "0 2px 8px rgba(245,158,11,0.35)",
  },
  loadingState: { textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 24, fontSize: 13 },
  empty: {
    background: "rgba(255,255,255,0.02)",
    border: "1px dashed rgba(255,255,255,0.1)",
    borderRadius: 14, padding: "36px 22px",
    textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13,
  },
  tabList: { display: "flex", flexDirection: "column", gap: 10 },
  // Tab card — glass + amber left accent + multi-layer shadow
  tabCard: {
    background: "linear-gradient(180deg,#15171c 0%,#0d0f14 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderLeft: "4px solid #F59E0B",
    borderRadius: 14, padding: "16px 20px",
    color: "#fff", fontFamily: "inherit",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
    textAlign: "left",
    display: "flex", flexDirection: "column", gap: 10,
    boxShadow: "0 1px 2px rgba(0,0,0,0.3),0 6px 20px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  tabHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  tabId: {
    fontSize: 17, fontWeight: 800, color: "#fbbf24",
    fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5,
  },
  tabTotal: {
    fontSize: 19, fontWeight: 800, color: "#fff",
    fontFamily: "'Geist Mono',monospace", letterSpacing: -0.3,
  },
  tabMidRow: { fontSize: 13, color: "rgba(255,255,255,0.65)", display: "flex", gap: 6, flexWrap: "wrap" },
  tabType: { fontWeight: 600 },
  tabTable: { color: "rgba(255,255,255,0.55)" },
  tabCustomer: { color: "rgba(255,255,255,0.55)" },
  tabFooterRow: {
    fontSize: 11, color: "rgba(255,255,255,0.4)",
    display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
    fontFamily: "'Geist Mono',monospace",
  },
  tabTime: { color: "rgba(255,255,255,0.4)" },
  tabItems: { color: "rgba(255,255,255,0.4)" },
  tabKasir: { color: "rgba(255,255,255,0.4)" },
  settleCta: {
    marginLeft: "auto", color: "#fbbf24", fontWeight: 700, fontSize: 11,
    letterSpacing: 1, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase",
  },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 },
  tabActions: {
    display: "flex", gap: 8, marginTop: 12, paddingTop: 12,
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  tabBtnAdd: {
    flex: 1, padding: "10px 14px", borderRadius: 9,
    background: "rgba(245,158,11,0.1)",
    border: "1px solid rgba(245,158,11,0.3)",
    color: "#fbbf24", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
    transition: "all 0.15s",
  },
  tabBtnPay: {
    flex: 1, padding: "10px 14px", borderRadius: 9,
    background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(34,197,94,0.1))",
    border: "1px solid rgba(16,185,129,0.4)",
    color: "#34d399", cursor: "pointer", fontSize: 12.5, fontWeight: 800, fontFamily: "inherit",
    boxShadow: "0 4px 12px rgba(16,185,129,0.15)",
    transition: "all 0.15s",
  },
  tabBtnMerge: {
    flex: 1, padding: "10px 8px", borderRadius: 9,
    background: "rgba(168,85,247,0.1)",
    border: "1px solid rgba(168,85,247,0.3)",
    color: "#c084fc", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
    transition: "all 0.15s",
  },
  // Stat card — glass with monospace number
  statCard: {
    background: "linear-gradient(180deg,#15171c 0%,#0d0f14 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14, padding: "20px 16px", textAlign: "center",
    boxShadow: "0 1px 2px rgba(0,0,0,0.3),0 6px 20px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  statValue: {
    fontSize: 30, fontWeight: 800, color: "#fbbf24",
    letterSpacing: -0.5, lineHeight: 1,
    fontFamily: "'Geist Mono',monospace",
    textShadow: "0 0 24px rgba(251,191,36,0.25)",
  },
  statLabel: {
    fontSize: 10, color: "rgba(255,255,255,0.45)",
    letterSpacing: 1.4, fontWeight: 700, marginTop: 8,
    fontFamily: "'Geist Mono',monospace", textTransform: "uppercase",
  },
};
