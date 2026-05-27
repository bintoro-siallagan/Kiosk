import { useState, useCallback, useEffect } from "react";
import * as audio from "./audio.js";
import QRISPayment from "./QRISPayment.jsx";
import CashPayment from "./CashPayment.jsx";
import { api } from "./api";
import { calcServiceCharge, loadServiceChargeConfig } from "./pricing.js";
import API_HOST from "./apiBase.js";

const S = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse 70% 55% at 50% 38%, rgba(70,76,98,0.45) 0%, transparent 70%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)',
    backgroundAttachment: 'fixed',
    color: '#fff',
    padding: '40px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Inter',sans-serif",
  },
  title: { fontSize: 28, fontWeight: 600, letterSpacing: '-0.8px', margin: 0, color: 'rgba(255,255,255,0.95)' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 6, marginBottom: 22, letterSpacing: '-0.2px' },
  totalLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase', fontWeight: 500 },
  totalAmount: { fontSize: 56, fontWeight: 700, color: '#fff', marginBottom: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: '-2px', textShadow: '0 4px 24px rgba(0,0,0,0.45)' },
  methodGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 14,
    width: '100%',
    maxWidth: 640,
    boxSizing: 'border-box',
    padding: '0 8px',
  },
  // Liquid-glass method card — auto-fits column, comfortable padding, no overlap
  methodCard: {
    background: 'linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 22,
    padding: '36px 20px 30px',
    cursor: 'pointer',
    transition: 'background .2s cubic-bezier(.2,.8,.2,1), border-color .2s ease, transform .2s ease, box-shadow .2s ease',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    userSelect: 'none',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 24px rgba(0,0,0,0.28)',
    minHeight: 200,
    boxSizing: 'border-box',
  },
  methodIcon: { fontSize: 56, lineHeight: 1, filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.35))' },
  methodLabel: { fontSize: 19, fontWeight: 600, letterSpacing: '-0.4px', color: 'rgba(255,255,255,0.95)', textAlign: 'center' },
  methodSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '-0.1px', textAlign: 'center', lineHeight: 1.4 },
  backBtn: {
    marginTop: 32,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.7)',
    borderRadius: 999,
    padding: '11px 26px',
    fontSize: 13, fontWeight: 500,
    cursor: 'pointer',
    fontFamily: "'Inter',sans-serif",
    letterSpacing: '-0.1px',
  },
};

