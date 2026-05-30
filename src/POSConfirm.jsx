import { useState, useEffect, useRef } from "react";
import POSSplitPayment from "./POSSplitPayment.jsx";
import { calcServiceCharge, loadServiceChargeConfig } from "./pricing.js";
import { printOrderBothViaLocalBridge } from "./lib/localPrint.js";
import API_HOST from "./apiBase.js";

const API_BASE = API_HOST;
const fmt = (n) => (n || 0).toLocaleString("id-ID");

// Konversi poin — TODO: fetch dari /api/config/public atau settings table
// POINT_VALUE — fetched from /api/config/public (configurable via admin)
let _cachedPointValue = 100;
fetch(API_HOST + "/api/config/public")
  .then(r => r.json())
  .then(c => { if (c.POINT_VALUE) _cachedPointValue = c.POINT_VALUE; })
  .catch(() => {});
const getPointValue = () => _cachedPointValue;

// Broadcast helper ke CDS (anti-fraud transparency)
const cdsCast = (event, data) => {
  fetch(`${API_BASE}/api/pos/broadcast`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ event, data })
  }).catch(() => {});
};

// Smart label generator dari promo object (sama kayak SlidePromo di POSCDS)
function promoLabel(p) {
  if (!p) return "";
  if (p.type === "percent") return `${p.value}% off`;
  if (p.type === "fixed")   return `-Rp ${fmt(p.value)}`;
  if (p.type === "bogo")    return `Buy Get Free`;
  return p.name || p.code || "Promo";
}

