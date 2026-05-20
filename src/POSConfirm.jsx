import { useState, useEffect, useRef } from "react";
import POSSplitPayment from "./POSSplitPayment.jsx";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";
const fmt = (n) => (n || 0).toLocaleString("id-ID");

// Konversi poin — TODO: fetch dari /api/config/public atau settings table
// POINT_VALUE — fetched from /api/config/public (configurable via admin)
let _cachedPointValue = 100;
fetch((import.meta.env.VITE_API_URL || "http://localhost:3001") + "/api/config/public")
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

  // ─── Computed totals ───
  const promoDiscount = appliedPromo?.discount || 0;
  const pointsValue = pointsOn ? pointsUsed * getPointValue() : 0;
  const finalTotal = Math.max(0, subtotal - promoDiscount - pointsValue);
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
    if (!code) { setPromoError("Masukkan kode promo dulu"); return; }
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
        setPromoError("Promo khusus member. Cek ulang HP customer di step sebelumnya.");
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
      setPromoError("Gagal cek promo: " + e.message);
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
        alert("Gagal update tab: " + e.message);
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
          customerName: order.customerName || null,
          customerId: order.customerId || null,
          customerPhone: order.customerPhone || null,
          status,
          kasir: cashier?.name || null,
          source: "pos",
          midtransId: midtransOrderId || null
        })
      });
      if (!r.ok) throw new Error("Server error " + r.status);
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

      onSuccess(saved);
    } catch (e) {
      alert("Gagal save order: " + e.message);
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
      alert(`Uang diterima belum cukup. Kurang Rp ${fmt(finalTotal - cashReceived)}`);
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
      <header style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>← Back</button>
        <h1 style={S.headTitle}>Konfirmasi Pembayaran</h1>
        <button onClick={onCancel} style={S.iconBtn}>✕</button>
      </header>

      <main style={S.main}>
        {isOpenTab && (
          <div style={S.tabBanner}>
            <span style={{fontSize: 22}}>📋</span>
            <div>
              <div style={S.tabBannerTitle}>{isResuming ? "Tambah ke Tab #" + order.resumeTabId : "Mode Buka Tab"}</div>
              <div style={S.tabBannerHint}>{isResuming ? "Item lama + baru di-update. Bayar nanti pas customer lunasin." : "Tab disimpan tanpa pembayaran. Bayar nanti."}</div>
            </div>
          </div>
        )}

        {/* Order meta */}
        <div style={S.metaCard}>
          <div style={S.metaRow}>
            <span style={S.metaLabel}>Tipe</span>
            <span style={S.metaValue}>
              {order.type === "dine-in" ? "🍽️ Dine-in" : "🛍️ Take-away"}
              {order.table && ` · ${order.table.name}`}
            </span>
          </div>
          {order.customerName && (
            <div style={S.metaRow}>
              <span style={S.metaLabel}>Customer</span>
              <span style={S.metaValue}>
                {order.customerId ? "📱" : "👤"} {order.customerName}
                {customerPoints > 0 && (
                  <span style={S.customerPoints}> · {fmt(customerPoints)} poin</span>
                )}
              </span>
            </div>
          )}
          <div style={S.metaRow}>
            <span style={S.metaLabel}>Kasir</span>
            <span style={S.metaValue}>👤 {cashier?.name}</span>
          </div>
        </div>

        {/* Items */}
        <div style={S.itemsCard}>
          <div style={S.itemsHeader}>PESANAN ({cart.length} ITEM)</div>
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

        {/* Subtotal — kalau ada deduction, gak punya border orange (jadi sekedar info) */}
        <div style={hasDeduction ? S.subtotalCardPlain : S.subtotalCard}>
          <div>
            <div style={S.subLabel}>Subtotal</div>
            <div style={S.taxNote}>PPN 10% included</div>
          </div>
          <div style={hasDeduction ? S.subAmountPlain : S.subAmount}>Rp {fmt(subtotal)}</div>
        </div>

        {/* ═══════ NEW: Promo & Poin sections (hidden for open tab) ═══════ */}
        {!isOpenTab && (
          <>
            {/* Promo input */}
            <div style={S.payCard}>
              <div style={S.payTitle}>Promo / Voucher</div>
              {appliedPromo ? (
                <div style={S.promoApplied}>
                  <div style={{flex: 1}}>
                    <div style={S.promoCodeLabel}>✓ {appliedPromo.code}</div>
                    <div style={S.promoSub}>{appliedPromo.label} · Customer hemat Rp {fmt(promoDiscount)}</div>
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
                      placeholder="Masukkan kode..."
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

            {/* Poin redemption — only if customer has points */}
            {customerPoints > 0 && (
              <div style={S.payCard}>
                <div style={S.pointsHeader}>
                  <div>
                    <div style={S.payTitle}>Bayar pakai poin</div>
                    <div style={S.pointsHint}>{fmt(customerPoints)} poin · 1 poin = Rp {getPointValue()}</div>
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
                      <span>Pakai <strong>{fmt(pointsUsed)}</strong> poin</span>
                      <span style={S.pointsValueRp}>-Rp {fmt(pointsUsed * getPointValue())}</span>
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
                    Total sudah Rp 0 (semua udah ke-cover promo). Matiin toggle untuk pakai poin di transaksi lain.
                  </div>
                )}
              </div>
            )}

            {/* Final breakdown (kalau ada deduction) */}
            {hasDeduction && (
              <div style={S.breakdownCard}>
                <div style={S.breakdownRow}>
                  <span style={S.breakdownLabel}>Subtotal</span>
                  <span>Rp {fmt(subtotal)}</span>
                </div>
                {promoDiscount > 0 && (
                  <div style={{...S.breakdownRow, color: "#10B981"}}>
                    <span>Promo {appliedPromo.code}</span>
                    <span>-Rp {fmt(promoDiscount)}</span>
                  </div>
                )}
                {pointsValue > 0 && (
                  <div style={{...S.breakdownRow, color: "#10B981"}}>
                    <span>Bayar dgn {fmt(pointsUsed)} poin</span>
                    <span>-Rp {fmt(pointsValue)}</span>
                  </div>
                )}
                <div style={S.breakdownDivider} />
                <div style={S.breakdownTotalRow}>
                  <span style={S.breakdownTotalLabel}>Total Bayar</span>
                  <span style={S.breakdownTotalAmount}>Rp {fmt(finalTotal)}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Payment method (hidden if open tab OR if total is 0 from poin) */}
        {!isOpenTab && finalTotal > 0 && (
          <div style={S.payCard}>
            <div style={S.payTitle}>Metode Pembayaran</div>
            <div style={S.payOptions}>
              <button
                onClick={() => setPayMethod("CASH")}
                style={{...S.payBtn, ...(payMethod === "CASH" ? S.payActive : {})}}
              >
                <span style={S.payIcon}>💵</span>
                <span style={S.payName}>CASH</span>
                <span style={S.payHint}>Bayar tunai ke kasir</span>
              </button>
              <button
                onClick={() => setPayMethod("QRIS")}
                style={{...S.payBtn, ...(payMethod === "QRIS" ? S.payActive : {})}}
              >
                <span style={S.payIcon}>📱</span>
                <span style={S.payName}>QRIS</span>
                <span style={S.payHint}>Customer scan QR di CDS</span>
              </button>
              <button
                onClick={() => setShowSplitModal(true)}
                style={{...S.payBtn, background:"rgba(139,92,246,0.10)", borderColor:"rgba(139,92,246,0.4)"}}
              >
                <span style={S.payIcon}>💸</span>
                <span style={S.payName}>SPLIT</span>
                <span style={S.payHint}>Bayar pakai 2+ metode</span>
              </button>
            </div>
          </div>
        )}

        {/* Cash counter — only when CASH selected and total > 0 (Step 4A) */}
        {!isOpenTab && finalTotal > 0 && payMethod === "CASH" && (
          <div style={S.payCard}>
            <div style={S.payTitle}>Uang Diterima</div>
            <div style={S.cashDisplay}>
              <div style={S.cashReceivedAmount}>Rp {fmt(cashReceived)}</div>
              {cashReceived > 0 && (
                cashSufficient ? (
                  <div style={S.cashChangeRow}>
                    Kembalian: <strong>Rp {fmt(cashChange)}</strong>
                  </div>
                ) : (
                  <div style={S.cashShortRow}>
                    Kurang: <strong>Rp {fmt(finalTotal - cashReceived)}</strong>
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

        <button onClick={handleConfirm} disabled={busy} style={S.confirmBtn}>
          {busy ? "..." :
           isResuming ? "✓ Update Tab" :
           isOpenTab ? "📋 Buka Tab (belum dibayar)" :
           finalTotal === 0 ? "✓ Konfirmasi (Bayar Poin)" :
           payMethod === "QRIS" ? "📱 Tampilkan QR ke Customer" :
           payMethod === "CASH" && cashReceived === 0 ? "💵 Input uang diterima dulu" :
           payMethod === "CASH" && !cashSufficient ? `⚠ Kurang Rp ${fmt(finalTotal - cashReceived)}` :
           payMethod === "CASH" ? `✓ Konfirmasi (Kembalian Rp ${fmt(cashChange)})` :
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
          <>
            <div style={{fontSize:64,marginBottom:16}}>⏳</div>
            <h2 style={{fontSize:24,marginBottom:8}}>Membuat QR Code...</h2>
            <p style={{color:"#888"}}>Mohon tunggu sebentar</p>
          </>
        )}

        {status === "waiting" && qrData && (
          <>
            <div style={{padding:16, background:"#fff", borderRadius:16, marginBottom:24}}>
              <img src={qrData.qrCode} alt="QR" style={{width:240, height:240}}/>
            </div>
            <h2 style={{fontSize:22, marginBottom:8}}>Customer scan QR di CDS layar</h2>
            <p style={{color:"#888", marginBottom:24}}>QR juga tampil besar di Customer Display</p>
            <div style={{padding:"12px 24px", background:"#111", border:"1px solid #F59E0B",
              borderRadius:12, marginBottom:24, display:"inline-flex", flexDirection:"column", alignItems:"center"}}>
              <span style={{fontSize:11, color:"#888", letterSpacing:2}}>MENUNGGU PEMBAYARAN</span>
              <span style={{fontSize:32, fontFamily:"'Montserrat',sans-serif", color:"#F59E0B", letterSpacing:2}}>
                Rp {fmt(subtotal)}
              </span>
            </div>
            <div style={{color:"#888", fontSize:13}}>
              <span style={{display:"inline-block", animation:"pulse 1.5s infinite"}}>●</span> Polling status setiap 3 detik
            </div>
          </>
        )}

        {status === "paid" && (
          <>
            <div style={{fontSize:120, marginBottom:16}}>✅</div>
            <h2 style={{fontSize:28, color:"#10B981", marginBottom:8}}>Pembayaran Berhasil!</h2>
            <p style={{color:"#888"}}>Menyimpan order...</p>
          </>
        )}

        {status === "timeout" && (
          <>
            <div style={{fontSize:64, marginBottom:16}}>⏰</div>
            <h2 style={{fontSize:24, marginBottom:8}}>Pembayaran Timeout</h2>
            <p style={{color:"#888", marginBottom:24}}>QR expired atau customer cancel</p>
            <button onClick={handleCancel} style={S.confirmBtn}>← Kembali</button>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{fontSize:64, marginBottom:16}}>⚠️</div>
            <h2 style={{fontSize:22, color:"#EF4444", marginBottom:8}}>QRIS Tidak Tersedia</h2>
            <p style={{color:"#888", marginBottom:8, maxWidth:500}}>{errMsg}</p>
            <p style={{color:"#666", fontSize:13, marginBottom:24, maxWidth:500}}>
              Backend Midtrans mungkin belum dikonfigurasi.<br/>
              Gunakan Cash sementara waktu.
            </p>
            <button onClick={handleCancel} style={S.confirmBtn}>← Pakai Cash</button>
          </>
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════
const S = {
  root: { minHeight:"100vh", background:"#111", color:"#fff", fontFamily:"'Plus Jakarta Sans',sans-serif", 
    display:"flex", flexDirection:"column" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"16px 24px", borderBottom:"1px solid #222" },
  headTitle: { fontFamily:"'Montserrat',sans-serif", fontSize:32, color:"#F59E0B", margin:0 },
  iconBtn: { background:"transparent", border:"1px solid #333", color:"#aaa",
    padding:"8px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" },
  main: { flex:1, padding:"24px 20px", maxWidth:640, margin:"0 auto", width:"100%",
    boxSizing:"border-box", display:"flex", flexDirection:"column", gap:14 },

  tabBanner: {
    padding:"14px 18px", borderRadius:12,
    background:"rgba(245,158,11,0.10)", border:"1px solid rgba(245,158,11,0.40)",
    color:"#F59E0B", display:"flex", alignItems:"center", gap:10
  },
  tabBannerTitle: { fontSize:15, fontWeight:700 },
  tabBannerHint: { fontSize:12, color:"#FCD34D", marginTop:2 },

  metaCard: { background:"#0a0a0a", border:"1px solid #222", borderRadius:14, padding:16 },
  metaRow: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0" },
  metaLabel: { fontSize:13, color:"#888" },
  metaValue: { fontSize:14, fontWeight:600 },
  customerPoints: { color:"#F59E0B", marginLeft:8, fontSize:12 },

  itemsCard: { background:"#0a0a0a", border:"1px solid #222", borderRadius:14, padding:"12px 16px" },
  itemsHeader: { fontSize:11, color:"#666", letterSpacing:2, fontWeight:700, padding:"4px 0 12px" },
  cartRow: { display:"flex", justifyContent:"space-between", alignItems:"flex-start",
    padding:"12px 0", borderTop:"1px solid #1a1a1a", gap:12 },
  cartLeft: { display:"flex", gap:12, flex:1 },
  cartEmoji: { fontSize:36 },
  cartName: { fontSize:14, fontWeight:700 },
  cartSubprice: { fontSize:11, color:"#888", marginTop:2 },
  cartToppings: { marginTop:4, fontSize:11, color:"#10B981" },
  cartLineTotal: { fontSize:15, fontWeight:800, color:"#F59E0B" },

  // Subtotal — orange when no deduction, plain when there's promo/poin (the real total is in breakdown card)
  subtotalCard: { background:"#0a0a0a", border:"1px solid #F59E0B", borderRadius:14,
    padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" },
  subtotalCardPlain: { background:"#0a0a0a", border:"1px solid #222", borderRadius:14,
    padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" },
  subLabel: { fontSize:13, fontWeight:600 },
  taxNote: { fontSize:10, color:"#666", marginTop:2 },
  subAmount: { fontFamily:"'Montserrat',sans-serif", fontSize:36, color:"#F59E0B", letterSpacing:1 },
  subAmountPlain: { fontFamily:"'Montserrat',sans-serif", fontSize:24, color:"#888", letterSpacing:1 },

  // Promo
  promoInputRow: { display:"flex", gap:8 },
  promoInput: { flex:1, background:"#050810", border:"1px solid #2a2a2a", borderRadius:10,
    padding:"12px 14px", color:"#fff", fontSize:14, fontFamily:"inherit",
    letterSpacing:1, textTransform:"uppercase" },
  promoApply: { background:"#F59E0B", color:"#111", border:"none", borderRadius:10,
    padding:"0 18px", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" },
  promoApplyDisabled: { background:"#2a2a2a", color:"#666", border:"none", borderRadius:10,
    padding:"0 18px", fontWeight:700, fontSize:13, cursor:"not-allowed", fontFamily:"inherit" },
  promoErr: { color:"#FCA5A5", fontSize:12, marginTop:8, padding:"6px 10px",
    background:"rgba(239,68,68,0.08)", borderRadius:6 },
  promoApplied: { display:"flex", alignItems:"center", gap:12,
    background:"rgba(16,185,129,0.10)", border:"1px solid #10B981",
    borderRadius:10, padding:"12px 14px" },
  promoCodeLabel: { fontSize:14, fontWeight:700, color:"#34D399", letterSpacing:1 },
  promoSub: { fontSize:11, color:"#A7F3D0", marginTop:2 },
  promoRemove: { background:"transparent", border:"none", color:"#34D399",
    fontSize:18, cursor:"pointer", padding:"4px 8px" },

  // Points
  pointsHeader: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 },
  pointsHint: { fontSize:11, color:"#666", marginTop:4 },
  pointsControl: { marginTop:12, paddingTop:12, borderTop:"1px solid #222" },
  pointsSlider: { width:"100%", marginBottom:8, accentColor:"#10B981" },
  pointsReadout: { display:"flex", justifyContent:"space-between", alignItems:"center",
    fontSize:13, marginBottom:10 },
  pointsValueRp: { color:"#10B981", fontWeight:700 },
  pointsQuick: { display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:6 },
  pointsQuickBtn: { background:"#1a1a1a", border:"1px solid #2a2a2a", color:"#A7F3D0",
    borderRadius:8, padding:"8px 4px", fontSize:11, fontWeight:600, cursor:"pointer",
    fontFamily:"inherit" },
  pointsEmpty: { marginTop:10, padding:"10px 12px", background:"rgba(245,158,11,0.08)",
    color:"#FCD34D", fontSize:12, borderRadius:8 },

  // Breakdown
  breakdownCard: { background:"linear-gradient(180deg, rgba(245,158,11,0.06) 0%, rgba(245,158,11,0.02) 100%)",
    border:"1px solid #F59E0B", borderRadius:14, padding:"14px 18px" },
  breakdownRow: { display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"5px 0", fontSize:13 },
  breakdownLabel: { color:"#888" },
  breakdownDivider: { height:1, background:"rgba(245,158,11,0.3)", margin:"8px 0" },
  breakdownTotalRow: { display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"4px 0" },
  breakdownTotalLabel: { fontSize:14, fontWeight:700, color:"#fff" },
  breakdownTotalAmount: { fontFamily:"'Montserrat',sans-serif", fontSize:32,
    color:"#F59E0B", letterSpacing:1, fontWeight:800 },

  // Payment
  payCard: { background:"#0a0a0a", border:"1px solid #222", borderRadius:14, padding:16 },
  payTitle: { fontSize:11, color:"#888", letterSpacing:2, fontWeight:700, marginBottom:12 },
  payOptions: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
  payBtn: { background:"#111", border:"2px solid #2a2a2a", borderRadius:12,
    padding:"14px 12px", cursor:"pointer", color:"#fff", fontFamily:"inherit",
    display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:"all 0.15s" },
  payActive: { borderColor:"#F59E0B", background:"rgba(245,158,11,0.08)" },
  payIcon: { fontSize:32 },
  payName: { fontSize:14, fontWeight:800 },
  payHint: { fontSize:10, color:"#888", textAlign:"center" },

  fullyPaidBanner: {
    padding:"14px 18px", borderRadius:12,
    background:"rgba(16,185,129,0.10)", border:"1px solid #10B981",
    display:"flex", alignItems:"center", gap:12
  },

  // Cash counter (Step 4A)
  cashDisplay: {
    background: "#050810", padding: "16px 20px",
    borderRadius: 10, marginBottom: 12,
    border: "1px solid #1a1a1a"
  },
  cashReceivedAmount: {
    fontSize: 28, fontWeight: 800, color: "#fff",
    fontFamily: "'Montserrat',sans-serif", letterSpacing: 1
  },
  cashChangeRow: {
    fontSize: 14, color: "#34D399", fontWeight: 600,
    marginTop: 6
  },
  cashShortRow: {
    fontSize: 14, color: "#FCA5A5", fontWeight: 600,
    marginTop: 6
  },
  cashQuickRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1.5fr 1fr",
    gap: 6
  },
  cashQuickBtn: {
    background: "rgba(245,158,11,0.15)", color: "#FCD34D",
    border: "1px solid rgba(245,158,11,0.4)", borderRadius: 8,
    padding: "12px 8px", fontWeight: 700, fontSize: 13,
    cursor: "pointer", fontFamily: "inherit"
  },
  cashQuickBtnPas: {
    background: "rgba(16,185,129,0.15)", color: "#34D399",
    border: "1px solid rgba(16,185,129,0.4)", borderRadius: 8,
    padding: "12px 8px", fontWeight: 700, fontSize: 13,
    cursor: "pointer", fontFamily: "inherit"
  },
  cashQuickBtnClear: {
    background: "transparent", color: "#666",
    border: "1px solid #2a2a2a", borderRadius: 8,
    padding: "12px 8px", fontWeight: 500, fontSize: 12,
    cursor: "pointer", fontFamily: "inherit"
  },

  confirmBtn: { background:"#F59E0B", color:"#111", border:"none", borderRadius:14,
    padding:"18px", fontFamily:"inherit", fontSize:16, fontWeight:800,
    letterSpacing:1, cursor:"pointer", boxShadow:"0 0 30px rgba(245,158,11,0.3)",
    marginTop:8 }
};
