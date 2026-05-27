import React, { useState, useEffect, useRef, useMemo } from "react";

const API = import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:3011` : "");

import { fmtMoney as fIDR } from "../lib/currency.js";

const LOYALTY_DEFAULTS = {
  enabled: true, earnRate: 1000, redeemRate: 100,
  minRedeemPoints: 100, maxRedeemPercent: 50,
};

function calcPromoDiscount(promo, subtotal) {
  if (!promo) return 0;
  if (subtotal < (promo.minOrder || 0)) return 0;
  if (promo.type === "percent") {
    const raw = Math.floor(subtotal * promo.value / 100);
    return promo.maxDiscount > 0 ? Math.min(raw, promo.maxDiscount) : raw;
  }
  if (promo.type === "fixed") {
    return Math.min(promo.value, subtotal);
  }
  // BOGO: approximate or zero (backend authoritative)
  return 0;
}

function isPromoEligible(promo, customer, subtotal) {
  if (!promo) return { ok: false, reason: "Promo tidak ditemukan" };
  if (!promo.active) return { ok: false, reason: "Promo tidak aktif" };
  const now = Date.now();
  const validFrom = typeof promo.validFrom === "number" ? promo.validFrom : new Date(promo.validFrom).getTime();
  const validUntil = typeof promo.validUntil === "number" ? promo.validUntil : new Date(promo.validUntil).getTime();
  if (validFrom && validFrom > now) return { ok: false, reason: "Promo not started" };
  if (validUntil && validUntil < now) return { ok: false, reason: "Promo expired" };
  if (promo.usageLimit && promo.usedCount >= promo.usageLimit) return { ok: false, reason: "Kuota promo habis" };
  if (promo.minOrder && subtotal < promo.minOrder) {
    return { ok: false, reason: `Min order ${fIDR(promo.minOrder)}` };
  }
  if (promo.forMember) {
    const tags = Array.isArray(customer?.tags) ? customer.tags : [];
    const isMember = tags.includes("vip") || tags.includes("member");
    if (!isMember) return { ok: false, reason: "Khusus member" };
    if ((promo.code === "VIP25" || /vip/i.test(promo.desc || "")) && !tags.includes("vip")) {
      return { ok: false, reason: "Khusus VIP member" };
    }
  }
  return { ok: true };
}

export default function FlowCheckout({
  session, tableContext, cart, cartTotal, onBack, onPlaced,
  activePromo, setActivePromo, pointsToRedeem, setPointsToRedeem
}) {
  const [orderType, setOrderType] = useState(tableContext ? "dine" : "takeaway");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // QRIS sub-flow state
  const [qrStep, setQrStep] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [mtOrderId, setMtOrderId] = useState(null);
  const pollRef = useRef(null);

  // Promo state
  const [promos, setPromos] = useState([]);
  const [codeInput, setCodeInput] = useState(activePromo?.code || "");
  const [appliedPromo, setAppliedPromo] = useState(activePromo || null);
  const [promoErr, setPromoErr] = useState("");

  // Points state
  const [loyaltyCfg, setLoyaltyCfg] = useState(LOYALTY_DEFAULTS);
  const [customerPoints, setCustomerPoints] = useState(session?.points || 0);
  const [pointsInput, setPointsInput] = useState(pointsToRedeem || 0);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Load promos + loyalty config + fresh customer data
  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/promos`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/api/loyalty/config`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API}/api/customers`).then(r => r.ok ? r.json() : []),
    ]).then(([promoList, cfg, custList]) => {
      if (Array.isArray(promoList)) setPromos(promoList);
      if (cfg) setLoyaltyCfg({ ...LOYALTY_DEFAULTS, ...cfg });
      // /api/customers returns { total, data: [...] } — not a bare array
      const custArr = Array.isArray(custList) ? custList : (custList?.data || []);
      if (session?.phone) {
        const clean = String(session.phone).replace(/\D/g, "");
        const fresh = custArr.find(c => {
          const cp = String(c.phone || "").replace(/\D/g, "");
          return cp === clean;
        });
        if (fresh && typeof fresh.points === "number") {
          setCustomerPoints(fresh.points);
        }
      }
    });
  }, [session]);

  // Auto-apply activePromo (from FlowPromos)
  useEffect(() => {
    if (activePromo && !appliedPromo) {
      setCodeInput(activePromo.code);
      setAppliedPromo(activePromo);
    }
  }, [activePromo]);

  function validateAndApply(code) {
    setPromoErr("");
    const trimmed = String(code || "").trim().toUpperCase();
    if (!trimmed) {
      setPromoErr("Masukin kode promo");
      return;
    }
    const promo = promos.find(p => String(p.code || "").toUpperCase() === trimmed);
    if (!promo) {
      setPromoErr("Kode tidak ditemukan");
      return;
    }
    const check = isPromoEligible(promo, session, cartTotal);
    if (!check.ok) {
      setPromoErr(check.reason);
      return;
    }
    setAppliedPromo(promo);
    setPromoErr("");
  }

  function removePromo() {
    setAppliedPromo(null);
    setCodeInput("");
    setPromoErr("");
    if (setActivePromo) setActivePromo(null);
  }

  // Discount calculations
  const promoDisc = useMemo(() => calcPromoDiscount(appliedPromo, cartTotal), [appliedPromo, cartTotal]);
  const subAfterPromo = Math.max(0, cartTotal - promoDisc);

  // Max points = min(balance, subAfterPromo × maxPercent / 100)
  const maxPointsRedeem = useMemo(() => {
    if (!loyaltyCfg.enabled || customerPoints < (loyaltyCfg.minRedeemPoints || 100)) return 0;
    const fromBalance = Math.floor(customerPoints / loyaltyCfg.redeemRate) * loyaltyCfg.redeemRate;
    const fromPct = Math.floor(subAfterPromo * loyaltyCfg.maxRedeemPercent / 100 / loyaltyCfg.redeemRate) * loyaltyCfg.redeemRate;
    return Math.min(fromBalance, fromPct);
  }, [customerPoints, subAfterPromo, loyaltyCfg]);

  const actualPoints = useMemo(() => {
    const p = Math.min(Math.max(0, pointsInput), maxPointsRedeem);
    return Math.floor(p / loyaltyCfg.redeemRate) * loyaltyCfg.redeemRate;
  }, [pointsInput, maxPointsRedeem, loyaltyCfg]);

  const pointsDisc = Math.floor(actualPoints / loyaltyCfg.redeemRate) * 1000;
  const finalTotal = Math.max(0, subAfterPromo - pointsDisc);

  function quickPickPoints(pct) {
    const target = Math.floor(maxPointsRedeem * pct / 100 / loyaltyCfg.redeemRate) * loyaltyCfg.redeemRate;
    setPointsInput(target);
  }

  async function handlePlaceOrder() {
    setError("");
    if (cart.length === 0) {
      setError("Cart kosong");
      return;
    }
    setSubmitting(true);
    setQrStep("loading");

    const tempOrderId = "FLOW-" + Date.now();

    try {
      const r = await fetch(`${API}/api/payment/qris`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: tempOrderId,
          amount: finalTotal,
          items: cart.map(c => ({
            id: c.id, n: c.name,
            p: (c.price || 0) + (c.addonTotal || 0),
            q: c.qty,
          })),
          customerName: session.name || "KaryaOS Customer",
        }),
      });

      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Server ${r.status}: ${txt.substring(0, 150)}`);
      }
      const data = await r.json();

      const newMtId = data.midtransOrderId || data.order_id || tempOrderId;
      const scanTarget = data.deeplinkUrl || data.qrString || data.qrUrl;
      if (!scanTarget) throw new Error("No payment URL returned");

      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=20&data=${encodeURIComponent(scanTarget)}`;

      setQrData({
        qrCode: qrImageUrl,
        amount: finalTotal,
        midtransOrderId: newMtId,
        deeplink: data.deeplinkUrl || null,
        paymentType: data.paymentType || "QRIS",
      });
      setMtOrderId(newMtId);
      setQrStep("waiting");

      pollRef.current = setInterval(() => pollStatus(newMtId), 3000);
    } catch (e) {
      setError(e.message);
      setQrStep("error");
      setSubmitting(false);
    }
  }

  async function pollStatus(mtId) {
    try {
      const r = await fetch(`${API}/api/payment/status/${mtId}`);
      if (r.ok) {
        const data = await r.json();
        const st = data.status || data.transaction_status;
        if (st === "settlement" || st === "capture" || st === "paid" || st === "success") {
          if (pollRef.current) clearInterval(pollRef.current);
          setQrStep("paid");
          setTimeout(() => saveOrder(mtId), 1500);
        } else if (st === "deny" || st === "cancel" || st === "expire") {
          if (pollRef.current) clearInterval(pollRef.current);
          setQrStep("error");
          setError("Payment failed/expired");
        }
      }
    } catch {}
  }

  async function saveOrder(mtId) {
    try {
      const phoneClean = (session.phone || "").replace(/[^0-9]/g, "");
      const phoneLocal = phoneClean.startsWith("0") ? phoneClean :
        phoneClean.startsWith("62") ? "0" + phoneClean.substring(2) : phoneClean;

      const r = await fetch(`${API}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: orderType === "dine" ? "dine" : "takeaway",
          table: tableContext || null,
          items: cart.map(c => ({
            id: c.id,
            e: c.emoji || "",
            n: c.name,
            q: c.qty,
            p: c.price,
            addonTotal: c.addonTotal || 0,
            addons: c.addons || {},
          })),
          subtotal: cartTotal,
          total: finalTotal,
          customerName: session.name,
          customerPhone: phoneLocal,
          customerId: session.customerId || session.id || null,
          kasir: "KaryaOS",
          source: "customer_portal",
          notes: notes || null,
          pay: "QRIS",
          status: "waiting",
          midtransId: mtId,
          promoCode: appliedPromo?.code || null,
          pointsRedeemed: actualPoints || 0,
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Save failed");

      // Clear promo + points state in parent after success
      if (setActivePromo) setActivePromo(null);
      if (setPointsToRedeem) setPointsToRedeem(0);

      onPlaced(data.order || data);
    } catch (e) {
      setError("Gagal menyimpan: " + e.message);
      setQrStep("error");
      setSubmitting(false);
    }
  }

  function cancelQR() {
    if (pollRef.current) clearInterval(pollRef.current);
    setQrStep(null);
    setQrData(null);
    setMtOrderId(null);
    setSubmitting(false);
  }

  // ─── QR Display View ───
  if (qrStep) {
    return (
      <div style={S.qrContainer}>
        <header style={S.qrHeader}>
          {qrStep !== "paid" && qrStep !== "loading" && (
            <button onClick={cancelQR} style={S.backBtn}>← Batal</button>
          )}
          <div style={S.qrTitle}>Bayar QRIS</div>
          <div style={{width: 40}} />
        </header>

        <div style={S.qrBody}>
          {qrStep === "loading" && (<>
            <div style={S.qrLoadingIcon}>⏳</div>
            <div style={S.qrLoadingTitle}>Membuat QR Code...</div>
            <div style={S.qrLoadingSub}>Please wait sebentar</div>
          </>)}

          {qrStep === "waiting" && qrData && (<>
            <div style={S.qrCard}>
              <img src={qrData.qrCode} alt="QRIS" style={S.qrImage} />
            </div>
            <div style={S.qrAmount}>{fIDR(qrData.amount)}</div>
            <div style={S.qrHint}>📱 Scan QR ini dari aplikasi e-wallet</div>
            {qrData.paymentType && (
              <div style={S.qrPayBadge}>via {String(qrData.paymentType).toUpperCase()}</div>
            )}
            {qrData.deeplink && (
              <a href={qrData.deeplink} target="_blank" rel="noopener" style={S.qrDeeplink}>
                📲 Atau buka aplikasi langsung →
              </a>
            )}
            <div style={S.qrOrderId}>Order: {mtOrderId}</div>
            <div style={S.qrPolling}>● Menunggu pembayaran</div>
          </>)}

          {qrStep === "paid" && (<>
            <div style={S.successIcon}>✅</div>
            <div style={S.successTitle}>Payment Successful!</div>
            <div style={S.successSub}>Menyimpan pesanan...</div>
          </>)}

          {qrStep === "error" && (<>
            <div style={S.errorIcon}>⚠️</div>
            <div style={S.errorTitle}>Ada Masalah</div>
            <div style={S.errorMsg}>{error || "Payment processing failed"}</div>
            <button onClick={cancelQR} style={S.errorBtn}>Back</button>
          </>)}
        </div>
      </div>
    );
  }

  // ─── Checkout Summary View ───
  return (
    <div style={S.container}>
      <header style={S.header}>
        <button onClick={onBack} style={S.backBtn}>← Back</button>
        <div style={S.headTitle}>Checkout</div>
        <div style={{width: 60}} />
      </header>

      <div style={S.customerCard}>
        <div style={S.fieldLabel}>Customer</div>
        <div style={S.customerName}>{session.name}</div>
        <div style={S.customerPhone}>📱 {session.phone}</div>
      </div>

      {!tableContext && (
        <div style={S.section}>
          <div style={S.sectionLabel}>Tipe Pesanan</div>
          <div style={S.typeRow}>
            <button onClick={() => setOrderType("takeaway")} style={{...S.typeBtn, ...(orderType === "takeaway" ? S.typeBtnActive : {})}}>
              <div style={S.typeIcon}>🛍️</div>
              <div style={S.typeName}>Bawa Pulang</div>
              <div style={S.typeDesc}>Pickup di counter</div>
            </button>
            <button onClick={() => setOrderType("dine")} style={{...S.typeBtn, ...(orderType === "dine" ? S.typeBtnActive : {})}}>
              <div style={S.typeIcon}>🍽️</div>
              <div style={S.typeName}>Dine In</div>
              <div style={S.typeDesc}>Makan di sini</div>
            </button>
          </div>
        </div>
      )}

      {tableContext && (
        <div style={S.section}>
          <div style={S.sectionLabel}>Tipe</div>
          <div style={S.tableInfo}>🍽️ <strong>Dine In</strong> · Meja {tableContext}</div>
        </div>
      )}

      <div style={S.section}>
        <div style={S.sectionLabel}>Pesanan ({cart.length} item)</div>
        <div style={S.itemList}>
          {cart.map((c, idx) => (
            <div key={idx} style={S.itemRow}>
              <span style={S.itemEmoji}>{c.emoji}</span>
              <div style={S.itemBody}>
                <div style={S.itemName}>{c.name}</div>
                <div style={S.itemMeta}>{fIDR(c.price)} × {c.qty}</div>
                {c.addons?.toppings?.length > 0 && (
                  <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2, lineHeight: 1.3 }}>
                    + {c.addons.toppings.map(t => t.name).join(", ")}
                    {c.addonTotal > 0 && <span style={{ color: "var(--brand-primary,#FF6B35)" }}> (+{fIDR(c.addonTotal)})</span>}
                  </div>
                )}
              </div>
              <div style={S.itemLineTotal}>{fIDR((c.price + (c.addonTotal || 0)) * c.qty)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionLabel}>Catatan (Opsional)</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Mis: less sugar, tanpa es, dll" style={S.notesInput} rows={2} />
      </div>

      {/* ───── Promo Section ───── */}
      <div style={S.section}>
        <div style={S.sectionLabel}>🎟️ Promo & Voucher</div>
        {appliedPromo ? (
          <div style={S.appliedPromoCard}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.appliedPromoCode}>{appliedPromo.code}</div>
              <div style={S.appliedPromoDesc}>{appliedPromo.desc}</div>
              {promoDisc > 0 ? (
                <div style={S.appliedPromoSaving}>Hemat {fIDR(promoDisc)}</div>
              ) : appliedPromo.type === "bogo" ? (
                <div style={{ fontSize: 11, color: "var(--brand-primary,#FF6B35)", marginTop: 4 }}>BOGO · diskon dihitung server</div>
              ) : null}
            </div>
            <button onClick={removePromo} style={S.removeBtn}>✕</button>
          </div>
        ) : (
          <>
            <div style={S.codeInputRow}>
              <input type="text" value={codeInput}
                onChange={e => { setCodeInput(e.target.value.toUpperCase()); setPromoErr(""); }}
                placeholder="Masukin kode (BCA10, dll)" style={S.codeInput}
                onKeyDown={e => e.key === "Enter" && validateAndApply(codeInput)} />
              <button onClick={() => validateAndApply(codeInput)} style={S.applyBtn}>Apply</button>
            </div>
            {promoErr && <div style={S.softErr}>⚠ {promoErr}</div>}
          </>
        )}
      </div>

      {/* ───── Points Section ───── */}
      {loyaltyCfg.enabled && customerPoints >= (loyaltyCfg.minRedeemPoints || 100) && (
        <div style={S.section}>
          <div style={S.sectionLabel}>⭐ Pakai Poin</div>
          <div style={S.pointsCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>Saldo poin</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, color: "var(--brand-primary,#FF6B35)" }}>
                {customerPoints.toLocaleString("id-ID")}
              </span>
            </div>
            {maxPointsRedeem > 0 ? (
              <>
                <input type="number" value={pointsInput || ""}
                  onChange={e => setPointsInput(parseInt(e.target.value) || 0)}
                  placeholder={`Max ${maxPointsRedeem.toLocaleString("id-ID")} (kelipatan ${loyaltyCfg.redeemRate})`}
                  style={S.pointsInput} />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {[25, 50, 75, 100].map(pct => (
                    <button key={pct} onClick={() => quickPickPoints(pct)} style={S.quickPickBtn}>
                      {pct === 100 ? "Max" : pct + "%"}
                    </button>
                  ))}
                  {(pointsInput > 0 || actualPoints > 0) && (
                    <button onClick={() => setPointsInput(0)} style={{ ...S.quickPickBtn, color: "#F87171" }}>Delete</button>
                  )}
                </div>
                {actualPoints > 0 && (
                  <div style={S.pointsPreview}>
                    {actualPoints.toLocaleString("id-ID")} poin = potongan {fIDR(pointsDisc)}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", padding: 8 }}>
                Order belum cukup buat pakai poin (max {loyaltyCfg.maxRedeemPercent}% subtotal)
              </div>
            )}
          </div>
        </div>
      )}

      <div style={S.section}>
        <div style={S.sectionLabel}>Pembayaran</div>
        <div style={S.payCard}>
          <div style={S.payIcon}>📱</div>
          <div style={S.payBody}>
            <div style={S.payName}>QRIS</div>
            <div style={S.payDesc}>Scan QR dari aplikasi favorit</div>
          </div>
        </div>
      </div>

      <div style={S.totalCard}>
        <div style={S.totalRow}>
          <span style={S.totalLabel}>Subtotal</span>
          <span style={S.totalValue}>{fIDR(cartTotal)}</span>
        </div>
        {promoDisc > 0 && (
          <div style={S.totalRow}>
            <span style={{ ...S.totalLabel, color: "#10B981" }}>Promo ({appliedPromo.code})</span>
            <span style={{ ...S.totalValue, color: "#10B981" }}>−{fIDR(promoDisc)}</span>
          </div>
        )}
        {pointsDisc > 0 && (
          <div style={S.totalRow}>
            <span style={{ ...S.totalLabel, color: "#10B981" }}>Poin ({actualPoints})</span>
            <span style={{ ...S.totalValue, color: "#10B981" }}>−{fIDR(pointsDisc)}</span>
          </div>
        )}
        <div style={S.totalRowBig}>
          <span style={S.totalBigLabel}>TOTAL</span>
          <span style={S.totalBigValue}>{fIDR(finalTotal)}</span>
        </div>
        {(promoDisc + pointsDisc) > 0 && (
          <div style={{ fontSize: 11, color: "#10B981", textAlign: "right", marginTop: 6, fontWeight: 600 }}>
            🎉 Hemat {fIDR(promoDisc + pointsDisc)}
          </div>
        )}
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      <button onClick={handlePlaceOrder} disabled={submitting || finalTotal <= 0} style={S.payBtn}>
        {submitting ? "Processing..." : `Pay QRIS · ${fIDR(finalTotal)} →`}
      </button>

      <div style={S.disclaimer}>
        ℹ️ Status pesanan akan dikirim via WhatsApp setelah pembayaran berhasil
      </div>
    </div>
  );
}

const S = {
  container: { width: "min(440px, 100%)", minHeight: "100vh", padding: "16px 16px 100px", display: "flex", flexDirection: "column", gap: 14 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  backBtn: { padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a2a", color: "white", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  headTitle: { fontFamily: "'Inter', sans-serif", fontSize: 24, color: "var(--brand-primary,#FF6B35)", letterSpacing: 1 },
  customerCard: { padding: "14px 16px", borderRadius: 12, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" },
  fieldLabel: { fontSize: 10, color: "#9CA3AF", letterSpacing: 1, fontWeight: 600, marginBottom: 4 },
  customerName: { fontSize: 16, fontWeight: 800 },
  customerPhone: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionLabel: { fontSize: 10, color: "var(--brand-primary,#FF6B35)", letterSpacing: 1.5, fontWeight: 700 },
  typeRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  typeBtn: { padding: "14px 12px", borderRadius: 12,
    background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 100%)",
    backdropFilter: "blur(20px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer",
    fontFamily: "inherit", textAlign: "center",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" },
  typeBtnActive: {
    background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 12%, transparent)",
    border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent)" },
  typeIcon: { fontSize: 26, marginBottom: 6 },
  typeName: { fontSize: 13, fontWeight: 700 },
  typeDesc: { fontSize: 10, color: "#9CA3AF", marginTop: 2 },
  tableInfo: { padding: "10px 14px", borderRadius: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "white", fontSize: 13 },
  itemList: {
    background: "linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.012))",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "4px 0", overflow: "hidden" },
  itemRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid #1a1a1a" },
  itemEmoji: { fontSize: 24, width: 32 },
  itemBody: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 13, fontWeight: 700, lineHeight: 1.3 },
  itemMeta: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  itemLineTotal: { fontFamily: "'Inter', sans-serif", fontSize: 16, color: "var(--brand-primary,#FF6B35)", letterSpacing: 0.5, whiteSpace: "nowrap" },
  notesInput: { width: "100%", padding: "12px 14px", borderRadius: 12,
    background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)",
    color: "#fff", fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box" },

  // Promo
  appliedPromoCard: { display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 12, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.4)" },
  appliedPromoCode: { fontFamily: "'Inter', sans-serif", fontSize: 18, color: "#10B981", letterSpacing: 0.5 },
  appliedPromoDesc: { fontSize: 11, color: "#D1D5DB", marginTop: 2, lineHeight: 1.4 },
  appliedPromoSaving: { fontSize: 11, color: "#10B981", marginTop: 4, fontWeight: 700 },
  removeBtn: { width: 28, height: 28, borderRadius: 14, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#F87171", fontSize: 12, cursor: "pointer", padding: 0 },
  codeInputRow: { display: "flex", gap: 8 },
  codeInput: { flex: 1, padding: "11px 14px", borderRadius: 10,
    background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)",
    color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", letterSpacing: 1, textTransform: "uppercase" },
  applyBtn: { padding: "11px 18px", borderRadius: 12, background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))", border: "1px solid rgba(255,255,255,0.16)", color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.45)", fontSize: 13, fontWeight: 600, letterSpacing: "-0.1px", cursor: "pointer", fontFamily: "'Inter',sans-serif", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)" },
  softErr: { padding: "8px 12px", borderRadius: 8, background: "rgba(245,158,11,0.08)", color: "var(--brand-primary,#FF6B35)", fontSize: 12 },

  // Points
  pointsCard: { padding: "14px", borderRadius: 12,
    background: "linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.012))",
    backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.07)" },
  pointsInput: { width: "100%", padding: "10px 14px", borderRadius: 10,
    background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)",
    color: "#fff", fontSize: 14, fontWeight: 700, outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  quickPickBtn: { flex: 1, padding: "6px 4px", borderRadius: 8, background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 11, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit" },
  pointsPreview: { marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", color: "#10B981", fontSize: 12, fontWeight: 600, textAlign: "center" },

  // Payment
  payCard: { display: "flex", alignItems: "center", gap: 12, padding: "14px", borderRadius: 12, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.3)" },
  payIcon: { fontSize: 28 },
  payBody: { flex: 1 },
  payName: { fontSize: 14, fontWeight: 800 },
  payDesc: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },

  // Totals
  totalCard: { padding: "14px 16px", borderRadius: 14, background: "linear-gradient(135deg, rgba(245,158,11,0.10), rgba(245,158,11,0.02))", border: "1px solid rgba(245,158,11,0.3)" },
  totalRow: { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, color: "#D1D5DB" },
  totalRowBig: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 10, borderTop: "1px solid rgba(245,158,11,0.2)" },
  totalLabel: { fontSize: 13 },
  totalValue: { fontFamily: "'Inter', sans-serif", fontSize: 16, color: "white", letterSpacing: 0.5 },
  totalBigLabel: { fontSize: 14, fontWeight: 800, letterSpacing: 1 },
  totalBigValue: { fontFamily: "'Inter', sans-serif", fontSize: 32, color: "var(--brand-primary,#FF6B35)", letterSpacing: 1 },
  errorBox: { padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.10)", color: "#F87171", fontSize: 12 },
  payBtn: { width: "100%", padding: "16px", borderRadius: 14, background: "linear-gradient(135deg, #10B981, #059669)", border: "none", color: "white", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 8px 24px rgba(16,185,129,0.3)" },
  disclaimer: { textAlign: "center", fontSize: 10, color: "#6B7280", padding: "10px 0", lineHeight: 1.5 },

  // QR
  qrContainer: { width: "min(440px, 100%)", minHeight: "100vh", padding: "12px", display: "flex", flexDirection: "column", margin: "0 auto" },
  qrHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  qrTitle: { fontFamily: "'Inter', sans-serif", fontSize: 24, color: "var(--brand-primary,#FF6B35)", letterSpacing: 1 },
  qrBody: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "12px", gap: 10 },
  qrLoadingIcon: { fontSize: 64, animation: "pulse 2s infinite" },
  qrLoadingTitle: { fontSize: 20, fontWeight: 800 },
  qrLoadingSub: { fontSize: 13, color: "#9CA3AF" },
  qrCard: { padding: 16, background: "white", borderRadius: 20, marginBottom: 14, boxShadow: "0 20px 50px rgba(245,158,11,0.25)" },
  qrImage: { width: 340, height: 340, display: "block", maxWidth: "92vw", maxHeight: "92vw" },
  qrAmount: { fontFamily: "'Inter', sans-serif", fontSize: 44, color: "var(--brand-primary,#FF6B35)", letterSpacing: 1, marginTop: 8 },
  qrHint: { fontSize: 14, color: "#FAFAFA", maxWidth: 320, lineHeight: 1.5, fontWeight: 600 },
  qrPayBadge: { fontSize: 10, color: "#10B981", padding: "3px 10px", borderRadius: 6, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", marginTop: 4 },
  qrDeeplink: { fontSize: 13, color: "#3B82F6", textDecoration: "none", marginTop: 12, padding: "10px 16px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 10, fontWeight: 600 },
  qrOrderId: { fontSize: 10, color: "#6B7280", marginTop: 8 },
  qrPolling: { fontSize: 12, color: "#10B981", animation: "pulse 1.5s infinite", marginTop: 6, fontWeight: 600 },
  successIcon: { fontSize: 80, animation: "successPop 0.6s ease" },
  successTitle: { fontSize: 22, fontWeight: 800, color: "#10B981" },
  successSub: { fontSize: 13, color: "#9CA3AF" },
  errorIcon: { fontSize: 64 },
  errorTitle: { fontSize: 20, fontWeight: 800, color: "#F87171" },
  errorMsg: { fontSize: 13, color: "#9CA3AF", maxWidth: 320 },
  errorBtn: { marginTop: 12, padding: "12px 24px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a2a", color: "white", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
};
