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
  const [hqStaff, setHqStaff] = useState([]); // HQ users (outlet_code null) — only available via HQ Override
  const [showHqOverride, setShowHqOverride] = useState(false);
  const [activeShifts, setActiveShifts] = useState({});
  const [system, setSystem] = useState({ network: 'checking', printer: 'unknown', last_sync: null });
  const [pinModal, setPinModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dayClosed, setDayClosed] = useState(false);
  const [dayOpenBusy, setDayOpenBusy] = useState(false);
  const [dayOpenErr, setDayOpenErr] = useState("");
  const [dayOpenPinModal, setDayOpenPinModal] = useState(false);

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
    for (const url of ['/api/staff', '/api/auth/users', '/api/users', '/api/pos/staff']) {
      try {
        const r = await fetch(`${apiBase}${url}`);
        if (r.ok) { list = await r.json(); break; }
      } catch {}
    }
    if (!Array.isArray(list) || list.length === 0) {
      list = [
        { id: 'manager-1', name: 'Manager', role: 'manager', last_login: Math.floor(Date.now()/1000) - 18*3600 },
        { id: 'kasir-1', name: 'Kasir 1', role: 'kasir', last_login: Math.floor(Date.now()/1000) - 30*60 },
        { id: 'kasir-2', name: 'Kasir 2', role: 'kasir', last_login: Math.floor(Date.now()/1000) - 3*3600 },
      ];
    }

    // Outlet scoping — strict mode dgn HQ Override.
    // Main grid: hanya user bound ke outlet ini.
    // HQ users (outlet_code null) tersedia via "🌐 HQ Login" button di bawah.
    const deviceOutlet = typeof localStorage !== "undefined"
      ? (localStorage.getItem("posOutletDevice") || localStorage.getItem("posOutlet") || "")
      : "";
    if (deviceOutlet) {
      const bound = list.filter(u => u.outlet_code === deviceOutlet);
      const hq    = list.filter(u => !u.outlet_code); // HQ access
      setHqStaff(hq);
      if (bound.length > 0) {
        // Strict mode: only bound users di main grid
        list = bound;
      }
      // Kalau gak ada bound user: fallback tampil semua (outlet baru belum di-setup)
    } else {
      setHqStaff([]);
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
  function handleOpenDay() {
    // Open Day butuh Manager PIN — biar kasir gak nyusahkan harus login admin
    // di subdomain lain. Modal akan munculkan keypad PIN.
    setDayOpenErr("");
    setDayOpenPinModal(true);
  }

  // Dipanggil PinModal setelah user input PIN
  async function verifyOpenDayPin(pin) {
    try {
      const r = await fetch(`${apiBase}/api/day/open-with-pin?vertical=fnb`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, by: "Manager", vertical: "fnb" }),
      });
      if (r.ok) return true;
      if (r.status === 401) return false; // PIN salah — PinModal kasih feedback sendiri
      let detail = ""; try { detail = (await r.json())?.error || ""; } catch {}
      setDayOpenErr(detail || `Gagal buka hari (HTTP ${r.status})`);
      return false;
    } catch (e) {
      setDayOpenErr(e.message || "Gagal buka hari");
      return false;
    }
  }

  function handleOpenDaySuccess() {
    setDayOpenPinModal(false);
    setDayClosed(false);
    setDayOpenErr("");
    setTimeout(() => checkDay(), 600);
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
          <img src="/logo.png" alt="KaryaOS" style={{ height: 54, width: 54, objectFit: "contain", display: 'block', flexShrink: 0 }} />
          <span style={styles.logoText}>KaryaOS POS</span>
        </div>
        <div style={styles.logoSub}>POINT OF SALE TERMINAL</div>
      </div>

      {/* KPI STATS */}
      <div style={styles.statsRow}>
        <StatCard label="Revenue today" value={fmtIDR(stats.revenue)} color="#f97316" />
        <StatCard label="Orders" value={stats.orders} color="#fff" />
        <StatCard label="Anomali" value={stats.anomalies} color={stats.anomalies > 0 ? '#fbbf24' : '#4ade80'} />
      </div>

      {dayClosed ? (
        <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'48px 24px', gap:22, minHeight:'52vh'}}>
          <div style={{fontSize:128, lineHeight:1, display:'block', margin:0, filter:'drop-shadow(0 8px 32px rgba(245,158,11,0.25))', opacity:0.92}}>🌙</div>
          <div style={{fontSize:36, fontWeight:900, color:'#f59e0b', letterSpacing:6, lineHeight:1.1, margin:0, textShadow:'0 2px 24px rgba(245,158,11,0.3)'}}>HARI DITUTUP</div>
          <div style={{fontSize:15, color:'#9ca3af', lineHeight:1.6, maxWidth:520, margin:0}}>Operasional today sudah ditutup Manager.<br/>Manager harus buka hari sebelum kasir bisa start day.</div>
          {dayOpenErr && (
            <div style={{maxWidth:480, padding:'12px 16px', background:'rgba(239,68,68,0.10)', border:'1px solid rgba(239,68,68,0.35)', borderRadius:10, color:'#fca5a5', fontSize:13, lineHeight:1.5}}>
              ⚠ {dayOpenErr}
            </div>
          )}
          <button onClick={handleOpenDay} style={{background: 'linear-gradient(135deg,#F59E0B,#fbbf24)', color:'#111', border:'none', borderRadius:14, padding:'18px 48px', fontSize:17, fontWeight:800, cursor: 'pointer', boxShadow: '0 12px 36px rgba(245,158,11,0.35)', letterSpacing:1, marginTop:10}}>
            ☀️ Open Day
          </button>
          <div style={{fontSize:11, color:'#5b6470', fontStyle:'italic', letterSpacing:0.5}}>Approval Manager PIN diperlukan</div>
        </div>
      ) : (
        <PinLogin
          apiBase={apiBase}
          deviceOutlet={typeof localStorage !== "undefined" ? (localStorage.getItem("posOutletDevice") || localStorage.getItem("posOutlet") || "") : ""}
          onLogin={(user) => handleSelectStaff(user)}
        />
      )}

      {pinModal && (
        <PinModal staff={pinModal.staff}
          onCancel={() => setPinModal(null)}
          onSuccess={() => { doLogin(pinModal.staff); setPinModal(null); }}
          verifyPin={verifyPin} />
      )}

      {dayOpenPinModal && (
        <PinModal staff={{ name: "Open Day · Manager Approval", role: "manager" }}
          onCancel={() => setDayOpenPinModal(false)}
          onSuccess={handleOpenDaySuccess}
          verifyPin={verifyOpenDayPin} />
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
        {isManager ? '🔒 Masukkan PIN' : isActive ? 'Continue Shift' : 'Open Shift'}
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
        <button onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
      </div>
    </div>
  );
}

