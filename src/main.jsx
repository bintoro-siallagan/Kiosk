import { installOffline } from './offline.js'
installOffline();   // patch fetch buat mode offline — sebelum app render
import { installFetchInterceptor } from './companyAuth.js'
installFetchInterceptor();   // multi-tenant: inject x-company-id / x-super-admin headers

// ── DEVICE OUTLET PROVISION ─────────────────────────────────────────────────
// URL pattern: https://app.karyaos.tech/?pos&outletSetup=CMX-BDG01
// Admin generate URL untuk new outlet install. Kasir buka URL di Chrome new
// install → posOutletDevice auto-set + URL param dibersihkan + locked.
// Skip wizard, langsung ke POS dengan outlet sudah bound.
(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const setupCode = params.get('outletSetup');
    if (setupCode && /^[A-Z]{2,4}-[A-Z0-9]{3,8}$/i.test(setupCode)) {
      // Validate format outlet code (e.g. CMX-BDG01, OTL-001)
      localStorage.setItem('posOutletDevice', setupCode);
      localStorage.setItem('posOutlet', setupCode); // legacy compat
      console.log(`📍 Device bound to outlet: ${setupCode} (via setup URL)`);
      // Strip outletSetup dari URL biar bersih (one-shot consumption)
      params.delete('outletSetup');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
      window.history.replaceState(null, '', newUrl);
    }
  } catch (e) { console.warn('[outletSetup]', e); }
})();

// Auto-reload on stale chunk hash — Vite renames lazy chunks each deploy.
// If user keeps tab open across deploys, old chunks 404 and break navigation.
// Detect "Failed to fetch dynamically imported module" → force reload (once).
(() => {
  let reloading = false;
  const handleChunkErr = (msg) => {
    if (reloading) return;
    if (/Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk \d+ failed/i.test(String(msg || ''))) {
      reloading = true;
      console.warn('[karyaOS] Stale chunk detected → reloading…');
      // Small delay to let other handlers fire
      setTimeout(() => window.location.reload(), 100);
    }
  };
  window.addEventListener('error', e => handleChunkErr(e?.message || e?.error?.message));
  window.addEventListener('unhandledrejection', e => handleChunkErr(e?.reason?.message || e?.reason));
})();
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MenuProvider } from './MenuContext.jsx'
import { PinGateProvider } from './components/ManagerPinGate.jsx'
import { UiKitProvider } from './components/uiKit.jsx'
import { LocaleProvider } from './i18n'

// PWA — register service worker so `beforeinstallprompt` fires.
// Skip on standalone admin/POS/CDS/KDS surfaces (they don't benefit + may run
// inside other shells); enable broadly for customer-facing surfaces.
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  const q = window.location.search;
  const skip = /\b(admin|pos|pos-cinema|cds|kds|signage|command|tools)\b/.test(q);
  if (!skip) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        // If a new SW is waiting, swap it in next visit
        if (reg.waiting) reg.waiting.postMessage('skip-waiting');
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (nw) nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              nw.postMessage('skip-waiting');
            }
          });
        });
      }).catch((e) => console.warn('[karyaOS] SW register failed:', e.message));
    });
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LocaleProvider>
      <MenuProvider>
        <PinGateProvider>
          <UiKitProvider>
            <App />
          </UiKitProvider>
        </PinGateProvider>
      </MenuProvider>
    </LocaleProvider>
  </StrictMode>,
)
