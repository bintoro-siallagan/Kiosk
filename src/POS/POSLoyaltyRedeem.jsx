// client/src/POS/POSLoyaltyRedeem.jsx
// Widget loyalty redemption pas payment step di POS.
//
// Tampilan:
//   - Customer info: nama, tier badge, current points
//   - Available rewards (filter by points ≥ cost + tier eligible)
//   - Tap reward → preview discount + confirm
//   - Hasil: discount amount + remaining points untuk subtract dari order total
//
// Props:
//   phone           — customer phone (dari POSPhoneInput)
//   orderTotal      — total sebelum diskon
//   orderRef        — order reference
//   onApplied(r)    — callback dengan { reward, discount_amount, points_used, remaining_points }
//   onSkip          — kasir skip redemption
//   apiBase         — default ''

import React, { useState, useEffect, useCallback, useMemo } from 'react';

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));

const TIER_COLORS = {
  bronze: { bg: '#3a2814', fg: '#cd7f32', label: 'Bronze' },
  silver: { bg: '#1f1f1f', fg: '#c0c0c0', label: 'Silver' },
  gold: { bg: '#3a2f0a', fg: '#ffd700', label: 'Gold' },
  platinum: { bg: '#1a1a2a', fg: '#e5e4e2', label: 'Platinum' },
};

const REWARD_ICONS = {
  cash_discount: '💸',
  free_item: '🎁',
  voucher: '🎟️',
  tier_upgrade: '⭐'
};