export default function POSConfirm({ order, cashier, onBack, onCancel, onSuccess }) {
  const cart = order.cart || [];
  const subtotal = order.subtotal || 0;
  const isOpenTab = order.action === "openTab";
  const isResuming = !!order.resumeTabId;
  const customerPoints = order.customerPoints || 0;

  // ─── Payment state ───
  const [payMethod, setPayMethod] = useState("CASH");
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrisFlow, setQrisFlow] = useState(false);

  // ─── Promo state ───
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState(null);
  const [availablePromos, setAvailablePromos] = useState([]);

  // ─── Points state ───
  const [pointsOn, setPointsOn] = useState(false);
  const [pointsUsed, setPointsUsed] = useState(0);

  // ─── Cash state (Step 4A — kembalian transparency) ───
  const [cashReceived, setCashReceived] = useState(0);

  // ─── Service charge config (5% dine-in default) ───
  const [serviceConfig, setServiceConfig] = useState({ pct: 5, enabled: true, label: "Service Charge" });
  useEffect(() => { loadServiceChargeConfig().then(setServiceConfig); }, []);

  // ─── Computed totals ───
  const promoDiscount = appliedPromo?.discount || 0;
  const pointsValue = pointsOn ? pointsUsed * getPointValue() : 0;
  const afterDeductions = Math.max(0, subtotal - promoDiscount - pointsValue);
  // Service charge — auto 5% dine-in (config dari /api/pos/config)
  const orderType = order.type === "dine-in" || order.type === "dine" || order.type === "dinein" ? "dine" : order.type;
  const serviceCharge = calcServiceCharge(afterDeductions, orderType, serviceConfig);
  const finalTotal = afterDeductions + serviceCharge;
  const cashChange = Math.max(0, cashReceived - finalTotal);
  const cashSufficient = payMethod === "CASH" ? cashReceived >= finalTotal : true;
  const maxPointsCanUse = Math.min(
    customerPoints,
    Math.floor(Math.max(0, subtotal - promoDiscount) / getPointValue())
  );
  const hasDeduction = promoDiscount > 0 || pointsValue > 0;

  // ─── Pre-fetch active promos (untuk validate code client-side) ───
  useEffect(() => {
    if (isOpenTab || isResuming) return;
    fetch(`${API_BASE}/api/promos`)
      .then(r => r.ok ? r.json() : [])
      .then(list => setAvailablePromos(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [isOpenTab, isResuming]);

  // ─── Broadcast payment method ke CDS (existing pattern) ───
  useEffect(() => {
    if (!isOpenTab) cdsCast("pos:payment_method", { method: payMethod });
  }, [payMethod, isOpenTab]);

  // ─── Broadcast transaction breakdown live (NEW) ───
  // CDS handler bisa pakai state ini buat render line items, promo, poin, total
  useEffect(() => {
    if (isOpenTab) return;
    cdsCast("pos:transaction_breakdown", {
      subtotal,
      promo: appliedPromo ? {
        code: appliedPromo.code,
        label: appliedPromo.label,
        discount: appliedPromo.discount
      } : null,
      pointsUsed,
      pointsValue,
      pointsRemaining: customerPoints - pointsUsed,
      finalTotal,
      customer: order.customerName ? {
        name: order.customerName,
        phone: order.customerPhone,
        pointsBefore: customerPoints
      } : null
    });
  }, [subtotal, appliedPromo, pointsUsed, pointsOn, finalTotal, customerPoints, order.customerName, order.customerPhone, isOpenTab]);

  // ─── Cleanup CDS state on unmount ───
  useEffect(() => {
    return () => {
      cdsCast("pos:payment_method", { method: null });
      cdsCast("pos:promo_removed", {});
      cdsCast("pos:points_redeemed", { pointsUsed: 0, pointsValue: 0 });
      cdsCast("pos:cash_received", { received: 0, change: 0 });
    };
  }, []);

  // ─── Broadcast cash received live (Step 4A) ───
  useEffect(() => {
    if (isOpenTab || payMethod !== "CASH") return;
    cdsCast("pos:cash_received", {
      received: cashReceived,
      change: cashChange,
      sufficient: cashSufficient
    });
  }, [cashReceived, finalTotal, payMethod, isOpenTab]);

  // Clear cash state saat ganti method (Step 4A)
  useEffect(() => {
    if (payMethod !== "CASH" && cashReceived > 0) {
      setCashReceived(0);
      cdsCast("pos:cash_received", { received: 0, change: 0 });
    }
  }, [payMethod]);

  // ═══════════════════════════════════════════════════════════
  // PROMO HANDLERS
  // ═══════════════════════════════════════════════════════════
  const applyPromoCode = async (codeInput) => {
    const code = (codeInput || "").trim().toUpperCase();
    if (!code) { setPromoError("Enter a promo code first"); return; }
    setPromoLoading(true);
    setPromoError(null);

    try {
      // Use cached or re-fetch
      let promos = availablePromos;
      if (promos.length === 0) {
        const r = await fetch(`${API_BASE}/api/promos`);
        if (r.ok) {
          promos = await r.json();
          if (!Array.isArray(promos)) promos = [];
          setAvailablePromos(promos);
        }
      }

      const match = promos.find(p =>
        (p.active !== false) &&
        (p.code?.toUpperCase() === code)
      );

      if (!match) { setPromoError("Kode promo tidak valid"); return; }

      // Validation: expired
      if (match.validUntil) {
        const until = typeof match.validUntil === "string"
          ? new Date(match.validUntil).getTime()
          : match.validUntil;
        if (until < Date.now()) { setPromoError("Kode promo sudah expired"); return; }
      }

      // Validation: min order
      if (match.minOrder > 0 && subtotal < match.minOrder) {
        setPromoError(`Min. order Rp ${fmt(match.minOrder)} untuk promo ini`);
        return;
      }

      // Validation: member-only
      if (match.forMember && !order.customerId) {
        setPromoError("Member-only promo. Re-check customer phone in the previous step.");
        return;
      }

      // Calculate discount
      let discount = 0;
      if (match.type === "percent") {
        discount = Math.round(subtotal * (match.value || 0) / 100);
        // Cap at maxDiscount if set
        if (match.maxDiscount > 0) discount = Math.min(discount, match.maxDiscount);
      } else if (match.type === "fixed") {
        discount = Math.min(match.value || 0, subtotal); // Can't exceed subtotal
      } else if (match.type === "bogo") {
        // Simplified — backend handles real BOGO calc. For now use value as approx.
        discount = match.value || 0;
      }

      const applied = {
        code: match.code,
        label: promoLabel(match),
        type: match.type,
        value: match.value,
        discount
      };
      setAppliedPromo(applied);
      cdsCast("pos:promo_applied", applied);

      // Recalc points if exceeded new max
      if (pointsOn && pointsUsed > 0) {
        const newMax = Math.min(customerPoints, Math.floor((subtotal - discount) / getPointValue()));
        if (pointsUsed > newMax) {
          setPointsUsed(newMax);
          cdsCast("pos:points_redeemed", {
            pointsUsed: newMax,
            pointsValue: newMax * getPointValue(),
            newBalance: customerPoints - newMax
          });
        }
      }

    } catch (e) {
      setPromoError("Failed to check promo: " + e.message);
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromo = () => {
    setAppliedPromo(null);
    setPromoError(null);
    setPromoCode("");
    cdsCast("pos:promo_removed", {});
  };

  // ═══════════════════════════════════════════════════════════
  // POINTS HANDLERS
  // ═══════════════════════════════════════════════════════════
  const togglePoints = () => {
    if (pointsOn) {
      setPointsOn(false);
      setPointsUsed(0);
      cdsCast("pos:points_redeemed", { pointsUsed: 0, pointsValue: 0, newBalance: customerPoints });
    } else {
      setPointsOn(true);
    }
  };

  const setPointsAmount = (val) => {
    const v = parseInt(val) || 0;
    const capped = Math.max(0, Math.min(v, maxPointsCanUse));
    setPointsUsed(capped);
    cdsCast("pos:points_redeemed", {
      pointsUsed: capped,
      pointsValue: capped * getPointValue(),
      newBalance: customerPoints - capped
    });
  };

  // ═══════════════════════════════════════════════════════════
  // SUBMIT ORDER (preserved + enhanced with new fields)
  // ═══════════════════════════════════════════════════════════
  const submitOrder = async (payOverride, midtransOrderId) => {
    setBusy(true);
    const action = order.action || "pay";
    const status = action === "openTab" ? "tab_open" : "waiting";

    // RESUME MODE: PATCH existing tab
    if (isResuming) {
      try {
        const r = await fetch(`${API_BASE}/api/orders/${order.resumeTabId}/items`, {
          method: "PATCH",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            items: cart.map(ci => ({
              e: ci.emoji || "", n: ci.name, q: ci.qty, p: ci.price,
              addonTotal: ci.addonTotal || 0, addons: ci.addons || {}
            })),
            subtotal,
            tax: Math.round(subtotal * 0.1 / 1.1),
            total: subtotal
          })
        });
        if (!r.ok) throw new Error("PATCH error " + r.status);
        await r.json();
        onCancel();
        return;
      } catch (e) {
        alert("Failed to update tab: " + e.message);
        setBusy(false);
        return;
      }
    }

    // NORMAL MODE: POST new order
    try {
      const r = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          type: order.type === "dine-in" ? "dine" : "takeaway",
          table: order.table?.id || null,
          items: cart.map(ci => ({
            e: ci.emoji || "", n: ci.name, q: ci.qty, p: ci.price,
            addonTotal: ci.addonTotal || 0, addons: ci.addons || {}
          })),
          pay: payOverride || payMethod,
          subtotal,
          // ── NEW: discount fields ──
          promoCode: appliedPromo?.code || null,
          promoType: appliedPromo?.type || null,
          promoDiscount,
          pointsUsed,
          pointsValue,
          // ── /NEW ──
          total: finalTotal,
          cashReceived: payMethod === "CASH" ? cashReceived : null,
          cashChange: payMethod === "CASH" ? cashChange : null,
          customerName: order.customerName || null,
          customerId: order.customerId || null,
          customerPhone: order.customerPhone || null,
          status,
          kasir: cashier?.name || null,
          source: "pos",
          // Outlet tag — backend validates kasir.outlet_code match (anti-fraud)
          outlet_code: (typeof localStorage !== "undefined") ? (localStorage.getItem("posOutletDevice") || localStorage.getItem("posOutlet") || null) : null,
          midtransId: midtransOrderId || null
        })
      });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        throw new Error(errData.error || "Server error " + r.status);
      }
      const saved = await r.json();

      // Mark table occupied for dine-in
      if (order.type === "dine-in" && order.table?.id) {
        fetch(`${API_BASE}/api/tables/${order.table.id}`, {
          method: "PATCH",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({status: "occupied"})
        }).catch(() => {});
      }

      // Open tab: no payment broadcast
      if (isOpenTab) { onCancel(); return; }

      // Broadcast complete order ke CDS
      cdsCast("pos:order_complete", { order: saved });

      // Auto-print via local bridge (fire-and-forget, gak boleh hambat UX kalau bridge offline)
      if (saved?.id) {
        printOrderBothViaLocalBridge(saved.id).catch(() => {});
      }

      onSuccess(saved);
    } catch (e) {
      alert("Failed to save order: " + e.message);
      setBusy(false);
    }
  };

  const handleConfirm = () => {
    if (isOpenTab) { submitOrder("UNPAID"); return; }
    if (finalTotal === 0) {
      // Fully paid with poin — skip method, mark as POINTS
      submitOrder("POINTS");
      return;
    }
    if (payMethod === "CASH" && !cashSufficient) {
      alert(`Cash received is not enough. Short Rp ${fmt(finalTotal - cashReceived)}`);
      return;
    }
    if (payMethod === "QRIS") { setQrisFlow(true); }
    else { submitOrder("CASH"); }
  };

  // ═══════════════════════════════════════════════════════════
  // QRIS FLOW (delegated to sub-component, preserved)
  // ═══════════════════════════════════════════════════════════
  if (qrisFlow) {
    return <POSQRISFlow
      cart={cart}
      subtotal={finalTotal} // Use final total (after promo + poin)
      order={order}
      onCancel={() => setQrisFlow(false)}
      onPaid={(midtransOrderId) => submitOrder("QRIS", midtransOrderId)}
    />;
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={S.root}>
      <style>{CONFIRM_CSS}</style>
      <header style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>← Back</button>
        <h1 style={S.headTitle}>Review &amp; Pay</h1>
        <button onClick={onCancel} style={S.iconBtn}>✕</button>
      </header>

      <main style={S.main}>
        {isOpenTab && (
          <div className="lg" style={S.tabBanner}>
            <span style={{ fontSize: 22 }}>📋</span>
            <div>
              <div style={S.tabBannerTitle}>{isResuming ? `Adding to Tab #${order.resumeTabId}` : "Open tab mode"}</div>
              <div style={S.tabBannerHint}>{isResuming ? "Old + new items updated. Pay later when customer settles." : "Tab saved without payment. Pay later."}</div>
            </div>
          </div>
        )}

        {/* Order meta */}
        <div className="lg" style={S.metaCard}>
          <div style={S.metaRow}>
            <span style={S.metaLabel}>Type</span>
            <span style={S.metaValue}>
              {order.type === "dine-in" ? "🍽️ Dine-in" : "🛍️ Takeaway"}
              {order.table && ` · ${order.table.name}`}
            </span>
          </div>
          {order.customerName && (
            <div style={S.metaRow}>
              <span style={S.metaLabel}>Customer</span>
              <span style={S.metaValue}>
                {order.customerId ? "📱" : "👤"} {order.customerName}
                {customerPoints > 0 && (
                  <span style={S.customerPoints}> · {fmt(customerPoints)} pts</span>
                )}
              </span>
            </div>
          )}
          <div style={S.metaRow}>
            <span style={S.metaLabel}>Cashier</span>
            <span style={S.metaValue}>👤 {cashier?.name}</span>
          </div>
        </div>

        {/* Items */}
        <div className="lg" style={S.itemsCard}>
          <div style={S.itemsHeader}>Order · {cart.length} item{cart.length === 1 ? "" : "s"}</div>
          {cart.map((ci, idx) => {
            const toppings = ci.addons?.toppings || [];
            const lineTotal = ((ci.price || 0) + (ci.addonTotal || 0)) * ci.qty;
            return (
              <div key={ci.cartKey || ci.id || idx} style={S.cartRow}>
                <div style={S.cartLeft}>
                  <span style={S.cartEmoji}>{ci.emoji || "🍴"}</span>
                  <div>
                    <div style={S.cartName}>{ci.name}</div>
                    <div style={S.cartSubprice}>Rp {fmt(ci.price)} × {ci.qty}</div>
                    {toppings.length > 0 && (
                      <div style={S.cartToppings}>
                        {toppings.map((t, i) => (
                          <div key={i}>+ {t.name}{t.price > 0 && ` (Rp ${fmt(t.price)})`}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div style={S.cartLineTotal}>Rp {fmt(lineTotal)}</div>
              </div>
            );
          })}
        </div>

        {/* Subtotal */}
        <div className={hasDeduction ? "" : "lg"} style={hasDeduction ? S.subtotalCardPlain : S.subtotalCard}>
          <div>
            <div style={S.subLabel}>Subtotal</div>
            <div style={S.taxNote}>VAT 10% included</div>
          </div>
          <div style={hasDeduction ? S.subAmountPlain : S.subAmount}>Rp {fmt(subtotal)}</div>
        </div>

        {/* ═══════ Promo & Points sections (hidden for open tab) ═══════ */}
        {!isOpenTab && (
          <>
            {/* Promo input */}
            <div className="lg" style={S.payCard}>
              <div style={S.payTitle}>Promo · Voucher</div>
              {appliedPromo ? (
                <div style={S.promoApplied}>
                  <div style={{ flex: 1 }}>
                    <div style={S.promoCodeLabel}>✓ {appliedPromo.code}</div>
                    <div style={S.promoSub}>{appliedPromo.label} · saves Rp {fmt(promoDiscount)}</div>
                  </div>
                  <button onClick={removePromo} style={S.promoRemove}>✕</button>
                </div>
              ) : (
                <>
                  <div style={S.promoInputRow}>
                    <input
                      type="text"
                      value={promoCode}
                      onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); }}
                      onKeyDown={e => e.key === "Enter" && applyPromoCode(promoCode)}
                      placeholder="Enter code..."
                      style={S.promoInput}
                      disabled={promoLoading}
                    />
                    <button
                      onClick={() => applyPromoCode(promoCode)}
                      disabled={promoLoading || !promoCode.trim()}
                      style={promoCode.trim() && !promoLoading ? S.promoApply : S.promoApplyDisabled}
                    >
                      {promoLoading ? "..." : "Apply"}
                    </button>
                  </div>
                  {promoError && <div style={S.promoErr}>⚠ {promoError}</div>}
                </>
              )}
            </div>

            {/* Points redemption — only if customer has points */}
            {customerPoints > 0 && (
              <div className="lg" style={S.payCard}>
                <div style={S.pointsHeader}>
                  <div>
                    <div style={S.payTitle}>Pay with points</div>
                    <div style={S.pointsHint}>{fmt(customerPoints)} pts · 1 pt = Rp {getPointValue()}</div>
                  </div>
                  <ToggleSwitch on={pointsOn} onChange={togglePoints} />
                </div>

                {pointsOn && maxPointsCanUse > 0 && (
                  <div style={S.pointsControl}>
                    <input
                      type="range"
                      min={0}
                      max={maxPointsCanUse}
                      value={pointsUsed}
                      step={10}
                      onChange={e => setPointsAmount(e.target.value)}
                      style={S.pointsSlider}
                    />
                    <div style={S.pointsReadout}>
                      <span>Use <strong>{fmt(pointsUsed)}</strong> pts</span>
                      <span style={S.pointsValueRp}>−Rp {fmt(pointsUsed * getPointValue())}</span>
                    </div>
                    <div style={S.pointsQuick}>
                      <button onClick={() => setPointsAmount(Math.round(maxPointsCanUse * 0.25))} style={S.pointsQuickBtn}>25%</button>
                      <button onClick={() => setPointsAmount(Math.round(maxPointsCanUse * 0.5))} style={S.pointsQuickBtn}>50%</button>
                      <button onClick={() => setPointsAmount(maxPointsCanUse)} style={S.pointsQuickBtn}>Max ({fmt(maxPointsCanUse)})</button>
                    </div>
                  </div>
                )}

                {pointsOn && maxPointsCanUse === 0 && (
                  <div style={S.pointsEmpty}>
                    Total is Rp 0 (fully covered by promo). Turn off to use points on a future order.
                  </div>
                )}
              </div>
            )}

            {/* Final breakdown */}
            {(hasDeduction || serviceCharge > 0) && (
              <div className="lg" style={S.breakdownCard}>
                <div style={S.breakdownRow}>
                  <span style={S.breakdownLabel}>Subtotal</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>Rp {fmt(subtotal)}</span>
                </div>
                {promoDiscount > 0 && (
                  <div style={{ ...S.breakdownRow, color: "rgba(52,211,153,0.92)" }}>
                    <span>Promo {appliedPromo.code}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>−Rp {fmt(promoDiscount)}</span>
                  </div>
                )}
                {pointsValue > 0 && (
                  <div style={{ ...S.breakdownRow, color: "rgba(52,211,153,0.92)" }}>
                    <span>{fmt(pointsUsed)} pts redeemed</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>−Rp {fmt(pointsValue)}</span>
                  </div>
                )}
                {serviceCharge > 0 && (
                  <div style={{ ...S.breakdownRow, color: "rgba(251,191,36,0.88)" }}>
                    <span>{serviceConfig.label} · {serviceConfig.pct}%</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>+Rp {fmt(serviceCharge)}</span>
                  </div>
                )}
                <div style={S.breakdownDivider} />
                <div style={S.breakdownTotalRow}>
                  <span style={S.breakdownTotalLabel}>Total</span>
                  <span style={S.breakdownTotalAmount}>Rp {fmt(finalTotal)}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Payment method */}
        {!isOpenTab && finalTotal > 0 && (
          <div className="lg" style={S.payCard}>
            <div style={S.payTitle}>Payment Method</div>
            <div style={S.payOptions}>
              <button
                onClick={() => setPayMethod("CASH")}
                data-pos-pay
                style={{ ...S.payBtn, ...(payMethod === "CASH" ? S.payActive : {}) }}
              >
                <span style={S.payIcon}>💵</span>
                <span style={S.payName}>Cash</span>
                <span style={S.payHint}>Pay at the counter</span>
              </button>
              <button
                onClick={() => setPayMethod("QRIS")}
                data-pos-pay
                style={{ ...S.payBtn, ...(payMethod === "QRIS" ? S.payActive : {}) }}
              >
                <span style={S.payIcon}>📱</span>
                <span style={S.payName}>QRIS</span>
                <span style={S.payHint}>Scan QR on CDS</span>
              </button>
              <button
                onClick={() => setShowSplitModal(true)}
                data-pos-pay
                style={{ ...S.payBtn, background: "rgba(139,92,246,0.10)", border: "1.5px solid rgba(139,92,246,0.35)" }}
              >
                <span style={S.payIcon}>💸</span>
                <span style={S.payName}>Split</span>
                <span style={S.payHint}>2+ methods</span>
              </button>
            </div>
          </div>
        )}

        {/* Cash counter */}
        {!isOpenTab && finalTotal > 0 && payMethod === "CASH" && (
          <div className="lg" style={S.payCard}>
            <div style={S.payTitle}>Cash Received</div>
            <div style={S.cashDisplay}>
              <div style={S.cashReceivedAmount}>Rp {fmt(cashReceived)}</div>
              {cashReceived > 0 && (
                cashSufficient ? (
                  <div style={S.cashChangeRow}>
                    Change: <strong>Rp {fmt(cashChange)}</strong>
                  </div>
                ) : (
                  <div style={S.cashShortRow}>
                    Short: <strong>Rp {fmt(finalTotal - cashReceived)}</strong>
                  </div>
                )
              )}
            </div>
            <div style={S.cashQuickRow}>
              <button onClick={() => setCashReceived(c => c + 50000)} style={S.cashQuickBtn}>+50K</button>
              <button onClick={() => setCashReceived(c => c + 100000)} style={S.cashQuickBtn}>+100K</button>
              <button onClick={() => setCashReceived(finalTotal)} style={S.cashQuickBtnPas}>Pas (Rp {fmt(finalTotal)})</button>
              <button onClick={() => setCashReceived(0)} style={S.cashQuickBtnClear}>⌫ Clear</button>
            </div>
          </div>
        )}

        {/* Total = 0 banner (paid via poin only) */}
        {!isOpenTab && finalTotal === 0 && hasDeduction && (
          <div style={S.fullyPaidBanner}>
            <span style={{fontSize: 22}}>🎉</span>
            <div>
              <div style={{fontSize: 15, fontWeight: 700, color: "#10B981"}}>Pembayaran tertutup poin</div>
              <div style={{fontSize: 12, color: "#A7F3D0", marginTop: 2}}>Tinggal konfirmasi, gak perlu bayar tunai/QRIS</div>
            </div>
          </div>
        )}

        <button onClick={handleConfirm} disabled={busy} data-pos-confirm style={S.confirmBtn}>
          {busy ? "..." :
           isResuming ? "✓ Update Tab" :
           isOpenTab ? "📋 Buka Tab (belum dibayar)" :
           finalTotal === 0 ? "✓ Konfirmasi (Bayar Poin)" :
           payMethod === "QRIS" ? "📱 Tampilkan QR ke Customer" :
           payMethod === "CASH" && cashReceived === 0 ? "💵 Input uang diterima dulu" :
           payMethod === "CASH" && !cashSufficient ? `⚠ Short Rp ${fmt(finalTotal - cashReceived)}` :
           payMethod === "CASH" ? `✓ Konfirmasi (Change Rp ${fmt(cashChange)})` :
           "✓ Konfirmasi Bayar"}
        </button>

        {showSplitModal && (
          <POSSplitPayment
            order={{
              id: null,
              total: finalTotal, // ← use final total after promo+poin
              type: order.type,
              table: order.table?.id,
              customerName: order.customerName,
              cart: cart,
              subtotal: finalTotal,
              _newOrder: true,
              _orderData: {
                type: order.type === "dine-in" ? "dine" : "takeaway",
                table: order.table?.id || null,
                items: cart.map(ci => ({
                  e: ci.emoji || "", n: ci.name, q: ci.qty, p: ci.price,
                  addonTotal: ci.addonTotal || 0, addons: ci.addons || {}
                })),
                subtotal,
                // ── Pass through promo + poin info ──
                promoCode: appliedPromo?.code || null,
                discountAmount: promoDiscount,
                pointsUsed,
                pointsValue,
                total: finalTotal,
                customerName: order.customerName || null,
                customerId: order.customerId || null,
                customerPhone: order.customerPhone || null,
                kasir: cashier?.name || null,
                source: "pos",
              }
            }}
            kasir={cashier?.name || "Manager"}
            onClose={() => setShowSplitModal(false)}
            onSuccess={(result) => {
              setShowSplitModal(false);
              onSuccess(result.order || result);
            }}
          />
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Toggle Switch — small reusable component
// ═══════════════════════════════════════════════════════════
function ToggleSwitch({ on, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 50, height: 28, borderRadius: 999,
        background: on ? "#10B981" : "#2a2a2a",
        border: "none", position: "relative", cursor: "pointer",
        transition: "background 0.15s", flexShrink: 0
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 25 : 3,
        width: 22, height: 22, borderRadius: "50%",
        background: "#fff", transition: "left 0.15s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
      }}/>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// QRIS Flow Sub-component (preserved as-is)
// ═══════════════════════════════════════════════════════════
function POSQRISFlow({ cart, subtotal, order, onCancel, onPaid }) {
  const [status, setStatus] = useState("loading");
  const [qrData, setQrData] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const pollRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    initPayment();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const initPayment = async () => {
    setStatus("loading");
    setErrMsg("");
    try {
      const tempOrderId = "POS-" + Date.now();
      const r = await fetch(`${API_BASE}/api/payment/qris`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          orderId: tempOrderId,
          amount: subtotal,
          items: cart.map(c => ({
            id: c.id, n: c.name,
            p: (c.price || 0) + (c.addonTotal || 0),
            q: c.qty
          })),
          customerName: order.customerName || "POS Customer"
        })
      });

      if (!r.ok) {
        const text = await r.text();
        throw new Error(`Server ${r.status}: ${text.substring(0, 200)}`);
      }
      const data = await r.json();

      const qrUrl = data.qrCode || data.qr_code || data.actions?.find(a => a.name === "generate-qr-code")?.url || data.actions?.[0]?.url;
      const mtOrderId = data.midtransOrderId || data.order_id || tempOrderId;

      if (!qrUrl) throw new Error("No QR returned by server");

      setQrData({ qrCode: qrUrl, midtransOrderId: mtOrderId });
      setStatus("waiting");
      cdsCast("pos:payment_qris", { qrCode: qrUrl, amount: subtotal });
      startPolling(mtOrderId);
    } catch (e) {
      setStatus("error");
      setErrMsg(e.message);
    }
  };

  const startPolling = (mtOrderId) => {
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/payment/qris/status?orderId=${mtOrderId}`);
        if (!r.ok) return;
        const data = await r.json();
        const st = (data.status || "").toLowerCase();
        if (st === "settlement" || st === "capture" || st === "paid") {
          clearInterval(pollRef.current);
          setStatus("paid");
          setTimeout(() => onPaid(mtOrderId), 1500);
        } else if (st === "expire" || st === "cancel" || st === "deny" || st === "failure") {
          clearInterval(pollRef.current);
          setStatus("timeout");
        }
      } catch {}
    }, 3000);
  };

  const handleCancel = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    cdsCast("pos:reset", {});
    onCancel();
  };

  return (
    <div style={S.root}>
      <header style={S.header}>
        <button onClick={handleCancel} style={S.iconBtn}>← Batal</button>
        <h1 style={S.headTitle}>QRIS Payment</h1>
        <div style={{width: 60}}/>
      </header>

      <main style={{...S.main, alignItems: "center", justifyContent: "center", textAlign: "center"}}>
        {status === "loading" && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
            <div style={{fontSize:64,lineHeight:1,margin:0}}>⏳</div>
            <h2 style={{fontSize:24,lineHeight:1.2,margin:0}}>Membuat QR Code...</h2>
            <p style={{color:"#888",margin:0}}>Please wait sebentar</p>
          </div>
        )}

        {status === "waiting" && qrData && (
          <>
            <div style={{padding:16, background:"#fff", borderRadius:16, marginBottom:24}}>
              <img src={qrData.qrCode} alt="QR" style={{width:240, height:240}}/>
            </div>
            <h2 style={{fontSize:22, marginBottom:8}}>Customer scan QR di CDS layar</h2>
            <p style={{color:"#888", marginBottom:24}}>QR juga tampil besar di Customer Display</p>
            <div style={{padding:"12px 24px", background: "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)", border:"1px solid #F59E0B",
              borderRadius:12, marginBottom:24, display:"inline-flex", flexDirection:"column", alignItems:"center"}}>
              <span style={{fontSize:11, color:"#888", letterSpacing:2}}>MENUNGGU PEMBAYARAN</span>
              <span style={{fontSize:32, fontFamily:"'Inter',sans-serif", color:"#F59E0B", letterSpacing:2}}>
                Rp {fmt(subtotal)}
              </span>
            </div>
            <div style={{color:"#888", fontSize:13}}>
              <span style={{display:"inline-block", animation:"pulse 1.5s infinite"}}>●</span> Polling status setiap 3 detik
            </div>
          </>
        )}

        {status === "paid" && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
            <div style={{fontSize:120,lineHeight:1,margin:0}}>✅</div>
            <h2 style={{fontSize:28,color:"#10B981",lineHeight:1.2,margin:0}}>Payment Successful!</h2>
            <p style={{color:"#888",margin:0}}>Menyimpan order...</p>
          </div>
        )}

        {status === "timeout" && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
            <div style={{fontSize:64,lineHeight:1,margin:0}}>⏰</div>
            <h2 style={{fontSize:24,lineHeight:1.2,margin:0}}>Pembayaran Timeout</h2>
            <p style={{color:"#888",margin:0}}>QR expired atau customer cancel</p>
            <button onClick={handleCancel} style={{...S.confirmBtn,marginTop:10}}>← Back</button>
          </div>
        )}

        {status === "error" && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,maxWidth:520}}>
            <div style={{fontSize:64,lineHeight:1,margin:0}}>⚠️</div>
            <h2 style={{fontSize:22,color:"#EF4444",lineHeight:1.2,margin:0}}>QRIS Tidak Tersedia</h2>
            <p style={{color:"#888",margin:0}}>{errMsg}</p>
            <p style={{color:"#666",fontSize:13,margin:0,lineHeight:1.5,textAlign:"center"}}>
              Backend Midtrans mungkin belum dikonfigurasi.<br/>
              Gunakan Cash sementara waktu.
            </p>
            <button onClick={handleCancel} style={{...S.confirmBtn,marginTop:10}}>← Pakai Cash</button>
          </div>
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════
const FONT = "'Inter',sans-serif";
const BRAND = "var(--brand-primary,#FF6B35)";
const BRAND_SEC = "var(--brand-secondary,#E55A2B)";

const CONFIRM_CSS = `
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  .lg{position:relative;background:linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%);backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);border:1px solid rgba(255,255,255,0.07);box-shadow:inset 0 1px 0 rgba(255,255,255,0.14),inset 0 -1px 0 rgba(0,0,0,0.18),0 8px 24px rgba(0,0,0,0.24)}
  button{cursor:pointer;font-family:'Inter',sans-serif}
  input,textarea{font-family:'Inter',sans-serif;outline:none}
  input::placeholder{color:rgba(255,255,255,0.3)}
  /* POS payment polish — premium hover + tap feedback */
  button[data-pos-pay]:hover{background:rgba(255,255,255,0.06)!important;border-color:rgba(255,255,255,0.15)!important;transform:translateY(-2px)}
  button[data-pos-pay]:active{transform:translateY(0) scale(0.98)}
  button[data-pos-confirm]{transition:all 0.2s cubic-bezier(.2,.8,.2,1)}
  button[data-pos-confirm]:hover:not(:disabled){transform:translateY(-3px) scale(1.01);filter:brightness(1.08)}
  button[data-pos-confirm]:active:not(:disabled){transform:translateY(-1px) scale(0.99)}
  /* QR Cinemark-style pulse glow saat waiting payment */
  @keyframes posQrPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,107,53,0.4),0 12px 36px rgba(0,0,0,0.4)}50%{box-shadow:0 0 0 16px rgba(255,107,53,0),0 12px 36px rgba(0,0,0,0.4)}}
  .pos-qr-pulse{animation:posQrPulse 2.2s ease infinite}
  /* Cash button quick tap feedback */
  button[data-pos-cash]:hover{background:rgba(255,107,53,0.1)!important;border-color:rgba(255,107,53,0.35)!important}
  button[data-pos-cash]:active{transform:scale(0.96)}
`;

const S = {
  root: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)",
    backgroundAttachment: "fixed",
    color: "#fff", fontFamily: FONT,
    display: "flex", flexDirection: "column"
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 24px",
    background: "rgba(13,17,23,0.7)",
    backdropFilter: "blur(20px) saturate(180%)",
    WebkitBackdropFilter: "blur(20px) saturate(180%)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    position: "sticky", top: 0, zIndex: 10
  },
  headTitle: { fontFamily: FONT, fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.4px", margin: 0 },
  iconBtn: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.7)", padding: "7px 14px", borderRadius: 999,
    fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONT, letterSpacing: "-0.1px"
  },
  main: {
    flex: 1, padding: "20px 20px 32px",
    maxWidth: 640, margin: "0 auto", width: "100%",
    boxSizing: "border-box",
    display: "flex", flexDirection: "column", gap: 12
  },

  tabBanner: {
    padding: "14px 16px", borderRadius: 16,
    background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 10%, rgba(255,255,255,0.02))",
    border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 35%, transparent)",
    color: "#fff", display: "flex", alignItems: "center", gap: 12
  },
  tabBannerTitle: { fontSize: 14, fontWeight: 600, letterSpacing: "-0.2px" },
  tabBannerHint: { fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 },

  // .lg class on element handles bg/border/shadow; tokens here = layout only
  metaCard: { borderRadius: 16, padding: "12px 16px" },
  metaRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13 },
  metaLabel: { color: "rgba(255,255,255,0.5)", fontWeight: 400 },
  metaValue: { fontWeight: 500, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.1px" },
  customerPoints: { color: BRAND, marginLeft: 8, fontSize: 12, fontWeight: 500 },

  itemsCard: { borderRadius: 16, padding: "12px 16px" },
  itemsHeader: { fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 1.5, fontWeight: 500, padding: "4px 0 8px", textTransform: "uppercase" },
  cartRow: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.04)", gap: 12
  },
  cartLeft: { display: "flex", gap: 10, flex: 1, minWidth: 0 },
  cartEmoji: { fontSize: 28, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.25))" },
  cartName: { fontSize: 14, fontWeight: 600, letterSpacing: "-0.2px", color: "rgba(255,255,255,0.92)" },
  cartSubprice: { fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, fontVariantNumeric: "tabular-nums" },
  cartToppings: { marginTop: 4, fontSize: 11, color: "#34D399", lineHeight: 1.5 },
  cartLineTotal: { fontSize: 14, fontWeight: 600, color: "#fff", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.2px", whiteSpace: "nowrap" },

  // Subtotal — when no deduction, soft brand-tint; otherwise plain
  subtotalCard: { borderRadius: 16, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  subtotalCardPlain: { borderRadius: 16, padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" },
  subLabel: { fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.65)", letterSpacing: "-0.1px" },
  taxNote: { fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, letterSpacing: 0.2 },
  subAmount: { fontFamily: FONT, fontSize: 30, fontWeight: 600, color: "#fff", letterSpacing: "-0.8px", fontVariantNumeric: "tabular-nums" },
  subAmountPlain: { fontFamily: FONT, fontSize: 20, fontWeight: 500, color: "rgba(255,255,255,0.55)", letterSpacing: "-0.4px", fontVariantNumeric: "tabular-nums" },

  // Promo
  promoInputRow: { display: "flex", gap: 8 },
  promoInput: {
    flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12, padding: "11px 14px", color: "#fff", fontSize: 14, fontFamily: FONT,
    letterSpacing: 1, textTransform: "uppercase", outline: "none"
  },
  promoApply: {
    background: `radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, ${BRAND} 55%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, ${BRAND} 38%, #1a1d29), color-mix(in srgb, ${BRAND_SEC} 30%, #0d0f14))`,
    color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.45)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.16)", borderRadius: 12,
    padding: "0 18px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: FONT, letterSpacing: "-0.1px",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px color-mix(in srgb, ${BRAND} 24%, transparent)`
  },
  promoApplyDisabled: {
    background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 12, padding: "0 18px", fontWeight: 500, fontSize: 13, cursor: "not-allowed", fontFamily: FONT
  },
  promoErr: { color: "rgba(248,113,113,0.9)", fontSize: 12, marginTop: 8, padding: "7px 12px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)", borderRadius: 10 },
  promoApplied: {
    display: "flex", alignItems: "center", gap: 12,
    background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.22)",
    borderRadius: 12, padding: "12px 14px"
  },
  promoCodeLabel: { fontSize: 14, fontWeight: 600, color: "#34D399", letterSpacing: "-0.2px" },
  promoSub: { fontSize: 11, color: "rgba(167,243,208,0.85)", marginTop: 2 },
  promoRemove: { background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "rgba(248,113,113,0.85)", fontSize: 11, padding: "4px 10px", borderRadius: 8, cursor: "pointer" },

  // Points
  pointsHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  pointsHint: { fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 },
  pointsControl: { marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" },
  pointsSlider: { width: "100%", marginBottom: 8, accentColor: "#10B981" },
  pointsReadout: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 10, color: "rgba(255,255,255,0.85)" },
  pointsValueRp: { color: "#10B981", fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  pointsQuick: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 },
  pointsQuickBtn: {
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
    color: "rgba(167,243,208,0.85)", borderRadius: 10, padding: "8px 4px",
    fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: FONT
  },
  pointsEmpty: { marginTop: 10, padding: "10px 12px", background: "rgba(255,255,255,0.025)", color: "rgba(255,255,255,0.55)", fontSize: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" },

  // Breakdown — final total with brand glow
  breakdownCard: { borderRadius: 18, padding: "14px 18px" },
  breakdownRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 13, color: "rgba(255,255,255,0.6)" },
  breakdownLabel: { color: "rgba(255,255,255,0.5)" },
  breakdownDivider: { height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)", margin: "10px 0 6px" },
  breakdownTotalRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0" },
  breakdownTotalLabel: { fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.55)", letterSpacing: 0.4, textTransform: "uppercase" },
  breakdownTotalAmount: { fontFamily: FONT, fontSize: 30, color: "#fff", letterSpacing: "-0.8px", fontWeight: 600, fontVariantNumeric: "tabular-nums" },

  // Payment selector
  // PREMIUM PAYMENT CARDS — bigger touch target, brand glow active state
  payCard: { borderRadius: 18, padding: 18 },
  payTitle: { fontSize: 11, color: `color-mix(in srgb, ${BRAND} 80%, #fff)`, letterSpacing: 2, fontWeight: 700, marginBottom: 14, textTransform: "uppercase", fontFamily: "'Geist Mono',monospace" },
  payOptions: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  payBtn: {
    background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.08)",
    borderRadius: 14, padding: "18px 12px", cursor: "pointer", color: "#fff", fontFamily: FONT,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    transition: "all 0.2s cubic-bezier(.2,.8,.2,1)",
    minHeight: 110,
  },
  payActive: {
    background: `linear-gradient(180deg, color-mix(in srgb, ${BRAND} 18%, rgba(255,255,255,0.02)), color-mix(in srgb, ${BRAND} 4%, transparent))`,
    border: `1.5px solid color-mix(in srgb, ${BRAND} 65%, transparent)`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 24px color-mix(in srgb, ${BRAND} 35%, transparent), 0 0 0 1px color-mix(in srgb, ${BRAND} 25%, transparent)`,
    transform: "translateY(-2px)",
  },
  payIcon: { fontSize: 36, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))", lineHeight: 1 },
  payName: { fontSize: 15, fontWeight: 800, letterSpacing: -0.3 },
  payHint: { fontSize: 10.5, color: "rgba(255,255,255,0.45)", textAlign: "center", letterSpacing: 0.3, fontFamily: "'Geist Mono',monospace" },

  fullyPaidBanner: {
    padding: "14px 18px", borderRadius: 14,
    background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.28)",
    display: "flex", alignItems: "center", gap: 12
  },

  // Cash counter
  cashDisplay: {
    background: "rgba(255,255,255,0.025)", padding: "14px 18px",
    borderRadius: 14, marginBottom: 12,
    border: "1px solid rgba(255,255,255,0.06)"
  },
  cashReceivedAmount: {
    fontSize: 26, fontWeight: 600, color: "#fff",
    fontFamily: FONT, letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums"
  },
  cashChangeRow: { fontSize: 13, color: "#34D399", fontWeight: 500, marginTop: 5, fontVariantNumeric: "tabular-nums" },
  cashShortRow: { fontSize: 13, color: "rgba(248,113,113,0.9)", fontWeight: 500, marginTop: 5, fontVariantNumeric: "tabular-nums" },
  cashQuickRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1.5fr 1fr", gap: 6 },
  cashQuickBtn: {
    background: `color-mix(in srgb, ${BRAND} 12%, rgba(255,255,255,0.02))`,
    color: "#fff",
    border: `1px solid color-mix(in srgb, ${BRAND} 35%, transparent)`,
    borderRadius: 10, padding: "11px 8px", fontWeight: 600, fontSize: 12,
    cursor: "pointer", fontFamily: FONT, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.1px"
  },
  cashQuickBtnPas: {
    background: "rgba(52,211,153,0.12)", color: "#34D399",
    border: "1px solid rgba(52,211,153,0.32)", borderRadius: 10,
    padding: "11px 8px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: FONT
  },
  cashQuickBtnClear: {
    background: "transparent", color: "rgba(255,255,255,0.4)",
    border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
    padding: "11px 8px", fontWeight: 500, fontSize: 12,
    cursor: "pointer", fontFamily: FONT
  },

  confirmBtn: {
    background: `radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, ${BRAND} 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, ${BRAND} 38%, #1a1d29), color-mix(in srgb, ${BRAND_SEC} 30%, #0d0f14))`,
    color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.45)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.16)", borderRadius: 16,
    padding: "16px 20px", fontFamily: FONT, fontSize: 15, fontWeight: 600,
    letterSpacing: "-0.2px", cursor: "pointer",
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -16px 28px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.32), 0 24px 60px color-mix(in srgb, ${BRAND} 22%, transparent)`,
    marginTop: 6, transition: "all 0.25s cubic-bezier(.2,.8,.2,1)"
  }
};
