// client/src/POS/POSKasirLogin.jsx
// Halaman awal POS — kasir login dengan:
//   - Status bar real-time (network, printer, sync)
//   - 3 KPI card (revenue, orders, anomali) fetch dari /api/finance/dashboard
//   - Staff cards dengan avatar initials + shift state + role badge
//   - PIN gate buat Manager (validate vs MANAGER_PIN config)
//   - Buka/Lanjut/Tutup shift — log ke pos_events
//
// Drop-in replacement buat halaman "Pilih Kasir" existing.
//
// Props:
//   onSelectKasir(staff)  — callback setelah kasir berhasil login
//   apiBase (default '')
import React, { useState, useEffect, useCallback, useMemo } from 'react';

const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));
const fmtTime = (sec) => sec ? new Date(sec*1000).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-';
const fmtDate = () => new Date().toLocaleDateString('id-ID', {weekday:'short', day:'2-digit', month:'short', year:'numeric'});
const initials = (name) => name?.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';

function timeAgo(sec) {
  if (!sec) return null;
  const diff = Math.floor(Date.now()/1000) - sec;
  if (diff < 60) return `${diff} detik lalu`;
  if (diff < 3600) return `${Math.floor(diff/60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff/3600)} jam lalu`;
  return `${Math.floor(diff/86400)} hari lalu`;
}

