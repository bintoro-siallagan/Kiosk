// src/Admin/OutletDashboard.jsx
//
// Outlet Dashboard — sales + KPI breakdown per outlet untuk owner/manager.
// Filosofi karyaOS: owner perlu tahu outlet mana yg sungguh-sungguh, dan
// kalau ada yg drop, drill-down dgn empati. Bukan ranking utk hukuman —
// ranking utk recognition + coaching.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import API_HOST from '../apiBase.js';
import { fmtMoney as fIDR } from '../lib/currency.js';

const PERIODS = [
  { k: 'today',  label: 'Hari ini',   days: 1 },
  { k: '7d',     label: '7 hari',     days: 7 },
  { k: '30d',    label: '30 hari',    days: 30 },
  { k: 'mtd',    label: 'Bulan ini',  days: 0 }, // calculated below
];

export default function OutletDashboard() {
  const [period, setPeriod] = useState('today');
  const [selectedOutlet, setSelectedOutlet] = useState(null); // null = all
  const [selectedVertical, setSelectedVertical] = useState('all'); // all | cinema | fnb | hybrid
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const range = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    if (period === 'today') return { from: Math.floor(new Date().setHours(0,0,0,0)/1000), to: now };
    if (period === 'mtd') {
      const m = new Date(); m.setDate(1); m.setHours(0,0,0,0);
      return { from: Math.floor(m.getTime()/1000), to: now };
    }
    const p = PERIODS.find(x => x.k === period);
    return { from: now - (p?.days || 7) * 86400, to: now };
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const token = localStorage.getItem('adminToken');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch(`${API_HOST}/api/admin/outlet-overview?from=${range.from}&to=${range.to}`, { headers });
      if (!r.ok) throw new Error(`Gagal muat data (${r.status})`);
      const d = await r.json();
      setData(d);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // Filter outlets — apply vertical filter, then single outlet filter
  const visibleOutlets = useMemo(() => {
    if (!data?.outlets) return [];
    let list = data.outlets;
    if (selectedVertical !== 'all') {
      list = list.filter(o => o.vertical === selectedVertical
        || (selectedVertical === 'cinema' && o.vertical === 'hybrid')
        || (selectedVertical === 'fnb' && o.vertical === 'hybrid'));
    }
    if (selectedOutlet) list = list.filter(o => o.code === selectedOutlet);
    return list;
  }, [data, selectedOutlet, selectedVertical]);

  // Aggregated totals untuk subset yg visible (kalau ada filter)
  const subsetTotals = useMemo(() => {
    if (!visibleOutlets.length) return null;
    const rev = visibleOutlets.reduce((s, o) => s + o.revenue, 0);
    const ord = visibleOutlets.reduce((s, o) => s + o.orders, 0);
    const kpiList = visibleOutlets.filter(o => o.kpi_score > 0);
    const avgKpi = kpiList.length ? Math.round(kpiList.reduce((s,o) => s + o.kpi_score, 0) / kpiList.length) : null;
    return { revenue: rev, orders: ord, avg_kpi: avgKpi, count: visibleOutlets.length };
  }, [visibleOutlets]);

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div>
          <div style={S.eyebrow}>📊 PER-OUTLET</div>
          <h2 style={S.title}>Sales & KPI per Outlet</h2>
          <p style={S.sub}>Lihat outlet mana yang berbuat sungguh-sungguh.</p>
        </div>

        {/* Period filter */}
        <div style={S.periodRow}>
          {PERIODS.map(p => (
            <button key={p.k} onClick={() => setPeriod(p.k)} style={S.periodBtn(period === p.k)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary totals — pakai subsetTotals kalau ada filter, totals kalau gak */}
      {data && !loading && (
        <div style={S.totalsGrid}>
          <SummaryCard
            label={selectedVertical !== 'all' || selectedOutlet ? "Outlet (filter)" : "Total Outlet"}
            value={(subsetTotals?.count ?? data.totals.outlet_count)} accent="#3B82F6" />
          <SummaryCard
            label="Omset"
            value={fIDR(subsetTotals?.revenue ?? data.totals.revenue)} accent="#10B981" />
          <SummaryCard
            label="Transaksi"
            value={(subsetTotals?.orders ?? data.totals.orders).toLocaleString('id-ID')} accent="#FBBF24" />
          <SummaryCard
            label="Rata KPI"
            value={(subsetTotals?.avg_kpi ?? data.totals.avg_kpi) != null ? `${subsetTotals?.avg_kpi ?? data.totals.avg_kpi}` : '—'} accent="#A78BFA" />
        </div>
      )}

      {/* Vertical filter — All / Cinema / F&B / Hybrid */}
      {data?.outlets?.length > 0 && (
        <div style={S.filterRow}>
          <span style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, fontWeight: 700, marginRight: 4, alignSelf: 'center', fontFamily: "'Geist Mono',monospace" }}>VERTIKAL:</span>
          {[
            { k: 'all',    label: '🌐 Semua' },
            { k: 'cinema', label: '🎬 Cinema' },
            { k: 'fnb',    label: '🍽️ F&B' },
            { k: 'hybrid', label: '🍽️🎬 Hybrid' },
          ].map(v => (
            <button key={v.k} onClick={() => { setSelectedVertical(v.k); setSelectedOutlet(null); }}
              style={S.chip(selectedVertical === v.k)}>{v.label}</button>
          ))}
        </div>
      )}

      {/* Single outlet filter chips */}
      {data?.outlets?.length > 0 && (
        <div style={S.filterRow}>
          <span style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, fontWeight: 700, marginRight: 4, alignSelf: 'center', fontFamily: "'Geist Mono',monospace" }}>OUTLET:</span>
          <button onClick={() => setSelectedOutlet(null)} style={S.chip(!selectedOutlet)}>
            🌐 Semua
          </button>
          {data.outlets
            .filter(o => selectedVertical === 'all' || o.vertical === selectedVertical
              || (selectedVertical === 'cinema' && o.vertical === 'hybrid')
              || (selectedVertical === 'fnb' && o.vertical === 'hybrid'))
            .map(o => (
              <button key={o.code} onClick={() => setSelectedOutlet(o.code)}
                style={S.chip(selectedOutlet === o.code)} title={o.area}>
                📍 {o.area || o.name?.replace('Karya Cinema ', '')}
                <span style={S.chipCode}>{o.code}</span>
              </button>
            ))}
        </div>
      )}

      {loading && <div style={S.loading}>Sebentar ya, kami siapkan ringkasannya…</div>}
      {err && <div style={S.error}>🤔 {err}</div>}

      {!loading && !err && visibleOutlets.length === 0 && (
        <div style={S.empty}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🌱</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Belum ada cerita di sini</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Begitu transaksi mulai, semua akan tercatat.</div>
        </div>
      )}

      {!loading && visibleOutlets.length > 0 && (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr style={S.thead}>
                <th style={S.th}>#</th>
                <th style={S.th}>Outlet</th>
                <th style={S.thR}>Omset</th>
                <th style={S.thR}>Transaksi</th>
                <th style={S.thR}>Avg Ticket</th>
                <th style={S.thC}>Rating</th>
                <th style={S.thC}>Growth</th>
                <th style={S.thC}>KPI</th>
              </tr>
            </thead>
            <tbody>
              {visibleOutlets.map((o, i) => (
                <OutletRow key={o.code} outlet={o} rank={i + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }) {
  return (
    <div style={{
      background: '#0d1117', border: '1px solid #161b22', borderRadius: 12,
      padding: '14px 18px', borderLeft: `4px solid ${accent}`,
    }}>
      <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: "'Geist Mono', monospace", letterSpacing: -0.5 }}>{value}</div>
    </div>
  );
}

function OutletRow({ outlet, rank }) {
  const o = outlet;
  const isTop = rank <= 3;
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
  const kpiColor = o.kpi_score >= 80 ? '#10B981' : o.kpi_score >= 60 ? '#FBBF24' : '#94a3b8';
  const growthColor = o.growth_pct > 0 ? '#10B981' : o.growth_pct < 0 ? '#F59E0B' : '#94a3b8';
  const growthArrow = o.growth_pct > 0 ? '📈' : o.growth_pct < 0 ? '📉' : '➡️';

  return (
    <tr style={{
      borderBottom: '1px solid #161b22',
      background: isTop ? `linear-gradient(90deg, rgba(255,215,0,0.04), transparent 20%)` : 'transparent',
    }}>
      <td style={{ ...S.td, fontWeight: 700, color: isTop ? '#F59E0B' : '#64748b' }}>{medal}</td>
      <td style={S.td}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
          {o.area || o.name?.replace('Karya Cinema ', '')}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', fontFamily: "'Geist Mono', monospace" }}>
          {o.code} · {o.vertical === 'cinema' ? '🎬' : o.vertical === 'hybrid' ? '🍽️🎬' : '🍽️'} {o.vertical || 'fnb'}
        </div>
        {o.top_kasir && (
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
            ⭐ Top: <b style={{ color: '#cbd5e1' }}>{o.top_kasir.name}</b>
          </div>
        )}
      </td>
      <td style={{ ...S.tdR, fontWeight: 700, color: '#10B981', fontFamily: "'Geist Mono', monospace" }}>
        {fIDR(o.revenue)}
        {(o.revenue_fb > 0 && o.revenue_cinema > 0) && (
          <div style={{ fontSize: 9, color: '#64748b', fontWeight: 500, marginTop: 2 }}>
            F&B {fIDR(o.revenue_fb)} · 🎬 {fIDR(o.revenue_cinema)}
          </div>
        )}
      </td>
      <td style={{ ...S.tdR, color: '#cbd5e1', fontFamily: "'Geist Mono', monospace" }}>
        {o.orders.toLocaleString('id-ID')}
      </td>
      <td style={{ ...S.tdR, color: '#94a3b8', fontFamily: "'Geist Mono', monospace" }}>
        {o.avg_ticket > 0 ? fIDR(o.avg_ticket) : '—'}
      </td>
      <td style={S.tdC}>
        {o.rating != null ? (
          <div>
            <div style={{ color: '#F59E0B', fontSize: 13, fontWeight: 700 }}>{o.rating} ★</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>{o.review_count} review</div>
          </div>
        ) : <span style={{ color: '#475569', fontSize: 12 }}>—</span>}
      </td>
      <td style={{ ...S.tdC, color: growthColor, fontWeight: 700, fontSize: 13 }}>
        {growthArrow} {o.growth_pct > 0 ? '+' : ''}{o.growth_pct}%
      </td>
      <td style={S.tdC}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 42, height: 42, borderRadius: '50%',
          border: `2px solid ${kpiColor}`,
          fontSize: 14, fontWeight: 800, color: kpiColor,
          fontFamily: "'Geist Mono', monospace",
        }}>{o.kpi_score}</div>
      </td>
    </tr>
  );
}

