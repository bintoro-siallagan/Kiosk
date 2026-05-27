import API_HOST from "./apiBase.js";
import { useEffect, useRef, useState } from 'react';
import * as audio from "./audio.js";

/**
 * QRISPayment v4 — fix items shape + status endpoint
 *
 * Changes vs v3:
 *   1. items dimap dari { name, price, qty } → { id, n, p, q } (yang backend expect)
 *      Tanpa ini, sum(items) = 0 ≠ gross_amount → Midtrans tolak "parameters invalid"
 *   2. STATUS_URL: /api/payment/status/:orderId  (BUKAN /api/payment/gopay/:orderId/status)
 *   3. customerPhone dihapus dari body — backend gak pake
 *   4. Polling pakai midtransOrderId dari response (yang real, bukan internal orderId)
 *
 * Props:
 *   items        : array [{ name, price, qty, id? }]
 *   customerInfo : { name, phone }
 *   amount       : number (total termasuk PPN/diskon)
 *   orderNum     : string (optional, auto-generate kalau gak ada)
 *   onSuccess    : function
 *   onBack       : function (opsional)
 */

const API_BASE = API_HOST;
const CHARGE_URL = `${API_BASE}/api/payment/gopay`;
const STATUS_URL = (orderId) => `${API_BASE}/api/payment/status/${orderId}`;

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 600; // ~30 menit