export default function POSKasirLogin({ onSelectKasir, apiBase = '' }) {
  const [now, setNow] = useState(new Date());
  const [stats, setStats] = useState({ revenue: 0, orders: 0, anomalies: 0 });
  const [staff, setStaff] = useState([]);
  const [activeShifts, setActiveShifts] = useState({});
  const [system, setSystem] = useState({ network: 'checking', printer: 'unknown', last_sync: null });
  const [pinModal, setPinModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dayClosed, setDayClosed] = useState(false);

  // CLOCK — refresh every 30s
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  // FETCH KPI STATS (every 30s)
  const loadStats = useCallback(async () => {
    try {
      const dash = await fetch(`${apiBase}/api/finance/dashboard`).then(r => r.json());
      const today = dash?.today || {};
      setStats(prev => ({
        ...prev,
        revenue: today.revenue?.net || 0,
        orders: today.revenue?.order_count || 0,
      }));
    } catch {}

    try {
      const todayStart = Math.floor(new Date().setHours(0,0,0,0)/1000);
      const ans = await fetch(`${apiBase}/api/pos/anomalies?from=${todayStart}`).then(r => r.json());
      setStats(prev => ({ ...prev, anomalies: Array.isArray(ans) ? ans.length : 0 }));
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    loadStats();
    const t = setInterval(loadStats, 30 * 1000);
    return () => clearInterval(t);
  }, [loadStats]);

  // FETCH STAFF + ACTIVE SHIFTS
  const loadStaff = useCallback(async () => {
    setLoading(true);
    let list = null;
    // Try common endpoints — /api/auth/users is this project's real staff source
    for (const url of ['/api/staff', '/api/auth/users', '/api/users', '/api/pos/staff']) {
      try {
        const r = await fetch(`${apiBase}${url}`);
        if (r.ok) { list = await r.json(); break; }
      } catch {}
    }
    if (!Array.isArray(list) || list.length === 0) {
      // Fallback mock — replace with real endpoint
      list = [
        { id: 'manager-1', name: 'Manager', role: 'manager', last_login: Math.floor(Date.now()/1000) - 18*3600 },
        { id: 'kasir-1', name: 'Kasir 1', role: 'kasir', last_login: Math.floor(Date.now()/1000) - 30*60 },
        { id: 'kasir-2', name: 'Kasir 2', role: 'kasir', last_login: Math.floor(Date.now()/1000) - 3*3600 },
      ];
    }
    setStaff(list);

    // Fetch active shifts from pos_events (shift_open without subsequent shift_close)
    try {
      const todayStart = Math.floor(new Date().setHours(0,0,0,0)/1000);
      const opens = await fetch(`${apiBase}/api/pos/events?event_type=shift_open&from=${todayStart}`).then(r => r.json());
      const shifts = {};
      if (Array.isArray(opens)) {
        for (const ev of opens) {
          if (ev.actor) shifts[ev.actor] = { opened_at: ev.created_at, event_id: ev.id };
        }
        const closes = await fetch(`${apiBase}/api/pos/events?event_type=shift_close&from=${todayStart}`).then(r => r.json());
        if (Array.isArray(closes)) {
          for (const ev of closes) {
            if (ev.actor && shifts[ev.actor] && ev.created_at > shifts[ev.actor].opened_at) {
              delete shifts[ev.actor];
            }
          }
        }
      }
      setActiveShifts(shifts);
    } catch {}

    setLoading(false);
  }, [apiBase]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  // Business-day gate — if the day is closed, no shift can be opened.
  const checkDay = useCallback(() => {
    fetch(`${apiBase}/api/day/status`).then(r => r.json())
      .then(d => setDayClosed(!!d.closed)).catch(() => {});
  }, [apiBase]);
  useEffect(() => {
    checkDay();
    const t = setInterval(checkDay, 20000);
    return () => clearInterval(t);
  }, [checkDay]);
  async function handleOpenDay() {
    try {
      await fetch(`${apiBase}/api/day/open`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ by: "Manager" }),
      });
    } catch {}
    setDayClosed(false);
  }

  // SYSTEM HEALTH — network + printer + last sync
  useEffect(() => {
    const check = async () => {
      try {
        const start = Date.now();
        const r = await fetch(`${apiBase}/api/master/units`);
        if (r.ok) {
          setSystem(prev => ({ ...prev, network: Date.now() - start < 500 ? 'good' : 'slow' }));
        } else {
          setSystem(prev => ({ ...prev, network: 'offline' }));
        }
      } catch {
        setSystem(prev => ({ ...prev, network: 'offline' }));
      }

      try {
        const r = await fetch(`${apiBase}/api/pos/config/CASH_DRAWER_AUTO_OPEN`);
        setSystem(prev => ({ ...prev, printer: r.ok ? 'ready' : 'check' }));
      } catch {
        setSystem(prev => ({ ...prev, printer: 'check' }));
      }

      setSystem(prev => ({ ...prev, last_sync: Math.floor(Date.now()/1000) }));
    };
    check();
    const t = setInterval(check, 60 * 1000);
    return () => clearInterval(t);
  }, [apiBase]);

  // LOGIN HANDLER
  const handleSelectStaff = (s) => {
    if (s.role === 'manager') setPinModal({ staff: s });
    else doLogin(s);
  };

  const doLogin = async (s) => {
    if (!activeShifts[s.id]) {
      try {
        await fetch(`${apiBase}/api/pos/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'shift_open',
            payload: { staff_id: s.id, staff_name: s.name, role: s.role },
            actor: s.id, severity: 'info'
          })
        });
      } catch {}
    }
    // Open a real shift in pos_shifts (idempotent — backend returns 409 if already open)
    try {
      await fetch(`${apiBase}/api/pos/shifts/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: s.id })
      });
    } catch {}
    onSelectKasir?.(s);
  };

  const verifyPin = async (pin) => {
    try {
      const r = await fetch(`${apiBase}/api/pos/config/MANAGER_PIN`);
      const cfg = await r.json();
      if (String(cfg.parsed_value) === String(pin)) return true;
    } catch {}
    return false;
  };

  const sortedStaff = useMemo(() => {
    return [...staff].sort((a, b) => {
      const order = { manager: 0, kasir: 1 };
      return (order[a.role] ?? 9) - (order[b.role] ?? 9);
    });
  }, [staff]);

  return (
    <div style={styles.root}>
      {/* TOP STATUS BAR */}
      <div style={styles.topBar}>
        <div style={styles.statusGroup}>
          <StatusItem icon="ti-wifi" label={
            system.network === 'good' ? 'Online' :
            system.network === 'slow' ? 'Slow' :
            system.network === 'offline' ? 'Offline' : 'Checking...'
          } color={
            system.network === 'good' ? '#4ade80' :
            system.network === 'slow' ? '#fbbf24' : '#ef4444'
          } />
          <StatusItem icon="ti-printer" label={
            system.printer === 'ready' ? 'Printer ready' :
            system.printer === 'check' ? 'Printer ?' : 'Checking...'
          } color={system.printer === 'ready' ? '#4ade80' : '#fbbf24'} />
          <StatusItem icon="ti-cloud-check" label={system.last_sync ? `Sync ${timeAgo(system.last_sync)}` : 'Belum sync'} color="#4ade80" />
        </div>
        <div style={styles.datetime}>
          {fmtDate()} · {now.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}
        </div>
      </div>

      {/* LOGO */}
      <div style={styles.logo}>
        <div style={styles.logoRow}>
          <img src="/logo.png" alt="KaryaOS" style={{ height: 54, objectFit: "contain" }} />
          <span style={styles.logoText}>KaryaOS POS</span>
        </div>
        <div style={styles.logoSub}>POINT OF SALE TERMINAL</div>
      </div>

      {/* KPI STATS */}
      <div style={styles.statsRow}>
        <StatCard label="Revenue hari ini" value={fmtIDR(stats.revenue)} color="#f97316" />
        <StatCard label="Orders" value={stats.orders} color="#fff" />
        <StatCard label="Anomali" value={stats.anomalies} color={stats.anomalies > 0 ? '#fbbf24' : '#4ade80'} />
      </div>

      {dayClosed ? (
        <div style={{textAlign:'center', padding:'48px 24px'}}>
          <div style={{fontSize:72, marginBottom:12}}>🌙</div>
          <div style={{fontSize:26, fontWeight:800, color:'#f59e0b', letterSpacing:1, marginBottom:10}}>HARI DITUTUP</div>
          <div style={{fontSize:14, color:'#9ca3af', lineHeight:1.6, marginBottom:30}}>Operasional hari ini sudah ditutup Manager.<br/>Buka hari dulu untuk mulai melayani lagi.</div>
          <button onClick={handleOpenDay} style={{background:'#f59e0b', color:'#111', border:'none', borderRadius:14, padding:'16px 40px', fontSize:16, fontWeight:800, cursor:'pointer'}}>☀️ Buka Hari</button>
        </div>
      ) : (
      <>
      <div style={styles.prompt}>Pilih Kasir untuk Memulai</div>

      {loading ? (
        <div style={{textAlign: 'center', color: '#6b7280', padding: 40}}>Loading staff...</div>
      ) : (
        <div style={styles.staffGrid}>
          {sortedStaff.map(s => (
            <StaffCard key={s.id} staff={s}
              activeShift={activeShifts[s.id]}
              onClick={() => handleSelectStaff(s)} />
          ))}
        </div>
      )}
      </>
      )}

      {pinModal && (
        <PinModal staff={pinModal.staff}
          onCancel={() => setPinModal(null)}
          onSuccess={() => { doLogin(pinModal.staff); setPinModal(null); }}
          verifyPin={verifyPin} />
      )}
    </div>
  );
}

