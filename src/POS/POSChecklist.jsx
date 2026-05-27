// src/POS/POSChecklist.jsx
// Daily checklist opening/closing store — BLOCKING.
// Kasir wajib ceklis semua item sebelum lanjut (mulai / tutup shift).
//
// Props:
//   type    — 'opening' | 'closing'
//   apiBase — HOST backend
//   cashier — { name }
//   onDone  — dipanggil setelah checklist sukses disubmit

import React, { useState, useEffect } from 'react';
import { LoadingState } from "../components/uiKit.jsx";

const COPY = {
  opening: { kicker: 'CHECKLIST BUKA TOKO', title: 'Sebelum Mulai Shift', cta: 'Mulai Shift →', accent: '#10b981' },
  closing: { kicker: 'CHECKLIST TUTUP TOKO', title: 'Sebelum Close Shift', cta: 'Lanjut Close Shift →', accent: '#f97316' },
};

const MOODS = [
  { v: 1, emoji: '😟', label: 'Lelah' },
  { v: 2, emoji: '😐', label: 'Biasa' },
  { v: 3, emoji: '🙂', label: 'Oke' },
  { v: 4, emoji: '😄', label: 'Senang' },
  { v: 5, emoji: '🤩', label: 'Semangat' },
];

export default function POSChecklist({ type = 'opening', apiBase = '', cashier, onDone }) {
  const [items, setItems] = useState([]);
  const [checked, setChecked] = useState({});
  const [notes, setNotes] = useState('');
  const [target, setTarget] = useState('');
  const [mood, setMood] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const c = COPY[type] || COPY.opening;

  useEffect(() => {
    setLoading(true);
    fetch(`${apiBase}/api/checklist/items?type=${type}`)
      .then(r => r.json())
      .then(rows => { setItems(Array.isArray(rows) ? rows : []); setLoading(false); })
      .catch(() => { setError('Checklist sedang dipersiapkan, mohon menunggu sebentar.'); setLoading(false); });
  }, [apiBase, type]);

  const doneCount = items.filter(i => checked[i.id]).length;
  const allChecked = items.length > 0 && doneCount === items.length;

  const submit = async () => {
    if (!allChecked) return;
    setSubmitting(true); setError('');
    try {
      const r = await fetch(`${apiBase}/api/checklist/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, staff_name: cashier?.name, checked: items.map(i => i.id), notes,
          target: type === 'opening' ? (Number(target) || 0) : undefined,
          mood: type === 'opening' ? (mood || undefined) : undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Gagal submit checklist'); setSubmitting(false); return; }
      onDone?.();
    } catch (e) { setError(e.message); setSubmitting(false); }
  };

  return (
    <div style={S.root}>
      <div style={S.box}>
        <div style={{ ...S.kicker, color: c.accent }}>✅ {c.kicker}</div>
        <h1 style={S.title}>{c.title}</h1>
        <div style={S.sub}>
          {cashier?.name ? `Kasir: ${cashier.name} · ` : ''}
          {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>

        {type === 'closing' && (
          <div style={S.cheerBox}>
            <div style={{ fontSize: 34 }}>👏</div>
            <div style={S.cheerText}>
              {cashier?.name ? `${cashier.name}, ` : ''}kamu udah kerja keras hari ini!
            </div>
            <div style={S.cheerSub}>Makasih ya 🙌 Istirahat yang cukup, sampai ketemu tomorrow!</div>
          </div>
        )}

        {loading ? (
          <LoadingState label="Memuat checklist…" />
        ) : items.length === 0 ? (
          <div style={S.muted}>No items yet checklist. Hubungi admin buat nambahin.</div>
        ) : (
          <div style={{ margin: '18px 0' }}>
            {items.map(i => (
              <label key={i.id} style={{ ...S.item, ...(checked[i.id] ? S.itemOn : {}) }}>
                <input type="checkbox" checked={!!checked[i.id]}
                  onChange={e => setChecked(p => ({ ...p, [i.id]: e.target.checked }))}
                  style={{ width: 22, height: 22, accentColor: c.accent, flexShrink: 0 }} />
                <span style={{ fontSize: 16 }}>{i.label}</span>
              </label>
            ))}
          </div>
        )}

        {type === 'opening' && (
          <div style={S.moodBox}>
            <div style={S.moodLabel}>😊 Moodmu today gimana?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {MOODS.map(m => (
                <button key={m.v} onClick={() => setMood(m.v)}
                  style={{ ...S.moodBtn, ...(mood === m.v ? S.moodBtnOn : {}) }}>
                  <div style={{ fontSize: 30 }}>{m.emoji}</div>
                  <div style={{ fontSize: 10, color: mood === m.v ? '#fff' : '#9ca3af', marginTop: 2 }}>{m.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {type === 'opening' && (
          <div style={S.targetBox}>
            <div style={S.targetLabel}>🎯 Target penjualan today</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#9ca3af', fontSize: 17 }}>Rp</span>
              <input type="number" value={target} onChange={e => setTarget(e.target.value)}
                placeholder="contoh: 3000000" style={S.targetInput} />
            </div>
            <div style={S.targetHint}>Jadi KPI tim today — actual vs target dipantau di dashboard.</div>
          </div>
        )}

        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Catatan (opsional) — mis. ada yang rusak / stok menipis"
          rows={2} style={S.notes} />

        {error && <div style={S.err}>{error}</div>}

        <button onClick={submit} disabled={!allChecked || submitting}
          style={{ ...S.cta, background: allChecked ? c.accent : '#374151', cursor: allChecked && !submitting ? 'pointer' : 'not-allowed' }}>
          {submitting ? 'Menyimpan…'
            : !allChecked ? `Ceklis semua dulu (${doneCount}/${items.length})`
            : c.cta}
        </button>
      </div>
    </div>
  );
}

const S = {
  root: { position: 'fixed', inset: 0, background: 'linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 10000, fontFamily: 'system-ui,-apple-system,sans-serif', padding: '24px 16px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  box: { background: "rgba(255,255,255,0.025)", borderRadius: 18, padding: '28px 30px', width: 'min(480px, 96vw)', border: '1px solid #2a2a2a', marginTop: 'max(20px, env(safe-area-inset-top))', marginBottom: 'max(40px, env(safe-area-inset-bottom))' },
  kicker: { fontSize: 12, fontWeight: 700, letterSpacing: 1.5 },
  title: { margin: '6px 0 2px', color: '#fff', fontSize: 24 },
  sub: { color: '#9ca3af', fontSize: 13 },
  muted: { color: '#6b7280', textAlign: 'center', padding: 24 },
  item: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: "rgba(255,255,255,0.025)", border: '1px solid #2a2a2a', marginBottom: 8, cursor: 'pointer', color: '#e5e7eb' },
  itemOn: { background: '#0f1f17', border: '1px solid #14532d' },
  notes: { width: '100%', boxSizing: 'border-box', background: "rgba(255,255,255,0.025)", border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginTop: 8 },
  targetBox: { background: '#1a1407', border: '1px solid #78350f', borderRadius: 10, padding: '12px 14px' },
  targetLabel: { fontSize: 13, fontWeight: 700, color: '#fbbf24', marginBottom: 6 },
  targetInput: { flex: 1, background: "rgba(255,255,255,0.025)", border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: 'inherit' },
  targetHint: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  moodBox: { background: "rgba(255,255,255,0.025)", border: '1px solid #2a2a2a', borderRadius: 10, padding: '12px 14px', marginBottom: 8 },
  moodLabel: { fontSize: 13, fontWeight: 700, color: '#e5e7eb', marginBottom: 8 },
  moodBtn: { flex: 1, background: "rgba(255,255,255,0.025)", border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 4px', cursor: 'pointer', fontFamily: 'inherit' },
  moodBtnOn: { background: '#1d4ed8', border: '1px solid #3b82f6' },
  cheerBox: { textAlign: 'center', background: 'linear-gradient(135deg,#1a1407,#1f1206)', border: '1px solid #78350f', borderRadius: 12, padding: '16px 18px', margin: '14px 0 4px' },
  cheerText: { fontSize: 17, fontWeight: 700, color: '#fbbf24', marginTop: 6 },
  cheerSub: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  err: { marginTop: 10, padding: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 6, fontSize: 13, textAlign: 'center' },
  cta: { width: '100%', marginTop: 14, padding: '15px', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700 },
};
