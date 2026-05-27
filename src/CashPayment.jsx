import { useState } from "react";
import * as audio from "./audio.js";

const S = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse 70% 55% at 50% 38%, rgba(70,76,98,0.45) 0%, transparent 70%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)',
    backgroundAttachment: 'fixed',
    color: '#fff',
    padding: '32px 24px',
    fontFamily: "'Inter',sans-serif",
  },
  title: { fontSize: 24, fontWeight: 600, letterSpacing: '-0.6px', textAlign: 'center', margin: 0, color: 'rgba(255,255,255,0.95)' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 6, marginBottom: 26 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
    gap: 16,
    maxWidth: 920,
    margin: '0 auto',
  },
  // Liquid-glass card
  card: {
    background: 'linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 20,
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 480,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 24px rgba(0,0,0,0.28)',
  },
  chip: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontVariantNumeric: 'tabular-nums',
  },
  label: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    fontWeight: 500,
  },
  amount: { fontSize: 28, fontWeight: 600, color: '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.6px' },
  receivedDisplay: {
    fontSize: 36,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    marginBottom: 18,
    letterSpacing: '-0.6px',
    color: 'rgba(255,255,255,0.95)',
  },
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    marginBottom: 20,
  },
  qBtn: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    color: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    padding: '13px 8px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all .15s ease',
    fontFamily: "'Inter',sans-serif",
    letterSpacing: '-0.2px',
    fontVariantNumeric: 'tabular-nums',
  },
  qBtnPas: {
    background: 'radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 55%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))',
    border: '1px solid rgba(255,255,255,0.16)',
    color: '#fff',
    textShadow: '0 1px 2px rgba(0,0,0,0.45)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)',
  },
  qBtnReset: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.5)',
  },
  changeBox: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    textAlign: 'center',
  },
  changeLabel: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(255,255,255,0.45)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 500 },
  changeValue: { fontSize: 26, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' },
  changeOK: { color: '#34D399' },
  changeShort: { color: 'rgba(248,113,113,0.9)' },
  confirmBtn: {
    width: '100%',
    background: 'radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))',
    border: '1px solid rgba(255,255,255,0.16)',
    color: '#fff',
    textShadow: '0 1px 3px rgba(0,0,0,0.45)',
    borderRadius: 14,
    padding: '16px 24px',
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: '-0.2px',
    cursor: 'pointer',
    marginTop: 'auto',
    fontFamily: "'Inter',sans-serif",
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)',
  },
  confirmDisabled: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.25)',
    cursor: 'not-allowed',
    textShadow: 'none',
    boxShadow: 'none',
  },
  backBtn: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.7)',
    borderRadius: 999,
    padding: '9px 18px',
    fontSize: 12, fontWeight: 500,
    cursor: 'pointer',
    marginTop: 14,
    fontFamily: "'Inter',sans-serif",
  },
  footer: { textAlign: 'center', marginTop: 22, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '-0.1px' },
};

