import { useState, useEffect, lazy, Suspense } from "react";
import { unlockAudio, loadAudioConfig } from "./audio.js";

// Module-level — emergency logout helper available from any scene
// Call from DevTools console: posLogout()  (default POS Cinema), or
// posLogout('pos'|'pos-cinema'|'admin') to choose redirect target.
if (typeof window !== "undefined") {
  window.posLogout = (target = "pos-cinema") => {
    ["posCashier", "posCinemaCashier", "cashier", "currentUser", "user", "adminToken", "adminRole", "adminName"].forEach(k => {
      try { sessionStorage.removeItem(k); } catch {}
      try { localStorage.removeItem(k); } catch {}
    });
    const map = { pos: "?pos=1&fresh=1", "pos-cinema": "?pos-cinema&fresh=1", admin: "?admin=1" };
    window.location.replace(window.location.pathname + (map[target] || map["pos-cinema"]));
  };
  console.log("%c[karyaOS] posLogout() helper ready — call from console to force fresh login", "color:#fbbf24");
}

// Static (always in initial bundle): customer-facing default + tiny gates
// — Kiosk is the default scene so it must boot instantly
// — Login screens must be instant (auth gate)
// — Small shared chrome (banners, gate) bundles cheaply with the shell
import PromoBroadcastBanner from "./PromoBroadcastBanner.jsx";
import OfflineBanner from "./OfflineBanner.jsx";
import AdminLogin from "./AdminLogin.jsx";
import Kiosk from "./Kiosk.jsx";
import ShiftGate from "./ShiftGate.jsx";

// Lazy-loaded scenes — each becomes its own chunk via Vite dynamic import.
const CustomerTrackingPage   = lazy(() => import("./CustomerTrackingPage.jsx"));
const POSCelebration         = lazy(() => import("./POS/POSCelebration.jsx"));
const POSCDS                 = lazy(() => import("./POSCDS.jsx"));
const CinemaKiosk            = lazy(() => import("./CinemaKiosk.jsx"));
const CinemaInStudioOrder    = lazy(() => import("./CinemaInStudioOrder.jsx"));
const CinemaBoard            = lazy(() => import("./CinemaBoard.jsx"));
const CinemaKDS              = lazy(() => import("./Cinema/CinemaKDS.jsx"));
const CinemaCDS              = lazy(() => import("./Cinema/CinemaCDS.jsx"));
const CinemaFeedback         = lazy(() => import("./Cinema/CinemaFeedback.jsx"));
const CinemaDigitalTicket    = lazy(() => import("./Cinema/CinemaDigitalTicket.jsx"));
const OutletAudit            = lazy(() => import("./RemoteOps/OutletAudit.jsx"));
const OutletVisit            = lazy(() => import("./RemoteOps/OutletVisit.jsx"));
const LaunchFieldWorker      = lazy(() => import("./RemoteOps/LaunchFieldWorker.jsx"));
const ServiceStaff           = lazy(() => import("./RemoteOps/ServiceStaff.jsx"));
const TableSelector          = lazy(() => import("./TableSelector.jsx"));
const CustomerInput          = lazy(() => import("./CustomerInput.jsx"));
const Payment                = lazy(() => import("./Payment.jsx"));
const DigitalReceipt         = lazy(() => import("./DigitalReceipt.jsx"));
const AdminHome              = lazy(() => import("./AdminHome.jsx"));
const OrderTracking          = lazy(() => import("./OrderTracking.jsx"));
const POSApp                 = lazy(() => import("./POSApp.jsx"));
const POSCinemaApp           = lazy(() => import("./POS/POSCinemaApp.jsx"));
const KDS                    = lazy(() => import("./KDS/KDS.jsx"));
const FlowApp                = lazy(() => import("./Flow/FlowApp.jsx"));
const POSSatisfaction        = lazy(() => import("./POS/POSSatisfaction.jsx"));

// Generic scene-loading fallback — quiet, dark-theme aligned.
function SceneLoading() {
  return (
    <div className="karyaos-scene-loading" style={{
      position: "fixed", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "#050810", color: "#5b6470",
      fontFamily: "'Geist Mono','Inter',monospace", fontSize: 13,
      letterSpacing: 1, textTransform: "uppercase",
    }}>
      <span className="karyaos-spinner" aria-hidden="true">⏳</span>
      <span style={{ marginLeft: 10 }}>Memuat…</span>
    </div>
  );
}