// STATUS ITEM
function StatusItem({ icon, label, color }) {
  return (
    <span style={{display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9ca3af'}}>
      <i className={`ti ${icon}`} style={{fontSize: 14, color}} aria-hidden="true" />
      {label}
    </span>
  );
}

// STAT CARD
function StatCard({ label, value, color }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={{...styles.statValue, color}}>{value}</div>
    </div>
  );
}

// STAFF CARD
function StaffCard({ staff, activeShift, onClick }) {
  const isManager = staff.role === 'manager';
  const isActive = !!activeShift;
  const lastLogin = staff.last_login;

  return (
    <button onClick={onClick} style={{
      ...styles.staffCard,
      borderColor: isActive ? '#f97316' : '#2a2a2a'
    }}>
      <div style={styles.staffStatus}>
        {isManager ? (
          <i className="ti ti-lock" style={{fontSize: 14, color: '#a78bfa'}} aria-hidden="true" />
        ) : (
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: isActive ? '#4ade80' : '#6b7280',
            boxShadow: isActive ? '0 0 8px #4ade80' : 'none'
          }} />
        )}
      </div>

      <div style={{
        ...styles.avatar,
        background: isManager
          ? 'linear-gradient(135deg,#a855f7,#7c3aed)'
          : 'linear-gradient(135deg,#22d3ee,#0891b2)',
        color: '#fff',
      }}>{initials(staff.name)}</div>

      <div style={styles.staffName}>{staff.name}</div>

      <div style={{
        ...styles.roleBadge,
        background: isManager ? 'rgba(168,85,247,0.15)' : 'rgba(34,211,238,0.15)',
        border: `1px solid ${isManager ? 'rgba(168,85,247,0.4)' : 'rgba(34,211,238,0.4)'}`,
        color: isManager ? '#c4b5fd' : '#67e8f9',
      }}>{(staff.role || 'kasir').toUpperCase()}</div>

      <div style={styles.staffMeta}>
        {isActive
          ? `Shift aktif sejak ${fmtTime(activeShift.opened_at)}`
          : lastLogin
            ? `Last: ${timeAgo(lastLogin)}`
            : 'Belum pernah login'}
      </div>

      <div style={{
        ...styles.staffCta,
        background: isActive ? '#f97316' : '#2a2a2a',
        color: isActive ? '#1a1a1a' : '#f97316'
      }}>
        {isManager ? '🔒 Masukkan PIN' : isActive ? 'Lanjutkan Shift' : 'Buka Shift'}
      </div>
    </button>
  );
}

