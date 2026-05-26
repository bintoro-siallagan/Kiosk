// OfflineBanner — visible indicator saat offline OR ada queued operations.
// Mount di top kiosk/POS/admin layer.

import { useEffect, useState } from "react";
import { isOnline, getQueueCount, subscribeQueueChange, flushQueue } from "../offlineQueue.js";

export default function OfflineBanner() {
  const [online, setOnline] = useState(isOnline());
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const updateQueue = () => getQueueCount().then(setQueueCount);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const unsub = subscribeQueueChange(updateQueue);
    updateQueue();
    const interval = setInterval(updateQueue, 5000); // refresh count tiap 5s
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      unsub();
      clearInterval(interval);
    };
  }, []);

  const showBanner = !online || queueCount > 0;
  if (!showBanner) return null;

  const isOfflineMode = !online;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999,
      background: isOfflineMode ? "linear-gradient(90deg,#dc2626,#ef4444)" : "linear-gradient(90deg,#f59e0b,#fbbf24)",
      color: "#fff", padding: "8px 16px",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
      fontSize: 13, fontFamily: "'Inter',sans-serif", fontWeight: 700,
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      animation: "offlineSlideDown 0.3s ease-out",
    }}>
      <style>{`@keyframes offlineSlideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }`}</style>
      <span style={{ fontSize: 18 }}>{isOfflineMode ? "📡" : "📤"}</span>
      <span>
        {isOfflineMode
          ? `OFFLINE MODE — Tetap bisa transaksi, akan auto-sync saat online`
          : `🔄 ${queueCount} transaksi pending sync ke server`}
      </span>
      {queueCount > 0 && online && (
        <button onClick={async () => {
          setSyncing(true);
          const r = await flushQueue();
          setSyncing(false);
          if (r.ok > 0) alert(`✓ ${r.ok} transaksi tersinkronisasi${r.fail > 0 ? ` · ${r.fail} masih pending` : ""}`);
        }} disabled={syncing}
          style={{
            background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.4)",
            color: "#fff", padding: "4px 12px", borderRadius: 6,
            fontSize: 11, fontWeight: 800, cursor: syncing ? "wait" : "pointer",
            fontFamily: "inherit", letterSpacing: 0.5,
          }}>
          {syncing ? "⏳ SYNC…" : "🔄 SYNC NOW"}
        </button>
      )}
    </div>
  );
}
