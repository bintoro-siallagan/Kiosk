// src/CinemaCelebration.jsx
// Layar gamifikasi setelah customer cinema selesai kasih rating.
// Customer dapet gelar (Sultan/Crazy Rich/Big Spender/dll) berdasar total belanja
// + peringkat belanja JAM INI vs customer lain (F&B + Cinema combined, karena
// /api/leaderboard adalah vertical-agnostic — semua transaksi numpuk di pool yang sama).
//
// Reset tiap 1 jam → tiap jam ada Sultan baru. Didesain biar enak di-screenshot
// & dishare ke WA Story / Instagram (apresiasi customer + viral marketing organik).
//
// Props: { order:{customerName, total, filmTitle}, apiBase, onDone }

import { useState, useEffect, useRef } from 'react';

const fmtRp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const MEDAL = ['🥇', '🥈', '🥉'];

export default function CinemaCelebration({ order, apiBase = '', onDone }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const recorded = useRef(false);

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    const amount = Number(order?.total || 0);
    if (!amount || amount <= 0) { setErr(true); return; }
    fetch(`${apiBase}/api/leaderboard/record`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: order?.customerName || 'Tamu Cinema', amount }),
    })
      .then(r => r.json())
      .then(res => { if (res && res.title) setD(res); else setErr(true); })
      .catch(() => setErr(true));
  }, [apiBase, order]);

  if (err) {
    return (
      <div style={S.root}><div style={S.box}>
        <div style={{ fontSize: 54 }}>🎬</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: '8px 0' }}>Selamat Menonton!</div>
        <button onClick={onDone} style={S.cta}>Lanjut →</button>
      </div></div>
    );
  }
  if (!d) return <div style={S.root}><div style={S.box}><div style={{ color: '#9ca3af', padding: 30 }}>Menyiapkan gelar…</div></div></div>;

  const t = d.title;
  return (
    <div style={S.root}>
      <div aria-hidden style={S.mesh} />
      <div style={{ ...S.box, borderColor: t.color + '66', boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px ${t.color}33, inset 0 1px 0 rgba(255,255,255,0.06)` }}>
        <div style={S.brand}>🎬 karya<span style={{ color: '#a855f7' }}>OS</span> Cinema</div>
        <div style={S.kicker}>🎉 TIKET BERHASIL DIBELI</div>
        <div style={{ fontSize: 84, lineHeight: 1, margin: '4px 0', filter: `drop-shadow(0 0 24px ${t.color}66)` }}>{t.emoji}</div>
        <div style={{ fontSize: 12, color: '#9ca3af', letterSpacing: 1 }}>Gelar kamu jam ini</div>
        <div style={{ fontSize: 40, fontWeight: 900, color: t.color, letterSpacing: 1, lineHeight: 1.05, textShadow: `0 0 24px ${t.color}55` }}>{t.title}</div>
        <div style={{ fontSize: 14, color: '#e5e7eb', marginTop: 10 }}>
          Belanja kamu: <b style={{ color: t.color, fontFamily: "'Geist Mono',monospace" }}>{fmtRp(d.amount)}</b>
        </div>
        {order?.filmTitle && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4, fontStyle: 'italic' }}>
            🍿 {order.filmTitle}
          </div>
        )}
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
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'Geist Mono',monospace", width: 92, textAlign: 'right', flexShrink: 0 }}>{fmtRp(r.amount)}</span>
            </div>
          ))}
        </div>

        <div style={S.shareHint}>📸 Screenshot & pamerin ke WA Story / Instagram kamu!</div>
        <button onClick={onDone} style={{ ...S.cta, background: `linear-gradient(135deg, ${t.color}, #c084fc)` }}>Lanjut →</button>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Tiap jam ada Sultan baru — balik lagi buat rebut posisi! 🚀</div>
      </div>
    </div>
  );
}

const S = {
  root: {
    position: 'fixed', inset: 0, zIndex: 10000,
    background: "radial-gradient(ellipse 70% 55% at 50% 38%, rgba(70,76,98,0.45) 0%, transparent 70%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)",
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Inter','system-ui',sans-serif", padding: 20, overflowY: 'auto',
    animation: 'karyaCelebrateFade 0.4s ease-out',
  },
  mesh: {
    position: 'fixed', inset: 0, pointerEvents: 'none',
    background: 'radial-gradient(800px 600px at 20% 10%, rgba(168,85,247,0.10), transparent 70%), radial-gradient(600px 400px at 80% 80%, rgba(245,158,11,0.08), transparent 70%)',
  },
  box: {
    position: 'relative',
    background: 'linear-gradient(180deg, rgba(22,22,26,0.95), rgba(15,15,18,0.95))',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22,
    padding: '26px 30px 28px', width: 'min(460px,96vw)', textAlign: 'center',
  },
  brand: { fontFamily: "'Geist Mono',monospace", fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: -0.3, marginBottom: 8 },
  kicker: { fontFamily: "'Geist Mono',monospace", fontSize: 10, fontWeight: 800, letterSpacing: 2, color: '#a78bfa', textTransform: 'uppercase' },
  rankPill: { display: 'inline-block', marginTop: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: '8px 18px', fontSize: 13, color: '#d4d4d8' },
  statsRow: { display: 'flex', gap: 10, marginTop: 16 },
  stat: { flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 8px' },
  statLbl: { fontSize: 10, color: '#9ca3af', letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace", textTransform: 'uppercase', fontWeight: 700 },
  statVal: { fontSize: 18, fontWeight: 800, fontFamily: "'Geist Mono',monospace", marginTop: 4, letterSpacing: -0.5 },
  lbBox: { marginTop: 16, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '12px 14px', textAlign: 'left' },
  lbTitle: { fontSize: 10, fontWeight: 800, letterSpacing: 2, color: '#fbbf24', marginBottom: 8, textAlign: 'center', fontFamily: "'Geist Mono',monospace", textTransform: 'uppercase' },
  lbRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  shareHint: { marginTop: 16, background: 'rgba(236,72,153,0.10)', border: '1px solid rgba(236,72,153,0.35)', borderRadius: 12, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#f9a8d4' },
  cta: { width: '100%', marginTop: 14, padding: '14px', background: 'linear-gradient(135deg,#a855f7,#c084fc)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.2)', letterSpacing: 0.3, transition: 'transform 0.15s ease, filter 0.15s ease' },
};
