// karyaOS — shared API base resolver
// Robust ke salah konfigurasi VITE_API_URL (misal LAN IP yang gak bisa
// di-reach dari browser end user di publik domain).
//
// Logic:
// 1. Kalau VITE_API_URL kosong → same-origin (production via nginx proxy).
// 2. Kalau VITE_API_URL = LAN IP (10.x, 192.168.x, 172.16-31.x, 127.x) AND
//    user di domain berbeda → fallback ke same-origin biar nginx handle.
// 3. Kalau VITE_API_URL valid → pakai itu (dev / cross-origin staging).
//
// Pakai: `import API_HOST from "./apiBase";` lalu `fetch(`${API_HOST}/api/...`)`.

const API_HOST = (() => {
  // BROWSER context: ALWAYS use same-origin in production (HTTPS public).
  // Only fall back to VITE_API_URL kalau di localhost dev (Vite dev server).
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    // Localhost / 127.x dev → respect VITE_API_URL (Vite proxy or LAN backend)
    if (h === "localhost" || h === "127.0.0.1" || h.startsWith("10.") || h.startsWith("192.168.")) {
      return import.meta.env.VITE_API_URL || window.location.origin;
    }
    // Public domain → same-origin (nginx proxy). Ignore VITE_API_URL entirely
    // to avoid Mixed Content kalau env keset ke LAN IP.
    return window.location.origin;
  }
  // Node/SSR fallback
  return import.meta.env.VITE_API_URL || "http://localhost:3011";
})();

export default API_HOST;
