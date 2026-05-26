// client/src/components/ManagerPinGate.jsx
// Reusable manager PIN gate untuk semua destructive action.
//
// 2 cara pakai:
//
// === PATTERN A: Imperative (paling clean buat single action) ===
//   import { requireManagerPin } from './ManagerPinGate';
//
//   const handleCancel = async () => {
//     const auth = await requireManagerPin({
//       title: 'Batalkan Order #A406',
//       reason: 'Cancel order'
//     });
//     if (!auth.ok) return;
//     // ... do cancel, include auth.manager_id di audit log
//     await fetch('/api/orders/cancel', {
//       method: 'POST',
//       body: JSON.stringify({ order_id, cancelled_by: auth.manager_id })
//     });
//   };
//
// === PATTERN B: Component wrapper ===
//   <ManagerPinGate isOpen={showPin} onAuthorized={(m) => doAction(m)} onCancel={...} />
//
// Setup once di root App.jsx:
//   import { PinGateProvider } from './components/ManagerPinGate';
//   <PinGateProvider> <App /> </PinGateProvider>
//
// Fitur:
//   - 4-digit auto-submit
//   - 3x salah → lockout 30 detik (anti-bruteforce)
//   - Failed attempts logged ke pos_events (anti-fraud audit)
//   - Validate via /api/staff/verify-pin (kalau punya) atau /api/pos/config/MANAGER_PIN fallback
//   - Optional reason input untuk audit trail

import React, { useState, useEffect, useCallback, useRef } from 'react';
import API_HOST from "../apiBase.js";

// Project deploys to gh-pages with a separate backend — needs an absolute API base
let globalRequestFn = null;
const LOCKOUT_KEY = 'manager_pin_lockout_until';
const FAILED_ATTEMPTS_KEY = 'manager_pin_failed_attempts';

// ============================================================
// IMPERATIVE API
// ============================================================
export function requireManagerPin(options = {}) {
  if (!globalRequestFn) {
    console.warn('[ManagerPinGate] PinGateProvider not mounted. Wrap your root component with <PinGateProvider>.');
    return Promise.resolve({ ok: false, error: 'Provider not mounted' });
  }
  return globalRequestFn(options);
}