export default function QRISPayment(props) {
  // === SAFE PROPS ===
  const rawItems = Array.isArray(props.items) ? props.items : [];
  const customerInfo = props.customerInfo || {};
  const amount = Number(props.amount) || 0;
  const onSuccess = typeof props.onSuccess === 'function' ? props.onSuccess : () => {};
  const onBack = typeof props.onBack === 'function' ? props.onBack : null;
  const orderNum = props.orderNum || `K${Math.floor(1000 + Math.random() * 9000)}`;

  // === STATE ===
  const [phase, setPhase] = useState('creating'); // creating | waiting | paid | expired | error
  const [midtransOrderId, setMidtransOrderId] = useState(null);
  const [qrUrl, setQrUrl] = useState(null);
  const [deeplinkUrl, setDeeplinkUrl] = useState(null);
  const [qrString, setQrString] = useState(null);
  const [pollCount, setPollCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);

  // === REFS ===
  const chargedRef = useRef(false);
  const pollTimerRef = useRef(null);

  // ============================================================
  // EFFECT 1 — BIKIN TRANSAKSI (guarded, anti StrictMode double-mount)
  // ============================================================
  useEffect(() => {
    if (chargedRef.current) return;
    chargedRef.current = true;

    const charge = async () => {
      try {
        // Map items ke shape yang backend baca (i.n, i.p, i.q)
        const mappedItems = rawItems.map((it, idx) => ({
          id: String(it.id ?? idx + 1),
          n: String(it.name || it.n || 'Item').slice(0, 50),
          p: Math.round(Number(it.price ?? it.p) || 0),
          q: Number(it.qty ?? it.q) || 1,
        }));

        const body = {
          orderId: orderNum,
          amount: Math.round(amount),
          items: mappedItems,
          customerName: customerInfo.name || 'Customer',
        };

        console.log('[Charge] POST', CHARGE_URL, body);

        const res = await fetch(CHARGE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);

        const data = JSON.parse(text);
        console.log('[Charge] Response', data);

        if (!data.qrUrl && !data.qrString) {
          throw new Error('No QR data in response');
        }

        setMidtransOrderId(data.midtransOrderId);
        setQrUrl(data.qrUrl);
        setQrString(data.qrString);
        setDeeplinkUrl(data.deeplinkUrl || data.deepLinkUrl || null);
        setPhase('waiting');
      } catch (e) {
        console.error('[Charge] Error:', e);
        setErrorMsg(e.message || 'Gagal membuat QR');
        setPhase('error');
      }
    };

    charge();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================
  // EFFECT 2 — POLLING STATUS (jalan setelah QR muncul)
  // ============================================================
  useEffect(() => {
    if (phase !== 'waiting' || !midtransOrderId) return;

    let attempts = 0;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      setPollCount(attempts);

      try {
        const res = await fetch(STATUS_URL(midtransOrderId));
        if (!res.ok) {
          console.warn('[Poll]', res.status);
          return;
        }
        const data = await res.json();
        console.log('[Poll]', attempts, data.status);

        if (data.paid || ['capture', 'settlement'].includes(data.status)) {
          if (cancelled) return;
          setPhase('paid');
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          audio.playPaymentSuccess();
          audio.speakThanks();
          setTimeout(() => onSuccess({ midtransOrderId, orderNum, amount }), 800);
          return;
        }

        if (['expire', 'cancel', 'deny', 'failure'].includes(data.status)) {
          if (cancelled) return;
          setPhase('expired');
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        }
      } catch (e) {
        console.warn('[Poll] error:', e.message);
      }

      if (attempts >= POLL_MAX_ATTEMPTS && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        if (!cancelled) setPhase('expired');
      }
    };

    poll(); // fire immediately
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [phase, midtransOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div style={S.page}>
      <h1 style={S.title}>KaryaOS</h1>
      <p style={S.subtitle}>Pembayaran QRIS</p>

      <div style={S.grid}>
        {/* LEFT — order summary */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <span style={S.chip}>#{orderNum}</span>
            <span style={S.chip}>{rawItems.length} item</span>
          </div>

          <div style={S.label}>ITEMS</div>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
            {rawItems.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span>{it.qty || it.q || 1}× {it.name || it.n}</span>
                <span>Rp {((it.price ?? it.p) * (it.qty ?? it.q ?? 1)).toLocaleString('id-ID')}</span>
              </div>
            ))}
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={S.label}>TOTAL</div>
            <div style={S.amount}>Rp {amount.toLocaleString('id-ID')}</div>
          </div>

          {onBack && phase !== 'paid' && (
            <button style={{ ...S.btn, marginTop: 16 }} onClick={onBack}>← Kembali</button>
          )}
        </div>

        {/* RIGHT — QR */}
        <div style={{ ...S.card, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          {phase === 'creating' && (
            <div style={S.qrPlaceholder}>
              <div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>Membuat QR…</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Menghubungi Midtrans</div>
              </div>
            </div>
          )}

          {phase === 'waiting' && (qrString || qrUrl) && (
            <>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=8&data=${encodeURIComponent(qrString || qrUrl)}`}
                alt="QRIS"
                style={S.qrImg}
              />
              <div style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                Scan dengan aplikasi e-wallet
              </div>
              <div style={S.orderId}>Order: {midtransOrderId}</div>
              <div style={S.midtrans}>Polling #{pollCount}</div>
              <a
                href={deeplinkUrl || "https://simulator.sandbox.midtrans.com/gopay/ui"}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...S.btn, marginTop: 16, fontSize: 12, textDecoration: 'none', display: 'inline-block' }}
              >
                🔗 Buka GoPay (sandbox)
              </a>
            </>
          )}

          {phase === 'paid' && (
            <div>
              <div style={{ fontSize: 48 }}>✓</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>PEMBAYARAN BERHASIL</div>
            </div>
          )}

          {phase === 'expired' && (
            <div>
              <div style={{ fontSize: 32 }}>⏱</div>
              <div style={{ fontSize: 16, marginTop: 8 }}>QR kedaluwarsa</div>
              {onBack && <button style={{ ...S.btn, marginTop: 16 }} onClick={onBack}>← Kembali</button>}
            </div>
          )}

          {phase === 'error' && (
            <div>
              <div style={{ fontSize: 32, color: '#f87171' }}>!</div>
              <div style={{ fontSize: 14, marginTop: 8, color: '#f87171' }}>Gagal membuat QR</div>
              <div style={{ fontSize: 11, marginTop: 8, color: 'rgba(255,255,255,0.5)', maxWidth: 280, wordBreak: 'break-word' }}>{errorMsg}</div>
              {onBack && <button style={{ ...S.btn, marginTop: 16 }} onClick={onBack}>← Kembali</button>}
            </div>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
        <span>KaryaOS Kiosk · {new Date().toLocaleString('id-ID')}</span>
      </div>
    </div>
  );
}

// === STYLES ===
const S = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)',
    backgroundAttachment: 'fixed',
    color: '#fff', padding: '40px 24px', fontFamily: "'Inter',sans-serif"
  },
  title: { textAlign: 'center', fontSize: 26, fontWeight: 600, letterSpacing: '-0.6px', marginBottom: 6, margin: 0, color: 'rgba(255,255,255,0.95)' },
  subtitle: { textAlign: 'center', color: 'rgba(255,255,255,0.55)', marginBottom: 28, fontSize: 14, letterSpacing: '-0.1px' },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0, 340px) 1fr', gap: 18, maxWidth: 920, margin: '0 auto' },
  card: {
    background: 'linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 20, padding: 22, display: 'flex', flexDirection: 'column', minHeight: 420,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 24px rgba(0,0,0,0.28)',
  },
  chip: {
    padding: '5px 12px', borderRadius: 999,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
    fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.7)', letterSpacing: '-0.1px',
  },
  label: { fontSize: 11, letterSpacing: 1.5, color: 'rgba(255,255,255,0.45)', marginBottom: 14, textTransform: 'uppercase', fontWeight: 500 },
  btn: {
    padding: '11px 18px', borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    fontFamily: "'Inter',sans-serif", letterSpacing: '-0.1px',
  },
  qrPlaceholder: {
    width: 220, height: 220, margin: '0 auto',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'rgba(255,255,255,0.4)', fontSize: 13,
    background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 16,
  },
  qrImg: {
    width: 220, height: 220, background: '#fff', borderRadius: 12, padding: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.32), 0 24px 60px color-mix(in srgb, var(--brand-primary,#FF6B35) 18%, transparent)',
  },
  amount: {
    fontSize: 30, fontWeight: 600, color: '#fff',
    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.8px',
  },
  orderId: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 12, wordBreak: 'break-all', maxWidth: 300, userSelect: 'all', cursor: 'text', fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2 },
  midtrans: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4, letterSpacing: 0.3 },
};
