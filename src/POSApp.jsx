import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import POSKasirLogin from "./POS/POSKasirLogin.jsx";
const FarewellOverlay = lazy(() => import("./components/FarewellOverlay.jsx"));
import { useTenantTheme } from "./lib/tenantTheme.js";
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
import TouchNumpad from "./components/TouchNumpad.jsx";
import FullscreenPrompt from "./components/FullscreenPrompt.jsx";
import DeviceOutletSetup, { getDeviceOutlet } from "./components/DeviceOutletSetup.jsx";
import API_HOST from "./apiBase.js";


// Gate paling depan: Manager/PIC harus Open Day sebelum kasir bisa PIN.
// Render "OUTLET MASIH TUTUP" + tombol Open Day (Bearer token Manager).
function DayClosedGate({ dayState, onDayOpen }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const openDay = async () => {
    setBusy(true); setErr("");
    try {
      const token = (() => { try { return localStorage.getItem("adminToken") || ""; } catch { return ""; } })();
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(`${API_HOST}/api/day/open?vertical=fnb`, {
        method: "POST", headers, body: JSON.stringify({ by: "Manager", vertical: "fnb" }),
      });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          throw new Error("Manager / Admin harus login di admin.karyaos.tech dulu sebelum buka hari.");
        }
        let detail = ""; try { detail = (await r.json())?.error || ""; } catch {}
        throw new Error(detail || `Gagal buka hari (HTTP ${r.status})`);
      }
      onDayOpen?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"linear-gradient(160deg,#0a0b0e 0%,#111317 100%)", color:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif", padding:"40px", textAlign:"center", zIndex:9999 }}>
      <div style={{ fontSize:100, lineHeight:1.2, marginBottom:28, opacity:0.85, filter:"drop-shadow(0 0 20px color-mix(in srgb, var(--brand-primary,#FF6B35) 30%, transparent))", display:"block" }}>🌙</div>
      <h1 style={{ fontFamily:"'Inter',sans-serif", fontSize:44, letterSpacing:3, margin:"0 0 12px", color:"#F59E0B", fontWeight:800, lineHeight:1.2 }}>OUTLET MASIH TUTUP</h1>
      <p style={{ fontSize:16, color:"rgba(255,255,255,0.6)", margin:"0 0 28px", maxWidth:480, lineHeight:1.6 }}>
        {dayState?.closedBy ? `Ditutup oleh ${dayState.closedBy}` : "Hari masih ditutup."}
        <br/>Manager / PIC outlet harus buka hari dulu sebelum kasir mulai shift.
      </p>
      {err && <div style={{ background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.3)", color:"#f87171", borderRadius:12, padding:"12px 16px", marginBottom:18, maxWidth:480, fontSize:13 }}>⚠ {err}</div>}
      <button onClick={openDay} disabled={busy}
        style={{ background:"linear-gradient(135deg, #F59E0B, #D97706)", color:"#fff", border:"none", borderRadius:14, padding:"18px 36px", fontSize:16, fontWeight:800, letterSpacing:0.5, cursor: busy ? "wait" : "pointer", boxShadow:"0 14px 36px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.3)" }}>
        {busy ? "⏳ Membuka hari…" : "🌅 BUKA HARI · OPEN DAY"}
      </button>
      <div style={{ marginTop:24, fontSize:12, color:"rgba(255,255,255,0.35)" }}>Auto-refresh setiap 20 detik</div>
    </div>
  );
}

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
    fetch(`${API_HOST}/api/checklist/status?vertical=fnb`)
      .then(r => r.json())
      .then(setChecklist)
      .catch(() => setChecklist({ opening: { done: true }, closing: { done: true } })); // fail-open
  }, []);

  useEffect(() => { if (cashier) reloadChecklist(); }, [cashier, reloadChecklist]);

  // Status day (closed/open) — gate paling depan, dicek SEBELUM kasir PIN.
  // Manager/PIC harus Open Day dulu sebelum kasir bisa login.
  const [dayState, setDayState] = useState(undefined);
  const reloadDayState = useCallback(() => {
    fetch(`${API_HOST}/api/day/status?vertical=fnb`)
      .then(r => r.json())
      .then(d => setDayState(d || { closed: false }))
      .catch(() => setDayState({ closed: false }));
  }, []);
  useEffect(() => {
    reloadDayState();
    const id = setInterval(reloadDayState, 20000);
    return () => clearInterval(id);
  }, [reloadDayState]);

  const handleLogin = (user) => {
    sessionStorage.setItem("posCashier", JSON.stringify(user));
    // Persist auth token agar fetch ke endpoint protected (requireAdmin) ga 401
    if (user?.token) {
      try { localStorage.setItem("adminToken", user.token); } catch {}
    }
    // Auto-bind outlet dari user record kalau admin sudah set
    if (user?.outlet_code) {
      localStorage.setItem("posOutlet", user.outlet_code);
    }
    setCashier(user);
    setView("home");
    fetch(`${API_HOST}/api/hris/checkin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_name: user?.name, role: user?.role }),
    }).catch(() => {});
  };

  // Farewell overlay state — sambutan "sampai bertemu lagi" sebelum logout
  const [farewell, setFarewell] = useState(null);

  const handleLogout = () => {
    if (cashier?.name) {
      // HRIS — auto check-out absensi pas kasir keluar (jangan blok flow)
      fetch(`${API_HOST}/api/hris/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_name: cashier.name }),
      }).catch(() => {});
    }
    // Tampilkan farewell dulu, baru logout actual
    setFarewell({
      name: cashier?.name || 'Sahabat',
      then: () => {
        sessionStorage.removeItem("posCashier");
        setCashier(null);
        setView("home");
      },
    });
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

  // GATE: device outlet setup wajib done dulu sebelum login.
  // Once set, semua kasir di device ini auto-bind ke outlet sama.
  if (!getDeviceOutlet()) {
    return <DeviceOutletSetup vertical="fnb" />;
  }

  // GATE: Day-closed gate paling depan — Manager/PIC harus Open Day dulu
  // sebelum kasir bisa input PIN. Order: OpenDay → PIN → Checklist → Cash modal → POS.
  if (dayState === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0e16", color: "#9ca3af", fontFamily: "'Inter',sans-serif" }}>
        <div style={{ fontSize: 14, letterSpacing: 1.5 }}>⏳ Memuat status hari…</div>
      </div>
    );
  }
  if (dayState?.closed) {
    return <DayClosedGate dayState={dayState} onDayOpen={reloadDayState} />;
  }

  if (!cashier) return <POSKasirLogin apiBase={API_HOST} onSelectKasir={handleLogin} />;

  // Wait for checklist state to load — jangan kasih jump ke ShiftGate dulu
  // (kalau gak wait, race condition: cash modal pop up sebentar lalu di-overlay checklist)
  if (checklist === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0e16", color: "#9ca3af", fontFamily: "'Inter',sans-serif" }}>
        <div style={{ fontSize: 14, letterSpacing: 1.5 }}>⏳ Memuat checklist…</div>
      </div>
    );
  }

  // GATE: opening checklist wajib kelar dulu sebelum buka shift (cash modal + target).
  // Order: PIN → Checklist → Cash modal (ShiftGate) → POS menu.
  if (!checklist.opening?.done) {
    return <POSChecklist type="opening" vertical="fnb" apiBase={API_HOST} cashier={cashier} onDone={reloadChecklist} />;
  }

  return (
    <ThemedPOSWrapper>
    <ShiftGate cashier={cashier} onSwitchCashier={handleLogout} vertical="fnb" onDayOpen={() => { reloadChecklist(); reloadDayState(); }}>
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
          vertical="fnb"
          apiBase={API_HOST}
          cashier={cashier}
          onDone={() => { setClosingChecklist(false); reloadChecklist(); proceedCloseShift(); }}
        />
      )}
    </ShiftGate>
    {farewell && (
      <Suspense fallback={null}>
        <FarewellOverlay name={farewell.name} onDone={() => { setFarewell(null); farewell.then?.(); }} />
      </Suspense>
    )}
    <TouchNumpad />
    <FullscreenPrompt
      icon="🍽️"
      label="POS CASHIER"
      title="Tap to Enter Fullscreen"
      description="Header browser hidden — fokus penuh untuk kasir saat melayani customer."
      kioskHint="chrome --kiosk https://app.karyaos.tech/?pos"
      storageKey="pos-cashier"
    />
    </ThemedPOSWrapper>
  );
}

// Wrapper utk apply tenant theme (font + bg) ke POS
function ThemedPOSWrapper({ children }) {
  const [brand, setBrand] = useState(null);
  useEffect(() => {
    fetch("/api/companies/branding").then(r => r.json()).then(setBrand).catch(() => {});
  }, []);
  const { fontFamily, background } = useTenantTheme(brand, { fallbackBg: "", fallbackFont: "" });
  return (
    <div style={{ minHeight: "100vh", fontFamily: fontFamily || undefined, background: background || undefined }}>
      {children}
    </div>
  );
}