const API_HOST = import.meta.env.VITE_API_URL || "http://localhost:3001";
function getScene() {
  const q = window.location.search;
  if (new URLSearchParams(q).has("command")) return "command";
  // POS scenes — MUST be checked BEFORE generic "cinema" / "pos" suffixes
  // ("pos-cinema" contains "cinema" so cinema check would steal it otherwise)
  if (q.includes("pos-cinema") || q.includes("poscinema")) return "pos-cinema";
  if (q.includes("cinema-kds") || q.includes("cinemakds")) return "cinema-kds";
  if (q.includes("cinema-cds") || q.includes("cinemacds")) return "cinema-cds";
  if (q.includes("cinema-feedback")) return "cinema-feedback";
  if (new URLSearchParams(q).has("audit")) return "outlet-audit";
  if (new URLSearchParams(q).has("visit")) return "outlet-visit";
  if (new URLSearchParams(q).has("launch")) return "launch-field";
  if (new URLSearchParams(q).has("service")) return "service-staff";
  if (new URLSearchParams(q).get("ticket")) return "cinema-digital-ticket";
  if (q.includes("cinema-snack")) return "cinema-snack";
  if (q.includes("cinema-board")) return "cinema-board";
  if (q.includes("cinema")) return "cinema";
  if (q.includes("tools")) return "tools";
  if (q.includes("home")) return "home";
  if (new URLSearchParams(q).has("flow")) return "flow";
  if (new URLSearchParams(q).get("trackorder")) return "customer-track";
  if (q.includes("track"))     return "track";
  if (q.includes("admin"))     return "admin-login";
  if (q.includes("report"))    return "report";
  if (q.includes("esb-sync"))  return "esb-sync";
  if (q.includes("esb-notif")) return "esb-notif";
  if (q.includes("members"))   return "members";
  if (q.includes("promo"))     return "promo";
  if (q.includes("shift"))     return "shift";
  if (q.includes("cds"))      return "cds";
  if (q.includes("kds"))      return "kds";
  if (q.includes("pos"))       return "pos";
  // Check if table QR scan
  if (new URLSearchParams(q).get("table")) return "table-select";
  return "kiosk";
}

