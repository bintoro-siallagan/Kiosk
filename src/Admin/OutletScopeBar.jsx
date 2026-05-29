// src/Admin/OutletScopeBar.jsx
//
// Sticky outlet scope picker — selalu terlihat di top admin.
// Pill di-style hangat (bukan corporate). Klik → dropdown popover.

import React, { useState, useRef, useEffect } from 'react';
import { useOutletScope } from './OutletScopeContext';

const VERTICAL_OPTS = [
  { k: 'all',    label: '🌐 Semua',  color: '#94a3b8' },
  { k: 'cinema', label: '🎬 Cinema', color: '#a855f7' },
  { k: 'fnb',    label: '🍽️ F&B',    color: '#F59E0B' },
  { k: 'hybrid', label: '🍽️🎬 Hybrid', color: '#22D3EE' },
];

export default function OutletScopeBar() {
  const { outletCodes, selectedOutlets, vertical, filteredOutlets, currentOutlet, setOutletCodes, toggleOutletCode, setVertical, reset, loading } = useOutletScope();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close on click outside / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const vOpt = VERTICAL_OPTS.find(v => v.k === vertical) || VERTICAL_OPTS[0];
  const hasFilter = outletCodes.length > 0 || vertical !== 'all';

  // Label outlet di pill: 0 = "Semua outlet", 1 = nama outlet, 2+ = "X outlet"
  const outletPillLabel = (() => {
    if (outletCodes.length === 0) return { dim: true, text: '📍 Semua outlet' };
    if (outletCodes.length === 1) {
      const o = selectedOutlets[0];
      if (!o) return { dim: false, text: `📍 ${outletCodes[0]}` };
      return { dim: false, text: `📍 ${o.area || o.name?.replace('Karya Cinema ', '')}`, code: o.code };
    }
    return { dim: false, text: `📍 ${outletCodes.length} outlet dipilih`, multi: true };
  })();

  return (
    <div ref={wrapRef} style={S.wrap}>
      <button onClick={() => setOpen(o => !o)} style={S.pill(hasFilter)}>
        <span style={S.pillEyebrow}>SCOPE</span>
        <span style={S.pillSep}>·</span>
        <span style={{ ...S.pillVertical, color: vOpt.color, borderColor: vOpt.color + '55' }}>{vOpt.label}</span>
        <span style={S.pillSep}>·</span>
        <span style={outletPillLabel.dim ? S.pillOutletDim : S.pillOutlet}>
          {outletPillLabel.text}
          {outletPillLabel.code && <span style={S.pillCode}>{outletPillLabel.code}</span>}
        </span>
        <span style={S.pillCaret}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div style={S.dropdown}>
          <div style={S.dropHead}>
            <div>
              <div style={S.dropEyebrow}>RUANG LIHAT</div>
              <div style={S.dropTitle}>Pilih scope data</div>
            </div>
            {hasFilter && (
              <button onClick={() => { reset(); setOpen(false); }} style={S.resetBtn}>
                ↺ Reset semua
              </button>
            )}
          </div>

          <div style={S.section}>
            <div style={S.sectionLabel}>🎯 Vertikal</div>
            <div style={S.chipRow}>
              {VERTICAL_OPTS.map(v => (
                <button key={v.k} onClick={() => { setVertical(v.k); if (v.k !== 'all') setOutletCodes([]); }}
                  style={S.chip(vertical === v.k, v.color)}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div style={S.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={S.sectionLabel}>📍 Outlet ({filteredOutlets.length}) — pilih 1 atau lebih</div>
              {outletCodes.length > 0 && (
                <button onClick={() => setOutletCodes([])} style={S.clearBtn}>
                  Bersihkan ({outletCodes.length})
                </button>
              )}
            </div>
            <div style={S.outletList}>
              <button onClick={() => { setOutletCodes([]); }}
                style={S.outletRow(outletCodes.length === 0)}>
                <span style={{ fontSize: 18 }}>🌐</span>
                <div style={{ flex: 1 }}>
                  <div style={S.outletName}>Semua outlet</div>
                  <div style={S.outletMeta}>Aggregate sesuai vertikal di atas</div>
                </div>
                {outletCodes.length === 0 && <span style={S.checkmark}>✓</span>}
              </button>
              {loading && (
                <div style={S.loadingRow}>Sebentar ya, kami siapkan daftar outlet...</div>
              )}
              {!loading && filteredOutlets.length === 0 && (
                <div style={S.emptyRow}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>🌱</div>
                  Belum ada outlet untuk vertikal ini.
                </div>
              )}
              {filteredOutlets.map(o => {
                const selected = outletCodes.includes(o.code);
                return (
                  <button key={o.code} onClick={() => toggleOutletCode(o.code)}
                    style={S.outletRow(selected)}>
                    <span style={{ fontSize: 16, width: 22, display: 'inline-flex', justifyContent: 'center' }}>
                      {selected ? '☑' : '☐'}
                    </span>
                    <span style={{ fontSize: 18 }}>
                      {o.vertical === 'cinema' ? '🎬' : o.vertical === 'hybrid' ? '🍽️🎬' : '🍽️'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.outletName}>{o.area || o.name?.replace('Karya Cinema ', '')}</div>
                      <div style={S.outletMeta}>
                        <span style={S.outletCode}>{o.code}</span>
                        {o.name && o.area && o.name !== o.area && <span> · {o.name.replace('Karya Cinema ', '')}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={S.dropFoot}>
            💡 Semua dashboard + modul akan filter sesuai scope ini.
            Setting bertahan saat refresh halaman.
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { position: 'relative', display: 'inline-block' },
  pill: (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '8px 14px',
    background: active ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.10)'}`,
    borderRadius: 10,
    color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.18s ease',
  }),
  pillEyebrow: { fontSize: 9, color: '#64748b', letterSpacing: 1.5, fontWeight: 800, fontFamily: "'Geist Mono', monospace" },
  pillSep: { color: '#475569' },
  pillVertical: { fontSize: 12, padding: '2px 8px', border: '1px solid', borderRadius: 6, fontWeight: 700, letterSpacing: 0.2 },
  pillOutlet: { color: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: 6 },
  pillOutletDim: { color: '#94a3b8' },
  pillCode: { fontSize: 10, color: '#64748b', fontFamily: "'Geist Mono', monospace", marginLeft: 4 },
  pillCaret: { color: '#64748b', fontSize: 10, marginLeft: 4 },

  dropdown: {
    position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 9999,
    width: 380, maxHeight: 540, overflow: 'auto',
    background: '#0d1117', border: '1px solid #21262d', borderRadius: 14,
    boxShadow: '0 18px 60px rgba(0,0,0,0.6)',
    fontFamily: 'inherit',
  },
  dropHead: {
    padding: '14px 18px',
    borderBottom: '1px solid #161b22',
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
  },
  dropEyebrow: { fontSize: 10, color: '#a855f7', letterSpacing: 1.5, fontWeight: 800, fontFamily: "'Geist Mono', monospace", marginBottom: 4 },
  dropTitle: { fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: -0.2 },
  resetBtn: {
    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.30)',
    borderRadius: 8, padding: '6px 10px', color: '#fbbf24',
    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  section: { padding: '12px 18px', borderBottom: '1px solid #161b22' },
  sectionLabel: { fontSize: 10, color: '#64748b', letterSpacing: 1.2, fontWeight: 700, marginBottom: 8, fontFamily: "'Geist Mono', monospace" },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: (active, color) => ({
    background: active ? `${color}22` : 'rgba(255,255,255,0.03)',
    border: `1px solid ${active ? color + '66' : '#21262d'}`,
    borderRadius: 999, padding: '6px 12px',
    color: active ? color : '#94a3b8',
    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  }),
  outletList: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' },
  outletRow: (active) => ({
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px', borderRadius: 8,
    background: active ? 'rgba(16,185,129,0.10)' : 'transparent',
    border: `1px solid ${active ? 'rgba(16,185,129,0.30)' : 'transparent'}`,
    cursor: 'pointer', color: '#fff', textAlign: 'left',
    fontFamily: 'inherit', width: '100%',
    transition: 'all 0.14s ease',
  }),
  outletName: { fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 },
  outletMeta: { fontSize: 10, color: '#94a3b8' },
  outletCode: { color: '#64748b', fontFamily: "'Geist Mono', monospace" },
  checkmark: { color: '#10B981', fontSize: 16, fontWeight: 700 },
  loadingRow: { padding: 16, color: '#94a3b8', fontStyle: 'italic', fontSize: 12, textAlign: 'center' },
  emptyRow: { padding: 20, color: '#94a3b8', fontSize: 12, textAlign: 'center' },
  dropFoot: { padding: '12px 18px', fontSize: 11, color: '#64748b', fontStyle: 'italic', borderTop: '1px solid #161b22', lineHeight: 1.5 },
  clearBtn: {
    background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)',
    borderRadius: 6, padding: '4px 10px', color: '#fbbf24',
    fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 0.3,
  },
};
