// src/POS/MorningRecognition.jsx
// Pengakuan pagi — saat kasir mulai shift hari ini, kalau kemarin dia
// punya pencapaian objektif (Top Sales, Top Upsell, Perfect Rating, dll),
// tampilkan momen cinematic 5 detik.
//
// Filosofi: badge ini BUKAN dipilih atasan, BUKAN dipilih sistem secara
// sembarangan. Lahir murni dari data kemarin. "Yang baik makin baik"
// dimulai dgn yang baik TAHU dia baik.
//
// Auto-dismiss setelah 6 detik atau saat user klik.

import React, { useEffect, useState } from 'react';

export default function MorningRecognition({ apiBase = '', onDone }) {
  const [data, setData] = useState(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    let alive = true;
    fetch(`${apiBase}/api/cashier-kpi/me/recognition`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive) return;
        // Show kalau ada badge ATAU highlight comment. Kasir yg gak ranking #1
        // tapi dpt komentar customer yg menyentuh tetap layak diapresiasi.
        const hasBadges = Array.isArray(d?.badges) && d.badges.length > 0;
        const hasHighlight = d?.highlight && d.highlight.comment;
        if (!d || (!hasBadges && !hasHighlight)) {
          onDone?.();
          return;
        }
        setData(d);
      })
      .catch(() => { if (alive) onDone?.(); });
    return () => { alive = false; };
  }, [apiBase, onDone]);

  // Auto-dismiss + sound cue
  useEffect(() => {
    if (!data) return;
    try {
      // Lightweight chime via Web Audio API (no asset)
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 1320, 1760].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.05 + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4 + i * 0.12);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + 0.5 + i * 0.12);
      });
    } catch {}
    // Beri waktu lebih lama kalau ada highlight quote (perlu dibaca)
    const dwellMs = data.highlight ? 10000 : 6000;
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDone?.(), 400);
    }, dwellMs);
    return () => clearTimeout(t);
  }, [data, onDone]);

  if (!data) return null;

  return (
    <div
      style={{ ...S.overlay, opacity: visible ? 1 : 0, transition: 'opacity 0.4s' }}
      onClick={() => { setVisible(false); setTimeout(() => onDone?.(), 200); }}
    >
      <style>{CSS}</style>

      {/* Sparkle field */}
      <div aria-hidden style={S.sparkleField}>
        <span style={{ ...S.sparkle, top: '12%', left: '18%', animationDelay: '0s' }}>✨</span>
        <span style={{ ...S.sparkle, top: '22%', left: '78%', animationDelay: '0.3s' }}>⭐</span>
        <span style={{ ...S.sparkle, top: '55%', left: '8%', animationDelay: '0.6s' }}>✨</span>
        <span style={{ ...S.sparkle, top: '68%', left: '85%', animationDelay: '0.9s' }}>⭐</span>
        <span style={{ ...S.sparkle, top: '32%', left: '50%', animationDelay: '0.2s' }}>✨</span>
        <span style={{ ...S.sparkle, top: '82%', left: '40%', animationDelay: '0.4s' }}>⭐</span>
      </div>

      <div style={S.box}>
        <div style={S.eyebrow}>SELAMAT PAGI</div>
        <h1 style={S.greeting}>{data.cashier}</h1>

        {data.badges && data.badges.length > 0 ? (
          <>
            <div style={S.subtitle}>Kemarin Anda meraih pengakuan:</div>
            <div style={S.badgeRow}>
              {data.badges.map((b, i) => (
                <div
                  key={b.id}
                  style={{ ...S.badgeCard, animation: `morn-badge-pop 0.6s ${i * 0.15}s both` }}
                >
                  <div style={S.badgeIcon}>{b.icon}</div>
                  <div style={S.badgeLabel}>{b.label}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={S.subtitle}>Ada cerita berharga untukmu kemarin…</div>
        )}

        {data.message && (
          <div style={S.message}>{data.message}</div>
        )}

        {data.highlight && data.highlight.comment && (
          <figure style={S.highlight}>
            <div style={S.highlightLabel}>Apa yang customer katakan tentang Anda kemarin:</div>
            <div style={S.highlightMark}>"</div>
            <blockquote style={S.highlightText}>{data.highlight.comment}</blockquote>
            <figcaption style={S.highlightStars}>
              {'★'.repeat(data.highlight.rating || 5)}
            </figcaption>
          </figure>
        )}

        <div style={S.foot}>Ketuk untuk menutup</div>
      </div>
    </div>
  );
}

const CSS = `
@keyframes morn-badge-pop {
  0% { opacity: 0; transform: translateY(24px) scale(0.7); }
  60% { transform: translateY(-6px) scale(1.08); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes morn-sparkle {
  0%, 100% { opacity: 0.2; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.25); }
}
@keyframes morn-greet {
  0% { opacity: 0; transform: translateY(-12px); }
  100% { opacity: 1; transform: translateY(0); }
}
`;

const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 99999,
    background: 'radial-gradient(circle at center, rgba(245,158,11,0.35) 0%, rgba(0,0,0,0.95) 70%)',
    backdropFilter: 'blur(12px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    cursor: 'pointer',
  },
  sparkleField: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  sparkle: { position: 'absolute', fontSize: 28, animation: 'morn-sparkle 1.6s ease-in-out infinite', filter: 'drop-shadow(0 0 12px rgba(255,215,0,0.6))' },
  box: { textAlign: 'center', maxWidth: 560, color: '#fff', position: 'relative' },
  eyebrow: { fontSize: 13, letterSpacing: 3, color: '#FFD700', fontWeight: 600, marginBottom: 8, animation: 'morn-greet 0.5s 0.2s both' },
  greeting: {
    fontSize: 48, fontWeight: 800, margin: '0 0 18px', letterSpacing: -1,
    background: 'linear-gradient(180deg, #fff 0%, #FFD700 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    animation: 'morn-greet 0.5s 0.4s both',
  },
  subtitle: { fontSize: 15, color: '#cbd5e1', marginBottom: 28 },
  badgeRow: { display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 28 },
  badgeCard: {
    background: 'linear-gradient(180deg, rgba(255,215,0,0.18) 0%, rgba(245,158,11,0.06) 100%)',
    border: '1px solid rgba(255,215,0,0.4)',
    borderRadius: 16, padding: '18px 16px', minWidth: 110,
    boxShadow: '0 10px 30px rgba(0,0,0,0.4), inset 0 0 30px rgba(255,215,0,0.08)',
  },
  badgeIcon: { fontSize: 44, marginBottom: 8, filter: 'drop-shadow(0 4px 16px rgba(255,215,0,0.4))' },
  badgeLabel: { fontSize: 12, color: '#FFD700', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' },
  message: {
    fontSize: 16, fontStyle: 'italic', color: '#fbbf24', maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.5,
    animation: 'morn-greet 0.5s 1.4s both',
  },
  foot: { fontSize: 11, color: '#94a3b8', letterSpacing: 1.2 },
  // Highlight quote — emotional payoff
  highlight: {
    margin: '0 auto 24px',
    maxWidth: 500,
    padding: '18px 24px 16px',
    background: 'linear-gradient(180deg, rgba(255,215,0,0.10) 0%, rgba(245,158,11,0.04) 100%)',
    border: '1px solid rgba(255,215,0,0.25)',
    borderRadius: 16,
    position: 'relative',
    animation: 'morn-greet 0.6s 1.8s both',
  },
  highlightLabel: {
    fontSize: 11, color: '#fbbf24', letterSpacing: 1.5, textTransform: 'uppercase',
    fontWeight: 600, marginBottom: 8,
  },
  highlightMark: {
    position: 'absolute', top: 18, right: 18, fontSize: 56, lineHeight: 1,
    color: 'rgba(255,215,0,0.30)', fontFamily: 'Georgia, serif', pointerEvents: 'none',
  },
  highlightText: {
    margin: 0, fontSize: 16, lineHeight: 1.55, fontStyle: 'italic', color: '#fef3c7',
    fontFamily: 'Georgia, "Times New Roman", serif', textAlign: 'left',
  },
  highlightStars: { textAlign: 'right', marginTop: 10, color: '#FFD700', fontSize: 14, letterSpacing: 2 },
};
