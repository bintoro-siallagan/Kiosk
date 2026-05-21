// src/POS/POSCelebration.jsx
// Layar gamifikasi setelah transaksi — customer dapet gelar (Sultan/dll)
// + lihat peringkat belanja hari ini. Bikin customer senang & balik lagi.
//
// Props: { order, apiBase, onDone }

import React, { useState, useEffect } from 'react';

const fmtRp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const MEDAL = ['🥇', '🥈', '🥉'];

export default function POSCelebration({ order, apiBase = '', onDone }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/leaderboard/record`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: order?.customerName || order?.customer || 'Tamu',
        amount: order?.total || 0,
      }),
    })
      .then(r => r.json())
      .then(res => { if (res && res.title) setD(res); else setErr(true); })
      .catch(() => setErr(true));
  }, [apiBase, order]);

  if (err) {
    return (
      <div style={S.root}><div style={S.box}>
        <div style={{ fontSize: 54 }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: '8px 0' }}>Transaksi Selesai!</div>
        <button onClick={onDone} style={S.cta}>Lanjut →</button>
      </div></div>
    );
  }
  if (!d) return <div style={S.root}><div style={S.box}><div style={{ color: '#9ca3af', padding: 30 }}>Memuat…</div></div></div>;

  const t = d.title;
  return (
    <div style={S.root}>
      <div style={{ ...S.box, borderColor: t.color + '66' }}>
        <div style={S.kicker}>🎉 TRANSAKSI SELESAI</div>
        <div style={{ fontSize: 80, lineHeight: 1, margin: '8px 0' }}>{t.emoji}</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Gelar kamu hari ini</div>
        <div style={{ fontSize: 38, fontWeight: 900, color: t.color, letterSpacing: 1, lineHeight: 1.1 }}>{t.title}</div>
        <div style={{ fontSize: 14, color: '#e5e7eb', marginTop: 10 }}>
          Belanja kamu: <b style={{ color: t.color }}>{fmtRp(d.amount)}</b>
        </div>
        <div style={S.rankPill}>
          🔥 Peringkat <b style={{ color: '#fbbf24' }}>#{d.rank}</b> dari {d.total_today} transaksi hari ini
        </div>

        <div style={S.lbBox}>
          <div style={S.lbTitle}>🏆 SULTAN HARI INI</div>
          {d.top.map(r => (
            <div key={r.rank} style={S.lbRow}>
              <span style={{ width: 28, fontSize: 14, textAlign: 'center', flexShrink: 0 }}>{MEDAL[r.rank - 1] || '#' + r.rank}</span>
              <span style={{ flex: 1, fontSize: 13, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.emoji} {r.name}</span>
              <span style={{ fontSize: 10, color: r.color, fontWeight: 700, flexShrink: 0 }}>{r.title}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'monospace', width: 92, textAlign: 'right', flexShrink: 0 }}>{fmtRp(r.amount)}</span>
            </div>
          ))}
        </div>

        <button onClick={onDone} style={S.cta}>Lanjut →</button>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>Belanja lagi buat naik peringkat! 🚀</div>
      </div>
    </div>
  );
}

const S = {
  root: { position: 'fixed', inset: 0, background: 'radial-gradient(circle at 50% 0%, #1a1407, #0a0a0a 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, fontFamily: 'system-ui,-apple-system,sans-serif', padding: 20, overflowY: 'auto' },
  box: { background: '#161616', border: '1px solid #2a2a2a', borderRadius: 20, padding: '28px 30px', width: 'min(440px,96vw)', textAlign: 'center' },
  kicker: { fontSize: 12, fontWeight: 700, letterSpacing: 2, color: '#9ca3af' },
  rankPill: { display: 'inline-block', marginTop: 12, background: '#1f1f1f', border: '1px solid #2a2a2a', borderRadius: 20, padding: '7px 16px', fontSize: 13, color: '#d4d4d8' },
  lbBox: { marginTop: 18, background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 12, padding: '10px 14px', textAlign: 'left' },
  lbTitle: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: '#fbbf24', marginBottom: 6, textAlign: 'center' },
  lbRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #1c1c1c' },
  cta: { width: '100%', marginTop: 18, padding: '15px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
};