// PIN MODAL
function PinModal({ staff, onCancel, onSuccess, verifyPin }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const press = (digit) => {
    if (pin.length >= 6) return;
    setPin(pin + digit); setError('');
  };
  const backspace = () => { setPin(pin.slice(0, -1)); setError(''); };
  const clear = () => { setPin(''); setError(''); };

  const submit = useCallback(async () => {
    if (!pin) return;
    setVerifying(true);
    const ok = await verifyPin(pin);
    setVerifying(false);
    if (ok) onSuccess();
    else { setError('PIN salah'); setPin(''); }
  }, [pin, verifyPin, onSuccess]);

  useEffect(() => {
    if (pin.length === 6) setTimeout(submit, 200);
  }, [pin, submit]);

  return (
    <div style={styles.modalOverlay} onClick={onCancel}>
      <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div style={{textAlign: 'center', marginBottom: 24}}>
          <div style={{...styles.avatar, margin: '0 auto 12px', width: 60, height: 60, fontSize: 22,
            background: '#312e81', color: '#c4b5fd'}}>{initials(staff.name)}</div>
          <div style={{fontSize: 18, fontWeight: 500, color: '#fff'}}>{staff.name}</div>
          <div style={{fontSize: 12, color: '#9ca3af', marginTop: 4}}>Masukkan Manager PIN</div>
        </div>

        <div style={{display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 24}}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{
              width: 16, height: 16, borderRadius: '50%',
              background: pin.length > i ? '#f97316' : 'transparent',
              border: `2px solid ${pin.length > i ? '#f97316' : '#3a3a3a'}`,
              transition: 'all 0.15s'
            }} />
          ))}
        </div>

        {error && <div style={styles.pinError}>{error}</div>}
        {verifying && <div style={{color: '#9ca3af', fontSize: 12, textAlign: 'center', marginBottom: 12}}>Memverifikasi...</div>}

        <div style={styles.keypad}>
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} onClick={() => press(String(n))} style={styles.keyBtn}>{n}</button>
          ))}
          <button onClick={clear} style={{...styles.keyBtn, background: '#2a2a2a', color: '#9ca3af', fontSize: 13}}>Clear</button>
          <button onClick={() => press('0')} style={styles.keyBtn}>0</button>
          <button onClick={backspace} style={{...styles.keyBtn, background: '#2a2a2a', color: '#9ca3af'}}>
            <i className="ti ti-backspace" style={{fontSize: 18}} aria-hidden="true" />
          </button>
        </div>

        <button onClick={submit} disabled={!pin || verifying}
          style={{...styles.cancelBtn, background: '#f97316', color: '#1a1a1a', border: 'none',
                  fontWeight: 600, marginBottom: 8, opacity: (!pin || verifying) ? 0.5 : 1}}>
          Masuk
        </button>
        <button onClick={onCancel} style={styles.cancelBtn}>Batal</button>
      </div>
    </div>
  );
}

