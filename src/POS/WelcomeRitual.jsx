// src/POS/WelcomeRitual.jsx
// Ritual selamat datang — saat kasir pertama kali login KaryaOS.
//
// Filosofi: "membangun dari 0". Orang masuk kerja tanpa apa-apa, di
// ambang kritis, dengan sedih yang tak bisa diungkapkan. Sistem ini
// adalah hal pertama yg ia sentuh — jadi suara pertama yg ia dengar
// dari KaryaOS harus mengatakan: "Kamu boleh belum tahu apa-apa.
// Tidak apa-apa. Kami akan menemani."
//
// Bukan tutorial fitur. Bukan modal "Setujui & Lanjut". Ini adalah
// pengakuan kemanusiaan — bahwa hari pertama itu tidak mudah, dan
// kami melihatmu.

import React, { useState, useEffect } from 'react';

const PAGES = [
  {
    key: 'greet',
    title: (name) => `Selamat datang, ${name}.`,
    body: 'Hari ini hari pertamamu di KaryaOS. Tidak apa-apa kalau belum tahu apa-apa. Kami akan menemani.',
    icon: '🤝',
  },
  {
    key: 'safe',
    title: () => `Tidak ada salah di hari pertama.`,
    body: 'Kalau ada tombol yang Anda gak sengaja tekan, sistem ini bisa diperbaiki. Tidak ada hukuman karena belajar. Pelan-pelan saja.',
    icon: '🌱',
  },
  {
    key: 'seen',
    title: () => `Setiap pekerjaanmu dicatat dengan jujur.`,
    body: 'Setiap transaksi yang kamu kerjakan, setiap senyum yang kamu berikan ke customer — kami simpan dengan namamu. Tidak hilang. Tidak diserap. Tetap milikmu.',
    icon: '💛',
  },
  {
    key: 'grow',
    title: () => `Yang baik akan dirayakan. Yang masih belajar akan dibantu.`,
    body: 'Tidak ada bandingan dengan kasir lain di minggu pertama. Yang kami pakai untuk ukur kamu adalah dirimu kemarin, bukan veteran yang sudah bertahun.',
    icon: '🌅',
  },
  {
    key: 'start',
    title: (name) => `Selamat memulai, ${name}.`,
    body: 'Karya yang sungguh-sungguh selalu dimulai dari hari pertama. Selamat berjalan.',
    icon: '🚀',
  },
];

export default function WelcomeRitual({ cashierName, apiBase = '', onDone }) {
  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const page = PAGES[idx];
  const isLast = idx === PAGES.length - 1;

  // Unlock audio + soft chime di halaman pertama
  useEffect(() => {
    if (idx !== 0) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Tone lembut — bukan kemenangan, bukan alarm. Sambutan.
      [392, 523, 659].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(0.045, ctx.currentTime + 0.1 + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6 + i * 0.18);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + 0.7 + i * 0.18);
      });
    } catch {}
  }, [idx]);

  const next = async () => {
    if (!isLast) {
      setIdx(i => i + 1);
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('adminToken');
      await fetch(`${apiBase}/api/auth/onboarded`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {}
    onDone?.();
  };

  return (
    <div style={S.shell}>
      <style>{CSS}</style>
      <div aria-hidden style={S.sparkle}>
        <span style={{ ...S.dot, top: '14%', left: '12%', animationDelay: '0s' }}>✨</span>
        <span style={{ ...S.dot, top: '24%', left: '82%', animationDelay: '0.6s' }}>✨</span>
        <span style={{ ...S.dot, top: '78%', left: '20%', animationDelay: '0.3s' }}>✨</span>
        <span style={{ ...S.dot, top: '64%', left: '88%', animationDelay: '0.9s' }}>✨</span>
        <span style={{ ...S.dot, top: '40%', left: '8%',  animationDelay: '0.4s' }}>✨</span>
      </div>

      <div key={page.key} style={S.page}>
        <div style={S.icon}>{page.icon}</div>
        <h1 style={S.title}>{page.title(cashierName)}</h1>
        <p style={S.body}>{page.body}</p>

        <div style={S.dots}>
          {PAGES.map((_, i) => (
            <span key={i} style={{ ...S.dotIndicator, background: i === idx ? '#FFD700' : 'rgba(255,255,255,0.18)' }} />
          ))}
        </div>

        <div style={S.ctaRow}>
          {!isLast && (
            <button onClick={onDone} style={S.skipBtn}>Lewati</button>
          )}
          <button onClick={next} disabled={submitting} style={S.nextBtn}>
            {submitting ? 'Memulai…' : isLast ? 'Saya siap memulai' : 'Lanjut'}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
@keyframes welcome-page-in {
  0% { opacity: 0; transform: translateY(14px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes welcome-sparkle {
  0%, 100% { opacity: 0.25; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.2); }
}
`;

const S = {
  shell: {
    position: 'fixed', inset: 0, zIndex: 99999,
    background: 'radial-gradient(circle at 40% 30%, rgba(245,158,11,0.30) 0%, rgba(15,23,42,1) 70%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
    fontFamily: '"Geist", system-ui, -apple-system, sans-serif',
  },
  sparkle: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  dot: { position: 'absolute', fontSize: 22, animation: 'welcome-sparkle 1.8s ease-in-out infinite', filter: 'drop-shadow(0 0 12px rgba(255,215,0,0.5))' },
  page: {
    textAlign: 'center', maxWidth: 560, color: '#fff', position: 'relative',
    animation: 'welcome-page-in 0.7s cubic-bezier(0.18,1.05,0.4,1) both',
    padding: '0 12px',
  },
  icon: { fontSize: 64, marginBottom: 24, filter: 'drop-shadow(0 8px 24px rgba(255,215,0,0.35))' },
  title: {
    fontSize: 32, fontWeight: 800, marginBottom: 18, letterSpacing: -0.5, lineHeight: 1.2,
    background: 'linear-gradient(180deg, #fff 0%, #FFD700 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  body: { fontSize: 17, color: '#e2e8f0', lineHeight: 1.65, marginBottom: 36, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' },
  dots: { display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28 },
  dotIndicator: { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.3s' },
  ctaRow: { display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  skipBtn: {
    background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: '#94a3b8',
    padding: '12px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  },
  nextBtn: {
    background: 'linear-gradient(180deg, #FFD700 0%, #F59E0B 100%)', border: 'none', color: '#1a1a1a',
    padding: '14px 32px', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(245,158,11,0.40)', fontFamily: 'inherit', letterSpacing: 0.2,
  },
};
