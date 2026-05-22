// client/src/Admin/OwnerDashboard.jsx
// Enterprise dashboard untuk owner — Bloomberg terminal aesthetic.
//
// Layout (top → bottom):
//   1. Header dengan period selector + last refresh + auto-refresh toggle
//   2. Anomaly banner (kalau ada critical issue)
//   3. Hero KPI row (5 cards) dengan period delta + sparkline mini
//   4. Channel mix + Payment method breakdown (side-by-side)
//   5. Revenue trend last 30 days (line chart) + Top items (bar chart)
//   6. Operational pulse — KDS status + Inventory low stock + Active shift
//   7. Financial deep — P&L summary + Cash flow snapshot
//   8. Customer pulse — Loyalty tier distribution + new signups + churn risk
//
// Drill-down ke modul-spesifik via onNavigate prop.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));
const fmtIDRcompact = (n) => {
  const v = Math.abs(n||0);
  if (v >= 1e9) return `Rp ${(n/1e9).toFixed(1)}M`;
  if (v >= 1e6) return `Rp ${(n/1e6).toFixed(1)}jt`;
  if (v >= 1e3) return `Rp ${(n/1e3).toFixed(0)}rb`;
  return `Rp ${Math.round(n||0)}`;
};
const fmtPct = (n) => `${(n||0).toFixed(1)}%`;
const fmtDelta = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;

const PERIODS = [
  { key: 'today', label: 'Hari Ini', days: 0 },
  { key: 'yesterday', label: 'Kemarin', days: -1, single: true },
  { key: 'week', label: '7 Hari', days: 7 },
  { key: 'month', label: '30 Hari', days: 30 },
  { key: 'mtd', label: 'MTD', mtd: true },
  { key: 'ytd', label: 'YTD', ytd: true },
];

function getDateRange(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = Math.floor(today.getTime()/1000) + 86399;
  if (period.key === 'today') return { from: Math.floor(today.getTime()/1000), to: end, label: 'Hari Ini' };
  if (period.key === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate()-1);
    return { from: Math.floor(y.getTime()/1000), to: Math.floor(y.getTime()/1000)+86399, label: 'Kemarin' };
  }
  if (period.mtd) {
    const m = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: Math.floor(m.getTime()/1000), to: end, label: 'Bulan Berjalan' };
  }
  if (period.ytd) {
    const y = new Date(now.getFullYear(), 0, 1);
    return { from: Math.floor(y.getTime()/1000), to: end, label: 'Tahun Berjalan' };
  }
  const from = new Date(today); from.setDate(from.getDate() - period.days);
  return { from: Math.floor(from.getTime()/1000), to: end, label: `${period.days} Hari` };
}