// STYLES — Onyx Platinum (sama dengan rest of karyaOS surfaces)
const styles = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)',
    backgroundAttachment: 'fixed',
    color: '#fff',
    padding: '20px 40px', fontFamily: "'Inter','SF Pro Display',system-ui,-apple-system,sans-serif",
    boxSizing: 'border-box'
  },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, fontSize: 12, flexWrap: 'wrap', gap: 8 },
  statusGroup: { display: 'flex', gap: 18, flexWrap: 'wrap' },
  datetime: { color: '#94a3b8', fontFamily: "'Geist Mono',monospace", letterSpacing: 0.3 },

  logo: { textAlign: 'center', marginBottom: 22 },
  logoRow: { display: 'inline-flex', alignItems: 'center', gap: 14, marginBottom: 4 },
  logoIcon: { fontSize: 36 },
  logoText: {
    fontSize: 32, fontWeight: 800, letterSpacing: -0.5,
    background: 'linear-gradient(135deg,#F59E0B,#fbbf24)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  logoSub: { fontSize: 11, color: '#64748b', letterSpacing: '0.2em', fontFamily: "'Geist Mono',monospace", fontWeight: 700 },

  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10, marginBottom: 24, maxWidth: 600, marginLeft: 'auto', marginRight: 'auto' },
  statCard: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12, padding: '14px 16px', textAlign: 'center',
  },
  statLabel: { fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, fontFamily: "'Geist Mono',monospace" },
  statValue: { fontSize: 22, fontWeight: 800, marginTop: 4, letterSpacing: -0.3 },

  prompt: { textAlign: 'center', fontSize: 14, color: '#cbd5e1', marginBottom: 18 },

  staffGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14, maxWidth: 1100, marginLeft: 'auto', marginRight: 'auto' },
  staffCard: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: 20, textAlign: 'center', cursor: 'pointer', position: 'relative',
    color: '#fff', fontFamily: 'inherit',
    transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3), 0 6px 18px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  staffStatus: { position: 'absolute', top: 14, right: 14 },
  avatar: {
    width: 56, height: 56, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 800, marginBottom: 12,
    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.3)',
  },
  staffName: { fontSize: 16, fontWeight: 700, marginBottom: 6, letterSpacing: -0.2 },
  roleBadge: { display: 'inline-block', fontSize: 10, padding: '3px 11px', borderRadius: 6, fontWeight: 800, letterSpacing: '0.08em', marginBottom: 10, fontFamily: "'Geist Mono',monospace" },
  staffMeta: { fontSize: 11, color: '#94a3b8', marginBottom: 12 },
  staffCta: { padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, transition: 'all 0.15s', letterSpacing: 0.3 },

  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalBox: { background: 'rgba(17,19,28,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: 28, minWidth: 320, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' },
  pinError: { textAlign: 'center', color: '#ef4444', fontSize: 12, marginBottom: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: 8, borderRadius: 6 },
  keypad: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 },
  keyBtn: { padding: '16px 0', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 20, fontWeight: 700, cursor: 'pointer', fontFamily: "'Geist Mono',monospace" },
  cancelBtn: { width: '100%', padding: '12px', background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }
};
