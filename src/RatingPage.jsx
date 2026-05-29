// src/RatingPage.jsx
// Public rating page — diakses customer via QR di struk thermal.
// URL: /?rate=ORDER_ID
//
// Flow yg dikehendaki Bintoro:
//   STEP 1 (default) → Rating + komentar (cermin jujur karyaOS)
//   STEP 2 (setelah submit) → Tracking status pesanan
//
// Filosofi: feedback adalah prioritas (suara customer jujur tercatat).
// Setelah customer kasih rating, baru disuguhi info status — terasa
// seperti hadiah, bukan ditodong informasi sebelum mereka diberi suara.

import React, { useState, useEffect } from 'react';
import POSSatisfaction from './POS/POSSatisfaction.jsx';
import API_HOST from './apiBase.js';

const STATUS_META = {
  waiting:    { icon: '⏳', label: 'Menunggu',     color: '#94a3b8', desc: 'Pesanan tercatat, menunggu dapur mulai siapkan' },
  preparing:  { icon: '🍳', label: 'Disiapkan',    color: '#F59E0B', desc: 'Dapur lagi menyiapkan pesanan Anda' },
  ready:      { icon: '🛎️', label: 'Siap Diambil', color: '#10B981', desc: 'Pesanan siap! Silakan ambil di counter' },
  completed:  { icon: '✅', label: 'Selesai',      color: '#10B981', desc: 'Pesanan sudah diserahkan. Selamat menikmati 💛' },
  cancelled:  { icon: '❌', label: 'Dibatalkan',   color: '#EF4444', desc: 'Pesanan dibatalkan. Mohon maaf atas ketidaknyamanan' },
};

function rupiah(n) { return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID'); }

function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'baru saja';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export default function RatingPage() {
  const orderRef = new URLSearchParams(window.location.search).get('rate') || '';
  const [step, setStep] = useState('rating'); // 'rating' | 'tracking'

  if (!orderRef) {
    return (
      <Shell>
        <div style={S.icon}>🔍</div>
        <h2 style={S.title}>Tidak ada order untuk dinilai</h2>
        <p style={S.sub}>Link ini tidak valid atau sudah kedaluwarsa.</p>
      </Shell>
    );
  }

  // STEP 1: Rating + komentar
  if (step === 'rating') {
    return (
      <div style={S.bg}>
        <div style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
          <POSSatisfaction
            order={{ ref: orderRef }}
            apiBase={API_HOST}
            source="qr-struk"
            onDone={() => setStep('tracking')}
          />
        </div>
      </div>
    );
  }

  // STEP 2: Tracking status
  return <TrackingScreen orderRef={orderRef} />;
}

function TrackingScreen({ orderRef }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`${API_HOST}/api/orders/${encodeURIComponent(orderRef)}`)
        .then(r => r.ok ? r.json() : null)
        .then(o => { if (!cancelled) { setOrder(o); setLoading(false); } })
        .catch(() => { if (!cancelled) setLoading(false); });
    };
    load();
    // Polling per 15s — biar customer lihat status update tanpa refresh manual
    const interval = setInterval(() => { if (!cancelled) load(); }, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [orderRef]);

  const status = order?.status || 'waiting';
  const meta = STATUS_META[status] || STATUS_META.waiting;
  const items = order?.items || [];
  const itemCount = items.reduce((s, i) => s + (i.qty || i.q || 0), 0);

  return (
    <div style={S.bg}>
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Thank-you mini header — pengakuan setelah submit rating */}
        <div style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', borderRadius: 14, padding: '12px 18px', textAlign: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
          <span style={{ fontSize: 16, marginRight: 6 }}>💛</span>
          <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
            Terima kasih atas penilaian Anda
          </span>
        </div>

        {/* Status card */}
        <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 12px 36px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{
            padding: '32px 24px',
            background: `linear-gradient(135deg, ${meta.color}15, ${meta.color}08)`,
            borderBottom: '1px solid #f1f5f9',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 12, filter: `drop-shadow(0 6px 16px ${meta.color}30)` }}>
              {meta.icon}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 6 }}>
              STATUS PESANAN
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: meta.color, letterSpacing: -0.5, marginBottom: 10 }}>
              {meta.label}
            </div>
            <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5, maxWidth: 340, margin: '0 auto' }}>
              {meta.desc}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              ⏳ Memuat detail pesanan…
            </div>
          ) : !order ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Detail pesanan tidak ditemukan.
            </div>
          ) : (
            <div style={{ padding: '18px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>ORDER</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1F1F2E', fontFamily: "'Geist Mono',monospace" }}>#{order.id}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>TOTAL</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1F1F2E', fontFamily: "'Geist Mono',monospace" }}>{rupiah(order.total)}</div>
                </div>
              </div>

              {itemCount > 0 && (
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                  {itemCount} item · {order.type === 'dine' ? 'Dine in' : order.type === 'takeaway' ? 'Take away' : order.type || '—'}
                  {order.table && order.table !== '-' && ` · Meja ${order.table}`}
                </div>
              )}

              {items.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e2e8f0' }}>
                  {items.slice(0, 5).map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', padding: '3px 0' }}>
                      <span>{(it.qty || it.q || 1)}× {it.name || it.n || 'Item'}</span>
                      <span style={{ fontFamily: "'Geist Mono',monospace", color: '#64748b' }}>{rupiah((it.p || it.price || 0) * (it.qty || it.q || 1))}</span>
                    </div>
                  ))}
                  {items.length > 5 && (
                    <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 4, fontStyle: 'italic' }}>
                      + {items.length - 5} item lainnya
                    </div>
                  )}
                </div>
              )}

              {order.time && (
                <div style={{ marginTop: 14, fontSize: 11, color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>
                  Dipesan {timeAgo(order.time)}
                </div>
              )}
            </div>
          )}

          {status !== 'completed' && status !== 'cancelled' && (
            <div style={{ padding: '10px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', textAlign: 'center', fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
              💫 Status auto-update setiap 15 detik
            </div>
          )}
        </div>

        {/* Footer note */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>
          Selamat menikmati 💛
        </div>
      </div>
    </div>
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
