import { useState, useEffect, useCallback } from "react";
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
import POSChecklist from "./POS/POSChecklist.jsx";
import POSCelebration from "./POS/POSCelebration.jsx";
import PromoBroadcastBanner from "./PromoBroadcastBanner.jsx";
import OfflineBanner from "./OfflineBanner.jsx";

const API_HOST = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Quick Order — Wave 1-3 linear flow: master-menu pick → split payment → receipt.
// Parallel to the existing POSOrder/settle/resume flow; does not replace it.
function QuickOrderFlow({ cashier, onExit }) {
  const [stage, setStage] = useState("menu");
  const [order, setOrder] = useState(null);
  const [payResult, setPayResult] = useState(null);

  if (stage === "menu") {
    return (
      <POSMenuPicker
        apiBase={`${API_HOST}/api/master`}
        cashier={cashier}
        behaviorBase={API_HOST}
        onExit={onExit}
        onCheckout={({ items, subtotal }) => {
          setOrder({ ref: `QO-${Date.now()}`, total: subtotal, items, cashier: cashier?.name });
          setStage("payment");
        }}
      />
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
    return <POSSatisfaction order={order} apiBase={API_HOST} onDone={() => setStage("celebration")} />;
  }
  if (stage === "celebration" && order) {
    return <POSCelebration order={order} apiBase={API_HOST} onDone={onExit} />;
  }
  return null;
}

export default function POSApp() {
  const [cashier, setCashier] = useState(() => {
    try {
      const url = new URL(window.location.href);
      const force = url.searchParams.get("fresh") === "1" || url.searchParams.get("login") === "1";
      if (force) {
        ["posCashier", "posCinemaCashier", "cashier", "currentUser", "user"].forEach(k => {
          try { sessionStorage.removeItem(k); } catch {}
          try { localStorage.removeItem(k); } catch {}
        });
        url.searchParams.delete("fresh");
        url.searchParams.delete("login");
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
        console.log("[POS] Force-login: cleared all cashier keys");
        return null;
      }
      const raw = sessionStorage.getItem("posCashier");
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object" && parsed.name) return parsed;
      return null;
    } catch (e) {
      console.warn("[POS] cashier init err:", e);
      return null;
    }
  });
  const [view, setView] = useState("home"); // home | order | settle | settle-success | resume
  const [settlingTab, setSettlingTab] = useState(null);
  const [resumingTab, setResumingTab] = useState(null);
  const [settledResult, setSettledResult] = useState(null);
  const [shiftCloseId, setShiftCloseId] = useState(null);
  const [checklist, setChecklist] = useState(null);          // null = belum ke-load
  const [closingChecklist, setClosingChecklist] = useState(false);

  // Full-screen POS terminal — escape the 1126px #root width cap (index.css).
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const pw = root.style.width, pm = root.style.maxWidth;
    root.style.width = "100%"; root.style.maxWidth = "none";
    return () => { root.style.width = pw; root.style.maxWidth = pm; };
  }, []);

  // Emergency global logout — call window.posLogout() in DevTools console
  useEffect(() => {
    window.posLogout = () => {
      ["posCashier", "posCinemaCashier", "cashier", "currentUser", "user"].forEach(k => {
        try { sessionStorage.removeItem(k); } catch {}
        try { localStorage.removeItem(k); } catch {}
      });
      window.location.replace(window.location.pathname + "?pos=1&fresh=1");
    };
    return () => { delete window.posLogout; };
  }, []);

  // Status checklist opening/closing hari ini
  const reloadChecklist = useCallback(() => {
    fetch(`${API_HOST}/api/checklist/status`)
      .then(r => r.json())
      .then(setChecklist)
      .catch(() => setChecklist({ opening: { done: true }, closing: { done: true } })); // fail-open
  }, []);

  useEffect(() => { if (cashier) reloadChecklist(); }, [cashier, reloadChecklist]);

  const handleLogin = (user) => {
    sessionStorage.setItem("posCashier", JSON.stringify(user));
    setCashier(user);
    setView("home");
    // HRIS — auto check-in absensi pas kasir login POS (409 = sudah check-in, diabaikan)
    fetch(`${API_HOST}/api/hris/checkin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_name: user?.name, role: user?.role }),
    }).catch(() => {});
  };

  const handleLogout = () => {
    // HRIS — auto check-out absensi pas kasir keluar
    if (cashier?.name) {
      fetch(`${API_HOST}/api/hris/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_name: cashier.name }),
      }).catch(() => {});
    }
    sessionStorage.removeItem("posCashier");
    setCashier(null);
    setView("home");
  };

  const proceedCloseShift = async () => {
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

  // Tutup shift wajib lewat closing checklist dulu
  const handleCloseShift = () => {
    if (checklist && !checklist.closing?.done) { setClosingChecklist(true); return; }
    proceedCloseShift();
  };

  if (!cashier) return <POSKasirLogin apiBase={API_HOST} onSelectKasir={handleLogin} />;

  // GATE: opening checklist wajib kelar sebelum kasir bisa mulai transaksi
  if (checklist && !checklist.opening?.done) {
    return <POSChecklist type="opening" apiBase={API_HOST} cashier={cashier} onDone={reloadChecklist} />;
  }

  return (
    <ShiftGate cashier={cashier} onSwitchCashier={handleLogout}>
      <PromoBroadcastBanner />
      <OfflineBanner />
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
          onDone={() => setView("settle-celebration")}
        />
      )}
      {view === "settle-celebration" && (
        <POSCelebration
          order={{ total: settledResult?.total || 0, customer: settledResult?.customer_name || settledResult?.customerName }}
          apiBase={API_HOST}
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
      {closingChecklist && (
        <POSChecklist
          type="closing"
          apiBase={API_HOST}
          cashier={cashier}
          onDone={() => { setClosingChecklist(false); reloadChecklist(); proceedCloseShift(); }}
        />
      )}
    </ShiftGate>
  );
}
