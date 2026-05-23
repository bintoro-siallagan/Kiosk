import { useState, useEffect } from "react";
import { unlockAudio, loadAudioConfig } from "./audio.js";
import CustomerTrackingPage from "./CustomerTrackingPage.jsx";
import PromoBroadcastBanner from "./PromoBroadcastBanner.jsx";
import OfflineBanner from "./OfflineBanner.jsx";
import POSCelebration from "./POS/POSCelebration.jsx";
import POSCDS from "./POSCDS.jsx";
import AdminLogin    from "./AdminLogin.jsx";
import Kiosk         from "./Kiosk.jsx";
import CinemaKiosk   from "./CinemaKiosk.jsx";
import CinemaInStudioOrder from "./CinemaInStudioOrder.jsx";
import TableSelector from "./TableSelector.jsx";
import CustomerInput from "./CustomerInput.jsx";
import Payment       from "./Payment.jsx";
import DigitalReceipt from "./DigitalReceipt.jsx";
import AdminHome     from "./AdminHome.jsx";
import OrderTracking from "./OrderTracking.jsx";
import ShiftGate     from "./ShiftGate.jsx";
import POSApp        from "./POSApp.jsx";
import KDS           from "./KDS/KDS.jsx";

import FlowApp from "./Flow/FlowApp.jsx";
import POSSatisfaction from "./POS/POSSatisfaction.jsx";
import { MenuProvider } from "./MenuContext.jsx";

const API_HOST = import.meta.env.VITE_API_URL || "http://localhost:3001";
function getScene() {
  const q = window.location.search;
  if (new URLSearchParams(q).has("command")) return "command";
  if (q.includes("cinema-snack")) return "cinema-snack";
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


  if (adminRoutes.includes(scene) && !adminSession) return <AdminLogin onLogin={handleAdminLogin}/>;

  if (scene === "admin-login") return <AdminLogin onLogin={handleAdminLogin}/>;
  if (adminRoutes.includes(scene)) return <AdminHome initialView={scene} adminSession={adminSession} onLogout={handleAdminLogout} onExit={() => setScene("kiosk")} />;
  if (scene === "flow") return <ShiftGate><FlowApp /></ShiftGate>;
  if (scene === "cinema") return <CinemaKiosk apiBase={API_HOST} />;
  if (scene === "cinema-snack") return <CinemaInStudioOrder apiBase={API_HOST} />;
  if (scene === "customer-track") return <><PromoBroadcastBanner/><CustomerTrackingPage orderId={trackOrderId}/></>;
  if (scene === "track")       return <OrderTracking onHome={go("kiosk")}/>;

  if (scene === "table-select" && checkoutData) {
    return (
      <ShiftGate><TableSelector
        onSelect={handleTableSelect}
        onBack={go("kiosk")}
      /></ShiftGate>
    );
  }

  if (scene === "customer-input" && checkoutData) {
    return (
      <ShiftGate><CustomerInput
        cart={checkoutData.cart}
        orderType={checkoutData.orderType}
        onConfirm={handleCustomerConfirm}
        onBack={() => setScene(checkoutData.orderType === "dine" ? "table-select" : "kiosk")}
      /></ShiftGate>
    );
  }

  if (scene === "payment" && checkoutData && customerData) {
    return (
      <ShiftGate><Payment
        cart={checkoutData.cart}
        orderType={checkoutData.orderType}
        promo={checkoutData.promo}
        tableData={tableData}
        customerData={customerData}
        onSuccess={handlePaymentSuccess}
        onBack={() => setScene("customer-input")}
      /></ShiftGate>
    );
  }

  if (scene === "receipt") {
    return (
      <DigitalReceipt
        orderId={lastOrderId}
        onDone={() => setScene("kiosk-feedback")}
      />
    );
  }

  if (scene === "kiosk-feedback") {
    return (
      <POSSatisfaction
        order={{ ref: lastOrderId }}
        apiBase={API_HOST}
        source="kiosk"
        onDone={() => setScene("kiosk-celebration")}
      />
    );
  }

  if (scene === "kiosk-celebration") {
    return (
      <POSCelebration
        order={{ ref: lastOrderId }}
        apiBase={API_HOST}
        onDone={() => { setScene("kiosk"); setCheckout(null); setCustomer(null); setTable(null); setLastOrder(null); }}
      />
    );
  }

  if (scene === "pos") return <POSApp />;
  if (scene === "cds") return <POSCDS />;
  if (scene === "kds") return <KDS apiBase={import.meta.env.VITE_API_URL || "http://localhost:3001"} wsUrl="/api/pos/broadcast/ws" />;

  return (
    <ShiftGate>
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
