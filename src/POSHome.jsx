import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
const DayClosingRitual = lazy(() => import("./POS/DayClosingRitual.jsx"));

import POSOrderHistory from "./POSOrderHistory.jsx";
import POSMergeTabsModal from "./POSMergeTabsModal.jsx";
import UpsellTicker from "./components/UpsellTicker.jsx";
import MarqueeTicker from "./components/MarqueeTicker.jsx";
import PromoStrip from "./components/PromoStrip.jsx";
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
  const [closingRitual, setClosingRitual] = useState(null);
  // Detect outlet vertical (fnb | cinema | hybrid) — bisa load Jual Tiket button kalau hybrid
  const [outletVertical, setOutletVertical] = useState("fnb");
  const [outletInfo, setOutletInfo] = useState({ code: null, name: null, area: null });
  const [allOutlets, setAllOutlets] = useState([]);
  const outletBtnRef = useRef(null);
  const [pickerCoords, setPickerCoords] = useState({ top: 0, left: 0 });
  const [pickerStep, setPickerStep] = useState("list"); // "pin" | "list"
  const [showOutletPicker, setShowOutletPicker] = useState(false);
  const [brand, setBrand] = useState({ name: null, code: null, logoUrl: "/logo.png" });
  useEffect(() => {
    // Priority: device-level → legacy posOutlet
    const outletCode = new URLSearchParams(window.location.search).get("outlet")
      || localStorage.getItem("posOutletDevice")
      || localStorage.getItem("posOutlet") || "";
    fetch(`/api/outlet-master`).then(r => r.json()).then(d => {
      const outlets = d.outlets || [];
      // F&B POS — prefer fnb + hybrid outlets
      const fnbOutlets = outlets.filter(o => o.vertical === "fnb" || o.vertical === "hybrid");
      setAllOutlets(fnbOutlets.length > 0 ? fnbOutlets : outlets);
      if (outletCode) {
        const o = outlets.find(x => x.code === outletCode || x.name === outletCode);
        if (o) {
          if (o.vertical) setOutletVertical(o.vertical);
          setOutletInfo({ code: o.code, name: o.name, area: o.area });
        }
      }
    }).catch(() => {});
  }, []);
  // Device-bound: changing outlet via picker rebinds device (permanent for this device)
  const pickOutlet = (code) => {
    localStorage.setItem("posOutletDevice", code);
    localStorage.setItem("posOutlet", code);
    location.reload();
  };
  const isDeviceLocked = typeof window !== "undefined" && !!localStorage.getItem("posOutletDevice");
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockErr, setUnlockErr] = useState("");
  const tryUnlock = async () => {
    setUnlockErr("");
    if (unlockPin.length !== 6) { setUnlockErr("PIN harus 6 digit"); return; }
    try {
      const r = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: unlockPin }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error || "PIN salah");
      const role = (j.user?.role || j.role || "").toLowerCase();
      if (!["super-admin","superadmin","admin","manager","owner"].some(r => role.includes(r))) {
        throw new Error(`Role "${role}" tidak punya akses reset outlet`);
      }
      setShowUnlockModal(false);
      setPickerStep("list");
      setShowOutletPicker(true);
      setUnlockPin("");
      setTimeout(() => setShowOutletPicker(false), 60_000);
    } catch (e) {
      setUnlockErr(e.message || "PIN salah");
    }
  };
  useEffect(() => {
    fetch(`${API_BASE}/api/companies/branding`).then(r => r.json()).then(b => {
      if (b?.brand_color) setBrand({ name: b.name, code: b.company_code, logoUrl: b.logo_url || "/logo.png" });
    }).catch(() => {});
  }, []);
  const isHybrid = outletVertical === "hybrid";

  // POSHome mount → reset CDS to welcome screen
  useEffect(() => {
    fetch(`${API_BASE}/api/pos/broadcast`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ event: "pos:idle", data: {} })
    }).catch(() => {});
  }, []);

  const role = (cashier.role || "kasir").toLowerCase();

  const refresh = async () => {
    // Cycle-based filter — gunakan dayState.openedAt kalau ada, biar shift baru
    // post Tutup-Buka Hari mulai dari 0 (bukan total kalender hari).
    let cycleStart = 0;
    try {
      const ds = await fetch(`${API_BASE}/api/day/status?vertical=fnb`).then(r => r.json()).catch(() => null);
      if (ds && !ds.closed && ds.openedAt) cycleStart = ds.openedAt;
    } catch {}
    const calendarTodayStart = new Date(); calendarTodayStart.setHours(0,0,0,0);
    const filterFrom = Math.max(calendarTodayStart.getTime(), cycleStart);

    fetch(`${API_BASE}/api/orders`)
      .then(r => r.json())
      .then(data => {
        const all = Array.isArray(data) ? data : (data?.orders || []);
        // Active tabs: status === "tab_open"
        const activeTabs = all.filter(o => o.status === "tab_open");
        setTabs(activeTabs);
        // Today's orders dari cycle Open Day terakhir (bukan kalender)
        const today = all.filter(o => o.time >= filterFrom && o.status !== "cancelled");
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
    if (!window.confirm("TUTUP HARI?\n\nShift aktif ikut ditutup, dan TIDAK ADA yang bisa order sampai Manager 'Open Day'. Summary transaksi today akan dicetak" + " (& dikirim email bila email aktif).")) return;
    try {
      const adminToken = cashier?.token
        || localStorage.getItem("adminToken")
        || localStorage.getItem("posToken")
        || "";
      const r = await fetch(`${API_BASE}/api/day/close?vertical=fnb`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
        },
        body: JSON.stringify({ by: cashier?.name || "Manager", vertical: "fnb" }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error((data && data.error) || `HTTP ${r.status} ${r.statusText || ""}`.trim());
      }
      if (data && data.reportHtml) {
        const w = window.open("", "_blank", "width=640,height=820");
        if (w) {
          w.document.write(`<html><head><title>Close Day — KaryaOS</title></head><body style="margin:24px" onload="setTimeout(function(){window.print()},300)">${data.reportHtml}</body></html>`);
          w.document.close();
        }
      }
      // Ceremonial closing ritual — bukan langsung logout, beri momen apresiasi
      setClosingRitual((data && (data.report || data.summary)) || {});
    } catch (e) {
      alert("Gagal tutup hari: " + (e?.message || e));
      return;
    }
  }

  return (
    <div style={S.root}>
      {/* Text jalan — promo aktif / Sultan / coming soon / custom admin msg */}
      <MarqueeTicker surface="home" apiBase={API_BASE} variant="dark" height={36} speed={55} label="KARYA·LIVE" />
      {/* Promo banner — daftar promo F&B aktif, kasir info-only (untuk dikomunikasikan ke customer) */}
      <div style={{ padding: "10px 14px 0" }}>
        <PromoStrip apiBase={API_BASE} variant="dark" maxItems={6} compact />
      </div>
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

      <TouchNumpad />
      <UpsellTicker vertical={isHybrid ? "hybrid" : "fnb"} />

      <header style={S.header}>
        <div style={S.brand}>
          <img src={brand.logoUrl || "/logo.png"} alt="" style={{ height: 26, verticalAlign: "middle", marginRight: 7 }} />
          <span>{brand.name && !["BTS","CMX","KARYAOS"].includes(brand.code) ? `${brand.name} POS` : "karyaos POS"}</span>
          {/* Branch / outlet picker — kalau device-locked: read-only, klik → Manager PIN modal */}
          <div style={{ position: "relative", marginLeft: 12, display: "inline-block" }}>
            <button ref={outletBtnRef} onClick={(e) => {
              const role = (cashier?.role || "").toLowerCase();
              const isElevated = ["manager", "admin", "super-admin", "superadmin", "owner"].includes(role);
              // Compute coords — inline panel render via portal di body
              if (outletBtnRef.current) {
                const r = outletBtnRef.current.getBoundingClientRect();
                setPickerCoords({ top: r.bottom + 6, left: r.left });
              }
              // Device-locked + non-elevated → PIN inline. Else langsung list.
              setPickerStep(isDeviceLocked && !isElevated ? "pin" : "list");
              setUnlockPin("");
              setUnlockErr("");
              setShowOutletPicker(s => !s);
            }} style={{
              padding: "8px 14px", borderRadius: 999,
              background: outletInfo.name ? "rgba(56,189,248,0.18)" : "linear-gradient(135deg, rgba(245,158,11,0.25), rgba(239,68,68,0.20))",
              border: outletInfo.name ? "1.5px solid rgba(56,189,248,0.55)" : "1.5px solid rgba(245,158,11,0.65)",
              color: outletInfo.name ? "#7dd3fc" : "#fcd34d",
              fontSize: 13, fontWeight: 800, letterSpacing: 0.5,
              fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
              display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
              boxShadow: outletInfo.name
                ? "0 4px 14px rgba(56,189,248,0.25)"
                : "0 4px 18px rgba(245,158,11,0.35), 0 0 0 2px rgba(245,158,11,0.15)",
              animation: outletInfo.name ? "none" : "outletPulse 2s ease-in-out infinite",
            }} title={isDeviceLocked ? "🔒 Device-locked. Klik untuk Manager PIN unlock" : (outletInfo.name ? `Klik ganti outlet · current: ${outletInfo.code}` : "Klik pilih outlet")}>
              {outletInfo.name ? (
                <>
                  <span style={{ fontSize: 16 }}>{isDeviceLocked ? "🔒" : "📍"}</span>
                  <span>{outletInfo.name}</span>
                  {outletInfo.area && outletInfo.area !== "-" && <span style={{ color: "#94a3b8", fontWeight: 600, fontSize: 11 }}>· {outletInfo.area}</span>}
                  {!isDeviceLocked && <span style={{ opacity: 0.7, marginLeft: 2, fontSize: 11 }}>▾</span>}
                </>
              ) : (
                <>
                  <span style={{ fontSize: 16 }}>📍</span>
                  <span>Pilih Outlet</span>
                  <span style={{ opacity: 0.7, fontSize: 11 }}>▾</span>
                </>
              )}
            </button>
            {showOutletPicker && createPortal(
              <>
                {/* Backdrop — click outside to close */}
                <div onClick={() => setShowOutletPicker(false)} style={{
                  position: "fixed", inset: 0, zIndex: 99999, background: "transparent",
                }} />
              <div onClick={(e) => e.stopPropagation()} style={{
                position: "fixed", top: pickerCoords.top, left: pickerCoords.left,
                background: "#1a1d29",
                border: "1px solid rgba(56,189,248,0.45)",
                borderRadius: 12, padding: 8, minWidth: 320, maxHeight: 480, overflowY: "auto",
                boxShadow: "0 20px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(56,189,248,0.30)",
                zIndex: 100000,
                fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
                color: "#fff",
              }}>
                {pickerStep === "pin" ? (
                  <div style={{ padding: "8px 6px 4px" }}>
                    <div style={{ padding: "2px 6px 10px", fontSize: 11, color: "#fbbf24", fontWeight: 800, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 10 }}>
                      🔒 Manager PIN
                    </div>
                    <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 10, padding: "0 4px", lineHeight: 1.5 }}>
                      Outlet terkunci di device ini.<br/>
                      Masukkan PIN Manager untuk ganti.
                    </div>
                    <input
                      type="password" inputMode="numeric" maxLength={6}
                      autoFocus
                      value={unlockPin}
                      onChange={(e) => { setUnlockPin(e.target.value.replace(/\D/g, "")); setUnlockErr(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter" && unlockPin.length === 6) tryUnlock(); }}
                      placeholder="••••••"
                      style={{
                        width: "100%", padding: "12px 14px",
                        background: "#0f1218", border: "1px solid rgba(56,189,248,0.35)",
                        borderRadius: 8, color: "#fff", fontSize: 22, textAlign: "center",
                        fontFamily: "'Geist Mono',monospace", letterSpacing: 8,
                        outline: "none", boxSizing: "border-box",
                      }}
                    />
                    {unlockErr && (
                      <div style={{ fontSize: 11, color: "#f87171", marginTop: 8, padding: "0 4px" }}>{unlockErr}</div>
                    )}
                    <button onClick={tryUnlock} disabled={unlockPin.length !== 6} style={{
                      marginTop: 10, width: "100%", padding: "10px 12px",
                      background: unlockPin.length === 6 ? "linear-gradient(135deg, #38BDF8, #0ea5e9)" : "rgba(255,255,255,0.06)",
                      color: unlockPin.length === 6 ? "#0a0a0f" : "#64748b",
                      border: "none", borderRadius: 8, fontSize: 13, fontWeight: 800,
                      cursor: unlockPin.length === 6 ? "pointer" : "not-allowed",
                      letterSpacing: 0.5,
                    }}>BUKA</button>
                  </div>
                ) : (
                  <>
                <div style={{ padding: "10px 12px 8px", fontSize: 11, color: "#38BDF8", fontWeight: 800, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 4 }}>
                  📍 Pilih Outlet ({allOutlets.length})
                </div>
                {allOutlets.length === 0 && (
                  <div style={{ padding: "16px 12px", color: "#9ca3af", fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>
                    Belum ada outlet terdaftar.<br/>
                    <span style={{ fontSize: 10, color: "#6b7280" }}>Tambah via Admin → Outlet Master.</span>
                  </div>
                )}
                {allOutlets.map(o => (
                  <button key={o.code} onClick={() => pickOutlet(o.code)} style={{
                    display: "flex", width: "100%", textAlign: "left",
                    padding: "10px 12px", marginTop: 2,
                    background: outletInfo.code === o.code ? "rgba(56,189,248,0.20)" : "transparent",
                    border: "none", color: "#fff", fontSize: 13,
                    borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                    justifyContent: "space-between", alignItems: "center", gap: 8,
                  }}
                    onMouseEnter={(e) => { if (outletInfo.code !== o.code) e.currentTarget.style.background = "rgba(56,189,248,0.10)"; }}
                    onMouseLeave={(e) => { if (outletInfo.code !== o.code) e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'Geist Mono',monospace", marginTop: 3 }}>{o.code}{o.area ? ` · ${o.area}` : ""}</div>
                    </div>
                    {outletInfo.code === o.code && <span style={{ color: "#38BDF8", fontSize: 16 }}>✓</span>}
                  </button>
                ))}
                  </>
                )}
              </div>
              </>,
              document.body
            )}
          </div>

          {/* Manager PIN unlock modal — for device-locked outlet reset */}
          {showUnlockModal && (
            <div onClick={() => setShowUnlockModal(false)} style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99999, padding: 20,
            }}>
              <div onClick={e => e.stopPropagation()} style={{
                width: "min(420px, 100%)", background: "rgba(13,17,23,0.97)",
                border: "1px solid rgba(239,68,68,0.4)", borderRadius: 16, padding: 28,
                fontFamily: "'Inter',sans-serif",
              }}>
                <div style={{ textAlign: "center", marginBottom: 18 }}>
                  <div style={{ fontSize: 56, marginBottom: 10 }}>🔒</div>
                  <div style={{ fontSize: 11, color: "#f87171", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 6 }}>● DEVICE LOCKED</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginBottom: 6 }}>Manager PIN Required</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
                    Outlet device terkunci. Hanya Manager/Admin yang boleh reset outlet device ini.
                  </div>
                </div>
                <input
                  type="password" inputMode="numeric" maxLength={6}
                  value={unlockPin}
                  onChange={e => setUnlockPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && tryUnlock()}
                  placeholder="• • • • • •"
                  autoFocus
                  style={{
                    width: "100%", padding: "14px 18px", marginBottom: 12,
                    background: "rgba(0,0,0,0.5)", border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 10, color: "#fff", fontSize: 22, textAlign: "center",
                    letterSpacing: 14, fontFamily: "'Geist Mono',monospace", fontWeight: 800,
                    boxSizing: "border-box", outline: "none",
                  }} />
                {unlockErr && <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, fontSize: 12, color: "#fca5a5", marginBottom: 12 }}>⚠ {unlockErr}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setShowUnlockModal(false); setUnlockPin(""); setUnlockErr(""); }} style={{
                    flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}>Batal</button>
                  <button onClick={tryUnlock} disabled={unlockPin.length !== 6} style={{
                    flex: 2, padding: 12,
                    background: unlockPin.length === 6 ? "linear-gradient(135deg,#dc2626,#ef4444)" : "rgba(255,255,255,0.08)",
                    border: "none", borderRadius: 10,
                    color: unlockPin.length === 6 ? "#fff" : "#64748b",
                    fontSize: 13, fontWeight: 900, cursor: unlockPin.length === 6 ? "pointer" : "not-allowed", fontFamily: "inherit",
                  }}>🔓 Unlock</button>
                </div>
                <div style={{ marginTop: 14, fontSize: 10, color: "#475569", textAlign: "center", lineHeight: 1.5 }}>
                  Picker auto-lock kembali setelah 60 detik.
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={S.user}>
          <span style={S.userIcon}>👤</span>
          <span style={S.userName}>{cashier.name}</span>
          <span style={{...S.userRole, background: roleColors[role] || roleColors.kasir}}>
            {(cashier.role || "kasir").toUpperCase()}
          </span>
          {onCloseShift && (
            <button onClick={onCloseShift}
              title="Tutup shift kasir — hitung kas laci, print summary shift, kasir lain bisa mulai shift baru"
              style={{...S.logout, background: '#f9731622', border: '1px solid #f9731655', color: '#f97316'}}>
              🔒 Tutup Shift
            </button>
          )}
          {role === "manager" && (
            <button onClick={handleCloseDay}
              title="Tutup hari operasional — outlet berhenti melayani sampai Manager Open Day esok pagi. Summary harian dicetak + email."
              style={{...S.logout, background: '#7c3aed22', border: '1px solid #7c3aed66', color: '#a78bfa'}}>
              🌙 Tutup Hari
            </button>
          )}
          <button onClick={onLogout} title="Logout dari sesi kasir saat ini" style={S.logout}>Keluar</button>
        </div>
      </header>

      <main style={S.main}>
        <style>{POSHOME_CSS}</style>

        {/* ✨ Ambient particles — soft floating sparkles bikin layar 'bernafas' */}
        <div style={S.ambientField} aria-hidden>
          {[...Array(14)].map((_, i) => (
            <span key={i} style={{
              position: "absolute",
              top: `${(i * 7.5) % 95}%`,
              left: `${(i * 13) % 95}%`,
              fontSize: 8 + (i % 4) * 3,
              opacity: 0.15 + (i % 3) * 0.08,
              filter: "drop-shadow(0 0 6px rgba(251,191,36,0.3))",
              animation: `phTwinkle ${4 + (i % 5)}s ease-in-out ${i * 0.3}s infinite, phFloat ${8 + (i % 4) * 2}s ease-in-out ${i * 0.2}s infinite`,
            }}>{["✦", "✧", "·", "*", "✨"][i % 5]}</span>
          ))}
        </div>

        {/* 🌅 Time-aware decoration top-right — sun rays / moon stars sesuai jam */}
        {(() => {
          const h = new Date().getHours();
          const deco = h >= 5 && h < 11 ? { emoji: "☀️", color: "rgba(251,191,36,0.18)" }
                     : h >= 11 && h < 15 ? { emoji: "🌤️", color: "rgba(252,165,165,0.18)" }
                     : h >= 15 && h < 18 ? { emoji: "🌅", color: "rgba(251,146,60,0.18)" }
                     : { emoji: "🌙", color: "rgba(199,210,254,0.18)" };
          return (
            <div style={{
              position: "absolute", top: 80, right: 30,
              fontSize: 120, opacity: 0.5,
              filter: `drop-shadow(0 0 60px ${deco.color})`,
              pointerEvents: "none", zIndex: 0,
              animation: "phPulseDeco 6s ease-in-out infinite",
            }}>{deco.emoji}</div>
          );
        })()}
        {/* ════════ HOMECOMING HERO — "selamat datang kembali ke rumah" ════════
            Filosofi: kasir buka POS = pulang ke rumah. Hangat, glowy, time-aware.
            Bukan generic "welcome" dingin — sambutan tuan rumah yg merindukan. */}
        <div style={S.welcome}>
          {(() => {
            const h = new Date().getHours();
            const greet = h >= 5 && h < 11 ? { text: "Selamat Pagi", emoji: "☀️", glow: "rgba(251,191,36,0.30)" }
                       : h >= 11 && h < 15 ? { text: "Selamat Siang", emoji: "🌤️", glow: "rgba(252,165,165,0.30)" }
                       : h >= 15 && h < 18 ? { text: "Selamat Sore", emoji: "🌅", glow: "rgba(251,146,60,0.30)" }
                       : { text: "Selamat Malam", emoji: "✨", glow: "rgba(199,210,254,0.30)" };
            const homeMsg = h >= 5 && h < 11 ? "Senang Anda mulai hari di sini."
                          : h >= 11 && h < 15 ? "Tetap semangat, jam sibuk segera datang."
                          : h >= 15 && h < 18 ? "Sore yang baik — pelan-pelan ya."
                          : "Senang Anda kembali. Shift malam yg tenang.";
            const hint = h >= 5 && h < 11 ? "Sebentar lagi tamu pertama datang. Siapkan senyum 🌱"
                       : h >= 11 && h < 15 ? "Kalau capek, tarik napas — jam sibuk siang sebentar lagi."
                       : h >= 15 && h < 18 ? "Mau ngopi dulu? Counter masih bisa nunggu sebentar."
                       : "Saat tenang juga kerja keras. Tetap fokus, hampir selesai shift.";
            return (
              <div style={{
                padding: "32px 24px", borderRadius: 24,
                background: `radial-gradient(ellipse 80% 100% at 50% 0%, ${greet.glow}, transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)`,
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 32px ${greet.glow}`,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              }}>
                <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 4, filter: `drop-shadow(0 0 24px ${greet.glow})` }}>
                  {greet.emoji}
                </div>
                <div style={{ fontSize: 12, color: "#fbbf24", letterSpacing: 3, fontWeight: 700, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", marginBottom: 2 }}>
                  ✦ {greet.text}
                </div>
                <h2 style={{
                  fontSize: 32, fontWeight: 800, color: "#fff", margin: 0,
                  letterSpacing: -1, lineHeight: 1.15,
                  textShadow: `0 2px 16px ${greet.glow}`,
                }}>
                  {cashier.name}
                </h2>
                <p style={{
                  fontSize: 14, color: "rgba(255,255,255,0.75)", margin: "6px 0 0",
                  fontStyle: "italic", letterSpacing: 0.1, lineHeight: 1.5,
                }}>
                  {homeMsg}
                </p>
                <div style={{
                  marginTop: 12, padding: "8px 14px", borderRadius: 999,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: 12, color: "rgba(255,255,255,0.65)",
                  fontStyle: "italic", letterSpacing: 0.2, maxWidth: 420, textAlign: "center",
                }}>
                  "{hint}"
                </div>
              </div>
            );
          })()}
        </div>

        {/* MAIN ACTION GRID — F&B default, plus Cinema button kalau outlet hybrid */}
        <div style={S.actionGrid}>
          <button className="ph-card" style={S.bigBtn} onClick={onNewOrder}
            title="Mulai pesanan baru — pilih menu, addons, payment">
            <div style={S.bigBtnIcon}>🛒</div>
            <div style={S.bigBtnTitle}>Pesanan Baru</div>
            <div style={S.btnHint}>Mulai pesan untuk customer</div>
          </button>

          {onQuickOrder && (
            <button className="ph-card" style={S.bigBtn} onClick={onQuickOrder}
              title="Mode cepat — skip menu picker, langsung pakai master menu">
              <div style={S.bigBtnIcon}>⚡</div>
              <div style={S.bigBtnTitle}>Pesan Cepat</div>
              <div style={S.btnHint}>Skip menu picker, langsung master menu</div>
            </button>
          )}

          {/* HYBRID outlet only: F&B + Cinema concession boleh jual ticket */}
          {isHybrid && (
            <button className="ph-card" style={{ ...S.bigBtn, ...S.bigBtnPurple }} onClick={() => {
              const outlet = new URLSearchParams(window.location.search).get("outlet") || "";
              window.location.href = `?pos-cinema${outlet ? `&outlet=${outlet}` : ""}`;
            }}>
              <div style={S.bigBtnIcon}>🎬</div>
              <div style={{ ...S.bigBtnTitle, color: "#c084fc" }}>Sell cinema tickets</div>
              <div style={S.btnHint}>Pick show → seat → pay</div>
            </button>
          )}
        </div>

        <div className="ph-card" onClick={() => setShowHistory(true)} style={S.historyCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 26, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))" }}>📋</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.3px" }}>Order history</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2, letterSpacing: "-0.1px" }}>Cancel, refund, or search past orders</div>
            </div>
          </div>
          <div style={{ fontSize: 18, color: "rgba(255,255,255,0.35)" }}>›</div>
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
          <h3 style={S.sectionTitle}>✦ Cerita Hari Ini</h3>
          <div style={S.statsGrid}>
            <div style={S.statCard}>
              {/* Soft glow corner accent */}
              <div style={{ position: "absolute", top: -30, right: -30, width: 80, height: 80, background: "radial-gradient(circle, rgba(34,211,238,0.20), transparent 70%)", filter: "blur(20px)" }} />
              <div style={{ fontSize: 22, marginBottom: 6, position: "relative", zIndex: 1 }}>🛒</div>
              <div style={{ ...S.statValue, color: "#22d3ee", textShadow: "0 0 28px rgba(34,211,238,0.45)" }}>{todayCount || "—"}</div>
              <div style={S.statLabel}>Pesanan Hari Ini</div>
            </div>
            <div style={S.statCard}>
              <div style={{ position: "absolute", top: -30, right: -30, width: 80, height: 80, background: "radial-gradient(circle, rgba(251,191,36,0.22), transparent 70%)", filter: "blur(20px)" }} />
              <div style={{ fontSize: 22, marginBottom: 6, position: "relative", zIndex: 1 }}>💰</div>
              <div style={S.statValue}>{todayRevenue > 0 ? `Rp ${fmt(todayRevenue)}` : "—"}</div>
              <div style={S.statLabel}>Omzet Hari Ini</div>
            </div>
          </div>
        </section>
      </main>

      {/* Day closing ritual — ceremonial farewell sebelum logout */}
      {closingRitual && (
        <Suspense fallback={null}>
          <DayClosingRitual
            closedBy={cashier?.name || "Manager"}
            summary={closingRitual}
            onDone={() => { setClosingRitual(null); onLogout(); }}
          />
        </Suspense>
      )}
    </div>
  );
}

const roleColors = {
  admin: "#EF4444", manager: "#A855F7",
  kasir: "#3B82F6", staff: "#10B981"
};

// v3 design language — matches POSKasirLogin (dark #0a0a0a + orange #f97316, system-ui)
const POSHOME_CSS = `
  @keyframes phFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes phTwinkle{0%,100%{opacity:0.15;transform:scale(1)}50%{opacity:0.65;transform:scale(1.3)}}
  @keyframes phFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  @keyframes phPulseDeco{0%,100%{opacity:0.45;transform:scale(1)}50%{opacity:0.6;transform:scale(1.05)}}
  @keyframes phShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  @keyframes outletPulse{0%,100%{box-shadow:0 4px 18px rgba(245,158,11,0.35), 0 0 0 2px rgba(245,158,11,0.15)}50%{box-shadow:0 4px 22px rgba(245,158,11,0.55), 0 0 0 4px rgba(245,158,11,0.30)}}
  .ph-card{animation:phFadeIn .4s cubic-bezier(.2,.8,.2,1) both}
  .ph-card:hover{transform:translateY(-3px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.26), inset 0 -1px 0 rgba(0,0,0,0.18), 0 14px 36px rgba(0,0,0,0.36), 0 32px 80px color-mix(in srgb, var(--brand-primary,#FF6B35) 30%, transparent)!important}
  .ph-card:active{transform:translateY(-1px) scale(.99)}
  .ph-stat-pulse{animation:phPulseDeco 3s ease-in-out infinite}
`;

const S = {
  // MacBook-premium dark theme — match POSMenuPicker, POSPayment, POS Cinema
  root: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)",
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
  userIcon: { fontSize: 22, filter: "drop-shadow(0 0 8px color-mix(in srgb, var(--brand-primary,#FF6B35) 30%, transparent))" },
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
  main: { maxWidth: 960, margin: "0 auto", padding: "32px 26px", position: "relative", overflow: "visible" },
  // Ambient sparkles overlay — gak block interaksi (pointer-events: none)
  ambientField: { position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 },
  welcome: { textAlign: "center", marginBottom: 28, position: "relative", zIndex: 1 },
  welcomeTitle: {
    fontSize: 28, margin: "0 0 6px", fontWeight: 600, letterSpacing: "-0.8px", color: "rgba(255,255,255,0.95)",
  },
  welcomeSub: {
    color: "rgba(255,255,255,0.5)", margin: 0, fontSize: 13,
    letterSpacing: "-0.1px", fontWeight: 400,
  },
  actionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
    gap: 14, marginBottom: 18,
    position: "relative", zIndex: 1,
  },
  // CTA card — tinted glass (brand 38% + dark) so white text always visible
  bigBtn: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent) 0%, transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29) 0%, color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14) 100%)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    color: "#fff",
    textShadow: "0 1px 3px rgba(0,0,0,0.45)",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 20, padding: "26px 18px", minHeight: 150,
    fontFamily: "'Inter',sans-serif", fontWeight: 600, letterSpacing: "-0.3px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.18), 0 10px 28px rgba(0,0,0,0.32), 0 24px 60px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)",
    transition: "transform 0.3s cubic-bezier(.2,.8,.2,1), box-shadow 0.3s ease",
    textAlign: "center",
  },
  bigBtnIcon: { fontSize: 38, lineHeight: 1, marginBottom: 4, filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))" },
  bigBtnTitle: { fontSize: 18, fontWeight: 600, letterSpacing: "-0.4px", color: "rgba(255,255,255,0.95)" },
  // Cinema variant — purple-tinted glass instead of brand
  bigBtnPurple: {
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, rgba(168,85,247,0.55) 0%, transparent 55%), linear-gradient(180deg, rgba(54,28,80,0.85), rgba(20,12,30,0.92))",
    border: "1px solid rgba(168,85,247,0.32)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16), 0 10px 28px rgba(0,0,0,0.32), 0 24px 60px rgba(168,85,247,0.18)",
  },
  btnHint: {
    fontSize: 12, fontWeight: 400, color: "rgba(255,255,255,0.65)",
    letterSpacing: "-0.1px", marginTop: 2,
  },
  // History entry card — glass treatment
  historyCard: {
    marginBottom: 12,
    padding: "16px 20px",
    borderRadius: 16,
    background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.07)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 6px 18px rgba(0,0,0,0.22)",
    transition: "transform 0.25s cubic-bezier(.2,.8,.2,1), box-shadow 0.25s ease",
  },
  section: { marginTop: 32, position: "relative", zIndex: 1 },
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
    boxShadow: "0 2px 8px color-mix(in srgb, var(--brand-primary,#FF6B35) 35%, transparent)",
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
    background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 10%, transparent)",
    border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 30%, transparent)",
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
    position: "relative", overflow: "hidden",
    background: "linear-gradient(180deg, rgba(251,191,36,0.05) 0%, rgba(13,15,20,0.95) 60%)",
    border: "1px solid rgba(251,191,36,0.18)",
    borderRadius: 16, padding: "22px 18px", textAlign: "center",
    boxShadow: "0 1px 2px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.25), 0 0 32px rgba(251,191,36,0.06), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  statValue: {
    fontSize: 34, fontWeight: 900, color: "#fbbf24",
    letterSpacing: -0.8, lineHeight: 1,
    fontFamily: "'Geist Mono',monospace",
    textShadow: "0 0 32px rgba(251,191,36,0.45), 0 2px 12px rgba(0,0,0,0.4)",
    position: "relative", zIndex: 1,
  },
  statLabel: {
    fontSize: 10, color: "rgba(255,255,255,0.55)",
    letterSpacing: 1.6, fontWeight: 800, marginTop: 10,
    fontFamily: "'Geist Mono',monospace", textTransform: "uppercase",
    position: "relative", zIndex: 1,
  },
};
