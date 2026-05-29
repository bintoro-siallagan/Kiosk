// src/companyAuth.js
// Multi-tenant: simpan company context di localStorage + auto-inject ke semua fetch().
// Cinema owner login → semua request auto-tag x-company-id: 2 → backend filter ke data cinema saja.
// Karys super-admin (company_id=null) → header x-super-admin: true → akses semua.

const STORAGE_KEY = "karya_company_ctx";
const IMPERSONATE_BACKUP = "karya_company_original";  // backup ctx asli sebelum impersonate

// ── IMPERSONATION (super-admin drill-down) ───────────────────────────────
// Super-admin click 'Drill' di KaryasPlatformView → swap ctx ke target company.
// Original ctx disimpan di IMPERSONATE_BACKUP biar bisa di-restore.
export function startImpersonate(targetCompany) {
  try {
    const original = localStorage.getItem(STORAGE_KEY);
    if (!original) return false;
    const orig = JSON.parse(original);
    if (!(orig.is_super_admin || orig.company_id == null)) return false; // hanya super-admin
    // Backup original kalau belum ada
    if (!localStorage.getItem(IMPERSONATE_BACKUP)) {
      localStorage.setItem(IMPERSONATE_BACKUP, original);
    }
    // Set new ctx — preserve token, swap company info
    const impersonated = {
      ...orig,
      company_id: targetCompany.id,
      is_super_admin: false, // pretend regular user dari company target
      company: targetCompany,
      _impersonating: true,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(impersonated));
    return true;
  } catch { return false; }
}

export function stopImpersonate() {
  try {
    const backup = localStorage.getItem(IMPERSONATE_BACKUP);
    if (backup) {
      localStorage.setItem(STORAGE_KEY, backup);
      localStorage.removeItem(IMPERSONATE_BACKUP);
      return true;
    }
  } catch {}
  return false;
}

export function isImpersonating() {
  try {
    const ctx = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return !!ctx?._impersonating;
  } catch { return false; }
}

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

// Monkey-patch fetch — auto inject headers + safe json() on auth errors.
// Dipanggil sekali di main.jsx setelah load.
//
// Defensive: kalau response 401/403 (session expired / forbidden),
// override r.json() agar return null. Mencegah 497 unsafe fetch call
// di codebase crash dgn `Cannot convert undefined or null to object`
// karena consumer mereka pattern `r.json().then(d => d.something)`.
let _patched = false;
export function installFetchInterceptor() {
  if (_patched || typeof window === "undefined") return;
  _patched = true;
  const _fetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      // Hanya inject untuk same-origin atau relative paths
      const url = typeof input === "string" ? input : input?.url || "";
      const isExternal = /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
      if (!isExternal) {
        const ctx = getCompanyCtx();
        if (ctx) {
          const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
          let cid = ctx.company_id;
          try {
            const param = new URLSearchParams(window.location.search).get("company");
            if (param && ctx.is_super_admin) {
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

    const r = await _fetch(input, init);

    // Safe-json untuk 401/403 — banyak consumer di codebase pattern
    // `fetch().then(r => r.json()).then(d => d.something)` tanpa cek
    // r.ok. Kalau r.json() balikin { error: "Unauthorized" } → akses
    // d.something → undefined → crash. Override .json() utk return null
    // saat status auth-error.
    //
    // PENGECUALIAN: /api/auth/* — login flow butuh response body utk
    // tampilkan error message ke user ("PIN salah", "akun terkunci", dll).
    const url2 = typeof input === "string" ? input : input?.url || "";
    const isAuthEndpoint = /\/api\/auth\//.test(url2);
    if ((r.status === 401 || r.status === 403) && !isAuthEndpoint) {
      const orig = r.json.bind(r);
      r.json = async () => {
        try { await orig(); } catch {}
        return null;
      };
      if (r.status === 401) {
        try { window.dispatchEvent(new CustomEvent("karyaos:session-expired")); } catch {}
      }
    }

    return r;
  };
}
