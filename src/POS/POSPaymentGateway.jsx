// client/src/POS/POSPaymentGateway.jsx
// Modal pembayaran via gateway — tampil QRIS dinamis + countdown + polling status.
//
// Flow:
//   1. Kasir confirm order → create payment intent via POST /api/payment-gateway/intents
//   2. Backend call Midtrans/Xendit → return QR string + image + expires_at
//   3. Modal tampil QR + countdown 15 menit + auto-poll status tiap 3 detik
//   4. Customer scan via app pembayaran (GoPay/OVO/Dana/dll yang support QRIS)
//   5. Webhook fire → status='paid' → modal auto-detect via polling → success screen
//   6. Optional: kasir bisa manual cancel atau switch ke cash
//
// Props:
//   orderRef, amount, customerName, customerPhone
//   onPaid(intent)  — callback setelah lunas
//   onCancel()      — kasir batal, balik ke pemilihan tender
//   apiBase

import React, { useState, useEffect, useCallback, useMemo } from 'react';

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));

const METHODS = [
  { code: 'qris', name: 'QRIS', icon: '📱', desc: 'Scan dari GoPay/OVO/Dana/ShopeePay/m-banking', providers: ['midtrans', 'xendit'] },
  { code: 'gopay', name: 'GoPay', icon: '🟢', desc: 'Direct GoPay', providers: ['midtrans'] },
  { code: 'ovo', name: 'OVO', icon: '🟣', desc: 'Direct OVO', providers: ['xendit'] },
  { code: 'dana', name: 'Dana', icon: '🔵', desc: 'Direct Dana', providers: ['xendit'] },
  { code: 'shopeepay', name: 'ShopeePay', icon: '🟠', desc: 'Direct ShopeePay', providers: ['midtrans', 'xendit'] },
  { code: 'bca_va', name: 'BCA VA', icon: '🏦', desc: 'Transfer Virtual Account BCA', providers: ['midtrans', 'xendit'] },
  { code: 'bni_va', name: 'BNI VA', icon: '🏦', desc: 'Transfer Virtual Account BNI', providers: ['midtrans', 'xendit'] },
];

