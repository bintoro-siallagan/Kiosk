// client/src/POS/POSPayment.jsx
// Split payment screen — kasir UI for multi-tender checkout.
// Touch-friendly tablet layout. Validates in real-time, calc change for cash,
// captures ref_no for card/QRIS, integrates points redemption.
//
// Props:
//   order: { ref, total, items, customer? }
//   onComplete(result)  - called after successful finalize
//   onCancel()
//   apiBase (default '/api/pos')
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import POSPaymentGateway from './POSPaymentGateway.jsx';
import POSLoyaltyRedeem from './POSLoyaltyRedeem.jsx';

const TENDER_META = {
  cash:       { label: 'Tunai',     emoji: '💵', color: '#10b981', needsRef: false },
  qris:       { label: 'QRIS',      emoji: '📱', color: '#3b82f6', needsRef: true,  refLabel: 'QRIS reference' },
  card:       { label: 'Kartu',     emoji: '💳', color: '#6366f1', needsRef: true,  refLabel: 'Last 4 digit' },
  gopay:      { label: 'GoPay',     emoji: '🟢', color: '#00aa13', needsRef: true,  refLabel: 'Reference / phone' },
  ovo:        { label: 'OVO',       emoji: '🟣', color: '#4c2a85', needsRef: true,  refLabel: 'Reference / phone' },
  dana:       { label: 'DANA',      emoji: '🔵', color: '#118eea', needsRef: true,  refLabel: 'Reference / phone' },
  shopeepay:  { label: 'ShopeePay', emoji: '🟠', color: '#ee4d2d', needsRef: true,  refLabel: 'Reference' },
  points:     { label: 'Poin',      emoji: '⭐', color: '#f59e0b', needsRef: false, isPoints: true },
  voucher:    { label: 'Voucher',   emoji: '🎫', color: '#ec4899', needsRef: true,  refLabel: 'Kode voucher' },
  transfer:   { label: 'Transfer',  emoji: '🏦', color: '#475569', needsRef: true,  refLabel: 'Bank + last 4' },
};

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0
}).format(Math.round(n || 0));

const QUICK_CASH = [10000, 20000, 50000, 100000];

// Tender yang bisa dibayar otomatis lewat Payment Gateway (Midtrans / Xendit).
const GATEWAY_TENDERS = ['qris', 'gopay', 'ovo', 'dana', 'shopeepay'];

