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

const LS_OUTLET   = 'karyaos:scope:outlet';
const LS_VERTICAL = 'karyaos:scope:vertical';

const OutletScopeContext = createContext(null);

export function OutletScopeProvider({ children }) {
  const [outletCode, setOutletCodeRaw] = useState(() => {
    try { return localStorage.getItem(LS_OUTLET) || null; } catch { return null; }
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

  const setOutletCode = useCallback((code) => {
    setOutletCodeRaw(code || null);
    try {
      if (code) localStorage.setItem(LS_OUTLET, code);
      else localStorage.removeItem(LS_OUTLET);
    } catch {}
  }, []);

  const setVertical = useCallback((v) => {
    const safe = ['all','cinema','fnb','hybrid'].includes(v) ? v : 'all';
    setVerticalRaw(safe);
    try { localStorage.setItem(LS_VERTICAL, safe); } catch {}
  }, []);

  const reset = useCallback(() => {
    setOutletCode(null);
    setVertical('all');
  }, [setOutletCode, setVertical]);

  // Outlets terfilter sesuai vertikal — utk dropdown picker.
  const filteredOutlets = useMemo(() => {
    if (vertical === 'all') return outlets;
    return outlets.filter(o =>
      o.vertical === vertical
      || (vertical === 'cinema' && o.vertical === 'hybrid')
      || (vertical === 'fnb' && o.vertical === 'hybrid')
    );
  }, [outlets, vertical]);

  const currentOutlet = useMemo(() => {
    if (!outletCode) return null;
    return outlets.find(o => o.code === outletCode) || null;
  }, [outletCode, outlets]);

  // Helper: build query string utk pass scope ke endpoint
  // contoh: ?outlet=KCN-001  atau  ?vertical=cinema  atau ?outlet=KCN-001&vertical=cinema
  const asQueryString = useCallback(() => {
    const parts = [];
    if (outletCode) parts.push(`outlet=${encodeURIComponent(outletCode)}`);
    if (vertical && vertical !== 'all') parts.push(`vertical=${vertical}`);
    return parts.length ? '?' + parts.join('&') : '';
  }, [outletCode, vertical]);

  const value = {
    outletCode, vertical, outlets, filteredOutlets, currentOutlet, loading,
    setOutletCode, setVertical, reset, asQueryString, reload,
  };

  return (
    <OutletScopeContext.Provider value={value}>{children}</OutletScopeContext.Provider>
  );
}

export function useOutletScope() {
  const ctx = useContext(OutletScopeContext);
  if (!ctx) {
    // Fallback safe — kalau dipake di luar provider, jangan crash
    return {
      outletCode: null, vertical: 'all',
      outlets: [], filteredOutlets: [], currentOutlet: null, loading: false,
      setOutletCode: () => {}, setVertical: () => {}, reset: () => {},
      asQueryString: () => '', reload: () => {},
    };
  }
  return ctx;
}

// Untuk komponen yg butuh re-fetch saat scope berubah —
// dependency yg stable: [outletCode, vertical]
export function useScopeKey() {
  const { outletCode, vertical } = useOutletScope();
  return `${vertical || 'all'}::${outletCode || 'all'}`;
}
