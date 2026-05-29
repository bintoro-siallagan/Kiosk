// src/Admin/ChangePasswordModal.jsx
//
// Modal ganti password sendiri — admin/owner pakai utk update password
// tanpa harus reset via SSH/email.
//
// Filosofi karyaOS: keamanan sambil tetap hangat. Bahasa "ganti password"
// bukan "change credentials". Error pesan empati.

import React, { useState, useRef, useEffect } from 'react';
import API_HOST from '../apiBase.js';

export default function ChangePasswordModal({ onClose, onSuccess }) {
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const strength = (() => {
    if (newPwd.length === 0) return null;
    let score = 0;
    if (newPwd.length >= 8) score++;
    if (newPwd.length >= 12) score++;
    if (/[A-Z]/.test(newPwd)) score++;
    if (/[a-z]/.test(newPwd)) score++;
    if (/[0-9]/.test(newPwd)) score++;
    if (/[^A-Za-z0-9]/.test(newPwd)) score++;
    const labels = ['lemah', 'lumayan', 'lumayan', 'bagus', 'bagus', 'kuat', 'kuat'];
    const colors = ['#F87171', '#F59E0B', '#F59E0B', '#FBBF24', '#FBBF24', '#10B981', '#10B981'];
    return { score, label: labels[score], color: colors[score], pct: Math.min(100, (score / 6) * 100) };
  })();

  const submit = async (e) => {
    e?.preventDefault?.();
    setErr('');
    if (!currentPwd) return setErr('Masukkan password lama Anda dulu ya');
    if (!newPwd) return setErr('Password baru wajib diisi');
    if (newPwd.length < 8) return setErr('Password baru minimal 8 karakter');
    if (newPwd === currentPwd) return setErr('Password baru harus beda dari yang lama');
    if (newPwd !== confirmPwd) return setErr('Konfirmasi password belum sama');

    setBusy(true);
    try {
      const token = localStorage.getItem('adminToken');
      const r = await fetch(`${API_HOST}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ current_password: currentPwd, new_password: newPwd }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || 'Belum berhasil — coba lagi ya');
      setDone(true);
      setTimeout(() => {
        onSuccess?.();
        onClose?.();
      }, 1800);
    } catch (e) {
      setErr(e.message || 'Hmm, sebentar ya — coba sekali lagi');
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div style={S.overlay} onClick={onClose}>
        <div style={S.box} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: 30 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🌱</div>
            <div style={S.title}>Password tersimpan dengan hati</div>
            <div style={{ ...S.sub, marginTop: 8 }}>
              Password baru sudah aktif. Pakai password ini untuk login berikutnya.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <div>
            <div style={S.eyebrow}>🔐 KEAMANAN AKUN</div>
            <h2 style={S.title}>Ganti Password</h2>
            <p style={S.sub}>Sebentar saja, pilih password baru Anda.</p>
          </div>
          <button onClick={onClose} style={S.closeBtn} title="Tutup">✕</button>
        </div>

        <form onSubmit={submit}>
          <div style={S.field}>
            <label style={S.label}>🔒 PASSWORD LAMA</label>
            <div style={S.inputWrap}>
              <input ref={inputRef} type={showCurrent ? 'text' : 'password'} value={currentPwd}
                onChange={e => setCurrentPwd(e.target.value)} disabled={busy}
                placeholder="Password yang Anda pakai sekarang"
                style={S.input} autoComplete="current-password" />
              <button type="button" onClick={() => setShowCurrent(s => !s)} style={S.eyeBtn} tabIndex={-1}>
                {showCurrent ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <div style={S.field}>
            <label style={S.label}>🌱 PASSWORD BARU</label>
            <div style={S.inputWrap}>
              <input type={showNew ? 'text' : 'password'} value={newPwd}
                onChange={e => setNewPwd(e.target.value)} disabled={busy}
                placeholder="Minimal 8 karakter"
                style={S.input} autoComplete="new-password" />
              <button type="button" onClick={() => setShowNew(s => !s)} style={S.eyeBtn} tabIndex={-1}>
                {showNew ? '🙈' : '👁️'}
              </button>
            </div>
            {strength && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                  <span>Kekuatan</span>
                  <span style={{ color: strength.color, fontWeight: 700 }}>{strength.label}</span>
                </div>
                <div style={{ height: 4, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: `${strength.pct}%`, height: '100%',
                    background: strength.color,
                    transition: 'all 0.25s ease',
                  }} />
                </div>
              </div>
            )}
            <div style={S.hint}>
              💡 Lebih kuat: gabungan huruf besar, kecil, angka, simbol. Lebih panjang = lebih aman.
            </div>
          </div>

          <div style={S.field}>
            <label style={S.label}>✅ KONFIRMASI PASSWORD BARU</label>
            <input type={showNew ? 'text' : 'password'} value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)} disabled={busy}
              placeholder="Ulang password baru"
              style={S.input} autoComplete="new-password" />
            {confirmPwd && newPwd === confirmPwd && (
              <div style={{ fontSize: 11, color: '#10B981', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>✓</span> Sama dengan yang di atas
              </div>
            )}
            {confirmPwd && newPwd !== confirmPwd && (
              <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 6 }}>
                Belum sama — cek ulang ya
              </div>
            )}
          </div>

          {err && (
            <div style={S.error}>
              🤔 {err}
            </div>
          )}

          <div style={S.actions}>
            <button type="button" onClick={onClose} disabled={busy} style={S.cancelBtn}>
              Nanti saja
            </button>
            <button type="submit" disabled={busy || !currentPwd || !newPwd || newPwd !== confirmPwd}
              style={S.saveBtn(!busy && currentPwd && newPwd && newPwd === confirmPwd)}>
              {busy ? '⏳ Menyimpan...' : '🌱 Simpan Password Baru'}
            </button>
          </div>

          <div style={S.footer}>
            🛡️ Password Anda di-encrypt scrypt. Kami sendiri tidak bisa baca yg sudah disimpan.
          </div>
        </form>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 99999,
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20, fontFamily: '"Geist", system-ui, sans-serif',
  },
  box: {
    width: 'min(460px, 100%)', maxHeight: '92vh', overflow: 'auto',
    background: 'linear-gradient(180deg, #0d1117 0%, #161b22 100%)',
    border: '1px solid #21262d', borderRadius: 18,
    padding: 28, color: '#fff',
    boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12 },
  eyebrow: { fontSize: 10, color: '#a855f7', letterSpacing: 2, fontFamily: "'Geist Mono', monospace", fontWeight: 800, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: '#94a3b8', margin: '4px 0 0', fontStyle: 'italic' },
  closeBtn: { background: 'rgba(255,255,255,0.06)', border: 'none', color: '#94a3b8', width: 32, height: 32, borderRadius: 8, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 11, color: '#94a3b8', letterSpacing: 1, fontWeight: 700, marginBottom: 8, fontFamily: "'Geist Mono', monospace" },
  inputWrap: { position: 'relative' },
  input: {
    width: '100%', padding: '12px 44px 12px 14px',
    background: 'rgba(0,0,0,0.4)', border: '1px solid #21262d', borderRadius: 10,
    color: '#fff', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
  },
  eyeBtn: { position: 'absolute', right: 8, top: 8, background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontSize: 14 },
  hint: { fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.5, fontStyle: 'italic' },
  error: {
    padding: '10px 14px', background: 'rgba(245,158,11,0.1)',
    border: '1px solid rgba(245,158,11,0.30)', borderRadius: 10,
    color: '#fbbf24', fontSize: 13, marginBottom: 14,
  },
  actions: { display: 'flex', gap: 10, marginTop: 22 },
  cancelBtn: {
    flex: 1, padding: 12, background: 'rgba(255,255,255,0.06)',
    border: '1px solid #21262d', borderRadius: 10, color: '#cbd5e1',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  saveBtn: (enabled) => ({
    flex: 2, padding: 12,
    background: enabled ? 'linear-gradient(180deg, #F59E0B 0%, #D97706 100%)' : 'rgba(255,255,255,0.08)',
    border: 'none', borderRadius: 10,
    color: enabled ? '#1a1006' : '#64748b',
    fontSize: 13, fontWeight: 800, cursor: enabled ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
    letterSpacing: 0.3, boxShadow: enabled ? '0 6px 18px rgba(245,158,11,0.30)' : 'none',
  }),
  footer: {
    marginTop: 16, fontSize: 11, color: '#64748b',
    textAlign: 'center', fontStyle: 'italic',
  },
};