export default function POSPayment({ order, onComplete, onCancel, apiBase = '/api/pos', gatewayBase }) {
  const [tenders, setTenders] = useState([]); // [{ tender_type, amount, ref_no, metadata }]
  const [activeTender, setActiveTender] = useState('cash');
  const [inputAmount, setInputAmount] = useState('');
  const [inputRef, setInputRef] = useState('');
  const [inputPoints, setInputPoints] = useState('');
  const [enabledTenders, setEnabledTenders] = useState(Object.keys(TENDER_META));
  const [pointValue, setPointValue] = useState(100);
  const [validation, setValidation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showGateway, setShowGateway] = useState(false);
  const [loyaltyPhone, setLoyaltyPhone] = useState('');
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(null);
  const [loyaltyMsg, setLoyaltyMsg] = useState('');
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [showLoyalty, setShowLoyalty] = useState(false);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [loyaltyReward, setLoyaltyReward] = useState(null);

  // POSPaymentGateway + loyalty endpoints prepend their own "/api/..." — jadi ini cukup HOST aja.
  const GW_BASE = gatewayBase || import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Order total dikurangi diskon loyalty = jumlah yang harus dibayar.
  const orderDue = Math.max(0, order.total - loyaltyDiscount);

  // Load runtime config
  useEffect(() => {
    fetch(`${apiBase}/config?category=payment`).then(r => r.json()).then(rows => {
      const t = rows.find(r => r.key === 'TENDER_TYPES');
      if (t) setEnabledTenders(t.parsed_value);
    }).catch(() => {});
    fetch(`${apiBase}/config/POINT_VALUE_IDR`).then(r => r.json()).then(d => {
      if (d.parsed_value) setPointValue(d.parsed_value);
    }).catch(() => {});
  }, [apiBase]);

  // Re-validate whenever tenders change
  useEffect(() => {
    if (tenders.length === 0) {
      setValidation(null); return;
    }
    fetch(`${apiBase}/payments/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_total: orderDue, tenders })
    }).then(r => r.json()).then(setValidation).catch(console.error);
  }, [tenders, orderDue, apiBase]);

  const totals = useMemo(() => {
    const tendered = tenders.reduce((s, t) => s + t.amount, 0);
    const balance = orderDue - tendered;
    const change = balance < 0 ? -balance : 0;
    return { tendered, balance: Math.max(0, balance), change };
  }, [tenders, orderDue]);

  const addTender = useCallback(() => {
    const amount = activeTender === 'points'
      ? (parseInt(inputPoints, 10) || 0) * pointValue
      : parseFloat(inputAmount) || 0;
    if (amount <= 0) { setError('Amount harus > 0'); return; }
    const meta = TENDER_META[activeTender];
    if (meta.needsRef && !inputRef.trim()) {
      setError(`${meta.refLabel} wajib diisi`); return;
    }
    const line = { tender_type: activeTender, amount };
    if (meta.needsRef) line.ref_no = inputRef.trim();
    if (meta.isPoints) line.metadata = { points_redeemed: parseInt(inputPoints, 10) };
    setTenders([...tenders, line]);
    setInputAmount(''); setInputRef(''); setInputPoints(''); setError(null);
  }, [activeTender, inputAmount, inputRef, inputPoints, tenders, pointValue]);

  const removeTender = (idx) => setTenders(tenders.filter((_, i) => i !== idx));

  const setExactRemaining = () => {
    if (totals.balance > 0) setInputAmount(String(totals.balance));
  };

  // ── Loyalty ──────────────────────────────────────────────
  const lookupLoyalty = useCallback(async () => {
    const phone = loyaltyPhone.trim();
    if (!phone) return;
    setLoyaltyLoading(true); setLoyaltyMsg('');
    try {
      let r = await fetch(`${GW_BASE}/api/loyalty/customers/by-phone/${encodeURIComponent(phone)}`);
      if (r.status === 404) {
        // member baru → auto-register (dapat signup bonus kalau dikonfig)
        const cr = await fetch(`${GW_BASE}/api/loyalty/customers`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
        if (!cr.ok) { setLoyaltyMsg('Gagal daftar member'); setLoyaltyLoading(false); return; }
        r = await fetch(`${GW_BASE}/api/loyalty/customers/by-phone/${encodeURIComponent(phone)}`);
        setLoyaltyMsg('✓ Member baru terdaftar');
      }
      if (r.ok) setLoyaltyCustomer(await r.json());
      else setLoyaltyMsg('Lookup gagal');
    } catch (e) { setLoyaltyMsg('Error: ' + e.message); }
    setLoyaltyLoading(false);
  }, [loyaltyPhone, GW_BASE]);

  const earnLoyalty = useCallback(async () => {
    if (!loyaltyCustomer) return;
    try {
      await fetch(`${GW_BASE}/api/loyalty/earn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: loyaltyCustomer.id,
          order_total: orderDue,
          order_ref: order.ref,
          created_by: order.cashier || 'kasir',
        }),
      });
    } catch (e) { console.warn('loyalty earn:', e.message); }
  }, [loyaltyCustomer, orderDue, order.ref, order.cashier, GW_BASE]);

  const finalize = async () => {
    if (!validation?.valid) { setError('Tidak valid: ' + (validation?.errors?.[0] || '?')); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`${apiBase}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_ref: order.ref,
          order_total: orderDue,
          customer_id: order.customer?.id,
          actor: order.cashier || 'kasir',
          tenders,
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.errors?.join(', ') || data.error || 'Gagal');
        setSubmitting(false); return;
      }
      await earnLoyalty();
      onComplete?.({ ...data, tenders, loyalty_discount: loyaltyDiscount });
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const canFinalize = validation?.valid && tenders.length > 0 && !submitting;
  const activeTenderMeta = TENDER_META[activeTender];

  return (
    <div style={styles.root}>
      {/* LEFT — order summary + tender lines */}
      <div style={styles.leftPane}>
        <div style={styles.header}>
          <div>
            <div style={styles.orderRef}>Order #{order.ref}</div>
            {order.customer?.name && <div style={styles.customer}>👤 {order.customer.name}</div>}
          </div>
          <button onClick={onCancel} style={styles.cancelBtn}>× Batal</button>
        </div>

        <div style={styles.totalBox}>
          <div style={styles.totalLabel}>{loyaltyDiscount > 0 ? 'Total Bayar' : 'Total Order'}</div>
          <div style={styles.totalAmount}>{fmtIDR(orderDue)}</div>
          {loyaltyDiscount > 0 && (
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
              <span style={{ textDecoration: 'line-through' }}>{fmtIDR(order.total)}</span>{' '}· 🏅 hemat {fmtIDR(loyaltyDiscount)}
            </div>
          )}
        </div>

        {/* LOYALTY MEMBER */}
        <div style={styles.loyaltyCard}>
          {!loyaltyCustomer ? (
            <>
              <div style={styles.loyaltyLabel}>🏅 Member Loyalty</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="tel" value={loyaltyPhone}
                  onChange={e => setLoyaltyPhone(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') lookupLoyalty(); }}
                  placeholder="No. HP customer" style={styles.loyaltyInput} />
                <button onClick={lookupLoyalty} disabled={loyaltyLoading} style={styles.loyaltyBtn}>
                  {loyaltyLoading ? '...' : 'Cek'}
                </button>
              </div>
              {loyaltyMsg && <div style={styles.loyaltyMsg}>{loyaltyMsg}</div>}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>🏅 {loyaltyCustomer.name || loyaltyCustomer.phone}</div>
                  <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>
                    {loyaltyCustomer.tier?.emoji || ''} {loyaltyCustomer.tier?.name || loyaltyCustomer.current_tier_code}
                    {' · '}{(loyaltyCustomer.current_points || 0).toLocaleString('id-ID')} poin
                  </div>
                </div>
                <button onClick={() => { setLoyaltyCustomer(null); setLoyaltyDiscount(0); setLoyaltyReward(null); setLoyaltyMsg(''); }}
                  style={styles.loyaltyClear}>×</button>
              </div>
              {loyaltyMsg && <div style={styles.loyaltyMsg}>{loyaltyMsg}</div>}
              {loyaltyDiscount > 0 ? (
                <div style={styles.loyaltyApplied}>
                  <span>✓ {loyaltyReward?.reward?.name || 'Reward'} — diskon {fmtIDR(loyaltyDiscount)}</span>
                  <button onClick={() => { setLoyaltyDiscount(0); setLoyaltyReward(null); setLoyaltyMsg(''); }} style={styles.loyaltyUndo}>batal</button>
                </div>
              ) : (
                <button onClick={() => setShowLoyalty(true)} style={styles.loyaltyRedeemBtn}>
                  🏅 Pakai Loyalty / Tukar Poin
                </button>
              )}
            </>
          )}
        </div>

        <div style={styles.runningBox}>
          <div style={styles.runningRow}>
            <span>Tendered</span>
            <b>{fmtIDR(totals.tendered)}</b>
          </div>
          <div style={{...styles.runningRow, color: totals.balance > 0 ? '#dc2626' : '#10b981'}}>
            <span>{totals.balance > 0 ? 'Sisa Kurang' : 'Lunas'}</span>
            <b>{totals.balance > 0 ? fmtIDR(totals.balance) : '✓'}</b>
          </div>
          {totals.change > 0 && (
            <div style={{...styles.runningRow, ...styles.changeRow}}>
              <span>💰 Kembalian</span>
              <b>{fmtIDR(totals.change)}</b>
            </div>
          )}
        </div>

        <div style={styles.tenderList}>
          <div style={styles.sectionTitle}>Tender Lines ({tenders.length})</div>
          {tenders.length === 0 && <div style={styles.empty}>Belum ada tender. Pilih metode di sebelah →</div>}
          {tenders.map((t, i) => {
            const meta = TENDER_META[t.tender_type] || {};
            return (
              <div key={i} style={styles.tenderLine}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {meta.emoji} {meta.label} {fmtIDR(t.amount)}
                  </div>
                  {t.ref_no && <div style={styles.tenderRef}>Ref: {t.ref_no}</div>}
                  {t.metadata?.points_redeemed && (
                    <div style={styles.tenderRef}>{t.metadata.points_redeemed} poin × Rp{pointValue}</div>
                  )}
                </div>
                <button onClick={() => removeTender(i)} style={styles.removeBtn}>×</button>
              </div>
            );
          })}
        </div>

        {validation && !validation.valid && (
          <div style={styles.errorBox}>
            <b>Belum valid:</b>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}

        <button onClick={finalize} disabled={!canFinalize}
          style={{ ...styles.finalizeBtn, ...(canFinalize ? {} : styles.finalizeBtnDisabled) }}>
          {submitting ? 'Memproses...' : `✓ Selesaikan Pembayaran ${totals.change > 0 ? `(Kembalian ${fmtIDR(totals.change)})` : ''}`}
        </button>
      </div>

      {/* RIGHT — tender selector + amount input */}
      <div style={styles.rightPane}>
        <div style={styles.sectionTitle}>Pilih Metode Pembayaran</div>
        <div style={styles.tenderGrid}>
          {enabledTenders.map(t => {
            const meta = TENDER_META[t]; if (!meta) return null;
            const active = activeTender === t;
            return (
              <button key={t} onClick={() => { setActiveTender(t); setInputRef(''); setInputAmount(''); setInputPoints(''); setError(null); }}
                style={{
                  ...styles.tenderBtn,
                  background: active ? meta.color : '#fff',
                  color: active ? '#fff' : '#1f2937',
                  borderColor: active ? meta.color : '#e5e7eb',
                  transform: active ? 'scale(1.02)' : 'none'
                }}>
                <div style={{ fontSize: 28 }}>{meta.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{meta.label}</div>
              </button>
            );
          })}
        </div>

        <div style={styles.inputSection}>
          <div style={styles.sectionTitle}>
            {activeTenderMeta?.emoji} {activeTenderMeta?.label}
          </div>

          {GATEWAY_TENDERS.includes(activeTender) && (
            <div style={styles.gatewayPanel}>
              <div style={styles.gatewayTitle}>💳 Bayar otomatis via Payment Gateway</div>
              <div style={styles.gatewayDesc}>
                QRIS dinamis / e-wallet — customer scan, lunas terkonfirmasi otomatis lewat Midtrans / Xendit.
              </div>
              <button
                onClick={() => { setError(null); setShowGateway(true); }}
                style={styles.gatewayBtn}>
                💳 Buka Payment Gateway · {fmtIDR(totals.balance > 0 ? totals.balance : orderDue)}
              </button>
              <div style={styles.gatewayHint}>atau input manual di bawah (mode offline)</div>
            </div>
          )}

          {activeTenderMeta?.isPoints ? (
            <>
              {order.customer?.points_balance !== undefined && (
                <div style={styles.helper}>
                  Saldo customer: <b>{order.customer.points_balance} poin</b> (= {fmtIDR(order.customer.points_balance * pointValue)})
                </div>
              )}
              <label style={styles.inputLabel}>Jumlah Poin</label>
              <input type="number" value={inputPoints} onChange={e => setInputPoints(e.target.value)}
                placeholder="0" style={styles.input} autoFocus />
              {inputPoints && parseInt(inputPoints, 10) > 0 && (
                <div style={styles.equivalent}>
                  = {fmtIDR((parseInt(inputPoints, 10) || 0) * pointValue)}
                </div>
              )}
            </>
          ) : (
            <>
              <label style={styles.inputLabel}>Jumlah</label>
              <input type="number" value={inputAmount} onChange={e => setInputAmount(e.target.value)}
                placeholder="0" style={styles.input} autoFocus />

              {activeTender === 'cash' && totals.balance > 0 && (
                <div style={styles.quickRow}>
                  <button onClick={setExactRemaining} style={styles.quickBtnExact}>
                    Pas ({fmtIDR(totals.balance)})
                  </button>
                  {QUICK_CASH.filter(v => v >= totals.balance).slice(0, 4).map(v => (
                    <button key={v} onClick={() => setInputAmount(String(v))} style={styles.quickBtn}>
                      {v >= 1000 ? `${v/1000}k` : v}
                    </button>
                  ))}
                </div>
              )}

              {activeTenderMeta?.needsRef && (
                <>
                  <label style={styles.inputLabel}>{activeTenderMeta.refLabel}</label>
                  <input type="text" value={inputRef} onChange={e => setInputRef(e.target.value)}
                    placeholder={activeTenderMeta.refLabel}
                    maxLength={activeTender === 'card' ? 4 : 30}
                    style={styles.input} />
                </>
              )}
            </>
          )}

          <button onClick={addTender} style={styles.addBtn}>+ Tambah ke Tender</button>
        </div>
      </div>

      {showGateway && (
        <POSPaymentGateway
          orderRef={order.ref}
          amount={totals.balance > 0 ? totals.balance : orderDue}
          customerName={order.customer?.name}
          customerPhone={order.customer?.phone}
          items={order.items}
          apiBase={GW_BASE}
          onPaid={async (intent) => {
            setShowGateway(false);
            await earnLoyalty();
            // Gateway sudah catat pos_payments lewat webhook — langsung ke struk,
            // gak lewat finalize() biar gak dobel-record.
            onComplete?.({
              gateway: true,
              loyalty_discount: loyaltyDiscount,
              tenders: [
                ...tenders,
                {
                  tender_type: intent.payment_method,
                  amount: intent.amount,
                  ref_no: intent.external_id || intent.doc_no,
                  metadata: { gateway: intent.provider_code, intent_id: intent.id },
                },
              ],
            });
          }}
          onCancel={() => setShowGateway(false)}
        />
      )}

      {showLoyalty && loyaltyCustomer && (
        <POSLoyaltyRedeem
          phone={loyaltyCustomer.phone}
          orderTotal={order.total}
          orderRef={order.ref}
          apiBase={GW_BASE}
          onApplied={(r) => {
            setLoyaltyDiscount(r.discount_amount || 0);
            setLoyaltyReward(r);
            setShowLoyalty(false);
            setLoyaltyMsg(`✓ ${r.reward?.name || 'Reward'} dipakai`);
          }}
          onSkip={() => setShowLoyalty(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// STYLES — tablet-optimized, touch-friendly
// ============================================================
const styles = {
  root: {
    display: 'flex', gap: 16, padding: 16, height: '100vh', boxSizing: 'border-box',
    background: '#f3f4f6', fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  leftPane: {
    flex: 1, minWidth: 380, background: '#fff', borderRadius: 12, padding: 20,
    display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto'
  },
  rightPane: {
    flex: 1.2, minWidth: 420, background: '#fff', borderRadius: 12, padding: 20,
    display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto'
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'start' },
  orderRef: { fontSize: 14, color: '#6b7280' },
  customer: { fontSize: 13, color: '#374151', marginTop: 4 },
  cancelBtn: {
    padding: '8px 14px', background: '#fee2e2', color: '#dc2626', border: 'none',
    borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14
  },
  totalBox: {
    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff',
    padding: 20, borderRadius: 12, textAlign: 'center'
  },
  totalLabel: { fontSize: 13, opacity: 0.85 },
  totalAmount: { fontSize: 36, fontWeight: 700, marginTop: 4, letterSpacing: '-0.02em' },
  runningBox: { background: '#f9fafb', borderRadius: 8, padding: 14 },
  runningRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 0', fontSize: 15
  },
  changeRow: {
    fontSize: 18, fontWeight: 700, color: '#10b981',
    borderTop: '1px dashed #d1d5db', paddingTop: 10, marginTop: 4
  },
  tenderList: { flex: 1, minHeight: 80 },
  sectionTitle: {
    fontSize: 11, textTransform: 'uppercase', color: '#6b7280',
    fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8
  },
  empty: {
    background: '#f9fafb', border: '2px dashed #e5e7eb', borderRadius: 8,
    padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13
  },
  tenderLine: {
    background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 8
  },
  tenderRef: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  removeBtn: {
    width: 32, height: 32, borderRadius: 6, background: '#fee2e2', color: '#dc2626',
    border: 'none', fontSize: 18, cursor: 'pointer'
  },
  errorBox: {
    background: '#fef2f2', color: '#991b1b', padding: 12, borderRadius: 6,
    fontSize: 13, border: '1px solid #fca5a5'
  },
  finalizeBtn: {
    padding: '16px 20px', background: '#10b981', color: '#fff', border: 'none',
    borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
  },
  finalizeBtnDisabled: {
    background: '#d1d5db', color: '#9ca3af', cursor: 'not-allowed', boxShadow: 'none'
  },
  tenderGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))', gap: 10
  },
  tenderBtn: {
    padding: '14px 6px', border: '2px solid #e5e7eb', borderRadius: 10, cursor: 'pointer',
    transition: 'all 0.15s', textAlign: 'center'
  },
  inputSection: {
    background: '#f9fafb', borderRadius: 10, padding: 16, marginTop: 12,
    display: 'flex', flexDirection: 'column', gap: 8
  },
  inputLabel: { fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 4 },
  input: {
    fontSize: 24, padding: '12px 16px', border: '2px solid #d1d5db', borderRadius: 8,
    fontWeight: 600, textAlign: 'right', width: '100%', boxSizing: 'border-box'
  },
  helper: { fontSize: 13, color: '#6b7280', padding: '8px 12px', background: '#fff', borderRadius: 6 },
  equivalent: { fontSize: 14, color: '#10b981', fontWeight: 600, textAlign: 'right' },
  quickRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  quickBtn: {
    flex: 1, minWidth: 60, padding: '10px 8px', background: '#fff',
    border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600
  },
  quickBtnExact: {
    flex: 1.5, minWidth: 100, padding: '10px 8px', background: '#dbeafe',
    border: '1px solid #93c5fd', color: '#1e40af', borderRadius: 6,
    cursor: 'pointer', fontSize: 13, fontWeight: 700
  },
  addBtn: {
    padding: '12px 20px', background: '#1f2937', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4
  },
  gatewayPanel: {
    background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
    padding: 14, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4,
  },
  gatewayTitle: { fontSize: 14, fontWeight: 700, color: '#1e40af' },
  gatewayDesc: { fontSize: 12, color: '#3b5b8c', lineHeight: 1.4 },
  gatewayBtn: {
    padding: '14px 18px', background: '#2563eb', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
  },
  gatewayHint: { fontSize: 11, color: '#94a3b8', textAlign: 'center' },
  loyaltyCard: {
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
    padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
  },
  loyaltyLabel: { fontSize: 12, fontWeight: 700, color: '#b45309' },
  loyaltyInput: {
    flex: 1, fontSize: 15, padding: '8px 10px', border: '1px solid #d1d5db',
    borderRadius: 6, boxSizing: 'border-box',
  },
  loyaltyBtn: {
    padding: '8px 16px', background: '#f59e0b', color: '#fff', border: 'none',
    borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer',
  },
  loyaltyMsg: { fontSize: 12, color: '#92400e' },
  loyaltyClear: {
    width: 26, height: 26, borderRadius: 6, background: '#fde68a', color: '#92400e',
    border: 'none', fontSize: 16, cursor: 'pointer', flexShrink: 0,
  },
  loyaltyRedeemBtn: {
    padding: '10px 14px', background: '#f59e0b', color: '#fff', border: 'none',
    borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  loyaltyApplied: {
    fontSize: 13, color: '#065f46', background: '#d1fae5', borderRadius: 6,
    padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
  },
  loyaltyUndo: {
    background: 'none', border: 'none', color: '#dc2626', fontSize: 12,
    cursor: 'pointer', textDecoration: 'underline', flexShrink: 0,
  },
};
