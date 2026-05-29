// src/POS/MyKpiPanel.jsx
// MyKPI — cermin jujur untuk kasir yang sedang login.
//
// Filosofi karyaOS: yang baik makin baik, yang kurang baik akan jadi baik.
// Bahasa di sini WAJIB growth-based, BUKAN punishment.
// Contoh: bukan "rating turun!", tapi "rating minggu ini 0.2 di bawah minggu lalu — masih bisa pulih."
//
// Data: GET /api/cashier-kpi/me — return today + this_week + last_week + deltas.
// Endpoint sudah filter by session user, jadi gak perlu identifier dari frontend.

import React, { useEffect, useState } from 'react';

export default function MyKpiPanel({ apiBase = '', onClose }) {
  const [data, setData] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const token = localStorage.getItem('adminToken');
    const auth = token ? { Authorization: `Bearer ${token}` } : {};

    Promise.all([
      fetch(`${apiBase}/api/cashier-kpi/me`, { headers: auth }).then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'gagal muat KPI');
        return j;
      }),
      fetch(`${apiBase}/api/cashier-kpi/me/highlights?limit=5`, { headers: auth })
        .then(r => r.ok ? r.json() : { highlights: [] })
        .catch(() => ({ highlights: [] })),
    ])
      .then(([kpi, hl]) => {
        if (!alive) return;
        setData(kpi);
        setHighlights(Array.isArray(hl?.highlights) ? hl.highlights : []);
        setLoading(false);
      })
      .catch(e => { if (alive) { setErr(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [apiBase]);

  return (
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={S.sheet}>
        <header style={S.head}>
          <div>
            <div style={S.eyebrow}>KPI SAYA</div>
            <div style={S.title}>{data?.cashier || '...'}</div>
          </div>
          <button onClick={onClose} style={S.closeBtn} aria-label="Tutup">✕</button>
        </header>

        {loading && <div style={S.loading}>Memuat cermin jujur…</div>}
        {err && <div style={S.error}>⚠️ {err}</div>}

        {data && !loading && !err && (
          <>
            <TodaySection data={data} />
            <WeekDeltasSection data={data} />
            <GrowthNote data={data} />
            <HighlightsSection highlights={highlights} />
          </>
        )}
      </div>
    </div>
  );
}

function TodaySection({ data }) {
  const t = data.today || {};
  const score = t.kpi_score;
  const achievement = data.achievement_pct;
  const rating = t.feedback_count > 0 ? t.avg_rating : null;
  const upsell = t.upsell_rate;
  const txCount = t.transactions || 0;
  const sales = t.total_sales || 0;

  return (
    <section style={S.section}>
      <div style={S.sectionLabel}>📅 Hari ini</div>
      <div style={S.scoreRow}>
        <ScoreRing score={score} />
        <div style={S.scoreSide}>
          <Stat label="Transaksi" value={txCount} />
          <Stat label="Omset" value={fIDR(sales)} />
          {achievement != null && <Stat label="vs Target" value={`${achievement}%`} tone={achievement >= 100 ? 'up' : achievement >= 70 ? 'flat' : 'down'} />}
        </div>
      </div>
      <div style={S.miniGrid}>
        <MiniMetric icon="⭐" label="Rating" value={rating != null ? rating.toFixed(2) : '–'} sub={t.feedback_count ? `${t.feedback_count} review` : 'belum ada'} />
        <MiniMetric icon="📈" label="Upsell Rate" value={upsell != null ? `${upsell}%` : '–'} sub={upsell != null ? `${t.upsell_orders}/${t.upsell_total} order` : 'belum ada item upsell'} />
      </div>
    </section>
  );
}

function WeekDeltasSection({ data }) {
  if (!data.deltas) return null;
  const d = data.deltas;
  return (
    <section style={S.section}>
      <div style={S.sectionLabel}>📊 Minggu ini vs minggu lalu</div>
      <div style={S.deltaGrid}>
        <DeltaCard label="KPI Score" delta={d.kpi_score} format={(v) => v} />
        <DeltaCard label="Omset" delta={d.total_sales} format={fIDR} />
        <DeltaCard label="Rating" delta={d.avg_rating} format={(v) => v.toFixed(2)} />
        <DeltaCard label="Upsell Rate" delta={d.upsell_rate} format={(v) => `${v}%`} />
      </div>
    </section>
  );
}

function DeltaCard({ label, delta, format }) {
  if (!delta) return (
    <div style={S.deltaCard}>
      <div style={S.deltaLabel}>{label}</div>
      <div style={S.deltaValueMuted}>Belum ada data</div>
    </div>
  );
  const tone = delta.tone;
  const arrow = tone === 'up' ? '📈' : tone === 'down' ? '📉' : '➡️';
  const color = tone === 'up' ? '#10B981' : tone === 'down' ? '#F59E0B' : '#94a3b8';
  const sign = delta.diff > 0 ? '+' : '';
  return (
    <div style={S.deltaCard}>
      <div style={S.deltaLabel}>{label}</div>
      <div style={{ ...S.deltaValue, color }}>
        {arrow} {sign}{format(delta.diff)}
        {delta.pct != null && <span style={S.deltaPct}> ({sign}{delta.pct}%)</span>}
      </div>
    </div>
  );
}

// ── Cerita Berharga — suara customer yang nyata utk kasir ──
// Bukan angka. Bukan badge. Kata-kata customer langsung yg menyentuh.
// Ini hadiah yg kasir biasanya gak pernah tahu sampai ke dia.
function HighlightsSection({ highlights }) {
  if (!highlights || highlights.length === 0) return null;
  const channelLabel = { pos: 'POS', kiosk: 'Kiosk', qr: 'QR Order', 'qr-struk': 'QR Struk' };

  return (
    <section style={S.section}>
      <div style={S.sectionLabel}>💛 Cerita berharga dari customer</div>
      <div style={S.heroQuoteWrap}>
        {highlights.map((h, i) => (
          <figure key={h.id || i} style={S.quoteCard}>
            <div style={S.quoteMark}>"</div>
            <blockquote style={S.quoteText}>{h.comment}</blockquote>
            <figcaption style={S.quoteCaption}>
              <span style={S.quoteRating}>
                {Array.from({ length: h.rating || 5 }).map((_, k) => <span key={k}>★</span>)}
              </span>
              <span style={S.quoteMeta}>
                {channelLabel[h.source] || h.source || ''} · {fDate(h.created_at)}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function fDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

function GrowthNote({ data }) {
  // Susun pesan growth — bahasa empati, bukan punishment.
  const notes = [];
  const t = data.today || {};
  const d = data.deltas || {};

  if (t.kpi_score != null && t.kpi_score >= 80) {
    notes.push({ tone: 'up', text: 'KPI hari ini sangat baik. Pertahankan ritmenya.' });
  } else if (t.kpi_score != null && t.kpi_score >= 60) {
    notes.push({ tone: 'flat', text: 'KPI hari ini stabil. Coba dorong sedikit di upsell atau rating.' });
  }

  if (d.upsell_rate?.tone === 'up') {
    notes.push({ tone: 'up', text: 'Upsell minggu ini lebih baik dari minggu lalu. Effort kamu kelihatan.' });
  } else if (d.upsell_rate?.tone === 'down') {
    notes.push({ tone: 'flat', text: 'Upsell minggu ini sedikit di bawah minggu lalu. Coba tawarkan item upsell di 3 order berikutnya.' });
  }

  if (d.avg_rating?.tone === 'up') {
    notes.push({ tone: 'up', text: 'Rating customer naik dari minggu lalu — pelayananmu terasa.' });
  } else if (d.avg_rating?.tone === 'down') {
    notes.push({ tone: 'flat', text: 'Rating minggu ini turun sedikit. Coba senyum lebih lama saat serahkan struk.' });
  }

  if (data.achievement_pct != null && data.achievement_pct < 50 && (data.today?.transactions || 0) < 5) {
    notes.push({ tone: 'flat', text: 'Hari masih panjang — masih banyak ruang untuk capai target.' });
  }

  if (!notes.length) return null;
  return (
    <section style={S.notes}>
      {notes.map((n, i) => (
        <div key={i} style={{ ...S.note, borderLeftColor: n.tone === 'up' ? '#10B981' : '#94a3b8' }}>
          {n.text}
        </div>
      ))}
    </section>
  );
}

function ScoreRing({ score }) {
  const val = score == null ? 0 : Math.max(0, Math.min(100, score));
  const radius = 56;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - val / 100);
  const color = score == null ? '#475569' : val >= 80 ? '#10B981' : val >= 60 ? '#F59E0B' : '#94a3b8';
  return (
    <div style={S.ring}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div style={S.ringInner}>
        <div style={{ ...S.ringScore, color: score == null ? '#64748b' : '#fff' }}>
          {score == null ? '–' : score}
        </div>
        <div style={S.ringLabel}>KPI</div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color = tone === 'up' ? '#10B981' : tone === 'down' ? '#F59E0B' : '#fff';
  return (
    <div style={S.stat}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ ...S.statValue, color }}>{value}</div>
    </div>
  );
}

function MiniMetric({ icon, label, value, sub }) {
  return (
    <div style={S.miniCard}>
      <div style={S.miniIcon}>{icon}</div>
      <div style={S.miniLabel}>{label}</div>
      <div style={S.miniValue}>{value}</div>
      <div style={S.miniSub}>{sub}</div>
    </div>
  );
}

function fIDR(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 9999,
  },
  sheet: {
    background: 'linear-gradient(180deg, #1f2937 0%, #111827 100%)',
    color: '#fff', borderRadius: 24, width: '100%', maxWidth: 560,
    maxHeight: '92vh', overflowY: 'auto', padding: 24,
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
    fontFamily: '"Geist", system-ui, -apple-system, sans-serif',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  eyebrow: { fontSize: 11, letterSpacing: 1.5, color: '#94a3b8', fontWeight: 600, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: 700 },
  closeBtn: { background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 10, fontSize: 16, cursor: 'pointer' },
  loading: { textAlign: 'center', color: '#94a3b8', padding: 40 },
  error: { background: 'rgba(248,113,113,0.1)', border: '1px solid #F8717144', color: '#fca5a5', padding: 12, borderRadius: 12, marginTop: 12 },
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12, fontWeight: 600 },
  scoreRow: { display: 'flex', alignItems: 'center', gap: 24, padding: '16px 0' },
  scoreSide: { flex: 1, display: 'flex', flexDirection: 'column', gap: 14 },
  stat: {},
  statLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 2 },
  statValue: { fontSize: 18, fontWeight: 700, letterSpacing: -0.3 },
  ring: { position: 'relative', width: 140, height: 140 },
  ringInner: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  ringScore: { fontSize: 36, fontWeight: 800, letterSpacing: -1 },
  ringLabel: { fontSize: 10, color: '#94a3b8', letterSpacing: 1.5, marginTop: 2 },
  miniGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 },
  miniCard: { background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.04)' },
  miniIcon: { fontSize: 18, marginBottom: 4 },
  miniLabel: { fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 },
  miniValue: { fontSize: 20, fontWeight: 700, marginTop: 2 },
  miniSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  deltaGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  deltaCard: { background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.04)' },
  deltaLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  deltaValue: { fontSize: 15, fontWeight: 700 },
  deltaValueMuted: { fontSize: 13, color: '#64748b' },
  deltaPct: { fontSize: 12, fontWeight: 500, opacity: 0.7, marginLeft: 4 },
  notes: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 },
  note: { padding: '10px 12px', borderLeft: '3px solid', borderRadius: 6, background: 'rgba(255,255,255,0.03)', fontSize: 13, lineHeight: 1.5, color: '#cbd5e1' },
  // Cerita Berharga — typographic quote cards
  heroQuoteWrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  quoteCard: {
    margin: 0, padding: '20px 22px 18px',
    background: 'linear-gradient(180deg, rgba(245,158,11,0.10) 0%, rgba(245,158,11,0.02) 100%)',
    border: '1px solid rgba(245,158,11,0.20)',
    borderRadius: 14, position: 'relative',
  },
  quoteMark: {
    position: 'absolute', top: 6, left: 14, fontSize: 56, lineHeight: 1, color: 'rgba(245,158,11,0.35)',
    fontFamily: 'Georgia, serif', pointerEvents: 'none',
  },
  quoteText: {
    margin: 0, fontSize: 16, lineHeight: 1.55, fontStyle: 'italic', color: '#fde68a',
    fontFamily: 'Georgia, "Times New Roman", serif',
    paddingLeft: 24, marginBottom: 10,
  },
  quoteCaption: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 24, gap: 8 },
  quoteRating: { color: '#F59E0B', fontSize: 13, letterSpacing: 1 },
  quoteMeta: { fontSize: 11, color: '#94a3b8' },
};
