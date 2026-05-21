// src/OfflineBanner.jsx
// Indikator mode offline — muncul pas internet putus / lagi sync antrian.
// Fixed di bawah layar biar gak nabrak PromoBroadcastBanner (atas).

import { useState, useEffect } from "react";
import { isOffline, queueCount, onOfflineChange } from "./offline.js";

export default function OfflineBanner() {
  const [, force] = useState(0);

  useEffect(() => {
    const rerender = () => force(n => n + 1);
    const off = onOfflineChange(rerender);
    window.addEventListener("online", rerender);
    window.addEventListener("offline", rerender);
    return () => {
      off();
      window.removeEventListener("online", rerender);
      window.removeEventListener("offline", rerender);
    };
  }, []);

  const offline = isOffline();
  const q = queueCount();
  if (!offline && q === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 99998,
      background: offline ? "#b91c1c" : "#b45309", color: "#fff",
      padding: "9px 16px", fontSize: 13, fontWeight: 600, textAlign: "center",
      fontFamily: "system-ui,-apple-system,sans-serif",
      boxShadow: "0 -4px 14px rgba(0,0,0,0.4)",
    }}>
      {offline
        ? `⚠ MODE OFFLINE — transaksi tunai tetap jalan, disimpan lokal & auto-sync pas online${q ? ` · ${q} transaksi antri` : ""}`
        : `🔄 Online kembali — sinkronisasi ${q} transaksi ke server…`}
    </div>
  );
}
