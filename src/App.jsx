import { useState, useEffect } from "react";
import { unlockAudio, loadAudioConfig } from "./audio.js";
import CustomerTrackingPage from "./CustomerTrackingPage.jsx";
import PromoBroadcastBanner from "./PromoBroadcastBanner.jsx";
import POSCelebration from "./POS/POSCelebration.jsx";
import POSCDS from "./POSCDS.jsx";
import AdminLogin    from "./AdminLogin.jsx";
import Kiosk         from "./Kiosk.jsx";
import TableSelector from "./TableSelector.jsx";
import CustomerInput from "./CustomerInput.jsx";
import Payment       from "./Payment.jsx";
import DigitalReceipt from "./DigitalReceipt.jsx";
import CommandCenter from "./CommandCenter.jsx";
import AdminTools from "./AdminTools.jsx";

import Admin         from "./Admin.jsx";
import Report        from "./Report.jsx";
import ESBSync       from "./ESBSync.jsx";
import ESBNotif      from "./ESBNotif.jsx";
import OrderTracking from "./OrderTracking.jsx";
import MemberList    from "./MemberList.jsx";
import PromoManager  from "./PromoManager.jsx";
import ShiftGate     from "./ShiftGate.jsx";
import POSApp        from "./POSApp.jsx";
import KDS           from "./KDS/KDS.jsx";
import ShiftManager  from "./ShiftManager.jsx";

import FlowApp from "./Flow/FlowApp.jsx";
import POSSatisfaction from "./POS/POSSatisfaction.jsx";
import { MenuProvider } from "./MenuContext.jsx";

const API_HOST = import.meta.env.VITE_API_URL || "http://localhost:3001";
function getScene() {
  const q = window.location.search;
  if (new URLSearchParams(q).get("command")) return "command";
  if (q.includes("tools")) return "tools";
  if (new URLSearchParams(q).get("flow")) return "flow";
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
  const [toolsTab, setToolsTab] = useState("staff");
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

  const go = (s) => () => setScene(s);

  function handleAdminLogin(session) {
    setAdmin(session);
    const _target = getScene(); setScene(_target === "admin-login" ? "admin" : (_target || "admin"));
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
  const adminRoutes = ["admin","report","esb-sync","esb-notif","members","promo","shift","command","tools"];


  if (adminRoutes.includes(scene) && !adminSession) return <AdminLogin onLogin={handleAdminLogin}/>;

  if (scene === "admin-login") return <AdminLogin onLogin={handleAdminLogin}/>;
  if (scene === "tools") return <AdminTools onBack={() => { setScene("admin"); }} initialTab={toolsTab} />;
  if (scene === "command") return <CommandCenter />;
  if (scene === "flow") return <FlowApp />;
  if (scene === "customer-track") return <><PromoBroadcastBanner/><CustomerTrackingPage orderId={trackOrderId}/></>;
  if (scene === "track")       return <OrderTracking onHome={go("kiosk")}/>;
  if (scene === "admin")       return <Admin onExit={go("kiosk")} onReport={go("report")} onESBSync={go("esb-sync")} onESBNotif={go("esb-notif")} onMembers={go("members")} onPromo={go("promo")} onShift={go("shift")} onLogout={handleAdminLogout} adminSession={adminSession} onTools={(tab) => { if (tab === "command") { setScene("command"); } else { setToolsTab(tab); setScene("tools"); } }}/>;
  if (scene === "report")      return <Report    onBack={go("admin")}/>;
  if (scene === "esb-sync")    return <ESBSync   onBack={go("admin")}/>;
  if (scene === "esb-notif")   return <ESBNotif  onBack={go("admin")}/>;
  if (scene === "members")     return <MemberList onBack={go("admin")}/>;
  if (scene === "promo")       return <PromoManager onBack={go("admin")}/>;
  if (scene === "shift")       return <ShiftManager onBack={go("admin")}/>;

  if (scene === "table-select" && checkoutData) {
    return (
      <TableSelector
        onSelect={handleTableSelect}
        onBack={go("kiosk")}
      />
    );
  }

  if (scene === "customer-input" && checkoutData) {
    return (
      <CustomerInput
        cart={checkoutData.cart}
        orderType={checkoutData.orderType}
        onConfirm={handleCustomerConfirm}
        onBack={() => setScene(checkoutData.orderType === "dine" ? "table-select" : "kiosk")}
      />
    );
  }

  if (scene === "payment" && checkoutData && customerData) {
    return (
      <Payment
        cart={checkoutData.cart}
        orderType={checkoutData.orderType}
        promo={checkoutData.promo}
        tableData={tableData}
        customerData={customerData}
        onSuccess={handlePaymentSuccess}
        onBack={() => setScene("customer-input")}
      />
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
      <Kiosk
      onCheckout={handleKioskCheckout}
      onAdminAccess={go("admin-login")}
      tableInfo={tableData}
    />
    </ShiftGate>
  );
}