const S = {
  wrap: { padding: '20px 0' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 16, flexWrap: 'wrap' },
  eyebrow: { fontSize: 10, color: '#a855f7', letterSpacing: 2, fontFamily: "'Geist Mono', monospace", fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 4px', letterSpacing: -0.5 },
  sub: { fontSize: 13, color: '#94a3b8', margin: 0, fontStyle: 'italic' },
  periodRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  periodBtn: (active) => ({
    background: active ? '#a855f722' : 'transparent',
    border: `1px solid ${active ? '#a855f766' : '#21262d'}`,
    borderRadius: 8, padding: '7px 14px',
    color: active ? '#c084fc' : '#888',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.2,
  }),
  totalsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 },
  filterRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  chip: (active) => ({
    background: active ? '#10B98122' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? '#10B98166' : '#21262d'}`,
    borderRadius: 999, padding: '6px 14px',
    color: active ? '#34d399' : '#94a3b8',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  }),
  chipCode: { fontSize: 10, color: '#475569', fontFamily: "'Geist Mono', monospace" },
  loading: { padding: 60, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' },
  error: { padding: '14px 18px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.30)', borderRadius: 10, color: '#fbbf24', fontSize: 13 },
  empty: { padding: 60, textAlign: 'center', color: '#cbd5e1' },
  tableWrap: { background: '#0d1117', border: '1px solid #161b22', borderRadius: 12, overflow: 'hidden', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'inherit', minWidth: 720 },
  thead: { background: '#161b22' },
  th: { padding: '12px 14px', textAlign: 'left', color: '#64748b', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, fontFamily: "'Geist Mono', monospace", borderBottom: '1px solid #21262d' },
  thR: { padding: '12px 14px', textAlign: 'right', color: '#64748b', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, fontFamily: "'Geist Mono', monospace", borderBottom: '1px solid #21262d' },
  thC: { padding: '12px 14px', textAlign: 'center', color: '#64748b', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, fontFamily: "'Geist Mono', monospace", borderBottom: '1px solid #21262d' },
  td: { padding: '14px', verticalAlign: 'top' },
  tdR: { padding: '14px', textAlign: 'right', verticalAlign: 'top' },
  tdC: { padding: '14px', textAlign: 'center', verticalAlign: 'middle' },
};
