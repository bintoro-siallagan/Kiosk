import { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3011";
const fmt = (n) => (n || 0).toLocaleString("id-ID");

// Broadcast to CDS helper
const cdsCast = (event, data) => {
  fetch(`${API_BASE}/api/pos/broadcast`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ event, data })
  }).catch(() => {});
};

export default function POSConfirm({ order, cashier, onBack, onCancel, onSuccess }) {
  const [payMethod, setPayMethod] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [qrisFlow, setQrisFlow] = useState(false);

  // Broadcast payment method to CDS (anti-fraud: customer sees method live)
  useEffect(() => {
    cdsCast("pos:payment_method", { method: payMethod });
  }, [payMethod]);
  useEffect(() => {
    return () => cdsCast("pos:payment_method", { method: null });
  }, []);

  const cart = order.cart || [];
  const subtotal = order.subtotal || 0;

  const submitOrder = async (payOverride, midtransOrderId) => {
    setBusy(true);
    const action = order.action || "pay";
    const status = action === "openTab" ? "tab_open" : "waiting";

    try {
      const r = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          type: order.type === "dine-in" ? "dine" : "takeaway",
          table: order.table?.id || null,
          items: cart.map(ci => ({
            e: ci.emoji || "",
            n: ci.name,
            q: ci.qty,
            p: ci.price,
            addonTotal: ci.addonTotal || 0,
            addons: ci.addons || {}
          })),
          pay: payOverride || payMethod,
          subtotal,
          total: subtotal,
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

      // Mark table as occupied for dine-in
      if (order.type === "dine-in" && order.table?.id) {
        fetch(`${API_BASE}/api/tables/${order.table.id}`, {
          method: "PATCH",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({status: "occupied"})
        }).catch(() => {});
      }

      // Broadcast success to CDS
      cdsCast("pos:order_complete", { order: saved });

      onSuccess(saved);
    } catch (e) {
      alert("Gagal save order: " + e.message);
      setBusy(false);
    }
  };

  const handleConfirm = () => {
    if (payMethod === "QRIS") {
      setQrisFlow(true);
    } else {
      submitOrder("CASH");
    }
  };

  if (qrisFlow) {
    return <POSQRISFlow
      cart={cart}
      subtotal={subtotal}
      order={order}
      onCancel={() => setQrisFlow(false)}
      onPaid={(midtransOrderId) => {
        submitOrder("QRIS", midtransOrderId);
      }}
    />;
  }

  return (
    <div style={S.root}>
      <header style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>← Back</button>
        <h1 style={S.headTitle}>Konfirmasi Pembayaran</h1>
        <button onClick={onCancel} style={S.iconBtn}>✕</button>
      </header>

      <main style={S.main}>
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
                {order.customerPoints > 0 && <span style={{color:"#F59E0B",marginLeft:8,fontSize:12}}>· {order.customerPoints} poin</span>}
              </span>
            </div>
          )}
          <div style={S.metaRow}>
            <span style={S.metaLabel}>Kasir</span>
            <span style={S.metaValue}>👤 {cashier?.name}</span>
          </div>
        </div>

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

        <div style={S.subtotalCard}>
          <div>
            <div style={S.subLabel}>Subtotal</div>
            <div style={S.taxNote}>PPN 10% included</div>
          </div>
          <div style={S.subAmount}>Rp {fmt(subtotal)}</div>
        </div>

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
          </div>
        </div>

        <button onClick={handleConfirm} disabled={busy} style={S.confirmBtn}>
          {busy ? "..." : payMethod === "QRIS" ? "📱 Tampilkan QR ke Customer" : "✓ Konfirmasi Bayar"}
        </button>
      </main>
    </div>
  );
}

// ── QRIS Flow Sub-component ─────────────────────────────────────────
function POSQRISFlow({ cart, subtotal, order, onCancel, onPaid }) {
  const [status, setStatus] = useState("loading"); // loading | waiting | paid | timeout | error
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
            id: c.id,
            n: c.name,
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

      const qr = { qrCode: qrUrl, amount: subtotal, midtransOrderId: mtOrderId };
      setQrData(qr);
      setStatus("waiting");

      // Broadcast to CDS
      cdsCast("pos:payment_qris", qr);

      // Start polling
      pollRef.current = setInterval(() => pollStatus(mtOrderId), 3000);
    } catch (e) {
      setErrMsg(e.message);
      setStatus("error");
    }
  };

  const pollStatus = async (mtOrderId) => {
    try {
      const r = await fetch(`${API_BASE}/api/payment/status/${mtOrderId}`);
      if (r.ok) {
        const data = await r.json();
        const st = data.status || data.transaction_status;
        if (st === "settlement" || st === "capture" || st === "paid" || st === "success") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("paid");
          setTimeout(() => onPaid(mtOrderId), 1500);
        } else if (st === "deny" || st === "cancel" || st === "expire") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("timeout");
        }
      }
    } catch {}
  };

  const handleCancel = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    cdsCast("pos:reset", {});
    onCancel();
  };

  return (
    <div style={S.root}>
      <header style={S.header}>
        <button onClick={handleCancel} style={S.iconBtn}>← Cancel</button>
        <h1 style={S.headTitle}>QRIS Payment</h1>
        <span style={{...S.iconBtn, opacity:0, pointerEvents:"none"}}>✕</span>
      </header>

      <main style={{...S.main, alignItems:"center", textAlign:"center"}}>
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
              <span style={{fontSize:32, fontFamily:"'Bebas Neue',cursive", color:"#F59E0B", letterSpacing:2}}>
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

const S = {
  root: { minHeight:"100vh", background:"#111", color:"#fff", fontFamily:"'DM Sans',sans-serif",
    display:"flex", flexDirection:"column" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"16px 24px", borderBottom:"1px solid #222" },
  headTitle: { fontFamily:"'Sacramento',cursive", fontSize:32, color:"#F59E0B", margin:0 },
  iconBtn: { background:"transparent", border:"1px solid #333", color:"#aaa",
    padding:"8px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit" },
  main: { flex:1, padding:"24px 20px", maxWidth:640, margin:"0 auto", width:"100%",
    boxSizing:"border-box", display:"flex", flexDirection:"column", gap:16 },

  metaCard: { background:"#0a0a0a", border:"1px solid #222", borderRadius:14, padding:16 },
  metaRow: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0" },
  metaLabel: { fontSize:13, color:"#888" },
  metaValue: { fontSize:14, fontWeight:600 },

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

  subtotalCard: { background:"#0a0a0a", border:"1px solid #F59E0B", borderRadius:14,
    padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" },
  subLabel: { fontSize:13, fontWeight:600 },
  taxNote: { fontSize:10, color:"#666", marginTop:2 },
  subAmount: { fontFamily:"'Sacramento',cursive", fontSize:36, color:"#F59E0B", letterSpacing:1 },

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

  confirmBtn: { background:"#F59E0B", color:"#111", border:"none", borderRadius:14,
    padding:"18px", fontFamily:"inherit", fontSize:16, fontWeight:800,
    letterSpacing:1, cursor:"pointer", boxShadow:"0 0 30px rgba(245,158,11,0.3)",
    marginTop:8 }
};
