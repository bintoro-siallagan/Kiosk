import { useState, useEffect } from "react";

import POSOrderHistory from "./POSOrderHistory.jsx";
import POSMergeTabsModal from "./POSMergeTabsModal.jsx";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";

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
  cdsWindowRef = window.open(finalUrl, 'BintoroCDS', features);

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
  root: { minHeight:"100vh", background:"#0a0a0a", color:"#fff", fontFamily:"system-ui,-apple-system,sans-serif" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"14px 24px", borderBottom:"1px solid #1f1f1f", background:"#0a0a0a",
    position:"sticky", top:0, zIndex:10 },
  brand: { fontSize:20, fontWeight:600, letterSpacing:"0.05em", color:"#f97316" },
  user: { display:"flex", alignItems:"center", gap:10, fontSize:14 },
  userIcon: { fontSize:20 },
  userName: { fontWeight:500 },
  userRole: { color:"#fff", padding:"2px 10px", borderRadius:4, fontSize:10, fontWeight:500, letterSpacing:"0.05em" },
  logout: { background:"#1f1f1f", border:"1px solid #2a2a2a", color:"#9ca3af",
    padding:"6px 14px", borderRadius:6, fontSize:12, cursor:"pointer",
    marginLeft:8, fontFamily:"inherit" },
  main: { maxWidth:900, margin:"0 auto", padding:"32px 24px" },
  welcome: { textAlign:"center", marginBottom:28 },
  welcomeTitle: { fontSize:26, margin:"0 0 4px", fontWeight:500, color:"#fff" },
  welcomeSub: { color:"#6b7280", margin:0, fontSize:13 },
  bigBtn: { width:"100%", display:"flex", flexDirection:"column", alignItems:"center", gap:6,
    background:"#1f1f1f", color:"#f97316", border:"1px solid #2a2a2a", borderRadius:14, padding:"30px 20px",
    fontFamily:"inherit", fontSize:22, fontWeight:600, letterSpacing:1, cursor:"pointer", marginBottom:14 },
  btnHint: { fontSize:11, fontWeight:400, color:"#6b7280", letterSpacing:0.3 },
  section: { marginTop:30 },
  sectionTitle: { fontSize:15, color:"#fff", margin:"0 0 12px", fontWeight:500, letterSpacing:0.3,
    display:"flex", alignItems:"center", gap:8 },
  badge: { background:"#f97316", color:"#0a0a0a", padding:"2px 10px", borderRadius:12,
    fontSize:11, fontWeight:600 },
  loadingState: { textAlign:"center", color:"#6b7280", padding:20 },
  empty: { background:"#1f1f1f", border:"1px dashed #2a2a2a", borderRadius:12,
    padding:"32px 20px", textAlign:"center", color:"#6b7280", fontSize:13 },
  tabList: { display:"flex", flexDirection:"column", gap:10 },
  tabCard: { background:"#1f1f1f", border:"1px solid #2a2a2a", borderLeft:"4px solid #f97316",
    borderRadius:12, padding:"14px 18px", color:"#fff", fontFamily:"inherit",
    cursor:"pointer", transition:"all 0.15s", textAlign:"left",
    display:"flex", flexDirection:"column", gap:8 },
  tabHeaderRow: { display:"flex", justifyContent:"space-between", alignItems:"baseline" },
  tabId: { fontSize:17, fontWeight:600, color:"#f97316", letterSpacing:1 },
  tabTotal: { fontSize:18, fontWeight:600, color:"#fff", letterSpacing:0.5 },
  tabMidRow: { fontSize:13, color:"#9ca3af", display:"flex", gap:4, flexWrap:"wrap" },
  tabType: { fontWeight:500 },
  tabTable: { color:"#9ca3af" },
  tabCustomer: { color:"#9ca3af" },
  tabFooterRow: { fontSize:11, color:"#6b7280", display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" },
  tabTime: { color:"#6b7280" },
  tabItems: { color:"#6b7280" },
  tabKasir: { color:"#6b7280" },
  settleCta: { marginLeft:"auto", color:"#f97316", fontWeight:500, fontSize:12, letterSpacing:0.5 },
  statsGrid: { display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 },
  tabActions: { display:"flex", gap:8, marginTop:12, paddingTop:12, borderTop:"1px solid #2a2a2a" },
  tabBtnAdd: { flex:1, padding:"10px 14px", borderRadius:8, background:"#f9731618", border:"1px solid #f9731644", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:500, fontFamily:"inherit" },
  tabBtnPay: { flex:1, padding:"10px 14px", borderRadius:8, background:"#22c55e18", border:"1px solid #22c55e55", color:"#4ade80", cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit" },
  tabBtnMerge: { flex:1, padding:"10px 8px", borderRadius:8, background:"#a78bfa18", border:"1px solid #a78bfa44", color:"#a78bfa", cursor:"pointer", fontSize:12, fontWeight:500, fontFamily:"inherit" },
  statCard: { background:"#1f1f1f", border:"1px solid #2a2a2a", borderRadius:10, padding:"18px 14px", textAlign:"center" },
  statValue: { fontSize:28, fontWeight:500, color:"#f97316", letterSpacing:1, lineHeight:1 },
  statLabel: { fontSize:10, color:"#6b7280", letterSpacing:1, fontWeight:500, marginTop:6, textTransform:"uppercase" }
};
