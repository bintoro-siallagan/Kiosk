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
  const [viewMode, setViewMode] = useState('status');  // 'status' (default 3-col by status) | 'station' (mission grid per-station)
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

  // ── KDS SOUND SYSTEM (Web Audio synth — no asset files needed) ──
  // 3 distinct sounds for chef instant recognition tanpa lihat layar:
  //   - playDingNew    : single 880Hz bell (new order ping)
  //   - playDingReady  : ascending 2-tone (positive completion)
  //   - playDingLate   : low-pitched urgent triple-pulse (warning)
  const ensureCtx = () => {
    if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx.current;
  };
  const playTone = (freq, duration = 0.3, type = 'sine', startGain = 0.15) => {
    try {
      const ctx = ensureCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = type;
      gain.gain.setValueAtTime(startGain, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  };
  const playDing = useCallback(() => playTone(880, 0.3, 'sine', 0.15), []);
  const playDingReady = useCallback(() => {
    playTone(659, 0.18, 'sine', 0.13);                                  // E5
    setTimeout(() => playTone(880, 0.25, 'sine', 0.13), 180);          // A5 (ascending)
  }, []);
  const playDingLate = useCallback(() => {
    // Urgent triple-pulse low-pitch (chef notice from across kitchen)
    playTone(220, 0.12, 'square', 0.12);
    setTimeout(() => playTone(220, 0.12, 'square', 0.12), 200);
    setTimeout(() => playTone(220, 0.18, 'square', 0.14), 400);
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

  // ── LATE TICKET DETECTION → audio alert ──
  // Compute tier per ticket. Compare prev set vs current. Kalau ticket baru masuk
  // tier 'danger', play urgent late sound. Throttled per-ticket (alert sekali aja).
  const lateAlertedRef = useRef(new Set());
  useEffect(() => {
    const nowSec = Math.floor(now / 1000);
    const newlyLate = [];
    for (const t of visibleTickets) {
      if (t.status !== 'queued' && t.status !== 'preparing') continue;
      const fromTs = t.status === 'preparing' ? (t.started_at || t.created_at) : t.created_at;
      const elapsed = Math.max(0, nowSec - fromTs);
      const tgt = stationMap?.[t.station_id]?.target_prep_seconds || 300;
      if (elapsed / tgt > 1.5 && !lateAlertedRef.current.has(t.id)) {
        lateAlertedRef.current.add(t.id);
        newlyLate.push(t.id);
      }
    }
    if (newlyLate.length > 0) playDingLate();
    // Clean up alerted set kalau ticket sudah served/voided
    const currentIds = new Set(visibleTickets.map(t => t.id));
    for (const id of [...lateAlertedRef.current]) {
      if (!currentIds.has(id)) lateAlertedRef.current.delete(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, visibleTickets, playDingLate]);

  // ── ANALYTICS COMPUTATION (client-side from tickets data) ──
  const analytics = useMemo(() => {
    const nowSec = Math.floor(now / 1000);
    let queued = 0, preparing = 0, ready = 0, late = 0, warning = 0;
    for (const t of visibleTickets) {
      if (t.status === 'queued') queued++;
      else if (t.status === 'preparing') preparing++;
      else if (t.status === 'ready') ready++;
      if (t.status === 'queued' || t.status === 'preparing') {
        const fromTs = t.status === 'preparing' ? (t.started_at || t.created_at) : t.created_at;
        const elapsed = nowSec - fromTs;
        const tgt = (stations.find(s => s.id === t.station_id)?.target_prep_seconds) || 300;
        if (elapsed / tgt > 1.5) late++;
        else if (elapsed / tgt > 1.0) warning++;
      }
    }
    return { queued, preparing, ready, late, warning, total: visibleTickets.length };
  }, [visibleTickets, now, stations]);

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
          {/* VIEW MODE TOGGLE */}
          <div style={{display:'flex',gap:4,padding:3,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,marginRight:4}}>
            <button onClick={() => setViewMode('status')} title="Group by status (Queue/Cooking/Ready)" style={{
              padding:'5px 11px', borderRadius:6, border:'none',
              background: viewMode==='status' ? '#fbbf24' : 'transparent',
              color: viewMode==='status' ? '#1a1205' : '#9ca3af',
              fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'inherit', letterSpacing:0.5,
            }}>BY STATUS</button>
            <button onClick={() => setViewMode('station')} title="Mission grid — per-station columns" style={{
              padding:'5px 11px', borderRadius:6, border:'none',
              background: viewMode==='station' ? '#fbbf24' : 'transparent',
              color: viewMode==='station' ? '#1a1205' : '#9ca3af',
              fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'inherit', letterSpacing:0.5,
            }}>BY STATION</button>
          </div>
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
              <span style={{color: '#9ca3af'}}>Selesai today:</span> <b style={{color: '#fff'}}>{stats.completed_today?.total || 0}</b>
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

      {/* ── INDUSTRIAL ANALYTICS STRIP (Kitchen OS) ── */}
      <div style={{
        display: "flex", gap: 8, padding: "10px 16px",
        background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexWrap: "wrap",
      }}>
        <AnalyticsTile label="ACTIVE" value={analytics.total} color="#fff" />
        <AnalyticsTile label="QUEUED" value={analytics.queued} color="#3b82f6" />
        <AnalyticsTile label="COOKING" value={analytics.preparing} color="#fb923c" />
        <AnalyticsTile label="READY" value={analytics.ready} color="#4ade80" />
        {analytics.warning > 0 && <AnalyticsTile label="WARN" value={analytics.warning} color="#fbbf24" />}
        {analytics.late > 0 && <AnalyticsTile label="LATE" value={analytics.late} color="#ef4444" pulse />}
        <div style={{ flex: 1 }} />
        {stats?.completed_today && (
          <>
            <AnalyticsTile label="DONE TODAY" value={stats.completed_today.total || 0} color="#10b981" />
            <AnalyticsTile label="AVG PREP" value={stats.completed_today.avg_prep ? `${Math.round(stats.completed_today.avg_prep)}s` : "—"} color="#22d3ee" />
          </>
        )}
      </div>

      {/* MAIN CONTENT */}
      <div style={styles.body}>
        {viewMode === 'status' ? (
          /* ── BY STATUS view (default 3-col) ── */
          <div style={styles.columns}>
            <StatusColumn title="QUEUE" subtitle="Queued" count={grouped.queued.length} color="#fbbf24">
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
        ) : (
          /* ── BY STATION view (Mission Grid — per-station column) ── */
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.max(1, stations.length)}, minmax(280px, 1fr))`,
            gap: 12, overflowX: "auto",
          }}>
            {stations.map(s => {
              const stationTickets = visibleTickets
                .filter(t => t.station_id === s.id)
                .sort((a, b) => {
                  // Sort: queued > preparing > ready (active first)
                  const order = { queued: 0, preparing: 1, ready: 2 };
                  return (order[a.status] || 9) - (order[b.status] || 9) || a.created_at - b.created_at;
                });
              const queued = stationTickets.filter(t => t.status === 'queued').length;
              const prep   = stationTickets.filter(t => t.status === 'preparing').length;
              const ready  = stationTickets.filter(t => t.status === 'ready').length;
              return (
                <div key={s.id} style={{
                  background: "#0a0e16",
                  border: `1px solid ${s.color}33`,
                  borderTop: `4px solid ${s.color}`,
                  borderRadius: 12, overflow: "hidden",
                  display: "flex", flexDirection: "column", minHeight: 400,
                }}>
                  {/* Station header */}
                  <div style={{
                    padding: "12px 14px", borderBottom: `1px solid ${s.color}22`,
                    background: `linear-gradient(180deg,${s.color}10,transparent)`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: s.color, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.8, textTransform: "uppercase" }}>● {s.name}</div>
                        <div style={{ fontSize: 10, color: "#7a8699", fontFamily: "'Geist Mono',monospace", marginTop: 3, letterSpacing: 0.5 }}>{s.id.toUpperCase()}</div>
                      </div>
                      <div style={{ display: "flex", gap: 4, fontFamily: "'Geist Mono',monospace", fontSize: 10, fontWeight: 800 }}>
                        <span style={{ padding: "2px 7px", background: "rgba(251,191,36,0.15)", color: "#fbbf24", borderRadius: 4 }} title="Queue">{queued}Q</span>
                        <span style={{ padding: "2px 7px", background: "rgba(59,130,246,0.15)", color: "#3b82f6", borderRadius: 4 }} title="Preparing">{prep}P</span>
                        <span style={{ padding: "2px 7px", background: "rgba(74,222,128,0.15)", color: "#4ade80", borderRadius: 4 }} title="Ready">{ready}R</span>
                      </div>
                    </div>
                  </div>
                  {/* Station tickets */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
                    {stationTickets.length === 0 ? (
                      <Empty>Idle</Empty>
                    ) : stationTickets.map(t => {
                      const ctaLabel = t.status === 'queued' ? "Mulai Buat →" : t.status === 'preparing' ? "Siap ✓" : "Sudah Diserahkan";
                      const elapsedFrom = t.status === 'preparing' ? t.started_at : t.status === 'ready' ? t.ready_at : t.created_at;
                      return (
                        <TicketCard key={t.id} ticket={t} station={s} now={now}
                          onAdvance={() => advance(t.id, t.status)} ctaLabel={ctaLabel}
                          onRecall={t.status !== 'queued' ? () => recall(t.id) : null}
                          elapsedFrom={elapsedFrom} pulsing={t.status === 'ready'} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

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

  // INDUSTRIAL TIER — 4 levels of escalation utk chef scan <1 detik
  //   normal  (< 50% target)  — calm blue/green
  //   watch   (50-100%)       — gold attention
  //   warning (100-150%)      — orange urgent
  //   danger  (> 150%)        — red CRITICAL pulse glow
  let tier = "normal";
  if (ratio > 1.5)      tier = "danger";
  else if (ratio > 1.0) tier = "warning";
  else if (ratio > 0.5) tier = "watch";

  const TIER = {
    normal:  { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.4)",  glow: "" },
    watch:   { color: "#fbbf24", bg: "rgba(251,191,36,0.14)",  border: "rgba(251,191,36,0.45)", glow: "" },
    warning: { color: "#fb923c", bg: "rgba(251,146,60,0.16)",  border: "rgba(251,146,60,0.55)", glow: "0 0 16px rgba(251,146,60,0.35)" },
    danger:  { color: "#ef4444", bg: "rgba(239,68,68,0.18)",   border: "rgba(239,68,68,0.6)",   glow: "0 0 22px rgba(239,68,68,0.55)" },
  }[tier];

  const items = Array.isArray(ticket.items) ? ticket.items : [];
  const isDanger = tier === "danger";

  return (
    <div className={`kds-card kds-card-${tier} ${pulsing ? "kds-card-pulse" : ""}`} style={{
      ...styles.card,
      borderLeftColor: TIER.color,
      borderLeftWidth: 6,
      boxShadow: isDanger
        ? `0 1px 2px rgba(0,0,0,0.3), 0 6px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04), ${TIER.glow}`
        : styles.card.boxShadow,
    }}>
      {/* TIER STRIPE — top horizontal bar utk extra visual signal */}
      {(tier === "warning" || tier === "danger") && (
        <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${TIER.color}, transparent)`, opacity: 0.9 }} />
      )}

      <div style={styles.cardHeader}>
        <div style={{flex: 1, minWidth: 0}}>
          {/* BIG ORDER # — primary hierarchy */}
          <div style={{
            fontSize: 24, fontWeight: 900, color: "#fff",
            fontFamily: "'Geist Mono',monospace", letterSpacing: -0.8,
            lineHeight: 1, marginBottom: 4,
          }}>
            #{ticket.doc_no || ticket.order_ref || "—"}
          </div>
          {/* Meta: table + customer (smaller, dim) */}
          <div style={{fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.3}}>
            {ticket.table_no ? `🪑 Meja ${ticket.table_no}` : "🛍 Take Away"}
            {ticket.customer_name ? ` · ${ticket.customer_name}` : ""}
          </div>
          {/* Station chip kalau ada */}
          {station && (
            <div style={{
              marginTop: 6, display: "inline-flex", alignItems: "center", gap: 5,
              padding: "2px 8px", borderRadius: 4,
              background: `${station.color || "#6b7280"}22`,
              border: `1px solid ${station.color || "#6b7280"}55`,
              fontSize: 10, fontWeight: 800, color: station.color || "#9ca3af",
              fontFamily: "'Geist Mono',monospace", letterSpacing: 0.8, textTransform: "uppercase",
            }}>
              ● {station.name || station.code}
            </div>
          )}
        </div>
        {/* TIMER HERO — BIG dramatic dgn color escalation */}
        <div className={isDanger ? "kds-timer-danger" : ""} style={{
          padding: "8px 14px", borderRadius: 8,
          background: TIER.bg,
          border: `1.5px solid ${TIER.border}`,
          color: TIER.color,
          fontSize: 22, fontWeight: 900,
          fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5,
          lineHeight: 1, minWidth: 80, textAlign: "center",
          boxShadow: TIER.glow,
          flexShrink: 0,
        }}>
          {fmtElapsed(elapsed)}
        </div>
      </div>

      <div style={styles.cardBody}>
        {items.map((it, i) => (
          <div key={i} style={styles.itemLine}>
            <span style={styles.itemQty}>{it.qty || 1}×</span>
            <div style={{flex: 1}}>
              <div style={{color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.25}}>{it.display_name || it.menu_id}</div>
              {it.size_name && <div style={styles.itemDetail}>Size: {it.size_name}</div>}
              {Array.isArray(it.extras) && it.extras.filter(e => e.qty > 0).map((e, j) => (
                <div key={j} style={styles.itemDetail}>+ {e.name}{e.qty > 1 ? ` × ${e.qty}` : ''}</div>
              ))}
              {it.notes && <div style={{...styles.itemDetail, color: '#fbbf24', fontStyle: 'italic', fontWeight: 700}}>📌 {it.notes}</div>}
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
        <button onClick={onAdvance} className="kds-cta" style={{
          flex: 1, padding: '13px 16px',
          background: TIER.color,
          color: tier === "watch" ? "#1a1205" : "#fff",
          border: "none", borderRadius: 8,
          cursor: "pointer", fontSize: 14, fontWeight: 900, fontFamily: "inherit",
          letterSpacing: 0.4, textTransform: "uppercase",
          boxShadow: `0 4px 16px ${TIER.color}66, inset 0 1px 0 rgba(255,255,255,0.25)`,
          transition: "all 0.15s cubic-bezier(.2,.8,.2,1)",
        }}>
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

// Kitchen analytics tile — compact KPI utk strip top
function AnalyticsTile({ label, value, color, pulse }) {
  return (
    <div className={pulse ? "kds-card-pulse" : ""} style={{
      background: `linear-gradient(180deg, ${color}1a, ${color}08)`,
      border: `1px solid ${color}44`,
      borderRadius: 8, padding: "6px 14px",
      minWidth: 72,
      boxShadow: pulse ? `0 0 14px ${color}55` : "none",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
    }}>
      <div style={{
        fontSize: 20, fontWeight: 900, color, lineHeight: 1,
        fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5,
      }}>{value}</div>
      <div style={{
        fontSize: 9, color: "rgba(255,255,255,0.6)", letterSpacing: 1.2,
        fontFamily: "'Geist Mono',monospace", fontWeight: 700,
      }}>{label}</div>
    </div>
  );
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
    background: "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)",
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

// Inject industrial KDS animations — slide-in entrance, timer pulse, ready pulse
if (typeof document !== 'undefined' && !document.getElementById('kds-pulse-style')) {
  const s = document.createElement('style');
  s.id = 'kds-pulse-style';
  s.textContent = `
    /* Ready ticket pulse (existing) */
    @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.4); } 50% { box-shadow: 0 0 0 8px rgba(74,222,128,0); } }
    .kds-card-pulse { animation: pulse 2s infinite }
    /* Slide-in entrance — visual urgency saat new ticket muncul */
    @keyframes kdsSlideIn { from { opacity: 0; transform: translateY(-12px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .kds-card { animation: kdsSlideIn 0.35s cubic-bezier(.2,.8,.2,1) both }
    /* Danger tier timer — aggressive pulse glow utk over-SLA tickets */
    @keyframes kdsTimerDanger { 0%,100% { filter: brightness(1) drop-shadow(0 0 8px rgba(239,68,68,0.5)); } 50% { filter: brightness(1.3) drop-shadow(0 0 16px rgba(239,68,68,0.9)); } }
    .kds-timer-danger { animation: kdsTimerDanger 1s ease infinite }
    /* Danger tier whole-card subtle shake-pulse */
    @keyframes kdsDangerEdge { 0%,100% { box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 6px 20px rgba(0,0,0,0.3), 0 0 22px rgba(239,68,68,0.55); } 50% { box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 6px 20px rgba(0,0,0,0.3), 0 0 32px rgba(239,68,68,0.85); } }
    .kds-card-danger { animation: kdsSlideIn 0.35s cubic-bezier(.2,.8,.2,1) both, kdsDangerEdge 1.8s ease infinite 0.35s }
    /* CTA hover lift */
    .kds-cta { transition: transform 0.15s ease, box-shadow 0.15s ease }
    .kds-cta:hover { transform: translateY(-2px); filter: brightness(1.08) }
    .kds-cta:active { transform: translateY(0); filter: brightness(0.95) }
  `;
  document.head.appendChild(s);
}
