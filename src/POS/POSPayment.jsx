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

  // F&B Active Promos — quick-apply chips (auto-fetch on mount)
  const [activePromos, setActivePromos] = useState([]);
  const [promoApplied, setPromoApplied] = useState(null); // { code, name, amount, type }
  useEffect(() => {
    const api = import.meta.env.VITE_API_URL || "http://localhost:3001";
    fetch(`${api}/api/promos`).then(r => r.json())
      .then(d => setActivePromos((Array.isArray(d) ? d : []).filter(p => p.active && (p.usedCount || 0) < (p.usageLimit || 999))))
      .catch(() => {});
  }, []);
  const applyPromoChip = async (p) => {
    if (p.minOrder && order.total < p.minOrder) {
      alert(`⚠ "${p.code}" butuh min order Rp ${(p.minOrder || 0).toLocaleString("id-ID")}`);
      return;
    }
    let disc = 0;
    if (p.type === "percentage" || p.type === "percent") disc = Math.round(order.total * (p.value || 0) / 100);
    else disc = Math.round(p.value || 0);
    if (p.maxDiscount && disc > p.maxDiscount) disc = p.maxDiscount;
    disc = Math.min(disc, order.total);
    setPromoApplied({ code: p.code, name: p.desc || p.code, amount: disc, type: p.type });
    setLoyaltyDiscount(d => d + disc); // tambahin ke discount existing (reuse field)
  };
  const clearPromoChip = () => {
    if (!promoApplied) return;
    setLoyaltyDiscount(d => Math.max(0, d - promoApplied.amount));
    setPromoApplied(null);
  };

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

        {/* PROMO CHIPS — quick apply */}
        {activePromos.length > 0 && (
          <div style={{ marginTop: 12, padding: 12, background: "linear-gradient(180deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "#fbbf24", letterSpacing: 2, fontFamily: "monospace", fontWeight: 800 }}>🎁 PROMO AKTIF — KLIK APPLY</div>
              <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>{activePromos.length}</div>
            </div>
            {promoApplied ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.5)", borderRadius: 8 }}>
                <span style={{ fontSize: 16 }}>🎟️</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#c084fc", fontFamily: "monospace" }}>{promoApplied.code}</div>
                  <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700 }}>−{(promoApplied.amount).toLocaleString("id-ID")}</div>
                </div>
                <button onClick={clearPromoChip} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>✕</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
                {activePromos.slice(0, 6).map(p => {
                  const minOk = !p.minOrder || order.total >= p.minOrder;
                  const isPercent = p.type === "percentage" || p.type === "percent";
                  return (
                    <button key={p.id} onClick={() => applyPromoChip(p)} disabled={!minOk}
                      style={{
                        padding: "8px 10px", borderRadius: 8,
                        background: minOk ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.02)",
                        border: minOk ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(255,255,255,0.05)",
                        color: minOk ? "#fff" : "#5b6470",
                        cursor: minOk ? "pointer" : "not-allowed",
                        textAlign: "left", fontFamily: "inherit",
                      }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24", fontFamily: "monospace" }}>{p.code}</span>
                        <span style={{ fontSize: 12, fontWeight: 900, color: minOk ? "#fbbf24" : "#5b6470", fontFamily: "monospace" }}>−{isPercent ? `${p.value}%` : `${Math.round(p.value/1000)}rb`}</span>
                      </div>
                      {p.desc && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.desc}</div>}
                      {p.minOrder > 0 && <div style={{ fontSize: 9, color: minOk ? "#10b981" : "#ef4444", marginTop: 2 }}>{minOk ? "✓" : "⚠"} min {Math.round(p.minOrder/1000)}rb</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                    {loyaltyCustomer.tier?.emoji || ''} <b style={{ color: '#fbbf24' }}>{loyaltyCustomer.tier?.name || loyaltyCustomer.current_tier_code}</b>
                    {' · '}<b style={{ color: '#fbbf24', fontFamily: "'Geist Mono',monospace" }}>{(loyaltyCustomer.current_points || 0).toLocaleString('id-ID')}</b> poin
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
              <span>💰 Change</span>
              <b>{fmtIDR(totals.change)}</b>
            </div>
          )}
        </div>

        <div style={styles.tenderList}>
          <div style={styles.sectionTitle}>Tender Lines ({tenders.length})</div>
          {tenders.length === 0 && <div style={styles.empty}>Belum ada tender. Choose method di sebelah →</div>}
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
                  background: active ? `${meta.color}22` : 'rgba(255,255,255,0.025)',
                  color: active ? meta.color : '#fff',
                  borderColor: active ? `${meta.color}80` : 'rgba(255,255,255,0.08)',
                  boxShadow: active ? `0 0 0 1px ${meta.color}44, 0 8px 24px ${meta.color}22` : 'none',
                  transform: active ? 'scale(1.02)' : 'none',
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
              <label style={styles.inputLabel}>Quantity Poin</label>
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
              <label style={styles.inputLabel}>Quantity</label>
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
// Dark MacBook-premium — match POSMenuPicker + POSMenu + AdminHome aesthetic
const styles = {
  root: {
    display: 'flex', gap: 14, padding: 14, height: '100vh', boxSizing: 'border-box',
    background: 'linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)',
    color: '#fff',
    fontFamily: "'Inter','SF Pro Display',system-ui,-apple-system,sans-serif",
  },
  leftPane: {
    flex: 1, minWidth: 380,
    background: 'linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.005))',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14, padding: 18,
    display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.04)',
    color: '#fff',
  },
  rightPane: {
    flex: 1.2, minWidth: 420,
    background: 'rgba(13,17,23,0.7)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14, padding: 18,
    display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3),0 8px 24px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.04)',
    color: '#fff',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  orderRef: { fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, textTransform: 'uppercase' },
  customer: { fontSize: 13, color: '#fff', marginTop: 4, fontWeight: 600 },
  cancelBtn: {
    padding: '8px 14px',
    background: 'rgba(239,68,68,0.12)', color: '#ef4444',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: 'inherit',
  },
  totalBox: {
    background: 'linear-gradient(135deg, #F59E0B 0%, #fbbf24 50%, #F59E0B 100%)',
    color: '#1a1205',
    padding: '22px 20px', borderRadius: 14, textAlign: 'center',
    boxShadow: '0 8px 28px rgba(245,158,11,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
  },
  totalLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", textTransform: 'uppercase' },
  totalAmount: { fontSize: 38, fontWeight: 800, marginTop: 4, letterSpacing: '-0.6px', fontFamily: "'Geist Mono',monospace" },
  runningBox: {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10, padding: 14, color: '#fff',
  },
  runningRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 0', fontSize: 14, color: '#fff',
    fontFamily: "'Geist Mono',monospace",
  },
  changeRow: {
    fontSize: 19, fontWeight: 800, color: '#10b981',
    borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: 10, marginTop: 4,
    fontFamily: "'Geist Mono',monospace",
  },
  tenderList: { flex: 1, minHeight: 80 },
  sectionTitle: {
    fontSize: 10, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)',
    fontWeight: 700, letterSpacing: 1.5, marginBottom: 8,
    fontFamily: "'Geist Mono',monospace",
  },
  empty: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px dashed rgba(255,255,255,0.1)',
    borderRadius: 9, padding: 20, textAlign: 'center',
    color: 'rgba(255,255,255,0.4)', fontSize: 12.5,
  },
  tenderLine: {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 9, padding: 12, marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 8, color: '#fff',
  },
  tenderRef: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, fontFamily: "'Geist Mono',monospace" },
  removeBtn: {
    width: 30, height: 30, borderRadius: 7,
    background: 'rgba(239,68,68,0.12)', color: '#ef4444',
    border: '1px solid rgba(239,68,68,0.25)',
    fontSize: 17, cursor: 'pointer', fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.1)', color: '#fca5a5',
    padding: '10px 14px', borderRadius: 8, fontSize: 12.5,
    border: '1px solid rgba(239,68,68,0.3)',
  },
  finalizeBtn: {
    padding: '15px 20px',
    background: 'linear-gradient(135deg, #10b981, #34d399)',
    color: '#04130c', border: 'none',
    borderRadius: 11, fontSize: 15, fontWeight: 800, cursor: 'pointer',
    fontFamily: 'inherit', letterSpacing: 0.3,
    boxShadow: '0 6px 20px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
    transition: 'all 0.2s',
  },
  finalizeBtnDisabled: {
    background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)',
    border: '1px solid rgba(255,255,255,0.06)',
    cursor: 'not-allowed', boxShadow: 'none',
  },
  tenderGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10,
  },
  tenderBtn: {
    padding: '14px 6px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.025)',
    color: '#fff',
    borderRadius: 11, cursor: 'pointer',
    transition: 'all 0.15s', textAlign: 'center', fontFamily: 'inherit',
  },
  inputSection: {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 11, padding: 16, marginTop: 12,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  inputLabel: { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', marginTop: 4, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", textTransform: 'uppercase' },
  input: {
    fontSize: 24, padding: '12px 16px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.25)',
    color: '#fff',
    borderRadius: 9, fontWeight: 700, textAlign: 'right',
    width: '100%', boxSizing: 'border-box', outline: 'none',
    fontFamily: "'Geist Mono',monospace", letterSpacing: '-0.3px',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  helper: {
    fontSize: 12.5, color: 'rgba(255,255,255,0.65)',
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 7,
  },
  equivalent: { fontSize: 14, color: '#10b981', fontWeight: 700, textAlign: 'right', fontFamily: "'Geist Mono',monospace" },
  quickRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  quickBtn: {
    flex: 1, minWidth: 60, padding: '10px 8px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff',
    borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: "'Geist Mono',monospace",
  },
  quickBtnExact: {
    flex: 1.5, minWidth: 100, padding: '10px 8px',
    background: 'rgba(245,158,11,0.15)',
    border: '1px solid rgba(245,158,11,0.4)',
    color: '#fbbf24', borderRadius: 7,
    cursor: 'pointer', fontSize: 13, fontWeight: 800, fontFamily: "'Geist Mono',monospace",
  },
  addBtn: {
    padding: '12px 20px',
    background: 'linear-gradient(135deg,#F59E0B,#fbbf24)',
    color: '#1a1205', border: 'none', borderRadius: 9,
    fontSize: 14, fontWeight: 800, cursor: 'pointer', marginTop: 4,
    fontFamily: 'inherit', letterSpacing: 0.3,
    boxShadow: '0 4px 14px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
  },
  gatewayPanel: {
    background: 'rgba(59,130,246,0.08)',
    border: '1px solid rgba(59,130,246,0.25)',
    borderRadius: 11, padding: 14,
    display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4,
  },
  gatewayTitle: { fontSize: 14, fontWeight: 800, color: '#60a5fa' },
  gatewayDesc: { fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 },
  gatewayBtn: {
    padding: '14px 18px',
    background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
    color: '#fff', border: 'none', borderRadius: 9,
    fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 6px 20px rgba(59,130,246,0.4), inset 0 1px 0 rgba(255,255,255,0.18)',
  },
  gatewayHint: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  loyaltyCard: {
    background: 'rgba(245,158,11,0.08)',
    border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: 11, padding: 12,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  loyaltyLabel: { fontSize: 11, fontWeight: 800, color: '#fbbf24', letterSpacing: 1, fontFamily: "'Geist Mono',monospace", textTransform: 'uppercase' },
  loyaltyInput: {
    flex: 1, fontSize: 14, padding: '8px 12px',
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff',
    borderRadius: 7, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
  },
  loyaltyBtn: {
    padding: '8px 16px',
    background: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
    color: '#1a1205', border: 'none', borderRadius: 7,
    fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 3px 10px rgba(245,158,11,0.3)',
  },
  loyaltyMsg: { fontSize: 12, color: '#fbbf24' },
  loyaltyClear: {
    width: 26, height: 26, borderRadius: 6,
    background: 'rgba(245,158,11,0.15)', color: '#fbbf24',
    border: '1px solid rgba(245,158,11,0.3)',
    fontSize: 15, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
  },
  loyaltyRedeemBtn: {
    padding: '10px 14px',
    background: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
    color: '#1a1205', border: 'none', borderRadius: 8,
    fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 3px 10px rgba(245,158,11,0.3)',
  },
  loyaltyApplied: {
    fontSize: 13, color: '#34d399',
    background: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: 7,
    padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
  },
  loyaltyUndo: {
    background: 'none', border: 'none', color: '#ef4444', fontSize: 12,
    cursor: 'pointer', textDecoration: 'underline', flexShrink: 0, fontFamily: 'inherit',
  },
};
