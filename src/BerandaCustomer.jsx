// src/BerandaCustomer.jsx
//
// Beranda Customer — surface khusus customer untuk "menyapa" karyaOS.
// Filosofi (Bintoro 2026-05-29): "Mereka kembali bukan karena makanan
// enak, tapi kembali hanya menunggu momen berharga dari karyaOS."
//
// Layar ini adalah momen berharga itu. Customer scan QR khusus dari
// outlet → buka beranda → lihat cerita yg ditulis customer lain,
// milestone outlet, sambutan waktu. Bukan untuk transaksi — untuk
// MENYAPA.
//
// Auto-rotate stories supaya selalu ada yg baru tiap lihat.

import React, { useEffect, useState } from 'react';
import API_HOST from './apiBase.js';

export default function BerandaCustomer() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [storyIdx, setStoryIdx] = useState(0);

  useEffect(() => {
    fetch(`${API_HOST}/api/public/beranda`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('fetch failed')))
      .then(setData)
      .catch(e => setErr(e.message));
  }, []);

  // Rotate stories tiap 5 detik
  useEffect(() => {
    if (!data?.stories?.length) return;
    const t = setInterval(() => {
      setStoryIdx(i => (i + 1) % data.stories.length);
    }, 5000);
    return () => clearInterval(t);
  }, [data]);

  if (err) {
    return (
      <div style={S.shell}>
        <div style={S.card}>
          <div style={S.icon}>🤔</div>
          <h2 style={S.title}>Sebentar ya...</h2>
          <p style={S.sub}>Beranda sedang kami siapkan. Coba lagi sebentar.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={S.shell}>
        <div style={{ ...S.card, opacity: 0.5 }}>
          <div style={{ ...S.icon, animation: 'breath 1.6s ease-in-out infinite' }}>🌱</div>
          <p style={{ ...S.sub, marginTop: 12 }}>Sebentar ya, kami siapkan beranda...</p>
        </div>
        <style>{`@keyframes breath { 0%,100%{transform:scale(1);opacity:0.7} 50%{transform:scale(1.1);opacity:1} }`}</style>
      </div>
    );
  }

  const story = data.stories?.[storyIdx];
  const channelLabel = { pos: 'POS', kiosk: 'Kiosk', qr: 'QR Order', 'qr-struk': 'Struk' };

  return (
    <div style={S.shell}>
      <style>{CSS}</style>

      {/* Sparkle field — subtle */}
      <div aria-hidden style={S.sparkleField}>
        <span style={{ ...S.sparkle, top: '12%', left: '8%', animationDelay: '0s' }}>✨</span>
        <span style={{ ...S.sparkle, top: '24%', right: '12%', animationDelay: '0.6s' }}>⭐</span>
        <span style={{ ...S.sparkle, bottom: '20%', left: '14%', animationDelay: '0.3s' }}>✨</span>
        <span style={{ ...S.sparkle, bottom: '32%', right: '18%', animationDelay: '0.9s' }}>⭐</span>
      </div>

      <main style={S.content}>
        {/* Hero greeting */}
        <section style={S.hero}>
          <div style={S.eyebrow}>{data.greeting}</div>
          <h1 style={S.headline}>Selamat datang di karyaOS</h1>
          <p style={S.tagline}>{data.tagline}</p>
        </section>

        {/* Milestone counter */}
        <section style={S.milestoneRow}>
          <div style={S.milestone}>
            <div style={S.milestoneNumber}>{data.milestone.orders_week.toLocaleString('id-ID')}</div>
            <div style={S.milestoneLabel}>cerita pesanan minggu ini</div>
          </div>
          {data.milestone.total_served > 0 && (
            <div style={S.milestone}>
              <div style={{ ...S.milestoneNumber, color: '#22D3EE' }}>{data.milestone.total_served.toLocaleString('id-ID')}</div>
              <div style={S.milestoneLabel}>teman sudah datang ke sini</div>
            </div>
          )}
        </section>

        {/* Story carousel */}
        {story && (
          <section style={S.storySection}>
            <div style={S.storyEyebrow}>💛 SUARA TEMAN</div>
            <figure key={storyIdx} style={S.storyCard}>
              <div style={S.storyMark}>"</div>
              <blockquote style={S.storyText}>{story.comment}</blockquote>
              <figcaption style={S.storyCaption}>
                <span style={S.storyStars}>{'★'.repeat(story.rating || 5)}</span>
                <span style={S.storyMeta}>{channelLabel[story.source] || story.source || 'karyaOS'}</span>
              </figcaption>
            </figure>
            {data.stories.length > 1 && (
              <div style={S.dots}>
                {data.stories.map((_, i) => (
                  <span key={i} style={{
                    ...S.dot,
                    background: i === storyIdx ? '#FFD700' : 'rgba(255,255,255,0.20)',
                  }} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Most loved */}
        {data.most_loved && (
          <section style={S.lovedSection}>
            <div style={S.lovedLabel}>YG PALING DISUKAI MINGGU INI</div>
            <div style={S.lovedName}>🌟 {data.most_loved.name}</div>
            <div style={S.lovedQty}>dipesan {data.most_loved.qty.toLocaleString('id-ID')} kali</div>
          </section>
        )}

        {/* Closing */}
        <footer style={S.footer}>
          <p style={S.footerText}>Terima kasih sudah singgah.</p>
          <p style={S.footerSub}>karyaOS — selalu menunggu Anda kembali.</p>
        </footer>
      </main>
    </div>
  );
}

const CSS = `
@keyframes berandaSparkle {
  0%, 100% { opacity: 0.25; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}
@keyframes berandaFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

const S = {
  shell: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at top, rgba(245,158,11,0.18) 0%, #0a0e16 60%, #000 100%)',
    color: '#fff',
    fontFamily: '"Geist", system-ui, -apple-system, sans-serif',
    position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '40px 20px 60px',
  },
  card: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20, padding: 40, textAlign: 'center', maxWidth: 420,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
  },
  icon: { fontSize: 60, lineHeight: 1, margin: 0, filter: 'drop-shadow(0 6px 16px rgba(245,158,11,0.25))' },
  title: { fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.2, margin: 0 },
  sub: { fontSize: 14, color: '#94a3b8', margin: 0, lineHeight: 1.5 },

  sparkleField: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  sparkle: { position: 'absolute', fontSize: 24, animation: 'berandaSparkle 2.2s ease-in-out infinite', filter: 'drop-shadow(0 0 12px rgba(255,215,0,0.50))' },

  content: { width: '100%', maxWidth: 540, position: 'relative', zIndex: 1 },

  hero: { textAlign: 'center', marginBottom: 36 },
  eyebrow: {
    fontSize: 12, letterSpacing: 3, color: '#FFD700', fontWeight: 600,
    marginBottom: 10, textTransform: 'uppercase',
  },
  headline: {
    fontSize: 36, fontWeight: 800, letterSpacing: -0.8, margin: '0 0 12px',
    background: 'linear-gradient(180deg, #fff 0%, #FFD700 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    lineHeight: 1.1,
  },
  tagline: {
    fontSize: 15, color: '#cbd5e1', margin: 0, lineHeight: 1.5,
    fontStyle: 'italic', maxWidth: 420, marginLeft: 'auto', marginRight: 'auto',
  },

  milestoneRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 36 },
  milestone: {
    background: 'linear-gradient(180deg, rgba(255,215,0,0.10) 0%, rgba(245,158,11,0.02) 100%)',
    border: '1px solid rgba(255,215,0,0.20)',
    borderRadius: 16, padding: '18px 16px', textAlign: 'center',
  },
  milestoneNumber: {
    fontSize: 36, fontWeight: 800, color: '#FFD700',
    fontFamily: "'Geist Mono', monospace", letterSpacing: -1, lineHeight: 1,
  },
  milestoneLabel: {
    fontSize: 11, color: '#94a3b8', marginTop: 6,
    letterSpacing: 0.3, fontWeight: 500,
  },

  storySection: { marginBottom: 36, animation: 'berandaFadeIn 0.5s ease both' },
  storyEyebrow: {
    fontSize: 11, letterSpacing: 2.5, color: '#fbbf24', fontWeight: 700,
    marginBottom: 12, textAlign: 'center',
  },
  storyCard: {
    margin: 0, padding: '24px 28px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
    border: '1px solid rgba(245,158,11,0.20)',
    borderRadius: 18, position: 'relative',
    animation: 'berandaFadeIn 0.6s ease both',
  },
  storyMark: {
    position: 'absolute', top: 10, left: 18, fontSize: 64, lineHeight: 1,
    color: 'rgba(245,158,11,0.30)', fontFamily: 'Georgia, serif',
    pointerEvents: 'none',
  },
  storyText: {
    margin: 0, fontSize: 18, lineHeight: 1.55, fontStyle: 'italic',
    color: '#fde68a', fontFamily: 'Georgia, "Times New Roman", serif',
    paddingLeft: 28, marginBottom: 14,
  },
  storyCaption: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    paddingLeft: 28,
  },
  storyStars: { color: '#F59E0B', fontSize: 14, letterSpacing: 1.5 },
  storyMeta: { fontSize: 11, color: '#94a3b8', letterSpacing: 0.4 },
  dots: {
    display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14,
  },
  dot: { width: 7, height: 7, borderRadius: '50%', transition: 'background 0.3s' },

  lovedSection: {
    textAlign: 'center', marginBottom: 32,
    padding: '18px 20px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14,
  },
  lovedLabel: {
    fontSize: 10, color: '#94a3b8', letterSpacing: 2,
    marginBottom: 6, fontWeight: 600,
  },
  lovedName: { fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 },
  lovedQty: { fontSize: 12, color: '#cbd5e1' },

  footer: { textAlign: 'center', paddingTop: 12 },
  footerText: { fontSize: 14, color: '#cbd5e1', margin: '0 0 4px', fontStyle: 'italic' },
  footerSub: { fontSize: 11, color: '#64748b', margin: 0, letterSpacing: 0.4 },
};