export default function OwnerDashboard({ apiBase = '', onNavigate }) {
  const [period, setPeriod] = useState(PERIODS[0]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [data, setData] = useState({
    finance: null, refundCancel: null, kds: null, aggregator: null,
    loyalty: null, employees: null, financeTender: null, financeTopItems: null
  });
  const [loading, setLoading] = useState(true);
  const fetchControllerRef = useRef(null);

  const range = useMemo(() => getDateRange(period), [period]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    if (fetchControllerRef.current) fetchControllerRef.current.abort();
    const ctrl = new AbortController();
    fetchControllerRef.current = ctrl;

    const safeJson = async (url) => {
      try {
        const r = await fetch(`${apiBase}${url}`, { signal: ctrl.signal });
        return r.ok ? r.json() : null;
      } catch { return null; }
    };

    try {
      const [
        financeDash, financeTrend, financeChannels,
        rc, kdsStats, aggregatorRecon,
        loyalty, hrEmployees, financeTender, financeTopItems
      ] = await Promise.all([
        safeJson(`/api/finance/dashboard?from=${range.from}&to=${range.to}`),
        safeJson(`/api/finance/revenue-trend?days=30`),
        safeJson(`/api/finance/by-channel?from=${range.from}&to=${range.to}`),
        safeJson(`/api/refund-cancel/summary?from=${range.from}`),
        safeJson(`/api/kds/tickets/stats`),
        safeJson(`/api/aggregator/reconcile?from=${range.from}&to=${range.to}`),
        // Try /stats first (existing backend), fallback to /summary
        safeJson(`/api/loyalty/stats`).then(r => r || safeJson(`/api/loyalty/summary`)),
        safeJson(`/api/hr/employees`),
        safeJson(`/api/finance/by-tender?from=${range.from}&to=${range.to}`),
        safeJson(`/api/finance/top-items?from=${range.from}&to=${range.to}&limit=8`)
      ]);

      // /api/loyalty/stats uses {tier_distribution:[{tier,count}], outstanding_points};
      // dashboard panels expect {by_tier:[{tier_id,c}], current_outstanding}. Normalize.
      const loyaltyNorm = loyalty ? {
        ...loyalty,
        by_tier: loyalty.by_tier || (loyalty.tier_distribution || []).map(t => ({ tier_id: t.tier ?? t.tier_id, c: t.count ?? t.c ?? 0 })),
        current_outstanding: loyalty.current_outstanding ?? loyalty.outstanding_points ?? 0,
      } : loyalty;

      setData({ finance: financeDash, financeTrend, financeChannels, refundCancel: rc, kds: kdsStats, aggregator: aggregatorRecon, loyalty: loyaltyNorm, employees: hrEmployees, financeTender, financeTopItems });
      setLastRefresh(Date.now());
    } catch (e) { console.warn('[dashboard] fetch error:', e.message); }
    setLoading(false);
  }, [apiBase, range.from, range.to]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchAll, 60 * 1000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchAll]);

  // ============================================================
  // DERIVED METRICS
  // ============================================================
  // Wave-2 /api/finance/dashboard returns period buckets {today, yesterday, this_month}
  // and ignores from/to. Map the selected period to its closest bucket; if a future
  // backend returns a flat shape, `data.finance` itself is used as the bucket.
  const financeBucket = useMemo(() => {
    const f = data.finance;
    if (!f) return null;
    if (period.key === 'yesterday' && f.yesterday) return f.yesterday;
    if ((period.mtd || period.key === 'month') && f.this_month) return f.this_month;
    return f.today || f;
  }, [data.finance, period]);

  const heroKpis = useMemo(() => {
    const f = data.finance, bucket = financeBucket;
    if (!f || !bucket) return null;
    const rev = num(bucket.revenue?.net ?? bucket.revenue?.gross ?? f.revenue);
    const orders = num(bucket.revenue?.order_count ?? f.order_count);
    const avgTicket = num(bucket.revenue?.avg_order_value) || (orders > 0 ? rev / orders : 0);
    const cogs = num(bucket.cogs?.total ?? f.cogs);
    const grossMargin = num(bucket.margins?.gross_margin_pct) || (rev > 0 ? ((rev - cogs) / rev) * 100 : 0);
    const cashPosition = num(f.cash_position?.total) || num(f.cash_drawer) + num(f.bank_balance);
    const apOutstanding = num(f.ap_outstanding);
    const anomalyCount = data.refundCancel?.anomaly_count || 0;

    return {
      rev: { value: rev, delta: f.revenue?.delta_pct || 0, label: 'Net Revenue', subtext: `${orders} order` },
      avgTicket: { value: avgTicket, delta: f.avg_ticket_delta || 0, label: 'Avg Ticket', subtext: `dari ${orders} order` },
      grossMargin: { value: grossMargin, delta: f.gross_margin_delta || 0, label: 'Gross Margin', subtext: `COGS ${fmtIDRcompact(cogs)}`, isPercent: true },
      cash: { value: cashPosition, label: 'Cash Position', subtext: `AP outstanding ${fmtIDRcompact(apOutstanding)}` },
      anomaly: { value: anomalyCount, label: 'Anomali', subtext: anomalyCount > 0 ? 'butuh review' : 'all clear', isCount: true, isAlert: anomalyCount > 0 }
    };
  }, [data, financeBucket]);

  // P&L derived from the finance bucket — /api/finance/dashboard already carries
  // revenue / cogs / expenses.by_category / tax for the selected period.
  const plSummary = useMemo(() => {
    const b = financeBucket;
    if (!b || !b.revenue) return null;
    const revTotal = num(b.revenue.net ?? b.revenue.gross);
    const expItems = (b.expenses?.by_category || []).map(e => ({ name: e.name, amount: num(e.amount) }));
    const cogs = num(b.cogs?.total);
    if (cogs > 0) expItems.unshift({ name: 'COGS / HPP', amount: cogs });
    const tax = num(b.tax?.total);
    if (tax > 0) expItems.push({ name: 'Pajak', amount: tax });
    const expTotal = expItems.reduce((s, e) => s + e.amount, 0);
    return {
      revenue: { total: revTotal, items: [{ name: 'Penjualan (Net)', amount: revTotal }] },
      expenses: { total: expTotal, items: expItems },
      net_income: revTotal - expTotal
    };
  }, [financeBucket]);

  const channelMix = useMemo(() => {
    if (!data.financeChannels && !data.aggregator) return [];
    const rows = data.financeChannels?.channels || [];
    if (rows.length > 0) return rows;
    // Fallback dari aggregator data
    const agg = data.aggregator?.by_provider || [];
    const direct = data.finance?.revenue?.gross || 0;
    const aggTotal = agg.reduce((s, a) => s + a.gross_revenue, 0);
    return [
      { channel: 'direct', label: 'Direct (POS)', amount: direct - aggTotal, count: data.finance?.order_count || 0 },
      ...agg.map(a => ({ channel: a.provider_code, label: a.provider_code.toUpperCase(), amount: a.gross_revenue, count: a.total_orders }))
    ].filter(c => c.amount > 0);
  }, [data]);

  const topItems = useMemo(() => data.financeTopItems?.items?.slice(0, 8) || [], [data.financeTopItems]);

  return (
    <div style={styles.root}>
      <style>{cssExtra}</style>

      {/* HEADER */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Owner Dashboard</h1>
          <div style={styles.subtitle}>
            {range.label} · last refresh {new Date(lastRefresh).toLocaleTimeString('id-ID')} ·
            <label style={{marginLeft: 8, cursor: 'pointer'}}>
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{marginRight: 4}} />
              auto-refresh 60s
            </label>
          </div>
        </div>

        <div style={styles.periodSelector}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p)} style={periodBtn(period.key === p.key)}>{p.label}</button>
          ))}
          <button onClick={fetchAll} style={{...styles.btn, marginLeft: 8}} title="Refresh sekarang">↻</button>
          <button onClick={() => window.print()} style={styles.btn} title="Print">🖨</button>
        </div>
      </div>

      {/* ANOMALY BANNER */}
      {heroKpis?.anomaly?.value > 0 && (
        <div style={styles.anomalyBanner} onClick={() => onNavigate?.('refund_cancel')}>
          <span style={{fontSize: 18}}>⚠️</span>
          <div style={{flex: 1}}>
            <b>{heroKpis.anomaly.value} anomali terdeteksi</b> · refund/cancel/manager-PIN bypass yang butuh review
          </div>
          <span style={{color: '#fbbf24', fontSize: 12}}>Klik untuk review →</span>
        </div>
      )}

      {loading && !heroKpis && (
        <div style={{padding: 60, textAlign: 'center', color: '#9ca3af'}}>Loading dashboard...</div>
      )}

      {/* HERO KPI ROW */}
      {heroKpis && (
        <div className="hero-row" style={styles.heroRow}>
          <KpiHero {...heroKpis.rev}
            value={fmtIDRcompact(heroKpis.rev.value)}
            sparkData={data.financeTrend?.points?.slice(-7).map(p => p.revenue) || []}
            color="#f97316"
            onClick={() => onNavigate?.('finance')} />
          <KpiHero {...heroKpis.avgTicket}
            value={fmtIDRcompact(heroKpis.avgTicket.value)}
            sparkData={data.financeTrend?.points?.slice(-7).map(p => (p.revenue/(p.orders||1))) || []}
            color="#3b82f6" />
          <KpiHero {...heroKpis.grossMargin}
            value={fmtPct(heroKpis.grossMargin.value)}
            isPercent
            color="#4ade80"
            onClick={() => onNavigate?.('finance')} />
          <KpiHero {...heroKpis.cash}
            value={fmtIDRcompact(heroKpis.cash.value)}
            color="#a78bfa"
            onClick={() => onNavigate?.('gl')} />
          <KpiHero {...heroKpis.anomaly}
            value={heroKpis.anomaly.value}
            color={heroKpis.anomaly.isAlert ? '#ef4444' : '#4ade80'}
            onClick={() => onNavigate?.('refund_cancel')} />
        </div>
      )}

      {/* GRID 2-COL: REVENUE TREND + CHANNEL MIX */}
      <div className="grid-2" style={styles.gridTwoCol}>
        <Panel title="Revenue Trend — 30 Hari Terakhir" onClick={() => onNavigate?.('finance')}>
          <RevenueTrend data={data.financeTrend?.points || []} />
        </Panel>

        <Panel title="Channel Mix" onClick={() => onNavigate?.('aggregator')}>
          <ChannelMixDonut data={channelMix} />
        </Panel>
      </div>

      {/* GRID 2-COL: TOP ITEMS + PAYMENT METHODS */}
      <div className="grid-2" style={styles.gridTwoCol}>
        <Panel title="Top Items by Revenue">
          <TopItemsBar items={topItems} />
        </Panel>

        <Panel title="Payment Method Mix" onClick={() => onNavigate?.('payment_gateway')}>
          <PaymentMethodMix data={data.financeTender?.tenders || []} />
        </Panel>
      </div>

      {/* OPERATIONAL PULSE */}
      <div style={styles.sectionLabel}>OPERATIONAL PULSE</div>
      <div className="grid-4" style={styles.gridFourCol}>
        <MiniPanel
          title="KDS — Antrian"
          value={data.kds?.active_now?.queued || 0}
          sub={`${data.kds?.active_now?.preparing || 0} preparing · ${data.kds?.active_now?.ready || 0} ready`}
          icon="🍳"
          color="#f97316"
          onClick={() => window.open('/bites-kiosk/?kds=1', '_blank')} />
        <MiniPanel
          title="Avg Prep Time"
          value={data.kds?.completed_today?.avg_prep ? `${Math.round(data.kds.completed_today.avg_prep)}d` : '-'}
          sub={`${data.kds?.completed_today?.total || 0} order completed`}
          icon="⏱️"
          color="#3b82f6" />
        <MiniPanel
          title="Karyawan Aktif"
          value={data.employees?.length || 0}
          sub="full-time + part-time"
          icon="👥"
          color="#a78bfa"
          onClick={() => onNavigate?.('hr')} />
        <MiniPanel
          title="Loyalty Members"
          value={(data.loyalty?.total_customers || 0).toLocaleString('id-ID')}
          sub={`${data.loyalty?.new_this_month?.c || 0} bergabung bulan ini`}
          icon="🏅"
          color="#fbbf24"
          onClick={() => onNavigate?.('loyalty')} />
      </div>

      {/* FINANCIAL DEEP */}
      <div style={styles.sectionLabel}>FINANCIAL — INCOME STATEMENT ({range.label})</div>
      <Panel title="P&L Summary" onClick={() => onNavigate?.('gl')}>
        <PLSummary data={plSummary} />
      </Panel>

      {/* AGGREGATOR DEEP */}
      {data.aggregator?.total?.total_orders > 0 && (
        <>
          <div style={styles.sectionLabel}>AGGREGATOR PERFORMANCE</div>
          <Panel title="Gross vs Komisi vs Net per Provider" onClick={() => onNavigate?.('aggregator')}>
            <AggregatorBreakdown data={data.aggregator} />
          </Panel>
        </>
      )}

      {/* LOYALTY DEEP */}
      {data.loyalty && (
        <>
          <div style={styles.sectionLabel}>CUSTOMER & LOYALTY</div>
          <div className="grid-2" style={styles.gridTwoCol}>
            <Panel title="Tier Distribution" onClick={() => onNavigate?.('loyalty')}>
              <TierDistribution data={data.loyalty.by_tier || []} />
            </Panel>
            <Panel title="Points Movement (30 hari)" onClick={() => onNavigate?.('loyalty')}>
              <div style={{padding: 16}}>
                <div style={styles.rowFlex}>
                  <span style={{color: '#9ca3af'}}>Earned</span>
                  <b style={{color: '#4ade80'}}>+{(data.loyalty.points_30days?.earned || 0).toLocaleString('id-ID')} pts</b>
                </div>
                <div style={styles.rowFlex}>
                  <span style={{color: '#9ca3af'}}>Redeemed</span>
                  <b style={{color: '#fb923c'}}>−{(data.loyalty.points_30days?.redeemed || 0).toLocaleString('id-ID')} pts</b>
                </div>
                <div style={{...styles.rowFlex, borderTop: '1px solid #2a2a2a', paddingTop: 8, marginTop: 8}}>
                  <span style={{color: '#fff', fontWeight: 600}}>Outstanding (Liability)</span>
                  <b style={{color: '#f97316'}}>{(data.loyalty.current_outstanding || 0).toLocaleString('id-ID')} pts</b>
                </div>
                <div style={{fontSize: 11, color: '#6b7280', marginTop: 8}}>
                  Setara dengan ~{fmtIDR((data.loyalty.current_outstanding || 0) * 100)} kalau di-redeem semua
                </div>
              </div>
            </Panel>
          </div>
        </>
      )}

      {/* FOOTER */}
      <div style={styles.footer}>
        KaryaOS · Owner Dashboard · Generated {new Date().toLocaleString('id-ID')}
      </div>
    </div>
  );
}

