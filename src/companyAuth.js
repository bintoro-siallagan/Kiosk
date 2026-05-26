// src/companyAuth.js
// Multi-tenant: simpan company context di localStorage + auto-inject ke semua fetch().
// Cinema owner login → semua request auto-tag x-company-id: 2 → backend filter ke data cinema saja.
// Karys super-admin (company_id=null) → header x-super-admin: true → akses semua.

const STORAGE_KEY = "karya_company_ctx";

// Read current company context
export function getCompanyCtx() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Save after login
export function setCompanyCtx(ctx) {
  try {
    if (!ctx) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {}
}

export function clearCompanyCtx() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function isSuperAdmin() {
  const c = getCompanyCtx();
  return !!(c?.is_super_admin || c?.company_id == null);
}

export function getCompanyId() {
  const c = getCompanyCtx();
  return c?.company_id ?? null;
}

export function getCompany() {
  const c = getCompanyCtx();
  return c?.company || null;
}

// URL override untuk super-admin: ?company=CMX → switch ke company tertentu
export function getActiveCompanyId() {
  try {
    const param = new URLSearchParams(window.location.search).get("company");
    if (param && isSuperAdmin()) {
      // super-admin can override via URL; resolve from localStorage cache or fetch lazily
      return param.toUpperCase();
    }
  } catch {}
  return getCompanyId();
}

// Monkey-patch fetch — auto inject headers untuk semua request same-origin.
// Dipanggil sekali di main.jsx setelah load.
let _patched = false;
export function installFetchInterceptor() {
  if (_patched || typeof window === "undefined") return;
  _patched = true;
  const _fetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    try {
      // Hanya inject untuk same-origin atau relative paths
      const url = typeof input === "string" ? input : input?.url || "";
      const isExternal = /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
      if (!isExternal) {
        const ctx = getCompanyCtx();
        if (ctx) {
          const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
          // Super-admin URL override (?company=CMX) — kalau ada, set company_id ke override
          let cid = ctx.company_id;
          try {
            const param = new URLSearchParams(window.location.search).get("company");
            if (param && ctx.is_super_admin) {
              // For URL override, kita kirim code; backend bisa lookup.
              // Untuk safety, super-admin tetep akses all kecuali switch eksplisit.
              headers.set("x-company-code-override", param.toUpperCase());
            }
          } catch {}
          if (cid != null) headers.set("x-company-id", String(cid));
          if (ctx.is_super_admin) headers.set("x-super-admin", "true");
          if (ctx.token) headers.set("authorization", `Bearer ${ctx.token}`);
          init = { ...init, headers };
        }
      }
    } catch {}
    return _fetch(input, init);
  };
}