export default function POSLoyaltyRedeem({ phone, orderTotal, orderRef, onApplied, onSkip, apiBase = '' }) {
  const [customer, setCustomer] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [tier, setTier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState('select');

  const load = useCallback(async () => {
    if (!phone) { setError('Phone required'); setLoading(false); return; }
    setLoading(true);
    try {
      const cRes = await fetch(`${apiBase}/api/loyalty/customers/by-phone/${encodeURIComponent(phone)}`);
      if (!cRes.ok) {
        if (cRes.status === 404) { setError('Customer belum terdaftar. Auto-register saat earn.'); setLoading(false); return; }
        throw new Error(`HTTP ${cRes.status}`);
      }
      const c = await cRes.json();
      setCustomer(c);

      // Load available rewards (already filtered by tier + points by backend)
      const rRes = await fetch(`${apiBase}/api/loyalty/customers/${c.id}/available-rewards`);
      if (rRes.ok) setRewards(await rRes.json());

      // Load tiers for badge
      const tRes = await fetch(`${apiBase}/api/loyalty/tiers`);
      if (tRes.ok) {
        const tiers = await tRes.json();
        setTier(tiers.find(t => t.code === c.current_tier_code) || null);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [phone, apiBase]);

  useEffect(() => { load(); }, [load]);

  // Calculate discount preview per reward type
  const previewDiscount = useCallback((reward) => {
    if (!reward) return 0;
    if (reward.type === 'cash_discount') {
      // Cap at order total
      return Math.min(reward.value_amount || 0, orderTotal || 0);
    }
    if (reward.type === 'free_item') return reward.value_amount || 0;
    if (reward.type === 'voucher') return reward.value_amount || 0;
    return 0;
  }, [orderTotal]);

  const confirmRedeem = async () => {
    if (!selected || !customer) return;
    setConfirming(true); setError('');
    try {
      const r = await fetch(`${apiBase}/api/loyalty/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customer.id,
          reward_id: selected.id,
          order_ref: orderRef,
          order_total: orderTotal,
          created_by: localStorage.getItem('kasir_name') || 'kasir'
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'redeem gagal');

      const discountAmount = data.discount_amount || previewDiscount(selected);
      onApplied?.({
        reward: selected, discount_amount: discountAmount,
        points_used: selected.cost_points,
        remaining_points: data.remaining_points ?? (customer.current_points - selected.cost_points),
        customer_id: customer.id
      });
    } catch (e) {
      setError(e.message); setStep('select');
    }
    setConfirming(false);
  };

  if (loading) return (
    <div style={styles.overlay}><div style={styles.box}><div style={styles.empty}>Loading loyalty...</div></div></div>
  );

  // Customer not found — kasir bisa skip ke earn-only flow
  if (!customer) {
    return (
      <div style={styles.overlay}>
        <div style={styles.box}>
          <div style={styles.header}>
            <h2 style={{margin: 0, color: '#fff'}}>Loyalty Redemption</h2>
            <button onClick={onSkip} style={styles.closeBtn}>×</button>
          </div>
          <div style={styles.warning}>
            ⚠️ {error || 'Customer belum terdaftar'}
            <div style={{fontSize: 11, marginTop: 6, color: '#fbbf24'}}>
              Customer akan auto-registered saat lo input phone di Phone Input. Skip redemption sekarang, earn poin tetap jalan.
            </div>
          </div>
          <button onClick={onSkip} style={{...styles.btnPrimary, width: '100%', marginTop: 12}}>
            Skip → Lanjut Bayar
          </button>
        </div>
      </div>
    );
  }

  const tierStyle = TIER_COLORS[customer.current_tier_code] || TIER_COLORS.bronze;

  // CONFIRMATION view
  if (step === 'confirm' && selected) {
    const discount = previewDiscount(selected);
    return (
      <div style={styles.overlay}>
        <div style={styles.box}>
          <div style={styles.header}>
            <h2 style={{margin: 0, color: '#fff'}}>Konfirmasi Redemption</h2>
            <button onClick={() => setStep('select')} style={styles.closeBtn}>×</button>
          </div>

          <div style={styles.confirmBox}>
            <div style={{fontSize: 48, marginBottom: 8}}>{selected.emoji || REWARD_ICONS[selected.type]}</div>
            <h3 style={{margin: 0, color: '#fff'}}>{selected.name}</h3>
            <div style={{color: '#9ca3af', fontSize: 12, marginTop: 4}}>{selected.description}</div>

            <div style={{padding: 14, background: '#0a0a0a', borderRadius: 8, marginTop: 16}}>
              <div style={styles.row}>
                <span>Order Total</span>
                <b>{fmtIDR(orderTotal)}</b>
              </div>
              <div style={{...styles.row, color: '#4ade80'}}>
                <span>− Discount {selected.name}</span>
                <b>−{fmtIDR(discount)}</b>
              </div>
              <div style={{...styles.row, fontSize: 18, fontWeight: 700, color: '#f97316', borderTop: '1px solid #2a2a2a', paddingTop: 8, marginTop: 8}}>
                <span>Total Due</span>
                <span>{fmtIDR(Math.max(0, orderTotal - discount))}</span>
              </div>
              <div style={{...styles.row, fontSize: 11, color: '#9ca3af', marginTop: 8}}>
                <span>Poin terpakai</span>
                <span>−{selected.cost_points} pts</span>
              </div>
              <div style={{...styles.row, fontSize: 11, color: '#9ca3af'}}>
                <span>Sisa poin</span>
                <span>{(customer.current_points - selected.cost_points).toLocaleString('id-ID')} pts</span>
              </div>
            </div>
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}

          <div style={{display: 'flex', gap: 8, marginTop: 16}}>
            <button onClick={() => setStep('select')} style={{...styles.btn, flex: 1}}>← Pilih Lain</button>
            <button onClick={confirmRedeem} disabled={confirming} style={{...styles.btnPrimary, flex: 2, opacity: confirming ? 0.5 : 1}}>
              {confirming ? 'Processing...' : '✓ Konfirmasi & Apply'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // SELECT view
  return (
    <div style={styles.overlay}>
      <div style={styles.box}>
        <div style={styles.header}>
          <h2 style={{margin: 0, color: '#fff', fontSize: 18}}>Loyalty Redemption</h2>
          <button onClick={onSkip} style={styles.closeBtn}>×</button>
        </div>

        {/* Customer card */}
        <div style={styles.customerCard}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
            <div>
              <div style={{fontSize: 15, fontWeight: 600, color: '#fff'}}>{customer.name || customer.phone}</div>
              <div style={{fontSize: 11, color: '#9ca3af'}}>{customer.phone}</div>
              <div style={{fontSize: 10, color: '#6b7280', marginTop: 2}}>{customer.total_visits || 0} kunjungan · member sejak {new Date((customer.created_at || 0)*1000).toLocaleDateString('id-ID', {year:'numeric', month:'short'})}</div>
            </div>
            <div style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              background: tierStyle.bg, color: tierStyle.fg, border: `1px solid ${tierStyle.fg}33`
            }}>
              {tier?.emoji || '🏅'} {tierStyle.label}
            </div>
          </div>

          <div style={styles.pointsBox}>
            <div>
              <div style={{fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Available Points</div>
              <div style={{fontSize: 26, fontWeight: 700, color: '#f97316'}}>{(customer.current_points || 0).toLocaleString('id-ID')}</div>
            </div>
            <div style={{textAlign: 'right'}}>
              <div style={{fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Lifetime</div>
              <div style={{fontSize: 14, color: '#fff'}}>{(customer.lifetime_points || 0).toLocaleString('id-ID')} pts</div>
              <div style={{fontSize: 10, color: '#6b7280'}}>{fmtIDR(customer.lifetime_spend || 0)} spent</div>
            </div>
          </div>
        </div>

        {/* Order summary */}
        <div style={styles.orderSummary}>
          <span style={{fontSize: 12, color: '#9ca3af'}}>Order Total</span>
          <span style={{fontSize: 18, fontWeight: 600, color: '#fff'}}>{fmtIDR(orderTotal)}</span>
        </div>

        {/* Rewards list */}
        <div style={{marginTop: 16}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
            <span style={{fontSize: 13, color: '#fff', fontWeight: 500}}>Reward yang Tersedia</span>
            <span style={{fontSize: 11, color: '#9ca3af'}}>{rewards.length} pilihan</span>
          </div>

          {rewards.length === 0 ? (
            <div style={styles.empty}>
              😔 Belum ada reward yang bisa ditukar.<br/>
              <span style={{fontSize: 11, color: '#6b7280'}}>Kumpulin poin lebih banyak dulu</span>
            </div>
          ) : (
            <div style={styles.rewardGrid}>
              {rewards.map(r => {
                const affordable = customer.current_points >= r.cost_points;
                const discount = previewDiscount(r);
                return (
                  <button key={r.id} onClick={() => {
                    if (!affordable) return;
                    setSelected(r); setStep('confirm');
                  }} disabled={!affordable} style={{
                    ...styles.rewardCard,
                    opacity: affordable ? 1 : 0.4,
                    cursor: affordable ? 'pointer' : 'not-allowed'
                  }}>
                    <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8}}>
                      <div style={{fontSize: 24}}>{r.emoji || REWARD_ICONS[r.type] || '🎁'}</div>
                      <div style={{
                        background: '#f97316', color: '#0a0a0a',
                        padding: '2px 8px', borderRadius: 4,
                        fontSize: 10, fontWeight: 600
                      }}>
                        {r.cost_points} pts
                      </div>
                    </div>
                    <div style={{fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 8}}>{r.name}</div>
                    <div style={{fontSize: 10, color: '#9ca3af', marginTop: 2, minHeight: 24}}>{r.description}</div>
                    {discount > 0 && (
                      <div style={{fontSize: 11, color: '#4ade80', marginTop: 6, fontWeight: 600}}>
                        Hemat {fmtIDR(discount)}
                      </div>
                    )}
                    {r.min_tier_code && r.min_tier_code !== 'bronze' && (
                      <div style={{fontSize: 9, color: '#fbbf24', marginTop: 4}}>
                        Min tier: {r.min_tier_code}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <button onClick={onSkip} style={{...styles.btn, width: '100%', marginTop: 16}}>
          Skip → Lanjut Bayar (tetap dapet earn poin)
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 },
  box: { background: '#1a1a1a', borderRadius: 16, padding: 20, maxWidth: 520, width: '95vw', maxHeight: '95vh', overflowY: 'auto', border: '1px solid #2a2a2a', color: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  closeBtn: { width: 32, height: 32, borderRadius: 6, background: '#2a2a2a', color: '#9ca3af', border: 'none', fontSize: 18, cursor: 'pointer' },

  customerCard: { padding: 14, background: '#0f0f0f', borderRadius: 10, border: '1px solid #2a2a2a' },
  pointsBox: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '12px 0 0', borderTop: '1px solid #2a2a2a', marginTop: 12 },

  orderSummary: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#0f0f0f', borderRadius: 8, marginTop: 12 },

  rewardGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  rewardCard: { padding: 12, background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 8, textAlign: 'left', color: '#fff', fontFamily: 'inherit' },

  row: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: '#fff' },

  confirmBox: { textAlign: 'center', padding: 20, background: '#0f0f0f', borderRadius: 12 },

  warning: { padding: 12, background: '#2a1f0a', color: '#fbbf24', borderRadius: 6, fontSize: 13, textAlign: 'center', marginBottom: 12 },
  errorBox: { padding: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 6, fontSize: 12, textAlign: 'center', marginTop: 10 },
  empty: { padding: 30, textAlign: 'center', color: '#6b7280', background: '#0f0f0f', borderRadius: 8 },

  btn: { padding: '10px 16px', background: '#2a2a2a', color: '#9ca3af', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimary: { padding: '12px 18px', background: '#f97316', color: '#0a0a0a', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
};
