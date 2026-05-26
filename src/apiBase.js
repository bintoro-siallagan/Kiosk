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
  const env = import.meta.env.VITE_API_URL;
  if (!env) return typeof window !== "undefined" ? window.location.origin : "";
  try {
    const u = new URL(env);
    const isLan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(u.hostname);
    if (isLan && typeof window !== "undefined"
        && window.location.hostname !== u.hostname
        && window.location.hostname !== "localhost") {
      // Build embedded a LAN IP but browser is on different host →
      // same-origin fallback (nginx proxy)
      return window.location.origin;
    }
  } catch {}
  return env;
})();

export default API_HOST;
