import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";

export default function POSHome({ cashier, onLogout, onNewOrder, onSettleTab }) {
  const [tabs, setTabs] = useState([]);
  const [todayOrders, setTodayOrders] = useState([]);
  const [loading, setLoading] = useState(true);
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
      <header style={S.header}>
        <div style={S.brand}>☕ BINTORO POS</div>
        <div style={S.user}>
          <span style={S.userIcon}>👤</span>
          <span style={S.userName}>{cashier.name}</span>
          <span style={{...S.userRole, background: roleColors[role] || roleColors.kasir}}>
            {(cashier.role || "kasir").toUpperCase()}
          </span>
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
                <button key={tab.id} style={S.tabCard} onClick={() => onSettleTab(tab)}>
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
                    <span style={S.settleCta}>Settle →</span>
                  </div>
                </button>
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

const S = {
  root: { minHeight:"100vh", background:"#111", color:"#fff", fontFamily:"'DM Sans',sans-serif" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"14px 24px", borderBottom:"1px solid #222", background:"#0a0a0a",
    position:"sticky", top:0, zIndex:10 },
  brand: { fontFamily:"'Bebas Neue',cursive", fontSize:28, letterSpacing:3, color:"#F59E0B" },
  user: { display:"flex", alignItems:"center", gap:10, fontSize:14 },
  userIcon: { fontSize:20 },
  userName: { fontWeight:700 },
  userRole: { color:"#fff", padding:"2px 10px", borderRadius:100, fontSize:10, fontWeight:700, letterSpacing:1 },
  logout: { background:"transparent", border:"1px solid #333", color:"#aaa",
    padding:"6px 14px", borderRadius:8, fontSize:12, cursor:"pointer",
    marginLeft:8, fontFamily:"inherit" },
  main: { maxWidth:900, margin:"0 auto", padding:"40px 24px" },
  welcome: { textAlign:"center", marginBottom:32 },
  welcomeTitle: { fontSize:28, margin:"0 0 4px", fontWeight:700 },
  welcomeSub: { color:"#888", margin:0 },
  bigBtn: { width:"100%", display:"flex", flexDirection:"column", alignItems:"center", gap:6,
    background:"#F59E0B", color:"#111", border:"none", borderRadius:20, padding:"36px 20px",
    fontFamily:"inherit", fontSize:26, fontWeight:800, letterSpacing:2, cursor:"pointer",
    boxShadow:"0 8px 24px rgba(245,158,11,0.3)" },
  btnHint: { fontSize:11, fontWeight:600, color:"#7a4a00", letterSpacing:1 },
  section: { marginTop:40 },
  sectionTitle: { fontSize:16, color:"#fff", margin:"0 0 12px", fontWeight:700, letterSpacing:1,
    display:"flex", alignItems:"center", gap:8 },
  badge: { background:"#F59E0B", color:"#111", padding:"2px 10px", borderRadius:100,
    fontSize:11, fontWeight:800 },
  loadingState: { textAlign:"center", color:"#666", padding:20 },
  empty: { background:"#1a1a1a", border:"1px dashed #2a2a2a", borderRadius:12,
    padding:"32px 20px", textAlign:"center", color:"#666", fontSize:13 },
  tabList: { display:"flex", flexDirection:"column", gap:10 },
  tabCard: { background:"#1a1a1a", border:"1px solid #2a2a2a", borderLeft:"4px solid #F59E0B",
    borderRadius:12, padding:"14px 18px", color:"#fff", fontFamily:"inherit",
    cursor:"pointer", transition:"all 0.15s", textAlign:"left",
    display:"flex", flexDirection:"column", gap:8 },
  tabHeaderRow: { display:"flex", justifyContent:"space-between", alignItems:"baseline" },
  tabId: { fontSize:18, fontWeight:800, color:"#F59E0B", fontFamily:"'Bebas Neue',cursive", letterSpacing:2 },
  tabTotal: { fontFamily:"'Bebas Neue',cursive", fontSize:20, color:"#fff", letterSpacing:1 },
  tabMidRow: { fontSize:13, color:"#ccc", display:"flex", gap:4, flexWrap:"wrap" },
  tabType: { fontWeight:600 },
  tabTable: { color:"#aaa" },
  tabCustomer: { color:"#aaa" },
  tabFooterRow: { fontSize:11, color:"#888", display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" },
  tabTime: { color:"#666" },
  tabItems: { color:"#666" },
  tabKasir: { color:"#666" },
  settleCta: { marginLeft:"auto", color:"#F59E0B", fontWeight:700, fontSize:12, letterSpacing:1 },
  statsGrid: { display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12 },
  statCard: { background:"#1a1a1a", border:"1px solid #222", borderRadius:12, padding:24, textAlign:"center" },
  statValue: { fontSize:32, fontWeight:800, fontFamily:"'Bebas Neue',cursive",
    color:"#F59E0B", letterSpacing:2, lineHeight:1 },
  statLabel: { fontSize:10, color:"#888", letterSpacing:1.5, fontWeight:700, marginTop:6 }
};