export default function Payment({ cart, orderType, promo, tableData, customerData, onSuccess, onBack }) {
  const [method, setMethod] = useState(null); // null | 'cash' | 'qris'
  const [cashStep, setCashStep] = useState('customer'); // 'customer' | 'kasir'
  const orderNum = String(Math.floor(Math.random() * 9000 + 1000));
  // Reset cashStep when method changes
  const handleSetMethod = (m) => { setCashStep('customer'); setMethod(m); };

  // === Payment methods (fetched from backend) ===
  const [enabledMethods, setEnabledMethods] = useState(null);

  useEffect(() => {
    api.getPaymentMethods()
      .then(setEnabledMethods)
      .catch(() => setEnabledMethods({ cash: true, qris: true })); // fallback
  }, []);

  // === Convenience fee — biaya layanan transaksi digital (QRIS) ===
  const API_BASE = API_HOST;
  const [convFee, setConvFee] = useState({ enabled: 0, amount: 0, label: "Biaya Layanan" });
  useEffect(() => {
    fetch(`${API_BASE}/api/convenience-fee`).then(r => r.json())
      .then(c => c && setConvFee(c)).catch(() => {});
  }, [API_BASE]);
  const qrisFee = convFee.enabled ? Math.round(convFee.amount) : 0;

  // Auto-select if only ONE method enabled (skip selector)
  useEffect(() => {
    if (!enabledMethods || method) return;
    const enabled = Object.entries(enabledMethods).filter(([,v]) => v).map(([k]) => k);
    if (enabled.length === 1) setMethod(enabled[0]);
  }, [enabledMethods, method]);

  // === Hitung total dari cart ===
  const subtotal   = cart.reduce((sum, e) => sum + (e.item.price * e.qty + (e.addonTotal || 0)), 0);
  const afterPromo = Math.max(0, subtotal - (promo?.discount || 0));

  // === Loyalty: use customer's manual choice from CustomerInput ===
  const pointsRedeemed = customerData?.pointsRedeemed || 0;
  // Estimate points earned (1 poin per Rp 1.000 of post-tax amount, server-side will recalc exact)
  const pointsEarnedEst = customerData?.phone ? Math.floor(0) : 0;  // only if customer is member
  const pointsDiscount = customerData?.pointsDiscount || 0;


  const afterPoints = Math.max(0, afterPromo - pointsDiscount);

  // Service charge — auto 5% dine-in (config dari /api/pos/config)
  const [serviceConfig, setServiceConfig] = useState({ pct: 5, enabled: true, label: "Service Charge" });
  useEffect(() => { loadServiceChargeConfig().then(setServiceConfig); }, []);
  const serviceCharge = calcServiceCharge(afterPoints, orderType, serviceConfig);

  // Inclusive pricing: menu prices already gross. Tax extracted for disclosure only.
  const tax    = Math.round((afterPoints) * 11 / 111);
  const amount = afterPoints + serviceCharge; // customer pays afterPoints + service charge

  // === Map cart ke shape yang dipake child ===
  const items = cart.map(e => ({
    name:           e.item.name,
    price:          e.item.price,
    qty:            e.qty,
    addonLabels:    e.addonLabels || [],
    addonBreakdown: e.addonBreakdown || [],
    addonTotal:     e.addonTotal || 0,
  }));

  // === Shared post-payment handler (Cash & QRIS pake yang sama) ===
  const handlePaymentSuccess = useCallback(async (payInfo, payType) => {
    let createdOrder = null;
    try {
      createdOrder = await api.createOrder({
        type:           orderType,
        table:          tableData?.id || tableData?.name || (orderType === "dine" ? "A1" : "-"),
        pay:            payType, // "CASH" | "QRIS"
        customerId:     customerData?.customer?.id,
        customerName:   customerData?.name,
        customerPhone:  customerData?.phone,
        promoCode:      promo?.code     || null,
        promoDiscount:  promo?.discount || 0,
        promoFreeItems: promo?.freeItems || null,
        pointsRedeemed,
        pointsDiscount,
        midtransId:     payInfo?.midtrans?.transactionId || null,
        cashReceived:   payInfo?.cashReceived ?? null,
        cashChange:     payInfo?.cashChange   ?? null,
        items: cart.map(e => ({
          e:          e.item.emoji,
          n:          e.item.name,
          q:          e.qty,
          p:          e.item.price,
          addonTotal: e.addonTotal,
          addons:     e.addons,
        })),
      });
    } catch {}

    if (customerData?.phone && createdOrder?.id) {
      try {
        const result = await api.sendWATracking({
          phone:        customerData.phone,
          orderId:      createdOrder.id,
          customerName: customerData.name,
        });
        if (result.waUrl) {
          window.__lastWAUrl    = result.waUrl;
          window.__lastTrackUrl = result.trackUrl;
          window.__lastOrderId  = createdOrder.id;
        }
      } catch {}
    }

    onSuccess({ orderId: createdOrder?.id, ...payInfo });
  }, [cart, orderType, promo, tableData, customerData, onSuccess]);

  // === SELECTOR ===
  if (!method) {
    const hoverIn = (e) => {
      e.currentTarget.style.background  = 'rgba(255,255,255,0.08)';
      e.currentTarget.style.borderColor = '#fb923c';
      e.currentTarget.style.transform   = 'translateY(-2px)';
    };
    const hoverOut = (e) => {
      e.currentTarget.style.background  = 'rgba(255,255,255,0.04)';
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
      e.currentTarget.style.transform   = 'translateY(0)';
    };

    return (
      <div style={S.page}>
        <h1 style={S.title}>KaryaOS</h1>
        <p style={S.subtitle}>Pilih Metode Pembayaran</p>

        <div style={S.totalLabel}>TOTAL</div>
        {pointsRedeemed > 0 && (
          <div style={{fontSize:13,color:"#FB923C",marginBottom:6,letterSpacing:0.5}}>
            🎁 Tukar {pointsRedeemed} poin · Hemat Rp {pointsDiscount.toLocaleString('id-ID')}
          </div>
        )}
        <div style={S.totalAmount}>Rp {amount.toLocaleString('id-ID')}</div>

        {promo?.paymentHint && (
          <div style={{background:"rgba(245,158,11,0.12)",border:"1px solid #F59E0B44",borderRadius:12,padding:"12px 16px",margin:"12px auto 16px",maxWidth:480,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>🏦</span>
            <div style={{fontSize:13,color:"#F59E0B",fontWeight:600,lineHeight:1.4}}>
              Reminder: bayar pakai aplikasi <strong>{promo.paymentHint}</strong> untuk dapat promo <strong>{promo.code}</strong>
            </div>
          </div>
        )}

        <div style={S.methodGrid}>
          {enabledMethods?.cash && (
            <div style={S.methodCard} onClick={() => setMethod('cash')} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
              <div style={S.methodIcon}>💵</div>
              <div style={S.methodLabel}>Cash</div>
              <div style={S.methodSub}>Pay at the counter</div>
            </div>
          )}

          {enabledMethods?.qris && (
            <div style={S.methodCard} onClick={() => setMethod('qris')} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
              <div style={S.methodIcon}>📱</div>
              <div style={S.methodLabel}>QRIS</div>
              <div style={S.methodSub}>{qrisFee > 0 ? `Scan & pay · +Rp ${qrisFee.toLocaleString('id-ID')}` : 'Scan & pay'}</div>
            </div>
          )}

          {enabledMethods && !enabledMethods.cash && !enabledMethods.qris && (
            <div style={{textAlign:"center",color:"#FCA5A5",padding:24,gridColumn:"1/-1",fontSize:14}}>
              ⚠️ No payment methods available. Please contact staff.
            </div>
          )}
        </div>

        {onBack && <button style={S.backBtn} onClick={onBack}>← Kembali</button>}
      </div>
    );
  }

  // === CASH — CUSTOMER HANDOFF ===
  if (method === 'cash' && cashStep === 'customer') {
    return (
      <div style={{...S.page, justifyContent:'center', gap:20, padding:'40px 24px'}}>
        <div style={{fontSize:72, lineHeight:1}}>🧾</div>
        <div style={{fontFamily:"'Inter',sans-serif", fontSize:24, fontWeight:900, letterSpacing:3, color:'#fff'}}>PESANAN #{orderNum}</div>
        <div style={{fontSize:13, color:'rgba(255,255,255,0.4)', letterSpacing:2}}>TOTAL PEMBAYARAN</div>
        <div style={{fontSize:56, fontWeight:800, color:'#fb923c', fontVariantNumeric:'tabular-nums', lineHeight:1}}>
          Rp {amount.toLocaleString('id-ID')}
        </div>
        <div style={{background:'rgba(251,146,60,0.08)', border:'2px solid rgba(251,146,60,0.25)', borderRadius:20, padding:'24px 40px', textAlign:'center', maxWidth:460, marginTop:8}}>
          <div style={{fontSize:48, marginBottom:12}}>💵</div>
          <div style={{fontSize:22, fontWeight:800, marginBottom:8, letterSpacing:1}}>Silakan ke Kasir</div>
          <div style={{fontSize:14, color:'rgba(255,255,255,0.5)', lineHeight:1.8}}>
            Tunjukkan nomor pesanan <strong style={{color:'#fb923c'}}>#{orderNum}</strong> ke kasir<br/>
            untuk menyelesaikan pembayaran tunai
          </div>
        </div>
        <button style={{marginTop:16, background:'transparent', border:'1px solid rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.2)', borderRadius:10, padding:'10px 20px', fontSize:10, letterSpacing:3, cursor:'pointer'}}
          onClick={() => setCashStep('kasir')}>
          KASIR — PROSES PEMBAYARAN
        </button>
      </div>
    );
  }

  // === CASH ===
  if (method === 'cash') {
    return (
      <CashPayment
        items={items}
        amount={amount}
        subtotal={subtotal}
        promo={promo}
        orderNum={orderNum}
        orderType={orderType}
        onSuccess={(info) => handlePaymentSuccess(info, "CASH")}
        onBack={() => setMethod(null)}
        isMember={!!customerData?.phone}
        pointsRedeemed={pointsRedeemed} pointsDiscount={pointsDiscount}
        serviceCharge={serviceCharge}
        serviceChargeLabel={serviceConfig.label}
        serviceChargePct={serviceConfig.pct} />
    );
  }

  // === QRIS — total + biaya layanan ===
  return (
    <QRISPayment
      items={items}
      amount={amount + qrisFee}
      convenienceFee={qrisFee}
      convenienceLabel={convFee.label}
      customerInfo={{ name: customerData?.name, phone: customerData?.phone }}
      orderType={orderType}
      orderNum={orderNum}
      onSuccess={(info) => handlePaymentSuccess(info, "QRIS")}
      onBack={() => setMethod(null)}
      onFallback={() => setMethod(null)}
    pointsRedeemed={pointsRedeemed} pointsDiscount={pointsDiscount} />
  );
}