export default function CashPayment({ items = [], amount = 0, subtotal = 0, promo = null, orderNum, onSuccess, onBack, isMember = false, pointsRedeemed = 0, pointsDiscount = 0, serviceCharge = 0, serviceChargeLabel = "Service Charge", serviceChargePct = 5, orderType = null }) {
  const [received, setReceived] = useState(0);

  const change   = received - amount;
  const isEnough = received >= amount;

  const addAmount = (n) => setReceived(r => r + n);
  const setExact  = () => setReceived(amount);
  const reset     = () => setReceived(0);

  const confirm = () => {
    if (!isEnough) return;
    audio.playPaymentSuccess();
    audio.speakThanks();
    onSuccess({ cashReceived: received, cashChange: change });
  };

  return (
    <div style={S.page}>
      <h1 style={S.title}>karyaos</h1>
      <p style={S.subtitle}>Cash payment</p>

      <div style={S.grid}>
        {/* LEFT — order summary */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={S.chip}>#{orderNum}</span>
            <span style={S.chip}>{items.length} item{items.length === 1 ? '' : 's'}</span>
          </div>

          <div style={S.label}>Items</div>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
            {items.map((it, i) => {
              const qty = it.qty ?? 1;
              const baseTotal = (it.price ?? 0) * qty;
              const breakdown = it.addonBreakdown || [];
              const addonTotalForItem = (it.addonTotal ?? 0) * qty;
              const hasBreakdown = breakdown.length > 0;
              return (
                <div key={i} style={{padding:'8px 0',fontSize:13,borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span>{qty}× {it.name}</span>
                    <span>Rp {baseTotal.toLocaleString('id-ID')}</span>
                  </div>
                  {hasBreakdown && breakdown.map((a, j) => {
                    const linePrice = (a.price || 0) * qty;
                    return (
                      <div key={j} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#888',marginLeft:16,marginTop:3,lineHeight:1.4}}>
                        <span>+ {a.name}</span>
                        <span style={{color: linePrice > 0 ? '#888' : '#34D399'}}>
                          {linePrice > 0 ? `Rp ${linePrice.toLocaleString('id-ID')}` : 'gratis'}
                        </span>
                      </div>
                    );
                  })}
                  {hasBreakdown && (() => {
                    const explicit = breakdown.reduce((s,a)=>s+(a.price||0),0);
                    const extra = Math.max(0, (it.addonTotal||0) - explicit) * qty;
                    return extra > 0 ? (
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#888',marginLeft:16,marginTop:3,lineHeight:1.4}}>
                        <span>+ Extra toppings</span>
                        <span>Rp {extra.toLocaleString('id-ID')}</span>
                      </div>
                    ) : null;
                  })()}
                  {!hasBreakdown && it.addonLabels?.length > 0 && addonTotalForItem > 0 && (
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#888',marginLeft:16,marginTop:3,lineHeight:1.4}}>
                      <span>+ {it.addonLabels.join(', ')}</span>
                      <span>Rp {addonTotalForItem.toLocaleString('id-ID')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* RINGKASAN — transparant breakdown so customer ga bingung */}
          <div style={{ paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)', marginBottom: 12 }}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#aaa",padding:"4px 0"}}>
              <span>Subtotal</span>
              <span>Rp {(subtotal || amount).toLocaleString('id-ID')}</span>
            </div>
            {promo && promo.discount > 0 && (
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#34D399",padding:"4px 0"}}>
                <span>🎟 Promo {promo.code || ""}</span>
                <span>− Rp {promo.discount.toLocaleString('id-ID')}</span>
              </div>
            )}
            {promo?.freeItems?.length > 0 && (
              <div style={{fontSize:11,color:"#6EE7B7",padding:"2px 0 6px 18px",fontStyle:"italic"}}>
                🎁 GRATIS: {promo.freeItems.map(fi => `${fi.qty}× ${fi.name}`).join(", ")}
              </div>
            )}
            {pointsRedeemed > 0 && (
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--brand-primary,#FF6B35)",padding:"4px 0"}}>
                <span>🎁 Redeemed {pointsRedeemed} pts</span>
                <span>− Rp {pointsDiscount.toLocaleString('id-ID')}</span>
              </div>
            )}
            {serviceCharge > 0 && (
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"rgba(251,191,36,0.85)",padding:"4px 0",fontWeight:500}}>
                <span>{serviceChargeLabel} · {serviceChargePct}%</span>
                <span>+ Rp {serviceCharge.toLocaleString('id-ID')}</span>
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(255,255,255,0.4)",padding:"4px 0",fontStyle:"italic"}}>
              <span>VAT</span>
              <span>included</span>
            </div>
          </div>

          <div style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
              <div style={S.label}>Total{orderType ? (orderType === "dine-in" || orderType === "dine" ? " · 🪑" : " · 🛍️") : ""}</div>
              <div style={S.amount}>Rp {amount.toLocaleString('id-ID')}</div>
            </div>
            {isMember && (
              <div style={{marginTop:10,padding:"10px 12px",background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.22)",borderRadius:10,fontSize:12,color:"#34D399",textAlign:"center",fontFamily:"'Inter',sans-serif"}}>
                🎁 You'll earn <strong>{Math.floor(amount / 1000)} pts</strong> from this purchase
              </div>
            )}
          </div>

          {onBack && <button style={S.backBtn} onClick={onBack}>← Back</button>}
        </div>

        {/* RIGHT — cash entry */}
        <div style={S.card}>
          <div style={S.label}>Cash received</div>
          <div style={S.receivedDisplay}>Rp {received.toLocaleString('id-ID')}</div>

          <div style={S.quickGrid}>
            <button style={S.qBtn} onClick={() => addAmount(50000)}>+ 50k</button>
            <button style={S.qBtn} onClick={() => addAmount(100000)}>+ 100k</button>
            <button style={S.qBtn} onClick={() => addAmount(200000)}>+ 200k</button>
            <button style={S.qBtn} onClick={() => addAmount(500000)}>+ 500k</button>
            <button style={{ ...S.qBtn, ...S.qBtnPas }} onClick={setExact}>Exact</button>
            <button style={{ ...S.qBtn, ...S.qBtnReset }} onClick={reset}>Reset</button>
          </div>

          {received > 0 && (
            <div style={S.changeBox}>
              <div style={S.changeLabel}>{isEnough ? 'Change' : 'Short'}</div>
              <div style={{ ...S.changeValue, ...(isEnough ? S.changeOK : S.changeShort) }}>
                Rp {Math.abs(change).toLocaleString('id-ID')}
              </div>
            </div>
          )}

          <button
            style={{ ...S.confirmBtn, ...(isEnough ? {} : S.confirmDisabled) }}
            disabled={!isEnough}
            onClick={confirm}
          >
            ✓ Confirm payment
          </button>
        </div>
      </div>

      <div style={S.footer}>karyaos kiosk · {new Date().toLocaleString('id-ID')}</div>
    </div>
  );
}