// ============================================================
// HERO KPI CARD
// ============================================================
function KpiHero({ label, value, delta, subtext, sparkData = [], color, isPercent, isCount, isAlert, onClick }) {
  return (
    <div onClick={onClick} style={{
      ...styles.heroCard,
      borderTop: `3px solid ${color}`,
      cursor: onClick ? 'pointer' : 'default',
      background: isAlert ? '#2a0a0a' : '#0f0f0f'
    }}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{...styles.kpiValue, color}}>
        {value}
      </div>
      {typeof delta === 'number' && delta !== 0 && (
        <div style={{...styles.kpiDelta, color: delta > 0 ? '#4ade80' : '#ef4444', background: delta > 0 ? '#0a3a26' : '#3a0a0a'}}>
          {delta > 0 ? '↑' : '↓'} {fmtDelta(delta)}
        </div>
      )}
      <div style={styles.kpiSub}>{subtext}</div>
      {sparkData.length > 1 && <Sparkline data={sparkData} color={color} />}
    </div>
  );
}

// ============================================================
// SPARKLINE (pure SVG)
// ============================================================
function Sparkline({ data, color = '#f97316', width = 120, height = 28 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length-1)) * width},${height - ((v - min) / range) * height}`).join(' ');

  return (
    <svg width={width} height={height} style={{marginTop: 8}}>
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,${height} ${points} ${width},${height}`} fill={`url(#spark-${color})`} stroke="none" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={width} cy={height - ((data[data.length-1] - min) / range) * height} r="2" fill={color} />
    </svg>
  );
}

