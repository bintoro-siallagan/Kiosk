// offlineQueue.js — IndexedDB queue untuk operations saat network/printer down.
// Saat online, auto-flush queue ke backend. Saat offline, simpan local + tunjukkan
// banner ke user "X transaksi pending sync".
//
// Usage:
//   import { queueOperation, flushQueue, isOnline, getQueueCount } from "./offlineQueue.js";
//   await queueOperation({ kind: 'ticket', url, body });

const DB_NAME = "karyaOfflineQueue";
const DB_VERSION = 1;
const STORE = "queue";

let _db = null;
let _listeners = new Set();

function _emitChange() {
  for (const cb of _listeners) { try { cb(); } catch {} }
}

export function subscribeQueueChange(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

async function _open() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

export async function queueOperation(op) {
  // op: { kind, url, method, headers, body, label, created_at }
  if (typeof indexedDB === "undefined") return false;
  try {
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.add({
        ...op,
        method: op.method || "POST",
        headers: op.headers || { "Content-Type": "application/json" },
        created_at: Date.now(),
        retry_count: 0,
      });
      req.onsuccess = () => { _emitChange(); resolve(req.result); };
      req.onerror = () => reject(req.error);
    });
  } catch (e) { console.warn("offline queue failed:", e); return false; }
}

export async function getQueueCount() {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const db = await _open();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  } catch { return 0; }
}

export async function getAllQueued() {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await _open();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

async function _removeFromQueue(id) {
  const db = await _open();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { _emitChange(); resolve(true); };
  });
}

async function _incrementRetry(id) {
  const db = await _open();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const item = req.result;
      if (item) {
        item.retry_count = (item.retry_count || 0) + 1;
        item.last_retry_at = Date.now();
        store.put(item);
      }
      resolve();
    };
  });
}

// Flush — kirim semua queue ke backend
let _flushing = false;
export async function flushQueue() {
  if (_flushing) return { ok: 0, fail: 0, skipped: true };
  if (!navigator.onLine) return { ok: 0, fail: 0, offline: true };
  _flushing = true;
  try {
    const items = await getAllQueued();
    let ok = 0, fail = 0;
    for (const item of items) {
      try {
        const r = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: typeof item.body === "string" ? item.body : JSON.stringify(item.body),
        });
        if (r.ok) {
          await _removeFromQueue(item.id);
          ok++;
        } else {
          await _incrementRetry(item.id);
          fail++;
          // Drop kalau retry > 10 (avoid infinite retry)
          if ((item.retry_count || 0) > 10) {
            console.warn("offline queue: dropping item after 10 retries", item);
            await _removeFromQueue(item.id);
          }
        }
      } catch (e) {
        await _incrementRetry(item.id);
        fail++;
      }
    }
    return { ok, fail };
  } finally {
    _flushing = false;
  }
}

export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

// Auto-flush listener — saat browser detect online, otomatis flush
let _autoFlushInstalled = false;
export function installAutoFlush() {
  if (_autoFlushInstalled || typeof window === "undefined") return;
  _autoFlushInstalled = true;

  // Flush saat browser online event
  window.addEventListener("online", () => {
    console.log("🌐 [offline-queue] Online detected — flushing queue");
    setTimeout(() => flushQueue().then(r => {
      if (r.ok > 0) console.log(`✓ [offline-queue] Synced ${r.ok} items`);
    }), 1000);
  });

  // Also try flush on mount (kalau ada queue dari session sebelumnya)
  setTimeout(() => {
    if (isOnline()) {
      getQueueCount().then(n => {
        if (n > 0) {
          console.log(`📤 [offline-queue] ${n} pending items from previous session, flushing…`);
          flushQueue();
        }
      });
    }
  }, 2000);

  // Periodic re-flush tiap 30s (in case fail items)
  setInterval(() => {
    if (isOnline()) getQueueCount().then(n => { if (n > 0) flushQueue(); });
  }, 30000);
}
