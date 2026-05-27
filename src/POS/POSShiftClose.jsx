// client/src/POS/POSShiftClose.jsx
// Modal buat tutup shift kasir — drawer count + variance display.
// Tampilkan summary shift sekarang (revenue, orders, voids, expected cash),
// kasir input closing_cash dari counting drawer, sistem hitung variance.
//
// Props:
//   shiftId      — id shift yang mau ditutup
//   onClose      — closeModal callback (cancel)
//   onCompleted  — callback setelah shift closed successfully (logout flow)
//   apiBase      — default ''
import React, { useState, useEffect, useCallback } from 'react';

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));

// Denominasi Rupiah untuk cash count helper
const DENOMS = [
  { val: 100000, label: '100rb' },
  { val: 50000, label: '50rb' },
  { val: 20000, label: '20rb' },
  { val: 10000, label: '10rb' },
  { val: 5000, label: '5rb' },
  { val: 2000, label: '2rb' },
  { val: 1000, label: '1rb' },
  { val: 500, label: '500' },
  { val: 200, label: '200' },
  { val: 100, label: '100' },
];

export default function POSShiftClose({ shiftId, onClose, onCompleted, apiBase = '' }) {
  const [shift, setShift] = useState(null);
  const [summary, setSummary] = useState(null);
  const [counts, setCounts] = useState({});    // denom_value → qty
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [useCounter, setUseCounter] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Load shift + summary
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetch(`${apiBase}/api/pos/shifts/${shiftId}`).then(r => r.json());
      setShift(s);
      setSummary(s.summary);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [shiftId, apiBase]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh summary every 10s while open
  useEffect(() => {
    if (result) return;
    const t = setInterval(async () => {
      try {
        const s = await fetch(`${apiBase}/api/pos/shifts/${shiftId}/summary`).then(r => r.json());
        setSummary(s);
      } catch {}
    }, 10 * 1000);
    return () => clearInterval(t);
  }, [shiftId, apiBase, result]);

  // Computed total from counter
  const counterTotal = Object.entries(counts).reduce((s, [d, q]) => s + (Number(d) * Number(q || 0)), 0);
  const effectiveClosingCash = useCounter ? counterTotal : (parseFloat(closingCash) || 0);
  const expectedCash = summary?.expected_cash || 0;
  const variance = effectiveClosingCash - expectedCash;

  const updateCount = (denom, qty) => {
    const q = parseInt(qty, 10);
    if (isNaN(q) || q < 0) {
      const next = { ...counts }; delete next[denom]; setCounts(next);
    } else {
      setCounts({ ...counts, [denom]: q });
    }
  };

  const submit = async () => {
    if (effectiveClosingCash === 0 && !confirm('Closing cash 0? Yakin?')) return;
    setSubmitting(true); setError('');
    try {
      const r = await fetch(`${apiBase}/api/pos/shifts/${shiftId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closing_cash: effectiveClosingCash,
          notes: notes ? (useCounter ? `Counter: ${JSON.stringify(counts)}. ${notes}` : notes) : null,
          closed_by: shift?.staff_id
        })
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'gagal'); setSubmitting(false); return; }
      setResult(data);
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  if (loading) return (
    <div style={styles.overlay}><div style={styles.box}>Loading shift data...</div></div>
  );
  if (!shift) return (
    <div style={styles.overlay}><div style={styles.box}>
      Shift {shiftId} not found <button onClick={onClose} style={styles.btn}>Close</button>
    </div></div>
  );

  // After close: show summary screen
  if (result) {
    const varStatus = result.variance_status;
    const varColor = varStatus === 'balanced' ? '#4ade80' : varStatus === 'over' ? '#fbbf24' : '#ef4444';
    return (
      <div style={styles.overlay}>
        <div style={{...styles.box, maxWidth: 500}}>
          <div style={{textAlign: 'center', marginBottom: 20}}>
            <i className="ti ti-circle-check" style={{fontSize: 48, color: '#4ade80'}} aria-hidden="true" />
            <h2 style={{margin: '12px 0 4px', color: '#fff'}}>Shift Closed</h2>
            <div style={{color: '#9ca3af', fontSize: 13}}>{shift.doc_no}</div>
          </div>

          <div style={styles.summaryGrid}>
            <Row label="Revenue Shift" value={fmtIDR(result.summary.revenue)} bold />
            <Row label="Total Orders" value={result.summary.orders} />
            <Row label="Voids" value={result.summary.voids} />
            <Row label="Refunds" value={fmtIDR(result.summary.refunds)} />
            <Row label="Anomali" value={result.summary.anomalies} color={result.summary.anomalies > 0 ? '#fbbf24' : '#4ade80'} />
            <div style={{height: 1, background: '#2a2a2a', margin: '8px 0'}} />
            <Row label="Cash Awal" value={fmtIDR(shift.opening_cash)} />
            <Row label="Cash In" value={fmtIDR(result.summary.cash_in)} color="#4ade80" />
            <Row label="Cash Out (refund)" value={fmtIDR(-(result.summary.cash_out||0))} color="#ef4444" />
            <Row label="Expected Cash" value={fmtIDR(result.expected_cash)} bold />
            <Row label="Actual Cash" value={fmtIDR(result.closing_cash)} bold />
            <div style={{height: 1, background: '#2a2a2a', margin: '8px 0'}} />
            <Row label="VARIANCE" value={fmtIDR(result.variance)} bold color={varColor} />
            <div style={{
              textAlign: 'center', padding: '8px', borderRadius: 6, marginTop: 4,
              background: varColor + '22', color: varColor, fontSize: 13, fontWeight: 500
            }}>
              {varStatus === 'balanced' ? '✓ Pas (selisih < 1 rupiah)' :
               varStatus === 'over' ? `↑ Lebih ${fmtIDR(Math.abs(result.variance))}` :
               `↓ Kurang ${fmtIDR(Math.abs(result.variance))}`}
            </div>
            {Math.abs(result.variance) > 50000 && (
              <div style={{...styles.warning, marginTop: 8}}>
                ⚠️ Variance besar — anomali otomatis ke-log. Manager perlu review.
              </div>
            )}
          </div>

          <button onClick={() => onCompleted?.(result)} style={{...styles.btnPrimary, marginTop: 20, width: '100%'}}>
            Selesai & Logout
          </button>
        </div>
      </div>
    );
  }

  // Main close form
  return (
    <div style={styles.overlay}>
      <div style={styles.box}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
          <div>
            <h2 style={{margin: 0, color: '#fff', fontSize: 18}}>Close Shift</h2>
            <div style={{color: '#9ca3af', fontSize: 12, marginTop: 4}}>{shift.doc_no} · {shift.staff_name}</div>
          </div>
          <button onClick={onClose} style={styles.closeBtn}><i className="ti ti-x" style={{fontSize: 18}} /></button>
        </div>

        {/* Live shift summary */}
        <div style={styles.summaryGrid}>
          <Row label="Shift Mulai" value={new Date(shift.opened_at*1000).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})} />
          <Row label="Durasi" value={`${Math.round((Date.now()/1000 - shift.opened_at) / 60)} menit`} />
          <div style={{height: 1, background: '#2a2a2a', margin: '4px 0'}} />
          <Row label="Revenue" value={fmtIDR(summary?.revenue || 0)} bold color="#f97316" />
          <Row label="Orders" value={summary?.orders || 0} />
          <Row label="Voids" value={summary?.voids || 0} color={(summary?.voids || 0) > 0 ? '#fbbf24' : null} />
          <Row label="Refunds" value={fmtIDR(summary?.refunds || 0)} color={(summary?.refunds || 0) > 0 ? '#fbbf24' : null} />
          <Row label="Anomali" value={summary?.anomalies || 0} color={(summary?.anomalies || 0) > 0 ? '#fbbf24' : '#4ade80'} />
        </div>

        {/* Expected cash */}
        <div style={styles.expectedBox}>
          <div style={{fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Expected Cash in Drawer</div>
          <div style={{fontSize: 24, fontWeight: 500, color: '#fff', marginTop: 4}}>{fmtIDR(expectedCash)}</div>
          <div style={{fontSize: 10, color: '#6b7280', marginTop: 4}}>
            = {fmtIDR(shift.opening_cash)} opening + {fmtIDR(summary?.cash_in || 0)} cash in − {fmtIDR(summary?.cash_out || 0)} refund
          </div>
        </div>

        {/* Cash counting */}
        <div style={{marginTop: 16}}>
          <div style={{display: 'flex', gap: 8, marginBottom: 8}}>
            <button onClick={() => setUseCounter(true)} style={tabBtn(useCounter)}>Hitung per Denominasi</button>
            <button onClick={() => setUseCounter(false)} style={tabBtn(!useCounter)}>Input Manual</button>
          </div>

          {useCounter ? (
            <div style={styles.denomGrid}>
              {DENOMS.map(d => {
                const qty = counts[d.val] || 0;
                return (
                  <div key={d.val} style={styles.denomRow}>
                    <div style={{flex: 1, fontSize: 13, color: '#9ca3af'}}>Rp {d.label}</div>
                    <input type="number" min="0" value={qty || ''} onChange={e => updateCount(d.val, e.target.value)}
                      placeholder="0" style={styles.qtyInput} />
                    <div style={{minWidth: 90, textAlign: 'right', fontSize: 13, color: '#fff', fontWeight: 500}}>
                      {qty > 0 ? fmtIDR(d.val * qty) : '-'}
                    </div>
                  </div>
                );
              })}
              <div style={{...styles.denomRow, borderTop: '1px solid #2a2a2a', paddingTop: 10, marginTop: 4}}>
                <div style={{flex: 1, fontSize: 14, color: '#fff', fontWeight: 500}}>Total Counter</div>
                <div style={{fontSize: 18, color: '#f97316', fontWeight: 600}}>{fmtIDR(counterTotal)}</div>
              </div>
            </div>
          ) : (
            <input type="number" value={closingCash} onChange={e => setClosingCash(e.target.value)}
              placeholder="Total cash dihitung" style={styles.manualInput} autoFocus />
          )}
        </div>

        {/* Variance preview */}
        {effectiveClosingCash > 0 && (
          <div style={{
            padding: 12, marginTop: 12, borderRadius: 8,
            background: Math.abs(variance) <= 1 ? '#0a3a26' : Math.abs(variance) <= 5000 ? '#3a3a26' : '#3a0a0a',
            border: `1px solid ${Math.abs(variance) <= 1 ? '#4ade80' : Math.abs(variance) <= 5000 ? '#fbbf24' : '#ef4444'}`,
            color: Math.abs(variance) <= 1 ? '#4ade80' : Math.abs(variance) <= 5000 ? '#fbbf24' : '#ef4444',
            textAlign: 'center'
          }}>
            <div style={{fontSize: 11, opacity: 0.8}}>VARIANCE</div>
            <div style={{fontSize: 20, fontWeight: 600, marginTop: 2}}>
              {variance >= 0 ? '+' : ''}{fmtIDR(variance)}
            </div>
            <div style={{fontSize: 10, marginTop: 2}}>
              {Math.abs(variance) <= 1 ? 'Balanced ✓' : variance > 0 ? 'Cash lebih (cek tambahan setoran)' : 'Cash kurang (cek transaksi)'}
            </div>
          </div>
        )}

        {/* Notes */}
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
          placeholder="Catatan (optional — wajib kalau variance > Rp 10.000)"
          style={styles.notes} />

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={{display: 'flex', gap: 8, marginTop: 16}}>
          <button onClick={onClose} style={{...styles.btn, flex: 1}}>Cancel</button>
          <button onClick={submit} disabled={submitting} style={{...styles.btnPrimary, flex: 2,
            opacity: submitting ? 0.5 : 1}}>
            {submitting ? 'Memproses...' : 'Konfirmasi Close Shift'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, color }) {
  return (
    <div style={{display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 13}}>
      <span style={{color: '#9ca3af'}}>{label}</span>
      <span style={{color: color || '#fff', fontWeight: bold ? 500 : 400}}>{value}</span>
    </div>
  );
}

const tabBtn = (active) => ({
  flex: 1, padding: '8px', background: active ? '#f97316' : '#2a2a2a',
  color: active ? '#1a1a1a' : '#9ca3af', border: 'none', borderRadius: 6,
  cursor: 'pointer', fontSize: 12, fontWeight: 500
});

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 },
  box: { background: "rgba(255,255,255,0.025)", borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #2a2a2a', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#fff' },
  closeBtn: { width: 36, height: 36, borderRadius: 8, background: '#2a2a2a', color: '#9ca3af', border: 'none', cursor: 'pointer' },
  summaryGrid: { background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: 14 },
  expectedBox: { background: "rgba(255,255,255,0.025)", borderRadius: 10, padding: 14, marginTop: 14, textAlign: 'center' },
  denomGrid: { background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 },
  denomRow: { display: 'flex', alignItems: 'center', gap: 12 },
  qtyInput: { width: 70, padding: '6px 10px', background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 4, color: '#fff', fontSize: 14, textAlign: 'center', fontFamily: 'inherit' },
  manualInput: { width: '100%', padding: '14px', background: "rgba(255,255,255,0.025)", border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff', fontSize: 20, fontWeight: 500, textAlign: 'right', fontFamily: 'inherit', boxSizing: 'border-box' },
  notes: { width: '100%', padding: 10, background: "rgba(255,255,255,0.025)", border: '1px solid #2a2a2a', borderRadius: 6, color: '#fff', fontSize: 12, marginTop: 12, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  errorBox: { padding: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 6, marginTop: 12, fontSize: 12, textAlign: 'center' },
  warning: { padding: 8, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', borderRadius: 6, fontSize: 11, textAlign: 'center' },
  btn: { padding: '12px 16px', background: '#2a2a2a', color: '#9ca3af', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  btnPrimary: { padding: '12px 16px', background: '#f97316', color: 'var(--brand-text,#fff)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }
};