// STYLES — Onyx Platinum (sama dengan rest of karyaOS surfaces)
const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex', flexDirection: 'column',
    background: 'linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)',
    backgroundAttachment: 'fixed',
    color: '#fff',
    padding: '20px 40px', fontFamily: "'Inter','SF Pro Display',system-ui,-apple-system,sans-serif",
    boxSizing: 'border-box'
  },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, fontSize: 12, flexWrap: 'wrap', gap: 8 },
  statusGroup: { display: 'flex', gap: 18, flexWrap: 'wrap' },
  datetime: { color: '#94a3b8', fontFamily: "'Geist Mono',monospace", letterSpacing: 0.3 },

  logo: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 22, gap: 6 },
  logoRow: { display: 'inline-flex', alignItems: 'center', gap: 14, lineHeight: 1 },
  logoIcon: { fontSize: 36, lineHeight: 1 },
  logoText: {
    fontSize: 32, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1,
    background: 'linear-gradient(135deg,#F59E0B,#fbbf24)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  logoSub: { fontSize: 11, color: '#64748b', letterSpacing: '0.2em', fontFamily: "'Geist Mono',monospace", fontWeight: 700, lineHeight: 1 },

  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24, width: '100%', maxWidth: 600, alignSelf: 'center' },
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

// ────────────────────────────────────────────────────────────────────
// PinLogin — keypad-only login. Kasir input PIN, sistem identify + bind ke device outlet.
// ────────────────────────────────────────────────────────────────────
function PinLogin({ apiBase, deviceOutlet, onLogin }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (overridePin) => {
    const tryPin = overridePin ?? pin;
    if (tryPin.length !== 6) { setErr("PIN harus 6 digit"); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: tryPin }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setErr(d?.error || "PIN salah");
        setPin("");
        setBusy(false);
        return;
      }
      const user = d.user || {};
      // Frontend-side outlet check — backend belum tahu device outlet
      if (deviceOutlet && user.outlet_code && user.outlet_code !== deviceOutlet) {
        setErr(`User ini terikat ke outlet ${user.outlet_code}, bukan ${deviceOutlet}`);
        setPin("");
        setBusy(false);
        return;
      }
      // Fase 5 — "Membangun dari 0". Catat first_login + needs_welcome
      // di localStorage supaya POSMenu/Cinema bisa show WelcomeRitual.
      try {
        if (d.needs_welcome) localStorage.setItem('karyaos:needsWelcome', '1');
        else localStorage.removeItem('karyaos:needsWelcome');
        if (d.is_first_login) localStorage.setItem('karyaos:isFirstLogin', '1');
      } catch {}
      // Pass — login berhasil, mapping ke shape user yg dipake handleSelectStaff
      onLogin({
        id: user.id, name: user.name, role: user.role,
        outlet_code: user.outlet_code, company_id: user.company_id,
        vertical: user.vertical, token: d.token,
        is_first_login: !!d.is_first_login,
        needs_welcome: !!d.needs_welcome,
      });
    } catch (e) {
      setErr(e.message || "Gagal login");
      setPin(""); setBusy(false);
    }
  };

  const append = (ch) => {
    if (pin.length >= 6 || busy) return;
    const newPin = pin + ch;
    setPin(newPin);
    setErr("");
    if (newPin.length === 6) {
      // Auto-submit saat 6 digit terakhir
      setTimeout(() => submit(newPin), 120);
    }
  };
  const back = () => { setPin(p => p.slice(0, -1)); setErr(""); };
  const clear = () => { setPin(""); setErr(""); };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "30px 20px 50px" }}>
      <div style={{
        fontSize: 12, color: "#94a3b8", letterSpacing: 3, fontFamily: "'Geist Mono',monospace",
        textTransform: "uppercase", fontWeight: 700,
      }}>● MASUKAN PIN KASIR</div>

      {/* PIN dots display */}
      <div style={{ display: "flex", gap: 14, marginBottom: 4 }}>
        {[0,1,2,3,4,5].map(i => {
          const filled = i < pin.length;
          return (
            <div key={i} style={{
              width: 18, height: 18, borderRadius: "50%",
              background: filled ? (err ? "#ef4444" : "#fff") : "transparent",
              border: `2px solid ${err ? "#ef4444" : filled ? "#fff" : "rgba(255,255,255,0.25)"}`,
              transition: "all 0.15s ease",
              boxShadow: filled && !err ? "0 0 12px rgba(255,255,255,0.4)" : "none",
            }} />
          );
        })}
      </div>

      {err && <div style={{ fontSize: 13, color: "#fca5a5", padding: "6px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, maxWidth: 360, textAlign: "center" }}>⚠ {err}</div>}

      {/* Numeric keypad */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 80px)", gap: 12,
        marginTop: 8,
      }}>
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => append(String(n))} disabled={busy} style={{
            width: 80, height: 80, borderRadius: 16,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff", fontSize: 28, fontWeight: 700, cursor: busy ? "wait" : "pointer",
            fontFamily: "'Geist Mono',monospace",
            transition: "all 0.1s ease",
          }}
            onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}>
            {n}
          </button>
        ))}
        <button onClick={clear} disabled={busy} style={{
          width: 80, height: 80, borderRadius: 16,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          color: "#fca5a5", fontSize: 12, fontWeight: 700, cursor: busy ? "wait" : "pointer",
          fontFamily: "'Geist Mono',monospace", letterSpacing: 1,
        }}>CLEAR</button>
        <button onClick={() => append("0")} disabled={busy} style={{
          width: 80, height: 80, borderRadius: 16,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#fff", fontSize: 28, fontWeight: 700, cursor: busy ? "wait" : "pointer",
          fontFamily: "'Geist Mono',monospace",
        }}>0</button>
        <button onClick={back} disabled={busy || pin.length === 0} style={{
          width: 80, height: 80, borderRadius: 16,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
          color: "#fbbf24", fontSize: 22, fontWeight: 700, cursor: busy ? "wait" : (pin.length === 0 ? "not-allowed" : "pointer"),
          fontFamily: "'Geist Mono',monospace",
          opacity: pin.length === 0 ? 0.4 : 1,
        }}>⌫</button>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: "#5b6470", textAlign: "center", lineHeight: 1.6, maxWidth: 360 }}>
        💡 Lupa PIN? Hubungi Manager / Admin untuk reset PIN dari panel admin.
      </div>
    </div>
  );
}
