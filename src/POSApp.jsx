import { useState } from "react";
import POSKasirLogin from "./POS/POSKasirLogin.jsx";
import POSHome from "./POSHome.jsx";
import POSOrder from "./POSOrder.jsx";
import POSSettle from "./POSSettle.jsx";
import POSSuccess from "./POSSuccess.jsx";
import ShiftGate from "./ShiftGate.jsx";
import POSMenuPicker from "./POS/POSMenuPicker.jsx";
import POSPayment from "./POS/POSPayment.jsx";
import POSReceipt from "./POS/POSReceipt.jsx";
import POSSatisfaction from "./POS/POSSatisfaction.jsx";
import POSShiftClose from "./POS/POSShiftClose.jsx";

const API_HOST = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Quick Order — Wave 1-3 linear flow: master-menu pick → split payment → receipt.
// Parallel to the existing POSOrder/settle/resume flow; does not replace it.
function QuickOrderFlow({ cashier, onExit }) {
  const [stage, setStage] = useState("menu");
  const [order, setOrder] = useState(null);
  const [payResult, setPayResult] = useState(null);

  if (stage === "menu") {
    return (
      <>
        <button
          onClick={onExit}
          style={{ position: "fixed", top: 12, left: 12, zIndex: 10000, padding: "8px 14px",
                   background: "#1a1a1a", color: "#fff", border: "1px solid #444",
                   borderRadius: 8, cursor: "pointer", fontSize: 13 }}
        >← Home</button>
        <POSMenuPicker
          apiBase={`${API_HOST}/api/master`}
          onCheckout={({ items, subtotal }) => {
            setOrder({ ref: `QO-${Date.now()}`, total: subtotal, items, cashier: cashier?.name });
            setStage("payment");
          }}
        />
      </>
    );
  }
  if (stage === "payment" && order) {
    return (
      <POSPayment
        order={order}
        apiBase={`${API_HOST}/api/pos`}
        gatewayBase={API_HOST}
        onCancel={() => setStage("menu")}
        onComplete={(result) => { setPayResult(result); setStage("receipt"); }}
      />
    );
  }
  if (stage === "receipt" && order) {
    return (
      <POSReceipt
        order={{ ...order, payments: payResult?.tenders || payResult?.payments || [], loyalty_discount: payResult?.loyalty_discount || 0 }}
        onClose={() => setStage("feedback")}
        onPrintDone={() => {}}
      />
    );
  }
  if (stage === "feedback" && order) {
    return <POSSatisfaction order={order} apiBase={API_HOST} onDone={onExit} />;
  }
  return null;
}

export default function POSApp() {
  const [cashier, setCashier] = useState(() => {
    try {
      const raw = sessionStorage.getItem("posCashier");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [view, setView] = useState("home"); // home | order | settle | settle-success | resume
  const [settlingTab, setSettlingTab] = useState(null);
  const [resumingTab, setResumingTab] = useState(null);
  const [settledResult, setSettledResult] = useState(null);
  const [shiftCloseId, setShiftCloseId] = useState(null);

  const handleLogin = (user) => {
    sessionStorage.setItem("posCashier", JSON.stringify(user));
    setCashier(user);
    setView("home");
  };

  const handleLogout = () => {
    sessionStorage.removeItem("posCashier");
    setCashier(null);
    setView("home");
  };

  const handleCloseShift = async () => {
    try {
      const active = await fetch(`${API_HOST}/api/pos/shifts/active`).then(r => r.json());
      let id = Array.isArray(active)
        ? (active.find(s => s.staff_id === cashier?.id) || active[0])?.id
        : null;
      if (!id) {
        const opened = await fetch(`${API_HOST}/api/pos/shifts/open`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staff_id: cashier?.id })
        }).then(r => r.json());
        id = opened?.id || opened?.shift_id || null;
      }
      if (id) setShiftCloseId(id);
      else alert("Tidak ada shift aktif untuk ditutup.");
    } catch (e) { console.error("close shift:", e); }
  };

  if (!cashier) return <POSKasirLogin apiBase={API_HOST} onSelectKasir={handleLogin} />;

  return (
    <ShiftGate>
      {view === "home" && (
        <POSHome
          cashier={cashier}
          onLogout={handleLogout}
          onNewOrder={() => setView("order")}
          onSettleTab={(tab) => { setSettlingTab(tab); setView("settle"); }}
          onResumeTab={(tab) => { setResumingTab(tab); setView("resume"); }}
          onQuickOrder={() => setView("quickorder")}
          onCloseShift={handleCloseShift}
        />
      )}
      {view === "quickorder" && (
        <QuickOrderFlow cashier={cashier} onExit={() => setView("home")} />
      )}
      {view === "order" && (
        <POSOrder
          cashier={cashier}
          onCancel={() => setView("home")}
          onComplete={() => setView("home")}
        />
      )}
      {view === "settle" && settlingTab && (
        <POSSettle
          tab={settlingTab}
          cashier={cashier}
          onBack={() => { setSettlingTab(null); setView("home"); }}
          onSuccess={(settled) => {
            setSettledResult(settled);
            setView("settle-success");
          }}
        />
      )}
      {view === "resume" && resumingTab && (
        <POSOrder
          cashier={cashier}
          resumeTab={resumingTab}
          onCancel={() => { setResumingTab(null); setView("home"); }}
          onComplete={() => { setResumingTab(null); setView("home"); }}
        />
      )}
            {view === "settle-success" && settledResult && (
        <POSSuccess
          created={settledResult}
          order={{
            type: settledResult.type === "dine" ? "dine-in" : "take-away",
            table: settledResult.table && settledResult.table !== "-" ? { name: settledResult.table } : null,
            customerName: settledResult.customer_name || settledResult.customerName || "",
            action: "pay",
            subtotal: settledResult.total
          }}
          cashier={cashier}
          onDone={() => setView("settle-feedback")}
          onAnother={() => { setSettledResult(null); setSettlingTab(null); setView("order"); }}
        />
      )}
      {view === "settle-feedback" && (
        <POSSatisfaction
          order={{ ref: settledResult?.id || settledResult?.ref || settledResult?.order_id, cashier: cashier?.name }}
          apiBase={API_HOST}
          source="pos"
          onDone={() => { setSettledResult(null); setSettlingTab(null); setView("home"); }}
        />
      )}
      {shiftCloseId && (
        <POSShiftClose
          shiftId={shiftCloseId}
          apiBase={API_HOST}
          onClose={() => setShiftCloseId(null)}
          onCompleted={() => { setShiftCloseId(null); handleLogout(); }}
        />
      )}
    </ShiftGate>
  );
}