export default function POSPaymentGateway({ orderRef, amount, customerName, customerPhone, onPaid, onCancel, apiBase = '' }) {
  const [providers, setProviders] = useState([]);
  const [step, setStep] = useState('select');
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [intent, setIntent] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Tick for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load providers
  useEffect(() => {
    fetch(`${apiBase}/api/payment-gateway/providers`).then(r => r.json()).then(p => {
      setProviders(Array.isArray(p) ? p.filter(x => x.is_active) : []);
    }).catch(() => {});
  }, [apiBase]);

  // Available methods berdasarkan providers yang aktif
  const availableMethods = useMemo(() => {
    const activeCodes = providers.map(p => p.code);
    return METHODS.filter(m => m.providers.some(p => activeCodes.includes(p)));
  }, [providers]);

  // Pick best provider for selected method
  const pickProvider = (methodCode) => {
    const m = METHODS.find(x => x.code === methodCode);
    if (!m) return null;
    const activeCodes = providers.map(p => p.code);
    return m.providers.find(p => activeCodes.includes(p)) || null;
  };

  const createIntent = async (methodCode) => {
    const provCode = pickProvider(methodCode);
    if (!provCode) { setError('Provider belum di-config'); return; }
    setCreating(true); setError('');
    try {
      const r = await fetch(`${apiBase}/api/payment-gateway/intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_code: provCode,
          payment_method: methodCode,
          amount, order_ref: orderRef,
          customer_name: customerName, customer_phone: customerPhone,
          created_by: localStorage.getItem('kasir_name') || 'kasir'
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setIntent(data.intent);
      setSelectedMethod(methodCode);
      setSelectedProvider(provCode);
      setStep('pay');
    } catch (e) {
      setError(e.message);
    }
    setCreating(false);
  };

  // Polling status
  useEffect(() => {
    if (!intent || step !== 'pay') return;
    if (intent.status === 'paid') return;

    const poll = async () => {
      try {
        const r = await fetch(`${apiBase}/api/payment-gateway/intents/${intent.id}`);
        if (!r.ok) return;
        const data = await r.json();
        if (data.status !== intent.status) setIntent(data);
        if (data.status === 'paid') {
          setStep('paid');
          setTimeout(() => onPaid?.(data), 1500);
        }
      } catch {}
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [intent, step, apiBase, onPaid]);

  const cancelIntent = async () => {
    if (intent) {
      try {
        await fetch(`${apiBase}/api/payment-gateway/intents/${intent.id}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'kasir cancel', actor: localStorage.getItem('kasir_name') || 'kasir' })
        });
      } catch {}
    }
    onCancel?.();
  };

  const manualSync = async () => {
    if (!intent) return;
    try {
      const r = await fetch(`${apiBase}/api/payment-gateway/intents/${intent.id}/sync`, { method: 'POST' });
      const data = await r.json();
      if (data.status === 'paid') {
        const fresh = await fetch(`${apiBase}/api/payment-gateway/intents/${intent.id}`).then(r => r.json());
        setIntent(fresh); setStep('paid');
        setTimeout(() => onPaid?.(fresh), 1500);
      } else {
        alert(`Status: ${data.status || 'no change'}`);
      }
    } catch (e) { alert(e.message); }
  };

  const secondsLeft = intent?.expires_at ? Math.max(0, intent.expires_at - Math.floor(now/1000)) : 0;
  const mmss = `${Math.floor(secondsLeft/60).toString().padStart(2,'0')}:${(secondsLeft%60).toString().padStart(2,'0')}`;

  return (
    <div style={styles.overlay}>
      <div style={styles.box}>
        {/* SELECT METHOD */}
        {step === 'select' && (
          <>
            <div style={styles.header}>
              <h2 style={{margin: 0, color: '#fff'}}>Pilih Metode Bayar</h2>
              <button onClick={onCancel} style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.amountBig}>
              <div style={{fontSize: 11, color: '#9ca3af', textTransform: 'uppercase'}}>Total</div>
              <div style={{fontSize: 32, fontWeight: 700, color: '#f97316'}}>{fmtIDR(amount)}</div>
              {orderRef && <div style={{fontSize: 10, color: '#6b7280', marginTop: 4}}>Order: {orderRef}</div>}
            </div>

            {availableMethods.length === 0 && (
              <div style={styles.warning}>
                ⚠️ Belum ada payment gateway yang aktif. Setup Midtrans atau Xendit dulu di Admin → Payment Gateway.
              </div>
            )}

            <div style={styles.methodGrid}>
              {availableMethods.map(m => (
                <button key={m.code} onClick={() => createIntent(m.code)} disabled={creating} style={styles.methodCard}>
                  <div style={{fontSize: 32, marginBottom: 6}}>{m.icon}</div>
                  <div style={{fontSize: 14, fontWeight: 600, color: '#fff'}}>{m.name}</div>
                  <div style={{fontSize: 10, color: '#9ca3af', marginTop: 4}}>{m.desc}</div>
                </button>
              ))}
            </div>

            {error && <div style={styles.errorBox}>{error}</div>}
            {creating && <div style={{textAlign: 'center', color: '#9ca3af', marginTop: 12}}>Generating QR...</div>}

            <button onClick={onCancel} style={{...styles.btn, width: '100%', marginTop: 12}}>← Batal, Pilih Tender Lain</button>
          </>
        )}

        {/* PAY VIEW */}
        {step === 'pay' && intent && (
          <>
            <div style={styles.header}>
              <div>
                <div style={{fontSize: 11, color: '#9ca3af'}}>via {selectedProvider} · {selectedMethod}</div>
                <h2 style={{margin: '2px 0', color: '#fff'}}>{intent.payment_method === 'qris' ? 'Scan QRIS' : METHODS.find(m => m.code === selectedMethod)?.name || selectedMethod}</h2>
              </div>
              <div style={{...styles.countdown, color: secondsLeft < 60 ? '#ef4444' : secondsLeft < 180 ? '#fbbf24' : '#4ade80'}}>
                ⏱ {mmss}
              </div>
            </div>

            <div style={styles.amountSmall}>
              <span style={{color: '#9ca3af', fontSize: 13}}>Total bayar</span>
              <span style={{fontSize: 22, fontWeight: 700, color: '#f97316'}}>{fmtIDR(amount)}</span>
            </div>

            {/* QR Display */}
            {(intent.qr_image_url || intent.qr_string) && (
              <div style={styles.qrContainer}>
                {intent.qr_image_url ? (
                  <img src={intent.qr_image_url} alt="QRIS" style={styles.qrImage} />
                ) : (
                  <div style={styles.qrTextFallback}>
                    <div style={{fontSize: 11, color: '#9ca3af', marginBottom: 4}}>QR String:</div>
                    <textarea readOnly value={intent.qr_string} style={styles.qrString} rows={3} />
                    <div style={{fontSize: 10, color: '#6b7280', marginTop: 4}}>Pakai QR generator buat render dari string ini</div>
                  </div>
                )}
                <div style={{textAlign: 'center', marginTop: 8, fontSize: 12, color: '#9ca3af'}}>
                  Scan via GoPay / OVO / Dana / ShopeePay / m-banking
                </div>
              </div>
            )}

            {/* VA Display */}
            {intent.va_number && (
              <div style={styles.vaBox}>
                <div style={{fontSize: 11, color: '#9ca3af', textTransform: 'uppercase'}}>Virtual Account {intent.va_bank}</div>
                <div style={styles.vaNumber}>{intent.va_number}</div>
                <button onClick={() => navigator.clipboard?.writeText(intent.va_number)} style={styles.copyBtn}>Copy</button>
              </div>
            )}

            {/* Deeplink */}
            {intent.deeplink_url && (
              <div style={{textAlign: 'center', marginTop: 12}}>
                <a href={intent.deeplink_url} target="_blank" rel="noopener noreferrer" style={styles.deeplinkBtn}>
                  Buka di app pembayaran →
                </a>
              </div>
            )}

            {/* Status indicator */}
            <div style={styles.statusBar}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                <div style={styles.pulseDot} />
                <span style={{fontSize: 12, color: '#9ca3af'}}>Menunggu pembayaran...</span>
              </div>
              <button onClick={manualSync} style={styles.syncBtn}>↻ Cek Manual</button>
            </div>

            {error && <div style={styles.errorBox}>{error}</div>}

            <div style={{display: 'flex', gap: 8, marginTop: 16}}>
              <button onClick={() => setStep('select')} style={{...styles.btn, flex: 1}}>← Ganti Metode</button>
              <button onClick={cancelIntent} style={{...styles.rejectBtn, flex: 1}}>Batalkan</button>
            </div>
          </>
        )}

        {/* PAID */}
        {step === 'paid' && intent && (
          <div style={{textAlign: 'center', padding: 30}}>
            <div style={{fontSize: 64, marginBottom: 12}}>✅</div>
            <h2 style={{color: '#4ade80', marginBottom: 8}}>Pembayaran Berhasil</h2>
            <div style={{fontSize: 32, fontWeight: 700, color: '#fff', marginBottom: 8}}>{fmtIDR(amount)}</div>
            <div style={{fontSize: 12, color: '#9ca3af'}}>via {selectedMethod} · {selectedProvider}</div>
            <div style={{fontSize: 11, color: '#6b7280', marginTop: 16}}>Ref: {intent.external_id || intent.doc_no}</div>
            <div style={{marginTop: 24, fontSize: 12, color: '#9ca3af'}}>Lanjut ke struk...</div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 },
  box: { background: '#1a1a1a', borderRadius: 16, padding: 24, maxWidth: 480, width: '95vw', maxHeight: '95vh', overflowY: 'auto', border: '1px solid #2a2a2a', color: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  closeBtn: { width: 36, height: 36, borderRadius: 8, background: '#2a2a2a', color: '#9ca3af', border: 'none', fontSize: 20, cursor: 'pointer' },

  amountBig: { textAlign: 'center', padding: 18, background: '#0f0f0f', borderRadius: 12, marginBottom: 18 },
  amountSmall: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#0f0f0f', borderRadius: 8, marginBottom: 14 },

  methodGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  methodCard: { padding: 14, background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 10, cursor: 'pointer', textAlign: 'center', color: '#fff', fontFamily: 'inherit', transition: 'all 0.15s' },

  qrContainer: { padding: 18, background: '#fff', borderRadius: 12, marginBottom: 12 },
  qrImage: { width: '100%', maxWidth: 280, display: 'block', margin: '0 auto', height: 'auto' },
  qrTextFallback: { padding: 12 },
  qrString: { width: '100%', padding: 8, fontFamily: 'monospace', fontSize: 10, background: '#0f0f0f', color: '#fff', border: '1px solid #2a2a2a', borderRadius: 4, resize: 'vertical', boxSizing: 'border-box' },

  vaBox: { padding: 16, background: '#0f0f0f', borderRadius: 10, textAlign: 'center', marginTop: 12 },
  vaNumber: { fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: '#f97316', letterSpacing: '2px', margin: '8px 0' },
  copyBtn: { padding: '6px 14px', background: '#2a2a2a', color: '#9ca3af', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },

  deeplinkBtn: { display: 'inline-block', padding: '10px 18px', background: '#f97316', color: '#0a0a0a', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 },

  countdown: { padding: '6px 12px', background: '#0f0f0f', borderRadius: 6, fontWeight: 700, fontSize: 16, fontFamily: 'monospace' },
  statusBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, background: '#0f1a2a', borderRadius: 8, marginTop: 14, border: '1px solid #1d4ed8' },
  pulseDot: { width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 1.5s infinite' },
  syncBtn: { padding: '4px 10px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },

  warning: { padding: 12, background: '#2a1f0a', color: '#fbbf24', borderRadius: 6, fontSize: 12, textAlign: 'center', marginBottom: 12 },
  errorBox: { padding: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 6, fontSize: 12, textAlign: 'center', marginTop: 10 },

  btn: { padding: '10px 16px', background: '#2a2a2a', color: '#9ca3af', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  rejectBtn: { padding: '10px 16px', background: '#7f1d1d', color: '#fecaca', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }
};

// Inject pulse keyframe
if (typeof document !== 'undefined' && !document.getElementById('payment-gateway-pulse')) {
  const s = document.createElement('style');
  s.id = 'payment-gateway-pulse';
  s.textContent = '@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.6); } 50% { box-shadow: 0 0 0 6px rgba(59,130,246,0); } }';
  document.head.appendChild(s);
}