export default function App() {
  const [scene,        setScene]    = useState(getScene);
  const [trackOrderId, setTrackOrderId] = useState(() => new URLSearchParams(window.location.search).get("trackorder"));
  const [adminSession, setAdmin]    = useState(() => {
    const token = localStorage.getItem("adminToken");
    const role  = localStorage.getItem("adminRole");
    const name  = localStorage.getItem("adminName");
    return token ? { token, role, name } : null;
  });
  const [checkoutData, setCheckout] = useState(null);
  const [customerData, setCustomer] = useState(null);
  const [tableData,    setTable]    = useState(null);
  const [lastOrderId,  setLastOrder]= useState(null);

  // Unlock Web Audio context on first user interaction (autoplay policy)
  useEffect(() => {
    loadAudioConfig();
    const unlock = () => { unlockAudio(); ["click","touchstart","keydown"].forEach(e => document.removeEventListener(e, unlock)); };
    ["click","touchstart","keydown"].forEach(e => document.addEventListener(e, unlock, { once: true, passive: true }));
    return () => ["click","touchstart","keydown"].forEach(e => document.removeEventListener(e, unlock));
  }, []);

  // QR-meja scan (?table=<qrCode>) — auto-fill the table so the customer
  // doesn't have to re-pick the table they literally scanned.
  useEffect(() => {
    const tbl = new URLSearchParams(window.location.search).get("table");
    if (!tbl) return;
    fetch(`${API_HOST}/api/tables`)
      .then(r => r.json())
      .then(list => {
        const arr = Array.isArray(list) ? list : (list?.tables || []);
        const found = arr.find(t => t.id === tbl || t.qrCode === tbl || String(t.name) === tbl);
        setTable(found || { id: tbl, name: "Meja " + tbl });
      })
      .catch(() => setTable({ id: tbl, name: "Meja " + tbl }));
  }, []);

  const go = (s) => () => setScene(s);

  function handleAdminLogin(session) {
    setAdmin(session);
    const _target = getScene(); setScene(_target === "admin-login" ? "home" : (_target || "home"));
  }

  function handleAdminLogout() {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminRole");
    localStorage.removeItem("adminName");
    setAdmin(null);
    setScene("admin-login");
  }

  function handleKioskCheckout(cart, orderType, promo, tableInfo) {
    setCheckout({ cart, orderType, promo });
    setTable(tableInfo);
    setScene(orderType === "dine" && !tableInfo ? "table-select" : "customer-input");
  }

  function handleTableSelect(table) {
    setTable(table);
    setScene("customer-input");
  }

  function handleCustomerConfirm(customerInfo) {
    setCustomer(customerInfo);
    setScene("payment");
  }

  function handlePaymentSuccess(payInfo) {
    setLastOrder(payInfo?.orderId || null);
    setScene("receipt");
  }

  // Admin routes — check login
  const adminRoutes = ["home","admin","report","esb-sync","esb-notif","members","promo","shift","command","tools"];

  // Build the scene node first, then wrap the whole thing in one Suspense
  // boundary so React can stream lazy-loaded chunks without each branch
  // having to install its own fallback.
  let node;

  if (adminRoutes.includes(scene) && !adminSession) {
    // AdminLogin is static — no Suspense needed for this gate.
    node = <AdminLogin onLogin={handleAdminLogin}/>;
  } else if (scene === "admin-login") {
    node = <AdminLogin onLogin={handleAdminLogin}/>;
  } else if (adminRoutes.includes(scene)) {
    node = <AdminHome initialView={scene} adminSession={adminSession} onLogout={handleAdminLogout} onExit={() => setScene("kiosk")} />;
  } else if (scene === "flow") {
    node = <ShiftGate customerMode><FlowApp /></ShiftGate>;
  } else if (scene === "cinema") {
    node = <CinemaKiosk apiBase={API_HOST} />;
  } else if (scene === "cinema-snack") {
    node = <CinemaInStudioOrder apiBase={API_HOST} />;
  } else if (scene === "cinema-board") {
    node = <CinemaBoard apiBase={API_HOST} />;
  } else if (scene === "cinema-kds") {
    node = <CinemaKDS />;
  } else if (scene === "cinema-cds") {
    node = <CinemaCDS />;
  } else if (scene === "cinema-feedback") {
    node = <CinemaFeedback />;
  } else if (scene === "cinema-digital-ticket") {
    node = <CinemaDigitalTicket />;
  } else if (scene === "outlet-audit") {
    node = <OutletAudit />;
  } else if (scene === "outlet-visit") {
    node = <OutletVisit />;
  } else if (scene === "launch-field") {
    node = <LaunchFieldWorker />;
  } else if (scene === "service-staff") {
    node = <ServiceStaff />;
  } else if (scene === "customer-track") {
    node = <><PromoBroadcastBanner/><CustomerTrackingPage orderId={trackOrderId}/></>;
  } else if (scene === "track") {
    node = <OrderTracking onHome={go("kiosk")}/>;
  } else if (scene === "table-select" && checkoutData) {
    node = (
      <ShiftGate customerMode><TableSelector
        onPick={handleTableSelect}
        onBack={go("kiosk")}
        onCancel={go("kiosk")}
      /></ShiftGate>
    );
  } else if (scene === "customer-input" && checkoutData) {
    node = (
      <ShiftGate customerMode><CustomerInput
        cart={checkoutData.cart}
        orderType={checkoutData.orderType}
        onConfirm={handleCustomerConfirm}
        onBack={() => setScene(checkoutData.orderType === "dine" ? "table-select" : "kiosk")}
      /></ShiftGate>
    );
  } else if (scene === "payment" && checkoutData && customerData) {
    node = (
      <ShiftGate customerMode><Payment
        cart={checkoutData.cart}
        orderType={checkoutData.orderType}
        promo={checkoutData.promo}
        tableData={tableData}
        customerData={customerData}
        onSuccess={handlePaymentSuccess}
        onBack={() => setScene("customer-input")}
      /></ShiftGate>
    );
  } else if (scene === "receipt") {
    node = (
      <DigitalReceipt
        orderId={lastOrderId}
        onDone={() => setScene("kiosk-feedback")}
      />
    );
  } else if (scene === "kiosk-feedback") {
    node = (
      <POSSatisfaction
        order={{ ref: lastOrderId }}
        apiBase={API_HOST}
        source="kiosk"
        onDone={() => setScene("kiosk-celebration")}
      />
    );
  } else if (scene === "kiosk-celebration") {
    node = (
      <POSCelebration
        order={{ ref: lastOrderId }}
        apiBase={API_HOST}
        onDone={() => { setScene("kiosk"); setCheckout(null); setCustomer(null); setTable(null); setLastOrder(null); }}
      />
    );
  } else if (scene === "pos") {
    node = <POSApp />;
  } else if (scene === "pos-cinema") {
    node = <POSCinemaApp />;
  } else if (scene === "cds") {
    node = <POSCDS />;
  } else if (scene === "kds") {
    node = <KDS apiBase={import.meta.env.VITE_API_URL || "http://localhost:3001"} wsUrl="/api/pos/broadcast/ws" />;
  } else {
    // Default scene — customer Kiosk. Static, no lazy chunks needed.
    node = (
      <ShiftGate customerMode>
        <PromoBroadcastBanner/>
        <OfflineBanner/>
        <Kiosk
          onCheckout={handleKioskCheckout}
          onAdminAccess={go("admin-login")}
          tableInfo={tableData}
        />
      </ShiftGate>
    );
  }

  return <Suspense fallback={<SceneLoading />}>{node}</Suspense>;
}