// ============================================================
// PANEL WRAPPER
// ============================================================
function Panel({ title, onClick, children }) {
  return (
    <div style={{...styles.panel, cursor: onClick ? 'pointer' : 'default'}} onClick={onClick}>
      <div style={styles.panelTitle}>
        {title}
        {onClick && <span style={{fontSize: 10, color: '#6b7280'}}>klik untuk drill-down →</span>}
      </div>
      {children}
    </div>
  );
}

function MiniPanel({ title, value, sub, icon, color, onClick }) {
  return (
    <div onClick={onClick} style={{...styles.miniPanel, cursor: onClick ? 'pointer' : 'default'}}>
      <div style={{fontSize: 20}}>{icon}</div>
      <div style={{fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 6}}>{title}</div>
      <div style={{fontSize: 24, fontWeight: 700, color, marginTop: 4}}>{value}</div>
      <div style={{fontSize: 10, color: '#6b7280', marginTop: 2}}>{sub}</div>
    </div>
  );
}

// ============================================================
// REVENUE TREND CHART
// ============================================================
function RevenueTrend({ data }) {
  if (!data || data.length < 2) return <div style={styles.empty}>Belum ada cukup data</div>;
  const width = 600, height = 200, padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const max = Math.max(...data.map(d => d.revenue || 0), 1);
  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length-1)) * innerW,
    y: padding.top + innerH - ((d.revenue || 0) / max) * innerH,
    raw: d
  }));

  return (
    <div style={{padding: 8}}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{width: '100%', height: 'auto'}}>
        {/* Y axis grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
          <g key={i}>
            <line x1={padding.left} x2={width-padding.right} y1={padding.top + (1-r)*innerH} y2={padding.top + (1-r)*innerH} stroke="#2a2a2a" strokeWidth="0.5" />
            <text x={padding.left - 8} y={padding.top + (1-r)*innerH + 3} fontSize="9" fill="#6b7280" textAnchor="end">{fmtIDRcompact(max * r)}</text>
          </g>
        ))}
        {/* Area + Line */}
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points={`${points[0].x},${padding.top+innerH} ${points.map(p => `${p.x},${p.y}`).join(' ')} ${points[points.length-1].x},${padding.top+innerH}`} fill="url(#trendGrad)" />
        <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f97316" strokeWidth="2" />
        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#f97316" stroke="#0a0a0a" strokeWidth="1.5">
            <title>{p.raw.date}: {fmtIDR(p.raw.revenue || 0)}</title>
          </circle>
        ))}
        {/* X axis labels (every nth) */}
        {points.filter((_, i) => i % Math.ceil(data.length/6) === 0 || i === data.length-1).map((p, i) => (
          <text key={i} x={p.x} y={height - 8} fontSize="9" fill="#9ca3af" textAnchor="middle">{p.raw.date?.slice(5)}</text>
        ))}
      </svg>
    </div>
  );
}

