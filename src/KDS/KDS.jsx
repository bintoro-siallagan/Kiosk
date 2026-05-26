// client/src/KDS/KDS.jsx
// Kitchen Display System UI — buat staff dapur lihat order real-time.
//
// Layout:
//   - Top bar: station tabs (filter) + active count + avg prep time today + 86 sidebar toggle
//   - Main grid: ticket cards organized by status (queued | preparing | ready)
//   - Each card: order_ref, items list, time elapsed (color-coded vs target), tap zone
//   - Auto-refresh + WebSocket update for real-time
//   - Sound notification on new ticket
//
// Color coding (vs station target_prep_seconds):
//   - Green: < 50% target time
//   - Yellow: 50-100% target time  
//   - Orange: 100-150% target time
//   - Red: > 150% target time (over SLA)
//
// Tap behavior per status:
//   queued → tap → preparing (started)
//   preparing → tap → ready (done, notify customer)
//   ready → tap → served (closed)
//   Long-press → recall (undo last status)
//
// Props:
//   apiBase (default '')
//   wsUrl  (default '/api/pos/broadcast/ws')
//   onTicketReady(ticket) — optional callback (untuk integrate dengan notifikasi)

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const fmtTime = (sec) => sec ? new Date(sec*1000).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-';
const fmtElapsed = (s) => {
  if (s < 60) return `${s}d`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}d`;
  return `${Math.floor(s/3600)}j ${Math.floor((s%3600)/60)}m`;
};

export default function KDS({ apiBase = '', wsUrl = null, onTicketReady }) {
  const [tickets, setTickets] = useState([]);
  const [stations, setStations] = useState([]);
  const [items86, setItems86] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeStation, setActiveStation] = useState('all');
  const [now, setNow] = useState(Date.now());
  const [showSidebar86, setShowSidebar86] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);
  const audioCtx = useRef(null);

  // KDS is a full-screen kitchen display — escape the 1126px #root width cap
  // (index.css) so it uses the whole monitor.
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const pw = root.style.width, pm = root.style.maxWidth;
    root.style.width = "100%"; root.style.maxWidth = "none";
    return () => { root.style.width = pw; root.style.maxWidth = pm; };
  }, []);

  // Clock tick — refresh display every second for live elapsed time
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load initial data
  const loadAll = useCallback(async () => {
    try {
      const [tk, st, ei, stats] = await Promise.all([
        fetch(`${apiBase}/api/kds/tickets`).then(r => r.json()),
        fetch(`${apiBase}/api/kds/stations`).then(r => r.json()),
        fetch(`${apiBase}/api/kds/86`).then(r => r.json()),
        fetch(`${apiBase}/api/kds/tickets/stats`).then(r => r.json()),
      ]);
      setTickets(Array.isArray(tk) ? tk : []);
      setStations(Array.isArray(st) ? st : []);
      setItems86(Array.isArray(ei) ? ei : []);
      setStats(stats);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [apiBase]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Periodic refresh fallback (in case WS disconnects)
  useEffect(() => {
    const t = setInterval(loadAll, 15 * 1000);
    return () => clearInterval(t);
  }, [loadAll]);

  // Play sound on new ticket
  const playDing = useCallback(() => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, []);

  // WebSocket connection
  useEffect(() => {
    if (!wsUrl) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const fullUrl = wsUrl.startsWith('ws') ? wsUrl : `${proto}//${window.location.host}${wsUrl}`;

    try {
      const ws = new WebSocket(fullUrl);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event === 'kds:ticket-created') { loadAll(); playDing(); }
          else if (msg.event === 'kds:ticket-updated' || msg.event === 'kds:ticket-served' || msg.event === 'kds:ticket-voided') loadAll();
          else if (msg.event === 'kds:ticket-ready') { loadAll(); onTicketReady?.(msg.payload); }
          else if (msg.event === 'kds:item-86' || msg.event === 'kds:item-restored') loadAll();
        } catch {}
      };
      ws.onerror = () => console.warn('[KDS] WebSocket error, falling back to polling');
      return () => ws.close();
    } catch (e) { console.warn('[KDS] WS init failed:', e.message); }
  }, [wsUrl, loadAll, playDing, onTicketReady]);

  // Filter by station
  const visibleTickets = useMemo(() => {
    if (activeStation === 'all') return tickets;
    return tickets.filter(t => t.station_id === activeStation);
  }, [tickets, activeStation]);

  // Group by status
  const grouped = useMemo(() => {
    const g = { queued: [], preparing: [], ready: [] };
    for (const t of visibleTickets) {
      if (g[t.status]) g[t.status].push(t);
    }
    return g;
  }, [visibleTickets]);

  const stationMap = useMemo(() => {
    const m = {}; stations.forEach(s => m[s.id] = s); return m;
  }, [stations]);

  // Status transition
  const advance = async (ticketId, currentStatus) => {
    const next = currentStatus === 'queued' ? 'start' :
                 currentStatus === 'preparing' ? 'ready' : 'served';
    try {
      await fetch(`${apiBase}/api/kds/tickets/${ticketId}/${next}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: localStorage.getItem('kasir_name') || 'kds' })
      });
      loadAll();
    } catch (e) { console.error(e); }
  };

  const recall = async (ticketId) => {
    try {
      await fetch(`${apiBase}/api/kds/tickets/${ticketId}/recall`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: localStorage.getItem('kasir_name') || 'kds' })
      });
      loadAll();
    } catch (e) { console.error(e); }
  };

  const restore86 = async (id) => {
    await fetch(`${apiBase}/api/kds/86/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restored_by: localStorage.getItem('kasir_name') || 'kds' })
    });
    loadAll();
  };

  if (loading) return <div style={{padding: 40, background: '#0a0a0a', minHeight: '100vh', color: '#9ca3af', textAlign: 'center'}}>Loading kitchen display...</div>;

  return (
    <div style={styles.root}>
      {/* TOP BAR */}
      <div style={styles.topBar}>
        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
          <span style={styles.brand}><img src="/logo.png" alt="" style={{ height: 24, verticalAlign: "middle", marginRight: 7 }} />KDS</span>
          <span style={styles.divider}>|</span>
          <div style={styles.stationTabs}>
            <button onClick={() => setActiveStation('all')} style={stationTabBtn(activeStation === 'all', '#6b7280')}>
              Semua ({tickets.length})
            </button>
            {stations.map(s => {
              const count = tickets.filter(t => t.station_id === s.id).length;
              return (
                <button key={s.id} onClick={() => setActiveStation(s.id)} style={stationTabBtn(activeStation === s.id, s.color)}>
                  {s.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          {stats && (
            <div style={styles.statSmall}>
              <span style={{color: '#9ca3af'}}>Selesai hari ini:</span> <b style={{color: '#fff'}}>{stats.completed_today?.total || 0}</b>
              <span style={{color: '#9ca3af', marginLeft: 8}}>Avg prep:</span> <b style={{color: '#fff'}}>{stats.completed_today?.avg_prep ? `${Math.round(stats.completed_today.avg_prep)}d` : '-'}</b>
            </div>
          )}
          <button onClick={() => setShowSidebar86(!showSidebar86)} style={{
            ...styles.btn,
            background: items86.length > 0 ? '#7c2d12' : '#1f1f1f',
            color: items86.length > 0 ? '#fed7aa' : '#9ca3af'
          }}>
            86 ({items86.length})
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={styles.body}>
        {/* Status columns */}
        <div style={styles.columns}>
          <StatusColumn title="ANTRIAN" subtitle="Queued" count={grouped.queued.length} color="#fbbf24">
            {grouped.queued.map(t => (
              <TicketCard key={t.id} ticket={t} station={stationMap[t.station_id]} now={now}
                onAdvance={() => advance(t.id, t.status)} ctaLabel="Mulai Buat →" />
            ))}
            {grouped.queued.length === 0 && <Empty>Tidak ada antrian</Empty>}
          </StatusColumn>

          <StatusColumn title="DIBUAT" subtitle="Preparing" count={grouped.preparing.length} color="#3b82f6">
            {grouped.preparing.map(t => (
              <TicketCard key={t.id} ticket={t} station={stationMap[t.station_id]} now={now}
                onAdvance={() => advance(t.id, t.status)} ctaLabel="Selesai / Siap ✓"
                onRecall={() => recall(t.id)} elapsedFrom={t.started_at} />
            ))}
            {grouped.preparing.length === 0 && <Empty>Belum ada yang dibuat</Empty>}
          </StatusColumn>

          <StatusColumn title="SIAP DIAMBIL" subtitle="Ready" count={grouped.ready.length} color="#4ade80">
            {grouped.ready.map(t => (
              <TicketCard key={t.id} ticket={t} station={stationMap[t.station_id]} now={now}
                onAdvance={() => advance(t.id, t.status)} ctaLabel="Sudah Diserahkan"
                onRecall={() => recall(t.id)} elapsedFrom={t.ready_at} pulsing />
            ))}
            {grouped.ready.length === 0 && <Empty>Belum ada yang siap</Empty>}
          </StatusColumn>
        </div>

        {/* 86 Sidebar */}
        {showSidebar86 && (
          <div style={styles.sidebar}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
              <h3 style={{margin: 0, color: '#fff'}}>86 List</h3>
              <button onClick={() => setShowSidebar86(false)} style={styles.closeBtn}>×</button>
            </div>
            <div style={{fontSize: 11, color: '#9ca3af', marginBottom: 16}}>
              Item yang sementara unavailable. Akan otomatis di-hide dari POS menu.
            </div>
            {items86.length === 0 && <div style={{padding: 20, textAlign: 'center', color: '#6b7280', fontSize: 12}}>Semua item available ✓</div>}
            {items86.map(item => (
              <div key={item.id} style={styles.itemRow86}>
                <div style={{flex: 1}}>
                  <div style={{color: '#fff', fontSize: 13, fontWeight: 500}}>{item.menu_id || item.sku}</div>
                  {item.reason && <div style={{fontSize: 10, color: '#9ca3af'}}>{item.reason}</div>}
                  <div style={{fontSize: 10, color: '#6b7280', marginTop: 2}}>
                    by {item.marked_by || '-'} · {fmtTime(item.marked_at)}
                  </div>
                </div>
                <button onClick={() => restore86(item.id)} style={styles.restoreBtn}>Restore</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TICKET CARD
// ============================================================
function TicketCard({ ticket, station, now, onAdvance, onRecall, ctaLabel, elapsedFrom, pulsing }) {
  const fromTs = elapsedFrom || ticket.created_at;
  const elapsed = Math.max(0, Math.floor(now/1000) - fromTs);
  const target = station?.target_prep_seconds || 300;
  const ratio = elapsed / target;

  let urgencyColor = '#4ade80', urgencyBg = '#0f2419';
  if (ratio > 1.5) { urgencyColor = '#ef4444'; urgencyBg = '#2d0f0f'; }
  else if (ratio > 1.0) { urgencyColor = '#fb923c'; urgencyBg = '#2d1a0f'; }
  else if (ratio > 0.5) { urgencyColor = '#fbbf24'; urgencyBg = '#2d240f'; }

  const items = Array.isArray(ticket.items) ? ticket.items : [];

  return (
    <div style={{
      ...styles.card,
      borderLeftColor: station?.color || '#6b7280',
      animation: pulsing ? 'pulse 2s infinite' : 'none'
    }}>
      <div style={styles.cardHeader}>
        <div style={{flex: 1}}>
          <div style={{fontSize: 11, color: '#9ca3af', fontWeight: 500, letterSpacing: '0.05em'}}>
            {ticket.doc_no}
          </div>
          <div style={{fontSize: 10, color: '#6b7280', marginTop: 2}}>
            {ticket.order_ref}{ticket.table_no ? ` · Meja ${ticket.table_no}` : ''}{ticket.customer_name ? ` · ${ticket.customer_name}` : ''}
          </div>
        </div>
        <div style={{...styles.timer, background: urgencyBg, color: urgencyColor}}>
          {fmtElapsed(elapsed)}
        </div>
      </div>

      <div style={styles.cardBody}>
        {items.map((it, i) => (
          <div key={i} style={styles.itemLine}>
            <span style={styles.itemQty}>{it.qty || 1}×</span>
            <div style={{flex: 1}}>
              <div style={{color: '#fff', fontWeight: 500, fontSize: 13}}>{it.display_name || it.menu_id}</div>
              {it.size_name && <div style={styles.itemDetail}>Size: {it.size_name}</div>}
              {Array.isArray(it.extras) && it.extras.filter(e => e.qty > 0).map((e, j) => (
                <div key={j} style={styles.itemDetail}>+ {e.name}{e.qty > 1 ? ` × ${e.qty}` : ''}</div>
              ))}
              {it.notes && <div style={{...styles.itemDetail, color: '#fbbf24', fontStyle: 'italic'}}>Note: {it.notes}</div>}
            </div>
          </div>
        ))}
        {ticket.notes && (
          <div style={styles.ticketNote}>📝 {ticket.notes}</div>
        )}
      </div>

      <div style={styles.cardActions}>
        {onRecall && (
          <button onClick={onRecall} style={styles.recallBtn} title="Undo last status">↶</button>
        )}
        <button onClick={onAdvance} style={{...styles.advanceBtn, background: urgencyColor + '22', color: urgencyColor, borderColor: urgencyColor}}>
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// STATUS COLUMN
// ============================================================
function StatusColumn({ title, subtitle, count, color, children }) {
  return (
    <div style={styles.column}>
      <div style={{...styles.columnHeader, borderTopColor: color}}>
        <div>
          <div style={{fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '0.05em'}}>{title}</div>
          <div style={{fontSize: 10, color: '#6b7280', textTransform: 'uppercase'}}>{subtitle}</div>
        </div>
        <div style={{...styles.countBadge, background: color + '22', color: color}}>{count}</div>
      </div>
      <div style={styles.columnBody}>{children}</div>
    </div>
  );
}

function Empty({ children }) {
  return <div style={{padding: 30, textAlign: 'center', color: '#6b7280', fontSize: 12}}>{children}</div>;
}

// ============================================================
// STYLES
// ============================================================
const stationTabBtn = (active, color) => ({
  padding: '7px 14px',
  background: active ? `${color}22` : 'rgba(255,255,255,0.025)',
  color: active ? color : 'rgba(255,255,255,0.55)',
  border: `1px solid ${active ? `${color}66` : 'rgba(255,255,255,0.08)'}`,
  borderRadius: 18, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
  boxShadow: active ? `0 0 16px ${color}33` : 'none',
  transition: 'all 0.15s',
});

// Dark MacBook-premium — match POS surfaces (KDS dipakai daily by kitchen staff)
const styles = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)',
    color: '#fff',
    fontFamily: "'Inter','SF Pro Display',system-ui,-apple-system,sans-serif",
    display: 'flex', flexDirection: 'column',
  },
  topBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(13,17,23,0.78)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    flexWrap: 'wrap', gap: 12, position: 'sticky', top: 0, zIndex: 10,
  },
  brand: {
    fontSize: 20, fontWeight: 800, letterSpacing: -0.4,
    background: 'linear-gradient(135deg,#F59E0B,#fbbf24)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  },
  divider: { color: 'rgba(255,255,255,0.15)' },
  stationTabs: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  statSmall: { fontSize: 12, color: 'rgba(255,255,255,0.55)' },
  btn: {
    padding: '8px 14px',
    background: 'rgba(255,255,255,0.025)',
    color: 'rgba(255,255,255,0.65)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.15s',
  },

  body: { flex: 1, display: 'flex', gap: 0, overflow: 'hidden' },
  columns: {
    flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 1, background: 'rgba(255,255,255,0.04)', // separator
  },
  column: {
    background: 'linear-gradient(180deg,#0d0f14 0%,#08090a 100%)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  columnHeader: {
    padding: '14px 20px', borderTop: '3px solid',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'rgba(13,17,23,0.5)',
  },
  columnBody: { flex: 1, overflow: 'auto', padding: 14 },
  countBadge: {
    padding: '4px 11px', borderRadius: 12, fontSize: 13, fontWeight: 800,
    minWidth: 30, textAlign: 'center', fontFamily: "'Geist Mono',monospace",
  },

  // Ticket card — glass dark with 4px left accent + multi-shadow
  card: {
    background: 'linear-gradient(180deg,#15171c 0%,#0d0f14 100%)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderLeft: '4px solid #6b7280',
    borderRadius: 11, marginBottom: 10, overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3),0 6px 20px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.04)',
    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
  },
  cardHeader: {
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
  },
  timer: {
    padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 800,
    fontFamily: "'Geist Mono',monospace", letterSpacing: -0.2,
  },
  cardBody: { padding: '10px 14px' },
  itemLine: { display: 'flex', gap: 10, marginBottom: 8 },
  itemQty: {
    color: '#fbbf24', fontWeight: 800, fontSize: 16, minWidth: 28,
    fontFamily: "'Geist Mono',monospace",
  },
  itemDetail: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  ticketNote: {
    padding: '8px 11px',
    background: 'rgba(251,191,36,0.08)',
    border: '1px solid rgba(251,191,36,0.25)',
    borderRadius: 7, fontSize: 11.5, color: '#fbbf24', marginTop: 8,
    lineHeight: 1.4,
  },
  cardActions: {
    display: 'flex', gap: 6, padding: '10px 14px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  advanceBtn: {
    flex: 1, padding: '11px 14px',
    background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
    color: '#fff', border: 'none', borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
    letterSpacing: 0.3,
    boxShadow: '0 4px 14px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
    transition: 'all 0.15s',
  },
  recallBtn: {
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, cursor: 'pointer', fontSize: 16, fontFamily: 'inherit',
    transition: 'all 0.15s',
  },

  sidebar: {
    width: 340,
    background: 'rgba(8,9,15,0.85)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    borderLeft: '1px solid rgba(255,255,255,0.06)',
    padding: 22, overflow: 'auto',
    boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.04)',
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.65)',
    border: '1px solid rgba(255,255,255,0.08)',
    fontSize: 18, cursor: 'pointer', fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  itemRow86: {
    display: 'flex', gap: 10, padding: '10px 14px',
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 9, marginBottom: 7, alignItems: 'center',
  },
  restoreBtn: {
    padding: '6px 12px',
    background: 'rgba(16,185,129,0.12)',
    color: '#34d399',
    border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
  },
};

// Inject pulse animation
if (typeof document !== 'undefined' && !document.getElementById('kds-pulse-style')) {
  const s = document.createElement('style');
  s.id = 'kds-pulse-style';
  s.textContent = '@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.4); } 50% { box-shadow: 0 0 0 8px rgba(74,222,128,0); } }';
  document.head.appendChild(s);
}
