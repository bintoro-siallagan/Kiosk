import { useState } from "react";
import * as audio from "./audio.js";

const S = {
  page: {
    minHeight: '100vh',
    background: '#0a0a0a',
    color: '#fff',
    padding: '32px 24px',
    fontFamily: '-apple-system, system-ui, sans-serif',
  },
  title:    { fontSize: 32, fontWeight: 700, letterSpacing: 4, textAlign: 'center', margin: 0 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 4, marginBottom: 32 },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    maxWidth: 920,
    margin: '0 auto',
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 480,
  },
  chip: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.08)',
    padding: '4px 10px',
    borderRadius: 8,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  label: {
    fontSize: 11,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 16,
    marginBottom: 8,
  },
  amount: { fontSize: 32, fontWeight: 700, color: '#fb923c', fontVariantNumeric: 'tabular-nums' },
  receivedDisplay: {
    fontSize: 40,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    marginBottom: 20,
  },
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    marginBottom: 20,
  },
  qBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    borderRadius: 10,
    padding: '14px 8px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background .1s',
  },
  qBtnPas:   { background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.4)', color: '#fb923c' },
  qBtnReset: { background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' },
  changeBox: {
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  changeLabel: { fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.5)', marginBottom: 4 },
  changeValue: { fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  changeOK:    { color: '#4ade80' },
  changeShort: { color: '#f87171' },
  confirmBtn: {
    width: '100%',
    background: '#fb923c',
    border: 'none',
    color: '#000',
    borderRadius: 12,
    padding: '18px 24px',
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1,
    cursor: 'pointer',
    marginTop: 'auto',
  },
  confirmDisabled: {
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.3)',
    cursor: 'not-allowed',
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff',
    borderRadius: 12,
    padding: '12px 20px',
    fontSize: 13,
    cursor: 'pointer',
    marginTop: 16,
  },
  footer: { textAlign: 'center', marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.3)' },
};

export default function CashPayment({ items = [], amount = 0, subtotal = 0, promo = null, orderNum, onSuccess, onBack, isMember = false, pointsRedeemed = 0, pointsDiscount = 0 }) {
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
      <h1 style={S.title}>BINTORO</h1>
      <p style={S.subtitle}>Pembayaran Tunai</p>

      <div style={S.grid}>
        {/* LEFT — order summary */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={S.chip}>#{orderNum}</span>
            <span style={S.chip}>{items.length} item</span>
          </div>

          <div style={S.label}>ITEMS</div>
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
                        <span>+ Topping ekstra</span>
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
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#FB923C",padding:"4px 0"}}>
                <span>🎁 Tukar {pointsRedeemed} poin</span>
                <span>− Rp {pointsDiscount.toLocaleString('id-ID')}</span>
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#666",padding:"4px 0",fontStyle:"italic"}}>
              <span>PPN</span>
              <span>sudah termasuk</span>
            </div>
          </div>

          <div style={{ paddingTop: 12, borderTop: '2px solid rgba(255,255,255,0.15)' }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
              <div style={S.label}>TOTAL</div>
              <div style={S.amount}>Rp {amount.toLocaleString('id-ID')}</div>
            </div>
            {isMember && (
              <div style={{marginTop:10,padding:"10px 12px",background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.2)",borderRadius:8,fontSize:12,color:"#34D399",textAlign:"center"}}>
                🎁 Anda akan dapat <strong>{Math.floor(amount / 1000)} poin</strong> dari pembelian ini
              </div>
            )}
          </div>

          {onBack && <button style={S.backBtn} onClick={onBack}>← Kembali</button>}
        </div>

        {/* RIGHT — cash entry */}
        <div style={S.card}>
          <div style={S.label}>UANG DITERIMA</div>
          <div style={S.receivedDisplay}>Rp {received.toLocaleString('id-ID')}</div>

          <div style={S.quickGrid}>
            <button style={S.qBtn} onClick={() => addAmount(50000)}>+ 50rb</button>
            <button style={S.qBtn} onClick={() => addAmount(100000)}>+ 100rb</button>
            <button style={S.qBtn} onClick={() => addAmount(200000)}>+ 200rb</button>
            <button style={S.qBtn} onClick={() => addAmount(500000)}>+ 500rb</button>
            <button style={{ ...S.qBtn, ...S.qBtnPas }} onClick={setExact}>UANG PAS</button>
            <button style={{ ...S.qBtn, ...S.qBtnReset }} onClick={reset}>RESET</button>
          </div>

          {received > 0 && (
            <div style={S.changeBox}>
              <div style={S.changeLabel}>{isEnough ? 'KEMBALIAN' : 'KURANG'}</div>
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
            ✓ KONFIRMASI BAYAR
          </button>
        </div>
      </div>

      <div style={S.footer}>BINTORO Kiosk · {new Date().toLocaleString('id-ID')}</div>
    </div>
  );
}
