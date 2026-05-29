// src/Admin/OutletScopeContext.jsx
//
// Global Outlet Scope — context yg dipakai semua modul admin utk filter
// data per outlet / vertikal. Bintoro:
//
//   "biar orang HQ gak menangis kapten"
//   "jadi semua modul harus bisa dilihat by outlet selected, jadi
//    memundahkan kapten gak nyampur"
//   "diteriakin nanti karyaos bisa menagis tersedu sedu dia"
//
// Filosofi: scope itu sakral. Tenant gak tercampur. Modul gak tercampur.
// Saat owner pilih outlet/vertikal di OutletScopeBar, SEMUA dashboard +
// modul yg consume context ini auto-refetch.
//
// Persistence: localStorage. Selection bertahan saat refresh halaman.
//
// Cara pakai:
//
//   import { useOutletScope } from './OutletScopeContext';
//   const { outletCode, vertical, asQueryString } = useOutletScope();
//   fetch(`/api/cashier-kpi${asQueryString()}`)
//
// Atau langsung pakai utility builder:
//
//   const url = `/api/foo?${buildScopeQuery(scope)}`

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import API_HOST from '../apiBase.js';

const LS_OUTLETS  = 'karyaos:scope:outlets'; // array (multi-select)
const LS_VERTICAL = 'karyaos:scope:vertical';
// Backwards compat: old single key
const LS_OUTLET_OLD = 'karyaos:scope:outlet';

const OutletScopeContext = createContext(null);

export function OutletScopeProvider({ children }) {
  // outletCodes — ARRAY. Empty = "semua outlet sesuai vertikal".
  // 1 item = single outlet drill-down. 2+ = subset.
  const [outletCodes, setOutletCodesRaw] = useState(() => {
    try {
      // Migrate legacy single-outlet localStorage
      const oldSingle = localStorage.getItem(LS_OUTLET_OLD);
      if (oldSingle) {
        localStorage.removeItem(LS_OUTLET_OLD);
        const arr = [oldSingle];
        localStorage.setItem(LS_OUTLETS, JSON.stringify(arr));
        return arr;
      }
      const raw = localStorage.getItem(LS_OUTLETS);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {}
    return [];
  });
  const [vertical, setVerticalRaw] = useState(() => {
    try { return localStorage.getItem(LS_VERTICAL) || 'all'; } catch { return 'all'; }
  });

  // Daftar outlets utk pemilihan — di-fetch sekali, cache.
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    const token = (() => { try { return localStorage.getItem('adminToken'); } catch { return null; } })();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${API_HOST}/api/outlet-master`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const list = Array.isArray(d) ? d : (d?.outlets || d?.data || []);
        setOutlets(list.filter(o => o.status !== 'closed'));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // Set keseluruhan array
  const setOutletCodes = useCallback((codes) => {
    const arr = Array.isArray(codes) ? codes.filter(Boolean) : [];
    setOutletCodesRaw(arr);
    try {
      if (arr.length) localStorage.setItem(LS_OUTLETS, JSON.stringify(arr));
      else localStorage.removeItem(LS_OUTLETS);
    } catch {}
  }, []);

  // Toggle satu outlet (add kalau belum, remove kalau sudah)
  const toggleOutletCode = useCallback((code) => {
    setOutletCodesRaw(prev => {
      const exists = prev.includes(code);
      const next = exists ? prev.filter(c => c !== code) : [...prev, code];
      try {
        if (next.length) localStorage.setItem(LS_OUTLETS, JSON.stringify(next));
        else localStorage.removeItem(LS_OUTLETS);
      } catch {}
      return next;
    });
  }, []);

  // Backwards compat — single setter, akan replace seluruh array
  const setOutletCode = useCallback((code) => {
    setOutletCodes(code ? [code] : []);
  }, [setOutletCodes]);

  const setVertical = useCallback((v) => {
    const safe = ['all','cinema','fnb','hybrid'].includes(v) ? v : 'all';
    setVerticalRaw(safe);
    try { localStorage.setItem(LS_VERTICAL, safe); } catch {}
  }, []);

  const reset = useCallback(() => {
    setOutletCodes([]);
    setVertical('all');
  }, [setOutletCodes, setVertical]);

  // Outlets terfilter sesuai vertikal — utk dropdown picker.
  const filteredOutlets = useMemo(() => {
    if (vertical === 'all') return outlets;
    return outlets.filter(o =>
      o.vertical === vertical
      || (vertical === 'cinema' && o.vertical === 'hybrid')
      || (vertical === 'fnb' && o.vertical === 'hybrid')
    );
  }, [outlets, vertical]);

  // Outlets terpilih (object) — utk display name
  const selectedOutlets = useMemo(() => {
    if (!outletCodes.length) return [];
    return outlets.filter(o => outletCodes.includes(o.code));
  }, [outletCodes, outlets]);

  // Backwards compat — single outlet (kalau cuma 1 dipilih)
  const outletCode = outletCodes.length === 1 ? outletCodes[0] : null;
  const currentOutlet = outletCodes.length === 1 ? selectedOutlets[0] || null : null;

  // Helper: build query string utk pass scope ke endpoint
  // - 1 outlet → ?outlet=KCN-001
  // - Multi outlet → ?outlets=KCN-001,KCN-002
  // - 0 outlet + vertical → ?vertical=cinema
  const asQueryString = useCallback(() => {
    const parts = [];
    if (outletCodes.length === 1) {
      parts.push(`outlet=${encodeURIComponent(outletCodes[0])}`);
    } else if (outletCodes.length > 1) {
      parts.push(`outlets=${outletCodes.map(c => encodeURIComponent(c)).join(',')}`);
    }
    if (vertical && vertical !== 'all') parts.push(`vertical=${vertical}`);
    return parts.length ? '?' + parts.join('&') : '';
  }, [outletCodes, vertical]);

  const value = {
    // Multi-select API
    outletCodes, selectedOutlets,
    setOutletCodes, toggleOutletCode,
    // Backwards compat (single)
    outletCode, currentOutlet, setOutletCode,
    // Vertical + shared
    vertical, outlets, filteredOutlets, loading,
    setVertical, reset, asQueryString, reload,
  };

  return (
    <OutletScopeContext.Provider value={value}>{children}</OutletScopeContext.Provider>
  );
}

export function useOutletScope() {
  const ctx = useContext(OutletScopeContext);
  if (!ctx) {
    return {
      outletCodes: [], selectedOutlets: [],
      outletCode: null, currentOutlet: null,
      vertical: 'all', outlets: [], filteredOutlets: [], loading: false,
      setOutletCodes: () => {}, toggleOutletCode: () => {},
      setOutletCode: () => {}, setVertical: () => {}, reset: () => {},
      asQueryString: () => '', reload: () => {},
    };
  }
  return ctx;
}

// Untuk komponen yg butuh re-fetch saat scope berubah — stable key
export function useScopeKey() {
  const { outletCodes, vertical } = useOutletScope();
  return `${vertical || 'all'}::${outletCodes.length ? outletCodes.join(',') : 'all'}`;
}