// ============================================================
// CHANNEL MIX (donut with legend)
// ============================================================
function ChannelMixDonut({ data }) {
  if (!data || data.length === 0) return <div style={styles.empty}>Belum ada data channel</div>;
  const total = data.reduce((s, d) => s + (d.amount || 0), 0);
  if (total === 0) return <div style={styles.empty}>Belum ada revenue</div>;

  const colors = ['#f97316', '#16a34a', '#3b82f6', '#a855f7', '#fbbf24', '#ef4444'];
  let startAngle = -Math.PI / 2;
  const r = 70;
  const cx = 80, cy = 90;

  const arcs = data.map((d, i) => {
    const pct = d.amount / total;
    const angle = pct * Math.PI * 2;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + Math.cos(startAngle) * r;
    const y1 = cy + Math.sin(startAngle) * r;
    const x2 = cx + Math.cos(endAngle) * r;
    const y2 = cy + Math.sin(endAngle) * r;
    const x1i = cx + Math.cos(startAngle) * (r-25);
    const y1i = cy + Math.sin(startAngle) * (r-25);
    const x2i = cx + Math.cos(endAngle) * (r-25);
    const y2i = cy + Math.sin(endAngle) * (r-25);
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x2i} ${y2i} A ${r-25} ${r-25} 0 ${largeArc} 0 ${x1i} ${y1i} Z`;
    const result = { path, pct, color: colors[i % colors.length], label: d.label || d.channel, amount: d.amount, count: d.count };
    startAngle = endAngle;
    return result;
  });

  return (
    <div style={{padding: 8, display: 'flex', alignItems: 'center', gap: 16}}>
      <svg viewBox="0 0 160 180" style={{width: 160, height: 180}}>
        {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color} />)}
        <text x={cx} y={cy-2} fontSize="10" fill="#9ca3af" textAnchor="middle">Total</text>
        <text x={cx} y={cy+12} fontSize="13" fill="#fff" textAnchor="middle" fontWeight="700">{fmtIDRcompact(total)}</text>
      </svg>
      <div style={{flex: 1}}>
        {arcs.map((a, i) => (
          <div key={i} style={styles.legendRow}>
            <div style={{width: 10, height: 10, borderRadius: 2, background: a.color}} />
            <div style={{flex: 1}}>
              <div style={{color: '#fff', fontSize: 12}}>{a.label}</div>
              <div style={{color: '#9ca3af', fontSize: 10}}>{(a.pct * 100).toFixed(1)}% · {a.count || 0} order</div>
            </div>
            <div style={{color: '#fff', fontSize: 11, fontWeight: 600}}>{fmtIDRcompact(a.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TOP ITEMS BAR
// ============================================================
function TopItemsBar({ items }) {
  if (!items || items.length === 0) return <div style={styles.empty}>Belum ada data item</div>;
  const max = Math.max(...items.map(i => i.revenue || 0), 1);

  return (
    <div style={{padding: 12}}>
      {items.map((it, i) => (
        <div key={i} style={{marginBottom: 8}}>
          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3}}>
            <span style={{color: '#fff'}}>{it.name || it.menu_id || it.display_name}</span>
            <span style={{color: '#9ca3af'}}>{fmtIDRcompact(it.revenue)} · {it.qty || 0}x</span>
          </div>
          <div style={{height: 6, background: '#1f1f1f', borderRadius: 3, overflow: 'hidden'}}>
            <div style={{width: `${(it.revenue / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #f97316, #fbbf24)'}} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// PAYMENT METHOD MIX
// ============================================================
function PaymentMethodMix({ data }) {
  if (!data || data.length === 0) return <div style={styles.empty}>Belum ada data tender</div>;
  const total = data.reduce((s, d) => s + (d.amount || 0), 0);
  const sorted = [...data].sort((a, b) => b.amount - a.amount);

  return (
    <div style={{padding: 12}}>
      {sorted.map((t, i) => {
        const pct = total > 0 ? (t.amount / total) * 100 : 0;
        return (
          <div key={i} style={{marginBottom: 8}}>
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3}}>
              <span style={{color: '#fff', textTransform: 'capitalize'}}>{t.tender_type || t.method}</span>
              <span style={{color: '#9ca3af'}}>{fmtIDRcompact(t.amount)} · {pct.toFixed(1)}%</span>
            </div>
            <div style={{height: 6, background: '#1f1f1f', borderRadius: 3, overflow: 'hidden'}}>
              <div style={{width: `${pct}%`, height: '100%', background: '#3b82f6'}} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// P&L SUMMARY
// ============================================================
function PLSummary({ data }) {
  if (!data) return <div style={styles.empty}>Belum ada data P&L. Setup General Ledger dulu.</div>;
  const grossMargin = data.revenue.total > 0 ? ((data.revenue.total - data.expenses.total) / data.revenue.total) * 100 : 0;

  return (
    <div style={{padding: 16}}>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16}}>
        <div>
          <div style={styles.pnlLabel}>Total Revenue</div>
          <div style={{...styles.pnlValue, color: '#4ade80'}}>{fmtIDR(data.revenue.total)}</div>
          <div style={styles.pnlSub}>{data.revenue.items.length} akun pendapatan</div>
        </div>
        <div>
          <div style={styles.pnlLabel}>Total Expenses</div>
          <div style={{...styles.pnlValue, color: '#ef4444'}}>−{fmtIDR(data.expenses.total)}</div>
          <div style={styles.pnlSub}>{data.expenses.items.length} akun beban</div>
        </div>
        <div>
          <div style={styles.pnlLabel}>{data.net_income >= 0 ? 'Net Income' : 'Net Loss'}</div>
          <div style={{...styles.pnlValue, color: data.net_income >= 0 ? '#4ade80' : '#ef4444'}}>{fmtIDR(Math.abs(data.net_income))}</div>
          <div style={styles.pnlSub}>Margin {fmtPct(grossMargin)}</div>
        </div>
      </div>

      {/* Top 5 expense categories */}
      {data.expenses.items.length > 0 && (
        <div style={{marginTop: 20}}>
          <div style={{fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8}}>Top Expense Categories</div>
          {[...data.expenses.items].sort((a,b) => b.amount - a.amount).slice(0, 5).map((e, i) => (
            <div key={i} style={styles.rowFlex}>
              <span style={{color: '#9ca3af', fontSize: 12}}>{e.name}</span>
              <span style={{color: '#fff', fontSize: 12}}>{fmtIDRcompact(e.amount)} <span style={{color: '#6b7280'}}>({((e.amount/data.expenses.total)*100).toFixed(1)}%)</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// AGGREGATOR BREAKDOWN
// ============================================================
function AggregatorBreakdown({ data }) {
  const providers = data?.by_provider || [];
  if (providers.length === 0) return <div style={styles.empty}>Belum ada data aggregator</div>;

  return (
    <div style={{padding: 12}}>
      <table style={{width: '100%', fontSize: 12, borderCollapse: 'collapse'}}>
        <thead><tr>
          <th style={styles.thBlock}>Provider</th>
          <th style={{...styles.thBlock, textAlign: 'right'}}>Orders</th>
          <th style={{...styles.thBlock, textAlign: 'right'}}>Gross</th>
          <th style={{...styles.thBlock, textAlign: 'right'}}>Komisi (%)</th>
          <th style={{...styles.thBlock, textAlign: 'right'}}>Net</th>
        </tr></thead>
        <tbody>
          {providers.map(p => {
            const commPct = p.gross_revenue > 0 ? (p.total_commission / p.gross_revenue) * 100 : 0;
            return (
              <tr key={p.provider_code} style={{borderBottom: '1px solid #2a2a2a'}}>
                <td style={styles.tdBlock}>{p.provider_code}</td>
                <td style={{...styles.tdBlock, textAlign: 'right'}}>{p.total_orders}</td>
                <td style={{...styles.tdBlock, textAlign: 'right'}}>{fmtIDRcompact(p.gross_revenue)}</td>
                <td style={{...styles.tdBlock, textAlign: 'right', color: '#ef4444'}}>−{fmtIDRcompact(p.total_commission)} ({commPct.toFixed(0)}%)</td>
                <td style={{...styles.tdBlock, textAlign: 'right', color: '#4ade80', fontWeight: 600}}>{fmtIDRcompact(p.net_revenue)}</td>
              </tr>
            );
          })}
          <tr style={{borderTop: '2px solid #f97316', fontWeight: 700}}>
            <td style={styles.tdBlock}>TOTAL</td>
            <td style={{...styles.tdBlock, textAlign: 'right'}}>{data.total.total_orders}</td>
            <td style={{...styles.tdBlock, textAlign: 'right'}}>{fmtIDRcompact(data.total.gross_revenue)}</td>
            <td style={{...styles.tdBlock, textAlign: 'right', color: '#ef4444'}}>−{fmtIDRcompact(data.total.total_commission)}</td>
            <td style={{...styles.tdBlock, textAlign: 'right', color: '#4ade80'}}>{fmtIDRcompact(data.total.net_revenue)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// TIER DISTRIBUTION
// ============================================================
function TierDistribution({ data }) {
  if (!data || data.length === 0) return <div style={styles.empty}>Belum ada loyalty members</div>;
  const total = data.reduce((s, d) => s + d.c, 0);
  const tierColors = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', platinum: '#e5e4e2' };

  return (
    <div style={{padding: 12}}>
      {data.map(t => {
        const pct = total > 0 ? (t.c / total) * 100 : 0;
        return (
          <div key={t.tier_id} style={{marginBottom: 8}}>
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3}}>
              <span style={{color: tierColors[t.tier_id] || '#fff', textTransform: 'capitalize', fontWeight: 500}}>{t.tier_id}</span>
              <span style={{color: '#9ca3af'}}>{t.c} member · {pct.toFixed(0)}%</span>
            </div>
            <div style={{height: 8, background: '#1f1f1f', borderRadius: 4, overflow: 'hidden'}}>
              <div style={{width: `${pct}%`, height: '100%', background: tierColors[t.tier_id] || '#6b7280'}} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const cssExtra = `
@media print {
  body { background: white !important; }
  .no-print { display: none !important; }
}
@media (max-width: 768px) {
  .grid-2 { grid-template-columns: 1fr !important; }
  .grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
  .hero-row { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)) !important; }
}
`;

const periodBtn = (active) => ({
  padding: '6px 12px', background: active ? '#f97316' : '#1f1f1f',
  color: active ? '#0a0a0a' : '#9ca3af', border: 'none', borderRadius: 4,
  fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
});

const styles = {
  root: { background: '#0a0a0a', minHeight: '100vh', padding: 16, color: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  periodSelector: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  btn: { padding: '6px 10px', background: '#1f1f1f', color: '#9ca3af', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },

  anomalyBanner: { display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#2a0a0a', border: '1px solid #ef4444', borderRadius: 8, marginBottom: 16, cursor: 'pointer', color: '#fed7aa' },

  heroRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 16 },
  heroCard: { background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 8, padding: 14, transition: 'transform 0.15s' },
  kpiLabel: { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 },
  kpiValue: { fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.1 },
  kpiDelta: { display: 'inline-block', padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, marginTop: 4 },
  kpiSub: { fontSize: 10, color: '#6b7280', marginTop: 6 },

  gridTwoCol: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 },
  gridFourCol: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },

  panel: { background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 8, overflow: 'hidden' },
  panelTitle: { padding: '12px 16px', borderBottom: '1px solid #2a2a2a', fontSize: 12, fontWeight: 600, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },

  miniPanel: { background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 8, padding: 14 },

  sectionLabel: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginTop: 24, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #1f1f1f' },

  empty: { padding: 30, textAlign: 'center', color: '#6b7280', fontSize: 12 },

  legendRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' },
  rowFlex: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 },

  pnlLabel: { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  pnlValue: { fontSize: 20, fontWeight: 700, marginTop: 4 },
  pnlSub: { fontSize: 10, color: '#6b7280', marginTop: 4 },

  thBlock: { padding: 8, textAlign: 'left', color: '#9ca3af', fontWeight: 500, fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #2a2a2a' },
  tdBlock: { padding: 8, color: '#fff' },

  footer: { padding: 20, textAlign: 'center', fontSize: 10, color: '#6b7280', borderTop: '1px solid #1f1f1f', marginTop: 24 }
};
