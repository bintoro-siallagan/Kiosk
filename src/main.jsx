import { installOffline } from './offline.js'
installOffline();   // patch fetch buat mode offline — sebelum app render
import { installFetchInterceptor } from './companyAuth.js'
installFetchInterceptor();   // multi-tenant: inject x-company-id / x-super-admin headers

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