// ============================================================
// PROVIDER (wraps app root)
// ============================================================
export function PinGateProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  useEffect(() => {
    globalRequestFn = (opts) => {
      return new Promise(resolve => {
        resolverRef.current = resolve;
        setRequest(opts || {});
      });
    };
    return () => { globalRequestFn = null; };
  }, []);

  const handleResolve = useCallback((result) => {
    if (resolverRef.current) resolverRef.current(result);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  return (
    <>
      {children}
      {request && (
        <ManagerPinGate
          isOpen
          title={request.title}
          message={request.message}
          requireReason={request.requireReason}
          apiBase={request.apiBase || API_HOST}
          onAuthorized={(mgr, reason, pin) => handleResolve({ ok: true, manager_id: mgr.id, manager_name: mgr.name, reason, pin })}
          onCancel={() => handleResolve({ ok: false, cancelled: true })}
        />
      )}
    </>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ManagerPinGate({
  isOpen,
  title = 'Otorisasi Manager Diperlukan',
  message,
  requireReason = false,
  onAuthorized,
  onCancel,
  apiBase = ''
}) {
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState(() => {
    const v = localStorage.getItem(LOCKOUT_KEY);
    return v ? Number(v) : 0;
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (lockoutUntil > 0) {
      const t = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(t);
    }
  }, [lockoutUntil]);

  const isLockedOut = lockoutUntil > now;
  const lockoutSecondsLeft = Math.ceil((lockoutUntil - now) / 1000);

  const press = (d) => {
    if (isLockedOut || verifying) return;
    if (pin.length >= 6) return;
    setPin(pin + d);
    setError('');
  };
  const backspace = () => { if (!verifying) { setPin(pin.slice(0, -1)); setError(''); } };
  const clear = () => { if (!verifying) { setPin(''); setError(''); } };

  const submit = useCallback(async (currentPin) => {
    if (requireReason && !reason.trim()) {
      setError('Alasan wajib diisi');
      return;
    }
    setVerifying(true);

    let result = null;
    // Try staff verify-pin endpoint (preferred — supports multiple manager)
    try {
      const r = await fetch(`${apiBase}/api/staff/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: 'manager-1', pin: currentPin })
      });
      if (r.ok) {
        const data = await r.json();
        if (data.ok && data.staff?.role === 'manager') result = data.staff;
      }
    } catch {}

    // Fallback: legacy MANAGER_PIN config
    if (!result) {
      try {
        const r = await fetch(`${apiBase}/api/pos/config/MANAGER_PIN`);
        const cfg = await r.json();
        if (String(cfg.parsed_value) === String(currentPin)) {
          result = { id: 'manager-1', name: 'Manager', role: 'manager' };
        }
      } catch {}
    }

    setVerifying(false);

    if (result) {
      // Reset failed attempts on success
      localStorage.removeItem(FAILED_ATTEMPTS_KEY);
      onAuthorized?.(result, reason || null, currentPin);

      // Log success to pos_events for audit
      try {
        fetch(`${apiBase}/api/pos/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'manager_auth_success',
            payload: { action: title, reason },
            actor: result.id, severity: 'info'
          })
        }).catch(() => {});
      } catch {}
    } else {
      const attempts = Number(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '0') + 1;
      localStorage.setItem(FAILED_ATTEMPTS_KEY, String(attempts));

      // Log failed attempt
      try {
        fetch(`${apiBase}/api/pos/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'manager_auth_failed',
            event_subtype: 'wrong_pin',
            payload: { action: title, attempt_count: attempts },
            actor: 'unknown',
            severity: attempts >= 3 ? 'critical' : 'warning'
          })
        }).catch(() => {});
      } catch {}

      if (attempts >= 3) {
        const until = Date.now() + 30 * 1000;
        localStorage.setItem(LOCKOUT_KEY, String(until));
        setLockoutUntil(until);
        setError(`3x salah PIN. Locked out 30 detik.`);
        localStorage.removeItem(FAILED_ATTEMPTS_KEY);
      } else {
        setError(`PIN salah (${attempts}/3 attempts)`);
      }
      setPin('');
    }
  }, [apiBase, onAuthorized, reason, requireReason, title]);

  useEffect(() => {
    if (pin.length === 6 && !verifying && !isLockedOut) {
      const timer = setTimeout(() => submit(pin), 150);
      return () => clearTimeout(timer);
    }
  }, [pin, submit, verifying, isLockedOut]);

  useEffect(() => {
    if (lockoutUntil > 0 && now > lockoutUntil) {
      localStorage.removeItem(LOCKOUT_KEY);
      setLockoutUntil(0);
      setError('');
    }
  }, [now, lockoutUntil]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={() => !verifying && onCancel?.()}>
      <div style={styles.box} onClick={e => e.stopPropagation()}>
        <div style={{textAlign: 'center', marginBottom: 16}}>
          <div style={styles.lockIcon}>🔒</div>
          <div style={styles.title}>{title}</div>
          {message && <div style={styles.message}>{message}</div>}
        </div>

        {requireReason && (
          <div style={{marginBottom: 16}}>
            <div style={styles.fieldLabel}>Alasan <span style={{color: '#ef4444'}}>*</span></div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Tulis alasan yang spesifik..."
              rows={2}
              disabled={isLockedOut || verifying}
              style={styles.reasonInput}
            />
          </div>
        )}

        <div style={styles.fieldLabel}>Manager PIN</div>

        {/* PIN dots */}
        <div style={styles.dotsRow}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{
              ...styles.dot,
              background: pin.length > i ? '#f97316' : 'transparent',
              borderColor: pin.length > i ? '#f97316' : '#3a3a3a',
            }} />
          ))}
        </div>

        {isLockedOut && (
          <div style={styles.lockoutBanner}>
            🚫 Locked. Tunggu {lockoutSecondsLeft} detik
          </div>
        )}
        {error && !isLockedOut && <div style={styles.errorBox}>{error}</div>}
        {verifying && <div style={styles.verifying}>Memverifikasi...</div>}

        {/* Keypad */}
        <div style={styles.keypad}>
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} onClick={() => press(String(n))}
              disabled={isLockedOut || verifying}
              style={{...styles.keyBtn, opacity: (isLockedOut || verifying) ? 0.3 : 1}}>{n}</button>
          ))}
          <button onClick={clear} disabled={isLockedOut || verifying}
            style={{...styles.keyBtn, background: '#2a2a2a', color: '#9ca3af', fontSize: 13, opacity: (isLockedOut || verifying) ? 0.3 : 1}}>Clear</button>
          <button onClick={() => press('0')} disabled={isLockedOut || verifying}
            style={{...styles.keyBtn, opacity: (isLockedOut || verifying) ? 0.3 : 1}}>0</button>
          <button onClick={backspace} disabled={isLockedOut || verifying}
            style={{...styles.keyBtn, background: '#2a2a2a', color: '#9ca3af', opacity: (isLockedOut || verifying) ? 0.3 : 1}}>⌫</button>
        </div>

        <button onClick={onCancel} disabled={verifying} style={styles.cancelBtn}>
          Batal
        </button>
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  box: { background: '#1a1a1a', borderRadius: 16, padding: 28, minWidth: 340, maxWidth: '95vw', border: '1px solid #2a2a2a', color: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif' },
  lockIcon: { fontSize: 32, marginBottom: 8 },
  title: { fontSize: 16, fontWeight: 600, color: '#fff' },
  message: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  fieldLabel: { fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500, marginBottom: 8, textAlign: 'center' },
  reasonInput: { width: '100%', padding: 10, background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 6, color: '#fff', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  dotsRow: { display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 18 },
  dot: { width: 16, height: 16, borderRadius: '50%', border: '2px solid', transition: 'all 0.15s' },
  lockoutBanner: { textAlign: 'center', padding: 10, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, marginBottom: 12, fontSize: 13, fontWeight: 500 },
  errorBox: { textAlign: 'center', padding: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 4, marginBottom: 12, fontSize: 12 },
  verifying: { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginBottom: 12 },
  keypad: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 },
  keyBtn: { padding: '16px 0', background: '#2a2a2a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 20, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  cancelBtn: { width: '100%', padding: 12, background: 'transparent', color: '#9ca3af', border: '1px solid #3a3a3a', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }
};
