// src/POS/POSSatisfaction.jsx
// Customer satisfaction popup — opens after receipt closed ("Done").
// Customer gives 1-5 stars + optional comment → POST /api/feedback.
//
// Props:
//   order   — { ref, cashier }
//   apiBase — backend host (appends "/api/feedback")
//   onDone  — called after submit / skip

import React, { useState } from 'react';

const RATING_LABEL = { 1: 'Disappointed 😞', 2: 'Below average 😐', 3: 'Okay 🙂', 4: 'Great 😄', 5: 'Outstanding 🤩' };

export default function POSSatisfaction({ order, apiBase = '', source = 'pos', onDone }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [step, setStep] = useState('rate');
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
    } catch (e) { /* feedback failed — don't block cashier */ }
    setStep('thanks');
    setTimeout(() => onDone?.(), 1800);
  };

  if (step === 'thanks') {
    return (
      <div style={S.overlay}>
        <div style={{ ...S.box, position: 'relative', overflow: 'hidden' }}>
          <style>{POS_SAT_CSS}</style>
          <div style={S.sparkleField} aria-hidden>
            <span style={{ ...S.sparkle, top: '12%', left: '18%', animationDelay: '0s' }}>✨</span>
            <span style={{ ...S.sparkle, top: '22%', left: '78%', animationDelay: '0.3s' }}>⭐</span>
            <span style={{ ...S.sparkle, top: '55%', left: '8%', animationDelay: '0.6s' }}>✨</span>
            <span style={{ ...S.sparkle, top: '68%', left: '85%', animationDelay: '0.9s' }}>⭐</span>
            <span style={{ ...S.sparkle, top: '82%', left: '40%', animationDelay: '0.4s' }}>✨</span>
          </div>
          <div style={{ fontSize: 72, lineHeight: 1, filter: 'drop-shadow(0 0 30px color-mix(in srgb, var(--brand-primary,#FF6B35) 40%, transparent))', animation: 'pos-thanks-pop 0.7s cubic-bezier(0.18,1.05,0.4,1) both' }}>✨</div>
          <h2 style={S.thanksTitle}>Thank you</h2>
          <div style={S.thanksSub}>Your feedback means a lot to us 💛</div>
        </div>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <div style={S.overlay}>
      <style>{POS_SAT_CSS}</style>
      <div style={S.box}>
        <div style={S.kicker}>CUSTOMER SATISFACTION</div>
        <h2 style={S.title}>How was your experience?</h2>
        <div style={S.orderRef}>Order {order?.ref || ''}</div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
              style={{ ...S.star, color: n <= shown ? 'var(--brand-primary,#FF6B35)' : 'rgba(255,255,255,0.15)', filter: n <= shown ? 'drop-shadow(0 4px 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 35%, transparent))' : 'none' }}>
              ★
            </button>
          ))}
        </div>
        <div style={S.ratingLabel}>{shown ? RATING_LABEL[shown] : ' '}</div>

        <textarea value={comment} onChange={e => setComment(e.target.value)}
          placeholder="Comments or suggestions (optional)…" rows={3} style={S.textarea} />

        <button onClick={submit} disabled={rating < 1 || submitting}
          style={{ ...S.submit, ...(rating < 1 || submitting ? S.submitOff : {}) }}>
          {submitting ? 'Sending…' : 'Submit rating'}
        </button>
        <button onClick={() => onDone?.()} style={S.skip}>Skip</button>
      </div>
    </div>
  );
}

const POS_SAT_CSS = `
  @keyframes pos-thanks-pop {
    0%   { opacity:0; transform:scale(0.6) rotate(-12deg); }
    60%  { transform:scale(1.15) rotate(4deg); }
    100% { opacity:1; transform:scale(1) rotate(0); }
  }
  @keyframes pos-sparkle-float {
    0%,100% { opacity:0; transform:translateY(0) scale(0.6) rotate(0); }
    30%     { opacity:1; transform:translateY(-8px) scale(1.1) rotate(8deg); }
    60%     { opacity:0.6; transform:translateY(4px) scale(0.85) rotate(-6deg); }
  }
  @keyframes pos-sat-slide {
    from { opacity:0; transform:translateY(20px) scale(.96); }
    to   { opacity:1; transform:translateY(0) scale(1); }
  }
`;

const FONT = "'Inter',sans-serif";
const S = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200,
    fontFamily: FONT,
  },
  box: {
    background: 'linear-gradient(180deg, rgba(40,44,58,0.92) 0%, rgba(20,22,32,0.95) 100%)',
    backdropFilter: 'blur(40px) saturate(200%)',
    WebkitBackdropFilter: 'blur(40px) saturate(200%)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: '32px 36px 28px',
    width: 'min(440px, 92vw)',
    textAlign: 'center',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 60px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.3)',
    animation: 'pos-sat-slide 0.4s cubic-bezier(.2,.8,.2,1)',
  },
  kicker: {
    fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 500, letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: 6,
  },
  title: {
    margin: 0, color: 'rgba(255,255,255,0.95)', fontSize: 22, fontWeight: 600,
    letterSpacing: '-0.6px', fontFamily: FONT,
  },
  orderRef: {
    color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 6, marginBottom: 20,
    letterSpacing: '-0.1px', fontVariantNumeric: 'tabular-nums',
  },
  star: {
    fontSize: 44, lineHeight: 1, background: 'none', border: 'none',
    cursor: 'pointer', padding: '2px 4px',
    transition: 'transform 0.18s cubic-bezier(.2,.8,.2,1), color 0.18s ease',
  },
  ratingLabel: {
    height: 22, marginTop: 6, fontWeight: 500, color: 'var(--brand-primary,#FF6B35)',
    fontSize: 14, letterSpacing: '-0.2px', textShadow: '0 1px 2px rgba(0,0,0,0.45)',
  },
  textarea: {
    width: '100%', marginTop: 14, padding: '11px 13px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.92)',
    borderRadius: 12, fontSize: 13, fontFamily: FONT, resize: 'vertical', boxSizing: 'border-box',
    outline: 'none', letterSpacing: '-0.1px',
  },
  submit: {
    width: '100%', marginTop: 14, padding: '13px',
    background: 'radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))',
    color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.16)', borderRadius: 14,
    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, letterSpacing: '-0.2px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)',
  },
  submitOff: {
    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)',
    border: '1px solid rgba(255,255,255,0.06)', cursor: 'not-allowed',
    textShadow: 'none', boxShadow: 'none',
  },
  skip: {
    marginTop: 10, background: 'transparent', border: 'none',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12, cursor: 'pointer', fontFamily: FONT, letterSpacing: '-0.1px',
  },
  sparkleField: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  sparkle: {
    position: 'absolute', fontSize: 16,
    animation: 'pos-sparkle-float 2.4s ease-in-out infinite both',
    filter: 'drop-shadow(0 0 8px color-mix(in srgb, var(--brand-primary,#FF6B35) 50%, transparent))',
  },
  thanksTitle: {
    margin: '14px 0 6px', fontSize: 28, fontWeight: 600, letterSpacing: '-0.8px', lineHeight: 1.1,
    color: '#fff', fontFamily: FONT,
  },
  thanksSub: {
    color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 400, marginTop: 4,
    position: 'relative', letterSpacing: '-0.1px',
  },
};
