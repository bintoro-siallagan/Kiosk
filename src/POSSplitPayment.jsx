import React, { useState, useEffect, useRef } from "react";
import API_HOST from "./apiBase.js";

const API = API_HOST;
const fIDR = (n) => "Rp " + (n || 0).toLocaleString("id-ID");

function cdsCast(event, data) {
  fetch(`${API}/api/pos/broadcast`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ event, data })
  }).catch(() => {});
}

export default function POSSplitPayment({ order, kasir, onClose, onSuccess }) {
  const total = order.total || 0;
  const [payments, setPayments] = useState([
    { method: "CASH", amount: "", cashReceived: "", change: 0 }
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // QRIS sub-flow state
  const [qrisStep, setQrisStep] = useState(null); // null | "loading" | "waiting" | "paid" | "error"
  const [qrData, setQrData] = useState(null);
  const [mtOrderId, setMtOrderId] = useState(null);
  const [finalPayloadRef, setFinalPayloadRef] = useState(null);
  const pollRef = useRef(null);

  const totalPaid = payments.reduce((s, p) => s + (parseInt(p.amount) || 0), 0);
  const remaining = total - totalPaid;
  const isComplete = remaining <= 0;
  const isOverpaid = remaining < 0;

  // Broadcast split info to CDS for anti-fraud display
  useEffect(() => {
    if (qrisStep) return; // Don't broadcast split summary if in QRIS sub-flow
    const sum = payments.reduce((s, p) => s + (parseInt(p.amount) || 0), 0);
    const breakdown = payments
      .filter(p => parseInt(p.amount) > 0)
      .map(p => `${p.method} ${fIDR(parseInt(p.amount) || 0)}`)
      .join(" + ");
    cdsCast("pos:payment_method", {
      method: "SPLIT",
      breakdown: breakdown || "Sedang diatur kasir...",
      total: sum,
      orderTotal: total,
    });
  }, [payments, total, qrisStep]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      cdsCast("pos:payment_method", { method: null });
      cdsCast("pos:reset", {});
    };
  }, []);

  function updatePayment(idx, field, value) {
    const next = [...payments];
    next[idx] = { ...next[idx], [field]: value };
    if (next[idx].method === "CASH" && field === "amount") {
      next[idx].cashReceived = value;
    }
    if (next[idx].method === "CASH") {
      const cash = parseInt(next[idx].cashReceived) || 0;
      const amt = parseInt(next[idx].amount) || 0;
      next[idx].change = Math.max(0, cash - amt);
    } else {
      next[idx].change = 0;
    }
    setPayments(next);
  }

  function addPayment() {
    setPayments([...payments, { method: "CASH", amount: remaining > 0 ? String(remaining) : "", cashReceived: "", change: 0 }]);
  }

  function removePayment(idx) {
    if (payments.length === 1) return;
    setPayments(payments.filter((_, i) => i !== idx));
  }

  function setQuickAmount(idx, amt) {
    updatePayment(idx, "amount", String(amt));
    if (payments[idx].method === "CASH") {
      updatePayment(idx, "cashReceived", String(amt));
    }
  }

  async function handleSettle() {
    if (!isComplete) {
      setError(`Masih kurang ${fIDR(remaining)}`);
      return;
    }

    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      const amt = parseInt(p.amount) || 0;
      if (amt <= 0) {
        setError(`Payment #${i + 1} amount invalid`);
        return;
      }
      if (p.method === "CASH") {
        const cash = parseInt(p.cashReceived) || 0;
        if (cash < amt) {
          setError(`Payment #${i + 1} cash diterima kurang dari amount`);
          return;
        }
      }
    }

    setError(null);

    const paymentsPayload = payments.map(p => ({
      method: p.method,
      amount: parseInt(p.amount) || 0,
      by: kasir,
      ...(p.method === "CASH" ? {
        cashReceived: parseInt(p.cashReceived) || 0,
        change: p.change || 0
      } : {})
    }));

    // Compute QRIS portion
    const qrisTotal = paymentsPayload
      .filter(p => p.method === "QRIS")
      .reduce((s, p) => s + p.amount, 0);

    if (qrisTotal > 0) {
      // Trigger QR sub-flow for QRIS portion
      setFinalPayloadRef(paymentsPayload);
      await initQRPayment(qrisTotal);
    } else {
      // No QRIS — save directly
      setSubmitting(true);
      await saveSplit(paymentsPayload);
    }
  }

  async function initQRPayment(qrisAmount) {
    setQrisStep("loading");
    setError(null);
    try {
      const tempOrderId = "POS-SPLIT-" + Date.now();
      const cart = order.cart || (order._orderData && order._orderData.items) || [];
      const r = await fetch(`${API}/api/payment/qris`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          orderId: tempOrderId,
          amount: qrisAmount,
          items: cart.map(c => ({
            id: c.id || null,
            n: c.name || c.n,
            p: (c.price || c.p || 0) + (c.addonTotal || 0),
            q: c.qty || c.q || 1
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
      const newMtOrderId = data.midtransOrderId || data.order_id || tempOrderId;

      if (!qrUrl) throw new Error("No QR returned by server");

      const qr = { qrCode: qrUrl, amount: qrisAmount, midtransOrderId: newMtOrderId };
      setQrData(qr);
      setMtOrderId(newMtOrderId);
      setQrisStep("waiting");

      // Broadcast QR to CDS for customer to scan
      cdsCast("pos:payment_qris", qr);

      // Start polling
      pollRef.current = setInterval(() => pollStatus(newMtOrderId), 3000);
    } catch (e) {
      setError(e.message);
      setQrisStep("error");
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
          setQrisStep("paid");
          // Attach midtrans ID to QRIS payments
          const finalPayload = finalPayloadRef.map(p =>
            p.method === "QRIS" ? { ...p, midtransId: mtId } : p
          );
          setTimeout(() => {
            setSubmitting(true);
            saveSplit(finalPayload);
          }, 1500);
        } else if (st === "deny" || st === "cancel" || st === "expire") {
          if (pollRef.current) clearInterval(pollRef.current);
          setQrisStep("error");
          setError("Pembayaran gagal/expire: " + st);
        }
      }
    } catch {}
  }

  function cancelQR() {
    if (pollRef.current) clearInterval(pollRef.current);
    setQrisStep(null);
    setQrData(null);
    setMtOrderId(null);
    setFinalPayloadRef(null);
    cdsCast("pos:reset", {});
  }

  async function saveSplit(paymentsPayload) {
    try {
      let res, data;
      if (order._newOrder && order._orderData) {
        res = await fetch(`${API}/api/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...order._orderData,
            payments: paymentsPayload,
            pay: paymentsPayload.length === 1 ? paymentsPayload[0].method : "SPLIT",
            status: "completed",
            midtransId: mtOrderId || null
          })
        });
      } else {
        res = await fetch(`${API}/api/orders/${order.id}/split-settle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payments: paymentsPayload })
        });
      }
      data = await res.json();
      if (!res.ok) throw new Error(data.error || "Settle failed");
      onSuccess(data);
    } catch (e) {
      setError("Gagal: " + e.message);
      setSubmitting(false);
      setQrisStep("error");
    }
  }

  // ─── QRIS Sub-flow render ───
  if (qrisStep) {
    return (
      <div style={S.overlay}>
        <div style={S.modal}>
          <div style={S.header}>
            <div>
              <div style={S.title}>QRIS Payment</div>
              <div style={S.subtitle}>
                {qrisStep === "loading" && "Membuat QR Code..."}
                {qrisStep === "waiting" && `Customer scan QR untuk Rp ${(qrData?.amount || 0).toLocaleString("id-ID")}`}
                {qrisStep === "paid" && "Pembayaran berhasil! Menyimpan..."}
                {qrisStep === "error" && "Error"}
              </div>
            </div>
            {qrisStep !== "paid" && !submitting && (
              <button onClick={cancelQR} style={S.closeBtn}>✕</button>
            )}
          </div>

          <div style={{padding: 30, textAlign: "center", minHeight: 380, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"}}>
            {qrisStep === "loading" && (
              <>
                <div style={{fontSize: 56, marginBottom: 16}}>⏳</div>
                <div style={{color: "#9CA3AF", fontSize: 14}}>Please wait...</div>
              </>
            )}

            {qrisStep === "waiting" && qrData && (
              <>
                <div style={{
                  background: "white", padding: 20, borderRadius: 16,
                  marginBottom: 20, boxShadow: "0 8px 24px rgba(255,255,255,0.1)"
                }}>
                  <img src={qrData.qrCode} alt="QR Code" style={{width: 260, height: 260, display: "block"}} />
                </div>
                <div style={{fontSize: 18, fontWeight: 700, color: "#F59E0B", fontFamily: "'Inter', sans-serif", letterSpacing: 2}}>
                  {fIDR(qrData.amount)}
                </div>
                <div style={{fontSize: 12, color: "#9CA3AF", marginTop: 8, maxWidth: 320}}>
                  Customer scan QR ini. Otomatis lanjut setelah pembayaran berhasil.
                </div>
                <div style={{fontSize: 11, color: "#6B7280", marginTop: 12}}>
                  Order ID: {mtOrderId}
                </div>
              </>
            )}

            {qrisStep === "paid" && (
              <>
                <div style={{fontSize: 72, marginBottom: 16}}>✅</div>
                <div style={{fontSize: 18, color: "#10B981", fontWeight: 700}}>Payment Successful!</div>
                <div style={{fontSize: 13, color: "#9CA3AF", marginTop: 8}}>Menyimpan order...</div>
              </>
            )}

            {qrisStep === "error" && (
              <>
                <div style={{fontSize: 56, marginBottom: 16}}>⚠️</div>
                <div style={{fontSize: 16, color: "#F87171", marginBottom: 8}}>{error || "Gagal proses QR"}</div>
                <button onClick={cancelQR} style={{...S.btnSecondary, marginTop: 16}}>
                  Kembali ke Split
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Split Modal ───
  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.header}>
          <div>
            <div style={S.title}>Split Payment</div>
            <div style={S.subtitle}>Order #{order.id || "Baru"} · Total {fIDR(total)}</div>
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        <div style={S.summary}>
          <div style={S.summaryRow}>
            <span>Total Order</span>
            <span style={S.totalVal}>{fIDR(total)}</span>
          </div>
          <div style={S.summaryRow}>
            <span>Total Paid</span>
            <span style={{...S.totalVal, color: isComplete ? "#10B981" : "#F59E0B"}}>{fIDR(totalPaid)}</span>
          </div>
          <div style={{...S.summaryRow, ...S.summaryRemaining}}>
            <span>Sisa</span>
            <span style={{
              ...S.totalVal,
              color: isOverpaid ? "#F87171" : isComplete ? "#10B981" : "#F87171"
            }}>
              {isOverpaid ? `+${fIDR(-remaining)} kelebihan` : fIDR(remaining)}
            </span>
          </div>
        </div>

        <div style={S.paymentsList}>
          {payments.map((p, idx) => (
            <div key={idx} style={S.paymentRow}>
              <div style={S.paymentHeader}>
                <span style={S.paymentLabel}>Pembayaran #{idx + 1}</span>
                {payments.length > 1 && (
                  <button onClick={() => removePayment(idx)} style={S.removeBtn}>✕</button>
                )}
              </div>

              <div style={S.methodRow}>
                {["CASH", "QRIS"].map(m => (
                  <button
                    key={m}
                    onClick={() => updatePayment(idx, "method", m)}
                    style={{
                      ...S.methodBtn,
                      ...(p.method === m ? S.methodBtnActive : {})
                    }}
                  >
                    {m === "CASH" ? "💵" : "📱"} {m}
                  </button>
                ))}
              </div>

              {p.method === "QRIS" && (
                <div style={S.qrisHint}>
                  💡 QR akan generate untuk total QRIS portion setelah Selesaikan
                </div>
              )}

              <div style={S.fieldGroup}>
                <label style={S.fieldLabel}>Quantity</label>
                <div style={S.inputRow}>
                  <span style={S.inputPrefix}>Rp</span>
                  <input
                    type="number"
                    value={p.amount}
                    onChange={e => updatePayment(idx, "amount", e.target.value)}
                    style={S.input}
                    placeholder="0"
                  />
                </div>
                <div style={S.quickButtons}>
                  <button onClick={() => setQuickAmount(idx, remaining + (parseInt(p.amount) || 0))} style={S.quickBtn}>Sisa</button>
                  <button onClick={() => setQuickAmount(idx, Math.round(total / 2))} style={S.quickBtn}>1/2</button>
                  <button onClick={() => setQuickAmount(idx, total)} style={S.quickBtn}>Full</button>
                </div>
              </div>

              {p.method === "CASH" && (
                <div style={S.fieldGroup}>
                  <label style={S.fieldLabel}>Cash diterima</label>
                  <div style={S.inputRow}>
                    <span style={S.inputPrefix}>Rp</span>
                    <input
                      type="number"
                      value={p.cashReceived}
                      onChange={e => updatePayment(idx, "cashReceived", e.target.value)}
                      style={S.input}
                      placeholder="0"
                    />
                  </div>
                  {p.change > 0 && (
                    <div style={S.changeRow}>Change: <strong>{fIDR(p.change)}</strong></div>
                  )}
                </div>
              )}
            </div>
          ))}

          <button onClick={addPayment} style={S.addBtn}>➕ Tambah Pembayaran</button>
        </div>

        {error && <div style={S.error}>{error}</div>}

        <div style={S.footer}>
          <button onClick={onClose} style={S.btnSecondary} disabled={submitting}>Cancel</button>
          <button
            onClick={handleSettle}
            style={{
              ...S.btnPrimary,
              ...((!isComplete || isOverpaid) ? S.btnDisabled : {})
            }}
            disabled={submitting || !isComplete || isOverpaid}
          >
            {submitting ? "Memproses..." : isOverpaid ? "Kelebihan!" : !isComplete ? `Kurang ${fIDR(remaining)}` : `✓ Selesaikan ${fIDR(totalPaid)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1500, fontFamily: "'Inter', sans-serif",
    padding: 20,
  },
  modal: {
    width: "min(560px, 100%)", maxHeight: "92vh",
    background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)",
    border: "1px solid #2a2a2a", borderRadius: 16,
    display: "flex", flexDirection: "column", overflow: "hidden",
  },
  header: {
    padding: "20px 24px", borderBottom: "1px solid #2a2a2a",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  title: { fontFamily: "'Inter', sans-serif", fontSize: 28, color: "#F59E0B", letterSpacing: 1.5 },
  subtitle: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
    color: "#F87171", fontSize: 16, cursor: "pointer",
  },
  summary: {
    margin: "16px 20px", padding: "14px 16px", borderRadius: 12,
    background: "rgba(255,255,255,0.03)", border: "1px solid #2a2a2a",
  },
  summaryRow: { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, color: "#D1D5DB" },
  summaryRemaining: { borderTop: "1px solid #2a2a2a", marginTop: 8, paddingTop: 10, fontSize: 14, fontWeight: 600 },
  totalVal: { fontFamily: "'Inter', sans-serif", fontSize: 18, color: "white", letterSpacing: 0.5 },
  paymentsList: { padding: "0 20px 16px", flex: 1, overflowY: "auto" },
  paymentRow: {
    padding: "14px 16px", marginBottom: 12, borderRadius: 12,
    background: "rgba(255,255,255,0.03)", border: "1px solid #2a2a2a",
  },
  paymentHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  paymentLabel: { fontSize: 11, color: "#F59E0B", letterSpacing: 1.5, fontWeight: 700 },
  removeBtn: {
    width: 26, height: 26, borderRadius: 6,
    background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
    color: "#F87171", fontSize: 12, cursor: "pointer",
  },
  methodRow: { display: "flex", gap: 8, marginBottom: 12 },
  methodBtn: {
    flex: 1, padding: "10px", borderRadius: 10,
    background: "rgba(255,255,255,0.02)", border: "1px solid #2a2a2a",
    color: "#9CA3AF", cursor: "pointer", fontSize: 13, fontFamily: "inherit",
  },
  methodBtnActive: {
    background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent)",
    color: "#F59E0B", fontWeight: 700,
  },
  qrisHint: {
    fontSize: 11, color: "#A78BFA", padding: "8px 10px", marginBottom: 10,
    background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)",
    borderRadius: 8,
  },
  fieldGroup: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, color: "#9CA3AF", marginBottom: 4, display: "block" },
  inputRow: { display: "flex", gap: 0, marginBottom: 6 },
  inputPrefix: {
    padding: "10px 12px", background: "rgba(13,17,23,0.7)",
    border: "1px solid #2a2a2a", borderRight: "none", borderRadius: "10px 0 0 10px",
    color: "#9CA3AF", fontSize: 13,
  },
  input: {
    flex: 1, padding: "10px 14px", borderRadius: "0 10px 10px 0",
    background: "rgba(13,17,23,0.7)", border: "1px solid #2a2a2a", color: "white",
    fontSize: 15, fontFamily: "inherit", outline: "none",
  },
  quickButtons: { display: "flex", gap: 6 },
  quickBtn: {
    flex: 1, padding: "6px", borderRadius: 6,
    background: "transparent", border: "1px solid #2a2a2a", color: "#9CA3AF",
    cursor: "pointer", fontSize: 11, fontFamily: "inherit",
  },
  changeRow: { fontSize: 12, color: "#10B981", padding: "4px 0" },
  addBtn: {
    width: "100%", padding: "10px", borderRadius: 10,
    background: "transparent", border: "1px dashed color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent)", color: "#F59E0B",
    cursor: "pointer", fontSize: 13, fontFamily: "inherit",
  },
  error: { padding: "10px 20px", color: "#F87171", fontSize: 12 },
  footer: {
    padding: "14px 20px", borderTop: "1px solid #2a2a2a",
    display: "flex", gap: 10, justifyContent: "flex-end",
  },
  btnSecondary: {
    padding: "10px 20px", borderRadius: 10,
    background: "transparent", border: "1px solid #2a2a2a", color: "#9CA3AF",
    cursor: "pointer", fontFamily: "inherit", fontSize: 14,
  },
  btnPrimary: {
    padding: "10px 20px", borderRadius: 10,
    background: "linear-gradient(135deg, #10B981, #059669)",
    border: "none", color: "white",
    cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700,
  },
  btnDisabled: {
    background: "#374151", cursor: "not-allowed",
  },
};
