// src/POS/POSSatisfaction.jsx
// Popup kepuasan customer — muncul setelah struk ditutup ("Selesai").
// Customer kasih bintang 1-5 + komentar opsional → POST /api/feedback.
//
// Props:
//   order   — { ref, cashier }
//   apiBase — HOST backend (nempel sendiri "/api/feedback")
//   onDone  — dipanggil setelah kirim / lewati

import React, { useState } from 'react';

const RATING_LABEL = { 1: 'Kecewa 😞', 2: 'Kurang 😐', 3: 'Cukup 🙂', 4: 'Bagus 😄', 5: 'Luar Biasa 🤩' };

export default function POSSatisfaction({ order, apiBase = '', source = 'pos', onDone }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [step, setStep] = useState('rate'); // rate | thanks
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (rating < 1) return;
    setSubmitting(true);
    try {
      await fetch(`${apiBase}/api/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_ref: order?.ref, rating, comment: comment.trim(),
          cashier: order?.cashier, source,
        }),
      });
    } catch (e) { /* feedback gagal kirim — jangan blok kasir, lanjut aja */ }
    setStep('thanks');
    setTimeout(() => onDone?.(), 1800);
  };

  if (step === 'thanks') {
    return (
      <div style={S.overlay}>
        <div style={S.box}>
          <div style={{ fontSize: 64 }}>🙏</div>
          <h2 style={{ margin: '12px 0 4px', color: '#0f172a' }}>Makasih banyak!</h2>
          <div style={{ color: '#64748b', fontSize: 14 }}>Masukan kamu bikin kami makin baik.</div>
        </div>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <div style={S.overlay}>
      <div style={S.box}>
        <div style={S.kicker}>KEPUASAN CUSTOMER</div>
        <h2 style={{ margin: '6px 0 2px', color: '#0f172a', fontSize: 22 }}>Gimana pengalaman kamu?</h2>
        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>Order {order?.ref || ''}</div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
              style={{ ...S.star, color: n <= shown ? '#f59e0b' : '#d1d5db' }}>
              ★
            </button>
          ))}
        </div>
        <div style={S.ratingLabel}>{shown ? RATING_LABEL[shown] : ' '}</div>

        <textarea value={comment} onChange={e => setComment(e.target.value)}
          placeholder="Saran atau komentar (opsional)..." rows={3} style={S.textarea} />

        <button onClick={submit} disabled={rating < 1 || submitting}
          style={{ ...S.submit, ...(rating < 1 || submitting ? S.submitOff : {}) }}>
          {submitting ? 'Mengirim...' : 'Kirim Penilaian'}
        </button>
        <button onClick={() => onDone?.()} style={S.skip}>Lewati</button>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200,
    fontFamily: 'system-ui,-apple-system,sans-serif',
  },
  box: {
    background: '#fff', borderRadius: 18, padding: '28px 32px',
    width: 'min(440px, 92vw)', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
  },
  kicker: { fontSize: 12, color: '#f59e0b', fontWeight: 700, letterSpacing: 1.5 },
  star: {
    fontSize: 48, lineHeight: 1, background: 'none', border: 'none',
    cursor: 'pointer', padding: '2px 4px',
  },
  ratingLabel: { height: 24, marginTop: 4, fontWeight: 700, color: '#f59e0b', fontSize: 15 },
  textarea: {
    width: '100%', marginTop: 12, padding: '10px 12px', border: '1px solid #d1d5db',
    borderRadius: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
  },
  submit: {
    width: '100%', marginTop: 14, padding: '13px', background: '#f59e0b', color: '#fff',
    border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
  submitOff: { background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' },
  skip: {
    marginTop: 8, background: 'none', border: 'none', color: '#94a3b8',
    fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
  },
};
