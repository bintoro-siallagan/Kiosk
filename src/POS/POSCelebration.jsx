// src/POS/POSCelebration.jsx
// Layar gamifikasi setelah transaksi — customer dapet gelar (Sultan/dll)
// + peringkat belanja JAM INI (reset tiap 1 jam → tiap jam ada Sultan baru).
// Didesain biar enak di-screenshot & dishare ke WA Story / Instagram.
//
// Props: { order, apiBase, onDone }

import React, { useState, useEffect, useRef } from 'react';

const fmtRp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const MEDAL = ['🥇', '🥈', '🥉'];

export default function POSCelebration({ order, apiBase = '', onDone }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const recorded = useRef(false);

  useEffect(() => {
    if (recorded.current) return;   // cegah dobel-catat (StrictMode dev)
    recorded.current = true;
    const record = (amount) => {
      if (!amount || amount <= 0) { setErr(true); return; }
      fetch(`${apiBase}/api/leaderboard/record`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: order?.customerName || order?.customer || 'Tamu', amount }),
      })
        .then(r => r.json())
        .then(res => { if (res && res.title) setD(res); else setErr(true); })
        .catch(() => setErr(true));
    };
    // total bisa langsung (POS) atau di-fetch dari order id (kiosk/QR)
    if (order?.total > 0) record(order.total);
    else if (order?.id || order?.ref) {
      fetch(`${apiBase}/api/orders/${order.id || order.ref}`)
        .then(r => r.json())
        .then(o => record(o?.total || o?.subtotal || 0))
        .catch(() => setErr(true));
    } else setErr(true);
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
        <div style={S.brand}>🍦 KaryaOS</div>
        <div style={S.kicker}>🎉 TRANSAKSI SELESAI</div>
        <div style={{ fontSize: 76, lineHeight: 1, margin: '4px 0' }}>{t.emoji}</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Gelar kamu jam ini</div>
        <div style={{ fontSize: 38, fontWeight: 900, color: t.color, letterSpacing: 1, lineHeight: 1.1 }}>{t.title}</div>
        <div style={{ fontSize: 14, color: '#e5e7eb', marginTop: 8 }}>
          Belanja kamu: <b style={{ color: t.color }}>{fmtRp(d.amount)}</b>
        </div>
        <div style={S.rankPill}>
          🔥 Peringkat <b style={{ color: '#fbbf24' }}>#{d.rank}</b> dari {d.total_hour} transaksi jam ini
        </div>

        <div style={S.statsRow}>
          <div style={S.stat}>
            <div style={S.statLbl}>🏆 Transaksi Terbesar</div>
            <div style={{ ...S.statVal, color: '#fbbf24' }}>{fmtRp(d.stats.top_transaction)}</div>
          </div>
          <div style={S.stat}>
            <div style={S.statLbl}>📊 Rata-rata Bill</div>
            <div style={{ ...S.statVal, color: '#22d3ee' }}>{fmtRp(d.stats.avg_bill)}</div>
          </div>
        </div>

        <div style={S.lbBox}>
          <div style={S.lbTitle}>👑 SULTAN JAM INI · {d.window}</div>
          {d.top.map(r => (
            <div key={r.rank} style={S.lbRow}>
              <span style={{ width: 28, fontSize: 14, textAlign: 'center', flexShrink: 0 }}>{MEDAL[r.rank - 1] || '#' + r.rank}</span>
              <span style={{ flex: 1, fontSize: 13, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.emoji} {r.name}</span>
              <span style={{ fontSize: 10, color: r.color, fontWeight: 700, flexShrink: 0 }}>{r.title}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'monospace', width: 92, textAlign: 'right', flexShrink: 0 }}>{fmtRp(r.amount)}</span>
            </div>
          ))}
        </div>

        <div style={S.shareHint}>📸 Screenshot & pamerin ke WA Story / Instagram kamu!</div>
        <button onClick={onDone} style={S.cta}>Lanjut →</button>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Tiap jam ada Sultan baru — balik lagi buat rebut posisi! 🚀</div>
      </div>
    </div>
  );
}

const FONT = "'Inter',sans-serif";
const S = {
  root: {
    position: 'fixed', inset: 0,
    background: 'radial-gradient(ellipse 70% 55% at 50% 38%, rgba(70,76,98,0.45) 0%, transparent 70%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)',
    backgroundAttachment: 'fixed',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
    fontFamily: FONT, padding: 20, overflowY: 'auto',
  },
  box: {
    background: 'linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)',
    backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 24, padding: '28px 32px 28px', width: 'min(440px,96vw)', textAlign: 'center',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 60px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.28)',
  },
  brand: { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', letterSpacing: 1.5, marginBottom: 8, textShadow: '0 1px 2px rgba(0,0,0,0.35)' },
  kicker: { fontSize: 11, fontWeight: 500, letterSpacing: 2, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' },
  rankPill: {
    display: 'inline-block', marginTop: 12,
    background: 'color-mix(in srgb, var(--brand-primary,#FF6B35) 14%, rgba(255,255,255,0.02))',
    border: '1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 35%, transparent)',
    borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 500,
    color: '#fff', letterSpacing: '-0.1px', textShadow: '0 1px 2px rgba(0,0,0,0.4)',
  },
  statsRow: { display: 'flex', gap: 10, marginTop: 16 },
  stat: {
    flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14, padding: '12px 8px',
  },
  statLbl: { fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.4, fontWeight: 500, textTransform: 'uppercase' },
  statVal: { fontSize: 17, fontWeight: 600, fontFamily: FONT, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.4px', marginTop: 4, color: 'rgba(255,255,255,0.95)' },
  lbBox: {
    marginTop: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14, padding: '12px 14px', textAlign: 'left',
  },
  lbTitle: {
    fontSize: 10, fontWeight: 500, letterSpacing: 1.5, color: 'rgba(255,255,255,0.55)',
    marginBottom: 8, textAlign: 'center', textTransform: 'uppercase',
  },
  lbRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  shareHint: {
    marginTop: 16, padding: '10px 14px', fontSize: 12, fontWeight: 500,
    background: 'rgba(236,72,153,0.10)', border: '1px solid rgba(236,72,153,0.28)',
    borderRadius: 12, color: '#f9a8d4', letterSpacing: '-0.1px',
  },
  cta: {
    width: '100%', marginTop: 14, padding: '15px',
    background: 'radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))',
    color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.16)', borderRadius: 14,
    fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, letterSpacing: '-0.2px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)',
  },
};
