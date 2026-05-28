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
import ImpersonationBanner from "./components/ImpersonationBanner.jsx";
import AdminLogin, { ResetPasswordPage } from "./AdminLogin.jsx";
import Kiosk from "./Kiosk.jsx";
import ShiftGate from "./ShiftGate.jsx";
import API_HOST from "./apiBase.js";

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
const SignagePlayer          = lazy(() => import("./SignagePlayer.jsx"));
const TenantSignup           = lazy(() => import("./TenantSignup.jsx"));
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
const PickupMonitor          = lazy(() => import("./KDS/PickupMonitor.jsx"));
const FlowApp                = lazy(() => import("./Flow/FlowApp.jsx"));
const CinemaWebApp           = lazy(() => import("./CinemaWeb/CinemaWebApp.jsx"));
const POSSatisfaction        = lazy(() => import("./POS/POSSatisfaction.jsx"));
const PWAInstallPrompt       = lazy(() => import("./components/PWAInstallPrompt.jsx"));

// White-label P3C — surfaces where a mobile install banner makes sense.
// Skip standalone surfaces (kiosk, pos, cds, kds, signage) and admin shell.
const PWA_PROMPT_SCENES = new Set([
  "flow", "customer-track", "track", "kiosk-feedback",
  "cinema-digital-ticket", "cinema-feedback", "receipt",
]);

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

function getScene() {
  const q = window.location.search;
  const host = (typeof window !== "undefined" && window.location.hostname) || "";

  // Hostname-based surface split (karyaos.tech migration).
  // admin.karyaos.tech → admin entry only (login → admin dashboard)
  // app.karyaos.tech   → customer surfaces (kiosk/POS/cinema dll) — query param tetap berlaku
  // api.karyaos.tech   → backend only, frontend gak di-serve di sini
  if (host.startsWith("admin.")) {
    // Query param tetap menang kalau admin sengaja navigate ke ?tools, ?command, dll
    if (q.includes("tools")) return "tools";
    if (q.includes("command") || new URLSearchParams(q).has("command")) return "command";
    if (q.includes("signup")) return "signup";
    if (q.includes("reset")) return "reset-password";
    return "admin-login";  // default: entry admin
  }

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
  if (new URLSearchParams(q).has("reset")) return "reset-password";
  if (new URLSearchParams(q).has("service")) return "service-staff";
  if (new URLSearchParams(q).get("ticket")) return "cinema-digital-ticket";
  if (new URLSearchParams(q).has("purchase")) return "cinema-digital-ticket";
  if (new URLSearchParams(q).has("signage")) return "signage";
  if (new URLSearchParams(q).has("pickup") || new URLSearchParams(q).has("expeditor")) return "pickup-monitor";
  if (new URLSearchParams(q).has("signup")) return "signup";
  if (new URLSearchParams(q).has("movies")) return "movies";
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
  const [forcePinChange, setForcePinChange] = useState(false);
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
    if (session?.force_pin_change) setForcePinChange(true);
    const _target = getScene(); setScene(_target === "admin-login" ? "home" : (_target || "home"));
  }

  function handleAdminLogout() {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminRole");
    localStorage.removeItem("adminName");
    // Multi-tenant: clear company context
    import("./companyAuth.js").then(m => m.clearCompanyCtx()).catch(() => {});
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
    // Kalau sudah ada session valid (refresh di /?admin), skip login → ke admin home
    if (adminSession?.token) {
      node = <AdminHome initialView="home" adminSession={adminSession} onLogout={handleAdminLogout} onExit={() => setScene("kiosk")} />;
    } else {
      node = <AdminLogin onLogin={handleAdminLogin}/>;
    }
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
  } else if (scene === "signage") {
    node = <SignagePlayer />;
  } else if (scene === "signup") {
    node = <TenantSignup />;
  } else if (scene === "movies") {
    node = <CinemaWebApp />;
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
  } else if (scene === "reset-password") {
    node = <ResetPasswordPage />;
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
    node = <KDS apiBase={API_HOST} wsUrl="/api/pos/broadcast/ws" />;
  } else if (scene === "pickup-monitor") {
    node = <PickupMonitor />;
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

  return (
    <>
      <ImpersonationBanner />
      <Suspense fallback={<SceneLoading />}>
        {node}
        {PWA_PROMPT_SCENES.has(scene) && <PWAInstallPrompt />}
      </Suspense>
      {forcePinChange && adminSession?.token && (
        <ForcePinChangeModal token={adminSession.token} onDone={() => setForcePinChange(false)} />
      )}
    </>
  );
}

// Blocker modal: tampil setelah login kalau PIN user masih weak
function ForcePinChangeModal({ token, onDone }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (newPin !== confirmPin) { setErr("PIN baru & konfirmasi tidak cocok"); return; }
    if (!/^\d{6}$/.test(newPin)) { setErr("PIN baru harus 6 digit angka"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      alert("✓ PIN berhasil di-ganti");
      onDone();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99999, padding: 20,
    }}>
      <div style={{
        background: "#0f172a", border: "2px solid #ef4444", borderRadius: 16, padding: 32,
        maxWidth: 460, width: "100%", color: "#e5e7eb", fontFamily: "'Inter',sans-serif",
        boxShadow: "0 24px 60px rgba(239,68,68,0.3)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🔐</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#ef4444", marginBottom: 8 }}>WAJIB GANTI PIN</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: "#fca5a5", lineHeight: 1.6 }}>
            PIN Anda terdeteksi <strong>lemah</strong> (default / sequential / pengulangan).
            Untuk keamanan, ganti PIN sekarang sebelum lanjut.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PinField label="PIN Lama (saat ini)" value={currentPin} onChange={setCurrentPin} placeholder="6 digit PIN sekarang" />
          <PinField label="PIN Baru" value={newPin} onChange={setNewPin} placeholder="6 digit, gak boleh sequential/pattern" />
          <PinField label="Konfirmasi PIN Baru" value={confirmPin} onChange={setConfirmPin} placeholder="Ulang PIN baru" />
        </div>

        <div style={{ marginTop: 12, padding: 12, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, fontSize: 11.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}>
          💡 <strong>Hindari</strong>: 999999, 123456, 111111, 121212, sequential atau berulang.<br/>
          <strong>Bagus</strong>: 847263, 593102, kombinasi acak yg gampang Anda ingat.
        </div>

        {err && (
          <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: "#fca5a5", fontSize: 12.5 }}>
            ⚠️ {err}
          </div>
        )}

        <button onClick={submit} disabled={busy || !currentPin || !newPin || !confirmPin} style={{
          marginTop: 20, width: "100%", padding: "14px 0",
          background: (busy || !currentPin || !newPin || !confirmPin) ? "#6b7280" : "#ef4444",
          color: "#fff", border: "none", borderRadius: 10,
          fontSize: 15, fontWeight: 800, cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
          opacity: busy ? 0.6 : 1,
        }}>
          {busy ? "Mengganti…" : "💾 Ganti PIN Sekarang"}
        </button>

        <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: "#6b7280" }}>
          🛡️ Tidak bisa di-skip — proteksi platform.
        </div>
      </div>
    </div>
  );
}

function PinField({ label, value, onChange, placeholder }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder={placeholder}
        autoComplete="new-password"
        style={{
          padding: "12px 14px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, color: "#fff", fontSize: 16, fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 6, textAlign: "center", outline: "none",
        }}
      />
    </label>
  );
}
