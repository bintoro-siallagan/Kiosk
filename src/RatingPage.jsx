// src/RatingPage.jsx
// Public rating page — diakses customer via QR di struk thermal.
// URL: /?rate=ORDER_ID
//
// Reuse komponen POSSatisfaction supaya UX konsisten dgn rating popup di POS/Kiosk.
// Bedanya: page ini standalone (gak ada celebration screen / next stage).
// Filosofi: ini adalah "cermin yang jujur" — customer bisa beri penilaian
// tanpa tekanan, kasir gak bisa intercept. Suara customer jujur tercatat.

import React, { useState } from 'react';
import POSSatisfaction from './POS/POSSatisfaction.jsx';
import API_HOST from './apiBase.js';

export default function RatingPage() {
  const orderRef = new URLSearchParams(window.location.search).get('rate') || '';
  const [done, setDone] = useState(false);

  if (!orderRef) {
    return (
      <Shell>
        <div style={S.icon}>🔍</div>
        <h2 style={S.title}>Tidak ada order untuk dinilai</h2>
        <p style={S.sub}>Link rating ini tidak valid atau sudah kedaluwarsa.</p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div style={S.icon}>💛</div>
        <h2 style={S.title}>Terima Kasih</h2>
        <p style={S.sub}>Penilaian Anda sangat berarti bagi kami dan tim.</p>
        <p style={S.foot}>Anda bisa menutup halaman ini.</p>
      </Shell>
    );
  }

  return (
    <POSSatisfaction
      order={{ ref: orderRef }}
      apiBase={API_HOST}
      source="qr-struk"
      onDone={() => setDone(true)}
    />
  );
}

function Shell({ children }) {
  return (
    <div style={S.bg}>
      <div style={S.card}>{children}</div>
    </div>
  );
}

const S = {
  bg: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #FFF7ED 0%, #FFE4D6 100%)',
    padding: 20,
    fontFamily: '"Geist", system-ui, -apple-system, sans-serif',
  },
  card: {
    background: '#fff',
    padding: '48px 32px',
    borderRadius: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
    textAlign: 'center',
    maxWidth: 420,
    width: '100%',
  },
  icon: { fontSize: 72, marginBottom: 16, filter: 'drop-shadow(0 6px 16px rgba(255,107,53,0.25))' },
  title: { fontSize: 24, fontWeight: 700, color: '#1F1F2E', marginBottom: 12 },
  sub: { fontSize: 15, color: '#555', lineHeight: 1.5, marginBottom: 24 },
  foot: { fontSize: 12, color: '#999' },
};
